
-- Tenants upload into a folder named after their tenant UUID
CREATE POLICY "Tenant uploads own maintenance images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'maintenance-attachments'
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.auth_user_id = auth.uid()
        AND (storage.foldername(name))[1] = t.id::text
    )
  );

CREATE POLICY "Tenant views own maintenance images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'maintenance-attachments'
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.auth_user_id = auth.uid()
        AND (storage.foldername(name))[1] = t.id::text
    )
  );

CREATE POLICY "Landlord views their tenants' maintenance images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'maintenance-attachments'
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.owner_id = auth.uid()
        AND (storage.foldername(name))[1] = t.id::text
    )
  );
