// Lets a landlord (or their active property manager) push an instant
// notification to every tenant device under that landlord.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const notifyMyTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    sms?: boolean;
    push?: boolean;
    audience?: "all" | "due" | "overdue";
    tenantIds?: string[];
  }) => {
    const title = (data?.title ?? "").trim();
    const body = (data?.body ?? "").trim();
    if (!title || !body) throw new Error("A title and a message are required");
    return {
      title: title.slice(0, 80),
      body: body.slice(0, 400),
      url: data.url ?? "/tenant/dashboard",
      tag: data.tag ?? `landlord-notice-${Date.now()}`,
      sms: data.sms ?? false,
      push: data.push ?? true,
      audience: data.audience ?? "all",
      tenantIds: Array.isArray(data.tenantIds) ? data.tenantIds.filter(Boolean) : [],
    };
  })
  .handler(async ({ data, context }) => {
    // RLS scopes this to tenants the caller may see (owner or active manager).
    const { data: tenants, error } = await context.supabase
      .from("tenants")
      .select("id, owner_id, phone_number, auth_user_id")
      .eq("active", true);
    if (error) throw new Error(error.message);

    let rows = (tenants ?? []) as {
      id: string;
      owner_id: string;
      phone_number: string | null;
      auth_user_id: string | null;
    }[];

    // Narrow the audience: hand-picked tenants, tenants with rent due, or those overdue.
    if (data.tenantIds.length > 0) {
      const picked = new Set(data.tenantIds);
      rows = rows.filter((t) => picked.has(t.id));
    } else if (data.audience === "due" || data.audience === "overdue") {
      const today = new Date().toISOString().slice(0, 10);
      let q = context.supabase
        .from("invoices")
        .select("tenant_id, due_date, status")
        .neq("status", "paid");
      if (data.audience === "overdue") q = q.lt("due_date", today);
      const { data: inv } = await q;
      const owing = new Set(((inv ?? []) as { tenant_id: string | null }[]).map((i) => i.tenant_id).filter(Boolean) as string[]);
      rows = rows.filter((t) => owing.has(t.id));
    }

    if (rows.length === 0) {
      return { ok: true, sent: 0, devices: 0, smsSent: 0, smsFailed: 0, smsSkippedNoCredit: 0, smsCost: 0, recipients: 0 };
    }

    const userIds = Array.from(new Set(rows.map((t) => t.auth_user_id).filter(Boolean))) as string[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const logs: Record<string, unknown>[] = [];

    let sent = 0;
    let devices = 0;

    if (data.push && userIds.length > 0) {
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

      devices = (subs ?? []).length;
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
    }

    let smsSent = 0;
    let smsFailed = 0;
    let smsSkippedNoCredit = 0;
    let smsCost = 0;

    if (data.sms) {
      const message = `${data.title}: ${data.body}`.slice(0, 400);
      const withPhones = rows.filter((t) => !!t.phone_number);

      // Charge the SMS wallet up front — flat rate per recipient, regardless of length.
      const byOwner = new Map<string, typeof withPhones>();
      for (const t of withPhones) {
        const list = byOwner.get(t.owner_id) ?? [];
        list.push(t);
        byOwner.set(t.owner_id, list);
      }
      const funded = new Set<string>();
      for (const [ownerId, list] of byOwner) {
        const { data: balance, error: chargeErr } = await supabaseAdmin.rpc("sms_charge" as never, {
          _owner: ownerId,
          _count: list.length,
          _reason: "broadcast",
          _note: data.title,
        } as never);
        if (chargeErr || balance === null) {
          smsSkippedNoCredit += list.length;
          continue;
        }
        funded.add(ownerId);
        smsCost += list.length;
      }

      const { sendSms } = await import("@/lib/sms.server");
      for (const t of withPhones) {
        if (!funded.has(t.owner_id)) continue;
        const res = await sendSms(t.phone_number!, message);
        if (res.ok) smsSent++;
        else smsFailed++;
        logs.push({
          owner_id: t.owner_id,
          tenant_id: t.id,
          channel: "sms",
          recipient: t.phone_number,
          subject: data.title,
          message,
          status: res.ok ? "delivered" : "failed",
          error: res.error ?? null,
        });
      }
    }


    if (logs.length) await supabaseAdmin.from("notification_logs").insert(logs as never);

    return { ok: true, sent, devices, smsSent, smsFailed, smsSkippedNoCredit, smsCost: smsCost * 1.2, recipients: rows.length };
  });


