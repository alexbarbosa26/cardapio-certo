-- 1. Entregadores
CREATE TABLE public.delivery_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  vehicle text,
  plate text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_drivers TO authenticated;
GRANT ALL ON public.delivery_drivers TO service_role;

ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drivers_select_tenant" ON public.delivery_drivers
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());

CREATE POLICY "drivers_insert_admin" ON public.delivery_drivers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (public.is_admin() AND company_id = public.current_company_id()));

CREATE POLICY "drivers_update_admin" ON public.delivery_drivers
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.is_admin() AND company_id = public.current_company_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_admin() AND company_id = public.current_company_id()));

CREATE POLICY "drivers_delete_admin" ON public.delivery_drivers
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (public.is_admin() AND company_id = public.current_company_id()));

CREATE TRIGGER set_delivery_drivers_updated_at
  BEFORE UPDATE ON public.delivery_drivers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_delivery_drivers_company ON public.delivery_drivers(company_id, active);

-- 2. Pedidos: entregador e pagamento
ALTER TABLE public.orders
  ADD COLUMN driver_id uuid REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  ADD COLUMN driver_assigned_at timestamptz,
  ADD COLUMN payment_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN payment_confirmed_at timestamptz,
  ADD COLUMN payment_confirmed_by uuid;

CREATE INDEX idx_orders_driver ON public.orders(driver_id) WHERE driver_id IS NOT NULL;

-- 3. Configurações Pix do cardápio
ALTER TABLE public.digital_menu_settings
  ADD COLUMN pix_key text,
  ADD COLUMN pix_key_type text,
  ADD COLUMN pix_holder text;

