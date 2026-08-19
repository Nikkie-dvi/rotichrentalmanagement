import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Wrench, DoorOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/maintenance")({
  head: () => ({
    meta: [
      { title: "Issues & Move-outs — Rotich Management Systems" },
      { name: "description", content: "Review tenant maintenance issues with photos and respond to move-out requests." },
      { property: "og:title", content: "Issues & Move-outs — Rotich Management Systems" },
      { property: "og:description", content: "Tenant maintenance tickets, photos and move-out requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MaintenancePage,
});

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    in_progress: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
    resolved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
    approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
    declined: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? "bg-muted"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function TicketPhoto({ path, onOpen }: { path: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage
        .from("maintenance-attachments")
        .createSignedUrl(path, 60 * 30);
      if (!cancelled && !error && data) setUrl(data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!url) {
    return <div className="mt-2 h-28 w-28 animate-pulse rounded-md bg-muted" />;
  }
  return (
    <button type="button" onClick={() => onOpen(url)} className="mt-2 block">
      <img
        src={url}
        alt="Photo attached to the tenant's maintenance request"
        loading="lazy"
        className="h-28 w-28 rounded-md border object-cover transition hover:opacity-90"
      />
    </button>
  );
}

function MaintenancePage() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [responses, setResponses] = useState<Record<string, string>>({});

  const tickets = useQuery({
    queryKey: ["landlord", "tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_tickets")
        .select("*, tenants(full_name, phone_number, units(unit_number, properties(name)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const moveOuts = useQuery({
    queryKey: ["landlord", "move-outs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("move_out_requests")
        .select("*, tenants(full_name, phone_number, unit_id, units(unit_number, properties(name)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateTicket = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status?: string; note?: string }) => {
      const patch: Record<string, unknown> = {};
      if (status) patch.status = status;
      if (note !== undefined) patch.landlord_note = note.trim() ? note.trim().slice(0, 1000) : null;
      const { error } = await (supabase as any).from("maintenance_tickets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Ticket updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const respondMoveOut = useMutation({
    mutationFn: async ({ req, status, response }: { req: any; status: "approved" | "declined"; response: string }) => {
      const { error } = await (supabase as any)
        .from("move_out_requests")
        .update({
          status,
          landlord_response: response.trim() ? response.trim().slice(0, 1000) : null,
          responded_at: new Date().toISOString(),
        })
        .eq("id", req.id);
      if (error) throw error;

      if (status === "approved") {
        const { error: tErr } = await supabase
          .from("tenants")
          .update({
            active: false,
            move_out_date: (req.requested_date as string) ?? new Date().toISOString().slice(0, 10),
          })
          .eq("id", req.tenant_id);
        if (tErr) throw tErr;
        if (req.tenants?.unit_id) {
          const { error: uErr } = await supabase.from("units").update({ status: "vacant" }).eq("id", req.tenants.unit_id);
          if (uErr) throw uErr;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Response sent to tenant");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openTicketCount = (tickets.data ?? []).filter((t: any) => t.status !== "resolved").length;
  const openMoveOuts = (moveOuts.data ?? []).filter((r: any) => r.status === "pending");
  const pastMoveOuts = (moveOuts.data ?? []).filter((r: any) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Issues & Move-outs</h2>
        <p className="text-sm text-muted-foreground">Tenant-reported problems with photos, and move-out requests.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" /> Maintenance issues
            {openTicketCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-none text-destructive-foreground">
                {openTicketCount}
              </span>
            )}
          </CardTitle>
          <CardDescription>Photos uploaded by tenants — tap a photo to enlarge.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {tickets.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {tickets.data?.length === 0 && <p className="text-sm text-muted-foreground">No issues reported yet.</p>}
          {tickets.data?.map((tk: any) => (
            <div key={tk.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {tk.tenants?.full_name ?? "Tenant"}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {tk.tenants?.units?.properties?.name ?? "—"} Unit {tk.tenants?.units?.unit_number ?? "—"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs capitalize text-muted-foreground">
                    {tk.category} · {tk.urgency} urgency · {new Date(tk.created_at).toLocaleString()}
                  </div>
                </div>
                {statusBadge(tk.status)}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm">{tk.description}</p>
              {tk.image_url && <TicketPhoto path={tk.image_url} onOpen={setPreview} />}

              <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
                <Select value={tk.status} onValueChange={(v) => updateTicket.mutate({ id: tk.id, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
                <div className="grid gap-2">
                  <Textarea
                    rows={2}
                    maxLength={1000}
                    placeholder="Reply to the tenant (optional)…"
                    value={notes[tk.id] ?? tk.landlord_note ?? ""}
                    onChange={(e) => setNotes((s) => ({ ...s, [tk.id]: e.target.value }))}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateTicket.mutate({ id: tk.id, note: notes[tk.id] ?? tk.landlord_note ?? "" })}
                    >
                      Send reply
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <DoorOpen className="h-4 w-4" /> Move-out requests
          </CardTitle>
          <CardDescription>Approving marks the tenant inactive and frees the unit.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {moveOuts.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {openMoveOuts.length === 0 && !moveOuts.isLoading && (
            <p className="text-sm text-muted-foreground">No pending move-out requests.</p>
          )}
          {openMoveOuts.map((r: any) => (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">
                    {r.tenants?.full_name ?? "Tenant"}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {r.tenants?.units?.properties?.name ?? "—"} Unit {r.tenants?.units?.unit_number ?? "—"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Requested move-out: {r.requested_date ?? "not specified"} · sent {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                {statusBadge(r.status)}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{r.reason}</p>
              <Textarea
                className="mt-2"
                rows={2}
                maxLength={1000}
                placeholder="Feedback to the tenant…"
                value={responses[r.id] ?? ""}
                onChange={(e) => setResponses((s) => ({ ...s, [r.id]: e.target.value }))}
              />
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={respondMoveOut.isPending}
                  onClick={() => respondMoveOut.mutate({ req: r, status: "declined", response: responses[r.id] ?? "" })}
                >
                  Decline
                </Button>
                <Button
                  size="sm"
                  disabled={respondMoveOut.isPending}
                  onClick={() => respondMoveOut.mutate({ req: r, status: "approved", response: responses[r.id] ?? "" })}
                >
                  Approve move-out
                </Button>
              </div>
            </div>
          ))}

          {pastMoveOuts.length > 0 && (
            <div className="mt-2 grid gap-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Handled</div>
              {pastMoveOuts.map((r: any) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span>
                    {r.tenants?.full_name} · Unit {r.tenants?.units?.unit_number ?? "—"}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {r.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {r.responded_at ? new Date(r.responded_at).toLocaleDateString() : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attached photo</DialogTitle>
          </DialogHeader>
          {preview && <img src={preview} alt="Tenant maintenance issue photo, full size" className="w-full rounded-md" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
