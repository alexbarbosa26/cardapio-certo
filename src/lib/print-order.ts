// Utilitário para impressão térmica (papel 80mm) abrindo uma nova janela.
import { fmtBRL } from './format';

interface PrintItem {
  quantity: number;
  product_name: string;
  unit_price?: number;
  total_price?: number;
  notes?: string | null;
  options?: { option_item_name: string }[];
}

interface PrintOptions {
  title: string;
  subtitle?: string;
  items: PrintItem[];
  totals?: { label: string; value: string; bold?: boolean }[];
  footer?: string;
  showPrices?: boolean;
}

export function printThermal({ title, subtitle, items, totals = [], footer, showPrices = true }: PrintOptions) {
  const win = window.open('', '_blank', 'width=380,height=640');
  if (!win) {
    alert('Permita pop-ups para imprimir.');
    return;
  }
  const now = new Date().toLocaleString('pt-BR');
  const itemsHtml = items.map((it) => {
    const opts = (it.options ?? []).map((o) => `<div class="opt">+ ${escapeHtml(o.option_item_name)}</div>`).join('');
    const notes = it.notes ? `<div class="opt">Obs: ${escapeHtml(it.notes)}</div>` : '';
    const price = showPrices && typeof it.total_price === 'number'
      ? `<span class="price">${fmtBRL(it.total_price)}</span>` : '';
    return `<div class="row"><div class="name"><b>${it.quantity}×</b> ${escapeHtml(it.product_name)}</div>${price}</div>${opts}${notes}`;
  }).join('');
  const totalsHtml = totals.map((t) =>
    `<div class="trow${t.bold ? ' bold' : ''}"><span>${escapeHtml(t.label)}</span><span>${escapeHtml(t.value)}</span></div>`
  ).join('');

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Courier New', ui-monospace, monospace; font-size: 12px; color:#000; margin:0; padding: 8px; width: 72mm; }
    h1 { font-size: 14px; text-align:center; margin: 0 0 4px; letter-spacing:.04em; }
    .sub { text-align:center; font-size:11px; margin-bottom:6px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .row { display:flex; justify-content:space-between; gap:8px; margin-top:4px; }
    .name { flex:1; }
    .price { white-space: nowrap; }
    .opt { padding-left: 14px; font-size: 11px; color:#000; }
    .trow { display:flex; justify-content:space-between; margin-top:2px; }
    .trow.bold { font-weight:700; font-size:13px; border-top:1px solid #000; padding-top:4px; margin-top:6px; }
    .footer { text-align:center; font-size:11px; margin-top:10px; }
    .meta { text-align:center; font-size:10px; color:#000; margin-bottom:4px; }
  </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
    <div class="meta">${now}</div>
    <hr/>
    ${itemsHtml || '<div class="sub">Sem itens</div>'}
    ${totalsHtml ? `<hr/>${totalsHtml}` : ''}
    ${footer ? `<div class="footer">${escapeHtml(footer)}</div>` : ''}
    <script>window.onload=function(){setTimeout(function(){window.print();},150);};window.onafterprint=function(){window.close();};</script>
  </body></html>`);
  win.document.close();
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}
