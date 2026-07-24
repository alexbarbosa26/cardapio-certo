
-- 1. Enum: adicionar novos status
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'aguardando_aceite';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'recusado';

-- 2. Orders: novos campos e ajustes
ALTER TABLE public.orders ALTER COLUMN table_id DROP NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS service_mode text NOT NULL DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_token text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS delivery_address jsonb,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS change_for numeric,
  ADD COLUMN IF NOT EXISTS customer_notes text;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_origin_chk CHECK (origin IN ('internal','digital_menu'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_service_mode_chk CHECK (service_mode IN ('dine_in','delivery','pickup'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_public_token_idx ON public.orders(public_token);
CREATE UNIQUE INDEX IF NOT EXISTS orders_company_client_token_idx ON public.orders(company_id, client_token) WHERE client_token IS NOT NULL;

-- 3. Order items: product_id opcional
ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;

-- 4. Função pública: criar pedido do cardápio digital
CREATE OR REPLACE FUNCTION public.create_public_order(
  _slug text,
  _client_token text,
  _service_mode text,
  _customer_name text,
  _customer_phone text,
  _address jsonb,
  _payment_method text,
  _change_for numeric,
  _customer_notes text,
  _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company companies%ROWTYPE;
  v_settings digital_menu_settings%ROWTYPE;
  v_order_id uuid;
  v_public_token uuid;
  v_order_number int;
  v_item jsonb;
  v_menu_item digital_menu_items%ROWTYPE;
  v_qty int;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_total numeric;
  v_existing record;
  v_now time;
  v_today_open boolean := false;
  v_hours digital_menu_hours%ROWTYPE;
  v_hhmm time;
BEGIN
  -- validação básica de entrada
  IF _slug IS NULL OR length(_slug) < 3 THEN RAISE EXCEPTION 'invalid_slug'; END IF;
  IF _client_token IS NULL OR length(_client_token) < 8 THEN RAISE EXCEPTION 'invalid_client_token'; END IF;
  IF _service_mode NOT IN ('delivery','pickup') THEN RAISE EXCEPTION 'invalid_service_mode'; END IF;
  IF _customer_name IS NULL OR length(trim(_customer_name)) < 2 THEN RAISE EXCEPTION 'invalid_customer_name'; END IF;
  IF _customer_phone IS NULL OR length(regexp_replace(_customer_phone,'\D','','g')) < 8 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  IF _payment_method NOT IN ('dinheiro','pix','cartao_credito','cartao_debito') THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;

  SELECT * INTO v_company FROM companies WHERE digital_menu_slug = lower(_slug) LIMIT 1;
  IF v_company.id IS NULL THEN RAISE EXCEPTION 'company_not_found'; END IF;
  IF NOT (v_company.digital_menu_contracted AND v_company.digital_menu_enabled) THEN
    RAISE EXCEPTION 'menu_unavailable';
  END IF;

  SELECT * INTO v_settings FROM digital_menu_settings WHERE company_id = v_company.id;
  IF v_settings.company_id IS NULL THEN RAISE EXCEPTION 'menu_unavailable'; END IF;
  IF NOT v_settings.accepting_orders THEN RAISE EXCEPTION 'not_accepting_orders'; END IF;
  IF _service_mode = 'delivery' AND NOT v_settings.delivery_enabled THEN RAISE EXCEPTION 'delivery_disabled'; END IF;
  IF _service_mode = 'pickup' AND NOT v_settings.pickup_enabled THEN RAISE EXCEPTION 'pickup_disabled'; END IF;

  -- horário de funcionamento (verificação leve)
  v_hhmm := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
  SELECT * INTO v_hours FROM digital_menu_hours
    WHERE company_id = v_company.id
      AND weekday = EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  IF v_hours.company_id IS NOT NULL AND v_hours.is_open THEN
    IF (v_hours.period1_start IS NOT NULL AND v_hours.period1_end IS NOT NULL
        AND v_hhmm BETWEEN v_hours.period1_start AND v_hours.period1_end)
       OR (v_hours.period2_start IS NOT NULL AND v_hours.period2_end IS NOT NULL
        AND v_hhmm BETWEEN v_hours.period2_start AND v_hours.period2_end) THEN
      v_today_open := true;
    END IF;
  END IF;
  IF NOT v_today_open THEN RAISE EXCEPTION 'closed_now'; END IF;

  -- idempotência
  SELECT id, public_token, order_number, status INTO v_existing
    FROM orders WHERE company_id = v_company.id AND client_token = _client_token LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', v_existing.id, 'public_token', v_existing.public_token,
                              'order_number', v_existing.order_number, 'status', v_existing.status,
                              'duplicate', true);
  END IF;

  -- endereço obrigatório se delivery
  IF _service_mode = 'delivery' THEN
    IF _address IS NULL OR jsonb_typeof(_address) <> 'object'
       OR coalesce(_address->>'street','') = '' OR coalesce(_address->>'number','') = ''
       OR coalesce(_address->>'neighborhood','') = '' THEN
      RAISE EXCEPTION 'invalid_address';
    END IF;
    v_delivery_fee := COALESCE(v_settings.delivery_fee, 0);
  END IF;

  -- cria pedido base
  v_public_token := gen_random_uuid();
  INSERT INTO orders (
    company_id, table_id, user_id, status, origin, service_mode,
    public_token, client_token, customer_name, customer_phone,
    delivery_address, delivery_fee, payment_method, change_for, customer_notes,
    service_fee_percentage, subtotal, service_fee_amount, discount, total
  ) VALUES (
    v_company.id, NULL, NULL, 'aguardando_aceite', 'digital_menu', _service_mode,
    v_public_token, _client_token, trim(_customer_name), _customer_phone,
    CASE WHEN _service_mode = 'delivery' THEN _address ELSE NULL END,
    v_delivery_fee, _payment_method, _change_for, NULLIF(trim(coalesce(_customer_notes,'')), ''),
    0, 0, 0, 0, 0
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  -- itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    SELECT * INTO v_menu_item FROM digital_menu_items
      WHERE id = (v_item->>'item_id')::uuid
        AND company_id = v_company.id
        AND active = true
        AND available_delivery = true
        AND sold_out = false;
    IF v_menu_item.id IS NULL THEN RAISE EXCEPTION 'item_unavailable'; END IF;

    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price, notes,
      sends_to_kitchen, kitchen_status
    ) VALUES (
      v_order_id, v_menu_item.product_id, v_menu_item.name, v_qty,
      v_menu_item.price, v_menu_item.price * v_qty,
      NULLIF(trim(coalesce(v_item->>'notes','')), ''),
      true, 'pendente'
    );
    v_subtotal := v_subtotal + (v_menu_item.price * v_qty);
  END LOOP;

  IF v_settings.min_order_amount > 0 AND v_subtotal < v_settings.min_order_amount THEN
    RAISE EXCEPTION 'below_minimum';
  END IF;

  v_total := v_subtotal + v_delivery_fee;

  UPDATE orders SET subtotal = v_subtotal, total = v_total WHERE id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'public_token', v_public_token,
                            'order_number', v_order_number, 'status', 'aguardando_aceite');
END $$;

REVOKE ALL ON FUNCTION public.create_public_order(text,text,text,text,text,jsonb,text,numeric,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(text,text,text,text,text,jsonb,text,numeric,text,jsonb) TO anon, authenticated;

-- 5. Função pública: consultar pedido pelo token
CREATE OR REPLACE FUNCTION public.get_public_order(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.get_public_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order(uuid) TO anon, authenticated;
