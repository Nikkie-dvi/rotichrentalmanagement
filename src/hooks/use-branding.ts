import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/eden-point-logo.png.asset.json";

/** The logo shipped with the app, used until a custom one is uploaded. */
export const DEFAULT_LOGO_URL = logoAsset.url;

/** Current app logo — set by the main account on the Branding page. */
export function useAppLogo() {
  const { data } = useQuery({
    queryKey: ["app-branding"],
    queryFn: async (): Promise<string | null> => {
      const { data } = await (supabase as any)
        .from("app_branding")
        .select("logo_url")
        .eq("id", "default")
        .maybeSingle();
      return (data?.logo_url as string | null) ?? null;
    },
    staleTime: 5 * 60_000,
  });
  return data || DEFAULT_LOGO_URL;
}
