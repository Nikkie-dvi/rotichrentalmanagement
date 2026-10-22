import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, LogOut, XCircle, Ban, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  useLandlordAccount,
  useIsSuperAdmin,
  useManagerStatus,
  whatsappSupportLink,
} from "@/hooks/use-landlord-account";

/**
 * Blocks the landlord dashboard until the main account approves the landlord.
 * Access is free — the main account approves, suspends or reactivates each
 * landlord manually; there are no subscription payments.
 */
export function LandlordGate({ children }: { children: ReactNode }) {
  const { data: account, isLoading, refetch, isRefetching } = useLandlordAccount();
  const isSuper = useIsSuperAdmin();
  const { isManager, isDisabled: managerDisabled, isPending: managerPending } = useManagerStatus();
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

  if (!account || isSuper) return <>{children}</>;

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  // A suspended landlord (or a manager working for one) loses access until the
  // main account switches them back on. Data stays saved.
  if (account.status === "suspended") {
    return (
      <BlockedCard
        icon={<Ban className="h-6 w-6 text-destructive" />}
        title="Account switched off"
        description="This landlord account has been suspended by the main account. Your properties, tenants and records are safe — contact support to turn access back on."
        badge={<Badge variant="destructive">Suspended</Badge>}
        email={account.email}
        onRefresh={() => refetch()}
        refreshing={isRefetching}
        onSignOut={signOut}
        whatsapp={whatsappSupportLink(
          `Hello, I am ${account.full_name ?? account.email ?? "a landlord"}${
            account.landlord_code ? ` (code ${account.landlord_code})` : ""
          }. My account has been switched off. Kindly assist.`,
        )}
      />
    );
  }

  if (isManager || account.status === "approved") return <>{children}</>;

  const declined = account.status === "declined";

  return (
    <BlockedCard
      icon={
        declined ? (
          <XCircle className="h-6 w-6 text-destructive" />
        ) : (
          <ShieldCheck className="h-6 w-6 text-primary" />
        )
      }
      title={declined ? "Account declined" : "Account awaiting approval"}
      description={
        declined
          ? "Your landlord account was not approved."
          : "Your registration is waiting for the main account to confirm it. Once approved, you can use everything right away — there is nothing to pay."
      }
      badge={<Badge variant={declined ? "destructive" : "secondary"}>{declined ? "Declined" : "Pending approval"}</Badge>}
      reason={declined ? account.declined_reason : null}
      email={account.email}
      onRefresh={() => refetch()}
      refreshing={isRefetching}
      onSignOut={signOut}
      whatsapp={whatsappSupportLink(
        `Hello, I am ${account.full_name ?? account.email ?? "a landlord"}${
          account.landlord_code ? ` (code ${account.landlord_code})` : ""
        }. My account is still awaiting approval. Kindly assist.`,
      )}
    />
  );
}

function BlockedCard({
  icon,
  title,
  description,
  badge,
  reason,
  email,
  onRefresh,
  refreshing,
  onSignOut,
  whatsapp,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge: ReactNode;
  reason?: string | null;
  email: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  onSignOut: () => void;
  whatsapp: string;
}) {
  return (
    <div className="flex min-h-[70vh] items-start justify-center px-1 py-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {icon}
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          <div className="pt-2">{badge}</div>
        </CardHeader>
        <CardContent className="space-y-4">
          {reason && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="font-medium text-destructive">Reason</div>
              <p className="text-muted-foreground">{reason}</p>
            </div>
          )}
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{email ?? "your account"}</span>.
          </div>
          <Button asChild size="sm" variant="outline" className="w-full">
            <a href={whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> Need help? WhatsApp us
            </a>
          </Button>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onRefresh} disabled={refreshing}>
              {refreshing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Check status
            </Button>
            <Button variant="outline" onClick={onSignOut}>
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
