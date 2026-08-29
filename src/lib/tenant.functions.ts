// Server functions for the Tenant Portal.
// - getVacantUnits: public read of vacant units for the registration picker.
// - registerTenantProfile: after supabase signUp, creates the tenants row with
//   the correct landlord owner_id derived from the picked unit.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveLeaseTemplate } from "@/lib/lease-template";

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
      .select("user_id, full_name, lease_landlord_name, lease_intro, lease_clauses, lease_footer")
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
      leaseTemplate: resolveLeaseTemplate(landlord as any),
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
    // Alert the landlord (and their active managers) instantly on their phones.
    try {
      const { pushToUsers, landlordAudience } = await import("@/lib/push.server");
      await pushToUsers(await landlordAudience(unit.owner_id as string), {
        title: "New tenant application",
        body: `${data.fullName} applied for a unit and signed the lease. Review and approve.`,
        url: "/applications",
        tag: `application-${inserted.id}`,
      });
    } catch {
      /* never block signup on notifications */
    }

    return { tenantId: inserted.id as string, alreadyExists: false };
  });


/** Payment instructions + notice the tenant's landlord set for them. */
export const getMyLandlordInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: tenant } = await supabase
      .from("tenants")
      .select("owner_id, signed_lease_path, signed_lease_name, signed_lease_uploaded_at")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!tenant?.owner_id) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: landlord } = await supabaseAdmin
      .from("landlord_accounts")
      .select(
        "full_name, phone, rent_payment_number, rent_payment_method, rent_payment_note, lease_landlord_name, lease_intro, lease_clauses, lease_footer, lease_document_path, lease_document_name, lease_document_uploaded_at",
      )
      .eq("user_id", tenant.owner_id)
      .maybeSingle();
    if (!landlord) return null;

    // Signed link to the landlord's uploaded lease copy (private bucket).
    let leaseDocumentUrl: string | null = null;
    const path = (landlord as any).lease_document_path as string | null;
    if (path) {
      const { data: signed } = await supabaseAdmin.storage
        .from("lease-documents")
        .createSignedUrl(path, 60 * 60);
      leaseDocumentUrl = signed?.signedUrl ?? null;
    }

    // The tenant's own signed hard copy, uploaded by the landlord.
    let mySignedLeaseUrl: string | null = null;
    const myPath = (tenant as any).signed_lease_path as string | null;
    if (myPath) {
      const { data: signedMine } = await supabaseAdmin.storage
        .from("lease-documents")
        .createSignedUrl(myPath, 60 * 60);
      mySignedLeaseUrl = signedMine?.signedUrl ?? null;
    }

    return {
      mySignedLeaseUrl,
      mySignedLeaseName: ((tenant as any).signed_lease_name as string) ?? null,
      mySignedLeaseUploadedAt: ((tenant as any).signed_lease_uploaded_at as string) ?? null,
      leaseDocumentUrl,
      leaseDocumentName: ((landlord as any).lease_document_name as string) ?? null,
      leaseDocumentUploadedAt: ((landlord as any).lease_document_uploaded_at as string) ?? null,
      landlordName: (landlord.full_name as string) ?? null,
      landlordPhone: (landlord.phone as string) ?? null,
      paymentNumber: (landlord.rent_payment_number as string) ?? null,
      paymentMethod: (landlord.rent_payment_method as string) ?? "mpesa_send_money",
      note: (landlord.rent_payment_note as string) ?? null,
      leaseTemplate: resolveLeaseTemplate(landlord as any),
    };
  });


/**
 * Onboarding path for tenants who ALREADY live in a unit the landlord added
 * manually: they look themselves up with the landlord's 4-digit code + the
 * phone number on file, then claim that record as their login.
 */
async function phoneVariants(raw: string) {
  const { toKenyanMsisdn } = await import("@/lib/sms.server");
  const msisdn = toKenyanMsisdn(raw);
  const list = [raw.trim()];
  if (msisdn) list.push(msisdn, `+${msisdn}`, `0${msisdn.slice(3)}`);
  return Array.from(new Set(list));
}

