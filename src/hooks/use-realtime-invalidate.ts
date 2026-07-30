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
] as const;

/**
 * Subscribes to postgres_changes on the given tables and invalidates all
 * React Query caches on any change so dashboards refresh automatically.
 */
export function useRealtimeInvalidate(tables: readonly string[] = DEFAULT_TABLES) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel("realtime-dashboard-" + Math.random().toString(36).slice(2));

    for (const table of tables) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table },
        () => {
          queryClient.invalidateQueries();
        },
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
