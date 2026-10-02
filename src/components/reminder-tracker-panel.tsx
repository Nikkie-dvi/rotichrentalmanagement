import { useQuery } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cadenceFor, nextFollowUp, payPattern, PATTERN_LABEL, type PayPattern } from "@/lib/reminder-cadence";

const money = (n: number) => `KES ${Math.round(n).toLocaleString("en-US")}`;
const tone: Record<PayPattern, "default" | "secondary" | "destructive" | "outline"> = {
  early: "secondary", on_time: "secondary", sometimes_late: "outline", often_late: "destructive", new: "outline",
};

/** Unpaid tenants, their payment habit, reminders sent, and when the next follow-up goes out. */
export function ReminderTrackerPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["reminder-tracker"],
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: settings }, { data: open }] = await Promise.all([
        supabase.from("billing_settings").select("reminder_days_before, reminder_days_after, grace_days, rent_reminders_enabled").maybeSingle(),
        supabase.from("invoices").select("id, tenant_id, due_date, balance_remaining, tenants(full_name, active)")
          .neq("status", "paid").gt("balance_remaining", 0).not("due_date", "is", null).order("due_date"),
      ]);
      const rows = ((open ?? []) as any[]).filter((r) => r.tenants?.active !== false);
      const tids = [...new Set(rows.map((r) => r.tenant_id))];
      const ids = rows.map((r) => r.id);
      const [{ data: past }, { data: pays }, { data: logs }] = await Promise.all([
        tids.length ? supabase.from("invoices").select("tenant_id, due_date").in("tenant_id", tids).eq("kind", "rent").lt("due_date", today) : { data: [] },
        tids.length ? supabase.from("payments").select("tenant_id, payment_date").in("tenant_id", tids) : { data: [] },
        ids.length ? supabase.from("notification_logs").select("invoice_id, subject").in("invoice_id", ids).eq("channel", "sms").like("subject", "Rent reminder%") : { data: [] },
      ]);
      const s = { reminder_days_before: 5, reminder_days_after: 3, grace_days: 0, ...(settings ?? {}) } as any;
      const t0 = Date.parse(`${today}T00:00:00Z`);
      return {
        enabled: (settings as any)?.rent_reminders_enabled !== false,
        items: rows.map((r) => {
          const habit = payPattern(
            ((past ?? []) as any[]).filter((p) => p.tenant_id === r.tenant_id && p.due_date !== r.due_date).map((p) => p.due_date),
            ((pays ?? []) as any[]).filter((p) => p.tenant_id === r.tenant_id).map((p) => p.payment_date),
          );
          const mine = ((logs ?? []) as any[]).filter((l) => l.invoice_id === r.id);
          const sentAfter = mine.filter((l) => String(l.subject).includes("overdue")).length;
          const diff = Math.round((Date.parse(`${r.due_date}T00:00:00Z`) - t0) / 86400000);
          const plan = cadenceFor(habit.pattern, s);
          return { ...r, habit, sent: mine.length, diff, next: nextFollowUp(plan, diff, sentAfter), plan };
        }),
      };
    },
  });

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold"><Radar className="h-5 w-5 text-primary" /> Reminder tracker</CardTitle>
        <CardDescription>
          Reminders adjust to each tenant: late payers get follow-ups every 3 days once the grace period ends, occasional late payers every 5 days, and reliable payers just one gentle note.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /> :
          !data?.items.length ? <p className="text-sm text-muted-foreground">Everyone is paid up — no reminders needed.</p> :
          <>
            {!data.enabled && <p className="text-xs text-destructive">Automatic rent reminders are switched off, so nothing below will send.</p>}
            {data.items.slice(0, 50).map((r: any) => (
              <div key={r.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.tenants?.full_name ?? "Tenant"} · {money(Number(r.balance_remaining))}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.diff > 0 ? `Due in ${r.diff} days` : r.diff === 0 ? "Due today" : `${-r.diff} days overdue`} · {r.sent} reminder{r.sent === 1 ? "" : "s"} sent ·{" "}
                    {r.next === null ? "no more follow-ups" : r.next === 0 ? "next reminder today" : `next in ${r.next} day${r.next === 1 ? "" : "s"}`}
                  </div>
                </div>
                <Badge variant={tone[r.habit.pattern as PayPattern]} className="shrink-0">{PATTERN_LABEL[r.habit.pattern as PayPattern]}</Badge>
              </div>
            ))}
          </>}
      </CardContent>
    </Card>
  );
}
