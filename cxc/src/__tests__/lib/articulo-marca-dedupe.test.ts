/**
 * CANDADO — el diccionario de marcas no puede volver a quedarse a medias.
 *
 * 🩸 El caso real (medido en producción el 7-ago-2026): `switch_articulo_marca`
 * tenía 2.000 filas de american_classic (articulo_id 1…2004, 19 marcas de 33)
 * contra un catálogo de 9.126 renglones, y el módulo Multifashion › Productos
 * mostraba como "Sin marca" el 91,3% de los códigos vendidos en 12 meses.
 *
 * La causa NO fue un timeout (el barrido completo mide 204 s contra 800 s de
 * `maxDuration`) ni un corte del endpoint (la página 41 devuelve datos). Fue
 * esto: `/apiarticulos/lista` devuelve **9.126 renglones con solo 8.447 id
 * distintos** — 221 artículos repetidos, casi siempre en renglones consecutivos
 * de la misma página. El upsert manda lotes de 500 con
 * `onConflict: "empresa_key,articulo_id"`, y Postgres rechaza una sentencia que
 * traiga la misma llave dos veces ("ON CONFLICT DO UPDATE command cannot affect
 * row a second time"). El primer lote con un repetido adentro es el 5.º: los 4
 * primeros entraban (500 × 4 = 2.000 filas) y el 5.º tumbaba la corrida.
 *
 * Lo que se fija acá:
 *   1. ningún lote del upsert puede llevar dos veces el mismo articulo_id;
 *   2. deduplicar no pierde artículos ni inventa ninguno;
 *   3. un barrido que se corta a la mitad NO se escribe ni se anota `success`;
 *   4. el sync usa el deduplicador (barrido estático — nadie puede volver a
 *      mandar el catálogo crudo al upsert).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── Doble de Supabase ────────────────────────────────────────────────────────
let filasPrevias = 0;
let errorEnLote: number | null = null; // 1-based: qué lote debe fallar
const upserts: Record<string, unknown>[][] = [];
let logFinal: { status?: string; error_message?: string | null; records_inserted?: number } = {};

vi.mock("@/lib/supabase-server", () => {
  const chain = (tabla: string) => {
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      select: () => c,
      eq: () => c,
      not: () => c,
      order: () => c,
      // La cadena es "thenable": `await …select().eq()` (el COUNT de la sonda)
      // resuelve acá, y `…eq().not().order().range()` sigue encadenando.
      then: (res: (v: unknown) => unknown) => res({ data: [], error: null, count: filasPrevias }),
      range: async () => ({ data: [], error: null, count: 0 }),
      single: async () => ({ data: { id: "log-1" }, error: null }),
      insert: () => c,
      update: (patch: Record<string, unknown>) => {
        if (tabla === "switch_sync_log") logFinal = patch;
        return { eq: async () => ({ data: null, error: null }), lt: async () => ({ data: null, error: null }) };
      },
      upsert: async (filas: Record<string, unknown>[]) => {
        upserts.push(filas);
        if (errorEnLote !== null && upserts.length === errorEnLote) {
          return { data: null, error: { message: "ON CONFLICT DO UPDATE command cannot affect row a second time" } };
        }
        return { data: null, error: null };
      },
    });
    return c;
  };
  return { supabaseServer: { from: (t: string) => chain(t) } };
});

// ── Doble del cliente de Switch: el catálogo se inyecta por test ─────────────
let catalogo: { id: number; codigo: string; marcaId: number | null; codigoBarra: string | null }[] = [];
const PAGINA = 50;

vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({
    getArticulos: async ({ paginaActual }: { paginaActual: number }) => ({
      articulos: catalogo.slice((paginaActual - 1) * PAGINA, paginaActual * PAGINA),
    }),
    getArticuloInfo: async () => ({ articulo: { marca: "MARCA X" } }),
  }),
}));

import { dedupeCatalogo, syncArticuloMarca } from "@/lib/switch-api/sync-articulo-marca";

/**
 * El catálogo real, en miniatura: renglones consecutivos repetidos, y —como en
 * producción— NINGUNO antes de `desdeId`. Eso es lo que hacía que los 4 primeros
 * lotes del upsert entraran limpios y el 5.º reventara.
 */
