import { useEffect, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";

const CACHE_KEY = "rms-query-cache";
/** Bump when a cached query shape changes so stale entries are discarded. */
const CACHE_BUSTER = "v2";
const MAX_AGE = 1000 * 60 * 60 * 24 * 7; // keep offline data for a week

/**
 * Persists the React Query cache to localStorage so previously loaded data
 * (properties, tenants, invoices, payments…) still renders with no network.
 */
export function useOfflineCache(queryClient: QueryClient) {
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const [{ createSyncStoragePersister }, { persistQueryClient }] = await Promise.all([
        import("@tanstack/query-sync-storage-persister"),
        import("@tanstack/react-query-persist-client"),
      ]);
      if (cancelled) return;

      const persister = createSyncStoragePersister({
        storage: window.localStorage,
        key: CACHE_KEY,
        throttleTime: 5000,
      });

      const [unsubscribe] = persistQueryClient({
        // Cast avoids a duplicate query-core type identity mismatch.
        queryClient: queryClient as unknown as Parameters<typeof persistQueryClient>[0]["queryClient"],
        persister,
        maxAge: MAX_AGE,
        dehydrateOptions: {
          // Never persist errored/empty queries.
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && query.state.data !== undefined,
        },
      });
      dispose = unsubscribe;
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [queryClient]);
}

/** Refetch everything as soon as the connection is back. */
export function useOnlineSync(queryClient: QueryClient) {
  useEffect(() => {
    const onOnline = () => {
      void queryClient.invalidateQueries();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [queryClient]);
}

export function useIsOffline() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return offline;
}

export function OfflineBanner() {
  const offline = useIsOffline();
  if (!offline) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-border/60 bg-muted/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-xl">
      <WifiOff className="h-3.5 w-3.5" />
      Offline — showing saved data. Changes will need a connection.
    </div>
  );
}
