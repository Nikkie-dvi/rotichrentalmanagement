import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserPlus, LogOut, ContactRound, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { MpesaStkButton } from "@/components/mpesa-stk-button";

export const Route = createFileRoute("/_authenticated/tenants")({
  head: () => ({
    meta: [
      { title: "Tenants — Rotich Management Systems" },
      { name: "description", content: "Manage active tenants: contacts, assigned units, deposits and arrears." },
      { property: "og:title", content: "Tenants — Rotich Management Systems" },
      { property: "og:description", content: "Active tenants and their status." },
    ],
  }),
  component: TenantsPage,
});

function TenantsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: tenants } = useQuery({
    queryKey: ["tenants-full"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("*,units(unit_number,rent_amount,properties(name))")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: unpaidInvoices } = useQuery({
    queryKey: ["tenant-balances"],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("tenant_id,month_year,balance_remaining");
      return data ?? [];
    },
  });

  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of unpaidInvoices ?? [])
      map.set(inv.tenant_id, (map.get(inv.tenant_id) ?? 0) + Number(inv.balance_remaining));
    return map;
  }, [unpaidInvoices]);

  const { data: vacantUnits } = useQuery({
    queryKey: ["vacant-units"],
    queryFn: async () =>
      (await supabase.from("units").select("id,unit_number,rent_amount,properties(name)").eq("status", "vacant")).data ?? [],
  });

  const assign = useMutation({
    mutationFn: async (v: any) => {
      const { data: unit } = await supabase.from("units").select("id,status").eq("id", v.unit_id).single();
      if (unit?.status === "occupied") throw new Error("Unit is already occupied");
      const { error: tErr } = await supabase.from("tenants").insert({
        unit_id: v.unit_id,
        full_name: v.full_name,
        phone_number: v.phone_number,
        deposit_paid: Number(v.deposit_paid) || 0,
        move_in_date: v.move_in_date || null,
        rent_due_day: v.rent_due_day ? Number(v.rent_due_day) : null,
        active: true,
      });
      if (tErr) throw tErr;
      const { error: uErr } = await supabase.from("units").update({ status: "occupied" }).eq("id", v.unit_id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      setOpen(false);
      toast.success("Tenant assigned");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moveOut = useMutation({
    mutationFn: async (t: any) => {
      const { error } = await supabase
        .from("tenants")
        .update({ active: false, move_out_date: new Date().toISOString().slice(0, 10) })
        .eq("id", t.id);
      if (error) throw error;
      if (t.unit_id) {
        const { error: uErr } = await supabase.from("units").update({ status: "vacant" }).eq("id", t.unit_id);
        if (uErr) throw uErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Tenant moved out");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const active = (tenants ?? []).filter((t: any) => t.active);
  const inactive = (tenants ?? []).filter((t: any) => !t.active);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tenants</h2>
          <p className="text-sm text-muted-foreground">Assign, track and offboard tenants.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><UserPlus className="h-4 w-4" />Assign Tenant</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Assign New Tenant</DialogTitle></DialogHeader>
            <TenantForm
              vacantUnits={vacantUnits ?? []}
              onSubmit={(payload) => assign.mutate(payload)}
            />
          </DialogContent>
        </Dialog>
      </div>


      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((t: any) => {
          const balance = balances?.get(t.id) ?? 0;
          return (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{t.full_name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{t.phone_number ?? "No phone"}</p>
                  </div>
                  <Badge className={balance > 0 ? "" : "bg-primary text-primary-foreground"} variant={balance > 0 ? "destructive" : "default"}>
                    {balance > 0 ? "Arrears" : "Clear"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Property" value={t.units?.properties?.name ?? "—"} />
                <Row label="Unit" value={t.units?.unit_number ?? "—"} />
                <Row label="Rent Due" value={money(Number(t.units?.rent_amount ?? 0))} />
                <Row label="Deposit" value={money(Number(t.deposit_paid))} />
                <Row label="Move-in" value={t.move_in_date ?? "—"} />
                <Row label="Due Day" value={t.rent_due_day ? `${t.rent_due_day} of month` : "—"} />
                <Row label="Balance" value={<span className={balance > 0 ? "text-destructive font-semibold" : "text-primary font-semibold"}>{money(balance)}</span>} />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <MpesaStkButton
                    tenantId={t.id}
                    defaultPhone={t.phone_number}
                    defaultAmount={balance > 0 ? balance : Number(t.units?.rent_amount ?? 0)}
                    label="STK Push"
                    className="w-full"
                  />
                  <Button size="sm" variant="outline" className="w-full" onClick={() => moveOut.mutate(t)}>
                    <LogOut className="h-4 w-4" />Move Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {active.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-10 text-center text-muted-foreground">No active tenants yet.</CardContent>
          </Card>
        )}
      </div>

      {inactive.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Past Tenants</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {inactive.map((t: any) => (
              <div key={t.id} className="flex justify-between border-b py-2 last:border-none">
                <span>{t.full_name}</span>
                <span className="text-muted-foreground">Moved out {t.move_out_date ?? "—"}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

type TenantFormPayload = {
  full_name: string;
  phone_number: string;
  unit_id: string;
  deposit_paid: number;
  move_in_date: string;
  rent_due_day: string;
};

function TenantForm({
  vacantUnits,
  onSubmit,
}: {
  vacantUnits: any[];
  onSubmit: (payload: TenantFormPayload) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [unitId, setUnitId] = useState("");
  const [deposit, setDeposit] = useState("0");
  const [moveInDate, setMoveInDate] = useState("");
  const [rentDueDay, setRentDueDay] = useState("");

  const contactsSupported =
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    // @ts-expect-error - Contact Picker API is not in the default TS lib
    typeof navigator.contacts?.select === "function";

  const pickContact = async () => {
    try {
      // @ts-expect-error - Contact Picker API is not in the default TS lib
      const contacts: Array<{ name?: string[]; tel?: string[] }> = await navigator.contacts.select(
        ["name", "tel"],
        { multiple: false },
      );
      const c = contacts?.[0];
      if (!c) return;
      const name = c.name?.[0] ?? "";
      const tel = c.tel?.[0] ?? "";
      if (name) setFullName(name);
      if (tel) setPhone(tel.replace(/\s+/g, ""));
      toast.success("Contact imported");
    } catch (err: any) {
      if (err?.name === "SecurityError") {
        toast.error("Contact picker needs a secure context (HTTPS).");
      } else if (err?.name !== "AbortError") {
        toast.error(err?.message ?? "Couldn't read contact");
      }
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          full_name: fullName,
          phone_number: phone,
          unit_id: unitId,
          deposit_paid: Number(deposit) || 0,
          move_in_date: moveInDate,
          rent_due_day: rentDueDay,
        });
      }}
      className="space-y-3"
    >
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={pickContact}
          disabled={!contactsSupported}
          title={contactsSupported ? "Pick from your phone contacts" : "Contact picker only works on Android Chrome/Edge over HTTPS"}
        >
          <ContactRound className="h-4 w-4" />
          Import from contacts
        </Button>
      </div>
      {!contactsSupported && (
        <p className="text-[11px] text-muted-foreground -mt-2">
          Tip: open this app on an Android phone in Chrome/Edge to pick from contacts.
        </p>
      )}
      <div>
        <Label>Full Name</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div>
        <Label>Phone Number</Label>
        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2547XXXXXXXX" />
      </div>
      <div>
        <Label>Vacant Unit</Label>
        <Select value={unitId} onValueChange={setUnitId} required>
          <SelectTrigger><SelectValue placeholder="Select a vacant unit" /></SelectTrigger>
          <SelectContent>
            {vacantUnits.map((u: any) => (
              <SelectItem key={u.id} value={u.id}>
                {u.properties?.name} — {u.unit_number} ({money(Number(u.rent_amount))})
              </SelectItem>
            ))}
            {vacantUnits.length === 0 && (
              <div className="p-2 text-sm text-muted-foreground">No vacant units</div>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Deposit Paid</Label>
          <Input type="number" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </div>
        <div>
          <Label>Move-in Date</Label>
          <Input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>Rent Due Day (1–31)</Label>
          <Input
            type="number"
            min={1}
            max={31}
            value={rentDueDay}
            onChange={(e) => setRentDueDay(e.target.value)}
            placeholder="Auto from move-in date"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Cron auto-generates a new invoice every month on this day.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit">Assign</Button>
      </DialogFooter>
    </form>
  );
}
