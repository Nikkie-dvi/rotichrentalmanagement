// Property manager self sign-up. The manager lists each property they run and
// that property's landlord. Existing landlords must approve the manager; new
// landlords get a free login created so they can track payments.
import { createServerFn } from "@tanstack/react-start";

export const MANAGER_RATE_PER_PROPERTY = 250;

type PropertyInput = {
  propertyName: string;
  location?: string;
  landlordName: string;
  landlordPhone: string;
  landlordEmail: string;
  landlordCode?: string;
};

type Input = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  properties: PropertyInput[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, max = 120) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

function validate(data: Input) {
  const fullName = clean(data?.fullName, 80);
  const email = clean(data?.email).toLowerCase();
  const phone = clean(data?.phone, 20);
  const password = String(data?.password ?? "");
  if (fullName.length < 3) throw new Error("Enter your full name");
  if (!EMAIL.test(email)) throw new Error("Enter a valid email address");
  if (phone.replace(/\D/g, "").length < 9) throw new Error("Enter a valid phone number");
  if (password.length < 8 || password.length > 72) throw new Error("Password must be 8–72 characters");
  const list = Array.isArray(data?.properties) ? data.properties : [];
  if (list.length < 1 || list.length > 20) throw new Error("Add between 1 and 20 properties");
  const properties = list.map((p, i) => {
    const row = {
      propertyName: clean(p?.propertyName, 80),
      location: clean(p?.location, 120),
      landlordName: clean(p?.landlordName, 80),
      landlordPhone: clean(p?.landlordPhone, 20),
      landlordEmail: clean(p?.landlordEmail).toLowerCase(),
      landlordCode: clean(p?.landlordCode, 20).toUpperCase(),
    };
    const n = i + 1;
    if (row.propertyName.length < 2) throw new Error(`Property ${n}: enter the property name`);
    if (row.landlordName.length < 3) throw new Error(`Property ${n}: enter the landlord's full name`);
    if (row.landlordPhone.replace(/\D/g, "").length < 9) throw new Error(`Property ${n}: enter the landlord's phone`);
    if (!EMAIL.test(row.landlordEmail)) throw new Error(`Property ${n}: enter the landlord's email`);
    if (row.landlordEmail === email) throw new Error(`Property ${n}: the landlord's email can't be your own`);
    return row;
  });
  return { fullName, email, phone, password, properties };
}

