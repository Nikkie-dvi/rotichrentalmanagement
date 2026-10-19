// A manager who signed up as a landlord can later enter the real landlord of a
// property. Saving details only stores them; "hand over" moves the property
// (units, tenants and their history) to the landlord's own login and keeps the
// manager linked with edit rights, exactly like a manager sign-up.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, max = 120) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

type Input = { propertyId: string; landlordName: string; landlordPhone: string; landlordEmail: string; handOver: boolean };

function validate(d: Input) {
  const out = {
    propertyId: clean(d?.propertyId, 60),
    landlordName: clean(d?.landlordName, 80),
    landlordPhone: clean(d?.landlordPhone, 20),
    landlordEmail: clean(d?.landlordEmail).toLowerCase(),
    handOver: !!d?.handOver,
  };
  if (!out.propertyId) throw new Error("Missing property");
  if (out.landlordName.length < 3) throw new Error("Enter the landlord's full name");
  if (out.landlordPhone.replace(/\D/g, "").length < 9) throw new Error("Enter the landlord's phone");
  if (out.landlordEmail && !EMAIL.test(out.landlordEmail)) throw new Error("Enter a valid landlord email");
  if (out.handOver && !out.landlordEmail) throw new Error("An email is needed to create the landlord's login");
  return out;
}

export const savePropertyLandlord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = context.userId;

    const { data: prop } = await supabaseAdmin
      .from("properties").select("id,name,owner_id").eq("id", data.propertyId).maybeSingle();
    if (!prop || prop.owner_id !== me) throw new Error("You can only update properties on your own account");

    await supabaseAdmin.from("properties").update({
      landlord_name: data.landlordName,
      landlord_phone: data.landlordPhone,
      landlord_email: data.landlordEmail || null,
    }).eq("id", prop.id);

    if (!data.handOver) return { handedOver: false };

    const { data: meAuth } = await supabaseAdmin.auth.admin.getUserById(me);
    if (meAuth.user?.email?.toLowerCase() === data.landlordEmail) throw new Error("The landlord's email can't be your own");

    const { toKenyanMsisdn, sendSms } = await import("@/lib/sms.server");
    const { phoneVariants, randomPassword } = await import("@/lib/verify.server");
    const msisdn = toKenyanMsisdn(data.landlordPhone);
    if (!msisdn) throw new Error("The landlord's phone number doesn't look right");

    // Find the landlord by phone, then email; otherwise create their login.
    let landlordId: string | null = null;
    let isNew = false;
    {
      const { data: r } = await supabaseAdmin.from("landlord_accounts").select("user_id")
        .in("phone", phoneVariants(msisdn, data.landlordPhone)).limit(1);
      landlordId = r?.[0]?.user_id ?? null;
    }
    if (!landlordId) {
      const { data: r } = await supabaseAdmin.from("landlord_accounts").select("user_id").eq("email", data.landlordEmail).limit(1);
      landlordId = r?.[0]?.user_id ?? null;
    }
    if (landlordId === me) throw new Error("Those landlord details match your own account");
    if (!landlordId) {
      const lu = await supabaseAdmin.auth.admin.createUser({
        email: data.landlordEmail,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { role: "landlord", full_name: data.landlordName, phone: data.landlordPhone },
      });
      if (lu.error || !lu.data.user) {
        throw new Error(/already/i.test(lu.error?.message ?? "")
          ? `${data.landlordEmail} already has an account that isn't a landlord. Use a different email.`
          : lu.error?.message ?? "Could not create the landlord's login");
      }
      landlordId = lu.data.user.id;
      const { error } = await supabaseAdmin.from("landlord_accounts").insert({
        user_id: landlordId, email: data.landlordEmail, full_name: data.landlordName, phone: data.landlordPhone,
        status: "approved", approved_at: new Date().toISOString(),
        trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      } as never);
      if (error) throw new Error(error.message);
      isNew = true;
    }

    // Move the property and everything under it.
    const { data: units } = await supabaseAdmin.from("units").select("id").eq("property_id", prop.id);
    const unitIds = (units ?? []).map((u) => u.id);
    const { data: tenants } = unitIds.length
      ? await supabaseAdmin.from("tenants").select("id").in("unit_id", unitIds)
      : { data: [] as { id: string }[] };
    const tenantIds = (tenants ?? []).map((t) => t.id);

    await supabaseAdmin.from("properties").update({ owner_id: landlordId }).eq("id", prop.id);
    if (unitIds.length) await supabaseAdmin.from("units").update({ owner_id: landlordId }).in("id", unitIds);
    if (tenantIds.length) {
      await supabaseAdmin.from("tenants").update({ owner_id: landlordId }).in("id", tenantIds);
      for (const table of ["invoices", "payments", "mpesa_transactions", "utility_readings", "maintenance_tickets",
        "move_out_requests", "tenant_credit_events", "notification_logs"] as const) {
        await (supabaseAdmin as any).from(table).update({ owner_id: landlordId }).in("tenant_id", tenantIds);
      }
      const { data: invs } = await supabaseAdmin.from("invoices").select("id").in("tenant_id", tenantIds);
      const invIds = (invs ?? []).map((i) => i.id);
      for (let i = 0; i < invIds.length; i += 200) {
        await supabaseAdmin.from("invoice_line_items").update({ owner_id: landlordId }).in("invoice_id", invIds.slice(i, i + 200));
      }
    }

    // Keep the manager linked, with edit rights.
    const { data: link } = await (supabaseAdmin as any).from("property_managers")
      .select("id,property_names").eq("landlord_user_id", landlordId).eq("manager_user_id", me).maybeSingle();
    if (link) {
      const names = Array.from(new Set([...(link.property_names ?? []), prop.name]));
      await (supabaseAdmin as any).from("property_managers").update({ active: true, can_edit_units: true, property_names: names }).eq("id", link.id);
    } else {
      const { data: mgr } = await supabaseAdmin.from("manager_accounts").select("full_name,phone").eq("user_id", me).maybeSingle();
      await (supabaseAdmin as any).from("property_managers").insert({
        landlord_user_id: landlordId, manager_user_id: me, email: meAuth.user?.email ?? "",
        full_name: mgr?.full_name ?? null, phone: mgr?.phone ?? null,
        active: true, can_edit_units: true, source: "self", property_names: [prop.name],
      });
    }

    const first = data.landlordName.split(" ")[0];
    const sms = isNew
      ? `Hi ${first}, your property ${prop.name} is now on Eden Point Real Estate, run by your property manager. Track rent and payments at homebasemanager.app/auth - sign in with ${data.landlordEmail}, tap "Forgot password" and use this phone to set your password.`
      : `Hi ${first}, your property manager added ${prop.name} to your account on Eden Point Real Estate. Sign in at homebasemanager.app to track rent and payments.`;
    await sendSms(msisdn, sms, { portalLink: false }).catch(() => null);

    return { handedOver: true, landlordId, moved: { units: unitIds.length, tenants: tenantIds.length } };
  });
