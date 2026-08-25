import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, Users, DollarSign, AlertCircle, Plus, Gauge, FileText, Trash2, Download, BellRing, Receipt as ReceiptIcon, Loader2 } from "lucide-react";
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
import { useLandlordAccount } from "@/hooks/use-landlord-account";
import { SuggestedShortcuts } from "@/components/suggested-shortcuts";
import { DashboardFocus } from "@/components/dashboard-focus";
import { sendLateFeeNoticeSms, sendPaymentReceiptSms } from "@/lib/receipts.functions";
import { notifyMyTenants } from "@/lib/notify-tenants.functions";


type DrillKey = "units" | "occupancy" | "collected" | "arrears" | null;

/** Shows the landlord's unique 4-digit code that tenants use to find their units. */
function LandlordCodeCard() {
  const { data: account } = useLandlordAccount();
  if (!account?.landlord_code) return null;
  return (
    <Card className="glass-card glow-primary">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Your landlord code</p>
          <p className="text-xs text-muted-foreground">
            Share this with tenants — they enter it when registering to see only your vacant units.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border bg-background/60 px-4 py-2 text-2xl font-bold tracking-[0.35em]">
            {account.landlord_code}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(account.landlord_code ?? "");
              toast.success("Code copied");
            }}
          >
            Copy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Landlord Dashboard — Rotich Rental Management" },
      { name: "description", content: "Live view of your units, occupancy, rent collected this month and outstanding arrears." },
      { property: "og:title", content: "Landlord Dashboard — Rotich Rental Management" },
      { property: "og:description", content: "Live view of your units, occupancy, rent collected this month and outstanding arrears." },
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
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const monthKey = new Date().toISOString().slice(0, 7);
      const [{ data: units }, { data: invoices }, { data: payments }] = await Promise.all([
        supabase.from("units").select("id,status"),
        supabase.from("invoices").select("balance_remaining,total_due,month_year,due_date,tenants(rent_due_day,move_in_date)"),
        supabase.from("payments").select("amount_paid,payment_date"),
      ]);
      const totalUnits = units?.length ?? 0;
      const occupied = units?.filter((u: any) => u.status === "occupied").length ?? 0;
      const occupancy = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0;
      const collected =
        payments?.filter((p: any) => (p.payment_date ?? "").startsWith(monthKey)).reduce((s: number, p: any) => s + Number(p.amount_paid), 0) ?? 0;
      const arrears =
        invoices
          ?.filter((i: any) => isDue(i.month_year, i.tenants?.rent_due_day, i.tenants?.move_in_date, i.due_date))
          .reduce((s: number, i: any) => s + Number(i.balance_remaining), 0) ?? 0;
      return { totalUnits, occupied, occupancy, collected, arrears };
    },
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

  const { data: tenantsList } = useQuery({
    queryKey: ["dashboard-tenants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id,full_name,move_in_date,active,units(unit_number,properties(name,location))")
        .eq("active", true)
        .order("move_in_date", { ascending: true });
      return data ?? [];
    },
  });

  const tenancyDuration = (moveIn: string | null) => {
    if (!moveIn) return "—";
    const start = new Date(moveIn);
    const now = new Date();
    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months -= 1;
    if (months < 0) months = 0;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (months < 1) return `${days} day${days === 1 ? "" : "s"}`;
    if (years === 0) return `${rem} mo`;
    if (rem === 0) return `${years} yr${years === 1 ? "" : "s"}`;
    return `${years} yr${years === 1 ? "" : "s"} ${rem} mo`;
  };

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
      const { data } = await supabase
        .from("invoices")
        .select("id,month_year,balance_remaining,total_due,status,due_date,tenants(full_name,rent_due_day,move_in_date,units(unit_number,properties(name,location)))")
        .gt("balance_remaining", 0)
        .order("month_year", { ascending: false });
      // Hide invoices whose due date hasn't been reached yet — they aren't arrears.
      return (data ?? []).filter((i: any) => isDue(i.month_year, i.tenants?.rent_due_day, i.tenants?.move_in_date, i.due_date));
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
    <div className="space-y-4 sm:space-y-6">
      <LandlordCodeCard />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">

        {kpis.map((k) => (
          <Card
            key={k.label}
            role="button"
            tabIndex={0}
            onClick={() => setDrill(k.key)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrill(k.key); } }}
            className={`glass-card ${k.glow} cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring`}
          >
            <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 space-y-0 p-3 pb-1 sm:p-6 sm:pb-2">
              <CardTitle className="min-w-0 text-xs font-medium leading-tight text-muted-foreground sm:text-sm">{k.label}</CardTitle>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md sm:h-8 sm:w-8 ${k.tone} ring-1 ring-inset ring-white/10`}>
                <k.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="truncate text-lg font-bold tracking-tight sm:text-2xl">{k.value}</div>
              {k.sub && <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{k.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <DashboardFocus collected={stats?.collected ?? 0} />

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
                      <TableCell>{i.month_year}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{money(Number(i.balance_remaining))}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="glass-btn glow-amber h-8 gap-1 px-2 text-xs"
                          disabled={busyId === i.id}
                          onClick={() => remindOne(i.id)}
                        >
                          {busyId === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                          Remind
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
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

      <Card className="glass-card">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 p-4 pt-0 sm:p-6 sm:pt-0">
          <Button asChild className="glow-green bg-primary text-primary-foreground shadow-md hover:bg-primary/90">
            <Link to="/payments"><Plus className="h-4 w-4" />Log Payment</Link>
          </Button>
          <Button asChild variant="outline" className="glass-btn glow-blue">
            <Link to="/meters"><Gauge className="h-4 w-4" />Add Meter Reading</Link>
          </Button>
          <Button asChild variant="outline" className="glass-btn glow-amber">
            <Link to="/billing"><FileText className="h-4 w-4" />Generate Monthly Bills</Link>
          </Button>
          <Button asChild variant="outline" className="glass-btn glow-amber">
            <Link to="/reports"><Download className="h-4 w-4" />Download Monthly Records</Link>
          </Button>
        </CardContent>
      </Card>

      <SuggestedShortcuts />


      <Card className="glass-card">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-6 sm:pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recent ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell className="font-medium">{p.tenants?.full_name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase">{p.payment_method}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{p.reference_no ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{money(Number(p.amount_paid))}</TableCell>
                </TableRow>
              ))}
              {(!recent || recent.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No payments yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="text-base">Tenants & Tenancy Duration</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-6 sm:pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Property / Area</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Move-in</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tenantsList ?? []).map((t: any) => {
                const prop = t.units?.properties;
                const area = prop ? [prop.name, prop.location].filter(Boolean).join(" · ") : "—";
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{area}</TableCell>
                    <TableCell>{t.units?.unit_number ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{t.move_in_date ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{tenancyDuration(t.move_in_date)}</TableCell>
                  </TableRow>
                );
              })}
              {(!tenantsList || tenantsList.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No active tenants yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
