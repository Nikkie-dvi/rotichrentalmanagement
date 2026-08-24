import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyOnboardingStatus } from "@/lib/tenant.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Home,
  Loader2,
  Phone,
  RefreshCw,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/tenant/status")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My onboarding status — Tenant Portal" },
      {
        name: "description",
        content: "Check whether your tenant access request is approved, still pending, or was declined, and what to do next.",
      },
      { property: "og:title", content: "My onboarding status — Tenant Portal" },
      { property: "og:description", content: "Track your tenant access request and next steps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StatusPage,
});

function money(n: number) {
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

function StatusPage() {
  const navigate = useNavigate();
  const fetchStatus = useServerFn(getMyOnboardingStatus);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/tenant/login" });
      else setReady(true);
    });
  }, [navigate]);

  const query = useQuery({
    queryKey: ["tenant-onboarding-status"],
    queryFn: () => fetchStatus({}),
    enabled: ready,
    refetchInterval: 30_000,
  });

  const data = query.data;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background to-muted/40" />
      <div className="tenant-watermark -z-10" />
      <div className="mx-auto w-full max-w-lg p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button asChild variant="outline" size="sm" className="border-primary/30 bg-card shadow-sm">
            <Link to="/tenant">
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        <h1 className="mb-1 text-xl font-bold tracking-tight">My onboarding status</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          This page shows where your request is and exactly what happens next.
        </p>

        {query.isLoading && (
          <Card className="border-primary/15 bg-card/80 shadow-xl backdrop-blur-xl">
            <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your status…
            </CardContent>
          </Card>
        )}

        {query.isError && (
          <Card className="border-destructive/40 bg-card/80 shadow-xl backdrop-blur-xl">
            <CardContent className="py-6 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle className="h-4 w-4" /> Could not load your status
              </div>
              <p className="mt-1 text-muted-foreground">Check your connection and tap Refresh.</p>
            </CardContent>
          </Card>
        )}

        {data && !data.hasRecord && (
          <Card className="border-amber-500/40 bg-card/80 shadow-xl backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="h-4 w-4" /> No request found yet
              </CardTitle>
              <CardDescription>
                Your login isn't linked to any unit. Pick one of the options below to get started.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild>
                <Link to="/tenant/request-access">Request access to a unit</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/tenant/claim">I already rent here — link my unit</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {data?.hasRecord && (
          <Card className="border-primary/15 bg-card/80 shadow-xl backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {data.status === "approved"
                    ? "You're approved"
                    : data.status === "declined"
                      ? "Request declined"
                      : "Waiting for your landlord"}
                </CardTitle>
                <Badge
                  variant="outline"
                  className={
                    data.status === "approved"
                      ? "border-emerald-500/40 text-emerald-600"
                      : data.status === "declined"
                        ? "border-destructive/40 text-destructive"
                        : "border-amber-500/40 text-amber-600"
                  }
                >
                  {data.status === "approved" ? (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  ) : data.status === "declined" ? (
                    <XCircle className="mr-1 h-3 w-3" />
                  ) : (
                    <Clock className="mr-1 h-3 w-3" />
                  )}
                  <span className="capitalize">{data.status}</span>
                </Badge>
              </div>
              <CardDescription>
                {data.status === "approved"
                  ? "Your unit is linked. Open your dashboard to see rent, balance and payment instructions."
                  : data.status === "declined"
                    ? "Your landlord did not approve this request."
                    : "Your landlord has been notified and will review your request."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <Row label="Name" value={data.fullName} />
                <Row label="Phone" value={data.phone ?? "—"} />
                <Row label="Property" value={data.propertyName ?? "—"} />
                <Row label="Unit" value={data.unitNumber ? `Unit ${data.unitNumber}` : "Not assigned yet"} />
                <Row label="Rent" value={data.unitRent ? money(data.unitRent) : "—"} />
                <Row label="Landlord" value={data.landlordName ?? "—"} />
                {data.requestedAt && (
                  <Row label="Requested" value={new Date(data.requestedAt).toLocaleDateString()} />
                )}
              </div>

              {data.status === "declined" && data.declinedReason && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <div className="font-medium text-destructive">Reason given</div>
                  <p className="mt-1 text-muted-foreground">{data.declinedReason}</p>
                </div>
              )}

              <Separator />

              <div>
                <div className="mb-1 font-medium">What to do next</div>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {data.status === "pending" && (
                    <>
                      <li>Nothing to do — this page updates itself while you wait.</li>
                      <li>Make sure your phone number above is the one your landlord knows.</li>
                      {data.landlordPhone && <li>In a hurry? Call your landlord on {data.landlordPhone}.</li>}
                    </>
                  )}
                  {data.status === "approved" && (
                    <>
                      <li>Open your dashboard to see your balance and how to pay.</li>
                      <li>Report any maintenance issue straight from the dashboard.</li>
                    </>
                  )}
                  {data.status === "declined" && (
                    <>
                      <li>Talk to your landlord and fix whatever they flagged.</li>
                      <li>Then send a fresh request with the correct unit and phone number.</li>
                    </>
                  )}
                </ul>
              </div>

              <div className="grid gap-2">
                {data.status === "approved" && (
                  <Button asChild>
                    <Link to="/tenant/dashboard">Open my dashboard</Link>
                  </Button>
                )}
                {data.status === "declined" && (
                  <Button asChild>
                    <Link to="/tenant/request-access">Send a new request</Link>
                  </Button>
                )}
                {data.landlordPhone && (
                  <Button asChild variant="outline">
                    <a href={`tel:${data.landlordPhone}`}>
                      <Phone className="mr-2 h-4 w-4" /> Call landlord
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
