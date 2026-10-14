CREATE OR REPLACE FUNCTION public.assistant_apply_fix(_kind text, _target_id uuid, _expected numeric, _amount numeric, _date date, _reference text, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.payments%ROWTYPE; i public.invoices%ROWTYPE; t public.tenants%ROWTYPE; tid uuid; oid uuid; inv public.invoices%ROWTYPE; pool numeric; bal numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _reason IS NULL OR length(trim(_reason)) < 3 OR length(_reason) > 500 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 IF _amount IS NOT NULL AND (_amount > 10000000 OR _amount < -10000000 OR _amount <> round(_amount, 2)) THEN RAISE EXCEPTION 'Invalid amount'; END IF;
 IF _kind = 'payment' THEN
  SELECT * INTO p FROM public.payments WHERE id = _target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  tid := p.tenant_id; oid := p.owner_id;
 ELSIF _kind = 'invoice' THEN
  SELECT * INTO i FROM public.invoices WHERE id = _target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  tid := i.tenant_id; oid := i.owner_id;
 ELSIF _kind = 'credit' THEN
  SELECT * INTO t FROM public.tenants WHERE id = _target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;
  tid := t.id; oid := t.owner_id;
 ELSE RAISE EXCEPTION 'Unknown fix type'; END IF;
 IF NOT (oid = auth.uid() OR public.manages_owner(oid)) THEN RAISE EXCEPTION 'Not permitted'; END IF;
 PERFORM id FROM public.tenants WHERE id = tid FOR UPDATE;
 PERFORM id FROM public.invoices WHERE tenant_id = tid ORDER BY month_year, created_at, id FOR UPDATE;
 IF _kind = 'payment' THEN
  IF _expected IS NULL OR p.amount_paid <> _expected THEN RAISE EXCEPTION 'Payment has changed. Ask the assistant again before confirming'; END IF;
  IF _amount IS NOT NULL AND _amount < 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF _date IS NOT NULL AND _date > (now() AT TIME ZONE 'Africa/Nairobi')::date THEN RAISE EXCEPTION 'Date cannot be in the future'; END IF;
  UPDATE public.payments SET amount_paid = coalesce(_amount, amount_paid), payment_date = coalesce(_date, payment_date),
    reference_no = CASE WHEN _reference IS NULL THEN reference_no ELSE nullif(upper(trim(_reference)), '') END WHERE id = p.id;
  INSERT INTO public.payment_corrections(owner_id, tenant_id, payment_id, changed_by, old_amount, new_amount, reason)
   VALUES(oid, tid, p.id, auth.uid(), p.amount_paid, coalesce(_amount, p.amount_paid), trim(_reason) || CASE WHEN _date IS NOT NULL AND _date <> p.payment_date THEN ' [date ' || p.payment_date || ' -> ' || _date || ']' ELSE '' END || CASE WHEN _reference IS NOT NULL THEN ' [ref ' || coalesce(p.reference_no,'none') || ' -> ' || _reference || ']' ELSE '' END);
 ELSIF _kind = 'invoice' THEN
  IF _expected IS NULL OR i.total_due <> _expected THEN RAISE EXCEPTION 'Invoice has changed. Ask the assistant again before confirming'; END IF;
  IF _amount IS NULL OR _amount < 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  UPDATE public.invoices SET total_due = _amount, base_rent = greatest(0, base_rent + (_amount - i.total_due)) WHERE id = i.id;
  INSERT INTO public.tenant_credit_events(owner_id, tenant_id, kind, amount, delta, note, acknowledged, created_by)
   VALUES(oid, tid, 'adjusted', 0, 0, 'Assistant invoice ' || i.month_year || ': ' || i.total_due || ' -> ' || _amount || ' — ' || trim(_reason), true, auth.uid());
 ELSE
  IF _amount IS NULL OR _amount = 0 THEN RAISE EXCEPTION 'Invalid credit change'; END IF;
  INSERT INTO public.tenant_credit_events(owner_id, tenant_id, kind, amount, delta, note, acknowledged, created_by)
   VALUES(oid, tid, 'adjusted', abs(_amount), _amount, 'Assistant: ' || trim(_reason), true, auth.uid());
 END IF;
 SELECT coalesce(sum(amount_paid),0) INTO pool FROM public.payments WHERE tenant_id = tid;
 SELECT pool + coalesce(sum(delta),0) INTO pool FROM public.tenant_credit_events WHERE tenant_id = tid;
 pool := greatest(0, pool);
 FOR inv IN SELECT * FROM public.invoices WHERE tenant_id = tid ORDER BY month_year, created_at, id LOOP
  bal := greatest(0, inv.total_due - pool);
  pool := greatest(0, pool - inv.total_due);
  UPDATE public.invoices SET balance_remaining = bal, status = CASE WHEN bal = 0 THEN 'paid' WHEN bal < inv.total_due THEN 'partial' ELSE 'unpaid' END WHERE id = inv.id;
 END LOOP;
 RETURN jsonb_build_object('tenantId', tid, 'kind', _kind);
END;
$function$;
REVOKE ALL ON FUNCTION public.assistant_apply_fix(text, uuid, numeric, numeric, date, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assistant_apply_fix(text, uuid, numeric, numeric, date, text, text) TO authenticated;