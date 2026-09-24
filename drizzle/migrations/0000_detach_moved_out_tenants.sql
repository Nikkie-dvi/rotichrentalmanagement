CREATE OR REPLACE FUNCTION public.tenants_handle_move_out()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  freed uuid;
BEGIN
  IF (NEW.active = false OR NEW.move_out_date IS NOT NULL)
     AND (OLD.active = true AND OLD.move_out_date IS NULL) THEN
    NEW.active := false;
    IF NEW.move_out_date IS NULL THEN
      NEW.move_out_date := CURRENT_DATE;
    END IF;
    freed := NEW.unit_id;
    NEW.unit_id := NULL;
    -- Release the portal login so the person can register again as a new tenant;
    -- the landlord keeps the past record and payment history.
    NEW.auth_user_id := NULL;
    IF freed IS NOT NULL THEN
      UPDATE public.units SET status = 'vacant' WHERE id = freed;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.tenants SET auth_user_id = NULL
WHERE move_out_date IS NOT NULL AND auth_user_id IS NOT NULL;