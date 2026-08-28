import { useEffect, useState } from "react";
import { AlertCircle, BellRing, CalendarClock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { notifyMyTenants } from "@/lib/notify-tenants.functions";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/types";
import { notify } from "@/lib/notifications";

type ReminderItem = {
  key: string;
  tenantId: string;
  tenantName: string;
  unit?: string | null;
  property?: string | null;
  amount: number;
  kind: "overdue" | "due-today" | "upcoming";
  daysDiff: number; // negative = overdue, 0 = today, positive = upcoming
  dueDay: number;
};

const DISMISS_PREFIX = "rms.reminder.dismissed.";
const dismissKey = (item: ReminderItem) => {
  const d = new Date();
  return `${DISMISS_PREFIX}${item.tenantId}:${d.toISOString().slice(0, 10)}:${item.kind}`;
};

function wasDismissed(item: ReminderItem) {
  try {
    return sessionStorage.getItem(dismissKey(item)) === "1";
  } catch {
    return false;
  }
}

function markDismissed(items: ReminderItem[]) {
  try {
    items.forEach((i) => sessionStorage.setItem(dismissKey(i), "1"));
  } catch {}
}

type PayInfo = { method: string | null; number: string | null; note: string | null };

function payLine(p: PayInfo | null) {
  if (!p?.number) return "";
  const label =
    p.method === "mpesa_paybill" ? "M-Pesa Paybill" :
    p.method === "mpesa_till" ? "M-Pesa Till (Buy Goods)" :
    p.method === "bank" ? "Bank" : "M-Pesa Send Money";
  return ` Pay via ${label} ${p.number}.${p.note ? ` ${p.note}` : ""}`;
}

export function PaymentReminderPopup() {
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sentKeys, setSentKeys] = useState<string[]>([]);
  const [pay, setPay] = useState<PayInfo | null>(null);
  const notify_ = useServerFn(notifyMyTenants);

  useEffect(() => {
    supabase
      .from("landlord_accounts")
      .select("rent_payment_method, rent_payment_number, rent_payment_note")
      .maybeSingle()
      .then(({ data }) =>
        setPay(
          data
            ? {
                method: (data as any).rent_payment_method ?? null,
                number: (data as any).rent_payment_number ?? null,
                note: (data as any).rent_payment_note ?? null,
              }
            : null,
        ),
      );
  }, []);

  async function sendReminder(i: ReminderItem) {
    setSending(i.key);
    try {
      const first = i.tenantName.split(" ")[0];
      const title = i.kind === "overdue" ? "Rent overdue" : "Rent reminder";
      const body =
        i.kind === "overdue"
          ? `Hi ${first}, your rent of ${money(i.amount)} was due on day ${i.dueDay} and is still outstanding.${payLine(pay)} Kindly settle it now to avoid further late penalties.`
          : `Hi ${first}, your rent of ${money(i.amount)} is due ${i.kind === "due-today" ? "today" : `in ${i.daysDiff} day(s)`} (day ${i.dueDay}).${payLine(pay)} Kindly pay on time — late payments attract penalties.`;

      const res: any = await notify_({
        data: { title, body, sms: true, push: true, tenantIds: [i.tenantId], url: "/tenant/dashboard" },
      });
      if (res?.smsSkippedNoCredit > 0 && res?.smsSent === 0) {
        toast.error("Not enough SMS credit", { description: "Push alert sent, SMS skipped." });
      } else {
        toast.success(`Reminder sent to ${i.tenantName}`, {
          description: `${res?.smsSent ?? 0} SMS · ${res?.sent ?? 0} app alert(s)`,
        });
      }
      setSentKeys((k) => [...k, i.key]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the reminder");
    } finally {
      setSending(null);
    }
  }


  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, full_name, rent_due_day, active, units(unit_number, rent_amount, properties(name))")
        .eq("active", true);
      if (cancelled || !tenants) return;

      const today = new Date();
      const todayDay = today.getDate();
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

      // Get unpaid invoices for this month to detect overdue
      const monthYear = today.toISOString().slice(0, 7);
      const { data: invoices } = await supabase
        .from("invoices")
        .select("tenant_id, balance_remaining, status, month_year")
        .eq("month_year", monthYear)
        .neq("status", "paid");
      const unpaidByTenant = new Map<string, number>();
      (invoices ?? []).forEach((i: any) => unpaidByTenant.set(i.tenant_id, Number(i.balance_remaining) || 0));

      const collected: ReminderItem[] = [];
      for (const t of tenants as any[]) {
        const dueRaw: number | null = t.rent_due_day;
        if (!dueRaw) continue;
        const effectiveDue = Math.min(dueRaw, lastDay);
        const diff = effectiveDue - todayDay;
        // Days until the NEXT time rent falls due — if this month's due day has
        // already passed, roll over to next month so upcoming rent still shows.
        const nextMonthLastDay = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
        const daysUntilNext =
          diff >= 0 ? diff : lastDay - todayDay + Math.min(dueRaw, nextMonthLastDay);
        const nextDueDay = diff >= 0 ? effectiveDue : Math.min(dueRaw, nextMonthLastDay);
        const rentAmount = Number(t.units?.rent_amount ?? 0);
        const unpaidBalance = unpaidByTenant.get(t.id);

        let kind: ReminderItem["kind"] | null = null;
        let amount = rentAmount;
        let daysDiff = daysUntilNext;
        let dueDay = nextDueDay;

        if (unpaidBalance && unpaidBalance > 0 && diff <= 0) {
          kind = "overdue";
          amount = unpaidBalance;
          daysDiff = diff;
          dueDay = effectiveDue;
        } else if (daysUntilNext === 0) {
          kind = "due-today";
        } else if (daysUntilNext > 0 && daysUntilNext <= 5) {
          kind = "upcoming";
        }

        if (!kind) continue;


        const item: ReminderItem = {
          key: `${t.id}-${kind}`,
          tenantId: t.id,
          tenantName: t.full_name,
          unit: t.units?.unit_number ?? null,
          property: t.units?.properties?.name ?? null,
          amount,
          kind,
          daysDiff: diff,
          dueDay: effectiveDue,
        };
        if (!wasDismissed(item)) collected.push(item);
      }

      // Sort: overdue first, then today, then soonest upcoming
      collected.sort((a, b) => {
        const order = { overdue: 0, "due-today": 1, upcoming: 2 } as const;
        if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
        return a.daysDiff - b.daysDiff;
      });

      if (collected.length > 0) {
        setItems(collected);
        setOpen(true);
        // Also fire a system notification per item (batched summary)
        notify({
          title: `${collected.length} payment reminder${collected.length > 1 ? "s" : ""}`,
          body: collected
            .slice(0, 3)
            .map((i) => `${i.tenantName}: ${labelFor(i)}`)
            .join(" · "),
          tag: `payment-reminders-${new Date().toISOString().slice(0, 10)}`,
        });
      }
    };

    // Run shortly after mount, then every hour
    const t1 = setTimeout(run, 1500);
    const iv = setInterval(run, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearInterval(iv);
    };
  }, []);

  function dismissAll() {
    markDismissed(items);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? dismissAll() : setOpen(v))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-emerald-600" />
            Payment reminders
          </DialogTitle>
          <DialogDescription>
            {items.length} tenant{items.length === 1 ? "" : "s"} need your attention today.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {items.map((i) => (
            <li key={i.key} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{i.tenantName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[i.property, i.unit].filter(Boolean).join(" · ") || "No unit assigned"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge item={i} />
                  <Button
                    size="sm"
                    variant={i.kind === "overdue" ? "destructive" : "default"}
                    className="h-7 px-2 text-xs"
                    disabled={sending === i.key || sentKeys.includes(i.key)}
                    onClick={() => sendReminder(i)}
                  >
                    {sending === i.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1">{sentKeys.includes(i.key) ? "Sent" : "Remind"}</span>
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" /> {labelFor(i)}
                </span>
                <span className="font-semibold">{money(i.amount)}</span>
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={dismissAll}>
            Dismiss for today
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function labelFor(i: ReminderItem) {
  if (i.kind === "overdue") return `Overdue — was due day ${i.dueDay}`;
  if (i.kind === "due-today") return `Due today (day ${i.dueDay})`;
  if (i.daysDiff === 1) return `Due tomorrow (day ${i.dueDay})`;
  return `Due in ${i.daysDiff} days (day ${i.dueDay})`;
}

function StatusBadge({ item }: { item: ReminderItem }) {
  if (item.kind === "overdue")
    return (
      <Badge variant="destructive" className="shrink-0">
        <AlertCircle className="mr-1 h-3 w-3" /> Overdue
      </Badge>
    );
  if (item.kind === "due-today")
    return <Badge className="shrink-0 bg-amber-500 hover:bg-amber-500">Due today</Badge>;
  return <Badge className="shrink-0 bg-emerald-600 hover:bg-emerald-600">Upcoming</Badge>;
}
