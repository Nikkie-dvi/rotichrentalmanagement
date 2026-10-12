import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, Users, DollarSign, AlertCircle, Plus, Gauge, FileText, Trash2, Download, MessageSquareText, DoorOpen, ArrowDownLeft, Eye, EyeOff, ReceiptText, Zap, Droplets, Shield, BellRing, Receipt as ReceiptIcon, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { loadTenantLedgers } from "@/lib/dashboard-ledgers";
import { HomeExtraCharges } from "@/components/home-extra-charges";
import { SuggestedShortcuts } from "@/components/suggested-shortcuts";
import { DashboardFocus } from "@/components/dashboard-focus";
import { SimplePropertyPerformance } from "@/components/property-performance";
import { KpiOverview } from "@/components/kpi-overview";
import { sendLateFeeNoticeSms, sendPaymentReceiptSms } from "@/lib/receipts.functions";
import { useIsPropertyManager, useLandlordAccount } from "@/hooks/use-landlord-account";
import { notifyMyTenants } from "@/lib/notify-tenants.functions";


type DrillKey = "units" | "occupancy" | "collected" | "arrears" | null;

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Landlord Dashboard — Rotich Rental Management" },
      { name: "description", content: "Live view of your units, occupancy, rent collected this month and outstanding arrears." },
      { property: "og:title", content: "Landlord Dashboard — Rotich Rental Management" },
      { property: "og:description", content: "Live view of your units, occupancy, rent collected this month and outstanding arrears." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Landlord Dashboard — Rotich Rental Management" },
      { name: "twitter:description", content: "Live view of your units, occupancy, rent collected this month and outstanding arrears." },
      { name: "robots", content: "noindex" },
    ],
  }),

  component: Dashboard,
});

// One rule everywhere: if an invoice exists and still has a balance, it is
// arrears. No extra due-date filtering here, otherwise the dashboard, the
// Tenants page and the tenant portal disagree with each other.



