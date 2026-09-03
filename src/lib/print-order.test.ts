import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildThermalHtml, openPrintWindow, printThermal, subscribePrintPreview, type PrintItem } from "./print-order";

const items: PrintItem[] = [
  {
    quantity: 2,
    product_name: "Coxinha",
    unit_price: 5,
    total_price: 10,
    notes: "sem catupiry",
    options: [{ option_item_name: "Extra queijo" }],
  },
];

describe("buildThermalHtml", () => {
  it("imprime itens com quantidade, opcionais e observações", () => {
    const html = buildThermalHtml({ title: "Pedido 1", items });
    expect(html).toContain("Pedido 1");
    expect(html).toContain("2×");
    expect(html).toContain("Coxinha");
    expect(html).toContain("+ Extra queijo");
    expect(html).toContain("Obs: sem catupiry");
  });

  it("oculta preços por padrão e mostra quando solicitado", () => {
    expect(buildThermalHtml({ title: "T", items })).not.toContain("class=\"price\"");

    const withPrices = buildThermalHtml({ title: "T", items, showPrices: true, showUnitPrice: true });
    expect(withPrices).toContain("class=\"price\"");
    expect(withPrices).toContain("Valor");
    expect(withPrices.replaceAll("\u00a0", " ")).toContain("2 × R$ 5,00");
  });

  it("mostra aviso quando não há itens", () => {
    expect(buildThermalHtml({ title: "T", items: [] })).toContain("Sem itens");
  });

  it("renderiza totais, destaque e rodapé", () => {
    const html = buildThermalHtml({
      title: "T",
      items,
      totals: [
        { label: "Subtotal", value: "R$ 10,00" },
        { label: "Total", value: "R$ 12,00", bold: true },
      ],
      footer: "Obrigado!",
      subtitle: "Mesa 4",
    });
    expect(html).toContain("trow bold");
    expect(html).toContain("Subtotal");
    expect(html).toContain("Obrigado!");
    expect(html).toContain("Mesa 4");
  });

  it("renderiza a marca apenas com os campos informados", () => {
    const full = buildThermalHtml({ title: "T", items, brand: { name: "Bar", tradeName: "Do Zé", logoUrl: "/l.png" } });
    expect(full).toContain('<img class="brand-logo" src="/l.png"');
    expect(full).toContain('<div class="brand-name">Bar</div>');
    expect(full).toContain('<div class="brand-trade">Do Zé</div>');

    const partial = buildThermalHtml({ title: "T", items, brand: { name: "Bar" } });
    expect(partial).not.toContain("<img class=\"brand-logo\"");
    expect(partial).not.toContain("<div class=\"brand-trade\">");

    expect(buildThermalHtml({ title: "T", items })).not.toContain('<div class="brand-name">');
  });

  it("escapa conteúdo perigoso vindo dos dados", () => {
    const html = buildThermalHtml({
      title: "<script>alert(1)</script>",
      items: [{ quantity: 1, product_name: "A & B \"x\" 'y' <b>" }],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B &quot;x&quot; &#39;y&#39; &lt;b&gt;");
  });
});

describe("printThermal e openPrintWindow", () => {
  const originalOpen = globalThis.open;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    globalThis.open = originalOpen;
    vi.restoreAllMocks();
  });

  it("notifica os assinantes da prévia em vez de imprimir direto", () => {
    const open = vi.fn();
    globalThis.open = open as unknown as typeof globalThis.open;
    const seen: unknown[] = [];
    const unsubscribe = subscribePrintPreview((o) => seen.push(o));

    printThermal({ title: "Pedido", items });
    expect(seen).toHaveLength(1);
    expect(open).not.toHaveBeenCalled();

    unsubscribe();
    printThermal({ title: "Pedido", items });
    expect(seen).toHaveLength(1);
    expect(open).toHaveBeenCalled();
  });

  it("escreve o documento na janela de impressão no desktop", () => {
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    globalThis.open = vi.fn(() => ({ document: doc })) as unknown as typeof globalThis.open;

    openPrintWindow({ title: "Pedido 9", items });

    expect(doc.write).toHaveBeenCalledTimes(1);
    const html = doc.write.mock.calls[0][0] as string;
    expect(html).toContain("Pedido 9");
    expect(html).toContain("window.print()");
    expect(doc.close).toHaveBeenCalled();
  });

  it("cai para o iframe oculto quando o pop-up é bloqueado", () => {
    globalThis.open = vi.fn(() => null) as unknown as typeof globalThis.open;
    const createObjectURL = vi.fn(() => "blob:print");
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });

    openPrintWindow({ title: "Pedido", items });

    const iframe = document.querySelector("#__thermal_print_iframe__");
    expect(iframe).not.toBeNull();
    expect(iframe).toHaveAttribute("aria-hidden", "true");
    expect(createObjectURL).toHaveBeenCalled();
  });
});
