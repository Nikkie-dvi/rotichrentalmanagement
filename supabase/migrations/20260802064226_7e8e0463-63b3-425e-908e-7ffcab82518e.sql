ALTER TABLE public.landlord_accounts DISABLE TRIGGER USER;

UPDATE public.landlord_accounts
SET status = 'approved',
    approved_at = COALESCE(approved_at, now()),
    paid_until = DATE '3030-12-31',
    updated_at = now()
WHERE lower(email) = 'lnick8081@gmail.com';

ALTER TABLE public.landlord_accounts ENABLE TRIGGER USER;