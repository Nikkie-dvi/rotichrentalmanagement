ALTER TABLE public.landlord_accounts
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

ALTER TABLE public.landlord_accounts
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');

UPDATE public.landlord_accounts
SET trial_ends_at = created_at + interval '14 days'
WHERE trial_ends_at IS NULL;