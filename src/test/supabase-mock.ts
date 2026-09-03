import { vi } from "vitest";

export type QueryResult<T = unknown> = { data: T; error: unknown };
export type RecordedCall = { table: string; method: string; args: unknown[] };

/**
 * Constrói um "query builder" encadeável semelhante ao do PostgREST.
 * Qualquer método devolve o próprio builder e o `await` resolve o resultado
 * configurado, permitindo testar componentes sem rede.
 */
export function queryBuilder<T>(result: QueryResult<T>, record: (method: string, args: unknown[]) => void = () => {}) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "then") {
          return (resolve: (v: QueryResult<T>) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          record(prop, args);
          return proxy;
        };
      },
    },
  );
  return proxy as PromiseLike<QueryResult<T>> & Record<string, (...args: unknown[]) => unknown>;
}

export interface SupabaseMock {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  functions: { invoke: ReturnType<typeof vi.fn> };
  channel: ReturnType<typeof vi.fn>;
  removeChannel: ReturnType<typeof vi.fn>;
  auth: { getSession: ReturnType<typeof vi.fn>; getUser: ReturnType<typeof vi.fn> };
  /** Chamadas registradas por tabela, na ordem. */
  calls: RecordedCall[];
  /** Define a resposta para uma tabela (uma função permite variar por chamada). */
  setTable: (table: string, result: QueryResult<unknown> | (() => QueryResult<unknown>)) => void;
}

export function createSupabaseMock(
  tables: Record<string, QueryResult<unknown> | (() => QueryResult<unknown>)> = {},
): SupabaseMock {
  const registry = new Map(Object.entries(tables));
  const calls: RecordedCall[] = [];

  return {
    calls,
    setTable: (table, result) => registry.set(table, result),
    from: vi.fn((table: string) => {
      const entry = registry.get(table) ?? { data: [], error: null };
      const result = typeof entry === "function" ? entry() : entry;
      return queryBuilder(result, (method, args) => calls.push({ table, method, args }));
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = {};
      ch.on = () => ch;
      ch.subscribe = () => ch;
      ch.unsubscribe = () => ch;
      return ch;
    }),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  };
}
