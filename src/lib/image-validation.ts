// Server-independent image validation. Verifies magic bytes to avoid trusting
// the client-supplied MIME type. Only raster formats are allowed (SVG is
// blocked because it can carry executable scripts).

const ALLOWED = {
  'image/png': { ext: 'png', check: (b: Uint8Array) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/jpeg': { ext: 'jpg', check: (b: Uint8Array) =>
    b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: 'webp', check: (b: Uint8Array) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  'image/gif': { ext: 'gif', check: (b: Uint8Array) =>
    b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
} as const;

export type SafeImage = { contentType: keyof typeof ALLOWED; ext: string };

export async function validateImageFile(file: File): Promise<SafeImage> {
  const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  for (const [mime, spec] of Object.entries(ALLOWED)) {
    if (spec.check(buf)) return { contentType: mime as keyof typeof ALLOWED, ext: spec.ext };
  }
  throw new Error('Formato inválido. Envie PNG, JPG, WEBP ou GIF.');
}
