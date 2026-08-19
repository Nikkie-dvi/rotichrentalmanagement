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

/**
 * Creates a portal login for an existing tenant who never registered
 * themselves. The landlord hands over the email + password; the tenant can
 * change the password later from the portal.
 */
export const createTenantLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenantId: string; email: string; password: string }) => {
    const tenantId = (data?.tenantId ?? "").trim();
    const email = (data?.email ?? "").trim().toLowerCase();
    const password = data?.password ?? "";
    if (!tenantId) throw new Error("Missing tenant");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
    if (password.length < 8 || password.length > 72) throw new Error("Password must be 8–72 characters");
    return { tenantId, email, password };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, owner_id, auth_user_id, full_name")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (!tenant) throw new Error("Tenant not found");
    if (tenant.owner_id !== userId) throw new Error("Not allowed");
    if (tenant.auth_user_id) throw new Error("This tenant already has a login");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: "tenant", full_name: tenant.full_name },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Could not create that login");
    }

    const { error } = await supabaseAdmin
      .from("tenants")
      .update({ auth_user_id: created.data.user.id, email: data.email })
      .eq("id", tenant.id);
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(created.data.user.id);
      throw new Error(error.message);
    }

    return { ok: true, email: data.email };
  });