export const findMyTenantRecord = createServerFn({ method: "GET" })
  .inputValidator((data: { code: string; phone: string }) => {
    const code = (data?.code ?? "").trim();
    const phone = (data?.phone ?? "").trim();
    if (!/^\d{4}$/.test(code)) throw new Error("Enter the 4-digit landlord code");
    if (!phone) throw new Error("Enter your phone number");
    return { code, phone };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: landlord } = await supabaseAdmin
      .from("landlord_accounts")
      .select("user_id, full_name")
      .eq("landlord_code", data.code)
      .maybeSingle();
    if (!landlord) throw new Error("No landlord found with that code");

    const { data: rows } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, full_name, auth_user_id, unit_id, approval_status, declined_reason, rent_due_day, units(unit_number, rent_amount, properties(name, location))",
      )
      .eq("owner_id", landlord.user_id as string)
      .in("phone_number", await phoneVariants(data.phone))
      .limit(1);

    const row = rows?.[0] as any;
    if (!row) {
      return {
        found: false as const,
        landlordName: (landlord.full_name as string) ?? null,
      };
    }
    return {
      found: true as const,
      landlordName: (landlord.full_name as string) ?? null,
      fullName: row.full_name as string,
      unitNumber: (row.units?.unit_number as string) ?? null,
      unitRent: Number(row.units?.rent_amount ?? 0) || 0,
      propertyName: (row.units?.properties?.name as string) ?? null,
      propertyLocation: (row.units?.properties?.location as string) ?? null,
      rentDueDay: (row.rent_due_day as number) ?? null,
      approvalStatus: ((row.approval_status as string) ?? "approved") as "pending" | "approved" | "declined",
      declinedReason: (row.declined_reason as string) ?? null,
      alreadyLinked: Boolean(row.auth_user_id),
    };
  });


export const claimTenantAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { authUserId: string; email: string; code: string; phone: string }) => {
    const authUserId = (data?.authUserId ?? "").trim();
    const email = (data?.email ?? "").trim().toLowerCase();
    const code = (data?.code ?? "").trim();
    const phone = (data?.phone ?? "").trim();
    if (!authUserId) throw new Error("Missing auth user");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid email");
    if (!/^\d{4}$/.test(code)) throw new Error("Enter the 4-digit landlord code");
    if (!phone) throw new Error("Enter your phone number");
    return { authUserId, email, code, phone };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userLookup, error: userErr } = await supabaseAdmin.auth.admin.getUserById(data.authUserId);
    if (userErr || !userLookup?.user) throw new Error("Auth user not found");
    if ((userLookup.user.email ?? "").toLowerCase() !== data.email) {
      throw new Error("Email does not match account");
    }

    const { data: landlord } = await supabaseAdmin
      .from("landlord_accounts")
      .select("user_id")
      .eq("landlord_code", data.code)
      .maybeSingle();
    if (!landlord) throw new Error("No landlord found with that code");

    const { data: rows } = await supabaseAdmin
      .from("tenants")
      .select("id, auth_user_id, full_name, owner_id")
      .eq("owner_id", landlord.user_id as string)
      .in("phone_number", await phoneVariants(data.phone))
      .limit(1);
    const row = rows?.[0] as any;
    if (!row) throw new Error("Your landlord has no tenant with that phone number. Ask them to add you first.");
    if (row.auth_user_id && row.auth_user_id !== data.authUserId) {
      throw new Error("This tenant record already has a login. Sign in with that account instead.");
    }

    const { error: upErr } = await supabaseAdmin
      .from("tenants")
      .update({ auth_user_id: data.authUserId, email: data.email })
      .eq("id", row.id as string);
    if (upErr) throw new Error(upErr.message);

    try {
      const { pushToUsers, landlordAudience } = await import("@/lib/push.server");
      await pushToUsers(await landlordAudience(row.owner_id as string), {
        title: "Tenant joined the portal",
        body: `${row.full_name} created a login and linked it to their unit.`,
        url: "/tenants",
        tag: `tenant-claim-${row.id}`,
      });
    } catch {
      /* never block onboarding on notifications */
    }

    return { tenantId: row.id as string };
  });

/**
 * Units a landlord has, for the "Request access" flow. Public read (by code)
 * with only non-sensitive columns projected.
 */
export const getLandlordUnitsForRequest = createServerFn({ method: "GET" })
  .inputValidator((data: { code: string }) => {
    const code = (data?.code ?? "").trim();
    if (!/^\d{4}$/.test(code)) throw new Error("Enter the 4-digit landlord code");
    return { code };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: landlord } = await supabaseAdmin
      .from("landlord_accounts")
      .select("user_id, full_name, phone")
      .eq("landlord_code", data.code)
      .maybeSingle();
    if (!landlord) throw new Error("No landlord found with that code");

    const { data: units, error } = await supabaseAdmin
      .from("units")
      .select("id, unit_number, rent_amount, unit_type, status, properties(name, location)")
      .eq("owner_id", landlord.user_id as string)
      .order("unit_number", { ascending: true });
    if (error) throw new Error(error.message);

    return {
      landlordName: (landlord.full_name as string) ?? null,
      landlordPhone: (landlord.phone as string) ?? null,
      units: (units ?? []).map((u: any) => ({
        id: u.id as string,
        unit_number: u.unit_number as string,
        rent_amount: Number(u.rent_amount) || 0,
        unit_type: (u.unit_type as string) ?? "other",
        status: (u.status as string) ?? "vacant",
        property_name: (u.properties?.name as string) ?? null,
        property_location: (u.properties?.location as string) ?? null,
      })),
    };
  });

