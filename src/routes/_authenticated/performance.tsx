import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Clock, FileDown, Gauge, Wrench } from "lucide-react";
import { SectionSwitcher, SectionPanel, FINANCE_TABS } from "@/components/section-switcher";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { unitTypeLabel } from "@/lib/unit-types";
import { KpiOverview } from "@/components/kpi-overview";
import { PortfolioReports, thisMonth } from "@/components/portfolio-reports";
import { compareCollections, comparisonPeriod } from "@/lib/collection-comparison";

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({
    meta: [
      { title: "Portfolio Performance & Reports — Rotich Management Systems" },
      {
        name: "description",
        content:
          "Review portfolio occupancy, collections, arrears, payment habits, tenant issues and monthly reports in one workspace.",
      },
      { property: "og:title", content: "Portfolio Performance & Reports" },
      { property: "og:description", content: "Portfolio occupancy, collections, arrears and monthly reports in one workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerformancePage,
});

type Row = {
  type: string;
  units: number;
  occupied: number;
  rentRoll: number;
  billed: number;
  collected: number;
  arrears: number;
  tickets: number;
};

function PerformancePage() {
  const [month, setMonth] = useState(thisMonth());
  const range = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const start = `${month}-01`;
    const safeYear = year || new Date().getFullYear();
    const safeMonth = monthNumber || 1;
    const end = new Date(Date.UTC(safeYear, safeMonth, 1)).toISOString().slice(0, 10);
    return { start, end };
  }, [month]);

  const q = useQuery({
    queryKey: ["unit-performance", month],
    staleTime: 60_000,
    queryFn: async () => {
      const [units, tenants, invoices, payments, tickets] = await Promise.all([
        supabase.from("units").select("id,unit_number,unit_type,rent_amount,status,property_id"),
        supabase.from("tenants").select("id,unit_id,full_name,active"),
        supabase
          .from("invoices")
          .select("id,tenant_id,total_due,balance_remaining,due_date,month_year")
          .lte("month_year", month),
        supabase
          .from("payments")
          .select("id,tenant_id,invoice_id,amount_paid,payment_date")
           .gte("payment_date", comparisonPeriod(month).start)
          .lt("payment_date", range.end),
        supabase
          .from("maintenance_tickets")
          .select("id,tenant_id,category,status,created_at,updated_at")
          .gte("created_at", range.start)
          .lt("created_at", `${range.end}T00:00:00`),
      ]);
      for (const r of [units, tenants, invoices, payments, tickets]) if (r.error) throw r.error;
      return {
        units: units.data ?? [],
        tenants: tenants.data ?? [],
        invoices: invoices.data ?? [],
       payments: (payments.data ?? []).filter(p => p.payment_date >= range.start),
       comparisonPayments: payments.data ?? [],
        tickets: tickets.data ?? [],
      };
    },
  });

  const view = useMemo(() => {
    const d = q.data;
    if (!d) return null;

    const unitById = new Map(d.units.map((u: any) => [u.id, u]));
    const tenantUnit = new Map<string, any>();
    for (const t of d.tenants as any[]) tenantUnit.set(t.id, t.unit_id ? unitById.get(t.unit_id) : null);

    const rows = new Map<string, Row>();
    const row = (type: string) => {
      if (!rows.has(type))
        rows.set(type, { type, units: 0, occupied: 0, rentRoll: 0, billed: 0, collected: 0, arrears: 0, tickets: 0 });
      const existing = rows.get(type);
      if (existing) return existing;
      const created = { type, units: 0, occupied: 0, rentRoll: 0, billed: 0, collected: 0, arrears: 0, tickets: 0 };
      rows.set(type, created);
      return created;
    };

    for (const u of d.units as any[]) {
      const r = row(u.unit_type ?? "other");
      r.units += 1;
      r.rentRoll += Number(u.rent_amount || 0);
      if (u.status === "occupied") r.occupied += 1;
    }

    const invoiceById = new Map(d.invoices.map((i: any) => [i.id, i]));
    for (const i of d.invoices as any[]) {
      const u = tenantUnit.get(i.tenant_id);
      if (!u) continue;
      const r = row(u.unit_type ?? "other");
      r.billed += Number(i.total_due || 0);
      r.arrears += Number(i.balance_remaining || 0);
    }

    // Payment punctuality: compare payment date against the invoice due date.
    let early = 0,
      onTime = 0,
      late = 0,
      lateDaysTotal = 0;
    const perTenantLate = new Map<string, { late: number; total: number; days: number }>();

    for (const p of d.payments as any[]) {
      const u = tenantUnit.get(p.tenant_id);
      if (u) row(u.unit_type ?? "other").collected += Number(p.amount_paid || 0);

      const inv: any = p.invoice_id ? invoiceById.get(p.invoice_id) : null;
      if (!inv?.due_date || !p.payment_date) continue;
      const diff = Math.round(
        (new Date(p.payment_date).getTime() - new Date(inv.due_date).getTime()) / 86400000,
      );
      const s = perTenantLate.get(p.tenant_id) ?? { late: 0, total: 0, days: 0 };
      s.total += 1;
      if (diff < -1) early += 1;
      else if (diff <= 0) onTime += 1;
      else {
        late += 1;
        lateDaysTotal += diff;
        s.late += 1;
        s.days += diff;
      }
      perTenantLate.set(p.tenant_id, s);
    }

    const ticketsByCategory = new Map<string, { total: number; open: number; days: number; resolved: number }>();
    for (const t of d.tickets as any[]) {
      const u = tenantUnit.get(t.tenant_id);
      if (u) row(u.unit_type ?? "other").tickets += 1;
      const c = ticketsByCategory.get(t.category) ?? { total: 0, open: 0, days: 0, resolved: 0 };
      c.total += 1;
      if (t.status === "resolved" || t.status === "closed") {
        c.resolved += 1;
        c.days += Math.max(
          0,
          (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / 86400000,
        );
      } else c.open += 1;
      ticketsByCategory.set(t.category, c);
    }

    const tenantName = new Map((d.tenants as any[]).map((t) => [t.id, t.full_name]));
    const worstPayers = [...perTenantLate.entries()]
      .filter(([, s]) => s.late > 0)
      .map(([id, s]) => ({
        name: tenantName.get(id) ?? "Tenant",
        late: s.late,
        total: s.total,
        avgDays: Math.round(s.days / s.late),
      }))
      .sort((a, b) => b.late - a.late || b.avgDays - a.avgDays)
      .slice(0, 8);

    const scored = [...rows.values()].sort((a, b) => b.units - a.units);
    const totalPaid = early + onTime + late;

    return {
      comparison: compareCollections(d.comparisonPayments, month),
      vacant: d.units.filter(u => u.status === "vacant"),
      occupied: d.units.filter(u => u.status === "occupied").length,
      totalUnits: d.units.length,
      billed: d.invoices.filter(i => i.month_year === month).reduce((s, i) => s + Number(i.total_due), 0),
      arrears: d.invoices.reduce((s, i) => s + Math.max(0, Number(i.balance_remaining)), 0),
      owingTenants: new Set(d.invoices.filter(i => Number(i.balance_remaining) > 0).map(i => i.tenant_id)).size,
      vacancyRent: d.units.filter(u => u.status === "vacant").reduce((s, u) => s + Number(u.rent_amount), 0),
      rows: scored,
      worstPayers,
      punctuality: { early, onTime, late, totalPaid, avgLateDays: late ? Math.round(lateDaysTotal / late) : 0 },
      tickets: [...ticketsByCategory.entries()]
        .map(([category, c]) => ({
          category,
          ...c,
          avgResolveDays: c.resolved ? Math.round(c.days / c.resolved) : null,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }, [q.data]);

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="space-y-6">
      <SectionSwitcher items={FINANCE_TABS} />
      <SectionPanel items={FINANCE_TABS}>
      <div>
        <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Portfolio intelligence</p>
            <h1 className="mt-1 text-2xl font-bold">Portfolio Performance</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              One reliable view of occupancy, collections, arrears, payment habits, tenant issues and reports.
            </p>
          </div>
          <label className="grid shrink-0 gap-1 text-xs font-medium text-muted-foreground">
            Reporting month
            <input
              type="month"
              value={month}
              max={thisMonth()}
              onChange={(event) => setMonth(event.target.value || thisMonth())}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Portfolio performance sections">
          {[
            ["Overview", "#overview", Gauge],
            ["Payment habits", "#payments", Clock],
            ["Tenant issues", "#issues", Wrench],
            ["Reports", "#reports", FileDown],
          ].map(([label, href, Icon]) => (
            <a key={String(href)} href={String(href)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
              <Icon className="h-4 w-4 text-primary" />{String(label)}
            </a>
          ))}
        </nav>
      </div>

       {q.isError && <p role="alert" className="text-sm text-destructive">Portfolio records could not be loaded. Please refresh to try again.</p>}
       {view && <section className="space-y-4 border-b pb-6" aria-label="Portfolio analysis">
         <div><p className="text-xs font-semibold uppercase text-primary">What the figures mean</p><h2 className="mt-1 text-xl font-semibold">Your portfolio, explained</h2></div>
         <div className="grid gap-6 md:grid-cols-2">
           <div className="space-y-2"><h3 className="font-semibold">Collection pace</h3>
             <p className="text-sm leading-relaxed">{view.comparison.currentMonth ? `So far through ${view.comparison.cutoff}` : `During ${month}`} you collected <strong>{money(view.comparison.collected)}</strong> from {view.comparison.currentCount} payments. {view.comparison.currentMonth ? `By ${view.comparison.previousCutoff} last month` : `During ${view.comparison.previousMonth}`} you had collected <strong>{money(view.comparison.previousCollected)}</strong> from {view.comparison.previousCount} payments.</p>
             <p className={`text-sm font-medium ${view.comparison.difference < 0 ? "text-destructive" : "text-primary"}`}>{view.comparison.difference === 0 ? "Collections match the previous period." : `${money(Math.abs(view.comparison.difference))} ${view.comparison.difference > 0 ? "ahead of" : "behind"} the comparable period${view.comparison.percentChange === null ? "" : ` (${Math.abs(view.comparison.percentChange)}%)`}.`}</p>
             <p className="text-xs text-muted-foreground">{view.comparison.currentMonth ? "Today is still in progress. " : ""}Cash received by payment date, including prepaid rent and earlier balances; not a next-month forecast.</p>
           </div>
           <div className="space-y-2"><h3 className="font-semibold">Balances needing attention</h3>
             <p className="text-sm leading-relaxed">{money(view.billed)} was billed for {month}. Invoices through this month currently show <strong>{money(view.arrears)}</strong> unpaid across {view.owingTenants} tenant accounts.</p>
             <p className="text-sm text-muted-foreground">{view.arrears > 0 ? "Review each tenant's ledger and due date before sending a reminder. A partial payment should reduce the next reminder, and a cleared balance should stop it." : "No unpaid invoice balances are recorded through this month."}</p>
             <p className="text-xs text-muted-foreground">Balances reflect payments recorded now, not a historical month-end snapshot. Cash collected and this month's billed amount may cover different rent periods.</p>
           </div>
           <div className="space-y-2"><h3 className="font-semibold">Vacancies and rent potential</h3>
             <p className="text-sm leading-relaxed">Right now {view.occupied} of {view.totalUnits} units are occupied ({pct(view.occupied, view.totalUnits)}%). {view.vacant.length} units are marked vacant, representing <strong>{money(view.vacancyRent)}</strong> in potential monthly rent at their listed rates.</p>
             {view.vacant.length > 0 && <p className="text-sm text-muted-foreground">Vacant units: {view.vacant.map(u => u.unit_number).join(", ")}. Consider a viewing or a same-property tenant notice from My Account.</p>}
             <p className="text-xs text-muted-foreground">Current occupancy, not historical occupancy. Potential rent is not income received.</p>
           </div>
           <div className="space-y-2"><h3 className="font-semibold">Payment habits and repairs</h3>
             <p className="text-sm leading-relaxed">Of {view.punctuality.totalPaid} payments matched to due dates, {view.punctuality.early} were early, {view.punctuality.onTime} on time and {view.punctuality.late} late{view.punctuality.late ? `, averaging ${view.punctuality.avgLateDays} days late` : ""}. Payments without a matched due date are excluded.</p>
             <p className="text-sm leading-relaxed">{view.tickets.reduce((s, t) => s + t.total, 0)} repair requests were opened in {month}; {view.tickets.reduce((s, t) => s + t.open, 0)} remain open. Resolution times below use closed requests and their last update date.</p>
             <p className="text-sm text-muted-foreground">{view.tickets.some(t => t.open > 0) ? "Follow up on open requests and arrange a completion date." : "No open repair requests in this month's reported group."} True net operating income needs operating expenses, which are not currently recorded; collections are not NOI.</p>
           </div>
         </div>
       </section>}
       <div id="overview" className="scroll-mt-24">
        <h2 className="text-lg font-semibold">Unit performance</h2>
        <p className="text-sm text-muted-foreground">
          Occupancy and financial results for the selected month, grouped by room type.
        </p>
      </div>

      <Card id="payments" className="glass-card scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />By unit type
          </CardTitle>
          <CardDescription>Occupancy rate, rent roll, collections and arrears per room type.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="-mx-2 overflow-x-auto px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="w-[140px]">Occupancy</TableHead>
                  <TableHead className="text-right">Rent roll</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Arrears</TableHead>
                  <TableHead className="text-right">Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : !view?.rows.length ? (
                  <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Add units to see performance.</TableCell></TableRow>
                ) : (
                  view.rows.map((r) => (
                    <TableRow key={r.type}>
                      <TableCell className="font-medium">{unitTypeLabel(r.type)}</TableCell>
                      <TableCell className="text-right">{r.units}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={pct(r.occupied, r.units)} className="h-2" />
                          <span className="text-xs text-muted-foreground">{pct(r.occupied, r.units)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{money(r.rentRoll)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">{money(r.collected)}</TableCell>
                      <TableCell className={`text-right whitespace-nowrap ${r.arrears > 0 ? "text-destructive font-semibold" : ""}`}>{money(r.arrears)}</TableCell>
                      <TableCell className="text-right">{r.tickets}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card id="issues" className="glass-card scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />Payment habits
          </CardTitle>
          <CardDescription>Based on payments matched to an invoice due date.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Early", value: view?.punctuality.early ?? 0, glow: "glow-green" },
              { label: "On time", value: view?.punctuality.onTime ?? 0, glow: "" },
              { label: "Late", value: view?.punctuality.late ?? 0, glow: "glow-red" },
              { label: "Avg days late", value: view?.punctuality.avgLateDays ?? 0, glow: "" },
            ].map((k) => (
              <div key={k.label} className={`floating-panel rounded-xl p-3 ${k.glow}`}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-lg font-bold sm:text-xl">{q.isLoading ? "…" : k.value}</div>
                {k.label !== "Avg days late" && (
                  <div className="text-[11px] text-muted-foreground">
                    {pct(k.value, view?.punctuality.totalPaid ?? 0)}% of payments
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="-mx-2 overflow-x-auto px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-right">Late payments</TableHead>
                  <TableHead className="text-right">Of total</TableHead>
                  <TableHead className="text-right">Avg days late</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : !view?.worstPayers.length ? (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No late payments recorded. </TableCell></TableRow>
                ) : (
                  view.worstPayers.map((w) => (
                    <TableRow key={w.name}>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{w.late}</TableCell>
                      <TableCell className="text-right">{w.total}</TableCell>
                      <TableCell className="text-right">{w.avgDays}d</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <KpiOverview />
      <PortfolioReports month={month} onMonthChange={setMonth} />

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />Reports from tenants
          </CardTitle>
          <CardDescription>Maintenance issues grouped by category, with average time to resolve.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="-mx-2 overflow-x-auto px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Reported</TableHead>
                  <TableHead className="text-right">Still open</TableHead>
                  <TableHead className="text-right">Avg resolve</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : !view?.tickets.length ? (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No issues reported yet.</TableCell></TableRow>
                ) : (
                  view.tickets.map((t) => (
                    <TableRow key={t.category}>
                      <TableCell className="font-medium capitalize">{String(t.category).replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-right">{t.total}</TableCell>
                      <TableCell className="text-right">
                        {t.open > 0 ? <Badge variant="destructive">{t.open}</Badge> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right">{t.avgResolveDays === null ? "—" : `${t.avgResolveDays}d`}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </SectionPanel>
    </div>
  );
}
