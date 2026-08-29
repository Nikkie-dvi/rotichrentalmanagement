ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS signed_lease_path text,
  ADD COLUMN IF NOT EXISTS signed_lease_name text,
  ADD COLUMN IF NOT EXISTS signed_lease_uploaded_at timestamptz;

CREATE OR REPLACE FUNCTION public.tenants_guard_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.owner_id = auth.uid() OR public.manages_owner(OLD.owner_id) THEN
    RETURN NEW;
  END IF;
  NEW.owner_id := OLD.owner_id;
  NEW.auth_user_id := OLD.auth_user_id;
  NEW.approval_status := OLD.approval_status;
  NEW.declined_reason := OLD.declined_reason;
  NEW.unit_id := OLD.unit_id;
  NEW.deposit_paid := OLD.deposit_paid;
  NEW.rent_due_day := OLD.rent_due_day;
  NEW.active := OLD.active;
  NEW.created_at := OLD.created_at;
  NEW.signed_lease_path := OLD.signed_lease_path;
  NEW.signed_lease_name := OLD.signed_lease_name;
  NEW.signed_lease_uploaded_at := OLD.signed_lease_uploaded_at;
  RETURN NEW;
END;
$function$;