
-- 1. Ownership always follows the tenant (or parent record), never the inserting user.
CREATE OR REPLACE FUNCTION public.owner_from_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o uuid;
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    SELECT owner_id INTO o FROM public.tenants WHERE id = NEW.tenant_id;
    IF o IS NOT NULL THEN NEW.owner_id := o; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o uuid;
BEGIN
  SELECT owner_id INTO o FROM public.invoices WHERE id = NEW.invoice_id;
  IF o IS NOT NULL THEN NEW.owner_id := o; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_from_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o uuid;
BEGIN
  SELECT owner_id INTO o FROM public.properties WHERE id = NEW.property_id;
  IF o IS NOT NULL THEN NEW.owner_id := o; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_from_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_from_invoice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_from_property() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payments_owner ON public.payments;
CREATE TRIGGER trg_payments_owner BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.owner_from_tenant();

DROP TRIGGER IF EXISTS trg_invoices_owner ON public.invoices;
CREATE TRIGGER trg_invoices_owner BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.owner_from_tenant();

DROP TRIGGER IF EXISTS trg_utility_readings_owner ON public.utility_readings;
CREATE TRIGGER trg_utility_readings_owner BEFORE INSERT OR UPDATE ON public.utility_readings
FOR EACH ROW EXECUTE FUNCTION public.owner_from_tenant();

DROP TRIGGER IF EXISTS trg_mpesa_owner ON public.mpesa_transactions;
CREATE TRIGGER trg_mpesa_owner BEFORE INSERT OR UPDATE ON public.mpesa_transactions
FOR EACH ROW EXECUTE FUNCTION public.owner_from_tenant();

DROP TRIGGER IF EXISTS trg_credit_events_owner ON public.tenant_credit_events;
CREATE TRIGGER trg_credit_events_owner BEFORE INSERT OR UPDATE ON public.tenant_credit_events
FOR EACH ROW EXECUTE FUNCTION public.owner_from_tenant();

DROP TRIGGER IF EXISTS trg_maintenance_owner ON public.maintenance_tickets;
CREATE TRIGGER trg_maintenance_owner BEFORE INSERT OR UPDATE ON public.maintenance_tickets
FOR EACH ROW EXECUTE FUNCTION public.owner_from_tenant();

DROP TRIGGER IF EXISTS trg_move_out_owner ON public.move_out_requests;
CREATE TRIGGER trg_move_out_owner BEFORE INSERT OR UPDATE ON public.move_out_requests
FOR EACH ROW EXECUTE FUNCTION public.owner_from_tenant();

DROP TRIGGER IF EXISTS trg_line_items_owner ON public.invoice_line_items;
CREATE TRIGGER trg_line_items_owner BEFORE INSERT OR UPDATE ON public.invoice_line_items
FOR EACH ROW EXECUTE FUNCTION public.owner_from_invoice();

DROP TRIGGER IF EXISTS trg_units_owner ON public.units;
CREATE TRIGGER trg_units_owner BEFORE INSERT ON public.units
FOR EACH ROW EXECUTE FUNCTION public.owner_from_property();

-- 2. Backfill anything already filed under the wrong account.
UPDATE public.payments p SET owner_id = tn.owner_id FROM public.tenants tn
  WHERE tn.id = p.tenant_id AND p.owner_id <> tn.owner_id;
UPDATE public.invoices i SET owner_id = tn.owner_id FROM public.tenants tn
  WHERE tn.id = i.tenant_id AND i.owner_id <> tn.owner_id;
UPDATE public.utility_readings u SET owner_id = tn.owner_id FROM public.tenants tn
  WHERE tn.id = u.tenant_id AND u.owner_id <> tn.owner_id;
UPDATE public.mpesa_transactions m SET owner_id = tn.owner_id FROM public.tenants tn
  WHERE tn.id = m.tenant_id AND m.owner_id <> tn.owner_id;
UPDATE public.tenant_credit_events c SET owner_id = tn.owner_id FROM public.tenants tn
  WHERE tn.id = c.tenant_id AND c.owner_id <> tn.owner_id;
UPDATE public.maintenance_tickets mt SET owner_id = tn.owner_id FROM public.tenants tn
  WHERE tn.id = mt.tenant_id AND mt.owner_id <> tn.owner_id;
UPDATE public.move_out_requests mo SET owner_id = tn.owner_id FROM public.tenants tn
  WHERE tn.id = mo.tenant_id AND mo.owner_id <> tn.owner_id;
UPDATE public.invoice_line_items li SET owner_id = i.owner_id FROM public.invoices i
  WHERE i.id = li.invoice_id AND li.owner_id <> i.owner_id;
UPDATE public.units u SET owner_id = p.owner_id FROM public.properties p
  WHERE p.id = u.property_id AND u.owner_id <> p.owner_id;
