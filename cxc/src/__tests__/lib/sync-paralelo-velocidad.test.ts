// ─────────────────────────────────────────────────────────────────────────────
// CANDADOS — ir más rápido no puede volver posible un ÉXITO A MEDIAS.
//
// Contexto (13-ago-2026). Daniel: *"hay manera que al actualizar en el sistema
// en catalogo, ventas, cxc, ect, sea mas rapido la sincronizacion?"*. Los dos
// syncs que lo hacen esperar mirando la pantalla hacían llamadas HTTP EN SERIE:
//   · catálogo   → 164 páginas de `/apiarticulos/lista`, una tras otra
//   · cartera    → 1 `/apiestadocuenta` por cliente (136-140 por empresa)
// Las dos pasaron a pedirse de a N, con el helper `enParalelo` que ya existía y
// estaba probado.
//
// 🔴 LO QUE ESTOS TESTS PROTEGEN, en orden de cuánto duele que se rompa:
//
//   A. LA GARANTÍA DEL #498. El corte del barrido sigue siendo la PÁGINA CORTA
//      y llegar al tope sin verla sigue siendo un ERROR. Ese bug cargó Calvin
//      con 4 productos de 8.173, en silencio y con `success`.
//   B. EL ORDEN. En paralelo las respuestas llegan desordenadas. Si el orden de
//      salida dependiera del orden de llegada, el sync sería irreproducible al
//      depurar y —en la cartera— el buffer de UPSERT acumularía distinto en
//      cada corrida.
//   C. QUE UN FALLO NO SE LLEVE A LOS DEMÁS. `enParalelo` propaga el primer
//      rechazo. En la cartera eso sería catastrófico: hoy un cliente que falla
//      se anota en `failedClienteIds` y se EXCLUYE del reconcile — sin eso, su
//      saldo bueno se pondría en 0 por una falla transitoria de red.
//   D. EQUIVALENCIA. Con concurrencia 1 y con concurrencia N el resultado tiene
//      que ser IDÉNTICO. Es la prueba de que la velocidad no cambió el dato.
//
// Los tests son de CONDUCTA: ejecutan el código real y miran qué salió. Un
// barrido de texto sobre el archivo no vería nada de esto.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Dobles: la cartera arrastra Supabase y el cliente de Switch ─────────────

interface EscrituraSupabase {
  tabla: string;
  op: string;
  filas?: unknown[];
  /** [método, ...argumentos]. Los argumentos van COMPLETOS a propósito:
   *  `not("cliente_switch_id", "in", "(3,11,17)")` lleva la lista de exclusión
   *  del reconcile en el TERCER argumento, y quedarse con los dos primeros hace
   *  que el candado pase sin haber mirado a quién se excluye. */
  filtros: Array<[string, ...unknown[]]>;
}
const escrituras: EscrituraSupabase[] = [];

function query(tabla: string, op: string, filas?: unknown[]) {
  const reg: EscrituraSupabase = { tabla, op, filas, filtros: [] };
  escrituras.push(reg);
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "lt", "neq", "gt", "not", "in", "select", "order", "limit"]) {
    q[m] = (...args: unknown[]) => {
      reg.filtros.push([m, ...args]);
      return q;
    };
  }
  q.single = () => Promise.resolve({ data: { id: "log-1" }, error: null });
  (q as { then: unknown }).then = (res: (v: unknown) => unknown) =>
    res({ data: [], error: null });
  return q;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => ({
      insert: (filas: unknown) => query(tabla, "insert", [filas]),
      upsert: (filas: unknown[]) => query(tabla, "upsert", filas),
      update: (parche: unknown) => query(tabla, "update", [parche]),
      select: () => query(tabla, "select"),
    }),
  },
}));
vi.mock("../../lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => ({
      insert: (filas: unknown) => query(tabla, "insert", [filas]),
      upsert: (filas: unknown[]) => query(tabla, "upsert", filas),
      update: (parche: unknown) => query(tabla, "update", [parche]),
      select: () => query(tabla, "select"),
    }),
  },
}));

vi.mock("@/lib/switch-api/sync-log", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  clearStaleRunning: async () => {},
}));

vi.mock("@/lib/switch-api/monto-guard-io", () => ({
  calibrarUmbral: async () => 2_000_000,
  detallesDeRechazo: () => [],
  avisarMontosImposibles: async () => {},
}));

/** Clientes y estados de cuenta que el Switch falso va a devolver. */
let clientesFalsos: Array<{ id: number; codigo: string; nombre: string }> = [];
let fallanIds: number[] = [];
/** Orden REAL en que el cliente falso contestó (para probar el desorden). */
let ordenRespuestas: number[] = [];
let concurrenciaMaxObservada = 0;
let enVuelo = 0;

