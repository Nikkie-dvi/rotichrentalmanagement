// Landlord-facing entry point for the tenant balance consistency check.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Re-checks every tenant balance and alerts the landlord if anything is off. */
export const runLedgerAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { notify?: boolean }) => ({ notify: data?.notify !== false }))
  .handler(async ({ data, context }) => {
    const { data: managed } = await context.supabase
      .from("property_managers")
      .select("landlord_user_id")
      .eq("manager_user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    const ownerId = (managed as any)?.landlord_user_id ?? context.userId;

    const { auditOwnerLedgers, notifyLedgerIssues } = await import("@/lib/ledger-audit.server");
    const res = await auditOwnerLedgers(ownerId);
    if (data.notify) await notifyLedgerIssues(res);
    return res;
  });
