import { supabase } from "@/integrations/supabase/client";
export type FiscalEnvironment = "test" | "production";
export interface FiscalConfiguration {
  environment: FiscalEnvironment;
  expiry_warning_days: number;
}
export interface CertificateMetadata {
  id: string;
  environment: string;
  holder_name: string;
  holder_document: string;
  serial_number: string;
  valid_from: string | null;
  valid_until: string | null;
  configuration_state: string;
  last_verified_at: string | null;
  csc_identifier: string | null;
  csc_configured: boolean;
  created_at: string;
}
export function certificateAvailability(
  certificate: CertificateMetadata,
  warningDays: number,
  now = new Date(),
): { label: string; alert: boolean } {
  const expiry = certificate.valid_until ? new Date(certificate.valid_until).getTime() : NaN;
  if (!Number.isFinite(expiry)) return { label: "Validade não verificada", alert: true };
  if (expiry <= now.getTime()) return { label: "Vencido · emissão bloqueada", alert: true };
  if (
    certificate.configuration_state !== "validated" &&
    certificate.configuration_state !== "ready"
  )
    return { label: "Validação pendente · emissão bloqueada", alert: true };
  if (!certificate.last_verified_at)
    return { label: "Verificação não registrada · emissão bloqueada", alert: true };
  if (expiry - now.getTime() <= warningDays * 86400000)
    return { label: "Próximo do vencimento", alert: true };
  return { label: "Validado · integração de emissão pendente", alert: false };
}
function requireCompany(companyId: string) {
  if (!companyId) throw new Error("Empresa não identificada");
}
export async function loadFiscalConfiguration(companyId: string) {
  requireCompany(companyId);
  const [preferences, certificates] = await Promise.all([
    supabase
      .from("fiscal_configuration")
      .select("environment,expiry_warning_days")
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("fiscal_certificate_metadata")
      .select(
        "id,environment,holder_name,holder_document,serial_number,valid_from,valid_until,configuration_state,last_verified_at,csc_identifier,csc_configured,created_at",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
  ]);
  if (preferences.error || certificates.error)
    throw new Error("Não foi possível consultar a configuração fiscal.");
  return {
    preferences: preferences.data as FiscalConfiguration | null,
    certificates: (certificates.data ?? []) as CertificateMetadata[],
  };
}
export async function saveFiscalConfiguration(companyId: string, preferences: FiscalConfiguration) {
  requireCompany(companyId);
  if (
    !["test", "production"].includes(preferences.environment) ||
    !Number.isInteger(preferences.expiry_warning_days) ||
    preferences.expiry_warning_days < 1 ||
    preferences.expiry_warning_days > 365
  )
    throw new Error("Informe uma antecedência entre 1 e 365 dias.");
  const { error } = await supabase.rpc("save_fiscal_configuration", {
    _company_id: companyId,
    _environment: preferences.environment,
    _expiry_warning_days: preferences.expiry_warning_days,
  });
  if (error) throw new Error(error.message);
}
