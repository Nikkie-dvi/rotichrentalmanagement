import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaseDocument } from "@/components/lease-document";
import { SignaturePad, type SignatureValue } from "@/components/tenant/signature-pad";
import { TenantBackBar } from "@/components/tenant/back-bar";
import { getMyLandlordInfo } from "@/lib/tenant.functions";
import { signMyLease } from "@/lib/lease-sign.functions";

export const Route = createFileRoute("/_tenantauth/tenant/sign-lease")({
  head: () => ({
    meta: [
      { title: "Sign your lease — Eden Point Real Estate" },
      { name: "description", content: "Read and sign your lease agreement from your tenant portal." },
      { property: "og:title", content: "Sign your lease" },
      { property: "og:description", content: "Read and sign your lease agreement from your tenant portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignLeasePage,
});

function SignLeasePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [busy, setBusy] = useState(false);
  const info = useQuery({ queryKey: ["tenant", "landlord-info"], queryFn: () => getMyLandlordInfo(), staleTime: 60_000 });
  const me = useQuery({
    queryKey: ["tenant", "me"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No session");
      const { data, error } = await supabase
        .from("tenants")
        .select("id, owner_id, full_name, phone_number, email, active, move_out_date, approval_status, declined_reason, rent_due_day, move_in_date, deposit_paid, lease_signature, lease_signed_at, unit_id, units(id, unit_number, rent_amount, status, properties(name, location))")
        .eq("auth_user_id", user.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const t = me.data as any;
  const submit = async () => {
    if (!signature) return toast.error("Please add your signature first");
    setBusy(true);
    try {
      await signMyLease({
        data: { signature: signature.kind === "drawn" ? signature.dataUrl : `typed:${signature.typedName}` },
      });
      toast.success("Lease signed — thank you");
      await qc.invalidateQueries({ queryKey: ["tenant"] });
      navigate({ to: "/tenant/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign the lease");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-3">
      <TenantBackBar title="Sign your lease" />
      {me.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !t ? (
        <p className="py-8 text-center text-sm text-muted-foreground">We couldn't find your tenancy. Please contact your landlord.</p>
      ) : t.lease_signature ? (
        <Card className="mt-3">
          <CardContent className="grid gap-3 py-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <p className="font-medium">Your lease is already signed.</p>
            <Button asChild><Link to="/tenant/dashboard">Go to my portal</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-3 grid gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your lease agreement</CardTitle>
              <CardDescription>Read it carefully, then sign below.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[50vh] overflow-y-auto">
              <LeaseDocument
                template={info.data?.leaseTemplate ?? null}
                lease={{
                  full_name: t.full_name,
                  phone_number: t.phone_number,
                  email: t.email,
                  deposit_paid: t.deposit_paid,
                  move_in_date: t.move_in_date,
                  rent_due_day: t.rent_due_day,
                  unit_number: t.units?.unit_number ?? null,
                  rent_amount: t.units?.rent_amount ?? null,
                  property_name: t.units?.properties?.name ?? null,
                  property_location: t.units?.properties?.location ?? null,
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your signature</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <SignaturePad fullName={t.full_name} onChange={setSignature} />
              <Button onClick={submit} disabled={busy || !signature}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} I agree — sign lease
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
