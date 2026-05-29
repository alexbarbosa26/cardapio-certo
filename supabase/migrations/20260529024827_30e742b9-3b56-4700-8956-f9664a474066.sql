CREATE OR REPLACE FUNCTION public.trg_customer_tabs_recalc_totals()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
       NEW.service_fee_percentage IS DISTINCT FROM OLD.service_fee_percentage
    OR NEW.discount IS DISTINCT FROM OLD.discount
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
  ) THEN
    NEW.service_fee_amount := ROUND(COALESCE(NEW.subtotal,0) * COALESCE(NEW.service_fee_percentage,0) / 100, 2);
    NEW.total := GREATEST(0, COALESCE(NEW.subtotal,0) + NEW.service_fee_amount - COALESCE(NEW.discount,0));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS customer_tabs_recalc_totals ON public.customer_tabs;
CREATE TRIGGER customer_tabs_recalc_totals
BEFORE UPDATE ON public.customer_tabs
FOR EACH ROW EXECUTE FUNCTION public.trg_customer_tabs_recalc_totals();