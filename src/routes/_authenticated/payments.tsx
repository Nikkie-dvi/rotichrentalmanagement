import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Printer, Receipt } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Payment Ledger & Receipts</h2>
        <p className="text-sm text-muted-foreground">Log payments; balances auto-adjust across invoices.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Log New Payment</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <Label>Tenant</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {(tenants ?? []).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name} — {t.units?.unit_number ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tenantId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Outstanding: <span className="font-semibold">{money(dueForTenant)}</span>
                </p>
              )}
            </div>
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Amount</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
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
            <div><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. QGH123" /></div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => log.mutate()} disabled={log.isPending}>
              <Plus className="h-4 w-4" />Log Payment
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
                    <Button size="sm" variant="ghost" onClick={() => setReceipt(p)}><Receipt className="h-4 w-4" /></Button>
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
              <Button className="w-full" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / Save PDF</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}
