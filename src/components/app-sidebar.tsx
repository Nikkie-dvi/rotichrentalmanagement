import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Building2, Users, Gauge, FileText, Receipt, Bell, ClipboardCheck, Wrench, ShieldCheck, FileSignature, BarChart3 } from "lucide-react";
import { useIsSuperAdmin } from "@/hooks/use-landlord-account";
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
  { title: "Tenants", url: "/tenants", icon: Users },
  { title: "Applications", url: "/applications", icon: ClipboardCheck },
  { title: "Lease Agreements", url: "/leases", icon: FileSignature },
  { title: "Issues & Move-outs", url: "/maintenance", icon: Wrench },
  { title: "Meter Readings", url: "/meters", icon: Gauge },
  { title: "Billing & Invoices", url: "/billing", icon: FileText },
  { title: "Payments & Receipts", url: "/payments", icon: Receipt },
  { title: "Notification Tones", url: "/settings/notifications", icon: Bell },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isSuper = useIsSuperAdmin();
  const menu = isSuper
    ? [
        ...items,
        { title: "Landlord accounts", url: "/landlords", icon: ShieldCheck },
        { title: "CEO Analytics", url: "/analytics", icon: BarChart3 },
      ]
    : items;
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold">
            R
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold text-sidebar-foreground">Rotich Management</div>
            <div className="text-xs text-sidebar-foreground/60">Systems</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menu.map((item) => {
                const active = pathname === item.url;
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
