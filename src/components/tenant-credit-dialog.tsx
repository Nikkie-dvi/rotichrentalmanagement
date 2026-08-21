// Lets the landlord see every credit alert for a tenant and edit the credit:
// apply it to an unpaid invoice, write it off, top it up or set an exact figure.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/types";
import { adjustTenantCredit, listCreditEvents, acknowledgeCreditEvent } from "@/lib/credit.functions";

const KIND_COPY: Record<string, string> = {
  detected: "Credit spotted",
  applied: "Credit applied",
  expired: "Credit written off",
  adjusted: "Credit edited",
  expiring: "Credit unused",
};

export function TenantCreditDialog({
  tenant,
  credit,
  arrears,
}: {
  tenant: any;
  credit: number;
  arrears: number;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"apply" | "expire" | "add" | "set">(arrears > 0 ? "apply" : "expire");
  const [amount, setAmount] = useState<string>(String(Math.round(credit)));
  const [note, setNote] = useState("");

  const { data: events } = useQuery({
    queryKey: ["credit-events", tenant.id],
    enabled: open,
    queryFn: () => listCreditEvents({ data: { tenantId: tenant.id } }),
  });

  const save = useMutation({
    mutationFn: () =>
      adjustTenantCredit({ data: { tenantId: tenant.id, mode, amount: Number(amount) || 0, note } }),
    onSuccess: (res: any) => {
      toast.success(`Credit updated — now ${money(res?.credit ?? 0)}`);
      setNote("");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the credit"),
  });

  const ack = useMutation({
    mutationFn: (id: string) => acknowledgeCreditEvent({ data: { eventId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credit-events", tenant.id] }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <Wallet className="h-4 w-4" />Manage credit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tenant.full_name} — credit</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Credit on account</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{money(credit)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Arrears still owed</span>
            <span className={arrears > 0 ? "font-semibold text-destructive" : "font-medium"}>{money(arrears)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label>What do you want to do?</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="apply">Apply credit to unpaid invoices</SelectItem>
                <SelectItem value="expire">Write off / expire credit</SelectItem>
                <SelectItem value="add">Add credit</SelectItem>
                <SelectItem value="set">Set credit to an exact figure</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (KES)</Label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Reason / note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. refunded in cash" maxLength={200} />
          </div>
          <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save change & alert me"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Every change is logged below and sent to your phone so the account status always matches what you expect.
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credit alerts</div>
          {(events ?? []).length === 0 && <p className="text-sm text-muted-foreground">No credit activity yet.</p>}
          {(events ?? []).map((e: any) => (
            <div key={e.id} className="rounded-md border p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{KIND_COPY[e.kind] ?? e.kind}</span>
                <Badge variant="outline">{money(Number(e.amount))}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString()} {e.note ? `· ${e.note}` : ""}
              </p>
              {!e.acknowledged && (
                <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => ack.mutate(e.id)}>
                  Mark reviewed
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
