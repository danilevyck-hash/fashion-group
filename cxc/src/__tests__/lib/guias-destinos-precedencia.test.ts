/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL ORDEN DE PRECEDENCIA DE LOS DESTINOS — tabla → constante → histórico
 * (4-sep-2026)
 *
 * Los destinos definidos viven en la tabla `guias_destino_cliente` (Guías ›
 * Configuración) y la constante `DESTINOS_DEFINIDOS` queda como RED mientras
 * la migración 20260918120000 no corra. El orden es de UNA sola función
 * (`destinosDefinidosPara`) y este archivo lo fija:
 *
 *   1. la TABLA, si tiene filas activas para ese cliente;
 *   2. la CONSTANTE, si no;
 *   3. null → el que llama cae al HISTÓRICO agrupado.
 *
 * Y las dos correcciones de Daniel (4-sep-2026), textual: *«city shoes →
 * Calle 19 Central, al lado de la joyería Super Oro. Y Nine Sport en Calle 19
 * Central.»* — fijadas acá contra la constante, para que no dependan de que
 * la migración corra.
 *
 * 🩸 Con la tabla AUSENTE (PGRST205, la migración sin correr) la lectura cae a
 * `{}` SIN lanzar — la pantalla de guías no puede romperse por una migración
 * pendiente — y los botones salen de la constante. Eso se prueba contra la
 * RUTA REAL de /api/guias/frecuencias, ejecutada con la base doblada: un
 * barrido de texto no puede ver que el JSON de verdad lleve los definidos
 * (el agujero de /api/saldos-banco, ya pagado).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DESTINOS_DEFINIDOS,
  botonesDeDestino,
  destinoParaAutollenar,
  destinosDefinidosPara,
  tiendasDelDestino,
  type DefinidosPorCliente,
} from "@/lib/guias/destinos-clientes";
import { leerDefinidosOVacio } from "@/lib/guias/destinos-config-server";

vi.mock("@/lib/require-auth", () => ({
  getSession: () => ({ role: "secretaria", userName: "Angela" }),
}));
vi.mock("@/lib/clientes/directorio-cache", () => ({
  leerClientesDelGrupo: async () => [
    { codigo: "D-35", nombre: "City Shoes" },
    { codigo: "D-112", nombre: "Nine Sports 9, S.A." },
  ],
}));

// ── La base doblada: guia_items/guia_transporte para el histórico, y la tabla
// nueva con resultado CONTROLABLE (filas o el error de tabla ausente). ────────
const ITEMS = [
  { guia_id: "g1", cliente_codigo: "D-112", empresa: "Vistana", direccion: "Calle 19", deleted: false },
];
const GUIAS = [{ id: "g1", fecha: "2026-08-01", numero: 10, deleted: false }];

let tablaDestinos: { data: unknown[] | null; error: { code?: string; message: string } | null };

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => {
      if (tabla === "guias_destino_cliente") {
        const c: Record<string, unknown> = {};
        c.select = () => c;
        c.eq = () => c;
        c.order = () => c;
        c.then = (res: (v: unknown) => unknown) => Promise.resolve(tablaDestinos).then(res);
        return c;
      }
      return {
        select: () => ({
          order: () => ({
            range: (desde: number) => {
              const filas = tabla === "guia_items" ? ITEMS : GUIAS;
              return Promise.resolve(
                desde === 0 ? { data: filas, error: null, count: filas.length } : { data: [], error: null },
              );
            },
          }),
        }),
      };
    },
  },
}));

beforeEach(() => {
  tablaDestinos = { data: [], error: null };
});

// ─── 1 · el orden: tabla → constante → histórico ─────────────────────────────

describe("🔴 la precedencia es tabla → constante → histórico, en UNA función", () => {
  it("la TABLA gana sobre la constante: D-35 con una fila en la tabla muestra LO DE LA TABLA", () => {
    // La constante dice el texto de Daniel; la tabla (corregida desde la
    // pantalla) dice otra cosa. Manda la tabla: para eso existe la pantalla.
    const deTabla: DefinidosPorCliente = {
      "D-35": [{ destino: "Vía Argentina, local 4" }],
    };
    expect(botonesDeDestino("D-35", ["Calle 19"], deTabla)).toEqual(["Vía Argentina, local 4"]);
    // Y NO se mezcla con la constante: la tabla es la foto completa del cliente.
    expect(botonesDeDestino("D-35", [], deTabla)).toHaveLength(1);
  });

  it("la CONSTANTE es la red: sin filas en la tabla (o tabla vacía), D-35 sale de la constante", () => {
    expect(botonesDeDestino("D-35", ["Otro lado"], {})).toEqual([
      "Calle 19 Central, al lado de la joyería Super Oro",
    ]);
    expect(botonesDeDestino("D-35", ["Otro lado"], undefined)).toEqual([
      "Calle 19 Central, al lado de la joyería Super Oro",
    ]);
  });

  it("el HISTÓRICO es lo último: un cliente sin tabla y sin constante usa su historia agrupada", () => {
    expect(botonesDeDestino("D-999", ["David", "Santiago"], {})).toEqual(["David", "Santiago"]);
  });

  it("un cliente sin nada — sin tabla, sin constante, sin historia — no tiene botones", () => {
    expect(botonesDeDestino("D-999", [], {})).toEqual([]);
    expect(destinosDefinidosPara("D-999", {})).toBeNull();
    expect(destinoParaAutollenar("D-999", [], {})).toBeNull();
  });

  it("el autollenado sigue la misma precedencia, y manda «EL DE SIEMPRE» de la tabla", () => {
    // Dos filas de la tabla SIN marca: nada se llena, aunque la constante
    // tenga su «el de siempre» — la tabla es la foto completa del cliente.
    const deTabla: DefinidosPorCliente = {
      "D-35": [{ destino: "Calle 19 Central" }, { destino: "Albrook" }],
    };
    expect(destinoParaAutollenar("D-35", [], deTabla)).toBeNull();
    // Con la marca puesta en la tabla, autollena ESA — aunque haya varias.
    expect(
      destinoParaAutollenar("D-35", [], {
        "D-35": [{ destino: "Calle 19 Central" }, { destino: "Vía España", elDeSiempre: true }],
      }),
    ).toBe("Vía España");
    // 🔴 Y una sola fila SIN la marca tampoco llena: «sin ninguno marcado, no
    // se llena nada» — la regla nueva reemplaza a «solo autollena si hay UNO».
    expect(destinoParaAutollenar("D-35", [], { "D-35": [{ destino: "Vía España" }] })).toBeNull();
  });

  it("las tiendas también salen de la tabla cuando la tabla manda", () => {
    const deTabla: DefinidosPorCliente = {
      "D-142": [{ destino: "Westland", tiendas: ["5", "6", "14", "Mas Flow"] }, { destino: "Albrook", tiendas: ["7"] }],
    };
    expect(tiendasDelDestino("D-142", "Westland", deTabla)).toEqual(["5", "6", "14", "Mas Flow"]);
    expect(tiendasDelDestino("D-142", "Westland · tienda 6", deTabla)).toEqual(["5", "6", "14", "Mas Flow"]);
    // Sin tabla, la constante sigue sirviendo las suyas.
    expect(tiendasDelDestino("D-142", "Westland", {})).toEqual(["5", "6", "14", "Mas Flow"]);
    // Una fila de la tabla SIN tiendas no hereda las de la constante.
    expect(tiendasDelDestino("D-142", "Westland", { "D-142": [{ destino: "Westland" }] })).toEqual([]);
  });
});

