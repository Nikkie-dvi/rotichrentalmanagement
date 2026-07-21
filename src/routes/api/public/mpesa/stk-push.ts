import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Mock M-Pesa STK Push endpoint.
// In production, this would call Safaricom Daraja API STK Push.
// For now, we create a pending mpesa_transactions row and let the client poll.
const schema = z.object({
  tenant_id: z.string().uuid().nullable().optional(),
  invoice_id: z.string().uuid().nullable().optional(),
  phone_number: z.string().min(9).max(20),
  amount: z.number().positive(),
});

export const Route = createFileRoute("/api/public/mpesa/stk-push")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        }),
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          return json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const raw = parsed.data.phone_number.replace(/\D/g, "");
        const phone = raw.startsWith("254")
          ? raw
          : raw.startsWith("0")
            ? "254" + raw.slice(1)
            : raw.startsWith("7") || raw.startsWith("1")
              ? "254" + raw
              : raw;

        const checkoutRequestId = "ws_CO_" + Math.random().toString(36).slice(2, 12).toUpperCase();
        const merchantRequestId = "MR_" + Math.random().toString(36).slice(2, 10).toUpperCase();

        const { data, error } = await supabase
          .from("mpesa_transactions")
          .insert({
            tenant_id: parsed.data.tenant_id ?? null,
            invoice_id: parsed.data.invoice_id ?? null,
            phone_number: phone,
            amount: parsed.data.amount,
            checkout_request_id: checkoutRequestId,
            merchant_request_id: merchantRequestId,
            status: "pending",
            result_desc: "STK Push initiated (mock). Awaiting PIN entry.",
          })
          .select()
          .single();

        if (error) return json({ error: error.message }, 500);

        // TODO(daraja): once credentials are added, POST to
        // https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest here
        // with the OAuth token, BusinessShortCode, Password, Timestamp, etc.

        return json({
          ok: true,
          mock: true,
          transaction_id: data.id,
          checkout_request_id: checkoutRequestId,
          message: "STK Push sent. Enter M-Pesa PIN on your phone.",
        });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}
