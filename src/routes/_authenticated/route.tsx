import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LandlordGate } from "@/components/landlord-gate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    // A signed-in tenant must never land on the landlord dashboard.
    const [{ data: tenantRow }, { data: landlordRow }] = await Promise.all([
      supabase.from("tenants").select("id").eq("auth_user_id", data.user.id).limit(1).maybeSingle(),
      supabase.from("landlord_accounts").select("id").eq("user_id", data.user.id).limit(1).maybeSingle(),
    ]);
    if (tenantRow && !landlordRow) {
      throw redirect({ to: "/tenant/dashboard" });
    }
    return { user: data.user };
  },
  component: () => (
    <LandlordGate>
      <Outlet />
    </LandlordGate>
  ),
});
