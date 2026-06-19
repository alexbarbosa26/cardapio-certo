
-- Toggle por empresa
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS enable_credit_accounts boolean NOT NULL DEFAULT false;

-- Flag de "conta pendurada" nas comandas/pedidos existentes (não muda fluxos atuais)
ALTER TABLE public.customer_tabs ADD COLUMN IF NOT EXISTS is_credit boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_credit boolean NOT NULL DEFAULT false;

-- 1) Clientes de fiado (por empresa)
CREATE TABLE public.credit_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_customers_company_idx ON public.credit_customers(company_id);
CREATE INDEX credit_customers_name_idx ON public.credit_customers(company_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_customers TO authenticated;
GRANT ALL ON public.credit_customers TO service_role;
ALTER TABLE public.credit_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ccust_select" ON public.credit_customers FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());
CREATE POLICY "ccust_insert" ON public.credit_customers FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "ccust_update" ON public.credit_customers FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "ccust_delete" ON public.credit_customers FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.is_admin());

CREATE TRIGGER credit_customers_set_updated_at BEFORE UPDATE ON public.credit_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Contas em aberto (uma por comanda/pedido pendurado)
CREATE TABLE public.credit_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.credit_customers(id) ON DELETE RESTRICT,
  tab_id uuid REFERENCES public.customer_tabs(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  original_amount numeric(12,2) NOT NULL CHECK (original_amount >= 0),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  remaining_amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partially_paid','paid','cancelled')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_receivables_company_status_idx ON public.credit_receivables(company_id, status);
CREATE INDEX credit_receivables_customer_idx ON public.credit_receivables(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_receivables TO authenticated;
GRANT ALL ON public.credit_receivables TO service_role;
ALTER TABLE public.credit_receivables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crec_select" ON public.credit_receivables FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());
CREATE POLICY "crec_insert" ON public.credit_receivables FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "crec_update" ON public.credit_receivables FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "crec_delete" ON public.credit_receivables FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.is_admin());

CREATE TRIGGER credit_receivables_set_updated_at BEFORE UPDATE ON public.credit_receivables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Pagamentos de fiado
CREATE TABLE public.credit_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.credit_customers(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method public.payment_method NOT NULL,
  register_id uuid REFERENCES public.cash_registers(id),
  received_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_payments_company_idx ON public.credit_payments(company_id, created_at DESC);
CREATE INDEX credit_payments_customer_idx ON public.credit_payments(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_payments TO authenticated;
GRANT ALL ON public.credit_payments TO service_role;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpay_select" ON public.credit_payments FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());
CREATE POLICY "cpay_insert" ON public.credit_payments FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "cpay_delete" ON public.credit_payments FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.is_admin());

-- 4) Alocação de pagamento entre comandas
CREATE TABLE public.credit_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.credit_payments(id) ON DELETE CASCADE,
  receivable_id uuid NOT NULL REFERENCES public.credit_receivables(id) ON DELETE CASCADE,
  amount_applied numeric(12,2) NOT NULL CHECK (amount_applied > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cpa_payment_idx ON public.credit_payment_allocations(payment_id);
CREATE INDEX cpa_receivable_idx ON public.credit_payment_allocations(receivable_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_payment_allocations TO authenticated;
GRANT ALL ON public.credit_payment_allocations TO service_role;
ALTER TABLE public.credit_payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpa_select" ON public.credit_payment_allocations FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());
CREATE POLICY "cpa_insert" ON public.credit_payment_allocations FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "cpa_delete" ON public.credit_payment_allocations FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.is_admin());

-- 5) Recalc automático de receivable
CREATE OR REPLACE FUNCTION public.recalc_credit_receivable(_rec uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_paid numeric; v_orig numeric; v_rem numeric; v_status text; v_cur text;
BEGIN
  SELECT COALESCE(SUM(amount_applied),0) INTO v_paid
    FROM public.credit_payment_allocations WHERE receivable_id = _rec;
  SELECT original_amount, status INTO v_orig, v_cur
    FROM public.credit_receivables WHERE id = _rec;
  IF v_orig IS NULL THEN RETURN; END IF;
  v_rem := GREATEST(0, v_orig - v_paid);
  v_status := CASE
    WHEN v_paid <= 0 THEN 'open'
    WHEN v_rem <= 0.005 THEN 'paid'
    ELSE 'partially_paid'
  END;
  UPDATE public.credit_receivables
  SET paid_amount = v_paid,
      remaining_amount = v_rem,
      status = CASE WHEN v_cur = 'cancelled' THEN 'cancelled' ELSE v_status END,
      closed_at = CASE WHEN v_status = 'paid' AND closed_at IS NULL THEN now() ELSE closed_at END,
      updated_at = now()
  WHERE id = _rec;
END $$;

CREATE OR REPLACE FUNCTION public.trg_recalc_credit_alloc() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
  rid := COALESCE(NEW.receivable_id, OLD.receivable_id);
  IF rid IS NOT NULL THEN PERFORM public.recalc_credit_receivable(rid); END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_credit_alloc_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.credit_payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_credit_alloc();
