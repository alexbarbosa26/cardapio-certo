import { describe, it, expect, beforeEach, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { getPaymentProvider, billing } from "./index";
import { simulatedProvider } from "./simulated-provider";

const body = (action: string, payload: Record<string, unknown>) => ({ body: { action, payload } });

describe("getPaymentProvider", () => {
  it("devolve o provedor simulado por padrão e para slug desconhecido", () => {
    expect(getPaymentProvider()).toBe(simulatedProvider);
    expect(getPaymentProvider("simulated")).toBe(simulatedProvider);
    expect(getPaymentProvider("mercado-pago")).toBe(simulatedProvider);
    expect(billing.slug).toBe("simulated");
    expect(billing.isMock).toBe(true);
  });
});

describe("simulatedProvider", () => {
  beforeEach(() => invoke.mockReset());

  const signup = {
    plan_slug: "pro",
    billing_cycle: "monthly" as const,
    company_name: "Bar",
    responsible_name: "Ana",
    admin_email: "ana@example.com",
    admin_password: "S3nh4-forte",
  };

  it("cria checkout de signup", async () => {
    invoke.mockResolvedValue({ data: { checkout_session_id: "cs1" }, error: null });
    await expect(simulatedProvider.signupAndCheckout(signup)).resolves.toEqual({ checkout_session_id: "cs1" });
    expect(invoke).toHaveBeenCalledWith("billing", body("signup_and_checkout", { ...signup }));
  });

  it("desembrulha a sessão de checkout", async () => {
    invoke.mockResolvedValue({ data: { session: { id: "cs1", status: "pending" } }, error: null });
    await expect(simulatedProvider.getCheckoutSession("cs1")).resolves.toEqual({ id: "cs1", status: "pending" });
    expect(invoke).toHaveBeenCalledWith("billing", body("get_session", { session_id: "cs1" }));
  });

  it("executa as ações de assinatura", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await simulatedProvider.simulatePayment("cs1", "approve");
    expect(invoke).toHaveBeenLastCalledWith("billing", body("simulate_payment", { session_id: "cs1", outcome: "approve" }));

    await simulatedProvider.changePlan("p2");
    expect(invoke).toHaveBeenLastCalledWith("billing", body("change_plan", { new_plan_id: "p2" }));

    await simulatedProvider.cancelSubscription({ reason: "caro", cancel_at_period_end: true });
    expect(invoke).toHaveBeenLastCalledWith("billing", body("cancel_subscription", { reason: "caro", cancel_at_period_end: true }));

    await simulatedProvider.reactivateSubscription();
    expect(invoke).toHaveBeenLastCalledWith("billing", body("reactivate_subscription", {}));
  });

  it("propaga erros de negócio, de transporte e genérico", async () => {
    invoke.mockResolvedValue({ data: { error: "session_expired" }, error: null });
    await expect(simulatedProvider.getCheckoutSession("cs1")).rejects.toThrow("session_expired");

    invoke.mockResolvedValue({ data: { error: "not_allowed" }, error: { message: "500" } });
    await expect(simulatedProvider.changePlan("p2")).rejects.toThrow("not_allowed");

    invoke.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(simulatedProvider.reactivateSubscription()).rejects.toThrow("offline");

    invoke.mockResolvedValue({ data: null, error: {} });
    await expect(simulatedProvider.reactivateSubscription()).rejects.toThrow("Erro ao chamar billing.");
  });
});
