import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * CANDADO — mismo bug que recibos-lectura-mes.test.ts, otra tabla.
 *
 * `loadImpuestoMap()` lee switch_facturas para decidir qué recibos son
 * RETENCIÓN de ITBMS (impuesto que el cliente le retiene al proveedor y le paga
 * al Estado) y no cobro real. Ese flag `es_retencion` es el que excluye la
 * vista switch_ultimo_pago_cliente_v2 y las RPC de comisión sobre cobro.
 *
 * Leía con un solo `.range(0, 99999)` contra un `db-max-rows` de 1000: traía
 * 1.000 filas SIN error. Medido el 26-jul-2026, american_classic tiene 3.904
 * facturas en la ventana y traía 1.000. Con el mapa incompleto una retención de
 * verdad no se reconoce y se persiste como COBRO REAL → plata que nunca entró
 * contada como cobrada, en el "último pago" del CXC y en la comisión.
 *
 * Estos tests fijan las mismas dos defensas que leerMesGuardado: paginar con
 * orden estable, y verificar lo leído contra un COUNT exacto.
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
        order: (col: string) => {
          chain._orden = col;
          return chain;
        },
        range: (desde: number, hasta: number) => rango(desde, hasta, chain._pideCount, chain._orden),
        _pideCount: false,
        _orden: "",
      } as Record<string, unknown> & { _pideCount: boolean; _orden: string };
      return chain;
    },
  },
}));

import { loadImpuestoMap } from "../../lib/switch-api/sync-recibos";

/** n facturas del mismo cliente, todas con ITBMS distinto. */
const facturas = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({
    cliente_switch_id: 7,
    fecha: "2026-06-15T10:00:00+00:00",
    impuesto: offset + i + 1,
  }));

beforeEach(() => rango.mockReset());

describe("loadImpuestoMap — no se come facturas por el tope de 1000 de PostgREST", () => {
  it("pagina hasta traer TODAS las facturas (caso real: 3.904)", async () => {
    rango.mockImplementation(async (desde: number) => {
      if (desde === 0) return { data: facturas(1000, 0), error: null, count: 3904 };
      if (desde === 1000) return { data: facturas(1000, 1000), error: null, count: null };
      if (desde === 2000) return { data: facturas(1000, 2000), error: null, count: null };
      return { data: facturas(904, 3000), error: null, count: null };
    });

    const map = await loadImpuestoMap("american_classic", "2026-03-27", "2026-08-01");

    expect(map.get(7)).toHaveLength(3904);
    expect(rango.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
    ]);
  });

  it("pide el COUNT exacto en la primera página y ordena por una columna estable", async () => {
    rango.mockResolvedValue({ data: facturas(3), error: null, count: 3 });
    await loadImpuestoMap("vistana", "2026-03-27", "2026-08-01");
    expect(rango.mock.calls[0][2]).toBe(true); // count: "exact"
    expect(rango.mock.calls[0][3]).toBe("id"); // sin orden estable, PostgREST puede repetir o saltear filas
  });

  it("CORTA si lo leído no cuadra con el COUNT (la forma exacta del truncado silencioso)", async () => {
    rango.mockResolvedValue({ data: facturas(1000), error: null, count: 3904 });
    await expect(loadImpuestoMap("american_classic", "2026-03-27", "2026-08-01")).rejects.toThrow(
      /lectura incompleta/i,
    );
  });

  it("CORTA si el servidor no devuelve COUNT (sin COUNT no hay garantía)", async () => {
    rango.mockResolvedValue({ data: facturas(5), error: null, count: null });
    await expect(loadImpuestoMap("vistana", "2026-03-27", "2026-08-01")).rejects.toThrow(/sin COUNT/i);
  });

  it("FALLA CERRADA ante un error del select: nunca devuelve un mapa vacío", async () => {
    // Antes se tragaba el error y devolvía Map vacío → TODO recibo salía
    // es_retencion=false y el sync escribía retenciones como cobros reales.
    rango.mockResolvedValue({ data: null, error: { message: "boom" }, count: null });
    await expect(loadImpuestoMap("vistana", "2026-03-27", "2026-08-01")).rejects.toThrow(/boom/);
  });

  it("una ventana sin facturas devuelve un mapa vacío sin dar una vuelta de más", async () => {
    rango.mockResolvedValue({ data: [], error: null, count: 0 });
    const map = await loadImpuestoMap("joystep" as never, "2026-03-27", "2026-08-01");
    expect(map.size).toBe(0);
    expect(rango).toHaveBeenCalledTimes(1);
  });

  it("descarta las facturas sin cliente en vez de romperse", async () => {
    rango.mockResolvedValue({
      data: [...facturas(2), { cliente_switch_id: null, fecha: "2026-06-15T10:00:00+00:00", impuesto: 9 }],
      error: null,
      count: 3,
    });
    const map = await loadImpuestoMap("vistana", "2026-03-27", "2026-08-01");
    expect(map.size).toBe(1);
    expect(map.get(7)).toHaveLength(2);
  });
});

describe("candado estático — ninguna lectura de sync-recibos vuelve a pedir un rango gigante de una", () => {
  it("sync-recibos.ts no contiene un .range() con tope por encima del db-max-rows de 1000", () => {
    const fuente = fs.readFileSync(
      path.join(process.cwd(), "src/lib/switch-api/sync-recibos.ts"),
      "utf8",
    );
    // Los comentarios CITAN el bug a propósito (`.range(0, 99999)`), así que se
    // miran solo las líneas de código.
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // `.range(0, 99999)` y compañía: la firma de "creo que pidiendo mucho me lo
    // dan todo". PostgREST corta en 1000 y no avisa.
    const sospechosos = [...codigo.matchAll(/\.range\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)].filter(
      ([, , hasta]) => Number(hasta) >= 1000,
    );
    expect(sospechosos.map((m) => m[0])).toEqual([]);
  });

  it("cada .from() de una tabla grande en sync-recibos pasa por un bucle de páginas", () => {
    const fuente = fs.readFileSync(
      path.join(process.cwd(), "src/lib/switch-api/sync-recibos.ts"),
      "utf8",
    );
    // Las dos lecturas masivas del archivo son leerMesGuardado (switch_recibos)
    // y loadImpuestoMap (switch_facturas). Ambas tienen que verificar el COUNT.
    for (const tabla of ["switch_recibos", "switch_facturas"]) {
      expect(fuente).toContain(`lectura incompleta de ${tabla}`);
      expect(fuente).toContain(`${tabla} sin COUNT`);
    }
    expect(fuente.match(/count:\s*"exact"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
