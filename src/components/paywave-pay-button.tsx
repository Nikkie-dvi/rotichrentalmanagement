import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Smartphone, Loader2, CheckCircle2, XCircle, ShieldCheck, ArrowRight, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RegisteredPaymentPhone } from "@/components/registered-payment-phone";
import { money } from "@/lib/types";
import { startPaywaveSmsRecharge, startPaywaveSubscription, checkPaywavePayment } from "@/lib/paywave.functions";

type Status = "idle" | "sending" | "pending" | "success" | "failed";

/**
 * Automatic M-Pesa payment through PayWave: the landlord enters their PIN and
 * the SMS credit or subscription is applied by itself — no approval needed.
 */
export function PaywavePayButton({
  kind,
  amount,
  phone,
  full = false,
  onDone,
}: {
  kind: "sms_recharge" | "subscription";
  amount: number;
  phone?: string | null;
  full?: boolean;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const startSms = useServerFn(startPaywaveSmsRecharge);
  const startSub = useServerFn(startPaywaveSubscription);
  const check = useServerFn(checkPaywavePayment);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => stop, []);

  const label = kind === "sms_recharge" ? "SMS top-up" : "subscription";
  const registered = phone?.trim() ?? "";

  const send = async () => {
    setStatus("sending");
    try {
      const r = kind === "sms_recharge" ? await startSms({ data: { amount } }) : await startSub({ data: {} });
      setStatus("pending");
      setMessage("Check your phone and enter your M-Pesa PIN.");
      let tries = 0;
      timer.current = setInterval(async () => {
        tries++;
        try {
          const row: any = await check({ data: { id: r.id } });
          if (row.status === "success") {
            stop();
            setStatus("success");
            setMessage(`Paid. Receipt ${row.mpesa_receipt_no ?? ""}`.trim());
            toast.success(kind === "sms_recharge" ? "SMS credit added — thank you!" : "Subscription paid — thank you!");
            qc.invalidateQueries({ queryKey: ["sms-wallet"] });
            qc.invalidateQueries({ queryKey: ["landlord-account"] });
            onDone?.();
          } else if (row.status === "failed") {
            stop();
            setStatus("failed");
            setMessage(row.result_desc || "The payment did not go through.");
          }
        } catch { /* keep waiting */ }
        if (tries > 45) {
          stop();
          setStatus("failed");
          setMessage("We didn't get a reply from M-Pesa. If money left your account, it will reflect shortly.");
        }
      }, 4000);
    } catch (e: any) {
      setStatus("failed");
      setMessage(e?.message ?? "Could not send the M-Pesa prompt");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { stop(); setStatus("idle"); } }}>
      <DialogTrigger asChild>
        <Button size="sm" className={full ? "w-full" : ""}>
          <Zap className="h-4 w-4" /> Pay {money(amount)} instantly
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm overflow-y-auto max-h-[90dvh]">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Smartphone className="h-5 w-5" /></div>
          <DialogTitle>Pay {label} automatically</DialogTitle>
          <DialogDescription>Enter your M-Pesa PIN and your {label} is applied right away — no waiting for approval.</DialogDescription>
        </DialogHeader>
        <div className="flex items-baseline justify-between gap-3 border-y py-4"><span className="text-sm text-muted-foreground">Total</span><span className="text-2xl font-semibold">{money(amount)}</span></div>
        <RegisteredPaymentPhone phone={registered} />
        {(status === "idle" || status === "sending") && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{registered ? "The prompt goes to your registered number. To change it, use the protected account details process." : "Add your phone through the protected account details process before paying."}</p>
            <Button className="w-full" onClick={send} disabled={status === "sending" || !registered}>
              {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} {status === "sending" ? "Sending payment request" : "Send M-Pesa prompt"}
            </Button>
          </div>
        )}
        {status === "pending" && (
          <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm" role="status">
            <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />
            <div><div className="font-medium">Waiting for your PIN</div><div className="text-xs text-muted-foreground">{message}</div></div>
          </div>
        )}
        {status === "success" && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm" role="status">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
            <div><div className="font-medium text-primary">Payment received</div><div className="text-xs text-muted-foreground">{message}</div></div>
          </div>
        )}
        {status === "failed" && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
            <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <div className="font-medium text-destructive">Not paid</div>
              <div className="text-xs text-muted-foreground">{message}</div>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setStatus("idle")}>Try again</Button>
            </div>
          </div>
        )}
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" /> PIN entered on your phone only</p>
      </DialogContent>
    </Dialog>
  );
}
