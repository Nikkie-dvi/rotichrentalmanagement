import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlarmClock, Loader2, MessageSquare, Save, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AutomaticInvoicing } from "@/components/automatic-invoicing";
import { runLateFeesNow, runRentRemindersNow } from "@/lib/billing.functions";
import { PropertyPenaltyDates } from "@/components/property-penalty-dates";

const DEFAULTS = {
  default_due_day: 5,
  grace_days: 5,
  penalty_type: "fixed",
  penalty_value: 500,
  penalty_max: "",
  auto_penalties_enabled: true,
  auto_reconcile_enabled: true,
  sms_enabled: true,
  email_enabled: false,
  rent_reminders_enabled: true,
  reminder_days_before: 5,
  reminder_days_after: 3,
  reminder_sms_enabled: true,
  reminder_push_enabled: true,
  reminder_before_template:
    "Dear {tenant_name}, this is a polite reminder that your rent of {total_balance} falls due on {due_date}. To check your balance or make a payment, visit homebasemanager.app/tenant/login and sign in with your phone number. Thank you.",
  reminder_after_template:
    "Dear {tenant_name}, our records show your rent of {total_balance}, due on {due_date}, is still outstanding. Kindly settle it at your earliest convenience. You can view your balance at homebasemanager.app/tenant/login - sign in with your phone number.",
  sms_template:
    "Hi {tenant_name}, a late fee of {penalty_amount} has been added to your rent. Your updated balance is {total_balance}, due by {due_date}.",
  email_subject: "Late payment fee added to your rent",
  email_template:
    "Hi {tenant_name}, a late fee of {penalty_amount} has been added to your invoice for {month}. Your updated total balance is {total_balance}, due by {due_date}.",
};

