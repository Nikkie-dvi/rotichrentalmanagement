-- SMS wallet, usage ledger and recharge requests
CREATE TABLE public.sms_wallets (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  rate_per_sms numeric NOT NULL DEFAULT 1.2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sms_wallets TO authenticated;
GRANT ALL ON public.sms_wallets TO service_role;
ALTER TABLE public.sms_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or manager reads wallet" ON public.sms_wallets FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.manages_owner(owner_id) OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()));
CREATE TRIGGER sms_wallets_updated_at BEFORE UPDATE ON public.sms_wallets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sms_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta numeric NOT NULL,
  sms_count integer NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  reason text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sms_ledger TO authenticated;
GRANT ALL ON public.sms_ledger TO service_role;
ALTER TABLE public.sms_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or manager reads ledger" ON public.sms_ledger FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.manages_owner(owner_id) OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()));
CREATE INDEX sms_ledger_owner_created_idx ON public.sms_ledger (owner_id, created_at DESC);

CREATE TABLE public.sms_topup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  approved_amount numeric,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sms_topup_requests TO authenticated;
GRANT ALL ON public.sms_topup_requests TO service_role;
ALTER TABLE public.sms_topup_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own topup requests" ON public.sms_topup_requests FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.manages_owner(owner_id) OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid()));
CREATE POLICY "Owner creates own topup requests" ON public.sms_topup_requests FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND status = 'pending');
CREATE TRIGGER sms_topup_requests_updated_at BEFORE UPDATE ON public.sms_topup_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atomic charge: returns remaining balance, or NULL when funds are insufficient.
CREATE OR REPLACE FUNCTION public.sms_charge(_owner uuid, _count integer, _reason text, _note text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.sms_wallets%ROWTYPE;
  cost numeric;
BEGIN
  IF _count <= 0 THEN RETURN NULL; END IF;
  INSERT INTO public.sms_wallets (owner_id) VALUES (_owner) ON CONFLICT (owner_id) DO NOTHING;
  SELECT * INTO w FROM public.sms_wallets WHERE owner_id = _owner FOR UPDATE;
  cost := ROUND(w.rate_per_sms * _count, 2);
  IF w.balance < cost THEN RETURN NULL; END IF;
  UPDATE public.sms_wallets SET balance = balance - cost WHERE owner_id = _owner RETURNING balance INTO w.balance;
  INSERT INTO public.sms_ledger (owner_id, delta, sms_count, balance_after, reason, note)
  VALUES (_owner, -cost, _count, w.balance, _reason, _note);
  RETURN w.balance;
END;
$$;
REVOKE ALL ON FUNCTION public.sms_charge(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_charge(uuid, integer, text, text) TO service_role;

-- Super-admin credit
CREATE OR REPLACE FUNCTION public.sms_credit(_owner uuid, _amount numeric, _reason text, _note text DEFAULT NULL, _by uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE bal numeric;
BEGIN
  INSERT INTO public.sms_wallets (owner_id) VALUES (_owner) ON CONFLICT (owner_id) DO NOTHING;
  UPDATE public.sms_wallets SET balance = balance + _amount WHERE owner_id = _owner RETURNING balance INTO bal;
  INSERT INTO public.sms_ledger (owner_id, delta, sms_count, balance_after, reason, note, created_by)
  VALUES (_owner, _amount, 0, bal, _reason, _note, _by);
  RETURN bal;
END;
$$;
REVOKE ALL ON FUNCTION public.sms_credit(uuid, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_credit(uuid, numeric, text, text, uuid) TO service_role;