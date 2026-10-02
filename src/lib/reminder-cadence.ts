// Shared, browser-safe logic: how often to remind a tenant based on their payment habits.
export type PayPattern = "early" | "on_time" | "sometimes_late" | "often_late" | "new";

export type CadencePlan = {
  pattern: PayPattern;
  avgDaysLate: number | null;
  beforeDays: number[]; // days before due to remind
  firstAfter: number; // first follow-up, days after due (after grace)
  repeatEvery: number; // days between later follow-ups (0 = no repeats)
  maxFollowUps: number;
};

const DAY = 86400000;
const toDay = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);

/** Average days late across past invoices, using each invoice's first payment near its due date. */
export function payPattern(
  pastDueDates: string[],
  paymentDates: string[],
): { pattern: PayPattern; avgDaysLate: number | null } {
  const dues = [...pastDueDates].sort().slice(-6);
  if (dues.length < 2) return { pattern: "new", avgDaysLate: null };
  const pays = paymentDates.map(toDay).sort((a, b) => a - b);
  const lates = dues.map((d) => {
    const due = toDay(d);
    const p = pays.find((x) => x >= due - 20 * DAY);
    return p === undefined ? 30 : Math.min(30, Math.round((p - due) / DAY));
  });
  const avg = lates.reduce((a, b) => a + b, 0) / lates.length;
  const pattern: PayPattern = avg <= -2 ? "early" : avg <= 1 ? "on_time" : avg <= 7 ? "sometimes_late" : "often_late";
  return { pattern, avgDaysLate: Math.round(avg * 10) / 10 };
}

export function cadenceFor(
  pattern: PayPattern,
  s: { reminder_days_before: number; reminder_days_after: number; grace_days: number },
): CadencePlan {
  const before = Math.max(0, Number(s.reminder_days_before) || 0);
  const grace = Math.max(0, Number(s.grace_days) || 0);
  const after = Math.max(grace + 1, Number(s.reminder_days_after) || 1);
  switch (pattern) {
    case "early":
      return { pattern, avgDaysLate: null, beforeDays: [], firstAfter: after, repeatEvery: 0, maxFollowUps: 1 };
    case "on_time":
      return { pattern, avgDaysLate: null, beforeDays: before ? [before] : [], firstAfter: after, repeatEvery: 7, maxFollowUps: 2 };
    case "sometimes_late":
      return { pattern, avgDaysLate: null, beforeDays: before ? [before] : [], firstAfter: grace + 1, repeatEvery: 5, maxFollowUps: 3 };
    case "often_late":
      return { pattern, avgDaysLate: null, beforeDays: [...new Set([before, 1].filter((d) => d > 0))], firstAfter: grace + 1, repeatEvery: 3, maxFollowUps: 5 };
    default:
      return { pattern, avgDaysLate: null, beforeDays: before ? [before] : [], firstAfter: after, repeatEvery: 5, maxFollowUps: 3 };
  }
}

/** Is today a reminder day? diff = days until due (negative = overdue). sentAfter = follow-ups already sent. */
export function reminderToday(plan: CadencePlan, diff: number, sentAfter: number): "before" | "after" | null {
  if (diff > 0) return plan.beforeDays.includes(diff) ? "before" : null;
  const late = -diff;
  if (late < plan.firstAfter || sentAfter >= plan.maxFollowUps) return null;
  if (late === plan.firstAfter) return "after";
  if (plan.repeatEvery > 0 && (late - plan.firstAfter) % plan.repeatEvery === 0) return "after";
  return null;
}

/** Next follow-up in days from today, or null when none remain. */
export function nextFollowUp(plan: CadencePlan, diff: number, sentAfter: number): number | null {
  for (let d = 0; d <= 60; d++) {
    const k = reminderToday(plan, diff - d, sentAfter);
    if (k) return d;
  }
  return null;
}

export const PATTERN_LABEL: Record<PayPattern, string> = {
  early: "Pays early",
  on_time: "Pays on time",
  sometimes_late: "Sometimes late",
  often_late: "Often late",
  new: "New tenant",
};

export const FIRM_FOLLOW_UP =
  "Dear {tenant_name}, we have not yet received your rent payment of {total_balance}, which was due on {due_date}. The grace period has now passed. Kindly settle the balance promptly to avoid further late charges. If you have already paid, please disregard this message. View your account at homebasemanager.app/tenant/login using your phone number.";
