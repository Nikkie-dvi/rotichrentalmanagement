
-- Extensions for scheduled cron + HTTP
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Tenants: rent_due_day (1..31)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS rent_due_day INTEGER;
UPDATE public.tenants SET rent_due_day = EXTRACT(DAY FROM move_in_date)::int WHERE rent_due_day IS NULL AND move_in_date IS NOT NULL;

-- Trigger: keep rent_due_day in sync with move_in_date when not set explicitly
CREATE OR REPLACE FUNCTION public.tenants_set_rent_due_day()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.rent_due_day IS NULL AND NEW.move_in_date IS NOT NULL THEN
    NEW.rent_due_day := EXTRACT(DAY FROM NEW.move_in_date)::int;
  END IF;
  IF NEW.rent_due_day IS NOT NULL AND (NEW.rent_due_day < 1 OR NEW.rent_due_day > 31) THEN
    RAISE EXCEPTION 'rent_due_day must be between 1 and 31';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_set_rent_due_day ON public.tenants;
CREATE TRIGGER trg_tenants_set_rent_due_day
BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tenants_set_rent_due_day();

-- Payments: mpesa fields
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS mpesa_receipt_no TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS mpesa_status TEXT;

-- mpesa_transactions: STK Push tracking
CREATE TABLE IF NOT EXISTS public.mpesa_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  checkout_request_id TEXT,
  merchant_request_id TEXT,
  mpesa_receipt_no TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result_desc TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mpesa_transactions TO anon, authenticated;
GRANT ALL ON public.mpesa_transactions TO service_role;

ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access mpesa_transactions" ON public.mpesa_transactions;
CREATE POLICY "Public access mpesa_transactions" ON public.mpesa_transactions FOR ALL USING (true) WITH CHECK (true);
