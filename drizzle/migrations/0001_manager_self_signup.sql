-- Service-role (server) calls count as admin in the landlord guard so the
-- server can create approved landlord accounts for manager sign-ups.
CREATE OR REPLACE FUNCTION public.landlord_accounts_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
  base numeric;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
      OR coalesce(auth.jwt()->>'role','') = 'service_role'
    INTO is_admin;
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
    -- Profile details change only through the verified server flow.
    NEW.full_name := OLD.full_name;
    NEW.phone := CASE WHEN OLD.phone IS NULL OR OLD.phone = '' THEN NEW.phone ELSE OLD.phone END;
    NEW.email := OLD.email;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- How a manager link came about.
ALTER TABLE public.property_managers
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'landlord',
  ADD COLUMN IF NOT EXISTS property_names text[] NOT NULL DEFAULT '{}';

-- Self-registered property manager accounts (billed KES 250 per property).
CREATE TABLE public.manager_accounts (
  user_id uuid PRIMARY KEY,
  full_name text NOT NULL,
  email text,
  phone text,
  property_count integer NOT NULL DEFAULT 1,
  rate_per_property numeric NOT NULL DEFAULT 250,
  monthly_fee numeric GENERATED ALWAYS AS (property_count * rate_per_property) STORED,
  paid_until date,
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.manager_accounts TO authenticated;
GRANT ALL ON public.manager_accounts TO service_role;
ALTER TABLE public.manager_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager reads own account" ON public.manager_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Super admin manages manager accounts" ON public.manager_accounts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()));
CREATE TRIGGER manager_accounts_updated_at BEFORE UPDATE ON public.manager_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Who recorded each payment, so landlords can see their managers' work.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS recorded_by uuid DEFAULT auth.uid();

-- Tenants inherit the owner of their unit (so manager-added tenants belong to the landlord).
CREATE OR REPLACE FUNCTION public.owner_from_unit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE o uuid;
BEGIN
  IF NEW.unit_id IS NOT NULL THEN
    SELECT owner_id INTO o FROM public.units WHERE id = NEW.unit_id;
    IF o IS NOT NULL AND (o = auth.uid() OR public.manages_owner(o) OR auth.uid() IS NULL) THEN
      NEW.owner_id := o;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_tenants_owner BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.owner_from_unit();