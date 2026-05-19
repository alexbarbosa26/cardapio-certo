
-- Allow profiles.company_id to be NULL (for super admins)
ALTER TABLE public.profiles ALTER COLUMN company_id DROP NOT NULL;

-- Extend companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS responsible_name text,
  ADD COLUMN IF NOT EXISTS responsible_email text,
  ADD COLUMN IF NOT EXISTS responsible_phone text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS accent_color text;

-- is_super_admin helper
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin')
$$;

-- plans
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  monthly_price numeric NOT NULL DEFAULT 0,
  annual_price numeric NOT NULL DEFAULT 0,
  max_users integer,
  max_tables integer,
  max_open_tabs integer,
  allow_tables_module boolean NOT NULL DEFAULT true,
  allow_tabs_module boolean NOT NULL DEFAULT true,
  allow_kitchen_module boolean NOT NULL DEFAULT true,
  allow_advanced_dashboard boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view plans authenticated" ON public.plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super admin manages plans" ON public.plans
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- subscriptions
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','suspended','canceled','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  suspended_at timestamptz,
  payment_provider text,
  external_subscription_id text,
  last_payment_status text,
  next_billing_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active_per_company
  ON public.subscriptions(company_id)
  WHERE status IN ('trialing','active','past_due','suspended');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own subscription or super admin" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());
CREATE POLICY "super admin manages subscriptions" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_role text,
  company_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin views audit" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- super admin global access on companies / profiles / user_roles
CREATE POLICY "super admin views all companies" ON public.companies
  FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "super admin inserts companies" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "super admin updates any company" ON public.companies
  FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "super admin deletes companies" ON public.companies
  FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE POLICY "super admin manages all profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "super admin manages all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS plans_updated_at ON public.plans;
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- seed default plan + subscription for existing companies
INSERT INTO public.plans (name, description, monthly_price, annual_price)
VALUES ('Profissional', 'Plano padrão com todos os módulos liberados', 199.00, 1990.00)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.subscriptions (company_id, plan_id, status, current_period_start, current_period_end)
SELECT c.id, p.id, 'active'::public.subscription_status, now(), now() + interval '1 year'
FROM public.companies c
CROSS JOIN (SELECT id FROM public.plans WHERE name = 'Profissional' LIMIT 1) p
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s
  WHERE s.company_id = c.id AND s.status IN ('trialing','active','past_due','suspended')
);
