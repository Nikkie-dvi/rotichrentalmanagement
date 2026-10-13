import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Building2, Clock3, FileDown, ReceiptText, Wrench, ArrowUpRight, CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PortfolioBuilding, type BuildingUnit } from "@/components/portfolio-building";
import { PortfolioReports } from "@/components/portfolio-reports";
import { compareCollections } from "@/lib/collection-comparison";
import { money } from "@/lib/types";
import { unitTypeLabel } from "@/lib/unit-types";

type VisualView = {
  comparison: ReturnType<typeof compareCollections>;
  occupied: number; totalUnits: number; arrears: number; owingTenants: number; billed: number; vacancyRent: number;
  punctuality: { early: number; onTime: number; late: number; totalPaid: number; avgLateDays: number };
  rows: { type: string; units: number; occupied: number; collected: number; arrears: number; rentRoll: number }[];
  tickets: { category: string; total: number; open: number; avgResolveDays: number | null }[];
};
type Payment = { payment_date: string; amount_paid: number };
const config = {
  collected: { label: "Collected", color: "var(--primary)" },
  previous: { label: "Previous month", color: "var(--muted-foreground)" },
  early: { label: "Early", color: "var(--paid-ahead-foreground)" },
  onTime: { label: "On time", color: "var(--primary)" },
  late: { label: "Late", color: "var(--destructive)" },
  arrears: { label: "Outstanding", color: "var(--destructive)" },
  occupied: { label: "Occupied", color: "var(--primary)" },
  vacant: { label: "Vacant", color: "var(--warning)" },
  total: { label: "Reported", color: "var(--primary)" },
  open: { label: "Open", color: "var(--warning)" },
};
const percent = (n: number, total: number) => total ? Math.round(n / total * 100) : 0;
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function Ring({ value, total, tone, children }: { value: number; total: number; tone: string; children: React.ReactNode }) {
  const p = percent(value, total);
  return <span className={`portfolio-ring ${tone}`}><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" className="ring-track" /><circle cx="22" cy="22" r="18" className="ring-value" strokeDasharray={`${Math.min(100, p) * 1.131} 113.1`} /></svg><span>{children}</span></span>;
}

