// Main-account-only panel for controlling subscription pricing:
// - platform defaults applied to every NEW landlord (base price, loyalty offer, yearly discount)
// - per-landlord overrides (their own price, discount %, monthly/yearly plan, offer note)
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Tag, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import {
  usePlatformPricing,
  effectivePrice,
  monthsOnPlatform,
  type LandlordAccount,
  type PlatformPricing,
} from "@/hooks/use-landlord-account";

function DefaultsCard({ pricing }: { pricing: PlatformPricing }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(pricing);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(pricing), [pricing]);

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("platform_pricing")
      .update({
        base_monthly: Number(form.base_monthly) || 0,
        loyalty_after_months: Math.max(0, Number(form.loyalty_after_months) || 0),
        loyalty_discount_percent: Number(form.loyalty_discount_percent) || 0,
        annual_discount_percent: Number(form.annual_discount_percent) || 0,
        offer_note: form.offer_note?.trim() || null,
        support_whatsapp: (form.support_whatsapp ?? "").replace(/[^0-9]/g, "") || null,
      })
      .eq("id", "default");
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pricing defaults saved");
    qc.invalidateQueries({ queryKey: ["platform-pricing"] });
  };

  const yearly = Math.round(
    (Number(form.base_monthly) || 0) * 12 * (1 - (Number(form.annual_discount_percent) || 0) / 100),
  );

  return (
    <Card className="glass-card glow-green">
      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="h-4 w-4" /> Pricing for new landlords
        </CardTitle>
        <CardDescription>
          Every landlord who signs up starts on this price. Change it any time — existing landlords keep their own price.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Base price / month</Label>
            <Input
              type="number"
              value={form.base_monthly}
              onChange={(e) => setForm({ ...form, base_monthly: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs">Support WhatsApp number</Label>
            <Input
              inputMode="numeric"
              placeholder="254706747498"
              value={form.support_whatsapp ?? ""}
              onChange={(e) => setForm({ ...form, support_whatsapp: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Loyalty offer after (months)</Label>
            <Input
              type="number"
              value={form.loyalty_after_months}
              onChange={(e) => setForm({ ...form, loyalty_after_months: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs">Loyalty discount %</Label>
            <Input
              type="number"
              value={form.loyalty_discount_percent}
              onChange={(e) => setForm({ ...form, loyalty_discount_percent: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs">Yearly (pay 12 months) discount %</Label>
            <Input
              type="number"
              value={form.annual_discount_percent}
              onChange={(e) => setForm({ ...form, annual_discount_percent: Number(e.target.value) })}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Offer note shown with the price (optional)</Label>
          <Input
            value={form.offer_note ?? ""}
            onChange={(e) => setForm({ ...form, offer_note: e.target.value })}
            placeholder="e.g. Launch offer — first 3 months at 999"
          />
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          New landlord pays <b className="text-foreground">{money(Number(form.base_monthly) || 0)}</b>/month. After{" "}
          {form.loyalty_after_months} months they qualify for {form.loyalty_discount_percent}% off (
          {money(Math.round((Number(form.base_monthly) || 0) * (1 - (Number(form.loyalty_discount_percent) || 0) / 100)))}
          /month). Paying a full year costs <b className="text-foreground">{money(yearly)}</b>.
        </div>
        <Button size="sm" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save defaults
        </Button>
      </CardContent>
    </Card>
  );
}

function LandlordPriceRow({ row, pricing }: { row: LandlordAccount; pricing: PlatformPricing }) {
  const qc = useQueryClient();
  const [fee, setFee] = useState(String(row.monthly_fee ?? pricing.base_monthly));
  const [discount, setDiscount] = useState(String(row.discount_percent ?? 0));
  const [plan, setPlan] = useState(row.billing_plan ?? "monthly");
  const [note, setNote] = useState(row.offer_note ?? "");
  const [saving, setSaving] = useState(false);

  const months = monthsOnPlatform(row.created_at);
  const eligible = months >= pricing.loyalty_after_months && Number(discount) < pricing.loyalty_discount_percent;
  const price = effectivePrice(
    { monthly_fee: Number(fee) || 0, discount_percent: Number(discount) || 0, billing_plan: plan },
    pricing,
  );

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("landlord_accounts")
      .update({
        monthly_fee: Number(fee) || 0,
        discount_percent: Number(discount) || 0,
        billing_plan: plan,
        offer_note: note.trim() || null,
      })
      .eq("id", row.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Subscription updated");
    qc.invalidateQueries({ queryKey: ["landlord-accounts-all"] });
    qc.invalidateQueries({ queryKey: ["landlord-account"] });
    qc.invalidateQueries({ queryKey: ["ceo-analytics"] });
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate font-medium">
            {row.full_name ?? row.email ?? "Landlord"}
            {row.landlord_code && (
              <Badge variant="outline" className="font-mono tracking-widest">#{row.landlord_code}</Badge>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {row.email} · {months} month{months === 1 ? "" : "s"} on the platform
          </div>
        </div>
        <Badge variant={price.annual ? "default" : "secondary"}>
          {money(price.dueNow)} {price.label}
        </Badge>
      </div>

      {eligible && (
        <button
          type="button"
          onClick={() => setDiscount(String(pricing.loyalty_discount_percent))}
          className="mt-2 flex w-full items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-left text-xs"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          Eligible for the {pricing.loyalty_discount_percent}% loyalty offer after {pricing.loyalty_after_months} months
          — tap to apply.
        </button>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div>
          <Label className="text-xs">Price / month</Label>
          <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Discount %</Label>
          <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Billing</Label>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="annual">Yearly ({pricing.annual_discount_percent}% off)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Offer note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 20% festive offer" />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          Charges {money(price.monthly)}/month{price.discount > 0 ? ` (was ${money(price.base)})` : ""} · full year{" "}
          {money(price.yearly)}
        </span>
        <Button size="sm" variant="outline" className="ml-auto" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </Button>
      </div>
    </div>
  );
}

export function SubscriptionPricingPanel() {
  const { data: pricing } = usePlatformPricing();
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["landlord-accounts-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landlord_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LandlordAccount[];
    },
  });

  if (!pricing) return null;

  return (
    <div className="space-y-4">
      <DefaultsCard pricing={pricing} />
      <Card className="glass-card">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <CardTitle className="text-base">Landlord subscriptions</CardTitle>
          <CardDescription>Set a custom price, discount or yearly plan for any landlord.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (accounts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No landlords yet.</p>
          ) : (
            (accounts ?? []).map((a) => <LandlordPriceRow key={a.id} row={a} pricing={pricing} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
