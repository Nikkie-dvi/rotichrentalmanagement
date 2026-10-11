// Landlord-facing SMS wallet: balance, how many texts are left, and recharge requests.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Loader2, Send, MessageCircle, ArrowRight, Clock3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RegisteredPaymentPhone } from "@/components/registered-payment-phone";
import { requestSmsRecharge } from "@/lib/sms-wallet.functions";
import { PaywavePayButton } from "@/components/paywave-pay-button";
import { fetchSmsWalletSafe } from "@/lib/sms-wallet-client";
import { usePlatformPricing, whatsappSupportLink, useLandlordAccount } from "@/hooks/use-landlord-account";

const ksh = (n: number) => `KES ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function SmsCreditCard() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("600");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sms-wallet"],
    queryFn: fetchSmsWalletSafe,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const { data: pricing } = usePlatformPricing();
  const { data: account } = useLandlordAccount();

  const pending = (data?.requests ?? []).find((r: any) => r.status === "pending");
  const low = (data?.messagesLeft ?? 0) < 10;
  const empty = (data?.messagesLeft ?? 0) < 1;

  const submit = async () => {
    setBusy(true);
    try {
      await requestSmsRecharge({ data: { amount: Number(amount), note } });
      toast.success("Recharge requested — the main account will confirm it shortly");
      setNote("");
      setOpen(false);
      setReview(false);
      qc.invalidateQueries({ queryKey: ["sms-wallet"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="sms-credit" className={`glass-card min-w-0 max-w-full ${empty ? "border-destructive/60 glow-red" : ""}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> SMS credit
        </CardTitle>
        <CardDescription>
          Every text costs {ksh(data?.rate ?? 1.2)} per tenant, no matter how long the message is.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 grid-cols-1 gap-3">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="grid min-w-0 grid-cols-1 items-center gap-2 rounded-lg border bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Balance</div>
                <div className="break-words text-xl font-semibold">{ksh(data?.balance ?? 0)}</div>
              </div>
              <Badge variant={low ? "destructive" : "secondary"} className="max-w-full justify-self-start whitespace-normal sm:justify-self-end">
                {data?.messagesLeft ?? 0} message{data?.messagesLeft === 1 ? "" : "s"} left
              </Badge>
            </div>

            {empty && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
                <p className="font-medium text-destructive">Your SMS credit has run out</p>
                <p className="text-xs text-muted-foreground">
                  Tenant texts are paused until you top up. SMS credit is bought separately and is not part of your
                  monthly app subscription — pick an amount below and request it.
                </p>
              </div>
            )}

            {pending ? (
              <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm" role="status"><Clock3 className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">{ksh(pending.amount)} recharge requested</p><p className="text-xs text-muted-foreground">Waiting for approval. Your SMS balance will update once confirmed.</p></div></div>
            ) : (
              <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setReview(false); }}>
                <DialogTrigger asChild><Button className="w-full"><MessageSquare className="h-4 w-4" /> Top up SMS credit <ArrowRight className="h-4 w-4" /></Button></DialogTrigger>
                <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
                  <DialogHeader><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><MessageSquare className="h-5 w-5" /></div><DialogTitle>{review ? "Confirm SMS recharge" : "Top up SMS credit"}</DialogTitle><DialogDescription>SMS credit is separate from your subscription. Recharges are approved by the main account.</DialogDescription></DialogHeader>
                  <RegisteredPaymentPhone phone={account?.phone} />
                  {review ? <div className="space-y-4"><div className="flex items-baseline justify-between gap-3 border-y py-4"><span className="text-sm text-muted-foreground">Recharge total</span><span className="text-2xl font-semibold">{ksh(Number(amount))}</span></div><p className="text-sm text-muted-foreground">Approximately {Math.floor(Number(amount) / (data?.rate ?? 1.2)).toLocaleString()} tenant texts</p>{note && <p className="break-words text-sm">{note}</p>}<PaywavePayButton full kind="sms_recharge" amount={Number(amount)} phone={account?.phone} onDone={() => { setOpen(false); setReview(false); qc.invalidateQueries({ queryKey: ["sms-wallet"] }); }} /><p className="text-center text-xs text-muted-foreground">or request it and pay manually</p><Button variant="outline" onClick={submit} disabled={busy || !account?.phone} className="w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {busy ? "Requesting recharge" : "Confirm recharge request"}</Button><Button variant="ghost" className="w-full" disabled={busy} onClick={() => setReview(false)}>Back</Button></div> : <div className="grid min-w-0 grid-cols-1 gap-3">
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                  {[300, 600, 1200, 3000].map((v) => (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant={String(v) === amount ? "default" : "outline"}
                      className="h-auto min-w-0 flex-col gap-0.5 px-2 py-2 text-xs"
                      onClick={() => setAmount(String(v))}
                    >
                      <span>{ksh(v)}</span><span className="text-[10px] font-normal">{Math.floor(v / (data?.rate ?? 1.2))} SMS</span>
                    </Button>
                  ))}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sms-topup">Request a recharge (KES)</Label>
                  <Input
                    id="sms-topup"
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note, e.g. paid via M-Pesa code TFG7..."
                />
                <p className="text-xs text-muted-foreground">{account?.phone ? "Use your registered number for recharge payments. Number changes require account verification." : "Save a phone through the protected account details process before requesting a recharge."}</p>
                <Button onClick={() => setReview(true)} disabled={!(Number(amount) > 0) || !account?.phone} className="w-full">
                  Review recharge <ArrowRight className="h-4 w-4" />
                </Button>
              </div>}
                </DialogContent>
              </Dialog>
            )}

            <Button asChild variant="outline" size="sm" className="h-auto min-h-9 w-full min-w-0 whitespace-normal px-3 py-2 text-center sm:w-auto">
              <a
                href={whatsappSupportLink(
                  `Hello, I need help with my SMS recharge.\n\nLandlord: ${account?.full_name ?? ""}${
                    account?.landlord_code ? ` (code #${account.landlord_code})` : ""
                  }\nPhone: ${account?.phone ?? ""}\nSMS balance: ${ksh(data?.balance ?? 0)} (${data?.messagesLeft ?? 0} messages left)\n${
                    pending
                      ? `I requested a recharge of ${ksh(pending.amount)} on ${new Date(pending.created_at).toLocaleString()} and it has not been approved yet.`
                      : "My recharge has not reflected on my account."
                  }\n\nKindly assist.`,
                  pricing?.support_whatsapp,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="h-4 w-4 shrink-0" /><span className="min-w-0">Recharge help on WhatsApp</span>
              </a>
            </Button>

            {(data?.ledger ?? []).length > 0 && (
              <div className="rounded-md border">
                <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Recent activity</div>
                <ul className="divide-y text-sm">
                  {(data?.ledger ?? []).slice(0, 6).map((l: any) => (
                    <li key={l.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
                      <span className="min-w-0 truncate">
                        {l.reason === "broadcast"
                          ? `${l.sms_count} SMS sent`
                          : l.reason === "recharge"
                            ? "Recharge approved"
                            : l.reason.replace("_", " ")}
                        {l.note ? ` · ${l.note}` : ""}
                      </span>
                      <span className={`shrink-0 whitespace-nowrap text-xs ${Number(l.delta) < 0 ? "text-destructive" : "text-paid-ahead-foreground"}`}>
                        {Number(l.delta) < 0 ? "" : "+"}
                        {ksh(l.delta)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
