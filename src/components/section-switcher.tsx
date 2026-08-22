import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import { useSeenBadges } from "@/hooks/use-seen-badges";

export type SwitcherItem = { label: string; url: string };

/** Finance group — Billing, Payments, Reports live under one tab. */
export const FINANCE_TABS: SwitcherItem[] = [
  { label: "Billing", url: "/billing" },
  { label: "Payments", url: "/payments" },
  { label: "Reports", url: "/reports" },
  { label: "Performance", url: "/performance" },
];

/** Lease group — the signed agreements and the template that produces them. */
export const LEASE_TABS: SwitcherItem[] = [
  { label: "Agreements", url: "/leases" },
  { label: "Template", url: "/settings/lease" },
];

/** Main-account group — company analytics, landlord accounts and branding. */
export const ADMIN_TABS: SwitcherItem[] = [
  { label: "Analytics", url: "/analytics" },
  { label: "Landlords", url: "/landlords" },
  { label: "Branding", url: "/settings/branding" },
];

/** People group — current tenants and the applications waiting for review. */
export const PEOPLE_TABS: SwitcherItem[] = [
  { label: "Tenants", url: "/tenants" },
  { label: "Applications", url: "/applications" },
];

/**
 * iPhone-camera style mode switcher: a horizontally scrollable rail of labels
 * where the active one sits in a raised pill.
 */
export function SectionSwitcher({ items }: { items: SwitcherItem[] }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const counts = usePendingCounts();
  const { unseen, markSeen } = useSeenBadges();
  /** Optimistic target so the pill slides instantly, before the route commits. */
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [pathname]);
  const current = pending ?? pathname;
  const index = items.findIndex((i) => i.url === current);

  /** How many items on each tab still need attention. */
  const countFor = (url: string): number => {
    switch (url) {
      case "/billing":
        return counts.overdueInvoices;
      case "/payments":
        return counts.recentPayments;
      case "/leases":
        return counts.unsignedLeases;
      case "/tenants":
        return counts.issues;
      case "/applications":
        return counts.applications;
      case "/landlords":
        return counts.pendingLandlords;
      default:
        return 0;
    }
  };

  /** Plain-language description of what the badge on a tab refers to. */
  const noteFor = (url: string, n: number): string | null => {
    switch (url) {
      case "/billing":
        return `${n} overdue invoice${n === 1 ? "" : "s"} need attention`;
      case "/payments":
        return `${n} payment${n === 1 ? "" : "s"} received in the last 24 hours`;
      case "/leases":
        return `${n} lease${n === 1 ? "" : "s"} still unsigned`;
      case "/tenants":
        return `${n} open issue${n === 1 ? "" : "s"} from tenants`;
      case "/applications":
        return `${n} application${n === 1 ? "" : "s"} waiting for review`;
      case "/landlords":
        return `${n} landlord sign-up${n === 1 ? "" : "s"} pending approval`;
      default:
        return null;
    }
  };

  // Clear the badge for the tab the landlord is actually looking at.
  const activeCount = countFor(pathname);
  useEffect(() => {
    if (items.some((i) => i.url === pathname)) markSeen(pathname, activeCount);
  }, [pathname, activeCount, items, markSeen]);

  const activeNote = activeCount > 0 ? noteFor(pathname, activeCount) : null;


  const go = (url: string) => {
    if (url === current) return;
    setPending(url);
    navigate({ to: url });
  };

  const move = (dir: 1 | -1) => {
    if (index < 0) return;
    const next = items[Math.min(items.length - 1, Math.max(0, index + dir))];
    if (next) go(next.url);
  };

  return (
    <div className="sticky top-0 z-20 -mx-1 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={(_, info) => {
          if (info.offset.x < -40) move(1);
          else if (info.offset.x > 40) move(-1);
        }}
        className="mx-auto inline-flex min-w-full items-center justify-center gap-1 overflow-hidden rounded-full border border-border/50 bg-background/70 p-1 shadow-2xl ring-1 ring-inset ring-foreground/10 backdrop-blur-2xl backdrop-saturate-150 sm:min-w-0"
      >
        {items.map((item) => {
          const active = current === item.url;
          const badge = active ? 0 : unseen(item.url, countFor(item.url));
          return (
            <Link
              key={item.url}
              to={item.url}
              preload="intent"
              onClick={() => setPending(item.url)}
              className={`relative flex-1 shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider transition-colors duration-300 sm:text-sm ${
                active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="section-switcher-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 -z-10 rounded-full bg-primary shadow-lg"
                />
              )}
              <span className="relative whitespace-nowrap">{item.label}</span>
              {badge > 0 && (
                <span className="absolute -right-0.5 -top-0.5 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </motion.div>
      {activeNote && (
        <div className="mt-2 flex justify-center">
          <span className="rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-[11px] font-medium text-destructive">
            {activeNote}
          </span>
        </div>
      )}
    </div>
  );


}
