
-- Pesagem em produtos
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_weighted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_per_kg numeric NOT NULL DEFAULT 0;

-- Status enums for tabs
DO $$ BEGIN
  CREATE TYPE public.customer_tab_status AS ENUM ('aberta','aguardando_pagamento','paga','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tab_item_type AS ENUM ('fixo','peso','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sequence for tab numbers
CREATE SEQUENCE IF NOT EXISTS public.customer_tabs_number_seq;

-- Tabs
CREATE TABLE IF NOT EXISTS public.customer_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  tab_number integer NOT NULL DEFAULT nextval('public.customer_tabs_number_seq'),
  customer_name text,
  status public.customer_tab_status NOT NULL DEFAULT 'aberta',
  opened_by uuid,
  closed_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  subtotal numeric NOT NULL DEFAULT 0,
  service_fee_percentage numeric NOT NULL DEFAULT 0,
  service_fee_amount numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view tabs same company" ON public.customer_tabs
  FOR SELECT USING (company_id = current_company_id());
CREATE POLICY "insert tabs same company" ON public.customer_tabs
  FOR INSERT WITH CHECK (company_id = current_company_id());
CREATE POLICY "update tabs same company" ON public.customer_tabs
  FOR UPDATE USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "admin deletes tabs" ON public.customer_tabs
  FOR DELETE USING (company_id = current_company_id() AND is_admin());

-- Tab items
CREATE TABLE IF NOT EXISTS public.tab_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  tab_id uuid NOT NULL REFERENCES public.customer_tabs(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL,
  category_name text,
  item_type public.tab_item_type NOT NULL DEFAULT 'fixo',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  price_per_kg numeric,
  weight_grams numeric,
  total_price numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tab_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view tab_items same company" ON public.tab_items
  FOR SELECT USING (company_id = current_company_id());
CREATE POLICY "insert tab_items same company" ON public.tab_items
  FOR INSERT WITH CHECK (company_id = current_company_id());
CREATE POLICY "update tab_items same company" ON public.tab_items
  FOR UPDATE USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "delete tab_items same company" ON public.tab_items
  FOR DELETE USING (company_id = current_company_id());

-- Tab payments
CREATE TABLE IF NOT EXISTS public.tab_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  tab_id uuid NOT NULL REFERENCES public.customer_tabs(id) ON DELETE CASCADE,
  register_id uuid,
  method payment_method NOT NULL,
  amount numeric NOT NULL,
  fee_percentage numeric NOT NULL DEFAULT 0,
  fee_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  received_amount numeric NOT NULL DEFAULT 0,
  change_amount numeric NOT NULL DEFAULT 0,
  person_label text,
  status payment_status NOT NULL DEFAULT 'ativo',
  canceled_at timestamptz,
  canceled_by uuid,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tab_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view tab_payments same company" ON public.tab_payments
  FOR SELECT USING (company_id = current_company_id());
CREATE POLICY "insert tab_payments same company" ON public.tab_payments
  FOR INSERT WITH CHECK (company_id = current_company_id());
CREATE POLICY "admin cancels tab_payments" ON public.tab_payments
  FOR UPDATE USING (company_id = current_company_id() AND is_admin())
  WITH CHECK (company_id = current_company_id() AND is_admin());
CREATE POLICY "admin deletes tab_payments" ON public.tab_payments
  FOR DELETE USING (company_id = current_company_id() AND is_admin());

-- Recalc function: totals from items (not canceled) and paid_amount from active payments
CREATE OR REPLACE FUNCTION public.recalc_customer_tab(_tab_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub numeric;
  v_fee_pct numeric;
  v_fee numeric;
  v_disc numeric;
  v_paid numeric;
BEGIN
  SELECT COALESCE(SUM(total_price),0) INTO v_sub
  FROM public.tab_items
  WHERE tab_id = _tab_id AND canceled_at IS NULL;

  SELECT service_fee_percentage, discount INTO v_fee_pct, v_disc
  FROM public.customer_tabs WHERE id = _tab_id;

  v_fee := COALESCE(v_sub * v_fee_pct / 100, 0);

  SELECT COALESCE(SUM(amount),0) INTO v_paid
  FROM public.tab_payments
  WHERE tab_id = _tab_id AND status = 'ativo';

  UPDATE public.customer_tabs
  SET subtotal = v_sub,
      service_fee_amount = v_fee,
      total = GREATEST(0, v_sub + v_fee - COALESCE(v_disc,0)),
      paid_amount = v_paid,
      updated_at = now()
  WHERE id = _tab_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_recalc_tab_item()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid;
BEGIN
  tid := COALESCE(NEW.tab_id, OLD.tab_id);
  IF tid IS NOT NULL THEN PERFORM public.recalc_customer_tab(tid); END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_recalc_tab_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid;
BEGIN
  tid := COALESCE(NEW.tab_id, OLD.tab_id);
  IF tid IS NOT NULL THEN PERFORM public.recalc_customer_tab(tid); END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tab_items_recalc ON public.tab_items;
CREATE TRIGGER tab_items_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.tab_items
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_tab_item();

DROP TRIGGER IF EXISTS tab_payments_recalc ON public.tab_payments;
CREATE TRIGGER tab_payments_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.tab_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_tab_payment();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_tabs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tab_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tab_payments;
