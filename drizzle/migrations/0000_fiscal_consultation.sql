CREATE TABLE public.fiscal_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
 direction text NOT NULL CHECK (direction IN ('entrada','saida')), model text NOT NULL CHECK(model IN ('NF-e','NFC-e')),
 series text NOT NULL DEFAULT '', number text NOT NULL DEFAULT '', access_key text,
 participant_name text NOT NULL DEFAULT '', issued_at timestamptz, movement_at timestamptz, posted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), total numeric(18,2) NOT NULL DEFAULT 0,
 authorization_status text NOT NULL DEFAULT 'desconhecida', transmission_status text NOT NULL DEFAULT 'nao_enviada',
 category text NOT NULL DEFAULT 'pendentes' CHECK(category IN ('transmitidas','pendentes','canceladas','inutilizadas','offline','autorizadas','excluidas')),
 fiscal_message text, last_checked_at timestamptz, excluded_at timestamptz,
 receipt_status text NOT NULL DEFAULT 'nao_informado', financial_status text NOT NULL DEFAULT 'nao_informado',
 order_id uuid REFERENCES public.orders(id), snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(id,company_id), UNIQUE(company_id,direction,access_key)
);
GRANT SELECT ON public.fiscal_documents TO authenticated;
GRANT ALL ON public.fiscal_documents TO service_role;
ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_document_read ON public.fiscal_documents FOR SELECT TO authenticated USING(public.is_admin() AND company_id=public.current_company_id());
CREATE INDEX fiscal_documents_listing ON public.fiscal_documents(company_id,direction,category,movement_at DESC);
CREATE TABLE public.fiscal_document_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id), document_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('xml','auxiliary')), name text NOT NULL, storage_path text NOT NULL UNIQUE,
 checksum text, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(document_id,company_id) REFERENCES public.fiscal_documents(id,company_id)
);
GRANT SELECT ON public.fiscal_document_files TO authenticated;
GRANT ALL ON public.fiscal_document_files TO service_role;
ALTER TABLE public.fiscal_document_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_file_read ON public.fiscal_document_files FOR SELECT TO authenticated USING(public.is_admin() AND company_id=public.current_company_id());
CREATE TABLE public.fiscal_document_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id), document_id uuid NOT NULL,
 action text NOT NULL, message text, protocol text, actor_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(document_id,company_id) REFERENCES public.fiscal_documents(id,company_id)
);
GRANT SELECT ON public.fiscal_document_events TO authenticated;
GRANT ALL ON public.fiscal_document_events TO service_role;
ALTER TABLE public.fiscal_document_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_event_read ON public.fiscal_document_events FOR SELECT TO authenticated USING(public.is_admin() AND company_id=public.current_company_id());
CREATE FUNCTION public.has_fiscal_permission(_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND public.current_company_id() IS NOT NULL AND public.is_admin() AND _permission IN ('consult','distribute');
$$;
REVOKE ALL ON FUNCTION public.has_fiscal_permission(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_fiscal_permission(text) TO authenticated,service_role;
CREATE FUNCTION public.list_fiscal_documents(_company_id uuid,_direction text,_filters jsonb DEFAULT '{}'::jsonb,_page integer DEFAULT 1,_size integer DEFAULT 25,_export boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb; page_size integer := LEAST(1000,GREATEST(1,_size));
BEGIN
 IF NOT public.has_fiscal_permission(CASE WHEN _export THEN 'distribute' ELSE 'consult' END) OR _company_id IS DISTINCT FROM public.current_company_id() THEN RAISE EXCEPTION 'Acesso fiscal não permitido' USING ERRCODE='42501'; END IF;
 IF _direction NOT IN ('entrada','saida') THEN RAISE EXCEPTION 'Direção inválida'; END IF;
 WITH filtered AS (
 SELECT d.* FROM public.fiscal_documents d WHERE company_id=_company_id AND direction=_direction
 AND (coalesce(_filters->>'category','')='' OR category=_filters->>'category')
 AND (coalesce(_filters->>'participant','')='' OR strpos(lower(participant_name),lower(_filters->>'participant'))>0)
 AND (coalesce(_filters->>'series','')='' OR strpos(series,_filters->>'series')>0)
 AND (coalesce(_filters->>'number','')='' OR strpos(number,_filters->>'number')>0)
 AND (coalesce(_filters->>'key','')='' OR strpos(access_key,_filters->>'key')>0)
 AND (coalesce(_filters->>'model','')='' OR model=_filters->>'model')
 AND (coalesce(_filters->>'status','')='' OR authorization_status=_filters->>'status')
 AND (coalesce(_filters->>'from','')='' OR movement_at >= ((_filters->>'from')::date::timestamp AT TIME ZONE 'America/Sao_Paulo'))
 AND (coalesce(_filters->>'to','')='' OR movement_at < (((_filters->>'to')::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
 ), paged AS (SELECT * FROM filtered ORDER BY movement_at DESC NULLS LAST,created_at DESC,id LIMIT page_size OFFSET (GREATEST(1,_page)-1)*page_size)
 SELECT jsonb_build_object('documents',coalesce((SELECT jsonb_agg(to_jsonb(p)-'snapshot'||jsonb_build_object('total',p.total::text)) FROM paged p),'[]'::jsonb),'count',(SELECT count(*) FROM filtered),'total',(SELECT coalesce(sum(total),0)::text FROM filtered)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_fiscal_documents(uuid,text,jsonb,integer,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_fiscal_documents(uuid,text,jsonb,integer,integer,boolean) TO authenticated;
CREATE FUNCTION public.audit_fiscal_distribution(_company_id uuid,_direction text,_filters jsonb,_selected_ids uuid[],_kind text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_fiscal_permission('distribute') OR _company_id IS DISTINCT FROM public.current_company_id() THEN RAISE EXCEPTION 'Acesso fiscal não permitido' USING ERRCODE='42501'; END IF;
 IF _kind NOT IN ('csv','report','file') THEN RAISE EXCEPTION 'Operação inválida'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(_selected_ids) selected(id) WHERE NOT EXISTS(SELECT 1 FROM fiscal_documents d WHERE d.id=selected.id AND d.company_id=_company_id AND d.direction=_direction)) THEN RAISE EXCEPTION 'Documento não permitido' USING ERRCODE='42501'; END IF;
 INSERT INTO audit_logs(actor_user_id,company_id,action,entity_type,new_value) VALUES(auth.uid(),_company_id,'fiscal_distribution_requested','fiscal_documents',jsonb_build_object('direction',_direction,'kind',_kind,'filters',jsonb_build_object('from',_filters->>'from','to',_filters->>'to','category',_filters->>'category','model',_filters->>'model','status',_filters->>'status'),'selected_ids',_selected_ids));
END $$;
REVOKE ALL ON FUNCTION public.audit_fiscal_distribution(uuid,text,jsonb,uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.audit_fiscal_distribution(uuid,text,jsonb,uuid[],text) TO authenticated;
CREATE POLICY fiscal_private_download ON storage.objects FOR SELECT TO authenticated USING(bucket_id='fiscal-documents' AND public.has_fiscal_permission('distribute') AND EXISTS(SELECT 1 FROM public.fiscal_document_files f WHERE f.storage_path=name AND f.company_id=public.current_company_id()));