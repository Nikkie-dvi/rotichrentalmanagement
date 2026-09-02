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
  -- Self-service tenant: only signature/contact fields may change.
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
  NEW.move_in_date := OLD.move_in_date;
  NEW.move_out_date := OLD.move_out_date;
  NEW.id := OLD.id;
  -- lease signature can only be set once, never overwritten or cleared
  IF OLD.lease_signature IS NOT NULL THEN
    NEW.lease_signature := OLD.lease_signature;
    NEW.lease_signed_at := OLD.lease_signed_at;
  ELSIF NEW.lease_signature IS NOT NULL THEN
    NEW.lease_signed_at := now();
  ELSE
    NEW.lease_signed_at := OLD.lease_signed_at;
  END IF;
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
  IF auth.uid() IS NULL
     OR OLD.owner_id = auth.uid()
     OR public.manages_owner(OLD.owner_id) THEN
    RETURN NEW;
  END IF;

  -- Tenant reaching this row via the tenant UPDATE policy: status only.
  NEW.id := OLD.id;
  NEW.property_id := OLD.property_id;
  NEW.unit_number := OLD.unit_number;
  NEW.rent_amount := OLD.rent_amount;
  NEW.unit_type := OLD.unit_type;
  NEW.owner_id := OLD.owner_id;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('vacant', 'occupied', 'maintenance') THEN
    RAISE EXCEPTION 'Invalid unit status';
  END IF;
  RETURN NEW;
END;
$function$;