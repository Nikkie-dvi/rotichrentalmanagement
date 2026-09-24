import { sendSms } from "./sms.server";

const LOW_BALANCE_MESSAGES = 10;
const ALERT_COOLDOWN_HOURS = 24;

type AdminClient = any;

async function notifyLowSmsBalance(
  supabaseAdmin: AdminClient,
  ownerId: string,
  balance: number,
  rate: number,
) {
  const messagesLeft = Math.max(0, Math.floor(balance / rate));
  if (messagesLeft >= LOW_BALANCE_MESSAGES) return;

  const since = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("notification_logs")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("subject", "Low SMS credit")
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  if (recent) return;

  const { data: account } = await supabaseAdmin
    .from("landlord_accounts")
    .select("phone")
    .eq("user_id", ownerId)
    .maybeSingle();
  const phone = account?.phone as string | null | undefined;
  if (!phone) return;

  const message = messagesLeft < 1
    ? "Your Rotich Management SMS credit has run out. Open My Account to request a recharge."
    : `Your Rotich Management SMS credit is running low: ${messagesLeft} message${messagesLeft === 1 ? "" : "s"} left. Open My Account to top up.`;
  const result = await sendSms(phone, message, { portalLink: false });

  await supabaseAdmin.from("notification_logs").insert({
    owner_id: ownerId,
    channel: "sms",
    recipient: phone,
    subject: "Low SMS credit",
    message,
    status: result.ok ? "delivered" : "failed",
    error: result.error ?? null,
  });
}

/** Charges a landlord's wallet and sends one free, deduplicated low-credit alert. */
export async function chargeSmsWallet(
  supabaseAdmin: AdminClient,
  args: { ownerId: string; count: number; reason: string; note?: string | null },
): Promise<number | null> {
  const { data: chargedBalance, error } = await supabaseAdmin.rpc("sms_charge", {
    _owner: args.ownerId,
    _count: args.count,
    _reason: args.reason,
    _note: args.note ?? null,
  });

  if (error || chargedBalance === null) {
    const { data: wallet } = await supabaseAdmin
      .from("sms_wallets")
      .select("balance, rate_per_sms")
      .eq("owner_id", args.ownerId)
      .maybeSingle();
    if (wallet) {
      await notifyLowSmsBalance(
        supabaseAdmin,
        args.ownerId,
        Number(wallet.balance) || 0,
        Number(wallet.rate_per_sms) || 1.2,
      );
    }
    return null;
  }

  const { data: wallet } = await supabaseAdmin
    .from("sms_wallets")
    .select("rate_per_sms")
    .eq("owner_id", args.ownerId)
    .maybeSingle();
  await notifyLowSmsBalance(
    supabaseAdmin,
    args.ownerId,
    Number(chargedBalance) || 0,
    Number(wallet?.rate_per_sms) || 1.2,
  );
  return Number(chargedBalance);
}