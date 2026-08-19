import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Building2, User, LogIn, UserPlus } from "lucide-react";

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

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const redirected = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    // Only ever redirect once: repeated auth events (INITIAL_SESSION, token
    // refresh) used to re-trigger a full page load and looked like a reload loop.
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
      toast.error(err?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: next ? window.location.origin + next : window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-semibold leading-none tracking-tight">
            Rotich Rental Management — landlord &amp; tenant portal
          </h1>
          <CardDescription>Landlords &amp; property managers</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Big, unmistakable choice: existing account vs brand new account. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("signin")}
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
              onClick={() => setMode("signup")}
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

          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            {isSignup ? (
              <>
                <span className="font-medium text-foreground">New landlord?</span> Create your account below — you'll get
                your own 4-digit landlord code and can start adding properties right away.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">Welcome back.</span> Use the email and password you signed
                up with. Never registered? Tap <span className="font-medium text-foreground">Create account</span> above.
              </>
            )}
          </div>

          {!isSignup && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Building2 className="h-4 w-4" /> Property manager?
              </div>
              <p className="mt-1">
                Sign in right here with the email and password your landlord gave you (Settings → Property Managers).
                There's no separate sign-up — only your landlord can create your login.
              </p>
            </div>
          )}

          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            {isSignup ? "Sign up with Google" : "Continue with Google"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or with email</span>
            </div>
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{isSignup ? "Choose a password" : "Password"}</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={isSignup ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignup ? "Create my landlord account" : "Sign in"}
            </Button>
            {!isSignup ? (
              <p className="text-center text-sm">
                <Link to="/reset-password" className="text-primary underline">Forgot your password?</Link>
              </p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Already registered?{" "}
                <button type="button" className="text-primary underline" onClick={() => setMode("signin")}>
                  Sign in instead
                </button>
              </p>
            )}
          </form>

          {/* Tenants land here by mistake often — make their path impossible to miss. */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20">
                <User className="h-5 w-5 text-primary" />
              </span>
              <div>
                <div className="text-base font-bold">Are you a tenant?</div>
                <p className="text-xs text-muted-foreground">This page above is for landlords only.</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              View your unit, balance, invoices and report issues from the tenant portal.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button asChild size="sm" className="w-full">
                <Link to="/tenant/login">Tenant sign in</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="w-full bg-background/70">
                <Link to="/tenant/register">I'm a new tenant</Link>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> Landlord tools: properties, tenants, billing & payments
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

