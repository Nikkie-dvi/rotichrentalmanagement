
-- 1) Extend tenants with login + lease fields
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS lease_signature text,
  ADD COLUMN IF NOT EXISTS lease_signed_at timestamptz;

-- Tenant self-access policies on tenants
CREATE POLICY "Tenant selects own tenant row"
  ON public.tenants FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "Tenant updates own tenant row"
  ON public.tenants FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Tenant inserts own tenant row"
  ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- Tenant can read their assigned unit
CREATE POLICY "Tenant views own unit"
  ON public.units FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.unit_id = units.id AND t.auth_user_id = auth.uid()
  ));

-- Tenant can update their unit's status (needed at lease signing to mark occupied)
CREATE POLICY "Tenant updates own unit status"
  ON public.units FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.unit_id = units.id AND t.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.unit_id = units.id AND t.auth_user_id = auth.uid()
  ));

-- Tenant can read their property (for showing name/location)
CREATE POLICY "Tenant views own property"
  ON public.properties FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u
    JOIN public.tenants t ON t.unit_id = u.id
    WHERE u.property_id = properties.id AND t.auth_user_id = auth.uid()
  ));

-- Tenant can read their invoices
CREATE POLICY "Tenant views own invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = invoices.tenant_id AND t.auth_user_id = auth.uid()
  ));

-- 2) Maintenance tickets
CREATE TABLE IF NOT EXISTS public.maintenance_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('plumbing','electrical','structural','security','other')),
  urgency text NOT NULL CHECK (urgency IN ('low','medium','high')),
  description text NOT NULL,
  image_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_tickets TO authenticated;
GRANT ALL ON public.maintenance_tickets TO service_role;

ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Landlord manages all their tickets"
  ON public.maintenance_tickets FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Tenant reads own tickets"
  ON public.maintenance_tickets FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = tenant_id AND t.auth_user_id = auth.uid()
  ));

CREATE POLICY "Tenant creates own tickets"
  ON public.maintenance_tickets FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = tenant_id AND t.auth_user_id = auth.uid()
  ));

-- updated_at helper (reused for future tables)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_maintenance_tickets_updated_at
BEFORE UPDATE ON public.maintenance_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_tickets;
ALTER TABLE public.maintenance_tickets REPLICA IDENTITY FULL;
