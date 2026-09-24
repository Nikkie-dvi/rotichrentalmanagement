import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Droplets, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { activeTenantsQuery, readingsQuery } from "@/lib/property-queries";

export const Route = createFileRoute("/_authenticated/meters")({
  head: () => ({
    meta: [
      { title: "Meter Readings & Utilities — Rotich Management Systems" },
      { name: "description", content: "Log utility meter readings and compute per-tenant utility bills automatically." },
      { property: "og:title", content: "Meter Readings & Utilities — Rotich Management Systems" },
      { property: "og:description", content: "Log meter readings; auto-calc utility bills." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.prefetchQuery(activeTenantsQuery);
    context.queryClient.prefetchQuery(readingsQuery);
  },
  component: MetersPage,
});

function MetersPage() {
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState<string>("");
  const [current, setCurrent] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const { data: tenants } = useQuery(activeTenantsQuery);

  const { data: readings } = useQuery(readingsQuery);

  const selectedTenant = (tenants ?? []).find((tenant: any) => tenant.id === tenantId) as any;

  const propertyGroups = useMemo(() => {
    const tenantsById = new Map((tenants ?? []).map((tenant: any) => [tenant.id, tenant]));
    const groups = new Map<string, any[]>();
    for (const reading of readings ?? []) {
      const tenant = tenantsById.get((reading as any).tenant_id) as any;
      const propertyName = tenant?.units?.properties?.name ?? "Unassigned property";
      groups.set(propertyName, [...(groups.get(propertyName) ?? []), { ...reading, tenant }]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [readings, tenants]);

  const trackedTotal = (readings ?? []).reduce((sum: number, reading: any) => sum + Number(reading.total_amount ?? 0), 0);
  const trackedUnits = new Set((readings ?? []).map((reading: any) => reading.tenant_id)).size;


  const previous = useMemo(() => {
    if (!tenantId) return 0;
    const rows = (readings ?? []).filter((r: any) => r.tenant_id === tenantId);
    if (!rows.length) return 0;
    return Number(rows[0].current_reading);
  }, [tenantId, readings]);

  const consumed = Math.max(0, (Number(current) || 0) - previous);
  const total = consumed * (Number(rate) || 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Select a tenant");
      const cur = Number(current);
      if (cur < previous) throw new Error("Current reading cannot be less than previous");
      const { error } = await supabase.from("utility_readings").insert({
        tenant_id: tenantId,
        reading_date: date,
        previous_reading: previous,
        current_reading: cur,
        unit_rate: Number(rate) || 0,
        total_amount: total,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["readings"] });
      setCurrent("");
      toast.success("Reading saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold">Utilities</h2>
          <p className="text-sm text-muted-foreground">Meter usage and charges, organized by apartment.</p>
        </div>
        <div className="shrink-0 rounded-md border bg-card px-3 py-2 text-right">
          <div className="text-xs text-muted-foreground">Tracked total</div>
          <div className="font-semibold text-primary">{money(trackedTotal)}</div>
        </div>
      </div>

      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b bg-muted/40"><CardTitle className="flex items-center gap-2 text-base"><Droplets className="h-4 w-4 text-primary" />New meter reading</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="sm:col-span-2 lg:col-span-2">
              <Label>Apartment / tenant</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {(tenants ?? []).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.units?.properties?.name ?? "No property"} · Unit {t.units?.unit_number ?? "—"} — {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Previous</Label><Input value={previous} readOnly /></div>
            <div><Label>Current</Label><Input type="number" min={previous} value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
            <div><Label>Rate</Label><Input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          </div>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border-l-4 border-l-primary bg-muted/50 p-3">
            <div className="min-w-0 text-sm">
              <div className="truncate font-semibold">{selectedTenant ? `${selectedTenant.units?.properties?.name ?? "Property"} · Unit ${selectedTenant.units?.unit_number ?? "—"}` : "Select an apartment"}</div>
              <div className="text-muted-foreground"><span className="font-medium text-foreground">{consumed}</span> units used · <span className="font-semibold text-primary">{money(total)}</span></div>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !tenantId}>
              <Plus className="h-4 w-4" />Save Reading
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b pb-2">
        <h3 className="font-semibold">Apartment utility feed</h3>
        <span className="text-xs text-muted-foreground">{trackedUnits} apartments tracked</span>
      </div>

      <div className="space-y-6">
        {propertyGroups.map(([propertyName, propertyReadings]) => (
          <section key={propertyName} className="space-y-2">
            <div className="sticky top-0 z-10 flex min-w-0 items-center gap-2 border-b bg-background py-2">
              <Building2 className="h-4 w-4 shrink-0 text-primary" />
              <h3 className="truncate text-sm font-semibold">{propertyName}</h3>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{propertyReadings.length} readings</span>
            </div>
            <div className="divide-y rounded-md border bg-card">
              {propertyReadings.map((reading: any) => {
                const used = Number(reading.current_reading) - Number(reading.previous_reading);
                return (
                  <div key={reading.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded bg-foreground px-2 py-0.5 text-[10px] font-bold text-background">UNIT {reading.tenant?.units?.unit_number ?? "—"}</span>
                        <span className="truncate text-sm font-medium">{reading.tenants?.full_name ?? reading.tenant?.full_name ?? "Tenant"}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{reading.reading_date} · {reading.previous_reading} → {reading.current_reading} · {used} units</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold">{money(Number(reading.total_amount))}</div>
                      <div className="text-xs text-muted-foreground">{money(Number(reading.unit_rate))}/unit</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {propertyGroups.length === 0 && <div className="rounded-md border py-10 text-center text-sm text-muted-foreground">No readings yet.</div>}
      </div>
    </div>
  );
}
