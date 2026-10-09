import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { UserPlus, LogOut, ContactRound, AlertTriangle, Clock, CheckCircle2, KeyRound, ArrowLeft, Home, Pencil, Search, ChevronDown, Building2, Phone, Wallet, FileText } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { RecordPaymentButton } from "@/components/record-payment-button";
import { TenantCreditDialog } from "@/components/tenant-credit-dialog";
import { TenantReminderButton } from "@/components/tenant-reminder-button";
import { TenantInvoicesButton } from "@/components/tenant-invoices-button";
import { LedgerHealthCard } from "@/components/ledger-health-card";

import { runCreditWatch } from "@/lib/credit.functions";
import { accruedRent, buildLedger, type Ledger } from "@/lib/ledger";

import { createTenantLogin, resetTenantPassword } from "@/lib/account.functions";
import { createFirstRentInvoice } from "@/lib/first-invoice";
import { sendTenantWelcomeNow } from "@/lib/welcome.functions";
import { SectionSwitcher, SectionPanel, PEOPLE_TABS } from "@/components/section-switcher";
import {
  tenantsFullQuery,
  tenantBalancesQuery,
  tenantPaymentTotalsQuery,
  tenantCreditAdjustmentsQuery,
  vacantUnitsQuery,
} from "@/lib/property-queries";

