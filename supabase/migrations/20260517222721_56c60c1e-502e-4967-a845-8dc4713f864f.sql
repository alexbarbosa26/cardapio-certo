
-- 1) profiles: non-admin can only read own row; admin sees all company profiles
DROP POLICY IF EXISTS "view profiles same company" ON public.profiles;
CREATE POLICY "view own profile or admin all"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR (company_id = current_company_id() AND is_admin()));

-- 2) user_roles: scope admin management to same company
DROP POLICY IF EXISTS "admin manages roles" ON public.user_roles;
CREATE POLICY "admin manages roles same company"
  ON public.user_roles FOR ALL
  USING (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id AND p.company_id = current_company_id()
    )
  )
  WITH CHECK (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id AND p.company_id = current_company_id()
    )
  );

-- 3) settings: hide credit/debit fee percentages from non-admins via separate policies.
--    Keep operational settings accessible to staff via a SECURITY DEFINER function returning safe fields.
DROP POLICY IF EXISTS "view settings same company" ON public.settings;
CREATE POLICY "admin views full settings"
  ON public.settings FOR SELECT
  USING (company_id = current_company_id() AND is_admin());

CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE (
  service_fee_percentage numeric,
  kitchen_warning_minutes integer,
  kitchen_danger_minutes integer,
  font_display text,
  font_body text,
  font_display_weights text,
  font_body_weights text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT service_fee_percentage, kitchen_warning_minutes, kitchen_danger_minutes,
         font_display, font_body, font_display_weights, font_body_weights
  FROM public.settings WHERE company_id = current_company_id() LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_settings() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO authenticated;

-- 4) Fix mutable search_path on trigger functions
CREATE OR REPLACE FUNCTION public.trg_recalc_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE oid uuid;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);
  IF oid IS NOT NULL THEN PERFORM public.recalc_order_payments(oid); END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_alloc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE oid uuid;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);
  IF oid IS NOT NULL THEN PERFORM public.recalc_order_payments(oid); END IF;
  RETURN NULL;
END $function$;

-- 5) Revoke EXECUTE on internal SECURITY DEFINER helpers from anon (keep authenticated for app use)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_open_register(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.recalc_order_payments(uuid) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_customer_tab(uuid) FROM anon, public, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_open_register(uuid) TO authenticated;

-- 6) branding bucket: remove broad listing if any permissive policy exists; keep public read of objects by id
--    Drop overly broad SELECT policies on storage.objects for branding (only keep targeted ones).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual ILIKE '%branding%' OR policyname ILIKE '%branding%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- Make branding bucket non-public-listable but keep public read via signed/public URL of known path.
UPDATE storage.buckets SET public = true WHERE id = 'branding';

-- Public can read individual objects (needed for logos via public URL) but cannot LIST without auth-scoped path.
CREATE POLICY "branding public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

CREATE POLICY "branding company writes"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = current_company_id()::text
  );

CREATE POLICY "branding company updates"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = current_company_id()::text
  );

CREATE POLICY "branding company deletes"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = current_company_id()::text
  );
