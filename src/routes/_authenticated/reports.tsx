import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SectionSwitcher, SectionPanel, FINANCE_TABS } from "@/components/section-switcher";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Printer, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { downloadCsv, toCsv, downloadText, type CsvRow } from "@/lib/csv";
import { buildStatementHtml, printHtml, type StatementSection } from "@/lib/statement-print";


export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Monthly Reports & Downloads — Rotich Management Systems" },
      { name: "description", content: "Download monthly transaction records: payments, invoices, extra charges, late fees and arrears as CSV." },
      { property: "og:title", content: "Monthly Reports & Downloads — Rotich Management Systems" },
      { property: "og:description", content: "Export monthly payments, invoices and arrears records for your rentals." },
    ],
  }),
  component: ReportsPage,
});

const thisMonth = () => new Date().toISOString().slice(0, 7);

function label(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function monthRange(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const start = `${monthKey}-01`;
  const endDate = new Date(y!, m!, 1); // first day of next month
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

function ReportsPage() {
  const [month, setMonth] = useState(thisMonth());
  const { start, end } = useMemo(() => monthRange(month), [month]);

  const report = useQuery({
    queryKey: ["monthly-report", month],
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const invoiceCols =
        "id,month_year,base_rent,utility_amount,water_amount,electricity_amount,garbage_amount,other_amount,other_label,late_penalty_amount,total_due,balance_remaining,status,due_date,created_at,tenants(full_name,phone_number,units(unit_number,properties(name)))";
      const [pay, inv, arrearsRes, tickets] = await Promise.all([
        supabase
          .from("payments")
          .select(
            "id,amount_paid,payment_method,reference_no,payment_date,mpesa_receipt_no,tenants(full_name,phone_number,units(unit_number,properties(name,location)))",
          )
          .gte("payment_date", start)
          .lt("payment_date", end)
          .order("payment_date", { ascending: true }),
        // Only the selected month's invoices…
        supabase.from("invoices").select(invoiceCols).eq("month_year", month),
        // …plus unpaid ones up to that month, for the arrears file.
        supabase
          .from("invoices")
          .select(invoiceCols)
          .gt("balance_remaining", 0)
          .lte("month_year", month)
          .order("month_year", { ascending: false }),
        supabase
          .from("maintenance_tickets")
          .select("id,category,urgency,status,created_at,tenants(full_name,units(unit_number))")
          .gte("created_at", start)
          .lt("created_at", `${end}T00:00:00`),
      ]);
      if (pay.error) throw pay.error;
      if (inv.error) throw inv.error;
      if (arrearsRes.error) throw arrearsRes.error;

      const monthInvoices = inv.data ?? [];
      const ids = monthInvoices.map((i: any) => i.id);
      let lines: any[] = [];
      if (ids.length) {
        const li = await supabase
          .from("invoice_line_items")
          .select("id,invoice_id,category,description,amount,kind,created_at")
          .in("invoice_id", ids);
        if (li.error) throw li.error;
        lines = li.data ?? [];
      }
      const arrears: any[] = arrearsRes.data ?? [];
      return { payments: pay.data ?? [], monthInvoices, arrears, lines, tickets: tickets.data ?? [] };
    },
  });

  const d = report.data;
  const collected = (d?.payments ?? []).reduce((s, p: any) => s + Number(p.amount_paid), 0);
  const billed = (d?.monthInvoices ?? []).reduce((s, i: any) => s + Number(i.total_due), 0);
  const lateFees = (d?.monthInvoices ?? []).reduce((s, i: any) => s + Number(i.late_penalty_amount ?? 0), 0);
  const extras = (d?.lines ?? []).filter((l) => l.kind !== "penalty").reduce((s, l) => s + Number(l.amount), 0);
  const outstanding = (d?.arrears ?? []).reduce((s: number, i: any) => s + Number(i.balance_remaining), 0);

  const paymentRows = (): CsvRow[] =>
    (d?.payments ?? []).map((p: any) => ({
      Date: p.payment_date,
      Tenant: p.tenants?.full_name ?? "",
      Phone: p.tenants?.phone_number ?? "",
      Property: p.tenants?.units?.properties?.name ?? "",
      Unit: p.tenants?.units?.unit_number ?? "",
      Amount: Number(p.amount_paid),
      Method: p.payment_method,
      Reference: p.reference_no ?? p.mpesa_receipt_no ?? "",
    }));

  const invoiceRows = (): CsvRow[] =>
    (d?.monthInvoices ?? []).map((i: any) => ({
      Month: i.month_year,
      Tenant: i.tenants?.full_name ?? "",
      Property: i.tenants?.units?.properties?.name ?? "",
      Unit: i.tenants?.units?.unit_number ?? "",
      "Due date": i.due_date ?? "",
      "Base rent": Number(i.base_rent),
      Water: Number(i.water_amount ?? 0),
      Electricity: Number(i.electricity_amount ?? 0),
      Garbage: Number(i.garbage_amount ?? 0),
      [`Other`]: Number(i.other_amount ?? 0),
      "Other label": i.other_label ?? "",
      "Late fees": Number(i.late_penalty_amount ?? 0),
      "Total due": Number(i.total_due),
      "Balance remaining": Number(i.balance_remaining),
      Status: i.status,
    }));

  const chargeRows = (): CsvRow[] => {
    const byInvoice = new Map((d?.monthInvoices ?? []).map((i: any) => [i.id, i]));
    return (d?.lines ?? []).map((l: any) => {
      const i: any = byInvoice.get(l.invoice_id);
      return {
        Date: String(l.created_at).slice(0, 10),
        Tenant: i?.tenants?.full_name ?? "",
        Unit: i?.tenants?.units?.unit_number ?? "",
        Type: l.kind === "penalty" ? "Late fee" : "Extra charge",
        Category: l.category,
        Description: l.description ?? "",
        Amount: Number(l.amount),
      };
    });
  };

  const arrearsRows = (): CsvRow[] =>
    (d?.arrears ?? []).map((i: any) => ({
      Month: i.month_year,
      Tenant: i.tenants?.full_name ?? "",
      Phone: i.tenants?.phone_number ?? "",
      Property: i.tenants?.units?.properties?.name ?? "",
      Unit: i.tenants?.units?.unit_number ?? "",
      "Total due": Number(i.total_due),
      Outstanding: Number(i.balance_remaining),
      Status: i.status,
    }));

  const guard = (rows: CsvRow[], name: string, file: string) => {
    if (!rows.length) {
      toast.error(`No ${name} for ${label(month)}`);
      return;
    }
    downloadCsv(file, rows);
    toast.success(`${rows.length} ${name} downloaded`);
  };

  /** One file containing every section, so the whole month can be archived at once. */
  const downloadFullStatement = () => {
    if (!d) return;
    const sections: [string, CsvRow[]][] = [
      ["SUMMARY", [{
        Month: label(month),
        "Invoices raised": d.monthInvoices.length,
        "Total billed": billed,
        "Extra charges": extras,
        "Late fees": lateFees,
        "Payments received": d.payments.length,
        "Total collected": collected,
        "Outstanding arrears": outstanding,
        Generated: new Date().toLocaleString(),
      }]],
      ["PAYMENTS", paymentRows()],
      ["INVOICES", invoiceRows()],
      ["EXTRA CHARGES & LATE FEES", chargeRows()],
      ["OUTSTANDING ARREARS", arrearsRows()],
    ];
    const body = sections
      .map(([title, rows]) => `${title}\n${rows.length ? toCsv(rows) : "(none)"}\n`)
      .join("\n");
    downloadText(`monthly-statement-${month}.csv`, body, "text/csv;charset=utf-8;");
    toast.success(`Full ${label(month)} statement downloaded`);
  };

  const kpis = [
    { label: "Collected", value: money(collected), sub: `${d?.payments.length ?? 0} payments`, glow: "glow-green" },
    { label: "Billed", value: money(billed), sub: `${d?.monthInvoices.length ?? 0} invoices`, glow: "" },
    { label: "Extras + late fees", value: money(extras + lateFees), sub: `${money(lateFees)} penalties`, glow: "" },
    { label: "Outstanding", value: money(outstanding), sub: `${d?.arrears.length ?? 0} unpaid`, glow: "glow-red" },
  ];

  return (
    <div className="space-y-6">
      <SectionSwitcher items={FINANCE_TABS} />
      <SectionPanel items={FINANCE_TABS}>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Monthly Reports & Downloads</h2>
        <p className="text-sm text-muted-foreground">
          Pick a month and download your transaction records for bookkeeping, tax or sharing with your accountant.
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />Reporting month
          </CardTitle>
          <CardDescription>Records are limited to your own properties.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="report-month">Month</Label>
            <Input id="report-month" type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className={`floating-panel rounded-xl p-3 ${k.glow}`}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-lg font-bold sm:text-xl">{report.isLoading ? "…" : k.value}</div>
                <div className="text-[11px] text-muted-foreground">{k.sub}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />Download records for {label(month)}
          </CardTitle>
          <CardDescription>CSV files open directly in Excel, Google Sheets or Numbers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="justify-start"
            disabled={report.isLoading}
            onClick={() => guard(paymentRows(), "payments", `payments-${month}.csv`)}
          >
            <Download className="h-4 w-4" />Payments received ({d?.payments.length ?? 0})
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            disabled={report.isLoading}
            onClick={() => guard(invoiceRows(), "invoices", `invoices-${month}.csv`)}
          >
            <Download className="h-4 w-4" />Invoices raised ({d?.monthInvoices.length ?? 0})
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            disabled={report.isLoading}
            onClick={() => guard(chargeRows(), "extra charges", `extra-charges-${month}.csv`)}
          >
            <Download className="h-4 w-4" />Extra charges & late fees ({d?.lines.length ?? 0})
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            disabled={report.isLoading}
            onClick={() => guard(arrearsRows(), "arrears records", `arrears-${month}.csv`)}
          >
            <Download className="h-4 w-4" />Outstanding arrears ({d?.arrears.length ?? 0})
          </Button>
          <Button className="justify-start sm:col-span-2" disabled={report.isLoading || !d} onClick={downloadFullStatement}>
            <FileSpreadsheet className="h-4 w-4" />Download full monthly statement (everything)
          </Button>
          <Button variant="ghost" className="justify-start sm:col-span-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />Print this summary
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transactions in {label(month)}</CardTitle>
          <CardDescription>Preview of what the payments file contains.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="-mx-2 overflow-x-auto px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : (d?.payments.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No payments recorded this month.</TableCell></TableRow>
                ) : (
                  d!.payments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{new Date(p.payment_date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{p.tenants?.full_name ?? "—"}</TableCell>
                      <TableCell>{p.tenants?.units?.unit_number ?? "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{String(p.payment_method).replace("_", " ")}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">{money(Number(p.amount_paid))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </SectionPanel>
    </div>
  );
}
