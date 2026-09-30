import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side auth gate for the tenant portal.
 * Requires a signed-in supabase user; if not signed in, redirects to /tenant/login
 * and remembers the page so sign-in returns the tenant there (e.g. lease signing).
 */
export const Route = createFileRoute("/_tenantauth")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/tenant/login", search: { redirect: location.pathname } as any });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
