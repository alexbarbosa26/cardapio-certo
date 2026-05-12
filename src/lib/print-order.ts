// Utilitário para impressão térmica (papel 80mm).
// Mostra uma prévia digital antes de abrir o pop-up de impressão.
import { fmtBRL } from './format';

export interface PrintItem {
  quantity: number;
  product_name: string;
  unit_price?: number;
  total_price?: number;
  notes?: string | null;
  options?: { option_item_name: string }[];
}

export interface PrintOptions {
  title: string;
  subtitle?: string;
  items: PrintItem[];
  totals?: { label: string; value: string; bold?: boolean }[];
  footer?: string;
  showPrices?: boolean;
  showUnitPrice?: boolean;
}

export function buildThermalHtml(opts: PrintOptions): string {
  const { title, subtitle, items, totals = [], footer, showPrices = false, showUnitPrice = false } = opts;
  const now = new Date().toLocaleString('pt-BR');
  const itemsHtml = items.map((it) => {
    const o = (it.options ?? []).map((x) => `<div class="opt">+ ${esc(x.option_item_name)}</div>`).join('');
    const n = it.notes ? `<div class="opt">Obs: ${esc(it.notes)}</div>` : '';
    const u = showUnitPrice && typeof it.unit_price === 'number'
      ? `<div class="unit">${it.quantity} × ${fmtBRL(it.unit_price)}</div>` : '';
    const p = showPrices && typeof it.total_price === 'number'
      ? `<span class="price">${fmtBRL(it.total_price)}</span>` : '';
    return `<div class="item"><div class="row"><div class="name"><span class="qty">${it.quantity}×</span> ${esc(it.product_name)}</div>${p}</div>${u}${o}${n}</div>`;
  }).join('');
  const totalsHtml = totals.map((t) =>
    `<div class="trow${t.bold ? ' bold' : ''}"><span>${esc(t.label)}</span><span>${esc(t.value)}</span></div>`
  ).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; background:#fff; }
    body {
      font-family: 'Arial Black', Arial, Helvetica, sans-serif;
      font-size: 13px; line-height: 1.3; color:#000;
      padding: 4px 2px; width: 76mm; font-weight: 700;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    h1 { font-size: 18px; text-align:center; margin: 0 0 2px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; word-wrap: break-word; }
    .sub { text-align:center; font-size:12px; margin-bottom:2px; font-weight:700; }
    .meta { text-align:center; font-size:11px; margin-bottom:2px; font-weight:600; }
    hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
    .item { margin: 4px 0; padding-bottom: 3px; border-bottom: 1px dotted #000; page-break-inside: avoid; }
    .item:last-child { border-bottom: 0; }
    .row { display:flex; justify-content:space-between; gap:6px; align-items: flex-start; }
    .name { flex:1; font-size: 14px; font-weight: 800; word-wrap: break-word; overflow-wrap: break-word; hyphens: auto; }
    .qty { font-weight: 900; margin-right: 3px; }
    .price { white-space: nowrap; font-weight: 800; font-size: 13px; }
    .opt { padding-left: 14px; font-size: 11px; font-weight: 600; margin-top: 1px; word-wrap: break-word; }
    .unit { padding-left: 14px; font-size: 11px; font-weight: 600; margin-top: 1px; }
    .trow { display:flex; justify-content:space-between; gap: 6px; margin-top: 2px; font-size: 13px; font-weight:700; }
    .trow.bold { font-weight:900; font-size:16px; border-top:1px solid #000; padding-top:4px; margin-top:6px; }
    .footer { text-align:center; font-size:11px; margin-top:8px; font-weight:600; }
  </style></head><body>
    <h1>${esc(title)}</h1>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
    <div class="meta">${now}</div>
    <hr/>
    ${itemsHtml || '<div class="sub">Sem itens</div>'}
    ${totalsHtml ? `<hr/>${totalsHtml}` : ''}
    ${footer ? `<div class="footer">${esc(footer)}</div>` : ''}
  </body></html>`;
}

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Imprime via iframe oculto (compatível com Android/iOS) ou pop-up no desktop.
 */
export function openPrintWindow(opts: PrintOptions) {
  const html = buildThermalHtml(opts);

  if (isMobile()) {
    printViaIframe(html);
    return;
  }

  const win = window.open('', '_blank', 'width=420,height=720');
  if (!win) {
    // pop-up bloqueado: cai no iframe
    printViaIframe(html);
    return;
  }
  const withScript = html.replace(
    '</body>',
    `<script>window.onload=function(){setTimeout(function(){window.print();},150);};window.onafterprint=function(){window.close();};</script></body>`
  );
  win.document.open();
  win.document.write(withScript);
  win.document.close();
}

function printViaIframe(html: string) {
  // remove iframe anterior, se houver
  const prev = document.getElementById('__thermal_print_iframe__');
  if (prev) prev.remove();

  const iframe = document.createElement('iframe');
  iframe.id = '__thermal_print_iframe__';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const trigger = () => {
    try {
      const w = iframe.contentWindow;
      if (!w) return;
      w.focus();
      w.print();
    } catch (e) {
      console.error('Falha ao imprimir', e);
      alert('Não foi possível abrir a impressão. Verifique as permissões do navegador.');
    }
    // cleanup depois de um tempo
    setTimeout(() => iframe.remove(), 2000);
  };

  iframe.onload = () => setTimeout(trigger, 250);

  // srcdoc tem melhor compatibilidade em mobile que document.write
  iframe.srcdoc = html;
}

// ---- Pub/sub para a prévia (consumido pelo PrintPreviewDialog) ----
type Listener = (opts: PrintOptions | null) => void;
const listeners = new Set<Listener>();

export function subscribePrintPreview(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Abre a prévia digital. O usuário confirma e o pop-up de impressão é aberto.
 */
export function printThermal(opts: PrintOptions) {
  if (listeners.size === 0) {
    // fallback: nenhum dialog montado, imprime direto
    openPrintWindow(opts);
    return;
  }
  listeners.forEach((fn) => fn(opts));
}

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}
