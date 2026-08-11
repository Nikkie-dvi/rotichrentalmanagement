# Overdue warning badges on the tenant list

Today each tenant card shows only "Arrears" or "Clear" based on the sum of unpaid invoice balances. That doesn't tell you *how late* someone is. This adds an at-a-glance risk badge.

## What changes

On the Tenants page, each active tenant card gets a risk badge instead of the plain Arrears/Clear chip:

- **Clear** (green) — nothing owed.
- **Due soon** (amber) — owes money but only for the current month, due date not yet passed.
- **Overdue** (red, with a warning triangle icon) — owes money past the due date, labelled with how late they are, e.g. "Overdue 12 days".
- **High risk** (red, pulsing) — unpaid balance covering two or more past months.

Cards with an overdue or high-risk badge also get a subtle red left border and are sorted to the top of the list, so problem accounts appear first.

A small summary line above the list shows how many tenants are overdue and the total amount at risk.

## How "overdue" is decided

Uses invoice data already loaded on the page:

- Group unpaid invoice balances per tenant by `month_year`.
- Oldest unpaid month + the tenant's `rent_due_day` (fallback: move-in day, then day 1) gives the due date.
- Days late = today minus that due date. Two or more unpaid months = high risk.

## Technical notes

- `src/routes/_authenticated/tenants.tsx` only: extend the `tenant-balances` query to also select `month_year`, and build a per-tenant `{ total, oldestUnpaidMonth, monthsUnpaid, daysLate }` map.
- Add a small local `RiskBadge` component in the same file; colours via existing semantic/destructive tokens.
- Date math is done in a `useMemo` after mount to avoid SSR/client date mismatches.
- No database, RLS or query-permission changes.
