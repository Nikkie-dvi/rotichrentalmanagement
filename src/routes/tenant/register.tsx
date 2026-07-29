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
import { Loader2, CheckCircle2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad, type SignatureValue } from "@/components/tenant/signature-pad";

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

  const vacantQuery = useQuery({
    queryKey: ["tenant", "vacant-units"],
    queryFn: () => getVacantUnits(),
    enabled: step === 2,
  });

  const selectedUnit = useMemo(
    () => vacantQuery.data?.find((u) => u.id === unitId) ?? null,
    [vacantQuery.data, unitId],
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

      if (!signUp.session) {
        toast.success("Application submitted! Check your email to confirm your account, then sign in.");
        navigate({ to: "/tenant/login" });
        return;
      }

      toast.success("Application submitted! Awaiting landlord approval.");
      navigate({ to: "/tenant/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/tenant"><ChevronLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-2 w-8 rounded-full ${n <= step ? "bg-emerald-500" : "bg-muted"}`} />
          ))}
        </div>
      </div>

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
            <CardTitle>Pick your unit</CardTitle>
            <CardDescription>Step 2 of 3 — choose from available vacant units</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {vacantQuery.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading vacant units…</div>}
            {vacantQuery.isError && <p className="text-sm text-destructive">Could not load units. Try again.</p>}
            {vacantQuery.data && vacantQuery.data.length === 0 && (
              <p className="text-sm text-muted-foreground">No vacant units available right now. Please check back later.</p>
            )}

            <div className="grid gap-2">
              {vacantQuery.data?.map((u) => {
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
            <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">
              <p className="font-semibold">RESIDENTIAL LEASE AGREEMENT</p>
              <p className="mt-2">
                This lease is entered into between <b>Rotich Management Systems</b> (the "Landlord") and{" "}
                <b>{fullName || "the Tenant"}</b> (phone <b>{phone || "—"}</b>), the "Tenant".
              </p>
              <p className="mt-2">
                The Tenant agrees to rent <b>Unit {selectedUnit?.unit_number ?? "—"}</b>
                {selectedUnit?.property_name ? ` at ${selectedUnit.property_name}` : ""}
                {selectedUnit?.property_location ? `, ${selectedUnit.property_location}` : ""} at a monthly rent of{" "}
                <b>{selectedUnit ? KES(selectedUnit.rent_amount) : "—"}</b>, payable on or before the{" "}
                <b>{new Date().getDate()}</b> of each calendar month.
              </p>
              <p className="mt-3 font-semibold">Standard Clauses</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>Rent is due monthly on the day of month above; late payment may attract a penalty.</li>
                <li>Utility charges (water, electricity where metered) are billed in addition to rent.</li>
                <li>The Tenant shall keep the premises in clean and habitable condition and report damage promptly.</li>
                <li>The Tenant may not sublet or transfer occupancy without written landlord consent.</li>
                <li>Either party may terminate this lease with 30 days' written notice.</li>
                <li>Structural, plumbing, electrical, and security repairs shall be reported through the tenant portal.</li>
                <li>The Landlord retains right of reasonable inspection with prior notice.</li>
              </ol>
              <p className="mt-3">By signing below, the Tenant acknowledges reading, understanding, and agreeing to the terms above.</p>
            </div>

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
  );
}
