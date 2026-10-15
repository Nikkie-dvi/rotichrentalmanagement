import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LandlordGate } from "@/components/landlord-gate";

/**
 * The "is this a landlord?" check costs three network round-trips, so it is
 * remembered per signed-in user. Without this cache every tab switch waits on
 * it again, which is what made moving between sections feel slow.
 */
let gateCache: { userId: string; isTenantOnly: boolean } | null = null;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Local read from storage — no network call, unlike getUser().
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      gateCache = null;
      // Visitors opening the home address see the public landing page.
      if (location.pathname === "/") throw redirect({ to: "/welcome" });
      throw redirect({ to: "/auth" });
    }

    if (gateCache?.userId === user.id) {
      if (gateCache.isTenantOnly) throw redirect({ to: "/tenant/dashboard" });
      return { user };
    }

    // A signed-in tenant must never land on the landlord dashboard.
    const [{ data: tenantRow }, { data: landlordRow }] = await Promise.all([
      supabase.from("tenants").select("id").eq("auth_user_id", user.id).limit(1).maybeSingle(),
      supabase.from("landlord_accounts").select("id").eq("user_id", user.id).limit(1).maybeSingle(),
    ]);
    gateCache = { userId: user.id, isTenantOnly: Boolean(tenantRow && !landlordRow) };
    if (gateCache.isTenantOnly) {
      throw redirect({ to: "/tenant/dashboard" });
    }
    return { user };
  },
  component: () => (
    <LandlordGate>
      <Outlet />
    </LandlordGate>
  ),
});
