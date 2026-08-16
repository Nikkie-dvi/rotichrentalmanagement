import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Building2, Users, Wallet, ShieldAlert, TrendingUp, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/types";
import { useIsSuperAdmin } from "@/hooks/use-landlord-account";
import { getCeoAnalytics } from "@/lib/analytics.functions";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "CEO Analytics — Rotich Management Systems" },
      { name: "description", content: "Company-wide analytics: landlords, subscriptions, occupancy, collections and arrears." },
      { property: "og:title", content: "CEO Analytics — Rotich Management Systems" },
      { property: "og:description", content: "Company-wide analytics across every landlord on the platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

function Kpi({ label, value, hint, icon: Icon, glow }: { label: string; value: string; hint?: string; icon: any; glow: string }) {
  return (
    <Card className={`glass-card ${glow}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="mt-1 truncate text-xl font-bold">{value}</div>
        {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function AnalyticsPage() {
  const isSuper = useIsSuperAdmin();
  const fetchAnalytics = useServerFn(getCeoAnalytics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ceo-analytics"],
    queryFn: () => fetchAnalytics({}),
    enabled: isSuper,
    retry: false,
  });

  if (!isSuper) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" /> Main account only
          </CardTitle>
          <CardDescription>Company analytics are visible to the main account only.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Crunching numbers…
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Could not load analytics."}</p>;
  }

  const t = data.totals;
  const m = data.money;
  const occupancy = t.units ? Math.round((t.occupiedUnits / t.units) * 100) : 0;
  const peak = Math.max(1, ...data.monthly.map((x) => x.rent + x.subscription));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 className="h-6 w-6" /> CEO Analytics
        </h2>
        <p className="text-sm text-muted-foreground">How the whole platform is performing across every landlord.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Landlords" value={String(t.landlords)} hint={`${t.approvedLandlords} approved · ${t.pendingLandlords} pending`} icon={Users} glow="glow-blue" />
        <Kpi label="Monthly recurring" value={money(m.mrr)} hint={`${t.subscribersActive} active · ${t.subscribersOverdue} overdue`} icon={TrendingUp} glow="glow-green" />
        <Kpi label="Subscriptions collected" value={money(m.subscriptionCollected)} hint={`${money(m.subscriptionThisMonth)} this month`} icon={Wallet} glow="glow-green" />
        <Kpi label="Occupancy" value={`${occupancy}%`} hint={`${t.occupiedUnits}/${t.units} units`} icon={Building2} glow="glow-amber" />
        <Kpi label="Properties" value={String(t.properties)} hint={`${t.units} units total`} icon={Building2} glow="glow-blue" />
        <Kpi label="Tenants" value={String(t.activeTenants)} hint={`${t.tenants} all-time`} icon={Users} glow="glow-blue" />
        <Kpi label="Rent collected" value={money(m.rentCollectedAllTime)} hint={`${money(m.rentCollectedThisMonth)} this month`} icon={Wallet} glow="glow-green" />
        <Kpi label="Arrears outstanding" value={money(m.outstandingArrears)} hint={`${t.openTickets} open tickets`} icon={ShieldAlert} glow="glow-amber" />
      </div>

      <Card className="glass-card">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="text-base">Last 6 months</CardTitle>
          <CardDescription>Rent collected by landlords vs subscription income.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="flex h-44 items-end gap-2">
            {data.monthly.map((x) => (
              <div key={x.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end gap-1">
                  <div
                    className="w-1/2 rounded-t bg-primary/70"
                    style={{ height: `${(x.rent / peak) * 100}%` }}
                    title={`Rent ${money(x.rent)}`}
                  />
                  <div
                    className="w-1/2 rounded-t bg-emerald-500/70"
                    style={{ height: `${(x.subscription / peak) * 100}%` }}
                    title={`Subscriptions ${money(x.subscription)}`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{x.month.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-primary/70" /> Rent</span>
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-emerald-500/70" /> Subscriptions</span>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="text-base">Landlord leaderboard</CardTitle>
          <CardDescription>Ranked by rent collected through the app.</CardDescription>
        </CardHeader>
        <CardContent className="p-2 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Landlord</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Tenants</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Arrears</TableHead>
                  <TableHead>Paid until</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.landlords.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      {l.name}
                      <div className="text-xs text-muted-foreground">{l.email}</div>
                    </TableCell>
                    <TableCell className="font-mono">{l.code ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === "approved" ? "default" : l.status === "declined" ? "destructive" : "secondary"}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{l.occupied}/{l.units}</TableCell>
                    <TableCell className="text-right">{l.tenants}</TableCell>
                    <TableCell className="text-right">{money(l.rentCollected)}</TableCell>
                    <TableCell className="text-right">{money(l.arrears)}</TableCell>
                    <TableCell>{l.paidUntil ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
