// Landlord-facing SMS wallet: balance, how many texts are left, and recharge requests.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Loader2, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { getSmsWallet, requestSmsRecharge } from "@/lib/sms-wallet.functions";

const ksh = (n: number) => `KES ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function SmsCreditCard() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("600");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sms-wallet"],
    queryFn: () => getSmsWallet(),
    refetchOnWindowFocus: true,
  });

  const pending = (data?.requests ?? []).find((r: any) => r.status === "pending");
  const low = (data?.messagesLeft ?? 0) < 10;
  const empty = (data?.messagesLeft ?? 0) < 1;

  const submit = async () => {
    setBusy(true);
    try {
      await requestSmsRecharge({ data: { amount: Number(amount), note } });
      toast.success("Recharge requested — the main account will confirm it shortly");
      setNote("");
      qc.invalidateQueries({ queryKey: ["sms-wallet"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="sms-credit" className={`glass-card ${empty ? "border-destructive/60 glow-red" : ""}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> SMS credit
        </CardTitle>
        <CardDescription>
          Every text costs {ksh(data?.rate ?? 1.2)} per tenant, no matter how long the message is.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
              <div>
                <div className="text-xs text-muted-foreground">Balance</div>
                <div className="text-xl font-semibold">{ksh(data?.balance ?? 0)}</div>
              </div>
              <Badge variant={low ? "destructive" : "secondary"} className="ml-auto">
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
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                Recharge of {ksh(pending.amount)} requested — waiting for approval.
              </p>
            ) : (
              <div className="grid gap-2">
                <div className="flex flex-wrap gap-2">
                  {[300, 600, 1200, 3000].map((v) => (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant={String(v) === amount ? "default" : "outline"}
                      onClick={() => setAmount(String(v))}
                    >
                      {ksh(v)} · {Math.floor(v / (data?.rate ?? 1.2))} SMS
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
                <Button onClick={submit} disabled={busy || !(Number(amount) > 0)} className="w-full sm:w-auto">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Request recharge
                </Button>
              </div>
            )}

            {(data?.ledger ?? []).length > 0 && (
              <div className="rounded-md border">
                <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Recent activity</div>
                <ul className="divide-y text-sm">
                  {(data?.ledger ?? []).slice(0, 6).map((l: any) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 truncate">
                        {l.reason === "broadcast"
                          ? `${l.sms_count} SMS sent`
                          : l.reason === "recharge"
                            ? "Recharge approved"
                            : l.reason.replace("_", " ")}
                        {l.note ? ` · ${l.note}` : ""}
                      </span>
                      <span className={Number(l.delta) < 0 ? "text-destructive" : "text-emerald-600"}>
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
