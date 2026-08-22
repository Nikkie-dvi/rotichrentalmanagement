// One single source of truth for a tenant's money position, shared by the
// landlord Tenants page, the tenant portal and the server-side credit watch.
// Both sides MUST use this so the credit/arrears a landlord sees is exactly
// the balance the tenant sees on their portal.

export type LedgerInput = {
  /** Sum of total_due on every invoice issued to the tenant. */
  invoiced: number;
  /** Sum of every payment recorded for the tenant. */
  paid: number;
  /** Sum of delta on tenant_credit_events (landlord credit edits). */
  adjustments?: number;
  /** Rent that has fallen due since move-in, even if not yet invoiced. */
  accrued?: number;
};

export type Ledger = {
  invoiced: number;
  paid: number;
  adjustments: number;
  accrued: number;
  /** What the tenant actually owes to date (invoiced or accrued, whichever is higher). */
  owed: number;
  /** Rent that has fallen due but has no invoice yet. */
  uninvoiced: number;
  /** Money still owed. */
  arrears: number;
  /** Money paid ahead. */
  credit: number;
  /** Positive = paid ahead, negative = owing. Identical on both portals. */
  net: number;
};

const n = (v: any) => Number(v ?? 0);

/**
 * Rent that has fallen due since move-in, counting each anniversary of the
 * rent due day (the same rule the tenant portal has always used).
 */
export function accruedRent(opts: {
  rentAmount: any;
  moveInDate?: string | null;
  rentDueDay?: number | null;
}): number {
  const rent = n(opts.rentAmount);
  const start = opts.moveInDate ? new Date(opts.moveInDate) : null;
  if (!rent || !start || Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  let cycles =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
  const dueDay = Math.max(1, Math.min(31, opts.rentDueDay ?? start.getDate()));
  const lastDayThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() < Math.min(dueDay, lastDayThisMonth)) cycles -= 1;
  return Math.max(0, cycles) * rent;
}

export function buildLedger(input: LedgerInput): Ledger {
  const invoiced = Math.round(n(input.invoiced));
  const paid = Math.round(n(input.paid));
  const adjustments = Math.round(n(input.adjustments));
  const accrued = Math.round(n(input.accrued));
  const owed = Math.max(invoiced, accrued);
  const net = paid + adjustments - owed;
  return {
    invoiced,
    paid,
    adjustments,
    accrued,
    owed,
    uninvoiced: Math.max(0, accrued - invoiced),
    arrears: Math.max(0, -net),
    credit: Math.max(0, net),
    net,
  };
}
