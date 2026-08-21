import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, X, Mail, Phone, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { LeaseDialog } from "@/components/lease-document";
import { useLandlordAccount } from "@/hooks/use-landlord-account";
import { resolveLeaseTemplate } from "@/lib/lease-template";
import { createFirstRentInvoice } from "@/lib/first-invoice";
import { SectionSwitcher, PEOPLE_TABS } from "@/components/section-switcher";

export const Route = createFileRoute("/_authenticated/applications")({
  head: () => ({
    meta: [
      { title: "Tenant Applications — Rotich Management Systems" },
      { name: "description", content: "Review and approve or decline new tenant registration applications." },
      { property: "og:title", content: "Tenant Applications" },
      { property: "og:description", content: "Review and approve or decline new tenant registrations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApplicationsPage,
});

type Row = {
  id: string;
  full_name: string;
  phone_number: string | null;
  email: string | null;
  approval_status: "pending" | "approved" | "declined";
  declined_reason: string | null;
  lease_signature: string | null;
  lease_signed_at: string | null;
  created_at: string;
  unit_id: string | null;
  units: {
    id: string;
    unit_number: string;
    rent_amount: number;
    status: string;
    properties: { name: string | null; location: string | null } | null;
  } | null;
};

function ApplicationsPage() {
  const { data: landlordAccount } = useLandlordAccount();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "declined">("pending");
  const [preview, setPreview] = useState<Row | null>(null);
  const [declineFor, setDeclineFor] = useState<Row | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const query = useQuery({
    queryKey: ["applications", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, full_name, phone_number, email, approval_status, declined_reason, lease_signature, lease_signed_at, created_at, unit_id, units(id, unit_number, rent_amount, status, properties(name, location))")
        .eq("approval_status", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const approve = useMutation({
    mutationFn: async (t: Row) => {
      if (!t.unit_id) throw new Error("Application has no unit assigned");
      const today = new Date().toISOString().slice(0, 10);
      const { error: tErr } = await supabase
        .from("tenants")
        .update({
          approval_status: "approved",
          active: true,
          move_in_date: today,
          declined_reason: null,
        })
        .eq("id", t.id);
      if (tErr) throw tErr;
      const { error: uErr } = await supabase
        .from("units")
        .update({ status: "occupied" })
        .eq("id", t.unit_id);
      if (uErr) throw uErr;

      // Merge any older, unlinked tenant card for the same unit into this
      // registered tenant so invoices/payments show on their dashboard.
      const { data: dupes } = await supabase
        .from("tenants")
        .select("id")
        .eq("unit_id", t.unit_id)
        .is("auth_user_id", null)
        .eq("active", true)
        .neq("id", t.id);

      for (const d of dupes ?? []) {
        for (const table of ["invoices", "payments", "utility_readings", "mpesa_transactions", "maintenance_tickets"] as const) {
          await supabase.from(table).update({ tenant_id: t.id }).eq("tenant_id", d.id);
        }
        await supabase
          .from("tenants")
          .update({ active: false, move_out_date: today })
          .eq("id", d.id);
      }
      // Open their account with the first month's rent already owed, so it
      // shows in arrears until a payment is logged.
      let invoiced = false;
      try {
        const res = await createFirstRentInvoice({
          tenantId: t.id,
          rentAmount: Number(t.units?.rent_amount ?? 0),
          moveInDate: today,
        });
        invoiced = res.created;
      } catch {
        /* approval must not fail because of billing */
      }
      return { merged: dupes?.length ?? 0, invoiced };
    },

    onSuccess: (res) => {
      toast.success(
        res?.merged
          ? "Tenant approved — existing rent records linked to their account"
          : res?.invoiced
            ? "Tenant approved — first rent invoice added to their balance"
            : "Tenant approved",
      );


      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to approve"),
  });

  const decline = useMutation({
    mutationFn: async ({ t, reason }: { t: Row; reason: string }) => {
      const { error } = await supabase
        .from("tenants")
        .update({
          approval_status: "declined",
          active: false,
          declined_reason: reason.trim() || null,
        })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Application declined");
      setDeclineFor(null);
      setDeclineReason("");
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to decline"),
  });

  const pendingCountQuery = useQuery({
    queryKey: ["applications", "pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const renderSignature = (sig: string | null) => {
    if (!sig) return <span className="text-sm text-muted-foreground">No signature captured</span>;
    if (sig.startsWith("data:image/")) {
      return <img src={sig} alt="Tenant signature" className="max-h-40 w-full rounded border bg-white object-contain" />;
    }
    if (sig.startsWith("typed:")) {
      return <div className="rounded-md border bg-muted/40 p-3 font-serif text-2xl italic">{sig.slice(6)}</div>;
    }
    return <div className="text-sm text-muted-foreground break-all">{sig}</div>;
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <SectionSwitcher items={PEOPLE_TABS} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tenant Applications</h1>
          <p className="text-sm text-muted-foreground">Review new registrations, then approve or decline.</p>
        </div>
        {(pendingCountQuery.data ?? 0) > 0 && (
          <Badge className="bg-emerald-500 text-white">{pendingCountQuery.data} pending</Badge>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="declined">Declined</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {query.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading applications…
            </div>
          )}

          {query.data && query.data.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No {tab} applications.
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3">
            {query.data?.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{t.full_name}</CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-3">
                        {t.email && (<span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {t.email}</span>)}
                        {t.phone_number && (<span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {t.phone_number}</span>)}
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {t.units ? `Unit ${t.units.unit_number}` : "No unit"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="text-sm text-muted-foreground">
                    {t.units?.properties?.name ?? "—"}
                    {t.units?.properties?.location ? ` · ${t.units.properties.location}` : ""}
                    {t.units ? ` · KES ${Math.round(Number(t.units.rent_amount)).toLocaleString()}/mo` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Submitted {new Date(t.created_at).toLocaleString()}
                    {t.lease_signed_at ? ` · Lease signed ${new Date(t.lease_signed_at).toLocaleString()}` : ""}
                  </div>

                  {tab === "declined" && t.declined_reason && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                      Reason: {t.declined_reason}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPreview(t)}>
                      <ClipboardCheck className="mr-2 h-4 w-4" /> Review lease
                    </Button>
                    {tab === "pending" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={approve.isPending || !t.unit_id}
                          onClick={() => approve.mutate(t)}
                        >
                          <Check className="mr-2 h-4 w-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={decline.isPending}
                          onClick={() => { setDeclineFor(t); setDeclineReason(""); }}
                        >
                          <X className="mr-2 h-4 w-4" /> Decline
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Lease preview dialog */}
      <LeaseDialog
        template={resolveLeaseTemplate(landlordAccount as any)}
        open={Boolean(preview)}
        onOpenChange={(o) => !o && setPreview(null)}
        lease={
          preview
            ? {
                full_name: preview.full_name,
                phone_number: preview.phone_number,
                email: preview.email,
                lease_signature: preview.lease_signature,
                lease_signed_at: preview.lease_signed_at,
                unit_number: preview.units?.unit_number ?? null,
                rent_amount: preview.units?.rent_amount ?? null,
                property_name: preview.units?.properties?.name ?? null,
                property_location: preview.units?.properties?.location ?? null,
              }
            : null
        }
      />


      {/* Decline dialog */}
      <Dialog open={Boolean(declineFor)} onOpenChange={(o) => !o && setDeclineFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decline application</DialogTitle>
            <DialogDescription>
              Optionally give a reason. The tenant will see this on their dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea id="reason" rows={3} maxLength={300} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="e.g. Unit already committed to another tenant" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineFor(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={decline.isPending}
              onClick={() => declineFor && decline.mutate({ t: declineFor, reason: declineReason })}
            >
              {decline.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
