import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { leerTodoPaginado } from "../../lib/supabase-paginado";

/**
 * CANDADO del truncado silencioso de PostgREST, a nivel de todo el repo.
 *
 * `db-max-rows` = 1000: cualquier lectura que espere más filas y no pagine
 * devuelve 1.000 SIN error. Cuando el resultado se suma o se cuenta, el número
 * que ve Daniel queda mal y nadie se entera.
 *
 * Dos bloques: el comportamiento del helper, y un barrido ESTÁTICO que falla si
 * alguien vuelve a escribir el anti-patrón en los archivos ya saneados.
 */

const rango = vi.fn();

const filas = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: offset + i }));

beforeEach(() => rango.mockReset());

describe("leerTodoPaginado", () => {
  it("junta todas las páginas hasta llegar al COUNT", async () => {
    rango.mockImplementation(async (pedirCount: boolean, desde: number) =>
      desde === 0
        ? { data: filas(1000, 0), error: null, count: 1511 }
        : { data: filas(511, 1000), error: null, count: null },
    );

    const out = await leerTodoPaginado<{ id: number }>("t", (c, d, h) => rango(c, d, h));

    expect(out).toHaveLength(1511);
    expect(new Set(out.map((r) => r.id)).size).toBe(1511); // sin repetidos entre páginas
    expect(rango.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("pide el COUNT exacto SÓLO en la primera página", async () => {
    rango.mockImplementation(async (pedirCount: boolean, desde: number) =>
      desde === 0
        ? { data: filas(1000, 0), error: null, count: 1200 }
        : { data: filas(200, 1000), error: null, count: null },
    );
    await leerTodoPaginado("t", (c, d, h) => rango(c, d, h));
    expect(rango.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it("CORTA RUIDOSAMENTE si lo leído no cuadra con el COUNT", async () => {
    // La forma exacta del bug: el servidor dice que hay 1.511 pero sólo entrega
    // 1.000 y se queda callado (la página siguiente vuelve vacía).
    rango.mockImplementation(async (_c: boolean, desde: number) =>
      desde === 0
        ? { data: filas(1000), error: null, count: 1511 }
        : { data: [], error: null, count: null },
    );
    await expect(leerTodoPaginado("switch_estadocuenta", (c, d, h) => rango(c, d, h))).rejects.toThrow(
      /lectura incompleta.*1000.*1511/s,
    );
  });

  it("CORTA si no hay COUNT: sin él no se puede garantizar nada", async () => {
    rango.mockResolvedValue({ data: filas(5), error: null, count: null });
    await expect(leerTodoPaginado("t", (c, d, h) => rango(c, d, h))).rejects.toThrow(/COUNT exacto/i);
  });

  it("propaga el error del select con la etiqueta, nunca devuelve datos a medias", async () => {
    rango.mockResolvedValue({ data: null, error: { message: "boom" }, count: null });
    await expect(leerTodoPaginado("mi_tabla", (c, d, h) => rango(c, d, h))).rejects.toThrow(/mi_tabla: boom/);
  });

  it("una tabla vacía devuelve [] sin dar una vuelta de más", async () => {
    rango.mockResolvedValue({ data: [], error: null, count: 0 });
    expect(await leerTodoPaginado("t", (c, d, h) => rango(c, d, h))).toEqual([]);
    expect(rango).toHaveBeenCalledTimes(1);
  });

  it("exactamente 1000 filas (una página justa) no pide una página fantasma", async () => {
    rango.mockImplementation(async (_c: boolean, desde: number) =>
      desde === 0 ? { data: filas(1000), error: null, count: 1000 } : { data: [], error: null, count: null },
    );
    expect(await leerTodoPaginado("t", (c, d, h) => rango(c, d, h))).toHaveLength(1000);
    expect(rango).toHaveBeenCalledTimes(1);
  });
});

/**
 * Barrido estático. Estos archivos ya se sanearon; si alguien vuelve a meter
 * `.range(0, N)` con N ≥ 1000 o un `.limit(N)` con N > 1000 —los dos disfraces
 * de "creo que pidiendo mucho me lo dan todo"— el build falla.
 */
const SANEADOS = [
  "src/lib/switch-api/sync-recibos.ts",
  "src/lib/switch-api/sync-utilidad.ts",
  "src/lib/ventas/queries.ts",
  "src/app/api/upload/route.ts",
  "src/app/api/notification-badges/route.ts",
  // (`src/app/api/catalogo/switch-clientes/route.ts` se RETIRÓ el 17-ago-2026:
  //  era la segunda puerta al directorio de clientes de Switch, la que usaba la
  //  lista propia del checkout. Hoy queda una sola, `[marca]/clientes-switch`,
  //  que lista con `.limit(20)` por búsqueda y no necesita paginar.)
  "src/app/api/catalogo/[marca]/public/route.ts",
  "src/app/api/catalogo/reebok/stats/route.ts",
  "src/app/api/catalogo/reebok/inventory/route.ts",
  // Ranking de productos de Multifashion: 21.749 filas en la ventana de 12
  // meses. Sin paginar leería 1.000 y la pestaña mostraría el 5% de las ventas
  // SIN UN SOLO ERROR — el peor de los casos de este bug.
  "src/app/api/multifashion/productos/route.ts",
  // Fidelización ACS: paginaba SIN `.order()`, que no arregla nada — con filas
  // empatadas PostgREST puede repetir o saltear entre páginas, y esta ruta
  // AGREGA, así que un salteo se ve como un número más chico. `switch_facturas`
  // de ACS ya va en 1.273 filas (medido 12-ago-2026): la 2ª página se pide.
  "src/app/api/multifashion/fidelizacion/route.ts",
  // Resumen SEMANAL de fotos faltantes: no paginaba. Hoy la marca más grande
  // (Tommy) tiene 453 activos, pero desde la fila 1.001 el aviso diría "faltan
  // N fotos" quedándose corto — sin error y sin señal.
  "src/lib/catalogos/fotos-resumen.ts",
];

/** Quita comentarios: varios archivos CITAN el anti-patrón para explicarlo. */
const soloCodigo = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("candado estático — el anti-patrón no vuelve a los archivos saneados", () => {
  it.each(SANEADOS)("%s no pide un rango ni un limit por encima del db-max-rows", (rel) => {
    const codigo = soloCodigo(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));

    const rangosGrandes = [...codigo.matchAll(/\.range\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)]
      .filter(([, , hasta]) => Number(hasta) >= 1000)
      .map((m) => m[0]);
    expect(rangosGrandes).toEqual([]);

    const limitsGrandes = [...codigo.matchAll(/\.limit\(\s*(\d+)\s*\)/g)]
      .filter(([, n]) => Number(n) > 1000)
      .map((m) => m[0]);
    expect(limitsGrandes).toEqual([]);
  });

  it("toda lectura paginada del repo ordena antes de paginar", () => {
    // Paginar sin `.order()` estable no arregla nada: con offset y sin orden
    // total, PostgREST puede repetir o saltear filas entre páginas.
    for (const rel of SANEADOS) {
      const codigo = soloCodigo(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
      if (!codigo.includes(".range(")) continue;
      const bloques = codigo.split(".range(").slice(0, -1);
      for (const b of bloques) {
        expect(b.slice(-400)).toMatch(/\.order\(/);
      }
    }
  });
});
