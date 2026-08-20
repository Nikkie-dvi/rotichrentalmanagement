import { supabase } from "@/integrations/supabase/client";

/**
 * Creates the tenant's opening rent invoice so their balance shows in arrears
 * immediately when they join, until the landlord logs a payment.
 * Safe to call twice — the same tenant/month is upserted, never duplicated,
 * and an existing invoice for that month is left untouched.
 */
export async function createFirstRentInvoice(opts: {
  tenantId: string;
  rentAmount: number;
  moveInDate?: string | null;
}) {
  const rent = Number(opts.rentAmount) || 0;
  if (rent <= 0) return { created: false as const };

  const moveIn = opts.moveInDate ? new Date(opts.moveInDate) : new Date();
  const day = Number.isNaN(moveIn.getTime()) ? new Date() : moveIn;
  const monthYear = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
  const dueDate = day.toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("tenant_id", opts.tenantId)
    .eq("month_year", monthYear)
    .maybeSingle();
  if (existing) return { created: false as const };

  const { error } = await supabase.from("invoices").insert({
    tenant_id: opts.tenantId,
    month_year: monthYear,
    base_rent: rent,
    utility_amount: 0,
    total_due: rent,
    balance_remaining: rent,
    due_date: dueDate,
    status: "unpaid",
  });
  if (error) throw error;
  return { created: true as const };
}
