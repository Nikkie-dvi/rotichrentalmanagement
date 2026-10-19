import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useHydrated } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppNavigation } from "@/components/app-navigation";
import { AppHeader } from "@/components/app-header";
import { ThoughtBuddy } from "@/components/thought-buddy";
import { AssistantDock } from "@/components/assistant-dock";
import { GuidedTour } from "@/components/guided-tour";
import { ThemeProvider } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { useRentReminders } from "@/hooks/use-rent-reminders";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { PaymentReminderPopup } from "@/components/payment-reminder-popup";
import { supabase } from "@/integrations/supabase/client";
import { OfflineBanner, useOfflineCache, useOnlineSync } from "@/components/offline-support";

function NotFoundComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  // Legacy/internal layout URLs like "/_authenticated/payments" or
  // "/_tenantauth/tenant/dashboard" are not real paths — strip the prefix.
  const cleaned = pathname.replace(/^\/_[^/]+/, "") || "/";

  useEffect(() => {
    if (cleaned !== pathname) {
      navigate({ to: cleaned, replace: true });
    }
  }, [cleaned, pathname, navigate]);

  if (cleaned !== pathname) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">This page doesn't exist.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    // After a new version is published, an already-open tab asks for files that
    // no longer exist. Reload once to pick up the new version instead of failing.
    const msg = String((error as any)?.message ?? error);
    const stale = /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk|error loading dynamically/i.test(msg);
    const key = "rms-stale-reload";
    if (stale && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      window.location.reload();
      return;
    }
    sessionStorage.removeItem(key);
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#1597A8" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Eden Point Real Estate" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "google-site-verification", content: "PUzLmY3PRB0qqXqZEc6NMXzQZMOx0I0ATsM2wTJk9l0" },
      { title: "Eden Point Real Estate — Rental Property Software for Landlords" },
      { name: "description", content: "Manage rental properties, tenants, leases, utility meters, invoices and M-Pesa payments from one Kenyan-built landlord dashboard." },
      { property: "og:site_name", content: "Eden Point Real Estate" },
      { property: "og:title", content: "Eden Point Real Estate — Rental Property Software for Landlords" },
      { property: "og:description", content: "Manage rental properties, tenants, leases, utility meters, invoices and M-Pesa payments from one Kenyan-built landlord dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Eden Point Real Estate — Rental Property Software for Landlords" },
      { name: "twitter:description", content: "Manage rental properties, tenants, leases, utility meters, invoices and M-Pesa payments from one Kenyan-built landlord dashboard." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Outfit:wght@600;700&display=swap" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "Eden Point Real Estate",
              url: "https://homebasemanager.app",
              logo: "https://homebasemanager.app/apple-touch-icon.png",
            },
            {
              "@type": "WebSite",
              name: "Eden Point Real Estate",
              url: "https://homebasemanager.app",
},
            {
              "@type": "Service",
              name: "Rental property management software",
              serviceType: "Property management and rent billing",
              areaServed: "KE",
              provider: { "@type": "Organization", name: "Eden Point Real Estate" },
              url: "https://homebasemanager.app",
            },
          ],
        }),
      },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthRoute = pathname.startsWith("/auth") || pathname === "/welcome" || pathname.startsWith("/tenant");

  useEffect(() => {
    import("../lib/pwa")
      .then((m) => {
        m.installChunkErrorRecovery();
        return m.registerPWA();
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return <AppInner queryClient={queryClient} isAuthRoute={isAuthRoute} />;
}

function AppInner({ queryClient, isAuthRoute }: { queryClient: QueryClient; isAuthRoute: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useOfflineCache(queryClient);
  useOnlineSync(queryClient);
  const hydrated = useHydrated();
  // The server can't know the sign-in state, so render nothing layout-specific
  // until the browser takes over (avoids a mismatch when "/" redirects to /auth).
  if (!hydrated) {
    return <QueryClientProvider client={queryClient}><div className="min-h-svh" /></QueryClientProvider>;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {isAuthRoute ? (
          <>
            <OfflineBanner />
            <ThemeToggle />
            <Outlet />
          </>
        ) : (
          <div className="rental-app-shell min-h-svh w-full">
              <OfflineBanner />
              <AppHeader />
              <ReminderRunner />
              <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-32 sm:px-6">
                <div key={pathname} className="route-transition">
                  <Outlet />
                </div>
              </main>
              <PaymentReminderPopup />
              <ThoughtBuddy />
              <AssistantDock />
              <GuidedTour />
              <AppNavigation />
          </div>
        )}
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ReminderRunner() {
  useRentReminders();
  useRealtimeInvalidate();
  return null;
}
