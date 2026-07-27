import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CANDADO del candado.
 *
 * ── El bug, medido en producción el 27-jul-2026 ──────────────────────────────
 * Una fila 'running' de `switch_sync_log` solo se cierra si el proceso que la
 * abrió llega VIVO a `finishSwitchSyncLog`. Cuando Vercel mata la función al
 * agotar su `maxDuration`, el proceso deja de existir en ese instante: no hay
 * `finally`, `catch` ni handler de salida que alcance a escribir. La fila queda
 * abierta y el índice único parcial `switch_sync_log_running_lock` la convierte
 * en un candado puesto sobre ese (empresa, sync_type).
 *
 * La causa concreta NO era una carrera sino aritmética: `/api/admin/sync-now`
 * ("Actualizar ahora") declaraba `maxDuration = 300` y el sync de
 * `catalogo_tommy` mide 427-485 s (p50 485 s sobre 30 días). 300 s de
 * presupuesto para 8 min de trabajo = muerte garantizada. Las 3 filas colgadas
 * ese día eran `triggered_by='manual'`; las corridas del cron (800 s) salieron
 * todas success.
 *
 * ── Qué fija este archivo ────────────────────────────────────────────────────
 * 1. Un run VIEJO no bloquea al siguiente, y el que limpia COMPLETA su sync.
 * 2. Un run RECIENTE sí bloquea — la protección de sesión única de Switch
 *    (un solo login por empresa) NO se afloja.
 * 3. Un fallo REAL se sigue registrando y contando como error de verdad.
 * 4. El candado se libera SOLO, sin depender de la corrida siguiente del par.
 * 5. El presupuesto del manual no puede volver a quedar por debajo del cron.
 */

// ── Doble de Supabase: modela el índice único parcial de 'running' ───────────
interface Row {
  id: string;
  empresa_key: string;
  sync_type: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  error_message?: string | null;
}

let tabla: Row[] = [];
let seq = 0;

interface Estado {
  op: "insert" | "update" | null;
  vals: Record<string, unknown> | null;
  filtros: Array<["eq" | "lt", string, string]>;
}

function ejecutar(st: Estado) {
  if (st.op === "insert") {
    const v = st.vals as unknown as Row;
    // El índice único parcial: (empresa_key, sync_type) WHERE status='running'.
    const choca = tabla.some(
      (r) =>
        r.empresa_key === v.empresa_key && r.sync_type === v.sync_type && r.status === "running",
    );
    if (choca) {
      return {
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "switch_sync_log_running_lock"',
        },
      };
    }
    const fila: Row = { ...v, id: `nuevo-${++seq}`, started_at: v.started_at ?? new Date().toISOString() };
    tabla.push(fila);
    return { data: { id: fila.id }, error: null };
  }
  // update
  const afectadas = tabla.filter((r) =>
    st.filtros.every(([op, col, val]) => {
      const actual = String((r as unknown as Record<string, unknown>)[col] ?? "");
      return op === "eq" ? actual === val : actual < val;
    }),
  );
  for (const r of afectadas) Object.assign(r, st.vals);
  return { data: afectadas.map((r) => ({ id: r.id })), error: null };
}

function makeChain() {
  const st: Estado = { op: null, vals: null, filtros: [] };
  const chain = {
    insert(vals: Record<string, unknown>) {
      st.op = "insert";
      st.vals = vals;
      return chain;
    },
    update(vals: Record<string, unknown>) {
      st.op = "update";
      st.vals = vals;
      return chain;
    },
    select() {
      return chain;
    },
    single() {
      return chain;
    },
    eq(col: string, v: string) {
      st.filtros.push(["eq", col, v]);
      return chain;
    },
    lt(col: string, v: string) {
      st.filtros.push(["lt", col, v]);
      return chain;
    },
    then(res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) {
      return Promise.resolve(ejecutar(st)).then(res, rej);
    },
  };
  return chain;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: () => makeChain() },
}));

import {
  RUNNING_STALE_MIN,
  FUNCTION_MAX_DURATION_S,
  MSG_RUN_ATASCADO,
  esRunAtascado,
  clearStaleRunning,
  barrerRunningAtascados,
  createSwitchSyncLog,
} from "../../lib/switch-api/sync-log";
import { computeStreakSilenciable } from "../../lib/switch-api/alert-policy";

const haceMin = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function sembrarRunning(empresa: string, tipo: string, minutosAtras: number): Row {
  const r: Row = {
    id: `viejo-${empresa}-${tipo}`,
    empresa_key: empresa,
    sync_type: tipo,
    status: "running",
    started_at: haceMin(minutosAtras),
  };
  tabla.push(r);
  return r;
}

beforeEach(() => {
  tabla = [];
  seq = 0;
});

