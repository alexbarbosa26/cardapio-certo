import { describe, it, expect, beforeEach, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { adminCreatePlan, adminUpdatePlan, adminSetPlanStatus, adminDeletePlan } from "./admin-plans";

describe("cliente admin-plans", () => {
  beforeEach(() => invoke.mockReset());

  it("cria plano e devolve o registro", async () => {
    invoke.mockResolvedValue({ data: { plan: { id: "p1", name: "Pro" } }, error: null });
    await expect(adminCreatePlan({ name: "Pro", monthly_price: 99 })).resolves.toEqual({
      plan: { id: "p1", name: "Pro" },
    });
    expect(invoke).toHaveBeenCalledWith("admin-plans", {
      body: { action: "create_plan", payload: { name: "Pro", monthly_price: 99 } },
    });
  });

  it("mescla o id do plano no payload de atualização", async () => {
    invoke.mockResolvedValue({ data: { plan: { id: "p1", name: "Pro+" } }, error: null });
    await adminUpdatePlan("p1", { name: "Pro+" });
    expect(invoke).toHaveBeenLastCalledWith("admin-plans", {
      body: { action: "update_plan", payload: { plan_id: "p1", name: "Pro+" } },
    });
  });

  it("altera status e remove plano", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await adminSetPlanStatus("p1", "inativo");
    expect(invoke).toHaveBeenLastCalledWith("admin-plans", {
      body: { action: "set_plan_status", payload: { plan_id: "p1", status: "inativo" } },
    });

    await adminDeletePlan("p1");
    expect(invoke).toHaveBeenLastCalledWith("admin-plans", {
      body: { action: "delete_plan", payload: { plan_id: "p1" } },
    });
  });

  it("propaga erro de negócio e erro de transporte", async () => {
    invoke.mockResolvedValue({ data: { error: "plan_in_use" }, error: null });
    await expect(adminDeletePlan("p1")).rejects.toThrow("plan_in_use");

    invoke.mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(adminDeletePlan("p1")).rejects.toThrow("timeout");

    invoke.mockResolvedValue({ data: null, error: {} });
    await expect(adminDeletePlan("p1")).rejects.toThrow("Erro ao chamar admin-plans.");
  });
});