vi.mock("@/lib/switch-api/client", async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    createSwitchClient: () => ({
      listClientes: async ({ paginaActual }: { paginaActual: number }) =>
        paginaActual === 1
          ? { clientes: clientesFalsos, paginacion: { total: clientesFalsos.length } }
          : { clientes: [], paginacion: { total: clientesFalsos.length } },
      getEstadoCuenta: async (id: number) => {
        enVuelo++;
        concurrenciaMaxObservada = Math.max(concurrenciaMaxObservada, enVuelo);
        // Latencia INVERSA al id: el último cliente contesta primero. Si el
        // código dependiera del orden de llegada, se notaría.
        await new Promise((r) => setTimeout(r, (clientesFalsos.length - id) * 2));
        enVuelo--;
        ordenRespuestas.push(id);
        if (fallanIds.includes(id)) throw new Error(`red caída para el cliente ${id}`);
        return {
          estadocuenta: {
            elements: [
              {
                ccteId: 1000 + id,
                secuencial: `F-${id}`,
                abrev: "FA",
                fecha: "01-07-2026",
                total: "100.00",
                saldo: "100.00",
                debito: "0",
                credito: "100.00",
              },
            ],
          },
        };
      },
    }),
  };
});

import { barrerPaginasArticulos } from "@/lib/switch-api/sync-catalogo";
import { syncEmpresaEstadoCuenta } from "@/lib/switch-api/sync-empresa";
import type { SwitchArticulo } from "@/lib/switch-api/client";

const PER = 50;

/** Catálogo falso de `n` artículos servido en páginas de `PER`. */
function catalogoDe(n: number, opts: { latenciaInversa?: boolean } = {}) {
  const pedidas: number[] = [];
  const traer = async (pagina: number): Promise<SwitchArticulo[]> => {
    pedidas.push(pagina);
    if (opts.latenciaInversa) await new Promise((r) => setTimeout(r, (20 - pagina) * 2));
    const desde = (pagina - 1) * PER;
    return Array.from({ length: Math.max(0, Math.min(PER, n - desde)) }, (_, i) => ({
      id: desde + i + 1,
      codigo: `SKU-${String(desde + i + 1).padStart(5, "0")}`,
    })) as unknown as SwitchArticulo[];
  };
  return { traer, pedidas };
}

beforeEach(() => {
  escrituras.length = 0;
  ordenRespuestas = [];
  fallanIds = [];
  concurrenciaMaxObservada = 0;
  enVuelo = 0;
});

