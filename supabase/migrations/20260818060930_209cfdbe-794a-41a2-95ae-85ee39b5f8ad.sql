ALTER TABLE public.landlord_accounts
  ADD COLUMN IF NOT EXISTS rent_payment_number text,
  ADD COLUMN IF NOT EXISTS rent_payment_method text NOT NULL DEFAULT 'mpesa_send_money',
  ADD COLUMN IF NOT EXISTS rent_payment_note text;