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
    const wantsForecast = !tenantId && /\b(expect|expected|forecast|upcoming|projected|next week|next month|due (between|from|until|by)|coming in|will (i|we) (get|receive|collect))\b/i.test(data.question);
    if (wantsForecast) return await portfolioForecast(sb, data.question, data.history ?? []);
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
      sb.from("invoices").select("id, month_year, kind, total_due, balance_remaining, status, due_date, late_penalty_amount").eq("tenant_id", tid).order("month_year", { ascending: false }),
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
      'For an explicit correction of an EXISTING recorded payment/receipt, NEVER output PAYMENT_JSON. Only if exactly one payment in the account matches the date, reference or recorded amount, end with CORRECTION_JSON: {"paymentId":"existing UUID", "amount":2500, "date":"YYYY-MM-DD", "reference":"CODE", "reason":"short reason"} including only the fields that change (amount = corrected total, not a difference). To change the tenant credit balance directly (e.g. remove wrongly given credit, or credit after the landlord refunded the tenant themselves) end with CREDIT_JSON: {"delta": -18000, "reason":"short reason"} (negative removes credit, positive adds). To change an invoice's total end with INVOICE_JSON: {"invoiceId":"existing UUID", "total": 12000, "reason":"short reason"}. Landlords handle real refunds themselves; your job is only to adjust the records. If ambiguous ask which date/reference; do not guess. No mutation has happened; the landlord must confirm. Never claim money was transferred; when the landlord says they refunded a tenant, adjust the records (CORRECTION_JSON or CREDIT_JSON). REVERSING EXCESS CREDIT: you have full authority (with landlord confirmation) to reverse credit that was recorded wrongly, over-recorded or duplicated. NEVER tell the landlord to contact an admin or support. Reduce the wrong payment with CORRECTION_JSON (use amount 0 to void a duplicate entry) or use CREDIT_JSON when the excess is credit, not a receipt. If the excess (e.g. KES 18,000) spans several entries, reverse them one at a time, starting with the most recent, and say what is left after confirming.\n' +
      "PROBLEM SOLVING: the landlord may describe a recording mistake (e.g. 'tenant joined in January and paid 6 months upfront but I recorded it wrong'). Act like a careful bookkeeper: compare what SHOULD be on the account (move-in date, rent x months, what the tenant says they paid) with the recorded invoices, payments and ledger; explain in plain words what is wrong and the exact fix. " +
      "When information is missing, ask ONE short step-by-step question at a time (e.g. 'When did the tenant move in?', 'How many months ahead did they pay, and how much in total?') instead of guessing; you may skip the Summary section while asking. Once you know, compare against the records: tell the landlord clearly if a payment looks recorded TWICE (same amount and date/reference), or recorded SHORT (e.g. 'recorded short by 2 months = KES 20,000'), then offer the fix as a question, e.g. 'Should I record the missing 2 months (KES 20,000) so the account is correct?' with the matching PAYMENT_JSON. For a duplicate, explain it and offer a CORRECTION_JSON only if a single payment covers it; or a CORRECTION_JSON with amount 0 to void the duplicate entry. " +
      "Propose only ONE fix per reply: either a CORRECTION_JSON for a wrong recorded amount, or a PAYMENT_JSON for a missing payment (use the actual date it was paid). If several steps are needed, propose the first and say what comes next after confirming. Never claim anything was changed — every fix waits for the landlord's confirmation.\n" +
      "QUICK REPLIES: end EVERY reply with one final line exactly: QUICK_REPLIES: [\"<reply 1>\", \"<reply 2>\"] with 1-4 short buttons (max 30 chars each) the landlord can tap to answer or act. Match them to what you just asked or offered: when offering a fix use [\"Yes, fix it\", \"Not now\"]; when asking a question offer the likely answers (e.g. [\"It was intentional\", \"It was a mistake\"], [\"2 months\", \"3 months\", \"Not sure\"]); for a plain summary use [\"What should I do next?\"]. When the landlord taps a fix reply such as 'Yes, fix it', respond with the matching PAYMENT_JSON or CORRECTION_JSON so they can confirm.";
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
      let quickReplies: string[] = [];
      const qr = text.match(/QUICK_REPLIES:\s*(\[[^\n]*\])/);
      if (qr) {
        text = text.replace(qr[0], "").trim();
        try {
          quickReplies = z.array(z.string().trim().min(1).max(30)).max(4).parse(JSON.parse(qr[1] ?? "[]"));
        } catch { /* ignore malformed quick replies */ }
      }
      let payment: { amount: number; date: string; reference: string | null; method: string; duplicate: boolean } | null = null;
      type Fix = { kind: "payment" | "credit" | "invoice"; targetId: string; expected: number | null; amount: number | null; date: string | null; reference: string | null; reason: string; label: string };
      let correction: Fix | null = null;
      const fmt = (v: number) => `KES ${Math.round(v).toLocaleString("en-US")}`;
      const correctionMatch = text.match(/(CORRECTION|CREDIT|INVOICE)_JSON:\s*(\{[^\n]*\})/);
      if (correctionMatch) {
        text = text.replace(/(CORRECTION|CREDIT|INVOICE)_JSON:\s*\{[^\n]*\}/g, "").trim();
        try {
          const raw = JSON.parse(correctionMatch[2] ?? "");
          const reason = z.string().trim().min(3).max(500).parse(raw.reason);
          if (correctionMatch[1] === "CORRECTION") {
            const c = z.object({ paymentId: z.string().uuid(), amount: z.number().nonnegative().max(10000000).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), reference: z.string().trim().max(40).optional() }).parse(raw);
            const ex = payments.find((p) => p.id === c.paymentId);
            if (ex) {
              const amount = c.amount != null && c.amount !== Number(ex.amount_paid) ? c.amount : null;
              const date = c.date && c.date !== ex.payment_date && c.date <= today ? c.date : null;
              const reference = c.reference != null && c.reference.toUpperCase() !== String(ex.reference_no ?? "").toUpperCase() ? c.reference.replace(/[^A-Za-z0-9-]/g, "").toUpperCase() : null;
              const parts = [amount != null && (amount === 0 ? `amount ${fmt(Number(ex.amount_paid))} → reversed (KES 0)` : `amount ${fmt(Number(ex.amount_paid))} → ${fmt(amount)}`), date && `date ${ex.payment_date} → ${date}`, reference != null && `code ${ex.reference_no ?? "none"} → ${reference || "none"}`].filter(Boolean);
              if (parts.length) correction = { kind: "payment", targetId: ex.id, expected: Number(ex.amount_paid), amount, date, reference, reason, label: `Edit receipt of ${ex.payment_date}: ${parts.join(", ")}` };
            }
          } else if (correctionMatch[1] === "CREDIT") {
            const delta = Math.round(z.number().min(-10000000).max(10000000).parse(raw.delta));
            if (delta !== 0) correction = { kind: "credit", targetId: tid, expected: null, amount: delta, date: null, reference: null, reason, label: delta < 0 ? `Remove ${fmt(-delta)} credit from the account` : `Add ${fmt(delta)} credit to the account` };
          } else {
            const c = z.object({ invoiceId: z.string().uuid(), total: z.number().nonnegative().max(10000000) }).parse(raw);
            const ex = invoices.find((i: any) => i.id === c.invoiceId);
            if (ex && Number(ex.total_due) !== c.total) correction = { kind: "invoice", targetId: ex.id, expected: Number(ex.total_due), amount: c.total, date: null, reference: null, reason, label: `Change ${ex.month_year} invoice total ${fmt(Number(ex.total_due))} → ${fmt(c.total)}` };
          }
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
           if (amount > 0 && amount <= 10000000 && !correctionMatch && !/\b(refund|refunded|correct|correction|mistake|instead|reverse)\b/i.test(question)) {
            let duplicate = false;
            if (reference) {
              const { data: dup } = await sb.from("payments").select("id").or(`reference_no.ilike.${reference},mpesa_receipt_no.ilike.${reference}`).limit(1);
              duplicate = !!dup?.length;
            }
            payment = { amount, date, reference, method, duplicate };
          }
        } catch { /* ignore malformed */ }
      }
      return { ok: true as const, text, payment, correction, quickReplies, tenantId: tid, tenantName: tenant.full_name };
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
  .inputValidator((d) => z.object({ kind: z.enum(["payment", "credit", "invoice"]), targetId: z.string().uuid(), expected: z.number().nullable(), amount: z.number().min(-10000000).max(10000000).nullable(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), reference: z.string().max(40).nullable(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("assistant_apply_fix", { _kind: data.kind, _target_id: data.targetId, _expected: data.expected as any, _amount: data.amount as any, _date: data.date as any, _reference: data.reference as any, _reason: data.reason });
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

/** Portfolio-wide expected-payments answer, e.g. "what should I expect from next week to the 30th?". */
async function portfolioForecast(sb: any, question: string, history: { role: "user" | "assistant"; content: string }[]) {
  const today = businessTodayIso();
  const [tr, ir, pr, cr] = await Promise.all([
    sb.from("tenants").select("id, full_name, move_in_date, rent_due_day, units(unit_number, rent_amount, properties(name))").eq("active", true).limit(1000),
    sb.from("invoices").select("tenant_id, total_due").limit(10000),
    sb.from("payments").select("tenant_id, amount_paid, payment_date").order("payment_date", { ascending: false }).limit(10000),
    sb.from("tenant_credit_events").select("tenant_id, delta").limit(10000),
  ]);
  if (tr.error || ir.error || pr.error || cr.error) return { ok: false as const, error: "Could not read your portfolio. Please try again." };
  const by = (rows: any[], id: string, f: string) => rows.filter((r) => r.tenant_id === id).reduce((s, r) => s + Number(r[f] || 0), 0);
  const [ty, tm, td] = today.split("-").map(Number);
  const tenants = (tr.data ?? []).map((t: any) => {
    const rent = Number(t.units?.rent_amount || 0);
    const ledger = buildLedger({ invoiced: by(ir.data, t.id, "total_due"), paid: by(pr.data, t.id, "amount_paid"), adjustments: by(cr.data, t.id, "delta"), accrued: accruedRent({ rentAmount: rent, moveInDate: t.move_in_date, rentDueDay: t.rent_due_day }) });
    const dueDay = t.rent_due_day ?? (t.move_in_date ? Number(String(t.move_in_date).slice(8, 10)) : 1);
    const dues: string[] = [];
    for (let k = 0; k < 4; k++) {
      const y = ty + Math.floor((tm - 1 + k) / 12), m = ((tm - 1 + k) % 12) + 1;
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const d = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
      if (d > today || (k === 0 && Math.min(dueDay, last) === td)) dues.push(d);
    }
    const recent = (pr.data ?? []).filter((p: any) => p.tenant_id === t.id).slice(0, 6).map((p: any) => ({ date: p.payment_date, amount: Number(p.amount_paid) }));
    return { name: t.full_name, property: t.units?.properties?.name ?? null, unit: t.units?.unit_number ?? null, rent, upcoming_due_dates: dues, credit: ledger.credit, arrears: ledger.arrears, months_prepaid: rent ? Math.floor(ledger.credit / rent) : 0, recent_payments: recent };
  });
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false as const, error: "The AI assistant isn't set up yet." };
  const { createResponsesCall } = await import("./ai/responses.server");
  const instructions = "You are a Kenyan landlord's portfolio assistant. Use ONLY the data. Today is " + today + ". Answer questions about expected rent in a date range (e.g. 'from next week to the 30th'): work out the exact date range, list each tenant with a due date in that range (property, unit, due date, rent), and treat rent as already covered when credit covers it (months_prepaid) and add arrears that are still owed. Give the expected total, how much is already prepaid, and how much is at risk based on how late each tenant usually pays (from recent_payments vs due day). Group by property, amounts as 'KES 12,000', short plain English, under 250 words, label it an estimate. End with one final line exactly: QUICK_REPLIES: [\"...\"] with 1-3 short follow-ups (max 30 chars).";
  try {
    const { result } = createResponsesCall(getRequest(), { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" },
      [{ role: "user", content: `Portfolio data:\n${JSON.stringify({ today, currency: "KES", tenants })}` }, ...history.map((h) => ({ role: h.role, content: h.content })), { role: "user", content: `Landlord: ${question}` }], instructions);
    let text = (await result.text).trim();
    let quickReplies: string[] = [];
    const qr = text.match(/QUICK_REPLIES:\s*(\[[^\n]*\])/);
    if (qr) { text = text.replace(qr[0], "").trim(); try { quickReplies = z.array(z.string().trim().min(1).max(30)).max(4).parse(JSON.parse(qr[1] ?? "[]")); } catch { /* ignore */ } }
    return { ok: true as const, text, payment: null, correction: null, quickReplies, tenantId: null as string | null, tenantName: "your portfolio" };
  } catch (e: any) {
    console.error("portfolio forecast failed", e?.message);
    return { ok: false as const, error: "The assistant couldn't answer right now. Please try again." };
  }
}
