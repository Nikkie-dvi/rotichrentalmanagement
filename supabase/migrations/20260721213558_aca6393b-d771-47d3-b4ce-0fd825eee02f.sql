-- Remove overly-permissive public policies and restrict to authenticated users only.
-- Also revokes anon grants so PostgREST cannot reach these tables without a session.

-- ============ invoices ============
DROP POLICY IF EXISTS "Public access invoices" ON public.invoices;
REVOKE ALL ON public.invoices FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (true);

-- ============ mpesa_transactions ============
DROP POLICY IF EXISTS "Public access mpesa_transactions" ON public.mpesa_transactions;
REVOKE ALL ON public.mpesa_transactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mpesa_transactions TO authenticated;
GRANT ALL ON public.mpesa_transactions TO service_role;
ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read mpesa_transactions" ON public.mpesa_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert mpesa_transactions" ON public.mpesa_transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update mpesa_transactions" ON public.mpesa_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete mpesa_transactions" ON public.mpesa_transactions FOR DELETE TO authenticated USING (true);

-- ============ payments ============
DROP POLICY IF EXISTS "Public access payments" ON public.payments;
REVOKE ALL ON public.payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update payments" ON public.payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete payments" ON public.payments FOR DELETE TO authenticated USING (true);

-- ============ tenants ============
DROP POLICY IF EXISTS "Public access tenants" ON public.tenants;
REVOKE ALL ON public.tenants FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tenants" ON public.tenants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tenants" ON public.tenants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tenants" ON public.tenants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete tenants" ON public.tenants FOR DELETE TO authenticated USING (true);

-- ============ utility_readings ============
DROP POLICY IF EXISTS "Public access utility_readings" ON public.utility_readings;
REVOKE ALL ON public.utility_readings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.utility_readings TO authenticated;
GRANT ALL ON public.utility_readings TO service_role;
ALTER TABLE public.utility_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read utility_readings" ON public.utility_readings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert utility_readings" ON public.utility_readings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update utility_readings" ON public.utility_readings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete utility_readings" ON public.utility_readings FOR DELETE TO authenticated USING (true);

-- ============ properties ============
DROP POLICY IF EXISTS "Public access properties" ON public.properties;
REVOKE ALL ON public.properties FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read properties" ON public.properties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert properties" ON public.properties FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update properties" ON public.properties FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete properties" ON public.properties FOR DELETE TO authenticated USING (true);

-- ============ units ============
DROP POLICY IF EXISTS "Public access units" ON public.units;
REVOKE ALL ON public.units FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read units" ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert units" ON public.units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update units" ON public.units FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete units" ON public.units FOR DELETE TO authenticated USING (true);
