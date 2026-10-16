import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PortfolioVisuals } from "@/components/portfolio-visuals";
import { thisMonth } from "@/components/portfolio-reports";
import { compareCollections, comparisonPeriod } from "@/lib/collection-comparison";

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({
    meta: [
      { title: "Portfolio Performance & Reports — Rotich Management Systems" },
      {
        name: "description",
        content:
          "Track rental receipts, collection trends, payment timing and occupancy with interactive portfolio statistics.",
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
          .select("id,tenant_id,total_due,balance_remaining,due_date,month_year,kind,utility_amount,water_amount,electricity_amount,garbage_amount,other_amount")
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

  return (
    <div className="portfolio-history mx-auto w-full max-w-4xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs text-muted-foreground">History</p><h1 className="text-2xl font-semibold">Portfolio Performance</h1></div>
        <label className="grid gap-1 text-[11px] text-muted-foreground">Month
          <input type="month" aria-label="Reporting month" value={month} max={thisMonth()} onChange={event => setMonth(event.target.value || thisMonth())} className="h-9 max-w-full rounded-md border border-input bg-card px-2 text-xs text-foreground" />
        </label>
      </header>
      {q.isError && <p role="alert" className="text-sm text-destructive">Portfolio records could not be loaded. Please refresh to try again.</p>}
      {q.isLoading && <div className="h-80 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading portfolio statistics" />}
      {view && <PortfolioVisuals view={view} units={q.data?.units ?? []} payments={q.data?.comparisonPayments ?? []} invoices={q.data?.invoices ?? []} tenants={q.data?.tenants ?? []} month={month} onMonthChange={setMonth} />}
    </div>
  );
}
