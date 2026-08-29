import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Loader2,
  Building2,
  User,
  LogIn,
  UserPlus,
  ShieldCheck,
  Receipt,
  Wallet,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { PasswordField } from "@/components/password-field";
import { AppLogo } from "@/components/app-logo";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Rotich Rental Management" },
      { name: "description", content: "Sign in to manage your rental properties, tenants, and payments." },
      { property: "og:title", content: "Sign in — Rotich Rental Management" },
      { property: "og:description", content: "Sign in to manage your rental properties, tenants, and payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Role = "landlord" | "tenant";

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const redirected = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<Role>("landlord");
  const [failure, setFailure] = useState<"credentials" | "unconfirmed" | null>(null);

  useEffect(() => {
    const go = () => {
      if (redirected.current) return;
      redirected.current = true;
      const target = next && next !== "/auth" && !next.startsWith("/auth?") ? next : "/";
      navigate({ to: target, replace: true });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) go();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);
    if (mode === "signup" && password !== confirmPassword) {
      toast.error("Passwords don't match — check both boxes");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: next ? window.location.origin + next : window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
    } catch (err: any) {
      const msg: string = err?.message ?? "Authentication failed";
      if (/confirm/i.test(msg)) setFailure("unconfirmed");
      else if (/invalid login|credentials|password/i.test(msg)) setFailure("credentials");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient brand glow so the page reads as a real product screen, not a sheet of paper */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-2 lg:px-8">
        {/* Brand / value panel */}
        <section className="hidden lg:block">
          <div className="flex items-center gap-3">
            <AppLogo className="h-12 w-12" />
            <div>
              <h1 className="text-xl font-bold leading-tight">Rotich Rental Management</h1>
              <p className="text-sm text-muted-foreground">Landlord &amp; tenant portal</p>
            </div>
          </div>
          <p className="mt-6 max-w-md text-2xl font-semibold leading-snug">
            Rent, tenants and M-Pesa payments — all in one dashboard.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: Building2, t: "Properties & units", d: "Track occupancy, vacancies and rent per unit." },
              { icon: Receipt, t: "Invoices & receipts", d: "Automatic monthly billing with itemised charges." },
              { icon: Wallet, t: "Payments & arrears", d: "Know who owes what, and remind them by SMS." },
              { icon: ShieldCheck, t: "Secure by design", d: "Your data is only visible to your account." },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{t}</div>
                  <p className="text-sm text-muted-foreground">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Auth card */}
        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <AppLogo className="h-11 w-11" />
            <div>
              <h1 className="text-lg font-bold leading-tight">Rotich Rental Management</h1>
              <p className="text-xs text-muted-foreground">Landlord &amp; tenant portal</p>
            </div>
          </div>

          <Card className="border-border/60 bg-card/80 shadow-xl backdrop-blur-xl">
            <CardHeader className="space-y-3 pb-3">
              <div>
                <h2 className="text-xl font-semibold leading-none tracking-tight">
                  {isSignup ? "Create your account" : "Welcome back"}
                </h2>
                <CardDescription className="mt-1.5">
                  First, tell us who's signing in — landlords and tenants use different portals.
                </CardDescription>
              </div>

              {/* Role chooser — stops tenants signing in on the landlord side */}
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1">
                <button
                  type="button"
                  onClick={() => setRole("landlord")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    role === "landlord" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Building2 className="h-4 w-4" /> Landlord
                </button>
                <button
                  type="button"
                  onClick={() => setRole("tenant")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    role === "tenant" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <User className="h-4 w-4" /> Tenant
                </button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {role === "tenant" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <User className="h-4 w-4 text-primary" /> Tenants sign in on the tenant portal
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      There you can use your phone number, see your unit, balance, invoices and report issues. This page
                      is only for landlords and property managers.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Button asChild className="w-full">
                      <Link to="/tenant/login">
                        Go to tenant sign in <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link to="/tenant/register">I'm a new tenant</Link>
                    </Button>
                  </div>
                  <button
                    type="button"
                    className="w-full text-center text-xs text-muted-foreground underline"
                    onClick={() => setRole("landlord")}
                  >
                    Actually, I'm a landlord
                  </button>
                </div>
              ) : (
                <>
                  {/* Sign in vs create account */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signin");
                        setFailure(null);
                      }}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        !isSignup ? "border-primary bg-primary/10 shadow-sm" : "border-border opacity-70 hover:opacity-100"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <LogIn className="h-4 w-4" /> Sign in
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">I already have an account</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setFailure(null);
                      }}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        isSignup ? "border-primary bg-primary/10 shadow-sm" : "border-border opacity-70 hover:opacity-100"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <UserPlus className="h-4 w-4" /> Create account
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">I'm new here</p>
                    </button>
                  </div>

                  <form onSubmit={handleEmail} className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <PasswordField
                      id="password"
                      label={isSignup ? "Choose a password" : "Password"}
                      value={password}
                      onChange={setPassword}
                      required
                      minLength={isSignup ? 6 : undefined}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      confirm={isSignup}
                      confirmValue={confirmPassword}
                      onConfirmChange={setConfirmPassword}
                      hint={isSignup ? "At least 6 characters. Tap the eye to check what you typed." : undefined}
                    />
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isSignup ? "Create my account" : "Sign in"}
                    </Button>
                    {!isSignup && (
                      <p className="text-center text-sm">
                        <Link to="/reset-password" className="text-primary underline">
                          Forgot your password?
                        </Link>
                      </p>
                    )}
                  </form>

                  {/* Contextual help when sign-in fails */}
                  {failure && (
                    <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        {failure === "unconfirmed" ? "Email not confirmed yet" : "We couldn't sign you in"}
                      </div>
                      {failure === "unconfirmed" ? (
                        <p className="text-xs text-muted-foreground">
                          Open the confirmation link we emailed you, then come back and sign in.
                        </p>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            That email and password don't match a landlord account. This usually means one of these:
                          </p>
                          <ul className="space-y-2 text-xs">
                            <li className="flex items-start gap-2">
                              <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              <span>
                                <span className="font-medium">You're a tenant.</span> Tenant logins only work on the
                                tenant portal —{" "}
                                <Link to="/tenant/login" className="text-primary underline">
                                  sign in there
                                </Link>
                                .
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              <span>
                                <span className="font-medium">Wrong password.</span>{" "}
                                <Link to="/reset-password" className="text-primary underline">
                                  Reset it
                                </Link>{" "}
                                and we'll email you a link.
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              <span>
                                <span className="font-medium">No account yet.</span>{" "}
                                <button
                                  type="button"
                                  className="text-primary underline"
                                  onClick={() => {
                                    setMode("signup");
                                    setFailure(null);
                                  }}
                                >
                                  Create one
                                </button>{" "}
                                — it's free for 14 days.
                              </span>
                            </li>
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {!isSignup && (
                    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Building2 className="h-4 w-4" /> Property manager?
                      </div>
                      <p className="mt-1">
                        Sign in right here with the email and password your landlord gave you (Settings → Property
                        Managers). There's no separate sign-up.
                      </p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Kenyan-built rental management • M-Pesa ready • Works offline
          </p>
        </section>
      </div>
    </div>
  );
}
