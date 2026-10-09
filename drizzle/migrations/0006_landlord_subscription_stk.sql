CREATE TABLE public.landlord_subscription_stk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_account_id uuid NOT NULL REFERENCES public.landlord_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  phone_number text NOT NULL,
  amount numeric NOT NULL,
  months_covered integer NOT NULL DEFAULT 1,
  checkout_request_id text UNIQUE,
  merchant_request_id text,
  status text NOT NULL DEFAULT 'pending',
  result_desc text,
  mpesa_receipt_no text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.landlord_subscription_stk TO authenticated;
GRANT ALL ON public.landlord_subscription_stk TO service_role;
ALTER TABLE public.landlord_subscription_stk ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Landlord views own subscription prompts" ON public.landlord_subscription_stk
  FOR SELECT TO authenticated USING (user_id = auth.uid());