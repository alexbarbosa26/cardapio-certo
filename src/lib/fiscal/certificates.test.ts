import { beforeEach, it, expect, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";
const mock = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createSupabaseMock>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: (_, key) => mock.client[key as keyof typeof mock.client] }),
}));
import {
  certificateAvailability,
  loadFiscalConfiguration,
  saveFiscalConfiguration,
  type CertificateMetadata,
} from "./certificates";
const certificate: CertificateMetadata = {
  id: "test",
  environment: "test",
  holder_name: "Titular fictício",
  holder_document: "00000000000000",
  serial_number: "001",
  valid_from: null,
  valid_until: "2026-12-01T00:00:00Z",
  configuration_state: "ready",
  last_verified_at: "2026-11-01T00:00:00Z",
  csc_identifier: "000123",
  csc_configured: true,
  created_at: "2026-11-01T00:00:00Z",
};
beforeEach(() => (mock.client = createSupabaseMock()));
it("does not mark expired certificates ready", () =>
  expect(certificateAvailability(certificate, 30, new Date("2026-12-02")).label).toBe(
    "Vencido · emissão bloqueada",
  ));
it("does not treat received files as validated", () =>
  expect(
    certificateAvailability(
      { ...certificate, configuration_state: "received" },
      30,
      new Date("2026-11-01"),
    ).label,
  ).toBe("Validação pendente · emissão bloqueada"));
it("alerts based on configured lead time", () =>
  expect(certificateAvailability(certificate, 30, new Date("2026-11-15")).label).toBe(
    "Próximo do vencimento",
  ));
it("does not infer readiness from missing verification", () =>
  expect(
    certificateAvailability({ ...certificate, last_verified_at: null }, 30, new Date("2026-11-01"))
      .label,
  ).toBe("Verificação não registrada · emissão bloqueada"));
it("does not enable emission even after validation", () =>
  expect(certificateAvailability(certificate, 5, new Date("2026-11-01")).label).toBe(
    "Validado · integração de emissão pendente",
  ));
it("rejects absent company before loading", async () => {
  await expect(loadFiscalConfiguration("")).rejects.toThrow("Empresa");
  expect(mock.client.from).not.toHaveBeenCalled();
});
it("only reads explicit safe metadata fields in the current company", async () => {
  await loadFiscalConfiguration("a");
  expect(mock.client.calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([
    ["company_id", "a"],
    ["company_id", "a"],
  ]);
  const select = mock.client.calls.find(
    (c) => c.table === "fiscal_certificate_metadata" && c.method === "select",
  );
  expect(String(select?.args[0])).not.toMatch(/password|secret|private_key|pfx|storage_path/);
});
it("preserves CSC identifiers as text with leading zeros", async () => {
  mock.client.setTable("fiscal_certificate_metadata", { data: [certificate], error: null });
  expect((await loadFiscalConfiguration("a")).certificates[0].csc_identifier).toBe("000123");
});
it("saves only preferences through an authorized server operation", async () => {
  await saveFiscalConfiguration("a", { environment: "production", expiry_warning_days: 45 });
  expect(mock.client.rpc).toHaveBeenCalledWith("save_fiscal_configuration", {
    _company_id: "a",
    _environment: "production",
    _expiry_warning_days: 45,
  });
});
it("rejects invalid lead time without saving", async () => {
  await expect(
    saveFiscalConfiguration("a", { environment: "test", expiry_warning_days: 0 }),
  ).rejects.toThrow("entre 1 e 365");
  expect(mock.client.rpc).not.toHaveBeenCalled();
});
it("propagates server permission denial", async () => {
  mock.client.rpc.mockResolvedValue({
    data: null,
    error: { message: "Configuração fiscal não permitida" },
  });
  await expect(
    saveFiscalConfiguration("a", { environment: "test", expiry_warning_days: 30 }),
  ).rejects.toThrow("não permitida");
});
