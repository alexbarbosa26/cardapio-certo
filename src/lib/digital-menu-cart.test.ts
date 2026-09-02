import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import {
  loadCart, saveCart, clearCart, cartSubtotal, cartCount, newClientToken, PAYMENT_LABELS,
  type CartItem,
} from "./digital-menu-cart";

const items: CartItem[] = [
  { item_id: "a", name: "Coxinha", price: 5, quantity: 2 },
  { item_id: "b", name: "Refri", price: 7.5, quantity: 1 },
];

describe("carrinho do cardápio digital", () => {
  beforeEach(() => localStorage.clear());

  it("persiste e recarrega por slug", () => {
    saveCart("loja", items);
    expect(loadCart("loja")).toEqual(items);
    expect(loadCart("outra")).toEqual([]);
  });

  it("limpa o carrinho", () => {
    saveCart("loja", items);
    clearCart("loja");
    expect(loadCart("loja")).toEqual([]);
  });

  it("tolera conteúdo corrompido no storage", () => {
    localStorage.setItem("mc:cart:loja", "{não é json");
    expect(loadCart("loja")).toEqual([]);
    localStorage.setItem("mc:cart:loja", '{"a":1}');
    expect(loadCart("loja")).toEqual([]);
  });

  it("calcula subtotal e contagem", () => {
    expect(cartSubtotal(items)).toBe(17.5);
    expect(cartCount(items)).toBe(3);
    expect(cartSubtotal([])).toBe(0);
    expect(cartCount([])).toBe(0);
  });

  it("gera client tokens únicos com CSPRNG", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => newClientToken()));
    expect(tokens.size).toBe(20);
    for (const t of tokens) expect(t).toMatch(/^[0-9a-z]+-[0-9a-f-]{36}$/);
  });

  it("expõe rótulos de pagamento", () => {
    expect(PAYMENT_LABELS.pix).toBeTruthy();
    expect(Object.keys(PAYMENT_LABELS)).toContain("dinheiro");
  });
});
