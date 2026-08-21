CREATE TABLE IF NOT EXISTS public.app_branding (
  id text PRIMARY KEY,
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_branding TO anon;
GRANT SELECT, INSERT, UPDATE ON public.app_branding TO authenticated;
GRANT ALL ON public.app_branding TO service_role;
ALTER TABLE public.app_branding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read branding" ON public.app_branding;
CREATE POLICY "Anyone can read branding" ON public.app_branding FOR SELECT USING (true);
DROP POLICY IF EXISTS "Super admins manage branding" ON public.app_branding;
CREATE POLICY "Super admins manage branding" ON public.app_branding FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()));
INSERT INTO public.app_branding (id, logo_url) VALUES ('default', NULL) ON CONFLICT (id) DO NOTHING;