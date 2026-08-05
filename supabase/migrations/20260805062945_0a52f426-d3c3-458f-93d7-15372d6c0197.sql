-- 1) Tighten unit/property visibility to ACTIVE tenants only
DROP POLICY IF EXISTS "Tenant views own unit" ON public.units;
CREATE POLICY "Tenant views own unit" ON public.units
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenants t
  WHERE t.unit_id = units.id
    AND t.auth_user_id = auth.uid()
    AND t.active
    AND t.move_out_date IS NULL
    AND t.approval_status = 'approved'
));

DROP POLICY IF EXISTS "Tenant updates own unit status" ON public.units;
CREATE POLICY "Tenant updates own unit status" ON public.units
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenants t
  WHERE t.unit_id = units.id
    AND t.auth_user_id = auth.uid()
    AND t.active
    AND t.move_out_date IS NULL
    AND t.approval_status = 'approved'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tenants t
  WHERE t.unit_id = units.id
    AND t.auth_user_id = auth.uid()
    AND t.active
    AND t.move_out_date IS NULL
    AND t.approval_status = 'approved'
));

DROP POLICY IF EXISTS "Tenant views own property" ON public.properties;
CREATE POLICY "Tenant views own property" ON public.properties
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.units u
  JOIN public.tenants t ON t.unit_id = u.id
  WHERE u.property_id = properties.id
    AND t.auth_user_id = auth.uid()
    AND t.active
    AND t.move_out_date IS NULL
    AND t.approval_status = 'approved'
));

-- 2) When a tenant is moved out / deactivated, detach the unit and free it
CREATE OR REPLACE FUNCTION public.tenants_handle_move_out()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  freed uuid;
BEGIN
  IF (NEW.active = false OR NEW.move_out_date IS NOT NULL)
     AND (OLD.active = true AND OLD.move_out_date IS NULL) THEN
    NEW.active := false;
    IF NEW.move_out_date IS NULL THEN
      NEW.move_out_date := CURRENT_DATE;
    END IF;
    freed := NEW.unit_id;
    NEW.unit_id := NULL;
    IF freed IS NOT NULL THEN
      UPDATE public.units SET status = 'vacant' WHERE id = freed;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tenants_handle_move_out() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tenants_handle_move_out ON public.tenants;
CREATE TRIGGER trg_tenants_handle_move_out
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tenants_handle_move_out();