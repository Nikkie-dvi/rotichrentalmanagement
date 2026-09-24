ALTER TABLE public.property_managers ADD COLUMN IF NOT EXISTS can_edit_units boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.manager_can_edit(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_managers pm
    WHERE pm.manager_user_id = auth.uid() AND pm.landlord_user_id = _owner
      AND pm.active AND pm.can_edit_units
  )
$$;

DROP POLICY IF EXISTS "Managers update units" ON public.units;
DROP POLICY IF EXISTS "Managers delete units" ON public.units;
CREATE POLICY "Managers update units" ON public.units FOR UPDATE TO authenticated
  USING (public.manager_can_edit(owner_id)) WITH CHECK (public.manager_can_edit(owner_id));
CREATE POLICY "Managers delete units" ON public.units FOR DELETE TO authenticated
  USING (public.manager_can_edit(owner_id));

DROP POLICY IF EXISTS "Managers update properties" ON public.properties;
CREATE POLICY "Managers update properties" ON public.properties FOR UPDATE TO authenticated
  USING (public.manager_can_edit(owner_id)) WITH CHECK (public.manager_can_edit(owner_id));
CREATE POLICY "Managers delete properties" ON public.properties FOR DELETE TO authenticated
  USING (public.manager_can_edit(owner_id));

-- Rate limit table for public manager sign-ups (server-only)
CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.signup_attempts TO service_role;
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS signup_attempts_kind_key_idx ON public.signup_attempts(kind, key, created_at);