function catalogoConRepetidos(n: number, repetirCada: number, desdeId = 0) {
  const out: typeof catalogo = [];
  for (let i = 1; i <= n; i++) {
    const a = { id: i, codigo: `COD-${i}`, marcaId: 10, codigoBarra: `BC-${i}` };
    out.push(a);
    if (i > desdeId && i % repetirCada === 0) out.push({ ...a }); // la copia, pegada
  }
  return out;
}

beforeEach(() => {
  upserts.length = 0;
  logFinal = {};
  filasPrevias = 0;
  errorEnLote = null;
  catalogo = [];
});

describe("dedupeCatalogo — módulo puro", () => {
  it("un renglón por articulo_id, sin perder ni inventar artículos", () => {
    const r = dedupeCatalogo([
      { id: 1, codigo: "A", marcaId: 10 },
      { id: 2, codigo: "B", marcaId: 11 },
      { id: 1, codigo: "A", marcaId: 10 },
    ]);
    expect(r.unicos.map((a) => a.id).sort()).toEqual([1, 2]);
    expect(r.renglonesRepetidos).toBe(1);
    expect(r.idsRepetidos).toBe(1);
  });

  it("un id que viene 12 veces cuenta como UN id repetido y 11 renglones de más", () => {
    const doce = Array.from({ length: 12 }, () => ({ id: 7, codigo: "X", marcaId: 3 }));
    const r = dedupeCatalogo(doce);
    expect(r.unicos).toHaveLength(1);
    expect(r.idsRepetidos).toBe(1);
    expect(r.renglonesRepetidos).toBe(11);
  });

  it("un catálogo sin repetidos pasa intacto y en orden", () => {
    const crudo = [
      { id: 3, codigo: "C", marcaId: 1 },
      { id: 1, codigo: "A", marcaId: 2 },
      { id: 2, codigo: "B", marcaId: null },
    ];
    const r = dedupeCatalogo(crudo);
    expect(r.unicos).toEqual(crudo);
    expect(r.renglonesRepetidos).toBe(0);
    expect(r.idsRepetidos).toBe(0);
  });

  it("gana la ÚLTIMA aparición (misma semántica que escribir renglón por renglón)", () => {
    const r = dedupeCatalogo([
      { id: 5, codigo: "VIEJO", marcaId: 1 },
      { id: 5, codigo: "NUEVO", marcaId: 2 },
    ]);
    expect(r.unicos).toEqual([{ id: 5, codigo: "NUEVO", marcaId: 2 }]);
  });

  it("las proporciones reales del 7-ago: 9.126 renglones → 8.447 artículos", () => {
    // 679 renglones de más repartidos en 221 ids, igual que la medición.
    const crudo: { id: number; codigo: string; marcaId: number | null }[] = [];
    for (let i = 1; i <= 8447; i++) crudo.push({ id: i, codigo: `C${i}`, marcaId: 10 });
    for (let k = 0; k < 679; k++) {
      const id = (k % 221) + 1; // 679 copias repartidas en 221 artículos
      crudo.push({ id, codigo: `C${id}`, marcaId: 10 });
    }
    expect(crudo).toHaveLength(9126);
    expect(new Set(crudo.map((a) => a.id)).size).toBe(8447);
    const r = dedupeCatalogo(crudo);
    expect(r.unicos).toHaveLength(8447);
    expect(r.renglonesRepetidos).toBe(679);
  });
});

