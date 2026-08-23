import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ClipboardCheck, Wrench } from "lucide-react";

export const Route = createFileRoute("/tenant/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tenant Portal — Rotich Management Systems" },
      { name: "description", content: "Sign in or register to manage your rental, sign your lease, and report maintenance issues." },
      { property: "og:title", content: "Tenant Portal — Rotich Management Systems" },
      { property: "og:description", content: "Sign your lease, view rent due, and raise maintenance requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TenantLanding,
});

function TenantLanding() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Futuristic animated background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background to-muted/40" />

      {/* Animated grid overlay */}
      <div
        className="tenant-bg-grid absolute inset-0 -z-10 opacity-20"
        style={{ animation: "tenant-grid-fade 8s ease-in-out infinite" }}
      />

      {/* "ROTICH / RENTALS" square watermark */}
      <div className="tenant-watermark -z-10" />

      {/* Floating gradient orbs */}
      <div
        className="tenant-bg-orb -z-10 h-72 w-72 bg-primary/30"
        style={{ top: "-5%", left: "-10%", animation: "tenant-orb-1 14s ease-in-out infinite" }}
      />
      <div
        className="tenant-bg-orb -z-10 h-64 w-64 bg-accent/25"
        style={{ bottom: "0%", right: "-8%", animation: "tenant-orb-2 16s ease-in-out infinite" }}
      />
      <div
        className="tenant-bg-orb -z-10 h-48 w-48 bg-primary/20"
        style={{ top: "40%", left: "50%", animation: "tenant-orb-3 12s ease-in-out infinite" }}
      />

      {/* Existing layout — same structure, restyled */}
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
        <div className="text-center">
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-2xl font-bold text-primary-foreground shadow-lg"
            style={{ animation: "tenant-logo-pulse 3s ease-in-out infinite" }}
          >
            R
          </div>
          <h1 className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            Tenant Portal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Rotich Management Systems</p>
        </div>

        <Card className="border-primary/15 bg-card/70 shadow-xl shadow-primary/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg">Welcome</CardTitle>
            <CardDescription>Sign in, link the unit you already rent, or apply for a vacant one.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild size="lg" className="shadow-lg shadow-primary/25 transition-transform active:scale-[0.98]">
              <Link to="/tenant/login">Sign in</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-primary/20 backdrop-blur-sm transition-transform active:scale-[0.98]"
            >
              <Link to="/tenant/claim">I already rent here — link my unit</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="transition-transform active:scale-[0.98]"
            >
              <Link to="/tenant/register">New tenant — apply for a vacant unit</Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
          <div className="flex flex-col items-center gap-1 rounded-xl border border-border/50 bg-card/40 p-2 backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-foreground">
            <Building2 className="h-5 w-5 text-primary/70" /> Pick your unit
          </div>
          <div className="flex flex-col items-center gap-1 rounded-xl border border-border/50 bg-card/40 p-2 backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-foreground">
            <ClipboardCheck className="h-5 w-5 text-primary/70" /> Sign lease
          </div>
          <div className="flex flex-col items-center gap-1 rounded-xl border border-border/50 bg-card/40 p-2 backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-foreground">
            <Wrench className="h-5 w-5 text-primary/70" /> Report issues
          </div>
        </div>
      </div>
    </div>
  );
}
