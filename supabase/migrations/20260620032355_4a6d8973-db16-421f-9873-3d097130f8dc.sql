
-- Restrict payment_providers SELECT to super admins only
DROP POLICY IF EXISTS "authenticated reads providers" ON public.payment_providers;

-- Allow staff (same company) to read settings
CREATE POLICY "staff views company settings"
ON public.settings
FOR SELECT
TO authenticated
USING (company_id = current_company_id());
