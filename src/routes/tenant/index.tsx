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
    <div className="min-h-screen w-full overflow-x-hidden bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-4 py-16">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-primary text-xl font-bold text-primary-foreground">
            R
          </div>
          <h1 className="text-2xl font-bold">
            Tenant Portal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Rotich Management Systems</p>
        </div>

        <Card className="overflow-hidden border-primary/20 border-t-4 border-t-primary">
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
              variant="outline"
              size="lg"
              className="border-primary/20 backdrop-blur-sm transition-transform active:scale-[0.98]"
            >
              <Link to="/tenant/request-access">New tenant — request access</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="transition-transform active:scale-[0.98]"
            >
              <Link to="/tenant/register">Apply for a vacant unit &amp; sign lease</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to="/tenant/status">Check my onboarding status</Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 divide-x rounded-md border bg-card text-center text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-col items-center gap-1 p-3">
            <Building2 className="h-5 w-5 text-primary/70" /> Pick your unit
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1 p-3">
            <ClipboardCheck className="h-5 w-5 text-primary/70" /> Sign lease
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1 p-3">
            <Wrench className="h-5 w-5 text-primary/70" /> Report issues
          </div>
        </div>
      </div>
    </div>
  );
}
