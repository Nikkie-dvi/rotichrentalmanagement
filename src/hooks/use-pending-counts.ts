import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Counts that drive the little notification badges in the landlord navigation. */
export function usePendingCounts() {
  const { data } = useQuery({
    queryKey: ["pending-counts"],
    refetchInterval: 60000,
    queryFn: async () => {
      const [apps, tickets, moveOuts, invoices] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
        supabase.from("maintenance_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("move_out_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("invoices").select("id", { count: "exact", head: true }).neq("status", "paid"),
      ]);
      return {
        applications: apps.count ?? 0,
        tickets: tickets.count ?? 0,
        moveOuts: moveOuts.count ?? 0,
        unpaidInvoices: invoices.count ?? 0,
      };
    },
  });
  return {
    applications: data?.applications ?? 0,
    tickets: data?.tickets ?? 0,
    moveOuts: data?.moveOuts ?? 0,
    unpaidInvoices: data?.unpaidInvoices ?? 0,
    issues: (data?.tickets ?? 0) + (data?.moveOuts ?? 0),
  };
}
