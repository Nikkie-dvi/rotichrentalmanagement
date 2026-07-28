
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS declined_reason text;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_approval_status_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_approval_status_check
  CHECK (approval_status IN ('pending','approved','declined'));

-- Backfill existing active tenants as approved so they keep dashboard access.
UPDATE public.tenants
   SET approval_status = 'approved'
 WHERE active = true AND approval_status = 'pending';
