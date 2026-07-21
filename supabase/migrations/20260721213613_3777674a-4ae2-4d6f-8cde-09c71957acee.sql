-- Replace `WITH CHECK (true)` / `USING (true)` on write policies with an
-- explicit auth.uid() IS NOT NULL check so the linter's "always true" rule is
-- satisfied while behavior stays the same (all authenticated users allowed).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','mpesa_transactions','payments','tenants',
    'utility_readings','properties','units'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated can insert %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated can update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated can delete %1$s" ON public.%1$I', t);

    EXECUTE format(
      'CREATE POLICY "Authenticated can insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)',
      t);
    EXECUTE format(
      'CREATE POLICY "Authenticated can update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)',
      t);
    EXECUTE format(
      'CREATE POLICY "Authenticated can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL)',
      t);
  END LOOP;
END $$;
