import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Daily cron endpoint. pg_cron calls this every day at 00:05 UTC.
// Generates an invoice for each active tenant whose rent_due_day matches
// the current day of month, unless one already exists for that month.
export const Route = createFileRoute("/api/public/hooks/generate-monthly-invoices")({
  server: {
    handlers: {
      POST: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const today = new Date();
        const day = today.getDate();
        const month = today.toISOString().slice(0, 7);
        const start = `${month}-01`;
        const [y, m] = month.split("-").map(Number);
        const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

        const { data: tenants, error: tErr } = await supabase
          .from("tenants")
          .select("id, owner_id, rent_due_day, units(rent_amount)")
          .eq("active", true)
          .eq("rent_due_day", day);

        if (tErr) {
          return new Response(JSON.stringify({ error: tErr.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        let created = 0;
        for (const t of tenants ?? []) {
          const rent = Number((t as any).units?.rent_amount ?? 0);
          const { data: readings } = await supabase
            .from("utility_readings")
            .select("total_amount")
            .eq("tenant_id", (t as any).id)
            .gte("reading_date", start)
            .lt("reading_date", end);
          const util = (readings ?? []).reduce(
            (s: number, r: any) => s + Number(r.total_amount),
            0,
          );
          const total = rent + util;

          // Carry forward any overpayment credit from previous months.
          const [{ data: prevInv }, { data: prevPay }] = await Promise.all([
            supabase.from("invoices").select("total_due").eq("tenant_id", (t as any).id),
            supabase.from("payments").select("amount_paid").eq("tenant_id", (t as any).id),
          ]);
          const invoiced = (prevInv ?? []).reduce((s: number, r: any) => s + Number(r.total_due), 0);
          const paid = (prevPay ?? []).reduce((s: number, r: any) => s + Number(r.amount_paid), 0);
          const credit = Math.max(0, paid - invoiced);
          const balance = Math.max(0, total - credit);

          const { error } = await supabase.from("invoices").upsert(
            {
              tenant_id: (t as any).id,
              owner_id: (t as any).owner_id,
              month_year: month,
              base_rent: rent,
              utility_amount: util,
              total_due: total,
              balance_remaining: balance,
              status: balance === 0 ? "paid" : balance < total ? "partial" : "unpaid",
            },
            { onConflict: "tenant_id,month_year" },
          );
          if (!error) created++;
        }

        return new Response(
          JSON.stringify({ ok: true, day, month, generated: created }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
