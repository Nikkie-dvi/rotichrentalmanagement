import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SectionSwitcher, SectionPanel, FINANCE_TABS } from "@/components/section-switcher";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, Plus, Printer, Receipt, Send, Trash2 } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { sendPaymentReceiptSms } from "@/lib/receipts.functions";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments & Receipts — Rotich Management Systems" },
      { name: "description", content: "Log tenant payments across M-Pesa, bank and cash, and print receipts." },
      { property: "og:title", content: "Payments & Receipts — Rotich Management Systems" },
      { property: "og:description", content: "Log payments and generate receipts." },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("mpesa");
  const [ref, setRef] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [receipt, setReceipt] = useState<any>(null);

  // Texts the tenant a receipt for one logged payment (1.2 KES from the SMS wallet).
  const textReceipt = useMutation({
    mutationFn: async (p: any) =>
      sendPaymentReceiptSms({
        data: {
          tenantId: p.tenant_id,
          amount: Number(p.amount_paid),
          paymentDate: p.payment_date,
          method: p.payment_method === "mpesa" ? "M-Pesa" : p.payment_method === "bank" ? "Bank" : "Cash",
          reference: p.reference_no ?? null,
        },
      }),
    onSuccess: () => toast.success("Receipt texted to the tenant"),
    onError: (e: any) => toast.error(e?.message ?? "Could not send the receipt"),
  });

  const { data: tenants } = useQuery({
    queryKey: ["active-tenants-min"],
    queryFn: async () =>
      (await supabase.from("tenants").select("id,full_name,units(unit_number)").eq("active", true).order("full_name")).data ?? [],
  });

  const { data: payments } = useQuery({
    queryKey: ["payments-list"],
    queryFn: async () =>
      (await supabase
        .from("payments")
        .select("*,tenants(full_name,units(unit_number))")
        .order("created_at", { ascending: false })
        .limit(50)).data ?? [],
  });

  const { data: outstandingByTenant } = useQuery({
    queryKey: ["outstanding-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id,tenant_id,balance_remaining,month_year")
        .gt("balance_remaining", 0)
        .order("month_year");
      const map = new Map<string, any[]>();
      for (const inv of data ?? []) {
        const arr = map.get(inv.tenant_id) ?? [];
        arr.push(inv);
        map.set(inv.tenant_id, arr);
      }
      return map;
    },
  });

  const dueForTenant = useMemo(
    () => (outstandingByTenant?.get(tenantId) ?? []).reduce((s, i) => s + Number(i.balance_remaining), 0),
    [outstandingByTenant, tenantId],
  );

  const log = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Select a tenant");
      let remaining = Number(amount);
      if (remaining <= 0) throw new Error("Enter amount");
      const invoices = outstandingByTenant?.get(tenantId) ?? [];
      // Allocate across oldest outstanding invoices first
      const paymentDate = date;
      let firstInvoiceId: string | null = null;
      for (const inv of invoices) {
        if (remaining <= 0) break;
        const applied = Math.min(remaining, Number(inv.balance_remaining));
        const newBalance = Number(inv.balance_remaining) - applied;
        const status = newBalance <= 0 ? "paid" : "partial";
        const { error: uErr } = await supabase
          .from("invoices")
          .update({ balance_remaining: newBalance, status })
          .eq("id", inv.id);
        if (uErr) throw uErr;
        firstInvoiceId ??= inv.id;
        remaining -= applied;
      }
      const { data: inserted, error } = await supabase
        .from("payments")
        .insert({
          tenant_id: tenantId,
          invoice_id: firstInvoiceId,
          amount_paid: Number(amount),
          payment_method: method,
          reference_no: ref || null,
          payment_date: paymentDate,
        })
        .select("*,tenants(full_name,units(unit_number,properties(name)))")
        .single();
      if (error) throw error;
      return inserted;
    },
    onSuccess: (p) => {
      qc.invalidateQueries();
      setAmount("");
      setRef("");
      toast.success("Payment logged");
      setReceipt(p);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [deletingPayment, setDeletingPayment] = useState<any>(null);

  const removePayment = useMutation({
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
      setDeletingPayment(null);
      qc.invalidateQueries();
      toast.success("Payment removed and the invoice balance restored");
    },
    onError: (e: any) => {
      setDeletingPayment(null);
      toast.error(e.message);
    },
  });

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!tenantId) e.tenant = "Choose the tenant who paid.";
    if (!amount.trim()) e.amount = "Enter the amount received.";
    else if (!(Number(amount) > 0)) e.amount = "Amount must be greater than 0.";
    if (!date) e.date = "Pick the payment date.";
    else if (date > new Date().toISOString().slice(0, 10)) e.date = "Date can't be in the future.";
    if (method !== "cash" && !ref.trim()) e.ref = "Add the M-Pesa / bank reference.";
    else if (ref.length > 40) e.ref = "Reference is too long (max 40).";
    return e;
  }, [tenantId, amount, date, method, ref]);

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const show = (k: string) => (submitted || touched[k]) && errors[k];
  const invalidCls = (k: string) => (show(k) ? "border-destructive focus-visible:ring-destructive" : "");
  const Err = ({ k }: { k: string }) =>
    show(k) ? <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3 w-3" />{errors[k]}</p> : null;

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    log.mutate();
  };

  return (
    <div className="space-y-6">
      <SectionSwitcher items={FINANCE_TABS} />
      <SectionPanel items={FINANCE_TABS}>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Payment Ledger & Receipts</h2>
        <p className="text-sm text-muted-foreground">Log payments; balances auto-adjust across invoices.</p>
      </div>

      <Card className="glass-card glow-green">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Log New Payment</CardTitle>
          <p className="text-xs text-muted-foreground">
            Step 1: pick the tenant · Step 2: enter the amount they paid · Step 3: tap Log Payment to save and print a receipt.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <Label>Tenant</Label>
              <Select
                value={tenantId}
                onValueChange={(v) => {
                  setTenantId(v);
                  setTouched((t) => ({ ...t, tenant: true }));
                }}
              >
                <SelectTrigger className={invalidCls("tenant")}><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {(tenants ?? []).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name} — {t.units?.unit_number ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Err k="tenant" />
              {!tenantId && !show("tenant") && (
                <p className="text-xs text-muted-foreground mt-1">Start here — choose who paid.</p>
              )}
              {tenantId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Outstanding: <span className="font-semibold">{money(dueForTenant)}</span>
                </p>
              )}
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, date: true }))}
                className={invalidCls("date")}
              />
              <Err k="date" />
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
                className={invalidCls("amount")}
              />
              <Err k="amount" />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference{method === "cash" ? " (optional)" : ""}</Label>
              <Input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, ref: true }))}
                placeholder="e.g. QGH123"
                maxLength={40}
                className={invalidCls("ref")}
              />
              <Err k="ref" />
            </div>
          </div>
          {submitted && Object.keys(errors).length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
              <span>{Object.keys(errors).length} field{Object.keys(errors).length > 1 ? "s" : ""} need attention before you can log this payment.</span>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={log.isPending} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              {log.isPending ? "Saving…" : "Log Payment"}
            </Button>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle className="text-base">Payment Ledger</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payments ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell className="font-medium">{p.tenants?.full_name ?? "—"}</TableCell>
                  <TableCell>{p.tenants?.units?.unit_number ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase">{p.payment_method}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{p.reference_no ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{money(Number(p.amount_paid))}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" aria-label="View receipt" onClick={() => setReceipt(p)}><Receipt className="h-4 w-4" /></Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Text receipt to tenant"
                        onClick={() => textReceipt.mutate(p)}
                        disabled={textReceipt.isPending}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <AlertDialog
                        open={deletingPayment?.id === p.id}
                        onOpenChange={(open) => !open && setDeletingPayment(null)}
                      >
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Remove payment"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingPayment(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-sm">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove this payment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {money(Number(p.amount_paid))} for {p.tenants?.full_name ?? "this tenant"} on {p.payment_date} will be
                              deleted and the amount added back to the invoice balance. Use this only for payments logged by mistake.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={removePayment.isPending} onClick={() => setDeletingPayment(null)}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removePayment.mutate(p)}
                              disabled={removePayment.isPending}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {removePayment.isPending ? "Removing…" : "Remove payment"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!payments || payments.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No payments logged yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Payment Receipt</DialogTitle></DialogHeader>
          {receipt && (
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-lg font-bold">Rotich Management Systems Receipt</div>
                <div className="text-xs text-muted-foreground">#{String(receipt.id).slice(0, 8).toUpperCase()}</div>
              </div>
              <div className="text-sm space-y-1">
                <Row k="Date" v={receipt.payment_date} />
                <Row k="Tenant" v={receipt.tenants?.full_name ?? "—"} />
                <Row k="Unit" v={receipt.tenants?.units?.unit_number ?? "—"} />
                <Row k="Method" v={String(receipt.payment_method).toUpperCase()} />
                <Row k="Reference" v={receipt.reference_no ?? "—"} />
              </div>
              <div className="rounded-md border p-3 flex justify-between text-lg font-bold">
                <span>Amount Paid</span>
                <span className="text-primary">{money(Number(receipt.amount_paid))}</span>
              </div>
              <p className="text-xs text-center text-muted-foreground">Thank you for your payment.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / Save PDF</Button>
                <Button onClick={() => textReceipt.mutate(receipt)} disabled={textReceipt.isPending}>
                  {textReceipt.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Text receipt to tenant
                </Button>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                The SMS shows the amount paid, the balance left and any late fees still owed. Uses 1.2 KES of your SMS credit.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </SectionPanel>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}
