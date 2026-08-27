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

/** Business timezone — balances must not depend on a device's clock/locale. */
const TZ = "Africa/Nairobi";

/**
 * Today's calendar date in the business timezone, as {y, m, d}. Using this
 * instead of the device's local date means a phone in another timezone (or a
 * UTC server) always counts exactly the same number of rent cycles.
 */
export function businessToday(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  return { y, m, d };
}

/** Today's date in the business timezone as YYYY-MM-DD. */
export function businessTodayIso(): string {
  const { y, m, d } = businessToday();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

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
  const iso = opts.moveInDate ? String(opts.moveInDate).slice(0, 10) : null;
  const parts = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").map(Number) : null;
  if (!rent || !parts) return 0;
  const [sy, sm, sd] = parts;
  const now = businessToday();
  let cycles = (now.y - sy) * 12 + (now.m - sm) + 1;
  const dueDay = Math.max(1, Math.min(31, opts.rentDueDay ?? sd));
  const lastDayThisMonth = new Date(Date.UTC(now.y, now.m, 0)).getUTCDate();
  if (now.d < Math.min(dueDay, lastDayThisMonth)) cycles -= 1;
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
