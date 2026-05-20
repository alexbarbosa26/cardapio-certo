-- 1) Ownership guard on recalc_order_payments
CREATE OR REPLACE FUNCTION public.recalc_order_payments(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid;
  _caller uuid;
BEGIN
  SELECT company_id INTO _owner FROM public.orders WHERE id = _order_id;
  IF _owner IS NULL THEN RETURN; END IF;

  -- When called from a trigger (no auth.uid()), allow. Otherwise enforce tenant.
  _caller := auth.uid();
  IF _caller IS NOT NULL THEN
    IF NOT public.is_super_admin()
       AND _owner <> public.current_company_id() THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE public.orders o
  SET paid_amount = COALESCE((
    SELECT SUM(amount) FROM public.payments
    WHERE order_id = _order_id AND status = 'ativo'
  ), 0)
  WHERE o.id = _order_id;

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
$function$;

-- 2) Branding bucket: drop the read policy (bucket is public anyway)
DROP POLICY IF EXISTS "branding read own company" ON storage.objects;

-- 3) Realtime: scope by topic prefix "co:<company_id>:..."
DROP POLICY IF EXISTS "authenticated can receive realtime" ON realtime.messages;

CREATE POLICY "tenant scoped realtime select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR (
    split_part(realtime.topic(), ':', 1) = 'co'
    AND split_part(realtime.topic(), ':', 2) = public.current_company_id()::text
  )
);

CREATE POLICY "tenant scoped realtime insert"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    split_part(realtime.topic(), ':', 1) = 'co'
    AND split_part(realtime.topic(), ':', 2) = public.current_company_id()::text
  )
);