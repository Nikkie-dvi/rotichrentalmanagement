import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notify, wasReminded, markReminded } from "@/lib/notifications";

// Checks for tenants whose rent_due_day falls within the next 3 days
// (or is today) and raises an in-app toast + browser notification once
// per tenant per calendar day.
export function useRentReminders() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, full_name, rent_due_day, active, units(rent_amount)")
        .eq("active", true);
      if (cancelled || !tenants) return;

      const today = new Date();
      const todayDay = today.getDate();
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const dateKey = today.toISOString().slice(0, 10);

      for (const t of tenants as any[]) {
        const due: number | null = t.rent_due_day;
        if (!due) continue;
        // Effective due day (cap to last day of month for Feb etc.)
        const effectiveDue = Math.min(due, lastDayOfMonth);
        const diff = effectiveDue - todayDay;
        if (diff < 0 || diff > 3) continue;
        if (wasReminded(t.id, dateKey)) continue;

        const when =
          diff === 0 ? "today" : diff === 1 ? "tomorrow" : `in ${diff} days`;
        const title = diff === 0 ? "Rent due today" : "Upcoming rent";
        const body = `${t.full_name} — rent due ${when} (day ${effectiveDue}).`;

        toast(title, { description: body });
        notify({ title, body, tag: `rent-${t.id}-${dateKey}` });
        markReminded(t.id, dateKey);
      }
    };

    run();
    const iv = setInterval(run, 60 * 60 * 1000); // hourly re-check
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);
}
