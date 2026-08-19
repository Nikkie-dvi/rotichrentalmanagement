import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Counts that drive the little notification badges in the landlord navigation. */
export function usePendingCounts() {
  const { data } = useQuery({
    queryKey: ["pending-counts"],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const [apps, tickets, moveOuts, invoices, overdue, payments] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
        // Anything the landlord still has to act on.
        supabase.from("maintenance_tickets").select("id", { count: "exact", head: true }).neq("status", "resolved"),
        supabase.from("move_out_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("invoices").select("id", { count: "exact", head: true }).neq("status", "paid"),
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .neq("status", "paid")
          .lt("due_date", new Date().toISOString().slice(0, 10)),
        // Money that came in over the last 24h — worth a look on the payments tab.
        supabase.from("payments").select("id", { count: "exact", head: true }).gte("payment_date", since),
      ]);
      return {
        applications: apps.count ?? 0,
        tickets: tickets.count ?? 0,
        moveOuts: moveOuts.count ?? 0,
        unpaidInvoices: invoices.count ?? 0,
        overdueInvoices: overdue.count ?? 0,
        recentPayments: payments.count ?? 0,
      };
    },
  });
  return {
    applications: data?.applications ?? 0,
    tickets: data?.tickets ?? 0,
    moveOuts: data?.moveOuts ?? 0,
    unpaidInvoices: data?.unpaidInvoices ?? 0,
    overdueInvoices: data?.overdueInvoices ?? 0,
    recentPayments: data?.recentPayments ?? 0,
    issues: (data?.tickets ?? 0) + (data?.moveOuts ?? 0),
  };
}
