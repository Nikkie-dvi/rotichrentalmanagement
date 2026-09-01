// Bulk tenant documents by property / unit: receipts, invoices and account
// statements, texted out in one go and charged to the landlord's SMS wallet.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const money = (n: number) => `KES ${Math.round(n).toLocaleString("en-US")}`;

export type BulkDocKind = "receipt" | "invoice" | "statement";

export const sendBulkTenantDocsSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    kind: BulkDocKind;
    month?: string;
    propertyId?: string | null;
    unitIds?: string[];
    tenantIds?: string[];
  }) => {
    const kind = (data?.kind ?? "invoice") as BulkDocKind;
    if (!["receipt", "invoice", "statement"].includes(kind)) throw new Error("Pick what to send");
    const month = (data?.month ?? "").trim() || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Pick a valid month");
    return {
      kind,
      month,
      propertyId: (data?.propertyId ?? "") || null,
      unitIds: Array.isArray(data?.unitIds) ? data.unitIds.filter(Boolean) : [],
      tenantIds: Array.isArray(data?.tenantIds) ? data.tenantIds.filter(Boolean) : [],
    };
  })
  .handler(async ({ data, context }) => {
    // RLS scopes every read to tenants the caller may see (owner or manager).
    let unitIds = data.unitIds;
    if (data.propertyId) {
      const { data: units } = await context.supabase
        .from("units")
        .select("id")
        .eq("property_id", data.propertyId);
      const inProperty = ((units ?? []) as any[]).map((u) => u.id as string);
      unitIds = unitIds.length ? unitIds.filter((id) => inProperty.includes(id)) : inProperty;
    }

    let q = context.supabase
      .from("tenants")
      .select("id, owner_id, full_name, phone_number, unit_id")
      .eq("active", true);
    if (data.tenantIds.length) q = q.in("id", data.tenantIds);
    else if (unitIds.length) q = q.in("unit_id", unitIds);
    else if (data.propertyId) return { ok: true, sent: 0, failed: 0, skipped: 0, recipients: 0 };

    const { data: tenants, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (tenants ?? []) as any[];
    if (rows.length === 0) return { ok: true, sent: 0, failed: 0, skipped: 0, recipients: 0 };

    const tenantIds = rows.map((t) => t.id);
    const { data: invoices } = await context.supabase
      .from("invoices")
      .select("id, tenant_id, month_year, kind, due_date, total_due, balance_remaining, late_penalty_amount, penalty_waived")
      .in("tenant_id", tenantIds);
    const allInvoices = (invoices ?? []) as any[];

    const { data: payments } = await context.supabase
      .from("payments")
      .select("tenant_id, amount_paid, payment_date, payment_method, reference_no")
      .in("tenant_id", tenantIds)
      .order("payment_date", { ascending: false });
    const allPayments = (payments ?? []) as any[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { invoiceBreakdown } = await import("@/lib/invoice-breakdown.server");
    const { sendSms } = await import("@/lib/sms.server");

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const logs: any[] = [];

    for (const tenant of rows) {
      const phone = tenant.phone_number as string | null;
      if (!phone) {
        skipped++;
        continue;
      }
      const first = ((tenant.full_name as string) ?? "there").split(" ")[0];
      const mine = allInvoices.filter((i) => i.tenant_id === tenant.id);
      const balance = mine.reduce((s, i) => s + (Number(i.balance_remaining) || 0), 0);
      // Rent and services are separate invoices, so a month can have both.
      const monthInvoices = mine.filter((i) => i.month_year === data.month);

      let message = "";
      let subject = "";
      let invoiceId: string | null = null;

      if (data.kind === "invoice") {
        if (monthInvoices.length === 0) {
          skipped++;
          continue;
        }
        invoiceId = monthInvoices[0].id;
        subject = "Invoice";
        const lines: string[] = [];
        for (const inv of monthInvoices) {
          const label = inv.kind === "service" ? "Services" : "Rent";
          const bd = await invoiceBreakdown(context.supabase, inv.id);
          lines.push(
            `${label}: ${bd?.text ? `${bd.text}; ` : ""}total ${money(Number(inv.total_due) || 0)}, balance ${money(Number(inv.balance_remaining) || 0)}`,
          );
        }
        const withDue = monthInvoices.find((i) => i.due_date);
        const duePart = withDue?.due_date ? ` Due ${withDue.due_date}.` : "";
        message = `Hi ${first}, your ${data.month} invoice(s): ` + lines.join(". ") + `.${duePart}`;

      } else if (data.kind === "receipt") {
        const last = allPayments.find((p) => p.tenant_id === tenant.id);
        if (!last) {
          skipped++;
          continue;
        }
        subject = "Payment receipt";
        const ref = last.reference_no ? ` Ref ${last.reference_no}.` : "";
        message =
          `Hi ${first}, we have received your payment of ${money(Number(last.amount_paid) || 0)} on ${last.payment_date}` +
          `${last.payment_method ? ` via ${last.payment_method}` : ""}.${ref} ` +
          (balance > 0 ? `Outstanding balance: ${money(balance)}.` : "Your account is fully settled. Thank you!");
      } else {
        subject = "Account statement";
        const paidThisMonth = allPayments
          .filter((p) => p.tenant_id === tenant.id && String(p.payment_date ?? "").startsWith(data.month))
          .reduce((s, p) => s + (Number(p.amount_paid) || 0), 0);
        const billed = mine
          .filter((i) => i.month_year === data.month)
          .reduce((s, i) => s + (Number(i.total_due) || 0), 0);
        const penalties = mine
          .filter((i) => !i.penalty_waived)
          .reduce((s, i) => s + (Number(i.late_penalty_amount) || 0), 0);
        message =
          `Hi ${first}, your ${data.month} statement: billed ${money(billed)}, paid ${money(paidThisMonth)}` +
          (penalties > 0 ? `, late fees ${money(penalties)}` : "") +
          `. ${balance > 0 ? `Outstanding balance ${money(balance)}.` : "No balance outstanding. Thank you!"}`;
      }

      const { data: walletBalance, error: chargeErr } = await supabaseAdmin.rpc("sms_charge" as never, {
        _owner: tenant.owner_id,
        _count: 1,
        _reason: `bulk_${data.kind}`,
        _note: `Bulk ${data.kind} ${data.month}`,
      } as never);
      if (chargeErr || walletBalance === null) {
        if (logs.length) await supabaseAdmin.from("notification_logs").insert(logs as never);
        throw new Error(
          sent > 0
            ? `SMS credit ran out after ${sent} message(s). Request a recharge to finish.`
            : "Not enough SMS credit. Request a recharge to send these messages.",
        );
      }

      const res = await sendSms(phone, message);
      res.ok ? sent++ : failed++;
      logs.push({
        owner_id: tenant.owner_id,
        tenant_id: tenant.id,
        invoice_id: invoiceId,
        channel: "sms",
        recipient: phone,
        subject,
        message,
        status: res.ok ? "delivered" : "failed",
        error: res.error ?? null,
      });
    }

    if (logs.length) await supabaseAdmin.from("notification_logs").insert(logs as never);
    return { ok: true, sent, failed, skipped, recipients: rows.length };
  });
