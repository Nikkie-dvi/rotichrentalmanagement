
CREATE TABLE IF NOT EXISTS public.platform_pricing (
  id text PRIMARY KEY DEFAULT 'default',
  base_monthly numeric NOT NULL DEFAULT 999,
  loyalty_after_months integer NOT NULL DEFAULT 3,
  loyalty_discount_percent numeric NOT NULL DEFAULT 10,
  annual_discount_percent numeric NOT NULL DEFAULT 20,
  offer_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_pricing TO authenticated;
GRANT ALL ON public.platform_pricing TO service_role;

ALTER TABLE public.platform_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read pricing" ON public.platform_pricing;
CREATE POLICY "Authenticated read pricing" ON public.platform_pricing
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admin manages pricing" ON public.platform_pricing;
CREATE POLICY "Super admin manages pricing" ON public.platform_pricing
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()));

GRANT INSERT, UPDATE, DELETE ON public.platform_pricing TO authenticated;

DROP TRIGGER IF EXISTS platform_pricing_updated_at ON public.platform_pricing;
CREATE TRIGGER platform_pricing_updated_at BEFORE UPDATE ON public.platform_pricing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_pricing (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.landlord_accounts
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_plan text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS offer_note text;

CREATE OR REPLACE FUNCTION public.landlord_accounts_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
  base numeric;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()) INTO is_admin;
  SELECT base_monthly INTO base FROM public.platform_pricing WHERE id = 'default';

  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin THEN
      NEW.status := 'pending';
      NEW.approved_at := NULL;
      NEW.declined_reason := NULL;
      NEW.paid_until := NULL;
      NEW.last_payment_at := NULL;
      NEW.last_payment_amount := NULL;
      NEW.last_payment_reference := NULL;
      NEW.payment_number := NULL;
      NEW.payment_method := 'mpesa_send_money';
      NEW.monthly_fee := COALESCE(base, 999);
      NEW.discount_percent := 0;
      NEW.billing_plan := 'monthly';
      NEW.offer_note := NULL;
    ELSE
      NEW.monthly_fee := COALESCE(NEW.monthly_fee, base, 999);
    END IF;
    RETURN NEW;
  END IF;

  IF NOT is_admin THEN
    NEW.status := OLD.status;
    NEW.approved_at := OLD.approved_at;
    NEW.declined_reason := OLD.declined_reason;
    NEW.user_id := OLD.user_id;
    NEW.paid_until := OLD.paid_until;
    NEW.last_payment_at := OLD.last_payment_at;
    NEW.last_payment_amount := OLD.last_payment_amount;
    NEW.last_payment_reference := OLD.last_payment_reference;
    NEW.payment_number := OLD.payment_number;
    NEW.payment_method := OLD.payment_method;
    NEW.monthly_fee := OLD.monthly_fee;
    NEW.discount_percent := OLD.discount_percent;
    NEW.billing_plan := OLD.billing_plan;
    NEW.offer_note := OLD.offer_note;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
