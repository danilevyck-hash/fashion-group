/**
 * LO QUE EL GUARD DEJÓ AFUERA, DICHO EN PANTALLA.
 *
 * 🩸 Por qué existe: el guard frena las cifras imposibles de Switch para que no
 * envenenen los totales, y hasta hoy lo hacía **en silencio**. Daniel, textual:
 * *"no debería de ser así, el sistema debe de mostrar la info tal cual"*.
 *
 * ⚠️ EL RIESGO DE ESTE MÓDULO NO ES DIBUJAR DE MÁS: es dibujar una línea que
 * NO diga qué documento ni de cuánto. Sin esos dos datos el aviso no sirve para
 * ir a corregirlo en Switch, que es lo único que se puede hacer con él.
 *
 * Los números son los REALES de producción (Boston, `155-000000129`,
 * $266.541.352,00 contra un tope de $2.000.000).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  textoDeRechazos,
  rechazosDeSwitch,
  type RechazoDeSwitch,
} from "@/lib/rechazos-de-switch";
import { campoSkip, GUARDS, type FamiliaMonto } from "@/lib/switch-api/monto-guard";

/** El documento real que originó todo esto. */
const BOSTON: RechazoDeSwitch = {
  familia: "cxc",
  empresaKey: "confecciones_boston",
  documento: "155-000000129",
  monto: 266_541_352,
  cuando: "2026-08-25T02:11:38.767495+00:00",
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. EL TEXTO — el que Daniel aprobó, carácter por carácter
// ─────────────────────────────────────────────────────────────────────────────

describe("la línea dice qué documento, de cuánto, y que está mal en Switch", () => {
  it("el caso REAL de Boston sale exactamente como se aprobó", () => {
    expect(textoDeRechazos([BOSTON])).toBe(
      "1 documento fuera de la cuenta: el 155-000000129 llega con $266,541,352.00. Está mal en Switch.",
    );
  });

  it("NUNCA se pierde el número del documento", () => {
    const t = textoDeRechazos([BOSTON])!;
    expect(t).toContain("155-000000129");
  });

  it("NUNCA se pierde el monto", () => {
    const t = textoDeRechazos([BOSTON])!;
    expect(t).toContain("266,541,352.00");
  });

  it("SIEMPRE dice que el problema está en Switch, no acá", () => {
    for (const familia of Object.keys(GUARDS) as FamiliaMonto[]) {
      const t = textoDeRechazos([{ ...BOSTON, familia }])!;
      expect(t, familia).toContain("Está mal en Switch.");
    }
  });

  it("es UNA sola línea, sin párrafos (Daniel: 'se vuelve tedioso')", () => {
    const t = textoDeRechazos([BOSTON])!;
    expect(t).not.toContain("\n");
    // Cabe en un renglón: nada de explicar qué es el guard ni qué se protegió.
    expect(t.length).toBeLessThan(140);
  });

  it("no explica el mecanismo — nada de umbrales, tablas ni 'guard'", () => {
    const t = textoDeRechazos([BOSTON])!.toLowerCase();
    for (const jerga of ["guard", "umbral", "tope", "switch_estadocuenta", "rechaz", "sync"]) {
      expect(t, jerga).not.toContain(jerga);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SI NO HAY NADA RECHAZADO, NO SE DIBUJA NADA
// ─────────────────────────────────────────────────────────────────────────────

describe("sin rechazos no se dibuja nada", () => {
  it("cero rechazos devuelve null, no un texto vacío ni un 'todo bien'", () => {
    expect(textoDeRechazos([])).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. VARIOS — se nombra el más grande y se cuenta el resto
// ─────────────────────────────────────────────────────────────────────────────

describe("con varios rechazos", () => {
  const otro: RechazoDeSwitch = { ...BOSTON, documento: "155-000000200", monto: 5_000_000 };

  it("nombra el MÁS GRANDE, no el primero que llegó", () => {
    const t = textoDeRechazos([otro, BOSTON])!;
    expect(t).toContain("el 155-000000129");
    expect(t).toContain("$266,541,352.00");
  });

  it("cuenta el resto sin listarlos", () => {
    expect(textoDeRechazos([otro, BOSTON])).toBe(
      "2 documentos fuera de la cuenta: el 155-000000129 llega con $266,541,352.00 y 1 más. Está mal en Switch.",
    );
  });

  it("con familias MEZCLADAS no dice 'documento' ni 'factura': dice 'datos'", () => {
    const t = textoDeRechazos([BOSTON, { ...otro, familia: "factura" }])!;
    expect(t).toContain("2 datos fuera de la cuenta");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. LAS PALABRAS DE CADA FAMILIA — plural y género
// ─────────────────────────────────────────────────────────────────────────────

describe("cada familia se nombra con las palabras del negocio", () => {
  it.each([
    ["cxc", "1 documento fuera de la cuenta: el "],
    ["factura", "1 factura fuera de la cuenta: la "],
    ["utilidad", "1 factura fuera de la cuenta: la "],
    ["recibo", "1 cobro fuera de la cuenta: el "],
    ["proveedor", "1 proveedor fuera de la cuenta: el "],
    ["producto", "1 producto fuera del catálogo: el "],
    ["costo_diario", "1 día fuera de la cuenta: el "],
    ["articulo_diario", "1 artículo fuera de la cuenta: el "],
    ["articulo_info", "1 artículo fuera de la cuenta: el "],
    ["egreso_vario", "1 egreso fuera de la cuenta: el "],
  ] as Array<[FamiliaMonto, string]>)("%s", (familia, prefijo) => {
    expect(textoDeRechazos([{ ...BOSTON, familia }])!).toContain(prefijo);
  });

  it("ninguna familia se queda sin palabras (un nombre nuevo rompe el build)", () => {
    for (const familia of Object.keys(GUARDS) as FamiliaMonto[]) {
      const t = textoDeRechazos([{ ...BOSTON, familia }]);
      expect(t, familia).toBeTruthy();
      expect(t!, familia).not.toContain("undefined");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. LA LECTURA — cómo se saca el documento y el monto de `skip_details`
// ─────────────────────────────────────────────────────────────────────────────

/** Doble de PostgREST, con la cadena que usa el módulo. */
function baseFalsa(filas: unknown[], error: unknown = null) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "gte", "in", "order"]) {
    q[m] = vi.fn(() => q);
  }
  q.limit = vi.fn(async () => ({ data: error ? null : filas, error }));
  return { from: vi.fn(() => q), _q: q };
}

function mockSupabase(db: { from: unknown }) {
  vi.doMock("@/lib/supabase-server", () => ({ supabaseServer: db }));
}

/** Una fila de log tal como la deja `detallesDeRechazo`. */
function filaLog(over: Partial<Record<string, unknown>> = {}) {
  return {
    empresa_key: "confecciones_boston",
    started_at: "2026-08-25T02:11:38.767495+00:00",
    skip_details: [
      {
        facturaId: null,
        secuencial: "155-000000129 · EL MACHETAZO",
        campo: campoSkip("cxc"),
        valorCrudo: {
          umbral: 2_000_000,
          columnas: [
            { columna: "total", valor: 266_541_352 },
            { columna: "saldo", valor: 25.15 },
          ],
        },
      },
    ],
    ...over,
  };
}

describe("leer los rechazos del log", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock("@/lib/supabase-server"));

  async function leer(filas: unknown[], error: unknown = null) {
    const db = baseFalsa(filas, error);
    mockSupabase(db);
    const { rechazosDeSwitch: leerReal } = await import("@/lib/rechazos-de-switch");
    const out = await leerReal({ familias: ["cxc"] });
    return { out, db };
  }

  it("saca el DOCUMENTO de la clave, sin el nombre del cliente pegado", async () => {
    const { out } = await leer([filaLog()]);
    expect(out).toHaveLength(1);
    expect(out[0].documento).toBe("155-000000129");
  });

  it("saca el monto MÁS GRANDE de la fila, no el primero", async () => {
    // 🩸 El orden importa: acá el imposible va SEGUNDO. Con el fixture al
    // revés, "el primero" y "el mayor" coinciden y el test no discrimina.
    const { out } = await leer([
      filaLog({
        skip_details: [
          {
            secuencial: "155-000000129 · EL MACHETAZO",
            campo: campoSkip("cxc"),
            valorCrudo: {
              umbral: 2_000_000,
              columnas: [
                { columna: "saldo", valor: 25.15 },
                { columna: "total", valor: 266_541_352 },
              ],
            },
          },
        ],
      }),
    ]);
    expect(out[0].monto).toBe(266_541_352);
  });

  it("el mayor se mide por MAGNITUD: una nota de crédito imposible es negativa", async () => {
    const { out } = await leer([
      filaLog({
        skip_details: [
          {
            secuencial: "155-000000129 · X",
            campo: campoSkip("cxc"),
            valorCrudo: {
              umbral: 2_000_000,
              columnas: [
                { columna: "saldo", valor: 25.15 },
                { columna: "total", valor: -266_541_352 },
              ],
            },
          },
        ],
      }),
    ]);
    expect(out[0].monto).toBe(-266_541_352);
  });

  it("ignora los skips que NO son del guard de montos", async () => {
    const { out } = await leer([
      filaLog({
        skip_details: [
          { secuencial: "155-000000129", campo: "plazo_credito_fuera_de_rango", valorCrudo: "9999" },
          { secuencial: null, campo: "catalogo_escrituras", valorCrudo: { comparados: 455 } },
        ],
      }),
    ]);
    expect(out).toEqual([]);
  });

  it("ignora una familia que la pantalla no pidió", async () => {
    const { out } = await leer([
      filaLog({
        skip_details: [
          { secuencial: "11-000000142", campo: campoSkip("factura"), valorCrudo: { columnas: [{ columna: "total", valor: 9e9 }] } },
        ],
      }),
    ]);
    expect(out).toEqual([]);
  });

  it("el MISMO documento en dos corridas se cuenta UNA vez (la más reciente)", async () => {
    const vieja = filaLog({ started_at: "2026-08-19T08:10:41.939310+00:00" });
    const { out } = await leer([filaLog(), vieja]);
    expect(out).toHaveLength(1);
    expect(out[0].cuando).toBe("2026-08-25T02:11:38.767495+00:00");
  });

  it("una fila con `skip_details` NULL no revienta y no inventa nada", async () => {
    const { out } = await leer([filaLog({ skip_details: null })]);
    expect(out).toEqual([]);
  });

  it("una fila SIN monto legible se descarta — media línea no sirve", async () => {
    const { out } = await leer([
      filaLog({
        skip_details: [{ secuencial: "155-000000129 · X", campo: campoSkip("cxc"), valorCrudo: null }],
      }),
    ]);
    expect(out).toEqual([]);
  });

  it("FALLA ABIERTO AL SILENCIO: un error de PostgREST no dibuja nada", async () => {
    const { out } = await leer([], { message: "boom" });
    expect(out).toEqual([]);
  });

  it("FALLA ABIERTO AL SILENCIO: si la consulta REVIENTA, tampoco tumba la pantalla", async () => {
    // 🩸 Es un camino DISTINTO del error de PostgREST: acá la promesa rechaza
    // (base caída, red cortada) y lo único que puede salvarlo es el try/catch.
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gt", "gte", "in", "order"]) q[m] = vi.fn(() => q);
    q.limit = vi.fn(async () => {
      throw new Error("la base no responde");
    });
    mockSupabase({ from: vi.fn(() => q) });
    const { rechazosDeSwitch: leerReal } = await import("@/lib/rechazos-de-switch");
    await expect(leerReal({ familias: ["cxc"] })).resolves.toEqual([]);
  });

  it("solo mira corridas EXITOSAS y con algo rechazado", async () => {
    const { db } = await leer([filaLog()]);
    expect(db._q.eq).toHaveBeenCalledWith("status", "success");
    expect(db._q.gt).toHaveBeenCalledWith("records_skipped", 0);
  });

  it("acota por sync_type — no barre el log entero", async () => {
    const { db } = await leer([filaLog()]);
    expect(db._q.in).toHaveBeenCalledWith("sync_type", ["estadocuenta"]);
  });

  it("la consulta va ACOTADA (ventana + tope de filas): compute Micro", async () => {
    const { db } = await leer([filaLog()]);
    expect(db._q.gte).toHaveBeenCalledWith("started_at", expect.any(String));
    expect(db._q.limit).toHaveBeenCalled();
  });

  it("sin familias no consulta nada", async () => {
    const db = baseFalsa([]);
    mockSupabase(db);
    const { rechazosDeSwitch: leerReal } = await import("@/lib/rechazos-de-switch");
    expect(await leerReal({ familias: [] })).toEqual([]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("`empresas` acota la consulta cuando la pantalla es de UNA empresa", async () => {
    const db = baseFalsa([filaLog()]);
    mockSupabase(db);
    const { rechazosDeSwitch: leerReal } = await import("@/lib/rechazos-de-switch");
    await leerReal({ familias: ["cxc"], empresas: ["confecciones_boston"] });
    expect(db._q.in).toHaveBeenCalledWith("empresa_key", ["confecciones_boston"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. EL CAMINO COMPLETO — del log a la línea
// ─────────────────────────────────────────────────────────────────────────────

describe("de la fila del log a la línea de la pantalla", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock("@/lib/supabase-server"));

  it("la pestaña de Boston termina diciendo exactamente lo que Daniel aprobó", async () => {
    mockSupabase(baseFalsa([filaLog()]));
    const { lineaDeRechazos } = await import("@/lib/rechazos-de-switch");
    expect(await lineaDeRechazos({ familias: ["cxc"], empresas: ["confecciones_boston"] })).toBe(
      "1 documento fuera de la cuenta: el 155-000000129 llega con $266,541,352.00. Está mal en Switch.",
    );
  });

  it("sin nada rechazado devuelve null y la pantalla no dibuja la línea", async () => {
    mockSupabase(baseFalsa([]));
    const { lineaDeRechazos } = await import("@/lib/rechazos-de-switch");
    expect(await lineaDeRechazos({ familias: ["cxc"] })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. EL MÓDULO ES ÚNICO — nadie escribe el mensaje por su cuenta
// ─────────────────────────────────────────────────────────────────────────────

describe("una sola redacción para todas las pantallas", () => {
  it("`textoDeRechazos` es puro: no toca la base ni pide nada", () => {
    // Si necesitara I/O no podría llamarse dos veces y dar lo mismo.
    expect(textoDeRechazos([BOSTON])).toBe(textoDeRechazos([BOSTON]));
  });

  it("`rechazosDeSwitch` está exportada para que las pantallas no consulten el log a mano", () => {
    expect(typeof rechazosDeSwitch).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. 🔴 BOSTON NO SE MEZCLA CON EL GRUPO — ni por este costado
// ─────────────────────────────────────────────────────────────────────────────

describe("las dos carteras piden su aviso por separado", () => {
  /** Sin comentarios: un candado que se cumple con su propia explicación da permiso para romper. */
  function fuente(rel: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    return readFileSync(join(process.cwd(), rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  const RUTAS = [
    ["src/app/api/cxc/boston/route.ts", "empresasCarteraAparte()"],
    ["src/app/api/cxc/aging/route.ts", "CXC_GRUPO_EMPRESA_KEYS"],
  ] as const;

  it.each(RUTAS)("%s acota el aviso por empresa", (rel, lista) => {
    const t = fuente(rel);
    const llamada = t.slice(t.indexOf("lineaDeRechazos("));
    expect(llamada, `${rel} no pide el aviso`).toContain("lineaDeRechazos(");
    const cuerpo = llamada.slice(0, llamada.indexOf("});") + 3);
    expect(cuerpo, `${rel} pide el aviso SIN acotar la empresa`).toContain("empresas:");
    expect(cuerpo, `${rel} acota con otra lista`).toContain(lista);
  });

  it.each(RUTAS)("%s devuelve el aviso en el JSON (no lo calcula y lo tira)", (rel) => {
    const t = fuente(rel);
    // El campo tiene que estar DENTRO de un NextResponse.json, no solo declarado.
    const respuestas = t.match(/NextResponse\.json\(\{[\s\S]*?\}\)/g) ?? [];
    expect(respuestas.some((r) => /\bavisoMontos\b/.test(r)), `${rel} calcula el aviso y no lo manda`).toBe(true);
  });
});
