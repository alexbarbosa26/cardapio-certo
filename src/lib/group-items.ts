/**
 * Agrupamento de itens idênticos.
 *
 * Dois itens só são considerados iguais quando compartilham produto,
 * preço unitário aplicado, adicionais (grupo + item) e observação.
 * Itens por peso NUNCA são agrupados (cada pesagem é única).
 */

export interface ItemOption {
  option_group_name?: string | null;
  option_item_name?: string | null;
}

/** Assinatura estável dos adicionais selecionados. */
export function optionsSignature(options?: ItemOption[] | null): string {
  if (!options?.length) return '';
  return options
    .map((o) => `${(o.option_group_name ?? '').trim()}::${(o.option_item_name ?? '').trim()}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
}

export function normalizeNotes(notes?: string | null): string {
  return (notes ?? '').trim();
}

export interface GroupableItem {
  product_id?: string | null;
  product_name: string;
  unit_price: number | string;
  notes?: string | null;
  options?: ItemOption[] | null;
  item_type?: string | null;
  weight_grams?: number | null;
  /** discriminador extra (ex.: status na cozinha, pedido de origem) */
  [key: string]: unknown;
}

/**
 * Chave de agrupamento. `extra` permite separar por contexto
 * (ex.: status da cozinha ou número do pedido) sem misturar linhas.
 */
export function groupKey(item: GroupableItem, extra: Array<string | number | null | undefined> = []): string {
  const weighted = item.item_type === 'peso' || item.weight_grams != null;
  const base = [
    item.product_id ?? item.product_name,
    item.product_name,
    Number(item.unit_price).toFixed(4),
    normalizeNotes(item.notes),
    optionsSignature(item.options),
    ...extra.map((e) => String(e ?? '')),
  ].join('§');
  // Itens por peso jamais agrupam: chave única por linha.
  return weighted ? `${base}§weighted§${String(item.id ?? Math.random())}` : base;
}

export interface Grouped<T> {
  key: string;
  ids: string[];
  quantity: number;
  total_price: number;
  first: T;
}

/** Agrupa uma lista preservando a ordem da primeira ocorrência. */
export function groupItems<T extends GroupableItem & { id: string; quantity: number | string; total_price?: number | string }>(
  items: T[],
  extra: (item: T) => Array<string | number | null | undefined> = () => [],
): Array<Grouped<T>> {
  const map = new Map<string, Grouped<T>>();
  for (const it of items) {
    const key = groupKey(it, extra(it));
    const existing = map.get(key);
    const qty = Number(it.quantity) || 0;
    const total = Number(it.total_price ?? 0);
    if (existing) {
      existing.ids.push(it.id);
      existing.quantity += qty;
      existing.total_price += total;
    } else {
      map.set(key, { key, ids: [it.id], quantity: qty, total_price: total, first: it });
    }
  }
  return Array.from(map.values());
}