describe("syncArticuloMarca — el upsert nunca recibe una llave dos veces", () => {
  it("el catálogo con repetidos se escribe ENTERO (era donde moría en el lote 5)", async () => {
    catalogo = catalogoConRepetidos(2600, 40, 2000); // repetidos solo pasado el 2.000
    const r = await syncArticuloMarca("american_classic");

    const escritas = upserts.flat();
    const ids = escritas.map((f) => f.articulo_id as number);
    expect(new Set(ids).size).toBe(ids.length); // sin repetidos EN TOTAL
    for (const lote of upserts) {
      const l = lote.map((f) => f.articulo_id as number);
      expect(new Set(l).size, "un lote llevó la misma llave dos veces").toBe(l.length);
    }
    expect(r.articulos).toBe(2615);
    expect(r.articulosUnicos).toBe(2600);
    expect(r.renglonesRepetidos).toBe(15);
    expect(r.filas).toBe(2600);
    expect(logFinal.status).toBe("success");
  });

  it("con el catálogo crudo el 5.º lote habría llevado una llave repetida", () => {
    // Reproduce la aritmética del caso real SIN deduplicar: es lo que hacía que
    // se escribieran exactamente 2.000 filas y se cayera el resto.
    const crudo = catalogoConRepetidos(2600, 40, 2000);
    const primerChoque = (() => {
      const visto = new Map<number, number>();
      for (let i = 0; i < crudo.length; i++) {
        const prev = visto.get(crudo[i].id);
        if (prev !== undefined && Math.floor(prev / 500) === Math.floor(i / 500)) {
          return Math.floor(i / 500) + 1;
        }
        visto.set(crudo[i].id, i);
      }
      return null;
    })();
    expect(primerChoque).toBe(5);
  });

  it("un barrido cortado a la mitad NO escribe nada y queda 'error' en el log", async () => {
    filasPrevias = 8447;
    catalogo = catalogoConRepetidos(2000, 1e9); // el barrido trae 2.000 de 8.447
    await expect(syncArticuloMarca("american_classic")).rejects.toThrow(/cortó a mitad de camino/);
    expect(upserts, "escribió pese al barrido corto").toHaveLength(0);
    expect(logFinal.status).toBe("error");
  });

  it("un barrido normal contra un diccionario ya poblado SÍ pasa el guard", async () => {
    filasPrevias = 8447;
    catalogo = catalogoConRepetidos(8400, 1e9); // achique natural, dentro del 70%
    const r = await syncArticuloMarca("american_classic");
    expect(r.filas).toBe(8400);
    expect(logFinal.status).toBe("success");
  });

  it("la primera corrida (tabla vacía) no puede quedar bloqueada por el guard", async () => {
    filasPrevias = 0;
    catalogo = catalogoConRepetidos(120, 1e9);
    const r = await syncArticuloMarca("american_classic");
    expect(r.filas).toBe(120);
    expect(logFinal.status).toBe("success");
  });

  it("si un lote falla, el error dice cuántas filas alcanzaron a escribirse", async () => {
    catalogo = catalogoConRepetidos(2600, 1e9);
    errorEnLote = 3;
    await expect(syncArticuloMarca("american_classic")).rejects.toThrow(/lote 3 de 6, 1000 de 2600 filas escritas/);
    expect(logFinal.status).toBe("error");
    expect(logFinal.error_message).toMatch(/1000 de 2600/);
  });
});

describe("candado estático — el catálogo crudo no puede llegar al upsert", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/switch-api/sync-articulo-marca.ts"),
    "utf8",
  );

  it("el sync llama a dedupeCatalogo antes de armar las filas", () => {
    expect(src).toMatch(/dedupeCatalogo\(articulos\)/);
  });

  it("las filas del upsert salen del catálogo deduplicado, no de `articulos`", () => {
    expect(src).not.toMatch(/const filas = articulos\b/);
    expect(src).toMatch(/const filas = dedup\.unicos/);
  });

  it("el guard del barrido corto sigue puesto", () => {
    expect(src).toMatch(/PISO_BARRIDO/);
  });
});

describe("candado estático — el fallo del diccionario no puede volver a ser silencioso", () => {
  const route = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/api/cron/switch-articulos/route.ts"),
    "utf8",
  );

  it("marcaError entra en la lista que se le pasa a alertSwitchCronErrors", () => {
    expect(route).toMatch(/marcaError[\s\S]{0,200}syncType: "articulo_marca"/);
  });

  it("el heartbeat sigue mirando SOLO las ventas por artículo", () => {
    expect(route).toMatch(/if \(errors\.length === 0\) \{\s*await recordCronHeartbeat/);
  });

  it("hay UNA sola llamada a alertSwitchCronErrors (dos serían dos mensajes)", () => {
    expect(route.match(/await alertSwitchCronErrors\(/g) ?? []).toHaveLength(1);
  });
});
