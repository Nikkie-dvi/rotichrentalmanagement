// Phone sign-in codes for tenants: the landlord already has their phone number
// on file, so a 6-digit text code is enough to get them into the portal.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function phoneVariants(msisdn: string, raw: string) {
  const local = `0${msisdn.slice(3)}`;
  return Array.from(new Set([msisdn, `+${msisdn}`, local, raw.trim()]));
}

async function hashCode(phone: string, code: string) {
  const data = new TextEncoder().encode(`${phone}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function publishableClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init: any) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    }),
  );
}

export const requestTenantLoginCode = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string }) => {
    const phone = (data?.phone ?? "").trim();
    if (!phone) throw new Error("Enter your phone number");
    return { phone };
  })
  .handler(async ({ data }) => {
    const { toKenyanMsisdn, sendSms } = await import("@/lib/sms.server");
    const msisdn = toKenyanMsisdn(data.phone);
    if (!msisdn) throw new Error("That phone number doesn't look right");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("tenants")
      .select("id, full_name, phone_number, owner_id")
      .in("phone_number", phoneVariants(msisdn, data.phone))
      .limit(1);
    const tenant = rows?.[0] as { id: string; full_name: string | null; owner_id: string | null } | undefined;
    if (!tenant) {
      throw new Error(
        "We couldn't find that phone number on any landlord's tenant list. Use \"Request access\" below.",
      );
    }

    // Landlord account switched off — tenants can't get sign-in codes.
    const { isMessagingPaused } = await import("@/lib/account-messaging.server");
    if (await isMessagingPaused(tenant.owner_id)) {
      throw new Error("Your landlord's account is currently switched off, so the tenant portal is unavailable. Please contact your landlord.");
    }

    // Rate limits: one code a minute, five an hour.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("tenant_login_codes")
      .select("created_at")
      .eq("phone", msisdn)
      .gte("created_at", hourAgo)
      .order("created_at", { ascending: false });

    const list = (recent ?? []) as { created_at: string }[];
    if (list.length >= 5) throw new Error("Too many codes requested. Please try again in an hour.");
    if (list[0] && Date.now() - new Date(list[0].created_at).getTime() < 60_000) {
      throw new Error("A code was just sent. Please wait a minute before asking for another.");
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await hashCode(msisdn, code);

    // Retire any live codes for this number.
    await supabaseAdmin
      .from("tenant_login_codes")
      .update({ consumed_at: new Date().toISOString() } as never)
      .eq("phone", msisdn)
      .is("consumed_at", null);

    const { error: insertError } = await supabaseAdmin.from("tenant_login_codes").insert({
      phone: msisdn,
      code_hash,
      expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
    } as never);
    if (insertError) throw new Error("Could not create a sign-in code. Please try again.");

    const first = (tenant.full_name ?? "there").split(" ")[0];
    // Login codes are never charged to the landlord's wallet, so nobody is
    // ever locked out of their own portal.
    const res = await sendSms(
      msisdn,
      `Hi ${first}, your sign-in code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
      { portalLink: false },
    );
    if (!res.ok) throw new Error("We couldn't text that code right now. Please try again shortly.");

    return { ok: true, masked: `•••••${msisdn.slice(-3)}` };
  });

