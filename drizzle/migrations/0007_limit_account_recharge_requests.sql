CREATE OR REPLACE FUNCTION public.claim_recharge_request(_user_id uuid, _kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recent_count integer;
BEGIN
  IF _kind NOT IN ('subscription_prompt', 'sms_recharge') THEN RAISE EXCEPTION 'Invalid request kind'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':recharge', 0));
  IF EXISTS (SELECT 1 FROM public.signup_attempts WHERE key = _user_id::text AND kind = _kind AND created_at > now() - interval '60 seconds') THEN RETURN false; END IF;
  SELECT count(*) INTO recent_count FROM public.signup_attempts WHERE key = _user_id::text AND kind = _kind AND created_at > now() - interval '1 hour';
  IF recent_count >= 5 THEN RETURN false; END IF;
  INSERT INTO public.signup_attempts(kind, key) VALUES (_kind, _user_id::text);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_recharge_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recharge_request(uuid, text) TO service_role;