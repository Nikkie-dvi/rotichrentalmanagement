import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Building2, Users, Gauge, FileText, Bell, Wrench, FileSignature, BarChart3, Wallet, UserCog, AlarmClock, CalendarDays } from "lucide-react";
import { useIsSuperAdmin, useIsPropertyManager } from "@/hooks/use-landlord-account";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import { AppLogo } from "@/components/app-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Properties & Units", url: "/properties", icon: Building2 },
  { title: "Tenants & Applications", url: "/tenants", icon: Users },
  { title: "Leases & Template", url: "/leases", icon: FileSignature },
  { title: "Issues & Move-outs", url: "/maintenance", icon: Wrench },
  { title: "Rent Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Meter Readings", url: "/meters", icon: Gauge },
  { title: "Billing, Payments & Reports", url: "/billing", icon: FileText },
  { title: "Rent Payment Details", url: "/settings/payments", icon: Wallet },
  { title: "Late Fees & Alerts", url: "/settings/billing", icon: AlarmClock },
  { title: "Property Managers", url: "/settings/managers", icon: UserCog },
  { title: "Notification Tones", url: "/settings/notifications", icon: Bell },
];

/** Pages a property manager (not the landlord) should not see. */
const LANDLORD_ONLY = ["/settings/payments", "/settings/lease", "/settings/managers", "/settings/billing"];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isSuper = useIsSuperAdmin();
  const isManager = useIsPropertyManager();
  const counts = usePendingCounts();
  const badgeFor = (url: string) =>
    url === "/maintenance" ? counts.issues
    : url === "/billing" ? counts.unpaidInvoices + counts.overdueInvoices
    : url === "/tenants" ? counts.moveOuts + counts.applications
    : 0;
  // Money in is good news — everything else is something to act on.
  const toneFor = (_url: string) => "bg-destructive text-destructive-foreground";
  const base = isManager ? items.filter((i) => !LANDLORD_ONLY.includes(i.url)) : items;
  const menu = isSuper
    ? [
        ...base,
        { title: "Analytics, Landlords & Branding", url: "/analytics", icon: BarChart3 },
      ]
    : base;
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <AppLogo className="h-8 w-8 shrink-0" />
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold text-sidebar-foreground">Rotich Rental</div>
            <div className="text-xs text-sidebar-foreground/60">Management Systems</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menu.map((item) => {
                const group =
                  item.url === "/billing"
                    ? ["/billing", "/payments", "/reports", "/performance"]
                    : item.url === "/leases"
                      ? ["/leases", "/settings/lease"]
                      : item.url === "/tenants"
                        ? ["/tenants", "/applications"]
                        : item.url === "/analytics"
                          ? ["/analytics", "/landlords", "/settings/branding"]
                          : [item.url];
                const active = group.includes(pathname);
                const count = badgeFor(item.url);
                const tone = toneFor(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={`nav-tab-glass ${active ? "nav-tab-active text-sidebar-primary-foreground" : ""}`}
                    >
                      <Link to={item.url}>
                        <item.icon
                          className={active ? "text-sidebar-primary" : ""}
                          style={active ? { animation: "nav-icon-pop 0.4s cubic-bezier(0.34,1.56,0.64,1)" } : undefined}
                        />
                        <span
                          style={active ? { animation: "nav-text-slide 0.3s ease-out" } : undefined}
                        >
                          {item.title}
                        </span>
                        {count > 0 && (
                          <span
                            className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none shadow-sm ${tone}  group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:min-w-4 group-data-[collapsible=icon]:px-0`}
                            aria-label={`${count} pending`}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                        {active && <span className="nav-active-bar" aria-hidden />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
