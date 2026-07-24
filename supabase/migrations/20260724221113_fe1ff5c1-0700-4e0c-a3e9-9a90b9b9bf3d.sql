
-- New statuses for delivery workflow
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'em_preparo';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pronto';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'em_entrega';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'entregue';

-- Timestamps for delivery milestones
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS estimated_minutes int;

CREATE OR REPLACE FUNCTION public.admin_update_delivery_order_status(
  _order_id uuid,
  _new_status text,
  _reason text DEFAULT NULL,
  _estimated_minutes int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_allowed boolean;
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
    cancellation_reason = CASE WHEN _new_status IN ('recusado','cancelado') THEN COALESCE(_reason, cancellation_reason) ELSE cancellation_reason END,
    rejection_reason = CASE WHEN _new_status = 'recusado' THEN _reason ELSE rejection_reason END,
    estimated_minutes = COALESCE(_estimated_minutes, estimated_minutes)
  WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'status', _new_status);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_update_delivery_order_status(uuid, text, text, int) TO authenticated;

-- Extend public order view with milestones
CREATE OR REPLACE FUNCTION public.get_public_order(_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order orders%ROWTYPE;
  v_company companies%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE public_token = _token LIMIT 1;
  IF v_order.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO v_company FROM companies WHERE id = v_order.company_id;

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
      'primary_color', v_company.primary_color
    )
  ) INTO v_result;

  RETURN v_result;
END $function$;
