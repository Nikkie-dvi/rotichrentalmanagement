import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));
import { claimRechargeRequest } from "./recharge-guard.server";

describe("recharge request protection", () => {
  beforeEach(() => rpc.mockReset());
  it("claims the authenticated account request", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await claimRechargeRequest("test-owner", "subscription_prompt");
    expect(rpc).toHaveBeenCalledWith("claim_recharge_request", { _user_id: "test-owner", _kind: "subscription_prompt" });
  });
  it("blocks requests when the cooldown or hourly limit is reached", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(claimRechargeRequest("test-owner", "sms_recharge")).rejects.toThrow("Please wait a minute");
  });
  it("fails closed when the limit cannot be verified", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await expect(claimRechargeRequest("test-owner", "subscription_prompt")).rejects.toThrow("Could not verify request limits");
  });
});