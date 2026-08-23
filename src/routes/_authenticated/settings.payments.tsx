import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Wallet, Save, BellRing, Send, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_METHODS, useLandlordAccount, paymentMethodLabel } from "@/hooks/use-landlord-account";
import { notifyMyTenants } from "@/lib/notify-tenants.functions";
import { SmsCreditCard } from "@/components/sms-credit-card";
import { ModeTabs } from "@/components/mode-tabs";
import { AnimatePresence, motion } from "framer-motion";

/** SMS Leopard messages are cut off past this length, so we stop typing there. */
const SMS_LIMIT = 400;
const SMS_SEGMENT = 160;
const SMS_MULTI_SEGMENT = 153;

const smsParts = (len: number) => (len <= SMS_SEGMENT ? (len === 0 ? 0 : 1) : Math.ceil(len / SMS_MULTI_SEGMENT));

type Audience = "all" | "due" | "overdue";


const SUGGESTIONS: { label: string; body: string; audience?: Audience }[] = [
  {
    label: "Rent due reminder",
    body: "Friendly reminder: your rent is due. Please pay via {method} to {number}. Thank you.",
    audience: "due",
  },
  {
    label: "Overdue rent",
    body: "Your rent is now overdue. Kindly clear the balance today via {method} to {number} to avoid a late fee.",
    audience: "overdue",
  },
  {
    label: "Payment received",
    body: "We have received your payment. Thank you for paying on time.",
  },
  {
    label: "Water shortage",
    body: "Notice: water will be unavailable tomorrow from 8am to 2pm. Please store enough water.",
    audience: "all",
  },
  {
    label: "Inspection notice",
    body: "Notice: a routine inspection of your unit will take place this week. Kindly be available.",
    audience: "all",
  },
  {
    label: "New payment number",
    body: "Please note our rent payment details have changed. Pay via {method} to {number}.",
    audience: "all",
  },
];