export const verifyTenantLoginCode = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string; code: string }) => {
    const phone = (data?.phone ?? "").trim();
    const code = (data?.code ?? "").replace(/\D/g, "");
    if (!phone) throw new Error("Enter your phone number");
    if (code.length !== 6) throw new Error("Enter the 6-digit code");
    return { phone, code };
  })
  .handler(async ({ data }) => {
    const { toKenyanMsisdn } = await import("@/lib/sms.server");
    const msisdn = toKenyanMsisdn(data.phone);
    if (!msisdn) throw new Error("That phone number doesn't look right");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: codeRows } = await supabaseAdmin
      .from("tenant_login_codes")
      .select("id, code_hash, expires_at, attempts, consumed_at")
      .eq("phone", msisdn)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const record = codeRows?.[0] as
      | { id: string; code_hash: string; expires_at: string; attempts: number }
      | undefined;
    if (!record) throw new Error("That code has expired. Ask for a new one.");
    if (new Date(record.expires_at).getTime() < Date.now()) {
      throw new Error("That code has expired. Ask for a new one.");
    }
    if (record.attempts >= MAX_ATTEMPTS) throw new Error("Too many wrong tries. Ask for a new code.");

    const expected = await hashCode(msisdn, data.code);
    if (expected !== record.code_hash) {
      await supabaseAdmin
        .from("tenant_login_codes")
        .update({ attempts: record.attempts + 1 } as never)
        .eq("id", record.id);
      throw new Error("That code isn't right. Please check and try again.");
    }

    await supabaseAdmin
      .from("tenant_login_codes")
      .update({ consumed_at: new Date().toISOString() } as never)
      .eq("id", record.id);

    const { data: rows } = await supabaseAdmin
      .from("tenants")
      .select("id, full_name, email, auth_user_id, owner_id")
      .in("phone_number", phoneVariants(msisdn, data.phone))
      .is("move_out_date", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const tenant = rows?.[0] as (TenantRow & { owner_id: string | null }) | undefined;
    if (!tenant) throw new Error("We couldn't find your tenant record. Please contact your landlord.");
    const { isMessagingPaused } = await import("@/lib/account-messaging.server");
    if (await isMessagingPaused(tenant.owner_id)) {
      throw new Error("Your landlord's account is currently switched off, so the tenant portal is unavailable. Please contact your landlord.");
    }
    return sessionForTenantRow(supabaseAdmin, tenant, msisdn);
  });

type TenantRow = { id: string; full_name: string | null; email: string | null; auth_user_id: string | null };

/** Mint a portal session for one tenant row (one login per unit). */
async function sessionForTenantRow(supabaseAdmin: any, tenant: TenantRow, msisdn: string) {
    let email = tenant.email;
    if (!email) {
      // Each unit has its own login; give extra units a unique address.
      const base = `${msisdn}@tenant.homebasemanager.app`;
      const { data: taken } = await supabaseAdmin.from("tenants").select("id").eq("email", base).neq("id", tenant.id).limit(1);
      email = taken?.length ? `${msisdn}.${tenant.id.slice(0, 8)}@tenant.homebasemanager.app` : base;
    }

    if (!tenant.auth_user_id) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role: "tenant", full_name: tenant.full_name, phone: msisdn },
      });
      if (created.error && !/already/i.test(created.error.message)) {
        throw new Error("Could not open your portal account. Please contact your landlord.");
      }
    }

    const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) throw new Error("Could not sign you in. Please try again.");

    const client = await publishableClient();
    const { data: verified, error } = await client.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (error || !verified.session) throw new Error("Could not sign you in. Please try again.");

    if (!tenant.auth_user_id) {
      await supabaseAdmin
        .from("tenants")
        .update({ auth_user_id: verified.session.user.id, email } as never)
        .eq("id", tenant.id);
    }

    return {
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    };
}


/** Units held by the signed-in tenant (same phone number, still renting). */
async function myUnits(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { toKenyanMsisdn } = await import("@/lib/sms.server");
  const { data: me } = await supabaseAdmin.from("tenants").select("id, phone_number").eq("auth_user_id", userId).maybeSingle();
  const msisdn = me?.phone_number ? toKenyanMsisdn(me.phone_number) : null;
  if (!me || !msisdn) return { supabaseAdmin, msisdn: null, currentId: me?.id ?? null, units: [] as any[] };
  const { data: rows } = await supabaseAdmin
    .from("tenants")
    .select("id, full_name, email, auth_user_id, units(unit_number, properties(name))")
    .in("phone_number", phoneVariants(msisdn, me.phone_number!))
    .is("move_out_date", null)
    .order("created_at");
  return { supabaseAdmin, msisdn, currentId: me.id, units: (rows ?? []) as any[] };
}

export const listMyUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { units, currentId } = await myUnits(context.userId);
    return {
      currentId,
      units: units.map((u) => ({ id: u.id as string, label: [u.units?.properties?.name, u.units?.unit_number].filter(Boolean).join(" · ") || "Unit" })),
    };
  });

export const switchMyUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => {
    if (!d?.tenantId) throw new Error("Pick a unit");
    return { tenantId: String(d.tenantId) };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, msisdn, units } = await myUnits(context.userId);
    const target = units.find((u) => u.id === data.tenantId);
    if (!target || !msisdn) throw new Error("That unit isn't linked to your phone number.");
    return sessionForTenantRow(supabaseAdmin, target, msisdn);
  });
