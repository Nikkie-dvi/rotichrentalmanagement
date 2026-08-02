-- 1. Admin allow-list table (replaces hardcoded email check)
CREATE TABLE public.super_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.super_admins TO authenticated;
GRANT ALL ON public.super_admins TO service_role;
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read own admin row"
  ON public.super_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

INSERT INTO public.super_admins (user_id)
SELECT user_id FROM public.landlord_accounts WHERE lower(email) = 'lnick8081@gmail.com'
ON CONFLICT DO NOTHING;

-- 2. Replace policies that used is_super_admin()
DROP POLICY IF EXISTS "Super admin manages all landlord accounts" ON public.landlord_accounts;
CREATE POLICY "Super admin manages all landlord accounts"
  ON public.landlord_accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()));

DROP POLICY IF EXISTS "Super admin manages subscription payments" ON public.landlord_subscription_payments;
CREATE POLICY "Super admin manages subscription payments"
  ON public.landlord_subscription_payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()));

-- 3. Guard trigger no longer depends on the email helper
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
    END IF;
    NEW.monthly_fee := 2500;
    RETURN NEW;
  END IF;

  IF NOT is_admin THEN
    NEW.status := OLD.status;
    NEW.approved_at := OLD.approved_at;
    NEW.declined_reason := OLD.declined_reason;
  END IF;
  NEW.monthly_fee := OLD.monthly_fee;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.is_super_admin();

-- 4. Internal helper routines must not be directly callable by app users
REVOKE ALL ON FUNCTION public.apply_subscription_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.landlord_accounts_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tenants_set_rent_due_day() FROM PUBLIC, anon, authenticated;

-- 5. Maintenance attachment management (update/delete) for the owning tenant and landlord
CREATE POLICY "Tenant manages own maintenance images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'maintenance-attachments' AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.auth_user_id = auth.uid() AND (storage.foldername(objects.name))[1] = t.id::text))
  WITH CHECK (bucket_id = 'maintenance-attachments' AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.auth_user_id = auth.uid() AND (storage.foldername(objects.name))[1] = t.id::text));

CREATE POLICY "Tenant deletes own maintenance images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'maintenance-attachments' AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.auth_user_id = auth.uid() AND (storage.foldername(objects.name))[1] = t.id::text));

CREATE POLICY "Landlord manages tenants maintenance images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'maintenance-attachments' AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.owner_id = auth.uid() AND (storage.foldername(objects.name))[1] = t.id::text))
  WITH CHECK (bucket_id = 'maintenance-attachments' AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.owner_id = auth.uid() AND (storage.foldername(objects.name))[1] = t.id::text));

CREATE POLICY "Landlord deletes tenants maintenance images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'maintenance-attachments' AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.owner_id = auth.uid() AND (storage.foldername(objects.name))[1] = t.id::text));

-- 6. Limit tenant PII in realtime change payloads to the primary key for old rows
ALTER TABLE public.tenants REPLICA IDENTITY DEFAULT;