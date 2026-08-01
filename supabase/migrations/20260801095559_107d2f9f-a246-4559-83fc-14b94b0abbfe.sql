ALTER TABLE public.landlord_accounts
  ADD COLUMN IF NOT EXISTS paid_until date,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_amount numeric,
  ADD COLUMN IF NOT EXISTS last_payment_reference text;

CREATE TABLE IF NOT EXISTS public.landlord_subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_account_id uuid NOT NULL REFERENCES public.landlord_accounts(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 2500,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  months_covered integer NOT NULL DEFAULT 1,
  note text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.landlord_subscription_payments TO authenticated;
GRANT ALL ON public.landlord_subscription_payments TO service_role;

ALTER TABLE public.landlord_subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages subscription payments"
  ON public.landlord_subscription_payments FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Landlord views own subscription payments"
  ON public.landlord_subscription_payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.landlord_accounts la
    WHERE la.id = landlord_subscription_payments.landlord_account_id
      AND la.user_id = auth.uid()
  ));

CREATE TRIGGER landlord_subscription_payments_updated_at
  BEFORE UPDATE ON public.landlord_subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.apply_subscription_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base date;
BEGIN
  SELECT GREATEST(COALESCE(paid_until, NEW.payment_date), NEW.payment_date)
    INTO base FROM public.landlord_accounts WHERE id = NEW.landlord_account_id;

  UPDATE public.landlord_accounts
     SET paid_until = base + (COALESCE(NEW.months_covered, 1) || ' months')::interval,
         last_payment_at = now(),
         last_payment_amount = NEW.amount,
         last_payment_reference = NEW.reference
   WHERE id = NEW.landlord_account_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER landlord_subscription_payment_applied
  AFTER INSERT ON public.landlord_subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_subscription_payment();