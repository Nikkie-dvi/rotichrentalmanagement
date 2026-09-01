import { createFileRoute } from "@tanstack/react-router";

// Daily reconciliation cron endpoint. pg_cron calls this every day at 00:05 UTC.
// For every landlord that has the daily job switched on it:
//   1. raises this month's invoices only for tenants whose rent due day has arrived,
//   2. offsets each one against credit already paid ahead,
//   3. deletes past invoices that should never have existed, and
//   4. re-checks every open balance so paid-up tenants never show as owing.
// Landlords who switch "Daily automatic invoicing & clean-up" off are skipped.
export const Route = createFileRoute("/api/public/hooks/generate-monthly-invoices")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const {
            generateMonthlyInvoices,
            reconcileInvoiceBalances,
            findIncorrectInvoices,
            removeInvoices,
          } = await import("@/lib/invoicing.server");

          const month = new Date().toISOString().slice(0, 7);
          const { data: owners } = await supabaseAdmin.from("tenants").select("owner_id").eq("active", true);
          const ids = Array.from(new Set(((owners ?? []) as any[]).map((o) => o.owner_id).filter(Boolean)));

          const { data: settings } = await supabaseAdmin
            .from("billing_settings")
            .select("owner_id, auto_reconcile_enabled");
          const disabled = new Set(
            ((settings ?? []) as any[]).filter((s) => s.auto_reconcile_enabled === false).map((s) => s.owner_id),
          );

          let created = 0;
          let creditApplied = 0;
          let reconciled = 0;
          let removed = 0;
          let skipped = 0;
          for (const ownerId of ids) {
            if (disabled.has(ownerId)) {
              skipped++;
              continue;
            }
            // Rent and services are billed on separate invoices.
            const rentRes = await generateMonthlyInvoices(ownerId, month, "rent");
            const svcRes = await generateMonthlyInvoices(ownerId, month, "service");
            created += rentRes.created + svcRes.created;
            creditApplied += rentRes.creditApplied + svcRes.creditApplied;


            const bad = await findIncorrectInvoices(ownerId);
            if (bad.length) {
              const cleanup = await removeInvoices(
                ownerId,
                bad.map((b) => b.id),
              );
              removed += cleanup.removed;
            }

            reconciled += (await reconcileInvoiceBalances(ownerId)).fixed;
          }

          return new Response(
            JSON.stringify({
              ok: true,
              month,
              owners: ids.length,
              skipped,
              generated: created,
              creditApplied,
              removed,
              reconciled,
            }),
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
