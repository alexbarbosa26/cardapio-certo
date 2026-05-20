
-- =============================================================
-- MesaChef: base comercial SaaS — checkout simulado
-- =============================================================

-- 1) Extensões dos planos -------------------------------------------------
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS full_description text,
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS max_products integer,
  ADD COLUMN IF NOT EXISTS allow_cash_register_module boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_reports boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_visual_customization boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_level text NOT NULL DEFAULT 'padrao',
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_landing_page boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_unique ON public.plans (slug) WHERE slug IS NOT NULL;

-- Leitura pública (anon) dos planos visíveis para a landing
DROP POLICY IF EXISTS "public reads landing plans" ON public.plans;
CREATE POLICY "public reads landing plans"
  ON public.plans FOR SELECT
  TO anon
  USING (status = 'ativo' AND show_on_landing_page = true);

-- 2) Empresas: notas internas --------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS internal_notes text;

-- 3) Subscriptions: novos campos + novos status --------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

-- Adiciona valores ao enum subscription_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'subscription_status'::regtype AND enumlabel = 'pending_payment') THEN
    ALTER TYPE subscription_status ADD VALUE 'pending_payment';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'subscription_status'::regtype AND enumlabel = 'failed') THEN
    ALTER TYPE subscription_status ADD VALUE 'failed';
  END IF;
END $$;

-- 4) payment_providers ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_mock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated reads providers" ON public.payment_providers;
CREATE POLICY "authenticated reads providers"
  ON public.payment_providers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "super admin manages providers" ON public.payment_providers;
CREATE POLICY "super admin manages providers"
  ON public.payment_providers FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- 5) checkout_sessions ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  subscription_id uuid,
  provider text NOT NULL DEFAULT 'simulated',
  status text NOT NULL DEFAULT 'pending',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  amount numeric NOT NULL DEFAULT 0,
  checkout_url text,
  external_session_id text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;

-- Sessão de checkout é pública (id não-adivinhável), necessário para fluxo de signup
DROP POLICY IF EXISTS "public reads checkout sessions" ON public.checkout_sessions;
CREATE POLICY "public reads checkout sessions"
  ON public.checkout_sessions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "super admin manages checkout sessions" ON public.checkout_sessions;
CREATE POLICY "super admin manages checkout sessions"
  ON public.checkout_sessions FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- 6) subscription_payments ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subscription_id uuid,
  checkout_session_id uuid,
  provider text NOT NULL DEFAULT 'simulated',
  external_payment_id text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  paid_at timestamptz,
  due_date timestamptz,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company views own payments" ON public.subscription_payments;
CREATE POLICY "company views own payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (company_id = current_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "super admin manages payments" ON public.subscription_payments;
CREATE POLICY "super admin manages payments"
  ON public.subscription_payments FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- 7) subscription_events -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subscription_id uuid,
  event_type text NOT NULL,
  description text,
  old_status text,
  new_status text,
  old_plan_id uuid,
  new_plan_id uuid,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company views own events" ON public.subscription_events;
CREATE POLICY "company views own events"
  ON public.subscription_events FOR SELECT TO authenticated
  USING (company_id = current_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "super admin manages events" ON public.subscription_events;
CREATE POLICY "super admin manages events"
  ON public.subscription_events FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- 8) webhook_events ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL,
  external_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admin manages webhooks" ON public.webhook_events;
CREATE POLICY "super admin manages webhooks"
  ON public.webhook_events FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- 9) Triggers updated_at -------------------------------------------------
DROP TRIGGER IF EXISTS trg_payment_providers_updated ON public.payment_providers;
CREATE TRIGGER trg_payment_providers_updated BEFORE UPDATE ON public.payment_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_checkout_sessions_updated ON public.checkout_sessions;
CREATE TRIGGER trg_checkout_sessions_updated BEFORE UPDATE ON public.checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_subscription_payments_updated ON public.subscription_payments;
CREATE TRIGGER trg_subscription_payments_updated BEFORE UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS checkout_sessions_company ON public.checkout_sessions (company_id);
CREATE INDEX IF NOT EXISTS subscription_payments_company ON public.subscription_payments (company_id);
CREATE INDEX IF NOT EXISTS subscription_events_company ON public.subscription_events (company_id);
CREATE INDEX IF NOT EXISTS plans_display_order ON public.plans (display_order);
