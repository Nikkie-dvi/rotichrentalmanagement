import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_TABLES = [
  "properties",
  "units",
  "tenants",
  "invoices",
  "payments",
  "utility_readings",
  "mpesa_transactions",
  "maintenance_tickets",
  "move_out_requests",
  "landlord_accounts",
] as const;

/**
 * Subscribes to postgres_changes on the given tables and invalidates all
 * React Query caches on any change so dashboards refresh automatically.
 */
export function useRealtimeInvalidate(tables: readonly string[] = DEFAULT_TABLES) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel("realtime-dashboard-" + Math.random().toString(36).slice(2));
    let timer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Batch bursts of changes into a single refresh, and only refetch what is
     * on screen — refreshing every cached query on every row change made tab
     * switching crawl.
     */
    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void queryClient.invalidateQueries({ refetchType: "active" });
      }, 1500);
    };

    for (const table of tables) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table },
        scheduleRefresh,
      );
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
