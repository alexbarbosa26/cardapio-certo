import { useCallback, useRef, useState } from 'react';

/**
 * Proteção contra múltiplos cliques.
 * - `busy` indica se há uma ação em andamento.
 * - `run(fn)` executa a função apenas uma vez; cliques adicionais durante
 *   o processamento são ignorados.
 */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (guard.current) return undefined;
    guard.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
