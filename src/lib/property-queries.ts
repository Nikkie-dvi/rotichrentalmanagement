import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared query definitions for the property-management tabs
 * (Properties, Tenants, Meters, Maintenance).
 *
 * Keeping them in one place lets route loaders warm the cache on hover/touch
 * (defaultPreload: "intent") while the components subscribe to the exact same
 * keys, so switching tabs renders from cache instantly instead of refetching.
 */

const FRESH = 60_000;

export const propertiesQuery = queryOptions({
  queryKey: ["properties"],
  queryFn: async () => (await supabase.from("properties").select("*").order("name")).data ?? [],
  staleTime: FRESH,
});

export const unitsFullQuery = queryOptions({
  queryKey: ["units-full"],
  queryFn: async () =>
    (await supabase.from("units").select("*,properties(name)").order("unit_number")).data ?? [],
  staleTime: FRESH,
});

export const assignableTenantsQuery = queryOptions({
  queryKey: ["assignable-tenants"],
  queryFn: async () =>
    (
      await supabase
        .from("tenants")
        .select("id, full_name, phone_number, unit_id, approval_status")
        .is("unit_id", null)
        .neq("approval_status", "declined")
        .order("full_name")
    ).data ?? [],
  staleTime: FRESH,
});

export const tenantsFullQuery = queryOptions({
  queryKey: ["tenants-full"],
  queryFn: async () =>
    (
      await supabase
        .from("tenants")
        .select("*,units(unit_number,rent_amount,properties(name))")
        .order("created_at", { ascending: false })
    ).data ?? [],
  staleTime: FRESH,
});

export const tenantBalancesQuery = queryOptions({
  queryKey: ["tenant-balances"],
  queryFn: async () =>
    (await supabase.from("invoices").select("tenant_id,month_year,balance_remaining,total_due")).data ?? [],
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
});

export const tenantPaymentTotalsQuery = queryOptions({
  queryKey: ["tenant-payment-totals"],
  queryFn: async () => (await supabase.from("payments").select("tenant_id,amount_paid")).data ?? [],
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
});

export const tenantCreditAdjustmentsQuery = queryOptions({
  queryKey: ["tenant-credit-adjustments"],
  queryFn: async () => (await supabase.from("tenant_credit_events").select("tenant_id,delta")).data ?? [],
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
});

export const vacantUnitsQuery = queryOptions({
  queryKey: ["vacant-units"],
  queryFn: async () =>
    (await supabase.from("units").select("id,unit_number,rent_amount,properties(name)").eq("status", "vacant")).data ??
    [],
  staleTime: FRESH,
});

export const activeTenantsQuery = queryOptions({
  queryKey: ["active-tenants"],
  queryFn: async () =>
    (await supabase.from("tenants").select("id,full_name,units(unit_number)").eq("active", true).order("full_name"))
      .data ?? [],
  staleTime: FRESH,
});

export const readingsQuery = queryOptions({
  queryKey: ["readings"],
  queryFn: async () =>
    (
      await supabase
        .from("utility_readings")
        .select("*,tenants(full_name)")
        .order("reading_date", { ascending: false })
        .limit(50)
    ).data ?? [],
  staleTime: FRESH,
});
