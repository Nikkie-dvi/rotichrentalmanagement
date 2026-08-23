import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, FileSignature } from "lucide-react";
import { LeaseDialog, type LeaseData } from "@/components/lease-document";
import { useLandlordAccount } from "@/hooks/use-landlord-account";
import { resolveLeaseTemplate } from "@/lib/lease-template";
import { SectionSwitcher, SectionPanel, LEASE_TABS } from "@/components/section-switcher";

export const Route = createFileRoute("/_authenticated/leases")({
  head: () => ({
    meta: [
      { title: "Lease Agreements — Rotich Management Systems" },
      { name: "description", content: "View and print signed digital lease agreements for every tenant." },
      { property: "og:title", content: "Lease Agreements" },
      { property: "og:description", content: "View and print signed digital lease agreements for every tenant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LeasesPage,
});

function LeasesPage() {
  const { data: landlordAccount } = useLandlordAccount();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<LeaseData | null>(null);

  const query = useQuery({
    queryKey: ["leases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select(
          "id, full_name, phone_number, email, deposit_paid, move_in_date, move_out_date, active, rent_due_day, approval_status, lease_signature, lease_signed_at, units(unit_number, rent_amount, properties(name, location))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows = useMemo(() => {
    const list = (query.data ?? []).map((t: any): LeaseData & { id: string; active: boolean; approval_status: string } => ({
      id: t.id,
      active: t.active,
      approval_status: t.approval_status,
      full_name: t.full_name,
      phone_number: t.phone_number,
      email: t.email,
      deposit_paid: t.deposit_paid,
      move_in_date: t.move_in_date,
      rent_due_day: t.rent_due_day,
      lease_signature: t.lease_signature,
      lease_signed_at: t.lease_signed_at,
      unit_number: t.units?.unit_number ?? null,
      rent_amount: t.units?.rent_amount ?? null,
      property_name: t.units?.properties?.name ?? null,
      property_location: t.units?.properties?.location ?? null,
    }));
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (r) =>
        r.full_name.toLowerCase().includes(needle) ||
        (r.unit_number ?? "").toLowerCase().includes(needle) ||
        (r.property_name ?? "").toLowerCase().includes(needle),
    );
  }, [query.data, q]);

  return (
    <div className="grid gap-4">
      <SectionSwitcher items={LEASE_TABS} />
      <SectionPanel items={LEASE_TABS}>
      <div>
        <h1 className="text-2xl font-bold">Lease agreements</h1>
        <p className="text-sm text-muted-foreground">Every tenant's signed lease copy, with name and signature.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Signed leases</CardTitle>
          <CardDescription>Open a lease to read the full copy or print it.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input placeholder="Search by tenant, unit or property" value={q} onChange={(e) => setQ(e.target.value)} />

          {query.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {!query.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No tenants yet.</p>
          )}

          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {r.full_name}
                  <Badge variant="outline" className="capitalize">{r.approval_status}</Badge>
                  {r.lease_signature ? (
                    <Badge variant="secondary">Signed</Badge>
                  ) : (
                    <Badge variant="outline">Unsigned</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.property_name ?? "—"} · Unit {r.unit_number ?? "—"}
                  {r.lease_signed_at ? ` · ${new Date(r.lease_signed_at).toLocaleDateString()}` : ""}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelected(r)}>
                <FileSignature className="mr-2 h-4 w-4" /> View lease
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <LeaseDialog
        template={resolveLeaseTemplate(landlordAccount as any)} lease={selected} open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)} />
      </SectionPanel>
    </div>
  );
}