describe("el candado EXPIRA — un run muerto no bloquea a nadie", () => {
  it("un run VIEJO (más que el techo de la función) se cierra y deja pasar al siguiente", async () => {
    const viejo = sembrarRunning("fashion_shoes", "catalogo_tommy", 106); // el caso real: 18:52 → 20:38

    const logId = await createSwitchSyncLog({
      empresaKey: "fashion_shoes",
      syncType: "catalogo_tommy",
    });

    // El que llega DESPUÉS obtiene su fila y sigue con su trabajo.
    expect(logId).toBeTruthy();
    const nueva = tabla.find((r) => r.id === logId)!;
    expect(nueva.status).toBe("running");
    // El muerto quedó cerrado y marcado como atasco, no como fallo de Switch.
    expect(viejo.status).toBe("error");
    expect(esRunAtascado(viejo.error_message)).toBe(true);
  });

  it("EL QUE LIMPIA COMPLETA SU SYNC: no se marca a sí mismo error ni aborta", async () => {
    sembrarRunning("active_shoes", "catalogo_reebok", 90);

    // Si el limpiador se auto-castigara, esto lanzaría (el caller aborta con error).
    const logId = await createSwitchSyncLog({
      empresaKey: "active_shoes",
      syncType: "catalogo_reebok",
    });

    expect(logId).toBeTruthy();
    // Su propia fila NO nace con error: nace 'running', lista para trabajar.
    const propia = tabla.find((r) => r.id === logId)!;
    expect(propia.status).toBe("running");
    expect(propia.error_message ?? null).toBeNull();
  });
});

describe("la protección de sesión única NO se afloja", () => {
  it("un run RECIENTE SÍ bloquea — Switch admite una sola sesión por empresa", async () => {
    const vivo = sembrarRunning("fashion_shoes", "catalogo_tommy", 5);

    await expect(
      createSwitchSyncLog({ empresaKey: "fashion_shoes", syncType: "catalogo_tommy" }),
    ).rejects.toThrow(/Ya hay una corrida/);

    // Y no se lo tocó: sigue vivo y corriendo.
    expect(vivo.status).toBe("running");
    expect(tabla).toHaveLength(1); // no se insertó una segunda fila
  });

  it("el corte se DERIVA del techo real de la función, con margen de sobra", () => {
    // Una corrida no puede vivir más que maxDuration; el corte tiene que estar
    // holgadamente por encima o se liberaría el candado de un run VIVO.
    expect(RUNNING_STALE_MIN * 60).toBeGreaterThan(FUNCTION_MAX_DURATION_S);
    expect(RUNNING_STALE_MIN * 60).toBeGreaterThanOrEqual(FUNCTION_MAX_DURATION_S * 2);
    expect(RUNNING_STALE_MIN).toBe(30);
  });

  it("un run justo por debajo del corte todavía bloquea; justo por encima, no", async () => {
    sembrarRunning("vistana", "facturas", RUNNING_STALE_MIN - 1);
    await expect(
      createSwitchSyncLog({ empresaKey: "vistana", syncType: "facturas" }),
    ).rejects.toThrow(/Ya hay una corrida/);

    tabla = [];
    sembrarRunning("vistana", "facturas", RUNNING_STALE_MIN + 1);
    await expect(
      createSwitchSyncLog({ empresaKey: "vistana", syncType: "facturas" }),
    ).resolves.toBeTruthy();
  });
});

describe("el candado se libera SOLO, sin esperar a la corrida siguiente del par", () => {
  it("el barrido global cierra los vencidos de CUALQUIER par y respeta los vivos", async () => {
    sembrarRunning("fashion_shoes", "catalogo_tommy", 106);
    sembrarRunning("joystep", "recibos", 240);
    sembrarRunning("fashion_wear", "costo", 45);
    const vivo = sembrarRunning("active_wear", "estadocuenta", 3); // corriendo AHORA

    const cerrados = await barrerRunningAtascados();

    expect(cerrados).toBe(3);
    expect(vivo.status).toBe("running"); // intacto: no se toca una corrida viva
    const muertos = tabla.filter((r) => r.id !== vivo.id);
    expect(muertos.every((r) => r.status === "error")).toBe(true);
    expect(muertos.every((r) => esRunAtascado(r.error_message))).toBe(true);
  });

  it("`catalogo_tommy` corre 2×/día: sin barrido global el candado duraba hasta el día siguiente", async () => {
    // Este es exactamente el caso de producción: la fila quedó a las 18:52 y el
    // siguiente run del MISMO par recién iba a ser a las 12:40 del día después.
    sembrarRunning("fashion_shoes", "catalogo_tommy", 60 * 17);
    // El barrido lo suelta sin que corra tommy: lo llama cualquier otro cron.
    expect(await barrerRunningAtascados()).toBe(1);
    expect(tabla[0].status).toBe("error");
  });

  it("en un día sano el barrido es un no-op (no ensucia nada)", async () => {
    sembrarRunning("vistana", "facturas", 2);
    expect(await barrerRunningAtascados()).toBe(0);
    expect(tabla[0].status).toBe("running");
  });

  it("clearStaleRunning solo toca SU par, no el de al lado", async () => {
    sembrarRunning("fashion_shoes", "catalogo_tommy", 100);
    const otro = sembrarRunning("joystep", "recibos", 100);

    await clearStaleRunning("fashion_shoes", "catalogo_tommy");

    expect(tabla[0].status).toBe("error");
    expect(otro.status).toBe("running"); // ese lo suelta el barrido global
  });
});

