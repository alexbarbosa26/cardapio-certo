GRANT INSERT, SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

DROP POLICY IF EXISTS "authenticated insert audit same company" ON public.audit_logs;
CREATE POLICY "authenticated insert audit same company"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND (company_id IS NULL OR company_id = public.current_company_id())
  );

DROP POLICY IF EXISTS "view own company audit" ON public.audit_logs;
CREATE POLICY "view own company audit"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());