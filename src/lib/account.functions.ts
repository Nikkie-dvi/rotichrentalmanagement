// Account admin helpers: let a landlord (or the main account) reset a tenant's
// password when the tenant is locked out.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const resetTenantPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenantId: string; newPassword: string }) => {
    const tenantId = (data?.tenantId ?? "").trim();
    const newPassword = data?.newPassword ?? "";
    if (!tenantId) throw new Error("Missing tenant");
    if (newPassword.length < 8 || newPassword.length > 72) {
      throw new Error("Password must be 8–72 characters");
    }
    return { tenantId, newPassword };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Caller must own this tenant, or be the main account.
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, owner_id, auth_user_id, full_name, email")
      .eq("id", data.tenantId)
      .maybeSingle();

    const { data: admin } = await supabase
      .from("super_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!tenant && !admin) throw new Error("Tenant not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let target = tenant;
    if (!target && admin) {
      const { data: adminTenant } = await supabaseAdmin
        .from("tenants")
        .select("id, owner_id, auth_user_id, full_name, email")
        .eq("id", data.tenantId)
        .maybeSingle();
      target = adminTenant as typeof tenant;
    }
    if (!target) throw new Error("Tenant not found");
    if (!admin && target.owner_id !== userId) throw new Error("Not allowed");
    if (!target.auth_user_id) throw new Error("This tenant has no portal login yet");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(target.auth_user_id, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);

    return { ok: true, email: (target.email as string) ?? null };
  });
