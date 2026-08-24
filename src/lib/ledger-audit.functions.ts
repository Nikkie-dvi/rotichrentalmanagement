// Landlord-facing entry point for the tenant balance consistency check.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ownerFor(context: any) {
  const { data: managed } = await context.supabase
    .from("property_managers")
    .select("landlord_user_id")
    .eq("manager_user_id", context.userId)
    .eq("active", true)
    .maybeSingle();
  return (managed as any)?.landlord_user_id ?? context.userId;
}

/** Clears rent that fell due but was never invoiced, then re-checks balances. */
export const clearUninvoicedRentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { tenantIds?: string[] }) => ({ tenantIds: data?.tenantIds ?? [] }))
  .handler(async ({ data, context }) => {
    const ownerId = await ownerFor(context);
    const { clearUninvoicedRent, auditOwnerLedgers } = await import("@/lib/ledger-audit.server");
    const res = await clearUninvoicedRent(ownerId, data.tenantIds);
    const audit = await auditOwnerLedgers(ownerId);
    return { ...res, audit };
  });


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
