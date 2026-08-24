import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Kept for display purposes only; admin rights come from the database admin list. */
export const SUPER_ADMIN_EMAIL = "lnick8081@gmail.com";
export const MONTHLY_FEE = 2500;
export const PAYMENT_NUMBER = "0706747498";

export type LandlordAccount = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  status: string;
  declined_reason: string | null;
  approved_at: string | null;
  monthly_fee: number;
  payment_reference: string | null;
  paid_until: string | null;
  last_payment_at: string | null;
  last_payment_amount: number | null;
  last_payment_reference: string | null;
  landlord_code: string | null;
  payment_number: string | null;
  payment_method: string | null;
  discount_percent: number | null;
  billing_plan: string | null;
  offer_note: string | null;
  rent_payment_number?: string | null;
  rent_payment_method?: string | null;
  rent_payment_note?: string | null;
  trial_ends_at?: string | null;
  created_at: string;
};

/** WhatsApp line landlords use when a payment was made but not yet recorded. */
export const SUPPORT_WHATSAPP = "254706747498";

/** Free trial length for new landlord accounts. */
export const TRIAL_DAYS = 14;

export type TrialState = { active: boolean; daysLeft: number; endsAt: Date | null };

/** Where a landlord stands in their free trial. */
export function trialState(
  account: Pick<LandlordAccount, "trial_ends_at" | "created_at">,
): TrialState {
  const raw = account.trial_ends_at
    ? new Date(account.trial_ends_at)
    : new Date(new Date(account.created_at).getTime() + TRIAL_DAYS * 86400000);
  if (Number.isNaN(raw.getTime())) return { active: false, daysLeft: 0, endsAt: null };
  const daysLeft = Math.ceil((raw.getTime() - Date.now()) / 86400000);
  return { active: daysLeft > 0, daysLeft: Math.max(0, daysLeft), endsAt: raw };
}

/** Opens WhatsApp with a ready-made "payment not received" message. */
export function whatsappSupportLink(message: string, number?: string | null) {
  const line = String(number ?? SUPPORT_WHATSAPP).replace(/[^0-9]/g, "") || SUPPORT_WHATSAPP;
  return `https://wa.me/${line}?text=${encodeURIComponent(message)}`;
}


/** Platform-wide subscription pricing controlled by the main account. */
export type PlatformPricing = {
  id: string;
  base_monthly: number;
  loyalty_after_months: number;
  loyalty_discount_percent: number;
  annual_discount_percent: number;
  offer_note: string | null;
  support_whatsapp?: string | null;
};

export const DEFAULT_PRICING: PlatformPricing = {
  id: "default",
  base_monthly: 999,
  loyalty_after_months: 3,
  loyalty_discount_percent: 10,
  annual_discount_percent: 20,
  offer_note: null,
  support_whatsapp: SUPPORT_WHATSAPP,
};

/** Loads the platform pricing settings (readable by any signed-in user). */
export function usePlatformPricing() {
  return useQuery({
    queryKey: ["platform-pricing"],
    queryFn: async (): Promise<PlatformPricing> => {
      const { data } = await (supabase as any)
        .from("platform_pricing")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      return (data as PlatformPricing) ?? DEFAULT_PRICING;
    },
    staleTime: 60_000,
  });
}

/** What a landlord actually pays, after their discount and billing plan. */
export function effectivePrice(
  account: Pick<LandlordAccount, "monthly_fee" | "discount_percent" | "billing_plan">,
  pricing: PlatformPricing,
) {
  const base = Number(account.monthly_fee ?? pricing.base_monthly) || 0;
  const discount = Math.min(100, Math.max(0, Number(account.discount_percent ?? 0)));
  const monthly = Math.round(base * (1 - discount / 100));
  const yearly = Math.round(monthly * 12 * (1 - Number(pricing.annual_discount_percent || 0) / 100));
  const annual = account.billing_plan === "annual";
  return {
    base,
    discount,
    monthly,
    yearly,
    annual,
    dueNow: annual ? yearly : monthly,
    label: annual ? "per year" : "per month",
  };
}

/** Months a landlord has been on the platform (used for the loyalty offer). */
export function monthsOnPlatform(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (30 * 86400000));
}


