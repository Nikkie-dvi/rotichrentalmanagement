import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Moon, Sun, Bell, BellOff, BellRing, LogOut, ClipboardCheck, Wrench, UserPlus, UserCog, MoreVertical, Building2, Users, Receipt, LayoutDashboard } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import { AppMenu } from "@/components/app-navigation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { supabase } from "@/integrations/supabase/client";
import { setActiveLandlordId, useIsPropertyManager, useIsSuperAdmin, useLandlordAccount, useManagerLinks } from "@/hooks/use-landlord-account";
import { useTheme } from "@/lib/theme";
import { money } from "@/lib/types";
import {
  notificationPermission,
  requestNotificationPermission,
} from "@/lib/notifications";
import { toast } from "sonner";
import { QuickStartGuide } from "@/components/quick-start-guide";
import { InstallAppButton } from "@/components/install-app-button";

const LANDLORD_GUIDE = [
  {
    icon: LayoutDashboard,
    title: "Welcome to your dashboard",
    description: "This first page shows your units, occupancy, money collected and rent still owed. Tap any total to see the records behind it.",
  },
  {
    icon: Building2,
    title: "Add your property first",
    description: "Open the menu and choose Properties & Units. Add a property, then create its units and set the monthly rent for each one.",
  },
  {
    icon: Users,
    title: "Add or approve tenants",
    description: "Choose Tenants & Applications to add a tenant yourself, or approve tenants who register using your landlord code.",
  },
  {
    icon: Receipt,
    title: "Invoice and record payments",
    description: "Use Billing, Payments & Reports to create rent or service invoices, record payments, send receipts and download statements.",
  },
];

export function AppHeader() {
  const { theme, toggle } = useTheme();
  const queryClient = useQueryClient();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const counts = usePendingCounts();
  const isManager = useIsPropertyManager();
  const isSuper = useIsSuperAdmin();
  const { data: account } = useLandlordAccount();
  const { data: links } = useManagerLinks();
  const activeLinks = (links ?? []).filter((l) => l.active);
  // Managers who still keep some properties on their own account can switch back to them.
  const { data: ownProps } = useQuery({
    queryKey: ["own-properties-count", isManager],
    enabled: isManager,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { count } = await supabase.from("properties").select("id", { count: "exact", head: true }).eq("owner_id", u.user.id);
      return { userId: u.user.id, count: count ?? 0 };
    },
  });
  const showOwn = !!ownProps && ownProps.count > 0;

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
      className={`sticky top-0 z-30 mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-2 bg-background/95 px-4 py-2 backdrop-blur sm:px-6 ${
        isManager ? "border-b-2 border-b-warning/70" : ""
      }`}
    >
      <AppMenu />
      <AppLogo className="h-8 w-8 shrink-0" />
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-tight">
          {isManager ? "Eden Point Manager" : "Eden Point Rentals"}
        </h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {isManager
            ? `Property manager${account?.full_name ? ` for ${account.full_name}` : ""}`
            : "Manage properties, tenants & payments"}
        </p>
      </div>
      {isManager && (
        <Badge className="shrink-0 gap-1 bg-warning text-warning-foreground hover:bg-warning">
          <UserCog className="h-3.5 w-3.5" />
          Manager
        </Badge>
      )}
      {isManager && activeLinks.length + (showOwn ? 1 : 0) > 1 && (
        <select
          aria-label="Choose landlord"
          className="h-8 max-w-[10rem] shrink-0 truncate rounded-md border bg-background px-2 text-xs"
          value={account?.user_id ?? ""}
          onChange={(e) => {
            setActiveLandlordId(e.target.value);
            queryClient.invalidateQueries();
            toast.success("Switched landlord");
          }}
        >
          {showOwn && ownProps && <option value={ownProps.userId}>My own properties</option>}
          {activeLinks.map((l) => (
            <option key={l.id} value={l.landlord_user_id}>
              {(l.landlord_name ?? "Landlord") + (l.property_names?.length ? ` · ${l.property_names.join(", ")}` : "")}
            </option>
          ))}
        </select>
      )}
      <div className="ml-auto flex items-center gap-1">
        {!isManager && <span className="hidden sm:inline-flex"><QuickStartGuide audience="landlord" steps={LANDLORD_GUIDE} compact /></span>}
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
        {isSuper && counts.pendingLandlords + counts.pendingRecharges > 0 && (
          <Link to="/landlords">
            <Badge className="gap-1 bg-warning text-warning-foreground">
              <UserPlus className="h-3.5 w-3.5" />
              {counts.pendingLandlords + counts.pendingRecharges} to review
            </Badge>
          </Link>
        )}
        <InstallAppButton />
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Account options" title="Account options"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={toggle}>{theme === "dark" ? <Sun /> : <Moon />}Switch theme</DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/settings/account"><UserCog />My Account</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
