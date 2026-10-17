// Daily cron endpoint. Push alerts were removed from the app, so this endpoint
// is kept only to answer the scheduler with a no-op success.
import { createFileRoute } from "@tanstack/react-router";
import { assertCronCaller } from "@/lib/cron-guard.server";

export const Route = createFileRoute("/api/public/hooks/send-push-reminders")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const denied = assertCronCaller(request);
        if (denied) return denied;
        return Response.json({ ok: true, disabled: true, sent: 0 });
      },
    },
  },
});
