// Cross-checks that every tenant's money position is identical everywhere in
// the system: the tenant portal balance, the landlord Tenants page ledger and
// the raw invoice balances in the database. Any mismatch is reported so the
// landlord can fix the account before it silently skews next month's rent.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { landlordPush } from "@/lib/push.server";
import { accruedRent, buildLedger } from "@/lib/ledger";

const num = (v: any) => Number(v ?? 0);

export type LedgerIssue = {
  tenantId: string;
  tenantName: string;
  code:
    | "invoice_balance_mismatch"
    | "credit_with_arrears"
    | "overpaid_invoice"
    | "negative_balance"
    | "no_unit"
    | "uninvoiced_rent";
  message: string;
  expected: number;
  actual: number;
  difference: number;
};

export type LedgerAuditResult = {
  ownerId: string;
  tenants: number;
  checked: number;
  issues: LedgerIssue[];
  totals: { arrears: number; credit: number; uninvoiced: number };
  checkedAt: string;
};

/** Recomputes and cross-checks every tenant ledger for one landlord. */
export async function auditOwnerLedgers(ownerId: string): Promise<LedgerAuditResult> {
  const [{ data: tenants }, { data: invoices }, { data: payments }, { data: events }] = await Promise.all([
    supabaseAdmin
      .from("tenants")
      .select("id, full_name, active, unit_id, move_in_date, rent_due_day, units(rent_amount)")
      .eq("owner_id", ownerId),
    supabaseAdmin
      .from("invoices")
      .select("id, tenant_id, total_due, balance_remaining, month_year")
      .eq("owner_id", ownerId),
    supabaseAdmin.from("payments").select("tenant_id, invoice_id, amount_paid").eq("owner_id", ownerId),
    supabaseAdmin.from("tenant_credit_events").select("tenant_id, delta").eq("owner_id", ownerId),
  ]);

  const invByTenant = new Map<string, any[]>();
  for (const inv of (invoices ?? []) as any[]) {
    const arr = invByTenant.get(inv.tenant_id) ?? [];
    arr.push(inv);
    invByTenant.set(inv.tenant_id, arr);
  }
  const paidByTenant = new Map<string, number>();
  for (const p of (payments ?? []) as any[]) {
    paidByTenant.set(p.tenant_id, (paidByTenant.get(p.tenant_id) ?? 0) + num(p.amount_paid));
  }
  const adjByTenant = new Map<string, number>();
  for (const e of (events ?? []) as any[]) {
    adjByTenant.set(e.tenant_id, (adjByTenant.get(e.tenant_id) ?? 0) + num(e.delta));
  }

  const issues: LedgerIssue[] = [];
  const totals = { arrears: 0, credit: 0, uninvoiced: 0 };
  let checked = 0;

  for (const t of (tenants ?? []) as any[]) {
    const list = invByTenant.get(t.id) ?? [];
    const invoiced = list.reduce((s, i) => s + num(i.total_due), 0);
    const outstanding = list.reduce((s, i) => s + Math.max(0, num(i.balance_remaining)), 0);
    const paid = paidByTenant.get(t.id) ?? 0;
    const adjustments = adjByTenant.get(t.id) ?? 0;
    const accrued = t.active
      ? accruedRent({ rentAmount: t.units?.rent_amount, moveInDate: t.move_in_date, rentDueDay: t.rent_due_day })
      : 0;

    // Identical helper to the tenant portal and the landlord Tenants page.
    const ledger = buildLedger({ invoiced, paid, adjustments, accrued });
    checked++;
    totals.arrears += ledger.arrears;
    totals.credit += ledger.credit;
    totals.uninvoiced += ledger.uninvoiced;

    const name = t.full_name ?? "Tenant";

    // 1. Invoice balances must agree with invoiced - payments - credit edits.
    const expectedOutstanding = Math.max(0, invoiced - paid - adjustments);
    if (Math.abs(expectedOutstanding - outstanding) > 1) {
      issues.push({
        tenantId: t.id,
        tenantName: name,
        code: "invoice_balance_mismatch",
        message: `Invoice balances say ${Math.round(outstanding)} but payments and credit edits work out to ${Math.round(expectedOutstanding)}.`,
        expected: Math.round(expectedOutstanding),
        actual: Math.round(outstanding),
        difference: Math.round(outstanding - expectedOutstanding),
      });
    }

    // 2. Credit sitting on the account while invoices are still unpaid.
    if (ledger.credit > 1 && outstanding > 1) {
      issues.push({
        tenantId: t.id,
        tenantName: name,
        code: "credit_with_arrears",
        message: `${name} holds ${Math.round(ledger.credit)} in credit while ${Math.round(outstanding)} is still unpaid. Apply the credit so both pages match.`,
        expected: 0,
        actual: Math.round(ledger.credit),
        difference: Math.round(Math.min(ledger.credit, outstanding)),
      });
    }

    // 3. Any invoice paid past its own total, or with a negative balance.
    for (const inv of list) {
      if (num(inv.balance_remaining) < 0) {
        issues.push({
          tenantId: t.id,
          tenantName: name,
          code: "negative_balance",
          message: `Invoice ${inv.month_year} has a negative balance of ${Math.round(num(inv.balance_remaining))}.`,
          expected: 0,
          actual: Math.round(num(inv.balance_remaining)),
          difference: Math.round(num(inv.balance_remaining)),
        });
      } else if (num(inv.balance_remaining) > num(inv.total_due) + 1) {
        issues.push({
          tenantId: t.id,
          tenantName: name,
          code: "overpaid_invoice",
          message: `Invoice ${inv.month_year} owes more than it charges (${Math.round(num(inv.balance_remaining))} of ${Math.round(num(inv.total_due))}).`,
          expected: Math.round(num(inv.total_due)),
          actual: Math.round(num(inv.balance_remaining)),
          difference: Math.round(num(inv.balance_remaining) - num(inv.total_due)),
        });
      }
    }

    // 4. Rent that has fallen due but was never invoiced hides real arrears.
    if (ledger.uninvoiced > 1) {
      issues.push({
        tenantId: t.id,
        tenantName: name,
        code: "uninvoiced_rent",
        message: `${Math.round(ledger.uninvoiced)} of rent has fallen due for ${name} but has no invoice yet.`,
        expected: Math.round(ledger.accrued),
        actual: Math.round(ledger.invoiced),
        difference: Math.round(ledger.uninvoiced),
      });
    }

    // 5. Active tenant with no unit cannot accrue rent correctly.
    if (t.active && !t.unit_id) {
      issues.push({
        tenantId: t.id,
        tenantName: name,
        code: "no_unit",
        message: `${name} is active but not linked to any unit, so their rent cannot be tracked.`,
        expected: 1,
        actual: 0,
        difference: 1,
      });
    }
  }

  return {
    ownerId,
    tenants: (tenants ?? []).length,
    checked,
    issues,
    totals: {
      arrears: Math.round(totals.arrears),
      credit: Math.round(totals.credit),
      uninvoiced: Math.round(totals.uninvoiced),
    },
    checkedAt: new Date().toISOString(),
  };
}

