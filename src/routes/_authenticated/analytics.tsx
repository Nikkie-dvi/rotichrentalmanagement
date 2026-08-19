import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Building2,
  Users,
  Wallet,
  ShieldAlert,
  TrendingUp,
  Loader2,
  Download,
  Search,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money } from "@/lib/types";
import { useIsSuperAdmin } from "@/hooks/use-landlord-account";
import { getCeoAnalytics } from "@/lib/analytics.functions";
import { SubscriptionPricingPanel } from "@/components/subscription-pricing-panel";

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

type LandlordRow = {
  id: string;
  name: string;
  email: string | null;
  code: string | null;
  status: string;
  units: number;
  occupied: number;
  tenants: number;
  rentCollected: number;
  arrears: number;
  paidUntil: string | null;
};

/** Which drill-down list a KPI opens. */
type Drill = "units" | "occupancy" | "tenants" | "landlords" | "collected" | "arrears" | "subscriptions" | null;

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  glow,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: any;
  glow: string;
  onClick?: () => void;
}) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`glass-card ${glow} ${onClick ? "cursor-pointer transition-transform active:scale-[0.98] hover:-translate-y-0.5" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="mt-1 truncate text-xl font-bold">{value}</div>
        <div className="flex items-center justify-between gap-2">
          {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
          {onClick && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        </div>
      </CardContent>
    </Card>
  );
}

/** Downloads any row set as a CSV file the CEO can open in Excel/Sheets. */
function downloadCsv(filename: string, rows: Record<string, string | number | null>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const escape = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h] ?? "")).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function AnalyticsPage() {
  const isSuper = useIsSuperAdmin();
  const fetchAnalytics = useServerFn(getCeoAnalytics);
  const [drill, setDrill] = useState<Drill>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "pending" | "declined">("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["ceo-analytics"],
    queryFn: () => fetchAnalytics({}),
    enabled: isSuper,
    retry: false,
  });

  const landlords = (data?.landlords ?? []) as LandlordRow[];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return landlords.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!needle) return true;
      return [l.name, l.email, l.code].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [landlords, q, statusFilter]);

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

  const exportLandlords = () =>
    downloadCsv(
      `landlords-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((l) => ({
        Landlord: l.name,
        Email: l.email ?? "",
        Code: l.code ?? "",
        Status: l.status,
        Units: l.units,
        Occupied: l.occupied,
        Tenants: l.tenants,
        "Rent collected": l.rentCollected,
        Arrears: l.arrears,
        "Paid until": l.paidUntil ?? "",
      })),
    );

  const exportMonthly = () =>
    downloadCsv(
      `monthly-income-${new Date().toISOString().slice(0, 10)}.csv`,
      data.monthly.map((x) => ({ Month: x.month, "Rent collected": x.rent, Subscriptions: x.subscription })),
    );

  // Rows shown inside the drill-down dialog, per KPI tapped.
  const drillConfig: Record<Exclude<Drill, null>, { title: string; description: string; columns: string[]; rows: (string | number)[][] }> = {
    units: {
      title: "Units by landlord",
      description: `${t.units} units across ${t.properties} properties.`,
      columns: ["Landlord", "Units", "Occupied", "Vacant"],
      rows: [...landlords]
        .sort((a, b) => b.units - a.units)
        .map((l) => [l.name, l.units, l.occupied, l.units - l.occupied]),
    },
    occupancy: {
      title: "Occupancy by landlord",
      description: `${t.occupiedUnits} of ${t.units} units occupied (${occupancy}%).`,
      columns: ["Landlord", "Occupied", "Units", "Occupancy"],
      rows: [...landlords]
        .sort((a, b) => (b.units ? b.occupied / b.units : 0) - (a.units ? a.occupied / a.units : 0))
        .map((l) => [l.name, l.occupied, l.units, `${l.units ? Math.round((l.occupied / l.units) * 100) : 0}%`]),
    },
    tenants: {
      title: "Tenants by landlord",
      description: `${t.activeTenants} active tenants (${t.tenants} all-time).`,
      columns: ["Landlord", "Tenants", "Occupied units"],
      rows: [...landlords].sort((a, b) => b.tenants - a.tenants).map((l) => [l.name, l.tenants, l.occupied]),
    },
    landlords: {
      title: "All landlords",
      description: `${t.approvedLandlords} approved · ${t.pendingLandlords} pending.`,
      columns: ["Landlord", "Code", "Status", "Units"],
      rows: landlords.map((l) => [l.name, l.code ?? "—", l.status, l.units]),
    },
    collected: {
      title: "Rent collected by landlord",
      description: `${money(m.rentCollectedThisMonth)} collected this month.`,
      columns: ["Landlord", "Collected", "Arrears"],
      rows: [...landlords]
        .sort((a, b) => b.rentCollected - a.rentCollected)
        .map((l) => [l.name, money(l.rentCollected), money(l.arrears)]),
    },
    arrears: {
      title: "Arrears outstanding",
      description: `${money(m.outstandingArrears)} owed across the platform.`,
      columns: ["Landlord", "Arrears", "Tenants"],
      rows: [...landlords]
        .filter((l) => l.arrears > 0)
        .sort((a, b) => b.arrears - a.arrears)
        .map((l) => [l.name, money(l.arrears), l.tenants]),
    },
    subscriptions: {
      title: "Subscription status",
      description: `${money(m.mrr)} monthly recurring · ${t.subscribersOverdue} overdue.`,
      columns: ["Landlord", "Status", "Paid until"],
      rows: landlords.map((l) => [l.name, l.status, l.paidUntil ?? "not paid"]),
    },
  };

  const active = drill ? drillConfig[drill] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="h-6 w-6" /> CEO Analytics
          </h2>
          <p className="text-sm text-muted-foreground">Tap any card to dig into the numbers behind it.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportLandlords}>
          <Download className="mr-2 h-4 w-4" /> Export data
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="inline-flex w-max min-w-full">
            <TabsTrigger value="overview" className="flex-1 whitespace-nowrap">Overview</TabsTrigger>
            <TabsTrigger value="money" className="flex-1 whitespace-nowrap">Money</TabsTrigger>
            <TabsTrigger value="landlords" className="flex-1 whitespace-nowrap">Landlords</TabsTrigger>
            <TabsTrigger value="pricing" className="flex-1 whitespace-nowrap">Pricing</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Landlords" value={String(t.landlords)} hint={`${t.approvedLandlords} approved · ${t.pendingLandlords} pending`} icon={Users} glow="glow-blue" onClick={() => setDrill("landlords")} />
            <Kpi label="Monthly recurring" value={money(m.mrr)} hint={`${t.subscribersActive} active · ${t.subscribersOverdue} overdue`} icon={TrendingUp} glow="glow-green" onClick={() => setDrill("subscriptions")} />
            <Kpi label="Occupancy" value={`${occupancy}%`} hint={`${t.occupiedUnits}/${t.units} units`} icon={Building2} glow="glow-amber" onClick={() => setDrill("occupancy")} />
            <Kpi label="Units" value={String(t.units)} hint={`${t.properties} properties`} icon={Building2} glow="glow-blue" onClick={() => setDrill("units")} />
            <Kpi label="Tenants" value={String(t.activeTenants)} hint={`${t.tenants} all-time`} icon={Users} glow="glow-blue" onClick={() => setDrill("tenants")} />
            <Kpi label="Rent collected" value={money(m.rentCollectedAllTime)} hint={`${money(m.rentCollectedThisMonth)} this month`} icon={Wallet} glow="glow-green" onClick={() => setDrill("collected")} />
            <Kpi label="Subscriptions collected" value={money(m.subscriptionCollected)} hint={`${money(m.subscriptionThisMonth)} this month`} icon={Wallet} glow="glow-green" onClick={() => setDrill("subscriptions")} />
            <Kpi label="Arrears outstanding" value={money(m.outstandingArrears)} hint={`${t.openTickets} open tickets`} icon={ShieldAlert} glow="glow-amber" onClick={() => setDrill("arrears")} />
          </div>
        </TabsContent>

        <TabsContent value="money" className="mt-4 space-y-4">
          <Card className="glass-card">
            <CardHeader className="flex-row items-start justify-between gap-2 p-4 pb-2 sm:p-6 sm:pb-3">
              <div>
                <CardTitle className="text-base">Last 6 months</CardTitle>
                <CardDescription>Rent collected by landlords vs subscription income.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={exportMonthly}>
                <Download className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="flex h-44 items-end gap-2">
                {data.monthly.map((x) => (
                  <div key={x.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end gap-1">
                      <div className="w-1/2 rounded-t bg-primary/70" style={{ height: `${(x.rent / peak) * 100}%` }} title={`Rent ${money(x.rent)}`} />
                      <div className="w-1/2 rounded-t bg-emerald-500/70" style={{ height: `${(x.subscription / peak) * 100}%` }} title={`Subscriptions ${money(x.subscription)}`} />
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

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Rent collected" value={money(m.rentCollectedAllTime)} hint="all time" icon={Wallet} glow="glow-green" onClick={() => setDrill("collected")} />
            <Kpi label="This month" value={money(m.rentCollectedThisMonth)} hint="rent" icon={TrendingUp} glow="glow-green" />
            <Kpi label="Subscriptions" value={money(m.subscriptionCollected)} hint={`${money(m.subscriptionThisMonth)} this month`} icon={Wallet} glow="glow-blue" onClick={() => setDrill("subscriptions")} />
            <Kpi label="Arrears" value={money(m.outstandingArrears)} hint="outstanding" icon={ShieldAlert} glow="glow-amber" onClick={() => setDrill("arrears")} />
          </div>
        </TabsContent>

        <TabsContent value="landlords" className="mt-4 space-y-4">
          <Card className="glass-card">
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
              <CardTitle className="text-base">Landlord leaderboard</CardTitle>
              <CardDescription>Search, filter and export every landlord on the platform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-2 sm:p-6 sm:pt-0">
              <div className="flex flex-col gap-2 px-2 sm:flex-row sm:items-center sm:px-0">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search name, email or code"
                    className="pl-8"
                  />
                </div>
                <div className="-mx-1 overflow-x-auto px-1">
                  <div className="flex w-max gap-1">
                    {(["all", "approved", "pending", "declined"] as const).map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={statusFilter === s ? "default" : "outline"}
                        onClick={() => setStatusFilter(s)}
                        className="capitalize"
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={exportLandlords}>
                  <Download className="mr-2 h-4 w-4" /> CSV
                </Button>
              </div>

              <p className="px-2 text-xs text-muted-foreground sm:px-0">
                Showing {filtered.length} of {landlords.length} landlords
              </p>

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
                    {filtered.map((l) => (
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
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                          No landlords match this search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing" className="mt-4">
          <SubscriptionPricingPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(drill)} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{active?.title}</DialogTitle>
            <DialogDescription>{active?.description}</DialogDescription>
          </DialogHeader>
          {active && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {active.columns.map((c, i) => (
                        <TableHead key={c} className={i === 0 ? "" : "text-right"}>{c}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {active.rows.map((row, ri) => (
                      <TableRow key={ri}>
                        {row.map((cell, ci) => (
                          <TableCell key={ci} className={ci === 0 ? "font-medium" : "text-right"}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {active.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={active.columns.length} className="text-center text-sm text-muted-foreground">
                          Nothing to show yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    `${drill}-${new Date().toISOString().slice(0, 10)}.csv`,
                    active.rows.map((row) => Object.fromEntries(active.columns.map((c, i) => [c, row[i] ?? ""]))),
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> Download this list
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