-- 4. Atribuição de entregador
CREATE OR REPLACE FUNCTION public.admin_assign_delivery_driver(_order_id uuid, _driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_o orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_driver delivery_drivers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO v_o FROM orders WHERE id = _order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT public.is_super_admin() AND v_o.company_id <> public.current_company_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_o.origin <> 'digital_menu' THEN RAISE EXCEPTION 'not_a_delivery_order'; END IF;
  IF v_o.service_mode <> 'delivery' THEN RAISE EXCEPTION 'not_a_delivery_order'; END IF;

  IF _driver_id IS NOT NULL THEN
    SELECT * INTO v_driver FROM delivery_drivers WHERE id = _driver_id;
    IF v_driver.id IS NULL OR v_driver.company_id <> v_o.company_id THEN
      RAISE EXCEPTION 'driver_not_found';
    END IF;
    IF NOT v_driver.active THEN RAISE EXCEPTION 'driver_inactive'; END IF;
  END IF;

  UPDATE orders
     SET driver_id = _driver_id,
         driver_assigned_at = CASE WHEN _driver_id IS NULL THEN NULL ELSE now() END
   WHERE id = _order_id;

  INSERT INTO audit_logs (actor_user_id, company_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, v_o.company_id, 'delivery_driver_assigned', 'orders', _order_id,
          jsonb_build_object('driver_id', v_o.driver_id),
          jsonb_build_object('driver_id', _driver_id));

  RETURN jsonb_build_object('ok', true);
END $function$;

-- 5. Status de pagamento do delivery
CREATE OR REPLACE FUNCTION public.admin_set_delivery_payment_status(_order_id uuid, _payment_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_o orders%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF _payment_status NOT IN ('pendente','pago','estornado') THEN RAISE EXCEPTION 'invalid_payment_status'; END IF;
  SELECT * INTO v_o FROM orders WHERE id = _order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT public.is_super_admin() AND v_o.company_id <> public.current_company_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_o.origin <> 'digital_menu' THEN RAISE EXCEPTION 'not_a_delivery_order'; END IF;

  UPDATE orders
     SET payment_status = _payment_status,
         payment_confirmed_at = CASE WHEN _payment_status = 'pago' THEN now() ELSE NULL END,
         payment_confirmed_by = CASE WHEN _payment_status = 'pago' THEN v_uid ELSE NULL END
   WHERE id = _order_id;

  INSERT INTO audit_logs (actor_user_id, company_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, v_o.company_id, 'delivery_payment_status_changed', 'orders', _order_id,
          jsonb_build_object('payment_status', v_o.payment_status),
          jsonb_build_object('payment_status', _payment_status));

  RETURN jsonb_build_object('ok', true);
END $function$;

-- 6. Transições de status com motivo obrigatório e auditoria
CREATE OR REPLACE FUNCTION public.admin_update_delivery_order_status(_order_id uuid, _new_status text, _reason text DEFAULT NULL::text, _estimated_minutes integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_o orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_allowed boolean;
  v_reason text := NULLIF(trim(coalesce(_reason,'')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO v_o FROM orders WHERE id = _order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF NOT public.is_super_admin() AND v_o.company_id <> public.current_company_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_o.origin <> 'digital_menu' THEN
    RAISE EXCEPTION 'not_a_delivery_order';
  END IF;

  v_allowed := CASE _new_status
    WHEN 'em_preparo' THEN v_o.status IN ('aguardando_aceite')
    WHEN 'pronto'     THEN v_o.status IN ('em_preparo','aguardando_aceite')
    WHEN 'em_entrega' THEN v_o.status IN ('pronto','em_preparo') AND v_o.service_mode = 'delivery'
    WHEN 'entregue'   THEN v_o.status IN ('em_entrega','pronto')
    WHEN 'recusado'   THEN v_o.status IN ('aguardando_aceite')
    WHEN 'cancelado'  THEN v_o.status NOT IN ('entregue','cancelado','recusado')
    ELSE false
  END;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'invalid_status_transition' USING HINT = format('from %s to %s', v_o.status, _new_status);
  END IF;

  IF _new_status IN ('recusado','cancelado') AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE orders SET
    status = _new_status::order_status,
    accepted_at   = CASE WHEN _new_status = 'em_preparo' AND accepted_at IS NULL THEN now() ELSE accepted_at END,
    accepted_by   = CASE WHEN _new_status = 'em_preparo' AND accepted_by IS NULL THEN v_uid ELSE accepted_by END,
    ready_at      = CASE WHEN _new_status = 'pronto' AND ready_at IS NULL THEN now() ELSE ready_at END,
    dispatched_at = CASE WHEN _new_status = 'em_entrega' AND dispatched_at IS NULL THEN now() ELSE dispatched_at END,
    delivered_at  = CASE WHEN _new_status = 'entregue' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
    closed_at     = CASE WHEN _new_status IN ('entregue','recusado','cancelado') AND closed_at IS NULL THEN now() ELSE closed_at END,
    canceled_at   = CASE WHEN _new_status IN ('recusado','cancelado') AND canceled_at IS NULL THEN now() ELSE canceled_at END,
    canceled_by   = CASE WHEN _new_status IN ('recusado','cancelado') AND canceled_by IS NULL THEN v_uid ELSE canceled_by END,
    cancellation_reason = CASE WHEN _new_status IN ('recusado','cancelado') THEN COALESCE(v_reason, cancellation_reason) ELSE cancellation_reason END,
    rejection_reason = CASE WHEN _new_status = 'recusado' THEN v_reason ELSE rejection_reason END,
    estimated_minutes = COALESCE(_estimated_minutes, estimated_minutes)
  WHERE id = _order_id;

  INSERT INTO audit_logs (actor_user_id, company_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, v_o.company_id, 'delivery_order_status_changed', 'orders', _order_id,
          jsonb_build_object('status', v_o.status),
          jsonb_build_object('status', _new_status, 'reason', v_reason, 'estimated_minutes', _estimated_minutes));

  RETURN jsonb_build_object('ok', true, 'status', _new_status);
END $function$;

-- 7. Acompanhamento público com pagamento, Pix e entregador
CREATE OR REPLACE FUNCTION public.get_public_order(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order orders%ROWTYPE;
  v_company companies%ROWTYPE;
  v_settings digital_menu_settings%ROWTYPE;
  v_driver delivery_drivers%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE public_token = _token LIMIT 1;
  IF v_order.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO v_company FROM companies WHERE id = v_order.company_id;
  SELECT * INTO v_settings FROM digital_menu_settings WHERE company_id = v_order.company_id;
  IF v_order.driver_id IS NOT NULL THEN
    SELECT * INTO v_driver FROM delivery_drivers WHERE id = v_order.driver_id;
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'order', jsonb_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'service_mode', v_order.service_mode,
      'customer_name', v_order.customer_name,
      'customer_phone', v_order.customer_phone,
      'delivery_address', v_order.delivery_address,
      'payment_method', v_order.payment_method,
      'payment_status', v_order.payment_status,
      'payment_confirmed_at', v_order.payment_confirmed_at,
      'change_for', v_order.change_for,
      'customer_notes', v_order.customer_notes,
      'subtotal', v_order.subtotal,
      'delivery_fee', v_order.delivery_fee,
      'total', v_order.total,
      'opened_at', v_order.opened_at,
      'accepted_at', v_order.accepted_at,
      'ready_at', v_order.ready_at,
      'dispatched_at', v_order.dispatched_at,
      'delivered_at', v_order.delivered_at,
      'estimated_minutes', v_order.estimated_minutes,
      'rejection_reason', v_order.rejection_reason,
      'cancellation_reason', v_order.cancellation_reason,
      'driver_name', v_driver.name,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'name', oi.product_name,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'notes', oi.notes,
          'kitchen_status', oi.kitchen_status
        ) ORDER BY oi.created_at)
        FROM order_items oi WHERE oi.order_id = v_order.id
      ), '[]'::jsonb)
    ),
    'company', jsonb_build_object(
      'name', COALESCE(v_company.trade_name, v_company.name),
      'slug', v_company.digital_menu_slug,
      'logo_url', v_company.logo_url,
      'primary_color', v_company.primary_color,
      'whatsapp', v_settings.whatsapp,
      'phone', v_settings.phone
    ),
    'pix', CASE
      WHEN v_order.payment_method = 'pix' AND v_settings.pix_key IS NOT NULL
      THEN jsonb_build_object('key', v_settings.pix_key, 'key_type', v_settings.pix_key_type, 'holder', v_settings.pix_holder)
      ELSE NULL END
  ) INTO v_result;

  RETURN v_result;
END $function$;