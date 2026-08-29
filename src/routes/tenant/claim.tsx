import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { claimTenantAccount, findMyTenantRecord } from "@/lib/tenant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordField } from "@/components/password-field";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, ChevronLeft, Home, Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/tenant/claim")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Link my unit — Tenant Portal" },
      {
        name: "description",
        content: "Already renting? Create your tenant login and link it to the unit your landlord already registered.",
      },
      { property: "og:title", content: "Link my unit — Tenant Portal" },
      { property: "og:description", content: "Create a tenant login for the unit you already rent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClaimPage,
});

type Match = Awaited<ReturnType<typeof findMyTenantRecord>>;

function ClaimPage() {
  const navigate = useNavigate();
  const lookup = useServerFn(findMyTenantRecord);
  const claim = useServerFn(claimTenantAccount);

  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [match, setMatch] = useState<Match | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/tenant/dashboard" });
    });
  }, [navigate]);

  const runLookup = async () => {
    setError(null);
    setMatch(null);
    setVerified(false);
    if (!/^\d{4}$/.test(code)) return toast.error("Enter your landlord's 4-digit code");
    if (!phone.trim()) return toast.error("Enter your phone number");
    setSearching(true);
    try {
      setMatch(await lookup({ data: { code, phone } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check that code");
    } finally {
      setSearching(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirmPassword) return toast.error("Passwords don't match — check both boxes");
    setSubmitting(true);
    try {
      const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin + "/tenant/login" },
      });
      if (signUpErr) throw signUpErr;
      const authUserId = signUp.user?.id;
      if (!authUserId) throw new Error("Could not create your account — please try again");

      await claim({ data: { authUserId, email: email.trim(), code, phone } });
      toast.success("Your unit is linked to this login");
      navigate({ to: signUp.session ? "/tenant/dashboard" : "/tenant/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not link your account");
    } finally {
      setSubmitting(false);
    }
  };

  const canClaim = match?.found && !match.alreadyLinked;

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

        <h1 className="mb-1 text-xl font-bold tracking-tight">I already rent a unit</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          If your landlord already added you, find your record and turn it into a login — no lease signing needed.
        </p>

        <Card className="border-primary/15 bg-card/80 shadow-xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-base">Step 1 — find your record</CardTitle>
            <CardDescription>Use your landlord's 4-digit code and the phone number they have for you.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="code">Landlord code</Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={4}
                placeholder="e.g. 4821"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
                  setMatch(null);
                  setVerified(false);
                }}
                className="text-center font-semibold tracking-[0.4em]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="claim-phone">Your phone number</Label>
              <Input
                id="claim-phone"
                type="tel"
                autoComplete="tel"
                placeholder="+2547XXXXXXXX"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setMatch(null);
                  setVerified(false);
                }}
              />
            </div>
            <Button type="button" onClick={runLookup} disabled={searching}>
              {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Find my unit
            </Button>

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" /> {error}
                </div>
              </div>
            )}

            {match && !match.found && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Home className="h-4 w-4" /> No record with that phone number
                </div>
                <p className="mt-1 text-muted-foreground">
                  {match.landlordName ?? "Your landlord"} hasn't registered that number yet. Ask them to add you (or
                  correct the number), then try again. Moving into a brand-new unit instead?{" "}
                  <Link to="/tenant/register" className="text-primary underline">
                    Apply for a vacant unit
                  </Link>
                  .
                </p>
              </div>
            )}

            {match?.found && match.alreadyLinked && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <div className="font-medium">This unit already has a login</div>
                <p className="mt-1 text-muted-foreground">
                  Sign in with your existing account —{" "}
                  <Link to="/tenant/login" className="text-primary underline">
                    tenant sign in
                  </Link>{" "}
                  (you can use this phone number and your password).
                </p>
              </div>
            )}

            {canClaim && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Found you, {match.fullName}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {match.propertyName ?? "Your property"}
                  {match.unitNumber ? ` · Unit ${match.unitNumber}` : ""} — landlord {match.landlordName ?? "—"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {canClaim && !verified && (
          <Card className="mt-4 border-primary/15 bg-card/80 shadow-xl backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-base">Step 2 — confirm this is you</CardTitle>
              <CardDescription>
                Check the unit and landlord below. If anything is wrong, stop here and call your landlord.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <VerifyRow label="Name" value={match.fullName} />
                <VerifyRow label="Phone" value={phone} />
                <VerifyRow label="Property" value={match.propertyName ?? "—"} />
                <VerifyRow label="Unit" value={match.unitNumber ? `Unit ${match.unitNumber}` : "Not assigned yet"} />
                <VerifyRow
                  label="Rent"
                  value={
                    match.unitRent
                      ? `KES ${match.unitRent.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`
                      : "—"
                  }
                />
                <VerifyRow label="Rent due day" value={match.rentDueDay ? `${match.rentDueDay}` : "—"} />
                <VerifyRow label="Landlord" value={match.landlordName ?? "—"} />
                <VerifyRow label="Landlord code" value={code} />
                <VerifyRow label="Account status" value={match.approvalStatus} />
              </div>
              <div className="grid gap-2">
                <Button type="button" onClick={() => setVerified(true)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Yes, these details are correct
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMatch(null);
                    setVerified(false);
                  }}
                >
                  No — search again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {canClaim && verified && (
          <Card className="mt-4 border-primary/15 bg-card/80 shadow-xl backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-base">Step 3 — create your login</CardTitle>
              <CardDescription>You'll use this email and password to open your tenant dashboard.</CardDescription>
            </CardHeader>
            <CardContent>

              <form onSubmit={submit} className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="claim-email">Email</Label>
                  <Input
                    id="claim-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <PasswordField
                  id="claim-password"
                  value={password}
                  onChange={setPassword}
                  minLength={8}
                  autoComplete="new-password"
                  required
                  confirm
                  confirmValue={confirmPassword}
                  onConfirmChange={setConfirmPassword}
                  hint="At least 8 characters. Tap the eye to check what you typed."
                />
                <Button type="submit" size="lg" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Link my unit &amp; continue
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/tenant/login" className="font-medium text-primary underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function VerifyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium capitalize">{value}</span>
    </div>
  );
}
