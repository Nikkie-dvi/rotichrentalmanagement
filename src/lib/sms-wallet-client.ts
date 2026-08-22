import { supabase } from "@/integrations/supabase/client";
import { getSmsWallet } from "@/lib/sms-wallet.functions";

/**
 * Wallet fetch that no-ops when there's no session. The server function is
 * auth-protected, so calling it while signed out throws "Unauthorized".
 */
export async function fetchSmsWalletSafe() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return getSmsWallet();
}
