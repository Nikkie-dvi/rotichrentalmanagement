import { supabase } from "@/integrations/supabase/client";

/** Save a payment and apply it to the tenant's unpaid bills, oldest first. */
export async function recordTenantPayment(p: {
  tenantId: string; invoiceId?: string | null; amount: number; method: string; reference: string | null; date: string;
}) {
  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, balance_remaining, month_year")
    .eq("tenant_id", p.tenantId)
    .gt("balance_remaining", 0)
    .order("month_year", { ascending: true });
  if (invErr) throw invErr;
  const list = [...(invoices ?? [])];
  if (p.invoiceId) {
    const i = list.findIndex((x) => x.id === p.invoiceId);
    if (i > 0) list.unshift(list.splice(i, 1)[0]!);
  }
  let remaining = p.amount;
  let firstInvoiceId: string | null = p.invoiceId ?? null;
  for (const inv of list) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, Number(inv.balance_remaining));
    const newBalance = Number(inv.balance_remaining) - applied;
    const { error } = await supabase
      .from("invoices")
      .update({ balance_remaining: newBalance, status: newBalance <= 0 ? "paid" : "partial" })
      .eq("id", inv.id);
    if (error) throw error;
    firstInvoiceId ??= inv.id;
    remaining -= applied;
  }
  const { error } = await supabase.from("payments").insert({
    tenant_id: p.tenantId,
    invoice_id: firstInvoiceId,
    amount_paid: p.amount,
    payment_method: p.method,
    reference_no: p.reference,
    payment_date: p.date,
  } as never);
  if (error) throw error;
}
