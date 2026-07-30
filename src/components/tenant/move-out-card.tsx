import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DoorOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = { tenantId: string; ownerId: string };

function badge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
    declined: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}

export function MoveOutCard({ tenantId, ownerId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  const requests = useQuery({
    queryKey: ["tenant", "move-outs", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("move_out_requests")
        .select("id, requested_date, reason, status, landlord_response, responded_at, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 5) throw new Error("Please tell your landlord why (min 5 chars)");
      const { error } = await (supabase as any).from("move_out_requests").insert({
        tenant_id: tenantId,
        owner_id: ownerId,
        requested_date: date || null,
        reason: reason.trim().slice(0, 1000),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Move-out request sent");
      qc.invalidateQueries({ queryKey: ["tenant", "move-outs", tenantId] });
      setOpen(false);
      setReason("");
      setDate("");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to send"),
  });

  const hasPending = (requests.data ?? []).some((r: any) => r.status === "pending");

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <DoorOpen className="h-4 w-4" /> Move out
        </CardTitle>
        <CardDescription>Request to end your tenancy and get your landlord's response.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {(requests.data ?? []).map((r: any) => (
          <div key={r.id} className="rounded-lg border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Requested for {r.requested_date ?? "no date given"} · sent {new Date(r.created_at).toLocaleDateString()}
              </div>
              {badge(r.status)}
            </div>
            <p className="mt-1 whitespace-pre-wrap">{r.reason}</p>
            {r.landlord_response && (
              <p className="mt-2 rounded-md bg-muted p-2 text-sm">
                <span className="font-medium">Landlord: </span>
                {r.landlord_response}
              </p>
            )}
          </div>
        ))}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full" disabled={hasPending}>
              {hasPending ? "Move-out request pending review" : "Request to move out"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Request to move out</DialogTitle>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit.mutate();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="moveout-date">Preferred move-out date</Label>
                <Input id="moveout-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="moveout-reason">Reason</Label>
                <Textarea
                  id="moveout-reason"
                  rows={4}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Relocating for work at the end of the month."
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submit.isPending}>
                  {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send request
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
