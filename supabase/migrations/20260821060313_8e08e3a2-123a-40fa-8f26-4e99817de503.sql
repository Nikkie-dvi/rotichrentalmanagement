-- 1) Tenants: remove the self-insert path (registration runs server-side with
-- elevated rights) and stop tenants editing ownership/approval on their row.
DROP POLICY IF EXISTS "Tenant inserts own tenant row" ON public.tenants;

CREATE OR REPLACE FUNCTION public.tenants_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / server-side maintenance
  END IF;
  IF OLD.owner_id = auth.uid() OR public.manages_owner(OLD.owner_id) THEN
    RETURN NEW; -- landlord or their manager
  END IF;
  -- Anyone else here is the tenant themselves: lock ownership/approval fields.
  NEW.owner_id := OLD.owner_id;
  NEW.auth_user_id := OLD.auth_user_id;
  NEW.approval_status := OLD.approval_status;
  NEW.declined_reason := OLD.declined_reason;
  NEW.unit_id := OLD.unit_id;
  NEW.deposit_paid := OLD.deposit_paid;
  NEW.rent_due_day := OLD.rent_due_day;
  NEW.active := OLD.active;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tenants_guard_self_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tenants_guard_self_update ON public.tenants;
CREATE TRIGGER trg_tenants_guard_self_update
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tenants_guard_self_update();

-- 2) Maintenance tickets: owner_id must be the tenant's real landlord.
DROP POLICY IF EXISTS "Tenant creates own tickets" ON public.maintenance_tickets;
CREATE POLICY "Tenant creates own tickets"
ON public.maintenance_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = maintenance_tickets.tenant_id
      AND t.auth_user_id = auth.uid()
      AND t.owner_id = maintenance_tickets.owner_id
  )
);

-- 3) Move-out requests: same ownership cross-check.
DROP POLICY IF EXISTS "Tenant creates own move out request" ON public.move_out_requests;
CREATE POLICY "Tenant creates own move out request"
ON public.move_out_requests
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = move_out_requests.tenant_id
      AND t.auth_user_id = auth.uid()
      AND t.owner_id = move_out_requests.owner_id
  )
);