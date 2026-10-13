// AI account assistant: summarizes a tenant's invoices/payments and suggests one next step.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { compareCollections } from "@/lib/collection-comparison";
import { accruedRent, buildLedger, businessTodayIso } from "@/lib/ledger";

export const askTenantAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenantId: z.string().uuid().optional().nullable(), question: z.string().trim().max(2000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    let tenantId = data.tenantId ?? null;
    // Name of the payer in a pasted M-Pesa message, e.g. "received from JOHN DOE 0712…".
    const payerName = (data.question.match(/\bfrom\s+([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){0,3})/i)?.[1] ?? "")
      .replace(/\s+(on|at|ksh|kes|account|acc)\b.*$/i, "").trim().slice(0, 80) || null;
    if (!tenantId) {
      // Work out who the message is about: phone number first, then name.
      const { data: all } = await sb.from("tenants").select("id, full_name, phone_number, units(unit_number)").eq("active", true).limit(1000);
      const text = data.question.toLowerCase();
      const digits = data.question.replace(/\D/g, " ");
      const local = (p: string | null) => (p ?? "").replace(/\D/g, "").replace(/^254/, "0").slice(-9);
      const words = (s: string) => String(s ?? "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter((w) => w.length > 2);
      let hits = ((all ?? []) as any[]).filter((t) => { const l = local(t.phone_number); return l.length === 9 && digits.replace(/\s/g, "").includes(l); });
      if (!hits.length) {
        hits = ((all ?? []) as any[]).filter((t) => {
          const parts = words(t.full_name);
          return parts.length > 0 && parts.filter((w) => new RegExp(`\\b${w}\\b`).test(text)).length >= Math.min(2, parts.length);
        });
      }
      if (hits.length !== 1) {
        // Rank tenants by how many name words overlap with the payer name.
        const payerWords = words(payerName ?? data.question);
        const pool = hits.length ? hits : ((all ?? []) as any[]);
        const candidates = pool
          .map((t) => ({ id: t.id as string, name: t.full_name as string, unit: t.units?.unit_number ?? null, score: words(t.full_name).filter((w) => payerWords.some((p) => p.startsWith(w.slice(0, 4)) || w.startsWith(p.slice(0, 4)))).length }))
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
          .slice(0, 8);
        return { ok: false as const, needTenant: true, payerName, candidates, error: hits.length ? "That matches more than one tenant — who paid?" : `I couldn't match ${payerName ? `"${payerName}"` : "this payment"} to a tenant — who paid?` };
      }
      tenantId = hits[0].id as string;
    }
    const tid: string = tenantId;
    const [tenantResult, invoiceResult, paymentResult, creditResult] = await Promise.all([
      sb.from("tenants").select("full_name, move_in_date, rent_due_day, deposit_paid, active, units(unit_number, rent_amount, properties(name))").eq("id", tid).maybeSingle(),
      sb.from("invoices").select("month_year, kind, total_due, balance_remaining, status, due_date, late_penalty_amount").eq("tenant_id", tid).order("month_year", { ascending: false }),
      sb.from("payments").select("id, amount_paid, payment_date, payment_method, reference_no, mpesa_receipt_no").eq("tenant_id", tid).order("payment_date", { ascending: false }),
      sb.from("tenant_credit_events").select("kind, delta, created_at, note").eq("tenant_id", tid),
    ]);
    for (const r of [tenantResult, invoiceResult, paymentResult, creditResult]) if (r.error) throw new Error("Could not read the full tenant account. Please try again.");
    const tenant = tenantResult.data, invoices = invoiceResult.data ?? [], payments = paymentResult.data ?? [], credits = creditResult.data ?? [];
    if (!tenant) throw new Error("Tenant not found");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("The AI assistant isn't set up yet.");
    const { createResponsesCall } = await import("./ai/responses.server");
    const today = businessTodayIso();
    const sum = (rows: any[], field: string) => rows.reduce((s, r) => s + Number(r[field] || 0), 0);
    const ledger = buildLedger({ invoiced: sum(invoices, "total_due"), paid: sum(payments, "amount_paid"), adjustments: sum(credits, "delta"), accrued: tenant.active ? accruedRent({ rentAmount: tenant.units?.rent_amount, moveInDate: tenant.move_in_date, rentDueDay: tenant.rent_due_day }) : 0 });
    const comparison = compareCollections(payments, today.slice(0, 7), today);
    const account = JSON.stringify({ today, currency: "KES", tenant, ledger, collection_comparison: comparison, invoices: invoices.slice(0, 36), payments: payments.slice(0, 100), credit_adjustments: credits.slice(0, 30) });
    const question = data.question || "Summarize this account and tell me what to do next.";
    const instructions =
      "You help a Kenyan landlord understand one tenant's rent account. Use ONLY the data given; never invent payments. " +
      "Reply in plain, short English with exactly these sections:\n**Summary** (2-4 sentences: balance owed or credit, how they usually pay - early/on time/late, any patterns)\n" +
      "**Answer** (only if the landlord asked a specific question)\n**Next step** (one concrete action, e.g. send a polite reminder, record a missing payment, waive or add a late fee, call the tenant). " +
      "Amounts as 'KES 12,000'. Keep under 200 words. Use the supplied ledger for balances, never sum invoice balances as the account balance. Compare this month's collections with the SAME DATE last month using collection_comparison, give both amounts and difference. Today is still in progress. Never claim what next month will collect; forecasts must be labeled estimates. When a payment is mentioned, say how many months of rent it covers at the unit's rent (and any balance left or extra credit).\n" +
      "If the landlord pasted a payment confirmation (e.g. an M-Pesa SMS) or says the tenant paid an amount, ALSO end with one final line exactly: " +
      'PAYMENT_JSON: {"amount": <number>, "date": "YYYY-MM-DD", "reference": "<code or empty>", "method": "mpesa"|"bank"|"cash"} ' +
      "using the date in the message (or today). In that case the Next step is to confirm recording it. Never output PAYMENT_JSON otherwise.\n" +
      'For an explicit correction of an EXISTING recorded payment, NEVER output PAYMENT_JSON. Only if exactly one payment in the account matches the date, reference or recorded amount, end with CORRECTION_JSON: {"paymentId":"existing UUID", "amount":2500, "reason":"short reason"}. Amount is the corrected total, not a difference. If ambiguous ask which date/reference; do not guess. No mutation has happened; the landlord must confirm. For refunds explain that actual transfers are unavailable until an M-Pesa B2C/Reversal provider is connected. Never propose a payment/correction to imitate a refund or claim money was transferred.\n' +
      "PROBLEM SOLVING: the landlord may describe a recording mistake (e.g. 'tenant joined in January and paid 6 months upfront but I recorded it wrong'). Act like a careful bookkeeper: compare what SHOULD be on the account (move-in date, rent x months, what the tenant says they paid) with the recorded invoices, payments and ledger; explain in plain words what is wrong and the exact fix. " +
      "When information is missing, ask ONE short step-by-step question at a time (e.g. 'When did the tenant move in?', 'How many months ahead did they pay, and how much in total?') instead of guessing; you may skip the Summary section while asking. Once you know, compare against the records: tell the landlord clearly if a payment looks recorded TWICE (same amount and date/reference), or recorded SHORT (e.g. 'recorded short by 2 months = KES 20,000'), then offer the fix as a question, e.g. 'Should I record the missing 2 months (KES 20,000) so the account is correct?' with the matching PAYMENT_JSON. For a duplicate, explain it and offer a CORRECTION_JSON only if a single payment covers it; otherwise say which entry to remove. " +
      "Propose only ONE fix per reply: either a CORRECTION_JSON for a wrong recorded amount, or a PAYMENT_JSON for a missing payment (use the actual date it was paid). If several steps are needed, propose the first and say what comes next after confirming. Never claim anything was changed — every fix waits for the landlord's confirmation.";
    try {
      const { result } = createResponsesCall(
        getRequest(),
        { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" },
        [
          { role: "user", content: `Account data:\n${account}` },
          ...(data.history ?? []).map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: `Landlord: ${question}` },
        ],
        instructions,
      );
      let text = (await result.text).trim();
      if (!text) return { ok: false as const, error: "The assistant couldn't answer that. Try again later." };
      let payment: { amount: number; date: string; reference: string | null; method: string; duplicate: boolean } | null = null;
      let correction: { paymentId: string; oldAmount: number; amount: number; date: string; reason: string } | null = null;
      const correctionMatch = text.match(/CORRECTION_JSON:\s*(\{[^\n]*\})/);
      if (correctionMatch) {
        text = text.replace(correctionMatch[0], "").trim();
        try {
          const c = z.object({ paymentId: z.string().uuid(), amount: z.number().positive().max(10000000), reason: z.string().trim().min(3).max(500) }).parse(JSON.parse(correctionMatch[1] ?? ""));
          const existing = payments.find(p => p.id === c.paymentId);
          if (existing && Number(existing.amount_paid) !== c.amount) correction = { ...c, oldAmount: Number(existing.amount_paid), date: existing.payment_date };
        } catch { /* a malformed proposal never authorizes a change */ }
      }
      const m = text.match(/PAYMENT_JSON:\s*(\{[^\n]*\})/);
      if (m) {
        text = text.replace(m[0], "").trim();
        try {
           const p = JSON.parse(m[1] ?? "");
          const amount = Math.round(Number(p.amount));
          const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.date <= today ? p.date : today;
          const pasted = question.match(/\b([A-Z0-9]{10})\b\s+(?:confirmed|imethibitishwa)/i)?.[1];
          const reference = (String(p.reference ?? "") || pasted || "").replace(/[^A-Za-z0-9-]/g, "").toUpperCase().slice(0, 40) || null;
          const method = ["mpesa", "bank", "cash"].includes(p.method) ? p.method : "mpesa";
           if (amount > 0 && amount <= 10000000 && !correctionMatch && !/\b(refund|correct|correction|mistake|instead)\b/i.test(question)) {
            let duplicate = false;
            if (reference) {
              const { data: dup } = await sb.from("payments").select("id").or(`reference_no.ilike.${reference},mpesa_receipt_no.ilike.${reference}`).limit(1);
              duplicate = !!dup?.length;
            }
            payment = { amount, date, reference, method, duplicate };
          }
        } catch { /* ignore malformed */ }
      }
      return { ok: true as const, text, payment, correction, tenantId: tid, tenantName: tenant.full_name };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status ?? e?.lastError?.statusCode;
      console.error("tenant assistant failed", status, e?.message);
      if (status === 402) return { ok: false as const, error: "AI credits have run out. Add credits in Settings → Plans & credits." };
      if (status === 429) return { ok: false as const, error: "The assistant is busy. Please try again in a minute." };
      if (status === 403) return { ok: false as const, error: "The AI assistant isn't available for this workspace right now." };
      return { ok: false as const, error: "The assistant couldn't answer right now. Please try again." };
    }
  });

export const confirmAssistantCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ paymentId: z.string().uuid(), oldAmount: z.number().nonnegative(), amount: z.number().positive().max(10000000), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("correct_assistant_payment", { _payment_id: data.paymentId, _expected_amount: data.oldAmount, _new_amount: data.amount, _reason: data.reason });
    if (error) throw new Error(error.message);
    return { ok: true, result };
  });

/** After landlord confirmation, rename a tenant to match the name on their M-Pesa payments. */
export const renameTenantToPayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenantId: z.string().uuid(), name: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("tenants").update({ full_name: data.name }).eq("id", data.tenantId).select("id").maybeSingle();
    if (error || !row) throw new Error("Could not update the tenant's name.");
    return { ok: true };
  });
