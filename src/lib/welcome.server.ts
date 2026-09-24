// Welcome messages for new tenants and landlords, plus a monthly
// experience check-in for landlords. Deduped through notification_logs.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms, PORTAL_LINK } from "@/lib/sms.server";
import { pushToUsers } from "@/lib/push.server";

const first = (n?: string | null, f = "there") => (n ?? f).trim().split(" ")[0] || f;
const WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // only greet people added in the last 3 days

async function alreadyLogged(subject: string, key: { tenant_id?: string; owner_id?: string }) {
  let q = supabaseAdmin.from("notification_logs").select("id").eq("subject", subject).limit(1);
  if (key.tenant_id) q = q.eq("tenant_id", key.tenant_id);
  if (key.owner_id) q = q.eq("owner_id", key.owner_id);
  const { data } = await q;
  return (data ?? []).length > 0;
}

export async function runWelcomeSweep() {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const logs: Record<string, unknown>[] = [];
  let tenantsWelcomed = 0;
  let landlordsWelcomed = 0;
  let checkins = 0;

  // Tenants
  const { data: tenants } = await supabaseAdmin
    .from("tenants")
    .select("id, owner_id, full_name, phone_number, auth_user_id, approval_status, active, unit_id")
    .gte("created_at", since)
    .eq("active", true)
    .neq("approval_status", "declined");
  for (const t of (tenants ?? []) as any[]) {
    if (!t.phone_number && !t.auth_user_id) continue;
    if (await alreadyLogged("tenant_welcome", { tenant_id: t.id })) continue;
    let unitLabel = "";
    if (t.unit_id) {
      const { data: u } = await supabaseAdmin
        .from("units").select("unit_number, properties(name)").eq("id", t.unit_id).maybeSingle();
      if (u) unitLabel = ` ${(u as any).properties?.name ?? ""} ${(u as any).unit_number}`.replace(/\s+/g, " ");
    }
    const msg = `Welcome${unitLabel ? " to" + unitLabel : ""}, ${first(t.full_name)}! Your tenant portal is ready: see rent, payments, receipts and report repairs at ${PORTAL_LINK} - sign in with this phone number.`;
    let status = "skipped";
    let error: string | null = null;
    if (t.phone_number) {
      const res = await sendSms(t.phone_number, msg, { portalLink: false });
      status = res.ok ? "delivered" : "failed";
      error = res.error ?? null;
    }
    if (t.auth_user_id) {
      await pushToUsers([t.auth_user_id], { title: "Welcome to your tenant portal", body: msg, url: "/tenant/dashboard", tag: `welcome-${t.id}` }).catch(() => {});
    }
    logs.push({ owner_id: t.owner_id, tenant_id: t.id, channel: "sms", recipient: t.phone_number, subject: "tenant_welcome", message: msg, status, error });
    tenantsWelcomed++;
  }

  // Landlords
  const { data: landlords } = await supabaseAdmin
    .from("landlord_accounts").select("user_id, full_name, phone, email, landlord_code, created_at, status");
  for (const l of (landlords ?? []) as any[]) {
    if (l.created_at < since) continue;
    if (l.email && !(await alreadyLogged("landlord_welcome_email", { owner_id: l.user_id }))) {
      let status = "delivered";
      let error: string | null = null;
      try {
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const r = await sendTemplateEmail("landlord-welcome", l.email, {
          templateData: { name: first(l.full_name, ""), landlordCode: l.landlord_code ?? undefined },
          idempotencyKey: `landlord-welcome-${l.user_id}`,
        });
        if (!r.sent) status = "skipped";
      } catch (e: any) {
        status = "failed";
        error = e?.code ?? e?.message ?? "failed";
      }
      // Leave unverified-domain failures unlogged so they retry next hour.
      if (error !== "domain_not_verified") {
        logs.push({ owner_id: l.user_id, channel: "email", recipient: l.email, subject: "landlord_welcome_email", message: "Welcome email", status, error });
      }
    }
    if (!l.phone) continue;
    if (await alreadyLogged("landlord_welcome", { owner_id: l.user_id })) continue;
    const msg = `Welcome to Rotich Management Systems, ${first(l.full_name)}!${l.landlord_code ? ` Your landlord code is ${l.landlord_code}.` : ""} Add your properties and tenants at homebasemanager.app to start collecting rent.`;
    const res = await sendSms(l.phone, msg, { portalLink: false });
    logs.push({ owner_id: l.user_id, channel: "sms", recipient: l.phone, subject: "landlord_welcome", message: msg, status: res.ok ? "delivered" : "failed", error: res.error ?? null });
    landlordsWelcomed++;
  }

  // Monthly experience check-in (from the 1st of each month, once per landlord per month)
  const month = new Date().toISOString().slice(0, 7);
  const subject = `landlord_checkin_${month}`;
  const { data: pricing } = await supabaseAdmin.from("platform_pricing").select("support_whatsapp").limit(1).maybeSingle();
  const wa = (pricing as any)?.support_whatsapp as string | undefined;
  for (const l of (landlords ?? []) as any[]) {
    if (!l.phone || l.status !== "approved") continue;
    if (Date.now() - new Date(l.created_at).getTime() < 14 * 86400000) continue; // skip brand-new accounts
    if (await alreadyLogged(subject, { owner_id: l.user_id })) continue;
    const msg = `Hi ${first(l.full_name)}, how is Rotich Management Systems working for you this month? We'd love your feedback${wa ? ` - WhatsApp us on ${wa}` : ""}. Thank you for managing with us!`;
    const res = await sendSms(l.phone, msg, { portalLink: false });
    logs.push({ owner_id: l.user_id, channel: "sms", recipient: l.phone, subject, message: msg, status: res.ok ? "delivered" : "failed", error: res.error ?? null });
    checkins++;
  }

  if (logs.length) await supabaseAdmin.from("notification_logs").insert(logs as never);
  return { ok: true, tenantsWelcomed, landlordsWelcomed, checkins };
}
