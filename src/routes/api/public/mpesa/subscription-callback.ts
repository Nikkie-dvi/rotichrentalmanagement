import { createFileRoute } from "@tanstack/react-router";

// Safaricom calls this after a landlord answers the subscription payment prompt.
export const Route = createFileRoute("/api/public/mpesa/subscription-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ok = () => Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
        const expected = process.env["MPESA_CALLBACK_TOKEN"];
        const t = new URL(request.url).searchParams.get("t");
        if (!expected || t !== expected) return new Response("Forbidden", { status: 403 });
        let body: any;
        try {
          body = await request.json();
        } catch {
          return ok();
        }
        const cb = body?.Body?.stkCallback;
        if (!cb?.CheckoutRequestID) return ok();
        const items: { Name: string; Value?: unknown }[] = cb.CallbackMetadata?.Item ?? [];
        const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
        const { settleSubscriptionStk } = await import("@/lib/daraja.server");
        await settleSubscriptionStk({
          checkoutRequestId: String(cb.CheckoutRequestID),
          resultCode: Number(cb.ResultCode),
          resultDesc: String(cb.ResultDesc ?? ""),
          receipt: receipt ? String(receipt) : null,
        });
        return ok();
      },
    },
  },
});
