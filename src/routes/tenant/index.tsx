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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-2xl font-bold text-white shadow-lg">R</div>
        <h1 className="text-2xl font-bold">Tenant Portal</h1>
        <p className="mt-1 text-sm text-muted-foreground">Rotich Management Systems</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Welcome</CardTitle>
          <CardDescription>Sign in to your unit, or register as a new tenant.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button asChild size="lg">
            <Link to="/tenant/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/tenant/register">Register as new tenant</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
        <div className="flex flex-col items-center gap-1"><Building2 className="h-5 w-5" /> Pick your unit</div>
        <div className="flex flex-col items-center gap-1"><ClipboardCheck className="h-5 w-5" /> Sign lease</div>
        <div className="flex flex-col items-center gap-1"><Wrench className="h-5 w-5" /> Report issues</div>
      </div>
    </div>
  );
}
