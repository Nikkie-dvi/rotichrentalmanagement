import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SectionSwitcher, SectionPanel, FINANCE_TABS } from "@/components/section-switcher";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, Printer, UserPlus, Coins, Zap, Trash2, MessageSquare, Droplets } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { InvoiceExtrasDialog } from "@/components/invoice-extras-dialog";
import { sendInvoiceSms, sendBulkOverdueNoticesSms } from "@/lib/receipts.functions";
import { notifyInvoiceCreated } from "@/lib/invoice-notify.functions";
import {
  generateMonthFn,
  listIncorrectInvoicesFn,
  removeIncorrectInvoicesFn,
  invoiceTenantFn,
} from "@/lib/invoicing.functions";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Invoices — Rotich Management Systems" },
      { name: "description", content: "Generate monthly bills combining base rent and utility charges. Print or share invoices." },
      { property: "og:title", content: "Billing & Invoices — Rotich Management Systems" },
      { property: "og:description", content: "Generate and preview monthly rent invoices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [preview, setPreview] = useState<any>(null);
  const [extrasFor, setExtrasFor] = useState<any>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null);
  const [singleOpen, setSingleOpen] = useState(false);
  const [singleTenant, setSingleTenant] = useState<string>("");
  const [singleMonth, setSingleMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [singleRent, setSingleRent] = useState<string>("");
  const [singleWater, setSingleWater] = useState<string>("0");
  const [singlePower, setSinglePower] = useState<string>("0");
  const [singleGarbage, setSingleGarbage] = useState<string>("0");
  const [singleOther, setSingleOther] = useState<string>("0");
  const [singleOtherLabel, setSingleOtherLabel] = useState<string>("");
  const [singleSms, setSingleSms] = useState(true);
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
      if (rent <= 0 && util <= 0) throw new Error("Enter a rent or service amount");

      // Saved on the server so a property manager's invoice belongs to the
      // landlord's account and shows on every landlord page.
      const res: any = await (invoiceTenantFn as any)({
        data: {
          tenantId: singleTenant,
          month: singleMonth,
          rent,
          water: Number(singleWater) || 0,
          power: Number(singlePower) || 0,
          garbage: Number(singleGarbage) || 0,
          other: Number(singleOther) || 0,
          otherLabel: singleOtherLabel,
        },
      });

      const ids: string[] = res?.ids ?? [];
      // Push the landlord a breakdown of what was just billed.
      for (const id of ids) await notifyInvoiceCreated({ data: { invoiceId: id } }).catch(() => {});

      if (singleSms && ids.length) {
        for (const id of ids) await sendInvoiceSms({ data: { invoiceId: id } });
        return { texted: true };
      }
      return { texted: false };
    },

    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.success(r?.texted ? "Invoice saved and texted to the tenant" : "Invoice saved");
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

  const todayIso = new Date().toISOString().slice(0, 10);
  const thisMonth = todayIso.slice(0, 7);

  // Raises any rent that falls due today (and re-checks credits) without waiting
  // for the overnight job, so it lands in arrears immediately.
  const dueToday = useMutation({
    mutationFn: async () => (generateMonthFn as any)({ data: { month: thisMonth, kind: "rent" } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      setMonth(thisMonth);
      toast.success(`${r?.created ?? 0} rent invoice(s) raised for ${thisMonth}`, {
        description: [
          r?.creditApplied ? `${money(r.creditApplied)} of credit applied` : null,
          r?.waiting?.length ? `${r.waiting.length} not due yet` : null,
        ].filter(Boolean).join(" · ") || "Anything already due now counts as arrears.",
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not raise today's invoices"),
  });

  // Rent bills and service bills (water, electricity, etc.) are raised separately.
  // Generating by hand is never blocked by the due day — the landlord decides.
  const generate = useMutation({
    mutationFn: async (kind: "rent" | "service") => (generateMonthFn as any)({ data: { month, kind, force: true } }),
    onSuccess: (r: any, kind) => {
      qc.invalidateQueries();
      const bits = [
        r?.creditApplied ? `${money(r.creditApplied)} of credit applied` : null,
        r?.waiting?.length ? `${r.waiting.length} not due yet` : null,
        r?.reconciled ? `${r.reconciled} balance(s) corrected` : null,
      ].filter(Boolean);
      toast.success(
        `Generated ${r?.created ?? 0} ${kind === "service" ? "service" : "rent"} invoice(s) for ${month}`,
        {
          description:
            bits.join(" · ") ||
            (kind === "service" ? "No service charges were recorded for this month." : undefined),
        },
      );
    },
    onError: (e: any) => toast.error(e.message),
  });


  const { data: badInvoices } = useQuery({
    queryKey: ["incorrect-invoices"],
    queryFn: async () => ((await (listIncorrectInvoicesFn as any)()) as any)?.invoices ?? [],
    staleTime: 30_000,
  });

  const cleanup = useMutation({
    mutationFn: async () => (removeIncorrectInvoicesFn as any)({ data: {} }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.success(`Removed ${r?.removed ?? 0} incorrect invoice(s)`, {
        description: r?.reconciled ? `${r.reconciled} tenant balance(s) corrected` : "Payment history was kept",
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not clean up invoices"),
  });


  const bulkNotices = useMutation({
    mutationFn: async () => (sendBulkOverdueNoticesSms as any)({ data: { month } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      if (!r?.sent && !r?.failed && !r?.skipped) {
        toast.success(`No unpaid invoices for ${month}`);
        return;
      }
      toast.success(`Texted ${r.sent} tenant(s)`, {
        description: [
          r.failed ? `${r.failed} failed` : null,
          r.skipped ? `${r.skipped} skipped (no phone number)` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send notices"),
  });


  const deleteInvoice = useMutation({
    mutationFn: async (invoice: any) => {
      // Keep genuine payment history, but remove its link to the mistaken invoice.
      const { error: paymentError } = await supabase
        .from("payments")
        .update({ invoice_id: null })
        .eq("invoice_id", invoice.id);
      if (paymentError) throw paymentError;

      const { error: itemsError } = await supabase
        .from("invoice_line_items")
        .delete()
        .eq("invoice_id", invoice.id);
      if (itemsError) throw itemsError;

      const { error } = await supabase.from("invoices").delete().eq("id", invoice.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setInvoiceToDelete(null);
      setPreview(null);
      qc.invalidateQueries();
      toast.success("Invoice removed", {
        description: "Its incorrect balance no longer counts against the tenant. Payment records were kept.",
      });
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not remove invoice"),
  });

  return (
    <div className="space-y-6">
      <SectionSwitcher items={FINANCE_TABS} />
      <SectionPanel items={FINANCE_TABS}>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Billing & Monthly Rent Roll</h2>
        <p className="text-sm text-muted-foreground">Rent and services (water, electricity, etc.) are billed on separate invoices.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Generate Monthly Bills</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Billing Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button onClick={() => generate.mutate("rent")} disabled={generate.isPending}>
            <FileText className="h-4 w-4" />Generate rent invoices for {month}
          </Button>
          <Button variant="secondary" onClick={() => generate.mutate("service")} disabled={generate.isPending}>
            <Droplets className="h-4 w-4" />Generate service invoices for {month}
          </Button>

          <Button variant="outline" onClick={() => dueToday.mutate()} disabled={dueToday.isPending}>
            <FileText className="h-4 w-4" />
            {dueToday.isPending ? "Raising invoices…" : "Invoice rent due today"}
          </Button>

          <Button variant="outline" onClick={() => setSingleOpen(true)}>
            <UserPlus className="h-4 w-4" />Invoice one tenant
          </Button>
          <Button variant="outline" onClick={() => bulkNotices.mutate()} disabled={bulkNotices.isPending}>
            <MessageSquare className="h-4 w-4" />
            {bulkNotices.isPending ? "Texting tenants…" : `Text all unpaid for ${month}`}
          </Button>

        </CardContent>
      </Card>

      {(() => {
        const due = (invoices ?? []).filter(
          (i: any) =>
            Number(i.balance_remaining) > 0 &&
            (!i.due_date || String(i.due_date).slice(0, 10) <= todayIso),
        );
        if (!due.length) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Due now — counting as arrears ({due.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {due.map((i: any) => (
                <div key={i.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{i.tenants?.full_name ?? "Tenant"}</div>
                    <div className="text-xs text-muted-foreground">
                      {i.tenants?.units?.unit_number ? `Unit ${i.tenants.units.unit_number} · ` : ""}
                      Due {i.due_date ? String(i.due_date).slice(0, 10) : i.month_year}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-medium text-destructive">{money(Number(i.balance_remaining))}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete invoice for ${i.tenants?.full_name ?? "tenant"}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => setInvoiceToDelete(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Delete any invoice here if it was raised in error — payments are always kept.
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {(badInvoices ?? []).length > 0 && (

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">
              {(badInvoices ?? []).length} invoice(s) should not be in arrears
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-52 space-y-2 overflow-y-auto text-sm">
              {(badInvoices ?? []).map((b: any) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                  <div>
                    <div className="font-medium">{b.tenantName} — {b.month}</div>
                    <div className="text-xs text-muted-foreground">{b.reason}</div>
                  </div>
                  <span className="shrink-0 text-muted-foreground">{money(b.amount)}</span>
                </div>
              ))}
            </div>
            <Button variant="destructive" onClick={() => cleanup.mutate()} disabled={cleanup.isPending}>
              <Trash2 className="h-4 w-4" />
              {cleanup.isPending ? "Cleaning up…" : "Remove these and fix balances"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Payments are always kept. Rent that is not due yet is invoiced automatically on its due day.
            </p>
          </CardContent>
        </Card>
      )}



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
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <Checkbox checked={singleSms} onCheckedChange={(v) => setSingleSms(v === true)} className="mt-0.5" />
              <span>
                Text the tenant this invoice
                <span className="block text-xs text-muted-foreground">
                  The SMS lists each charge (rent, water, electricity, garbage, extras). Uses 1.2 KES of your SMS credit.
                </span>
              </span>
            </label>
            <Button onClick={() => invoiceOne.mutate()} disabled={invoiceOne.isPending || !singleTenant}>
              {singleSms ? "Save & text invoice" : "Save invoice"}
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
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Base Rent</TableHead>

                <TableHead className="text-right">Utilities</TableHead>
                <TableHead className="text-right">Late fees</TableHead>
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
                  <TableCell>
                    <Badge variant="outline">{i.kind === "service" ? "Services" : "Rent"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{money(Number(i.base_rent))}</TableCell>

                  <TableCell className="text-right">{money(Number(i.utility_amount))}</TableCell>
                  <TableCell className="text-right text-destructive">{Number(i.late_penalty_amount ?? 0) > 0 ? money(Number(i.late_penalty_amount)) : "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{money(Number(i.total_due))}</TableCell>
                  <TableCell className={`text-right font-medium ${Number(i.balance_remaining) < 0 ? "text-destructive" : ""}`}>
                    {money(Number(i.balance_remaining))}
                  </TableCell>
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
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setExtrasFor(i)}>
                        <Coins className="h-4 w-4" />Extras
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPreview(i)}>Preview</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove invoice for ${i.tenants?.full_name ?? "tenant"}`}
                        className="text-destructive hover:text-destructive"
                        onClick={() => setInvoiceToDelete(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!invoices || invoices.length === 0) && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">No invoices for this month. Click generate above.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <InvoiceExtrasDialog invoice={extrasFor} onOpenChange={(o) => !o && setExtrasFor(null)} />

      <AlertDialog open={Boolean(invoiceToDelete)} onOpenChange={(open) => !open && !deleteInvoice.isPending && setInvoiceToDelete(null)}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              The {invoiceToDelete?.month_year ?? "selected"} invoice for {invoiceToDelete?.tenants?.full_name ?? "this tenant"},
              including its incorrect balance of {money(Number(invoiceToDelete?.balance_remaining ?? 0))}, will be permanently removed.
              Existing payment records will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteInvoice.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteInvoice.isPending || !invoiceToDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (invoiceToDelete) deleteInvoice.mutate(invoiceToDelete);
              }}
            >
              {deleteInvoice.isPending ? "Removing…" : "Remove invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      </SectionPanel>
    </div>
  );
}
