/**
 * CANDADO — LA LÍNEA «🎯 Meta» DEL RESUMEN DIARIO DE ACS (3-sep-2026).
 *
 * Daniel, textual: *«el mensaje de telegram igual que hoy en día solo que
 * diciéndome si están qué porcentaje arriba o abajo para la meta, pero tienes
 * que calcular bien cómo hacerlo para hacerlo accurate»* y, al confirmar la
 * cuenta: *«es calcular 23% arriba del mismo día año anterior sumando todos los
 * días pasados?»* → sí.
 *
 * Lo que se fija acá:
 *   1. La cuenta pura (`ritmoMeta`): factor = objetivo ÷ año pasado del rango
 *      completo; ritmo = año pasado hasta corte−1 año × factor; % = vendido ÷
 *      ritmo − 1. Arriba, abajo, exactamente en ritmo, sin meta, sin comparable.
 *   2. El mensaje completo: UNA línea al final y NADA MÁS cambia — con meta,
 *      sin meta y en el caso «⏳ aún sincronizando» (el corte de la meta es el
 *      mismo que el de Mes/Año).
 *   3. La lectura (`leerRitmoMeta`): el «vendido» arranca en `desde` (no en el
 *      1 del mes), suma `subtotal` retail (no `total`, no mayoreo), el 29-feb
 *      cae en el 28, sin meta vigente → null, y falla ABIERTO.
 *
 * Fixture REAL, medido contra producción el 3-sep-2026
 * (`scripts/_medir-meta-ritmo-telegram.ts`): meta «Viaje playa» 1-sep →
 * 31-dic-2026, $420.000 · vendido 1..3-sep $4.599,07 · sep–dic 2025
 * $340.698,55 · 1..3-sep-2025 $3.294,33 → factor 1,2328 · ritmo $4.061,12 ·
 * +13,25% → «▲ +13% arriba del ritmo». Es el número que Daniel ve esa noche.
 *
 * VERIFICADO POR MUTACIÓN (3-sep-2026, `scripts/_mutar-candados-meta-ritmo-telegram.sh`,
 * 22 mutaciones, 22 cazadas) — cada una pone algo de acá en rojo:
 *   - quitar el factor (ritmo = año pasado a secas)        → rojo (cuenta + lectura)
 *   - factor sobre lo transcurrido en vez del rango entero → rojo (cuenta)
 *   - sumar desde el 1 del mes en vez de `desde`           → rojo (lectura)
 *   - usar `total` en vez de `subtotal`                    → rojo (lectura)
 *   - incluir el mayoreo (`is_wholesale`)                  → rojo (lectura)
 *   - que la línea salga sin meta                          → rojo (mensaje)
 *   - año pasado hasta el rango completo, no hasta corte   → rojo (lectura)
 *   - `unAnioAntes` a pelo (29-feb → fecha inexistente)    → rojo (lectura)
 *   - que la meta use `fecha` y no `corte` con ⏳          → rojo (mensaje/lectura)
 *   - no filtrar activa / grupal / deleted / rango         → rojo (lectura)
 *   - fallar cerrado, 1 decimal, sin separador, antes del
 *     bloque «Año pasado», «abajo» rotulado «arriba»       → rojo
 *   (Equivalente, no cuenta: quitar `prevRango <= 0` — `variacionPct` ya
 *   devuelve null ante un ritmo infinito o negativo. Se deja como defensa.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Base simulada ────────────────────────────────────────────────────────────
// `multifashion_metas` con filtros aplicados de verdad (deleted/activa/tipo/
// rango), `_multifashion_sf_vw` con filas retail Y de mayoreo, y `rpc` que
// contesta "esa función no existe" para que la lectura caiga al camino
// paginado — el que se puede verificar fila por fila.

interface FilaVista {
  fecha: string;
  vendedor: string;
  subtotal: number;
  total: number;
  is_wholesale: boolean;
  n_sistema: string;
}

interface FilaMeta {
  id: string;
  nombre: string;
  desde: string;
  hasta: string;
  objetivo: number;
  tipo: string;
  activa: boolean;
  deleted: boolean;
  created_at: string;
}

const estado: {
  metas: FilaMeta[];
  vista: FilaVista[];
  fallarMetas: boolean;
  consultas: Array<{ tabla: string; filtros: Record<string, unknown> }>;
} = { metas: [], vista: [], fallarMetas: false, consultas: [] };

function aplicarFiltro(fila: Record<string, unknown>, k: string, val: unknown): boolean {
  const [op, col] = k.split(":");
  const v = fila[col];
  switch (op) {
    case "eq": return v === val;
    case "gte": return String(v) >= String(val);
    case "lte": return String(v) <= String(val);
    default: return true;
  }
}

function chain(tabla: string) {
  const f: Record<string, unknown> = {};
  estado.consultas.push({ tabla, filtros: f });
  const self: Record<string, unknown> = {};
  const set = (k: string) => (col?: unknown, val?: unknown) => {
    f[`${k}:${String(col)}`] = val;
    return self;
  };
  const resolver = () => {
    if (tabla === "multifashion_metas") {
      if (estado.fallarMetas) return { data: null, error: { message: "boom" }, count: null };
      const filas = estado.metas
        .filter((m) => Object.entries(f).every(([k, v]) => k.startsWith("select") || k.startsWith("order") || k.startsWith("limit") || aplicarFiltro(m as unknown as Record<string, unknown>, k, v)))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const orden = f["order:created_at"] as { ascending?: boolean } | undefined;
      if (orden && orden.ascending === false) filas.reverse();
      const lim = f["limit:undefined"];
      return { data: typeof lim === "number" ? filas.slice(0, lim) : filas, error: null, count: filas.length };
    }
    if (tabla === "_multifashion_sf_vw") {
      const filas = estado.vista
        .filter((r) => Object.entries(f).every(([k, v]) => k.startsWith("select") || k.startsWith("order") || k.startsWith("range") || aplicarFiltro(r as unknown as Record<string, unknown>, k, v)))
        .sort((a, b) => a.n_sistema.localeCompare(b.n_sistema));
      return { data: filas, error: null, count: filas.length };
    }
    // switch_sync_log u otra: sin filas.
    return { data: [], error: null, count: 0 };
  };
  Object.assign(self, {
    select: set("select"),
    eq: set("eq"),
    gte: set("gte"),
    lte: set("lte"),
    order: set("order"),
    limit: (n: number) => { f["limit:undefined"] = n; return self; },
    range: set("range"),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(res, rej),
  });
  return self;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => chain(tabla),
    // "Could not find the function" → esFuncionAusente → camino paginado.
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
  },
  HAS_SERVICE_ROLE: true,
}));

import { ritmoMeta } from "@/lib/multifashion/meta-ritmo";
import { leerRitmoMeta, leerMetaGrupalVigente } from "@/lib/multifashion/meta-ritmo-lectura";
import {
  buildMensaje,
  buildMensajeHtml,
  calcularResumenDiario,
  fmtLineaMeta,
  fmtVariacion,
  DECIMALES_META,
  type AcsResumenDiario,
} from "@/lib/acs-resumen-diario";

beforeEach(() => {
  estado.metas = [];
  estado.vista = [];
  estado.fallarMetas = false;
  estado.consultas = [];
});

// ── Fixture real del 3-sep-2026 ──────────────────────────────────────────────

const REAL = {
  objetivo: 420_000,
  vendido: 4599.07,
  ventaPrevRango: 340_698.55,
  ventaPrevHastaCorte: 3294.33,
};

const SEP = "━".repeat(18);

// Cifras reales del 24-jul-2026 (las mismas de acs-resumen-diario.test.ts).
const BASE: AcsResumenDiario = {
  fecha: "2026-07-24",
  corte: "2026-07-24",
  syncFresco: true,
  hoy: 1761.13,
  hoyPrev: 1494.27,
  fechaComparable: "2025-07-25",
  mes: 34278.19,
  mesPrev: 24682.78,
  anio: 298582.12,
  anioPrev: 263406.77,
};

const MENSAJE_BASE = [
  "🏪 ACS · viernes 24 jul",
  SEP,
  "Día    $1,761    ▲ +18%",
  "Mes    $34,278   ▲ +38.9%",
  "Año    $298,582  ▲ +13.4%",
  SEP,
  "Año pasado",
  "Día    $1,494    viernes 25 jul 2025",
  "Mes    $24,683   1 al 24 de julio 2025",
  "Año    $263,407  1 ene al 24 jul 2025",
].join("\n");

// ═════════════════════════════════════════════════════════════════════════════
// 1. La cuenta pura
// ═════════════════════════════════════════════════════════════════════════════

describe("ritmoMeta — factor × mismos días del año pasado", () => {
  it("3-sep-2026 real: factor 1,2328 · ritmo $4.061,12 · +13,25%", () => {
    const r = ritmoMeta(REAL);
    expect(r).not.toBeNull();
    expect(r!.factor).toBeCloseTo(1.2328, 4);
    expect(r!.ritmo).toBe(4061.12);
    expect(r!.vendido).toBe(4599.07);
    expect(r!.pct).toBeCloseTo(0.1325, 4);
  });

  it("el ritmo lleva el factor: NO es el año pasado a secas", () => {
    const r = ritmoMeta(REAL)!;
    // Sin factor el ritmo sería $3.294,33 y el % +39,6% (el mismo de la línea
    // Mes) — o sea, la línea no diría nada nuevo y estaría MAL.
    expect(r.ritmo).not.toBe(REAL.ventaPrevHastaCorte);
    expect(r.ritmo).toBe(Math.round(REAL.ventaPrevHastaCorte * (REAL.objetivo / REAL.ventaPrevRango) * 100) / 100);
    expect(r.pct).not.toBeCloseTo(0.396, 2);
  });

  it("el factor sale del rango COMPLETO, y el ritmo de lo transcurrido — no al revés", () => {
    // Si se dividiera por lo transcurrido, el factor sería 127× y el % absurdo.
    const r = ritmoMeta(REAL)!;
    expect(r.factor).toBeLessThan(2);
    expect(Math.abs(r.pct)).toBeLessThan(1);
  });

  it("abajo del ritmo: pct negativo", () => {
    const r = ritmoMeta({ ...REAL, vendido: 3900 })!;
    expect(r.pct).toBeLessThan(0);
    expect(r.pct).toBeCloseTo(3900 / 4061.12 - 1, 6);
  });

  it("exactamente en el ritmo: pct 0", () => {
    const r = ritmoMeta({ ...REAL, vendido: 4061.12 })!;
    expect(r.pct).toBe(0);
  });

  it("sin venta del año pasado en el rango completo (meta sin comparable) → null", () => {
    expect(ritmoMeta({ ...REAL, ventaPrevRango: 0 })).toBeNull();
    expect(ritmoMeta({ ...REAL, ventaPrevRango: -10 })).toBeNull();
  });

  it("primer día sin comparable (ritmo 0 con venta) → null, no un +∞%", () => {
    expect(ritmoMeta({ ...REAL, ventaPrevHastaCorte: 0 })).toBeNull();
  });

  it("ritmo por debajo de la base mínima comparable ($100) → null (misma regla que toda la app)", () => {
    expect(ritmoMeta({ ...REAL, ventaPrevHastaCorte: 50 })).toBeNull(); // ritmo ≈ $61,64
  });

  it("objetivo inválido → null", () => {
    expect(ritmoMeta({ ...REAL, objetivo: 0 })).toBeNull();
    expect(ritmoMeta({ ...REAL, objetivo: NaN })).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. La línea y el mensaje completo
// ═════════════════════════════════════════════════════════════════════════════

describe("fmtLineaMeta — la misma flecha y redondeo que Día/Mes/Año", () => {
  it("arriba: «🎯 Meta  ▲ +13% arriba del ritmo» (0 decimales, como el mockup)", () => {
    expect(DECIMALES_META).toBe(0);
    expect(fmtLineaMeta(ritmoMeta(REAL)!)).toBe("🎯 Meta  ▲ +13% arriba del ritmo");
  });

  it("abajo: «▼ -4% abajo del ritmo»", () => {
    const r = ritmoMeta({ ...REAL, vendido: 3900 })!; // −3,97%
    expect(fmtLineaMeta(r)).toBe("🎯 Meta  ▼ -4% abajo del ritmo");
  });

  it("en ritmo exacto: lo que decide fmtVariacion («= 0%»), sin flecha", () => {
    const r = ritmoMeta({ ...REAL, vendido: 4061.12 })!;
    expect(fmtLineaMeta(r)).toBe("🎯 Meta  = 0% en el ritmo");
    expect(fmtLineaMeta(r)).toContain(fmtVariacion(4061.12, 4061.12, 0));
  });

  it("la flecha se decide sobre el % redondeado (nunca «▲ +0%»)", () => {
    const r = ritmoMeta({ ...REAL, vendido: 4070 })!; // +0,22% → 0
    expect(fmtLineaMeta(r)).toBe("🎯 Meta  = 0% en el ritmo");
  });
});

describe("buildMensaje — UNA línea al final y nada más cambia", () => {
  it("con meta: el mensaje de siempre + separador + la línea, y nada más", () => {
    const msg = buildMensaje({ ...BASE, meta: ritmoMeta(REAL) });
    expect(msg).toBe(`${MENSAJE_BASE}\n${SEP}\n🎯 Meta  ▲ +13% arriba del ritmo`);
    expect(msg.split("\n").filter((l) => l === SEP)).toHaveLength(3);
  });

  it("sin meta (null o ausente): el mensaje es EXACTAMENTE el de antes", () => {
    expect(buildMensaje({ ...BASE, meta: null })).toBe(MENSAJE_BASE);
    expect(buildMensaje(BASE)).toBe(MENSAJE_BASE);
    expect(buildMensaje(BASE)).not.toContain("🎯");
    expect(buildMensaje(BASE)).not.toContain("ritmo");
  });

  it("abajo del ritmo", () => {
    const msg = buildMensaje({ ...BASE, meta: ritmoMeta({ ...REAL, vendido: 3900 }) });
    expect(msg.split("\n").at(-1)).toBe("🎯 Meta  ▼ -4% abajo del ritmo");
  });

  it("⏳ aún sincronizando: la línea también sale al final (mismo corte que Mes/Año)", () => {
    const msg = buildMensaje({
      ...BASE,
      syncFresco: false,
      corte: "2026-07-23",
      hoy: 0,
      hoyPrev: 0,
      mes: 32517.06,
      mesPrev: 23188.51,
      anio: 296820.99,
      anioPrev: 262057.72,
      meta: ritmoMeta(REAL),
    });
    expect(msg).toBe(
      [
        "🏪 ACS · viernes 24 jul",
        SEP,
        "⏳ Ventas del día aún sincronizando (al 23-jul)",
        "Mes    $32,517   ▲ +40.2%",
        "Año    $296,821  ▲ +13.3%",
        SEP,
        "Año pasado",
        "Mes    $23,189   1 al 23 de julio 2025",
        "Año    $262,058  1 ene al 23 jul 2025",
        SEP,
        "🎯 Meta  ▲ +13% arriba del ritmo",
      ].join("\n"),
    );
  });

  it("sin ningún comparable del año pasado pero con meta: bloque omitido, meta al final", () => {
    const msg = buildMensaje({ ...BASE, hoyPrev: 0, mesPrev: 0, anioPrev: 0, meta: ritmoMeta(REAL) });
    expect(msg).not.toContain("Año pasado");
    expect(msg.split("\n").at(-1)).toBe("🎯 Meta  ▲ +13% arriba del ritmo");
    expect(msg.split("\n").filter((l) => l === SEP)).toHaveLength(2);
  });

  it("el prefijo «(recuperado) » sigue en el título; la meta no lo mueve", () => {
    const msg = buildMensaje({ ...BASE, meta: ritmoMeta(REAL) }, "(recuperado) ");
    expect(msg.split("\n")[0]).toBe("(recuperado) 🏪 ACS · viernes 24 jul");
    expect(msg.split("\n").at(-1)).toBe("🎯 Meta  ▲ +13% arriba del ritmo");
  });

  it("va dentro del mismo <pre> (Telegram lo pinta monoespaciado, como el resto)", () => {
    const html = buildMensajeHtml({ ...BASE, meta: ritmoMeta(REAL) });
    expect(html.startsWith("<pre>")).toBe(true);
    expect(html.endsWith("arriba del ritmo</pre>")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. La lectura: de dónde sale cada número
// ═════════════════════════════════════════════════════════════════════════════

function doc(fecha: string, subtotal: number, extra: Partial<FilaVista> = {}): FilaVista {
  const n = `${fecha}-${String(estado.vista.length).padStart(4, "0")}`;
  return { fecha, vendedor: "JAILINE", subtotal, total: subtotal * 1.07, is_wholesale: false, n_sistema: n, ...extra };
}

/** Meta que ARRANCA a mitad de mes (20-ago) para distinguir `desde` del 1 del mes. */
const META_AGO: FilaMeta = {
  id: "m1",
  nombre: "Prueba",
  desde: "2026-08-20",
  hasta: "2026-12-31",
  objetivo: 12_000, // = 2× el año pasado del rango completo → factor 2
  tipo: "grupal",
  activa: true,
  deleted: false,
  created_at: "2026-08-14T06:22:20Z",
};

