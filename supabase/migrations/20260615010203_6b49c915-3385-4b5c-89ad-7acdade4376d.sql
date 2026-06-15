-- Restrict payment_providers SELECT to super_admin only (config may contain secrets)
DROP POLICY IF EXISTS "view payment_providers authenticated" ON public.payment_providers;
DROP POLICY IF EXISTS "Authenticated can view payment providers" ON public.payment_providers;
DROP POLICY IF EXISTS "payment_providers_select_authenticated" ON public.payment_providers;
DROP POLICY IF EXISTS "Anyone authenticated can view payment providers" ON public.payment_providers;

CREATE POLICY "super_admin can view payment_providers"
ON public.payment_providers
FOR SELECT
TO authenticated
USING (public.is_super_admin());

-- Restrict plans SELECT to active plans only for authenticated users; super_admin sees all
DROP POLICY IF EXISTS "view plans authenticated" ON public.plans;
DROP POLICY IF EXISTS "Authenticated can view plans" ON public.plans;
DROP POLICY IF EXISTS "plans_select_authenticated" ON public.plans;

CREATE POLICY "view active plans authenticated"
ON public.plans
FOR SELECT
TO authenticated
USING (status = 'ativo' OR public.is_super_admin());

-- Fix mutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.trg_customer_tabs_recalc_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (
       NEW.service_fee_percentage IS DISTINCT FROM OLD.service_fee_percentage
    OR NEW.discount IS DISTINCT FROM OLD.discount
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
  ) THEN
    NEW.service_fee_amount := ROUND(COALESCE(NEW.subtotal,0) * COALESCE(NEW.service_fee_percentage,0) / 100, 2);
    NEW.total := GREATEST(0, COALESCE(NEW.subtotal,0) + NEW.service_fee_amount - COALESCE(NEW.discount,0));
  END IF;
  RETURN NEW;
END $function$;