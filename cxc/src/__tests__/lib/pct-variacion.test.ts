// La regla única del Δ% — el caso que la originó y sus bordes.
//
// Origen (27-jul-2026): Daniel vio "+363024750%" en el histórico de
// Multifashion. Mayo 2024 de la tienda vale $0,01 (13 facturas de prueba del
// arranque que se cancelan entre sí) y el guard era `prev > 0`, así que el
// centavo pasaba: (36.302,49 − 0,01) / 0,01 = 3.630.247,5.
//
// Los dos lados de este test importan lo mismo: que el centavo NO muestre
// porcentaje, y que un crecimiento grande de verdad SÍ se vea.

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// acs-resumen-diario abre el cliente de Supabase al importarse; acá solo
// interesan sus dos formateadores, que son puros.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
import {
  BASE_MIN_COMPARATIVO,
  baseComparable,
  variacionPct,
  variacionPctDesdeRatio,
  baseDesdeRatio,
  fmtVariacionPct,
  SIN_COMPARATIVO,
  SIN_DATO,
} from "@/lib/variacion";
import { cellDelta, isNaComparison, type CeldaBase } from "@/lib/ventas/celda";
import { formatDelta, formatDeltaRatio } from "@/lib/ventas/formatDelta";
import { fmtPct, fmtVariacion } from "@/lib/acs-resumen-diario";

// ─────────────────────────────────────────────────────────────────────────────
// El caso real de Daniel
// ─────────────────────────────────────────────────────────────────────────────

