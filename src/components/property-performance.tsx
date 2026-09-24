// Per-building performance: how each property is doing on occupancy,
// collections this month and money still owed.
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

export type PropertyRow = {
  id: string;
  name: string;
  location: string | null;
  units: number;
  occupied: number;
  occupancy: number;
  tenants: number;
  expectedRent: number;
  collected: number;
  arrears: number;
};

/** Builds one performance row per property from units, tenants and money. */
export async function loadPropertyPerformance(
  arrearsByTenant: Map<string, number>,
): Promise<PropertyRow[]> {
  const monthKey = new Date().toISOString().slice(0, 7);
  const [{ data: properties }, { data: units }, { data: tenants }, { data: payments }] = await Promise.all([
    supabase.from("properties").select("id,name,location").order("name"),
    supabase.from("units").select("id,property_id,status,rent_amount"),
    supabase.from("tenants").select("id,unit_id,active"),
    supabase.from("payments").select("tenant_id,amount_paid,payment_date"),
  ]);

  const unitToProperty = new Map<string, string>();
  for (const u of (units ?? []) as any[]) unitToProperty.set(u.id, u.property_id);

  const tenantToProperty = new Map<string, string>();
  for (const t of (tenants ?? []) as any[]) {
    const p = t.unit_id ? unitToProperty.get(t.unit_id) : undefined;
    if (p) tenantToProperty.set(t.id, p);
  }

  const collectedBy = new Map<string, number>();
  for (const p of (payments ?? []) as any[]) {
    if (!String(p.payment_date ?? "").startsWith(monthKey)) continue;
    const prop = tenantToProperty.get(p.tenant_id);
    if (!prop) continue;
    collectedBy.set(prop, (collectedBy.get(prop) ?? 0) + Number(p.amount_paid ?? 0));
  }

  const arrearsBy = new Map<string, number>();
  for (const [tenantId, amount] of arrearsByTenant) {
    const prop = tenantToProperty.get(tenantId);
    if (!prop) continue;
    arrearsBy.set(prop, (arrearsBy.get(prop) ?? 0) + amount);
  }

  return ((properties ?? []) as any[]).map((p) => {
    const own = ((units ?? []) as any[]).filter((u) => u.property_id === p.id);
    const occupied = own.filter((u) => u.status === "occupied").length;
    return {
      id: p.id,
      name: p.name,
      location: p.location ?? null,
      units: own.length,
      occupied,
      occupancy: own.length ? Math.round((occupied / own.length) * 100) : 0,
      tenants: ((tenants ?? []) as any[]).filter((t) => t.active && tenantToProperty.get(t.id) === p.id).length,
      expectedRent: own
        .filter((u) => u.status === "occupied")
        .reduce((s, u) => s + Number(u.rent_amount ?? 0), 0),
      collected: collectedBy.get(p.id) ?? 0,
      arrears: Math.round(arrearsBy.get(p.id) ?? 0),
    };
  });
}

export function PropertyPerformance({ arrearsByTenant }: { arrearsByTenant: Map<string, number> }) {
  const { data: rows } = useQuery({
    queryKey: ["property-performance", arrearsByTenant.size],
    queryFn: () => loadPropertyPerformance(arrearsByTenant),
    staleTime: 0,
    refetchOnMount: "always",
  });

  return (
    <Card className="glass-card">
      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
        <CardTitle className="text-base">Property performance</CardTitle>
        <CardDescription>How each building is doing this month.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
        {(rows ?? []).map((p) => {
          const rate = p.expectedRent ? Math.round((p.collected / p.expectedRent) * 100) : 0;
          return (
            <div key={p.id} className="rounded-lg border bg-background/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-medium">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {p.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.location ?? "No area set"} · {p.tenants} tenant{p.tenants === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge variant={p.occupancy >= 80 ? "default" : "secondary"}>{p.occupancy}% full</Badge>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[11px] text-muted-foreground">Units</p>
                  <p className="text-sm font-semibold">
                    {p.occupied}/{p.units}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Collected</p>
                  <p className="text-sm font-semibold text-primary">{money(p.collected)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Owed</p>
                  <p className={`text-sm font-semibold ${p.arrears > 0 ? "text-destructive" : ""}`}>
                    {money(p.arrears)}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>Rent collected vs expected</span>
                  <span>{rate}%</span>
                </div>
                <Progress value={Math.min(100, rate)} className="h-2" />
              </div>
            </div>
          );
        })}
        {rows && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground sm:col-span-2">
            Add a property to see performance here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
