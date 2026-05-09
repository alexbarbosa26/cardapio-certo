-- ============ ENUMS ============
CREATE TYPE public.cash_register_status AS ENUM ('aberto', 'fechado');
CREATE TYPE public.cash_movement_type AS ENUM ('suprimento', 'sangria');
CREATE TYPE public.payment_method AS ENUM ('dinheiro', 'pix', 'debito', 'credito');

-- ============ CASH REGISTERS ============
CREATE TABLE public.cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_amount numeric NOT NULL DEFAULT 0,
  closed_by uuid,
  closed_at timestamptz,
  closing_amount numeric,
  expected_cash numeric,
  difference numeric,
  status public.cash_register_status NOT NULL DEFAULT 'aberto',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cash_registers_company ON public.cash_registers(company_id, status, opened_at DESC);

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view cash_registers same company" ON public.cash_registers
  FOR SELECT USING (company_id = current_company_id());
CREATE POLICY "insert cash_registers same company" ON public.cash_registers
  FOR INSERT WITH CHECK (company_id = current_company_id());
CREATE POLICY "update cash_registers same company" ON public.cash_registers
  FOR UPDATE USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "admin deletes cash_registers" ON public.cash_registers
  FOR DELETE USING (company_id = current_company_id() AND is_admin());

-- ============ CASH MOVEMENTS ============
CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  register_id uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  type public.cash_movement_type NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  user_id uuid NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cash_movements_register ON public.cash_movements(register_id, created_at DESC);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view cash_movements same company" ON public.cash_movements
  FOR SELECT USING (company_id = current_company_id());
CREATE POLICY "insert cash_movements same company" ON public.cash_movements
  FOR INSERT WITH CHECK (company_id = current_company_id());
CREATE POLICY "admin deletes cash_movements" ON public.cash_movements
  FOR DELETE USING (company_id = current_company_id() AND is_admin());

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  order_id uuid NOT NULL,
  register_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL,
  method public.payment_method NOT NULL,
  amount numeric NOT NULL,
  fee_percentage numeric NOT NULL DEFAULT 0,
  fee_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_company_date ON public.payments(company_id, created_at DESC);
CREATE INDEX idx_payments_order ON public.payments(order_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view payments same company" ON public.payments
  FOR SELECT USING (company_id = current_company_id());
CREATE POLICY "insert payments same company" ON public.payments
  FOR INSERT WITH CHECK (company_id = current_company_id());
CREATE POLICY "admin deletes payments" ON public.payments
  FOR DELETE USING (company_id = current_company_id() AND is_admin());

-- ============ HELPER: caixa aberto da empresa ============
CREATE OR REPLACE FUNCTION public.current_open_register(_company uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.cash_registers
  WHERE company_id = _company AND status = 'aberto'
  ORDER BY opened_at DESC LIMIT 1
$$;