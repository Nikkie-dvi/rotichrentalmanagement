// Daily cron endpoint. Sends Web Push notifications to every subscribed device
// for tenants whose rent is due today, in the next 3 days, or overdue with an
// unpaid invoice for the current month.
import { createFileRoute } from "@tanstack/react-router";
import { assertCronCaller } from "@/lib/cron-guard.server";

type Sub = {
  id: string;
  owner_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type Reminder = { title: string; body: string; tag: string };

export const Route = createFileRoute("/api/public/hooks/send-push-reminders")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const denied = assertCronCaller(request);
        if (denied) return denied;
        // Push alerts are disabled: the feature was removed from the app.
        return Response.json({ ok: true, disabled: true, sent: 0 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // web-push pulls in Node-oriented buffer helpers. Keep it out of the
        // global route graph so ordinary page requests remain Worker-safe.
        const { loadWebpush } = await import("@/lib/push.server");
        const webpush = await loadWebpush();

        webpush.setVapidDetails(
          process.env.VAPID_SUBJECT || "mailto:reminders@example.com",
          process.env.VAPID_PUBLIC_KEY!,
          process.env.VAPID_PRIVATE_KEY!,
        );

        const today = new Date();
        const todayDay = today.getDate();
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const monthYear = today.toISOString().slice(0, 7);

        // Owner -> list of reminders to send.
        const byOwner = new Map<string, Reminder[]>();

        const { data: tenants } = await supabaseAdmin
          .from("tenants")
          .select("id, owner_id, auth_user_id, full_name, rent_due_day, active, units(unit_number, rent_amount, properties(name))")
          .eq("active", true);

        const { data: unpaidInvoices } = await supabaseAdmin
          .from("invoices")
          .select("tenant_id, balance_remaining, status, month_year")
          .eq("month_year", monthYear)
          .neq("status", "paid");
        const unpaidByTenant = new Map<string, number>();
        (unpaidInvoices ?? []).forEach((i: any) =>
          unpaidByTenant.set(i.tenant_id, Number(i.balance_remaining) || 0),
        );

        for (const t of (tenants ?? []) as any[]) {
          if (!t.rent_due_day) continue;
          const effectiveDue = Math.min(t.rent_due_day, lastDay);
          const diff = effectiveDue - todayDay;
          const rentAmount = Number(t.units?.rent_amount ?? 0);
          const unpaidBalance = unpaidByTenant.get(t.id);
          const label = [t.units?.properties?.name, t.units?.unit_number].filter(Boolean).join(" · ") || "No unit";

          let reminder: Reminder | null = null;
          if (unpaidBalance && unpaidBalance > 0 && diff <= 0) {
            reminder = {
              title: `Overdue: ${t.full_name}`,
              body: `${label} — KES ${Math.round(unpaidBalance).toLocaleString()} unpaid (was due day ${effectiveDue}).`,
              tag: `overdue-${t.id}-${monthYear}`,
            };
          } else if (diff === 0) {
            reminder = {
              title: `Rent due today: ${t.full_name}`,
              body: `${label} — KES ${Math.round(rentAmount).toLocaleString()} due today.`,
              tag: `due-${t.id}-${monthYear}`,
            };
          } else if (diff > 0 && diff <= 3) {
            reminder = {
              title: `Upcoming rent: ${t.full_name}`,
              body: `${label} — KES ${Math.round(rentAmount).toLocaleString()} due in ${diff} day${diff === 1 ? "" : "s"}.`,
              tag: `upcoming-${t.id}-${monthYear}-${diff}`,
            };
          }

          if (reminder) {
            // Landlords asked not to be pushed about every rent/invoice
            // reminder — they now only get a push when a tenant is invoiced.
            // Notify the tenant themselves (own wording) when they have a portal account.
            if (t.auth_user_id) {
              const amount = unpaidBalance && unpaidBalance > 0 && diff <= 0 ? unpaidBalance : rentAmount;
              const tenantReminder: Reminder =
                unpaidBalance && unpaidBalance > 0 && diff <= 0
                  ? {
                      title: "Your rent is overdue",
                      body: `${label} — KES ${Math.round(amount).toLocaleString()} is still outstanding (was due day ${effectiveDue}).`,
                      tag: `my-overdue-${t.id}-${monthYear}`,
                    }
                  : diff === 0
                    ? {
                        title: "Your rent is due today",
                        body: `${label} — KES ${Math.round(amount).toLocaleString()} is due today.`,
                        tag: `my-due-${t.id}-${monthYear}`,
                      }
                    : {
                        title: "Rent due soon",
                        body: `${label} — KES ${Math.round(amount).toLocaleString()} is due in ${diff} day${diff === 1 ? "" : "s"}.`,
                        tag: `my-upcoming-${t.id}-${monthYear}-${diff}`,
                      };
              const tList = byOwner.get(t.auth_user_id) ?? [];
              tList.push(tenantReminder);
              byOwner.set(t.auth_user_id, tList);
            }
          }
        }

        // Landlord summary of upcoming rent (due within 3 days, not yet paid).
        const { data: paidRows } = await supabaseAdmin
          .from("invoices").select("tenant_id").eq("month_year", monthYear).eq("status", "paid");
        const paidSet = new Set(((paidRows ?? []) as any[]).map((r) => r.tenant_id));
        const upcoming = new Map<string, string[]>();
        for (const t of (tenants ?? []) as any[]) {
          if (!t.rent_due_day || paidSet.has(t.id)) continue;
          const diff = Math.min(t.rent_due_day, lastDay) - todayDay;
          if (diff < 0 || diff > 3) continue;
          const when = diff === 0 ? "today" : diff === 1 ? "tomorrow" : `in ${diff} days`;
          upcoming.set(t.owner_id, [...(upcoming.get(t.owner_id) ?? []), `${t.full_name} (${when})`]);
        }
        const { landlordPush } = await import("@/lib/push.server");
        let landlordSent = 0;
        for (const [ownerId, names] of upcoming) {
          const r = await landlordPush("upcoming", ownerId, {
            title: `${names.length} rent payment${names.length === 1 ? "" : "s"} coming up`,
            body: names.slice(0, 6).join(", ") + (names.length > 6 ? ` and ${names.length - 6} more` : ""),
            url: "/calendar",
            tag: `upcoming-${ownerId}-${today.toISOString().slice(0, 10)}`,
          }).catch(() => ({ sent: 0 }));
          landlordSent += r.sent;
        }

        if (byOwner.size === 0) {
          return Response.json({ ok: true, sent: 0, landlordSent, note: "no tenant reminders today" });
        }

        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, owner_id, endpoint, p256dh, auth")
          .in("owner_id", Array.from(byOwner.keys()));

        let sent = 0;
        let removed = 0;

        for (const sub of ((subs ?? []) as Sub[])) {
          const reminders = byOwner.get(sub.owner_id) ?? [];
          for (const r of reminders) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                JSON.stringify({
                  title: r.title,
                  body: r.body,
                  tag: r.tag,
                  url: "/",
                }),
              );
              sent++;
            } catch (err: any) {
              const status = err?.statusCode;
              if (status === 404 || status === 410) {
                // Subscription is gone — clean it up.
                await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
                removed++;
                break; // no point sending remaining reminders to this dead endpoint
              }
              console.error("push send failed", status, err?.body || err?.message);
            }
          }
        }

        return Response.json({ ok: true, sent, removed, owners: byOwner.size, landlordSent });
      },
    },
  },
});
