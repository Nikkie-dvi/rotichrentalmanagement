import { useQuery } from "@tanstack/react-query";
import { DoorOpen, AlertCircle, Wrench, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

type Charge = { key: string; label: string; billed: number; collected: number };

async function loadKpis() {
  const month = new Date().toISOString().slice(0, 7);
  const [{ data: units }, { data: invoices }, { data: payments }, { data: tickets }] = await Promise.all([
    supabase.from("units").select("status"),
    supabase
      .from("invoices")
      .select("month_year,total_due,balance_remaining,water_amount,electricity_amount,garbage_amount,other_amount,late_penalty_amount,penalty_waived"),
    supabase.from("payments").select("amount_paid,payment_date"),
    supabase.from("maintenance_tickets").select("status,created_at,updated_at"),
  ]);
  const u = (units ?? []) as any[];
  const vacant = u.filter((x) => x.status !== "occupied").length;
  const inv = (invoices ?? []) as any[];
  const arrears = inv.reduce((s, i) => s + Math.max(0, Number(i.balance_remaining || 0)), 0);
  const noi = ((payments ?? []) as any[])
    .filter((p) => String(p.payment_date ?? "").startsWith(month))
    .reduce((s, p) => s + Number(p.amount_paid || 0), 0);

  const t = (tickets ?? []) as any[];
  const done = t.filter((x) => x.status === "resolved" || x.status === "closed");
  const avgDays = done.length
    ? done.reduce((s, x) => s + (new Date(x.updated_at).getTime() - new Date(x.created_at).getTime()), 0) /
      done.length / 86_400_000
    : null;
  const open = t.length - done.length;

  // Extra charges this month; collected share is estimated from each invoice's paid ratio.
  const defs: [string, string][] = [
    ["water_amount", "Water"],
    ["electricity_amount", "Electricity"],
    ["garbage_amount", "Garbage"],
    ["other_amount", "Other fees"],
    ["late_penalty_amount", "Late penalties"],
  ];
  const charges: Charge[] = defs.map(([key, label]) => ({ key, label, billed: 0, collected: 0 }));
  for (const i of inv.filter((x) => x.month_year === month)) {
    const total = Number(i.total_due || 0);
    const ratio = total > 0 ? Math.min(1, Math.max(0, (total - Number(i.balance_remaining || 0)) / total)) : 0;
    for (const c of charges) {
      if (c.key === "late_penalty_amount" && i.penalty_waived) continue;
      const amt = Number(i[c.key] || 0);
      c.billed += amt;
      c.collected += amt * ratio;
    }
  }
  return {
    vacancy: u.length ? Math.round((vacant / u.length) * 100) : 0,
    vacant,
    totalUnits: u.length,
    arrears,
    avgDays,
    open,
    noi,
    charges,
  };
}

export function KpiOverview() {
  const { data } = useQuery({ queryKey: ["kpi-overview"], queryFn: loadKpis, staleTime: 30_000 });
  const tiles = [
    { icon: DoorOpen, label: "Vacancy rate", value: data ? `${data.vacancy}%` : "—", sub: data ? `${data.vacant} of ${data.totalUnits} units empty` : "" },
    { icon: AlertCircle, label: "Arrears", value: data ? money(data.arrears) : "—", sub: "Unpaid across all tenants", danger: (data?.arrears ?? 0) > 0 },
    { icon: Wrench, label: "Repair turnaround", value: data?.avgDays == null ? "—" : `${data.avgDays.toFixed(1)} days`, sub: data ? `${data.open} open request${data.open === 1 ? "" : "s"}` : "" },
    { icon: TrendingUp, label: "Net operating income", value: data ? money(data.noi) : "—", sub: "Collected this month (costs not tracked)" },
  ];
  const totalBilled = data?.charges.reduce((s, c) => s + c.billed, 0) ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="glass-card">
            <CardContent className="p-3 sm:p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><t.icon className="h-3.5 w-3.5" />{t.label}</p>
              <p className={`mt-1 font-display text-lg font-semibold sm:text-xl ${t.danger ? "text-destructive" : ""}`}>{t.value}</p>
              <p className="truncate text-[11px] text-muted-foreground">{t.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="glass-card">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="text-base">Extra charges this month</CardTitle>
          <CardDescription>Billed vs collected for fees on top of rent · {money(totalBilled)} billed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
          {(data?.charges ?? []).map((c) => (
            <div key={c.key} className="flex items-center justify-between border-b pb-2 text-sm last:border-0 last:pb-0">
              <span>{c.label}</span>
              <span className="text-right">
                <span className="font-medium">{money(c.billed)}</span>
                <span className="ml-2 text-xs text-primary">{money(Math.round(c.collected))} collected</span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
