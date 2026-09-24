// Landlord password reset by SMS code, sent to the phone saved on the
// landlord account. Codes share the hashed one-time-code table with tenant
// sign-in, stored under a "landlord:" prefix so the two never collide.
import { createServerFn } from "@tanstack/react-start";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function phoneVariants(msisdn: string, raw: string) {
  const local = `0${msisdn.slice(3)}`;
  return Array.from(new Set([msisdn, `+${msisdn}`, local, raw.trim()]));
}

async function hashCode(key: string, code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${key}:${code}`));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function findLandlord(msisdn: string, raw: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("landlord_accounts")
    .select("user_id, full_name")
    .in("phone", phoneVariants(msisdn, raw))
    .limit(1);
  return { supabaseAdmin, landlord: data?.[0] as { user_id: string; full_name: string | null } | undefined };
}

export const requestLandlordResetCode = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string }) => {
    const phone = (data?.phone ?? "").trim();
    if (!phone) throw new Error("Enter your phone number");
    return { phone };
  })
  .handler(async ({ data }) => {
    const { toKenyanMsisdn, sendSms } = await import("@/lib/sms.server");
    const msisdn = toKenyanMsisdn(data.phone);
    if (!msisdn) throw new Error("That phone number doesn't look right");
    const { supabaseAdmin, landlord } = await findLandlord(msisdn, data.phone);
    if (!landlord) {
      throw new Error("No landlord account uses that phone number. Reset by email instead.");
    }
    const key = `landlord:${msisdn}`;

    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("tenant_login_codes")
      .select("created_at")
      .eq("phone", key)
      .gte("created_at", hourAgo)
      .order("created_at", { ascending: false });
    const list = (recent ?? []) as { created_at: string }[];
    if (list.length >= 5) throw new Error("Too many codes requested. Please try again in an hour.");
    if (list[0] && Date.now() - new Date(list[0].created_at).getTime() < 60_000) {
      throw new Error("A code was just sent. Please wait a minute before asking for another.");
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await supabaseAdmin
      .from("tenant_login_codes")
      .update({ consumed_at: new Date().toISOString() } as never)
      .eq("phone", key)
      .is("consumed_at", null);
    const { error } = await supabaseAdmin.from("tenant_login_codes").insert({
      phone: key,
      code_hash: await hashCode(key, code),
      expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
    } as never);
    if (error) throw new Error("Could not create a reset code. Please try again.");

    const first = (landlord.full_name ?? "there").split(/[\s@]/)[0];
    const res = await sendSms(
      msisdn,
      `Hi ${first}, your password reset code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. Don't share it.`,
      { portalLink: false },
    );
    if (!res.ok) throw new Error("We couldn't text the code right now. Please try again shortly.");
    return { ok: true, masked: `•••••${msisdn.slice(-3)}` };
  });

export const resetLandlordPasswordWithCode = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string; code: string; newPassword: string }) => {
    const phone = (data?.phone ?? "").trim();
    const code = (data?.code ?? "").replace(/\D/g, "");
    const newPassword = data?.newPassword ?? "";
    if (!phone) throw new Error("Enter your phone number");
    if (code.length !== 6) throw new Error("Enter the 6-digit code");
    if (newPassword.length < 8 || newPassword.length > 72) throw new Error("Password must be 8–72 characters");
    return { phone, code, newPassword };
  })
  .handler(async ({ data }) => {
    const { toKenyanMsisdn } = await import("@/lib/sms.server");
    const msisdn = toKenyanMsisdn(data.phone);
    if (!msisdn) throw new Error("That phone number doesn't look right");
    const key = `landlord:${msisdn}`;
    const { supabaseAdmin, landlord } = await findLandlord(msisdn, data.phone);

    const { data: rows } = await supabaseAdmin
      .from("tenant_login_codes")
      .select("id, code_hash, expires_at, attempts")
      .eq("phone", key)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const record = rows?.[0] as { id: string; code_hash: string; expires_at: string; attempts: number } | undefined;
    if (!record || new Date(record.expires_at).getTime() < Date.now()) {
      throw new Error("That code has expired. Ask for a new one.");
    }
    if (record.attempts >= MAX_ATTEMPTS) throw new Error("Too many wrong tries. Ask for a new code.");
    if ((await hashCode(key, data.code)) !== record.code_hash) {
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
    if (!landlord) throw new Error("No landlord account uses that phone number.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(landlord.user_id, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
