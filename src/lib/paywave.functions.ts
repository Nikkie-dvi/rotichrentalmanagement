import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function landlordAccount(supabase: any, userId: string) {
  const { data: account } = await supabase
    .from("landlord_accounts")
    .select("id, phone, landlord_code, monthly_fee, discount_percent, billing_plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!account) throw new Error("Landlord account not found");
  if (account.status === "declined") throw new Error("This account was declined");
  return account;
}

async function usablePhone(account: any) {
  const { normalizeKePhone } = await import("./daraja.server");
  const phone = normalizeKePhone(account.phone ?? "");
  if (!/^254(7|1)\d{8}$/.test(phone))
    throw new Error("Save a valid Kenyan phone number through the protected account details process before paying.");
  return phone;
}

async function recentPending(supabase: any, userId: string, kind: string) {
  const { data } = await supabase
    .from("paywave_payments")
    .select("id, amount")
    .eq("owner_id", userId)
    .eq("kind", kind)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - 180_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** SMS top-up: M-Pesa prompt on the landlord's phone; credit lands automatically. */
export const startPaywaveSmsRecharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { amount: number }) => {
    const amount = Number(data?.amount);
    if (!Number.isFinite(amount) || amount < 1) throw new Error("Enter the amount you want to top up");
    return { amount: Math.min(Math.round(amount), 1_000_000) };
  })
  .handler(async ({ data, context }) => {
    const { paywaveConfigured, paywaveStkPush } = await import("./paywave.server");
    if (!paywaveConfigured()) throw new Error("Automatic M-Pesa top-ups are not set up yet");
    const account = await landlordAccount(context.supabase, context.userId);
    const phone = await usablePhone(account);
    const pending = await recentPending(context.supabase, context.userId, "sms_recharge");
    if (pending) return { id: pending.id, amount: Number(pending.amount) };
    const { claimRechargeRequest } = await import("./recharge-guard.server");
    await claimRechargeRequest(context.userId, "sms_recharge");

    const reference = `SMS-${account.landlord_code || "TOPUP"}`;
    const res = await paywaveStkPush({ phone, amount: data.amount, reference });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("paywave_payments")
      .insert({
        owner_id: context.userId,
        kind: "sms_recharge",
        amount: data.amount,
        months_covered: 0,
        phone_number: phone,
        transaction_request_id: res.transactionRequestId,
        checkout_request_id: res.checkoutRequestId,
        merchant_request_id: res.merchantRequestId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, amount: data.amount };
  });

/** Subscription: M-Pesa prompt; the account is extended automatically on success. */
export const startPaywaveSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { paywaveConfigured, paywaveStkPush } = await import("./paywave.server");
    if (!paywaveConfigured()) throw new Error("Automatic M-Pesa payments are not set up yet");
    const account = await landlordAccount(context.supabase, context.userId);
    const phone = await usablePhone(account);
    const pending = await recentPending(context.supabase, context.userId, "subscription");
    if (pending) return { id: pending.id, amount: Number(pending.amount) };

    const { data: pricing } = await (context.supabase as any)
      .from("platform_pricing").select("base_monthly, annual_discount_percent").eq("id", "default").maybeSingle();
    const base = Number(account.monthly_fee ?? pricing?.base_monthly ?? 999) || 0;
    const discount = Math.min(100, Math.max(0, Number(account.discount_percent ?? 0)));
    const monthly = Math.round(base * (1 - discount / 100));
    const annual = account.billing_plan === "annual";
    const amount = annual
      ? Math.round(monthly * 12 * (1 - Number(pricing?.annual_discount_percent ?? 0) / 100))
      : monthly;
    if (amount < 1) throw new Error("Nothing to pay right now");
    const { claimRechargeRequest } = await import("./recharge-guard.server");
    await claimRechargeRequest(context.userId, "subscription_prompt");

    const res = await paywaveStkPush({ phone, amount, reference: `SUB-${account.landlord_code || "APP"}` });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("paywave_payments")
      .insert({
        owner_id: context.userId,
        kind: "subscription",
        landlord_account_id: account.id,
        amount,
        months_covered: annual ? 12 : 1,
        phone_number: phone,
        transaction_request_id: res.transactionRequestId,
        checkout_request_id: res.checkoutRequestId,
        merchant_request_id: res.merchantRequestId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, amount };
  });

/** Checks a pending prompt (asks PayWave directly if the webhook hasn't arrived). */
export const checkPaywavePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("paywave_payments")
      .select("id, status, result_desc, mpesa_receipt_no, transaction_request_id, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Payment not found");
    if (row.status !== "pending" || !row.transaction_request_id) return row;
    if (Date.now() - new Date(row.created_at).getTime() < 15_000) return row;
    const { paywaveStatus, settlePaywavePayment } = await import("./paywave.server");
    try {
      const s = await paywaveStatus(row.transaction_request_id);
      if (!s) return row;
      const settled = await settlePaywavePayment({
        transactionRequestId: row.transaction_request_id,
        success: s.status === "Completed",
        resultDesc: s.status,
        receipt: s.receipt,
      });
      return settled ?? row;
    } catch {
      return row;
    }
  });
