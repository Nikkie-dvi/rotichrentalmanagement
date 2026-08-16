// CEO analytics for the main (super admin) account.
// Aggregates across every landlord, so it must run with admin privileges after
// verifying the caller is listed in super_admins.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CeoAnalytics = {
  totals: {
    landlords: number;
    approvedLandlords: number;
    pendingLandlords: number;
    subscribersActive: number;
    subscribersOverdue: number;
    properties: number;
    units: number;
    occupiedUnits: number;
    tenants: number;
    activeTenants: number;
    openTickets: number;
  };
  money: {
    mrr: number;
    subscriptionCollected: number;
    subscriptionThisMonth: number;
    rentCollectedAllTime: number;
    rentCollectedThisMonth: number;
    outstandingArrears: number;
  };
  monthly: { month: string; rent: number; subscription: number }[];
  landlords: {
    id: string;
    name: string;
    email: string | null;
    code: string | null;
    status: string;
    paidUntil: string | null;
    units: number;
    occupied: number;
    tenants: number;
    rentCollected: number;
    arrears: number;
  }[];
};

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export const getCeoAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CeoAnalytics> => {
    const { data: adminRow } = await context.supabase
      .from("super_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!adminRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [accountsRes, propsRes, unitsRes, tenantsRes, paymentsRes, invoicesRes, subsRes, ticketsRes] =
      await Promise.all([
        supabaseAdmin.from("landlord_accounts").select("id,user_id,full_name,email,status,landlord_code,paid_until,monthly_fee"),
        supabaseAdmin.from("properties").select("id,owner_id"),
        supabaseAdmin.from("units").select("id,owner_id,status"),
        supabaseAdmin.from("tenants").select("id,owner_id,active"),
        supabaseAdmin.from("payments").select("owner_id,amount_paid,payment_date"),
        supabaseAdmin.from("invoices").select("owner_id,balance_remaining"),
        supabaseAdmin.from("landlord_subscription_payments").select("amount,payment_date"),
        supabaseAdmin.from("maintenance_tickets").select("id,status"),
      ]);

    const accounts = accountsRes.data ?? [];
    const units = unitsRes.data ?? [];
    const tenants = tenantsRes.data ?? [];
    const payments = paymentsRes.data ?? [];
    const invoices = invoicesRes.data ?? [];
    const subs = subsRes.data ?? [];
    const tickets = ticketsRes.data ?? [];
    const properties = propsRes.data ?? [];

    const thisMonth = monthKey(new Date());
    const today = new Date().toISOString().slice(0, 10);

    const byOwner = <T extends { owner_id: string | null }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        const k = r.owner_id ?? "";
        m.set(k, [...(m.get(k) ?? []), r]);
      }
      return m;
    };
    const unitsBy = byOwner(units as any);
    const tenantsBy = byOwner(tenants as any);
    const paymentsBy = byOwner(payments as any);
    const invoicesBy = byOwner(invoices as any);

    // Last 6 months of collections.
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() - i, 1);
      months.push(monthKey(d));
    }
    const monthly = months.map((m) => ({
      month: m,
      rent: payments
        .filter((p: any) => (p.payment_date ?? "").slice(0, 7) === m)
        .reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0),
      subscription: subs
        .filter((p: any) => (p.payment_date ?? "").slice(0, 7) === m)
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
    }));

    const approved = accounts.filter((a: any) => a.status === "approved");

    return {
      totals: {
        landlords: accounts.length,
        approvedLandlords: approved.length,
        pendingLandlords: accounts.filter((a: any) => a.status === "pending").length,
        subscribersActive: accounts.filter((a: any) => a.paid_until && a.paid_until >= today).length,
        subscribersOverdue: accounts.filter((a: any) => !a.paid_until || a.paid_until < today).length,
        properties: properties.length,
        units: units.length,
        occupiedUnits: units.filter((u: any) => u.status === "occupied").length,
        tenants: tenants.length,
        activeTenants: tenants.filter((t: any) => t.active).length,
        openTickets: tickets.filter((t: any) => t.status !== "resolved" && t.status !== "closed").length,
      },
      money: {
        mrr: approved.reduce((s: number, a: any) => s + Number(a.monthly_fee || 0), 0),
        subscriptionCollected: subs.reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
        subscriptionThisMonth: subs
          .filter((p: any) => (p.payment_date ?? "").slice(0, 7) === thisMonth)
          .reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
        rentCollectedAllTime: payments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0),
        rentCollectedThisMonth: payments
          .filter((p: any) => (p.payment_date ?? "").slice(0, 7) === thisMonth)
          .reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0),
        outstandingArrears: invoices.reduce((s: number, i: any) => s + Number(i.balance_remaining || 0), 0),
      },
      monthly,
      landlords: accounts
        .map((a: any) => {
          const u = unitsBy.get(a.user_id) ?? [];
          return {
            id: a.id as string,
            name: (a.full_name as string) ?? (a.email as string) ?? "Landlord",
            email: (a.email as string) ?? null,
            code: (a.landlord_code as string) ?? null,
            status: a.status as string,
            paidUntil: (a.paid_until as string) ?? null,
            units: u.length,
            occupied: u.filter((x: any) => x.status === "occupied").length,
            tenants: (tenantsBy.get(a.user_id) ?? []).filter((t: any) => t.active).length,
            rentCollected: (paymentsBy.get(a.user_id) ?? []).reduce(
              (s: number, p: any) => s + Number(p.amount_paid || 0),
              0,
            ),
            arrears: (invoicesBy.get(a.user_id) ?? []).reduce(
              (s: number, i: any) => s + Number(i.balance_remaining || 0),
              0,
            ),
          };
        })
        .sort((a, b) => b.rentCollected - a.rentCollected),
    };
  });