function Dashboard() {
  const { data: account } = useLandlordAccount();
  const isManager = useIsPropertyManager();
  const [hideAmount, setHideAmount] = useState(false);
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const monthKey = new Date().toISOString().slice(0, 7);
      const [{ data: units }, { data: payments }, ledgers] = await Promise.all([
        supabase.from("units").select("id,status"),
        supabase.from("payments").select("amount_paid,payment_date"),
        loadTenantLedgers(),
      ]);
      const totalUnits = units?.length ?? 0;
      const occupied = units?.filter((u: any) => u.status === "occupied").length ?? 0;
      const occupancy = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0;
      const collected =
        payments?.filter((p: any) => (p.payment_date ?? "").startsWith(monthKey)).reduce((s: number, p: any) => s + Number(p.amount_paid), 0) ?? 0;
      // Same rule as the Tenants page and tenant portal.
      const arrears = ledgers.reduce((s, l) => s + l.ledger.arrears, 0);
      return { totalUnits, occupied, occupancy, collected, arrears };
    },
    // Money must never come from a device's saved offline copy.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });




  const { data: recent } = useQuery({
    queryKey: ["recent-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id,amount_paid,payment_method,reference_no,payment_date,tenant_id,tenants(full_name)")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  // Per-tenant arrears, reused by the property performance card.
  const { data: arrearsByTenant } = useQuery({
    queryKey: ["tenant-arrears-map"],
    queryFn: async () => {
      const ledgers = await loadTenantLedgers();
      const m = new Map<string, number>();
      for (const l of ledgers) if (l.ledger.arrears > 0) m.set(l.tenant.id, l.ledger.arrears);
      return m;
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const kpis = [
    { key: "units" as const, label: "Total Units", value: stats?.totalUnits ?? 0, icon: Building2, tone: "bg-secondary/80", glow: "glow-blue" },
    { key: "occupancy" as const, label: "Occupancy Rate", value: `${stats?.occupancy ?? 0}%`, sub: `${stats?.occupied ?? 0} occupied`, icon: Users, tone: "bg-accent/80", glow: "glow-blue" },
    { key: "collected" as const, label: "Collected (This Month)", value: money(stats?.collected ?? 0), icon: DollarSign, tone: "bg-primary/15 text-primary", glow: "glow-green" },
    { key: "arrears" as const, label: "Outstanding Arrears", value: money(stats?.arrears ?? 0), icon: AlertCircle, tone: "bg-destructive/15 text-destructive", glow: "glow-red" },
  ];

  const [drill, setDrill] = useState<DrillKey>(null);
  const monthKey = new Date().toISOString().slice(0, 7);

  const { data: unitsList } = useQuery({
    queryKey: ["drill-units"],
    enabled: drill === "units" || drill === "occupancy",
    queryFn: async () => {
      const { data } = await supabase
        .from("units")
        .select("id,unit_number,rent_amount,status,properties(name,location)")
        .order("unit_number");
      return data ?? [];
    },
  });

  const { data: collectedList } = useQuery({
    queryKey: ["drill-collected", monthKey],
    enabled: drill === "collected",
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id,invoice_id,tenant_id,amount_paid,payment_method,reference_no,payment_date,tenants(full_name)")
        .gte("payment_date", `${monthKey}-01`)
        .order("payment_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: arrearsList } = useQuery({
    queryKey: ["drill-arrears"],
    enabled: drill === "arrears",
    queryFn: async () => {
      const [{ data }, ledgers] = await Promise.all([
        supabase
          .from("invoices")
          .select("id,tenant_id,month_year,balance_remaining,total_due,status,due_date,tenants(full_name,rent_due_day,move_in_date,units(unit_number,properties(name,location)))")
          .gt("balance_remaining", 0)
          .order("month_year", { ascending: true }),
        loadTenantLedgers(),
      ]);

      // Group the open invoices per tenant (oldest first).
      const byTenant = new Map<string, any[]>();
      for (const inv of (data ?? []) as any[]) {
        const list = byTenant.get(inv.tenant_id) ?? [];
        list.push(inv);
        byTenant.set(inv.tenant_id, list);
      }

      // The rows must add up to exactly the same number as the KPI card, so we
      // spend each tenant's ledger arrears across their open invoices (oldest
      // first) and show whatever is left over as "not invoiced yet".
      const rows: any[] = [];
      for (const { tenant, ledger } of ledgers) {
        let remaining = Math.round(ledger.arrears);
        if (remaining <= 0) continue;
        for (const inv of byTenant.get(tenant.id) ?? []) {
          if (remaining <= 0) break;
          const show = Math.min(Math.round(Number(inv.balance_remaining ?? 0)), remaining);
          if (show <= 0) continue;
          remaining -= show;
          rows.push({ ...inv, balance_remaining: show });
        }
        if (remaining > 1) {
          rows.push({
            id: `unbilled-${tenant.id}`,
            unbilled: true,
            tenant_id: tenant.id,
            month_year: "Not invoiced yet",
            balance_remaining: remaining,
            total_due: remaining,
            tenants: tenant,
          });
        }
      }
      rows.sort((a, b) => String(b.month_year).localeCompare(String(a.month_year)));
      return rows;
    },
  });




  const qc = useQueryClient();
  const deleteInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      // Keep payment history, just unlink it from the invoice being removed.
      await supabase.from("payments").update({ invoice_id: null }).eq("invoice_id", invoiceId);
      await supabase.from("mpesa_transactions").update({ invoice_id: null }).eq("invoice_id", invoiceId);
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Invoice removed — arrears rolled back");
    },
    onError: (e: any) => toast.error(e.message),
  });



  const deletePayment = useMutation({
    mutationFn: async (p: any) => {
      const amount = Number(p.amount_paid);
      if (p.invoice_id) {
        const { data: inv } = await supabase
          .from("invoices")
          .select("id,total_due,balance_remaining")
          .eq("id", p.invoice_id)
          .maybeSingle();
        if (inv) {
          const restored = Math.min(Number(inv.total_due), Number(inv.balance_remaining) + amount);
          const { error: uErr } = await supabase
            .from("invoices")
            .update({
              balance_remaining: restored,
              status: restored <= 0 ? "paid" : restored >= Number(inv.total_due) ? "unpaid" : "partial",
            })
            .eq("id", inv.id);
          if (uErr) throw uErr;
        }
      }
      const { error } = await supabase.from("payments").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Payment removed - collected total updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // One-tap reminders / receipts straight from the dashboard drill-downs.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notifyingAll, setNotifyingAll] = useState(false);

  const remindOne = async (invoiceId: string) => {
    setBusyId(invoiceId);
    try {
      await sendLateFeeNoticeSms({ data: { invoiceId } });
      toast.success("Reminder texted to the tenant");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the reminder");
    } finally {
      setBusyId(null);
    }
  };

  const remindAllArrears = async () => {
    setNotifyingAll(true);
    try {
      const res: any = await notifyMyTenants({
        data: {
          title: "Rent arrears reminder",
          body: "You have an outstanding rent balance. Kindly clear it as soon as possible to avoid a late fee.",
          audience: "overdue",
          push: true,
          sms: true,
        },
      });
      if (res.recipients === 0) toast.info("No tenants with arrears to notify");
      else
        toast.success(
          `Notified ${res.recipients} tenant(s) — ${res.sent} app alert(s) + ${res.smsSent} SMS`,
          { description: res.smsSkippedNoCredit ? `${res.smsSkippedNoCredit} skipped (no SMS credit)` : undefined },
        );
    } catch (e: any) {
      toast.error(e?.message ?? "Could not notify tenants");
    } finally {
      setNotifyingAll(false);
    }
  };

  const textReceipt = async (p: any) => {
    setBusyId(p.id);
    try {
      await sendPaymentReceiptSms({
        data: {
          tenantId: p.tenant_id ?? p.tenants?.id,
          amount: Number(p.amount_paid),
          paymentDate: p.payment_date,
          method: p.payment_method,
          reference: p.reference_no ?? null,
        },
      });
      toast.success("Receipt texted to the tenant");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the receipt");
    } finally {
      setBusyId(null);
    }
  };


  const drillTitle: Record<Exclude<DrillKey, null>, string> = {
    units: "All Units",
    occupancy: "Occupied Units",
    collected: `Payments Collected — ${monthKey}`,
    arrears: "Tenants with Outstanding Arrears",
  };

  return (
    <div className="space-y-7">
      <section className="flex items-end justify-between gap-4 pt-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">My properties</p>
          <h2 className="mt-1 text-lg font-semibold">{account?.full_name?.split(" ")[0] ? `${account.full_name.split(" ")[0]}'s rentals` : "My rentals"}</h2>
          <Button variant="ghost" className="mt-1 h-7 gap-1 px-0 text-xs text-muted-foreground" onClick={() => setDrill("units")}><Building2 className="h-3.5 w-3.5" />{stats?.totalUnits ?? 0} units · {stats?.occupancy ?? 0}% occupied</Button>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-xs text-muted-foreground">Collected this month</p>
          <div className="mt-1 flex items-center justify-end gap-1">
            <Button variant="ghost" className="h-auto whitespace-normal px-0 py-0 text-xl font-semibold sm:text-3xl" onClick={() => setDrill("collected")}>{hideAmount ? "••••••" : money(stats?.collected ?? 0)}</Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setHideAmount(v => !v)} aria-label={hideAmount ? "Show collected amount" : "Hide collected amount"}>{hideAmount ? <Eye /> : <EyeOff />}</Button>
          </div>
          <Button variant="ghost" className="h-7 px-0 text-[11px] text-destructive" onClick={() => setDrill("arrears")}>{money(stats?.arrears ?? 0)} outstanding</Button>
        </div>
      </section>

      <div className="grid grid-cols-4 gap-2 sm:gap-5">
        {[
          { label: "Log payment", icon: Plus, url: "/payments", hash: "log-payment" },
          { label: "Message tenants", icon: MessageSquareText, url: "/messages", hash: undefined },
          { label: "Add property", icon: Building2, url: "/properties", hash: "add-property" },
          { label: "Add units", icon: DoorOpen, url: "/properties", hash: "add-unit" },
        ].map(action => <Button key={action.label} asChild variant="ghost" className="home-action h-auto min-w-0 flex-col gap-2 whitespace-normal px-0 py-1 text-center text-[11px] leading-tight sm:text-sm">
          <Link to={action.url} hash={action.hash}><span className="home-action-icon"><action.icon className="!h-6 !w-6" /></span><span className="min-h-8">{action.label}</span></Link>
        </Button>)}
      </div>

      <HomeExtraCharges />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Recent transactions</h2><Button asChild variant="link" className="h-auto p-0 text-xs"><Link to={isManager ? "/billing" : "/payments"}>View all</Link></Button></div>
        <div className="space-y-2">
          {(recent ?? []).map((p: any) => <div key={p.id} className="home-transaction flex min-w-0 items-center gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary"><ArrowDownLeft className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.tenants?.full_name ?? "Tenant payment"}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{p.payment_method === "mpesa" ? "M-Pesa" : p.payment_method} · {p.reference_no ?? "No reference"}</p></div>
            <div className="shrink-0 text-right"><p className="text-sm font-semibold">{money(Number(p.amount_paid))}</p><p className="mt-1 text-[11px] text-muted-foreground">{p.payment_date}</p></div>
          </div>)}
          {(!recent || recent.length === 0) && <div className="py-5 text-center text-sm text-muted-foreground">No payments yet.</div>}
        </div>
      </section>

      <Button asChild variant="outline" className="w-full"><Link to="/performance">View portfolio & analytics</Link></Button>

      <Dialog open={drill !== null} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drill ? drillTitle[drill] : ""}</DialogTitle>
          </DialogHeader>

          {(drill === "units" || drill === "occupancy") && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Property / Area</TableHead>
                  <TableHead>Rent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(unitsList ?? [])
                  .filter((u: any) => drill === "units" || u.status === "occupied")
                  .map((u: any) => {
                    const prop = u.properties;
                    const area = prop ? [prop.name, prop.location].filter(Boolean).join(" · ") : "—";
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.unit_number}</TableCell>
                        <TableCell className="text-muted-foreground">{area}</TableCell>
                        <TableCell>{money(Number(u.rent_amount))}</TableCell>
                        <TableCell>
                          <Badge variant={u.status === "occupied" ? "default" : "outline"} className="uppercase">{u.status}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {unitsList && unitsList.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No units.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {drill === "collected" && (
            <>
            <p className="mb-2 text-xs text-muted-foreground">
              Tap <span className="font-medium text-foreground">Receipt</span> on any row to text that tenant a payment
              confirmation (1.20 KES from your SMS balance).
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Receipt</TableHead>
                  <TableHead className="text-right">Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(collectedList ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.payment_date}</TableCell>
                    <TableCell className="font-medium">{p.tenants?.full_name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase">{p.payment_method}</Badge></TableCell>
                    <TableCell className="text-right font-semibold text-primary">{money(Number(p.amount_paid))}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="glass-btn glow-green h-8 gap-1 px-2 text-xs"
                        disabled={busyId === p.id}
                        onClick={() => textReceipt(p)}
                      >
                        {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ReceiptIcon className="h-3.5 w-3.5" />}
                        Receipt
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" aria-label="Remove payment" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-sm">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove this payment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {money(Number(p.amount_paid))} for {p.tenants?.full_name ?? "this tenant"} on {p.payment_date} will be
                              deleted from the collected total and added back to the invoice balance. Use this only for records
                              entered by mistake.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={deletePayment.isPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletePayment.mutate(p)}
                              disabled={deletePayment.isPending}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deletePayment.isPending ? "Removing..." : "Remove payment"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {collectedList && collectedList.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No payments this month.</TableCell></TableRow>
                )}
                {collectedList && collectedList.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold text-right">Total</TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {money(collectedList.reduce((s: number, p: any) => s + Number(p.amount_paid), 0))}
                    </TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </>
          )}

          {drill === "arrears" && (
            <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Chase these balances</p>
                <p className="text-xs text-muted-foreground">
                  Send everyone in arrears an app alert + SMS, or remind one tenant at a time.
                </p>
                <p className="mt-1 text-sm font-bold text-destructive">
                  Total outstanding: {money((arrearsList ?? []).reduce((s: number, r: any) => s + Number(r.balance_remaining ?? 0), 0))}
                </p>
              </div>

              <Button
                size="sm"
                className="glow-red bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={notifyingAll || (arrearsList ?? []).length === 0}
                onClick={remindAllArrears}
              >
                {notifyingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                Notify all tenants
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Area / Unit</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Notify</TableHead>
                  <TableHead className="text-right">Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(arrearsList ?? []).map((i: any) => {
                  const prop = i.tenants?.units?.properties;
                  const area = prop ? [prop.name, prop.location].filter(Boolean).join(" · ") : "—";
                  const unit = i.tenants?.units?.unit_number;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.tenants?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{area}{unit ? ` · ${unit}` : ""}</TableCell>
                      <TableCell>
                        {i.month_year}
                        {i.unbilled && (
                          <Badge variant="outline" className="ml-2 text-[10px]">Not invoiced</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{money(Number(i.balance_remaining))}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="glass-btn glow-amber h-8 gap-1 px-2 text-xs"
                          disabled={busyId === i.id || i.unbilled}
                          onClick={() => remindOne(i.id)}
                        >
                          {busyId === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                          Remind
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        {i.unbilled ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Delete invoice">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove this invoice?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Deletes the {i.month_year} invoice for {i.tenants?.full_name ?? "this tenant"} ({money(Number(i.total_due))}) and rolls the arrears back to what they were before it. Recorded payments are kept but unlinked.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteInvoice.mutate(i.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove invoice
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        )}
                      </TableCell>

                    </TableRow>
                  );
                })}
                {arrearsList && arrearsList.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No outstanding arrears.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            </>
          )}

        </DialogContent>
      </Dialog>

    </div>
  );
}
