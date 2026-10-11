// Daily cron endpoint: applies late-payment penalties to overdue invoices
// past their grace period and alerts tenants by SMS (SMS Leopard) + push.
import { createFileRoute } from "@tanstack/react-router";
import { assertCronCaller } from "@/lib/cron-guard.server";

export const Route = createFileRoute("/api/public/hooks/apply-late-penalties")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const denied = assertCronCaller(request);
        if (denied) return denied;
        try {
          const { runLatePenalties } = await import("@/lib/late-penalties.server");
          const result = await runLatePenalties();
          return Response.json(result);
        } catch (e: any) {
          console.error("late penalty run failed", e?.message);
          return Response.json({ ok: false, error: e?.message ?? "failed" }, { status: 500 });
        }
      },
    },
  },
});
