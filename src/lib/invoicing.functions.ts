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

/**
 * Bulk-generates a month's invoices using each tenant's real due day and credit.
 * `kind` picks rent bills or service bills (water, electricity, etc.); they are
 * always raised as separate invoices.
 */
export const generateMonthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { month: string; kind?: "rent" | "service"; force?: boolean }) => ({
    month: String(data.month).slice(0, 7),
    kind: data?.kind === "service" ? ("service" as const) : ("rent" as const),
    force: data?.force === true,
  }))
  .handler(async ({ data, context }) => {
    const ownerId = await ownerFor(context);
    const { generateMonthlyInvoices, reconcileInvoiceBalances } = await import("@/lib/invoicing.server");
    const res = await generateMonthlyInvoices(ownerId, data.month, data.kind, { force: data.force });
    const rec = await reconcileInvoiceBalances(ownerId);
    return { ...res, kind: data.kind, reconciled: rec.fixed };
  });

/**
 * Raises one tenant's invoice under the landlord's account, so a property
 * manager's invoice shows up on the landlord's pages too.
 */
export const invoiceTenantFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      tenantId: string;
      month: string;
      rent?: number;
      water?: number;
      power?: number;
      garbage?: number;
      other?: number;
      otherLabel?: string | null;
    }) => ({
      tenantId: String(data.tenantId),
      month: String(data.month).slice(0, 7),
      rent: Math.max(0, Number(data.rent) || 0),
      water: Math.max(0, Number(data.water) || 0),
      power: Math.max(0, Number(data.power) || 0),
      garbage: Math.max(0, Number(data.garbage) || 0),
      other: Math.max(0, Number(data.other) || 0),
      otherLabel: data.otherLabel?.trim() || null,
    }),
  )
  .handler(async ({ data, context }) => {
    const ownerId = await ownerFor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id, owner_id")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (!tenant || (tenant as any).owner_id !== ownerId) throw new Error("Tenant not found on this account");

    const util = data.water + data.power + data.garbage + data.other;
    if (data.rent <= 0 && util <= 0) throw new Error("Enter a rent or service amount");

    const rows: any[] = [];
    if (data.rent > 0) {
      rows.push({
        tenant_id: data.tenantId,
        owner_id: ownerId,
        month_year: data.month,
        kind: "rent",
        base_rent: data.rent,
        utility_amount: 0,
        total_due: data.rent,
        balance_remaining: data.rent,
        status: "unpaid",
      });
    }
    if (util > 0) {
      rows.push({
        tenant_id: data.tenantId,
        owner_id: ownerId,
        month_year: data.month,
        kind: "service",
        base_rent: 0,
        utility_amount: util,
        water_amount: data.water,
        electricity_amount: data.power,
        garbage_amount: data.garbage,
        other_amount: data.other,
        other_label: data.otherLabel,
        total_due: util,
        balance_remaining: util,
        status: "unpaid",
      });
    }

    // Money the tenant has already paid ahead (payments + credit edits, less
    // everything else already billed) must reduce what this new invoice asks
    // for — otherwise a tenant who paid upfront is shown as owing again.
    const [{ data: pays }, { data: evts }, { data: others }] = await Promise.all([
      supabaseAdmin.from("payments").select("amount_paid").eq("tenant_id", data.tenantId),
      supabaseAdmin.from("tenant_credit_events").select("delta").eq("tenant_id", data.tenantId),
      supabaseAdmin.from("invoices").select("total_due, month_year, kind").eq("tenant_id", data.tenantId),
    ]);
    const n = (v: any) => Number(v ?? 0) || 0;
    const kinds = new Set(rows.map((r) => r.kind));
    const billedElsewhere = ((others ?? []) as any[])
      .filter((i) => !(i.month_year === data.month && kinds.has(i.kind ?? "rent")))
      .reduce((s, i) => s + n(i.total_due), 0);
    let credit = Math.max(
      0,
      ((pays ?? []) as any[]).reduce((s, p) => s + n(p.amount_paid), 0) +
        ((evts ?? []) as any[]).reduce((s, e) => s + n(e.delta), 0) -
        billedElsewhere,
    );
    for (const r of rows) {
      const applied = Math.min(credit, r.total_due);
      credit -= applied;
      const balance = Math.max(0, r.total_due - applied);
      r.balance_remaining = balance;
      r.status = balance === 0 ? "paid" : balance < r.total_due ? "partial" : "unpaid";
    }

    const { data: saved, error } = await supabaseAdmin
      .from("invoices")
      .upsert(rows as never, { onConflict: "tenant_id,month_year,kind" })
      .select("id");
    if (error) throw new Error(error.message);
    return { ids: ((saved ?? []) as any[]).map((r) => r.id).filter(Boolean) as string[] };
  });


/** Reads the landlord's automatic-invoicing switch (works for managers too). */
export const getAutoInvoicingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ownerId = await ownerFor(context);
    const { data } = await context.supabase
      .from("billing_settings")
      .select("auto_reconcile_enabled")
      .eq("owner_id", ownerId)
      .maybeSingle();
    return { enabled: (data as any)?.auto_reconcile_enabled !== false };
  });

/** Turns automatic (due-date based) invoicing on or off. */
export const setAutoInvoicingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { enabled: boolean }) => ({ enabled: data.enabled === true }))
  .handler(async ({ data, context }) => {
    const ownerId = await ownerFor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("billing_settings")
      .upsert({ owner_id: ownerId, auto_reconcile_enabled: data.enabled } as never, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
    return { enabled: data.enabled };
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
