
CREATE POLICY "Tenants can view their own payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = payments.tenant_id
        AND t.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Tenants can view their own mpesa transactions"
  ON public.mpesa_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = mpesa_transactions.tenant_id
        AND t.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Tenants can view their own utility readings"
  ON public.utility_readings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = utility_readings.tenant_id
        AND t.auth_user_id = auth.uid()
    )
  );
