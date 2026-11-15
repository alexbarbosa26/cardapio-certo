import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Printer,
  MoreHorizontal,
  Copy,
  RefreshCw,
  ShieldCheck,
  FileSearch,
} from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORIES,
  defaultFilters,
  shiftPeriod,
  exactMoney,
  fiscalDate,
  fiscalCsv,
  sumMoney,
  STATUS_LABELS,
  UNAVAILABLE_ACTIONS,
  type FiscalDirection,
  type FiscalFilters,
  type FiscalDocument,
} from "@/lib/fiscal/domain";
import { readFiscalFilters, saveFiscalFilters } from "@/lib/fiscal/preferences";
import { listFiscalDocuments, exportFiscalDocuments } from "@/lib/fiscal/repository";
import { FiscalDetail } from "@/components/fiscal/FiscalDetail";
import { printFiscalReport } from "@/lib/fiscal/print-report";
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
export default function FiscalDocuments({ direction }: { direction: FiscalDirection }) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? "";
  return (
    <FiscalWorkspace
      key={`${companyId}-${direction}`}
      companyId={companyId}
      direction={direction}
    />
  );
}
function FiscalWorkspace({
  companyId,
  direction,
}: {
  companyId: string;
  direction: FiscalDirection;
}) {
  const [filters, setFilters] = useState(() => readFiscalFilters(companyId, direction));
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [selected, setSelected] = useState<string[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [report, setReport] = useState<FiscalDocument[] | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["fiscal-list", companyId, direction, filters, page, size],
    queryFn: () => listFiscalDocuments(companyId, direction, filters, page, size),
    enabled: !!companyId,
  });
  useEffect(
    () => saveFiscalFilters(companyId, direction, filters),
    [companyId, direction, filters],
  );
  const update = (field: keyof FiscalFilters, value: string) => {
    setFilters((previous) => ({ ...previous, [field]: value }));
    setPage(1);
    setSelected([]);
  };
  const notes = query.data?.documents ?? [];
  const count = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / size));
  const exportNotes = async (kind: "csv" | "report") => {
    if (exporting) return;
    setExporting(true);
    try {
      const documents = await exportFiscalDocuments(companyId, direction, filters, selected, kind);
      if (kind === "report") setReport(documents);
      else {
        const url = URL.createObjectURL(
          new Blob([fiscalCsv(documents)], { type: "text/csv;charset=utf-8;" }),
        );
        const anchor = globalThis.document.createElement("a");
        anchor.href = url;
        anchor.download = `fiscal-${direction}-${filters.from || "todos"}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success(`${documents.length} documento(s) exportado(s).`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar.");
    } finally {
      setExporting(false);
    }
  };
  const movePeriod = (offset: number) => {
    setFilters((previous) => shiftPeriod(previous, offset));
    setPage(1);
    setSelected([]);
  };
  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success("Chave copiada.");
    } catch {
      toast.error("Não foi possível copiar a chave.");
    }
  };
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Receipt className="h-4 w-4" />
            Fiscal
          </div>
          <h1 className="text-2xl font-semibold">
            Notas de {direction === "entrada" ? "Entrada" : "Saída"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Documentos fiscais ·{" "}
            {direction === "entrada" ? "Fornecedores e recebimentos" : "NF-e e NFC-e"}
          </p>
        </div>
        <Badge variant="outline" className="gap-2 border-warning text-warning-foreground">
          <ShieldCheck className="h-4 w-4" />
          Consulta · integração fiscal não configurada
        </Badge>
      </header>
      <nav aria-label="Área Fiscal" className="flex flex-wrap gap-2 border-b pb-4">
        <Button asChild variant={direction === "entrada" ? "default" : "ghost"}>
          <Link to="/fiscal/entradas">
            <ArrowDownLeft />
            Entradas
          </Link>
        </Button>
        <Button asChild variant={direction === "saida" ? "default" : "ghost"}>
          <Link to="/fiscal/saidas">
            <ArrowUpRight />
            Saídas
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/fiscal/configuracao">Configuração fiscal</Link>
        </Button>
      </nav>
      <section className="space-y-4" aria-label="Filtros fiscais">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filters.category} onValueChange={(value) => update("category", value)}>
            <TabsList className="h-auto flex-wrap justify-start">
              {CATEGORIES[direction].map((category) => (
                <TabsTrigger key={category.value} value={category.value}>
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              title="Mês anterior"
              aria-label="Mês anterior"
              onClick={() => movePeriod(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              title="Próximo mês"
              aria-label="Próximo mês"
              onClick={() => movePeriod(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
          <Filter label="Data inicial" id="from">
            <Input
              id="from"
              type="date"
              value={filters.from}
              onChange={(e) => update("from", e.target.value)}
            />
          </Filter>
          <Filter label="Data final" id="to">
            <Input
              id="to"
              type="date"
              value={filters.to}
              onChange={(e) => update("to", e.target.value)}
            />
          </Filter>
          <div className="col-span-2">
            <Filter
              label={direction === "entrada" ? "Emitente / Fornecedor" : "Destinatário"}
              id="participant"
            >
              <Input
                id="participant"
                value={filters.participant}
                placeholder="Buscar por nome"
                onChange={(e) => update("participant", e.target.value)}
              />
            </Filter>
          </div>
          <Filter label="Situação fiscal" id="status">
            <select
              id="status"
              className={selectClass}
              value={filters.status}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">Todas</option>
              {[
                "desconhecida",
                "pendente",
                "autorizada",
                "rejeitada",
                "cancelada",
                "inutilizada",
              ].map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="Série" id="series">
            <Input
              id="series"
              value={filters.series}
              onChange={(e) => update("series", e.target.value)}
            />
          </Filter>
          <Filter label="Nº Nota" id="number">
            <Input
              id="number"
              value={filters.number}
              onChange={(e) => update("number", e.target.value)}
            />
          </Filter>
          <div className="col-span-2">
            <Filter label="Chave de acesso" id="key">
              <Input id="key" value={filters.key} onChange={(e) => update("key", e.target.value)} />
            </Filter>
          </div>
          {direction === "saida" && (
            <Filter label="Modelo" id="model">
              <select
                id="model"
                className={selectClass}
                value={filters.model}
                onChange={(e) => update("model", e.target.value)}
              >
                <option value="">Todos</option>
                <option>NF-e</option>
                <option>NFC-e</option>
              </select>
            </Filter>
          )}
        </div>
        <div className="flex flex-wrap justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              setFilters(defaultFilters(direction));
              setPage(1);
              setSelected([]);
            }}
          >
            Limpar filtros
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Atualizar consulta"
              title="Atualizar consulta"
              disabled={query.isFetching}
              onClick={() => {
                setSelected([]);
                query.refetch();
              }}
            >
              <RefreshCw />
            </Button>
            <Button
              variant="outline"
              disabled={!count || exporting || query.isFetching || query.isError}
              onClick={() => exportNotes("csv")}
            >
              <Download />
              Exportar
            </Button>
            <Button
              variant="outline"
              disabled={!count || exporting || query.isFetching || query.isError}
              onClick={() => exportNotes("report")}
            >
              <Printer />
              Relatório
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <MoreHorizontal />
                  Ações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[65vh] overflow-y-auto">
                <DropdownMenuLabel>Operações ainda indisponíveis</DropdownMenuLabel>
                {UNAVAILABLE_ACTIONS[direction].map((action) => (
                  <DropdownMenuItem key={action} onSelect={() => setUnavailable(action)}>
                    {action}
                    <span className="ml-auto text-xs text-muted-foreground">Em breve</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem asChild>
                  <Link to="/fiscal/configuracao">Certificados e CSC</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>
      <section aria-label="Documentos fiscais" className="border-t">
        <div className="flex flex-wrap justify-between gap-3 py-4 text-sm">
          <span>
            <strong>{count}</strong> documentos
            {selected.length ? ` · ${selected.length} selecionados` : ""}
          </span>
          <span className="text-muted-foreground">
            Total dos filtros:{" "}
            <strong className="text-foreground">{exactMoney(query.data?.total ?? "0")}</strong>
          </span>
        </div>
        {query.isPending && companyId && (
          <div role="status" className="py-16 text-center text-muted-foreground">
            Carregando documentos…
          </div>
        )}
        {query.isError && (
          <div role="alert" className="space-y-3 py-10 text-center">
            <p className="text-destructive">{query.error.message}</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {!query.isPending && !query.isError && notes.length === 0 && (
          <div className="flex flex-col items-center gap-3 border-y py-16 text-center">
            <FileSearch className="h-10 w-10 text-muted-foreground" />
            <h2 className="font-semibold">Nenhuma nota encontrada</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Não há documentos para estes filtros. A importação de XML será disponibilizada na
              próxima etapa; emissão e eventos fiscais aguardam integração.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setFilters(defaultFilters(direction));
                setPage(1);
              }}
            >
              Restaurar período atual
            </Button>
          </div>
        )}
        {!!notes.length && !query.isError && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-y bg-muted">
                <tr>
                  <th className="p-3">
                    <Checkbox
                      aria-label="Selecionar página"
                      checked={notes.every((note) => selected.includes(note.id))}
                      onCheckedChange={(checked) =>
                        setSelected(
                          checked
                            ? [...new Set([...selected, ...notes.map((n) => n.id)])]
                            : selected.filter((id) => !notes.some((n) => n.id === id)),
                        )
                      }
                    />
                  </th>
                  {[
                    direction === "entrada" ? "Emitente" : "Destinatário",
                    "Série",
                    "Nº Nota",
                    ...(direction === "saida" ? ["Modelo"] : []),
                    "Chave de Acesso",
                    direction === "entrada" ? "Data de Entrada" : "Data de Saída",
                    direction === "entrada" ? "Lançamento" : "Criação",
                    ...(direction === "entrada" ? ["Emissão"] : []),
                    "Valor Total",
                    "Situação",
                  ].map((label) => (
                    <th key={label} className="whitespace-nowrap p-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr key={note.id} className="border-b hover:bg-muted/50">
                    <td className="p-3">
                      <Checkbox
                        aria-label={`Selecionar nota ${note.number}`}
                        checked={selected.includes(note.id)}
                        onCheckedChange={(checked) =>
                          setSelected((previous) =>
                            checked
                              ? [...previous, note.id]
                              : previous.filter((id) => id !== note.id),
                          )
                        }
                      />
                    </td>
                    <td className="max-w-64 p-3">
                      <Button
                        variant="link"
                        className="h-auto whitespace-normal p-0 text-left"
                        onClick={() => setDocumentId(note.id)}
                      >
                        {note.participant_name || "Não informado"}
                      </Button>
                    </td>
                    <td className="p-3">{note.series || "—"}</td>
                    <td className="p-3">
                      <Button variant="link" className="p-0" onClick={() => setDocumentId(note.id)}>
                        {note.number || "—"}
                      </Button>
                    </td>
                    {direction === "saida" && <td className="p-3">{note.model}</td>}
                    <td className="p-3">
                      {note.access_key ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono" title={note.access_key}>
                            {note.access_key.slice(0, 6)}…{note.access_key.slice(-6)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Copiar chave da nota ${note.number}`}
                            title="Copiar chave integral"
                            onClick={() => copyKey(note.access_key ?? "")}
                          >
                            <Copy />
                          </Button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3">{fiscalDate(note.movement_at)}</td>
                    <td className="whitespace-nowrap p-3">
                      {fiscalDate(direction === "entrada" ? note.posted_at : note.created_at)}
                    </td>
                    {direction === "entrada" && (
                      <td className="whitespace-nowrap p-3">{fiscalDate(note.issued_at)}</td>
                    )}
                    <td className="whitespace-nowrap p-3 font-medium">{exactMoney(note.total)}</td>
                    <td className="p-3">
                      <Badge variant="outline">
                        {STATUS_LABELS[note.authorization_status] ?? note.authorization_status}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {STATUS_LABELS[note.transmission_status] ?? note.transmission_status}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4 py-4">
          <Filter label="Linhas por página" id="size">
            <select
              id="size"
              className={selectClass}
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(1);
                setSelected([]);
              }}
            >
              {[10, 25, 50, 100].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Filter>
          <div className="flex flex-wrap items-center gap-1">
            <PageButton label="Primeira página" disabled={page === 1} onClick={() => setPage(1)}>
              <ChevronsLeft />
            </PageButton>
            <PageButton
              label="Página anterior"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft />
            </PageButton>
            {Array.from(
              { length: Math.min(5, pages) },
              (_, i) => Math.min(Math.max(1, page - 2), Math.max(1, pages - 4)) + i,
            ).map((number) => (
              <Button
                key={number}
                size="icon"
                variant={page === number ? "default" : "ghost"}
                aria-label={`Página ${number}`}
                aria-current={page === number ? "page" : undefined}
                onClick={() => setPage(number)}
              >
                {number}
              </Button>
            ))}
            <PageButton
              label="Próxima página"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight />
            </PageButton>
            <PageButton
              label="Última página"
              disabled={page >= pages}
              onClick={() => setPage(pages)}
            >
              <ChevronsRight />
            </PageButton>
            <span className="ml-2 text-xs text-muted-foreground">
              {page} de {pages}
            </span>
          </div>
        </div>
      </section>
      {documentId && (
        <FiscalDetail
          companyId={companyId}
          documentId={documentId}
          direction={direction}
          filters={filters}
          onClose={() => setDocumentId(null)}
        />
      )}
      <Dialog
        open={!!unavailable}
        onOpenChange={(open) => {
          if (!open) setUnavailable(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{unavailable}</DialogTitle>
            <DialogDescription>
              {unavailable === "Aquisição por foto"
                ? "Indisponível até a escolha e configuração do processamento de imagem com revisão dos campos."
                : unavailable === "Importar XML"
                  ? "A importação e prévia sem efeitos em estoque ou financeiro serão disponibilizadas na próxima etapa."
                  : "Esta operação ainda não foi implementada. Integração, permissões e regras fiscais precisam ser validadas antes de habilitá-la."}
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => setUnavailable(null)}>
            Entendi
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={report !== null}
        onOpenChange={(open) => {
          if (!open) setReport(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Relatório de {direction === "entrada" ? "Entradas" : "Saídas"}
            </DialogTitle>
            <DialogDescription>
              {selected.length ? "Documentos selecionados" : "Todos os resultados dos filtros"} ·{" "}
              {filters.from || "Sem início"} a {filters.to || "Sem fim"} · {report?.length ?? 0}{" "}
              documentos · {exactMoney(sumMoney(report ?? []))}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Categoria: {filters.category} · Situação: {filters.status || "Todas"} · Modelo:{" "}
            {filters.model || "Todos"}
            {filters.participant && ` · Participante: ${filters.participant}`}
            {filters.series && ` · Série: ${filters.series}`}
            {filters.number && ` · Número: ${filters.number}`}
            {filters.key && ` · Chave: ${filters.key}`}
          </p>
          <div id="fiscal-report" className="space-y-2">
            {report?.map((note) => (
              <div
                key={note.id}
                className="grid grid-cols-2 gap-2 border-b py-2 text-sm sm:grid-cols-4"
              >
                <span className="break-words">{note.participant_name}</span>
                <span>
                  {note.model} · {note.series}/{note.number}
                </span>
                <span>{fiscalDate(note.movement_at)}</span>
                <span>{exactMoney(note.total)}</span>
              </div>
            ))}
          </div>
          <Button
            onClick={() => {
              try {
                printFiscalReport(report ?? [], filters, selected.length > 0);
              } catch {
                toast.error("Não foi possível imprimir o relatório.");
              }
            }}
          >
            <Printer />
            Imprimir
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Filter({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
