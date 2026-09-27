import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { DoorOpen, AlertCircle, Wrench, TrendingUp, ChevronDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { loadTenantLedgers } from "@/lib/dashboard-ledgers";
import { money } from "@/lib/types";

type Charge = { key: string; label: string; billed: number; collected: number };
type Detail = "vacancy" | "arrears" | "repairs" | "income";

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-KE", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function previousMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function loadKpis() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth = previousMonth(month);
  const [unitsResult, invoicesResult, paymentsResult, ticketsResult, ledgers] = await Promise.all([
    supabase.from("units").select("id,unit_number,rent_amount,status,properties(name)").order("unit_number"),
    supabase.from("invoices").select("tenant_id,month_year,total_due,balance_remaining,water_amount,electricity_amount,garbage_amount,other_amount,late_penalty_amount,penalty_waived"),
    supabase.from("payments").select("id,amount_paid,payment_date,payment_method,tenants(full_name)").gte("payment_date", `${lastMonth}-01`).order("payment_date", { ascending: false }),
    supabase.from("maintenance_tickets").select("id,status,category,created_at,updated_at,tenants(full_name,units(unit_number,properties(name)))").order("created_at", { ascending: false }),
    loadTenantLedgers(),
  ]);
  for (const result of [unitsResult, invoicesResult, paymentsResult, ticketsResult]) {
    if (result.error) throw result.error;
  }

  const units = unitsResult.data ?? [];
  const vacantUnits = units.filter((unit) => unit.status !== "occupied");
  const invoices = invoicesResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const tickets = ticketsResult.data ?? [];
  const resolved = tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed");
  const openTickets = tickets.filter((ticket) => ticket.status !== "resolved" && ticket.status !== "closed");
  const avgDays = resolved.length
    ? resolved.reduce((sum, ticket) => sum + Math.max(0, new Date(ticket.updated_at).getTime() - new Date(ticket.created_at).getTime()), 0) / resolved.length / 86_400_000
    : null;

  // Allocate each tenant's actual outstanding ledger balance to their open invoices,
  // oldest first. This keeps the monthly breakdown consistent with the dashboard total.
  const invoicesByTenant = new Map<string, typeof invoices>();
  for (const invoice of invoices) {
    const group = invoicesByTenant.get(invoice.tenant_id) ?? [];
    group.push(invoice);
    invoicesByTenant.set(invoice.tenant_id, group);
  }
  const arrearsGroups = { current: 0, previous: 0, older: 0, unbilled: 0 };
  const owingTenants: { name: string; balance: number }[] = [];
  for (const { tenant, ledger } of ledgers) {
    let remaining = Math.max(0, Number(ledger.arrears));
    if (!remaining) continue;
    owingTenants.push({ name: tenant.full_name, balance: remaining });
    const tenantInvoices = [...(invoicesByTenant.get(tenant.id) ?? [])].sort((a, b) => a.month_year.localeCompare(b.month_year));
    for (const invoice of tenantInvoices) {
      const amount = Math.min(remaining, Math.max(0, Number(invoice.balance_remaining ?? 0)));
      if (!amount) continue;
      if (invoice.month_year === month) arrearsGroups.current += amount;
      else if (invoice.month_year === lastMonth) arrearsGroups.previous += amount;
      else arrearsGroups.older += amount;
      remaining -= amount;
      if (remaining <= 0) break;
    }
    arrearsGroups.unbilled += remaining;
  }
  owingTenants.sort((a, b) => b.balance - a.balance);
  const arrears = owingTenants.reduce((sum, tenant) => sum + tenant.balance, 0);
  const monthPayments = payments.filter((payment) => payment.payment_date.startsWith(month));
  const lastMonthPayments = payments.filter((payment) => payment.payment_date.startsWith(lastMonth));
  const collected = monthPayments.reduce((sum, payment) => sum + Number(payment.amount_paid), 0);
  const lastCollected = lastMonthPayments.reduce((sum, payment) => sum + Number(payment.amount_paid), 0);

  // Collected share of extra charges is an estimate based on each invoice's paid ratio.
  const defs: [string, string][] = [
    ["water_amount", "Water"], ["electricity_amount", "Electricity"],
    ["garbage_amount", "Garbage"], ["other_amount", "Other fees"], ["late_penalty_amount", "Late penalties"],
  ];
  const charges: Charge[] = defs.map(([key, label]) => ({ key, label, billed: 0, collected: 0 }));
  for (const invoice of invoices.filter((item) => item.month_year === month)) {
    const total = Number(invoice.total_due || 0);
    const ratio = total > 0 ? Math.min(1, Math.max(0, (total - Number(invoice.balance_remaining || 0)) / total)) : 0;
    for (const charge of charges) {
      if (charge.key === "late_penalty_amount" && invoice.penalty_waived) continue;
      const amount = Number(invoice[charge.key as keyof typeof invoice] || 0);
      charge.billed += amount;
      charge.collected += amount * ratio;
    }
  }
  return { month, lastMonth, vacantUnits, totalUnits: units.length, arrears, arrearsGroups, owingTenants, avgDays, openTickets, resolved, collected, lastCollected, monthPayments, charges };
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border/70 py-2 text-sm last:border-0"><span className="min-w-0 break-words text-muted-foreground">{label}</span><span className="shrink-0 text-right font-medium">{value}</span></div>;
}

