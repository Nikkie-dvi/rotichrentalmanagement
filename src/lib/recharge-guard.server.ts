/** Called only after the handler verifies the caller owns the account. */
export async function claimRechargeRequest(userId: string, kind: "subscription_prompt" | "sms_recharge") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("claim_recharge_request", { _user_id: userId, _kind: kind });
  if (error) throw new Error("Could not verify request limits. Please try later.");
  if (!data) throw new Error("Please wait a minute before requesting again. A maximum of five requests is allowed per hour.");
}