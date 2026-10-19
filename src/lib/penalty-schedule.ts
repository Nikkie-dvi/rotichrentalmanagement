/** Business dates use Nairobi, independently of the server's clock timezone. */
export function penaltyToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function penaltyStartDate(due: string, graceDays: number, startDay?: number | null) {
  const date = new Date(`${due}T00:00:00Z`);
  if (startDay == null) {
    date.setUTCDate(date.getUTCDate() + Math.max(0, graceDays) + 1);
    return date.toISOString().slice(0, 10);
  }
  const day = Math.min(31, Math.max(1, startDay));
  const candidate = (year: number, month: number) => new Date(Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
  let start = candidate(date.getUTCFullYear(), date.getUTCMonth());
  if (start <= date) start = candidate(date.getUTCFullYear(), date.getUTCMonth() + 1);
  return start.toISOString().slice(0, 10);
}

export function penaltyDaysLate(today: string, start: string) {
  return Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1);
}