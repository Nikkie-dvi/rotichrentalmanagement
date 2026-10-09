import { describe, expect, test } from "bun:test";
import { compareCollections } from "./collection-comparison";
describe("comparable collection periods", () => {
  test("excludes later days and future payments", () => {
    const r = compareCollections([{ amount_paid: 100, payment_date: "2026-09-09" }, { amount_paid: 500, payment_date: "2026-09-10" }, { amount_paid: 60, payment_date: "2026-10-09" }, { amount_paid: 300, payment_date: "2026-10-10" }], "2026-10", "2026-10-09");
    expect(r.previousCollected).toBe(100); expect(r.collected).toBe(60); expect(r.difference).toBe(-40);
  });
  test("clamps short months and rolls years", () => {
    expect(compareCollections([], "2026-03", "2026-03-31").previousCutoff).toBe("2026-02-28");
    expect(compareCollections([], "2026-01", "2026-01-09").previousMonth).toBe("2025-12");
  });
  test("past reporting months compare full months", () => {
    const r = compareCollections([], "2026-09", "2026-10-09");
    expect(r.cutoff).toBe("2026-09-30"); expect(r.previousCutoff).toBe("2026-08-31"); expect(r.percentChange).toBeNull();
  });
});