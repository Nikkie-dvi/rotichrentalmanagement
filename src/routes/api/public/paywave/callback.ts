import { createFileRoute } from "@tanstack/react-router";

// PayWave calls this after a landlord answers an M-Pesa prompt.
export const Route = createFileRoute("/api/public/paywave/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ok = () => Response.json({ status: "success" });
        const expected = process.env["PAYWAVE_WEBHOOK_TOKEN"];
        const t = new URL(request.url).searchParams.get("t");
        if (!expected || t !== expected) return new Response("Forbidden", { status: 403 });
        let body: any;
        try {
          body = await request.json();
        } catch {
          return ok();
        }
        const transactionId = body?.TransactionID;
        if (!transactionId) return ok();
        const { settlePaywavePayment } = await import("@/lib/paywave.server");
        await settlePaywavePayment({
          transactionRequestId: String(transactionId),
          success: Number(body.ResponseCode) === 0,
          resultDesc: String(body.ResponseDescription ?? ""),
          receipt: body.TransactionReceipt ? String(body.TransactionReceipt) : null,
        });
        return ok();
      },
    },
  },
});
