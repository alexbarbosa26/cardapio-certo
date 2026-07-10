/**
 * Utilitários para lidar com valores decimais em qualquer navegador.
 * Aceita vírgula ou ponto como separador decimal e ignora separadores de milhar.
 */

/** Converte uma string digitada pelo usuário em número. Retorna NaN quando inválido. */
export function parseDecimal(input: unknown): number {
  if (input === null || input === undefined) return NaN;
  if (typeof input === 'number') return input;
  const raw = String(input).trim();
  if (!raw) return NaN;
  // Remove espaços e símbolos comuns (R$, %)
  let s = raw.replace(/\s|R\$|%/gi, '');
  // Se tiver vírgula e ponto, o último é decimal
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Igual a parseDecimal mas devolve `fallback` (0 por padrão) quando inválido. */
export function parseDecimalOr(input: unknown, fallback = 0): number {
  const n = parseDecimal(input);
  return Number.isFinite(n) ? n : fallback;
}

/** Aceita apenas caracteres válidos durante a digitação (dígitos, vírgula, ponto, sinal). */
export function sanitizeDecimalKeystroke(value: string, opts?: { allowNegative?: boolean }): string {
  const allowNeg = opts?.allowNegative ?? false;
  let v = value.replace(/[^0-9.,-]/g, '');
  if (!allowNeg) v = v.replace(/-/g, '');
  else v = v.replace(/(?!^)-/g, '');
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
