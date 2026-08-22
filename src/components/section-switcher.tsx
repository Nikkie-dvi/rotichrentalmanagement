import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";

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
  const index = items.findIndex((i) => i.url === pathname);

  const move = (dir: 1 | -1) => {
    if (index < 0) return;
    const next = items[Math.min(items.length - 1, Math.max(0, index + dir))];
    if (next && next.url !== pathname) navigate({ to: next.url });
  };

  return (
    <div className="sticky top-0 z-20 -mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={(_, info) => {
          if (info.offset.x < -40) move(1);
          else if (info.offset.x > 40) move(-1);
        }}
        className="mx-auto inline-flex min-w-full items-center justify-center gap-1 rounded-full border border-border/60 bg-muted/40 p-1 shadow-sm ring-1 ring-inset ring-border/30 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-muted/30 sm:min-w-0"
      >
        {items.map((item) => {
          const active = pathname === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className="relative flex-1 whitespace-nowrap rounded-full px-4 py-2 text-center text-sm font-semibold uppercase tracking-wide"
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="section-switcher-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-full bg-card shadow-sm ring-1 ring-border/60"
                />
              )}
              <motion.span
                animate={{ scale: active ? 1.02 : 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className={`relative z-10 block transition-colors duration-300 ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </motion.span>
            </Link>
          );
        })}
      </motion.div>
    </div>
  );
}
