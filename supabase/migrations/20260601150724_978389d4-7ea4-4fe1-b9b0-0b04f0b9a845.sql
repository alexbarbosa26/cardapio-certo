-- Allow same-company users (admin or staff) to delete open orders so cancellation
-- from the tables screen fully removes the order. Paid/closed orders remain admin-only.
DROP POLICY IF EXISTS "delete orders admin" ON public.orders;

CREATE POLICY "delete orders same company"
ON public.orders
FOR DELETE
USING (
  company_id = public.current_company_id()
  AND (public.is_admin() OR status = 'aberto')
);