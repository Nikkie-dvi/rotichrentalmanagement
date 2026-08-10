import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TenantBackBar } from "@/components/tenant/back-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
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
          <CardTitle>Tenant sign in</CardTitle>
          <CardDescription>Use the email and password you registered with.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} size="lg">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            New here? <Link to="/tenant/register" className="font-medium text-primary underline">Register</Link>
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Landlord? <Link to="/auth" className="font-medium underline">Sign in here</Link>
          </p>

        </CardContent>
      </Card>
    </div>
  );
}
