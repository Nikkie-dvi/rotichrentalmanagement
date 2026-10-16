import { describe, expect, it } from "vitest";
import { utilitySummary, type UtilityInvoice } from "./utility-summary";
const bill = (overrides: Partial<UtilityInvoice>): UtilityInvoice => ({ id: "1", kind: "service", month_year: "2026-10", total_due: 1200, balance_remaining: 400, water_amount: 200, electricity_amount: 800, garbage_amount: 200, other_amount: 0, utility_amount: 1200, ...overrides });
describe("utility summary", () => {
  it("separates utilities from rent and retains older unpaid bills", () => {
    const s = utilitySummary([bill({}), bill({ id: "2", kind: "rent", total_due: 10000 }), bill({ id: "3", month_year: "2026-09", balance_remaining: 100 })], "2026-10");
    expect(s.billed).toBe(1200); expect(s.settled).toBe(800); expect(s.outstanding).toBe(500);
    expect(s.rows.find(r => r.label === "Garbage")?.billed).toBe(200);
  });
  it("does not count the same metered amount twice", () => {
    expect(utilitySummary([bill({ utility_amount: 1500, total_due: 1500 })], "2026-10").rows.reduce((s, r) => s + r.billed, 0)).toBe(1500);
  });
});