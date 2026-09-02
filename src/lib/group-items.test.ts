import { describe, it, expect } from "vitest";
import { groupItems, groupKey, optionsSignature, normalizeNotes } from "./group-items";

const base = { product_id: "p1", product_name: "Coxinha", unit_price: 5, quantity: 1, total_price: 5 };

describe("optionsSignature", () => {
  it("é vazia sem adicionais", () => {
    expect(optionsSignature(null)).toBe("");
    expect(optionsSignature([])).toBe("");
  });

  it("independe da ordem dos adicionais", () => {
    const a = optionsSignature([{ option_group_name: "G", option_item_name: "A" }, { option_group_name: "G", option_item_name: "B" }]);
    const b = optionsSignature([{ option_group_name: "G", option_item_name: "B" }, { option_group_name: "G", option_item_name: "A" }]);
    expect(a).toBe(b);
  });
});

describe("normalizeNotes", () => {
  it("normaliza nulos e espaços", () => {
    expect(normalizeNotes(null)).toBe("");
    expect(normalizeNotes("  sem cebola ")).toBe("sem cebola");
  });
});

describe("groupKey", () => {
  it("é estável para itens idênticos", () => {
    expect(groupKey({ ...base, id: "1" })).toBe(groupKey({ ...base, id: "2" }));
  });

  it("separa por observação, preço e adicionais", () => {
    expect(groupKey({ ...base, notes: "x" })).not.toBe(groupKey(base));
    expect(groupKey({ ...base, unit_price: 6 })).not.toBe(groupKey(base));
    expect(groupKey({ ...base, options: [{ option_item_name: "queijo" }] })).not.toBe(groupKey(base));
  });

  it("nunca agrupa itens por peso", () => {
    const w = { ...base, item_type: "peso", weight_grams: 500 };
    expect(groupKey({ ...w, id: "a" })).not.toBe(groupKey({ ...w, id: "b" }));
  });

  it("separa por contexto extra", () => {
    expect(groupKey(base, ["pronto"])).not.toBe(groupKey(base, ["preparo"]));
  });
});

describe("groupItems", () => {
  it("soma quantidades e totais preservando a ordem", () => {
    const out = groupItems([
      { ...base, id: "1" },
      { ...base, id: "2", product_name: "Coxinha" },
      { ...base, id: "3", product_id: "p2", product_name: "Pastel", unit_price: 8, total_price: 8 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ quantity: 2, total_price: 10, ids: ["1", "2"] });
    expect(out[1].first.product_name).toBe("Pastel");
  });

  it("trata quantidades e totais ausentes ou textuais", () => {
    const out = groupItems([
      { ...base, id: "1", quantity: "2", total_price: null },
      { ...base, id: "2", quantity: "abc", total_price: "5" },
    ]);
    expect(out[0]).toMatchObject({ quantity: 2, total_price: 5 });
  });

  it("retorna vazio para lista vazia", () => {
    expect(groupItems([])).toEqual([]);
  });
});
