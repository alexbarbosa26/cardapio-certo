import {
  exactMoney,
  fiscalDate,
  sumMoney,
  type FiscalDocument,
  type FiscalFilters,
} from "./domain";
export function printFiscalReport(
  notes: FiscalDocument[],
  filters: FiscalFilters,
  selected: boolean,
) {
  const frame = document.createElement("iframe");
  frame.title = "Relatório fiscal para impressão";
  frame.hidden = true;
  document.body.append(frame);
  const content = frame.contentDocument;
  const target = frame.contentWindow;
  if (!content || !target) {
    frame.remove();
    throw new Error("Impressão indisponível.");
  }
  const title = content.createElement("h1");
  title.textContent = "Relatório fiscal";
  content.body.append(title);
  const scope = content.createElement("p");
  scope.textContent = `${selected ? "Seleção" : "Todos os filtros"} · ${notes.length} documentos · ${exactMoney(sumMoney(notes))} · ${filters.from} a ${filters.to}`;
  content.body.append(scope);
  const criteria = content.createElement("p");
  criteria.textContent = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  content.body.append(criteria);
  const table = content.createElement("table");
  const headers = ["Participante", "Modelo", "Série", "Número", "Entrada/Saída", "Total"];
  const head = table.createTHead().insertRow();
  for (const label of headers) {
    const cell = content.createElement("th");
    cell.textContent = label;
    head.append(cell);
  }
  const body = table.createTBody();
  for (const note of notes) {
    const row = body.insertRow();
    for (const value of [
      note.participant_name,
      note.model,
      note.series,
      note.number,
      fiscalDate(note.movement_at),
      exactMoney(note.total),
    ])
      row.insertCell().textContent = value;
  }
  content.body.append(table);
  target.addEventListener("afterprint", () => frame.remove(), { once: true });
  target.focus();
  target.print();
}
