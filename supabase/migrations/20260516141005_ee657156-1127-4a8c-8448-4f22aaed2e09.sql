
CREATE OR REPLACE FUNCTION public.trg_recalc_tab_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tid uuid;
BEGIN
  tid := COALESCE(NEW.tab_id, OLD.tab_id);
  IF tid IS NOT NULL THEN PERFORM public.recalc_customer_tab(tid); END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_recalc_tab_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tid uuid;
BEGIN
  tid := COALESCE(NEW.tab_id, OLD.tab_id);
  IF tid IS NOT NULL THEN PERFORM public.recalc_customer_tab(tid); END IF;
  RETURN NULL;
END $$;
