import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, XCircle, ShieldAlert, Loader2, CalendarClock, Wallet, ChevronDown, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SmsRechargeAdmin } from "@/components/sms-recharge-admin";

import { SectionSwitcher, ADMIN_TABS } from "@/components/section-switcher";
import {
  useIsSuperAdmin,
  subscriptionState,
  MONTHLY_FEE,
  PAYMENT_NUMBER,
  PAYMENT_METHODS,
  trialState,
  type LandlordAccount,

} from "@/hooks/use-landlord-account";

export const Route = createFileRoute("/_authenticated/landlords")({
  head: () => ({
    meta: [
      { title: "Landlord accounts — Rotich Management Systems" },
      { name: "description", content: "Review, approve or decline landlord accounts and their monthly subscription." },
      { property: "og:title", content: "Landlord accounts — Rotich Management Systems" },
      { property: "og:description", content: "Review, approve or decline landlord accounts and their monthly subscription." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandlordsPage,
});

type PayDraft = { amount: string; date: string; months: string; reference: string };

/** Main-account-only: how this landlord should pay their monthly fee. */
function PaymentSettingsBlock({ row }: { row: LandlordAccount }) {
  const qc = useQueryClient();
  const [number, setNumber] = useState(row.payment_number ?? "");
  const [method, setMethod] = useState(row.payment_method ?? "mpesa_send_money");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("landlord_accounts")
      .update({ payment_number: number.trim() || null, payment_method: method })
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Payment details updated");
    qc.invalidateQueries({ queryKey: ["landlord-accounts-all"] });
    qc.invalidateQueries({ queryKey: ["landlord-account"] });
  };

  return (
    <div className="mt-3 border-t pt-3">
      <div className="text-sm font-medium">Payment instructions shown to this landlord</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Payment number</Label>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={PAYMENT_NUMBER} />
        </div>
        <div>
          <Label className="text-xs">Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button size="sm" variant="outline" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save details
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubscriptionBlock({ row }: { row: LandlordAccount }) {
  const qc = useQueryClient();
  const sub = subscriptionState(row);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<PayDraft>({
    amount: String(row.monthly_fee ?? MONTHLY_FEE),
    date: new Date().toISOString().slice(0, 10),
    months: "1",
    reference: "",
  });
  const set = (patch: Partial<PayDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const record = async () => {
    setBusy(true);
    const { error } = await supabase.from("landlord_subscription_payments").insert({
      landlord_account_id: row.id,
      amount: Number(draft.amount) || 0,
      payment_date: draft.date,
      months_covered: Math.max(1, Number(draft.months) || 1),
      reference: draft.reference || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Subscription payment recorded");
    set({ reference: "" });
    qc.invalidateQueries({ queryKey: ["landlord-accounts-all"] });
    qc.invalidateQueries({ queryKey: ["landlord-account"] });
  };

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="h-4 w-4" /> Subscription
        </div>
        <Badge variant={sub.tone === "active" ? "default" : sub.tone === "overdue" ? "destructive" : "secondary"}>
          {sub.label}
        </Badge>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>Paid until: {sub.paidUntil ? sub.paidUntil.toLocaleDateString() : "—"}</div>
        <div>
          Last payment:{" "}
          {row.last_payment_at
            ? `${money(Number(row.last_payment_amount ?? 0))} on ${new Date(row.last_payment_at).toLocaleDateString()}`
            : "—"}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div>
          <Label className="text-xs">Amount</Label>
          <Input type="number" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Date paid</Label>
          <Input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Months</Label>
          <Input type="number" min={1} value={draft.months} onChange={(e) => set({ months: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">M-Pesa code</Label>
          <Input value={draft.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="e.g. TFG7..." />
        </div>
      </div>
      <Button size="sm" className="mt-2" disabled={busy} onClick={record}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        Record payment
      </Button>

      <PaymentSettingsBlock row={row} />
    </div>
  );
}

function Row({ row }: { row: LandlordAccount }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const setStatus = async (status: "approved" | "declined" | "pending") => {
    setBusy(true);
    const { error } = await supabase
      .from("landlord_accounts")
      .update({
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
        declined_reason: status === "declined" ? (reason || null) : null,
      })
      .eq("id", row.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      status === "approved" ? "Landlord approved" : status === "declined" ? "Landlord declined" : "Set back to pending",
    );
    qc.invalidateQueries({ queryKey: ["landlord-accounts-all"] });
    qc.invalidateQueries({ queryKey: ["landlord-account"] });
  };

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{row.email ?? row.full_name ?? "Landlord"}</div>
          {row.landlord_code && (
            <div className="text-xs font-mono tracking-widest text-muted-foreground">#{row.landlord_code}</div>
          )}
        </div>
        {row.status === "pending" && trialState(row).active && (
          <Badge variant="outline" className="shrink-0">
            Trial · {trialState(row).daysLeft}d
          </Badge>
        )}
        <Badge variant={row.status === "approved" ? "default" : row.status === "declined" ? "destructive" : "secondary"}>
          {row.status}
        </Badge>

        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t p-4 pt-3">
          <div className="text-sm font-medium">{row.full_name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">
            Registered {new Date(row.created_at).toLocaleDateString()} · Fee {money(Number(row.monthly_fee))}/month
          </div>
          {row.status === "declined" && row.declined_reason && (
            <p className="mt-2 text-xs text-muted-foreground">Reason: {row.declined_reason}</p>
          )}

          <SubscriptionBlock row={row} />

          <div className="mt-3 flex flex-wrap items-end gap-2">
            {row.status !== "approved" && (
              <Button size="sm" disabled={busy} onClick={() => setStatus("approved")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve
              </Button>
            )}
            {row.status !== "declined" && (
              <>
                <div className="min-w-40 flex-1">
                  <Label className="text-xs">Decline reason (optional)</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. payment not received"
                  />
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("declined")}>
                  <XCircle className="h-4 w-4" /> Decline
                </Button>
              </>
            )}
            {row.status !== "pending" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus("pending")}>
                Set pending
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function List({ rows }: { rows: LandlordAccount[] }) {
  return rows.length === 0 ? (
    <p className="p-4 text-sm text-muted-foreground">Nothing here yet.</p>
  ) : (
    <div className="space-y-2">
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
    </div>
  );
}

function LandlordsPage() {
  const isSuper = useIsSuperAdmin();
  const [query, setQuery] = useState("");

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["landlord-accounts-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landlord_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LandlordAccount[];
    },
  });


  if (!isSuper) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" /> Main account only
          </CardTitle>
          <CardDescription>Only the main account can review landlord registrations.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = (accounts ?? []).filter((a) =>
    !q
      ? true
      : [a.email, a.full_name, a.landlord_code, a.payment_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
  );
  const pending = visible.filter((a) => a.status === "pending");
  const approved = visible.filter((a) => a.status === "approved");
  const declined = visible.filter((a) => a.status === "declined");



  return (
    <div className="space-y-4">
      <SectionSwitcher items={ADMIN_TABS} />
      <div>
        <h1 className="text-2xl font-semibold">Landlord accounts</h1>
        <p className="text-sm text-muted-foreground">
          New landlords stay locked out until you confirm them. They are shown to send {money(MONTHLY_FEE)} monthly to{" "}
          {PAYMENT_NUMBER}.
        </p>
      </div>

      <SmsRechargeAdmin />



      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email, name or code"
              aria-label="Search landlord accounts"
              className="pl-9"
            />
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="pending">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
                <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
                <TabsTrigger value="declined">Declined ({declined.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="pending" className="mt-4">
                <List rows={pending} />
              </TabsContent>
              <TabsContent value="approved" className="mt-4">
                <List rows={approved} />
              </TabsContent>
              <TabsContent value="declined" className="mt-4">
                <List rows={declined} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
