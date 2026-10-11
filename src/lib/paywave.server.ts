// PayWave Express (paywavexpress.co.ke) helpers. Server-only.
// PayWave sits in front of M-Pesa: we POST an STK push, the landlord enters
// their PIN, and PayWave calls our webhook (or we poll /v1/tstatus).
const env = (k: string) => process.env[k] ?? "";

const BASE = "https://paywavexpress.co.ke";

export function paywaveConfigured() {
  return !!(env("PAYWAVE_API_KEY") && env("PAYWAVE_EMAIL"));
}

export type PaywaveKind = "sms_recharge" | "subscription";

/** Sends an M-Pesa prompt to the landlord's phone through PayWave. */
export async function paywaveStkPush(p: { phone: string; amount: number; reference: string }) {
  const res = await fetch(`${BASE}/v1/stkpush`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: env("PAYWAVE_API_KEY"),
      email: env("PAYWAVE_EMAIL"),
      amount: String(Math.max(1, Math.round(p.amount))),
      msisdn: p.phone,
      reference: p.reference.slice(0, 40),
    }),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || (j.ResponseCode !== "0" && j.success !== "200")) {
    console.error("PayWave STK push failed", j);
    throw new Error(j.errorMessage || j.message || "M-Pesa could not send the prompt");
  }
  return {
    transactionRequestId: String(j.transaction_request_id ?? ""),
    checkoutRequestId: String(j.CheckoutRequestID ?? ""),
    merchantRequestId: String(j.MerchantRequestID ?? ""),
  };
}

/** Asks PayWave for the outcome of a prompt. Returns null while still pending. */
export async function paywaveStatus(transactionRequestId: string) {
  const res = await fetch(`${BASE}/v1/tstatus`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: env("PAYWAVE_API_KEY"),
      email: env("PAYWAVE_EMAIL"),
      transaction_request_id: transactionRequestId,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  const status = String(j.TransactionStatus ?? "");
  if (!status || status === "Pending") return null;
  return {
    status, // Completed | Failed | Cancelled
    receipt: j.TransactionReceipt ? String(j.TransactionReceipt) : null,
    amount: Number(j.TransactionAmount ?? 0),
  };
}

/**
 * Marks a PayWave payment done and, on success, applies it:
 * sms_recharge credits the SMS wallet, subscription records the payment and
 * extends the account. Claims the row atomically so the webhook and a status
 * poll never both apply it.
 */
export async function settlePaywavePayment(p: {
  transactionRequestId: string;
  success: boolean;
  resultDesc: string;
  receipt?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("paywave_payments")
    .select("*")
    .eq("transaction_request_id", p.transactionRequestId)
    .maybeSingle();
  if (!row || row.status !== "pending") return row;
  const { data: claimed } = await supabaseAdmin
    .from("paywave_payments")
    .update({
      status: p.success ? "success" : "failed",
      result_desc: p.resultDesc,
      mpesa_receipt_no: p.receipt ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (!claimed || !p.success) return claimed;

  if (row.kind === "sms_recharge") {
    await supabaseAdmin.rpc("sms_credit" as never, {
      _owner: row.owner_id,
      _amount: Number(row.amount),
      _reason: "recharge",
      _note: `M-Pesa ${p.receipt ?? p.transactionRequestId}`,
      _by: row.owner_id,
    } as never);
  } else {
    await supabaseAdmin.from("landlord_subscription_payments").insert({
      landlord_account_id: row.landlord_account_id,
      amount: Number(row.amount),
      months_covered: row.months_covered,
      reference: p.receipt ?? p.transactionRequestId,
      note: "Paid by M-Pesa prompt (PayWave)",
      recorded_by: row.owner_id,
    });
    await supabaseAdmin
      .from("landlord_accounts")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", row.landlord_account_id)
      .eq("status", "pending");
  }
  return claimed;
}
