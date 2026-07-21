import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Mock STK simulator: flip a pending mpesa_transactions row to success or failed.
// In production, Safaricom calls a real callback URL that verifies the payload.
const schema = z.object({
  transaction_id: z.string().uuid(),
  outcome: z.enum(["success", "failed"]).default("success"),
});

export const Route = createFileRoute("/api/public/mpesa/simulate-callback")({
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
        if (!parsed.success) return json({ error: "Invalid input" }, 400);

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data: tx, error: fetchErr } = await supabase
          .from("mpesa_transactions")
          .select("*")
          .eq("id", parsed.data.transaction_id)
          .single();
        if (fetchErr || !tx) return json({ error: "Transaction not found" }, 404);

        if (parsed.data.outcome === "failed") {
          await supabase
            .from("mpesa_transactions")
            .update({
              status: "failed",
              result_desc: "The user cancelled the request.",
              updated_at: new Date().toISOString(),
            })
            .eq("id", tx.id);
          return json({ ok: true, status: "failed" });
        }

        const receipt = "M" + Math.random().toString(36).slice(2, 12).toUpperCase();
        await supabase
          .from("mpesa_transactions")
          .update({
            status: "success",
            mpesa_receipt_no: receipt,
            result_desc: "The service request is processed successfully.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.id);

        if (tx.tenant_id) {
          const { data: invoices } = await supabase
            .from("invoices")
            .select("id, balance_remaining")
            .eq("tenant_id", tx.tenant_id)
            .gt("balance_remaining", 0)
            .order("month_year", { ascending: true });

          let remaining = Number(tx.amount);
          let firstInvoiceId: string | null = null;
          for (const inv of invoices ?? []) {
            if (remaining <= 0) break;
            const applied = Math.min(remaining, Number(inv.balance_remaining));
            const newBalance = Number(inv.balance_remaining) - applied;
            const status = newBalance <= 0 ? "paid" : "partial";
            await supabase
              .from("invoices")
              .update({ balance_remaining: newBalance, status })
              .eq("id", inv.id);
            firstInvoiceId ??= inv.id;
            remaining -= applied;
          }

          await supabase.from("payments").insert({
            owner_id: (tx as any).owner_id,
            tenant_id: tx.tenant_id,
            invoice_id: firstInvoiceId,
            amount_paid: Number(tx.amount),
            payment_method: "mpesa",
            reference_no: receipt,
            mpesa_receipt_no: receipt,
            mpesa_status: "success",
            payment_date: new Date().toISOString().slice(0, 10),
          });
        }

        return json({ ok: true, status: "success", receipt });
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
