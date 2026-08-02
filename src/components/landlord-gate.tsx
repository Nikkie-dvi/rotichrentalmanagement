import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Smartphone, Copy, LogOut, XCircle, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import {
  useLandlordAccount,
  useIsSuperAdmin,
  subscriptionState,
  MONTHLY_FEE,
  PAYMENT_NUMBER,
} from "@/hooks/use-landlord-account";

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  } catch {
    toast.error("Copy not supported");
  }
}

/**
 * Blocks the landlord dashboard until the main account approves the landlord.
 * While pending, the landlord sees the monthly subscription payment steps.
 */
export function LandlordGate({ children }: { children: ReactNode }) {
  const { data: account, isLoading, refetch, isRefetching } = useLandlordAccount();
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!account) return <>{children}</>;

  if (account.status === "approved") {
    const sub = subscriptionState(account);
    return (
      <>
        {sub.tone !== "active" && (
          <div
            className={`mb-3 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm ${
              sub.tone === "overdue"
                ? "border-destructive/40 bg-destructive/5"
                : "border-amber-500/40 bg-amber-500/5"
            }`}
          >
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span className="font-medium">Subscription: {sub.label}.</span>
            <span className="text-muted-foreground">
              Send {money(Number(account.monthly_fee ?? MONTHLY_FEE))} to {PAYMENT_NUMBER} to stay active.
            </span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => copyText(PAYMENT_NUMBER)}>
              <Copy className="h-4 w-4" /> Copy number
            </Button>
          </div>
        )}
        {children}
      </>
    );
  }


  const declined = account.status === "declined";

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const copy = copyText;

  return (
    <div className="flex min-h-[70vh] items-start justify-center px-1 py-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {declined ? (
              <XCircle className="h-6 w-6 text-destructive" />
            ) : (
              <ShieldCheck className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle>{declined ? "Account declined" : "Account awaiting approval"}</CardTitle>
          <CardDescription>
            {declined
              ? "Your landlord account was not approved."
              : "Your landlord account has been created and is waiting for the main account to confirm it."}
          </CardDescription>
          <div className="pt-2">
            <Badge variant={declined ? "destructive" : "secondary"}>
              {declined ? "Declined" : "Pending confirmation"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {declined && account.declined_reason && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="font-medium text-destructive">Reason</div>
              <p className="text-muted-foreground">{account.declined_reason}</p>
            </div>
          )}

          {!declined && (
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Smartphone className="h-4 w-4" /> Pay your monthly fee
              </div>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>
                  Open M-Pesa on your phone and choose <strong>Send Money</strong>.
                </li>
                <li>
                  Enter the number{" "}
                  <button
                    type="button"
                    onClick={() => copy(PAYMENT_NUMBER)}
                    className="font-semibold text-foreground underline underline-offset-2"
                  >
                    {PAYMENT_NUMBER}
                  </button>
                  .
                </li>
                <li>
                  Enter the amount <strong className="text-foreground">{money(MONTHLY_FEE)}</strong> and confirm.
                </li>
                <li>Once paid, the main account confirms your access — you get in right away.</li>
              </ol>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Send money to</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{PAYMENT_NUMBER}</span>
                    <Button size="icon" variant="ghost" onClick={() => copy(PAYMENT_NUMBER)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Monthly fee</div>
                  <div className="font-semibold">{money(MONTHLY_FEE)}</div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{account.email ?? "your account"}</span>. Access
            unlocks automatically the moment your account is confirmed.
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Check status
            </Button>
            <Button variant="outline" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
