// Main-account overview: who is paid up, daily sign-ups, and a quick monthly payment log.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Wallet, Users, CheckCircle2, AlertTriangle, Clock3, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { subscriptionState, trialState, MONTHLY_FEE, type LandlordAccount } from "@/hooks/use-landlord-account";

const dayKey = (d: Date) => d.toLocaleDateString("en-CA");

export function LandlordTracker({ accounts }: { accounts: LandlordAccount[] }) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [who, setWho] = useState("");
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState("1");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["landlord-sub-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landlord_subscription_payments")
        .select("id, landlord_account_id, amount, payment_date, months_covered, reference")
        .order("payment_date", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const approved = accounts.filter((a) => a.status === "approved");
  const counts = useMemo(() => {
    let paid = 0, overdue = 0, trial = 0, none = 0;
    for (const a of approved) {
      const s = subscriptionState(a);
      if (s.tone === "active" || s.tone === "due") paid++;
      else if (trialState(a).active) trial++;
      else if (s.tone === "overdue") overdue++;
      else none++;
    }
    return { paid, overdue, trial, none };
  }, [approved]);

  const today = new Date();
  const joins = useMemo(() => {
    const days: { key: string; label: string; n: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push({ key: dayKey(d), label: d.toLocaleDateString("en-KE", { day: "numeric", month: "short" }), n: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.key, i]));
    for (const a of accounts) {
      const i = idx.get(dayKey(new Date(a.created_at)));
      if (i !== undefined) days[i].n++;
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);
  const joinedToday = joins[joins.length - 1]?.n ?? 0;
  const joinedWeek = joins.slice(-7).reduce((s, d) => s + d.n, 0);
  const maxJoin = Math.max(1, ...joins.map((d) => d.n));

  const name = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a?.full_name || a?.email || a?.landlord_code || "Landlord";
  };
  const monthRows = payments.filter((p) => p.payment_date.startsWith(month));
  const monthTotal = monthRows.reduce((s, p) => s + Number(p.amount), 0);
  const paidIds = new Set(monthRows.map((p) => p.landlord_account_id));
  const unpaid = approved.filter((a) => !paidIds.has(a.id));

  const record = async () => {
    if (!who) return toast.error("Pick a landlord");
    setBusy(true);
    const { error } = await supabase.from("landlord_subscription_payments").insert({
      landlord_account_id: who,
      amount: Number(amount) || 0,
      payment_date: new Date().toISOString().slice(0, 10),
      months_covered: Math.max(1, Number(months) || 1),
      reference: ref || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Payment recorded");
    setRef("");
    qc.invalidateQueries({ queryKey: ["landlord-sub-payments"] });
    qc.invalidateQueries({ queryKey: ["landlord-accounts-all"] });
  };

  const stat = (icon: React.ReactNode, label: string, value: number | string, cls = "") => (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Landlord tracker</CardTitle>
        <CardDescription>Who is paid up, who is joining, and this month's subscription records.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stat(<CheckCircle2 className="h-3.5 w-3.5 text-success" />, "Paid up", counts.paid, "border-success/40")}
          {stat(<AlertTriangle className="h-3.5 w-3.5 text-destructive" />, "Overdue", counts.overdue, "border-destructive/40")}
          {stat(<Clock3 className="h-3.5 w-3.5" />, "On free trial", counts.trial)}
          {stat(<Users className="h-3.5 w-3.5" />, "Never paid", counts.none)}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-medium"><UserPlus className="h-4 w-4" /> Joining per day</span>
            <span className="text-xs text-muted-foreground">Today {joinedToday} · Last 7 days {joinedWeek} · Total {accounts.length}</span>
          </div>
          <div className="flex h-24 items-end gap-1">
            {joins.map((d) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-1" title={`${d.label}: ${d.n}`}>
                <span className="text-[10px] text-muted-foreground">{d.n || ""}</span>
                <div className="w-full rounded-sm bg-primary" style={{ height: `${(d.n / maxJoin) * 56 + 2}px`, opacity: d.n ? 1 : 0.2 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{joins[0]?.label}</span><span>Today</span></div>
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Monthly payments</span>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 w-40" />
          </div>
          <p className="text-xs text-muted-foreground">
            {monthRows.length} payment{monthRows.length === 1 ? "" : "s"} · {money(monthTotal)} collected · {unpaid.length} approved landlord{unpaid.length === 1 ? "" : "s"} not yet paid this month
          </p>

          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_80px_1fr_auto] sm:items-end">
            <div>
              <Label className="text-xs">Landlord</Label>
              <Select value={who} onValueChange={(v) => { setWho(v); const a = accounts.find((x) => x.id === v); setAmount(String(a?.monthly_fee ?? MONTHLY_FEE)); }}>
                <SelectTrigger><SelectValue placeholder="Choose landlord" /></SelectTrigger>
                <SelectContent>
                  {(unpaid.length ? unpaid : approved).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.full_name || a.email || a.landlord_code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label className="text-xs">Months</Label><Input type="number" min={1} value={months} onChange={(e) => setMonths(e.target.value)} /></div>
            <div><Label className="text-xs">M-Pesa code</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></div>
            <Button disabled={busy} onClick={record}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Record</Button>
          </div>

          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : monthRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded for this month.</p>
          ) : (
            <div className="max-h-72 divide-y overflow-y-auto rounded-md border text-sm">
              {monthRows.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{name(p.landlord_account_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.payment_date).toLocaleDateString()} · {p.months_covered} month{p.months_covered === 1 ? "" : "s"}{p.reference ? ` · ${p.reference}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold">{money(Number(p.amount))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
