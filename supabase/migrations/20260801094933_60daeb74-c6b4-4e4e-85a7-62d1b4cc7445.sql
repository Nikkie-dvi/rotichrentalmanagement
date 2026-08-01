CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'lnick8081@gmail.com';
$$;

CREATE TABLE public.landlord_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  phone text,
  status text NOT NULL DEFAULT 'pending',
  declined_reason text,
  approved_at timestamptz,
  monthly_fee numeric NOT NULL DEFAULT 2500,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.landlord_accounts TO authenticated;
GRANT ALL ON public.landlord_accounts TO service_role;

ALTER TABLE public.landlord_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Landlord reads own account" ON public.landlord_accounts
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Landlord creates own account" ON public.landlord_accounts
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Landlord updates own account" ON public.landlord_accounts
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admin manages all landlord accounts" ON public.landlord_accounts
FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.landlord_accounts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_super_admin() THEN
      NEW.status := 'pending';
      NEW.approved_at := NULL;
      NEW.declined_reason := NULL;
    END IF;
    NEW.monthly_fee := 2500;
    RETURN NEW;
  END IF;

  IF NOT public.is_super_admin() THEN
    NEW.status := OLD.status;
    NEW.approved_at := OLD.approved_at;
    NEW.declined_reason := OLD.declined_reason;
  END IF;
  NEW.monthly_fee := OLD.monthly_fee;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER landlord_accounts_guard_trg
BEFORE INSERT OR UPDATE ON public.landlord_accounts
FOR EACH ROW EXECUTE FUNCTION public.landlord_accounts_guard();

INSERT INTO public.landlord_accounts (user_id, email, full_name, status, approved_at)
SELECT u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', u.email), 'approved', now()
FROM auth.users u
WHERE lower(u.email) = 'lnick8081@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.landlord_accounts REPLICA IDENTITY FULL;