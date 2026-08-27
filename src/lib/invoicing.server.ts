// Bulk invoicing that respects each tenant's real rent due day and any money
// they have already paid ahead, plus a cleanup pass that removes invoices that
// should never have existed (future months, before move-in, zero-value, or
// raised for a due day that has not arrived yet). Together these keep the
// arrears list honest: a tenant who is paid up never shows as owing.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { businessTodayIso } from "@/lib/ledger";

const num = (v: any) => Number(v ?? 0) || 0;

const lastDayOf = (y: number, m: number) => new Date(y, m, 0).getDate();

/** The calendar date rent falls due for a tenant in a given YYYY-MM month. */
export function dueDateFor(month: string, tenant: { rent_due_day?: number | null; move_in_date?: string | null }) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return null;
  const moveIn = tenant.move_in_date ? new Date(tenant.move_in_date) : null;
  const fallback = moveIn && !Number.isNaN(moveIn.getTime()) ? moveIn.getDate() : 1;
  const day = Math.max(1, Math.min(31, tenant.rent_due_day ?? fallback));
  return `${month}-${String(Math.min(day, lastDayOf(y, m))).padStart(2, "0")}`;
}

// Same calendar day everyone in the business sees, regardless of server clock.
const todayIso = () => businessTodayIso();

type Tenant = {
  id: string;
  full_name: string | null;
  owner_id: string;
  active: boolean;
  unit_id: string | null;
  move_in_date: string | null;
  move_out_date: string | null;
  rent_due_day: number | null;
  units?: { rent_amount?: any } | null;
};

async function loadOwnerData(ownerId: string) {
  const [{ data: tenants }, { data: invoices }, { data: payments }, { data: events }] = await Promise.all([
    supabaseAdmin
      .from("tenants")
      .select("id, full_name, owner_id, active, unit_id, move_in_date, move_out_date, rent_due_day, units(rent_amount)")
      .eq("owner_id", ownerId),
    supabaseAdmin
      .from("invoices")
      .select("id, tenant_id, month_year, total_due, balance_remaining, due_date, status")
      .eq("owner_id", ownerId),
    supabaseAdmin.from("payments").select("tenant_id, invoice_id, amount_paid").eq("owner_id", ownerId),
    supabaseAdmin.from("tenant_credit_events").select("tenant_id, delta").eq("owner_id", ownerId),
  ]);
  return {
    tenants: (tenants ?? []) as unknown as Tenant[],
    invoices: (invoices ?? []) as any[],
    payments: (payments ?? []) as any[],
    events: (events ?? []) as any[],
  };
}

/**
 * Generates invoices for one month, only for tenants whose due day has actually
 * arrived, and offsets each new invoice against money already paid ahead.
 */
export async function generateMonthlyInvoices(ownerId: string, month: string) {
  const { tenants, invoices, payments, events } = await loadOwnerData(ownerId);
  const today = todayIso();

  const paidByTenant = new Map<string, number>();
  for (const p of payments) paidByTenant.set(p.tenant_id, (paidByTenant.get(p.tenant_id) ?? 0) + num(p.amount_paid));
  const adjByTenant = new Map<string, number>();
  for (const e of events) adjByTenant.set(e.tenant_id, (adjByTenant.get(e.tenant_id) ?? 0) + num(e.delta));
  const otherInvoiced = new Map<string, number>();
  for (const i of invoices) {
    if (i.month_year === month) continue;
    otherInvoiced.set(i.tenant_id, (otherInvoiced.get(i.tenant_id) ?? 0) + num(i.total_due));
  }

  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  let created = 0;
  let creditApplied = 0;
  const waiting: { tenantName: string; dueDate: string }[] = [];
  const skipped: string[] = [];

  for (const t of tenants) {
    const rent = num(t.units?.rent_amount);
    if (!t.active || !t.unit_id || rent <= 0) {
      skipped.push(t.full_name ?? "Tenant");
      continue;
    }
    const due = dueDateFor(month, t);
    if (!due) continue;

    // Nothing before the tenant moved in, and nothing after they moved out.
    if (t.move_in_date && due < t.move_in_date.slice(0, 10)) {
      skipped.push(t.full_name ?? "Tenant");
      continue;
    }
    if (t.move_out_date && due > t.move_out_date.slice(0, 10)) {
      skipped.push(t.full_name ?? "Tenant");
      continue;
    }
    // The due day has not arrived yet — the daily job will raise it on the day.
    if (due > today) {
      waiting.push({ tenantName: t.full_name ?? "Tenant", dueDate: due });
      continue;
    }

    const { data: readings } = await supabaseAdmin
      .from("utility_readings")
      .select("total_amount")
      .eq("tenant_id", t.id)
      .gte("reading_date", start)
      .lt("reading_date", end);
    const util = (readings ?? []).reduce((s: number, r: any) => s + num(r.total_amount), 0);
    const total = rent + util;

    // Money already paid ahead, ignoring this month's own invoice.
    const credit = Math.max(
      0,
      (paidByTenant.get(t.id) ?? 0) + (adjByTenant.get(t.id) ?? 0) - (otherInvoiced.get(t.id) ?? 0),
    );
    const applied = Math.min(credit, total);
    const balance = Math.max(0, total - applied);

    const { error } = await supabaseAdmin.from("invoices").upsert(
      {
        tenant_id: t.id,
        owner_id: ownerId,
        month_year: month,
        base_rent: rent,
        utility_amount: util,
        total_due: total,
        balance_remaining: balance,
        due_date: due,
        status: balance === 0 ? "paid" : balance < total ? "partial" : "unpaid",
      },
      { onConflict: "tenant_id,month_year" },
    );
    if (error) throw new Error(error.message);
    created++;

    if (applied > 0) {
      creditApplied += applied;
      try {
        const { logCreditEvent } = await import("@/lib/credit.server");
        await logCreditEvent({
          ownerId,
          tenantId: t.id,
          tenantName: t.full_name,
          kind: "applied",
          amount: Math.round(applied),
          note: `Applied to ${month} invoice`,
        });
      } catch {
        /* alerts must never block invoicing */
      }
    }
  }

  return {
    month,
    created,
    creditApplied: Math.round(creditApplied),
    waiting,
    skipped: skipped.length,
  };
}

