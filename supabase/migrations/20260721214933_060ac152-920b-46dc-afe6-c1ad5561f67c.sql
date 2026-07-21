
-- Add owner_id and backfill
DO $$
DECLARE
  default_owner uuid := 'b70f09c6-3840-46cf-84b7-a418efdcba76';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','units','tenants','invoices','payments','mpesa_transactions','utility_readings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET owner_id = %L WHERE owner_id IS NULL', t, default_owner);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN owner_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN owner_id SET DEFAULT auth.uid()', t);
  END LOOP;
END $$;

-- Drop existing policies and recreate owner-scoped ones
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('properties','units','tenants','invoices','payments','mpesa_transactions','utility_readings')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Owner full access" ON public.properties FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner full access" ON public.units FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner full access" ON public.tenants FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner full access" ON public.invoices FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner full access" ON public.payments FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner full access" ON public.mpesa_transactions FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner full access" ON public.utility_readings FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