/**
 * New tenant asks the landlord for access: creates a pending tenant record
 * tied to the chosen unit. No lease signing here — the landlord approves first.
 */
export const submitAccessRequest = createServerFn({ method: "POST" })
  .inputValidator((data: {
    authUserId: string;
    email: string;
    code: string;
    fullName: string;
    phone: string;
    unitId: string;
    note?: string;
  }) => {
    const authUserId = (data?.authUserId ?? "").trim();
    const email = (data?.email ?? "").trim().toLowerCase();
    const code = (data?.code ?? "").trim();
    const fullName = (data?.fullName ?? "").trim();
    const phone = (data?.phone ?? "").trim();
    const unitId = (data?.unitId ?? "").trim();
    const note = (data?.note ?? "").trim().slice(0, 500);
    if (!authUserId) throw new Error("Missing auth user");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid email");
    if (!/^\d{4}$/.test(code)) throw new Error("Enter the 4-digit landlord code");
    if (!fullName || fullName.length > 100) throw new Error("Enter your full name");
    if (!phone || phone.length > 32) throw new Error("Enter a valid phone number");
    if (!unitId) throw new Error("Pick the unit you want");
    return { authUserId, email, code, fullName, phone, unitId, note };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userLookup, error: userErr } = await supabaseAdmin.auth.admin.getUserById(data.authUserId);
    if (userErr || !userLookup?.user) throw new Error("Auth user not found");
    if ((userLookup.user.email ?? "").toLowerCase() !== data.email) {
      throw new Error("Email does not match account");
    }

    const { data: landlord } = await supabaseAdmin
      .from("landlord_accounts")
      .select("user_id")
      .eq("landlord_code", data.code)
      .maybeSingle();
    if (!landlord) throw new Error("No landlord found with that code");

    const { data: unit } = await supabaseAdmin
      .from("units")
      .select("id, owner_id, unit_number")
      .eq("id", data.unitId)
      .maybeSingle();
    if (!unit || unit.owner_id !== landlord.user_id) throw new Error("That unit does not belong to this landlord");

    const { data: existing } = await supabaseAdmin
      .from("tenants")
      .select("id, approval_status")
      .eq("auth_user_id", data.authUserId)
      .maybeSingle();
    if (existing) {
      return { tenantId: existing.id as string, alreadyExists: true };
    }

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
      })
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);

    try {
      const { pushToUsers, landlordAudience } = await import("@/lib/push.server");
      await pushToUsers(await landlordAudience(unit.owner_id as string), {
        title: "New access request",
        body: `${data.fullName} requested access to unit ${unit.unit_number}${data.note ? ` — ${data.note}` : ""}.`,
        url: "/applications",
        tag: `access-request-${inserted.id}`,
      });
    } catch {
      /* never block onboarding on notifications */
    }

    return { tenantId: inserted.id as string, alreadyExists: false };
  });

/** Onboarding status for the signed-in tenant: pending / approved / declined. */
export const getMyOnboardingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: tenant } = await supabase
      .from("tenants")
      .select(
        "id, full_name, phone_number, email, owner_id, approval_status, declined_reason, active, created_at, lease_signed_at, unit_id, units(unit_number, rent_amount, properties(name, location))",
      )
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!tenant) return { hasRecord: false as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: landlord } = await supabaseAdmin
      .from("landlord_accounts")
      .select("full_name, phone, landlord_code")
      .eq("user_id", tenant.owner_id as string)
      .maybeSingle();

    const t = tenant as any;
    return {
      hasRecord: true as const,
      status: ((t.approval_status as string) ?? "pending") as "pending" | "approved" | "declined",
      declinedReason: (t.declined_reason as string) ?? null,
      fullName: t.full_name as string,
      phone: (t.phone_number as string) ?? null,
      email: (t.email as string) ?? null,
      active: Boolean(t.active),
      requestedAt: (t.created_at as string) ?? null,
      leaseSignedAt: (t.lease_signed_at as string) ?? null,
      unitNumber: (t.units?.unit_number as string) ?? null,
      unitRent: Number(t.units?.rent_amount ?? 0) || 0,
      propertyName: (t.units?.properties?.name as string) ?? null,
      propertyLocation: (t.units?.properties?.location as string) ?? null,
      landlordName: (landlord?.full_name as string) ?? null,
      landlordPhone: (landlord?.phone as string) ?? null,
      landlordCode: (landlord?.landlord_code as string) ?? null,
    };
  });
