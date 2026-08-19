import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, Printer, UserPlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { RecordPaymentButton } from "@/components/record-payment-button";
import { InvoiceCharges } from "@/components/invoice-charges";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Invoices — Rotich Management Systems" },
      { name: "description", content: "Generate monthly bills combining base rent and utility charges. Print or share invoices." },
      { property: "og:title", content: "Billing & Invoices — Rotich Management Systems" },
      { property: "og:description", content: "Generate and preview monthly rent invoices." },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [preview, setPreview] = useState<any>(null);
  const [singleOpen, setSingleOpen] = useState(false);
  const [singleTenant, setSingleTenant] = useState<string>("");
  const [singleMonth, setSingleMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [singleRent, setSingleRent] = useState<string>("");
  const [singleWater, setSingleWater] = useState<string>("0");
  const [singlePower, setSinglePower] = useState<string>("0");
  const [singleGarbage, setSingleGarbage] = useState<string>("0");
  const [singleOther, setSingleOther] = useState<string>("0");
  const [singleOtherLabel, setSingleOtherLabel] = useState<string>("");
  const singleExtras =
    (Number(singleWater) || 0) + (Number(singlePower) || 0) + (Number(singleGarbage) || 0) + (Number(singleOther) || 0);

  const { data: activeTenants } = useQuery({
    queryKey: ["billing-tenants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id,full_name,units(unit_number,rent_amount,properties(name))")
        .eq("active", true)
        .order("full_name");
      return data ?? [];
    },
  });

  const pickTenant = (id: string) => {
    setSingleTenant(id);
    const t: any = (activeTenants ?? []).find((x: any) => x.id === id);
    setSingleRent(String(Number(t?.units?.rent_amount ?? 0)));
  };

  const invoiceOne = useMutation({
    mutationFn: async () => {
      if (!singleTenant) throw new Error("Choose a tenant");
      const rent = Number(singleRent) || 0;
      const util = singleExtras;
      const total = rent + util;
      const { error } = await supabase.from("invoices").upsert(
        {
          tenant_id: singleTenant,
          month_year: singleMonth,
          base_rent: rent,
          utility_amount: util,
          water_amount: Number(singleWater) || 0,
          electricity_amount: Number(singlePower) || 0,
          garbage_amount: Number(singleGarbage) || 0,
          other_amount: Number(singleOther) || 0,
          other_label: singleOtherLabel.trim() || null,
          total_due: total,
          balance_remaining: total,
          status: total === 0 ? "paid" : "unpaid",
        },
        { onConflict: "tenant_id,month_year" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Invoice sent to tenant");
      setSingleOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });


  const { data: invoices } = useQuery({
    queryKey: ["invoices", month],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*,tenants(full_name,phone_number,units(unit_number,properties(name)))")
        .eq("month_year", month)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id,units(rent_amount)")
        .eq("active", true);
      const [y, m] = month.split("-").map(Number);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      let created = 0;
      for (const t of tenants ?? []) {
        const rent = Number((t as any).units?.rent_amount ?? 0);
        const { data: readings } = await supabase
          .from("utility_readings")
          .select("total_amount")
          .eq("tenant_id", (t as any).id)
          .gte("reading_date", start)
          .lt("reading_date", end);
        const util = (readings ?? []).reduce((s, r: any) => s + Number(r.total_amount), 0);
        const total = rent + util;
        const { data: paidRows } = await supabase
          .from("payments")
          .select("amount_paid")
          .eq("tenant_id", (t as any).id);
        // We only care to reconcile the invoice's own balance later; new invoice starts unpaid.
        const { error } = await supabase.from("invoices").upsert(
          {
            tenant_id: (t as any).id,
            month_year: month,
            base_rent: rent,
            utility_amount: util,
            total_due: total,
            balance_remaining: total,
            status: total === 0 ? "paid" : "unpaid",
          },
          { onConflict: "tenant_id,month_year" },
        );
        if (error) throw error;
        // Suppress unused warning
        void paidRows;
        created++;
      }
      return created;
    },
    onSuccess: (n) => {
      qc.invalidateQueries();
      toast.success(`Generated ${n} invoice(s)`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Billing & Monthly Rent Roll</h2>
        <p className="text-sm text-muted-foreground">Generate invoices combining rent + utilities per month.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Generate Monthly Bills</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Billing Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            <FileText className="h-4 w-4" />Generate Bills for {month}
          </Button>
          <Button variant="outline" onClick={() => setSingleOpen(true)}>
            <UserPlus className="h-4 w-4" />Invoice one tenant
          </Button>
        </CardContent>
      </Card>

      <Dialog open={singleOpen} onOpenChange={setSingleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invoice a single tenant</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Tenant</Label>
              <Select value={singleTenant} onValueChange={pickTenant}>
                <SelectTrigger><SelectValue placeholder="Choose tenant" /></SelectTrigger>
                <SelectContent>
                  {(activeTenants ?? []).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name}{t.units?.unit_number ? ` — Unit ${t.units.unit_number}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Billing month</Label>
              <Input type="month" value={singleMonth} onChange={(e) => setSingleMonth(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Base rent</Label>
                <Input type="number" min="0" value={singleRent} onChange={(e) => setSingleRent(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Water bill</Label>
                <Input type="number" min="0" value={singleWater} onChange={(e) => setSingleWater(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Electricity</Label>
                <Input type="number" min="0" value={singlePower} onChange={(e) => setSinglePower(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Garbage / service</Label>
                <Input type="number" min="0" value={singleGarbage} onChange={(e) => setSingleGarbage(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Other charge</Label>
                <Input type="number" min="0" value={singleOther} onChange={(e) => setSingleOther(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Other label</Label>
                <Input placeholder="e.g. Security" value={singleOtherLabel} onChange={(e) => setSingleOtherLabel(e.target.value)} />
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between text-muted-foreground"><span>Rent</span><span>{money(Number(singleRent) || 0)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Water + electricity + garbage + other</span><span>{money(singleExtras)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1"><span>Total due</span><span>{money((Number(singleRent) || 0) + singleExtras)}</span></div>
            </div>
            <Button onClick={() => invoiceOne.mutate()} disabled={invoiceOne.isPending || !singleTenant}>
              Send invoice
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      <Card>
        <CardHeader><CardTitle className="text-base">Invoices for {month}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Base Rent</TableHead>
                <TableHead className="text-right">Utilities</TableHead>
                <TableHead className="text-right">Total Due</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.tenants?.full_name ?? "—"}</TableCell>
                  <TableCell>{i.tenants?.units?.unit_number ?? "—"}</TableCell>
                  <TableCell className="text-right">{money(Number(i.base_rent))}</TableCell>
                  <TableCell className="text-right">{money(Number(i.utility_amount))}</TableCell>
                  <TableCell className="text-right font-semibold">{money(Number(i.total_due))}</TableCell>
                  <TableCell className="text-right">{money(Number(i.balance_remaining))}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        i.status === "paid"
                          ? "bg-primary text-primary-foreground"
                          : i.status === "partial"
                            ? "bg-warning text-warning-foreground"
                            : ""
                      }
                      variant={i.status === "unpaid" ? "destructive" : "default"}
                    >
                      {i.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setPreview(i)}>Preview</Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!invoices || invoices.length === 0) && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No invoices for this month. Click generate above.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Invoice Preview</DialogTitle></DialogHeader>
          {preview && (
            <div className="space-y-3" id="invoice-print">
              <div className="text-center">
                <div className="text-lg font-bold">Rotich Management Systems Rental Invoice</div>
                <div className="text-xs text-muted-foreground">{preview.month_year}</div>
              </div>
              <div className="text-sm space-y-1">
                <div><b>Tenant:</b> {preview.tenants?.full_name}</div>
                <div><b>Phone:</b> {preview.tenants?.phone_number ?? "—"}</div>
                <div><b>Property:</b> {preview.tenants?.units?.properties?.name ?? "—"}</div>
                <div><b>Unit:</b> {preview.tenants?.units?.unit_number ?? "—"}</div>
              </div>
              <div className="border rounded-md p-3 space-y-1 text-sm">
                <InvoiceCharges invoice={preview} />
                <div className="flex justify-between font-semibold border-t pt-1"><span>Total Due</span><span>{money(Number(preview.total_due))}</span></div>
                <div className="flex justify-between text-destructive"><span>Balance Remaining</span><span>{money(Number(preview.balance_remaining))}</span></div>
              </div>
              <p className="text-xs text-muted-foreground">Please pay via M-Pesa / Bank / Cash. Reference your unit number.</p>
              <div className="grid grid-cols-2 gap-2">
                <RecordPaymentButton
                  tenantId={preview.tenant_id}
                  invoiceId={preview.id}
                  defaultAmount={Number(preview.balance_remaining) || Number(preview.total_due)}
                  label="Record Payment"
                  className="w-full"
                />
                <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / PDF</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
