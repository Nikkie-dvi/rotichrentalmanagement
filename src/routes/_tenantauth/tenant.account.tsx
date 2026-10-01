import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantBackBar } from "@/components/tenant/back-bar";
import { updateMyTenantDetails } from "@/lib/tenant-account.functions";

export const Route = createFileRoute("/_tenantauth/tenant/account")({
  head: () => ({
    meta: [
      { title: "My account — Tenant portal" },
      { name: "description", content: "Update your name and phone number in your tenant portal." },
      { property: "og:title", content: "My account — Tenant portal" },
      { property: "og:description", content: "Update your name and phone number in your tenant portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TenantAccountPage,
});

function TenantAccountPage() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["tenant", "account"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("No session");
      const { data, error } = await supabase
        .from("tenants")
        .select("id, full_name, phone_number, email, lease_signed_at")
        .eq("auth_user_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me.data) {
      setName(me.data.full_name ?? "");
      setPhone(me.data.phone_number ?? "");
    }
  }, [me.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateMyTenantDetails({ data: { fullName: name, phone } });
      toast.success("Details updated. Use your new number next time you sign in.");
      qc.invalidateQueries({ queryKey: ["tenant"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your details");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-3">
      <TenantBackBar title="My account" />
      {me.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !me.data ? (
        <p className="py-8 text-center text-sm text-muted-foreground">We couldn't find your tenant details.</p>
      ) : (
        <div className="grid gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">My details</CardTitle>
              <CardDescription>Your landlord sees these on your account and in messages.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={save} className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="acc-name">Full name</Label>
                  <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="acc-phone">Phone number</Label>
                  <Input id="acc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" required />
                  <p className="text-xs text-muted-foreground">You sign in and receive texts on this number.</p>
                </div>
                {me.data.email && <p className="text-xs text-muted-foreground">Email: {me.data.email}</p>}
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start gap-2 py-4 text-sm text-muted-foreground">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              {me.data.lease_signed_at
                ? `Your lease was signed on ${new Date(me.data.lease_signed_at).toLocaleDateString()} and is locked — it can't be changed.`
                : "Once you sign your lease it is locked and can't be changed."}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
