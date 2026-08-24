import { createFileRoute } from "@tanstack/react-router";

// Daily cron endpoint. pg_cron calls this every day at 00:05 UTC.
// For every landlord it raises this month's invoices for tenants whose rent due
// day has arrived, offsets each one against credit already paid ahead, then
// re-checks every open balance so paid-up tenants never show as owing.
export const Route = createFileRoute("/api/public/hooks/generate-monthly-invoices")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { generateMonthlyInvoices, reconcileInvoiceBalances } = await import("@/lib/invoicing.server");

          const month = new Date().toISOString().slice(0, 7);
          const { data: owners } = await supabaseAdmin.from("tenants").select("owner_id").eq("active", true);
          const ids = Array.from(new Set(((owners ?? []) as any[]).map((o) => o.owner_id).filter(Boolean)));

          let created = 0;
          let creditApplied = 0;
          let reconciled = 0;
          for (const ownerId of ids) {
            const res = await generateMonthlyInvoices(ownerId, month);
            created += res.created;
            creditApplied += res.creditApplied;
            reconciled += (await reconcileInvoiceBalances(ownerId)).fixed;
          }

          return new Response(
            JSON.stringify({ ok: true, month, owners: ids.length, generated: created, creditApplied, reconciled }),
            { headers: { "content-type": "application/json" } },
          );
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
