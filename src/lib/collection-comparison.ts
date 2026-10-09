import { businessTodayIso } from "@/lib/ledger";

type Payment = { amount_paid: number | string; payment_date: string; tenant_id?: string };
const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
export function comparisonPeriod(month = businessTodayIso().slice(0, 7), today = businessTodayIso()) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1, 0));
  const previousMonth = key(last.getUTCFullYear(), last.getUTCMonth() + 1);
  const currentMonth = today.slice(0, 7) === month;
  const day = currentMonth ? Number(today.slice(8, 10)) : new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { month, previousMonth, currentMonth, start: `${previousMonth}-01`,
    end: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
    cutoff: `${month}-${String(day).padStart(2, "0")}`,
    previousCutoff: `${previousMonth}-${String(currentMonth ? Math.min(day, last.getUTCDate()) : last.getUTCDate()).padStart(2, "0")}` };
}
export function compareCollections(payments: Payment[], month?: string, today?: string) {
  const period = comparisonPeriod(month, today);
  const current = payments.filter(p => p.payment_date >= `${period.month}-01` && p.payment_date.slice(0, 10) <= period.cutoff);
  const previous = payments.filter(p => p.payment_date >= period.start && p.payment_date.slice(0, 10) <= period.previousCutoff);
  const sum = (rows: Payment[]) => rows.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
  const collected = sum(current), previousCollected = sum(previous);
  return { ...period, collected, previousCollected, difference: collected - previousCollected,
    currentCount: current.length, previousCount: previous.length,
    percentChange: previousCollected > 0 ? Math.round((collected - previousCollected) / previousCollected * 100) : null };
}