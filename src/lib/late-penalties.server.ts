// Late-payment penalty engine: finds overdue invoices past their grace period,
// appends a penalty line item, and alerts the tenant by SMS + push.
// Server-only — never import this from a component.
import { sendSms } from "./sms.server";
import { chargeSmsWallet } from "./sms-wallet.server";
import { penaltyDaysLate, penaltyStartDate, penaltyToday } from "./penalty-schedule";

type Settings = {
  owner_id: string;
  default_due_day: number;
  grace_days: number;
  penalty_type: string;
  penalty_value: number;
  penalty_max: number | null;
  auto_penalties_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  sms_template: string;
  email_subject: string;
  email_template: string;
};

const DEFAULTS: Omit<Settings, "owner_id"> = {
  default_due_day: 5,
  grace_days: 5,
  penalty_type: "fixed",
  penalty_value: 500,
  penalty_max: null,
  auto_penalties_enabled: true,
  sms_enabled: true,
  email_enabled: true,
  sms_template:
    "Hi {tenant_name}, a late fee of {penalty_amount} has been added to your rent. Your updated balance is {total_balance}, due by {due_date}.",
  email_subject: "Late payment fee added to your rent",
  email_template:
    "Hi {tenant_name}, a late fee of {penalty_amount} has been added to your invoice for {month}. Your updated total balance is {total_balance}, due by {due_date}.",
};

const money = (n: number) => `KES ${Math.round(n).toLocaleString("en-US")}`;

export function fillTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

/** Due date for an invoice: explicit column, else month + the landlord's default due day. */
export function invoiceDueDate(monthYear: string, dueDay: number, explicit?: string | null) {
  if (explicit) return explicit;
  const [y, m] = monthYear.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(dueDay || 1, 1), last);
  return `${monthYear}-${String(day).padStart(2, "0")}`;
}

export function computePenalty(s: Pick<Settings, "penalty_type" | "penalty_value" | "penalty_max">, balance: number, daysLate: number) {
  const raw =
    s.penalty_type === "percent_daily"
      ? (balance * Number(s.penalty_value)) / 100 * Math.max(1, daysLate)
      : s.penalty_type === "percent"
        ? (balance * Number(s.penalty_value)) / 100
        : Number(s.penalty_value);
  const capped = s.penalty_max ? Math.min(raw, Number(s.penalty_max)) : raw;
  return Math.max(0, Math.round(capped));
}

export async function runLatePenalties(opts: { ownerId?: string; today?: string } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = opts.today ?? penaltyToday();

  let settingsQuery = supabaseAdmin.from("billing_settings").select("*");
  if (opts.ownerId) settingsQuery = settingsQuery.eq("owner_id", opts.ownerId);
  const { data: settingsRows } = await settingsQuery;

  const settingsFor = new Map<string, Settings>();
  for (const r of (settingsRows ?? []) as any[]) settingsFor.set(r.owner_id, r as Settings);

  let invoiceQuery = supabaseAdmin
    .from("invoices")
    .select("id, owner_id, tenant_id, month_year, due_date, total_due, balance_remaining, late_penalty_amount, penalty_applied_at, penalty_waived, tenants(units(properties(penalty_start_day)))")
    .gt("balance_remaining", 0)
    .eq("penalty_waived", false)
    .is("penalty_applied_at", null);
  if (opts.ownerId) invoiceQuery = invoiceQuery.eq("owner_id", opts.ownerId);
  const { data: invoices, error } = await invoiceQuery;
  if (error) throw new Error(error.message);

  let applied = 0;
  let notified = 0;

  for (const inv of (invoices ?? []) as any[]) {
    const s: Settings = settingsFor.get(inv.owner_id) ?? { owner_id: inv.owner_id, ...DEFAULTS };
    if (!s.auto_penalties_enabled) continue;

    const due = invoiceDueDate(inv.month_year, s.default_due_day, inv.due_date);
    const startDay = inv.tenants?.units?.properties?.penalty_start_day ?? null;
    const start = penaltyStartDate(due, Number(s.grace_days || 0), startDay);
    const daysLate = penaltyDaysLate(today, start);
    if (daysLate === 0) continue;
    const balance = Number(inv.balance_remaining);
    const penalty = computePenalty(s, balance, daysLate);
    if (penalty <= 0) continue;

    const newTotal = Number(inv.total_due) + penalty;
    const newBalance = balance + penalty;

    const { error: upErr } = await supabaseAdmin
      .from("invoices")
      .update({
        late_penalty_amount: Number(inv.late_penalty_amount ?? 0) + penalty,
        total_due: newTotal,
        balance_remaining: newBalance,
        due_date: due,
        penalty_applied_at: new Date().toISOString(),
        status: "unpaid",
      })
      .eq("id", inv.id);
    if (upErr) continue;

    await supabaseAdmin.from("invoice_line_items").insert({
      invoice_id: inv.id,
      owner_id: inv.owner_id,
      category: "Late payment fee",
      amount: penalty,
      kind: "penalty",
      description: `${daysLate} day(s) since penalty start ${start} (due ${due})`,
    });
    applied++;

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id, full_name, phone_number, email, auth_user_id")
      .eq("id", inv.tenant_id)
      .maybeSingle();
    if (!tenant) continue;

    const vars = {
      tenant_name: (tenant as any).full_name?.split(" ")[0] ?? "there",
      penalty_amount: money(penalty),
      total_balance: money(newBalance),
      due_date: due,
      month: inv.month_year,
    };

    const { invoiceBreakdown } = await import("./invoice-breakdown.server");
    const bd = await invoiceBreakdown(supabaseAdmin, inv.id);
    const detail = bd?.text ? ` Breakdown: ${bd.text}.` : "";
    const smsBody = `${fillTemplate(s.sms_template, vars)}${detail}`;
    const emailBody = `${fillTemplate(s.email_template, vars)}${detail}`;

    const logs: any[] = [];

    if (s.sms_enabled && (tenant as any).phone_number) {
      const walletBalance = await chargeSmsWallet(supabaseAdmin, {
        ownerId: inv.owner_id,
        count: 1,
        reason: "late_penalty",
        note: `Late payment fee ${inv.month_year}`,
      });
      const res = walletBalance === null
        ? { ok: false, status: "skipped", error: "Not enough SMS credit" }
        : await sendSms((tenant as any).phone_number, smsBody);
      logs.push({
        owner_id: inv.owner_id,
        tenant_id: tenant.id,
        invoice_id: inv.id,
        channel: "sms",
        recipient: (tenant as any).phone_number ?? null,
        message: smsBody,
        status: res.ok ? "delivered" : "failed",
        error: res.error ?? null,
      });
      if (res.ok) notified++;
    }

    if (s.email_enabled) {
      logs.push({
        owner_id: inv.owner_id,
        tenant_id: tenant.id,
        invoice_id: inv.id,
        channel: "email",
        recipient: (tenant as any).email ?? null,
        subject: s.email_subject,
        message: emailBody,
        status: "skipped",
        error: "No verified sender domain configured yet",
      });
    }

    // Phone push notification for tenants with the app installed.
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
              JSON.stringify({ title: "Late payment fee added", body: smsBody, url: "/tenant/dashboard" }),
            );
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
          message: smsBody,
          status: (subs ?? []).length > 0 ? "delivered" : "skipped",
        });
      } catch {
        /* push is best-effort */
      }
    }

    if (logs.length) await supabaseAdmin.from("notification_logs").insert(logs);
  }

  return { ok: true, applied, notified };
}
