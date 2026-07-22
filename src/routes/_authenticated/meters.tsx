import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/meters")({
  head: () => ({
    meta: [
      { title: "Meter Readings & Utilities — Rotich Management Systems" },
      { name: "description", content: "Log utility meter readings and compute per-tenant utility bills automatically." },
      { property: "og:title", content: "Meter Readings & Utilities — Rotich Management Systems" },
      { property: "og:description", content: "Log meter readings; auto-calc utility bills." },
    ],
  }),
  component: MetersPage,
});

function MetersPage() {
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState<string>("");
  const [current, setCurrent] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const { data: tenants } = useQuery({
    queryKey: ["active-tenants"],
    queryFn: async () =>
      (await supabase.from("tenants").select("id,full_name,units(unit_number)").eq("active", true).order("full_name")).data ?? [],
  });

  const { data: readings } = useQuery({
    queryKey: ["readings"],
    queryFn: async () =>
      (await supabase.from("utility_readings").select("*,tenants(full_name)").order("reading_date", { ascending: false }).limit(50)).data ?? [],
  });

  const previous = useMemo(() => {
    if (!tenantId) return 0;
    const rows = (readings ?? []).filter((r: any) => r.tenant_id === tenantId);
    if (!rows.length) return 0;
    return Number(rows[0].current_reading);
  }, [tenantId, readings]);

  const consumed = Math.max(0, (Number(current) || 0) - previous);
  const total = consumed * (Number(rate) || 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Select a tenant");
      const cur = Number(current);
      if (cur < previous) throw new Error("Current reading cannot be less than previous");
      const { error } = await supabase.from("utility_readings").insert({
        tenant_id: tenantId,
        reading_date: date,
        previous_reading: previous,
        current_reading: cur,
        unit_rate: Number(rate) || 0,
        total_amount: total,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["readings"] });
      setCurrent("");
      toast.success("Reading saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Meter Readings & Utilities</h2>
        <p className="text-sm text-muted-foreground">Log meter readings — utility totals compute automatically.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">New Reading</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <Label>Tenant / Unit</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {(tenants ?? []).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name} — {t.units?.unit_number ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Previous</Label><Input value={previous} readOnly /></div>
            <div><Label>Current</Label><Input type="number" min={previous} value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
            <div><Label>Rate</Label><Input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary p-3">
            <div className="text-sm">
              Units consumed: <span className="font-semibold">{consumed}</span> · Total:{" "}
              <span className="font-semibold text-primary">{money(total)}</span>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !tenantId}>
              <Plus className="h-4 w-4" />Save Reading
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Readings</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead className="text-right">Previous</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Consumed</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(readings ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.reading_date}</TableCell>
                  <TableCell className="font-medium">{r.tenants?.full_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.previous_reading}</TableCell>
                  <TableCell className="text-right">{r.current_reading}</TableCell>
                  <TableCell className="text-right">{Number(r.current_reading) - Number(r.previous_reading)}</TableCell>
                  <TableCell className="text-right">{money(Number(r.unit_rate))}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{money(Number(r.total_amount))}</TableCell>
                </TableRow>
              ))}
              {(!readings || readings.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No readings yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
