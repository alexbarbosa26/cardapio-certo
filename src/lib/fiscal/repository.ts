import { supabase } from "@/integrations/supabase/client";
import type {
  FiscalDirection,
  FiscalFilters,
  FiscalPage,
  FiscalDocument,
  FiscalSnapshot,
} from "./domain";
function requireCompany(companyId: string) {
  if (!companyId) throw new Error("Empresa não identificada");
}
export async function listFiscalDocuments(
  companyId: string,
  direction: FiscalDirection,
  filters: FiscalFilters,
  page: number,
  size: number,
  exporting = false,
): Promise<FiscalPage> {
  requireCompany(companyId);
  if (filters.from && filters.to && filters.from > filters.to)
    throw new Error("A data inicial deve ser anterior à data final.");
  const { data, error } = await supabase.rpc("list_fiscal_documents", {
    _company_id: companyId,
    _direction: direction,
    _filters: { ...filters },
    _page: page,
    _size: size,
    _export: exporting,
  });
  if (error) throw new Error(error.message);
  return data as unknown as FiscalPage;
}
export async function getFiscalDocument(companyId: string, documentId: string) {
  requireCompany(companyId);
  const { data, error } = await supabase.rpc("get_fiscal_document", {
    _company_id: companyId,
    _document_id: documentId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Documento não encontrado ou sem permissão.");
  const detail = data as unknown as FiscalDocument & { snapshot: FiscalSnapshot };
  const [files, events] = await Promise.all([
    supabase
      .from("fiscal_document_files")
      .select("id,name,kind")
      .eq("company_id", companyId)
      .eq("document_id", documentId),
    supabase
      .from("fiscal_document_events")
      .select("id,action,message,protocol,created_at")
      .eq("company_id", companyId)
      .eq("document_id", documentId)
      .order("created_at", { ascending: false }),
  ]);
  if (files.error || events.error)
    throw new Error("Não foi possível carregar arquivos e histórico.");
  return {
    document: detail,
    snapshot: detail.snapshot,
    files: files.data ?? [],
    events: events.data ?? [],
  };
}
export async function auditFiscalDistribution(
  companyId: string,
  direction: FiscalDirection,
  filters: FiscalFilters,
  ids: string[],
  kind: "csv" | "report" | "file",
) {
  requireCompany(companyId);
  const { error } = await supabase.rpc("audit_fiscal_distribution", {
    _company_id: companyId,
    _direction: direction,
    _filters: { ...filters },
    _selected_ids: ids,
    _kind: kind,
  });
  if (error) throw new Error(error.message);
}
export async function exportFiscalDocuments(
  companyId: string,
  direction: FiscalDirection,
  filters: FiscalFilters,
  selectedIds: readonly string[],
  kind: "csv" | "report",
) {
  const documents: FiscalDocument[] = [];
  let page = 1;
  let count = 0;
  do {
    const result = await listFiscalDocuments(companyId, direction, filters, page, 1000, true);
    count = result.count;
    if (result.documents.length === 0 && documents.length < count)
      throw new Error("A consulta mudou durante a exportação. Atualize e tente novamente.");
    documents.push(...result.documents);
    page++;
  } while (documents.length < count);
  const scoped = selectedIds.length
    ? documents.filter((document) => selectedIds.includes(document.id))
    : documents;
  if (selectedIds.length && scoped.length !== selectedIds.length)
    throw new Error("A seleção mudou. Selecione novamente os documentos.");
  await auditFiscalDistribution(
    companyId,
    direction,
    filters,
    scoped.map((d) => d.id),
    kind,
  );
  return scoped;
}
export async function getFiscalFile(companyId: string, documentId: string, fileId: string) {
  requireCompany(companyId);
  const { data, error } = await supabase
    .from("fiscal_document_files")
    .select("storage_path")
    .eq("id", fileId)
    .eq("company_id", companyId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (error || !data) throw new Error("Arquivo não encontrado ou sem permissão.");
  const signed = await supabase.storage
    .from("fiscal-documents")
    .createSignedUrl(data.storage_path, 60);
  if (signed.error) throw new Error("Não foi possível obter acesso ao arquivo.");
  return signed.data.signedUrl;
}