export const Route = createFileRoute("/_authenticated/settings/payments")({
  head: () => ({
    meta: [
      { title: "Rent payment details — Rotich Management Systems" },
      { name: "description", content: "Set how your tenants should pay rent and share an important notice with them." },
      { property: "og:title", content: "Rent payment details — Rotich Management Systems" },
      { property: "og:description", content: "Payment number, method and notice shown in your tenants' app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RentPaymentSettingsPage,
});

function RentPaymentSettingsPage() {
  const { data: account, isLoading } = useLandlordAccount();
  const qc = useQueryClient();
  const [number, setNumber] = useState("");
  const [method, setMethod] = useState("mpesa_send_money");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [urgent, setUrgent] = useState("");
  const [sending, setSending] = useState(false);
  const [viaPush, setViaPush] = useState(true);
  const [viaSms, setViaSms] = useState(true);
  const [audience, setAudience] = useState<Audience>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<"details" | "message">("details");


  const { data: tenants } = useQuery({
    queryKey: ["tenants", "message-picker"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id, full_name, phone_number")
        .eq("active", true)
        .order("full_name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!account) return;
    setNumber((account as any).rent_payment_number ?? "");
    setMethod((account as any).rent_payment_method ?? "mpesa_send_money");
    setNote((account as any).rent_payment_note ?? "");
  }, [account]);

  const describeResult = (res: { sent: number; smsSent: number; smsFailed: number; smsSkippedNoCredit?: number }) => {
    const parts: string[] = [];
    if (viaPush) parts.push(`${res.sent} app alert${res.sent === 1 ? "" : "s"}`);
    if (viaSms) parts.push(`${res.smsSent} SMS`);
    if (res.smsSkippedNoCredit) parts.push(`${res.smsSkippedNoCredit} skipped (no SMS credit)`);
    return parts.length ? parts.join(" + ") : "no channels selected";
  };


  const save = async () => {
    if (!account) return;
    setSaving(true);
    const { error } = await supabase
      .from("landlord_accounts")
      .update({
        rent_payment_number: number.trim() || null,
        rent_payment_method: method,
        rent_payment_note: note.trim() || null,
      } as any)
      .eq("id", account.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["landlord-account"] });

    // Push + SMS the change to every tenant right away.
    const details = `Pay rent via ${paymentMethodLabel(method)}${number.trim() ? ` to ${number.trim()}` : ""}.`;
    try {
      const res = await notifyMyTenants({
        data: {
          title: "Payment details updated",
          body: note.trim() ? `${details} ${note.trim()}` : details,
          tag: `pay-details-${Date.now()}`,
          push: viaPush,
          sms: viaSms,
        },
      });
      toast.success(`Saved — sent ${describeResult(res)}`);
    } catch {
      toast.success("Saved — your tenants will see this in their app");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }


  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Rent payment details</h1>
        <p className="text-sm text-muted-foreground">
          This is shown to every one of your tenants inside their portal.
        </p>
      </div>

      <ModeTabs
        items={[
          { key: "details", label: "Payment details" },
          { key: "message", label: "SMS tenants" },
        ]}
        value={mode}
        onChange={(k) => setMode(k as "details" | "message")}
        layoutId="payments-mode-pill"
      />

      <AnimatePresence mode="wait" initial={false}>
        {mode === "details" ? (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="space-y-4"
          >
      <Card className="glass-card">

        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> How tenants pay you
          </CardTitle>
          <CardDescription>Update this any time — it reflects instantly in the tenant app.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pay-method">Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-number">Payment number (phone, till, paybill or account)</Label>
            <Input
              id="pay-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="e.g. 0706747498"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-note">Important note to tenants</Label>
            <Textarea
              id="pay-note"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Always use your unit number as the reference. Water bills are due on the 5th."
            />
          </div>
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save details
          </Button>
        </CardContent>
      </Card>

      <SmsCreditCard />
          </motion.div>
        ) : (
          <motion.div
            key="message"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="space-y-4"
          >
      <Card className="glass-card border-primary/40 ring-1 ring-primary/20">

        <CardHeader className="rounded-t-xl border-b border-primary/20 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/30">
              <BellRing className="h-5 w-5" />
            </span>
            Message your tenants
          </CardTitle>
          <CardDescription className="text-sm">
            One message, both channels — an in-app notification and an SMS. Choose who gets it and pick a ready-made
            message if you're in a hurry.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4">
          <div className="grid gap-1.5">
            <Label>Who should get this?</Label>
            <Select
              value={picked.length ? "selected" : audience}
              onValueChange={(v) => {
                if (v === "selected") return;
                setPicked([]);
                setAudience(v as any);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tenants</SelectItem>
                <SelectItem value="due">Tenants with rent due (unpaid invoices)</SelectItem>
                <SelectItem value="overdue">Tenants already overdue</SelectItem>
                {picked.length > 0 && <SelectItem value="selected">{picked.length} selected tenant(s)</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" /> Or pick specific tenants
              </span>
              {(tenants ?? []).length > 0 && (
                <label className="flex items-center gap-2 text-xs font-normal">
                  <Checkbox
                    checked={picked.length > 0 && picked.length === (tenants ?? []).length}
                    onCheckedChange={(v) =>
                      setPicked(v === true ? (tenants ?? []).map((t: any) => t.id) : [])
                    }
                  />
                  Select all
                </label>
              )}
            </div>
            <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
              {(tenants ?? []).map((t: any) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={picked.includes(t.id)}
                    onCheckedChange={(v) =>
                      setPicked((p: string[]) => (v === true ? [...p, t.id] : p.filter((id: string) => id !== t.id)))
                    }
                  />
                  <span className="truncate">
                    {t.full_name}
                    {t.phone_number ? <span className="text-muted-foreground"> · {t.phone_number}</span> : null}
                  </span>
                </label>
              ))}
              {(tenants ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No active tenants yet.</p>
              )}
            </div>
            {picked.length > 0 && (
              <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={() => setPicked([])}>
                Clear selection
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/40 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={viaPush} onCheckedChange={(v) => setViaPush(v === true)} />
              App notification
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={viaSms} onCheckedChange={(v) => setViaSms(v === true)} />
              SMS
            </label>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Quick messages</Label>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setUrgent(
                      s.body.replace("{number}", number.trim() || "your payment number").replace(
                        "{method}",
                        paymentMethodLabel(method),
                      ),
                    );
                    if (s.audience) setAudience(s.audience);
                    if (s.audience) setPicked([]);
                  }}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <Textarea
            rows={3}
            value={urgent}
            onChange={(e) => setUrgent(e.target.value)}
            placeholder="e.g. Water will be off tomorrow from 8am to 2pm."
          />
          <Button
            variant="secondary"
            disabled={sending || urgent.trim().length < 3 || (!viaPush && !viaSms)}
            onClick={async () => {
              setSending(true);
              try {
                const res = await notifyMyTenants({
                  data: {
                    title: "Notice from your landlord",
                    body: urgent.trim(),
                    push: viaPush,
                    sms: viaSms,
                    audience,
                    tenantIds: picked,
                  },
                });
                if ((res as any).recipients === 0) {
                  toast.info("No tenants matched that group — nothing was sent");
                } else {
                  toast.success(`Sent to ${(res as any).recipients} tenant(s) — ${describeResult(res)}`, {
                    description: res.smsFailed > 0 ? `${res.smsFailed} SMS could not be delivered` : undefined,
                  });
                  setUrgent("");
                }
              } catch (e: any) {
                toast.error(e?.message ?? "Could not send");
              } finally {
                setSending(false);
              }
            }}
            className="w-full sm:w-auto"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send now
          </Button>
          <p className="text-xs text-muted-foreground">
            Saving your payment details above also sends an update to all tenants using these same channels.
          </p>
        </CardContent>
      </Card>


    </div>
  );
}