describe('"error" significa error — un atasco no es un fallo de Switch', () => {
  it("reconoce las 3 redacciones que existen en producción (17 filas históricas)", () => {
    expect(esRunAtascado(MSG_RUN_ATASCADO)).toBe(true);
    expect(
      esRunAtascado(
        "Run previo atascado en 'running' (probable timeout); cerrado por el siguiente run.",
      ),
    ).toBe(true);
    expect(
      esRunAtascado("Run atascado en running; cerrado por la migracion del lock (20260723150000)"),
    ).toBe(true);
  });

  it("NO confunde un fallo real con un atasco", () => {
    expect(esRunAtascado(null)).toBe(false);
    expect(esRunAtascado("Auth fallo: HTTP 401 — TOKEN INVALIDO")).toBe(false);
    expect(esRunAtascado("LICENCIA NO SE ENCUENTRA ACTIVA")).toBe(false);
    expect(esRunAtascado("canceling statement due to statement timeout")).toBe(false);
  });

  it("un fallo REAL sigue contando como error y escala igual que antes", () => {
    const { streak } = computeStreakSilenciable([
      { status: "error", started_at: "2026-07-27T18:00:00Z", error_message: "Auth fallo: HTTP 401 — TOKEN INVALIDO" },
      { status: "error", started_at: "2026-07-27T14:00:00Z", error_message: "Error de red en /apifactura: fetch failed" },
      { status: "success", started_at: "2026-07-27T10:00:00Z", error_message: null },
    ]);
    expect(streak).toBe(2); // 2+ consecutivas → sigue escalando la alerta
  });

  it("una fila de ATASCO no suma al streak (no es evidencia de que Switch falle)", () => {
    const { streak } = computeStreakSilenciable([
      { status: "error", started_at: "2026-07-27T18:00:00Z", error_message: MSG_RUN_ATASCADO },
      { status: "success", started_at: "2026-07-27T12:00:00Z", error_message: null },
    ]);
    expect(streak).toBe(0); // un timeout NUESTRO no dispara una alerta de Switch
  });

  it("y tampoco CORTA un streak legítimo que la atraviesa (el lado que más dolía)", () => {
    // Antes: el texto del atasco no es silenciable → el `break` mataba el conteo
    // y una caída real de Switch se leía como "primer fallo" corrida tras corrida.
    const { streak, sinceIso } = computeStreakSilenciable([
      { status: "error", started_at: "2026-07-27T18:00:00Z", error_message: "Auth fallo: HTTP 401 — TOKEN INVALIDO" },
      { status: "error", started_at: "2026-07-27T17:00:00Z", error_message: MSG_RUN_ATASCADO },
      { status: "error", started_at: "2026-07-27T15:00:00Z", error_message: "HTTP 502: Bad Gateway" },
      { status: "success", started_at: "2026-07-27T12:00:00Z", error_message: null },
    ]);
    expect(streak).toBe(2);
    expect(sinceIso).toBe("2026-07-27T15:00:00Z");
  });

  it("un success sigue cortando el streak (no se rompió lo que funcionaba)", () => {
    const { streak } = computeStreakSilenciable([
      { status: "error", started_at: "2026-07-27T18:00:00Z", error_message: "HTTP 502: Bad Gateway" },
      { status: "success", started_at: "2026-07-27T17:00:00Z", error_message: null },
      { status: "error", started_at: "2026-07-27T15:00:00Z", error_message: "HTTP 502: Bad Gateway" },
    ]);
    expect(streak).toBe(1);
  });
});

describe("el presupuesto del manual no puede quedar por debajo del cron", () => {
  const raiz = join(__dirname, "..", "..", "app", "api");
  const leerMaxDuration = (ruta: string): number => {
    const src = readFileSync(join(raiz, ruta), "utf8");
    const m = src.match(/export const maxDuration = (\d+)/);
    if (!m) throw new Error(`sin maxDuration: ${ruta}`);
    return Number(m[1]);
  };

  it('"Actualizar ahora" corre los MISMOS syncs que los crons → mismo techo', () => {
    // 🩸 Esto es la causa raíz: 300 contra un trabajo de 485 s.
    const manual = leerMaxDuration("admin/sync-now/route.ts");
    for (const cron of ["cron/tommy-catalogo/route.ts", "cron/reebok-catalogo/route.ts", "cron/joybees-catalogo/route.ts"]) {
      expect(manual).toBeGreaterThanOrEqual(leerMaxDuration(cron));
    }
    expect(manual).toBe(FUNCTION_MAX_DURATION_S);
  });

  it("el techo declarado en el código es el que usa el corte del candado", () => {
    expect(leerMaxDuration("cron/tommy-catalogo/route.ts")).toBe(FUNCTION_MAX_DURATION_S);
  });
});
