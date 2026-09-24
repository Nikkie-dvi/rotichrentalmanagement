import { useEffect, useState, type ComponentType } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  FileSignature,
  Gauge,
  LayoutDashboard,
  ReceiptText,
  Settings2,
  ShieldCheck,
  UserRound,
  UserCog,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import { useIsSuperAdmin, useIsPropertyManager } from "@/hooks/use-landlord-account";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  description: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  matches?: string[];
  landlordOnly?: boolean;
  superOnly?: boolean;
  badge?: string;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    id: "overview",
    label: "Overview & Insights",
    items: [
      { title: "Dashboard", description: "Portfolio at a glance", url: "/", icon: LayoutDashboard },
      {
        title: "Analytics & Landlords",
        description: "Performance, landlords & branding",
        url: "/analytics",
        icon: BarChart3,
        matches: ["/analytics", "/landlords", "/settings/branding", "/performance"],
        superOnly: true,
      },
    ],
  },
  {
    id: "property",
    label: "Property & Operations",
    items: [
      { title: "Properties & Units", description: "Buildings, layouts & vacancies", url: "/properties", icon: Building2 },
      { title: "Utilities & Meters", description: "Readings & consumption", url: "/meters", icon: Gauge },
      { title: "Maintenance & Turnovers", description: "Issues, repairs & move-outs", url: "/maintenance", icon: Wrench },
    ],
  },
  {
    id: "tenants",
    label: "Tenants & Leases",
    items: [
      {
        title: "Tenants & Applications",
        description: "Applicants & resident directory",
        url: "/tenants",
        icon: Users,
        matches: ["/tenants", "/applications"],
      },
      {
        title: "Leases & Templates",
        description: "Contracts & legal templates",
        url: "/leases",
        icon: FileSignature,
        matches: ["/leases", "/settings/lease"],
      },
      { title: "Rent Calendar", description: "Payment schedules", url: "/calendar", icon: CalendarDays },
    ],
  },
  {
    id: "financials",
    label: "Financials",
    items: [
      {
        title: "Billing & Reports",
        description: "Invoices & accounting reports",
        url: "/billing",
        icon: ReceiptText,
        matches: ["/billing", "/reports"],
        badge: "4",
      },
      {
        title: "Transaction History",
        description: "Payment logs & ledger details",
        url: "/payments",
        icon: WalletCards,
        matches: ["/payments", "/settings/payments"],
        landlordOnly: true,
      },
      {
        title: "Late Fees & Collections",
        description: "Penalties & alert logs",
        url: "/settings/billing",
        icon: ShieldCheck,
        landlordOnly: true,
      },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    items: [
      {
        title: "My Account",
        description: "Code, subscription & profile",
        url: "/settings/account",
        icon: UserRound,
        landlordOnly: true,
      },
      {
        title: "Team & Managers",
        description: "Access control & permissions",
        url: "/settings/managers",
        icon: UserCog,
        landlordOnly: true,
      },
      {
        title: "System Settings",
        description: "Notifications & preferences",
        url: "/settings/notifications",
        icon: Settings2,
      },
    ],
  },
];

function isItemActive(item: NavItem, pathname: string) {
  return (item.matches ?? [item.url]).includes(pathname);
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isSuper = useIsSuperAdmin();
  const isManager = useIsPropertyManager();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => (!item.superOnly || isSuper) && (!item.landlordOnly || !isManager)),
    }))
    .filter((section) => section.items.length > 0);
  const activeSection = visibleSections.find((section) =>
    section.items.some((item) => isItemActive(item, pathname)),
  )?.id;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((section) => [section.id, section.id === "overview"])),
  );

  useEffect(() => {
    if (!activeSection) return;
    setOpenSections((current) => ({ ...current, [activeSection]: true }));
  }, [activeSection]);

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border/80">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-3 px-1">
          <AppLogo className="h-9 w-9 shrink-0 ring-1 ring-sidebar-border" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-semibold text-sidebar-foreground">Rotich Rental</div>
            <div className="truncate text-[11px] text-sidebar-foreground/55">Management Systems</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-2 py-3">
        {visibleSections.map((section) => {
          const isOpen = collapsed || Boolean(openSections[section.id]);
          return (
            <Collapsible
              key={section.id}
              open={isOpen}
              onOpenChange={(open) => setOpenSections((current) => ({ ...current, [section.id]: open }))}
              className="group/nav-section"
            >
              <SidebarGroup className="p-0 pb-2">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 w-full justify-between px-2 text-[10px] font-semibold uppercase text-sidebar-foreground/45 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
                  >
                    <span>{section.label}</span>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]/nav-section:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="nav-section-content">
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-1">
                      {section.items.map((item) => {
                        const active = isItemActive(item, pathname);
                        return (
                          <SidebarMenuItem key={item.url}>
                            <SidebarMenuButton
                              asChild
                              isActive={active}
                              tooltip={`${item.title} — ${item.description}`}
                              className={`nav-item group/nav-item h-auto min-h-11 items-start rounded-md py-2 pl-3 pr-2 ${active ? "nav-item-active" : ""}`}
                            >
                              <Link to={item.url}>
                                <item.icon className="mt-0.5 h-[18px] w-[18px] text-sidebar-foreground/55 transition-colors group-hover/nav-item:text-sidebar-primary group-data-[active=true]/nav-item:text-sidebar-primary" />
                                <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                                  <span className="block truncate text-[13px] font-medium text-sidebar-foreground">{item.title}</span>
                                  <span className="mt-0.5 block truncate text-[10px] text-sidebar-foreground/45">{item.description}</span>
                                </span>
                                {item.badge && (
                                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-0 group-data-[collapsible=icon]:top-0">
                                    {item.badge}
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
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2 px-1 text-[10px] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">
          <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
          Secure property workspace
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
