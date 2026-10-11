// Cron endpoint (every 10 min): welcomes new tenants/landlords and sends
// the monthly landlord check-in. Idempotent — safe to call repeatedly.
import { createFileRoute } from "@tanstack/react-router";
import { assertCronCaller } from "@/lib/cron-guard.server";

export const Route = createFileRoute("/api/public/hooks/welcome-sweep")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const denied = assertCronCaller(request);
        if (denied) return denied;
        try {
          const { runWelcomeSweep } = await import("@/lib/welcome.server");
          return Response.json(await runWelcomeSweep());
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "failed" }, { status: 500 });
        }
      },
    },
  },
});
