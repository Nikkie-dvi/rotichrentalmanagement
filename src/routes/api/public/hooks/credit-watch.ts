import { createFileRoute } from "@tanstack/react-router";

// Daily cron endpoint: checks every landlord's tenants for credit that appeared,
// was applied to a new invoice, or has sat unused past the expiry window, and
// alerts the landlord about each change.
export const Route = createFileRoute("/api/public/hooks/credit-watch")({
  server: {
    handlers: {
      POST: async () => {
        const { scanAllCredits } = await import("@/lib/credit.server");
        const { auditAllLedgers } = await import("@/lib/ledger-audit.server");
        try {
          const res = await scanAllCredits();
          const audit = await auditAllLedgers();
          return new Response(JSON.stringify({ ok: true, ...res, audit }), {
            headers: { "content-type": "application/json" },
          });

        } catch (err: any) {
          return new Response(JSON.stringify({ error: err?.message ?? "failed" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
