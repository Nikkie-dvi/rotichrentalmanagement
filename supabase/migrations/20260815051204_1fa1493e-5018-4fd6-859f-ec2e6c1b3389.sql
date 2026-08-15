ALTER TABLE public.landlord_accounts ADD COLUMN IF NOT EXISTS landlord_code text;

CREATE OR REPLACE FUNCTION public.generate_landlord_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c text; i int := 0;
BEGIN
  LOOP
    c := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.landlord_accounts WHERE landlord_code = c);
    i := i + 1;
    IF i > 200 THEN RAISE EXCEPTION 'Could not allocate landlord code'; END IF;
  END LOOP;
  RETURN c;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_landlord_code() FROM PUBLIC;

UPDATE public.landlord_accounts
SET landlord_code = public.generate_landlord_code()
WHERE landlord_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS landlord_accounts_landlord_code_key
  ON public.landlord_accounts (landlord_code);

CREATE OR REPLACE FUNCTION public.landlord_accounts_set_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.landlord_code IS NULL THEN
      NEW.landlord_code := public.generate_landlord_code();
    END IF;
  ELSIF NEW.landlord_code IS DISTINCT FROM OLD.landlord_code THEN
    NEW.landlord_code := OLD.landlord_code;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.landlord_accounts_set_code() FROM PUBLIC;

DROP TRIGGER IF EXISTS landlord_accounts_set_code_trg ON public.landlord_accounts;
CREATE TRIGGER landlord_accounts_set_code_trg
BEFORE INSERT OR UPDATE ON public.landlord_accounts
FOR EACH ROW EXECUTE FUNCTION public.landlord_accounts_set_code();