export function KpiOverview() {
  const [open, setOpen] = useState<Detail | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["kpi-overview-v2"], queryFn: loadKpis, staleTime: 30_000, refetchOnWindowFocus: true });
  const tiles = [
    { key: "vacancy" as const, icon: DoorOpen, label: "Vacancy rate", value: data ? `${data.totalUnits ? Math.round(data.vacantUnits.length / data.totalUnits * 100) : 0}%` : "—", sub: data ? `${data.vacantUnits.length} of ${data.totalUnits} units vacant` : "" },
    { key: "arrears" as const, icon: AlertCircle, label: "Arrears", value: data ? money(data.arrears) : "—", sub: "Outstanding across all tenants" },
    { key: "repairs" as const, icon: Wrench, label: "Repair turnaround", value: data?.avgDays == null ? "—" : `${data.avgDays.toFixed(1)} days`, sub: data ? `${data.openTickets.length} open request${data.openTickets.length === 1 ? "" : "s"}` : "" },
    { key: "income" as const, icon: TrendingUp, label: "Net operating income", value: data ? money(data.collected) : "—", sub: "Collected this month (costs not tracked)" },
  ];
  const totalBilled = data?.charges.reduce((sum, charge) => sum + charge.billed, 0) ?? 0;

  const summary = data
    ? [
        `${data.totalUnits ? Math.round((data.vacantUnits.length / data.totalUnits) * 100) : 0}% vacant`,
        `${money(data.arrears)} arrears`,
        data.avgDays == null ? null : `${data.avgDays.toFixed(1)}d repairs`,
        `${money(data.collected)} collected`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="space-y-3">
      <Card className="glass-card">
        <CardContent className="p-0">
          <Button variant="ghost" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="flex h-auto w-full min-w-0 flex-col items-stretch gap-0 whitespace-normal p-3 text-left hover:bg-muted/50 sm:p-4">
            <span className="flex items-center justify-between gap-1.5">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><TrendingUp className="h-4 w-4 shrink-0" />Key performance figures</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </span>
            <span className="mt-0.5 text-[11px] font-normal leading-snug text-muted-foreground">{summary || "Tap to see vacancy, arrears, repairs and collections"}</span>
          </Button>
        </CardContent>
      </Card>
      {expanded && (
      <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.key} className={`glass-card min-w-0 ${open === tile.key ? "border-primary" : ""}`}>
            <CardContent className="p-0">
              <Button variant="ghost" type="button" aria-expanded={open === tile.key} aria-controls="kpi-details" onClick={() => setOpen(open === tile.key ? null : tile.key)} className="flex h-auto w-full min-w-0 flex-col items-stretch gap-0 whitespace-normal p-3 text-left hover:bg-muted/50 sm:p-4">
                <span className="flex items-center justify-between gap-1.5 text-xs font-normal text-muted-foreground"><span className="flex min-w-0 items-center gap-1.5"><tile.icon className="h-3.5 w-3.5 shrink-0" />{tile.label}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open === tile.key ? "rotate-180" : ""}`} /></span>
                <span className={`mt-1 break-words font-display text-lg font-semibold sm:text-xl ${tile.key === "arrears" && (data?.arrears ?? 0) > 0 ? "text-destructive" : ""}`}>{tile.value}</span>
                <span className="mt-0.5 text-[11px] font-normal leading-snug text-muted-foreground">{tile.sub}</span>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {open && (
        <div id="kpi-details" className="border-t border-border bg-background py-3" aria-live="polite">
          <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{tiles.find((tile) => tile.key === open)?.label}</h3><Button variant="ghost" size="sm" onClick={() => setOpen(null)}>Close</Button></div>
          {isPending && <p className="text-sm text-muted-foreground">Loading details…</p>}
          {isError && <div className="text-sm text-destructive">Could not load details. <Button variant="link" onClick={() => refetch()}>Try again</Button></div>}
          {data && open === "vacancy" && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Vacant units by property</p>
              {data.vacantUnits.length ? data.vacantUnits.map((unit) => <DetailRow key={unit.id} label={`${unit.properties?.name ?? "Property"} · ${unit.unit_number}`} value={money(Number(unit.rent_amount ?? 0)) + " / month"} />) : <p className="py-2 text-sm text-muted-foreground">All units are occupied.</p>}
              <Button variant="link" asChild className="px-0"><Link to="/properties">View properties <ArrowRight /></Link></Button>
            </div>
          )}
          {data && open === "arrears" && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Balances still outstanding, grouped by invoice month</p>
              <DetailRow label={`This month · ${monthLabel(data.month)}`} value={money(data.arrearsGroups.current)} />
              <DetailRow label={`Last month · ${monthLabel(data.lastMonth)}`} value={money(data.arrearsGroups.previous)} />
              <DetailRow label="Older months" value={money(data.arrearsGroups.older)} />
              {data.arrearsGroups.unbilled > 0 && <DetailRow label="Not invoiced yet" value={money(data.arrearsGroups.unbilled)} />}
              <p className="pt-3 text-xs font-medium text-muted-foreground">Tenants with a balance</p>
              {data.owingTenants.length ? data.owingTenants.slice(0, 6).map((tenant, index) => <DetailRow key={`${tenant.name}-${index}`} label={tenant.name} value={money(tenant.balance)} />) : <p className="py-2 text-sm text-muted-foreground">No outstanding balances.</p>}
              <Button variant="link" asChild className="px-0"><Link to="/tenants">View tenants <ArrowRight /></Link></Button>
            </div>
          )}
          {data && open === "repairs" && (
            <div className="space-y-1">
              <DetailRow label="Open requests" value={String(data.openTickets.length)} />
              <DetailRow label="Resolved requests" value={String(data.resolved.length)} />
              <p className="pt-3 text-xs font-medium text-muted-foreground">Requests awaiting attention</p>
              {data.openTickets.length ? data.openTickets.slice(0, 6).map((ticket) => <DetailRow key={ticket.id} label={`${ticket.tenants?.full_name ?? "Tenant"} · ${String(ticket.category).replace(/_/g, " ")}`} value={new Date(ticket.created_at).toLocaleDateString("en-KE")} />) : <p className="py-2 text-sm text-muted-foreground">No open requests.</p>}
              <Button variant="link" asChild className="px-0"><Link to="/maintenance">View repairs <ArrowRight /></Link></Button>
            </div>
          )}
          {data && open === "income" && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Collections only; expenses are not tracked, so this is not true net income.</p>
              <DetailRow label={`This month · ${monthLabel(data.month)}`} value={money(data.collected)} />
              <DetailRow label={`Last month · ${monthLabel(data.lastMonth)}`} value={money(data.lastCollected)} />
              <p className="pt-3 text-xs font-medium text-muted-foreground">Recent payments this month</p>
              {data.monthPayments.length ? data.monthPayments.slice(0, 6).map((payment) => <DetailRow key={payment.id} label={`${payment.tenants?.full_name ?? "Tenant"} · ${payment.payment_date}`} value={money(Number(payment.amount_paid))} />) : <p className="py-2 text-sm text-muted-foreground">No payments recorded this month.</p>}
              <Button variant="link" asChild className="px-0"><Link to="/payments">View payments <ArrowRight /></Link></Button>
            </div>
          )}
        </div>
      )}
      </>
      )}
      <Card className="glass-card">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="text-base">Extra charges this month</CardTitle>
          <CardDescription>Billed vs collected for fees on top of rent · {money(totalBilled)} billed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
          {(data?.charges ?? []).map((charge) => (
            <div key={charge.key} className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0 last:pb-0">
              <span>{charge.label}</span>
              <span className="text-right"><span className="font-medium">{money(charge.billed)}</span><span className="ml-2 text-xs text-primary">{money(Math.round(charge.collected))} collected</span></span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}