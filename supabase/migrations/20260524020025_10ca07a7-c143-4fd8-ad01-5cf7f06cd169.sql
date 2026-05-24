-- 1) Restrict checkout_sessions SELECT to owning company / super admin
DROP POLICY IF EXISTS "public reads checkout sessions" ON public.checkout_sessions;

CREATE POLICY "company views own checkout sessions"
ON public.checkout_sessions
FOR SELECT
TO authenticated
USING (company_id = public.current_company_id() OR public.is_super_admin());

-- 2) Remove broad settings read access from non-admin company members
DROP POLICY IF EXISTS "company members view settings" ON public.settings;

-- 3) Fix mutable search_path on set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END
$function$;
