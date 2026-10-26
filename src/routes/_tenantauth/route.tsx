import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Ban, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { myLandlordAccountStatus } from "@/lib/tenant-otp.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Client-side auth gate for the tenant portal.
 * Requires a signed-in supabase user; if not signed in, redirects to /tenant/login
 * and remembers the page so sign-in returns the tenant there (e.g. lease signing).
 * Also switches the portal off when the tenant's landlord account is suspended
 * or declined by the main account.
 */
export const Route = createFileRoute("/_tenantauth")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/tenant/login", search: { redirect: location.pathname } as any });
    }
    let landlordStatus = "approved";
    try {
      landlordStatus = (await myLandlordAccountStatus()).status;
    } catch {
      /* status check is best-effort; a failed check must not lock tenants out */
    }
    return { user: data.user, landlordStatus };
  },
  component: TenantPortalGate,
});

function TenantPortalGate() {
  const { landlordStatus } = Route.useRouteContext();
  const navigate = useNavigate();

  if (landlordStatus === "suspended" || landlordStatus === "declined") {
    const signOut = async () => {
      await supabase.auth.signOut();
      navigate({ to: "/tenant/login", replace: true });
    };
    return (
      <div className="flex min-h-[70vh] items-start justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <Ban className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Portal unavailable</CardTitle>
            <CardDescription>
              Your landlord's account is currently switched off, so the tenant portal is unavailable. Please contact
              your landlord.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
