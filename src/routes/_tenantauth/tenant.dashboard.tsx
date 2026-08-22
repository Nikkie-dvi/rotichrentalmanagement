import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { InvoiceCharges } from "@/components/invoice-charges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, Building2, CalendarClock, Wallet, AlertCircle, RefreshCw, FileSignature } from "lucide-react";
import { TicketModal } from "@/components/tenant/ticket-modal";
import { MoveOutCard } from "@/components/tenant/move-out-card";
import { TenantBackBar } from "@/components/tenant/back-bar";
import { RentRemindersCard } from "@/components/tenant/rent-reminders-card";
import { LandlordPaymentCard } from "@/components/tenant/landlord-payment-card";
import { LandlordMessageCard } from "@/components/tenant/landlord-message-card";
import { getMyLandlordInfo } from "@/lib/tenant.functions";
import { LeaseDialog } from "@/components/lease-document";
import { LeaseCopyActions } from "@/components/tenant/lease-copy-actions";
import { toast } from "sonner";
import { accruedRent, buildLedger } from "@/lib/ledger";


export const Route = createFileRoute("/_tenantauth/tenant/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tenant Dashboard — Rotich Management Systems" },
      { name: "description", content: "Your lease, next rent due, and open maintenance tickets." },
      { property: "og:title", content: "Tenant Dashboard" },
      { property: "og:description", content: "Your lease, next rent due, and open maintenance tickets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

const KES = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

function nextDueDate(rentDueDay: number | null): { date: Date; label: string; diffDays: number } {
  const today = new Date();
  const day = Math.max(1, Math.min(31, rentDueDay ?? today.getDate()));
  const lastThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const effectiveThis = Math.min(day, lastThisMonth);
  let due = new Date(today.getFullYear(), today.getMonth(), effectiveThis);
  if (due < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const lastNext = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    due = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(day, lastNext));
  }
  const diffDays = Math.ceil((due.getTime() - Date.now()) / 86400000);
  const label = diffDays <= 0 ? "Due today" : `In ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  return { date: due, label, diffDays };
}

function dueUrgencyColor(daysToDue: number) {
  const maxDays = 30;
  const urgency = Math.max(0, Math.min(1, 1 - daysToDue / maxDays));
  const hue = Math.round(140 - urgency * 140);
  return {
    text: `hsl(${hue}, 85%, 55%)`,
    bg: `hsla(${hue}, 80%, 55%, 0.15)`,
    border: `hsla(${hue}, 80%, 55%, 0.4)`,
  };
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
    in_progress: { label: "In Progress", className: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200" },
    resolved: { label: "Resolved", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

function DashboardPage() {
  const navigate = useNavigate();
  const [leaseOpen, setLeaseOpen] = useState(false);
  const landlordInfoQuery = useQuery({
    queryKey: ["tenant", "landlord-info"],
    queryFn: () => getMyLandlordInfo(),
    staleTime: 60_000,
  });


  // Fetch tenant profile + unit + property.
  const tenantQuery = useQuery({
    queryKey: ["tenant", "me"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No session");
      const { data, error } = await supabase
        .from("tenants")
        .select("id, owner_id, full_name, phone_number, email, active, move_out_date, approval_status, declined_reason, rent_due_day, move_in_date, deposit_paid, lease_signature, lease_signed_at, unit_id, units(id, unit_number, rent_amount, status, properties(name, location))")
        .eq("auth_user_id", user.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ticketsQuery = useQuery({
    queryKey: ["tenant", "tickets", tenantQuery.data?.id],
    enabled: Boolean(tenantQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_tickets")
        .select("id, category, urgency, description, status, created_at, image_url, landlord_note")
        .eq("tenant_id", tenantQuery.data!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Account balance: invoices + payments for this tenant.
  const accountQuery = useQuery({
    queryKey: ["tenant", "account", tenantQuery.data?.id],
    enabled: Boolean(tenantQuery.data?.id),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    queryFn: async () => {
      const tenantId = tenantQuery.data!.id;
      const [inv, pay, allPay, credits] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, month_year, total_due, balance_remaining, status, created_at, base_rent, utility_amount, water_amount, electricity_amount, garbage_amount, other_amount, other_label, late_penalty_amount, due_date, penalty_waived")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select("id, amount_paid, payment_method, reference_no, payment_date")
          .eq("tenant_id", tenantId)
          .order("payment_date", { ascending: false })
          .limit(5),
        supabase.from("payments").select("amount_paid").eq("tenant_id", tenantId),
        supabase.from("tenant_credit_events").select("delta").eq("tenant_id", tenantId),
      ]);
      if (inv.error) throw inv.error;
      if (pay.error) throw pay.error;
      if (allPay.error) throw allPay.error;
      const invoices = inv.data ?? [];
      const outstanding = invoices.reduce((s, i) => s + Number(i.balance_remaining), 0);
      const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total_due), 0);
      const totalPaid = (allPay.data ?? []).reduce((s: number, p: any) => s + Number(p.amount_paid), 0);
      // Landlord credit edits (applied / written off / topped up) shift the balance too.
      const adjustments = (credits.data ?? []).reduce((s: number, c: any) => s + Number(c.delta ?? 0), 0);
      return { invoices, payments: pay.data ?? [], balance: outstanding, totalInvoiced, totalPaid, adjustments };

    },
  });


  const t = tenantQuery.data;
  const unit = (t as any)?.units;
  const property = unit?.properties;
  const nextDue = useMemo(() => (t ? nextDueDate(t.rent_due_day ?? null) : null), [t]);
  const urgency = useMemo(() => dueUrgencyColor(nextDue?.diffDays ?? 0), [nextDue]);

  // Rent accrues automatically on every anniversary of the move-in / due day,
  // even before the landlord issues an invoice.
  const accrued = useMemo(
    () =>
      accruedRent({
        rentAmount: unit?.rent_amount,
        moveInDate: (t as any)?.move_in_date ?? null,
        rentDueDay: (t as any)?.rent_due_day ?? null,
      }),
    [t, unit?.rent_amount],
  );

  const net = useMemo(() => {
    const d = accountQuery.data;
    if (!d) return 0;
    return buildLedger({
      invoiced: d.totalInvoiced,
      paid: d.totalPaid,
      adjustments: (d as any).adjustments,
      accrued,
    }).net;
  }, [accountQuery.data, accrued]);



  const rentSettled = net >= 0;

  useEffect(() => {
    // Subscribe to ticket, invoice and payment updates so changes appear live.
    if (!t?.id) return;
    const channel = supabase
      .channel(`tenant-live-${t.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_tickets", filter: `tenant_id=eq.${t.id}` }, () => {
        ticketsQuery.refetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        accountQuery.refetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        accountQuery.refetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tenants", filter: `id=eq.${t.id}` }, () => {
        tenantQuery.refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id]);


  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/tenant/login", replace: true });
  };

  if (tenantQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No tenant profile linked to this auth user — send to registration.
  if (!t) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Finish setting up</CardTitle>
            <CardDescription>We couldn't find a tenant profile for this account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild className="glass-btn glow-blue"><Link to="/tenant/register">Register as tenant</Link></Button>
            <Button variant="outline" onClick={signOut} className="glass-btn glow-red"><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  // Tenancy ended — no access to unit/property data anymore.
  const movedOut = !(t as any).active || Boolean((t as any).move_out_date);
  if (movedOut) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Your tenancy has ended</CardTitle>
            <CardDescription>
              You moved out{(t as any).move_out_date ? ` on ${(t as any).move_out_date}` : ""}, so this portal no longer
              shows unit, rent or maintenance details. Contact your landlord if this is a mistake.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button variant="outline" onClick={signOut} className="glass-btn glow-red">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


  const status = (t as any).approval_status as "pending" | "approved" | "declined" | undefined;
  const leaseStatus =
    status === "approved" || t.active ? "Active" :
    status === "declined" ? "Declined" :
    "Awaiting approval";
  const leaseClass =
    status === "approved" || t.active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
    status === "declined" ? "bg-red-500/10 text-red-700 dark:text-red-300" :
    "bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Futuristic animated background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-muted/60 via-background to-muted/70" />
      {/* Darkening veil so the glass cards and content pop */}
      <div className="absolute inset-0 -z-10 bg-slate-950/25 dark:bg-slate-950/55" />
      <div
        className="tenant-bg-grid absolute inset-0 -z-10 opacity-20"
        style={{ animation: "tenant-grid-fade 8s ease-in-out infinite" }}
      />


      {/* "ROTICH / RENTALS" square watermark */}
      <div className="tenant-watermark -z-10" />
      <div
        className="tenant-bg-orb -z-10 h-72 w-72 bg-primary/30"
        style={{ top: "-8%", left: "-12%", animation: "tenant-orb-1 14s ease-in-out infinite" }}
      />
      <div
        className="tenant-bg-orb -z-10 h-64 w-64 bg-accent/25"
        style={{ bottom: "-5%", right: "-10%", animation: "tenant-orb-2 16s ease-in-out infinite" }}
      />
      <div
        className="tenant-bg-orb -z-10 h-48 w-48 bg-primary/20"
        style={{ top: "45%", left: "55%", animation: "tenant-orb-3 12s ease-in-out infinite" }}
      />

      {/* Same layout, glass-styled cards */}
      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <TenantBackBar title="Tenant dashboard" />

      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl glass-card px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Tenant</div>
          <h1 className="text-xl font-bold leading-tight">{t.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            {property?.name ?? "—"} · Unit {unit?.unit_number ?? "—"}
            <Badge variant="outline" className={leaseClass}>{leaseStatus}</Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={signOut} className="glass-btn glow-red">
          <LogOut className="mr-1 h-4 w-4" /> Sign out
        </Button>
      </div>

      <LandlordMessageCard />

      {status === "pending" && (
        <Card className="mb-4 glass-card glow-amber border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div>
              Your application is <b>awaiting landlord approval</b>. You'll get access to rent, invoices and maintenance once approved.
            </div>
          </CardContent>
        </Card>
      )}

      {status === "declined" && (
        <Card className="mb-4 glass-card glow-red border-red-300 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
            <div>
              Your application was <b>declined</b>.{(t as any).declined_reason ? <> Reason: {(t as any).declined_reason}</> : null} Please contact your landlord.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rent due summary — floating, detached bar */}
      <div className="relative z-10 mb-6 px-0.5">
        <Card
          className={`floating-panel glass-card border-0 !p-0 ${
            rentSettled ? "!bg-emerald-500/12" : "!bg-red-500/12"
          }`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" /> Next rent due</CardTitle>
            <CardDescription className={rentSettled ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>
              {rentSettled ? "Rent is paid up — nothing due right now." : "Rent is due — please clear your balance."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="text-2xl font-bold">{unit ? KES(Number(unit.rent_amount)) : "—"}</div>
              <div className="text-sm transition-colors duration-500" style={{ color: urgency.text }}>
                {nextDue ? nextDue.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "—"}
              </div>
            </div>
            <Badge
              variant="outline"
              className="text-sm backdrop-blur transition-colors duration-500"
              style={{ color: urgency.text, backgroundColor: urgency.bg, borderColor: urgency.border }}
            >
              <Wallet className="mr-1 h-3.5 w-3.5" /> {nextDue?.label ?? "—"}
            </Badge>
          </CardContent>
        </Card>
      </div>


      {/* Account balance */}
      <Card
        className={`mb-4 glass-card backdrop-blur-xl ${
          net < 0
            ? "!border-red-500/30 !bg-red-500/5"
            : "!border-emerald-500/30 !bg-emerald-500/5"
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" /> My account balance</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => accountQuery.refetch()}
              disabled={accountQuery.isFetching}
              aria-label="Refresh balance"
            >
              <RefreshCw className={`h-4 w-4 ${accountQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <CardDescription>Rent is added automatically each month on your due date, and updates when payments are recorded.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {accountQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <>
              {/* Detached, floating balance panel — sits above the invoice list */}
              <div
                className={`floating-panel relative z-10 grid gap-2 p-4 ${
                  net < 0 ? "bg-red-500/12" : "bg-emerald-500/12"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className={`text-3xl font-bold tracking-tight ${net < 0 ? "text-destructive" : net > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                    {net > 0 ? "+" : net < 0 ? "-" : ""}
                    {KES(Math.abs(net))}
                  </div>
                  <Badge
                    variant="outline"
                    className={`backdrop-blur ${net < 0 ? "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300" : "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"}`}
                  >
                    {net < 0 ? "Balance due" : net > 0 ? "Credit" : "Cleared"}
                  </Badge>
                </div>
                {net > 0 && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    You've paid ahead. This credit of {KES(net)} is carried forward to next month's rent.
                  </p>
                )}
              </div>



              {accountQuery.data?.invoices.length ? (
                <div className="grid gap-1.5">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoices</div>
                  {accountQuery.data.invoices.slice(0, 6).map((i: any) => (
                    <div key={i.id} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{i.month_year}</div>
                          <div className="text-xs capitalize text-muted-foreground">{String(i.status).replace("_", " ")}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{KES(Number(i.balance_remaining))}</div>
                          <div className="text-xs text-muted-foreground">of {KES(Number(i.total_due))}</div>
                        </div>
                      </div>
                      <div className="mt-2 border-t pt-2 text-xs">
                        <InvoiceCharges invoice={i} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              )}

              {accountQuery.data?.payments.length ? (
                <div className="grid gap-1.5">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent payments</div>
                  {accountQuery.data.payments.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between rounded-md bg-muted/50 p-2 text-sm">
                      <div>
                        <div className="font-medium">{KES(Number(p.amount_paid))}</div>
                        <div className="text-xs capitalize text-muted-foreground">{p.payment_method}{p.reference_no ? ` · ${p.reference_no}` : ""}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(p.payment_date).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* Lease agreement */}
      <Card className="mb-4 glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><FileSignature className="h-4 w-4" /> My lease agreement</CardTitle>
          <CardDescription>
            {(t as any).lease_signed_at
              ? `Signed ${new Date((t as any).lease_signed_at).toLocaleString()}`
              : "Not signed yet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setLeaseOpen(true)} className="glass-btn glow-blue">
              View full lease &amp; signature
            </Button>
            {landlordInfoQuery.data?.leaseDocumentUrl && (
              <LeaseCopyActions
                url={landlordInfoQuery.data.leaseDocumentUrl}
                name={landlordInfoQuery.data.leaseDocumentName}
              />
            )}
          </div>
          {landlordInfoQuery.data?.leaseDocumentUrl && (
            <p className="mt-2 text-xs text-muted-foreground">
              {landlordInfoQuery.data.leaseDocumentName ?? "Lease document"}
              {landlordInfoQuery.data.leaseDocumentUploadedAt
                ? ` · uploaded ${new Date(landlordInfoQuery.data.leaseDocumentUploadedAt).toLocaleDateString()}`
                : ""}
            </p>
          )}
        </CardContent>
      </Card>

      <LeaseDialog
        template={landlordInfoQuery.data?.leaseTemplate ?? null}
        open={leaseOpen}
        onOpenChange={setLeaseOpen}
        lease={{
          full_name: t.full_name,
          phone_number: (t as any).phone_number,
          email: (t as any).email,
          deposit_paid: (t as any).deposit_paid,
          move_in_date: (t as any).move_in_date,
          rent_due_day: t.rent_due_day,
          lease_signature: (t as any).lease_signature,
          lease_signed_at: (t as any).lease_signed_at,
          unit_number: unit?.unit_number ?? null,
          rent_amount: unit?.rent_amount ?? null,
          property_name: property?.name ?? null,
          property_location: property?.location ?? null,
        }}
      />

      <LandlordPaymentCard />

      <RentRemindersCard />


      {/* Report issue */}
      <div className="mb-4">
        <TicketModal tenantId={t.id} ownerId={t.owner_id} />
      </div>

      <MoveOutCard tenantId={t.id} ownerId={t.owner_id} />



      {/* Tickets */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">My maintenance tickets</CardTitle>
          <CardDescription>Track open and resolved requests</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {ticketsQuery.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {ticketsQuery.data && ticketsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No tickets yet. Use the button above to report an issue.</p>
          )}
          {ticketsQuery.data?.map((ticket: any) => (
            <div key={ticket.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium capitalize">
                    {ticket.category}
                    <span className="text-xs text-muted-foreground">· {ticket.urgency} urgency</span>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{ticket.description}</p>
                  <div className="mt-1 text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleString()}</div>
                </div>
                {statusBadge(ticket.status)}
              </div>
              {ticket.image_url && (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-primary underline"
                  onClick={async () => {
                    const { data, error } = await supabase.storage
                      .from("maintenance-attachments")
                      .createSignedUrl(ticket.image_url, 60 * 10);
                    if (error) return toast.error(error.message);
                    window.open(data.signedUrl, "_blank", "noopener");
                  }}
                >
                  View attached photo
                </button>
              )}
              {ticket.landlord_note && (
                <p className="mt-2 rounded-md bg-muted p-2 text-sm">
                  <span className="font-medium">Landlord: </span>
                  {ticket.landlord_note}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </div>

  );
}