describe("el +363024750% de mayo 2025", () => {
  // Los números exactos de §37 de la certificación del 27-jul-2026.
  const VENTAS_MAY_2025 = 36_302.49;
  const VENTAS_MAY_2024 = 0.01;

  it("reproduce el orden de magnitud absurdo con la cuenta vieja", () => {
    const viejo = (VENTAS_MAY_2025 - VENTAS_MAY_2024) / VENTAS_MAY_2024;
    // Los 9 dígitos que Daniel vio en pantalla. El valor exacto depende del
    // centavo; lo que prueba el caso es la magnitud.
    expect(Math.round(viejo * 100)).toBeGreaterThan(300_000_000);
  });

  it("con la regla nueva no hay porcentaje: base de $0,01", () => {
    expect(variacionPct(VENTAS_MAY_2025, VENTAS_MAY_2024)).toBeNull();
  });

  it("la tarjeta del histórico de Multifashion pinta n/a, no un número", () => {
    // Es la cuenta literal de ComparativoInteranualCard: el ratio viene de la
    // RPC y la base del año previo se despeja de él.
    const pctRpc = (VENTAS_MAY_2025 - VENTAS_MAY_2024) / VENTAS_MAY_2024;
    const vPrev = baseDesdeRatio(VENTAS_MAY_2025, pctRpc);
    expect(vPrev).toBeCloseTo(0.01, 6); // el centavo se sigue MOSTRANDO
    expect(fmtVariacionPct(variacionPct(VENTAS_MAY_2025, vPrev), true, 1)).toBe(SIN_COMPARATIVO);
  });

  it("el heatmap de /ventas con 2025 pinta n/a en esa celda", () => {
    const celda: CeldaBase = {
      ventas: VENTAS_MAY_2025,
      ventasPrev: VENTAS_MAY_2024,
      utilidad: 9_000,
      utilidadPrev: 0,
    };
    expect(cellDelta(celda, "ventas")).toBeNull();
    expect(isNaComparison(celda, "ventas")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Base $0,01 / $0 / base chica pero REAL
// ─────────────────────────────────────────────────────────────────────────────

describe("bases que no sirven para comparar", () => {
  it("base de $0,01 → sin porcentaje", () => {
    expect(variacionPct(5_000, 0.01)).toBeNull();
  });

  it("base de $0 → sin porcentaje", () => {
    expect(variacionPct(5_000, 0)).toBeNull();
  });

  it("base negativa (una utilidad en rojo invertiría el signo) → sin porcentaje", () => {
    expect(variacionPct(5_000, -800)).toBeNull();
  });

  it("base ausente → sin porcentaje", () => {
    expect(variacionPct(5_000, null)).toBeNull();
    expect(variacionPct(5_000, undefined)).toBeNull();
  });

  it("valores no finitos no producen un porcentaje", () => {
    expect(variacionPct(Number.NaN, 1_000)).toBeNull();
    expect(variacionPct(1_000, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("crecimientos legítimos — NO se esconden", () => {
  it("$200 → $2.000 muestra +900%", () => {
    const r = variacionPct(2_000, 200);
    expect(r).not.toBeNull();
    expect(r! * 100).toBeCloseTo(900, 6);
    expect(fmtVariacionPct(r)).toBe("+900%");
  });

  it("justo en el umbral ($100 de base) SÍ se calcula", () => {
    expect(variacionPct(1_000, BASE_MIN_COMPARATIVO)).toBeCloseTo(9, 6);
    expect(baseComparable(BASE_MIN_COMPARATIVO)).toBe(true);
  });

  it("un centavo por debajo del umbral NO se calcula", () => {
    expect(variacionPct(1_000, BASE_MIN_COMPARATIVO - 0.01)).toBeNull();
    expect(baseComparable(BASE_MIN_COMPARATIVO - 0.01)).toBe(false);
  });

  it("una caída fuerte también se ve", () => {
    expect(variacionPct(150, 3_000)).toBeCloseTo(-0.95, 6);
  });

  it("el umbral mira la BASE, no la magnitud del resultado", () => {
    // Base holgada + salto enorme: es un dato real y tiene que verse.
    expect(variacionPct(1_000_000, 1_000)).toBeCloseTo(999, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Despejar la base desde un ratio ya calculado por una RPC
// ─────────────────────────────────────────────────────────────────────────────

describe("variacionPctDesdeRatio (callers sin la base a mano)", () => {
  it("un ratio que implica una base de centavos se descarta", () => {
    const pct = (36_302.49 - 0.01) / 0.01;
    expect(variacionPctDesdeRatio(36_302.49, pct)).toBeNull();
  });

  it("un ratio con base holgada se conserva TAL CUAL", () => {
    const pct = 0.42;
    expect(variacionPctDesdeRatio(14_200, pct)).toBe(pct);
  });

  it("−100% (la base cayó a cero) no revienta con una división por cero", () => {
    expect(baseDesdeRatio(0, -1)).toBeNull();
    expect(variacionPctDesdeRatio(0, -1)).toBeNull();
  });

  it("sin ratio no hay nada que validar", () => {
    expect(variacionPctDesdeRatio(9_000, null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Qué se muestra cuando no se puede calcular — UNA sola forma en toda la app
// ─────────────────────────────────────────────────────────────────────────────

describe("qué se pinta cuando no hay comparación", () => {
  it('con valor actual dice "n/a", nunca 0%', () => {
    expect(fmtVariacionPct(null, true)).toBe(SIN_COMPARATIVO);
    expect(fmtVariacionPct(null, true)).not.toContain("0");
  });

  it('sin valor actual dice "—" (no hay nada, distinto de "no comparable")', () => {
    expect(fmtVariacionPct(null, false)).toBe(SIN_DATO);
  });

  it("formatDeltaRatio y el heatmap dicen lo MISMO — no dos palabras distintas", () => {
    expect(formatDeltaRatio(null).displayValue).toBe(SIN_COMPARATIVO);
  });

  it("formatDelta aplica la regla de base mínima, no solo prev > 0", () => {
    expect(formatDelta(5_000, 0.01).displayValue).toBe(SIN_COMPARATIVO);
    expect(formatDelta(2_000, 200).displayValue).toBe("+900%");
  });

  it("un cero real sigue siendo 0%, no n/a", () => {
    expect(fmtVariacionPct(0)).toBe("+0%");
    expect(formatDeltaRatio(0).displayValue).toBe("+0%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Telegram — un % absurdo en un mensaje es igual de malo que en pantalla
// ─────────────────────────────────────────────────────────────────────────────

describe("resúmenes de Telegram", () => {
  it("base de centavos no manda un porcentaje al celular", () => {
    expect(fmtPct(36_302.49, 0.01, 1)).toBe("s/d año pasado");
    expect(fmtVariacion(36_302.49, 0.01, 1)).toBe("s/d año pasado");
  });

  it("base chica pero real sigue avisando el crecimiento", () => {
    expect(fmtVariacion(2_000, 200, 0)).toBe("▲ +900%");
    expect(fmtPct(2_000, 200, 1)).toBe("+900.0%");
  });

  it("base de $0 sigue diciendo s/d, como antes", () => {
    expect(fmtVariacion(500, 0, 0)).toBe("s/d año pasado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — nadie vuelve a escribir la división a mano en otro archivo
// ─────────────────────────────────────────────────────────────────────────────

const SRC = path.join(process.cwd(), "src");

/** Solo `src/lib/variacion.ts` puede escribir la cuenta. */
const PERMITIDOS = new Set([path.join("lib", "variacion.ts")]);

/**
 * Excepciones documentadas, con su motivo. NO se agrega nada acá sin una razón
 * escrita: cada entrada es un lugar donde la regla no aplica.
 */
const EXCEPCIONES = new Map<string, string>([
  [
    path.join("components", "ventas", "ResumenMesAnio.tsx"),
    "modo margen: la base es un RATIO (0,30), no dólares — el piso en dólares ya lo puso metricValue",
  ],
  [
    path.join("components", "ventas", "ClientesView.tsx"),
    "PENDIENTE, no resuelto: la fila 'Otros clientes' calcula el Δ a mano y ademas cae en 0 (no null) " +
      "cuando no hay base, o sea muestra '+0%' donde deberia decir n/a. Quedo fuera de este PR porque " +
      "Ventas -> Clientes lo esta tocando otro agente en paralelo y editarlo aca provocaria un conflicto. " +
      "Se cierra con una linea: variacionPct(sumYtd, sumPrev). Borrar esta excepcion al hacerlo.",
  ],
]);

function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      archivosFuente(full, acc);
    } else if (/\.tsx?$/.test(e.name)) {
      acc.push(full);
    }
  }
  return acc;
}

// `(a - b) / b` con el MISMO identificador de los dos lados: la firma exacta de
// una variación relativa escrita a mano. Tolera espacios, `.` y `?.`.
const DIVISION_A_MANO =
  /\(\s*([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*)\s*[-−]\s*([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*)\s*\)\s*\/\s*\2\b/;

// `cur / prev - 1`, la otra forma de escribir lo mismo.
const RATIO_MENOS_UNO =
  /\b([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*)\s*\/\s*([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*)\s*-\s*1\b/;

describe("la cuenta vive en UN solo lugar", () => {
  it("ningún archivo de src/ reescribe (actual − previo) / previo", () => {
    const infractores: string[] = [];

    for (const full of archivosFuente(SRC)) {
      const rel = path.relative(SRC, full);
      if (PERMITIDOS.has(rel) || EXCEPCIONES.has(rel)) continue;

      const lineas = fs.readFileSync(full, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        // Comentarios fuera: `//`, `/* */` de una línea y el cuerpo de un
        // JSDoc (líneas que arrancan con `*`). Sin esto, documentar la fórmula
        // en una prosa cuenta como escribirla.
        const t = linea.trim();
        if (t.startsWith("*") || t.startsWith("//")) return;
        const codigo = linea.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (DIVISION_A_MANO.test(codigo) || RATIO_MENOS_UNO.test(codigo)) {
          infractores.push(`${rel}:${i + 1} → ${linea.trim()}`);
        }
      });
    }

    expect(
      infractores,
      "Δ% escrito a mano. Usá variacionPct/variacionPctDesdeRatio de @/lib/variacion — " +
        "si el caso no aplica, agregalo a EXCEPCIONES con su motivo:\n" +
        infractores.join("\n"),
    ).toEqual([]);
  });

  it("el regex del candado detecta de verdad la forma prohibida", () => {
    // Verificación por mutación: si el patrón dejara de matchear, el test de
    // arriba pasaría siempre y no protegería nada.
    expect(DIVISION_A_MANO.test("const d = (cur - prev) / prev;")).toBe(true);
    expect(DIVISION_A_MANO.test("(k.ventasYTD - k.ventas2025YTD) / k.ventas2025YTD")).toBe(true);
    expect(DIVISION_A_MANO.test("return (a.ventas − a.ventas_prev) / a.ventas_prev")).toBe(true);
    expect(RATIO_MENOS_UNO.test("t0.total / t1.total - 1")).toBe(true);
    // Y que no sea un colador que marque cualquier división.
    expect(DIVISION_A_MANO.test("const margen = utilidad / ventas;")).toBe(false);
    expect(DIVISION_A_MANO.test("const x = (a - b) / c;")).toBe(false);
  });

  it("las excepciones tienen un motivo escrito", () => {
    for (const [archivo, motivo] of EXCEPCIONES) {
      expect(motivo.length, `${archivo} sin motivo`).toBeGreaterThan(20);
      expect(fs.existsSync(path.join(SRC, archivo)), `${archivo} ya no existe`).toBe(true);
    }
  });
});
