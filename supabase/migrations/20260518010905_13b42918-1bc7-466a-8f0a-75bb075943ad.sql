-- 1) Scope admin SELECT on user_roles to current company
DROP POLICY IF EXISTS "view own roles" ON public.user_roles;
CREATE POLICY "view own roles" ON public.user_roles
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.company_id = public.current_company_id()
    )
  )
);

-- 2) Restrict listing of branding bucket objects via storage.objects SELECT
--    Public file reads via direct/signed URL continue to work (bucket public flag).
DROP POLICY IF EXISTS "branding public read" ON storage.objects;
DROP POLICY IF EXISTS "branding read own company" ON storage.objects;
CREATE POLICY "branding read own company" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'branding'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
);
