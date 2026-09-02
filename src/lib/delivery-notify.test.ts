import { describe, it, expect } from "vitest";
import {
  buildStatusMessage,
  normalizePhone,
  whatsappLink,
  publicTrackUrl,
  computeEtaTarget,
  etaLabel,
  etaClock,
  NOTIFIABLE,
  DELIVERY_LEG_MIN,
  type NotifyContext,
  type EtaSource,
} from "./delivery-notify";

const ctx = (over: Partial<NotifyContext> = {}): NotifyContext => ({
  order_number: 12,
  customer_name: "Ana Maria Souza",
  service_mode: "delivery",
  status: "em_preparo",
  ...over,
});

describe("buildStatusMessage", () => {
  it("usa o primeiro nome do cliente e inclui a previsão", () => {
    const msg = buildStatusMessage(ctx({ estimated_minutes: 40 }));
    expect(msg).toContain("Olá, Ana!");
    expect(msg).toContain("pedido #12");
    expect(msg).toContain("40 minutos");
  });

  it("usa saudação neutra quando não há nome", () => {
    expect(buildStatusMessage(ctx({ customer_name: null }))).toContain("Olá, Olá!");
  });

  it("diferencia pronto para entrega e para retirada", () => {
    expect(buildStatusMessage(ctx({ status: "pronto" }))).toContain("sairá para entrega");
    expect(buildStatusMessage(ctx({ status: "pronto", service_mode: "pickup" }))).toContain("retirada");
  });

  it("cita o entregador ao sair para entrega", () => {
    expect(buildStatusMessage(ctx({ status: "em_entrega", driver_name: "João" }))).toContain("com João");
  });

  it("diferencia entregue e retirado", () => {
    expect(buildStatusMessage(ctx({ status: "entregue" }))).toContain("foi entregue");
    expect(buildStatusMessage(ctx({ status: "entregue", service_mode: "pickup" }))).toContain("foi retirado");
  });

  it("inclui o motivo em recusa e cancelamento", () => {
    expect(buildStatusMessage(ctx({ status: "recusado", reason: "fora de área" }))).toContain("Motivo: fora de área.");
    expect(buildStatusMessage(ctx({ status: "cancelado", reason: "sem estoque" }))).toContain("Motivo: sem estoque.");
  });

  it("cai no texto padrão para status desconhecido", () => {
    expect(buildStatusMessage(ctx({ status: "aguardando_aceite" }))).toContain("fila de confirmação");
  });

  it("acrescenta o link de acompanhamento quando existe", () => {
    expect(buildStatusMessage(ctx({ track_url: "https://x.dev/p/1" }))).toContain("https://x.dev/p/1");
  });

  it("expõe apenas transições notificáveis", () => {
    expect(NOTIFIABLE.has("em_preparo")).toBe(true);
    expect(NOTIFIABLE.has("aguardando_aceite")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("rejeita telefones curtos ou ausentes", () => {
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("acrescenta o DDI brasileiro quando ausente", () => {
    expect(normalizePhone("(11) 98888-7777")).toBe("5511988887777");
  });

  it("mantém o número que já tem DDI", () => {
    expect(normalizePhone("5511988887777")).toBe("5511988887777");
  });
});

describe("whatsappLink e publicTrackUrl", () => {
  it("retorna null com telefone inválido", () => {
    expect(whatsappLink("123", "oi")).toBeNull();
  });

  it("codifica a mensagem no link", () => {
    expect(whatsappLink("11988887777", "oi tudo bem?")).toBe(
      "https://wa.me/5511988887777?text=oi%20tudo%20bem%3F",
    );
  });

  it("exige slug e token para montar a URL pública", () => {
    expect(publicTrackUrl(null, "tok")).toBeNull();
    expect(publicTrackUrl("loja", null)).toBeNull();
    expect(publicTrackUrl("loja", "tok")).toContain("/cardapio/loja/pedido/tok");
  });
});

describe("ETA", () => {
  const base: EtaSource = {
    status: "aguardando_aceite",
    service_mode: "delivery",
    opened_at: "2026-01-01T12:00:00.000Z",
  };

  it("ancora na abertura enquanto não houve aceite", () => {
    const t = computeEtaTarget(base)!;
    expect(t.anchor).toBe("opened");
    expect(t.target).toBe(Date.parse(base.opened_at) + (30 + DELIVERY_LEG_MIN) * 60_000);
  });

  it("reancora no aceite usando o preparo estimado", () => {
    const t = computeEtaTarget({ ...base, accepted_at: "2026-01-01T12:10:00.000Z", estimated_minutes: 20 })!;
    expect(t.anchor).toBe("accepted");
    expect(t.target).toBe(Date.parse("2026-01-01T12:10:00.000Z") + (20 + DELIVERY_LEG_MIN) * 60_000);
  });

  it("ignora o trajeto de entrega na retirada", () => {
    const t = computeEtaTarget({ ...base, service_mode: "pickup", status: "pronto", ready_at: "2026-01-01T12:30:00.000Z" })!;
    expect(t.anchor).toBe("ready");
    expect(t.target).toBe(Date.parse("2026-01-01T12:30:00.000Z"));
  });

  it("usa a saída para entrega como âncora final", () => {
    const t = computeEtaTarget({ ...base, status: "em_entrega", dispatched_at: "2026-01-01T12:40:00.000Z" })!;
    expect(t.anchor).toBe("dispatched");
  });

  it("descreve o tempo restante em linguagem natural", () => {
    const now = Date.parse(base.opened_at);
    expect(etaLabel(base, now)).toBe("cerca de 45 minutos");
    expect(etaLabel(base, now + 44 * 60_000 + 30_000)).toBe("cerca de 1 minuto");
    expect(etaLabel(base, now + 60 * 60_000)).toBe("a qualquer momento");
  });

  it("formata o horário previsto", () => {
    expect(etaClock(base)).toMatch(/^\d{2}:\d{2}$/);
  });
});
