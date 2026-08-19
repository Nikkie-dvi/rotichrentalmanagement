import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { UserPlus, LogOut, ContactRound, AlertTriangle, Clock, CheckCircle2, CalendarCog, KeyRound, ArrowLeft, Home, Pencil } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { RecordPaymentButton } from "@/components/record-payment-button";
import { createTenantLogin, resetTenantPassword } from "@/lib/account.functions";

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

type RiskLevel = "clear" | "soon" | "overdue" | "high";
type Risk = { level: RiskLevel; total: number; monthsUnpaid: number; daysLate: number };

function RiskBadge({ risk }: { risk: Risk }) {
  if (risk.level === "high")
    return (
      <Badge variant="destructive" className="animate-pulse gap-1">
        <AlertTriangle className="h-3.5 w-3.5" /> High risk · {risk.monthsUnpaid} mo
      </Badge>
    );
  if (risk.level === "overdue")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3.5 w-3.5" /> Overdue {risk.daysLate}d
      </Badge>
    );
  if (risk.level === "soon")
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300">
        <Clock className="h-3.5 w-3.5" /> Due soon
      </Badge>
    );
  return (
    <Badge className="gap-1 bg-primary text-primary-foreground">
      <CheckCircle2 className="h-3.5 w-3.5" /> Clear
    </Badge>
  );
}

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

  // Compute after mount so server/client date math can't mismatch.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);

  const risks = useMemo(() => {
    const map = new Map<string, Risk>();
    if (!today) return map;
    const currentMonth = today.toISOString().slice(0, 7);
    const byTenant = new Map<string, string[]>();
    for (const inv of unpaidInvoices ?? []) {
      if (Number(inv.balance_remaining) <= 0) continue;
      const list = byTenant.get(inv.tenant_id) ?? [];
      list.push(inv.month_year);
      byTenant.set(inv.tenant_id, list);
    }
    for (const t of tenants ?? []) {
      const months = (byTenant.get((t as any).id) ?? []).sort();
      const total = balances.get((t as any).id) ?? 0;
      if (!months.length || total <= 0) {
        map.set((t as any).id, { level: "clear", total, monthsUnpaid: 0, daysLate: 0 });
        continue;
      }
      const oldest = months[0];
      const pastMonths = months.filter((m) => m < currentMonth).length;
      const dueDay =
        Number((t as any).rent_due_day) ||
        ((t as any).move_in_date ? new Date((t as any).move_in_date).getUTCDate() : 0) ||
        1;
      const [y, m] = oldest.split("-").map(Number);
      const due = new Date(Date.UTC(y, m - 1, Math.min(dueDay, 28)));
      const daysLate = Math.floor((today.getTime() - due.getTime()) / 86400000);
      const level: Risk["level"] =
        pastMonths >= 2 ? "high" : daysLate > 0 ? "overdue" : "soon";
      map.set((t as any).id, { level, total, monthsUnpaid: months.length, daysLate });
    }
    return map;
  }, [tenants, unpaidInvoices, balances, today]);

  const rank: Record<RiskLevel, number> = { high: 0, overdue: 1, soon: 2, clear: 3 };
  const active = (tenants ?? [])
    .filter((t: any) => t.active)
    .sort(
      (a: any, b: any) =>
        rank[risks.get(a.id)?.level ?? "clear"] - rank[risks.get(b.id)?.level ?? "clear"],
    );
  const inactive = (tenants ?? []).filter((t: any) => !t.active);

  const flagged = active.filter((t: any) => {
    const l = risks.get(t.id)?.level;
    return l === "overdue" || l === "high";
  });
  const atRisk = flagged.reduce((s: number, t: any) => s + (balances.get(t.id) ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-4 mb-2 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
        <Button
          variant="outline"
          size="sm"
          aria-label="Go back"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
            else router.navigate({ to: "/" });
          }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <span className="truncate text-sm font-medium">Tenants</span>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link to="/">
            <Home className="h-4 w-4" /> Dashboard
          </Link>
        </Button>
      </div>
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
      {flagged.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <b>{flagged.length}</b> tenant{flagged.length === 1 ? "" : "s"} overdue · <b>{money(atRisk)}</b> at risk
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground sm:hidden">Tip: swipe a card left to reveal actions.</p>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((t: any) => {
          const balance = balances?.get(t.id) ?? 0;
          const risk: Risk = risks.get(t.id) ?? {
            level: balance > 0 ? "soon" : "clear",
            total: balance,
            monthsUnpaid: 0,
            daysLate: 0,
          };
          return (
            <TenantCard
              key={t.id}
              tenant={t}
              balance={balance}
              risk={risk}
              onMoveOut={() => moveOut.mutate(t)}
            />
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

function TenantCard({
  tenant: t,
  balance,
  risk,
  onMoveOut,
}: {
  tenant: any;
  balance: number;
  risk: Risk;
  onMoveOut: () => void;
}) {
  const flagged = risk.level === "overdue" || risk.level === "high";
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef<number | null>(null);
  const REVEAL = 132;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const delta = e.touches[0].clientX - startX.current + (open ? -REVEAL : 0);
    setDx(Math.max(-REVEAL, Math.min(0, delta)));
  };
  const onTouchEnd = () => {
    startX.current = null;
    const shouldOpen = dx < -REVEAL / 2;
    setOpen(shouldOpen);
    setDx(0);
  };

  const translate = dx !== 0 ? dx : open ? -REVEAL : 0;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Swipe actions (mobile) */}
      <div className="absolute inset-y-0 right-0 flex w-[132px] items-stretch gap-1 p-1 sm:hidden">
        <RecordPaymentButton
          tenantId={t.id}
          defaultAmount={balance > 0 ? balance : Number(t.units?.rent_amount ?? 0)}
          label="Pay"
          className="h-full w-1/2 rounded-lg"
        />
        <Button variant="destructive" className="h-full w-1/2 flex-col gap-1 rounded-lg px-0 text-xs" onClick={onMoveOut}>
          <LogOut className="h-4 w-4" />
          Move Out
        </Button>
      </div>

      <Card
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${translate}px)` }}
        className={`glass-card relative touch-pan-y transition-transform duration-200 ${flagged ? "border-l-4 border-l-destructive" : ""}`}
      >
        <CardHeader className="p-4 pb-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{t.full_name}</CardTitle>
              <p className="mt-1 truncate text-xs text-muted-foreground">{t.phone_number ?? "No phone"}</p>
            </div>
            <div className="shrink-0"><RiskBadge risk={risk} /></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 text-sm">
          <Row label="Property" value={t.units?.properties?.name ?? "—"} />
          <Row label="Unit" value={t.units?.unit_number ?? "—"} />
          <Row label="Rent Due" value={money(Number(t.units?.rent_amount ?? 0))} />
          <Row label="Deposit" value={money(Number(t.deposit_paid))} />
          <Row label="Move-in" value={t.move_in_date ?? "—"} />
          <Row label="Due Day" value={t.rent_due_day ? `${t.rent_due_day} of month` : "—"} />
          <Row
            label="Balance"
            value={<span className={balance > 0 ? "font-semibold text-destructive" : "font-semibold text-primary"}>{money(balance)}</span>}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="hidden sm:block">
              <RecordPaymentButton
                tenantId={t.id}
                defaultAmount={balance > 0 ? balance : Number(t.units?.rent_amount ?? 0)}
                label="Record Payment"
                className="w-full"
              />
            </div>
            <Button size="sm" variant="outline" className="hidden w-full sm:inline-flex" onClick={onMoveOut}>
              <LogOut className="h-4 w-4" />Move Out
            </Button>
            <div className="col-span-2">
              <EditTenantDatesDialog tenant={t} />
            </div>
            <div className="col-span-2">
              {t.auth_user_id ? <ResetTenantPasswordDialog tenant={t} /> : <CreateTenantLoginDialog tenant={t} />}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


/**
 * Creates a portal login for a tenant who never signed up themselves. The
 * landlord picks the email + password and hands them over.
 */
function CreateTenantLoginDialog({ tenant: t }: { tenant: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(t.email ?? "");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    setBusy(true);
    try {
      await createTenantLogin({ data: { tenantId: t.id, email: email.trim(), password: pwd } });
      toast.success("Login created", { description: `Give ${email.trim()} and the password to ${t.full_name}.` });
      setPwd("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["tenants"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <KeyRound className="h-4 w-4" /> Create portal login
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Create portal login — {t.full_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            This tenant has no portal account yet. Set their Gmail (or any email) and a starting password, then share
            both — they can change the password later from the tenant portal.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor={`em-${t.id}`}>Tenant email</Label>
            <Input
              id={`em-${t.id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tenant@gmail.com"
              aria-invalid={!validEmail}
              className={!validEmail ? "border-destructive" : ""}
            />
            {!validEmail && <p className="text-xs text-destructive">Enter a valid email address</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`np-${t.id}`}>Starting password (min 8 characters)</Label>
            <Input id={`np-${t.id}`} value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="e.g. Rent2026!" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !validEmail || pwd.length < 8}>
            {busy ? "Creating…" : "Create login"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lets the landlord (or main account) set a new portal password for a tenant. */
function ResetTenantPasswordDialog({ tenant: t }: { tenant: any }) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await resetTenantPassword({ data: { tenantId: t.id, newPassword: pwd } });
      toast.success("Password reset — share it with the tenant");
      setPwd("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <KeyRound className="h-4 w-4" /> Reset password
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Reset portal password — {t.full_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Set a temporary password and give it to the tenant. They can change it later from the sign-in page using
            "Forgot your password?".
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor={`pw-${t.id}`}>New password (min 8 characters)</Label>
            <Input
              id={`pw-${t.id}`}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="e.g. Rent2026!"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || pwd.length < 8}>
            {busy ? "Saving…" : "Set password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lets the landlord correct a tenant's joining (move-in) date and rent due day. */
function EditTenantDatesDialog({ tenant: t }: { tenant: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [moveIn, setMoveIn] = useState<string>(t.move_in_date ?? "");
  const [dueDay, setDueDay] = useState<string>(t.rent_due_day ? String(t.rent_due_day) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const day = dueDay ? Number(dueDay) : null;
    if (day !== null && (!Number.isFinite(day) || day < 1 || day > 31)) {
      toast.error("Rent due day must be between 1 and 31");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({ move_in_date: moveIn || null, rent_due_day: day })
      .eq("id", t.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tenant dates updated");
    setOpen(false);
    qc.invalidateQueries();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <CalendarCog className="h-4 w-4" /> Edit dates
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Edit joining date — {t.full_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`mi-${t.id}`}>Joining / move-in date</Label>
            <Input id={`mi-${t.id}`} type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`dd-${t.id}`}>Rent due day (1–31)</Label>
            <Input
              id={`dd-${t.id}`}
              type="number"
              min={1}
              max={31}
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              placeholder="Defaults to the move-in day"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
