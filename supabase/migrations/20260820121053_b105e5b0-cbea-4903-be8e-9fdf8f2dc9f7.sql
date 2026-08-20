-- 1) notification_logs: writes only via service role
REVOKE ALL ON public.notification_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.notification_logs FROM authenticated;
GRANT SELECT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;

-- 2) property_managers: block self-assignment as another landlord's manager
REVOKE ALL ON public.property_managers FROM anon;

CREATE OR REPLACE FUNCTION public.property_managers_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service-role / server-side maintenance
  END IF;

  IF NEW.landlord_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only a landlord can manage their own property managers';
  END IF;

  IF NEW.manager_user_id IS NOT NULL AND NEW.manager_user_id = auth.uid() THEN
    RAISE EXCEPTION 'A user cannot assign themselves as a property manager';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_managers_guard_trg ON public.property_managers;
CREATE TRIGGER property_managers_guard_trg
BEFORE INSERT OR UPDATE ON public.property_managers
FOR EACH ROW EXECUTE FUNCTION public.property_managers_guard();

-- 3) tenants: explicit owner-only delete rule
DROP POLICY IF EXISTS "Owners delete own tenants" ON public.tenants;
CREATE POLICY "Owners delete own tenants"
ON public.tenants FOR DELETE TO authenticated
USING (auth.uid() = owner_id);

-- 4) SECURITY DEFINER helpers: only signed-in users (needed by RLS), never anon/public
REVOKE ALL ON FUNCTION public.manages_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manages_owner(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.property_managers_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sms_charge(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sms_credit(uuid, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_landlord_code() FROM PUBLIC, anon, authenticated;