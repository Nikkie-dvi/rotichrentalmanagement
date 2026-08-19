// Lets a landlord (or their active property manager) push an instant
// notification to every tenant device under that landlord.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const notifyMyTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { title: string; body: string; url?: string; tag?: string }) => {
    const title = (data?.title ?? "").trim();
    const body = (data?.body ?? "").trim();
    if (!title || !body) throw new Error("A title and a message are required");
    return {
      title: title.slice(0, 80),
      body: body.slice(0, 400),
      url: data.url ?? "/tenant/dashboard",
      tag: data.tag ?? `landlord-notice-${Date.now()}`,
    };
  })
  .handler(async ({ data, context }) => {
    // RLS scopes this to tenants the caller may see (owner or active manager).
    const { data: tenants, error } = await context.supabase
      .from("tenants")
      .select("auth_user_id")
      .eq("active", true)
      .not("auth_user_id", "is", null);
    if (error) throw new Error(error.message);

    const userIds = Array.from(
      new Set((tenants ?? []).map((t: { auth_user_id: string | null }) => t.auth_user_id).filter(Boolean)),
    ) as string[];
    if (userIds.length === 0) return { ok: true, sent: 0, devices: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const webpush = (await import("web-push")).default;

    webpush.setVapidDetails(
      process.env["VAPID_SUBJECT"] || "mailto:reminders@example.com",
      process.env["VAPID_PUBLIC_KEY"]!,
      process.env["VAPID_PRIVATE_KEY"]!,
    );

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("owner_id", userIds);

    let sent = 0;
    for (const sub of (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: data.title, body: data.body, tag: data.tag, url: data.url }),
        );
        sent++;
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    return { ok: true, sent, devices: (subs ?? []).length };
  });
