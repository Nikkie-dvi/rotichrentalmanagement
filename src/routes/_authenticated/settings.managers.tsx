import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, Shield, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createPropertyManager,
  removePropertyManager,
  resetManagerPassword,
} from "@/lib/managers.functions";

export const Route = createFileRoute("/_authenticated/settings/managers")({
  component: ManagersPage,
  head: () => ({
    meta: [
      { title: "Property Managers | Rotich Management Systems" },
      {
        name: "description",
        content: "Create and manage property manager logins that can view your tenants, units and rent records.",
      },
      { property: "og:title", content: "Property Managers | Rotich Management Systems" },
      { property: "og:description", content: "Give your property managers their own secure login." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ManagerRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
  source?: string;
  property_names?: string[];
  manager_user_id?: string | null;
};

function ManagersPage() {
  const qc = useQueryClient();
  const createFn = useServerFn(createPropertyManager);
  const resetFn = useServerFn(resetManagerPassword);
  const removeFn = useServerFn(removePropertyManager);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [resetFor, setResetFor] = useState<ManagerRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [removeFor, setRemoveFor] = useState<ManagerRow | null>(null);

  const query = useQuery({
    queryKey: ["property-managers"],
    queryFn: async (): Promise<ManagerRow[]> => {
      const { data, error } = await (supabase as any)
        .from("property_managers")
        .select("id, email, full_name, phone, active, created_at, source, property_names, manager_user_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ManagerRow[];
    },
  });

  // Payments each manager recorded in the last 30 days, so the landlord can track their work.
  const recorded = useQuery({
    queryKey: ["manager-recorded-payments"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("payments")
        .select("recorded_by, amount_paid")
        .gte("payment_date", since)
        .not("recorded_by", "is", null);
      const map = new Map<string, { count: number; total: number }>();
      for (const p of (data ?? []) as { recorded_by: string; amount_paid: number }[]) {
        const cur = map.get(p.recorded_by) ?? { count: 0, total: 0 };
        map.set(p.recorded_by, { count: cur.count + 1, total: cur.total + Number(p.amount_paid || 0) });
      }
      return map;
    },
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { email, password, fullName, phone } }),
    onSuccess: () => {
      toast.success("Manager login created", { description: `Share ${email} and the password with them.` });
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["property-managers"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create login"),
  });

  const reset = useMutation({
    mutationFn: () => resetFn({ data: { managerId: resetFor!.id, newPassword } }),
    onSuccess: () => {
      toast.success("Password updated");
      setResetFor(null);
      setNewPassword("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update password"),
  });

  const remove = useMutation({
    mutationFn: () => removeFn({ data: { managerId: removeFor!.id } }),
    onSuccess: () => {
      toast.success("Manager removed");
      setRemoveFor(null);
      qc.invalidateQueries({ queryKey: ["property-managers"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove manager"),
  });

  const toggleActive = async (row: ManagerRow, active: boolean) => {
    const { error } = await (supabase as any).from("property_managers").update({ active }).eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      toast.success(active ? "Access restored" : "Access paused");
      qc.invalidateQueries({ queryKey: ["property-managers"] });
    }
  };

  const missing = {
    email: !email.trim(),
    password: password.length < 8,
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-1">
      <div>
        <h1 className="text-2xl font-bold">Property managers</h1>
        <p className="text-sm text-muted-foreground">
          Create a login for the person who helps you run the properties. Managers can view your properties, units,
          tenants, invoices, payments and maintenance requests, and can respond to maintenance tickets — they cannot
          change rent, delete records or see your subscription.
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Add a manager
          </CardTitle>
          <CardDescription>You choose the email and starting password, then hand them over.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Manager" />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xx xxx xxx" />
          </div>
          <div className="space-y-1">
            <Label>Login email *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="manager@gmail.com"
              aria-invalid={missing.email}
              className={missing.email ? "border-destructive" : ""}
            />
            {missing.email && <p className="text-xs text-destructive">Email is required</p>}
          </div>
          <div className="space-y-1">
            <Label>Starting password *</Label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              aria-invalid={missing.password}
              className={missing.password ? "border-destructive" : ""}
            />
            {missing.password && <p className="text-xs text-destructive">Use at least 8 characters</p>}
          </div>
          <div className="sm:col-span-2">
            <Button
              className="w-full glass-btn"
              disabled={missing.email || missing.password || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Create manager login
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Your managers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!query.isLoading && (query.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No property managers yet.</p>
          )}
          {(query.data ?? []).map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">
                  {m.full_name || m.email}
                  <Badge variant={m.active ? "secondary" : "outline"}>
                    {m.active ? "Active" : m.source === "self" ? "Awaiting your approval" : "Paused"}
                  </Badge>
                  {m.source === "self" && <Badge variant="outline">Self-registered</Badge>}
                </div>
                {m.property_names && m.property_names.length > 0 && (
                  <div className="truncate text-xs text-muted-foreground">Manages: {m.property_names.join(", ")}</div>
                )}
                {m.manager_user_id && (
                  <div className="text-xs text-muted-foreground">
                    Last 30 days: {recorded.data?.get(m.manager_user_id)?.count ?? 0} payments recorded · KES{" "}
                    {(recorded.data?.get(m.manager_user_id)?.total ?? 0).toLocaleString()}
                  </div>
                )}
                <div className="truncate text-sm text-muted-foreground">
                  {m.email}
                  {m.phone ? ` · ${m.phone}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={m.active} onCheckedChange={(v) => toggleActive(m, v)} aria-label="Manager access" />
                <Button size="sm" variant="outline" onClick={() => setResetFor(m)}>
                  <KeyRound className="mr-1 h-4 w-4" /> Password
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoveFor(m)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(resetFor)} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>{resetFor?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <Button
              className="w-full"
              disabled={newPassword.length < 8 || reset.isPending}
              onClick={() => reset.mutate()}
            >
              {reset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update password
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(removeFor)} onOpenChange={(o) => !o && setRemoveFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this manager?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeFor?.email} will lose access immediately and their login will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
