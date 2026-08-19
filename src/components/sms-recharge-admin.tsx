// Main-account panel: approve/decline landlord SMS recharge requests and top up balances.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Loader2, Check, X, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  listSmsRecharges,
  decideSmsRecharge,
  adjustSmsBalance,
  creditAllSmsWallets,
} from "@/lib/sms-wallet.functions";

const ksh = (n: number) => `KES ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function SmsRechargeAdmin() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [topups, setTopups] = useState<Record<string, string>>({});
  const [bulkAmount, setBulkAmount] = useState("600");
  const [bulkOnlyEmpty, setBulkOnlyEmpty] = useState(false);

  const rechargeEveryone = async () => {
    const amount = Number(bulkAmount);
    if (!(amount > 0)) return;
    setBusy("bulk");
    try {
      const res: any = await creditAllSmsWallets({
        data: { amount, onlyEmpty: bulkOnlyEmpty, note: "Bulk recharge from main account" },
      });
      toast.success(`Credited ${res.credited} landlord${res.credited === 1 ? "" : "s"} with ${ksh(amount)}`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not recharge landlords");
    } finally {
      setBusy(null);
    }
  };


  const { data, isLoading } = useQuery({ queryKey: ["sms-recharges"], queryFn: () => listSmsRecharges() });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sms-recharges"] });
    qc.invalidateQueries({ queryKey: ["sms-wallet"] });
  };

  const decide = async (id: string, approve: boolean, fallback: number) => {
    setBusy(id);
    try {
      await decideSmsRecharge({ data: { id, approve, amount: Number(amounts[id] ?? fallback) } });
      toast.success(approve ? "Recharge approved" : "Request declined");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update the request");
    } finally {
      setBusy(null);
    }
  };

  const topUp = async (ownerId: string) => {
    const amount = Number(topups[ownerId]);
    if (!(amount > 0)) return;
    setBusy(ownerId);
    try {
      await adjustSmsBalance({ data: { ownerId, amount, note: "Direct top-up" } });
      toast.success("Balance updated");
      setTopups((t) => ({ ...t, [ownerId]: "" }));
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update the balance");
    } finally {
      setBusy(null);
    }
  };

  const pending = (data?.requests ?? []).filter((r: any) => r.status === "pending");
  const history = (data?.requests ?? []).filter((r: any) => r.status !== "pending").slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> SMS credit & recharges
        </CardTitle>
        <CardDescription>Landlords are billed KES 1.20 per tenant SMS. Approve their recharge requests here.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div>
              <div className="mb-2 text-sm font-medium">Pending requests ({pending.length})</div>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recharge requests waiting.</p>
              ) : (
                <div className="space-y-2">
                  {pending.map((r: any) => (
                    <div key={r.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">
                            {r.landlord.name}
                            {r.landlord.code ? (
                              <Badge variant="outline" className="ml-2 font-mono tracking-widest">#{r.landlord.code}</Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Asked for {ksh(r.amount)} · {new Date(r.created_at).toLocaleString()}
                          </div>
                          {r.note && <div className="mt-1 text-xs">Note: {r.note}</div>}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div>
                          <Label className="text-xs">Amount to credit</Label>
                          <Input
                            type="number"
                            className="w-32"
                            value={amounts[r.id] ?? String(r.amount)}
                            onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value }))}
                          />
                        </div>
                        <Button size="sm" disabled={busy === r.id} onClick={() => decide(r.id, true, r.amount)}>
                          {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === r.id}
                          onClick={() => decide(r.id, false, r.amount)}
                        >
                          <X className="h-4 w-4" /> Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Landlord balances</div>
              {(data?.wallets ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No SMS wallets yet.</p>
              ) : (
                <div className="space-y-2">
                  {(data?.wallets ?? []).map((w: any) => (
                    <div key={w.owner_id} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                      <div className="min-w-40 flex-1">
                        <div className="font-medium">{w.landlord.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {ksh(w.balance)} · {w.messagesLeft} message{w.messagesLeft === 1 ? "" : "s"} left
                        </div>
                      </div>
                      <Input
                        type="number"
                        className="w-32"
                        placeholder="Amount"
                        value={topups[w.owner_id] ?? ""}
                        onChange={(e) => setTopups((t) => ({ ...t, [w.owner_id]: e.target.value }))}
                      />
                      <Button size="sm" variant="secondary" disabled={busy === w.owner_id} onClick={() => topUp(w.owner_id)}>
                        {busy === w.owner_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Top up
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {history.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium">Recent decisions</div>
                <ul className="divide-y rounded-md border text-sm">
                  {history.map((r: any) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>
                        {r.landlord.name} · {ksh(r.approved_amount ?? r.amount)}
                      </span>
                      <Badge variant={r.status === "approved" ? "default" : "destructive"}>{r.status}</Badge>
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
