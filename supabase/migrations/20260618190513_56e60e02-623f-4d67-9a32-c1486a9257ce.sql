CREATE TABLE public.sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_amount numeric(14,2) NOT NULL CHECK (target_amount >= 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_goals TO authenticated;
GRANT ALL ON public.sales_goals TO service_role;

ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view own goals"
  ON public.sales_goals FOR SELECT
  TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

CREATE POLICY "Admins can insert own goals"
  ON public.sales_goals FOR INSERT
  TO authenticated
  WITH CHECK (
    (company_id = public.current_company_id() AND public.is_admin())
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can update own goals"
  ON public.sales_goals FOR UPDATE
  TO authenticated
  USING (
    (company_id = public.current_company_id() AND public.is_admin())
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND public.is_admin())
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can delete own goals"
  ON public.sales_goals FOR DELETE
  TO authenticated
  USING (
    (company_id = public.current_company_id() AND public.is_admin())
    OR public.is_super_admin()
  );

CREATE TRIGGER trg_sales_goals_updated_at
  BEFORE UPDATE ON public.sales_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();