// ─── 2 · las dos correcciones de Daniel, textual ─────────────────────────────

describe("🔴 las correcciones del 4-sep-2026 — «city shoes → Calle 19 Central, al lado de la joyería Super Oro. Y Nine Sport en Calle 19 Central.»", () => {
  it("D-35 City Shoes dice el texto EXACTO de Daniel", () => {
    expect(DESTINOS_DEFINIDOS["D-35"]).toEqual([
      { destino: "Calle 19 Central, al lado de la joyería Super Oro", elDeSiempre: true },
    ]);
    expect(destinoParaAutollenar("D-35", [])).toBe("Calle 19 Central, al lado de la joyería Super Oro");
  });

  it("D-112 Nine Sports dice «Calle 19 Central» — la definición gana sobre su histórico («Calle 19»)", () => {
    expect(DESTINOS_DEFINIDOS["D-112"]).toEqual([{ destino: "Calle 19 Central", elDeSiempre: true }]);
    // El histórico real de D-112 (2 guías) decía «Calle 19»: la definición gana.
    expect(botonesDeDestino("D-112", ["Calle 19"])).toEqual(["Calle 19 Central"]);
    expect(destinoParaAutollenar("D-112", ["Calle 19"])).toBe("Calle 19 Central");
  });
});

// ─── 3 · la tabla ausente NO rompe nada — contra la RUTA REAL ────────────────

describe("🩸 con la tabla ausente (PGRST205) se cae a la constante y la pantalla no se rompe", () => {
  it("leerDefinidosOVacio devuelve {} sin lanzar, y los botones salen de la constante", async () => {
    tablaDestinos = { data: null, error: { code: "PGRST205", message: "relation \"guias_destino_cliente\" does not exist" } };
    const definidos = await leerDefinidosOVacio();
    expect(definidos).toEqual({});
    expect(botonesDeDestino("D-35", [], definidos)).toEqual([
      "Calle 19 Central, al lado de la joyería Super Oro",
    ]);
  });

  it("la ruta /api/guias/frecuencias contesta 200 igual, con destinos y definidos = {}", async () => {
    tablaDestinos = { data: null, error: { code: "PGRST205", message: "schema cache" } };
    const { GET } = await import("@/app/api/guias/frecuencias/route");
    const res = await GET({ cookies: { get: () => undefined } } as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { destinos: Record<string, string[]>; definidos: Record<string, unknown[]> };
    expect(json.destinos["D-112"]).toEqual(["Calle 19"]);
    expect(json.definidos).toEqual({});
  });

  it("🔴 y con la tabla PRESENTE, la ruta manda los definidos DE VERDAD (calcularlos y tirarlos dejaría la pantalla en la constante para siempre)", async () => {
    tablaDestinos = {
      data: [
        { id: 1, cliente_codigo: "D-35", destino: "Calle 19 Central, al lado de la joyería Super Oro", tiendas: [], orden: 1, el_de_siempre: true, creado_por: "daniel", creado_en: "2026-09-04" },
        { id: 2, cliente_codigo: "D-142", destino: "Westland", tiendas: ["5", "6"], orden: 1, el_de_siempre: false, creado_por: "daniel", creado_en: "2026-09-04" },
      ],
      error: null,
    };
    const { GET } = await import("@/app/api/guias/frecuencias/route");
    const res = await GET({ cookies: { get: () => undefined } } as never);
    const json = (await res.json()) as {
      definidos: Record<string, { destino: string; tiendas: string[]; elDeSiempre: boolean }[]>;
    };
    // Con la marca «el de siempre» viajando: sin ella, la pantalla no sabría
    // qué llenar solo.
    expect(json.definidos["D-35"]).toEqual([
      { destino: "Calle 19 Central, al lado de la joyería Super Oro", tiendas: [], elDeSiempre: true },
    ]);
    expect(json.definidos["D-142"]).toEqual([{ destino: "Westland", tiendas: ["5", "6"], elDeSiempre: false }]);
  });
});
