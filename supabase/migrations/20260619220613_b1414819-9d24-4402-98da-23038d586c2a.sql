REVOKE EXECUTE ON FUNCTION public.recalc_credit_receivable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_credit_alloc() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_credit_receivable(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_recalc_credit_alloc() TO service_role;