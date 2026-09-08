CREATE TABLE public.tenant_login_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.tenant_login_codes TO service_role;

ALTER TABLE public.tenant_login_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX tenant_login_codes_phone_created_idx
  ON public.tenant_login_codes (phone, created_at DESC);