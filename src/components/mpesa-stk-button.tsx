import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Smartphone, Loader2, CheckCircle2, XCircle } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

type Props = {
  tenantId: string;
  invoiceId?: string | null;
  defaultPhone?: string | null;
  defaultAmount?: number;
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
};

type Status = "idle" | "pending" | "success" | "failed";

export function MpesaStkButton({
  tenantId,
  invoiceId,
  defaultPhone,
  defaultAmount,
  label = "M-Pesa STK",
  size = "sm",
  variant = "default",
  className,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [amount, setAmount] = useState<string>(defaultAmount ? String(defaultAmount) : "");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [txId, setTxId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const reset = () => {
    setStatus("idle");
    setMessage("");
    setTxId(null);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const trigger = async () => {
    if (!phone || !amount) {
      toast.error("Enter phone and amount");
      return;
    }
    setStatus("pending");
    setMessage("Sending STK Push…");
    try {
      const res = await fetch("/api/public/mpesa/stk-push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          invoice_id: invoiceId ?? null,
          phone_number: phone,
          amount: Number(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "STK Push failed");
      setTxId(data.transaction_id);
      setMessage(data.message ?? "Enter M-Pesa PIN on your phone…");

      pollRef.current = setInterval(async () => {
        const { data: tx } = await supabase
          .from("mpesa_transactions")
          .select("status, result_desc, mpesa_receipt_no")
          .eq("id", data.transaction_id)
          .single();
        if (!tx) return;
        if (tx.status === "success") {
          setStatus("success");
          setMessage(`Payment received. Receipt ${tx.mpesa_receipt_no}`);
          if (pollRef.current) clearInterval(pollRef.current);
          qc.invalidateQueries();
          toast.success("M-Pesa payment successful");
        } else if (tx.status === "failed") {
          setStatus("failed");
          setMessage(tx.result_desc ?? "Payment failed");
          if (pollRef.current) clearInterval(pollRef.current);
          toast.error("M-Pesa payment failed");
        }
      }, 2000);
    } catch (e: any) {
      setStatus("failed");
      setMessage(e.message ?? "STK Push failed");
    }
  };

  const simulate = async (outcome: "success" | "failed") => {
    if (!txId) return;
    await fetch("/api/public/mpesa/simulate-callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction_id: txId, outcome }),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size={size} variant={variant} className={className}>
          <Smartphone className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>M-Pesa STK Push</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Phone (254…)</Label>
            <Input
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="2547XXXXXXXX"
              disabled={status === "pending"}
            />
          </div>
          <div>
            <Label>Amount (KES)</Label>
            <Input
              inputMode="numeric"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={status === "pending"}
            />
          </div>

          {status === "idle" && (
            <Button className="w-full" onClick={trigger}>
              Send STK Push for {amount ? money(Number(amount)) : "amount"}
            </Button>
          )}

          {status === "pending" && (
            <div className="rounded-md border p-3 text-sm flex items-start gap-2">
              <Loader2 className="h-4 w-4 animate-spin mt-0.5 text-primary" />
              <div>
                <div className="font-medium">Pending PIN entry</div>
                <div className="text-xs text-muted-foreground">{message}</div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => simulate("success")}>
                    Simulate success
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => simulate("failed")}>
                    Simulate fail
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Mock mode — add Daraja credentials to send a real STK Push.
                </p>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <div className="font-medium text-primary">Payment successful</div>
                <div className="text-xs text-muted-foreground">{message}</div>
              </div>
            </div>
          )}

          {status === "failed" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-start gap-2">
              <XCircle className="h-4 w-4 mt-0.5 text-destructive" />
              <div>
                <div className="font-medium text-destructive">Failed</div>
                <div className="text-xs text-muted-foreground">{message}</div>
                <Button size="sm" variant="outline" className="mt-2" onClick={reset}>
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
