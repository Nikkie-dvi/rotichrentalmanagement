-- Professional reminder templates with tenant portal link and login instructions.
-- Update column defaults for new rows:
ALTER TABLE public.billing_settings
  ALTER COLUMN reminder_before_template SET DEFAULT 'Dear {tenant_name}, this is a polite reminder that your rent of {total_balance} falls due on {due_date}. To check your balance or make a payment, visit homebasemanager.app/tenant/login and sign in with your phone number. Thank you.',
  ALTER COLUMN reminder_after_template SET DEFAULT 'Dear {tenant_name}, our records show your rent of {total_balance}, due on {due_date}, is still outstanding. Kindly settle it at your earliest convenience. You can view your balance at homebasemanager.app/tenant/login - sign in with your phone number.';

-- Upgrade existing rows that still carry the old default wording:
UPDATE public.billing_settings
SET reminder_before_template = 'Dear {tenant_name}, this is a polite reminder that your rent of {total_balance} falls due on {due_date}. To check your balance or make a payment, visit homebasemanager.app/tenant/login and sign in with your phone number. Thank you.'
WHERE reminder_before_template = 'Hi {tenant_name}, your rent of {total_balance} is due on {due_date} ({days} day(s) from today). Kindly pay on time. Thank you.';

UPDATE public.billing_settings
SET reminder_after_template = 'Dear {tenant_name}, our records show your rent of {total_balance}, due on {due_date}, is still outstanding. Kindly settle it at your earliest convenience. You can view your balance at homebasemanager.app/tenant/login - sign in with your phone number.'
WHERE reminder_after_template = 'Hi {tenant_name}, we have not yet received your rent of {total_balance} which was due on {due_date} ({days} day(s) ago). Kindly settle it as soon as possible.';