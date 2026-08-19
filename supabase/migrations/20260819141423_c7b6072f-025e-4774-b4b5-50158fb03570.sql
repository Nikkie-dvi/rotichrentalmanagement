ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS late_penalty_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS penalty_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS penalty_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS penalty_waive_reason text;

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  kind text NOT NULL DEFAULT 'extra',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own invoice line items" ON public.invoice_line_items
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.manages_owner(owner_id))
  WITH CHECK (owner_id = auth.uid() OR public.manages_owner(owner_id));

CREATE POLICY "Tenants read own invoice line items" ON public.invoice_line_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.tenants t ON t.id = i.tenant_id
    WHERE i.id = invoice_line_items.invoice_id AND t.auth_user_id = auth.uid()
  ));

CREATE TABLE IF NOT EXISTS public.billing_settings (
  owner_id uuid PRIMARY KEY DEFAULT auth.uid(),
  default_due_day integer NOT NULL DEFAULT 5,
  grace_days integer NOT NULL DEFAULT 5,
  penalty_type text NOT NULL DEFAULT 'fixed',
  penalty_value numeric NOT NULL DEFAULT 500,
  penalty_max numeric,
  auto_penalties_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_template text NOT NULL DEFAULT 'Hi {tenant_name}, a late fee of {penalty_amount} has been added to your rent. Your updated balance is {total_balance}, due by {due_date}.',
  email_subject text NOT NULL DEFAULT 'Late payment fee added to your rent',
  email_template text NOT NULL DEFAULT 'Hi {tenant_name}, a late fee of {penalty_amount} has been added to your invoice for {month}. Your updated total balance is {total_balance}, due by {due_date}. Please clear it as soon as possible.',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own billing settings" ON public.billing_settings
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.manages_owner(owner_id))
  WITH CHECK (owner_id = auth.uid() OR public.manages_owner(owner_id));

CREATE TRIGGER billing_settings_updated_at BEFORE UPDATE ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  channel text NOT NULL,
  recipient text,
  subject text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_logs_owner_idx ON public.notification_logs(owner_id, created_at DESC);
GRANT SELECT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own notification logs" ON public.notification_logs
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.manages_owner(owner_id));

CREATE POLICY "Tenants read own notification logs" ON public.notification_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = notification_logs.tenant_id AND t.auth_user_id = auth.uid()
  ));