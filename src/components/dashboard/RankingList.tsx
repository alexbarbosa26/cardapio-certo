interface RankingItem {
  name: string;
  primary: string;
  secondary?: string;
  /** valor entre 0 e 1 para barra de progresso */
  ratio: number;
}

export function RankingList({ items, emptyMessage = 'Sem dados no período.' }: {
  items: RankingItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-3 min-w-0">
      {items.map((it, idx) => (
        <div key={`${it.name}-${idx}`} className="min-w-0">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-3 mb-1 min-w-0">
            <span className="font-medium text-sm truncate min-w-0">
              {idx + 1}. {it.name}
            </span>
            <span className="tabular-nums text-muted-foreground text-sm whitespace-nowrap">
              {it.primary}
              {it.secondary && (
                <span className="text-xs opacity-70 ml-1">{it.secondary}</span>
              )}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-accent rounded-full"
              style={{ width: `${Math.max(2, Math.min(100, it.ratio * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
