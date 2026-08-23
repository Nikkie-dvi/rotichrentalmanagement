import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    // Cached data renders instantly on return visits; refresh happens quietly.
    // gcTime is long so the persisted offline cache survives navigation/reloads.
    defaultOptions: { queries: { staleTime: 30_000, gcTime: 24 * 60 * 60_000 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 0,
  });


  return router;
};
