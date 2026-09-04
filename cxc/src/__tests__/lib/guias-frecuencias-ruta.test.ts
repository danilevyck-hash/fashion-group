/**
 * La RUTA `/api/guias/frecuencias`, ejecutada de verdad.
 *
 * 🩸 POR QUÉ EXISTE, y no alcanzaba con el barrido estático: en la verificación
 * por mutación, sacar `direcciones` del `return` del GET **no puso rojo NADA**.
 * El candado de texto veía que el archivo importara y llamara a
 * `ultimaDireccionPorCliente(...)` — y eso seguía siendo cierto con el
 * resultado calculado y tirado a la basura. La pantalla habría perdido la
 * sugerencia de dirección EN SILENCIO, que es justo lo que este cambio vino a
 * construir. Es el mismo agujero que ya se pagó en `/api/saldos-banco`.
 *
 * Así que acá se LLAMA al handler real con la base mockeada y se mira el JSON.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/require-auth", () => ({
  getSession: () => ({ role: "bodega", userName: "Bodega" }),
}));

vi.mock("@/lib/clientes/directorio-cache", () => ({
  leerClientesDelGrupo: async () => [
    { codigo: "D-25", nombre: "City Mall Paso Canoa" },
    { codigo: "D-24", nombre: "City Mall David" },
  ],
}));

// Datos con la forma REAL de producción: la dirección vive en el envío y la
// fecha en la guía (`guia_items` no tiene fecha propia).
const ITEMS = [
  { guia_id: "g1", cliente_codigo: "D-25", empresa: "Fashion Wear", direccion: "David", deleted: false },
  { guia_id: "g3", cliente_codigo: "D-25", empresa: "Fashion Shoes", direccion: "Paso Canoas", deleted: false },
  { guia_id: "g2", cliente_codigo: "D-24", empresa: "Fashion Wear", direccion: "David", deleted: false },
];
const GUIAS = [
  { id: "g1", fecha: "2026-03-25", numero: 1, deleted: false },
  { id: "g2", fecha: "2026-06-10", numero: 40, deleted: false },
  { id: "g3", fecha: "2026-08-11", numero: 194, deleted: false },
];

const rango = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => ({
      select: () => ({
        order: () => ({ range: (desde: number) => rango(tabla, desde) }),
      }),
    }),
  },
}));

beforeEach(() => {
  rango.mockReset();
  rango.mockImplementation((tabla: string, desde: number) => {
    const filas = tabla === "guia_items" ? ITEMS : GUIAS;
    return Promise.resolve(
      desde === 0 ? { data: filas, error: null, count: filas.length } : { data: [], error: null },
    );
  });
});

async function pedirGet() {
  const { GET } = await import("@/app/api/guias/frecuencias/route");
  const res = await GET({} as never);
  return (await res.json()) as {
    clientes: { codigo: string; nombre: string }[];
    empresas: string[];
    direcciones: Record<string, string>;
    destinos: Record<string, string[]>;
  };
}

describe("GET /api/guias/frecuencias", () => {
  it("🔴 devuelve la ÚLTIMA dirección de cada cliente, no solo clientes y empresas", () => {
    return pedirGet().then((json) => {
      expect(json.direcciones).toBeTruthy();
      expect(json.direcciones["D-25"]).toBe("Paso Canoas"); // la guía más reciente
      expect(json.direcciones["D-24"]).toBe("David");
    });
  });

  it("🔴 devuelve los DESTINOS de cada cliente (los botones del campo Dirección, 4-sep-2026)", () => {
    // El mismo agujero que este archivo documenta arriba: calcular
    // `destinosHistoricos` y tirarlo a la basura dejaría los botones vacíos EN
    // SILENCIO. Con empate de frecuencia gana el de la guía más reciente.
    return pedirGet().then((json) => {
      expect(json.destinos).toBeTruthy();
      expect(json.destinos["D-25"]).toEqual(["Paso Canoas", "David"]);
      expect(json.destinos["D-24"]).toEqual(["David"]);
    });
  });

  it("⚠️ y NO devuelve una empresa por cliente: la empresa es por ENVÍO", () => {
    // Medido contra producción: la empresa anterior de un cliente acierta el
    // 34,2% de las veces. Autocompletarla metería el dato equivocado en dos de
    // cada tres envíos.
    return pedirGet().then((json) => {
      expect(json).not.toHaveProperty("empresasPorCliente");
      expect(JSON.stringify(json)).not.toContain("empresaPorCliente");
    });
  });

  it("⚠️ lo que ya devolvía sigue estando: clientes más usados y las 8 empresas", () => {
    return pedirGet().then((json) => {
      expect(json.clientes.map((c) => c.codigo)).toContain("D-25");
      expect(json.empresas.length).toBe(8);
    });
  });

  it("sin sesión de guías no contesta", async () => {
    vi.resetModules();
    vi.doMock("@/lib/require-auth", () => ({ getSession: () => null }));
    const { GET } = await import("@/app/api/guias/frecuencias/route");
    const res = await GET({} as never);
    expect(res.status).toBe(403);
    vi.doUnmock("@/lib/require-auth");
    vi.resetModules();
  });
});
