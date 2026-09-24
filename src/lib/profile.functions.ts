// Landlord profile edits. Strict check: current password AND an SMS code sent
// to the phone already saved on the account (or the new phone if none saved).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TTL_MIN = 10;

type ProfileInput = { password: string; fullName: string; phone: string };

function checkProfile(data: ProfileInput) {
  const fullName = (data?.fullName ?? "").trim().replace(/\s+/g, " ");
  const phone = (data?.phone ?? "").trim();
  const password = data?.password ?? "";
  if (fullName.length < 3 || fullName.length > 80 || !/^[\p{L}][\p{L} .'-]+$/u.test(fullName)) {
    throw new Error("Enter your full name (letters only, 3–80 characters)");
  }
  if (phone.replace(/\D/g, "").length < 9 || phone.length > 20) throw new Error("Enter a valid phone number");
  if (!password) throw new Error("Enter your current password");
  return { fullName, phone, password };
}

async function loadContext(userId: string, email: string | undefined, password: string) {
  const { passwordMatches } = await import("@/lib/verify.server");
  if (!email || !(await passwordMatches(email, password))) throw new Error("Your current password is not correct");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account } = await supabaseAdmin
    .from("landlord_accounts")
    .select("id, phone, full_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!account) throw new Error("Only landlord accounts can edit these details");
  return { supabaseAdmin, account };
}

export const requestProfileChangeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(checkProfile)
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email as string | undefined;
    const { supabaseAdmin, account } = await loadContext(context.userId, email, data.password);
    const { toKenyanMsisdn, sendSms } = await import("@/lib/sms.server");
    const { hashCode } = await import("@/lib/verify.server");
    const target = toKenyanMsisdn(account.phone || data.phone);
    if (!target) throw new Error("No valid phone number to send the code to");
    const key = `profile:${context.userId}`;

    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("tenant_login_codes")
      .select("created_at")
      .eq("phone", key)
      .gte("created_at", hourAgo)
      .order("created_at", { ascending: false });
    const list = (recent ?? []) as { created_at: string }[];
    if (list.length >= 5) throw new Error("Too many codes requested. Try again in an hour.");
    if (list[0] && Date.now() - new Date(list[0].created_at).getTime() < 60_000) {
      throw new Error("A code was just sent. Wait a minute before asking again.");
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await supabaseAdmin
      .from("tenant_login_codes")
      .update({ consumed_at: new Date().toISOString() } as never)
      .eq("phone", key)
      .is("consumed_at", null);
    await supabaseAdmin.from("tenant_login_codes").insert({
      phone: key,
      code_hash: await hashCode(key, code),
      expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString(),
    } as never);
    const res = await sendSms(
      target,
      `Your code to change your account details is ${code}. It expires in ${TTL_MIN} minutes. If this wasn't you, change your password now.`,
      { portalLink: false },
    );
    if (!res.ok) throw new Error("We couldn't text the code right now. Try again shortly.");
    return { ok: true, masked: `•••••${target.slice(-3)}` };
  });

export const updateLandlordProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProfileInput & { code: string }) => ({
    ...checkProfile(data),
    code: (data?.code ?? "").replace(/\D/g, ""),
  }))
  .handler(async ({ data, context }) => {
    if (data.code.length !== 6) throw new Error("Enter the 6-digit code");
    const email = (context.claims as any)?.email as string | undefined;
    const { supabaseAdmin, account } = await loadContext(context.userId, email, data.password);
    const { hashCode } = await import("@/lib/verify.server");
    const key = `profile:${context.userId}`;
    const { data: rows } = await supabaseAdmin
      .from("tenant_login_codes")
      .select("id, code_hash, expires_at, attempts")
      .eq("phone", key)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const rec = rows?.[0] as { id: string; code_hash: string; expires_at: string; attempts: number } | undefined;
    if (!rec || new Date(rec.expires_at).getTime() < Date.now()) throw new Error("That code has expired. Ask for a new one.");
    if (rec.attempts >= 5) throw new Error("Too many wrong tries. Ask for a new code.");
    if ((await hashCode(key, data.code)) !== rec.code_hash) {
      await supabaseAdmin.from("tenant_login_codes").update({ attempts: rec.attempts + 1 } as never).eq("id", rec.id);
      throw new Error("That code isn't right.");
    }
    await supabaseAdmin.from("tenant_login_codes").update({ consumed_at: new Date().toISOString() } as never).eq("id", rec.id);

    const { error } = await supabaseAdmin
      .from("landlord_accounts")
      .update({ full_name: data.fullName, phone: data.phone })
      .eq("id", account.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: { full_name: data.fullName, phone: data.phone },
    });
    return { ok: true };
  });
