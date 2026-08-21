CREATE POLICY "Tenant reads own credit events"
ON public.tenant_credit_events
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenants t
  WHERE t.id = tenant_credit_events.tenant_id
    AND t.auth_user_id = auth.uid()
));