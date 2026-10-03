// Tenant rent reminders: "X days before due" and "Y days after due if unpaid".
// Driven by each landlord's billing_settings. Server-only.
import { sendSms } from "./sms.server";
import { chargeSmsWallet } from "./sms-wallet.server";
import { cadenceFor, payPattern, reminderToday, FIRM_FOLLOW_UP } from "./reminder-cadence";

const DEFAULTS = {
  rent_reminders_enabled: true,
  reminder_days_before: 5,
  reminder_days_after: 3,
  reminder_sms_enabled: true,
  reminder_push_enabled: true,
  reminder_before_template:
    "Dear {tenant_name}, this is a polite reminder that your rent of {total_balance} falls due on {due_date}. To check your balance or make a payment, visit homebasemanager.app/tenant/login and sign in with your phone number. Thank you.",
  reminder_after_template:
    "Dear {tenant_name}, our records show your rent of {total_balance}, due on {due_date}, is still outstanding. Kindly settle it at your earliest convenience. You can view your balance at homebasemanager.app/tenant/login - sign in with your phone number.",
};

const money = (n: number) => `KES ${Math.round(n).toLocaleString("en-US")}`;
const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? `{${k}}`);
}

export async function runRentReminders(opts: { ownerId?: string } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  let settingsQuery = supabaseAdmin.from("billing_settings").select("*");
  if (opts.ownerId) settingsQuery = settingsQuery.eq("owner_id", opts.ownerId);
  const { data: settingsRows } = await settingsQuery;
  const settingsByOwner = new Map<string, any>();
  for (const s of (settingsRows ?? []) as any[]) settingsByOwner.set(s.owner_id, { ...DEFAULTS, ...s });

  let invQuery = supabaseAdmin
    .from("invoices")
    .select("id, owner_id, tenant_id, month_year, due_date, balance_remaining, status, tenants(id, full_name, phone_number, auth_user_id, active)")
    .neq("status", "paid")
    .gt("balance_remaining", 0)
    .not("due_date", "is", null);
  if (opts.ownerId) invQuery = invQuery.eq("owner_id", opts.ownerId);
  const { data: invoices, error } = await invQuery;
  if (error) throw new Error(error.message);

  // Skip anyone already reminded today (survives repeated cron runs).
  const { data: todaysLogs } = await supabaseAdmin
    .from("notification_logs")
    .select("invoice_id, subject")
    .gte("created_at", `${todayKey}T00:00:00Z`);
  const alreadySent = new Set(
    ((todaysLogs ?? []) as any[])
      .filter((l) => typeof l.subject === "string" && l.subject.startsWith("Rent reminder"))
      .map((l) => `${l.invoice_id}`),
  );

  // Payment habits per tenant -> how often to remind.
  const tenantIds = [...new Set(((invoices ?? []) as any[]).map((i) => i.tenant_id))];
  const invoiceIds = ((invoices ?? []) as any[]).map((i) => i.id);
  const dueByTenant = new Map<string, string[]>();
  const paysByTenant = new Map<string, string[]>();
  const followUpsByInvoice = new Map<string, number>();
  for (let i = 0; i < tenantIds.length; i += 200) {
    const chunk = tenantIds.slice(i, i + 200);
    const [{ data: past }, { data: pays }] = await Promise.all([
      supabaseAdmin.from("invoices").select("tenant_id, due_date").in("tenant_id", chunk).eq("kind", "rent")
        .not("due_date", "is", null).lt("due_date", todayKey),
      supabaseAdmin.from("payments").select("tenant_id, payment_date").in("tenant_id", chunk),
    ]);
    for (const r of (past ?? []) as any[]) dueByTenant.set(r.tenant_id, [...(dueByTenant.get(r.tenant_id) ?? []), r.due_date]);
    for (const r of (pays ?? []) as any[]) paysByTenant.set(r.tenant_id, [...(paysByTenant.get(r.tenant_id) ?? []), r.payment_date]);
  }
  for (let i = 0; i < invoiceIds.length; i += 200) {
    const { data: prior } = await supabaseAdmin.from("notification_logs").select("invoice_id, subject")
      .in("invoice_id", invoiceIds.slice(i, i + 200)).eq("channel", "sms").like("subject", "Rent reminder%overdue%");
    for (const r of (prior ?? []) as any[]) followUpsByInvoice.set(r.invoice_id, (followUpsByInvoice.get(r.invoice_id) ?? 0) + 1);
  }

  const logs: any[] = [];
  let smsSent = 0;
  let smsFailed = 0;
  let smsSkippedNoCredit = 0;
  let pushSent = 0;
  let considered = 0;

  let webpush: any = null;

  for (const inv of ((invoices ?? []) as any[])) {
    const tenant = inv.tenants;
    if (!tenant || tenant.active === false) continue;
    const s = settingsByOwner.get(inv.owner_id) ?? DEFAULTS;
    if (!s.rent_reminders_enabled) continue;
    if (alreadySent.has(inv.id)) continue;

    const due = new Date(`${inv.due_date}T00:00:00Z`);
    const diff = Math.round((dayStart(due) - dayStart(today)) / 86400000);

    const habit = payPattern(
      (dueByTenant.get(inv.tenant_id) ?? []).filter((d) => d !== inv.due_date),
      paysByTenant.get(inv.tenant_id) ?? [],
    );
    const plan = cadenceFor(habit.pattern, { ...s, grace_days: s.grace_days ?? 0 });
    const sentAfter = followUpsByInvoice.get(inv.id) ?? 0;
    const kind = reminderToday(plan, diff, sentAfter);
    if (!kind) continue;

    // Recalculate from the full ledger right before sending: stop once fully paid.
    let arrears = Number(inv.balance_remaining) || 0;
    try {
      if (!ledgerCache.has(inv.tenant_id)) ledgerCache.set(inv.tenant_id, (await tenantBalancePosition(inv.tenant_id)).ledger.arrears);
      arrears = ledgerCache.get(inv.tenant_id)!;
    } catch { /* fall back to invoice balance */ }
    if (arrears <= 0) continue;

    considered++;
    const balance = Math.min(Number(inv.balance_remaining) || 0, arrears);
    const vars = {
      tenant_name: String(tenant.full_name ?? "there").split(" ")[0]!,
      total_balance: money(balance),
      due_date: new Date(`${inv.due_date}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      days: String(Math.abs(diff)),
      month: inv.month_year,
    };
    const tpl = kind === "before" ? s.reminder_before_template : sentAfter === 0 ? s.reminder_after_template : FIRM_FOLLOW_UP;
    const message = fill(tpl, vars).slice(0, 400);
    const subject = `Rent reminder (${kind === "before" ? `${Math.abs(diff)} days before due` : `${Math.abs(diff)} days overdue, follow-up ${sentAfter + 1}`})`;

    // SMS (charged to the landlord's SMS wallet)
    if (s.reminder_sms_enabled && tenant.phone_number) {
      const balanceAfter = await chargeSmsWallet(supabaseAdmin, {
        ownerId: inv.owner_id,
        count: 1,
        reason: "rent_reminder",
        note: subject,
      });
      if (balanceAfter === null) {
        smsSkippedNoCredit++;
        logs.push({
          owner_id: inv.owner_id,
          tenant_id: tenant.id,
          invoice_id: inv.id,
          channel: "sms",
          recipient: tenant.phone_number,
          subject,
          message,
          status: "skipped",
          error: "Not enough SMS credit",
        });
      } else {
        const res = await sendSms(tenant.phone_number, message);
        if (res.ok) smsSent++;
        else smsFailed++;
        logs.push({
          owner_id: inv.owner_id,
          tenant_id: tenant.id,
          invoice_id: inv.id,
          channel: "sms",
          recipient: tenant.phone_number,
          subject,
          message,
          status: res.ok ? "delivered" : "failed",
          error: res.error ?? null,
        });
      }
    }

    // Phone push to the tenant's portal account
    if (s.reminder_push_enabled && tenant.auth_user_id) {
      try {
        if (!webpush) {
          const { loadWebpush } = await import("./push.server");
          webpush = await loadWebpush();
          webpush.setVapidDetails(
            process.env["VAPID_SUBJECT"] || "mailto:reminders@example.com",
            process.env["VAPID_PUBLIC_KEY"]!,
            process.env["VAPID_PRIVATE_KEY"]!,
          );
        }
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth")
          .eq("owner_id", tenant.auth_user_id);
        for (const sub of ((subs ?? []) as any[])) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({
                title: kind === "before" ? "Rent due soon" : "Rent overdue",
                body: message,
                tag: `rent-reminder-${inv.id}-${todayKey}`,
                url: "/tenant/dashboard",
              }),
            );
            pushSent++;
          } catch (err: any) {
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
            }
          }
        }
        logs.push({
          owner_id: inv.owner_id,
          tenant_id: tenant.id,
          invoice_id: inv.id,
          channel: "push",
          recipient: `${(subs ?? []).length} device(s)`,
          subject,
          message,
          status: (subs ?? []).length > 0 ? "delivered" : "skipped",
        });
      } catch {
        /* push is best-effort */
      }
    }

    alreadySent.add(inv.id);
  }

  if (logs.length) await supabaseAdmin.from("notification_logs").insert(logs as never);

  return { ok: true, considered, smsSent, smsFailed, smsSkippedNoCredit, pushSent };
}
