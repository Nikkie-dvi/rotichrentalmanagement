import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, BellRing, Send, Users, Receipt, Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useLandlordAccount, paymentMethodLabel } from "@/hooks/use-landlord-account";
import { notifyMyTenants } from "@/lib/notify-tenants.functions";
import { sendBulkTenantDocsSms } from "@/lib/bulk-docs.functions";
import { ModeTabs } from "@/components/mode-tabs";
import { AutoTextingPanel } from "@/components/auto-texting-panel";
import { RecentAlertsPanel } from "@/components/recent-alerts-panel";
import { ReminderTrackerPanel } from "@/components/reminder-tracker-panel";
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

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "SMS Tenants — Rotich Management Systems" },
      { name: "description", content: "Text tenants by apartment, rent status or all at once, send notices and manage automatic reminders." },
      { property: "og:title", content: "SMS Tenants — Rotich Management Systems" },
      { property: "og:description", content: "One place for every tenant message: by apartment, rent due, notices and automatic texting." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { data: account, isLoading } = useLandlordAccount();
  const [number, setNumber] = useState("");
  const [method, setMethod] = useState("mpesa_send_money");
  const [urgent, setUrgent] = useState("");
  const [sending, setSending] = useState(false);
  const [viaPush, setViaPush] = useState(true);
  const [viaSms, setViaSms] = useState(true);
  const [audience, setAudience] = useState<Audience>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [propertyId, setPropertyId] = useState<string>("all");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [docKind, setDocKind] = useState<"invoice" | "receipt" | "statement">("invoice");
  const [docMonth, setDocMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [docSending, setDocSending] = useState(false);
  const [docPropertyId, setDocPropertyId] = useState<string>("all");
  const [docUnitIds, setDocUnitIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"send" | "auto" | "alerts">("send");
  const [target, setTarget] = useState<"all" | "property" | "tenants">("all");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const a = p.get("audience");
    if (a === "due" || a === "overdue" || a === "all") setAudience(a);
    if (p.get("tab") === "auto") setMode("auto");
  }, []);



  const { data: properties } = useQuery({
    queryKey: ["properties", "message-picker"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: units } = useQuery({
    queryKey: ["units", "message-picker"],
    queryFn: async () => {
      const { data } = await supabase
        .from("units")
        .select("id, unit_number, property_id")
        .order("unit_number");
      return data ?? [];
    },
  });

  const { data: tenants } = useQuery({
    queryKey: ["tenants", "message-picker"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id, full_name, phone_number, unit_id")
        .eq("active", true)
        .order("full_name");
      return data ?? [];
    },
  });

  // Units belonging to the chosen property, and the tenants living on the chosen units.
  const scopedUnits = (units ?? []).filter(
    (u: any) => propertyId === "all" || u.property_id === propertyId,
  );
  const scopedUnitIds = unitIds.length ? unitIds : scopedUnits.map((u: any) => u.id);
  const scopedTenants = (tenants ?? []).filter(
    (t: any) => propertyId === "all" && unitIds.length === 0
      ? true
      : t.unit_id && scopedUnitIds.includes(t.unit_id),
  );
  const unitScope = { propertyId: propertyId === "all" ? null : propertyId, unitIds };

  // The bulk documents card keeps its own property / unit selection.
  const docUnits = (units ?? []).filter(
    (u: any) => docPropertyId === "all" || u.property_id === docPropertyId,
  );
  const docScopedUnitIds = docUnitIds.length ? docUnitIds : docUnits.map((u: any) => u.id);
  const docTenants = (tenants ?? []).filter((t: any) =>
    docPropertyId === "all" && docUnitIds.length === 0
      ? true
      : t.unit_id && docScopedUnitIds.includes(t.unit_id),
  );


  useEffect(() => {
    if (!account) return;
    setNumber((account as any).rent_payment_number ?? "");
    setMethod((account as any).rent_payment_method ?? "mpesa_send_money");
  }, [account]);

  const describeResult = (res: { sent: number; pushFailed?: boolean; smsSent: number; smsFailed: number; smsSkippedNoCredit?: number }) => {
    const parts: string[] = [];
    if (viaPush) parts.push(`${res.sent} app alert${res.sent === 1 ? "" : "s"}`);
    if (viaSms) parts.push(`${res.smsSent} SMS`);
    if (res.smsSkippedNoCredit) parts.push(`${res.smsSkippedNoCredit} skipped (no SMS credit)`);
    return parts.length ? parts.join(" + ") : "no channels selected";
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
        <h1 className="text-2xl font-semibold">SMS Tenants</h1>
        <p className="text-sm text-muted-foreground">
          Every tenant message in one place — text by apartment, chase rent that's due, send notices like a water
          shortage, and control automatic reminders.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["all", "Everyone"],
          ["due", "Rent due"],
          ["overdue", "Overdue"],
        ] as const).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={mode === "send" && audience === k && !picked.length ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => { setMode("send"); setAudience(k); setPicked([]); }}
          >
            {label}
          </Button>
        ))}
      </div>

      <ModeTabs
        items={[
          { key: "auto", label: "Automatic texting" },
          { key: "alerts", label: "Recent alerts" },
          { key: "send", label: "Send a message" },
        ]}
        value={mode}
        onChange={(k) => setMode(k as "send" | "auto" | "alerts")}
        layoutId="messages-mode-pill"
      />

      <AnimatePresence mode="wait" initial={false}>
        {mode === "send" ? (
          <motion.div
            key="send"
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
            <Label>Send to</Label>
            <div className="grid grid-cols-3 gap-2">
              {([["all", "All tenants", Users], ["property", "One apartment", Building2], ["tenants", "Specific tenants", BellRing]] as const).map(([k, label, Icon]) => (
                <Button key={k} type="button" variant={target === k ? "default" : "outline"} className="h-auto flex-col gap-1 whitespace-normal py-3 text-xs"
                  onClick={() => { setTarget(k); setPicked([]); setUnitIds([]); if (k === "all") setPropertyId("all"); if (k === "tenants") setAudience("all"); }}>
                  <Icon className="h-4 w-4" />{label}
                </Button>
              ))}
            </div>
          </div>

          {target !== "tenants" && <div className="grid gap-1.5">
            <Label>Which tenants?</Label>
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
          </div>}

          {target !== "all" && <div className="grid gap-1.5">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> {target === "property" ? "Apartment" : "Apartment (optional)"}
            </Label>
            <Select
              value={propertyId}
              onValueChange={(v) => {
                setPropertyId(v);
                setUnitIds([]);
                setPicked([]);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {(properties ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {target === "property" && <div className="rounded-lg border bg-muted/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
              <span>Units {unitIds.length > 0 ? `(${unitIds.length} selected)` : "(all)"}</span>
              {scopedUnits.length > 0 && (
                <label className="flex items-center gap-2 text-xs font-normal">
                  <Checkbox
                    checked={unitIds.length > 0 && unitIds.length === scopedUnits.length}
                    onCheckedChange={(v) => {
                      setUnitIds(v === true ? scopedUnits.map((u: any) => u.id) : []);
                      setPicked([]);
                    }}
                  />
                  Select all
                </label>
              )}
            </div>
            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
              {scopedUnits.map((u: any) => {
                const on = unitIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setPicked([]);
                      setUnitIds((prev) => (on ? prev.filter((id) => id !== u.id) : [...prev, u.id]));
                    }}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      on ? "border-primary bg-primary/15 text-primary" : "bg-background/60"
                    }`}
                  >
                    {u.unit_number}
                  </button>
                );
              })}
              {scopedUnits.length === 0 && <p className="text-xs text-muted-foreground">No units yet.</p>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {scopedTenants.length} tenant(s) in this selection.
            </p>
          </div>}

          {target === "tenants" && <div className="rounded-lg border bg-muted/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" /> Tick the tenants to message
              </span>
              {scopedTenants.length > 0 && (
                <label className="flex items-center gap-2 text-xs font-normal">
                  <Checkbox
                    checked={picked.length > 0 && picked.length === scopedTenants.length}
                    onCheckedChange={(v) =>
                      setPicked(v === true ? scopedTenants.map((t: any) => t.id) : [])
                    }
                  />
                  Select all
                </label>
              )}
            </div>
            <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
              {scopedTenants.map((t: any) => (
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
              {scopedTenants.length === 0 && (
                <p className="text-xs text-muted-foreground">No active tenants yet.</p>
              )}
            </div>
            {picked.length > 0 && (
              <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={() => setPicked([])}>
                Clear selection
              </Button>
            )}
          </div>}

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
            maxLength={SMS_LIMIT}
            onChange={(e) => {
              const next = e.target.value.slice(0, SMS_LIMIT);
              if (next.length >= SMS_LIMIT && urgent.length < SMS_LIMIT) {
                toast.warning(`Message limit reached — ${SMS_LIMIT} characters is the most an SMS can carry.`);
              }
              setUrgent(next);
            }}
            placeholder="e.g. Water will be off tomorrow from 8am to 2pm."
          />
          <div className="flex items-center justify-between text-xs">
            <span className={urgent.length >= SMS_LIMIT ? "font-medium text-destructive" : "text-muted-foreground"}>
              {urgent.length}/{SMS_LIMIT} characters
              {urgent.length >= SMS_LIMIT ? " — limit reached, the rest would be cut off" : ""}
            </span>
            {viaSms && urgent.length > 0 && (
              <span className="text-muted-foreground">
                {smsParts(urgent.length)} SMS part{smsParts(urgent.length) === 1 ? "" : "s"} per tenant
              </span>
            )}
          </div>

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
                    ...unitScope,
                  },
                });
                if ((res as any).recipients === 0) {
                  toast.info("No tenants matched that group — nothing was sent");
                } else {
                  const deliveryNotes = [
                    res.smsFailed > 0 ? `${res.smsFailed} SMS could not be delivered. Check those tenants' phone numbers.` : null,
                    res.pushFailed ? "Phone alerts were unavailable, but SMS delivery continued." : null,
                  ].filter(Boolean).join(" ");
                  toast.success(`Sent to ${(res as any).recipients} tenant(s) — ${describeResult(res)}`, {
                    description: deliveryNotes || undefined,
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
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" /> Bulk receipts, invoices & statements
          </CardTitle>
          <CardDescription>
            Pick the property and the exact units, then text each tenant their own figures — itemised invoice, latest
            payment receipt or a month statement. 1 SMS per tenant from your SMS credit.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>What to send</Label>
              <Select value={docKind} onValueChange={(v) => setDocKind(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoices (itemised bill for the month)</SelectItem>
                  <SelectItem value="receipt">Receipts (latest payment received)</SelectItem>
                  <SelectItem value="statement">Statements (billed, paid, balance)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-month">Month</Label>
              <Input id="doc-month" type="month" value={docMonth} onChange={(e) => setDocMonth(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Property
            </Label>
            <Select
              value={docPropertyId}
              onValueChange={(v) => {
                setDocPropertyId(v);
                setDocUnitIds([]);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {(properties ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
              <span>Units {docUnitIds.length > 0 ? `(${docUnitIds.length} selected)` : "(all)"}</span>
              {docUnits.length > 0 && (
                <label className="flex items-center gap-2 text-xs font-normal">
                  <Checkbox
                    checked={docUnitIds.length > 0 && docUnitIds.length === docUnits.length}
                    onCheckedChange={(v) => setDocUnitIds(v === true ? docUnits.map((u: any) => u.id) : [])}
                  />
                  Select all
                </label>
              )}
            </div>
            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
              {docUnits.map((u: any) => {
                const on = docUnitIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() =>
                      setDocUnitIds((prev) => (on ? prev.filter((id) => id !== u.id) : [...prev, u.id]))
                    }
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      on ? "border-primary bg-primary/15 text-primary" : "bg-background/60"
                    }`}
                  >
                    {u.unit_number}
                  </button>
                );
              })}
              {docUnits.length === 0 && <p className="text-xs text-muted-foreground">No units yet.</p>}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Going to {docTenants.length} tenant(s)
            {docPropertyId !== "all" || docUnitIds.length > 0 ? " on the chosen units" : " (all units)"}.
          </p>
          <Button
            disabled={docSending}
            onClick={async () => {
              setDocSending(true);
              try {
                const res: any = await sendBulkTenantDocsSms({
                  data: {
                    kind: docKind,
                    month: docMonth,
                    propertyId: docPropertyId === "all" ? null : docPropertyId,
                    unitIds: docUnitIds,
                  },

                });
                if (res.sent === 0 && res.failed === 0) {
                  toast.info(`Nothing to send — ${res.skipped} tenant(s) had no ${docKind} for ${docMonth}`);
                } else {
                  toast.success(`Sent ${res.sent} ${docKind}(s)`, {
                    description: [
                      res.failed ? `${res.failed} failed` : null,
                      res.skipped ? `${res.skipped} skipped` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined,
                  });
                }
              } catch (e: any) {
                toast.error(e?.message ?? "Could not send");
              } finally {
                setDocSending(false);
              }
            }}
            className="w-full sm:w-auto"
          >
            {docSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to units
          </Button>
        </CardContent>
      </Card>
          </motion.div>
        ) : (
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="space-y-4"
          >
            {mode === "alerts" ? <RecentAlertsPanel /> : <div className="grid gap-4"><AutoTextingPanel /><ReminderTrackerPanel /></div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
