// The same accrued-rent ledger used by the landlord and tenant portals, for SMS notices.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { accruedRent, buildLedger } from "@/lib/ledger";

const sum = (rows: { value?: number | null }[]) => rows.reduce((total, row) => total + (Number(row.value) || 0), 0);
const money = (value: number) => `KES ${Math.round(value).toLocaleString("en-US")}`;

export async function tenantBalancePosition(tenantId: string) {
  const [tenantResult, invoicesResult, paymentsResult, adjustmentsResult] = await Promise.all([
    supabaseAdmin.from("tenants").select("id, owner_id, full_name, phone_number, active, move_in_date, rent_due_day, units(rent_amount)").eq("id", tenantId).maybeSingle(),
    supabaseAdmin.from("invoices").select("total_due").eq("tenant_id", tenantId),
    supabaseAdmin.from("payments").select("amount_paid").eq("tenant_id", tenantId),
    supabaseAdmin.from("tenant_credit_events").select("delta").eq("tenant_id", tenantId),
  ]);
  if (tenantResult.error || !tenantResult.data || invoicesResult.error || paymentsResult.error || adjustmentsResult.error) {
    throw new Error("Could not calculate the tenant's current balance");
  }
  const tenant = tenantResult.data;
  const rent = Number(tenant.units?.rent_amount) || 0;
  const ledger = buildLedger({
    invoiced: sum((invoicesResult.data ?? []).map((row) => ({ value: row.total_due }))),
    paid: sum((paymentsResult.data ?? []).map((row) => ({ value: row.amount_paid }))),
    adjustments: sum((adjustmentsResult.data ?? []).map((row) => ({ value: row.delta }))),
    accrued: tenant.active ? accruedRent({ rentAmount: rent, moveInDate: tenant.move_in_date, rentDueDay: tenant.rent_due_day }) : 0,
  });
  return { tenant, rent, ledger };
}

/** Describe rent-month equivalents without claiming future invoices have been issued. */
export function balancePositionText(credit: number, arrears: number, monthlyRent: number) {
  if (arrears > 0) {
    const months = monthlyRent > 0 ? Math.floor(arrears / monthlyRent) : 0;
    return `Your outstanding balance is ${money(arrears)}.${months >= 1 ? ` This is at least ${months} full month${months === 1 ? "" : "s"} of rent.` : ""}`;
  }
  if (credit > 0) {
    const months = monthlyRent > 0 ? Math.floor(credit / monthlyRent) : 0;
    return `You have ${money(credit)} in prepaid credit.${months >= 1 ? ` This covers ${months} full future month${months === 1 ? "" : "s"} of rent at your current rate, before any other charges.` : ""}`;
  }
  return "Your balance is settled, with no outstanding amount.";
}

export async function notifyTenantOfDueInvoice(opts: { ownerId: string; tenantId: string; invoiceId: string; month: string; total: number; applied: number }) {
  const { tenant, rent, ledger } = await tenantBalancePosition(opts.tenantId);
  if (!tenant.phone_number || !tenant.active) return { sent: false };
  const first = tenant.full_name?.trim().split(/\s+/)[0] || "Tenant";
  const message = `Dear ${first}, your ${opts.month} rent invoice of ${money(opts.total)} is ready.${opts.applied > 0 ? ` ${money(opts.applied)} of your prepaid credit was applied.` : ""} ${balancePositionText(ledger.credit, ledger.arrears, rent)} Sign in with your phone number to check your account: homebasemanager.app/tenant/login`;
  const { chargeSmsWallet } = await import("@/lib/sms-wallet.server");
  const charged = await chargeSmsWallet(supabaseAdmin, { ownerId: opts.ownerId, count: 1, reason: "due_invoice", note: `Rent invoice ${opts.month}` });
  if (charged === null) return { sent: false };
  const { sendSms } = await import("@/lib/sms.server");
  const result = await sendSms(tenant.phone_number, message, { portalLink: false });
  await supabaseAdmin.from("notification_logs").insert({
    owner_id: opts.ownerId, tenant_id: opts.tenantId, invoice_id: opts.invoiceId,
    channel: "sms", recipient: tenant.phone_number, subject: "Rent invoice and account balance",
    message, status: result.ok ? "delivered" : "failed", error: result.error ?? null,
  });
  return { sent: result.ok };
}