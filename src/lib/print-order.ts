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
  showUnitPrice?: boolean;
}

export function printThermal({ title, subtitle, items, totals = [], footer, showPrices = false, showUnitPrice = false }: PrintOptions) {
  const win = window.open('', '_blank', 'width=380,height=640');
  if (!win) {
    alert('Permita pop-ups para imprimir.');
    return;
  }
  const now = new Date().toLocaleString('pt-BR');
  const itemsHtml = items.map((it) => {
    const opts = (it.options ?? []).map((o) => `<div class="opt">+ ${escapeHtml(o.option_item_name)}</div>`).join('');
    const notes = it.notes ? `<div class="opt">Obs: ${escapeHtml(it.notes)}</div>` : '';
    const unit = showUnitPrice && typeof it.unit_price === 'number'
      ? `<div class="unit">${it.quantity} × ${fmtBRL(it.unit_price)}</div>` : '';
    const price = showPrices && typeof it.total_price === 'number'
      ? `<span class="price">${fmtBRL(it.total_price)}</span>` : '';
    return `<div class="item"><div class="row"><div class="name"><span class="qty">${it.quantity}×</span> ${escapeHtml(it.product_name)}</div>${price}</div>${unit}${opts}${notes}</div>`;
  }).join('');
  const totalsHtml = totals
    .map((t) =>
      `<div class="trow${t.bold ? ' bold' : ''}"><span>${escapeHtml(t.label)}</span><span>${escapeHtml(t.value)}</span></div>`
    ).join('');

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.35; color:#000; margin:0; padding: 6px; width: 74mm; -webkit-font-smoothing: never; font-weight: 600; }
    h1 { font-size: 22px; text-align:center; margin: 0 0 4px; font-weight: 800; text-transform: uppercase; }
    .sub { text-align:center; font-size:14px; margin-bottom:4px; font-weight:700; }
    .meta { text-align:center; font-size:12px; margin-bottom:4px; font-weight:600; }
    hr { border: 0; border-top: 2px dashed #000; margin: 6px 0; }
    .item { margin: 6px 0; padding-bottom: 4px; border-bottom: 1px dotted #000; }
    .item:last-child { border-bottom: 0; }
    .row { display:flex; justify-content:space-between; gap:8px; }
    .name { flex:1; font-size: 17px; font-weight: 700; }
    .qty { font-weight: 800; margin-right: 4px; }
    .price { white-space: nowrap; font-weight: 700; }
    .opt { padding-left: 18px; font-size: 14px; font-weight: 600; margin-top: 2px; }
    .trow { display:flex; justify-content:space-between; margin-top:4px; font-size: 16px; font-weight:700; }
    .trow.bold { font-weight:900; font-size:19px; border-top:2px solid #000; padding-top:6px; margin-top:8px; }
    .footer { text-align:center; font-size:13px; margin-top:10px; font-weight:600; }
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
