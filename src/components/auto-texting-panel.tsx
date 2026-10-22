import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlarmClock, Loader2, Save, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

type Auto = {
  rent_reminders_enabled: boolean;
  reminder_sms_enabled: boolean;
  reminder_push_enabled: boolean;
  sms_enabled: boolean;
  reminder_days_before: number;
  reminder_days_after: number;
};

const DEFAULTS: Auto = {
  rent_reminders_enabled: true,
  reminder_sms_enabled: true,
  reminder_push_enabled: true,
  sms_enabled: true,
  reminder_days_before: 3,
  reminder_days_after: 3,
};

/** Automatic texting controls — shares the same saved settings as Late Fees & Collections. */
export function AutoTextingPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Auto>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["billing-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("billing_settings").select("*").maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (settings) setForm({ ...DEFAULTS, ...(settings as any) });
  }, [settings]);

  const save = async (override: Partial<Auto> = {}) => {
    const f = { ...form, ...override };
    setForm(f);
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload: any = {
      owner_id: (settings as any)?.owner_id ?? auth.user?.id,
      rent_reminders_enabled: f.rent_reminders_enabled,
      reminder_sms_enabled: f.reminder_sms_enabled,
      reminder_push_enabled: f.reminder_push_enabled,
      sms_enabled: f.sms_enabled,
      reminder_days_before: Math.min(30, Math.max(0, Number(f.reminder_days_before) || 0)),
      reminder_days_after: Math.min(30, Math.max(0, Number(f.reminder_days_after) || 0)),
    };
    const { error } = await supabase.from("billing_settings").upsert(payload, { onConflict: "owner_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["billing-settings"] });
    toast.success("Automatic texting saved");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const Row = ({ k, title, hint }: { k: keyof Auto; title: string; hint: string }) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={!!form[k]} disabled={saving} onCheckedChange={(v) => save({ [k]: v } as Partial<Auto>)} />
    </div>
  );

  return (
    <Card className="glass-card border-primary/40 ring-1 ring-primary/20">
      <CardHeader className="rounded-t-xl border-b border-primary/20 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/30">
            <Zap className="h-5 w-5" />
          </span>
          Automatic texting
        </CardTitle>
        <CardDescription>
          Checked every day. Tenants are reminded before rent is due and followed up if it's still unpaid — no need to
          send it yourself.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4">
        <Row k="rent_reminders_enabled" title="Automatic rent reminders" hint="Master switch for before/after due reminders." />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Days before due</Label>
            <Input type="number" min={0} max={30} value={form.reminder_days_before}
              onChange={(e) => setForm({ ...form, reminder_days_before: Number(e.target.value) })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Follow up days after due</Label>
            <Input type="number" min={0} max={30} value={form.reminder_days_after}
              onChange={(e) => setForm({ ...form, reminder_days_after: Number(e.target.value) })} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Row k="reminder_sms_enabled" title="By SMS" hint="Sent as a text message." />
          <Row k="reminder_push_enabled" title="Phone alert" hint="Free app notification." />
        </div>
        <Row k="sms_enabled" title="Late fee texts" hint="Text tenants automatically when a late fee is added." />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save days
          </Button>
          <Button asChild variant="ghost">
            <Link to="/settings/billing">
              <AlarmClock className="h-4 w-4" /> Edit reminder wording
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
