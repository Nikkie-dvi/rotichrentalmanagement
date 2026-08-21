// Landlord-facing server functions for tenant credit: watch for changes,
// list the alert history and edit (apply / write off / adjust) a balance.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function tenantForCaller(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, owner_id, full_name")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Tenant not found");
  return data as { id: string; owner_id: string; full_name: string };
}

/** Re-checks every tenant's credit and alerts on anything new. */
export const runCreditWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: managed } = await context.supabase
      .from("property_managers")
      .select("landlord_user_id")
      .eq("manager_user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    const ownerId = (managed as any)?.landlord_user_id ?? context.userId;
    const { scanOwnerCredits } = await import("@/lib/credit.server");
    return scanOwnerCredits(ownerId);
  });

/** Credit alert history for one tenant (newest first). */
export const listCreditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenantId: string }) => {
    if (!data?.tenantId) throw new Error("Tenant is required");
    return { tenantId: data.tenantId };
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tenant_credit_events")
      .select("id, kind, amount, delta, note, acknowledged, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Marks a credit alert as reviewed so it stops nagging. */
export const acknowledgeCreditEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventId: string }) => {
    if (!data?.eventId) throw new Error("Alert is required");
    return { eventId: data.eventId };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tenant_credit_events")
      .update({ acknowledged: true })
      .eq("id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Edits a tenant's credit.
 *  - apply  : puts credit against their oldest unpaid invoice
 *  - expire : writes the credit off with a reason
 *  - add    : adds credit (e.g. money received outside the ledger)
 *  - set    : forces the credit to an exact figure
 */
export const adjustTenantCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenantId: string; mode: "apply" | "expire" | "add" | "set"; amount: number; note?: string }) => {
    if (!data?.tenantId) throw new Error("Tenant is required");
    const amount = Number(data?.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid amount");
    if (!["apply", "expire", "add", "set"].includes(data?.mode)) throw new Error("Choose what to do with the credit");
    return {
      tenantId: data.tenantId,
      mode: data.mode,
      amount: Math.round(amount),
      note: (data.note ?? "").trim().slice(0, 200) || null,
    };
  })
  .handler(async ({ data, context }) => {
    const tenant = await tenantForCaller(context.supabase, data.tenantId);
    const { creditFor, logCreditEvent } = await import("@/lib/credit.server");
    const ledger = await creditFor(tenant.owner_id, tenant.id);
    const credit = ledger?.credit ?? 0;

    let delta = 0;
    let kind: "applied" | "expired" | "adjusted" = "adjusted";
    let amount = data.amount;
    let note = data.note;

    if (data.mode === "apply") {
      if (data.amount <= 0) throw new Error("Enter how much credit to apply");
      if (data.amount > credit) throw new Error("That is more than the credit on the account");
      const { data: invoices } = await context.supabase
        .from("invoices")
        .select("id, month_year, total_due, balance_remaining")
        .eq("tenant_id", tenant.id)
        .gt("balance_remaining", 0)
        .order("month_year");
      let remaining = data.amount;
      const months: string[] = [];
      for (const inv of (invoices ?? []) as any[]) {
        if (remaining <= 0) break;
        const applied = Math.min(remaining, Number(inv.balance_remaining));
        const newBalance = Number(inv.balance_remaining) - applied;
        const { error } = await context.supabase
          .from("invoices")
          .update({ balance_remaining: newBalance, status: newBalance <= 0 ? "paid" : "partial" })
          .eq("id", inv.id);
        if (error) throw new Error(error.message);
        months.push(inv.month_year);
        remaining -= applied;
      }
      const used = data.amount - remaining;
      if (used <= 0) throw new Error("There is no unpaid invoice to apply this credit to");
      amount = used;
      delta = -used;
      kind = "applied";
      note = note ?? `Applied to ${months.join(", ")}`;
    } else if (data.mode === "expire") {
      const used = Math.min(credit, data.amount || credit);
      if (used <= 0) throw new Error("There is no credit to clear");
      amount = used;
      delta = -used;
      kind = "expired";
    } else if (data.mode === "add") {
      delta = data.amount;
      amount = credit + data.amount;
    } else {
      delta = data.amount - credit;
      amount = data.amount;
    }

    await logCreditEvent({
      ownerId: tenant.owner_id,
      tenantId: tenant.id,
      tenantName: tenant.full_name,
      kind,
      amount,
      delta,
      note,
      createdBy: context.userId,
    });

    const after = await creditFor(tenant.owner_id, tenant.id);
    return { ok: true, credit: after?.credit ?? 0 };
  });
