import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, XCircle, ShieldAlert, Loader2, ChevronDown, Search, UserPlus, Ban, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ManagerFeesAdmin } from "@/components/manager-fees-admin";

import { SectionSwitcher, SectionPanel, ADMIN_TABS } from "@/components/section-switcher";
import {
  useIsSuperAdmin,
  type LandlordAccount,
} from "@/hooks/use-landlord-account";

export const Route = createFileRoute("/_authenticated/landlords")({
  head: () => ({
    meta: [
      { title: "Landlord accounts — Eden Point Real Estate" },
      { name: "description", content: "Review, approve, suspend or reactivate landlord accounts." },
      { property: "og:title", content: "Landlord accounts — Eden Point Real Estate" },
      { property: "og:description", content: "Review, approve, suspend or reactivate landlord accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandlordsPage,
});

type AccountStatus = "approved" | "declined" | "pending" | "suspended";

function Row({ row }: { row: LandlordAccount }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const setStatus = async (status: AccountStatus) => {
    setBusy(true);
    const { error } = await supabase
      .from("landlord_accounts")
      .update({
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
        declined_reason: status === "declined" ? (reason || null) : null,
      })
      .eq("id", row.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      status === "approved"
        ? row.status === "suspended"
          ? "Landlord reactivated"
          : "Landlord approved"
        : status === "declined"
          ? "Landlord declined"
          : status === "suspended"
            ? "Landlord suspended — their access is off, data stays saved"
            : "Set back to pending",
    );
    qc.invalidateQueries({ queryKey: ["landlord-accounts-all"] });
    qc.invalidateQueries({ queryKey: ["landlord-account"] });
  };

  const badgeVariant =
    row.status === "approved" ? "default" : row.status === "declined" || row.status === "suspended" ? "destructive" : "secondary";

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{row.email ?? row.full_name ?? "Landlord"}</div>
          {row.landlord_code && (
            <div className="text-xs font-mono tracking-widest text-muted-foreground">#{row.landlord_code}</div>
          )}
        </div>
        <Badge variant={badgeVariant}>{row.status}</Badge>

        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t p-4 pt-3">
          <div className="text-sm font-medium">{row.full_name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">
            Registered {new Date(row.created_at).toLocaleDateString()}
            {row.phone ? ` · ${row.phone}` : ""}
          </div>
          {row.status === "declined" && row.declined_reason && (
            <p className="mt-2 text-xs text-muted-foreground">Reason: {row.declined_reason}</p>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            {row.status !== "approved" && (
              <Button size="sm" disabled={busy} onClick={() => setStatus("approved")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : row.status === "suspended" ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {row.status === "suspended" ? "Reactivate" : "Approve"}
              </Button>
            )}
            {row.status === "approved" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("suspended")}>
                <Ban className="h-4 w-4" /> Suspend access
              </Button>
            )}
            {row.status !== "declined" && row.status !== "suspended" && (
              <>
                <div className="min-w-40 flex-1">
                  <Label className="text-xs">Decline reason (optional)</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. duplicate registration"
                  />
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("declined")}>
                  <XCircle className="h-4 w-4" /> Decline
                </Button>
              </>
            )}
            {row.status !== "pending" && row.status !== "suspended" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus("pending")}>
                Set pending
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function List({ rows }: { rows: LandlordAccount[] }) {
  return rows.length === 0 ? (
    <p className="p-4 text-sm text-muted-foreground">Nothing here yet.</p>
  ) : (
    <div className="space-y-2">
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
    </div>
  );
}

function LandlordsPage() {
  const isSuper = useIsSuperAdmin();
  const [query, setQuery] = useState("");

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["landlord-accounts-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landlord_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LandlordAccount[];
    },
  });


  if (!isSuper) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" /> Main account only
          </CardTitle>
          <CardDescription>Only the main account can review landlord registrations.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = (accounts ?? []).filter((a) =>
    !q
      ? true
      : [a.email, a.full_name, a.landlord_code, a.payment_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
  );
  const pending = visible.filter((a) => a.status === "pending");
  const approved = visible.filter((a) => a.status === "approved");
  const suspended = visible.filter((a) => a.status === "suspended");
  const declined = visible.filter((a) => a.status === "declined");



  return (
    <div className="space-y-4">
      <SectionSwitcher items={ADMIN_TABS} />
      <SectionPanel items={ADMIN_TABS}>
      <div>
        <h1 className="text-2xl font-semibold">Landlord accounts</h1>
        <p className="text-sm text-muted-foreground">
          New landlords stay locked out until you confirm them. Approved landlords use the app freely — suspend access
          anytime and their data stays saved.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-3" role="status">
          <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
          </span>
          <div>
            <p className="text-sm font-semibold">
              Action needed · {pending.length} landlord sign-up{pending.length === 1 ? "" : "s"} waiting for your approval
            </p>
            <p className="text-xs text-muted-foreground">
              They cannot use the app until you approve them. Find them in the pending list below.
            </p>
          </div>
          <UserPlus className="ml-auto hidden h-5 w-5 shrink-0 text-warning sm:block" />
        </div>
      )}

      <ManagerFeesAdmin />



      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email, name or code"
              aria-label="Search landlord accounts"
              className="pl-9"
            />
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="pending">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
                <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
                <TabsTrigger value="suspended">Suspended ({suspended.length})</TabsTrigger>
                <TabsTrigger value="declined">Declined ({declined.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="pending" className="mt-4">
                <List rows={pending} />
              </TabsContent>
              <TabsContent value="approved" className="mt-4">
                <List rows={approved} />
              </TabsContent>
              <TabsContent value="suspended" className="mt-4">
                <List rows={suspended} />
              </TabsContent>
              <TabsContent value="declined" className="mt-4">
                <List rows={declined} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
      </SectionPanel>
    </div>
  );
}
