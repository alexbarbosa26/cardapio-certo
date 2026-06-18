import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
  accent?: boolean;
  /** Variação percentual vs período comparado (ex.: 12.5 = +12.5%). */
  delta?: number | null;
  /** Texto descritivo da comparação. Ex.: "vs ontem". */
  deltaLabel?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent,
  delta,
  deltaLabel,
}: StatCardProps) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <Icon
            className={cn('h-4 w-4', accent ? 'text-accent' : 'text-muted-foreground')}
          />
        )}
      </div>
      <div className="mt-3 font-display text-2xl sm:text-3xl tabular-nums">{value}</div>
      {(hint || hasDelta) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {hasDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-medium',
                positive
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
              )}
            >
              {positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(delta as number).toFixed(1)}%
            </span>
          )}
          {(hint || deltaLabel) && (
            <span className="text-muted-foreground">{hint ?? deltaLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
