/**
 * Utilitários para lidar com valores decimais em qualquer navegador.
 * Aceita vírgula ou ponto como separador decimal e ignora separadores de milhar.
 */

/** Converte o valor recebido em texto apenas quando isso é seguro. */
function toRawString(input: unknown): string | null {
  if (typeof input === 'string') return input.trim();
  if (typeof input === 'number' || typeof input === 'bigint') return String(input).trim();
  return null;
}

/** Converte uma string digitada pelo usuário em número. Retorna NaN quando inválido. */
export function parseDecimal(input: unknown): number {
  if (typeof input === 'number') return input;
  const raw = toRawString(input);
  if (!raw) return Number.NaN;
  // Remove espaços e símbolos comuns (R$, %)
  let s = raw.replaceAll(/\s|R\$|%/gi, '');
  // Se tiver vírgula e ponto, o último é decimal
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replaceAll('.', '').replace(',', '.');
    } else {
      s = s.replaceAll(',', '');
    }
  } else if (lastComma >= 0) {
    s = s.replaceAll('.', '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Igual a parseDecimal mas devolve `fallback` (0 por padrão) quando inválido. */
export function parseDecimalOr(input: unknown, fallback = 0): number {
  const n = parseDecimal(input);
  return Number.isFinite(n) ? n : fallback;
}

/** Aceita apenas caracteres válidos durante a digitação (dígitos, vírgula, ponto, sinal). */
export function sanitizeDecimalKeystroke(value: string, opts?: { allowNegative?: boolean }): string {
  const allowNeg = opts?.allowNegative ?? false;
  let v = value.replaceAll(/[^0-9.,-]/g, '');
  if (allowNeg) v = v.replaceAll(/(?!^)-/g, '');
  else v = v.replaceAll('-', '');
  // No máximo um separador decimal (o último digitado prevalece)
  const parts = v.split(/[.,]/);
  if (parts.length > 2) {
    const last = parts.pop() as string;
    v = parts.join('') + ',' + last;
  }
  return v;
}

/** Formata número para exibição em pt-BR com N casas. */
export function formatDecimal(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
