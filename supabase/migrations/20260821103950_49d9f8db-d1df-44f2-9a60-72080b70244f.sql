-- app_branding: keep the public logo readable but scope it to the single default row
DROP POLICY IF EXISTS "Anyone can read branding" ON public.app_branding;
CREATE POLICY "Public can read default branding logo"
ON public.app_branding FOR SELECT TO anon, authenticated
USING (id = 'default');

-- platform_pricing: only landlords (and super admins) may read pricing, not every signed-in user
DROP POLICY IF EXISTS "Authenticated read pricing" ON public.platform_pricing;
CREATE POLICY "Landlords and admins read pricing"
ON public.platform_pricing FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.landlord_accounts la WHERE la.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
);

REVOKE ALL ON public.platform_pricing FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.app_branding FROM anon;
GRANT SELECT ON public.app_branding TO anon, authenticated;