import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/billing")({
  head: () => ({ meta: [
    { title: "Billing settings — Rotich Rental Management" },
    { name: "description", content: "Manage billing settings in My Account." },
    { property: "og:title", content: "Billing settings — Rotich Rental Management" },
    { property: "og:description", content: "Manage billing settings in My Account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => { throw redirect({ to: "/settings/account", hash: "late-fees", replace: true }); },
});
