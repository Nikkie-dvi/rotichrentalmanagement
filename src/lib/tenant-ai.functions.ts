// AI account assistant: summarizes a tenant's invoices/payments and suggests one next step.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const askTenantAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenantId: z.string().uuid(), question: z.string().trim().max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: tenant }, { data: invoices }, { data: payments }, { data: credits }] = await Promise.all([
      sb.from("tenants").select("full_name, move_in_date, rent_due_day, deposit_paid, active, units(unit_number, rent_amount, properties(name))").eq("id", data.tenantId).maybeSingle(),
      sb.from("invoices").select("month_year, kind, total_due, balance_remaining, status, due_date, late_penalty_amount").eq("tenant_id", data.tenantId).order("month_year", { ascending: false }).limit(24),
      sb.from("payments").select("amount_paid, payment_date, payment_method").eq("tenant_id", data.tenantId).order("payment_date", { ascending: false }).limit(36),
      sb.from("tenant_credit_events").select("kind, delta, created_at, note").eq("tenant_id", data.tenantId).limit(20),
    ]);
    if (!tenant) throw new Error("Tenant not found");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("The AI assistant isn't set up yet.");
    const { createResponsesCall } = await import("./ai/responses.server");
    const today = new Date().toISOString().slice(0, 10);
    const account = JSON.stringify({ today, currency: "KES", tenant, invoices, payments, credit_adjustments: credits });
    const question = data.question || "Summarize this account and tell me what to do next.";
    const instructions =
      "You help a Kenyan landlord understand one tenant's rent account. Use ONLY the data given; never invent payments. " +
      "Reply in plain, short English with exactly these sections:\n**Summary** (2-4 sentences: balance owed or credit, how they usually pay - early/on time/late, any patterns)\n" +
      "**Answer** (only if the landlord asked a specific question)\n**Next step** (one concrete action, e.g. send a polite reminder, record a missing payment, waive or add a late fee, call the tenant). " +
      "Amounts as 'KES 12,000'. Keep under 150 words.\n" +
      "If the landlord pasted a payment confirmation (e.g. an M-Pesa SMS) or says the tenant paid an amount, ALSO end with one final line exactly: " +
      'PAYMENT_JSON: {"amount": <number>, "date": "YYYY-MM-DD", "reference": "<code or empty>", "method": "mpesa"|"bank"|"cash"} ' +
      "using the date in the message (or today). In that case the Next step is to confirm recording it. Never output PAYMENT_JSON otherwise.";
    try {
      const { result } = createResponsesCall(
        getRequest(),
        { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" },
        [{ role: "user", content: `Account data:\n${account}\n\nLandlord's question: ${question}` }],
        instructions,
      );
      let text = (await result.text).trim();
      if (!text) return { ok: false as const, error: "The assistant couldn't answer that. Try again later." };
      let payment: { amount: number; date: string; reference: string | null; method: string; duplicate: boolean } | null = null;
      const m = text.match(/PAYMENT_JSON:\s*(\{[^\n]*\})/);
      if (m) {
        text = text.replace(m[0], "").trim();
        try {
          const p = JSON.parse(m[1]!);
          const amount = Math.round(Number(p.amount));
          const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.date <= today ? p.date : today;
          const reference = String(p.reference ?? "").trim().slice(0, 40) || null;
          const method = ["mpesa", "bank", "cash"].includes(p.method) ? p.method : "mpesa";
          if (amount > 0) {
            let duplicate = false;
            if (reference) {
              const { data: dup } = await sb.from("payments").select("id").or(`reference_no.eq.${reference},mpesa_receipt_no.eq.${reference}`).limit(1);
              duplicate = !!dup?.length;
            }
            payment = { amount, date, reference, method, duplicate };
          }
        } catch { /* ignore malformed */ }
      }
      return { ok: true as const, text, payment };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status ?? e?.lastError?.statusCode;
      console.error("tenant assistant failed", status, e?.message);
      if (status === 402) return { ok: false as const, error: "AI credits have run out. Add credits in Settings → Plans & credits." };
      if (status === 429) return { ok: false as const, error: "The assistant is busy. Please try again in a minute." };
      if (status === 403) return { ok: false as const, error: "The AI assistant isn't available for this workspace right now." };
      return { ok: false as const, error: "The assistant couldn't answer right now. Please try again." };
    }
  });
