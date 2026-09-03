
CREATE POLICY "Managers write payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers update payments" ON public.payments FOR UPDATE TO authenticated USING (public.manages_owner(owner_id)) WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers delete payments" ON public.payments FOR DELETE TO authenticated USING (public.manages_owner(owner_id));

CREATE POLICY "Managers write invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers update invoices" ON public.invoices FOR UPDATE TO authenticated USING (public.manages_owner(owner_id)) WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers delete invoices" ON public.invoices FOR DELETE TO authenticated USING (public.manages_owner(owner_id));

CREATE POLICY "Managers write utility readings" ON public.utility_readings FOR INSERT TO authenticated WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers update utility readings" ON public.utility_readings FOR UPDATE TO authenticated USING (public.manages_owner(owner_id)) WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers delete utility readings" ON public.utility_readings FOR DELETE TO authenticated USING (public.manages_owner(owner_id));

CREATE POLICY "Managers write mpesa transactions" ON public.mpesa_transactions FOR INSERT TO authenticated WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers update mpesa transactions" ON public.mpesa_transactions FOR UPDATE TO authenticated USING (public.manages_owner(owner_id)) WITH CHECK (public.manages_owner(owner_id));

CREATE POLICY "Managers write tenants" ON public.tenants FOR INSERT TO authenticated WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers update tenants" ON public.tenants FOR UPDATE TO authenticated USING (public.manages_owner(owner_id)) WITH CHECK (public.manages_owner(owner_id));

CREATE POLICY "Managers write units" ON public.units FOR INSERT TO authenticated WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers update units" ON public.units FOR UPDATE TO authenticated USING (public.manages_owner(owner_id)) WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers delete units" ON public.units FOR DELETE TO authenticated USING (public.manages_owner(owner_id));

CREATE POLICY "Managers write properties" ON public.properties FOR INSERT TO authenticated WITH CHECK (public.manages_owner(owner_id));
CREATE POLICY "Managers update properties" ON public.properties FOR UPDATE TO authenticated USING (public.manages_owner(owner_id)) WITH CHECK (public.manages_owner(owner_id));

CREATE POLICY "Managers update move out requests" ON public.move_out_requests FOR UPDATE TO authenticated USING (public.manages_owner(owner_id)) WITH CHECK (public.manages_owner(owner_id));
