// Lets a tenant sign in with the phone number their landlord has on file
// instead of remembering the email address used at registration.
import { createServerFn } from "@tanstack/react-start";

export const tenantSignInWithPhone = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string; password: string }) => {
    const phone = (data?.phone ?? "").trim();
    const password = data?.password ?? "";
    if (!phone) throw new Error("Enter your phone number");
    if (!password) throw new Error("Enter your password");
    return { phone, password };
  })
  .handler(async ({ data }) => {
    const { toKenyanMsisdn } = await import("@/lib/sms.server");
    const msisdn = toKenyanMsisdn(data.phone);
    if (!msisdn) throw new Error("That phone number doesn't look right");

    const local = `0${msisdn.slice(3)}`;
    const variants = Array.from(new Set([msisdn, `+${msisdn}`, local, data.phone.trim()]));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("tenants")
      .select("email, phone_number")
      .in("phone_number", variants)
      .not("email", "is", null)
      .limit(1);

    const email = (rows?.[0] as { email?: string } | undefined)?.email;
    if (!email) throw new Error("No tenant account found for that phone number");

    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init: any) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data: signedIn, error } = await client.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error || !signedIn.session) throw new Error("Wrong phone number or password");

    return {
      access_token: signedIn.session.access_token,
      refresh_token: signedIn.session.refresh_token,
    };
  });
