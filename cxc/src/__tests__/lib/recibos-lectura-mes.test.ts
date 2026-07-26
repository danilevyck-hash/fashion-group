import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CANDADO del bug más caro de esta historia.
 *
 * PostgREST corta TODA respuesta en `db-max-rows` = 1000 filas Y LO HACE EN
 * SILENCIO: `.range(0, 49999)` devuelve 1000 sin error. Medido el 26-jul-2026,
 * american_classic jun-2026 tiene 1.259 recibos y el select devolvía 1.000.
 *
 * Con la escritura selectiva eso NO es una lectura incompleta cualquiera: las
 * 259 filas invisibles se leerían como "no están en la tabla" y se
 * RE-INSERTARÍAN en cada una de las 4 corridas diarias → recibos duplicados y
 * comisión-cobro inflada. Con el DELETE+INSERT viejo el bug no existía porque
 * el borrado era por rango, no por lo leído.
 *
 * Estos tests fijan las dos defensas: paginar, y verificar contra el COUNT.
 */

const rango = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: () => {
      const chain = {
        select: (_cols: string, opts?: { count?: string }) => {
          chain._pideCount = opts?.count === "exact";
          return chain;
        },
        eq: () => chain,
        gte: () => chain,
        lt: () => chain,
        order: () => chain,
        range: (desde: number, hasta: number) => rango(desde, hasta, chain._pideCount),
        _pideCount: false,
      } as Record<string, unknown> & { _pideCount: boolean };
      return chain;
    },
  },
}));

import { leerMesGuardado } from "../../lib/switch-api/sync-recibos";

const filas = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `id-${offset + i}`, total: 1 }));

beforeEach(() => rango.mockReset());

describe("leerMesGuardado — no se come filas por el tope de 1000 de PostgREST", () => {
  it("pagina hasta traer el mes COMPLETO (caso real: 1.259 filas)", async () => {
    rango.mockImplementation(async (desde: number) =>
      desde === 0
        ? { data: filas(1000, 0), error: null, count: 1259 }
        : { data: filas(259, 1000), error: null, count: null },
    );

    const out = await leerMesGuardado("american_classic", "2026-06-01", "2026-07-01");

    expect(out).toHaveLength(1259);
    expect(new Set(out.map((r) => r.id)).size).toBe(1259); // sin repetidos entre páginas
    expect(rango.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("pide el COUNT exacto en la primera página (es la red de seguridad)", async () => {
    rango.mockResolvedValue({ data: filas(3), error: null, count: 3 });
    await leerMesGuardado("vistana", "2026-07-01", "2026-08-01");
    expect(rango.mock.calls[0][2]).toBe(true);
  });

  it("CORTA si lo leído no cuadra con el COUNT (lectura incompleta silenciosa)", async () => {
    // Exactamente la forma del bug: el servidor tapa filas y no avisa.
    rango.mockResolvedValue({ data: filas(1000), error: null, count: 1259 });
    await expect(leerMesGuardado("american_classic", "2026-06-01", "2026-07-01")).rejects.toThrow(
      /lectura incompleta/i,
    );
  });

  it("un mes vacío devuelve vacío, sin dar una vuelta de más", async () => {
    rango.mockResolvedValue({ data: [], error: null, count: 0 });
    const out = await leerMesGuardado("joystep" as never, "2026-07-01", "2026-08-01");
    expect(out).toEqual([]);
    expect(rango).toHaveBeenCalledTimes(1);
  });

  it("un error del select se propaga (nunca se sigue con una lectura parcial)", async () => {
    rango.mockResolvedValue({ data: null, error: { message: "boom" }, count: null });
    await expect(leerMesGuardado("vistana", "2026-07-01", "2026-08-01")).rejects.toThrow(/boom/);
  });

  it("un mes de exactamente 1000 filas (una página justa) no pide una página fantasma", async () => {
    // El corte por COUNT evita el viaje de más: 1000 leídas == 1000 contadas.
    rango.mockImplementation(async (desde: number) =>
      desde === 0
        ? { data: filas(1000, 0), error: null, count: 1000 }
        : { data: [], error: null, count: null },
    );
    const out = await leerMesGuardado("american_classic", "2026-06-01", "2026-07-01");
    expect(out).toHaveLength(1000);
    expect(rango).toHaveBeenCalledTimes(1);
  });

  it("CORTA si el servidor no devuelve COUNT (sin COUNT no hay garantía)", async () => {
    rango.mockResolvedValue({ data: filas(5), error: null, count: null });
    await expect(leerMesGuardado("vistana", "2026-07-01", "2026-08-01")).rejects.toThrow(/sin COUNT/i);
  });
});
