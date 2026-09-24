import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clipboard, CreditCard, KeyRound, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  effectivePrice,
  paymentMethodLabel,
  subscriptionState,
  trialState,
  useIsPropertyManager,
  useLandlordAccount,
  usePlatformPricing,
} from "@/hooks/use-landlord-account";
import { money } from "@/lib/types";
import { SmsCreditCard } from "@/components/sms-credit-card";

export const Route = createFileRoute("/_authenticated/settings/account")({
  head: () => ({
    meta: [
      { title: "My Account — Rotich Rental Management" },
      { name: "description", content: "View your landlord code, profile, subscription status and billing details." },
      { property: "og:title", content: "My Account — Rotich Rental Management" },
      { property: "og:description", content: "View your landlord code, profile, subscription status and billing details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const isManager = useIsPropertyManager();
  const { data: account, isLoading } = useLandlordAccount();
  const { data: pricing } = usePlatformPricing();
  if (isManager) return <p className="py-12 text-center text-sm text-muted-foreground">This page is available to the landlord only.</p>;
  if (isLoading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading account…</p>;
  if (!account) return <p className="py-12 text-center text-sm text-muted-foreground">Account details are unavailable.</p>;

  const subscription = subscriptionState(account);
  const trial = trialState(account);
  const price = effectivePrice(account, pricing ?? { id: "default", base_monthly: 999, loyalty_after_months: 3, loyalty_discount_percent: 10, annual_discount_percent: 20, offer_note: null });
  const statusTone = subscription.tone === "active" ? "default" : subscription.tone === "due" ? "secondary" : "destructive";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">My Account</h2>
        <p className="text-sm text-muted-foreground">Your landlord profile, tenant access code, and subscription details.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" /> Tenant registration code</CardTitle>
            <CardDescription>Share this code with tenants so they can securely find and link their unit.</CardDescription>
          </CardHeader>
          <CardContent>
            {account.landlord_code ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/35 p-4">
                <span className="text-3xl font-bold tracking-[0.3em]">{account.landlord_code}</span>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(account.landlord_code ?? "");
                    toast.success("Landlord code copied");
                  }}
                >
                  <Clipboard className="h-4 w-4" /> Copy code
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Your code is being prepared.</p>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4 text-primary" /> Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Detail label="Name" value={account.full_name ?? "Not set"} />
            <Detail label="Email" value={account.email ?? "Not set"} />
            <PhoneEditor accountId={account.id} initial={account.phone ?? ""} />
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <span className="text-muted-foreground">Account status</span>
              <Badge variant={account.status === "approved" ? "default" : "secondary"}>{account.status}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-primary" /> Subscription</CardTitle>
            <CardDescription>Your current plan and payment standing.</CardDescription>
          </div>
          <Badge variant={statusTone}>{subscription.label}</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Billing plan" value={price.annual ? "Annual" : "Monthly"} />
          <Metric label="Current price" value={`${money(price.dueNow)} ${price.label}`} />
          <Metric label="Paid until" value={account.paid_until ?? (trial.active ? `Trial · ${trial.daysLeft} days left` : "Not recorded")} />
          <Metric label="Payment method" value={paymentMethodLabel(account.payment_method)} />
          {account.last_payment_at && <Metric label="Last payment" value={new Date(account.last_payment_at).toLocaleDateString()} />}
          {account.last_payment_amount != null && <Metric label="Last amount" value={money(Number(account.last_payment_amount))} />}
          {account.last_payment_reference && <Metric label="Payment reference" value={account.last_payment_reference} />}
          {account.discount_percent != null && Number(account.discount_percent) > 0 && <Metric label="Account discount" value={`${account.discount_percent}%`} />}
        </CardContent>
      </Card>

      <SmsCreditCard />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" /> Account information is visible only to the landlord.
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/25 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
function PhoneEditor({ accountId, initial }: { accountId: string; initial: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (value.replace(/\D/g, "").length < 9) return toast.error("Enter a valid phone number");
    setSaving(true);
    const { error } = await supabase.from("landlord_accounts").update({ phone: value.trim() }).eq("id", accountId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Phone saved — it will be used for password reset codes");
    qc.invalidateQueries({ queryKey: ["landlord-account"] });
  };
  return (
    <div className="space-y-1.5">
      <span className="text-muted-foreground">Phone (for password reset by SMS)</span>
      <div className="flex gap-2">
        <Input type="tel" value={value} placeholder="07XX XXX XXX" onChange={(e) => setValue(e.target.value)} />
        <Button variant="outline" onClick={save} disabled={saving || value.trim() === initial}>Save</Button>
      </div>
    </div>
  );
}
