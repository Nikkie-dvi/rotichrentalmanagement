// Landlord-facing push when a tenant is invoiced: shows the charge breakdown,
// any money the tenant had paid upfront that was used against the bill, and
// the tenant's current overall balance.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToUsers, landlordAudience } from "@/lib/push.server";
import { invoiceBreakdown } from "@/lib/invoice-breakdown.server";

const num = (v: any) => Number(v ?? 0) || 0;
const money = (n: number) => `KES ${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

/**
 * Sends one push per invoice raised. Best-effort: never throws into the caller.
 * `creditApplied` may be passed by the bulk generator; otherwise it is derived
 * from the gap between the invoice total and its remaining balance.
 */
export async function notifyLandlordOfInvoice(opts: {
  ownerId: string;
  invoiceId: string;
  tenantId: string;
  creditApplied?: number;
}) {
  try {
    const [{ data: tenant }, breakdown] = await Promise.all([
      supabaseAdmin.from("tenants").select("id, full_name").eq("id", opts.tenantId).maybeSingle(),
      invoiceBreakdown(supabaseAdmin, opts.invoiceId),
    ]);
    if (!breakdown) return { ok: false };

    const name = (tenant as any)?.full_name ?? "Tenant";
    const applied = opts.creditApplied ?? Math.max(0, breakdown.total - breakdown.balance);

    // Tenant's overall position: everything invoiced vs everything paid/adjusted.
    const [{ data: invoices }, { data: payments }, { data: events }] = await Promise.all([
      supabaseAdmin.from("invoices").select("total_due").eq("tenant_id", opts.tenantId),
      supabaseAdmin.from("payments").select("amount_paid").eq("tenant_id", opts.tenantId),
      supabaseAdmin.from("tenant_credit_events").select("delta").eq("tenant_id", opts.tenantId),
    ]);
    const invoiced = ((invoices ?? []) as any[]).reduce((s, i) => s + num(i.total_due), 0);
    const paid =
      ((payments ?? []) as any[]).reduce((s, p) => s + num(p.amount_paid), 0) +
      ((events ?? []) as any[]).reduce((s, e) => s + num(e.delta), 0);
    const net = paid - invoiced; // positive = in credit, negative = owing

    const lines = [
      `Charges: ${breakdown.text}`,
      `Total ${money(breakdown.total)}`,
    ];
    if (applied > 0) lines.push(`less ${money(applied)} paid upfront`);
    lines.push(net >= 0 ? `Now ${money(net)} in credit` : `Balance now ${money(net)}`);

    const body = lines.join(" · ");
    const title = `${name} invoiced ${money(breakdown.total)}`;

    await pushToUsers(await landlordAudience(opts.ownerId), {
      title,
      body,
      url: "/billing",
      tag: `invoiced-${opts.invoiceId}`,
    });

    await supabaseAdmin.from("notification_logs").insert({
      owner_id: opts.ownerId,
      tenant_id: opts.tenantId,
      invoice_id: opts.invoiceId,
      channel: "push",
      subject: title,
      message: body,
      status: "delivered",
    } as never);

    return { ok: true };
  } catch {
    return { ok: false };
  }
}
