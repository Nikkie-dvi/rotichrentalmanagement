import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Users, DollarSign, AlertCircle, Plus, Gauge, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

type DrillKey = "units" | "occupancy" | "collected" | "arrears" | null;

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Rotich rental management new" },
      { name: "description", content: "Overview of your rental portfolio: units, occupancy, collections and arrears." },
      { property: "og:title", content: "Rotich rental management new" },
      { property: "og:description", content: "Overview of your rental portfolio: units, occupancy, collections and arrears." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const monthKey = new Date().toISOString().slice(0, 7);
      const [{ data: units }, { data: invoices }, { data: payments }] = await Promise.all([
        supabase.from("units").select("id,status"),
        supabase.from("invoices").select("balance_remaining,total_due"),
        supabase.from("payments").select("amount_paid,payment_date"),
      ]);
      const totalUnits = units?.length ?? 0;
      const occupied = units?.filter((u: any) => u.status === "occupied").length ?? 0;
      const occupancy = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0;
      const collected =
        payments?.filter((p: any) => (p.payment_date ?? "").startsWith(monthKey)).reduce((s: number, p: any) => s + Number(p.amount_paid), 0) ?? 0;
      const arrears = invoices?.reduce((s: number, i: any) => s + Number(i.balance_remaining), 0) ?? 0;
      return { totalUnits, occupied, occupancy, collected, arrears };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id,amount_paid,payment_method,reference_no,payment_date,tenant_id,tenants(full_name)")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const { data: tenantsList } = useQuery({
    queryKey: ["dashboard-tenants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id,full_name,move_in_date,active,units(unit_number,properties(name,location))")
        .eq("active", true)
        .order("move_in_date", { ascending: true });
      return data ?? [];
    },
  });

  const tenancyDuration = (moveIn: string | null) => {
    if (!moveIn) return "—";
    const start = new Date(moveIn);
    const now = new Date();
    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months -= 1;
    if (months < 0) months = 0;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (months < 1) return `${days} day${days === 1 ? "" : "s"}`;
    if (years === 0) return `${rem} mo`;
    if (rem === 0) return `${years} yr${years === 1 ? "" : "s"}`;
    return `${years} yr${years === 1 ? "" : "s"} ${rem} mo`;
  };

  const kpis = [
    { key: "units" as const, label: "Total Units", value: stats?.totalUnits ?? 0, icon: Building2, tone: "bg-secondary/80", glow: "glow-blue" },
    { key: "occupancy" as const, label: "Occupancy Rate", value: `${stats?.occupancy ?? 0}%`, sub: `${stats?.occupied ?? 0} occupied`, icon: Users, tone: "bg-accent/80", glow: "glow-blue" },
    { key: "collected" as const, label: "Collected (This Month)", value: money(stats?.collected ?? 0), icon: DollarSign, tone: "bg-primary/15 text-primary", glow: "glow-green" },
    { key: "arrears" as const, label: "Outstanding Arrears", value: money(stats?.arrears ?? 0), icon: AlertCircle, tone: "bg-destructive/15 text-destructive", glow: "glow-red" },
  ];

  const [drill, setDrill] = useState<DrillKey>(null);
  const monthKey = new Date().toISOString().slice(0, 7);

  const { data: unitsList } = useQuery({
    queryKey: ["drill-units"],
    enabled: drill === "units" || drill === "occupancy",
    queryFn: async () => {
      const { data } = await supabase
        .from("units")
        .select("id,unit_number,rent_amount,status,properties(name,location)")
        .order("unit_number");
      return data ?? [];
    },
  });

  const { data: collectedList } = useQuery({
    queryKey: ["drill-collected", monthKey],
    enabled: drill === "collected",
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id,amount_paid,payment_method,reference_no,payment_date,tenants(full_name)")
        .gte("payment_date", `${monthKey}-01`)
        .order("payment_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: arrearsList } = useQuery({
    queryKey: ["drill-arrears"],
    enabled: drill === "arrears",
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id,month_year,balance_remaining,total_due,status,tenants(full_name,units(unit_number,properties(name,location)))")
        .gt("balance_remaining", 0)
        .order("month_year", { ascending: false });
      return data ?? [];
    },
  });

  const drillTitle: Record<Exclude<DrillKey, null>, string> = {
    units: "All Units",
    occupancy: "Occupied Units",
    collected: `Payments Collected — ${monthKey}`,
    arrears: "Tenants with Outstanding Arrears",
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card
            key={k.label}
            role="button"
            tabIndex={0}
            onClick={() => setDrill(k.key)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrill(k.key); } }}
            className={`glass-card ${k.glow} cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring`}
          >
            <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 space-y-0 p-3 pb-1 sm:p-6 sm:pb-2">
              <CardTitle className="min-w-0 text-xs font-medium leading-tight text-muted-foreground sm:text-sm">{k.label}</CardTitle>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md sm:h-8 sm:w-8 ${k.tone} ring-1 ring-inset ring-white/10`}>
                <k.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="truncate text-lg font-bold tracking-tight sm:text-2xl">{k.value}</div>
              {k.sub && <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{k.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={drill !== null} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drill ? drillTitle[drill] : ""}</DialogTitle>
          </DialogHeader>

          {(drill === "units" || drill === "occupancy") && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Property / Area</TableHead>
                  <TableHead>Rent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(unitsList ?? [])
                  .filter((u: any) => drill === "units" || u.status === "occupied")
                  .map((u: any) => {
                    const prop = u.properties;
                    const area = prop ? [prop.name, prop.location].filter(Boolean).join(" · ") : "—";
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.unit_number}</TableCell>
                        <TableCell className="text-muted-foreground">{area}</TableCell>
                        <TableCell>{money(Number(u.rent_amount))}</TableCell>
                        <TableCell>
                          <Badge variant={u.status === "occupied" ? "default" : "outline"} className="uppercase">{u.status}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {unitsList && unitsList.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No units.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {drill === "collected" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(collectedList ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.payment_date}</TableCell>
                    <TableCell className="font-medium">{p.tenants?.full_name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase">{p.payment_method}</Badge></TableCell>
                    <TableCell className="text-right font-semibold text-primary">{money(Number(p.amount_paid))}</TableCell>
                  </TableRow>
                ))}
                {collectedList && collectedList.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No payments this month.</TableCell></TableRow>
                )}
                {collectedList && collectedList.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold text-right">Total</TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {money(collectedList.reduce((s: number, p: any) => s + Number(p.amount_paid), 0))}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {drill === "arrears" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Area / Unit</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(arrearsList ?? []).map((i: any) => {
                  const prop = i.tenants?.units?.properties;
                  const area = prop ? [prop.name, prop.location].filter(Boolean).join(" · ") : "—";
                  const unit = i.tenants?.units?.unit_number;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.tenants?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{area}{unit ? ` · ${unit}` : ""}</TableCell>
                      <TableCell>{i.month_year}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{money(Number(i.balance_remaining))}</TableCell>
                    </TableRow>
                  );
                })}
                {arrearsList && arrearsList.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No outstanding arrears.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild className="glass-btn glow-green">
            <Link to="/payments"><Plus className="h-4 w-4" />Log Payment</Link>
          </Button>
          <Button asChild variant="outline" className="glass-btn glow-blue">
            <Link to="/meters"><Gauge className="h-4 w-4" />Add Meter Reading</Link>
          </Button>
          <Button asChild variant="outline" className="glass-btn glow-amber">
            <Link to="/billing"><FileText className="h-4 w-4" />Generate Monthly Bills</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recent ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell className="font-medium">{p.tenants?.full_name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase">{p.payment_method}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{p.reference_no ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{money(Number(p.amount_paid))}</TableCell>
                </TableRow>
              ))}
              {(!recent || recent.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No payments yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Tenants & Tenancy Duration</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Property / Area</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Move-in</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tenantsList ?? []).map((t: any) => {
                const prop = t.units?.properties;
                const area = prop ? [prop.name, prop.location].filter(Boolean).join(" · ") : "—";
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{area}</TableCell>
                    <TableCell>{t.units?.unit_number ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{t.move_in_date ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{tenancyDuration(t.move_in_date)}</TableCell>
                  </TableRow>
                );
              })}
              {(!tenantsList || tenantsList.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No active tenants yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
