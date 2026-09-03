import { describe, it, expect, beforeEach, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() }, rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  loadCart, saveCart, clearCart, cartSubtotal, cartCount, newClientToken, PAYMENT_LABELS,
  submitPublicOrder, fetchPublicOrder,
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

describe("envio e consulta de pedido público", () => {
  beforeEach(() => rpc.mockReset());

  const input = {
    slug: "LOJA",
    client_token: "tok",
    service_mode: "delivery" as const,
    customer_name: "Ana",
    customer_phone: "11988887777",
    payment_method: "pix" as const,
    items: [{ item_id: "a", quantity: 2 }],
    address: null,
  };

  it("normaliza o slug e devolve o resultado do backend", async () => {
    rpc.mockResolvedValue({ data: { ok: true, token: "t1" }, error: null });
    await expect(submitPublicOrder(input)).resolves.toEqual({ ok: true, token: "t1" });
    expect(rpc).toHaveBeenCalledWith("create_public_order", expect.objectContaining({ _slug: "loja" }));
  });

  it("traduz o código de erro conhecido do backend", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "closed_now" } });
    await expect(submitPublicOrder(input)).rejects.toThrow("O estabelecimento está fechado neste horário.");
  });

  it("usa mensagem genérica para erro desconhecido", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom 500" } });
    await expect(submitPublicOrder(input)).rejects.toThrow("Não foi possível enviar o pedido. Tente novamente.");
  });

  it("consulta o pedido pelo token", async () => {
    rpc.mockResolvedValue({ data: { found: true }, error: null });
    await expect(fetchPublicOrder("abc")).resolves.toEqual({ found: true });
    expect(rpc).toHaveBeenCalledWith("get_public_order", { _token: "abc" });
  });

  it("propaga a falha da consulta", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("offline") });
    await expect(fetchPublicOrder("abc")).rejects.toThrow("offline");
  });
});
