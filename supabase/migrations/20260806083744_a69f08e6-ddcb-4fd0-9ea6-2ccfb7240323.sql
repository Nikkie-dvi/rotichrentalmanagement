CREATE OR REPLACE FUNCTION public.landlord_accounts_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()) INTO is_admin;

  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin THEN
      NEW.status := 'pending';
      NEW.approved_at := NULL;
      NEW.declined_reason := NULL;
      NEW.paid_until := NULL;
      NEW.last_payment_at := NULL;
      NEW.last_payment_amount := NULL;
      NEW.last_payment_reference := NULL;
    END IF;
    NEW.monthly_fee := 2500;
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
  END IF;
  NEW.monthly_fee := OLD.monthly_fee;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.units_guard_tenant_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Owners (landlords) may change anything on their own units.
  IF OLD.owner_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Anyone else reaching this row is a tenant via the tenant UPDATE policy:
  -- allow the status column only.
  NEW.property_id := OLD.property_id;
  NEW.unit_number := OLD.unit_number;
  NEW.rent_amount := OLD.rent_amount;
  NEW.owner_id := OLD.owner_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_units_guard_tenant_update ON public.units;
CREATE TRIGGER trg_units_guard_tenant_update
BEFORE UPDATE ON public.units
FOR EACH ROW EXECUTE FUNCTION public.units_guard_tenant_update();

REVOKE EXECUTE ON FUNCTION public.units_guard_tenant_update() FROM PUBLIC, anon, authenticated;