// Server-only helper: send a Web Push notification to a set of auth users
// (landlords, property managers or tenants) and clean up dead subscriptions.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The web-push package is CommonJS; depending on how the server bundler
// wraps it, the callable API is either the module itself or its .default.
// Normalize once so webpush.setVapidDetails always exists.
export async function loadWebpush() {
  const mod: any = await import("web-push");
  const wp = mod?.default?.setVapidDetails ? mod.default : mod;
  if (!wp?.setVapidDetails) throw new Error("web-push failed to load");
  return wp;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function pushToUsers(userIds: string[], payload: PushPayload) {
  // Push alerts are disabled app-wide; keep the signature so callers compile.
  return { sent: 0, removed: 0 };
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return { sent: 0, removed: 0 };

  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!publicKey || !privateKey) return { sent: 0, removed: 0 };

  const webpush = await loadWebpush();
  webpush.setVapidDetails(
    process.env["VAPID_SUBJECT"] || "mailto:reminders@example.com",
    publicKey,
    privateKey,
  );

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("owner_id", ids);

  let sent = 0;
  let removed = 0;
  for (const sub of (subs ?? []) as any[]) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          tag: payload.tag ?? `notice-${Date.now()}`,
          url: payload.url ?? "/",
        }),
      );
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
      }
    }
  }
  return { sent, removed };
}

/** Landlord + every active property manager working for them. */
export async function landlordAudience(ownerId: string) {
  const { data: managers } = await supabaseAdmin
    .from("property_managers")
    .select("manager_user_id")
    .eq("landlord_user_id", ownerId)
    .eq("active", true);
  return [
    ownerId,
    ...((managers ?? []) as any[]).map((m) => m.manager_user_id).filter(Boolean),
  ];
}

/** Landlords only get phone alerts about invoices raised, payments received and upcoming rent. */
export type LandlordPushKind = "invoiced" | "paid" | "upcoming" | "other";
export async function landlordPush(kind: LandlordPushKind, ownerId: string, payload: PushPayload) {
  if (kind === "other") return { sent: 0, removed: 0 };
  return pushToUsers(await landlordAudience(ownerId), payload);
}
