import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { brokeredPreviewStorage } from "./previewAuthStorage";

const SOURCE = readFileSync(path.resolve(process.cwd(), "src/integrations/supabase/previewAuthStorage.ts"), "utf8");
const PROJECT_ID = "17642ff0-afb6-4676-91b0-fed573b34d22";

describe("previewAuthStorage — proteção antirregressão de PRNG", () => {
  it("não usa PRNG inseguro no código-fonte", () => {
    expect(SOURCE).not.toMatch(/Math\s*\.\s*random/);
  });

  it("usa CSPRNG para gerar o requestId", () => {
    expect(SOURCE).toContain("globalThis.crypto.randomUUID()");
  });

  it("compara globalThis.window diretamente com undefined, sem typeof", () => {
    expect(SOURCE).toContain("globalThis.window === undefined");
    expect(SOURCE).not.toMatch(/typeof\s+window/);
    expect(SOURCE).not.toMatch(/(^|[^.\w])window\s*\./m);
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
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("retorna localStorage fora de uma zona de preview", () => {
    expect(brokeredPreviewStorage()).toBe(localStorage);
  });

  it("não quebra em ambiente sem DOM", () => {
    expect(() => brokeredPreviewStorage()).not.toThrow();
  });

  it("mantém leitura e escrita locais no fallback", () => {
    const storage = brokeredPreviewStorage() as Storage;
    storage.setItem("sb-token", "abc");
    expect(storage.getItem("sb-token")).toBe("abc");
    storage.removeItem("sb-token");
    expect(storage.getItem("sb-token")).toBeNull();
  });
});
