// Suggestive shortcuts so landlords can jump straight to the next useful screen,
// plus a clear nudge to top up SMS credit (separate from the monthly subscription).
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessageSquare, Users, ClipboardList, Wrench, Settings, FileSignature, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchSmsWalletSafe } from "@/lib/sms-wallet-client";

const ksh = (n: number) => `KES ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function SuggestedShortcuts() {
  const { data: wallet } = useQuery({
    queryKey: ["sms-wallet"],
    queryFn: fetchSmsWalletSafe,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const left = wallet?.messagesLeft ?? 0;
  const empty = left < 1;
  const low = left < 10;

  return (
    <Card className="glass-card">
      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
        <CardTitle className="text-base">Suggested shortcuts</CardTitle>
        <CardDescription>Quick hops to the screens landlords use most.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0 sm:p-6 sm:pt-0">
        {wallet && (
          <div
            className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${
              empty ? "border-destructive/50 bg-destructive/10" : low ? "border-amber-500/40 bg-amber-500/10" : "bg-muted/40"
            }`}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {empty ? "SMS credit finished — tenant texts are paused" : "Tenant SMS credit"}
              </p>
              <p className="text-xs text-muted-foreground">
                {ksh(wallet.balance)} · {left} message{left === 1 ? "" : "s"} left. Bought separately from your monthly
                app subscription.
              </p>
            </div>
            <Button asChild size="sm" variant={empty ? "default" : "outline"} className={empty ? "glow-red" : ""}>
              <Link to="/settings/payments" hash="sms-credit">
                {empty || low ? "Top up SMS" : "Manage SMS"} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button asChild variant="outline" size="sm" className="glass-btn justify-start">
            <Link to="/settings/payments" hash="sms-tenants">
              <MessageSquare className="h-4 w-4" /> SMS tenants
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="glass-btn justify-start">
            <Link to="/applications">
              <ClipboardList className="h-4 w-4" /> Applications
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="glass-btn justify-start">
            <Link to="/tenants">
              <Users className="h-4 w-4" /> Tenants
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="glass-btn justify-start">
            <Link to="/maintenance">
              <Wrench className="h-4 w-4" /> Maintenance
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="glass-btn justify-start">
            <Link to="/settings/payments">
              <Settings className="h-4 w-4" /> Payment details
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="glass-btn justify-start">
            <Link to="/settings/lease">
              <FileSignature className="h-4 w-4" /> Lease template
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="glass-btn justify-start">
            <Link to="/settings/billing">
              <Settings className="h-4 w-4" /> Billing rules
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
