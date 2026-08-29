import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLandlordUnitsForRequest, submitAccessRequest } from "@/lib/tenant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordField } from "@/components/password-field";
import { toast } from "sonner";
import { AlertCircle, ChevronLeft, Loader2, Search, Send } from "lucide-react";

export const Route = createFileRoute("/tenant/request-access")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Request access — Tenant Portal" },
      {
        name: "description",
        content: "New tenant? Send your unit details and phone number to the landlord and get approved to use the portal.",
      },
      { property: "og:title", content: "Request access — Tenant Portal" },
      { property: "og:description", content: "Submit your unit details and phone number for landlord approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequestAccessPage,
});

type Lookup = Awaited<ReturnType<typeof getLandlordUnitsForRequest>>;

function money(n: number) {
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

function RequestAccessPage() {
  const navigate = useNavigate();
  const lookup = useServerFn(getLandlordUnitsForRequest);
  const submitRequest = useServerFn(submitAccessRequest);

  const [code, setCode] = useState("");
  const [result, setResult] = useState<Lookup | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unitId, setUnitId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/tenant/status" });
    });
  }, [navigate]);

  const runLookup = async () => {
    setError(null);
    setResult(null);
    setUnitId("");
    if (!/^\d{4}$/.test(code)) return toast.error("Enter your landlord's 4-digit code");
    setSearching(true);
    try {
      setResult(await lookup({ data: { code } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check that code");
    } finally {
      setSearching(false);
    }
  };

  const selectedUnit = result?.units.find((u) => u.id === unitId) ?? null;

  const startConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId) return toast.error("Pick the unit you're moving into");
    if (!fullName.trim()) return toast.error("Enter your full name");
    if (!phone.trim()) return toast.error("Enter your phone number");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirmPassword) return toast.error("Passwords don't match — check both boxes");
    setConfirming(true);
  };

  const send = async () => {
    setSubmitting(true);
    try {
      const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin + "/tenant/status" },
      });
      if (signUpErr) throw signUpErr;
      const authUserId = signUp.user?.id;
      if (!authUserId) throw new Error("Could not create your account — please try again");

      await submitRequest({
        data: { authUserId, email: email.trim(), code, fullName: fullName.trim(), phone: phone.trim(), unitId, note },
      });
      toast.success("Request sent — your landlord will review it");
      navigate({ to: signUp.session ? "/tenant/status" : "/tenant/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background to-muted/40" />
      <div className="tenant-watermark -z-10" />
      <div className="mx-auto w-full max-w-lg p-4 md:p-6">
        <Button asChild variant="outline" size="sm" className="mb-4 border-primary/30 bg-card shadow-sm">
          <Link to="/tenant">
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>

        <h1 className="mb-1 text-xl font-bold tracking-tight">Request access</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Send your unit details and phone number to the landlord. They approve you, then your portal opens.
        </p>

        <Card className="border-primary/15 bg-card/80 shadow-xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-base">Step 1 — your landlord</CardTitle>
            <CardDescription>Enter the 4-digit code your landlord gave you.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ra-code">Landlord code</Label>
              <Input
                id="ra-code"
                inputMode="numeric"
                maxLength={4}
                placeholder="e.g. 4821"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
                  setResult(null);
                  setConfirming(false);
                }}
                className="text-center font-semibold tracking-[0.4em]"
              />
            </div>
            <Button type="button" onClick={runLookup} disabled={searching}>
              {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Find landlord
            </Button>
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" /> {error}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {result && !confirming && (
          <Card className="mt-4 border-primary/15 bg-card/80 shadow-xl backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-base">Step 2 — your details</CardTitle>
              <CardDescription>
                Landlord: <span className="font-medium text-foreground">{result.landlordName ?? "—"}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={startConfirm} className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Which unit?</Label>
                  {result.units.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      This landlord hasn't added any units yet. Ask them to add the unit first.
                    </p>
                  )}
                  <div className="grid max-h-64 gap-2 overflow-y-auto">
                    {result.units.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setUnitId(u.id)}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                          unitId === u.id ? "border-primary bg-primary/5" : "border-border/60 bg-card/60"
                        }`}
                      >
                        <div>
                          <div className="text-sm font-medium">Unit {u.unit_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {u.property_name ?? "Property"}
                            {u.property_location ? ` · ${u.property_location}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{money(u.rent_amount)}</div>
                          <Badge variant="outline" className="mt-1 text-[10px] capitalize">
                            {u.status}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ra-name">Full name</Label>
                  <Input id="ra-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ra-phone">Phone number</Label>
                  <Input
                    id="ra-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+2547XXXXXXXX"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ra-email">Email</Label>
                  <Input
                    id="ra-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <PasswordField
                  id="ra-password"
                  value={password}
                  onChange={setPassword}
                  minLength={8}
                  autoComplete="new-password"
                  required
                  confirm
                  confirmValue={confirmPassword}
                  onConfirmChange={setConfirmPassword}
                />
                <div className="grid gap-2">
                  <Label htmlFor="ra-note">Message to landlord (optional)</Label>
                  <Textarea
                    id="ra-note"
                    rows={3}
                    maxLength={500}
                    placeholder="e.g. Moving in on 1st September"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <Button type="submit">Review my request</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {result && confirming && (
          <Card className="mt-4 border-primary/15 bg-card/80 shadow-xl backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-base">Step 3 — confirm and send</CardTitle>
              <CardDescription>Check these details before your landlord sees them.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <Detail label="Landlord" value={result.landlordName ?? "—"} />
                <Detail label="Property" value={selectedUnit?.property_name ?? "—"} />
                <Detail label="Unit" value={selectedUnit ? `Unit ${selectedUnit.unit_number}` : "—"} />
                <Detail label="Rent" value={selectedUnit ? money(selectedUnit.rent_amount) : "—"} />
                <Detail label="Name" value={fullName} />
                <Detail label="Phone" value={phone} />
                <Detail label="Email" value={email} />
                {note && <Detail label="Message" value={note} />}
              </div>
              <div className="grid gap-2">
                <Button onClick={send} disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send request to landlord
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>
                  Edit my details
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
