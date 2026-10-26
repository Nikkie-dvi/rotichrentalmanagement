// Messaging gate for landlord accounts the main account has switched off.
// Suspended or declined landlords must not have automatic texts, emails or
// phone alerts going out to their tenants. Server-only.

/**
 * User IDs of landlord accounts whose messaging is paused
 * (status "suspended" or "declined" in landlord_accounts).
 */
export async function pausedOwnerIds(): Promise<Set<string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("landlord_accounts")
    .select("user_id, status")
    .in("status", ["suspended", "declined"]);
  return new Set(((data ?? []) as any[]).map((r) => r.user_id).filter(Boolean));
}

/** True when this owner's account is switched off and messages must not go out. */
export async function isMessagingPaused(ownerId: string | null | undefined): Promise<boolean> {
  if (!ownerId) return false;
  return (await pausedOwnerIds()).has(ownerId);
}
