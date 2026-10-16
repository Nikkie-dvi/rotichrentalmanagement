import { describe, expect, it } from "vitest";
import { assistantDestination } from "./assistant-navigation";

describe("assistant page requests", () => {
  it("opens known pages from natural language", () => {
    expect(assistantDestination("take me to the Tenants page")?.to).toBe("/tenants");
    expect(assistantDestination("Please open history")?.to).toBe("/performance");
    expect(assistantDestination("Can you open my account")?.to).toBe("/settings/account");
  });
  it("does not mistake account questions or actions for navigation", () => {
    for (const q of ["Show me tenants with arrears", "Text all tenants", "Take me to tenants and send a reminder", "How much are my bills?", "Open https://example.com"]) expect(assistantDestination(q)).toBeNull();
  });
});