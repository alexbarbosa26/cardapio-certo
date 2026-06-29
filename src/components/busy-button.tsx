import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBusy } from '@/hooks/use-busy';
import { cn } from '@/lib/utils';

type ButtonProps = React.ComponentProps<typeof Button>;

interface BusyButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Handler async. O botão fica bloqueado até a promise resolver. */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => unknown | Promise<unknown>;
  /** Texto exibido enquanto processa. Padrão: mantém children + spinner. */
  busyText?: React.ReactNode;
  /** Forçar estado de loading externamente. */
  loading?: boolean;
}

/**
 * Botão que bloqueia múltiplos cliques durante uma ação assíncrona.
 * Use sempre que o clique gravar dados (criar pedido, pagamento, etc).
 */
export function BusyButton({
  onClick, busyText, loading, disabled, children, className, ...rest
}: BusyButtonProps) {
  const { busy, run } = useBusy();
  const isBusy = busy || !!loading;

  const handle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!onClick) return;
    if (isBusy) { e.preventDefault(); return; }
    void run(async () => { await onClick(e); });
  };

  return (
    <Button
      {...rest}
      disabled={disabled || isBusy}
      onClick={handle}
      className={cn(className)}
      aria-busy={isBusy}
    >
      {isBusy ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {busyText ?? children}
        </>
      ) : children}
    </Button>
  );
}