/** Alerts the landlord (push + alert log) when the check finds problems. */
export async function notifyLedgerIssues(res: LedgerAuditResult) {
  if (res.issues.length === 0) return { notified: 0 };
  const names = Array.from(new Set(res.issues.map((i) => i.tenantName))).slice(0, 3);
  const title = "Tenant balances need a look";
  const body = `${res.issues.length} balance ${res.issues.length === 1 ? "problem" : "problems"} found (${names.join(", ")}${
    res.issues.length > names.length ? " and more" : ""
  }). Open Tenants to review.`;

  try {
    await landlordPush("other", res.ownerId, { title, body, url: "/tenants", tag: "ledger-audit" });
  } catch {
    /* alerts must never block the audit */
  }
  await supabaseAdmin.from("notification_logs").insert({
    owner_id: res.ownerId,
    channel: "push",
    subject: title,
    message: body,
    status: "sent",
  });
  return { notified: res.issues.length };
}

/**
 * Clears "rent due but not invoiced" for a landlord's tenants by moving the
 * rent start date forward to the point the invoices actually cover, so the
 * ledger stops counting rent that was never billed. Nothing already invoiced,
 * paid or credited is touched.
 */
export async function clearUninvoicedRent(ownerId: string, tenantIds?: string[]) {
  const { data: tenants } = await supabaseAdmin
    .from("tenants")
    .select("id, full_name, active, move_in_date, rent_due_day, units(rent_amount)")
    .eq("owner_id", ownerId);

  const { data: invoices } = await supabaseAdmin
    .from("invoices")
    .select("tenant_id, total_due")
    .eq("owner_id", ownerId);

  const invoicedByTenant = new Map<string, number>();
  for (const inv of (invoices ?? []) as any[]) {
    invoicedByTenant.set(inv.tenant_id, (invoicedByTenant.get(inv.tenant_id) ?? 0) + num(inv.total_due));
  }

  const now = new Date();
  const cleared: { tenantId: string; tenantName: string; amount: number; moveInDate: string }[] = [];

  for (const t of (tenants ?? []) as any[]) {
    if (tenantIds?.length && !tenantIds.includes(t.id)) continue;
    if (!t.active || !t.move_in_date) continue;
    const rent = num(t.units?.rent_amount);
    if (rent <= 0) continue;

    const invoiced = invoicedByTenant.get(t.id) ?? 0;
    const accrued = accruedRent({
      rentAmount: rent,
      moveInDate: t.move_in_date,
      rentDueDay: t.rent_due_day,
    });
    const uninvoiced = accrued - invoiced;
    if (uninvoiced <= 1) continue;

    // How many rent cycles the invoices actually cover.
    const target = Math.floor(invoiced / rent);
    const start = new Date(t.move_in_date);
    const dueDay = Math.max(1, Math.min(31, t.rent_due_day ?? start.getDate()));
    const lastDayThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const beforeDue = now.getDate() < Math.min(dueDay, lastDayThisMonth);

    // accrued cycles = monthsBetween + 1 - (beforeDue ? 1 : 0) → solve for months.
    const monthsBack = target <= 0 ? (beforeDue ? 0 : -1) : target - 1 + (beforeDue ? 1 : 0);
    const target_month = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const lastDay = new Date(target_month.getFullYear(), target_month.getMonth() + 1, 0).getDate();
    const newStart = new Date(
      Date.UTC(target_month.getFullYear(), target_month.getMonth(), Math.min(dueDay, lastDay)),
    );
    const iso = newStart.toISOString().slice(0, 10);

    await supabaseAdmin.from("tenants").update({ move_in_date: iso }).eq("id", t.id).eq("owner_id", ownerId);
    cleared.push({
      tenantId: t.id,
      tenantName: t.full_name ?? "Tenant",
      amount: Math.round(uninvoiced),
      moveInDate: iso,
    });
  }

  if (cleared.length) {
    const total = cleared.reduce((s, c) => s + c.amount, 0);
    await supabaseAdmin.from("notification_logs").insert({
      owner_id: ownerId,
      channel: "push",
      subject: "Uninvoiced rent cleared",
      message: `Cleared ${Math.round(total)} of rent that had fallen due without an invoice for ${cleared.length} tenant${
        cleared.length === 1 ? "" : "s"
      }.`,
      status: "sent",
    });
  }

  return { cleared: cleared.length, total: cleared.reduce((s, c) => s + c.amount, 0), details: cleared };
}

/** Runs the balance check for every landlord that has tenants. */

export async function auditAllLedgers() {
  const { data: owners } = await supabaseAdmin.from("tenants").select("owner_id").eq("active", true);
  const ids = Array.from(new Set(((owners ?? []) as any[]).map((o) => o.owner_id).filter(Boolean)));
  let issues = 0;
  for (const id of ids) {
    const res = await auditOwnerLedgers(id);
    issues += res.issues.length;
    await notifyLedgerIssues(res);
  }
  return { owners: ids.length, issues };
}