export const registerPropertyManager = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { toKenyanMsisdn, sendSms } = await import("@/lib/sms.server");
    const { phoneVariants, randomPassword } = await import("@/lib/verify.server");

    const managerMsisdn = toKenyanMsisdn(data.phone);
    if (!managerMsisdn) throw new Error("Your phone number doesn't look right");

    // 1. Manager login
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: "property_manager", full_name: data.fullName, phone: data.phone },
    });
    if (created.error || !created.data.user) {
      const msg = created.error?.message ?? "";
      throw new Error(/already/i.test(msg) ? "An account with that email already exists. Sign in instead." : msg || "Could not create your account");
    }
    const managerId = created.data.user.id;

    try {
      await supabaseAdmin.from("manager_accounts").insert({
        user_id: managerId,
        full_name: data.fullName,
        email: data.email,
        phone: data.phone,
        property_count: data.properties.length,
        rate_per_property: MANAGER_RATE_PER_PROPERTY,
      } as never);

      // 2. Group properties by landlord
      const groups = new Map<string, typeof data.properties>();
      for (const p of data.properties) {
        const key = p.landlordCode || toKenyanMsisdn(p.landlordPhone) || p.landlordEmail;
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }

      const results: { landlord: string; status: "linked" | "pending" }[] = [];

      for (const props of groups.values()) {
        const first = props[0];
        const msisdn = toKenyanMsisdn(first.landlordPhone);
        if (!msisdn) throw new Error(`${first.landlordName}'s phone number doesn't look right`);

        // Find existing landlord by code, then phone, then email
        let landlord: { user_id: string; full_name: string | null; email: string | null } | null = null;
        if (first.landlordCode) {
          const { data: r } = await supabaseAdmin
            .from("landlord_accounts").select("user_id, full_name, email").eq("landlord_code", first.landlordCode).maybeSingle();
          landlord = r as typeof landlord;
          if (!landlord) throw new Error(`No landlord uses the code ${first.landlordCode}. Check it or leave it blank.`);
        }
        if (!landlord) {
          const { data: r } = await supabaseAdmin
            .from("landlord_accounts").select("user_id, full_name, email").in("phone", phoneVariants(msisdn, first.landlordPhone)).limit(1);
          landlord = (r?.[0] as typeof landlord) ?? null;
        }
        if (!landlord) {
          const { data: r } = await supabaseAdmin
            .from("landlord_accounts").select("user_id, full_name, email").eq("email", first.landlordEmail).limit(1);
          landlord = (r?.[0] as typeof landlord) ?? null;
        }

        const names = props.map((p) => p.propertyName);
        let isNew = false;

        if (!landlord) {
          // Create a landlord login + approved account with a free trial
          const lu = await supabaseAdmin.auth.admin.createUser({
            email: first.landlordEmail,
            password: randomPassword(),
            email_confirm: true,
            user_metadata: { role: "landlord", full_name: first.landlordName, phone: first.landlordPhone },
          });
          if (lu.error || !lu.data.user) {
            throw new Error(
              /already/i.test(lu.error?.message ?? "")
                ? `${first.landlordEmail} already has an account on the app that isn't a landlord. Use a different landlord email.`
                : lu.error?.message ?? "Could not create the landlord's login",
            );
          }
          const { error: laErr } = await supabaseAdmin.from("landlord_accounts").insert({
            user_id: lu.data.user.id,
            email: first.landlordEmail,
            full_name: first.landlordName,
            phone: first.landlordPhone,
            status: "approved",
            approved_at: new Date().toISOString(),
            trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
          } as never);
          if (laErr) throw new Error(laErr.message);
          landlord = { user_id: lu.data.user.id, full_name: first.landlordName, email: first.landlordEmail };
          isNew = true;
          for (const p of props) {
            await supabaseAdmin.from("properties").insert({
              name: p.propertyName,
              location: p.location || null,
              owner_id: landlord.user_id,
            } as never);
          }
        }

        const { error: pmErr } = await supabaseAdmin.from("property_managers").insert({
          landlord_user_id: landlord.user_id,
          manager_user_id: managerId,
          email: data.email,
          full_name: data.fullName,
          phone: data.phone,
          active: isNew, // existing landlords approve first
          source: "self",
          property_names: names,
        } as never);
        if (pmErr) throw new Error(pmErr.message);

        // 3. Notify landlord by SMS + email
        const landlordFirst = (landlord.full_name ?? first.landlordName).split(" ")[0];
        const sms = isNew
          ? `Hi ${landlordFirst}, ${data.fullName} (${data.phone}) registered as property manager for ${names.join(", ")} on Rotich Management Systems. Track every payment they record at homebasemanager.app/auth - sign in with ${first.landlordEmail}, tap "Forgot password" and use this phone to set your password.`
          : `Hi ${landlordFirst}, ${data.fullName} (${data.phone}) registered as property manager for ${names.join(", ")}. Approve them at homebasemanager.app Settings > Property Managers. Ignore if you don't know them.`;
        await sendSms(msisdn, sms, { portalLink: false }).catch(() => null);
        try {
          const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
          await sendTemplateEmail("manager-registered", landlord.email ?? first.landlordEmail, {
            templateData: {
              landlordName: landlordFirst,
              managerName: data.fullName,
              managerPhone: data.phone,
              properties: names.join(", "),
              needsApproval: !isNew,
              newAccount: isNew,
            },
            idempotencyKey: `manager-registered-${managerId}-${landlord.user_id}`,
          });
        } catch (e) {
          console.error("manager-registered email failed", e);
        }
        results.push({ landlord: landlord.full_name ?? first.landlordName, status: isNew ? "linked" : "pending" });
      }

      const fee = data.properties.length * MANAGER_RATE_PER_PROPERTY;
      await sendSms(
        managerMsisdn,
        `Welcome ${data.fullName.split(" ")[0]}! Your property manager account is ready. Sign in at homebasemanager.app/auth with ${data.email}. Fee: KES ${fee}/month (${data.properties.length} x KES ${MANAGER_RATE_PER_PROPERTY}) after a 14-day free trial.`,
        { portalLink: false },
      ).catch(() => null);

      return { ok: true, fee, results };
    } catch (e) {
      // Roll back the manager login so they can retry cleanly.
      await supabaseAdmin.from("property_managers").delete().eq("manager_user_id", managerId);
      await supabaseAdmin.from("manager_accounts").delete().eq("user_id", managerId);
      await supabaseAdmin.auth.admin.deleteUser(managerId);
      throw e;
    }
  });
