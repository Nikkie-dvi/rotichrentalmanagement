import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Moon, Sun, Bell, BellOff, BellRing, LogOut, ClipboardCheck, Wrench, UserCog } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useIsPropertyManager, useLandlordAccount } from "@/hooks/use-landlord-account";
import { useTheme } from "@/lib/theme";
import { money } from "@/lib/types";
import {
  notificationPermission,
  requestNotificationPermission,
} from "@/lib/notifications";
import { toast } from "sonner";

export function AppHeader() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const counts = usePendingCounts();
  const isManager = useIsPropertyManager();
  const { data: account } = useLandlordAccount();

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  useEffect(() => {
    setPerm(notificationPermission());
  }, []);

  const askPerm = async () => {
    const r = await requestNotificationPermission();
    setPerm(r);
    if (r === "granted") toast.success("Notifications enabled");
    else if (r === "denied") toast.error("Notifications blocked in browser settings");
    else if (r === "unsupported") toast.error("Notifications not supported on this device");
  };

  const { data: summary } = useQuery({
    queryKey: ["summary"],
    queryFn: async () => {
      const monthKey = new Date().toISOString().slice(0, 7);
      const [{ data: units }, { data: invoices }, { data: payments }] = await Promise.all([
        supabase.from("units").select("id,status"),
        supabase.from("invoices").select("balance_remaining,total_due,status,month_year"),
        supabase.from("payments").select("amount_paid,payment_date"),
      ]);
      const totalUnits = units?.length ?? 0;
      const occupied = units?.filter((u: any) => u.status === "occupied").length ?? 0;
      const collectedThisMonth =
        payments?.filter((p: any) => (p.payment_date ?? "").startsWith(monthKey)).reduce((s: number, p: any) => s + Number(p.amount_paid), 0) ?? 0;
      const arrears = invoices?.reduce((s: number, i: any) => s + Number(i.balance_remaining), 0) ?? 0;
      return { totalUnits, occupied, collectedThisMonth, arrears };
    },
  });

  const NotifIcon =
    perm === "granted" ? BellRing : perm === "denied" || perm === "unsupported" ? BellOff : Bell;

  return (
    <header
      className={`sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur ${
        isManager ? "border-b-2 border-b-amber-500/70" : ""
      }`}
    >
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <AppLogo className="h-8 w-8 shrink-0" />
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-tight">
          {isManager ? "Manager Dashboard" : "Rental Dashboard"}
        </h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {isManager
            ? `Property manager${account?.full_name ? ` for ${account.full_name}` : ""}`
            : "Manage properties, tenants & payments"}
        </p>
      </div>
      {isManager && (
        <Badge className="shrink-0 gap-1 bg-amber-500 text-amber-950 hover:bg-amber-500">
          <UserCog className="h-3.5 w-3.5" />
          <span className="hidden xs:inline">Property </span>Manager
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-2 overflow-x-auto">
        {counts.applications > 0 && (
          <Link to="/applications">
            <Badge className="bg-destructive text-destructive-foreground">
              <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
              {counts.applications} new
            </Badge>
          </Link>
        )}
        {counts.issues > 0 && (
          <Link to="/maintenance" className="hidden sm:block">
            <Badge className="bg-warning text-warning-foreground">
              <Wrench className="mr-1 h-3.5 w-3.5" />
              {counts.issues} issues
            </Badge>
          </Link>
        )}
        <Badge variant="secondary" className="hidden sm:inline-flex">
          Units: <span className="ml-1 font-semibold">{summary?.totalUnits ?? 0}</span>
        </Badge>
        <Badge variant="secondary" className="hidden md:inline-flex">
          Occupied: <span className="ml-1 font-semibold">{summary?.occupied ?? 0}</span>
        </Badge>
        <Badge className="hidden md:inline-flex bg-primary text-primary-foreground">
          Collected: <span className="ml-1 font-semibold">{money(summary?.collectedThisMonth ?? 0)}</span>
        </Badge>
        <Badge variant="destructive" className="hidden lg:inline-flex">
          Arrears: <span className="ml-1 font-semibold">{money(summary?.arrears ?? 0)}</span>
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          onClick={askPerm}
          aria-label="Enable notifications"
          title={
            perm === "granted"
              ? "Notifications on"
              : perm === "denied"
                ? "Notifications blocked"
                : perm === "unsupported"
                  ? "Not supported"
                  : "Enable notifications"
          }
        >
          <NotifIcon className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
