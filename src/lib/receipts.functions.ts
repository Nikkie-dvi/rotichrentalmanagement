// Payment receipts: lets a landlord (or their manager) text a tenant an SMS
// confirmation that a payment was received. Charged to the landlord's SMS wallet.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const money = (n: number) => `KES ${Math.round(n).toLocaleString("en-US")}`;

export const sendPaymentReceiptSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    tenantId: string;
    amount: number;
    paymentDate: string;
    method?: string;
    reference?: string | null;
  }) => {
    const tenantId = (data?.tenantId ?? "").trim();
    const amount = Number(data?.amount);
    if (!tenantId) throw new Error("Tenant is required");
    if (!(amount > 0)) throw new Error("Amount must be greater than 0");
    return {
      tenantId,
      amount,
      paymentDate: (data?.paymentDate ?? "").trim() || new Date().toISOString().slice(0, 10),
      method: (data?.method ?? "").trim(),
      reference: (data?.reference ?? "")?.toString().trim() || null,
    };
  })
  .handler(async ({ data, context }) => {
    // RLS keeps this to tenants the caller may see (owner or active manager).
    const { data: tenant, error } = await context.supabase
      .from("tenants")
      .select("id, owner_id, full_name, phone_number")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error || !tenant) throw new Error(error?.message ?? "Tenant not found");

    const phone = (tenant as any).phone_number as string | null;
    if (!phone) throw new Error("This tenant has no phone number saved");

    // Include accrued rent and prepaid credit, as both portals do.
    const { tenantBalancePosition, balancePositionText } = await import("@/lib/tenant-balance.server");
    const { rent, ledger } = await tenantBalancePosition(data.tenantId);
    const { data: invoices } = await context.supabase
      .from("invoices")
      .select("month_year, balance_remaining, late_penalty_amount, penalty_waived")
      .eq("tenant_id", data.tenantId)
      .gt("balance_remaining", 0);
    // Spell out any late fees still sitting on the tenant's unpaid invoices.
    const penaltyRows = (invoices ?? []).filter(
      (i: any) => !i.penalty_waived && (Number(i.late_penalty_amount) || 0) > 0,
    );
    const penaltyTotal = penaltyRows.reduce((s: number, i: any) => s + (Number(i.late_penalty_amount) || 0), 0);
    const penaltyPart =
      penaltyTotal > 0
        ? ` This includes late fees of ${money(penaltyTotal)} (${penaltyRows
            .map((i: any) => `${i.month_year} ${money(Number(i.late_penalty_amount) || 0)}`)
            .join(", ")}).`
        : "";

    const first = (((tenant as any).full_name as string) ?? "Tenant").trim().split(/\s+/)[0];
    const refPart = data.reference ? ` Ref ${data.reference}.` : "";
    const message =
      `Dear ${first}, we have received your payment of ${money(data.amount)} on ${data.paymentDate}` +
      `${data.method ? ` via ${data.method}` : ""}.${refPart} ` +
      `${balancePositionText(ledger.credit, ledger.arrears, rent)}${ledger.arrears > 0 ? penaltyPart : ""} ` +
      `Thank you. View your account at homebasemanager.app/tenant/login using your phone number.`;


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { chargeSmsWallet } = await import("@/lib/sms-wallet.server");

    // Flat 1.2 KES per SMS from the landlord's wallet.
    const walletBalance = await chargeSmsWallet(supabaseAdmin, {
      ownerId: (tenant as any).owner_id,
      count: 1,
      reason: "receipt",
      note: `Receipt ${money(data.amount)}`,
    });
    if (walletBalance === null) {
      throw new Error("Not enough SMS credit. Request a recharge to send receipts.");
    }

    const { sendSms } = await import("@/lib/sms.server");
    const res = await sendSms(phone, message, { portalLink: false });

    await supabaseAdmin.from("notification_logs").insert({
      owner_id: (tenant as any).owner_id,
      tenant_id: tenant.id,
      channel: "sms",
      recipient: phone,
      subject: "Payment receipt",
      message,
      status: res.ok ? "delivered" : "failed",
      error: res.error ?? null,
    } as never);

    if (!res.ok) throw new Error(res.error ?? "Receipt SMS could not be sent");
    return { ok: true, message };
  });

