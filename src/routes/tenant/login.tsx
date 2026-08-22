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
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/tenant/login")({
  ssr: false,
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
  const [email, setEmail] = useState("");
  const [google, setGoogle] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/tenant/dashboard" });
    });
  }, [navigate]);

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
      navigate({ to: "/tenant/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background to-muted/40" />
      <div className="tenant-watermark -z-10" />
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
      <TenantBackBar title="Tenant sign in" />
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold leading-none tracking-tight">Tenant Sign In</h1>
          <CardDescription>Use the email and password you registered with.</CardDescription>
        </CardHeader>
        <CardContent>
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

        </CardContent>
      </Card>
      </div>
    </div>
  );
}
