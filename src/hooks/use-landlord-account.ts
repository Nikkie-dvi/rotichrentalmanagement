import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  created_at: string;
};

export function useIsSuperAdmin() {
  const [isSuper, setIsSuper] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsSuper((data.user?.email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL);
    });
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

      const isSuper = (user.email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL;

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
