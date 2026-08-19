ALTER TABLE public.landlord_accounts
  ADD COLUMN IF NOT EXISTS lease_landlord_name text,
  ADD COLUMN IF NOT EXISTS lease_intro text,
  ADD COLUMN IF NOT EXISTS lease_clauses text,
  ADD COLUMN IF NOT EXISTS lease_footer text;