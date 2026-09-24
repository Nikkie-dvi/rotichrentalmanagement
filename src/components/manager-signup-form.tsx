import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Minus, Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/password-field";
import { registerPropertyManager } from "@/lib/manager-signup.functions";

const RATE = 250;
type Row = {
  propertyName: string;
  location: string;
  landlordName: string;
  landlordPhone: string;
  landlordEmail: string;
  landlordCode: string;
};
const empty = (): Row => ({ propertyName: "", location: "", landlordName: "", landlordPhone: "", landlordEmail: "", landlordCode: "" });

export function ManagerSignupForm() {
  const register = useServerFn(registerPropertyManager);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [rows, setRows] = useState<Row[]>([empty()]);
  const [loading, setLoading] = useState(false);

  const setCount = (n: number) => {
    const c = Math.max(1, Math.min(20, n || 1));
    setRows((r) => (c > r.length ? [...r, ...Array.from({ length: c - r.length }, empty)] : r.slice(0, c)));
  };
  const update = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
  const copyLandlord = (i: number) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, landlordName: r[0].landlordName, landlordPhone: r[0].landlordPhone, landlordEmail: r[0].landlordEmail, landlordCode: r[0].landlordCode } : row)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords don't match");
    setLoading(true);
    try {
      const res = await register({ data: { fullName, email, phone, password, properties: rows } });
      const pending = res.results.filter((r) => r.status === "pending").length;
      toast.success("Manager account created", {
        description: pending
          ? `${pending} landlord${pending === 1 ? "" : "s"} must approve you before you can see their property.`
          : "Signing you in…",
      });
      await supabase.auth.signInWithPassword({ email, password });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not register");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pm-name">Your full name</Label>
        <Input id="pm-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Peter Otieno" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pm-email">Email</Label>
          <Input id="pm-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pm-phone">Phone</Label>
          <Input id="pm-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
        </div>
      </div>
      <PasswordField id="pm-password" label="Choose a password" value={password} onChange={setPassword} required minLength={8}
        autoComplete="new-password" confirm confirmValue={confirm} onConfirmChange={setConfirm} hint="At least 8 characters." />

      <div className="rounded-xl border bg-muted/30 p-3">
        <Label>How many properties do you manage?</Label>
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" size="icon" variant="outline" onClick={() => setCount(rows.length - 1)} aria-label="Fewer"><Minus className="h-4 w-4" /></Button>
          <Input type="number" min={1} max={20} className="w-20 text-center" value={rows.length} onChange={(e) => setCount(Number(e.target.value))} />
          <Button type="button" size="icon" variant="outline" onClick={() => setCount(rows.length + 1)} aria-label="More"><Plus className="h-4 w-4" /></Button>
          <div className="ml-auto text-right text-sm">
            <div className="font-semibold">KES {(rows.length * RATE).toLocaleString()}/month</div>
            <div className="text-xs text-muted-foreground">{rows.length} × KES {RATE} · 14 days free</div>
          </div>
        </div>
      </div>

      {rows.map((r, i) => (
        <div key={i} className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2 text-sm font-semibold">
            <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-primary" /> Property {i + 1}</span>
            {i > 0 && (
              <button type="button" className="text-xs font-normal text-primary underline" onClick={() => copyLandlord(i)}>
                Same landlord as property 1
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input required placeholder="Property name" value={r.propertyName} onChange={(e) => update(i, "propertyName", e.target.value)} />
            <Input placeholder="Location (optional)" value={r.location} onChange={(e) => update(i, "location", e.target.value)} />
            <Input required placeholder="Landlord's full name" value={r.landlordName} onChange={(e) => update(i, "landlordName", e.target.value)} />
            <Input required type="tel" placeholder="Landlord's phone" value={r.landlordPhone} onChange={(e) => update(i, "landlordPhone", e.target.value)} />
            <Input required type="email" placeholder="Landlord's email" value={r.landlordEmail} onChange={(e) => update(i, "landlordEmail", e.target.value)} />
            <Input placeholder="Landlord code (if they have one)" value={r.landlordCode} onChange={(e) => update(i, "landlordCode", e.target.value)} />
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Each landlord gets a text and email about your registration. Landlords already on the app must approve you first;
        new landlords get a free login to track the payments you record.
      </p>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create manager account
      </Button>
    </form>
  );
}
