// Instant tenant alerts when a charge or fee is assessed.
// Server-only — SMS via SMS Leopard, plus phone push, plus a notification log entry.
import { sendSms } from "./sms.server";
import { chargeSmsWallet } from "./sms-wallet.server";

const money = (n: number) => `KES ${Math.round(n).toLocaleString("en-US")}`;

export async function notifyTenantOfCharge(args: {
  ownerId: string;
  tenantId: string;
  invoiceId: string;
  label: string;
  amount: number;
  balance: number;
  month: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { isMessagingPaused } = await import("./account-messaging.server");
  if (await isMessagingPaused(args.ownerId)) return { ok: false };

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, full_name, phone_number, email, auth_user_id")
    .eq("id", args.tenantId)
    .maybeSingle();
  if (!tenant) return { ok: false };

  const { data: settings } = await supabaseAdmin
    .from("billing_settings")
    .select("sms_enabled, email_enabled")
    .eq("owner_id", args.ownerId)
    .maybeSingle();

  const first = ((tenant as any).full_name ?? "there").split(" ")[0];
  const { invoiceBreakdown } = await import("./invoice-breakdown.server");
  const breakdown = await invoiceBreakdown(supabaseAdmin, args.invoiceId);
  const detail = breakdown?.text ? ` ${args.month} bill: ${breakdown.text}.` : "";
  const message = `Hi ${first}, ${args.label} of ${money(args.amount)} was added to your ${args.month} invoice.${detail} Your balance is now ${money(args.balance)}.`;

  const logs: any[] = [];
  let smsSkippedNoCredit = false;

  if ((settings as any)?.sms_enabled !== false && (tenant as any).phone_number) {
    // Flat 1.2 KES per SMS from the landlord's wallet — no credit, no SMS.
    const walletBalance = await chargeSmsWallet(supabaseAdmin, {
      ownerId: args.ownerId,
      count: 1,
      reason: "charge_alert",
      note: args.label,
    });
    if (walletBalance === null) {
      smsSkippedNoCredit = true;
    } else {
    const res = await sendSms((tenant as any).phone_number, message);
    logs.push({
      owner_id: args.ownerId,
      tenant_id: tenant.id,
      invoice_id: args.invoiceId,
      channel: "sms",
      recipient: (tenant as any).phone_number ?? null,
      message,
      status: res.ok ? "delivered" : "failed",
      error: res.error ?? null,
    });
    }
  }


  if ((settings as any)?.email_enabled !== false) {
    logs.push({
      owner_id: args.ownerId,
      tenant_id: tenant.id,
      invoice_id: args.invoiceId,
      channel: "email",
      recipient: (tenant as any).email ?? null,
      subject: `${args.label} added to your invoice`,
      message,
      status: "skipped",
      error: "No verified sender domain configured yet",
    });
  }

  if ((tenant as any).auth_user_id) {
    try {
      const { loadWebpush } = await import("./push.server");
      const webpush = await loadWebpush();
      webpush.setVapidDetails(
        process.env["VAPID_SUBJECT"] || "mailto:reminders@example.com",
        process.env["VAPID_PUBLIC_KEY"]!,
        process.env["VAPID_PRIVATE_KEY"]!,
      );
      const { data: subs } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("owner_id", (tenant as any).auth_user_id);
      for (const sub of (subs ?? []) as any[]) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: `${args.label} added`, body: message, url: "/tenant/dashboard" }),
          );
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
          }
        }
      }
      logs.push({
        owner_id: args.ownerId,
        tenant_id: tenant.id,
        invoice_id: args.invoiceId,
        channel: "push",
        recipient: `${(subs ?? []).length} device(s)`,
        message,
        status: (subs ?? []).length > 0 ? "delivered" : "skipped",
      });
    } catch {
      /* push is best-effort */
    }
  }

  if (logs.length) await supabaseAdmin.from("notification_logs").insert(logs);
  return { ok: true, smsSkippedNoCredit };
}
