import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getFiscalDocument, getFiscalFile, auditFiscalDistribution } from "@/lib/fiscal/repository";
import {
  fiscalDate,
  exactMoney,
  STATUS_LABELS,
  type FiscalDirection,
  type FiscalFilters,
  type HistoricalField,
  type HistoricalSection,
} from "@/lib/fiscal/domain";
import { Download } from "lucide-react";
import { toast } from "sonner";
function Fields({ fields }: { fields: HistoricalField[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {fields.map((field, index) => (
        <div key={`${field.label}-${index}`} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{field.label}</dt>
          <dd className="mt-1 break-words text-sm">{field.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
function Sections({ sections }: { sections?: HistoricalSection[] }) {
  return sections?.length ? (
    <div className="space-y-6">
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`}>
          <h3 className="mb-3 font-medium">{section.title}</h3>
          <Fields fields={section.fields} />
        </section>
      ))}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">Nenhuma informação registrada.</p>
  );
}
export function FiscalDetail({
  companyId,
  documentId,
  direction,
  filters,
  onClose,
}: {
  companyId: string;
  documentId: string;
  direction: FiscalDirection;
  filters: FiscalFilters;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["fiscal-detail", companyId, documentId],
    queryFn: () => getFiscalDocument(companyId, documentId),
  });
  const [downloading, setDownloading] = useState(false);
  const download = async (fileId: string) => {
    if (downloading) return;
    setDownloading(true);
    try {
      await auditFiscalDistribution(companyId, direction, filters, [documentId], "file");
      const url = await getFiscalFile(companyId, documentId, fileId);
      const anchor = globalThis.document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o arquivo.");
    } finally {
      setDownloading(false);
    }
  };
  const loaded = query.data;
  const note = loaded?.document;
  const snapshot = loaded?.snapshot;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>
            Nota {note?.number || "fiscal"} {note?.model}
          </SheetTitle>
          <SheetDescription>
            {note?.participant_name || "Detalhes do documento fiscal"}
          </SheetDescription>
        </SheetHeader>
        {query.isPending && (
          <p role="status" className="py-8">
            Carregando documento…
          </p>
        )}
        {query.isError && (
          <div role="alert" className="py-8">
            <p>{query.error.message}</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {note && snapshot && loaded && (
          <Tabs defaultValue="summary" className="mt-6">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="summary">Resumo</TabsTrigger>
              <TabsTrigger value="participants">Participantes</TabsTrigger>
              <TabsTrigger value="items">Itens</TabsTrigger>
              <TabsTrigger value="amounts">Valores e Tributos</TabsTrigger>
              <TabsTrigger value="payments">Pagamentos/Parcelas</TabsTrigger>
              <TabsTrigger value="files">Documentos</TabsTrigger>
              <TabsTrigger value="events">Eventos</TabsTrigger>
              {snapshot.transport?.length ? (
                <TabsTrigger value="transport">Transporte</TabsTrigger>
              ) : null}
            </TabsList>
            <TabsContent value="summary" className="space-y-5 pt-4">
              <Fields
                fields={[
                  { label: "Modelo", value: note.model },
                  { label: "Série / Número", value: `${note.series} / ${note.number}` },
                  { label: "Chave de acesso", value: note.access_key ?? "Não registrada" },
                  { label: "Emissão", value: fiscalDate(note.issued_at) },
                  {
                    label: direction === "entrada" ? "Entrada" : "Saída",
                    value: fiscalDate(note.movement_at),
                  },
                  { label: "Lançamento", value: fiscalDate(note.posted_at) },
                  { label: "Criação", value: fiscalDate(note.created_at) },
                  { label: "Total", value: exactMoney(note.total) },
                  {
                    label: "Autorização",
                    value: STATUS_LABELS[note.authorization_status] ?? note.authorization_status,
                  },
                  {
                    label: "Transmissão",
                    value: STATUS_LABELS[note.transmission_status] ?? note.transmission_status,
                  },
                  { label: "Mensagem fiscal", value: note.fiscal_message ?? "Não registrada" },
                  { label: "Última consulta", value: fiscalDate(note.last_checked_at) },
                  ...(direction === "entrada"
                    ? [
                        {
                          label: "Recebimento físico",
                          value: STATUS_LABELS[note.receipt_status] ?? note.receipt_status,
                        },
                        {
                          label: "Financeiro",
                          value: STATUS_LABELS[note.financial_status] ?? note.financial_status,
                        },
                      ]
                    : []),
                ]}
              />
              {note.order_id && (
                <Button variant="link" asChild>
                  <Link to="/historico-pedidos">Consultar histórico de pedidos</Link>
                </Button>
              )}
              {note.order_id && (
                <p className="break-all text-xs text-muted-foreground">
                  Pedido de origem: {note.order_id}
                </p>
              )}
            </TabsContent>
            <TabsContent value="participants" className="pt-4">
              <Sections sections={snapshot.participants} />
            </TabsContent>
            <TabsContent value="items" className="space-y-4 pt-4">
              {snapshot.items?.length ? (
                snapshot.items.map((item, index) => (
                  <section key={`${item.external_code}-${index}`} className="border-b pb-4">
                    <h3 className="mb-3 break-words font-medium">{item.description}</h3>
                    <Fields
                      fields={[
                        { label: "Código externo", value: item.external_code ?? "—" },
                        { label: "Produto interno", value: item.product_id ?? "Não vinculado" },
                        { label: "Quantidade / Unidade", value: `${item.quantity} ${item.unit}` },
                        { label: "Preço unitário", value: exactMoney(item.unit_price) },
                        { label: "Total", value: exactMoney(item.total) },
                      ]}
                    />
                  </section>
                ))
              ) : (
                <p className="text-muted-foreground">Nenhum item registrado.</p>
              )}
            </TabsContent>
            <TabsContent value="amounts" className="space-y-6 pt-4">
              <Fields
                fields={snapshot.amounts ?? [{ label: "Total", value: exactMoney(note.total) }]}
              />
              <h3 className="font-medium">Tributos</h3>
              {snapshot.taxes?.length ? (
                <Fields fields={snapshot.taxes} />
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum tributo registrado.</p>
              )}
            </TabsContent>
            <TabsContent value="payments" className="space-y-4 pt-4">
              {snapshot.installments?.length ? (
                snapshot.installments.map((installment, index) => (
                  <Fields
                    key={`${installment.label}-${index}`}
                    fields={[
                      { label: "Parcela", value: installment.label },
                      { label: "Vencimento", value: installment.due_date },
                      { label: "Valor", value: exactMoney(installment.amount) },
                      { label: "Situação", value: installment.status ?? "Não informada" },
                    ]}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum pagamento ou parcela registrado.
                </p>
              )}
            </TabsContent>
            <TabsContent value="files" className="space-y-3 pt-4">
              {loaded.files.length ? (
                loaded.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-3 border-b py-3"
                  >
                    <span className="min-w-0 break-words text-sm">
                      {file.kind === "xml" ? "XML" : "Documento auxiliar"} · {file.name}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Abrir arquivo"
                      aria-label={`Abrir ${file.name}`}
                      disabled={downloading}
                      onClick={() => download(file.id)}
                    >
                      <Download />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  XML e documento auxiliar indisponíveis: nenhum arquivo vinculado a esta nota.
                </p>
              )}
            </TabsContent>
            <TabsContent value="events" className="space-y-4 pt-4">
              {loaded.events.length ? (
                loaded.events.map((event) => (
                  <section key={event.id} className="border-b pb-4">
                    <h3 className="font-medium">{event.action}</h3>
                    <p className="text-xs text-muted-foreground">{fiscalDate(event.created_at)}</p>
                    <p className="mt-2 break-words text-sm">{event.message}</p>
                    {event.protocol && (
                      <p className="break-all text-xs">Protocolo: {event.protocol}</p>
                    )}
                  </section>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
              )}
            </TabsContent>
            <TabsContent value="transport" className="pt-4">
              <Sections sections={snapshot.transport} />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
