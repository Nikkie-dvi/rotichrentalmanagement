import { describe, expect, test } from "vitest";
import { penaltyDaysLate, penaltyStartDate, penaltyToday } from "./penalty-schedule";

describe("apartment penalty dates", () => {
  test("different apartments start penalties on their own days", () => {
    expect(penaltyStartDate("2026-10-05", 5, 10)).toBe("2026-10-10");
    expect(penaltyStartDate("2026-10-05", 5, 15)).toBe("2026-10-15");
    expect(penaltyDaysLate("2026-10-10", "2026-10-10")).toBe(1);
    expect(penaltyDaysLate("2026-10-10", "2026-10-15")).toBe(0);
  });
  test("unset apartments preserve the account grace period", () => {
    expect(penaltyStartDate("2026-10-05", 5, null)).toBe("2026-10-11");
  });
  test("short months clamp the selected day", () => {
    expect(penaltyStartDate("2027-02-05", 5, 31)).toBe("2027-02-28");
  });
  test("penalties never start before or on rent due date", () => {
    expect(penaltyStartDate("2026-12-15", 5, 10)).toBe("2027-01-10");
    expect(penaltyStartDate("2026-10-10", 5, 10)).toBe("2026-11-10");
  });
  test("daily rates count days from the apartment start date", () => {
    expect(penaltyDaysLate("2026-10-12", "2026-10-10")).toBe(3);
  });
  test("the daily check switches dates at Nairobi midnight", () => {
    expect(penaltyToday(new Date("2026-10-18T21:30:00Z"))).toBe("2026-10-19");
  });
});