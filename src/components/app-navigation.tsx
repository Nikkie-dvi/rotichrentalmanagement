import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ReceiptText, Users, ChartNoAxesCombined, UserRound, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sections } from "@/components/app-sidebar";
import { useIsPropertyManager, useIsSuperAdmin } from "@/hooks/use-landlord-account";
import { usePendingCounts } from "@/hooks/use-pending-counts";

export function AppMenu() {
  const [open, setOpen] = useState(false);
  const isManager = useIsPropertyManager();
  const isSuper = useIsSuperAdmin();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const counts = usePendingCounts();
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button variant="ghost" size="icon" aria-label="All pages" title="All pages" onClick={() => setOpen(true)}><Menu /></Button>
    <DialogContent className="max-h-[85svh] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle>All pages</DialogTitle></DialogHeader>
      <div className="space-y-4">{sections.map(section => {
        const items = section.items.filter(item => (!item.landlordOnly || !isManager) && (!item.superOnly || isSuper));
        return items.length > 0 && <section key={section.id}>
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{section.label}</h3>
          <div className="grid gap-1 sm:grid-cols-2">{items.map(item => <Button key={item.url} asChild variant={(item.matches ?? [item.url]).includes(pathname) ? "secondary" : "ghost"} className="h-11 justify-start whitespace-normal text-left text-xs">
            <Link to={item.url} onClick={() => setOpen(false)}><item.icon className="shrink-0" />{item.title}
              {item.url === "/analytics" && isSuper && counts.pendingLandlords + counts.pendingRecharges > 0 && <span className="ml-auto rounded-full bg-destructive px-1.5 text-destructive-foreground">{counts.pendingLandlords + counts.pendingRecharges}</span>}
            </Link>
          </Button>)}</div>
        </section>;
      })}</div>
    </DialogContent>
  </Dialog>;
}

export function AppNavigation() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const isManager = useIsPropertyManager();
  const counts = usePendingCounts();
  const tabs = [
    { label: "Home", url: "/", icon: Home, active: pathname === "/" },
    { label: "Bills", url: isManager ? "/billing" : "/payments", icon: ReceiptText, active: ["/payments", "/billing", "/settings/payments", "/settings/billing"].includes(pathname), count: counts.overdueInvoices },
    { label: "Tenants", url: "/tenants", icon: Users, active: ["/tenants", "/applications", "/leases", "/settings/lease"].includes(pathname), count: counts.applications },
    { label: "History", url: "/performance", icon: ChartNoAxesCombined, active: ["/performance", "/reports"].includes(pathname) },
    { label: "Account", url: isManager ? "/settings/notifications" : "/settings/account", icon: UserRound, active: pathname.startsWith("/settings/") && !["/settings/payments", "/settings/billing", "/settings/lease"].includes(pathname) },
  ];
  return <nav aria-label="Main navigation" className="app-bottom-nav">
    {tabs.map(tab => <Button key={tab.label} asChild variant="ghost" className={`relative h-16 min-w-0 flex-1 flex-col gap-1 rounded-none px-1 text-[11px] hover:bg-sidebar-accent hover:text-sidebar-foreground ${tab.active ? "text-sidebar-primary" : "text-sidebar-foreground/70"}`}>
      <Link to={tab.url} aria-current={tab.active ? "page" : undefined}>
        <span className={`grid h-8 w-10 place-items-center rounded-full ${tab.label === "Tenants" ? "bg-sidebar-primary text-sidebar-primary-foreground" : ""}`}><tab.icon className="!h-5 !w-5" /></span>
        <span>{tab.label}</span>
        {(tab.count ?? 0) > 0 && <span className="absolute right-2 top-1 min-w-4 rounded-full bg-destructive px-1 text-[9px] text-destructive-foreground">{(tab.count ?? 0) > 99 ? "99+" : tab.count}</span>}
      </Link>
    </Button>)}
  </nav>;
}