export type BadInvoice = {
  id: string;
  tenantName: string;
  month: string;
  amount: number;
  reason: string;
};

/**
 * Finds invoices that should not be counted as arrears: raised for a month the
 * tenant had not moved in yet, for a due day that has not arrived, for a future
 * month, after move-out, or with no value at all. Only invoices with no payments
 * recorded against them are ever listed.
 */
export async function findIncorrectInvoices(ownerId: string): Promise<BadInvoice[]> {
  const { tenants, invoices, payments } = await loadOwnerData(ownerId);
  const today = todayIso();
  const thisMonth = today.slice(0, 7);
  const byId = new Map(tenants.map((t) => [t.id, t]));
  const paidOn = new Set(payments.filter((p) => p.invoice_id).map((p) => p.invoice_id as string));

  const bad: BadInvoice[] = [];
  for (const inv of invoices) {
    if (paidOn.has(inv.id)) continue;
    const t = byId.get(inv.tenant_id);
    const name = t?.full_name ?? "Tenant";
    const amount = Math.round(num(inv.total_due));
    const due = inv.due_date ? String(inv.due_date).slice(0, 10) : t ? dueDateFor(inv.month_year, t) : null;

    if (!t) {
      bad.push({ id: inv.id, tenantName: name, month: inv.month_year, amount, reason: "Tenant no longer exists" });
      continue;
    }
    if (num(inv.total_due) <= 0) {
      bad.push({ id: inv.id, tenantName: name, month: inv.month_year, amount, reason: "Invoice has no charges" });
      continue;
    }
    if (inv.month_year > thisMonth) {
      bad.push({ id: inv.id, tenantName: name, month: inv.month_year, amount, reason: "Billed for a future month" });
      continue;
    }
    if (t.move_in_date && due && due < String(t.move_in_date).slice(0, 10)) {
      bad.push({ id: inv.id, tenantName: name, month: inv.month_year, amount, reason: "Before the tenant moved in" });
      continue;
    }
    if (t.move_out_date && due && due > String(t.move_out_date).slice(0, 10)) {
      bad.push({ id: inv.id, tenantName: name, month: inv.month_year, amount, reason: "After the tenant moved out" });
      continue;
    }
    // Note: an invoice raised before its due day is NOT "incorrect" — it simply
    // counts as arrears from the moment it exists. Deleting those was the cause
    // of invoices disappearing from the arrears list.

  }
  return bad;
}

/** Removes the listed invoices (and their charge lines), keeping payment history. */
export async function removeInvoices(ownerId: string, ids: string[]) {
  if (!ids.length) return { removed: 0 };
  await supabaseAdmin.from("payments").update({ invoice_id: null }).in("invoice_id", ids).eq("owner_id", ownerId);
  await supabaseAdmin.from("invoice_line_items").delete().in("invoice_id", ids).eq("owner_id", ownerId);
  const { error, count } = await supabaseAdmin
    .from("invoices")
    .delete({ count: "exact" })
    .in("id", ids)
    .eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  return { removed: count ?? ids.length };
}

/**
 * Recomputes balance_remaining and status on every open invoice from the real
 * payments and credit edits, oldest invoice first, so paid-up tenants stop
 * showing in arrears.
 */
export async function reconcileInvoiceBalances(ownerId: string) {
  const { tenants, invoices, payments, events } = await loadOwnerData(ownerId);
  const paidByTenant = new Map<string, number>();
  for (const p of payments) paidByTenant.set(p.tenant_id, (paidByTenant.get(p.tenant_id) ?? 0) + num(p.amount_paid));
  const adjByTenant = new Map<string, number>();
  for (const e of events) adjByTenant.set(e.tenant_id, (adjByTenant.get(e.tenant_id) ?? 0) + num(e.delta));

  const byTenant = new Map<string, any[]>();
  for (const inv of invoices) {
    const arr = byTenant.get(inv.tenant_id) ?? [];
    arr.push(inv);
    byTenant.set(inv.tenant_id, arr);
  }

  let fixed = 0;
  for (const t of tenants) {
    const list = (byTenant.get(t.id) ?? []).sort((a, b) => String(a.month_year).localeCompare(String(b.month_year)));
    let pot = (paidByTenant.get(t.id) ?? 0) + (adjByTenant.get(t.id) ?? 0);
    for (const inv of list) {
      const total = num(inv.total_due);
      const applied = Math.max(0, Math.min(pot, total));
      pot -= applied;
      const balance = Math.round(total - applied);
      const status = balance <= 0 ? "paid" : balance < total ? "partial" : "unpaid";
      if (Math.abs(balance - num(inv.balance_remaining)) > 0.5 || status !== inv.status) {
        const { error } = await supabaseAdmin
          .from("invoices")
          .update({ balance_remaining: Math.max(0, balance), status })
          .eq("id", inv.id)
          .eq("owner_id", ownerId);
        if (!error) fixed++;
      }
    }
  }
  return { fixed };
}
