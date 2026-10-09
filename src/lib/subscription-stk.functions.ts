import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sends an M-Pesa payment prompt to the landlord's phone for their subscription. */
export const startSubscriptionStk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { phone: string }) => {
    const phone = String(d?.phone ?? "").trim();
    if (phone.replace(/\D/g, "").length < 9) throw new Error("Enter a valid M-Pesa phone number");
    return { phone };
  })
  .handler(async ({ data, context }) => {
    const { darajaConfigured, normalizeKePhone, stkPush } = await import("./daraja.server");
    if (!darajaConfigured()) throw new Error("M-Pesa payments are not set up yet");
    const phone = normalizeKePhone(data.phone);
    if (!/^254(7|1)\d{8}$/.test(phone)) throw new Error("Use a Safaricom number like 07XX XXX XXX");

    const { data: account } = await context.supabase
      .from("landlord_accounts")
      .select("id, landlord_code, monthly_fee, discount_percent, billing_plan, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!account) throw new Error("Landlord account not found");
    if (account.status === "declined") throw new Error("This account was declined");

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

    const origin = new URL(getRequest().url).origin;
    const site = origin.startsWith("https://") && !origin.includes("localhost") ? origin : "https://homebasemanager.app";
    const callbackUrl = `${site}/api/public/mpesa/subscription-callback?t=${encodeURIComponent(process.env["MPESA_CALLBACK_TOKEN"] ?? "")}`;

    const res = await stkPush({
      phone,
      amount,
      reference: account.landlord_code || "Subscription",
      description: "Subscription",
      callbackUrl,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("landlord_subscription_stk")
      .insert({
        landlord_account_id: account.id,
        user_id: context.userId,
        phone_number: phone,
        amount,
        months_covered: annual ? 12 : 1,
        checkout_request_id: res.checkoutRequestId,
        merchant_request_id: res.merchantRequestId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, amount };
  });

/** Checks a pending prompt (asks M-Pesa directly if the callback hasn't arrived). */
export const checkSubscriptionStk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("landlord_subscription_stk")
      .select("id, status, result_desc, mpesa_receipt_no, checkout_request_id, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Payment not found");
    if (row.status !== "pending" || !row.checkout_request_id) return row;
    if (Date.now() - new Date(row.created_at).getTime() < 15_000) return row;
    const { stkQuery, settleSubscriptionStk } = await import("./daraja.server");
    try {
      const q = await stkQuery(row.checkout_request_id);
      if (!q) return row;
      const settled = await settleSubscriptionStk({
        checkoutRequestId: row.checkout_request_id,
        resultCode: q.resultCode,
        resultDesc: q.resultDesc,
      });
      return settled ?? row;
    } catch {
      return row;
    }
  });
