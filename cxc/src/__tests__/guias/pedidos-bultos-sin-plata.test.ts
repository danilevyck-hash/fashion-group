// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — A BODEGA NO LE VIAJAN LOS PRECIOS (6-oct-2026)
//
// Daniel, al aprobar: «bodega NO ve Precio ni Total, ni en la lista ni en el
// detalle; la secretaria y admin SÍ; el papel impreso SIEMPRE sale con Precio y
// Total, lo imprima quien lo imprima». Y el CÓMO, textual: *«decídelo en el
// SERVIDOR, no escondiendo columnas en el navegador, para que a bodega no le
// viajen los precios»*.
//
// 🔑 ESTA PRUEBA MIRA EL DATO, NO EL CÓDIGO. El candado hermano
// (`pedidos-bultos.test.ts`) comprueba que las rutas llamen a `leerLineas` con
// el rol correcto; éste comprueba lo único que de verdad importa: que lo que
// SALE de `leerLineas` con `conPlata = false` no tenga los números. Una columna
// escondida en el navegador igual viaja y se lee en dos toques.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const FILA = {
  codigo_barra_id: 7051,
  orden: 1,
  codigo: "NB4269909",
  descripcion: "Men-Trunk",
  talla: "-",
  color: "-",
  cantidad: "12.0000",
  precio: "27.0000",
  total: "324.0000",
  synced_at: "2026-10-06T10:00:00-05:00",
};

vi.mock("@/lib/supabase-server", () => {
  const tabla = (nombre: string) => {
    const filas = nombre === "pedidos_lineas" ? [FILA] : [{ codigo_barra_id: 7051, bulto: 3 }];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      order: () => Promise.resolve({ data: filas, error: null }),
      then: (r: (v: unknown) => unknown) => Promise.resolve({ data: filas, error: null }).then(r),
    };
    return q;
  };
  return { supabaseServer: { from: (n: string) => tabla(n) } };
});

const { leerLineas } = await import("@/lib/guias/pedido-detalle-server");

describe("🔴 a bodega no le viajan los precios", () => {
  beforeEach(() => vi.clearAllMocks());

  it("con `conPlata = false`, precio y total salen en NULL", async () => {
    const { lineas } = await leerLineas("vistana", 2362, false);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].precio).toBeNull();
    expect(lineas[0].total).toBeNull();
  });

  it("🔴 y el número NO aparece ni escondido: no está en el JSON que viaja", async () => {
    const { lineas } = await leerLineas("vistana", 2362, false);
    const json = JSON.stringify(lineas);
    // Los valores reales de la fila, por si alguien los dejara en otro campo.
    expect(json).not.toContain("27");
    expect(json).not.toContain("324");
  });

  it("lo demás SÍ le llega a bodega: es lo que necesita para armar los bultos", async () => {
    const { lineas } = await leerLineas("vistana", 2362, false);
    expect(lineas[0]).toMatchObject({
      codigo_barra_id: 7051,
      codigo: "NB4269909",
      descripcion: "Men-Trunk",
      cantidad: 12,
      bulto: 3,
    });
  });

  it("con `conPlata = true` —la secretaria y admin— los números sí llegan", async () => {
    const { lineas } = await leerLineas("vistana", 2362, true);
    expect(lineas[0].precio).toBe(27);
    expect(lineas[0].total).toBe(324);
  });

  it("🔑 y por omisión se lee CON plata: el papel del servidor depende de eso", async () => {
    const { lineas } = await leerLineas("vistana", 2362);
    expect(lineas[0].precio).toBe(27);
  });
});
