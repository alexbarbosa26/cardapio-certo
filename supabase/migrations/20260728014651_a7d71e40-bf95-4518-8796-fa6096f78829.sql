REVOKE EXECUTE ON FUNCTION public.admin_assign_delivery_driver(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_delivery_payment_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_delivery_driver(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_delivery_payment_status(uuid, text) TO authenticated;