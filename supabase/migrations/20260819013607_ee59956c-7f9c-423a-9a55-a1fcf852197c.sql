ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS water_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS electricity_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS garbage_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_label text;

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'other';