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

    // Outstanding balance after the payment, so the receipt is useful.
    const { data: invoices } = await context.supabase
      .from("invoices")
      .select("balance_remaining")
      .eq("tenant_id", data.tenantId)
      .gt("balance_remaining", 0);
    const balance = (invoices ?? []).reduce(
      (sum: number, i: any) => sum + (Number(i.balance_remaining) || 0),
      0,
    );

    const first = (((tenant as any).full_name as string) ?? "there").split(" ")[0];
    const refPart = data.reference ? ` Ref ${data.reference}.` : "";
    const message =
      `Hi ${first}, we have received your payment of ${money(data.amount)} on ${data.paymentDate}` +
      `${data.method ? ` via ${data.method}` : ""}.${refPart} ` +
      (balance > 0 ? `Outstanding balance: ${money(balance)}.` : `Your account is fully settled. Thank you!`);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Flat 1.2 KES per SMS from the landlord's wallet.
    const { data: walletBalance, error: chargeErr } = await supabaseAdmin.rpc("sms_charge" as never, {
      _owner: (tenant as any).owner_id,
      _count: 1,
      _reason: "receipt",
      _note: `Receipt ${money(data.amount)}`,
    } as never);
    if (chargeErr || walletBalance === null) {
      throw new Error("Not enough SMS credit. Request a recharge to send receipts.");
    }

    const { sendSms } = await import("@/lib/sms.server");
    const res = await sendSms(phone, message);

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
    const { data: walletBalance, error: chargeErr } = await supabaseAdmin.rpc("sms_charge" as never, {
      _owner: (invoice as any).owner_id,
      _count: 1,
      _reason: "late_fee_notice",
      _note: `Late fee notice ${(invoice as any).month_year}`,
    } as never);
    if (chargeErr || walletBalance === null) {
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