// ═══════════════════════════════════════════════════════════════════════════
describe("A. barrido de páginas del catálogo — la garantía del #498 intacta", () => {
  it("trae el catálogo COMPLETO y en orden de página, con concurrencia > 1", async () => {
    const { traer } = catalogoDe(8173);
    const arts = await barrerPaginasArticulos(traer, {
      empresaKey: "vistana",
      perPage: PER,
      concurrencia: 6,
    });
    expect(arts).toHaveLength(8173);
    expect(arts[0].codigo).toBe("SKU-00001");
    expect(arts[8172].codigo).toBe("SKU-08173");
    // Orden estrictamente creciente = el orden de página, no el de llegada.
    const ids = arts.map((a) => a.id as number);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
  });

  it("las respuestas DESORDENADAS no alteran el orden de salida", async () => {
    const { traer } = catalogoDe(700, { latenciaInversa: true }); // 14 páginas
    const arts = await barrerPaginasArticulos(traer, {
      empresaKey: "vistana",
      perPage: PER,
      concurrencia: 8,
    });
    expect(arts.map((a) => a.codigo)).toEqual(
      Array.from({ length: 700 }, (_, i) => `SKU-${String(i + 1).padStart(5, "0")}`),
    );
  });

  it("EQUIVALENCIA: concurrencia 1 y concurrencia 8 dan EXACTAMENTE lo mismo", async () => {
    for (const n of [137, 250, 700, 8173]) {
      const serial = await barrerPaginasArticulos(catalogoDe(n).traer, {
        empresaKey: "vistana",
        perPage: PER,
        concurrencia: 1,
      });
      const paralelo = await barrerPaginasArticulos(catalogoDe(n).traer, {
        empresaKey: "vistana",
        perPage: PER,
        concurrencia: 8,
      });
      expect(paralelo).toEqual(serial);
      expect(paralelo).toHaveLength(n);
    }
  });

  it("un catálogo múltiplo exacto de la página termina bien (última llena + una vacía)", async () => {
    const arts = await barrerPaginasArticulos(catalogoDe(500).traer, {
      empresaKey: "vistana",
      perPage: PER,
      concurrencia: 4,
    });
    expect(arts).toHaveLength(500);
  });

  it("llegar al TOPE sin ver la página corta LANZA — nunca devuelve la lista a medias", async () => {
    // Catálogo infinito: toda página viene llena.
    const traer = async () =>
      Array.from({ length: PER }, (_, i) => ({ id: i, codigo: `X${i}` })) as unknown as SwitchArticulo[];
    await expect(
      barrerPaginasArticulos(traer, {
        empresaKey: "vistana",
        perPage: PER,
        maxPages: 20,
        concurrencia: 6,
      }),
    ).rejects.toThrow(/tope de 20 páginas sin ver la última/i);
  });

  it("el tope NO se pasa de largo aunque la tanda no encaje justo", async () => {
    const pedidas: number[] = [];
    const traer = async (p: number) => {
      pedidas.push(p);
      return Array.from({ length: PER }, (_, i) => ({ id: i, codigo: `X${i}` })) as unknown as SwitchArticulo[];
    };
    await expect(
      barrerPaginasArticulos(traer, { empresaKey: "vistana", perPage: PER, maxPages: 10, concurrencia: 6 }),
    ).rejects.toThrow();
    expect(Math.max(...pedidas)).toBe(10);
  });

  it("🩸 una página NO VACÍA detrás de la corta LANZA (en serie eso se perdía en silencio)", async () => {
    // Página 3 corta (30 art) pero la 4 trae 50: el catálogo se movió, o Switch
    // devolvió una página trunca. En serie el barrido cortaba en la 3 y perdía
    // TODO lo demás sin un error — el modo de fallo del db-max-rows.
    const traer = async (p: number) => {
      const n = p === 3 ? 30 : p <= 6 ? PER : 0;
      return Array.from({ length: n }, (_, i) => ({ id: p * 100 + i, codigo: `P${p}-${i}` })) as unknown as SwitchArticulo[];
    };
    await expect(
      barrerPaginasArticulos(traer, { empresaKey: "vistana", perPage: PER, concurrencia: 6 }),
    ).rejects.toThrow(/página trunca|cambió mientras se barría/i);
  });

  it("una página VACÍA detrás de la corta es normal y NO lanza", async () => {
    const traer = async (p: number) => {
      const n = p < 3 ? PER : p === 3 ? 30 : 0;
      return Array.from({ length: n }, (_, i) => ({ id: p * 100 + i, codigo: `P${p}-${i}` })) as unknown as SwitchArticulo[];
    };
    const arts = await barrerPaginasArticulos(traer, {
      empresaKey: "vistana",
      perPage: PER,
      concurrencia: 6,
    });
    expect(arts).toHaveLength(PER * 2 + 30);
  });

  it("pide DE VERDAD varias páginas a la vez (si no, no habría ganado nada)", async () => {
    let vuelo = 0;
    let pico = 0;
    const traer = async (p: number) => {
      vuelo++;
      pico = Math.max(pico, vuelo);
      await new Promise((r) => setTimeout(r, 5));
      vuelo--;
      return Array.from({ length: p <= 10 ? PER : 0 }, (_, i) => ({ id: i, codigo: `X${i}` })) as unknown as SwitchArticulo[];
    };
    await barrerPaginasArticulos(traer, { empresaKey: "vistana", perPage: PER, concurrencia: 6 });
    expect(pico).toBeGreaterThan(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("B. cartera (estadocuenta) — un cliente que falla no se lleva a los demás", () => {
  const opts = { desde: "2026-07-01", hasta: "2026-07-31", triggeredBy: "manual" as const };

  function sembrar(n: number) {
    clientesFalsos = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      codigo: `D-${i + 1}`,
      nombre: `Cliente ${i + 1}`,
    }));
  }

  it("procesa TODOS los clientes y escribe sus documentos", async () => {
    sembrar(30);
    const r = await syncEmpresaEstadoCuenta("vistana" as never, opts);
    expect(r.skipped).toBe(0);
    const filas = escrituras
      .filter((e) => e.tabla === "switch_estadocuenta" && e.op === "upsert")
      .flatMap((e) => e.filas ?? []) as Array<{ ccte_id: number }>;
    expect(filas).toHaveLength(30);
    expect(new Set(filas.map((f) => f.ccte_id)).size).toBe(30);
  });

  it("🔴 EL ORDEN de escritura es el de `clientes`, NO el de llegada de Switch", async () => {
    sembrar(24);
    await syncEmpresaEstadoCuenta("vistana" as never, opts);
    // El doble contesta con latencia INVERSA: dentro de cada tanda el id más
    // alto llega primero. Si el código usara el orden de llegada, se vería acá.
    const filas = escrituras
      .filter((e) => e.tabla === "switch_estadocuenta" && e.op === "upsert")
      .flatMap((e) => e.filas ?? []) as Array<{ ccte_id: number }>;
    expect(filas.map((f) => f.ccte_id)).toEqual(
      Array.from({ length: 24 }, (_, i) => 1000 + i + 1),
    );
    // …y que el desorden de llegada haya ocurrido de verdad (si no, el test
    // estaría pasando sin haber probado nada).
    expect(ordenRespuestas).not.toEqual([...ordenRespuestas].sort((a, b) => a - b));
  });

  it("🔴 un cliente que FALLA no aborta la tanda ni la corrida", async () => {
    sembrar(20);
    fallanIds = [3, 11, 17];
    const r = await syncEmpresaEstadoCuenta("vistana" as never, opts);
    expect(r.skipped).toBe(3);
    const filas = escrituras
      .filter((e) => e.tabla === "switch_estadocuenta" && e.op === "upsert")
      .flatMap((e) => e.filas ?? []) as Array<{ ccte_id: number }>;
    // Los 17 que sí contestaron se guardaron igual.
    expect(filas).toHaveLength(17);
    expect(filas.map((f) => f.ccte_id)).not.toContain(1003);
  });

  it("🔴 los clientes que fallaron quedan FUERA del reconcile (su saldo bueno no se pone en 0)", async () => {
    sembrar(20);
    fallanIds = [3, 11, 17];
    await syncEmpresaEstadoCuenta("vistana" as never, opts);
    const reconcile = escrituras.find(
      (e) =>
        e.tabla === "switch_estadocuenta" &&
        e.op === "update" &&
        e.filtros.some(([m]) => m === "lt"),
    );
    expect(reconcile).toBeTruthy();
    const exclusion = reconcile!.filtros.find(
      ([m, col]) => m === "not" && col === "cliente_switch_id",
    );
    expect(exclusion).toBeTruthy();
    // La lista concreta, no solo que exista el `.not(...)`.
    const lista = String(exclusion![3] ?? "");
    for (const id of [3, 11, 17]) expect(lista).toContain(String(id));
    // …y que NO se excluya a nadie que sí contestó (eso dejaría documentos
    // cerrados con saldo viejo = cartera inflada).
    expect(lista).not.toContain("20");
  });

  it("pide DE VERDAD varios estados de cuenta a la vez", async () => {
    sembrar(30);
    await syncEmpresaEstadoCuenta("vistana" as never, opts);
    expect(concurrenciaMaxObservada).toBeGreaterThan(1);
  });

  it("con TODOS los clientes fallando no se escribe ningún documento y el reconcile los excluye a todos", async () => {
    sembrar(8);
    fallanIds = [1, 2, 3, 4, 5, 6, 7, 8];
    const r = await syncEmpresaEstadoCuenta("vistana" as never, opts);
    expect(r.skipped).toBe(8);
    const filas = escrituras
      .filter((e) => e.tabla === "switch_estadocuenta" && e.op === "upsert")
      .flatMap((e) => e.filas ?? []);
    expect(filas).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("C. la concurrencia se queda del lado conservador", () => {
  const SRC_CAT = readFileSync(join(__dirname, "../../lib/switch-api/sync-catalogo.ts"), "utf8");
  const SRC_EMP = readFileSync(join(__dirname, "../../lib/switch-api/sync-empresa.ts"), "utf8");

  it("los tres números de concurrencia contra Switch existen y son moderados", () => {
    const paginas = Number(/const PAGINAS_CONCURRENCIA = (\d+);/.exec(SRC_CAT)?.[1]);
    const stock = Number(/const STOCK_CONCURRENCIA = (\d+);/.exec(SRC_CAT)?.[1]);
    const cartera = Number(/const ESTADOCUENTA_CONCURRENCIA = (\d+);/.exec(SRC_EMP)?.[1]);
    for (const n of [paginas, stock, cartera]) {
      expect(n).toBeGreaterThanOrEqual(1);
      // Switch es un ERP ajeno del que no controlamos el dimensionamiento.
      // Por encima de esto habría que volver a MEDIR antes de subirlo.
      expect(n).toBeLessThanOrEqual(8);
    }
  });

  it("la cartera NO abre una segunda sesión: sigue usando el cliente del API", () => {
    // El reporte web (loginSwitchWeb) es de Boston y abre una sesión aparte que
    // expulsa a quien esté en el panel. Acá no se usa.
    expect(SRC_EMP).not.toMatch(/loginSwitchWeb/);
  });
});
