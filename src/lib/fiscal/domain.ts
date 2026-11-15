export type FiscalDirection = "entrada" | "saida";
export interface FiscalFilters {
  from: string;
  to: string;
  participant: string;
  series: string;
  number: string;
  key: string;
  model: string;
  status: string;
  category: string;
}
export interface FiscalDocument {
  id: string;
  company_id: string;
  direction: FiscalDirection;
  model: string;
  series: string;
  number: string;
  access_key: string | null;
  participant_name: string;
  issued_at: string | null;
  movement_at: string | null;
  posted_at: string | null;
  created_at: string;
  total: string;
  authorization_status: string;
  transmission_status: string;
  category: string;
  fiscal_message: string | null;
  receipt_status: string;
  financial_status: string;
  order_id: string | null;
  last_checked_at: string | null;
}
export interface FiscalPage {
  documents: FiscalDocument[];
  count: number;
  total: string;
}
export interface HistoricalField {
  label: string;
  value: string;
}
export interface HistoricalSection {
  title: string;
  fields: HistoricalField[];
}
export interface FiscalSnapshot {
  participants?: HistoricalSection[];
  items?: {
    description: string;
    external_code?: string;
    product_id?: string;
    unit: string;
    quantity: string;
    unit_price: string;
    total: string;
  }[];
  amounts?: HistoricalField[];
  taxes?: HistoricalField[];
  installments?: { label: string; due_date: string; amount: string; status?: string }[];
  transport?: HistoricalSection[];
}
export const CATEGORIES = {
  entrada: [
    { value: "autorizadas", label: "Autorizadas" },
    { value: "excluidas", label: "Excluídas" },
  ],
  saida: [
    { value: "transmitidas", label: "Transmitidas" },
    { value: "pendentes", label: "Pendentes" },
    { value: "canceladas", label: "Canceladas" },
    { value: "inutilizadas", label: "Inutilizadas" },
    { value: "offline", label: "Offline" },
  ],
} as const;
export const STATUS_LABELS: Record<string, string> = {
  desconhecida: "Desconhecida",
  pendente: "Pendente",
  autorizada: "Autorizada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
  inutilizada: "Inutilizada",
  nao_enviada: "Não enviada",
  enviada: "Enviada",
  aguardando_resposta: "Aguardando resposta",
  offline: "Offline",
  nao_informado: "Não informado",
};
export function defaultFilters(direction: FiscalDirection, now = new Date()): FiscalFilters {
  const date = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    from: date(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: date(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    participant: "",
    series: "",
    number: "",
    key: "",
    model: "",
    status: "",
    category: CATEGORIES[direction][0].value,
  };
}
export function shiftPeriod(filters: FiscalFilters, offset: number): FiscalFilters {
  const start = new Date(`${filters.from}T12:00:00`);
  if (Number.isNaN(start.getTime())) return filters;
  const next = defaultFilters(
    "entrada",
    new Date(start.getFullYear(), start.getMonth() + offset, 1),
  );
  return { ...filters, from: next.from, to: next.to };
}
export function exactMoney(value: string): string {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return "—";
  const negative = value.startsWith("-");
  const [integer, cents = ""] = value.replace("-", "").split(".");
  return `${negative ? "-" : ""}R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents.padEnd(2, "0")}`;
}
export function sumMoney(documents: readonly FiscalDocument[]): string {
  const cents = documents.reduce((sum, document) => {
    if (!/^\d+(\.\d{1,2})?$/.test(document.total)) throw new Error("Valor fiscal inválido");
    const [whole, fraction = ""] = document.total.split(".");
    return sum + BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  }, 0n);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
export function fiscalDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
}
const CSV_HEADERS = [
  "Participante",
  "Série",
  "Nº Nota",
  "Modelo",
  "Chave de Acesso",
  "Emissão",
  "Entrada/Saída",
  "Lançamento",
  "Criação",
  "Valor Total",
  "Autorização",
  "Transmissão",
];
function csvCell(value: string): string {
  // Prefix textual identifiers and formula-like input with an apostrophe for spreadsheet safety.
  const safe =
    /^[\s]*[=+\-@\t\r\n]/.test(value) || /^0\d+$/.test(value) || /^\d{15,}$/.test(value)
      ? `'${value}`
      : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function fiscalCsv(documents: readonly FiscalDocument[]): string {
  return (
    "\uFEFF" +
    [
      CSV_HEADERS,
      ...documents.map((d) => [
        d.participant_name,
        d.series,
        d.number,
        d.model,
        d.access_key ?? "",
        fiscalDate(d.issued_at),
        fiscalDate(d.movement_at),
        fiscalDate(d.posted_at),
        fiscalDate(d.created_at),
        d.total,
        STATUS_LABELS[d.authorization_status] ?? d.authorization_status,
        STATUS_LABELS[d.transmission_status] ?? d.transmission_status,
      ]),
    ]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n")
  );
}
export const UNAVAILABLE_ACTIONS: Record<FiscalDirection, readonly string[]> = {
  entrada: [
    "Importar XML",
    "Aquisição por foto",
    "Lançamento manual",
    "Alterar",
    "Excluir logicamente",
    "Devolver",
    "Manifestar",
  ],
  saida: [
    "Incluir nota",
    "Alterar",
    "Duplicar",
    "Consultar situação",
    "Cancelar nota",
    "Carta de correção",
    "Retransmitir",
    "Inutilizar",
    "Enviar por e-mail",
    "Gerenciar transportadora",
  ],
};
