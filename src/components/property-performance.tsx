import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowRight, Building2, CircleDollarSign, DoorOpen, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
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

function usePropertyPerformance(arrearsByTenant: Map<string, number>) {
  return useQuery({
    queryKey: ["property-performance", Array.from(arrearsByTenant.entries())],
    queryFn: () => loadPropertyPerformance(arrearsByTenant),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

const chartConfig = {
  expectedRent: { label: "Expected", color: "var(--color-muted-foreground)" },
  collected: { label: "Collected", color: "var(--color-primary)" },
  arrears: { label: "Arrears", color: "var(--color-destructive)" },
} satisfies ChartConfig;

export function SimplePropertyPerformance({ arrearsByTenant }: { arrearsByTenant: Map<string, number> }) {
  const { data: rows } = usePropertyPerformance(arrearsByTenant);

  return (
    <Card className="glass-card">
      <CardHeader className="flex-row items-start justify-between gap-3 p-4 pb-2 sm:p-6 sm:pb-3">
        <div>
          <CardTitle className="text-base">Portfolio performance</CardTitle>
          <CardDescription>A simple view of expected rent, collections, and arrears this month.</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link to="/properties">Details <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        {rows && rows.length > 0 ? (
          <>
            <ChartContainer config={chartConfig} className="h-64 w-full aspect-auto">
              <BarChart data={rows} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
                <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => money(Number(value))} />} />
                <Bar dataKey="expectedRent" fill="var(--color-expectedRent)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="collected" fill="var(--color-collected)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="arrears" fill="var(--color-arrears)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {Object.entries(chartConfig).map(([key, item]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">Add a property to see performance here.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function DetailedPropertyPerformance({ arrearsByTenant }: { arrearsByTenant: Map<string, number> }) {
  const { data: rows } = usePropertyPerformance(arrearsByTenant);

  return (
    <Card className="glass-card">
      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
        <CardTitle className="text-base">Detailed property performance</CardTitle>
        <CardDescription>Occupancy, monthly income, and outstanding balances for every building.</CardDescription>
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

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><DoorOpen className="h-3 w-3" /> Units</p>
                  <p className="text-sm font-semibold">{p.occupied} occupied · {Math.max(0, p.units - p.occupied)} vacant</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Users className="h-3 w-3" /> Active tenants</p>
                  <p className="text-sm font-semibold">{p.tenants}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><CircleDollarSign className="h-3 w-3" /> Expected / collected</p>
                  <p className="text-sm font-semibold">{money(p.expectedRent)} / <span className="text-primary">{money(p.collected)}</span></p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Outstanding arrears</p>
                  <p className={`text-sm font-semibold ${p.arrears > 0 ? "text-destructive" : ""}`}>{money(p.arrears)}</p>
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
