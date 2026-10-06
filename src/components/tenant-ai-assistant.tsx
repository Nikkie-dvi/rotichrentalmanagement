import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { askTenantAssistant } from "@/lib/tenant-ai.functions";

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
export function TenantAiAssistant() {
  const ask = useServerFn(askTenantAssistant);
  const [tenantId, setTenantId] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: tenants = [] } = useQuery({
    queryKey: ["ai-tenant-list"],
    queryFn: async () => (await supabase.from("tenants").select("id, full_name, units(unit_number)").eq("active", true).order("full_name")).data ?? [],
  });

  const run = async () => {
    if (!tenantId) return setError("Pick a tenant first.");
    setBusy(true); setError(null); setAnswer(null);
    try {
      const r = await ask({ data: { tenantId, question } });
      if (r.ok) setAnswer(r.text); else setError(r.error);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally { setBusy(false); }
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold"><Bot className="h-5 w-5 text-primary" /> Ask about a tenant</CardTitle>
        <CardDescription>AI-powered summary of a tenant's rent account, with a suggested next step.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Select value={tenantId} onValueChange={(v) => { setTenantId(v); setAnswer(null); }}>
          <SelectTrigger><SelectValue placeholder="Choose a tenant" /></SelectTrigger>
          <SelectContent>
            {(tenants as any[]).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.full_name}{t.units?.unit_number ? ` · ${t.units.unit_number}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea rows={2} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Has she been paying late? Why is the balance higher this month? (optional)" />
        <Button onClick={run} disabled={busy || !tenantId}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {busy ? "Reading the account…" : "Summarize account"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {answer && <div className="rounded-lg border bg-muted/40 p-3"><Rendered text={answer} /></div>}
      </CardContent>
    </Card>
  );
}
