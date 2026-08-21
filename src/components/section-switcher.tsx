import { Link, useRouterState } from "@tanstack/react-router";

export type SwitcherItem = { label: string; url: string };

/** Finance group — Billing, Payments, Reports live under one tab. */
export const FINANCE_TABS: SwitcherItem[] = [
  { label: "Billing", url: "/billing" },
  { label: "Payments", url: "/payments" },
  { label: "Reports", url: "/reports" },
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

  return (
    <div className="sticky top-0 z-20 -mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto inline-flex min-w-full items-center justify-center gap-1 rounded-full border border-border/50 bg-background/50 p-1 shadow-sm ring-1 ring-inset ring-background/40 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/40 sm:min-w-0">
        {items.map((item) => {
          const active = pathname === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-center text-sm font-semibold uppercase tracking-wide transition-all duration-300 ${
                active
                  ? "bg-background text-primary shadow-sm scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
