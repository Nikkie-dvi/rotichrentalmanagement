import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, Building2, CalendarClock, Wallet, AlertCircle, RefreshCw } from "lucide-react";
import { TicketModal } from "@/components/tenant/ticket-modal";
import { MoveOutCard } from "@/components/tenant/move-out-card";
import { TenantBackBar } from "@/components/tenant/back-bar";
import { RentRemindersCard } from "@/components/tenant/rent-reminders-card";
import { toast } from "sonner";

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

function nextDueDate(rentDueDay: number | null): { date: Date; label: string } {
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
  return { date: due, label };
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

  // Fetch tenant profile + unit + property.
  const tenantQuery = useQuery({
    queryKey: ["tenant", "me"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No session");
      const { data, error } = await supabase
        .from("tenants")
        .select("id, owner_id, full_name, phone_number, email, active, move_out_date, approval_status, declined_reason, rent_due_day, move_in_date, deposit_paid, lease_signed_at, unit_id, units(id, unit_number, rent_amount, status, properties(name, location))")
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
      const [inv, pay, allPay] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, month_year, total_due, balance_remaining, status, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select("id, amount_paid, payment_method, reference_no, payment_date")
          .eq("tenant_id", tenantId)
          .order("payment_date", { ascending: false })
          .limit(5),
        supabase.from("payments").select("amount_paid").eq("tenant_id", tenantId),
      ]);
      if (inv.error) throw inv.error;
      if (pay.error) throw pay.error;
      if (allPay.error) throw allPay.error;
      const invoices = inv.data ?? [];
      const outstanding = invoices.reduce((s, i) => s + Number(i.balance_remaining), 0);
      const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total_due), 0);
      const totalPaid = (allPay.data ?? []).reduce((s: number, p: any) => s + Number(p.amount_paid), 0);
      // Signed balance: negative = owed, positive = credit carried to next month.
      const net = outstanding > 0 ? -outstanding : Math.max(0, totalPaid - totalInvoiced);
      return { invoices, payments: pay.data ?? [], balance: outstanding, net };
    },
  });


  const t = tenantQuery.data;
  const unit = (t as any)?.units;
  const property = unit?.properties;
  const nextDue = useMemo(() => (t ? nextDueDate(t.rent_due_day ?? null) : null), [t]);

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
        <Card>
          <CardHeader>
            <CardTitle>Finish setting up</CardTitle>
            <CardDescription>We couldn't find a tenant profile for this account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild><Link to="/tenant/register">Register as tenant</Link></Button>
            <Button variant="outline" onClick={signOut}><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
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
        <Card>
          <CardHeader>
            <CardTitle>Your tenancy has ended</CardTitle>
            <CardDescription>
              You moved out{(t as any).move_out_date ? ` on ${(t as any).move_out_date}` : ""}, so this portal no longer
              shows unit, rent or maintenance details. Contact your landlord if this is a mistake.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button variant="outline" onClick={signOut}>
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
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <TenantBackBar title="Tenant dashboard" />
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Tenant</div>
          <h1 className="text-xl font-bold leading-tight">{t.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            {property?.name ?? "—"} · Unit {unit?.unit_number ?? "—"}
            <Badge variant="outline" className={leaseClass}>{leaseStatus}</Badge>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="mr-1 h-4 w-4" /> Sign out
        </Button>
      </div>

      {status === "pending" && (
        <Card className="mb-4 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div>
              Your application is <b>awaiting landlord approval</b>. You'll get access to rent, invoices and maintenance once approved.
            </div>
          </CardContent>
        </Card>
      )}

      {status === "declined" && (
        <Card className="mb-4 border-red-300 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
            <div>
              Your application was <b>declined</b>.{(t as any).declined_reason ? <> Reason: {(t as any).declined_reason}</> : null} Please contact your landlord.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rent due summary */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" /> Next rent due</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-2xl font-bold">{unit ? KES(Number(unit.rent_amount)) : "—"}</div>
            <div className="text-sm text-muted-foreground">
              {nextDue ? nextDue.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "—"}
            </div>
          </div>
          <Badge variant="secondary" className="text-sm">
            <Wallet className="mr-1 h-3.5 w-3.5" /> {nextDue?.label ?? "—"}
          </Badge>
        </CardContent>
      </Card>

      {/* Account balance */}
      <Card className="mb-4">
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
          <CardDescription>Updates automatically when your landlord records a payment or invoice.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {accountQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <div className={`text-2xl font-bold ${(accountQuery.data?.net ?? 0) < 0 ? "text-destructive" : (accountQuery.data?.net ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  {(accountQuery.data?.net ?? 0) > 0 ? "+" : (accountQuery.data?.net ?? 0) < 0 ? "-" : ""}
                  {KES(Math.abs(accountQuery.data?.net ?? 0))}
                </div>
                <Badge variant="outline">
                  {(accountQuery.data?.net ?? 0) < 0 ? "Balance due" : (accountQuery.data?.net ?? 0) > 0 ? "Credit" : "Cleared"}
                </Badge>
              </div>
              {(accountQuery.data?.net ?? 0) > 0 && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  You've paid ahead. This credit of {KES(accountQuery.data!.net)} is carried forward to next month's rent.
                </p>
              )}

              {accountQuery.data?.invoices.length ? (
                <div className="grid gap-1.5">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoices</div>
                  {accountQuery.data.invoices.slice(0, 6).map((i: any) => (
                    <div key={i.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <div>
                        <div className="font-medium">{i.month_year}</div>
                        <div className="text-xs capitalize text-muted-foreground">{String(i.status).replace("_", " ")}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{KES(Number(i.balance_remaining))}</div>
                        <div className="text-xs text-muted-foreground">of {KES(Number(i.total_due))}</div>
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



      <RentRemindersCard />

      {/* Report issue */}
      <div className="mb-4">
        <TicketModal tenantId={t.id} ownerId={t.owner_id} />
      </div>

      <MoveOutCard tenantId={t.id} ownerId={t.owner_id} />



      {/* Tickets */}
      <Card>
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
  );
}
