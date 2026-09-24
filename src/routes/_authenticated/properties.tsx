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
import { useIsPropertyManager, useLandlordAccount } from "@/hooks/use-landlord-account";
import { assignableTenantsQuery, propertiesQuery, unitsFullQuery } from "@/lib/property-queries";
import { DetailedPropertyPerformance } from "@/components/property-performance";
import { loadTenantLedgers } from "@/lib/dashboard-ledgers";

export const Route = createFileRoute("/_authenticated/properties")({
  head: () => ({
    meta: [
      { title: "Properties & Units — Rotich Management Systems" },
      { name: "description", content: "Manage buildings and rental units, monthly rent and occupancy status." },
      { property: "og:title", content: "Properties & Units — Rotich Management Systems" },
      { property: "og:description", content: "Manage buildings and rental units." },
    ],
  }),
  // Warm the cache on hover/touch so the tab paints instantly when opened.
  loader: ({ context }) => {
    context.queryClient.prefetchQuery(propertiesQuery);
    context.queryClient.prefetchQuery(unitsFullQuery);
    context.queryClient.prefetchQuery(assignableTenantsQuery);
  },
  component: PropertiesPage,
});

function PropertiesPage() {
  const qc = useQueryClient();
  const [propOpen, setPropOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  // Property managers work read-only here: they cannot add, edit or delete stock.
  const isManager = useIsPropertyManager();
  const { data: account } = useLandlordAccount();

  const { data: properties } = useQuery(propertiesQuery);
  const { data: units } = useQuery(unitsFullQuery);
  // Tenants that can be moved into a unit (approved, no unit yet).
  const { data: assignableTenants } = useQuery(assignableTenantsQuery);
  const { data: arrearsByTenant } = useQuery({
    queryKey: ["property-detail-arrears"],
    queryFn: async () => {
      const ledgers = await loadTenantLedgers();
      return new Map(ledgers.filter((row) => row.ledger.arrears > 0).map((row) => [row.tenant.id, row.ledger.arrears]));
    },
    staleTime: 0,
    refetchOnMount: "always",
  });


  const saveProperty = useMutation({
    mutationFn: async (v: { name: string; location: string }) => {
      const { error } = await supabase
        .from("properties")
        .insert({ ...v, ...(isManager && account?.user_id ? { owner_id: account.user_id } : {}) } as { name: string; location: string; owner_id?: string });
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
    mutationFn: async ({ tenantId, ...v }: any) => {
      let unitId = editing?.id as string | undefined;
      let repriced = 0;
      if (editing) {
        const { error } = await supabase.from("units").update(v).eq("id", editing.id);
        if (error) throw error;
        // Changing the base rent must also reprice rent still owed, otherwise the
        // landlord arrears (built from invoices) drifts from the tenant portal
        // balance (built from the unit's current rent).
        const oldRent = Number(editing.rent_amount ?? 0);
        const newRent = Number(v.rent_amount ?? 0);
        if (oldRent !== newRent) {
          repriced = await repriceOpenInvoices(editing.id, oldRent, newRent);
        }
      } else {
        const { data, error } = await supabase.from("units").insert(v).select("id").single();
        if (error) throw error;
        unitId = data.id as string;
      }
      // Optionally move an existing tenant into this unit when marking it occupied.
      if (tenantId && unitId) {
        const { error: tErr } = await supabase
          .from("tenants")
          .update({ unit_id: unitId, active: true })
          .eq("id", tenantId);
        if (tErr) throw tErr;
        const { error: sErr } = await supabase.from("units").update({ status: "occupied" }).eq("id", unitId);
        if (sErr) throw sErr;
      }
      return { repriced };
    },
    onSuccess: (res) => {
      qc.invalidateQueries();
      setUnitOpen(false);
      setEditing(null);
      toast.success(
        res?.repriced
          ? `Unit saved — ${res.repriced} unpaid invoice(s) repriced to the new rent`
          : "Unit saved",
      );
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
        {(
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
                tenants={assignableTenants ?? []}
                initial={editing}
                onSubmit={(v) => saveUnit.mutate(v)}
                pending={saveUnit.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
        )}
      </div>

      <DetailedPropertyPerformance arrearsByTenant={arrearsByTenant ?? new Map()} />

      <Card>
        <CardHeader><CardTitle className="text-base">Properties</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="w-16" />
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
                      {!isManager && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={`Delete property ${p.name}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>

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
                      )}
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
                      {!isManager && (<>
                      <Button size="icon" variant="ghost" aria-label={`Edit unit ${u.unit_number}`} onClick={() => { setEditing(u); setUnitOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={`Delete unit ${u.unit_number}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>

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
                      </>)}
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
  tenants,
  initial,
  onSubmit,
  pending,
}: {
  properties: any[];
  tenants: any[];
  initial: any;
  onSubmit: (v: any) => void;
  pending: boolean;
}) {
  const [propertyId, setPropertyId] = useState<string>(initial?.property_id ?? properties[0]?.id ?? "");
  const [status, setStatus] = useState<string>(initial?.status ?? "vacant");
  const [unitType, setUnitType] = useState<string>(initial?.unit_type ?? "bedsitter");
  const [tenantId, setTenantId] = useState<string>("none");
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
          tenantId: status === "occupied" && tenantId !== "none" ? tenantId : null,
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
      {status === "occupied" && (
        <div>
          <Label>Assign existing tenant (optional)</Label>
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger><SelectValue placeholder="No tenant" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tenant — just mark occupied</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.full_name}{t.phone_number ? ` — ${t.phone_number}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            {tenants.length === 0
              ? "All tenants are already assigned to a unit."
              : "Only tenants without a unit are listed."}
          </p>
        </div>
      )}
      <DialogFooter><Button type="submit" disabled={pending}>Save</Button></DialogFooter>
    </form>
  );
}

/**
 * Repricing helper: when a unit's base rent changes, every rent still owed on
 * that unit must change with it. Only invoices that still carry the OLD rent
 * and are not fully paid are touched, so history stays intact.
 * Returns how many invoices were adjusted.
 */
async function repriceOpenInvoices(unitId: string, oldRent: number, newRent: number) {
  const { data: tenants } = await supabase.from("tenants").select("id").eq("unit_id", unitId);
  const ids = (tenants ?? []).map((t: any) => t.id);
  if (ids.length === 0) return 0;

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id,base_rent,total_due,balance_remaining")
    .in("tenant_id", ids)
    .gt("balance_remaining", 0);

  const delta = newRent - oldRent;
  let count = 0;
  for (const inv of invoices ?? []) {
    if (Number((inv as any).base_rent) !== oldRent) continue;
    const total = Math.max(0, Number((inv as any).total_due) + delta);
    const balance = Math.max(0, Math.min(total, Number((inv as any).balance_remaining) + delta));
    const { error } = await supabase
      .from("invoices")
      .update({
        base_rent: newRent,
        total_due: total,
        balance_remaining: balance,
        status: balance === 0 ? "paid" : balance < total ? "partial" : "unpaid",
      })
      .eq("id", (inv as any).id);
    if (!error) count += 1;
  }
  return count;
}
