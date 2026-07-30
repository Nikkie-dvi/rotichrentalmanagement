ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS landlord_note text;

CREATE TABLE IF NOT EXISTS public.move_out_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  requested_date date,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  landlord_response text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.move_out_requests TO authenticated;
GRANT ALL ON public.move_out_requests TO service_role;

ALTER TABLE public.move_out_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Landlord manages move out requests"
ON public.move_out_requests FOR ALL TO authenticated
USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Tenant creates own move out request"
ON public.move_out_requests FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = move_out_requests.tenant_id AND t.auth_user_id = auth.uid()));

CREATE POLICY "Tenant reads own move out requests"
ON public.move_out_requests FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = move_out_requests.tenant_id AND t.auth_user_id = auth.uid()));

CREATE TRIGGER move_out_requests_set_updated_at
BEFORE UPDATE ON public.move_out_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.move_out_requests REPLICA IDENTITY FULL;