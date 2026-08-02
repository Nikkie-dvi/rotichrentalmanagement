import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Clock, CreditCard } from "lucide-react";

const SUPER_ADMIN_EMAIL = "lnick8081@gmail.com";

type State =
  | { kind: "loading" }
  | { kind: "allowed" }
  | { kind: "pending" }
  | { kind: "declined"; reason?: string | null }
  | { kind: "unpaid"; fee: number; reference?: string | null };

/**
 * Subscription / approval gate for landlord accounts.
 * The super admin (lnick8081@gmail.com) always bypasses this gate.
 */
export function LandlordGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const check = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return setState({ kind: "allowed" });

    const email = (user.email ?? "").toLowerCase();
    // Super admin bypass — never asked to pay or wait for approval.
    if (email === SUPER_ADMIN_EMAIL) return setState({ kind: "allowed" });

    let { data: account } = await supabase
      .from("landlord_accounts")
      .select("status, declined_reason, paid_until, monthly_fee, payment_reference")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!account) {
      await supabase.from("landlord_accounts").insert({
        user_id: user.id,
        email: user.email,
        full_name: (user.user_metadata as any)?.full_name ?? null,
      });
      const { data: created } = await supabase
        .from("landlord_accounts")
        .select("status, declined_reason, paid_until, monthly_fee, payment_reference")
        .eq("user_id", user.id)
        .maybeSingle();
      account = created ?? null;
    }

    if (!account) return setState({ kind: "pending" });
    if (account.status === "declined")
      return setState({ kind: "declined", reason: account.declined_reason });
    if (account.status !== "approved") return setState({ kind: "pending" });

    const paidUntil = account.paid_until ? new Date(account.paid_until) : null;
    const active = paidUntil !== null && paidUntil >= new Date(new Date().toDateString());
    if (!active)
      return setState({
        kind: "unpaid",
        fee: Number(account.monthly_fee ?? 2500),
        reference: account.payment_reference,
      });

    setState({ kind: "allowed" });
  };

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.kind === "allowed") return <>{children}</>;

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            {state.kind === "unpaid" ? (
              <CreditCard className="h-5 w-5" />
            ) : state.kind === "pending" ? (
              <Clock className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </div>
          <CardTitle>
            {state.kind === "unpaid"
              ? "Subscription payment required"
              : state.kind === "pending"
                ? "Account awaiting approval"
                : "Account declined"}
          </CardTitle>
          <CardDescription>
            {state.kind === "unpaid"
              ? `Your landlord subscription is KES ${state.fee.toLocaleString()} per month. Once payment is recorded your dashboard unlocks automatically.`
              : state.kind === "pending"
                ? "The administrator is reviewing your landlord account. You'll get access as soon as it's approved."
                : (state.reason ?? "Please contact the administrator for more information.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.kind === "unpaid" && state.reference && (
            <p className="rounded-md border p-3 text-center text-sm">
              Payment reference: <b>{state.reference}</b>
            </p>
          )}
          <Button className="w-full" onClick={() => void check()}>
            Refresh status
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
