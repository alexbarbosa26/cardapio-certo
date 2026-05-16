
-- 1) payments: status, cancel, received, change, person_label
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('ativo','cancelado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS status payment_status NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_by uuid,
  ADD COLUMN IF NOT EXISTS received_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS person_label text;

-- allow UPDATE on payments for cancellation (admin only via policy)
CREATE POLICY "admin cancels payments" ON public.payments
  FOR UPDATE USING ((company_id = current_company_id()) AND is_admin())
  WITH CHECK ((company_id = current_company_id()) AND is_admin());

-- 2) orders.paid_amount
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;

-- 3) order_items: paid_quantity + payment_status
DO $$ BEGIN
  CREATE TYPE item_payment_status AS ENUM ('pendente','parcial','pago');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS paid_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status item_payment_status NOT NULL DEFAULT 'pendente';

-- 4) allocations
CREATE TABLE IF NOT EXISTS public.order_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  quantity_paid numeric NOT NULL DEFAULT 0,
  amount_allocated numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view allocations same company" ON public.order_payment_allocations
  FOR SELECT USING (company_id = current_company_id());
CREATE POLICY "insert allocations same company" ON public.order_payment_allocations
  FOR INSERT WITH CHECK (company_id = current_company_id());
CREATE POLICY "delete allocations admin" ON public.order_payment_allocations
  FOR DELETE USING ((company_id = current_company_id()) AND is_admin());

CREATE INDEX IF NOT EXISTS idx_alloc_order ON public.order_payment_allocations(order_id);
CREATE INDEX IF NOT EXISTS idx_alloc_payment ON public.order_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_alloc_item ON public.order_payment_allocations(order_item_id);

-- 5) Recalc function (orders.paid_amount + items.paid_quantity/payment_status)
CREATE OR REPLACE FUNCTION public.recalc_order_payments(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- order paid_amount = sum of active payments
  UPDATE public.orders o
  SET paid_amount = COALESCE((
    SELECT SUM(amount) FROM public.payments
    WHERE order_id = _order_id AND status = 'ativo'
  ), 0)
  WHERE o.id = _order_id;

  -- item paid_quantity = sum of allocations linked to active payments
  UPDATE public.order_items oi
  SET paid_quantity = COALESCE((
    SELECT SUM(a.quantity_paid)
    FROM public.order_payment_allocations a
    JOIN public.payments p ON p.id = a.payment_id
    WHERE a.order_item_id = oi.id AND p.status = 'ativo'
  ), 0)
  WHERE oi.order_id = _order_id;

  UPDATE public.order_items oi
  SET payment_status = CASE
    WHEN oi.paid_quantity <= 0 THEN 'pendente'::item_payment_status
    WHEN oi.paid_quantity >= oi.quantity THEN 'pago'::item_payment_status
    ELSE 'parcial'::item_payment_status
  END
  WHERE oi.order_id = _order_id;
END;
$$;

-- Trigger on payments insert/update -> recalc
CREATE OR REPLACE FUNCTION public.trg_recalc_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid uuid;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);
  IF oid IS NOT NULL THEN
    PERFORM public.recalc_order_payments(oid);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS payments_recalc ON public.payments;
CREATE TRIGGER payments_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_payment();

CREATE OR REPLACE FUNCTION public.trg_recalc_alloc()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid uuid;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);
  IF oid IS NOT NULL THEN
    PERFORM public.recalc_order_payments(oid);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS alloc_recalc ON public.order_payment_allocations;
CREATE TRIGGER alloc_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.order_payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_alloc();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_payment_allocations;
