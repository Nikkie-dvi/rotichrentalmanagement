import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "record_payment",
  title: "Record a rent payment",
  description:
    "Record a payment received from one of the signed-in landlord's tenants and apply it to their oldest outstanding invoices.",
  inputSchema: {
    tenant_id: z.string().uuid().describe("Tenant the payment came from."),
    amount: z.number().positive().describe("Amount received, in KES."),
    payment_method: z.enum(["mpesa", "bank", "cash"]).default("mpesa").describe("How the payment was made."),
    reference_no: z.string().optional().describe("Optional M-Pesa or bank reference number."),
    payment_date: z.string().optional().describe("Payment date as YYYY-MM-DD. Defaults to today."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ tenant_id, amount, payment_method, reference_no, payment_date }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, full_name")
      .eq("id", tenant_id)
      .maybeSingle();
    if (tenantError) return { content: [{ type: "text", text: tenantError.message }], isError: true };
    if (!tenant) return { content: [{ type: "text", text: "Tenant not found" }], isError: true };

    const { data: invoices, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, balance_remaining")
      .eq("tenant_id", tenant_id)
      .gt("balance_remaining", 0)
      .order("month_year", { ascending: true });
    if (invoiceError) return { content: [{ type: "text", text: invoiceError.message }], isError: true };

    let remaining = amount;
    let firstInvoiceId: string | null = null;
    for (const invoice of invoices ?? []) {
      if (remaining <= 0) break;
      const applied = Math.min(remaining, Number(invoice.balance_remaining));
      const newBalance = Number(invoice.balance_remaining) - applied;
      const { error: updateError } = await supabase
        .from("invoices")
        .update({ balance_remaining: newBalance, status: newBalance <= 0 ? "paid" : "partial" })
        .eq("id", invoice.id);
      if (updateError) return { content: [{ type: "text", text: updateError.message }], isError: true };
      firstInvoiceId ??= invoice.id;
      remaining -= applied;
    }

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        tenant_id,
        invoice_id: firstInvoiceId,
        amount_paid: amount,
        payment_method: payment_method ?? "mpesa",
        reference_no: reference_no ?? null,
        payment_date: payment_date ?? new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();
    if (paymentError) return { content: [{ type: "text", text: paymentError.message }], isError: true };

    const summary = `Recorded KES ${amount} for ${tenant.full_name}. Unapplied credit: KES ${Math.max(remaining, 0)}.`;
    return {
      content: [{ type: "text", text: summary }],
      structuredContent: { payment, credit_remaining: Math.max(remaining, 0) },
    };
  },
});
