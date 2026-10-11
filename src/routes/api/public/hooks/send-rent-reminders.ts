// Daily cron endpoint: reminds tenants X days before rent is due and
// follows up Y days after the due date when payment hasn't arrived.
import { createFileRoute } from "@tanstack/react-router";
import { assertCronCaller } from "@/lib/cron-guard.server";

export const Route = createFileRoute("/api/public/hooks/send-rent-reminders")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const denied = assertCronCaller(request);
        if (denied) return denied;
        try {
          const { runRentReminders } = await import("@/lib/rent-reminders.server");
          return Response.json(await runRentReminders());
        } catch (e: any) {
          console.error("rent reminder run failed", e?.message);
          return Response.json({ ok: false, error: e?.message ?? "failed" }, { status: 500 });
        }
      },
    },
  },
});
