// Server functions for the Tenant Portal.
// - getVacantUnits: public read of vacant units for the registration picker.
// - registerTenantProfile: after supabase signUp, creates the tenants row with
//   the correct landlord owner_id derived from the picked unit.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getVacantUnits = createServerFn({ method: "GET" })
  .inputValidator((data: { code: string }) => {
    const code = (data?.code ?? "").trim();
    if (!/^\d{4}$/.test(code)) throw new Error("Enter the 4-digit landlord code");
    return { code };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: landlord } = await supabaseAdmin
      .from("landlord_accounts")
      .select("user_id, full_name")
      .eq("landlord_code", data.code)
      .maybeSingle();
    if (!landlord) throw new Error("No landlord found with that code");

    const { data: units, error } = await supabaseAdmin
      .from("units")
      .select("id, unit_number, rent_amount, unit_type, property_id, properties(name, location)")
      .eq("status", "vacant")
      .eq("owner_id", landlord.user_id)
      .order("unit_number", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      landlordName: (landlord.full_name as string) ?? null,
      units: (units ?? []).map((u: any) => ({
        id: u.id as string,
        unit_number: u.unit_number as string,
        rent_amount: Number(u.rent_amount) || 0,
        unit_type: (u.unit_type as string) ?? "other",
        property_name: (u.properties?.name as string) ?? null,
        property_location: (u.properties?.location as string) ?? null,
      })),
    };
  });


export const submitTenantApplication = createServerFn({ method: "POST" })
  .inputValidator((data: {
    authUserId: string;
    fullName: string;
    phone: string;
    email: string;
    unitId: string;
    leaseSignature: string;
  }) => {
    const authUserId = data?.authUserId?.trim();
    const fullName = data?.fullName?.trim();
    const phone = data?.phone?.trim();
    const email = data?.email?.trim().toLowerCase();
    const unitId = data?.unitId?.trim();
    const leaseSignature = (data?.leaseSignature ?? "").slice(0, 500_000);
    if (!authUserId) throw new Error("Missing auth user");
    if (!fullName || fullName.length > 100) throw new Error("Invalid name");
    if (!phone || phone.length > 32) throw new Error("Invalid phone number");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid email");
    if (!unitId) throw new Error("Please pick a unit");
    if (!leaseSignature) throw new Error("Signature required");
    return { authUserId, fullName, phone, email, unitId, leaseSignature };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify the auth user actually exists (prevents spoofing arbitrary IDs).
    const { data: userLookup, error: userErr } = await supabaseAdmin.auth.admin.getUserById(data.authUserId);
    if (userErr || !userLookup?.user) throw new Error("Auth user not found");
    if ((userLookup.user.email ?? "").toLowerCase() !== data.email) {
      throw new Error("Email does not match account");
    }

    // Reuse an existing profile for this auth user (rerun of signup)
    const { data: existing } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("auth_user_id", data.authUserId)
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
        auth_user_id: data.authUserId,
        active: false,
        deposit_paid: 0,
        approval_status: "pending",
        lease_signature: data.leaseSignature,
        lease_signed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);
    return { tenantId: inserted.id as string, alreadyExists: false };
  });


/** Payment instructions + notice the tenant's landlord set for them. */
export const getMyLandlordInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: tenant } = await supabase
      .from("tenants")
      .select("owner_id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!tenant?.owner_id) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: landlord } = await supabaseAdmin
      .from("landlord_accounts")
      .select("full_name, phone, rent_payment_number, rent_payment_method, rent_payment_note")
      .eq("user_id", tenant.owner_id)
      .maybeSingle();
    if (!landlord) return null;
    return {
      landlordName: (landlord.full_name as string) ?? null,
      landlordPhone: (landlord.phone as string) ?? null,
      paymentNumber: (landlord.rent_payment_number as string) ?? null,
      paymentMethod: (landlord.rent_payment_method as string) ?? "mpesa_send_money",
      note: (landlord.rent_payment_note as string) ?? null,
    };
  });
