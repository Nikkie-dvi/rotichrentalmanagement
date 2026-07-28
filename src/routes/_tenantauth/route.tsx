import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side auth gate for the tenant portal.
 * Requires a signed-in supabase user; if not signed in, redirects to /tenant/login.
 * Does NOT verify tenant profile here — child routes fetch that themselves so
 * they can show a friendly onboarding path when the profile is missing.
 */
export const Route = createFileRoute("/_tenantauth")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/tenant/login" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
