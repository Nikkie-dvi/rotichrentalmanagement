import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tenant self-service: update their own name and phone number.
// The lease signature is never touched here (it can only be set once).
export const updateMyTenantDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ fullName: z.string().trim().min(2).max(100), phone: z.string().trim().min(9).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { toKenyanMsisdn } = await import("@/lib/sms.server");
    const msisdn = toKenyanMsisdn(data.phone);
    if (!msisdn) throw new Error("Enter a valid Kenyan phone number, e.g. 0712 345 678");
    const local = `0${msisdn.slice(3)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("auth_user_id", context.userId)
      .is("move_out_date", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!t) throw new Error("No active tenancy found for your account");
    const { data: clash } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .in("phone_number", [local, msisdn, `+${msisdn}`])
      .is("move_out_date", null)
      .neq("id", t.id)
      .limit(1);
    if ((clash ?? []).length) throw new Error("That phone number is already used by another tenant");
    const { error } = await supabaseAdmin
      .from("tenants")
      .update({ full_name: data.fullName, phone_number: local })
      .eq("id", t.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
