import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { businessToday } from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Rent Calendar — Eden Point Real Estate" },
      { name: "description", content: "See every tenant's rent due date and payments on a calendar to plan invoicing." },
      { property: "og:title", content: "Rent Calendar — Eden Point Real Estate" },
      { property: "og:description", content: "Tenant due dates and paid amounts on a calendar." },
    ],
  }),
  component: CalendarPage,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthKey(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
function dayIso(y: number, m: number, d: number) {
  return `${monthKey(y, m)}-${String(d).padStart(2, "0")}`;
}

function CalendarPage() {
  const today = businessToday();
  const [view, setView] = useState({ y: today.y, m: today.m - 1 }); // m is 0-based here
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ["calendar-tenants"],
    staleTime: 60_000,
    queryFn: async () =>
      (
        await supabase
          .from("tenants")
          .select("id,full_name,rent_due_day,move_in_date,units(unit_number,rent_amount)")
          .eq("active", true)
      ).data ?? [],
  });

  const mk = monthKey(view.y, view.m);

  const { data: invoices } = useQuery({
    queryKey: ["calendar-invoices", mk],
    staleTime: 30_000,
    queryFn: async () =>
      (
        await supabase
          .from("invoices")
          .select("id,tenant_id,month_year,total_due,balance_remaining,status,due_date,kind")
          .eq("month_year", mk)
      ).data ?? [],
  });

  // Payments for the viewed month (by payment_date).
  const monthStart = `${mk}-01`;
  const monthEnd = dayIso(view.y, view.m, new Date(view.y, view.m + 1, 0).getDate());
  const { data: payments } = useQuery({
    queryKey: ["calendar-payments", mk],
    staleTime: 30_000,
    queryFn: async () =>
      (
        await supabase
          .from("payments")
          .select("id,tenant_id,amount_paid,payment_date,payment_method")
          .gte("payment_date", monthStart)
          .lte("payment_date", monthEnd)
      ).data ?? [],
  });

  const tenantById = useMemo(() => new Map((tenants ?? []).map((t: any) => [t.id, t])), [tenants]);

  // Map: day -> { due: tenant[], payments: payment[] }
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const dayMap = useMemo(() => {
    const map = new Map<number, { due: any[]; pays: any[] }>();
    for (let d = 1; d <= daysInMonth; d++) map.set(d, { due: [], pays: [] });
    for (const t of tenants ?? []) {
      const dueDay = (t as any).rent_due_day;
      if (!dueDay) continue;
      const d = Math.min(dueDay, daysInMonth);
      map.get(d)!.due.push(t);
    }
    for (const p of payments ?? []) {
      const d = Number((p as any).payment_date?.slice(8, 10));
      if (d >= 1 && d <= daysInMonth) map.get(d)!.pays.push(p);
    }
    return map;
  }, [tenants, payments, daysInMonth]);

  const move = (delta: number) => {
    setSelectedDay(null);
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  // Monday-first offset
  const firstWeekday = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const isThisMonth = view.y === today.y && view.m === today.m - 1;

  const monthDueTotal = useMemo(
    () => (tenants ?? []).reduce((s: number, t: any) => s + Number(t.units?.rent_amount ?? 0), 0),
    [tenants],
  );
  const monthPaidTotal = useMemo(
    () => (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount_paid ?? 0), 0),
    [payments],
  );
  const unpaidInvoices = useMemo(
    () => (invoices ?? []).filter((i: any) => Number(i.balance_remaining) > 0),
    [invoices],
  );

  const selected = selectedDay ? dayMap.get(selectedDay) : null;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Rent calendar</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => move(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="w-36 text-center text-sm font-medium">
            {MONTHS[view.m]} {view.y}
          </div>
          <Button variant="outline" size="icon" onClick={() => move(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Expected rent this month</CardTitle></CardHeader>
          <CardContent className="text-lg font-semibold">KES {monthDueTotal.toLocaleString()}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Collected this month</CardTitle></CardHeader>
          <CardContent className="text-lg font-semibold text-emerald-600">KES {monthPaidTotal.toLocaleString()}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Open invoices this month</CardTitle></CardHeader>
          <CardContent className="text-lg font-semibold text-destructive">{unpaidInvoices.length}</CardContent>
        </Card>
      </div>

      {tenantsLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading calendar…</div>
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
              {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const cell = dayMap.get(d)!;
                const paidSum = cell.pays.reduce((s: number, p: any) => s + Number(p.amount_paid ?? 0), 0);
                const isToday = isThisMonth && d === today.d;
                const isPast = isThisMonth ? d < today.d : new Date(view.y, view.m, d) < new Date(today.y, today.m - 1, today.d);
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDay(d)}
                    className={`min-h-16 rounded-lg border p-1 text-left align-top transition-colors hover:bg-accent/50 sm:min-h-20 ${
                      isToday ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className={`text-[11px] font-semibold ${isToday ? "text-primary" : isPast ? "text-muted-foreground" : ""}`}>{d}</div>
                    <div className="mt-0.5 space-y-0.5">
                      {cell.due.slice(0, 2).map((t: any) => (
                        <div key={t.id} className="truncate rounded bg-amber-500/15 px-1 text-[10px] text-amber-700 dark:text-amber-400">
                          {t.units?.unit_number ? `${t.units.unit_number} · ` : ""}{t.full_name}
                        </div>
                      ))}
                      {cell.due.length > 2 && (
                        <div className="px-1 text-[10px] text-muted-foreground">+{cell.due.length - 2} more due</div>
                      )}
                      {paidSum > 0 && (
                        <div className="truncate rounded bg-emerald-500/15 px-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          +KES {paidSum.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-500/60" /> Rent due</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-500/60" /> Payment received</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-primary" /> Today</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={selectedDay !== null} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? `${MONTHS[view.m]} ${selectedDay}, ${view.y}` : ""}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium">Rent due ({selected.due.length})</div>
                {selected.due.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No tenants due this day.</div>
                ) : (
                  <div className="space-y-2">
                    {selected.due.map((t: any) => {
                      const inv = (invoices ?? []).find(
                        (i: any) => i.tenant_id === t.id && i.kind === "rent",
                      );
                      const balance = inv ? Number(inv.balance_remaining) : null;
                      return (
                        <div key={t.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                          <div>
                            <div className="font-medium">{t.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {t.units?.unit_number ? `Unit ${t.units.unit_number} · ` : ""}
                              KES {Number(t.units?.rent_amount ?? 0).toLocaleString()}
                            </div>
                          </div>
                          {inv ? (
                            balance! > 0 ? (
                              <Badge variant="destructive">Owes KES {balance!.toLocaleString()}</Badge>
                            ) : (
                              <Badge className="bg-emerald-600 text-white">Paid</Badge>
                            )
                          ) : (
                            <Badge variant="outline">Not invoiced</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 text-sm font-medium">Payments received ({selected.pays.length})</div>
                {selected.pays.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No payments on this day.</div>
                ) : (
                  <div className="space-y-2">
                    {selected.pays.map((p: any) => {
                      const t = tenantById.get(p.tenant_id);
                      return (
                        <div key={p.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                          <div>
                            <div className="font-medium">{t?.full_name ?? "Tenant"}</div>
                            <div className="text-xs capitalize text-muted-foreground">{p.payment_method}</div>
                          </div>
                          <div className="font-medium text-emerald-600">+KES {Number(p.amount_paid).toLocaleString()}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
