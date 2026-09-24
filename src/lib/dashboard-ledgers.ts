import { supabase } from "@/integrations/supabase/client";
import { accruedRent, buildLedger } from "@/lib/ledger";

export async function loadTenantLedgers() {
  const [{ data: tenants }, { data: invoices }, { data: payments }, { data: events }] = await Promise.all([
    supabase.from("tenants").select("id,full_name,active,move_in_date,rent_due_day,units(unit_number,rent_amount,properties(name,location))"),
    supabase.from("invoices").select("id,tenant_id,total_due,balance_remaining,month_year"),
    supabase.from("payments").select("tenant_id,amount_paid"),
    supabase.from("tenant_credit_events").select("tenant_id,delta"),
  ]);

  const sum = (rows: any[] | null, key: string, field: string) => {
    const values = new Map<string, number>();
    for (const row of rows ?? []) values.set(row[key], (values.get(row[key]) ?? 0) + Number(row[field] ?? 0));
    return values;
  };
  const invoicedBy = sum(invoices as any[], "tenant_id", "total_due");
  const paidBy = sum(payments as any[], "tenant_id", "amount_paid");
  const adjustedBy = sum(events as any[], "tenant_id", "delta");
  const openBy = new Map<string, number>();
  for (const invoice of (invoices ?? []) as any[]) {
    const balance = Math.max(0, Number(invoice.balance_remaining ?? 0));
    if (balance > 0) openBy.set(invoice.tenant_id, (openBy.get(invoice.tenant_id) ?? 0) + balance);
  }

  return ((tenants ?? []) as any[]).map((tenant) => {
    const accrued = tenant.active
      ? accruedRent({ rentAmount: tenant.units?.rent_amount, moveInDate: tenant.move_in_date, rentDueDay: tenant.rent_due_day })
      : 0;
    return {
      tenant,
      ledger: buildLedger({
        invoiced: invoicedBy.get(tenant.id) ?? 0,
        paid: paidBy.get(tenant.id) ?? 0,
        adjustments: adjustedBy.get(tenant.id) ?? 0,
        accrued,
      }),
      openInvoiceBalance: openBy.get(tenant.id) ?? 0,
    };
  });
}