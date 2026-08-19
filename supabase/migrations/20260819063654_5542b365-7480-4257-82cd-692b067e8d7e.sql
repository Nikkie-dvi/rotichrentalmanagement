CREATE TABLE public.property_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (landlord_user_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_managers TO authenticated;
GRANT ALL ON public.property_managers TO service_role;

ALTER TABLE public.property_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Landlords manage their own managers"
  ON public.property_managers FOR ALL TO authenticated
  USING (landlord_user_id = auth.uid())
  WITH CHECK (landlord_user_id = auth.uid());

CREATE POLICY "Managers can see their own record"
  ON public.property_managers FOR SELECT TO authenticated
  USING (manager_user_id = auth.uid());

CREATE TRIGGER property_managers_updated_at
  BEFORE UPDATE ON public.property_managers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.manages_owner(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_managers pm
    WHERE pm.manager_user_id = auth.uid()
      AND pm.landlord_user_id = _owner
      AND pm.active
  )
$$;

REVOKE ALL ON FUNCTION public.manages_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manages_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manages_owner(uuid) TO service_role;

CREATE POLICY "Managers read properties" ON public.properties FOR SELECT TO authenticated USING (public.manages_owner(owner_id));
CREATE POLICY "Managers read units" ON public.units FOR SELECT TO authenticated USING (public.manages_owner(owner_id));
CREATE POLICY "Managers read tenants" ON public.tenants FOR SELECT TO authenticated USING (public.manages_owner(owner_id));
CREATE POLICY "Managers read invoices" ON public.invoices FOR SELECT TO authenticated USING (public.manages_owner(owner_id));
CREATE POLICY "Managers read payments" ON public.payments FOR SELECT TO authenticated USING (public.manages_owner(owner_id));
CREATE POLICY "Managers read utility readings" ON public.utility_readings FOR SELECT TO authenticated USING (public.manages_owner(owner_id));
CREATE POLICY "Managers read mpesa transactions" ON public.mpesa_transactions FOR SELECT TO authenticated USING (public.manages_owner(owner_id));
CREATE POLICY "Managers read maintenance tickets" ON public.maintenance_tickets FOR SELECT TO authenticated USING (public.manages_owner(owner_id));
CREATE POLICY "Managers update maintenance tickets" ON public.maintenance_tickets FOR UPDATE TO authenticated USING (public.manages_owner(owner_id)) WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers read move out requests" ON public.move_out_requests FOR SELECT TO authenticated USING (public.manages_owner(owner_id));
