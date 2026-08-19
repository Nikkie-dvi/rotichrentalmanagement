import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getVacantUnits, submitTenantApplication } from "@/lib/tenant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, ChevronLeft, Search, AlertCircle, Home, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad, type SignatureValue } from "@/components/tenant/signature-pad";
import { unitTypeLabel } from "@/lib/unit-types";
import { LeaseDocument } from "@/components/lease-document";

export const Route = createFileRoute("/tenant/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Register — Tenant Portal" },
      { name: "description", content: "Create your tenant account, pick your unit and sign your digital lease agreement." },
      { property: "og:title", content: "Register — Tenant Portal" },
      { property: "og:description", content: "Create your tenant account, pick a vacant unit, sign your lease." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RegisterPage,
});

type Step = 1 | 2 | 3;

const KES = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

function RegisterPage() {
  const navigate = useNavigate();
  const submitFn = useServerFn(submitTenantApplication);
  const [step, setStep] = useState<Step>(1);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [unitId, setUnitId] = useState<string>("");
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [searchCode, setSearchCode] = useState("");

  const vacantQuery = useQuery({
    queryKey: ["tenant", "vacant-units", searchCode],
    queryFn: () => getVacantUnits({ data: { code: searchCode } }),
    enabled: step === 2 && /^\d{4}$/.test(searchCode),
    retry: false,
  });

  const units = vacantQuery.data?.units ?? [];

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === unitId) ?? null,
    [units, unitId],
  );


  useEffect(() => {
    // Already-signed-in users skip straight to dashboard.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/tenant/dashboard" });
    });
  }, [navigate]);

  const validateStep1 = () => {
    if (!fullName.trim() || fullName.trim().length < 2) return "Enter your full name";
    if (!/^\+?[0-9 ()-]{7,20}$/.test(phone.trim())) return "Enter a valid phone number";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return "Enter a valid email";
    if (password.length < 8) return "Password must be at least 8 characters";
    return null;
  };

  const goNext = () => {
    if (step === 1) {
      const err = validateStep1();
      if (err) return toast.error(err);
      setStep(2);
    } else if (step === 2) {
      if (!unitId) return toast.error("Please pick a unit");
      setStep(3);
    }
  };

  const submit = async () => {
    if (!signature) return toast.error("Please sign the lease");
    if (!agreed) return toast.error("You must agree to the terms");
    setSubmitting(true);
    try {
      // 1) Create the auth user. May or may not return a session depending on
      //    whether email confirmation is required.
      const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin + "/tenant/login" },
      });
      if (signUpErr) throw signUpErr;
      const authUserId = signUp.user?.id;
      if (!authUserId) throw new Error("Sign up failed — please try again");

      // 2) Submit the application (tenant row + lease signature) in one shot,
      //    server-side, no bearer token required. Landlord will see it as
      //    pending immediately, and the tenant can sign in later.
      const signaturePayload =
        signature.kind === "drawn"
          ? signature.dataUrl
          : `typed:${signature.typedName}`;

      await submitFn({
        data: {
          authUserId,
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          unitId,
          leaseSignature: signaturePayload,
        },
      });

      toast.success("Application submitted! Awaiting landlord approval.");
      if (!signUp.session) {
        navigate({ to: "/tenant/login" });
        return;
      }
      navigate({ to: "/tenant/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background to-muted/40" />
      <div className="tenant-watermark -z-10" />
      <div className="mx-auto min-h-screen w-full max-w-2xl p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="outline" size="sm" className="border-primary/30 bg-card font-medium text-foreground shadow-sm">
          <Link to="/tenant"><ChevronLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-2 w-8 rounded-full ${n <= step ? "bg-emerald-500" : "bg-muted"}`} />
          ))}
        </div>
      </div>

      <h1 className="mb-3 text-xl font-bold tracking-tight">Tenant Registration</h1>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
            <CardDescription>Step 1 of 3 — your details</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} autoComplete="name" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} placeholder="+2547XXXXXXXX" autoComplete="tel" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} autoComplete="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <Button size="lg" onClick={goNext}>Continue</Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/tenant/login" className="font-medium text-primary underline">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Find your landlord</CardTitle>
            <CardDescription>Step 2 of 3 — enter your landlord's 4-digit code, then pick a unit</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="landlord-code">Landlord code</Label>
              <div className="flex gap-2">
                <Input
                  id="landlord-code"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="e.g. 4821"
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                    setUnitId("");
                  }}
                  className="tracking-[0.4em] text-center font-semibold"
                />
                <Button
                  type="button"
                  onClick={() => {
                    if (!/^\d{4}$/.test(codeInput)) return toast.error("Enter the 4-digit landlord code");
                    setUnitId("");
                    setSearchCode(codeInput);
                  }}
                >
                  Search
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Ask your landlord for their code — only their units will show.</p>
            </div>

            {!searchCode && !vacantQuery.isLoading && (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                <Search className="mx-auto mb-2 h-5 w-5" />
                Enter your landlord's 4-digit code above and tap Search to see their available units.
              </div>
            )}
            {vacantQuery.data?.landlordName && units.length > 0 && (
              <p className="text-sm font-medium">Showing units from {vacantQuery.data.landlordName}</p>
            )}
            {vacantQuery.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading vacant units…</div>}
            {vacantQuery.isError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {vacantQuery.error instanceof Error ? vacantQuery.error.message : "Could not load units."}
                </div>
                <p className="mt-1 text-muted-foreground">
                  Double-check the code with your landlord — it is 4 digits, e.g. 1588.
                </p>
              </div>
            )}
            {vacantQuery.data && units.length === 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Home className="h-4 w-4" />
                  No available units right now
                </div>
                <p className="mt-1 text-muted-foreground">
                  {vacantQuery.data.landlordName ?? "This landlord"} has no vacant units at the moment — every unit is
                  currently occupied. Ask them to free up or add a unit, then tap Search again.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => vacantQuery.refetch()}
                >
                  <RefreshCw className="h-4 w-4" /> Check again
                </Button>
              </div>
            )}


            <div className="grid gap-2">
              {units.map((u) => {

                const selected = u.id === unitId;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setUnitId(u.id)}
                    className={`flex items-start justify-between rounded-lg border p-4 text-left transition ${selected ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "hover:bg-muted/50"}`}
                  >
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        Unit {u.unit_number}
                        {selected && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {u.property_name ?? "—"}{u.property_location ? ` · ${u.property_location}` : ""}
                      </div>
                      <Badge variant="outline" className="mt-1">{unitTypeLabel(u.unit_type)}</Badge>
                    </div>
                    <Badge variant="secondary">{KES(u.rent_amount)}/mo</Badge>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={goNext} disabled={!unitId}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Digital Lease Agreement</CardTitle>
            <CardDescription>Step 3 of 3 — review and sign</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <LeaseDocument
              template={vacantQuery.data?.leaseTemplate ?? null}
              lease={{
                full_name: fullName || "the Tenant",
                phone_number: phone,
                email,
                deposit_paid: 0,
                move_in_date: new Date().toISOString().slice(0, 10),
                rent_due_day: new Date().getDate(),
                unit_number: selectedUnit?.unit_number ?? null,
                rent_amount: selectedUnit?.rent_amount ?? 0,
                property_name: selectedUnit?.property_name ?? null,
                property_location: selectedUnit?.property_location ?? null,
              }}
            />

            <div>
              <Label className="mb-2 block">Signature</Label>
              <SignaturePad fullName={fullName} onChange={setSignature} />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} />
              <span>I have read and agree to the terms of this lease agreement.</span>
            </label>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>Back</Button>
              <Button onClick={submit} disabled={submitting || !signature || !agreed}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign & activate lease
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
