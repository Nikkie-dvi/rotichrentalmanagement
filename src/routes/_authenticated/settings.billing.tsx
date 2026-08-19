import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlarmClock, Loader2, MessageSquare, Save, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { runLateFeesNow } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/settings/billing")({
  head: () => ({
    meta: [
      { title: "Late fees & alerts — Rotich Management Systems" },
      { name: "description", content: "Set rent due day, grace period and late payment penalties, and review SMS alerts sent to tenants." },
      { property: "og:title", content: "Late fees & alerts — Rotich Management Systems" },
      { property: "og:description", content: "Automate late payment penalties and tenant SMS notifications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingSettingsPage,
});

const DEFAULTS = {
  default_due_day: 5,
  grace_days: 5,
  penalty_type: "fixed",
  penalty_value: 500,
  penalty_max: "",
  auto_penalties_enabled: true,
  sms_enabled: true,
  email_enabled: true,
  sms_template:
    "Hi {tenant_name}, a late fee of {penalty_amount} has been added to your rent. Your updated balance is {total_balance}, due by {due_date}.",
  email_subject: "Late payment fee added to your rent",
  email_template:
    "Hi {tenant_name}, a late fee of {penalty_amount} has been added to your invoice for {month}. Your updated total balance is {total_balance}, due by {due_date}.",
};

function BillingSettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["billing-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("billing_settings").select("*").maybeSingle();
      return data;
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["notification-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_logs")
        .select("id, channel, recipient, message, status, error, created_at, tenants(full_name)")
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (settings) setForm({ ...DEFAULTS, ...settings, penalty_max: (settings as any).penalty_max ?? "" });
  }, [settings]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload: any = {
      owner_id: (settings as any)?.owner_id ?? auth.user?.id,
      default_due_day: Math.min(31, Math.max(1, Number(form.default_due_day) || 1)),
      grace_days: Math.max(0, Number(form.grace_days) || 0),
      penalty_type: form.penalty_type,
      penalty_value: Math.max(0, Number(form.penalty_value) || 0),
      penalty_max: form.penalty_max === "" ? null : Number(form.penalty_max),
      auto_penalties_enabled: !!form.auto_penalties_enabled,
      sms_enabled: !!form.sms_enabled,
      email_enabled: !!form.email_enabled,
      sms_template: form.sms_template,
      email_subject: form.email_subject,
      email_template: form.email_template,
    };
    const { error } = await supabase.from("billing_settings").upsert(payload, { onConflict: "owner_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["billing-settings"] });
    toast.success("Late fee settings saved");
  };

  const runNow = useMutation({
    mutationFn: async () => (runLateFeesNow as any)(),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.success(
        r.applied > 0
          ? `Added late fees to ${r.applied} invoice(s) and alerted ${r.notified} tenant(s)`
          : "No invoices are past the grace period right now",
      );
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Late fees & tenant alerts</h2>
        <p className="text-sm text-muted-foreground">
          Rent is checked every day. Anything still unpaid after the grace period gets a penalty and the tenant is alerted instantly.
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><AlarmClock className="h-4 w-4" />Penalty rules</CardTitle>
          <CardDescription>Applies to every tenant under your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium text-sm">Automatic late fees</div>
              <div className="text-xs text-muted-foreground">Turn off to add penalties manually only.</div>
            </div>
            <Switch checked={!!form.auto_penalties_enabled} onCheckedChange={(v) => set("auto_penalties_enabled", v)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Rent due day of month</Label>
              <Input type="number" min="1" max="31" value={form.default_due_day} onChange={(e) => set("default_due_day", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Grace period (days)</Label>
              <Input type="number" min="0" value={form.grace_days} onChange={(e) => set("grace_days", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Penalty type</Label>
              <Select value={form.penalty_type} onValueChange={(v) => set("penalty_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed amount (KES)</SelectItem>
                  <SelectItem value="percent">Percentage of balance (once)</SelectItem>
                  <SelectItem value="percent_daily">Percentage of balance per day late</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{form.penalty_type === "fixed" ? "Amount (KES)" : "Rate (%)"}</Label>
              <Input type="number" min="0" step="0.01" value={form.penalty_value} onChange={(e) => set("penalty_value", e.target.value)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Maximum penalty per invoice (optional)</Label>
              <Input type="number" min="0" placeholder="No cap" value={form.penalty_max} onChange={(e) => set("penalty_max", e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save rules
            </Button>
            <Button variant="outline" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
              {runNow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}Run late fee check now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Alert messages</CardTitle>
          <CardDescription>
            Use {"{tenant_name}"}, {"{penalty_amount}"}, {"{total_balance}"}, {"{due_date}"} and {"{month}"} — they are filled in automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium text-sm">Send SMS (SMS Leopard)</div>
              <div className="text-xs text-muted-foreground">Goes to the tenant's phone number.</div>
            </div>
            <Switch checked={!!form.sms_enabled} onCheckedChange={(v) => set("sms_enabled", v)} />
          </div>
          <div className="grid gap-1.5">
            <Label>SMS message</Label>
            <Textarea rows={3} value={form.sms_template} onChange={(e) => set("sms_template", e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium text-sm">Send email</div>
              <div className="text-xs text-muted-foreground">Needs a verified sending domain — logged as “skipped” until then.</div>
            </div>
            <Switch checked={!!form.email_enabled} onCheckedChange={(v) => set("email_enabled", v)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Email subject</Label>
            <Input value={form.email_subject} onChange={(e) => set("email_subject", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Email message</Label>
            <Textarea rows={4} value={form.email_template} onChange={(e) => set("email_template", e.target.value)} />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save messages
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Recent alerts</CardTitle>
          <CardDescription>Every SMS, email and phone alert sent to your tenants.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(logs ?? []).length === 0 && <p className="text-sm text-muted-foreground">No alerts sent yet.</p>}
          {(logs ?? []).map((l: any) => (
            <div key={l.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="uppercase">{l.channel}</Badge>
                <Badge
                  className={
                    l.status === "delivered" ? "bg-primary text-primary-foreground" : l.status === "failed" ? "bg-destructive text-destructive-foreground" : ""
                  }
                  variant={l.status === "skipped" ? "secondary" : "default"}
                >
                  {l.status}
                </Badge>
                <span className="font-medium">{l.tenants?.full_name ?? l.recipient ?? "—"}</span>
                <span className="text-xs text-muted-foreground ml-auto">{new Date(l.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{l.message}</p>
              {l.error && <p className="mt-1 text-xs text-destructive">{l.error}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Money shown in the app uses {money(1000)} formatting.</p>
    </div>
  );
}
