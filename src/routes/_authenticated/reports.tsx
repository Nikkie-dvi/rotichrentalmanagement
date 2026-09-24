import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/reports")({
  beforeLoad: () => {
    throw redirect({ to: "/performance", hash: "reports", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Portfolio Performance & Reports — Rotich Management Systems" },
      { name: "description", content: "Portfolio performance, monthly reports, downloads and property statements in one workspace." },
      { property: "og:title", content: "Portfolio Performance & Reports — Rotich Management Systems" },
      { property: "og:description", content: "Review rental performance and download monthly portfolio records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
