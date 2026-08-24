// Landlord-facing entry points for bulk invoicing and invoice cleanup.
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

/** Bulk-generates a month's invoices using each tenant's real due day and credit. */
export const generateMonthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { month: string }) => ({ month: String(data.month).slice(0, 7) }))
  .handler(async ({ data, context }) => {
    const ownerId = await ownerFor(context);
    const { generateMonthlyInvoices, reconcileInvoiceBalances } = await import("@/lib/invoicing.server");
    const res = await generateMonthlyInvoices(ownerId, data.month);
    const rec = await reconcileInvoiceBalances(ownerId);
    return { ...res, reconciled: rec.fixed };
  });

/** Lists invoices that should not be counted as arrears. */
export const listIncorrectInvoicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ownerId = await ownerFor(context);
    const { findIncorrectInvoices } = await import("@/lib/invoicing.server");
    return { invoices: await findIncorrectInvoices(ownerId) };
  });

/** Removes bad invoices (all found ones, or the given ids) and rebalances. */
export const removeIncorrectInvoicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { ids?: string[] }) => ({ ids: data?.ids ?? [] }))
  .handler(async ({ data, context }) => {
    const ownerId = await ownerFor(context);
    const { findIncorrectInvoices, removeInvoices, reconcileInvoiceBalances } = await import(
      "@/lib/invoicing.server"
    );
    const ids = data.ids.length ? data.ids : (await findIncorrectInvoices(ownerId)).map((i) => i.id);
    const res = await removeInvoices(ownerId, ids);
    const rec = await reconcileInvoiceBalances(ownerId);
    return { ...res, reconciled: rec.fixed };
  });
