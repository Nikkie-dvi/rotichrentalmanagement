ALTER TABLE public.landlord_accounts
  ADD COLUMN IF NOT EXISTS lease_document_path text,
  ADD COLUMN IF NOT EXISTS lease_document_name text,
  ADD COLUMN IF NOT EXISTS lease_document_uploaded_at timestamptz;

CREATE POLICY "Landlords read own lease files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'lease-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Landlords upload own lease files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lease-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Landlords update own lease files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'lease-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'lease-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Landlords delete own lease files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lease-documents' AND (storage.foldername(name))[1] = auth.uid()::text);