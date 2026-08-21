CREATE POLICY "Only super admins delete landlord accounts"
ON public.landlord_accounts
FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()));