import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TenantBackBar } from "@/components/tenant/back-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { PasswordField } from "@/components/password-field";
import { toast } from "sonner";
import { tenantSignInWithPhone } from "@/lib/tenant-auth.functions";
import { requestTenantLoginCode, verifyTenantLoginCode } from "@/lib/tenant-otp.functions";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/tenant/login")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const r = typeof s.redirect === "string" ? s.redirect : "";
    return r.startsWith("/tenant/") && !r.startsWith("//") ? { redirect: r } : {};
  },
  head: () => ({
    meta: [
      { title: "Tenant sign in — Rotich Management Systems" },
      { name: "description", content: "Sign in to your tenant portal." },
      { property: "og:title", content: "Tenant sign in" },
      { property: "og:description", content: "Sign in to your tenant portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TenantLoginPage,
});

function TenantLoginPage() {
  const navigate = useNavigate();
  const { redirect: back } = Route.useSearch();
  const dest = back ?? "/tenant/dashboard";
  const [email, setEmail] = useState("");
  const [google, setGoogle] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Code-by-text sign in
  const [codeMode, setCodeMode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codePhone, setCodePhone] = useState("");
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: dest as any });
    });
  }, [navigate, dest]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setCodeBusy(true);
    try {
      const res = await requestTenantLoginCode({ data: { phone: codePhone } });
      setCodeSent(true);
      setWait(60);
      toast.success(`Code sent to ${res.masked}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the code");
    } finally {
      setCodeBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeBusy(true);
    try {
      const session = await verifyTenantLoginCode({ data: { phone: codePhone, code } });
      const { error } = await supabase.auth.setSession(session);
      if (error) throw error;
      toast.success("Signed in");
      navigate({ to: dest as any });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setCodeBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const identifier = email.trim();
      if (identifier.includes("@")) {
        const { error } = await supabase.auth.signInWithPassword({ email: identifier, password });
        if (error) throw error;
      } else {
        // Phone number sign in: the server resolves the tenant's email, then we
        // store the returned session in the browser.
        const session = await tenantSignInWithPhone({ data: { phone: identifier, password } });
        const { error } = await supabase.auth.setSession(session);
        if (error) throw error;
      }
      toast.success("Signed in");
      navigate({ to: dest as any });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-3 py-16 sm:px-6">
      <TenantBackBar title="Tenant sign in" />
      <Card className="overflow-hidden border-primary/20 border-t-4 border-t-primary">
        <CardHeader>
          <h1 className="text-lg font-semibold leading-none tracking-tight">Tenant Sign In</h1>
          <CardDescription>Use the email and password you registered with.</CardDescription>
        </CardHeader>
        <CardContent>
          {codeMode ? (
            <div className="grid gap-4">
              {!codeSent ? (
                <form onSubmit={sendCode} className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="codephone">Phone number</Label>
                    <Input
                      id="codephone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="07XX XXX XXX"
                      required
                      value={codePhone}
                      onChange={(e) => setCodePhone(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use the number your landlord has on file. We'll text you a 6-digit code.
                    </p>
                  </div>
                  <Button type="submit" size="lg" disabled={codeBusy}>
                    {codeBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Text me a code
                  </Button>
                </form>
              ) : (
                <form onSubmit={submitCode} className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="code">Enter the 6-digit code</Label>
                    <Input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="123456"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      className="text-center text-lg tracking-[0.4em]"
                    />
                    <p className="text-xs text-muted-foreground">Sent to {codePhone}. It expires in 10 minutes.</p>
                  </div>
                  <Button type="submit" size="lg" disabled={codeBusy || code.length !== 6}>
                    {codeBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign in
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={codeBusy || wait > 0}
                    onClick={() => sendCode()}
                  >
                    {wait > 0 ? `Resend in ${wait}s` : "Send a new code"}
                  </Button>
                </form>
              )}
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  setCodeMode(false);
                  setCodeSent(false);
                  setCode("");
                }}
              >
                Use a password instead
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Number not recognised?{" "}
                <Link to="/tenant/request-access" className="font-medium underline">Request access</Link>
              </p>
            </div>
          ) : (
            <>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Phone number or email</Label>
              <Input
                id="email"
                type="text"
                inputMode="text"
                autoComplete="username"
                placeholder="07XX XXX XXX or you@gmail.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Use the phone number your landlord has on file, or your email.</p>
            </div>
            <PasswordField id="password" value={password} onChange={setPassword} required />
            <Button type="submit" disabled={loading} size="lg">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="mb-3 w-full"
            onClick={() => setCodeMode(true)}
          >
            Text me a code instead
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={google}
            onClick={async () => {
              setGoogle(true);
              try {
                await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Google sign in failed");
                setGoogle(false);
              }
            }}
          >
            {google && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue with Gmail
          </Button>
          <p className="mt-4 text-center text-sm">
            <Link to="/reset-password" className="font-medium text-primary underline">Forgot your password?</Link>
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            New here? <Link to="/tenant/register" className="font-medium text-primary underline">Register</Link>
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Landlord? <Link to="/auth" className="font-medium underline">Sign in here</Link>
          </p>
            </>
          )}
        </CardContent>

      </Card>
      </div>
    </div>
  );
}
