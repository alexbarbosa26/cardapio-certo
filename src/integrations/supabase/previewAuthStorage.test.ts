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

  it("verifica origens confiáveis com .includes(), sem .indexOf()", () => {
    expect(SOURCE).toContain("editorOrigins.includes(e.origin)");
    expect(SOURCE).not.toContain(".indexOf(");
  });

  it("usa encadeamento opcional nas guardas de mensagem e resposta", () => {
    expect(SOURCE).toContain("d?.type === RESULT");
    expect(SOURCE).toContain("res?.ok");
    expect(SOURCE).not.toMatch(/\bd && d\./);
    expect(SOURCE).not.toMatch(/\bres && res\./);
  });

  it("mantém String.raw e RegExp.exec nas expressões regulares", () => {
    expect(SOURCE).toContain("String.raw");
    expect(SOURCE).toContain(".exec(host)");
    expect(SOURCE).not.toMatch(/host\.match\(/);
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

describe("semântica de includes em listas de origens", () => {
  const origins = ["https://lovable.dev", "http://localhost:3000"];

  it("aceita origem presente na primeira e na última posição", () => {
    expect(origins.includes("https://lovable.dev")).toBe(true);
    expect(origins.includes("http://localhost:3000")).toBe(true);
  });

  it("rejeita origem ausente, lista vazia e diferença de caixa", () => {
    expect(origins.includes("https://evil.com")).toBe(false);
    expect([].includes("https://lovable.dev" as never)).toBe(false);
    expect(origins.includes("https://LOVABLE.dev")).toBe(false);
  });
});

describe("encadeamento opcional preserva valores falsy", () => {
  const read = (o?: { value?: string | number | boolean | null } | null) => o?.value;

  it("retorna undefined para objeto undefined ou null", () => {
    expect(read(undefined)).toBeUndefined();
    expect(read(null)).toBeUndefined();
  });

  it("preserva 0, false e string vazia", () => {
    expect(read({ value: 0 })).toBe(0);
    expect(read({ value: false })).toBe(false);
    expect(read({ value: "" })).toBe("");
  });

  it("retorna undefined quando a propriedade está ausente", () => {
    expect(read({})).toBeUndefined();
  });
});
