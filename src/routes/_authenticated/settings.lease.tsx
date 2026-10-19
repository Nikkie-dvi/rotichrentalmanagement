import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/lease")({
  head: () => ({ meta: [
    { title: "Lease template — Eden Point Real Estate" },
    { name: "description", content: "Manage lease template in My Account." },
    { property: "og:title", content: "Lease template — Eden Point Real Estate" },
    { property: "og:description", content: "Manage lease template in My Account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => { throw redirect({ to: "/settings/account", hash: "lease-template", replace: true }); },
});
