ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'rent';
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_kind_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_kind_check CHECK (kind IN ('rent','service'));
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_tenant_id_month_year_key;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_tenant_month_kind_key UNIQUE (tenant_id, month_year, kind);