export const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
export const fmtBRL = (n: number | string | null | undefined) =>
  BRL.format(Number(n ?? 0));

export const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function minutesSince(d: string | Date) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 60000);
}
