CREATE TABLE public.tenant_credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'detected',
  amount numeric NOT NULL DEFAULT 0,
  delta numeric NOT NULL DEFAULT 0,
  note text,
  acknowledged boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_credit_events TO authenticated;
GRANT ALL ON public.tenant_credit_events TO service_role;

ALTER TABLE public.tenant_credit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Landlord manages own tenant credit events"
ON public.tenant_credit_events FOR ALL TO authenticated
USING (owner_id = auth.uid() OR public.manages_owner(owner_id))
WITH CHECK (owner_id = auth.uid() OR public.manages_owner(owner_id));

CREATE INDEX tenant_credit_events_tenant_idx ON public.tenant_credit_events (tenant_id, created_at DESC);
CREATE INDEX tenant_credit_events_owner_idx ON public.tenant_credit_events (owner_id, acknowledged);

CREATE TRIGGER tenant_credit_events_updated_at
BEFORE UPDATE ON public.tenant_credit_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();