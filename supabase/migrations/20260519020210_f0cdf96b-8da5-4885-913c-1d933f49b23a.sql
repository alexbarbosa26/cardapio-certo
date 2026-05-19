
-- Restrict cash_registers INSERT/UPDATE to admins
DROP POLICY IF EXISTS "insert cash_registers same company" ON public.cash_registers;
CREATE POLICY "insert cash_registers admin only"
  ON public.cash_registers FOR INSERT
  WITH CHECK (company_id = public.current_company_id() AND public.is_admin());

DROP POLICY IF EXISTS "update cash_registers same company" ON public.cash_registers;
CREATE POLICY "update cash_registers admin only"
  ON public.cash_registers FOR UPDATE
  USING (company_id = public.current_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_admin());

-- Restrict cash_movements INSERT to admins
DROP POLICY IF EXISTS "insert cash_movements same company" ON public.cash_movements;
CREATE POLICY "insert cash_movements admin only"
  ON public.cash_movements FOR INSERT
  WITH CHECK (company_id = public.current_company_id() AND public.is_admin());

-- Realtime: require authenticated session to subscribe to any channel topic.
-- App-level filters on postgres_changes are already scoped by company_id RLS on the source tables,
-- so subscribing without auth (anon) must be denied.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can receive realtime" ON realtime.messages;
CREATE POLICY "authenticated can receive realtime"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (true);