function PlotCard({ title, value, suffix, children, footer, className = "" }: { title: string; value: string | number; suffix?: string; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return <Card className={`portfolio-stat min-w-0 p-4 sm:p-5 ${className}`}><h2 className="text-sm font-medium text-muted-foreground">{title}</h2><p className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{value}<span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span></p>{children}{footer && <div className="mt-2 text-[11px] text-muted-foreground">{footer}</div>}</Card>;
}

export function PortfolioVisuals({ view, units, payments, month, onMonthChange }: { view: VisualView; units: BuildingUnit[]; payments: Payment[]; month: string; onMonthChange: (month: string) => void }) {
  const [tab, setTab] = useState("collection");
  const c = view.comparison;
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const daily = Array.from({ length: days }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    const sum = (date: string) => payments.filter(p => p.payment_date.slice(0, 10) === date).reduce((s, p) => s + Number(p.amount_paid), 0);
    return { day: i + 1, collected: `${month}-${day}` <= c.cutoff ? sum(`${month}-${day}`) : null, previous: `${c.previousMonth}-${day}` <= c.previousCutoff ? sum(`${c.previousMonth}-${day}`) : null };
  });
  const timing = [{ name: "Early", value: view.punctuality.early, fill: config.early.color }, { name: "On time", value: view.punctuality.onTime, fill: config.onTime.color }, { name: "Late", value: view.punctuality.late, fill: config.late.color }];
  const unitRows = view.rows.map(r => ({ ...r, type: unitTypeLabel(r.type), vacant: r.units - r.occupied }));
  const tabs = [{ id: "collection", label: "Collections", icon: ReceiptText }, { id: "timing", label: "Payment timing", icon: Clock3 }, { id: "units", label: "Units", icon: Building2 }, { id: "repairs", label: "Repairs", icon: Wrench }, { id: "reports", label: "Reports", icon: FileDown }];
  const barPlot = (data: object[], key: string, keys: string[]) => <ChartContainer config={config} className="mt-4 h-40 w-full aspect-auto"><BarChart data={data} margin={{ left: -25, right: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey={key} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} /><YAxis tickFormatter={compact} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} />{keys.map(k => <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={[3, 3, 0, 0]} />)}</BarChart></ChartContainer>;
  return <div className="space-y-4">
    <section className="grid grid-cols-[1fr_1.15fr] items-center gap-1 sm:grid-cols-2 sm:gap-8" aria-label="Portfolio snapshot">
      <div className="space-y-5 sm:space-y-7">
        {[{ label: "Occupied", value: view.occupied, total: view.totalUnits, tone: "text-primary", icon: Building2, unit: "units" }, { label: "Early / on time", value: view.punctuality.early + view.punctuality.onTime, total: view.punctuality.totalPaid, tone: "text-paid-ahead-foreground", icon: Clock3, unit: "payments" }, { label: "Receipts", value: c.currentCount, total: Math.max(c.currentCount, c.previousCount), tone: "text-warning", icon: ReceiptText, unit: "this month" }].map(m => <div key={m.label} className="flex items-center gap-2 sm:gap-3"><Ring value={m.value} total={m.total} tone={m.tone}><m.icon className="h-4 w-4" /></Ring><div className="min-w-0"><p className="text-[11px] text-muted-foreground">{m.label}</p><p className="text-xl font-semibold tabular-nums sm:text-3xl">{m.value}<span className="text-xs font-normal text-muted-foreground">{m.label === "Receipts" ? "" : ` / ${m.total}`}</span></p><p className="text-[10px] text-muted-foreground">{m.unit}</p></div></div>)}
      </div>
      <PortfolioBuilding units={units} />
    </section>
    <div className="portfolio-total flex flex-wrap items-center justify-between gap-2 px-4 py-3"><span className="flex items-center gap-2 text-sm"><CircleDollarSign className="h-5 w-5 text-primary" />Rent collected</span><span className="text-xl font-semibold tabular-nums">{money(c.collected)}</span></div>
    <nav className="portfolio-stat-tabs grid grid-cols-5 gap-1 p-2" aria-label="Rent statistics">{tabs.map(t => <Button key={t.id} variant="ghost" className={`h-16 min-w-0 flex-col gap-2 px-0 text-[9px] sm:text-xs ${tab === t.id ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}><t.icon className="!h-5 !w-5" /><span className="max-w-full whitespace-normal leading-tight">{t.label}</span></Button>)}</nav>
    <section aria-label={`${tabs.find(t => t.id === tab)?.label} statistics`} className="grid grid-cols-2 gap-3 sm:gap-4">
      {tab === "collection" && <>
        <PlotCard title="Collection activity" value={money(c.collected)} className="col-span-2" footer={<div className="flex flex-wrap justify-between gap-2"><span className="text-primary">● Selected month <span className="ml-3 text-muted-foreground">● Previous month</span></span><span>Through {c.cutoff} · Cash received</span></div>}>
          <ChartContainer config={config} className="mt-4 h-44 w-full aspect-auto"><AreaChart data={daily} margin={{ left: -16, right: 8, top: 5 }}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={22} /><YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48} /><ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <span>{name === "collected" ? "Collected" : "Previous month"}: {money(Number(value))}</span>} />} /><Area type="stepAfter" dataKey="previous" stroke="var(--color-previous)" fill="var(--color-previous)" fillOpacity={0.05} strokeDasharray="4 4" /><Area type="monotone" dataKey="collected" stroke="var(--color-collected)" fill="var(--color-collected)" fillOpacity={0.15} strokeWidth={2} /></AreaChart></ChartContainer>
        </PlotCard>
        <PlotCard title="Collection pace" value={`${c.difference >= 0 ? "+" : "−"}${compact(Math.abs(c.difference))}`} suffix="KES" footer={`vs ${c.previousMonth}, through day ${c.previousCutoff.slice(-2)}`}>{barPlot([{ name: "Previous", collected: c.previousCollected }, { name: "Now", collected: c.collected }], "name", ["collected"])}</PlotCard>
        <PlotCard title="Outstanding" value={compact(view.arrears)} suffix="KES" footer={`${view.owingTenants} tenant accounts · Current balances`}>{barPlot(unitRows, "type", ["arrears"])}</PlotCard>
        <PlotCard title="Payment timing" value={`${percent(view.punctuality.early + view.punctuality.onTime, view.punctuality.totalPaid)}%`} suffix="early / on time" footer={`${view.punctuality.totalPaid} receipts matched to due dates`}>{barPlot(timing.map(t => ({ name: t.name, total: t.value })), "name", ["total"])}</PlotCard>
        <PlotCard title="Occupancy" value={`${percent(view.occupied, view.totalUnits)}%`} footer={`${view.totalUnits - view.occupied} vacant · Current units`}>{barPlot(unitRows, "type", ["occupied", "vacant"])}</PlotCard>
      </>}
      {tab === "timing" && <>
        <PlotCard title="Payment timing" value={view.punctuality.totalPaid} suffix="matched receipts" className="col-span-2" footer="Payments without a matched invoice due date are excluded."><ChartContainer config={config} className="h-52 w-full aspect-auto"><PieChart><ChartTooltip content={<ChartTooltipContent />} /><Pie data={timing} dataKey="value" nameKey="name" innerRadius={58} outerRadius={85} paddingAngle={4}>{timing.map(t => <Cell key={t.name} fill={t.fill} />)}</Pie></PieChart></ChartContainer><div className="flex justify-around text-xs">{timing.map(t => <span key={t.name}>{t.name} <strong>{t.value}</strong></span>)}</div></PlotCard>
        <PlotCard title="Early payments" value={view.punctuality.early} suffix="receipts">{barPlot([{ name: "Early", early: view.punctuality.early }, { name: "On time", onTime: view.punctuality.onTime }, { name: "Late", late: view.punctuality.late }], "name", ["early", "onTime", "late"])}</PlotCard>
        <PlotCard title="Average delay" value={view.punctuality.avgLateDays} suffix="days late" footer={`${view.punctuality.late} late receipts`}><Clock3 className="mx-auto my-10 h-16 w-16 text-destructive/60" /></PlotCard>
      </>}
      {tab === "units" && <>
        <PlotCard title="Unit occupancy" value={`${view.occupied} / ${view.totalUnits}`} suffix="occupied" className="col-span-2" footer="Current occupancy by unit type">{barPlot(unitRows, "type", ["occupied", "vacant"])}</PlotCard>
        <PlotCard title="Collections by unit type" value={compact(c.collected)} suffix="KES">{barPlot(unitRows, "type", ["collected"])}</PlotCard>
        <PlotCard title="Vacant rent potential" value={compact(view.vacancyRent)} suffix="KES / month" footer="Listed rates · Not received income"><Building2 className="mx-auto my-10 h-16 w-16 text-warning/60" /></PlotCard>
      </>}
      {tab === "repairs" && <><PlotCard title="Repair requests" value={view.tickets.reduce((s, t) => s + t.total, 0)} suffix="reported" className="col-span-2" footer={month}>{barPlot(view.tickets, "category", ["total", "open"])}</PlotCard>{view.tickets.map(t => <PlotCard key={t.category} title={t.category.replace(/_/g, " ")} value={t.open} suffix="open" footer={t.avgResolveDays === null ? "No resolved requests" : `${t.avgResolveDays} days average resolution`}><Wrench className="mx-auto my-6 h-8 w-8 text-primary" /></PlotCard>)}</>}
      {tab === "reports" && <div className="col-span-2 min-w-0"><PortfolioReports month={month} onMonthChange={onMonthChange} /></div>}
    </section>
    {payments.length === 0 && tab !== "reports" && <p className="text-center text-xs text-muted-foreground">No payment receipts recorded for these periods.</p>}
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><ArrowUpRight className="h-3 w-3" />{c.currentMonth ? "Same-date comparison with last month" : "Full-month comparison"}</div>
  </div>;
}