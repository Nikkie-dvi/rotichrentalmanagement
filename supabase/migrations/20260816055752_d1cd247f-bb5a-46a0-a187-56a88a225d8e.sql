ALTER TABLE public.landlord_accounts
  ADD COLUMN IF NOT EXISTS payment_number text,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'mpesa_send_money';

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
      NEW.payment_number := NULL;
      NEW.payment_method := 'mpesa_send_money';
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
    NEW.payment_number := OLD.payment_number;
    NEW.payment_method := OLD.payment_method;
  END IF;
  NEW.monthly_fee := OLD.monthly_fee;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;