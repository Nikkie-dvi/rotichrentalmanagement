import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, FileSignature, Save, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useLandlordAccount } from "@/hooks/use-landlord-account";
import { LeaseDocument } from "@/components/lease-document";
import {
  DEFAULT_LEASE_CLAUSES,
  DEFAULT_LEASE_FOOTER,
  DEFAULT_LEASE_INTRO,
  DEFAULT_LEASE_LANDLORD_NAME,
  resolveLeaseTemplate,
} from "@/lib/lease-template";

export const Route = createFileRoute("/_authenticated/settings/lease")({
  head: () => ({
    meta: [
      { title: "Lease template — Rotich Management Systems" },
      { name: "description", content: "Customise the lease agreement your tenants read and sign, clause by clause." },
      { property: "og:title", content: "Lease template — Rotich Management Systems" },
      { property: "og:description", content: "Edit your lease wording before tenants sign it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeaseTemplatePage,
});

function LeaseTemplatePage() {
  const { data: account, isLoading } = useLandlordAccount();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("");
  const [clauses, setClauses] = useState("");
  const [footer, setFooter] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!account) return;
    const a = account as any;
    setName(a.lease_landlord_name ?? a.full_name ?? "");
    setIntro(a.lease_intro ?? DEFAULT_LEASE_INTRO);
    setClauses(a.lease_clauses ?? DEFAULT_LEASE_CLAUSES.join("\n"));
    setFooter(a.lease_footer ?? DEFAULT_LEASE_FOOTER);
  }, [account]);

  const template = useMemo(
    () =>
      resolveLeaseTemplate({
        lease_landlord_name: name,
        lease_intro: intro,
        lease_clauses: clauses,
        lease_footer: footer,
      }),
    [name, intro, clauses, footer],
  );

  const save = async () => {
    if (!account) return;
    setSaving(true);
    const { error } = await supabase
      .from("landlord_accounts")
      .update({
        lease_landlord_name: name.trim() || null,
        lease_intro: intro.trim() || null,
        lease_clauses: clauses.trim() || null,
        lease_footer: footer.trim() || null,
      } as any)
      .eq("id", account.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lease template saved — new tenants will sign this version");
    qc.invalidateQueries({ queryKey: ["landlord-account"] });
  };

  const resetDefaults = () => {
    setName(DEFAULT_LEASE_LANDLORD_NAME);
    setIntro(DEFAULT_LEASE_INTRO);
    setClauses(DEFAULT_LEASE_CLAUSES.join("\n"));
    setFooter(DEFAULT_LEASE_FOOTER);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Lease template</h1>
        <p className="text-sm text-muted-foreground">
          Edit the wording tenants read and sign. Already-signed leases keep the wording they agreed to.
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4" /> Your lease wording
          </CardTitle>
          <CardDescription>
            Use {"{landlord}"}, {"{tenant}"}, {"{unit}"}, {"{property}"} and {"{rent}"} — they fill in automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="lease-name">Landlord / company name on the lease</Label>
            <Input id="lease-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rotich Properties Ltd" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lease-intro">Opening paragraph</Label>
            <Textarea id="lease-intro" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lease-clauses">Clauses — one per line</Label>
            <Textarea
              id="lease-clauses"
              rows={10}
              value={clauses}
              onChange={(e) => setClauses(e.target.value)}
              placeholder={DEFAULT_LEASE_CLAUSES.join("\n")}
            />
            <p className="text-xs text-muted-foreground">{template.clauses.length} clause(s) will appear, numbered automatically.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lease-footer">Closing statement above the signature</Label>
            <Textarea id="lease-footer" rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save template
            </Button>
            <Button variant="outline" onClick={resetDefaults} disabled={saving}>
              <RotateCcw className="h-4 w-4" /> Reset to default wording
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Live preview</CardTitle>
          <CardDescription>Exactly what a tenant sees before signing.</CardDescription>
        </CardHeader>
        <CardContent>
          <LeaseDocument
            template={template}
            lease={{
              full_name: "Tenant name",
              phone_number: "07xx xxx xxx",
              email: "tenant@example.com",
              deposit_paid: 0,
              move_in_date: null,
              rent_due_day: 1,
              unit_number: "A1",
              rent_amount: 0,
              property_name: "Your property",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
