// Server-only helpers for tenant credit (money paid over and above everything
// invoiced). They keep a log of credit events per tenant and alert the landlord
// whenever credit appears, is used against a bill, or goes stale/expires.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToUsers, landlordAudience } from "@/lib/push.server";

/** Credit is treated as stale (expiring) after this many days of no movement. */
export const CREDIT_STALE_DAYS = 90;

export type TenantCredit = {
  tenantId: string;
  name: string;
  ownerId: string;
  invoiced: number;
  paid: number;
  arrears: number;
  adjustments: number;
  credit: number;
};

const num = (v: any) => Number(v ?? 0);

/** Rebuilds every tenant ledger for one landlord straight from the database. */
export async function computeOwnerCredits(ownerId: string): Promise<TenantCredit[]> {
  const [{ data: tenants }, { data: invoices }, { data: payments }, { data: events }] =
    await Promise.all([
      supabaseAdmin
        .from("tenants")
        .select("id, full_name, owner_id, active, move_in_date, rent_due_day, units(rent_amount)")
        .eq("owner_id", ownerId),
      supabaseAdmin.from("invoices").select("tenant_id, total_due, balance_remaining").eq("owner_id", ownerId),
      supabaseAdmin.from("payments").select("tenant_id, amount_paid").eq("owner_id", ownerId),
      supabaseAdmin.from("tenant_credit_events").select("tenant_id, delta").eq("owner_id", ownerId),
    ]);

  const accrual = new Map<string, number>();
  const rows = new Map<string, TenantCredit>();
  for (const t of (tenants ?? []) as any[]) {
    accrual.set(
      t.id,
      t.active
        ? accruedRent({
            rentAmount: t.units?.rent_amount,
            moveInDate: t.move_in_date,
            rentDueDay: t.rent_due_day,
          })
        : 0,
    );
    rows.set(t.id, {
      tenantId: t.id,
      name: t.full_name,
      ownerId,
      invoiced: 0,
      paid: 0,
      arrears: 0,
      adjustments: 0,
      credit: 0,
    });
  }
  for (const inv of (invoices ?? []) as any[]) {
    const r = rows.get(inv.tenant_id);
    if (!r) continue;
    r.invoiced += num(inv.total_due);
  }
  for (const p of (payments ?? []) as any[]) {
    const r = rows.get(p.tenant_id);
    if (r) r.paid += num(p.amount_paid);
  }
  for (const e of (events ?? []) as any[]) {
    const r = rows.get(e.tenant_id);
    if (r) r.adjustments += num(e.delta);
  }
  for (const r of rows.values()) {
    // Same shared ledger the landlord page and tenant portal use.
    const l = buildLedger({
      invoiced: r.invoiced,
      paid: r.paid,
      adjustments: r.adjustments,
      accrued: accrual.get(r.tenantId) ?? 0,
    });
    r.credit = l.credit;
    r.arrears = l.arrears;
  }
  return [...rows.values()];
}


export async function creditFor(ownerId: string, tenantId: string) {
  const all = await computeOwnerCredits(ownerId);
  return all.find((r) => r.tenantId === tenantId) ?? null;
}

/** Writes a credit event and alerts the landlord (push + notification log). */
export async function logCreditEvent(opts: {
  ownerId: string;
  tenantId: string;
  tenantName?: string | null;
  kind: "detected" | "applied" | "expired" | "adjusted" | "expiring";
  amount: number;
  delta?: number;
  note?: string | null;
  createdBy?: string | null;
  notify?: boolean;
}) {
  const { data: row } = await supabaseAdmin
    .from("tenant_credit_events")
    .insert({
      owner_id: opts.ownerId,
      tenant_id: opts.tenantId,
      kind: opts.kind,
      amount: Math.round(opts.amount),
      delta: Math.round(opts.delta ?? 0),
      note: opts.note ?? null,
      created_by: opts.createdBy ?? null,
    })
    .select("id")
    .maybeSingle();

  if (opts.notify === false) return row;

  const name = opts.tenantName ?? "A tenant";
  const money = `KES ${Math.round(opts.amount).toLocaleString()}`;
  const copy: Record<string, { title: string; body: string }> = {
    detected: { title: "Tenant credit on account", body: `${name} has ${money} extra on account. It will be deducted from their next invoice.` },
    applied: { title: "Tenant credit applied", body: `${money} of ${name}'s credit was applied to their new invoice.` },
    expired: { title: "Tenant credit written off", body: `${money} of ${name}'s credit was cleared. ${opts.note ?? ""}`.trim() },
    adjusted: { title: "Tenant credit edited", body: `${name}'s credit is now ${money}. ${opts.note ?? ""}`.trim() },
    expiring: { title: "Unused tenant credit", body: `${name} has held ${money} in credit for over ${CREDIT_STALE_DAYS} days. Review it so the account stays correct.` },
  };
  const msg = copy[opts.kind];

  try {
    const audience = await landlordAudience(opts.ownerId);
    await pushToUsers(audience, { ...msg, url: "/tenants", tag: `credit-${opts.tenantId}-${opts.kind}` });
  } catch {
    /* alerts must never block the ledger write */
  }
  await supabaseAdmin.from("notification_logs").insert({
    owner_id: opts.ownerId,
    tenant_id: opts.tenantId,
    channel: "push",
    subject: msg.title,
    message: msg.body,
    status: "sent",
  });
  return row;
}

/**
 * Compares each tenant's live credit with the last logged snapshot and records
 * (plus alerts on) anything that changed: new credit, credit that got used up,
 * and credit that has sat untouched for too long.
 */
export async function scanOwnerCredits(ownerId: string) {
  const ledgers = await computeOwnerCredits(ownerId);
  const { data: events } = await supabaseAdmin
    .from("tenant_credit_events")
    .select("tenant_id, kind, amount, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  const last = new Map<string, any>();
  for (const e of (events ?? []) as any[]) if (!last.has(e.tenant_id)) last.set(e.tenant_id, e);

  const staleBefore = Date.now() - CREDIT_STALE_DAYS * 86400000;
  let logged = 0;

  for (const l of ledgers) {
    const prev = last.get(l.tenantId);
    const prevAmount = prev ? num(prev.amount) : 0;

    if (l.credit > prevAmount) {
      await logCreditEvent({ ownerId, tenantId: l.tenantId, tenantName: l.name, kind: "detected", amount: l.credit });
      logged++;
    } else if (l.credit < prevAmount) {
      await logCreditEvent({
        ownerId,
        tenantId: l.tenantId,
        tenantName: l.name,
        kind: "applied",
        amount: prevAmount - l.credit,
        note: `Credit left: KES ${l.credit.toLocaleString()}`,
      });
      logged++;
    } else if (
      l.credit > 0 &&
      prev &&
      prev.kind !== "expiring" &&
      new Date(prev.created_at).getTime() < staleBefore
    ) {
      await logCreditEvent({ ownerId, tenantId: l.tenantId, tenantName: l.name, kind: "expiring", amount: l.credit });
      logged++;
    }
  }
  return { tenants: ledgers.length, logged };
}

/** Runs the credit watch for every landlord that has tenants. */
export async function scanAllCredits() {
  const { data: owners } = await supabaseAdmin.from("tenants").select("owner_id").eq("active", true);
  const ids = Array.from(new Set(((owners ?? []) as any[]).map((o) => o.owner_id).filter(Boolean)));
  let logged = 0;
  for (const id of ids) {
    const res = await scanOwnerCredits(id);
    logged += res.logged;
  }
  return { owners: ids.length, logged };
}
