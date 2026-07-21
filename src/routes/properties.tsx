import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

export const Route = createFileRoute("/properties")({
  head: () => ({
    meta: [
      { title: "Properties & Units — Bomahut" },
      { name: "description", content: "Manage buildings and rental units, monthly rent and occupancy status." },
      { property: "og:title", content: "Properties & Units — Bomahut" },
      { property: "og:description", content: "Manage buildings and rental units." },
    ],
  }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const qc = useQueryClient();
  const [propOpen, setPropOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: properties } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => (await supabase.from("properties").select("*").order("name")).data ?? [],
  });
  const { data: units } = useQuery({
    queryKey: ["units-full"],
    queryFn: async () =>
      (await supabase.from("units").select("*,properties(name)").order("unit_number")).data ?? [],
  });

  const saveProperty = useMutation({
    mutationFn: async (v: { name: string; location: string }) => {
      const { error } = await supabase.from("properties").insert(v);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      setPropOpen(false);
      toast.success("Property added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveUnit = useMutation({
    mutationFn: async (v: any) => {
      if (editing) {
        const { error } = await supabase.from("units").update(v).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("units").insert(v);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units-full"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setUnitOpen(false);
      setEditing(null);
      toast.success("Unit saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Properties & Units</h2>
          <p className="text-sm text-muted-foreground">Buildings and their rentable units.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={propOpen} onOpenChange={setPropOpen}>
            <DialogTrigger asChild><Button variant="secondary"><Plus className="h-4 w-4" />Add Property</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Property</DialogTitle></DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  saveProperty.mutate({ name: String(f.get("name")), location: String(f.get("location") ?? "") });
                }}
                className="space-y-3"
              >
                <div><Label>Property Name</Label><Input name="name" required /></div>
                <div><Label>Location</Label><Input name="location" /></div>
                <DialogFooter><Button type="submit" disabled={saveProperty.isPending}>Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={unitOpen} onOpenChange={(o) => { setUnitOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4" />Add Unit</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit Unit" : "New Unit"}</DialogTitle></DialogHeader>
              <UnitForm
                properties={properties ?? []}
                initial={editing}
                onSubmit={(v) => saveUnit.mutate(v)}
                pending={saveUnit.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Units</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit #</TableHead>
                <TableHead>Property</TableHead>
                <TableHead className="text-right">Monthly Rent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(units ?? []).map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.unit_number}</TableCell>
                  <TableCell>{u.properties?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{money(Number(u.rent_amount))}</TableCell>
                  <TableCell>
                    <Badge className={u.status === "occupied" ? "bg-primary text-primary-foreground" : ""} variant={u.status === "occupied" ? "default" : "secondary"}>
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(u); setUnitOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!units || units.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No units yet. Add a property, then units.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function UnitForm({
  properties,
  initial,
  onSubmit,
  pending,
}: {
  properties: any[];
  initial: any;
  onSubmit: (v: any) => void;
  pending: boolean;
}) {
  const [propertyId, setPropertyId] = useState<string>(initial?.property_id ?? properties[0]?.id ?? "");
  const [status, setStatus] = useState<string>(initial?.status ?? "vacant");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (!propertyId) return toast.error("Select a property first");
        onSubmit({
          property_id: propertyId,
          unit_number: String(f.get("unit_number")),
          rent_amount: Number(f.get("rent_amount")),
          status,
        });
      }}
      className="space-y-3"
    >
      <div>
        <Label>Property</Label>
        <Select value={propertyId} onValueChange={setPropertyId}>
          <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
          <SelectContent>
            {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Unit Number</Label><Input name="unit_number" required defaultValue={initial?.unit_number} /></div>
      <div><Label>Monthly Rent (KES)</Label><Input type="number" min={0} step="1" name="rent_amount" required defaultValue={initial?.rent_amount ?? 0} /></div>
      <div>
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vacant">Vacant</SelectItem>
            <SelectItem value="occupied">Occupied</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter><Button type="submit" disabled={pending}>Save</Button></DialogFooter>
    </form>
  );
}