export function AccountBillingSettings({ section }: { section: "invoicing" | "fees" | "texting" }) {
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


  useEffect(() => {
    if (settings) setForm({ ...DEFAULTS, ...settings, penalty_max: (settings as any).penalty_max ?? "" });
  }, [settings]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  /** Persists the whole form (optionally with an immediate override for toggles). */
  const persist = async (override: Record<string, any> = {}) => {
    const f = { ...form, ...override };
    const { data: auth } = await supabase.auth.getUser();
    const payload: any = {
      owner_id: (settings as any)?.owner_id ?? auth.user?.id,
      default_due_day: Math.min(31, Math.max(1, Number(f.default_due_day) || 1)),
      grace_days: Math.max(0, Number(f.grace_days) || 0),
      penalty_type: f.penalty_type,
      penalty_value: Math.max(0, Number(f.penalty_value) || 0),
      penalty_max: f.penalty_max === "" ? null : Number(f.penalty_max),
      auto_penalties_enabled: !!f.auto_penalties_enabled,
      auto_reconcile_enabled: !!f.auto_reconcile_enabled,
      sms_enabled: !!f.sms_enabled,
      email_enabled: false,
      sms_template: f.sms_template,
      email_subject: f.email_subject,
      email_template: f.email_template,
      rent_reminders_enabled: !!f.rent_reminders_enabled,
      reminder_days_before: Math.min(30, Math.max(0, Number(f.reminder_days_before) || 0)),
      reminder_days_after: Math.min(30, Math.max(0, Number(f.reminder_days_after) || 0)),
      reminder_sms_enabled: !!f.reminder_sms_enabled,
      reminder_push_enabled: !!f.reminder_push_enabled,
      reminder_before_template: f.reminder_before_template,
      reminder_after_template: f.reminder_after_template,
    };
    const { error } = await supabase.from("billing_settings").upsert(payload, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: ["billing-settings"] });
  };

  const save = async () => {
    setSaving(true);
    try {
      await persist();
      toast.success("Late fee settings saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  /** Toggles save straight away so the setting survives leaving the app. */
  const toggle = async (key: string, value: boolean, label: string) => {
    set(key, value);
    try {
      await persist({ [key]: value });
      toast.success(`${label} ${value ? "on" : "off"} — saved`);
    } catch (e: any) {
      set(key, !value);
      toast.error(e.message);
    }
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

  const runReminders = useMutation({
    mutationFn: async () => (runRentRemindersNow as any)(),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.success(
        r.considered > 0
          ? `Reminded ${r.considered} tenant(s) — ${r.smsSent} SMS, ${r.pushSent} phone alert(s)${r.smsSkippedNoCredit ? `, ${r.smsSkippedNoCredit} skipped (no SMS credit)` : ""}`
          : "No tenant matches your reminder days today",
      );
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {section === "invoicing" && <AutomaticInvoicing />}

      {section === "fees" && <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><AlarmClock className="h-4 w-4" />Penalty rules</CardTitle>
          <CardDescription>Default rules, with separate penalty dates for each apartment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <div className="font-medium text-sm">Automatic late fees</div>
              <div className="text-xs text-muted-foreground">Turn off to add penalties manually only.</div>
            </div>
            <Switch aria-label="Automatic late fees" checked={!!form.auto_penalties_enabled} onCheckedChange={(v) => toggle("auto_penalties_enabled", v, "Automatic late fees")} />
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
          <PropertyPenaltyDates />
        </CardContent>
      </Card>}

      {section === "texting" && <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><AlarmClock className="h-4 w-4" />Rent reminders to tenants</CardTitle>
          <CardDescription>
            Checked daily. Tenants get a heads-up before rent is due, and a follow-up if payment still hasn't come in.

          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Send rent reminders</div>
              <div className="text-xs text-muted-foreground">Turn off to stop all before/after due reminders.</div>
            </div>
            <Switch aria-label="Automatic rent reminders" checked={!!form.rent_reminders_enabled} onCheckedChange={(v) => toggle("rent_reminders_enabled", v, "Rent reminders")} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Remind this many days BEFORE due</Label>
              <Input type="number" min="0" max="30" value={form.reminder_days_before} onChange={(e) => set("reminder_days_before", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Follow up this many days AFTER due (if unpaid)</Label>
              <Input type="number" min="0" max="30" value={form.reminder_days_after} onChange={(e) => set("reminder_days_after", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="text-sm font-medium">Send by SMS</div>
              <Switch checked={!!form.reminder_sms_enabled} onCheckedChange={(v) => toggle("reminder_sms_enabled", v, "Reminder SMS")} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="text-sm font-medium">Send phone alert</div>
              <Switch checked={!!form.reminder_push_enabled} onCheckedChange={(v) => toggle("reminder_push_enabled", v, "Reminder push")} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Before-due message</Label>
            <Textarea rows={3} value={form.reminder_before_template} onChange={(e) => set("reminder_before_template", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>After-due message</Label>
            <Textarea rows={3} value={form.reminder_after_template} onChange={(e) => set("reminder_after_template", e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Use {"{tenant_name}"}, {"{total_balance}"}, {"{due_date}"}, {"{days}"} and {"{month}"}.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save reminders
            </Button>
            <Button variant="outline" onClick={() => runReminders.mutate()} disabled={runReminders.isPending}>
              {runReminders.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}Send reminders now
            </Button>
          </div>
        </CardContent>
      </Card>}

      {section === "fees" && <Card className="glass-card">
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
            <Switch checked={!!form.sms_enabled} onCheckedChange={(v) => toggle("sms_enabled", v, "Late fee SMS")} />
          </div>
          <div className="grid gap-1.5">
            <Label>SMS message</Label>
            <Textarea rows={3} value={form.sms_template} onChange={(e) => set("sms_template", e.target.value)} />
          </div>



          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save messages
          </Button>
        </CardContent>
      </Card>}

      <p className="text-xs text-muted-foreground">
        Delivery history is now under <Link to="/messages" className="text-primary underline">SMS → Recent alerts</Link>.
      </p>




    </div>
  );
}
