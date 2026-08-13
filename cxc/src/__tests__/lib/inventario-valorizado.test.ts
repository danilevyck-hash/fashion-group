/**
 * Candados del INVENTARIO VALORIZADO (13-ago-2026).
 *
 * El activo más grande del grupo — $2,80M al costo, 197.173 piezas — y hasta
 * hoy no se veía en ninguna pantalla. Los números de este archivo son los
 * MEDIDOS contra producción el 13-ago-2026 (dato de las 04:31-04:51 UTC):
 *
 *   Fashion Wear   82.997 u   $1.282.640,12   a precio $1.947.137,70
 *   Fashion Shoes  47.492 u     $676.763,62   a precio   $952.553,00
 *   Vistana        50.591 u     $653.880,34   a precio   $932.299,50
 *   Active Shoes    6.616 u      $96.193,61   a precio   $127.784,80
 *   Joystep         9.418 u      $84.890,87   a precio   $100.819,00
 *   Active Wear        59 u       $1.223,69   a precio     $1.255,00
 *   TOTAL         197.173 u   $2.795.592,25   a precio $4.061.849,00
 *
 * 🔑 LO QUE MÁS IMPORTA, y es lo que prueba la mitad de este archivo: **el
 * número que manda es el COSTO**. Los $4,06M a precio de etiqueta son
 * potencial; rotularlos como "lo que tengo" sería una mentira de $1,27M.
 *
 * Y la segunda mitad: **lo que no se midió se DICE, no se pone en cero.**
 * Boston y Multifashion no sincronizan catálogo, y 7 artículos (873 piezas)
 * tienen stock sin costo cargado en Switch.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agregarEmpresa,
  agregarInventario,
  armarInventario,
  empresasSinInventario,
  inventarioNoDisponible,
  tieneCosto,
  num,
  HORAS_INVENTARIO_VIEJO,
  type FilaArticuloInfo,
  type InventarioEmpresa,
} from "@/lib/inventario/valorizado";
import { B2B_EMPRESA_KEYS, ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";

const raiz = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

const CUBIERTAS = B2B_EMPRESA_KEYS as readonly string[];
const AHORA = Date.parse("2026-08-13T18:00:00.000Z");
const SYNC = "2026-08-13T04:31:04.299+00:00"; // el sello REAL de vistana

function fila(p: Partial<FilaArticuloInfo> & { empresa_key: string }): FilaArticuloInfo {
  return {
    empresa_key: p.empresa_key,
    existencia: p.existencia ?? 0,
    costo_api: p.costo_api ?? null,
    precio_etiqueta: p.precio_etiqueta ?? null,
    // `??` no sirve: un `synced_at: null` EXPLÍCITO es el caso "sin sello".
    synced_at: "synced_at" in p ? p.synced_at! : SYNC,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el número que manda es el COSTO, no el precio de etiqueta", () => {
  const filas = [
    fila({ empresa_key: "vistana", existencia: 10, costo_api: 5, precio_etiqueta: 9 }),
    fila({ empresa_key: "joystep", existencia: 4, costo_api: 2.5, precio_etiqueta: 7 }),
  ];

  it("`totalCosto` es existencia × costo — la plata que se puso", () => {
    const inv = agregarInventario(filas, CUBIERTAS, AHORA);
    expect(inv.totalCosto).toBe(10 * 5 + 4 * 2.5);
  });

  it("`totalPrecio` viaja APARTE y con otro nombre — nunca es el mismo campo", () => {
    const inv = agregarInventario(filas, CUBIERTAS, AHORA);
    expect(inv.totalPrecio).toBe(10 * 9 + 4 * 7);
    // Si alguien cruzara los dos campos, éste sería el test que lo caza: son
    // números distintos y el que manda es el CHICO.
    expect(inv.totalPrecio).toBeGreaterThan(inv.totalCosto);
  });

  it("por empresa pasa lo mismo: costo y precio nunca se pisan", () => {
    const e = agregarEmpresa("vistana", [filas[0]]);
    expect(e.costo).toBe(50);
    expect(e.precio).toBe(90);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 lo que NO se midió se dice, no se pone en cero", () => {
  it("Boston y Multifashion salen en `sinInventario` con su motivo", () => {
    const inv = agregarInventario([], CUBIERTAS, AHORA);
    const keys = inv.sinInventario.map((s) => s.key).sort();
    expect(keys).toEqual(["american_classic", "confecciones_boston"]);
    for (const s of inv.sinInventario) {
      expect(s.motivo.length).toBeGreaterThan(20);
      expect(s.name).not.toMatch(/^\s*$/);
    }
  });

  it("y NUNCA aparecen en `porEmpresa` — ni con cero", () => {
    // Si mañana quedara una fila vieja de Boston en la tabla, sería un snapshot
    // congelado hace meses presentándose como el inventario de hoy.
    const inv = agregarInventario(
      [fila({ empresa_key: "confecciones_boston", existencia: 99, costo_api: 3 })],
      CUBIERTAS,
      AHORA,
    );
    expect(inv.porEmpresa.map((e) => e.key)).not.toContain("confecciones_boston");
    expect(inv.totalCosto).toBe(0);
    expect(inv.sinInventario.map((s) => s.key)).toContain("confecciones_boston");
  });

  it("la lista de excluidas se DERIVA: si el sync sumara una empresa, se achica sola", () => {
    const conBoston = empresasSinInventario([...CUBIERTAS, "confecciones_boston"]);
    expect(conBoston.map((s) => s.key)).toEqual(["american_classic"]);
    // Y cubre exactamente el complemento de ALL_EMPRESA_KEYS.
    expect(empresasSinInventario(CUBIERTAS).length + CUBIERTAS.length).toBe(ALL_EMPRESA_KEYS.length);
  });

  it("costo 0 cuenta como SIN COSTO — así llega de Switch, no como nulo", () => {
    expect(tieneCosto(0)).toBe(false);
    expect(tieneCosto(null)).toBe(false);
    expect(tieneCosto(0.01)).toBe(true);
  });

  it("las piezas sin costo se cuentan aparte y NO cambian el valor", () => {
    const inv = agregarInventario(
      [
        fila({ empresa_key: "vistana", existencia: 10, costo_api: 5, precio_etiqueta: 9 }),
        fila({ empresa_key: "vistana", existencia: 48, costo_api: 0, precio_etiqueta: 0 }), // TAZAS, real
        fila({ empresa_key: "fashion_shoes", existencia: 671, costo_api: 0, precio_etiqueta: 0 }), // AJUSTE, real
      ],
      CUBIERTAS,
      AHORA,
    );
    expect(inv.totalCosto).toBe(50); // existencia × 0 = 0: el valor no se mueve
    expect(inv.sinCosto).toEqual({ articulos: 2, unidades: 719 });
  });

  it("la tabla ausente da `disponible:false`, NUNCA un $0", () => {
    const inv = inventarioNoDisponible(CUBIERTAS);
    expect(inv.disponible).toBe(false);
    expect(inv.porEmpresa).toEqual([]);
    // Los totales están en 0 pero la bandera es lo que la pantalla mira: un
    // inventario en cero y uno sin medir no se pueden ver igual.
    expect(inv.sinInventario.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la existencia NEGATIVA no vale plata", () => {
  it("una sobreventa no resta del valor ni de las piezas", () => {
    const inv = agregarInventario(
      [
        fila({ empresa_key: "vistana", existencia: 10, costo_api: 5, precio_etiqueta: 9 }),
        fila({ empresa_key: "vistana", existencia: -4, costo_api: 5, precio_etiqueta: 9 }),
      ],
      CUBIERTAS,
      AHORA,
    );
    expect(inv.totalCosto).toBe(50); // no 30
    expect(inv.totalUnidades).toBe(10); // no 6
    expect(inv.porEmpresa[0].unidadesNegativas).toBe(-4);
  });

  it("un artículo sin stock no cuenta como 'con stock'", () => {
    const e = agregarEmpresa("vistana", [
      fila({ empresa_key: "vistana", existencia: 0, costo_api: 5 }),
      fila({ empresa_key: "vistana", existencia: 3, costo_api: 5 }),
    ]);
    expect(e.articulos).toBe(2);
    expect(e.conStock).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la FRESCURA viaja siempre, y es la del dato MÁS VIEJO", () => {
  it("el sello del grupo es el mínimo, no el máximo", () => {
    const inv = agregarInventario(
      [
        fila({ empresa_key: "vistana", existencia: 1, costo_api: 1, synced_at: "2026-08-13T04:31:00.000Z" }),
        fila({ empresa_key: "joystep", existencia: 1, costo_api: 1, synced_at: "2026-08-01T04:51:00.000Z" }),
      ],
      CUBIERTAS,
      AHORA,
    );
    // Con el MAX diría "al 13 de agosto" con joystep parada hace 12 días.
    expect(inv.medidoEn).toBe("2026-08-01T04:51:00.000Z");
    expect(inv.viejo).toBe(true);
  });

  it("el dato de esta madrugada NO es viejo (si no, avisaría todos los días)", () => {
    // 04:31 UTC del mismo día contra las 18:00 = 13,5 h.
    const inv = agregarInventario(
      [fila({ empresa_key: "vistana", existencia: 1, costo_api: 1, synced_at: SYNC })],
      CUBIERTAS,
      AHORA,
    );
    expect(inv.horas).toBeGreaterThan(13);
    expect(inv.horas).toBeLessThan(14);
    expect(inv.viejo).toBe(false);
  });

  it("el umbral son 26 h: una corrida diaria perdida, no el reloj de las 24", () => {
    expect(HORAS_INVENTARIO_VIEJO).toBe(26);
    const justoAntes = agregarInventario(
      [fila({ empresa_key: "vistana", existencia: 1, costo_api: 1, synced_at: new Date(AHORA - 25.9 * 3_600_000).toISOString() })],
      CUBIERTAS, AHORA,
    );
    const justoDespues = agregarInventario(
      [fila({ empresa_key: "vistana", existencia: 1, costo_api: 1, synced_at: new Date(AHORA - 26.1 * 3_600_000).toISOString() })],
      CUBIERTAS, AHORA,
    );
    expect(justoAntes.viejo).toBe(false);
    expect(justoDespues.viejo).toBe(true);
  });

  it("sin sello NO se declara viejo: 'no pude medir' ≠ 'está viejo'", () => {
    const inv = agregarInventario(
      [fila({ empresa_key: "vistana", existencia: 1, costo_api: 1, synced_at: null })],
      CUBIERTAS,
      AHORA,
    );
    expect(inv.medidoEn).toBeNull();
    expect(inv.horas).toBeNull();
    expect(inv.viejo).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el total NO se puede contradecir con las filas que se muestran", () => {
  it("la suma de las filas da EXACTAMENTE el total, al centavo", () => {
    // Números elegidos para que el float acumule residuo: 3 × 0,145 y 7 × 0,335.
    const inv = agregarInventario(
      [
        fila({ empresa_key: "vistana", existencia: 3, costo_api: 0.145, precio_etiqueta: 0.2 }),
        fila({ empresa_key: "joystep", existencia: 7, costo_api: 0.335, precio_etiqueta: 0.4 }),
      ],
      CUBIERTAS,
      AHORA,
    );
    const sumaFilas = inv.porEmpresa.reduce((s, e) => s + e.costo, 0);
    expect(Math.round(sumaFilas * 100) / 100).toBe(inv.totalCosto);
  });

  it("las empresas salen de MAYOR a menor costo (la plata primero)", () => {
    const inv = agregarInventario(
      [
        fila({ empresa_key: "joystep", existencia: 1, costo_api: 10 }),
        fila({ empresa_key: "vistana", existencia: 1, costo_api: 999 }),
        fila({ empresa_key: "active_wear", existencia: 1, costo_api: 100 }),
      ],
      CUBIERTAS,
      AHORA,
    );
    expect(inv.porEmpresa.map((e) => e.key)).toEqual(["vistana", "active_wear", "joystep"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 EQUIVALENCIA CON POSTGRES.
//
// La RPC `inventario_valorizado_v1()` y el camino paginado tienen que dar el
// MISMO número — si no, el día que la migración corra los totales cambiarían
// solos y nadie sabría cuál creer. `agruparComoPostgres` ejecuta la semántica
// del SQL sobre las mismas filas y se exige igualdad campo por campo.
// ─────────────────────────────────────────────────────────────────────────────
function agruparComoPostgres(filas: readonly FilaArticuloInfo[]): InventarioEmpresa[] {
  const porKey = new Map<string, FilaArticuloInfo[]>();
  for (const f of filas) {
    const arr = porKey.get(f.empresa_key) ?? [];
    arr.push(f);
    porKey.set(f.empresa_key, arr);
  }
  return [...porKey.entries()].map(([key, fs]) => {
    // Las mismas cláusulas FILTER del .sql, una por una.
    const conStock = fs.filter((f) => (num(f.existencia) ?? 0) > 0);
    const sinCosto = conStock.filter((f) => {
      const c = num(f.costo_api);
      return c === null || c === 0;
    });
    const suma = (xs: FilaArticuloInfo[], g: (f: FilaArticuloInfo) => number) =>
      xs.reduce((s, f) => s + g(f), 0);
    const sellos = fs.map((f) => f.synced_at).filter((s): s is string => !!s).sort();
    return {
      key,
      name: "",
      articulos: fs.length,
      conStock: conStock.length,
      unidades: suma(conStock, (f) => num(f.existencia)!),
      costo:
        Math.round(
          suma(
            conStock.filter((f) => {
              const c = num(f.costo_api);
              return c !== null && c !== 0;
            }),
            (f) => num(f.existencia)! * num(f.costo_api)!,
          ) * 100,
        ) / 100,
      precio:
        Math.round(
          suma(
            conStock.filter((f) => num(f.precio_etiqueta) !== null),
            (f) => num(f.existencia)! * num(f.precio_etiqueta)!,
          ) * 100,
        ) / 100,
      sinCostoArticulos: sinCosto.length,
      sinCostoUnidades: suma(sinCosto, (f) => num(f.existencia)!),
      unidadesNegativas: suma(fs.filter((f) => (num(f.existencia) ?? 0) < 0), (f) => num(f.existencia)!),
      medidoEn: sellos[0] ?? null,
    } satisfies InventarioEmpresa;
  });
}

describe("🩸 la RPC y el camino paginado dan el MISMO número", () => {
  const MUESTRA: FilaArticuloInfo[] = [
    fila({ empresa_key: "vistana", existencia: 12, costo_api: 0, precio_etiqueta: 0 }), // real: 0203
    fila({ empresa_key: "vistana", existencia: 48, costo_api: 0, precio_etiqueta: 0 }), // real: TAZAS
    fila({ empresa_key: "vistana", existencia: 2, costo_api: 16.104, precio_etiqueta: 0 }),
    fila({ empresa_key: "vistana", existencia: -210, costo_api: 4, precio_etiqueta: 6 }),
    fila({ empresa_key: "vistana", existencia: 0, costo_api: 4, precio_etiqueta: 6 }),
    fila({ empresa_key: "fashion_shoes", existencia: 671, costo_api: 0, precio_etiqueta: 0 }), // real: AJUSTE
    fila({ empresa_key: "fashion_shoes", existencia: 7068, costo_api: 0.1, precio_etiqueta: 0 }),
    fila({ empresa_key: "joystep", existencia: 150, costo_api: 0.01, precio_etiqueta: 0, synced_at: "2026-08-13T04:51:36.207+00:00" }),
    fila({ empresa_key: "active_wear", existencia: 25, costo_api: 0, precio_etiqueta: 0 }),
    fila({ empresa_key: "confecciones_boston", existencia: 5, costo_api: 3, precio_etiqueta: 9 }),
  ];

  it("campo por campo, empresa por empresa", () => {
    const porTs = agregarInventario(MUESTRA, CUBIERTAS, AHORA);
    const porSql = armarInventario(agruparComoPostgres(MUESTRA), CUBIERTAS, AHORA);
    expect(porSql.totalCosto).toBe(porTs.totalCosto);
    expect(porSql.totalPrecio).toBe(porTs.totalPrecio);
    expect(porSql.totalUnidades).toBe(porTs.totalUnidades);
    expect(porSql.sinCosto).toEqual(porTs.sinCosto);
    expect(porSql.medidoEn).toBe(porTs.medidoEn);
    expect(porSql.porEmpresa.map((e) => ({ ...e, name: "" }))).toEqual(
      porTs.porEmpresa.map((e) => ({ ...e, name: "" })),
    );
  });

  it("el simulador NO es un sello de goma: una mutación del SQL lo rompe", () => {
    // Si el .sql se olvidara del `costo_api <> 0` en el filtro del valor, el
    // número no cambiaría (x0 = 0) — pero sí cambia si se olvida del `> 0` de
    // la existencia, que es la mutación cara.
    const conNegativas = agruparComoPostgres(MUESTRA).map((e) =>
      e.key === "vistana" ? { ...e, costo: e.costo + -210 * 4 } : e,
    );
    const mutado = armarInventario(conNegativas, CUBIERTAS, AHORA);
    expect(mutado.totalCosto).not.toBe(agregarInventario(MUESTRA, CUBIERTAS, AHORA).totalCosto);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el .sql dice lo mismo que el código", () => {
  const SQL = leer("supabase/migrations/20260813190000_inventario_valorizado.sql");

  it("sólo valoriza existencia > 0", () => {
    expect(SQL).toMatch(/FILTER \(WHERE i\.existencia > 0 AND i\.costo_api IS NOT NULL AND i\.costo_api <> 0\)/);
  });

  it("'sin costo' es NULL O CERO, no sólo NULL", () => {
    expect(SQL).toMatch(/i\.costo_api IS NULL OR i\.costo_api = 0/);
  });

  it("la frescura es MIN, nunca MAX", () => {
    expect(SQL).toContain("MIN(i.synced_at)");
    expect(SQL).not.toContain("MAX(i.synced_at)");
  });

  it("NO enumera empresas: la lista vive en el código, en un solo lado", () => {
    for (const k of ALL_EMPRESA_KEYS) expect(SQL).not.toContain(`'${k}'`);
  });

  it("es SOLO LECTURA — no escribe una sola tabla", () => {
    expect(SQL).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER TABLE)\b/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("num(): numeric de PostgREST llega como texto y no se puede perder", () => {
  it("acepta el texto que manda PostgREST", () => {
    expect(num("82997.0000")).toBe(82997);
    expect(num("16.104")).toBe(16.104);
  });
  it("nulo, vacío e ilegible son `null` — nunca 0", () => {
    expect(num(null)).toBeNull();
    expect(num("")).toBeNull();
    expect(num("abc")).toBeNull();
  });
});
