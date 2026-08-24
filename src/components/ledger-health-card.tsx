// "Balance health check" — recomputes every tenant's account with the same
// shared ledger the tenant portal uses and shows anything that does not line up
// across the landlord pages, invoices and credit records.
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money } from "@/lib/types";
import { runLedgerAudit } from "@/lib/ledger-audit.functions";

const LABELS: Record<string, string> = {
  invoice_balance_mismatch: "Invoice balance does not match payments",
  credit_with_arrears: "Credit held while bills are unpaid",
  overpaid_invoice: "Invoice balance is higher than the charge",
  negative_balance: "Negative invoice balance",
  no_unit: "Active tenant with no unit",
  uninvoiced_rent: "Rent due but not invoiced",
};

export function LedgerHealthCard() {
  const [result, setResult] = useState<any>(null);

  const check = useMutation({
    mutationFn: () => runLedgerAudit({ data: { notify: true } }),
    onSuccess: (res: any) => {
      setResult(res);
      if ((res?.issues ?? []).length === 0) toast.success("All tenant balances match across the system");
      else toast.warning(`${res.issues.length} balance issue${res.issues.length === 1 ? "" : "s"} found`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not run the balance check"),
  });

  const issues = (result?.issues ?? []) as any[];

  return (
    <Card className="border-primary/20 bg-background/60 backdrop-blur-xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Balance health check
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Confirms every tenant&apos;s credit and arrears are the same on their portal, on this page and on their
          invoices. You get an alert whenever something does not add up.
        </p>

        <Button onClick={() => check.mutate()} disabled={check.isPending} className="w-full sm:w-auto">
          {check.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {check.isPending ? "Checking…" : "Run check"}
        </Button>

        {result && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border bg-muted/30 p-2">
                <div className="text-muted-foreground">Tenants checked</div>
                <div className="text-sm font-semibold">{result.checked}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2">
                <div className="text-muted-foreground">Total arrears</div>
                <div className="text-sm font-semibold text-destructive">{money(result.totals.arrears)}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2">
                <div className="text-muted-foreground">Total credit</div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {money(result.totals.credit)}
                </div>
              </div>
            </div>

            {issues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Everything matches — landlord and tenant balances are identical.
              </div>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {issues.map((i, idx) => (
                  <div key={`${i.tenantId}-${i.code}-${idx}`} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{i.tenantName}</span>
                      <Badge variant="outline" className="gap-1 text-[11px]">
                        <AlertTriangle className="h-3 w-3" />
                        {LABELS[i.code] ?? i.code}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{i.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
