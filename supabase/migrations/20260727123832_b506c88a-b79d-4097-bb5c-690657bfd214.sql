ALTER TABLE public.credit_payments
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

GRANT UPDATE ON public.credit_payments TO service_role;

CREATE OR REPLACE FUNCTION public.admin_reverse_credit_payment(_payment_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_p credit_payments%ROWTYPE;
  v_uid uuid := auth.uid();
  v_recs uuid[];
  r uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_p FROM credit_payments WHERE id = _payment_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF NOT public.is_super_admin() AND (NOT public.is_admin() OR v_p.company_id <> public.current_company_id()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='insufficient_privilege';
  END IF;
  IF v_p.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'already_reversed'; END IF;

  SELECT array_agg(DISTINCT receivable_id) INTO v_recs
    FROM credit_payment_allocations WHERE payment_id = _payment_id;

  DELETE FROM credit_payment_allocations WHERE payment_id = _payment_id;

  UPDATE credit_payments
     SET reversed_at = now(), reversed_by = v_uid,
         reversal_reason = NULLIF(trim(coalesce(_reason,'')), '')
   WHERE id = _payment_id;

  IF v_recs IS NOT NULL THEN
    FOREACH r IN ARRAY v_recs LOOP PERFORM public.recalc_credit_receivable(r); END LOOP;
  END IF;

  -- devolve o dinheiro do caixa quando o pagamento foi em dinheiro com caixa aberto
  IF v_p.method = 'dinheiro' AND v_p.register_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cash_registers WHERE id = v_p.register_id AND status = 'aberto') THEN
      INSERT INTO cash_movements (company_id, register_id, type, amount, user_id, notes)
      VALUES (v_p.company_id, v_p.register_id, 'sangria', v_p.amount, v_uid,
              'Estorno de recebimento fiado');
    END IF;
  END IF;

  INSERT INTO audit_logs (actor_user_id, company_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, v_p.company_id, 'credit_payment_reversed', 'credit_payments', _payment_id,
          jsonb_build_object('amount', v_p.amount, 'method', v_p.method),
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_adjust_credit_payment(_payment_id uuid, _new_amount numeric, _new_method payment_method, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_p credit_payments%ROWTYPE;
  v_uid uuid := auth.uid();
  v_recs uuid[];
  r RECORD;
  rid uuid;
  v_left numeric;
  v_apply numeric;
  v_diff numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='insufficient_privilege'; END IF;
  IF _new_amount IS NULL OR _new_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT * INTO v_p FROM credit_payments WHERE id = _payment_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF NOT public.is_super_admin() AND (NOT public.is_admin() OR v_p.company_id <> public.current_company_id()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='insufficient_privilege';
  END IF;
  IF v_p.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'already_reversed'; END IF;

  SELECT array_agg(DISTINCT receivable_id) INTO v_recs
    FROM credit_payment_allocations WHERE payment_id = _payment_id;
  DELETE FROM credit_payment_allocations WHERE payment_id = _payment_id;
  IF v_recs IS NOT NULL THEN
    FOREACH rid IN ARRAY v_recs LOOP PERFORM public.recalc_credit_receivable(rid); END LOOP;
  END IF;

  UPDATE credit_payments SET amount = round(_new_amount, 2), method = _new_method WHERE id = _payment_id;

  -- realoca FIFO nas contas em aberto do cliente
  v_left := round(_new_amount, 2);
  FOR r IN
    SELECT id, remaining_amount FROM credit_receivables
     WHERE customer_id = v_p.customer_id AND company_id = v_p.company_id
       AND status IN ('open','partially_paid')
     ORDER BY opened_at
  LOOP
    EXIT WHEN v_left <= 0.005;
    v_apply := LEAST(v_left, r.remaining_amount);
    IF v_apply > 0 THEN
      INSERT INTO credit_payment_allocations (company_id, payment_id, receivable_id, amount_applied)
      VALUES (v_p.company_id, _payment_id, r.id, round(v_apply, 2));
      v_left := round(v_left - v_apply, 2);
    END IF;
  END LOOP;

  IF v_left > 0.005 THEN RAISE EXCEPTION 'amount_exceeds_debt'; END IF;

  -- ajuste no caixa quando dinheiro
  v_diff := round(_new_amount, 2) - v_p.amount;
  IF v_p.register_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM cash_registers WHERE id = v_p.register_id AND status = 'aberto') THEN
    IF v_p.method = 'dinheiro' AND _new_method <> 'dinheiro' THEN
      INSERT INTO cash_movements (company_id, register_id, type, amount, user_id, notes)
      VALUES (v_p.company_id, v_p.register_id, 'sangria', v_p.amount, v_uid, 'Correção de recebimento fiado');
    ELSIF v_p.method <> 'dinheiro' AND _new_method = 'dinheiro' THEN
      INSERT INTO cash_movements (company_id, register_id, type, amount, user_id, notes)
      VALUES (v_p.company_id, v_p.register_id, 'suprimento', round(_new_amount,2), v_uid, 'Correção de recebimento fiado');
    ELSIF _new_method = 'dinheiro' AND v_diff <> 0 THEN
      INSERT INTO cash_movements (company_id, register_id, type, amount, user_id, notes)
      VALUES (v_p.company_id, v_p.register_id,
              CASE WHEN v_diff > 0 THEN 'suprimento' ELSE 'sangria' END, abs(v_diff), v_uid,
              'Correção de recebimento fiado');
    END IF;
  END IF;

  INSERT INTO audit_logs (actor_user_id, company_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, v_p.company_id, 'credit_payment_adjusted', 'credit_payments', _payment_id,
          jsonb_build_object('amount', v_p.amount, 'method', v_p.method),
          jsonb_build_object('amount', round(_new_amount,2), 'method', _new_method, 'reason', _reason));

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.admin_reverse_credit_payment(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_adjust_credit_payment(uuid, numeric, payment_method, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reverse_credit_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credit_payment(uuid, numeric, payment_method, text) TO authenticated;