function cargarVentas() {
  estado.vista.push(
    // ── Año pasado (2025) ──
    doc("2025-08-10", 1000), //  ANTES de desde−1a: NO entra en nada
    doc("2025-08-20", 500), //  desde−1a
    doc("2025-08-31", 500), //  → hasta corte−1a (2025-09-03): 500+500+1000+200+300 = 2.500
    doc("2025-09-01", 1000),
    doc("2025-09-03", 300),
    doc("2025-09-02", 200),
    doc("2025-09-04", 400), //  DESPUÉS del corte−1a: solo entra al rango completo
    doc("2025-12-31", 3100), //  → rango completo 2025-08-20..2025-12-31 = 6.000
    doc("2026-01-01", 9999), //  fuera del rango completo
    // ── Este año (2026) ──
    doc("2026-08-19", 5000), //  ANTES de desde: NO entra
    doc("2026-08-25", 1200), //  entre desde y el 1 del mes: SÍ entra
    doc("2026-09-01", 2000),
    doc("2026-09-03", 800),
    doc("2026-09-02", -100), //  nota de crédito: RESTA
    doc("2026-09-04", 7000), //  después del corte: NO entra
    doc("2026-09-02", 9000, { is_wholesale: true }), // mayoreo: NO entra
  );
}
// vendido 2026-08-20..2026-09-03 = 1200 + 2000 + 800 − 100 = 3.900
// factor = 12.000 ÷ 6.000 = 2 · ritmo = 2.500 × 2 = 5.000 · % = 3.900/5.000 − 1 = −22%

