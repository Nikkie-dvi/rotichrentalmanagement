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
  created_at: string;
};

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
