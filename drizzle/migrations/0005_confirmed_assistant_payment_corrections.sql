CREATE TABLE public.payment_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 payment_id uuid NOT NULL REFERENCES public.payments(id),
 changed_by uuid NOT NULL,
 old_amount numeric NOT NULL,
 new_amount numeric NOT NULL,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_corrections TO authenticated;
GRANT ALL ON public.payment_corrections TO service_role;
ALTER TABLE public.payment_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners and managers view corrections" ON public.payment_corrections FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.manages_owner(owner_id));
CREATE OR REPLACE FUNCTION public.correct_assistant_payment(_payment_id uuid, _expected_amount numeric, _new_amount numeric, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.payments%ROWTYPE; inv public.invoices%ROWTYPE; pool numeric; bal numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
 IF NOT (p.owner_id = auth.uid() OR public.manages_owner(p.owner_id)) THEN RAISE EXCEPTION 'Not permitted'; END IF;
 IF _new_amount IS NULL OR _new_amount <= 0 OR _new_amount > 10000000 OR _new_amount <> round(_new_amount, 2) THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
 IF _expected_amount IS NULL OR p.amount_paid <> _expected_amount THEN RAISE EXCEPTION 'Payment has changed. Ask the assistant again before confirming'; END IF;
 IF _reason IS NULL OR length(trim(_reason)) < 3 OR length(_reason) > 500 THEN RAISE EXCEPTION 'A correction reason is required'; END IF;
 IF _new_amount = p.amount_paid THEN RAISE EXCEPTION 'The amount is unchanged'; END IF;
 PERFORM id FROM public.tenants WHERE id = p.tenant_id FOR UPDATE;
 PERFORM id FROM public.invoices WHERE tenant_id = p.tenant_id ORDER BY month_year, created_at, id FOR UPDATE;
 UPDATE public.payments SET amount_paid = _new_amount WHERE id = p.id;
 INSERT INTO public.payment_corrections(owner_id, tenant_id, payment_id, changed_by, old_amount, new_amount, reason) VALUES(p.owner_id, p.tenant_id, p.id, auth.uid(), p.amount_paid, _new_amount, trim(_reason));
 SELECT coalesce(sum(amount_paid),0) INTO pool FROM public.payments WHERE tenant_id = p.tenant_id;
 SELECT pool + coalesce(sum(delta),0) INTO pool FROM public.tenant_credit_events WHERE tenant_id = p.tenant_id;
 pool := greatest(0, pool);
 FOR inv IN SELECT * FROM public.invoices WHERE tenant_id = p.tenant_id ORDER BY month_year, created_at, id LOOP
  bal := greatest(0, inv.total_due - pool);
  pool := greatest(0, pool - inv.total_due);
  UPDATE public.invoices SET balance_remaining = bal, status = CASE WHEN bal = 0 THEN 'paid' WHEN bal < inv.total_due THEN 'partial' ELSE 'unpaid' END WHERE id = inv.id;
 END LOOP;
 RETURN jsonb_build_object('tenantId',p.tenant_id,'oldAmount',p.amount_paid,'newAmount',_new_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.correct_assistant_payment(uuid,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_assistant_payment(uuid,numeric,numeric,text) TO authenticated;