/** Human label for the M-Pesa payment method stored on a landlord account. */
export const PAYMENT_METHODS = [
  { value: "mpesa_send_money", label: "M-Pesa Send Money" },
  { value: "mpesa_till", label: "M-Pesa Till (Buy Goods)" },
  { value: "mpesa_paybill", label: "M-Pesa Paybill" },
  { value: "bank", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
] as const;

export function paymentMethodLabel(value: string | null | undefined) {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? "M-Pesa Send Money";
}

export type SubscriptionState = {
  label: string;
  tone: "active" | "due" | "overdue" | "none";
  daysLeft: number | null;
  paidUntil: Date | null;
};

/** Derives a human subscription state from a landlord account's paid_until date. */
export function subscriptionState(account: Pick<LandlordAccount, "paid_until">): SubscriptionState {
  if (!account.paid_until) {
    return { label: "No payment recorded", tone: "none", daysLeft: null, paidUntil: null };
  }
  const paidUntil = new Date(account.paid_until + "T00:00:00");
  const daysLeft = Math.ceil((paidUntil.getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) {
    return { label: `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"}`, tone: "overdue", daysLeft, paidUntil };
  }
  if (daysLeft <= 5) {
    return { label: daysLeft === 0 ? "Due today" : `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, tone: "due", daysLeft, paidUntil };
  }
  return { label: `Active — ${daysLeft} days left`, tone: "active", daysLeft, paidUntil };
}

/** UI hint only — real admin power is enforced by database access rules. */
export function useIsSuperAdmin() {
  const [isSuper, setIsSuper] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;
      const { data } = await supabase.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      if (active) setIsSuper(!!data);
    })();
    return () => {
      active = false;
    };
  }, []);
  return isSuper;
}

/**
 * Loads (and lazily creates) the signed-in landlord's account record.
 * New landlords start as "pending" until the main account approves them.
 */
export function useLandlordAccount() {
  return useQuery({
    queryKey: ["landlord-account"],
    queryFn: async (): Promise<LandlordAccount | null> => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return null;

      const { data: adminRow } = await supabase
        .from("super_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const isSuper = !!adminRow;

      // A tenant account has no landlord record and should not get one.
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (tenantRow && !isSuper) return null;

      // Property managers work under a landlord who already pays: show that
      // landlord's account (same landlord code, same payment details), no gate.
      const { data: managerRow } = await (supabase as any)
        .from("property_managers")
        .select("id,landlord_user_id,active")
        .eq("manager_user_id", user.id)
        .order("active", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (managerRow && !isSuper) {
        // A switched-off manager keeps no access at all.
        if (!(managerRow as any).active) return null;
        const { data: employer } = await supabase
          .from("landlord_accounts")
          .select("*")
          .eq("user_id", (managerRow as any).landlord_user_id)
          .maybeSingle();
        return (employer as LandlordAccount) ?? null;
      }


      const { data: existing } = await supabase
        .from("landlord_accounts")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing) return existing as LandlordAccount;

      const { data: created } = await supabase
        .from("landlord_accounts")
        .insert({
          user_id: user.id,
          email: user.email ?? null,
          full_name: (user.user_metadata as any)?.full_name ?? user.email ?? null,
          status: isSuper ? "approved" : "pending",
          approved_at: isSuper ? new Date().toISOString() : null,
        })
        .select()
        .maybeSingle();

      return (created as LandlordAccount) ?? null;
    },
    staleTime: 15_000,
  });
}

/** Manager record state for the signed-in user: active, switched off, or none. */
export function useManagerStatus() {
  const { data } = useQuery({
    queryKey: ["manager-status"],
    queryFn: async (): Promise<{ isManager: boolean; isDisabled: boolean }> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return { isManager: false, isDisabled: false };
      const { data: rows } = await (supabase as any)
        .from("property_managers")
        .select("id,active")
        .eq("manager_user_id", auth.user.id);
      const list = (rows ?? []) as { active: boolean }[];
      if (list.length === 0) return { isManager: false, isDisabled: false };
      const active = list.some((r) => r.active);
      return { isManager: active, isDisabled: !active };
    },
    staleTime: 30_000,
  });
  return data ?? { isManager: false, isDisabled: false };
}

/** True when the signed-in user is a property manager working for a landlord. */
export function useIsPropertyManager() {
  return useManagerStatus().isManager;
}

