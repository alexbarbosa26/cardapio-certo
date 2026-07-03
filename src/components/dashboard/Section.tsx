import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ title, description, action, children, className }: SectionProps) {
  return (
    <section className={cn('mt-8', className)}>
      <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl sm:text-2xl">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

interface PanelProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, action, children, className }: PanelProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-5 shadow-card min-w-0', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2 min-w-0">
          {title && <h3 className="font-display text-lg truncate">{title}</h3>}
          {action}
        </div>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
