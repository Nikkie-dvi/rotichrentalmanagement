DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','units','tenants','invoices','payments','utility_readings','mpesa_transactions']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;