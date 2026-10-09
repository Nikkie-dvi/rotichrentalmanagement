// Safaricom Daraja (M-Pesa Express / STK Push) helpers. Server-only.
const env = (k: string) => process.env[k] ?? "";

function baseUrl() {
  return env("MPESA_ENV") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

/** Till number overrides the shortcode for Buy Goods (till) payments. */
function shortcode() {
  return env("MPESA_TILL_NUMBER") || env("MPESA_SHORTCODE");
}

export function darajaConfigured() {
  return !!(env("MPESA_CONSUMER_KEY") && env("MPESA_CONSUMER_SECRET") && shortcode() && env("MPESA_PASSKEY"));
}

export function normalizeKePhone(input: string) {
  const raw = input.replace(/\D/g, "");
  if (raw.startsWith("254")) return raw;
  if (raw.startsWith("0")) return "254" + raw.slice(1);
  if (raw.startsWith("7") || raw.startsWith("1")) return "254" + raw;
  return raw;
}

async function token() {
  const auth = btoa(`${env("MPESA_CONSUMER_KEY")}:${env("MPESA_CONSUMER_SECRET")}`);
  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`M-Pesa sign-in failed (${res.status})`);
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

function stamp() {
  // Daraja expects Nairobi time YYYYMMDDHHmmss
  const d = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  return d.slice(0, 19).replace(/[-T:]/g, "");
}

function password(ts: string) {
  return btoa(`${env("MPESA_SHORTCODE")}${env("MPESA_PASSKEY")}${ts}`);
}

export async function stkPush(p: { phone: string; amount: number; reference: string; description: string; callbackUrl: string }) {
  const ts = stamp();
  const till = env("MPESA_TRANSACTION_TYPE") === "CustomerBuyGoodsOnline";
  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "content-type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: env("MPESA_SHORTCODE"),
      Password: password(ts),
      Timestamp: ts,
      TransactionType: till ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
      Amount: Math.max(1, Math.round(p.amount)),
      PartyA: p.phone,
      PartyB: env("MPESA_PARTY_B") || env("MPESA_SHORTCODE"),
      PhoneNumber: p.phone,
      CallBackURL: p.callbackUrl,
      AccountReference: p.reference.slice(0, 12),
      TransactionDesc: p.description.slice(0, 13),
    }),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || j.ResponseCode !== "0") {
    console.error("STK push failed", j);
    throw new Error(j.errorMessage || j.ResponseDescription || "M-Pesa could not send the prompt");
  }
  return { checkoutRequestId: j.CheckoutRequestID as string, merchantRequestId: j.MerchantRequestID as string };
}

/** Asks Daraja for the outcome of a prompt. Returns null while still pending. */
export async function stkQuery(checkoutRequestId: string) {
  const ts = stamp();
  const res = await fetch(`${baseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "content-type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: env("MPESA_SHORTCODE"),
      Password: password(ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  if (j.ResultCode === undefined) return null; // still processing
  return { resultCode: Number(j.ResultCode), resultDesc: String(j.ResultDesc ?? "") };
}

/** Marks a subscription prompt done and, on success, records the subscription payment. */
export async function settleSubscriptionStk(p: {
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  receipt?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("landlord_subscription_stk")
    .select("*")
    .eq("checkout_request_id", p.checkoutRequestId)
    .maybeSingle();
  if (!row || row.status !== "pending") return row;
  const success = p.resultCode === 0;
  // Claim the row atomically so a callback and a status check never both record a payment.
  const { data: claimed } = await supabaseAdmin
    .from("landlord_subscription_stk")
    .update({
      status: success ? "success" : "failed",
      result_desc: p.resultDesc,
      mpesa_receipt_no: p.receipt ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (!claimed || !success) return claimed;
  await supabaseAdmin.from("landlord_subscription_payments").insert({
    landlord_account_id: row.landlord_account_id,
    amount: Number(row.amount),
    months_covered: row.months_covered,
    reference: p.receipt ?? p.checkoutRequestId,
    note: "Paid by M-Pesa prompt",
    recorded_by: row.user_id,
  });
  await supabaseAdmin
    .from("landlord_accounts")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", row.landlord_account_id)
    .eq("status", "pending");
  return claimed;
}
