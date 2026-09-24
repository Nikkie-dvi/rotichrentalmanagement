import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTenantWelcomeNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenantId: string }) => {
    const tenantId = data?.tenantId?.trim();
    if (!tenantId) throw new Error("Tenant is required");
    return { tenantId };
  })
  .handler(async ({ data, context }) => {
    const { data: tenant } = await context.supabase
      .from("tenants")
      .select("id")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (!tenant) throw new Error("Tenant not found or access denied");

    const { sendTenantWelcome } = await import("@/lib/welcome.server");
    return sendTenantWelcome(data.tenantId);
  });