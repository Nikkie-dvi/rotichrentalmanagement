ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS rent_reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_days_before integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS reminder_days_after integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS reminder_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_push_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_before_template text NOT NULL DEFAULT 'Hi {tenant_name}, your rent of {total_balance} is due on {due_date} ({days} day(s) from today). Kindly pay on time. Thank you.',
  ADD COLUMN IF NOT EXISTS reminder_after_template text NOT NULL DEFAULT 'Hi {tenant_name}, we have not yet received your rent of {total_balance} which was due on {due_date} ({days} day(s) ago). Kindly settle it as soon as possible.';