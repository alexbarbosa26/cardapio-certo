CREATE FUNCTION public.get_fiscal_document(_company_id uuid,_document_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_fiscal_permission('consult') OR _company_id IS DISTINCT FROM public.current_company_id() THEN RAISE EXCEPTION 'Acesso fiscal não permitido' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(d)||jsonb_build_object('total',d.total::text) INTO result FROM public.fiscal_documents d WHERE d.id=_document_id AND d.company_id=_company_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_fiscal_document(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_fiscal_document(uuid,uuid) TO authenticated;