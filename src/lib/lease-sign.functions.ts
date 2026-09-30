import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lets a signed-in tenant sign their own lease from the portal.
export const signMyLease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ signature: z.string().min(2).max(500_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const sig = data.signature;
    if (!sig.startsWith("data:image") && !sig.startsWith("typed:")) throw new Error("Invalid signature");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t, error } = await supabaseAdmin
      .from("tenants")
      .select("id, lease_signature")
      .eq("auth_user_id", context.userId)
      .eq("active", true)
      .is("move_out_date", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) throw new Error("No active tenancy found for your account");
    if (t.lease_signature) return { ok: true, already: true };
    const { error: uErr } = await supabaseAdmin
      .from("tenants")
      .update({ lease_signature: sig, lease_signed_at: new Date().toISOString() })
      .eq("id", t.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true, already: false };
  });
