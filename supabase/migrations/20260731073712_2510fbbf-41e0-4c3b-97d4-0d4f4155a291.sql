DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.id AS new_id, o.id AS old_id
    FROM public.tenants n
    JOIN public.tenants o
      ON o.unit_id = n.unit_id
     AND o.owner_id = n.owner_id
     AND o.id <> n.id
     AND o.auth_user_id IS NULL
     AND o.active
    WHERE n.auth_user_id IS NOT NULL
      AND n.approval_status = 'approved'
      AND n.active
      AND n.unit_id IS NOT NULL
  LOOP
    UPDATE public.invoices SET tenant_id = r.new_id WHERE tenant_id = r.old_id;
    UPDATE public.payments SET tenant_id = r.new_id WHERE tenant_id = r.old_id;
    UPDATE public.utility_readings SET tenant_id = r.new_id WHERE tenant_id = r.old_id;
    UPDATE public.mpesa_transactions SET tenant_id = r.new_id WHERE tenant_id = r.old_id;
    UPDATE public.maintenance_tickets SET tenant_id = r.new_id WHERE tenant_id = r.old_id;
    UPDATE public.tenants SET active = false, move_out_date = COALESCE(move_out_date, CURRENT_DATE) WHERE id = r.old_id;
  END LOOP;
END $$;