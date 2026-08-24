ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS auto_reconcile_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.platform_pricing
  ADD COLUMN IF NOT EXISTS support_whatsapp text;

UPDATE public.platform_pricing SET support_whatsapp = COALESCE(support_whatsapp, '254706747498') WHERE id = 'default';