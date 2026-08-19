// Property manager accounts: a landlord creates logins for the people who help
// them run the properties. Managers get read access to that landlord's data.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function checkPassword(pw: string) {
  if (!pw || pw.length < 8 || pw.length > 72) throw new Error("Password must be 8–72 characters");
  return pw;
}

function checkEmail(raw: string) {
  const email = (raw ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  return email;
}

/** Creates a login for a property manager working for the signed-in landlord. */
export const createPropertyManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string; password: string; fullName?: string; phone?: string }) => ({
    email: checkEmail(data?.email ?? ""),
    password: checkPassword(data?.password ?? ""),
    fullName: (data?.fullName ?? "").trim() || null,
    phone: (data?.phone ?? "").trim() || null,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: account } = await supabase
      .from("landlord_accounts")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!account) throw new Error("Only landlord accounts can add property managers");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: "property_manager", full_name: data.fullName },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Could not create that login");
    }

    const { error } = await supabaseAdmin.from("property_managers").insert({
      landlord_user_id: userId,
      manager_user_id: created.data.user.id,
      email: data.email,
      full_name: data.fullName,
      phone: data.phone,
    });
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(created.data.user.id);
      throw new Error(error.message);
    }

    return { ok: true, email: data.email };
  });

/** Sets a new password for one of the landlord's property managers. */
export const resetManagerPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { managerId: string; newPassword: string }) => ({
    managerId: (data?.managerId ?? "").trim(),
    newPassword: checkPassword(data?.newPassword ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("property_managers")
      .select("id, landlord_user_id, manager_user_id, email")
      .eq("id", data.managerId)
      .maybeSingle();
    if (!row || row.landlord_user_id !== userId) throw new Error("Manager not found");
    if (!row.manager_user_id) throw new Error("This manager has no login yet");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(row.manager_user_id, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true, email: row.email as string };
  });

/** Removes a manager's access and deletes their login. */
export const removePropertyManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { managerId: string }) => ({ managerId: (data?.managerId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("property_managers")
      .select("id, landlord_user_id, manager_user_id")
      .eq("id", data.managerId)
      .maybeSingle();
    if (!row || row.landlord_user_id !== userId) throw new Error("Manager not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("property_managers").delete().eq("id", row.id);
    if (row.manager_user_id) {
      await supabaseAdmin.auth.admin.deleteUser(row.manager_user_id as string);
    }
    return { ok: true };
  });
