import { describe, it, expect } from "vitest";
import { validateImageFile } from "./image-validation";

function fileFrom(bytes: number[], name = "f.bin", type = "image/png") {
  const padded = new Uint8Array(16);
  padded.set(bytes.slice(0, 16));
  return new File([padded], name, { type });
}

const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPG = [0xff, 0xd8, 0xff];
const GIF = [0x47, 0x49, 0x46, 0x38];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe("validateImageFile", () => {
  it("aceita PNG pelos magic bytes", async () => {
    await expect(validateImageFile(fileFrom(PNG))).resolves.toEqual({ contentType: "image/png", ext: "png" });
  });

  it("aceita JPEG, GIF e WEBP", async () => {
    await expect(validateImageFile(fileFrom(JPG))).resolves.toMatchObject({ ext: "jpg" });
    await expect(validateImageFile(fileFrom(GIF))).resolves.toMatchObject({ ext: "gif" });
    await expect(validateImageFile(fileFrom(WEBP))).resolves.toMatchObject({ ext: "webp" });
  });

  it("ignora o MIME informado pelo cliente e usa o conteúdo real", async () => {
    const svgLikePng = fileFrom(PNG, "evil.svg", "image/svg+xml");
    await expect(validateImageFile(svgLikePng)).resolves.toMatchObject({ contentType: "image/png" });
  });

  it("rejeita SVG mesmo declarado como imagem", async () => {
    const svg = new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "a.svg", { type: "image/png" });
    await expect(validateImageFile(svg)).rejects.toThrow(/Formato inválido/);
  });

  it("rejeita arquivo vazio ou desconhecido", async () => {
    await expect(validateImageFile(new File([], "empty.png"))).rejects.toThrow(/Formato inválido/);
    await expect(validateImageFile(fileFrom([1, 2, 3, 4]))).rejects.toThrow(/Formato inválido/);
  });
});
