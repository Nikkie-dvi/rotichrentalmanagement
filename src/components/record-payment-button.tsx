import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { sendPaymentReceiptSms } from "@/lib/receipts.functions";
import { notifyPaymentLogged } from "@/lib/payment-notify.functions";
import { recordTenantPayment } from "@/lib/record-payment";
import { money } from "@/lib/types";
import { notify } from "@/lib/notifications";

type Props = {
  tenantId: string;
  invoiceId?: string | null;
  defaultAmount?: number;
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export function RecordPaymentButton({
  tenantId,
  invoiceId,
  defaultAmount,
  label = "Record Payment",
  size = "sm",
  variant = "default",
  className,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(defaultAmount ? String(Math.round(defaultAmount)) : "");
  const [date, setDate] = useState<string>(today());
  const [method, setMethod] = useState<string>("mpesa");
  const [ref, setRef] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [smsReceipt, setSmsReceipt] = useState(true);

  const save = async () => {
    const value = Number(amount);
    if (!(value > 0)) return toast.error("Enter an amount greater than 0");
    if (!date) return toast.error("Pick the payment date");
    setSaving(true);
    try {
      await recordTenantPayment({ tenantId, invoiceId, amount: value, method, reference: ref.trim() || null, date });
      notifyPaymentLogged({ data: { tenantId, amount: value } }).catch(() => {});

      if (smsReceipt) {
        try {
          await sendPaymentReceiptSms({
            data: {
              tenantId,
              amount: value,
              paymentDate: date,
              method: method === "mpesa" ? "M-Pesa" : method === "bank" ? "Bank" : "Cash",
              reference: ref.trim() || null,
            },
          });
          toast.success("Receipt SMS sent to the tenant");
        } catch (e: any) {
          toast.error(e?.message ?? "Payment saved, but the receipt SMS failed");
        }
      }

      qc.invalidateQueries();
      toast.success(`Payment of ${money(value)} recorded for ${date}`);
      notify({
        title: "Payment recorded",
        body: `${money(value)} recorded on ${date}.`,
        tag: `payment-${tenantId}-${date}`,
      });
      setOpen(false);
      setRef("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setAmount(defaultAmount ? String(Math.round(defaultAmount)) : "");
          setDate(today());
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size={size} variant={variant} className={className}>
          <Receipt className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Amount (KES)</Label>
            <Input
              inputMode="numeric"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Payment date</Label>
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Adjust this if the money came in on a different day.</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Reference (optional)</Label>
            <Input value={ref} maxLength={40} onChange={(e) => setRef(e.target.value)} placeholder="M-Pesa code / slip no." />
          </div>
          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <Checkbox checked={smsReceipt} onCheckedChange={(v) => setSmsReceipt(v === true)} className="mt-0.5" />
            <span>
              Text a payment receipt to the tenant
              <span className="block text-xs text-muted-foreground">Sent by SMS to the tenant's phone.</span>
            </span>
          </label>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save payment {amount && Number(amount) > 0 ? `of ${money(Number(amount))}` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
