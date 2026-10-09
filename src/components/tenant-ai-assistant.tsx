import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { recordTenantPayment } from "@/lib/record-payment";
import { sendPaymentReceiptSms } from "@/lib/receipts.functions";
import { notifyPaymentLogged } from "@/lib/payment-notify.functions";
import { money } from "@/lib/types";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Send, Sparkles, ShieldCheck, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { askTenantAssistant, confirmAssistantCorrection } from "@/lib/tenant-ai.functions";

function Rendered({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split("\n").filter(Boolean).map((line, i) => {
        const parts = line.split(/\*\*(.+?)\*\*/g);
        return <p key={i}>{parts.map((p, j) => (j % 2 ? <strong key={j} className="font-semibold text-primary">{p}</strong> : p))}</p>;
      })}
    </div>
  );
}

/** Ask the AI about one tenant's invoices and payments. */
export function TenantAiAssistant({ bare = false }: { bare?: boolean }) {
  const ask = useServerFn(askTenantAssistant);
  const correct = useServerFn(confirmAssistantCorrection);
  const [correction, setCorrection] = useState<any>(null);
  const [submitted, setSubmitted] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const save = async () => {
    if (!payment || payment.duplicate || saving) return;
    setSaving(true);
    try {
      const tenantId = payment.tenantId;
      await recordTenantPayment({ tenantId, amount: payment.amount, method: payment.method, reference: payment.reference, date: payment.date });
      notifyPaymentLogged({ data: { tenantId, amount: payment.amount } }).catch(() => {});
      sendPaymentReceiptSms({ data: { tenantId, amount: payment.amount, paymentDate: payment.date, method: payment.method === "mpesa" ? "M-Pesa" : payment.method === "bank" ? "Bank" : "Cash", reference: payment.reference } })
        .then(() => toast.success("Receipt texted to the tenant")).catch(() => toast.warning("Payment saved, but the receipt text could not be sent"));
      qc.invalidateQueries();
      toast.success(`Recorded ${money(payment.amount)}`);
      setPayment(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record the payment");
    } finally { setSaving(false); }
  };
  const saveCorrection = async () => {
    if (!correction || saving) return;
    setSaving(true);
    try {
      await correct({ data: correction });
      await qc.invalidateQueries();
      toast.success("Payment corrected and invoice balances recalculated");
      setCorrection(null); setAnswer("**Correction saved**\nThe payment amount and invoice balances have been updated. Ask again to review the new account balance.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not correct payment"); }
    finally { setSaving(false); }
  };
  const { data: tenants = [] } = useQuery({
    queryKey: ["ai-tenant-list"],
    queryFn: async () => (await supabase.from("tenants").select("id, full_name, units(unit_number)").eq("active", true).order("full_name")).data ?? [],
  });

  const run = async () => {
    if (!tenantId && !question.trim()) return setError("Paste an M-Pesa message or pick a tenant.");
    setBusy(true); setError(null); setAnswer(null); setPayment(null); setCorrection(null); setSubmitted(question || "Summarize this tenant's account");
    try {
      const r: any = await ask({ data: { tenantId: tenantId || null, question } });
      if (r.ok) { setAnswer(r.text); setPayment(r.payment ? { ...r.payment, tenantId: r.tenantId, tenantName: r.tenantName } : null); setCorrection(r.correction ? { ...r.correction, tenantName: r.tenantName } : null); } else setError(r.error);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally { setBusy(false); }
  };

  const body = (
      <div className="grid min-w-0 gap-3">

        <Select value={tenantId} onValueChange={(v) => { setTenantId(v); setAnswer(null); setPayment(null); setCorrection(null); setSubmitted(""); }} disabled={busy || saving}>
          <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Tenant (optional)" /></SelectTrigger>
          <SelectContent>
            {(tenants as any[]).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.full_name}{t.units?.unit_number ? ` · ${t.units.unit_number}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {submitted && <p className="ml-6 rounded-lg bg-secondary p-3 text-sm break-words">{submitted}</p>}
        {busy && <div role="status" className="assistant-thinking flex min-h-20 items-center gap-3 rounded-lg border border-primary/30 bg-accent/40 p-4"><Sparkles className="h-6 w-6 animate-pulse text-primary motion-reduce:animate-none" /><div><p className="font-medium text-sm">Thinking through the account</p><p className="text-xs text-muted-foreground">Checking balances and payment patterns…</p></div></div>}
        <Textarea aria-label="Ask rent assistant" rows={3} maxLength={2000} value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Paste an M-Pesa message, correct a payment, or compare this month with last month…" />
        <Button onClick={run} disabled={busy || saving || (!tenantId && !question.trim())}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {busy ? "Analysing…" : "Send"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {answer && <div className="border-l-2 border-primary pl-3 py-2 break-words"><Rendered text={answer} /></div>}
        {correction && <div className="grid gap-2 rounded-lg border border-primary/40 bg-accent/30 p-3 text-sm"><div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> Confirm correction for {correction.tenantName}</div><p>{correction.date} · {money(correction.oldAmount)} → {money(correction.amount)}</p><p className="text-muted-foreground">{correction.reason}</p><p className="text-xs text-muted-foreground">Invoice balances will be recalculated. No money will be transferred.</p><div className="flex flex-wrap gap-2"><Button size="sm" onClick={saveCorrection} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm correction</Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => setCorrection(null)}>Cancel</Button></div></div>}
        {payment && (
          <div className="grid gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
            <div className="font-medium">Record this payment for {payment.tenantName}?</div>
            <div className="text-muted-foreground">{money(payment.amount)} · {payment.date} · {payment.method === "mpesa" ? "M-Pesa" : payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</div>
            {payment.duplicate && <div className="text-xs text-destructive">A payment with this reference is already recorded — check before saving again.</div>}
            <div className="flex gap-2">
               <Button size="sm" onClick={save} disabled={saving || payment.duplicate}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Confirm payment</Button>
              <Button size="sm" variant="ghost" onClick={() => setPayment(null)}>Not now</Button>
            </div>
          </div>
        )}
      </div>
  );
  if (bare) return body;
  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold"><Bot className="h-5 w-5 text-primary" /> Ask about a tenant</CardTitle>
        <CardDescription>AI-powered summary of a tenant's rent account, with a suggested next step.</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
