import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Smartphone, Copy, LogOut, XCircle, CalendarClock, MessageCircle, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import {
  useLandlordAccount,
  useIsSuperAdmin,
  useManagerStatus,
  subscriptionState,
  PAYMENT_NUMBER,
  paymentMethodLabel,
  usePlatformPricing,
  effectivePrice,
  DEFAULT_PRICING,
  trialState,
  TRIAL_DAYS,
  whatsappSupportLink,
} from "@/hooks/use-landlord-account";
import { SubscriptionStkButton } from "@/components/subscription-stk-button";


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
  const isSuper = useIsSuperAdmin();
  const { isManager, isDisabled: managerDisabled, isPending: managerPending } = useManagerStatus();
  const { data: pricing } = usePlatformPricing();
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (managerPending && !isSuper) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h2 className="text-xl font-semibold">Waiting for landlord approval</h2>
        <p className="text-sm text-muted-foreground">
          We've texted and emailed the landlord about your registration. You'll see their property here as soon as they
          switch your access on in Settings → Property Managers.
        </p>
        <Button variant="outline" onClick={() => qc.invalidateQueries()}>Check again</Button>
      </div>
    );
  }
  if (managerDisabled && !isSuper) return <ManagerAccessRevoked />;

  if (!account || isSuper || isManager) return <>{children}</>;

  const payNumber = account.payment_number?.trim() || PAYMENT_NUMBER;
  const payMethod = paymentMethodLabel(account.payment_method);
  const price = effectivePrice(account, pricing ?? DEFAULT_PRICING);
  const trial = trialState(account);
  const waLink = whatsappSupportLink(
    `Hello, I am ${account.full_name ?? account.email ?? "a landlord"}${
      account.landlord_code ? ` (code ${account.landlord_code})` : ""
    }. I have paid ${money(price.dueNow)} for my subscription but my account has not been updated yet. Kindly confirm.`,
  );
  const WhatsAppButton = ({ full = false }: { full?: boolean }) => (
    <Button
      asChild
      size="sm"
      variant="outline"
      className={full ? "w-full" : "ml-auto"}
    >
      <a href={waLink} target="_blank" rel="noreferrer">
        <MessageCircle className="h-4 w-4" /> Paid already? WhatsApp us
      </a>
    </Button>
  );

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
              {payMethod}: send {money(price.dueNow)} ({price.label}) to {payNumber} to stay active.
            </span>
            <PaywavePayButton kind="subscription" amount={price.dueNow} phone={account.phone} />
            <SubscriptionStkButton amount={price.dueNow} defaultPhone={account.phone} />
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => copyText(payNumber)}>
              <Copy className="h-4 w-4" /> Copy number
            </Button>
            <WhatsAppButton />
          </div>
        )}
        {children}
      </>
    );
  }

  const declined = account.status === "declined";

  // Free trial: a brand new landlord uses everything for two weeks before paying.
  if (!declined && trial.active) {
    return (
      <>
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <Gift className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-medium">
            Free trial — {trial.daysLeft} day{trial.daysLeft === 1 ? "" : "s"} left.
          </span>
          <span className="text-muted-foreground">
            After that, send {money(price.dueNow)} ({payMethod} {payNumber}) to keep your account active.
          </span>
          <PaywavePayButton kind="subscription" amount={price.dueNow} phone={account.phone} />
          <SubscriptionStkButton amount={price.dueNow} defaultPhone={account.phone} />
          <Button size="sm" variant="ghost" onClick={() => copyText(payNumber)}>
            <Copy className="h-4 w-4" /> Copy number
          </Button>
          <WhatsAppButton />
        </div>
        {children}
      </>
    );
  }

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
          <CardTitle>
            {declined ? "Account declined" : trial.endsAt ? "Free trial ended" : "Account awaiting approval"}
          </CardTitle>
          <CardDescription>
            {declined
              ? "Your landlord account was not approved."
              : `Your ${TRIAL_DAYS}-day free trial is over and no payment has been received yet. Pay your subscription below and your account is switched back on as soon as it is recorded.`}
          </CardDescription>
          <div className="pt-2">
            <Badge variant={declined ? "destructive" : "secondary"}>
              {declined ? "Declined" : "Payment not received"}
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
              <div className="mt-3 space-y-2">
                <PaywavePayButton full kind="subscription" amount={price.dueNow} phone={account.phone} />
                <SubscriptionStkButton full amount={price.dueNow} defaultPhone={account.phone} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Or pay manually:</p>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>
                  Open M-Pesa on your phone and choose <strong>{payMethod}</strong>.
                </li>
                <li>
                  Enter the number{" "}
                  <button
                    type="button"
                    onClick={() => copy(payNumber)}
                    className="font-semibold text-foreground underline underline-offset-2"
                  >
                    {payNumber}
                  </button>
                  .
                </li>
                <li>
                  Enter the amount <strong className="text-foreground">{money(price.dueNow)}</strong> and confirm.
                </li>
                <li>Once paid, the main account confirms your access — you get in right away.</li>
              </ol>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">{payMethod} — pay to</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{payNumber}</span>
                    <Button size="icon" variant="ghost" onClick={() => copy(payNumber)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">
                    {price.annual ? "Yearly fee" : "Monthly fee"}
                  </div>
                  <div className="font-semibold">{money(price.dueNow)}</div>
                  {price.discount > 0 && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400">
                      {price.discount}% offer applied (was {money(price.base)})
                    </div>
                  )}
                  {(account.offer_note ?? (pricing ?? DEFAULT_PRICING).offer_note) && (
                    <div className="text-xs text-muted-foreground">
                      {account.offer_note ?? (pricing ?? DEFAULT_PRICING).offer_note}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{account.email ?? "your account"}</span>. Access
            unlocks automatically the moment your payment is recorded.
          </div>

          <WhatsAppButton full />



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

/** Shown when a landlord has switched off a property manager's access. */
function ManagerAccessRevoked() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <div className="flex min-h-[70vh] items-start justify-center px-1 py-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Access switched off</CardTitle>
          <CardDescription>
            Your landlord has deactivated this property manager login. Contact them if this is a mistake.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
