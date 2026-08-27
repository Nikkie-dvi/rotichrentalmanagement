import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, KeyRound, MailCheck } from "lucide-react";
import { PasswordField } from "@/components/password-field";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Rotich Management Systems" },
      { name: "description", content: "Request a reset link or set a new password for your account." },
      { property: "og:title", content: "Reset password — Rotich Management Systems" },
      { property: "og:description", content: "Request a reset link or set a new password for your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [recovering, setRecovering] = useState(false);

  // The reset link can arrive in three shapes depending on how the mail client
  // opens it: PKCE (?code=), token hash (?token_hash=&type=recovery) or the
  // legacy hash fragment (#access_token=...). Handle all of them, otherwise the
  // page just shows the "send a link" form again and nothing seems to work.
  useEffect(() => {
    let active = true;
    const run = async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const errorDescription = url.searchParams.get("error_description") ?? hash.get("error_description");
      if (errorDescription) {
        toast.error(errorDescription.replace(/\+/g, " "));
        return;
      }

      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          return;
        }
        window.history.replaceState({}, "", url.pathname);
        if (active) setRecovering(true);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "That reset link is invalid or has expired — request a new one",
        );
      }
    };
    void run();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Reset link sent — check your email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset link");
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords don't match — check both boxes");
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Your reset link expired — request a new one below");
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirmPassword("");
      await supabase.auth.signOut();
      setRecovering(false);
      toast.success("Password updated — sign in with your new password");
      navigate({ to: "/auth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> {recovering ? "Set a new password" : "Forgot your password?"}
          </CardTitle>
          <CardDescription>
            {recovering
              ? "Choose a new password for your account."
              : "Enter your email and we'll send you a link to reset your password."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recovering ? (
            <form onSubmit={savePassword} className="grid gap-3">
              <PasswordField
                id="new-password"
                label="New password"
                value={password}
                onChange={setPassword}
                minLength={8}
                autoComplete="new-password"
                required
                confirm
                confirmValue={confirmPassword}
                onConfirmChange={setConfirmPassword}
                confirmLabel="Confirm new password"
                hint="At least 8 characters. Tap the eye to check what you typed."
              />
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save new password
              </Button>
            </form>
          ) : sent ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
              <MailCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
              <span>
                We sent a reset link to <span className="font-medium">{email}</span>. Open it on this device to set a new
                password.
              </span>
            </div>
          ) : (
            <form onSubmit={sendLink} className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send reset link
              </Button>
            </form>
          )}
          <div className="flex justify-between text-xs text-muted-foreground">
            <Link to="/tenant/login" className="underline">
              Tenant sign in
            </Link>
            <Link to="/auth" className="underline">
              Landlord sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