/** Shortcut: texts a tenant about a late fee / overdue balance on one invoice. */
export const sendLateFeeNoticeSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invoiceId: string }) => {
    const invoiceId = (data?.invoiceId ?? "").trim();
    if (!invoiceId) throw new Error("Invoice is required");
    return { invoiceId };
  })
  .handler(async ({ data, context }) => {
    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .select("id, owner_id, tenant_id, month_year, due_date, total_due, balance_remaining, late_penalty_amount")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error || !invoice) throw new Error(error?.message ?? "Invoice not found");

    const { data: tenant } = await context.supabase
      .from("tenants")
      .select("id, full_name, phone_number")
      .eq("id", (invoice as any).tenant_id)
      .maybeSingle();
    const phone = (tenant as any)?.phone_number as string | null;
    if (!phone) throw new Error("This tenant has no phone number saved");

    const penalty = Number((invoice as any).late_penalty_amount ?? 0) || 0;
    const balance = Number((invoice as any).balance_remaining ?? 0) || 0;
    const first = (((tenant as any)?.full_name as string) ?? "there").split(" ")[0];
    const duePart = (invoice as any).due_date ? ` It was due on ${(invoice as any).due_date}.` : "";
    const { invoiceBreakdown } = await import("@/lib/invoice-breakdown.server");
    const bd = await invoiceBreakdown(context.supabase, (invoice as any).id);
    const detail = bd?.text ? ` Breakdown: ${bd.text}.` : "";
    const message =
      penalty > 0
        ? `Hi ${first}, a late payment fee of ${money(penalty)} has been added to your ${(invoice as any).month_year} rent.${duePart}${detail} Your outstanding balance is now ${money(balance)}. Kindly clear it as soon as possible.`
        : `Hi ${first}, your ${(invoice as any).month_year} rent of ${money(balance)} is still outstanding.${duePart}${detail} Kindly clear it to avoid a late payment fee.`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { chargeSmsWallet } = await import("@/lib/sms-wallet.server");
    const walletBalance = await chargeSmsWallet(supabaseAdmin, {
      ownerId: (invoice as any).owner_id,
      count: 1,
      reason: "late_fee_notice",
      note: `Late fee notice ${(invoice as any).month_year}`,
    });
    if (walletBalance === null) {
      throw new Error("Not enough SMS credit. Request a recharge to send notices.");
    }

    const { sendSms } = await import("@/lib/sms.server");
    const res = await sendSms(phone, message);

    await supabaseAdmin.from("notification_logs").insert({
      owner_id: (invoice as any).owner_id,
      tenant_id: (invoice as any).tenant_id,
      invoice_id: (invoice as any).id,
      channel: "sms",
      recipient: phone,
      subject: penalty > 0 ? "Late fee notice" : "Overdue rent notice",
      message,
      status: res.ok ? "delivered" : "failed",
      error: res.error ?? null,
    } as never);

    if (!res.ok) throw new Error(res.error ?? "Notice SMS could not be sent");
    return { ok: true, message };
  });

