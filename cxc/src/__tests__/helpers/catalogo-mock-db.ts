// ─────────────────────────────────────────────────────────────────────────────
// Helper COMPARTIDO del arnés de paridad de catálogos (PR-0, pre-refactor).
//
// makeDb() fabrica un doble de un client Supabase (PostgREST) por test: cada
// .from(tabla) consume el siguiente resultado de la cola de esa tabla y
// devuelve un chain encadenable/awaitable que registra los argumentos de cada
// método (para asertar filtros, payloads de update, onConflict, etc.).
//
// Semántica de la cola: con N>1 resultados se van consumiendo (shift); el
// último queda pegado (llamadas extra lo repiten). Tabla sin cola → resultado
// vacío { data: null, error: null }.
// ─────────────────────────────────────────────────────────────────────────────

import { vi } from "vitest";

export interface QueryResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Chain = any;

const CHAIN_METHODS = [
  "select",
  "update",
  "delete",
  "insert",
  "upsert",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is",
  "or",
  "ilike",
  "order",
  "limit",
  "range",
] as const;

export function makeChain(result: QueryResult = { data: null, error: null }): Chain {
  // `count` por defecto = el largo de `data`, como haría PostgREST ante un
  // `select(..., { count: "exact" })` que devuelve todas las filas en una
  // página. Sin esto el doble mentía: devolvía filas con count null, que es la
  // firma de una lectura NO verificable — y los lectores paginados (que exigen
  // COUNT para poder garantizar que no los truncaron) fallaban en el arnés
  // aunque en producción reciban el count perfectamente. Un test puede seguir
  // fijando `count` a mano para simular justamente ese truncado.
  const countPorDefecto = Array.isArray(result.data) ? result.data.length : null;
  const normalized = { data: null, error: null, count: countPorDefecto, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = { _calls: {} as Record<string, unknown[][]>, _result: normalized };
  for (const m of CHAIN_METHODS) {
    chain[m] = vi.fn((...args: unknown[]) => {
      (chain._calls[m] ||= []).push(args);
      return chain;
    });
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(chain._result));
  chain.single = vi.fn(() => Promise.resolve(chain._result));
  chain.then = (onF?: (v: QueryResult) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(chain._result).then(onF, onR);
  return chain;
}

export interface FromCall {
  table: string;
  chain: Chain;
}

export interface MockDb {
  from: (table: string) => Chain;
  rpc: ReturnType<typeof vi.fn>;
  calls: FromCall[];
  /** Cola de resultados para una tabla (en orden de .from()). */
  queue: (table: string, ...results: QueryResult[]) => void;
  /** Respuesta de la próxima llamada rpc (una sola vez). */
  queueRpc: (result: QueryResult) => void;
  /** Tablas consultadas, en orden. */
  tables: () => string[];
  /** Chains creados para una tabla, en orden. */
  chainsFor: (table: string) => Chain[];
}

export function makeDb(): MockDb {
  const queues = new Map<string, QueryResult[]>();
  const calls: FromCall[] = [];
  const rpcQueue: QueryResult[] = [];

  const rpc = vi.fn(async () => {
    const r = rpcQueue.length > 1 ? rpcQueue.shift()! : rpcQueue[0];
    return { data: null, error: null, ...(r ?? {}) };
  });

  const from = vi.fn((table: string) => {
    const q = queues.get(table);
    const result = q && q.length > 0 ? (q.length > 1 ? q.shift()! : q[0]) : undefined;
    const chain = makeChain(result);
    calls.push({ table, chain });
    return chain;
  });

  return {
    from,
    rpc,
    calls,
    queue: (table, ...results) => queues.set(table, results),
    queueRpc: (result) => rpcQueue.push(result),
    tables: () => calls.map((c) => c.table),
    chainsFor: (table) => calls.filter((c) => c.table === table).map((c) => c.chain),
  };
}

/** Storage doble (upload + getPublicUrl) para los endpoints de upload. */
export function makeStorage(publicUrl = "https://cdn.test/product-images/x") {
  const upload = vi.fn(async () => ({ data: { path: "x" }, error: null }));
  const getPublicUrl = vi.fn(() => ({ data: { publicUrl } }));
  const from = vi.fn(() => ({ upload, getPublicUrl }));
  return { from, upload, getPublicUrl };
}
