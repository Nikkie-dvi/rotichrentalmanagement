import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** After a payment is logged: push the landlord the recalculated balance. */
export const notifyPaymentLogged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; amount: number }) => {
    if (!d?.tenantId || !(Number(d.amount) > 0)) throw new Error("Invalid payment");
    return { tenantId: String(d.tenantId), amount: Number(d.amount) };
  })
  .handler(async ({ data, context }) => {
    // RLS: caller must be able to see this tenant.
    const { data: t } = await context.supabase.from("tenants").select("id").eq("id", data.tenantId).maybeSingle();
    if (!t) throw new Error("Tenant not found");
    const { notifyLandlordOfPayment } = await import("./invoice-notify.server");
    return notifyLandlordOfPayment(data);
  });
