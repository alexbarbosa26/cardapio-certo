-- Helper: returns active plan limits for a company (null = unlimited)
CREATE OR REPLACE FUNCTION public.company_plan_limits(_company uuid)
RETURNS TABLE(max_users int, max_tables int, max_open_tabs int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.max_users, p.max_tables, p.max_open_tabs
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.company_id = _company
    AND s.status IN ('trialing','active','past_due')
  ORDER BY s.created_at DESC
  LIMIT 1
$$;

-- Trigger: max_users on profiles INSERT
CREATE OR REPLACE FUNCTION public.enforce_max_users()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; cnt int;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  SELECT max_users INTO lim FROM public.company_plan_limits(NEW.company_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO cnt FROM public.profiles WHERE company_id = NEW.company_id;
  IF cnt >= lim THEN
    RAISE EXCEPTION 'Seu plano atual não permite adicionar mais usuários (limite: %).', lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_max_users ON public.profiles;
CREATE TRIGGER trg_enforce_max_users
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_users();

-- Trigger: max_tables on tables INSERT
CREATE OR REPLACE FUNCTION public.enforce_max_tables()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; cnt int;
BEGIN
  SELECT max_tables INTO lim FROM public.company_plan_limits(NEW.company_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO cnt FROM public.tables WHERE company_id = NEW.company_id;
  IF cnt >= lim THEN
    RAISE EXCEPTION 'Seu plano atual não permite adicionar mais mesas (limite: %).', lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_max_tables ON public.tables;
CREATE TRIGGER trg_enforce_max_tables
  BEFORE INSERT ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_tables();

-- Trigger: max_open_tabs on customer_tabs INSERT/UPDATE when status='aberta'
CREATE OR REPLACE FUNCTION public.enforce_max_open_tabs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; cnt int;
BEGIN
  IF NEW.status <> 'aberta' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'aberta' THEN RETURN NEW; END IF;
  SELECT max_open_tabs INTO lim FROM public.company_plan_limits(NEW.company_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO cnt FROM public.customer_tabs
    WHERE company_id = NEW.company_id AND status = 'aberta' AND id <> NEW.id;
  IF cnt >= lim THEN
    RAISE EXCEPTION 'Seu plano atual não permite mais comandas abertas simultâneas (limite: %).', lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_max_open_tabs ON public.customer_tabs;
CREATE TRIGGER trg_enforce_max_open_tabs
  BEFORE INSERT OR UPDATE ON public.customer_tabs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_open_tabs();