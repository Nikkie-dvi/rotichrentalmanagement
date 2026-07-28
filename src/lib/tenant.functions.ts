// Server functions for the Tenant Portal.
// - getVacantUnits: public read of vacant units for the registration picker.
// - registerTenantProfile: after supabase signUp, creates the tenants row with
//   the correct landlord owner_id derived from the picked unit.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getVacantUnits = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("units")
    .select("id, unit_number, rent_amount, property_id, properties(name, location)")
    .eq("status", "vacant")
    .order("unit_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((u: any) => ({
    id: u.id as string,
    unit_number: u.unit_number as string,
    rent_amount: Number(u.rent_amount) || 0,
    property_name: (u.properties?.name as string) ?? null,
    property_location: (u.properties?.location as string) ?? null,
  }));
});

export const registerTenantProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    fullName: string;
    phone: string;
    email: string;
    unitId: string;
  }) => {
    const fullName = data?.fullName?.trim();
    const phone = data?.phone?.trim();
    const email = data?.email?.trim().toLowerCase();
    const unitId = data?.unitId?.trim();
    if (!fullName || fullName.length > 100) throw new Error("Invalid name");
    if (!phone || phone.length > 32) throw new Error("Invalid phone number");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid email");
    if (!unitId) throw new Error("Please pick a unit");
    return { fullName, phone, email, unitId };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reuse an existing profile for this auth user (rerun of signup)
    const { data: existing } = await supabaseAdmin
      .from("tenants")
      .select("id, unit_id, active")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (existing) {
      return { tenantId: existing.id as string, alreadyExists: true };
    }

    // Find unit + landlord owner_id
    const { data: unit, error: uErr } = await supabaseAdmin
      .from("units")
      .select("id, owner_id, status")
      .eq("id", data.unitId)
      .single();
    if (uErr || !unit) throw new Error("Selected unit not found");
    if (unit.status !== "vacant") throw new Error("That unit is no longer vacant");

    const { data: inserted, error: iErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        owner_id: unit.owner_id,
        unit_id: unit.id,
        full_name: data.fullName,
        phone_number: data.phone,
        email: data.email,
        auth_user_id: context.userId,
        active: false,
        deposit_paid: 0,
      })
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);
    return { tenantId: inserted.id as string, alreadyExists: false };
  });
