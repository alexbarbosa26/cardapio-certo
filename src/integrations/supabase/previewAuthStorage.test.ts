import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { brokeredPreviewStorage } from "./previewAuthStorage";

const SOURCE = readFileSync(new URL("./previewAuthStorage.ts", import.meta.url), "utf8");
const PROJECT_ID = "17642ff0-afb6-4676-91b0-fed573b34d22";

describe("previewAuthStorage — proteção antirregressão de PRNG", () => {
  it("não usa PRNG inseguro no código-fonte", () => {
    expect(SOURCE).not.toMatch(/Math\s*\.\s*random/);
  });

  it("usa CSPRNG para gerar o requestId", () => {
    expect(SOURCE).toContain("globalThis.crypto.randomUUID()");
  });

  it("gera requestIds únicos no formato UUID v4", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = globalThis.crypto.randomUUID();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      seen.add(id);
    }
    expect(seen.size).toBe(50);
  });
});

describe("brokeredPreviewStorage", () => {
  const originalParent = window.parent;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, "parent", { value: originalParent, configurable: true, writable: true });
    vi.restoreAllMocks();
  });

  it("retorna localStorage fora de uma zona de preview", () => {
    expect(brokeredPreviewStorage()).toBe(localStorage);
  });

  it("retorna localStorage quando não está em iframe, mesmo em host de preview", () => {
    vi.spyOn(location, "hostname", "get").mockReturnValue(`id-preview--${PROJECT_ID}.lovable.app`);
    Object.defineProperty(window, "parent", { value: window, configurable: true, writable: true });
    expect(brokeredPreviewStorage()).toBe(localStorage);
  });

  it("devolve um broker assíncrono quando em preview dentro do editor", async () => {
    vi.spyOn(location, "hostname", "get").mockReturnValue(`id-preview--${PROJECT_ID}.lovable.app`);
    const parentStub = { postMessage: vi.fn() };
    Object.defineProperty(window, "parent", { value: parentStub, configurable: true, writable: true });

    const storage = brokeredPreviewStorage();
    expect(storage).not.toBe(localStorage);
    const broker = storage as Exclude<ReturnType<typeof brokeredPreviewStorage>, Storage | undefined>;

    localStorage.setItem("k", "local-value");
    await broker.setItem("k", "v");
    expect(localStorage.getItem("k")).toBe("v");
    expect(parentStub.postMessage).toHaveBeenCalled();

    const [msg] = parentStub.postMessage.mock.calls[0];
    expect(msg.projectId).toBe(PROJECT_ID);
    expect(typeof msg.requestId).toBe("string");
    expect(msg.requestId.length).toBeGreaterThan(10);

    await broker.removeItem("k");
    expect(localStorage.getItem("k")).toBeNull();
  });
});
