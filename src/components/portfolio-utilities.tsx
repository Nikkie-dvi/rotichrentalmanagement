import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Droplets, Zap, Trash2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { money } from "@/lib/types";
import { utilitySummary, type UtilityInvoice } from "@/lib/utility-summary";

export function PortfolioUtilities({ invoices, month, tenants }: { invoices: UtilityInvoice[]; month: string; tenants: { id: string; full_name: string; unit_id: string | null }[] }) {
  const [filter, setFilter] = useState("all");
  const summary = useMemo(() => utilitySummary(invoices, month), [invoices, month]);
  const names = new Map(tenants.map(t => [t.id, t.full_name]));
  const bills = (filter === "unpaid" ? summary.services.filter(i => Number(i.balance_remaining) > 0) : summary.selected).sort((a, b) => Number(b.balance_remaining) - Number(a.balance_remaining));
  return <section className="col-span-2 min-w-0 space-y-4" aria-label="Utility bills tracking">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Utility bills</h2><Button asChild size="sm" variant="outline"><Link to="/billing"><ArrowUpRight className="h-4 w-4" />Billing</Link></Button></div>
    <div className="grid grid-cols-3 gap-2">{[{ label: "Billed", amount: summary.billed }, { label: "Settled", amount: summary.settled }, { label: "Outstanding", amount: summary.outstanding }].map(m => <div key={m.label} className="min-w-0 rounded-lg border bg-card p-3"><p className="text-[11px] text-muted-foreground">{m.label}</p><p className="mt-1 break-words text-sm font-semibold tabular-nums">{money(m.amount)}</p></div>)}</div>
    <div className="rounded-lg border bg-card p-4"><div className="flex items-center gap-3 text-primary"><Zap className="h-4 w-4" /><Droplets className="h-4 w-4" /><Trash2 className="h-4 w-4" /><h3 className="text-sm font-medium text-foreground">Charges by service</h3></div>
      {summary.rows.length > 0 ? <ChartContainer config={{ billed: { label: "Billed", color: "var(--primary)" } }} className="mt-3 h-48 w-full aspect-auto"><BarChart data={summary.rows} margin={{ left: -15, right: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} width={50} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="billed" fill="var(--color-billed)" radius={[4, 4, 0, 0]} /></BarChart></ChartContainer> : <p className="py-8 text-center text-xs text-muted-foreground">No utility bills for this month.</p>}
    </div>
    <div className="flex gap-2" aria-label="Utility bill filters">{[{ id: "all", label: "This month" }, { id: "unpaid", label: "All outstanding" }].map(t => <Button key={t.id} size="sm" variant={filter === t.id ? "default" : "outline"} aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>{t.label}</Button>)}</div>
    <div className="divide-y border-y">{bills.map(i => { const outstanding = Math.max(0, Number(i.balance_remaining)); const tenantId = (i as UtilityInvoice & { tenant_id?: string }).tenant_id; return <div key={i.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{names.get(tenantId ?? "") ?? "Tenant"}</p><p className="text-xs text-muted-foreground">{i.month_year} · {money(Number(i.total_due))} billed</p></div><div className="shrink-0 text-right"><p className={`text-sm font-semibold ${outstanding ? "text-arrears-foreground" : "text-paid-ahead-foreground"}`}>{money(outstanding)}</p><p className="text-[10px] text-muted-foreground">{outstanding ? "Outstanding" : "Settled"}</p></div></div>; })}{!bills.length && <p className="py-6 text-center text-xs text-muted-foreground">No utility bills in this view.</p>}</div>
    <p className="text-[11px] text-muted-foreground">Settled includes payments and applied credit against this month's service invoices. Outstanding includes earlier unpaid service bills. Rent is excluded.</p>
  </section>;
}