/** Texts a tenant the full itemised breakdown of one invoice (rent, water, power, garbage, extras, late fees). */
export const sendInvoiceSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invoiceId: string }) => {
    const invoiceId = (data?.invoiceId ?? "").trim();
    if (!invoiceId) throw new Error("Invoice is required");
    return { invoiceId };
  })
  .handler(async ({ data, context }) => {
    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .select("id, owner_id, tenant_id, month_year, due_date, total_due, balance_remaining")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error || !invoice) throw new Error(error?.message ?? "Invoice not found");

    const { data: tenant } = await context.supabase
      .from("tenants")
      .select("id, full_name, phone_number")
      .eq("id", (invoice as any).tenant_id)
      .maybeSingle();
    const phone = (tenant as any)?.phone_number as string | null;
    if (!phone) throw new Error("This tenant has no phone number saved");

    const { invoiceBreakdown } = await import("@/lib/invoice-breakdown.server");
    const bd = await invoiceBreakdown(context.supabase, (invoice as any).id);
    const first = (((tenant as any)?.full_name as string) ?? "there").split(" ")[0];
    const duePart = (invoice as any).due_date ? ` Due ${(invoice as any).due_date}.` : "";
    const message =
      `Hi ${first}, your ${(invoice as any).month_year} invoice is ready. ` +
      (bd?.text ? `${bd.text}. ` : "") +
      `Total ${money(Number((invoice as any).total_due) || 0)}, balance ${money(Number((invoice as any).balance_remaining) || 0)}.${duePart}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { chargeSmsWallet } = await import("@/lib/sms-wallet.server");
    const walletBalance = await chargeSmsWallet(supabaseAdmin, {
      ownerId: (invoice as any).owner_id,
      count: 1,
      reason: "invoice",
      note: `Invoice ${(invoice as any).month_year}`,
    });
    if (walletBalance === null) {
      throw new Error("Not enough SMS credit. Request a recharge to text invoices.");
    }

    const { sendSms } = await import("@/lib/sms.server");
    const res = await sendSms(phone, message);

    await supabaseAdmin.from("notification_logs").insert({
      owner_id: (invoice as any).owner_id,
      tenant_id: (invoice as any).tenant_id,
      invoice_id: (invoice as any).id,
      channel: "sms",
      recipient: phone,
      subject: "Invoice",
      message,
      status: res.ok ? "delivered" : "failed",
      error: res.error ?? null,
    } as never);

    if (!res.ok) throw new Error(res.error ?? "Invoice SMS could not be sent");
    return { ok: true, message };
  });

/** Bulk: texts every tenant with an unpaid balance for the given month a late-fee / overdue notice. */
export const sendBulkOverdueNoticesSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { month: string }) => {
    const month = (data?.month ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Pick a valid month");
    return { month };
  })
  .handler(async ({ data, context }) => {
    const { data: invoices, error } = await context.supabase
      .from("invoices")
      .select("id, owner_id, tenant_id, month_year, due_date, balance_remaining, late_penalty_amount, penalty_waived")
      .eq("month_year", data.month)
      .gt("balance_remaining", 0);
    if (error) throw new Error(error.message);

    const rows = (invoices ?? []) as any[];
    if (rows.length === 0) return { ok: true, sent: 0, failed: 0, skipped: 0 };

    const { data: tenants } = await context.supabase
      .from("tenants")
      .select("id, full_name, phone_number")
      .in("id", rows.map((i) => i.tenant_id));
    const byTenant = new Map<string, any>(((tenants ?? []) as any[]).map((t) => [t.id, t]));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { chargeSmsWallet } = await import("@/lib/sms-wallet.server");
    const { invoiceBreakdown } = await import("@/lib/invoice-breakdown.server");
    const { sendSms } = await import("@/lib/sms.server");

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const logs: any[] = [];

    for (const inv of rows) {
      const tenant = byTenant.get(inv.tenant_id);
      const phone = tenant?.phone_number as string | null;
      if (!phone) {
        skipped++;
        continue;
      }
      const penalty = !inv.penalty_waived ? Number(inv.late_penalty_amount ?? 0) || 0 : 0;
      const balance = Number(inv.balance_remaining ?? 0) || 0;
      const first = ((tenant?.full_name as string) ?? "there").split(" ")[0];
      const duePart = inv.due_date ? ` It was due on ${inv.due_date}.` : "";
      const bd = await invoiceBreakdown(context.supabase, inv.id);
      const detail = bd?.text ? ` Breakdown: ${bd.text}.` : "";
      const message =
        penalty > 0
          ? `Hi ${first}, a late payment fee of ${money(penalty)} has been added to your ${inv.month_year} rent.${duePart}${detail} Your outstanding balance is now ${money(balance)}. Kindly clear it as soon as possible.`
          : `Hi ${first}, your ${inv.month_year} rent of ${money(balance)} is still outstanding.${duePart}${detail} Kindly clear it to avoid a late payment fee.`;

      const walletBalance = await chargeSmsWallet(supabaseAdmin, {
        ownerId: inv.owner_id,
        count: 1,
        reason: "late_fee_notice",
        note: `Bulk overdue notice ${inv.month_year}`,
      });
      if (walletBalance === null) {
        throw new Error(
          sent > 0
            ? `SMS credit ran out after ${sent} message(s). Request a recharge to finish.`
            : "Not enough SMS credit. Request a recharge to send notices.",
        );
      }

      const res = await sendSms(phone, message);
      res.ok ? sent++ : failed++;
      logs.push({
        owner_id: inv.owner_id,
        tenant_id: inv.tenant_id,
        invoice_id: inv.id,
        channel: "sms",
        recipient: phone,
        subject: penalty > 0 ? "Late fee notice" : "Overdue rent notice",
        message,
        status: res.ok ? "delivered" : "failed",
        error: res.error ?? null,
      });
    }

    if (logs.length) await supabaseAdmin.from("notification_logs").insert(logs as never);
    return { ok: true, sent, failed, skipped };
  });
