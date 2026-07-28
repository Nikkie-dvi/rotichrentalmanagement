import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Building2, Users, Gauge, FileText, Receipt, Bell, ClipboardCheck } from "lucide-react";
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
  { title: "Meter Readings", url: "/meters", icon: Gauge },
  { title: "Billing & Invoices", url: "/billing", icon: FileText },
  { title: "Payments & Receipts", url: "/payments", icon: Receipt },
  { title: "Notification Tones", url: "/settings/notifications", icon: Bell },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
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
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