describe("leerRitmoMeta — los números salen de donde tienen que salir", () => {
  it("vendido arranca en `desde` (no en el 1 del mes), suma subtotal retail con NC restando", async () => {
    estado.metas = [META_AGO];
    cargarVentas();
    const r = await leerRitmoMeta("2026-09-03");
    expect(r).not.toBeNull();
    expect(r!.vendido).toBe(3900);
    expect(r!.factor).toBe(2);
    expect(r!.ritmo).toBe(5000);
    expect(r!.pct).toBeCloseTo(-0.22, 6);
    expect(fmtLineaMeta(r!)).toBe("🎯 Meta  ▼ -22% abajo del ritmo");
  });

  it("si sumara desde el 1 del mes, el vendido sería 2.700 y no 3.900", async () => {
    estado.metas = [META_AGO];
    cargarVentas();
    const r = await leerRitmoMeta("2026-09-03");
    expect(r!.vendido).not.toBe(2700);
    // y las lecturas de la vista piden desde el `desde` de la meta:
    const rangos = estado.consultas
      .filter((c) => c.tabla === "_multifashion_sf_vw")
      .map((c) => `${c.filtros["gte:fecha"]}..${c.filtros["lte:fecha"]}`);
    expect(rangos).toContain("2026-08-20..2026-09-03");
    expect(rangos).toContain("2025-08-20..2025-12-31");
    expect(rangos).toContain("2025-08-20..2025-09-03");
    expect(rangos).not.toContain("2026-09-01..2026-09-03");
  });

  it("usar `total` (con ITBMS) o incluir el mayoreo cambia el número → se detecta", async () => {
    estado.metas = [META_AGO];
    cargarVentas();
    const r = await leerRitmoMeta("2026-09-03");
    expect(r!.vendido).toBe(3900);
    expect(r!.vendido).not.toBeCloseTo(3900 * 1.07, 0); // total
    expect(r!.vendido).not.toBe(12900); // + mayoreo
    for (const c of estado.consultas.filter((c) => c.tabla === "_multifashion_sf_vw")) {
      expect(c.filtros["eq:is_wholesale"]).toBe(false);
      const select = Object.keys(c.filtros).find((k) => k.startsWith("select:")) ?? "";
      expect(select).toMatch(/\bsubtotal\b/);
      expect(select.replace("subtotal", "")).not.toMatch(/\btotal\b/);
    }
  });

  it("sin factor, el ritmo sería 2.500 y diría +56% en vez de −22%", async () => {
    estado.metas = [META_AGO];
    cargarVentas();
    const r = await leerRitmoMeta("2026-09-03");
    expect(r!.ritmo).not.toBe(2500);
    expect(r!.pct).toBeLessThan(0);
  });

  it("el corte manda: con ⏳ (corte = ayer) el vendido y el ritmo se recortan JUNTOS", async () => {
    estado.metas = [META_AGO];
    cargarVentas();
    const r = await leerRitmoMeta("2026-09-02");
    // vendido 1200+2000−100 = 3.100 · prev hasta 2025-09-02 = 500+500+1000+200 = 2.200 × 2 = 4.400
    expect(r!.vendido).toBe(3100);
    expect(r!.ritmo).toBe(4400);
  });

  it("sin meta que cubra el corte → null (en enero desaparece sola)", async () => {
    cargarVentas();
    expect(await leerRitmoMeta("2026-09-03")).toBeNull();
    estado.metas = [META_AGO];
    expect(await leerRitmoMeta("2027-01-01")).toBeNull();
    expect(await leerRitmoMeta("2026-08-19")).toBeNull(); // un día antes de `desde`
  });

  it("solo la meta ACTIVA, GRUPAL y no borrada; con varias, la creada más reciente", async () => {
    estado.metas = [
      { ...META_AGO, id: "borrada", deleted: true, objetivo: 1 },
      { ...META_AGO, id: "inactiva", activa: false, objetivo: 2 },
      { ...META_AGO, id: "vendedora", tipo: "vendedora", objetivo: 3 },
      { ...META_AGO, id: "vieja", objetivo: 4, created_at: "2026-08-01T00:00:00Z" },
      { ...META_AGO, id: "nueva", objetivo: 5, created_at: "2026-08-20T00:00:00Z" },
    ];
    const m = await leerMetaGrupalVigente("2026-09-03");
    expect(m?.id).toBe("nueva");
    expect(m?.objetivo).toBe(5);
    const f = estado.consultas.find((c) => c.tabla === "multifashion_metas")!.filtros;
    expect(f["eq:deleted"]).toBe(false);
    expect(f["eq:activa"]).toBe(true);
    expect(f["eq:tipo"]).toBe("grupal");
    expect(f["lte:desde"]).toBe("2026-09-03");
    expect(f["gte:hasta"]).toBe("2026-09-03");
  });

  it("29-feb: el año pasado corta en el 28 (fecha que existe), no en un 29-feb inexistente", async () => {
    estado.metas = [{ ...META_AGO, desde: "2028-02-01", hasta: "2028-02-29" }];
    estado.vista.push(doc("2027-02-01", 1000), doc("2027-02-28", 1000), doc("2028-02-01", 2500));
    const r = await leerRitmoMeta("2028-02-29");
    const rangos = estado.consultas
      .filter((c) => c.tabla === "_multifashion_sf_vw")
      .map((c) => `${c.filtros["gte:fecha"]}..${c.filtros["lte:fecha"]}`);
    expect(rangos).toContain("2027-02-01..2027-02-28");
    expect(rangos).not.toContain("2027-02-01..2027-02-29");
    expect(r).not.toBeNull();
    expect(r!.factor).toBe(6); // 12.000 ÷ 2.000
  });

  it("meta sin comparable (año pasado en cero) → null", async () => {
    estado.metas = [META_AGO];
    estado.vista.push(doc("2026-09-01", 2000));
    expect(await leerRitmoMeta("2026-09-03")).toBeNull();
  });

  it("falla ABIERTO: si la base falla, null y el resumen sale sin la línea", async () => {
    estado.fallarMetas = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await leerRitmoMeta("2026-09-03")).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. De punta a punta: calcularResumenDiario → buildMensaje
// ═════════════════════════════════════════════════════════════════════════════

describe("calcularResumenDiario lleva la meta con el MISMO corte", () => {
  it("con meta vigente: la línea al final; sin meta: el mensaje de siempre", async () => {
    estado.metas = [META_AGO];
    cargarVentas();
    const con = await calcularResumenDiario("2026-09-03", true);
    expect(con.meta?.vendido).toBe(3900);
    expect(buildMensaje(con).split("\n").at(-1)).toBe("🎯 Meta  ▼ -22% abajo del ritmo");

    estado.metas = [];
    const sin = await calcularResumenDiario("2026-09-03", true);
    expect(sin.meta).toBeNull();
    expect(buildMensaje(sin)).not.toContain("🎯");
  });

  it("⏳ sin sync fresco: la meta se calcula al corte de AYER, igual que Mes/Año", async () => {
    estado.metas = [META_AGO];
    cargarVentas();
    const r = await calcularResumenDiario("2026-09-03", false);
    expect(r.corte).toBe("2026-09-02");
    expect(r.meta?.vendido).toBe(3100);
    expect(r.meta?.ritmo).toBe(4400);
    const msg = buildMensaje(r);
    expect(msg).toContain("⏳ Ventas del día aún sincronizando (al 2-sep");
    expect(msg.split("\n").at(-1)).toBe("🎯 Meta  ▼ -30% abajo del ritmo");
  });

  it("la meta rota no tumba el resumen", async () => {
    estado.fallarMetas = true;
    cargarVentas();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await calcularResumenDiario("2026-09-03", true);
    expect(r.meta).toBeNull();
    expect(r.mes).toBe(2700); // 2000 + 800 − 100 (retail, del 1 de sep)
    spy.mockRestore();
  });
});
