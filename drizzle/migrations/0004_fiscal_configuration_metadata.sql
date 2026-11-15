CREATE TABLE public.fiscal_configuration (
 company_id uuid PRIMARY KEY REFERENCES public.companies(id), environment text NOT NULL DEFAULT 'test' CHECK(environment IN ('test','production')), expiry_warning_days integer NOT NULL DEFAULT 30 CHECK(expiry_warning_days BETWEEN 1 AND 365), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fiscal_configuration TO authenticated;
GRANT ALL ON public.fiscal_configuration TO service_role;
REVOKE ALL ON public.fiscal_configuration FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.fiscal_configuration FROM authenticated;
ALTER TABLE public.fiscal_configuration ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_configuration_read ON public.fiscal_configuration FOR SELECT TO authenticated USING(public.is_admin() AND company_id=public.current_company_id());
CREATE TABLE public.fiscal_certificate_metadata (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id), environment text NOT NULL CHECK(environment IN ('test','production')), holder_name text NOT NULL, holder_document text NOT NULL, serial_number text NOT NULL, valid_from timestamptz, valid_until timestamptz, configuration_state text NOT NULL DEFAULT 'pending' CHECK(configuration_state IN ('pending','received','saved','validated','ready','failed','replaced')), last_verified_at timestamptz, csc_identifier text, csc_configured boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fiscal_certificate_metadata TO authenticated;
GRANT ALL ON public.fiscal_certificate_metadata TO service_role;
REVOKE ALL ON public.fiscal_certificate_metadata FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.fiscal_certificate_metadata FROM authenticated;
ALTER TABLE public.fiscal_certificate_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_certificate_metadata_read ON public.fiscal_certificate_metadata FOR SELECT TO authenticated USING(public.is_admin() AND company_id=public.current_company_id());
CREATE INDEX fiscal_certificate_company_environment ON public.fiscal_certificate_metadata(company_id,environment,created_at DESC);
CREATE FUNCTION public.save_fiscal_configuration(_company_id uuid,_environment text,_expiry_warning_days integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous public.fiscal_configuration%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() OR _company_id IS DISTINCT FROM public.current_company_id() THEN RAISE EXCEPTION 'Configuração fiscal não permitida' USING ERRCODE='42501'; END IF;
 IF _environment IS NULL OR _environment NOT IN ('test','production') OR _expiry_warning_days IS NULL OR _expiry_warning_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Preferências fiscais inválidas'; END IF;
 SELECT * INTO previous FROM public.fiscal_configuration WHERE company_id=_company_id;
 INSERT INTO public.fiscal_configuration(company_id,environment,expiry_warning_days) VALUES(_company_id,_environment,_expiry_warning_days) ON CONFLICT(company_id) DO UPDATE SET environment=excluded.environment,expiry_warning_days=excluded.expiry_warning_days,updated_at=now();
 INSERT INTO public.audit_logs(actor_user_id,company_id,action,entity_type,old_value,new_value) VALUES(auth.uid(),_company_id,'fiscal_configuration_preferences_saved','fiscal_configuration',jsonb_build_object('environment',previous.environment,'expiry_warning_days',previous.expiry_warning_days),jsonb_build_object('environment',_environment,'expiry_warning_days',_expiry_warning_days,'result','saved'));
END $$;
REVOKE ALL ON FUNCTION public.save_fiscal_configuration(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_fiscal_configuration(uuid,text,integer) TO authenticated;