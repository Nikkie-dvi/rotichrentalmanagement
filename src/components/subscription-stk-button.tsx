import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Smartphone, Loader2, CheckCircle2, XCircle, ShieldCheck, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RegisteredPaymentPhone } from "@/components/registered-payment-phone";
import { money } from "@/lib/types";
import { startSubscriptionStk, checkSubscriptionStk } from "@/lib/subscription-stk.functions";

type Status = "idle" | "sending" | "pending" | "success" | "failed";

/** Lets a landlord pay their subscription with an M-Pesa prompt on their phone. */
export function SubscriptionStkButton({ amount, defaultPhone, full = false }: { amount: number; defaultPhone?: string | null; full?: boolean }) {
  const qc = useQueryClient();
  const start = useServerFn(startSubscriptionStk);
  const check = useServerFn(checkSubscriptionStk);
  const [open, setOpen] = useState(false);
  const phone = defaultPhone?.trim() ?? "";
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => stop, []);

  const send = async () => {
    setStatus("sending");
    try {
      const r = await start({ data: {} });
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
            toast.success("Subscription paid — thank you!");
            qc.invalidateQueries({ queryKey: ["landlord-account"] });
          } else if (row.status === "failed") {
            stop();
            setStatus("failed");
            setMessage(row.result_desc || "The payment did not go through.");
          }
        } catch { /* keep waiting */ }
        if (tries > 45) {
          stop();
          setStatus("failed");
          setMessage("We didn't get a reply from M-Pesa. If money left your account, tap Check status shortly.");
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
          <Smartphone className="h-4 w-4" /> Pay {money(amount)} with M-Pesa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm overflow-y-auto max-h-[90dvh]">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Smartphone className="h-5 w-5" /></div>
          <DialogTitle>Renew your subscription</DialogTitle>
          <DialogDescription>Pay securely with M-Pesa using your registered account number.</DialogDescription>
        </DialogHeader>
        <div className="flex items-baseline justify-between gap-3 border-y py-4"><span className="text-sm text-muted-foreground">Subscription total</span><span className="text-2xl font-semibold">{money(amount)}</span></div>
        <RegisteredPaymentPhone phone={phone} />
        {(status === "idle" || status === "sending") && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{phone ? "Enter your M-Pesa PIN on your phone. To change this number, use the protected account details process." : "Add your phone through the protected account details process before paying."}</p>
            <Button className="w-full" onClick={send} disabled={status === "sending" || !phone}>
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
