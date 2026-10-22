/**
 * SMS is unlimited and paid for by the main account's TextSMS subscription.
 * This passthrough keeps the existing send paths working without charging
 * per-landlord wallets or blocking messages on balance.
 */
type AdminClient = any;

/** Always allows the send — no charging, no low-balance alerts. */
export async function chargeSmsWallet(
  _supabaseAdmin: AdminClient,
  _args: { ownerId: string; count: number; reason: string; note?: string | null },
): Promise<number> {
  return 0;
}