export const Route = createFileRoute("/_authenticated/tenants")({
  head: () => ({
    meta: [
      { title: "Tenants — Rotich Management Systems" },
      { name: "description", content: "Manage active tenants: contacts, assigned units, deposits and arrears." },
      { property: "og:title", content: "Tenants — Rotich Management Systems" },
      { property: "og:description", content: "Active tenants and their status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Warm the cache on hover/touch so the tab paints instantly when opened.
  loader: ({ context }) => {
    context.queryClient.prefetchQuery(tenantsFullQuery);
    context.queryClient.prefetchQuery(tenantBalancesQuery);
    context.queryClient.prefetchQuery(tenantPaymentTotalsQuery);
    context.queryClient.prefetchQuery(tenantCreditAdjustmentsQuery);
  },
  component: TenantsPage,
});

type RiskLevel = "clear" | "credit" | "soon" | "overdue" | "high";
type Risk = { level: RiskLevel; total: number; monthsUnpaid: number; daysLate: number };

function RiskBadge({ risk }: { risk: Risk }) {
  if (risk.total < 0) return <Badge className="rounded-full border-paid-ahead-border bg-paid-ahead text-paid-ahead-foreground gap-1 whitespace-normal"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> +{money(Math.abs(risk.total))} Paid ahead</Badge>;
  if (risk.total > 0) return <Badge className="rounded-full border-arrears-border bg-arrears text-arrears-foreground gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {risk.daysLate > 0 ? `Overdue ${risk.daysLate}d` : "Balance due"}{risk.monthsUnpaid >= 2 ? ` · ${risk.monthsUnpaid} mo` : ""}</Badge>;
  return <Badge variant="secondary" className="rounded-full gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> KES 0 · Balanced</Badge>;
}

function TenantsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");


  const { data: tenants } = useQuery(tenantsFullQuery);
  // Keep each building's tenants apart: pick one property to work on.
  const [propFilter, setPropFilter] = useState<string>("all");
  const propertyNames = Array.from(
    new Set((tenants ?? []).filter((t: any) => t.active).map((t: any) => t.units?.properties?.name ?? "No unit assigned")),
  ).sort((a: any, b: any) => (a === "No unit assigned" ? 1 : b === "No unit assigned" ? -1 : a.localeCompare(b))) as string[];

  const { data: unpaidInvoices } = useQuery(tenantBalancesQuery);

  const { data: allPayments } = useQuery(tenantPaymentTotalsQuery);

  // Manual credit edits (applied / written off / topped up) by the landlord.
  const { data: creditAdjustments } = useQuery(tenantCreditAdjustmentsQuery);


  /**
   * Real account statement per tenant, built with the SAME shared helper the
   * tenant portal uses, so the credit/arrears here is exactly the balance the
   * tenant sees (including rent that has fallen due but is not invoiced yet).
   */
  const ledgers = useMemo(() => {
    const totals = new Map<string, { invoiced: number; paid: number; adjustments: number }>();
    const get = (id: string) => {
      let l = totals.get(id);
      if (!l) totals.set(id, (l = { invoiced: 0, paid: 0, adjustments: 0 }));
      return l;
    };
    for (const inv of unpaidInvoices ?? []) get((inv as any).tenant_id).invoiced += Number((inv as any).total_due ?? 0);
    for (const p of allPayments ?? []) get((p as any).tenant_id).paid += Number((p as any).amount_paid ?? 0);
    for (const a of creditAdjustments ?? []) get((a as any).tenant_id).adjustments += Number((a as any).delta ?? 0);

    const map = new Map<string, Ledger>();
    for (const t of (tenants ?? []) as any[]) {
      const totalsFor = totals.get(t.id) ?? { invoiced: 0, paid: 0, adjustments: 0 };
      map.set(
        t.id,
        buildLedger({
          ...totalsFor,
          accrued: t.active
            ? accruedRent({
                rentAmount: t.units?.rent_amount,
                moveInDate: t.move_in_date,
                rentDueDay: t.rent_due_day,
              })
            : 0,
        }),
      );
    }
    return map;
  }, [tenants, unpaidInvoices, allPayments, creditAdjustments]);

  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, l] of ledgers) map.set(id, -l.net);
    return map;
  }, [ledgers]);



  const { data: vacantUnits } = useQuery(vacantUnitsQuery);

  const assign = useMutation({
    mutationFn: async (v: TenantFormPayload) => {
      const { data: unit } = await supabase
        .from("units")
        .select("id,status,rent_amount")
        .eq("id", v.unit_id)
        .single();
      if (unit?.status === "occupied") throw new Error("Unit is already occupied");
      const { data: inserted, error: tErr } = await supabase
        .from("tenants")
        .insert({
          unit_id: v.unit_id,
          full_name: v.full_name,
          phone_number: v.phone_number,
          deposit_paid: Number(v.deposit_paid) || 0,
          move_in_date: v.move_in_date || null,
          rent_due_day: v.rent_due_day ? Number(v.rent_due_day) : null,
          active: true,
          approval_status: "approved",
        })
        .select("id")
        .single();
      if (tErr) throw tErr;
      // Rent paid at move-in is a real payment, not a deposit or a credit edit.
      // Record it before billing so both portals use the same ledger immediately.
      const openingPaid = Number(v.opening_rent_paid);
      if (openingPaid > 0) {
        const { error: pErr } = await supabase.from("payments").insert({
          tenant_id: inserted.id,
          amount_paid: openingPaid,
          payment_method: v.payment_method,
          reference_no: v.payment_reference || null,
          payment_date: v.move_in_date,
        });
        if (pErr) {
          const { error: cleanupError } = await supabase.from("tenants").delete().eq("id", inserted.id);
          if (cleanupError) throw new Error(`Opening payment failed. Check the tenant list before retrying: ${pErr.message}`);
          throw new Error(`Opening payment was not saved; tenant was not assigned: ${pErr.message}`);
        }
      }
      const { error: uErr } = await supabase.from("units").update({ status: "occupied" }).eq("id", v.unit_id);
      if (uErr) throw uErr;

      let invoiced = false;
      let invoiceFailed = false;
      if (inserted?.id) {
        try {
          const res = await createFirstRentInvoice({
            tenantId: inserted.id,
            rentAmount: Number(unit?.rent_amount ?? 0),
            moveInDate: v.move_in_date || null,
            openingPaid,
          });
          invoiced = res.created;
        } catch {
          invoiceFailed = true;
        }
        await sendTenantWelcomeNow({ data: { tenantId: inserted.id } }).catch(() => {});
      }
      return { invoiced, invoiceFailed, openingPaid };
    },
    onSuccess: (res) => {
      qc.invalidateQueries();
      setOpen(false);
      if (res.invoiceFailed) toast.warning("Tenant and opening payment saved, but the first rent invoice could not be created. Check billing.");
      else toast.success(res.openingPaid > 0 ? `Tenant assigned — ${money(res.openingPaid)} opening rent recorded` : res.invoiced ? "Tenant assigned — first rent invoice added" : "Tenant assigned");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moveOut = useMutation({
    mutationFn: async (t: any) => {
      const { error } = await supabase
        .from("tenants")
        .update({ active: false, move_out_date: new Date().toISOString().slice(0, 10) })
        .eq("id", t.id);
      if (error) throw error;
      if (t.unit_id) {
        const { error: uErr } = await supabase.from("units").update({ status: "vacant" }).eq("id", t.unit_id);
        if (uErr) throw uErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Tenant moved out");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Compute after mount so server/client date math can't mismatch.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);

  const risks = useMemo(() => {
    const map = new Map<string, Risk>();
    if (!today) return map;
    const currentMonth = today.toISOString().slice(0, 7);
    const byTenant = new Map<string, string[]>();
    for (const inv of unpaidInvoices ?? []) {
      if (Number(inv.balance_remaining) <= 0) continue;
      const list = byTenant.get(inv.tenant_id) ?? [];
      list.push(inv.month_year);
      byTenant.set(inv.tenant_id, list);
    }
    for (const t of tenants ?? []) {
      const months = (byTenant.get((t as any).id) ?? []).sort();
      const total = balances.get((t as any).id) ?? 0;
      if (!months.length || total <= 0) {
        map.set((t as any).id, { level: total < 0 ? "credit" : total > 0 ? "soon" : "clear", total, monthsUnpaid: 0, daysLate: 0 });
        continue;
      }
      const oldest = months[0];
      const pastMonths = months.filter((m) => m < currentMonth).length;
      const dueDay =
        Number((t as any).rent_due_day) ||
        ((t as any).move_in_date ? new Date((t as any).move_in_date).getUTCDate() : 0) ||
        1;
      const [y, m] = oldest.split("-").map(Number);
      const due = new Date(Date.UTC(y, m - 1, Math.min(dueDay, 28)));
      const daysLate = Math.floor((today.getTime() - due.getTime()) / 86400000);
      const level: Risk["level"] =
        pastMonths >= 2 ? "high" : daysLate > 0 ? "overdue" : "soon";
      map.set((t as any).id, { level, total, monthsUnpaid: months.length, daysLate });
    }
    return map;
  }, [tenants, unpaidInvoices, balances, today]);

  const rank: Record<RiskLevel, number> = { high: 0, overdue: 1, soon: 2, clear: 3, credit: 4 };
  const matches = (t: any) => {
    if (propFilter !== "all" && (t.units?.properties?.name ?? "No unit assigned") !== propFilter) return false;
    const balance = balances.get(t.id) ?? 0;
    if (paymentFilter === "overdue" && balance <= 0) return false;
    if (paymentFilter === "paid" && balance >= 0) return false;
    if (paymentFilter === "zero" && balance !== 0) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [t.full_name, t.phone_number, t.email, t.units?.unit_number, t.units?.properties?.name]
      .filter(Boolean)
      .some((v: string) => String(v).toLowerCase().includes(q));
  };
  const active = (tenants ?? [])
    .filter((t: any) => t.active && matches(t))
    .sort(
      (a: any, b: any) =>
        rank[risks.get(a.id)?.level ?? "clear"] - rank[risks.get(b.id)?.level ?? "clear"],
    );
  const inactive = (tenants ?? []).filter((t: any) => !t.active && matches(t));
  const metricTenants = (tenants ?? []).filter(t => t.active && (propFilter === "all" || t.units?.properties?.name === propFilter));

  // Group active tenants by building, ordered by unit number inside each.
  const groups = (() => {
    const map = new Map<string, any[]>();
    for (const t of active) {
      const key = t.units?.properties?.name ?? "No unit assigned";
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    for (const list of map.values())
      list.sort((a, b) =>
        String(a.units?.unit_number ?? "~").localeCompare(String(b.units?.unit_number ?? "~"), undefined, { numeric: true }),
      );
    return Array.from(map.entries()).sort(([a], [b]) =>
      a === "No unit assigned" ? 1 : b === "No unit assigned" ? -1 : a.localeCompare(b),
    );
  })();

  // Flag tenants that look like the same person entered more than once
  // (same name + phone). They stay listed, but are clearly marked.
  const dupKey = (t: any) =>
    `${String(t.full_name ?? "").trim().toLowerCase()}|${String(t.phone_number ?? "").replace(/\D/g, "").slice(-9)}`;
  const dupCounts = new Map<string, number>();
  for (const t of (tenants ?? []).filter((x: any) => x.active)) {
    const k = dupKey(t);
    if (!k.replace("|", "")) continue;
    dupCounts.set(k, (dupCounts.get(k) ?? 0) + 1);
  }
  const isDuplicate = (t: any) => (dupCounts.get(dupKey(t)) ?? 0) > 1;
  const duplicateCount = active.filter(isDuplicate).length;

  const flagged = active.filter((t: any) => {
    const l = risks.get(t.id)?.level;
    return l === "overdue" || l === "high";
  });
  const atRisk = flagged.reduce((s: number, t: any) => s + (balances.get(t.id) ?? 0), 0);
  const creditHeld = active.reduce((s: number, t: any) => s + (ledgers.get(t.id)?.credit ?? 0), 0);

  // Re-checks every tenant's credit now and pushes an alert for anything new.
  const creditWatch = useMutation({
    mutationFn: () => runCreditWatch({}),
    onSuccess: (res: any) =>
      toast.success(res?.logged ? `${res.logged} credit update${res.logged > 1 ? "s" : ""} sent to your phone` : "Credit is up to date"),
    onError: (e: any) => toast.error(e?.message ?? "Could not check credit"),
  });





  return (
    <div className="min-w-0 space-y-2 px-3 pb-4 sm:space-y-4 sm:px-0">
      <div className="sticky top-0 z-30 mb-1 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b bg-background/95 py-2 backdrop-blur">
        <Button
          variant="outline"
          size="sm"
          aria-label="Go back"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
            else router.navigate({ to: "/" });
          }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <span className="truncate text-sm font-medium">Tenants</span>
        <Button asChild variant="outline" size="sm" className="shrink-0 px-2.5 sm:px-3">
          <Link to="/">
            <Home className="h-4 w-4" /> <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </Button>
      </div>
      <SectionSwitcher items={PEOPLE_TABS} compact />
      <SectionPanel items={PEOPLE_TABS} compact>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight sm:text-2xl">Tenants</h2>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" data-tour="add-tenant" className="shrink-0 px-2.5 sm:h-10 sm:px-4"><UserPlus className="h-4 w-4" /><span className="hidden min-[360px]:inline">Assign Tenant</span><span className="min-[360px]:hidden">Add</span></Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Assign New Tenant</DialogTitle></DialogHeader>
            <TenantForm
              vacantUnits={vacantUnits ?? []}
              defaultProperty={propFilter !== "all" && propFilter !== "No unit assigned" ? propFilter : ""}
              onSubmit={(payload) => assign.mutate(payload)}
              saving={assign.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>
      <section aria-label="Tenant search and filters" className="min-w-0 space-y-2 border-y border-primary/25 bg-accent/40 px-2.5 py-3 sm:px-3">
        <Label htmlFor="tenant-search" className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Search className="h-3.5 w-3.5 shrink-0" />Find a tenant</Label>
        <div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" /><Input id="tenant-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, phone or unit" aria-label="Search tenants" className="h-10 min-w-0 border-primary/40 bg-background pl-9 text-sm shadow-sm" /></div>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <Select value={propFilter} onValueChange={setPropFilter}><SelectTrigger aria-label="Filter by property" className="h-8 w-full min-w-0 bg-background text-xs [&>span]:truncate"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All properties</SelectItem>{propertyNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}><SelectTrigger aria-label="Filter by payment status" className="h-8 w-full min-w-0 bg-background text-xs [&>span]:truncate"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="overdue">Overdue / Arrears</SelectItem><SelectItem value="paid">Paid ahead / Credit</SelectItem><SelectItem value="zero">Zero balance</SelectItem></SelectContent></Select>
        </div>
      </section>
      <details className="group min-w-0 border-b pb-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium"><span className="flex min-w-0 items-center gap-1.5"><Wallet className="h-3.5 w-3.5 shrink-0 text-primary" />Account summary</span><ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Tenant account highlights">
        {[
          { label: "Total Collection", value: money((allPayments ?? []).filter(p => propFilter === "all" || (tenants ?? []).some(t => t.id === p.tenant_id && t.units?.properties?.name === propFilter)).reduce((sum, p) => sum + Number(p.amount_paid), 0)), note: "All recorded payments", icon: Wallet, tone: "border-primary/25 bg-accent/40 text-accent-foreground" },
          { label: "Paid Ahead", value: money(metricTenants.reduce((sum, t) => sum + (ledgers.get(t.id)?.credit ?? 0), 0)), note: `${metricTenants.filter(t => (balances.get(t.id) ?? 0) < 0).length} tenants in credit`, icon: CheckCircle2, tone: "border-paid-ahead-border bg-paid-ahead text-paid-ahead-foreground" },
          { label: "Balanced", value: String(metricTenants.filter(t => (balances.get(t.id) ?? 0) === 0).length), note: "Tenants with KES 0 due", icon: CheckCircle2, tone: "border-border bg-muted text-foreground" },
          { label: "Overdue / Arrears", value: money(metricTenants.reduce((sum, t) => sum + (ledgers.get(t.id)?.arrears ?? 0), 0)), note: `${metricTenants.filter(t => (balances.get(t.id) ?? 0) > 0).length} tenants with a balance`, icon: AlertTriangle, tone: "border-arrears-border bg-arrears text-arrears-foreground" },
        ].map(metric => <div key={metric.label} className={`min-w-0 rounded-lg border px-2.5 py-2 shadow-sm sm:p-3 ${metric.tone}`}><div className="flex items-center gap-1.5 text-[11px] font-semibold"><metric.icon className="h-3.5 w-3.5 shrink-0" /><span>{metric.label}</span></div><p className="mt-1 break-words text-base font-bold sm:text-lg">{metric.value}</p><p className="mt-0.5 text-[10px] sm:text-xs">{metric.note}</p></div>)}
      </div>
      </details>
      <details className="group border-b pb-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-muted-foreground">Credit & account checks<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
        <div className="mt-2 space-y-2">
          {duplicateCount > 0 && <div className="flex items-start gap-2 border-l-2 border-destructive pl-2 text-xs"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span><b>{duplicateCount}</b> tenant record{duplicateCount === 1 ? "" : "s"} look like duplicates (same name and phone). Move out the extra record to keep balances clean.</span></div>}
      {creditHeld > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              <b>{money(creditHeld)}</b> held as tenant credit. It is automatically deducted from their next invoice — it does
              not mean their next month is already paid.
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => creditWatch.mutate()} disabled={creditWatch.isPending}>
            {creditWatch.isPending ? "Checking…" : "Check credit & alert me"}
          </Button>
        </div>
      )}

      <LedgerHealthCard />
        </div>
      </details>



      {groups.map(([groupName, members]) => (
      <section key={groupName} className="min-w-0 space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 border-b pb-1">
          <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-bold uppercase"><Building2 className="h-4 w-4 shrink-0 text-primary" /><span className="[overflow-wrap:anywhere]">{groupName}</span></h3>
          <Badge variant="secondary" className="shrink-0 rounded-full">{members.length} tenants</Badge>
        </div>
      <div className="grid grid-cols-1 gap-2 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {members.map((t: any) => {
          const ledger = ledgers.get(t.id) ?? buildLedger({ invoiced: 0, paid: 0 });
          const balance = balances?.get(t.id) ?? 0;
          const risk: Risk = risks.get(t.id) ?? {
            level: balance > 0 ? "soon" : balance < 0 ? "credit" : "clear",
            total: balance,
            monthsUnpaid: 0,
            daysLate: 0,
          };
          return (
            <TenantCard
              key={t.id}
              tenant={t}
              balance={balance}
              ledger={ledger}
              risk={risk}
              duplicate={isDuplicate(t)}
              onMoveOut={() => moveOut.mutate(t)}
            />
          );
        })}
      </div>
      </section>
      ))}
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-10 text-center text-muted-foreground">{query || propFilter !== "all" || paymentFilter !== "all" ? "No tenants match these filters." : "No active tenants yet."}</CardContent>
          </Card>
        )}
      </div>


      {inactive.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Past Tenants</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {inactive.map((t: any) => (
              <div key={t.id} className="flex justify-between border-b py-2 last:border-none">
                <span>{t.full_name}</span>
                <span className="text-muted-foreground">Moved out {t.move_out_date ?? "—"}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      </SectionPanel>
    </div>

  );
}



function TenantCard({
  tenant: t,
  balance,
  ledger,
  risk,
  duplicate,
  onMoveOut,
}: {
  tenant: any;
  balance: number;
  ledger: Ledger;
  risk: Risk;
  duplicate?: boolean;
  onMoveOut: () => void;
}) {
  const flagged = risk.level === "overdue" || risk.level === "high";
  const inCredit = ledger.credit > 0 && ledger.arrears === 0;
  const [expanded, setExpanded] = useState(false);


  return (
    <Card className={`relative min-w-0 overflow-hidden rounded-xl border shadow-sm ${balance > 0 ? "border-arrears-border" : inCredit ? "border-paid-ahead-border" : "border-border"}`}>
      <div className={`h-1 ${balance > 0 ? "bg-arrears-foreground" : inCredit ? "bg-paid-ahead-foreground" : "bg-border"}`} />
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><div className="min-w-0"><p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Home className="h-4 w-4 shrink-0" /><span className="break-words">Unit {t.units?.unit_number ?? "Unassigned"}</span></p><h4 className="mt-2 break-words text-lg font-semibold leading-tight">{t.full_name}</h4></div><Button size="icon" variant="ghost" aria-label={`Expand ${t.full_name}`} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} /></Button></div>
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" /><span className="[overflow-wrap:anywhere]">{t.phone_number ?? "No phone"}</span></p>
        <div className="mt-2 flex flex-wrap gap-1.5"><RiskBadge risk={{ ...risk, total: balance }} />{duplicate && <Badge variant="outline"><AlertTriangle className="h-3 w-3" /> Possible duplicate</Badge>}</div>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-baseline gap-2"><span className="min-w-0 text-xs text-muted-foreground">{balance > 0 ? "Outstanding" : inCredit ? "Available credit" : "Account balance"}</span><span className={`min-w-0 break-words text-right text-base font-bold ${balance > 0 ? "text-arrears-foreground" : inCredit ? "text-paid-ahead-foreground" : "text-foreground"}`}>{money(Math.abs(balance))}</span></div>
        <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">{balance > 0 && <TenantReminderButton tenantId={t.id} name={t.full_name} balance={balance} />}<TenantInvoicesButton tenantId={t.id} name={t.full_name} /></div>
      </div>

      {expanded && (
        <CardContent className="space-y-2 p-3 pt-0 text-sm sm:p-4 sm:pt-0">
          {!flagged && !inCredit && <div className="pb-1"><RiskBadge risk={risk} /></div>}

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account statement</div>
            <Row label="Total invoiced" value={money(ledger.invoiced)} />
            {ledger.uninvoiced > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Rent due, not invoiced yet</span>
                <span className="font-medium">{money(ledger.uninvoiced)}</span>
              </div>
            )}
            <Row label="Total owed to date" value={money(ledger.owed)} />
            <Row label="Total paid" value={money(ledger.paid)} />
            {ledger.adjustments !== 0 && (
              <Row label="Credit edits by you" value={money(ledger.adjustments)} />
            )}
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Arrears still owed</span>
              <span className={ledger.arrears > 0 ? "font-semibold text-destructive" : "font-medium"}>
                {money(ledger.arrears)}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Credit on account</span>
              <span className={ledger.credit > 0 ? "font-semibold" : "font-medium"}>
                {money(ledger.credit)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              This is exactly the balance the tenant sees on their portal
              {ledger.uninvoiced > 0 ? ", including rent that has fallen due but has no invoice yet" : ""}.
              {ledger.credit > 0
                ? " The credit is extra money already paid and is deducted from the next invoice."
                : ledger.arrears > 0
                  ? " The tenant is behind by this amount."
                  : " The account is fully settled."}
            </p>
          </div>


          <Row label="Property" value={t.units?.properties?.name ?? "—"} />
          <Row label="Unit" value={t.units?.unit_number ?? "—"} />
          <Row label="Rent Due" value={money(Number(t.units?.rent_amount ?? 0))} />
          <Row label="Deposit" value={money(Number(t.deposit_paid))} />
          <Row label="Move-in" value={t.move_in_date ?? "—"} />
          <Row label="Due Day" value={t.rent_due_day ? `${t.rent_due_day} of month` : "—"} />

          <div className="mt-2 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            <RecordPaymentButton
              tenantId={t.id}
              defaultAmount={balance > 0 ? balance : Number(t.units?.rent_amount ?? 0)}
              label="Record Payment"
              className="w-full"
            />
            <Button size="sm" variant="outline" className="w-full" onClick={onMoveOut}>
              <LogOut className="h-4 w-4" />Move Out
            </Button>
            <div className="min-[380px]:col-span-2">
              <EditTenantDatesDialog tenant={t} />
            </div>
            <div className="min-[380px]:col-span-2">
              <TenantCreditDialog tenant={t} credit={ledger.credit} arrears={ledger.arrears} />
            </div>
            <div className="min-[380px]:col-span-2">
              {t.auth_user_id ? <ResetTenantPasswordDialog tenant={t} /> : <CreateTenantLoginDialog tenant={t} />}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}



/**
 * Creates a portal login for a tenant who never signed up themselves. The
 * landlord picks the email + password and hands them over.
 */
function CreateTenantLoginDialog({ tenant: t }: { tenant: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(t.email ?? "");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    setBusy(true);
    try {
      await createTenantLogin({ data: { tenantId: t.id, email: email.trim(), password: pwd } });
      toast.success("Login created", { description: `Give ${email.trim()} and the password to ${t.full_name}.` });
      setPwd("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["tenants"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <KeyRound className="h-4 w-4" /> Create portal login
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Create portal login — {t.full_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            This tenant has no portal account yet. Set their Gmail (or any email) and a starting password, then share
            both — they can change the password later from the tenant portal.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor={`em-${t.id}`}>Tenant email</Label>
            <Input
              id={`em-${t.id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tenant@gmail.com"
              aria-invalid={!validEmail}
              className={!validEmail ? "border-destructive" : ""}
            />
            {!validEmail && <p className="text-xs text-destructive">Enter a valid email address</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`np-${t.id}`}>Starting password (min 8 characters)</Label>
            <Input id={`np-${t.id}`} value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="e.g. Rent2026!" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !validEmail || pwd.length < 8}>
            {busy ? "Creating…" : "Create login"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lets the landlord (or main account) set a new portal password for a tenant. */
function ResetTenantPasswordDialog({ tenant: t }: { tenant: any }) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await resetTenantPassword({ data: { tenantId: t.id, newPassword: pwd } });
      toast.success("Password reset — share it with the tenant");
      setPwd("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <KeyRound className="h-4 w-4" /> Reset password
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Reset portal password — {t.full_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Set a temporary password and give it to the tenant. They can change it later from the sign-in page using
            "Forgot your password?".
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor={`pw-${t.id}`}>New password (min 8 characters)</Label>
            <Input
              id={`pw-${t.id}`}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="e.g. Rent2026!"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || pwd.length < 8}>
            {busy ? "Saving…" : "Set password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lets the landlord correct a tenant's details: name, phone, deposit and dates. */
function EditTenantDatesDialog({ tenant: t }: { tenant: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState<string>(t.full_name ?? "");
  const [phone, setPhone] = useState<string>(t.phone_number ?? "");
  const [deposit, setDeposit] = useState<string>(String(t.deposit_paid ?? 0));
  const [moveIn, setMoveIn] = useState<string>(t.move_in_date ?? "");
  const [dueDay, setDueDay] = useState<string>(t.rent_due_day ? String(t.rent_due_day) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const day = dueDay ? Number(dueDay) : null;
    if (!fullName.trim() || fullName.trim().length < 2) {
      toast.error("Enter the tenant's full name");
      return;
    }
    if (phone.trim() && !/^\+?[0-9 ()-]{7,20}$/.test(phone.trim())) {
      toast.error("Enter a valid phone number");
      return;
    }
    if (day !== null && (!Number.isFinite(day) || day < 1 || day > 31)) {
      toast.error("Rent due day must be between 1 and 31");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({
        full_name: fullName.trim(),
        phone_number: phone.trim() || null,
        deposit_paid: Number(deposit) || 0,
        move_in_date: moveIn || null,
        rent_due_day: day,
      })
      .eq("id", t.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tenant details updated");
    setOpen(false);
    qc.invalidateQueries();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <Pencil className="h-4 w-4" /> Edit tenant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit tenant — {t.full_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`fn-${t.id}`}>Full name</Label>
            <Input id={`fn-${t.id}`} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`ph-${t.id}`}>Phone number</Label>
            <Input id={`ph-${t.id}`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2547XXXXXXXX" maxLength={32} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`dep-${t.id}`}>Deposit paid</Label>
            <Input id={`dep-${t.id}`} type="number" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`mi-${t.id}`}>Joining / move-in date</Label>
            <Input id={`mi-${t.id}`} type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Only change this for tenants who joined before you started using the app.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`dd-${t.id}`}>Rent due day (1–31)</Label>
            <Input
              id={`dd-${t.id}`}
              type="number"
              min={1}
              max={31}
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              placeholder="Defaults to the move-in day"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

type TenantFormPayload = {
  full_name: string;
  phone_number: string;
  unit_id: string;
  deposit_paid: number;
  move_in_date: string;
  rent_due_day: string;
  opening_rent_paid: number;
  payment_method: string;
  payment_reference: string;
};

function TenantForm({
  vacantUnits,
  defaultProperty = "",
  onSubmit,
  saving = false,
}: {
  vacantUnits: any[];
  defaultProperty?: string;
  onSubmit: (payload: TenantFormPayload) => void;
  saving?: boolean;
}) {
  const unitProps = Array.from(new Set(vacantUnits.map((u: any) => u.properties?.name ?? "Other"))).sort() as string[];
  const [propName, setPropName] = useState(unitProps.includes(defaultProperty) ? defaultProperty : unitProps.length === 1 ? unitProps[0] : "");
  const unitsHere = vacantUnits.filter((u: any) => (u.properties?.name ?? "Other") === propName);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [unitId, setUnitId] = useState("");
  const [deposit, setDeposit] = useState("0");
  // New tenants always join today — the landlord can only adjust dates for
  // existing tenants (from the Edit tenant dialog).
  const [moveInDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rentDueDay, setRentDueDay] = useState("");
  const [step, setStep] = useState<"details" | "payment">("details");
  const [paymentMode, setPaymentMode] = useState<"months" | "amount">("months");
  const [months, setMonths] = useState("0");
  const [openingAmount, setOpeningAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("mpesa");
  const [paymentReference, setPaymentReference] = useState("");
  const monthlyRent = Number(vacantUnits.find((u: any) => u.id === unitId)?.rent_amount) || 0;
  const openingPaid = paymentMode === "months" ? Number(months) * monthlyRent : Number(openingAmount);
  const remaining = Math.max(0, monthlyRent - openingPaid);
  const credit = Math.max(0, openingPaid - monthlyRent);

  const contactsSupported =
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    // @ts-expect-error - Contact Picker API is not in the default TS lib
    typeof navigator.contacts?.select === "function";

  const pickContact = async () => {
    try {
      // @ts-expect-error - Contact Picker API is not in the default TS lib
      const contacts: Array<{ name?: string[]; tel?: string[] }> = await navigator.contacts.select(
        ["name", "tel"],
        { multiple: false },
      );
      const c = contacts?.[0];
      if (!c) return;
      const name = c.name?.[0] ?? "";
      const tel = c.tel?.[0] ?? "";
      if (name) setFullName(name);
      if (tel) setPhone(tel.replace(/\s+/g, ""));
      toast.success("Contact imported");
    } catch (err: any) {
      if (err?.name === "SecurityError") {
        toast.error("Contact picker needs a secure context (HTTPS).");
      } else if (err?.name !== "AbortError") {
        toast.error(err?.message ?? "Couldn't read contact");
      }
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "details") {
          setStep("payment");
          return;
        }
        if (!Number.isFinite(openingPaid) || openingPaid < 0 || (openingPaid > 0 && !monthlyRent)) {
          toast.error("Enter a valid opening rent payment");
          return;
        }
        onSubmit({
          full_name: fullName,
          phone_number: phone,
          unit_id: unitId,
          deposit_paid: Number(deposit) || 0,
          move_in_date: moveInDate,
          rent_due_day: rentDueDay,
          opening_rent_paid: openingPaid,
          payment_method: paymentMethod,
          payment_reference: paymentReference.trim(),
        });
      }}
      className="space-y-3"
    >
      {step === "details" ? <>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={pickContact}
          disabled={!contactsSupported}
          title={contactsSupported ? "Pick from your phone contacts" : "Contact picker only works on Android Chrome/Edge over HTTPS"}
        >
          <ContactRound className="h-4 w-4" />
          Import from contacts
        </Button>
      </div>
      {!contactsSupported && (
        <p className="text-[11px] text-muted-foreground -mt-2">
          Tip: open this app on an Android phone in Chrome/Edge to pick from contacts.
        </p>
      )}
      <div>
        <Label>Full Name</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div>
        <Label>Phone Number</Label>
        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2547XXXXXXXX" />
      </div>
      <div>
        <Label>Property</Label>
        <Select value={propName} onValueChange={(v) => { setPropName(v); setUnitId(""); }} required>
          <SelectTrigger><SelectValue placeholder="Choose the property first" /></SelectTrigger>
          <SelectContent>
            {unitProps.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Vacant Unit</Label>
        <Select value={unitId} onValueChange={setUnitId} required disabled={!propName}>
          <SelectTrigger><SelectValue placeholder={propName ? "Select a vacant unit" : "Pick a property above"} /></SelectTrigger>
          <SelectContent>
            {unitsHere.map((u: any) => (
              <SelectItem key={u.id} value={u.id}>
                {u.properties?.name} — {u.unit_number} ({money(Number(u.rent_amount))})
              </SelectItem>
            ))}
            {vacantUnits.length === 0 && (
              <div className="p-2 text-sm text-muted-foreground">No vacant units</div>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Deposit Paid</Label>
          <Input type="number" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </div>
        <div>
          <Label>Move-in Date</Label>
          <Input type="date" value={moveInDate} readOnly disabled />
          <p className="mt-1 text-[11px] text-muted-foreground">Set automatically to today — the day they join.</p>
        </div>
        <div className="col-span-2">
          <Label>Rent Due Day (1–31)</Label>
          <Input
            type="number"
            min={1}
            max={31}
            value={rentDueDay}
            onChange={(e) => setRentDueDay(e.target.value)}
            placeholder="Auto from move-in date"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Cron auto-generates a new invoice every month on this day.
          </p>
        </div>
      </div>
      <DialogFooter><Button type="submit">Next: opening rent</Button></DialogFooter>
      </> : <>
        <div className="space-y-1 border-b pb-3">
          <p className="font-medium">Opening rent · {fullName}</p>
          <p className="text-sm text-muted-foreground">{propName} · {vacantUnits.find((u: any) => u.id === unitId)?.unit_number} · {money(monthlyRent)} per month</p>
        </div>
        <div className="space-y-2">
          <Label>How much rent has the tenant already paid?</Label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={paymentMode === "months" ? "default" : "outline"} onClick={() => setPaymentMode("months")}>Months</Button>
            <Button type="button" size="sm" variant={paymentMode === "amount" ? "default" : "outline"} onClick={() => setPaymentMode("amount")}>Exact amount</Button>
          </div>
          {paymentMode === "months" ? (
            <div><Label htmlFor="opening-months">Months of rent paid</Label><Input id="opening-months" type="number" min="0" max="120" step="1" value={months} onChange={(e) => setMonths(e.target.value)} required /></div>
          ) : (
            <div><Label htmlFor="opening-amount">Rent paid (KES)</Label><Input id="opening-amount" type="number" min="0" step="0.01" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} required /></div>
          )}
          <p className="text-xs text-muted-foreground">The deposit of {money(Number(deposit) || 0)} is kept separate from rent.</p>
        </div>
        {openingPaid > 0 && <>
          <div><Label>Payment method</Label><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mpesa">M-Pesa</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent></Select></div>
          <div><Label htmlFor="opening-reference">Reference (optional)</Label><Input id="opening-reference" maxLength={40} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="M-Pesa code or bank reference" /></div>
        </>}
        <div className="border-t pt-3 text-sm space-y-1" aria-live="polite">
          <div className="flex justify-between"><span>First rent due</span><strong>{money(monthlyRent)}</strong></div>
          <div className="flex justify-between"><span>Opening rent paid</span><strong>{money(Number.isFinite(openingPaid) ? openingPaid : 0)}</strong></div>
          <div className="flex justify-between"><span>{credit > 0 ? "Paid-ahead credit" : "Balance still due"}</span><strong>{money(credit > 0 ? credit : remaining)}</strong></div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => setStep("details")} disabled={saving}>Back</Button>
          <Button type="submit" disabled={saving || !Number.isFinite(openingPaid) || openingPaid < 0 || (openingPaid > 0 && !monthlyRent)}>{saving ? "Assigning…" : "Assign tenant"}</Button>
        </DialogFooter>
      </>}
    </form>
  );
}
