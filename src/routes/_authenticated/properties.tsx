import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { UNIT_TYPES, unitTypeLabel } from "@/lib/unit-types";

export const Route = createFileRoute("/_authenticated/properties")({
  head: () => ({
    meta: [
      { title: "Properties & Units — Rotich Management Systems" },
      { name: "description", content: "Manage buildings and rental units, monthly rent and occupancy status." },
      { property: "og:title", content: "Properties & Units — Rotich Management Systems" },
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

  const deleteProperty = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["units-full"] });
      toast.success("Property deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteUnit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units-full"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Unit deleted");
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
        <CardHeader><CardTitle className="text-base">Properties</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(properties ?? []).map((p: any) => {
                const unitCount = (units ?? []).filter((u: any) => u.property_id === p.id).length;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.location ?? "—"}</TableCell>
                    <TableCell className="text-right">{unitCount}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete property "{p.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {unitCount > 0
                                ? `This property has ${unitCount} unit(s). Delete the units first before removing the property.`
                                : "This will permanently remove the property."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={unitCount > 0}
                              onClick={() => deleteProperty.mutate(p.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!properties || properties.length === 0) && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No properties yet. Add one to get started.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Units</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit #</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Monthly Rent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(units ?? []).map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.unit_number}</TableCell>
                  <TableCell>{u.properties?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{unitTypeLabel(u.unit_type)}</Badge></TableCell>
                  <TableCell className="text-right">{money(Number(u.rent_amount))}</TableCell>
                  <TableCell>
                    <Badge className={u.status === "occupied" ? "bg-primary text-primary-foreground" : ""} variant={u.status === "occupied" ? "default" : "secondary"}>
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(u); setUnitOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete unit "{u.unit_number}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {u.status === "occupied"
                                ? "This unit is occupied. Move the tenant out first before deleting."
                                : "This will permanently remove the unit."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={u.status === "occupied"}
                              onClick={() => deleteUnit.mutate(u.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!units || units.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No units yet. Add a property, then units.</TableCell></TableRow>
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
  const [unitType, setUnitType] = useState<string>(initial?.unit_type ?? "bedsitter");
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
          unit_type: unitType,
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
      <div>
        <Label>Room type</Label>
        <Select value={unitType} onValueChange={setUnitType}>
          <SelectTrigger><SelectValue placeholder="Select room type" /></SelectTrigger>
          <SelectContent>
            {UNIT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
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
