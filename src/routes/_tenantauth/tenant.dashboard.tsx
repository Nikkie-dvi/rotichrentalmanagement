import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, Building2, CalendarClock, Wallet, AlertCircle } from "lucide-react";
import { TicketModal } from "@/components/tenant/ticket-modal";
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
        .select("id, owner_id, full_name, phone_number, email, active, approval_status, declined_reason, rent_due_day, move_in_date, deposit_paid, lease_signed_at, unit_id, units(id, unit_number, rent_amount, status, properties(name, location))")
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
        .select("id, category, urgency, description, status, created_at, image_url")
        .eq("tenant_id", tenantQuery.data!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const t = tenantQuery.data;
  const unit = (t as any)?.units;
  const property = unit?.properties;
  const nextDue = useMemo(() => (t ? nextDueDate(t.rent_due_day ?? null) : null), [t]);

  useEffect(() => {
    // Subscribe to ticket updates so status changes appear live.
    if (!t?.id) return;
    const channel = supabase
      .channel(`tickets-${t.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_tickets", filter: `tenant_id=eq.${t.id}` }, () => {
        ticketsQuery.refetch();
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

      {/* Report issue */}
      <div className="mb-4">
        <TicketModal tenantId={t.id} ownerId={t.owner_id} />
      </div>

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
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
