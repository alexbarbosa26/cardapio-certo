REVOKE ALL ON public.fiscal_documents,public.fiscal_document_files,public.fiscal_document_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fiscal_documents,public.fiscal_document_files,public.fiscal_document_events TO authenticated;
GRANT ALL ON public.fiscal_documents,public.fiscal_document_files,public.fiscal_document_events TO service_role;