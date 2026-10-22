import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requestProfileChangeCode, updateLandlordProfile } from "@/lib/profile.functions";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clipboard, CreditCard, KeyRound, Pencil, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useIsPropertyManager,
  useLandlordAccount,
  useManagerLinks,
} from "@/hooks/use-landlord-account";
import { money } from "@/lib/types";
import { VacancyNotices } from "@/components/vacancy-notices";
import { AccountControls, AccountLogout } from "@/components/account-controls";

export const Route = createFileRoute("/_authenticated/settings/account")({
  head: () => ({
    meta: [
      { title: "My Account — Eden Point Real Estate" },
      { name: "description", content: "Manage your profile, subscription, automatic invoicing, late fees, lease template and tenant texting." },
      { property: "og:title", content: "My Account — Eden Point Real Estate" },
      { property: "og:description", content: "Your rental settings, tenant texting, lease template and account details in one place." },
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
  if (isManager) return <ManagerAccountView />;
  if (isLoading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading account…</p>;
  if (!account) return <p className="py-12 text-center text-sm text-muted-foreground">Account details are unavailable.</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold">My Account</h2>
        <p className="text-sm text-muted-foreground">Your landlord profile and tenant access code.</p>
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
            <Detail label="Email" value={account.email ?? "Not set"} />
            <ProfileEditor initialName={account.full_name ?? ""} initialPhone={account.phone ?? ""} />
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <span className="text-muted-foreground">Account status</span>
              <Badge variant={account.status === "approved" ? "default" : "secondary"}>{account.status}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <AccountControls />
      <VacancyNotices />
      <AccountLogout />

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
function ProfileEditor({ initialName, initialPhone }: { initialName: string; initialPhone: string }) {
  const qc = useQueryClient();
  const requestCode = useServerFn(requestProfileChangeCode);
  const saveProfile = useServerFn(updateLandlordProfile);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(initialName.includes("@") ? "" : initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e: any) { toast.error(e?.message ?? "Something went wrong"); } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <div className="space-y-3">
        <Detail label="Name" value={initialName && !initialName.includes("@") ? initialName : "Not set"} />
        <Detail label="Phone" value={initialPhone || "Not set"} />
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit details</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> For your security, changes need your password and a code texted to your saved phone.</p>
      <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <Input type="tel" placeholder="Phone 07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Input type="password" placeholder="Current password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {sentTo && (
        <Input inputMode="numeric" maxLength={6} placeholder={`6-digit code sent to ${sentTo}`} value={code} onChange={(e) => setCode(e.target.value)} />
      )}
      <div className="flex flex-wrap gap-2">
        {!sentTo ? (
          <Button size="sm" disabled={busy} onClick={() => run(async () => {
            const r = await requestCode({ data: { fullName, phone, password } });
            setSentTo(r.masked);
            toast.success(`Code sent to ${r.masked}`);
          })}>Send code</Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => run(async () => {
            await saveProfile({ data: { fullName, phone, password, code } });
            toast.success("Details updated");
            setEditing(false); setSentTo(null); setCode(""); setPassword("");
            qc.invalidateQueries({ queryKey: ["landlord-account"] });
          })}>Confirm changes</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setSentTo(null); setCode(""); setPassword(""); }}>Cancel</Button>
      </div>
    </div>
  );
}

function ManagerAccountView() {
  const { data: links } = useManagerLinks();
  const { data: mgr } = useQuery({
    queryKey: ["manager-account"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await (supabase as any).from("manager_accounts").select("*").eq("user_id", auth.user.id).maybeSingle();
      return data as null | { full_name: string; email: string | null; phone: string | null; property_count: number; rate_per_property: number; monthly_fee: number; paid_until: string | null; trial_ends_at: string };
    },
  });
  const trialDays = mgr ? Math.max(0, Math.ceil((new Date(mgr.trial_ends_at).getTime() - Date.now()) / 86400000)) : 0;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">My Account</h2>
        <p className="text-sm text-muted-foreground">Your property manager profile, landlords and fee.</p>
      </div>
      {mgr ? (
        <Card className="glass-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-primary" /> Manager subscription</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Name" value={mgr.full_name} />
            <Metric label="Properties" value={String(mgr.property_count)} />
            <Metric label="Monthly fee" value={`${money(Number(mgr.monthly_fee))} (${mgr.property_count} × ${money(Number(mgr.rate_per_property))})`} />
            <Metric label="Paid until" value={mgr.paid_until ?? (trialDays > 0 ? `Trial · ${trialDays} days left` : "Not recorded")} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">You were added by a landlord, so there's no manager fee on your account.</p>
      )}
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Landlords you work for</CardTitle><CardDescription>Switch between them using the selector at the top of the page.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(links ?? []).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{l.landlord_name ?? "Landlord"}</div>
                {l.property_names?.length > 0 && <div className="truncate text-xs text-muted-foreground">{l.property_names.join(", ")}</div>}
              </div>
              <Badge variant={l.active ? "default" : "secondary"}>{l.active ? "Active" : "Awaiting approval"}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <AccountControls manager />
      <VacancyNotices />
      <AccountLogout />
    </div>
  );
}
