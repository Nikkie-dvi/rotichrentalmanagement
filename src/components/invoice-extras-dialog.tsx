import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ShieldOff, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/types";
import { useInvoiceLineItems } from "@/components/invoice-charges";
import { addInvoiceCharge, removeInvoiceCharge, waiveLateFee } from "@/lib/billing.functions";
import { sendLateFeeNoticeSms } from "@/lib/receipts.functions";

const PRESETS = ["Watchman fee", "Water bill", "Electricity", "Garbage collection", "Service charge", "Repairs"];

/** Landlord dialog to add shared/variable charges and manage late fees on one invoice. */
export function InvoiceExtrasDialog({ invoice, onOpenChange }: { invoice: any | null; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const { data: items } = useInvoiceLineItems(invoice?.id);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["invoice-line-items", invoice?.id] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries();
  };

  const add = useMutation({
    mutationFn: async () =>
      addInvoiceCharge({
        data: { invoiceId: invoice.id, category, amount: Number(amount), description: description || undefined },
      }),
    onSuccess: () => {
      setCategory("");
      setAmount("");
      setDescription("");
      refresh();
      toast.success("Charge added — the tenant has been notified");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (itemId: string) => removeInvoiceCharge({ data: { itemId } }),
    onSuccess: () => {
      refresh();
      toast.success("Charge removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const waive = useMutation({
    mutationFn: async () => waiveLateFee({ data: { invoiceId: invoice.id, reason: "Waived by landlord" } }),
    onSuccess: (r: any) => {
      refresh();
      toast.success(r.waived > 0 ? `Late fee of ${money(r.waived)} waived` : "No late fee to waive");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const notice = useMutation({
    mutationFn: async () => sendLateFeeNoticeSms({ data: { invoiceId: invoice.id } }),
    onSuccess: () => {
      refresh();
      toast.success("SMS sent to the tenant");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const penalty = Number(invoice?.late_penalty_amount ?? 0) || 0;

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extra charges & fees</DialogTitle>
          <DialogDescription>
            {invoice?.tenants?.full_name ?? "Tenant"} — {invoice?.month_year}. Tenants get an SMS and phone alert the moment a charge is added.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Total due</span><span className="font-semibold">{money(Number(invoice?.total_due ?? 0))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span>{money(Number(invoice?.balance_remaining ?? 0))}</span></div>
            {penalty > 0 && (
              <div className="flex justify-between text-destructive"><span>Late fees</span><span>{money(penalty)}</span></div>
            )}
            {invoice?.penalty_waived && <Badge variant="secondary">Late fees waived</Badge>}
          </div>

          <div className="space-y-2">
            {(items ?? []).length === 0 && <p className="text-sm text-muted-foreground">No extra charges yet.</p>}
            {(items ?? []).map((i) => (
              <div key={i.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {i.category} {i.kind === "penalty" && <Badge variant="destructive" className="ml-1">late fee</Badge>}
                  </div>
                  {i.description && <div className="text-xs text-muted-foreground truncate">{i.description}</div>}
                </div>
                <span>{money(Number(i.amount))}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${i.category}`}
                  onClick={() => remove.mutate(i.id)}
                  disabled={remove.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-2 rounded-lg border p-3">
            <Label>Add a charge</Label>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <Button key={p} type="button" size="sm" variant={category === p ? "default" : "outline"} onClick={() => setCategory(p)}>
                  {p}
                </Button>
              ))}
            </div>
            <Input placeholder="Charge name" value={category} onChange={(e) => setCategory(e.target.value)} />
            <Input type="number" min="1" placeholder="Amount (KES)" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input placeholder="Note shown to tenant (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Button onClick={() => add.mutate()} disabled={add.isPending || !category.trim() || !(Number(amount) > 0)}>
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add & notify tenant
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => notice.mutate()} disabled={notice.isPending}>
              {notice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {penalty > 0 ? "Text late fee receipt" : "Text overdue rent notice"}
            </Button>
            {penalty > 0 && !invoice?.penalty_waived && (
              <Button variant="outline" onClick={() => waive.mutate()} disabled={waive.isPending}>
                {waive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}Waive late fee
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Each SMS costs KES 1.20 from your SMS balance.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
