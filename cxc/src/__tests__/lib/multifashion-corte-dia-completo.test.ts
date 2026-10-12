// ─────────────────────────────────────────────────────────────────────────────
// Multifashion: el mes en curso corta en el último día COMPLETO (Panamá) — y el
// card y la tabla usan LA MISMA definición.
//
// 🩸 EL BUG (31-jul-2026, medido contra switch_facturas al centavo):
// la tabla "Mes a mes vs 2025" decía "Jul d30" pero sumaba los movimientos de
// HOY día 31 (neto −177.88 por una NC de −300.73): 38,853.36 contra los
// 39,031.23 del card. Y las bases 2025 diferían: card 32,467.21 (días 1-30,
// mismo corte) vs tabla 33,544.16 (jul-2025 COMPLETO) → 20.2% vs 15.8%.
//
// LA CORRECTA ERA LA DEL CARD — pero acertaba POR ACCIDENTE: su corte era
// "último día con SUM(subtotal) > 0" y el 31-jul dio d30 solo porque el día 31
// neteaba negativo. La regla nueva es CALENDARIO, no datos.
//
// 🔴 LA REGLA DESDE EL 11-oct-2026 (Daniel: «sí, que la computadora también sume
// hoy»). El corte de la BASE no cambió: el detalle y la tabla siguen cortando en
// el último día completo. Lo que cambió es lo que se ESCRIBE, en el celular y
// en la computadora, con una sola cuenta (`mesConHoy`, `anioConHoy`):
//   · el NÚMERO del mes = días completos + la venta de hoy (el del año ya la
//     traía: su procedimiento no corta por día; ahora su mes en curso también);
//   · las TASAS (proyección, promedio diario, tickets, % contra el mes
//     anterior) siguen sobre días completos y lo dicen («al día 10»);
//   · el % contra el año pasado va hasta el mismo día y la MISMA HORA.
// Lo que el 31-jul se rompió sigue prohibido: dos cifras de la misma pantalla
// sobre cortes distintos sin decirlo. Última sección de este archivo.
//
// jsdom no ejecuta plpgsql: la regla se congela acá con una implementación de
// REFERENCIA en TS (fechas fijas, misma aritmética que el SQL) y con asserts
// sobre el texto de la migración. La verificación con números reales vive en
// el PR (simulación read-only contra producción).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { MULTIFASHION_SUMA_HOY_2026_10, anioConHoy, mesConHoy } from "@/lib/multifashion/celular";
import { comparativosDelMes } from "@/lib/multifashion/resumen-minimo";
import { filaAnio } from "@/lib/multifashion/fila-anio";
import { baseDesdeRatio, variacionPct } from "@/lib/variacion";

const MIG = "supabase/migrations/20260731120000_multifashion_corte_dia_completo.sql";
const sql = readFileSync(path.join(process.cwd(), MIG), "utf8");

// ── Implementación de REFERENCIA de la regla (espejo del SQL) ────────────────
// hoyPanama es un YYYY-MM-DD ya convertido a Panamá (UTC−5).
function corteMes(hoyPanama: string, year: number, mes: number): {
  esParcial: boolean;
  corte: string | null;         // último día que entra en la suma (o null)
  cortePrevio: string | null;   // mismo día, año anterior
} {
  const inicio = new Date(Date.UTC(year, mes - 1, 1));
  const finFull = new Date(Date.UTC(year, mes, 0));
  const hoy = new Date(`${hoyPanama}T00:00:00Z`);
  const esParcial = hoy >= inicio && hoy <= finFull;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (!esParcial) {
    const prevFin = new Date(Date.UTC(year - 1, mes, 0));
    return { esParcial, corte: iso(finFull), cortePrevio: iso(prevFin) };
  }
  const ayer = new Date(hoy.getTime() - 86400000);
  if (ayer < inicio) return { esParcial, corte: null, cortePrevio: null };
  const dias = Math.round((ayer.getTime() - inicio.getTime()) / 86400000);
  const prevInicio = new Date(Date.UTC(year - 1, mes - 1, 1));
  const prevFinFull = new Date(Date.UTC(year - 1, mes, 0));
  const prevCorte = new Date(prevInicio.getTime() + dias * 86400000);
  return {
    esParcial,
    corte: iso(ayer),
    cortePrevio: iso(prevCorte > prevFinFull ? prevFinFull : prevCorte),
  };
}

describe("🔴 la regla, con fechas fijas", () => {
  it("el 'hoy' a MITAD de mes corta en el día completo anterior — en los DOS años", () => {
    const r = corteMes("2026-07-15", 2026, 7);
    expect(r.esParcial).toBe(true);
    expect(r.corte).toBe("2026-07-14");
    expect(r.cortePrevio).toBe("2025-07-14");
  });

  it("el caso del bug: 31-jul → corta en d30, y la base 2025 también", () => {
    const r = corteMes("2026-07-31", 2026, 7);
    expect(r.corte).toBe("2026-07-30");
    expect(r.cortePrevio).toBe("2025-07-30");
  });

  it("el día 1 no tiene días completos: la fila del mes va vacía, no a medias", () => {
    const r = corteMes("2026-08-01", 2026, 8);
    expect(r.esParcial).toBe(true);
    expect(r.corte).toBeNull();
    expect(r.cortePrevio).toBeNull();
  });

  it("y ese mismo día 1, el mes ANTERIOR ya quedó cerrado y compara completo", () => {
    const r = corteMes("2026-08-01", 2026, 7);
    expect(r.esParcial).toBe(false);
    expect(r.corte).toBe("2026-07-31");
    expect(r.cortePrevio).toBe("2025-07-31");
  });

  it("un mes cerrado compara mes completo contra mes completo", () => {
    const r = corteMes("2026-07-31", 2026, 3);
    expect(r.esParcial).toBe(false);
    expect(r.corte).toBe("2026-03-31");
    expect(r.cortePrevio).toBe("2025-03-31");
  });

  it("feb bisiesto: el d29 de 2028 se compara contra el 28-feb, no contra el 1-mar", () => {
    const r = corteMes("2028-03-01", 2028, 3);
    expect(r.corte).toBeNull(); // día 1 de marzo: sin días completos
    const feb = corteMes("2028-02-29", 2028, 2); // hoy 29 → corta d28
    expect(feb.corte).toBe("2028-02-28");
    expect(feb.cortePrevio).toBe("2027-02-28");
  });
});

describe("el SQL implementa exactamente esa regla", () => {
  it("las DOS funciones cortan por multifashion_hoy_panama() — una sola fuente", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION multifashion_hoy_panama()");
    expect(sql).toContain("AT TIME ZONE 'America/Panama'");
    // v7 la usa vía v_hoy_pma; v2 la llama directo.
    expect(sql).toContain("v_hoy_pma date := multifashion_hoy_panama();");
    expect(sql.match(/multifashion_hoy_panama\(\)/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("la tabla (v7): el corte del mes en curso es hoy−1, NO MAX(fecha) con datos", () => {
    const v7 = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION multifashion_mensual_v7"),
      sql.indexOf("CREATE OR REPLACE FUNCTION multifashion_detalle_mensual_v2"),
    );
    expect(v7).toContain("THEN CASE WHEN v_hoy_pma - 1 >= mm.inicio THEN v_hoy_pma - 1 ELSE NULL END");
    // Sin las líneas de comentario: el comentario del SQL cuenta la historia
    // del bug y nombra MAX(fecha) legítimamente.
    const mesCorte = v7
      .slice(v7.indexOf("mes_corte AS ("), v7.indexOf("mes_resuelto AS ("))
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(mesCorte).not.toContain("MAX(fecha)");
  });

  it("el card (v2): el corte del mes en curso es calendario, no 'último día con ventas'", () => {
    const v2 = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION multifashion_detalle_mensual_v2"));
    expect(v2).toContain("GREATEST(LEAST(EXTRACT(DAY FROM multifashion_hoy_panama())::int - 1, v_dias_en_mes), 0)");
    // El HAVING que acertaba por accidente ya no decide el CORTE. Se mira solo
    // el bloque hasta v_dia_corte: los HAVING de más abajo (mejor/peor día y
    // heatmap, "solo días con ventas") son de otra cosa y son correctos.
    const bloqueCorte = v2.slice(0, v2.indexOf("v_dia_corte :="));
    expect(bloqueCorte).not.toContain("HAVING SUM(subtotal) > 0");
  });

  it("el año anterior corta en el MISMO día (same-period se conserva)", () => {
    expect(sql).toContain("LEAST(mc.prev_inicio + (mc.fecha_corte - mc.inicio), mc.prev_fin_full)");
    expect(sql).toContain("v_prev_mes_inicio + (v_dia_corte - 1)");
  });
});

describe("🔴 desde el 11-oct-2026: el número trae hoy, las tasas no, y el % va hasta la misma hora", () => {
  const leer = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
  // Medido el 11-oct-2026 a las 6:00 pm.
  const dias = 26616.22, prev = 14262, hoy = 2140.4, prevHoy = 1268.49;
  const ventaHoy = { fecha: "2026-10-11", hayVentas: true, ventas: hoy };
  const mesDe = (ventas: number, base: number | null, parcial = false) => ({
    mes: "x", ventas, tickets: ventas > 0 ? 1 : 0, ticketProm: 0,
    vs2025: base == null ? null : ventas / base - 1,
    ...(parcial ? { es_periodo_parcial: true, fecha_corte: "2026-10-10" } : {}),
  });
  const overview = {
    otro: "no se toca",
    retail: {
      ytdVentas: 100000 + dias + hoy, // el total del año YA trae hoy: la base no lo corta por día
      meses: [...Array.from({ length: 9 }, () => mesDe(100000 / 9, 90000 / 9)), mesDe(dias, prev, true), mesDe(0, null), mesDe(0, null)],
    },
  };

  it("prendido, y la computadora usa LA MISMA cuenta que el celular", () => {
    expect(MULTIFASHION_SUMA_HOY_2026_10).toBe(true);
    const minimo = leer("src/components/multifashion/ResumenMinimo.tsx");
    expect(minimo).toContain("const conHoy = mesConHoy({ ventas: totales.ventas, prev: data.yoy.ventas, ventaHoy, prevHoy });");
    expect(minimo).toContain("{fmtMoney(conHoy.numero)}");
    expect(leer("src/components/multifashion/celular/InicioCelular.tsx")).toContain("mesConHoy({ ventas: totales.ventas, prev: data.yoy.ventas, ventaHoy, prevHoy })");
    const vista = leer("src/components/multifashion/MultifashionResumenView.tsx");
    // Las mismas lecturas y las mismas caídas: una sola vez, para las dos pantallas.
    expect(vista.match(/ventaDeHoyParaElMes\(\{/g)).toHaveLength(1);
    expect(vista.match(/baseDeHoyAnioPasado\(\{/g)).toHaveLength(1);
    expect(vista).toContain("ventaHoy={MULTIFASHION_SUMA_HOY_2026_10 ? hoyDelMes : null}");
    expect(vista).toContain("anioConHoy(overview, year, ventaHoy, prevHoy)");
  });

  it("el número y el % del mes: $28,756.62 y ▲ 85 %, de los dos lados hasta la misma hora", () => {
    const m = mesConHoy({ ventas: dias, prev, ventaHoy: hoy, prevHoy });
    expect(m.numero).toBeCloseTo(28756.62, 2);
    expect(Math.round(variacionPct(m.ventasPct, m.prevPct)! * 100)).toBe(85);
    expect(Math.round(variacionPct(dias, prev)! * 100)).toBe(87); // sobre días completos
  });

  it("lo que sigue sobre días completos lo DICE: el % contra el mes anterior, y el del año pasado si no hubo misma hora", () => {
    const base = { ventas: dias, yoy: { ventas: prev, tiene_data: true }, mesAnterior: { ventas: 30000, tiene_data: true }, year: 2026, mes: 10 };
    // Sin la venta de hoy: el texto de siempre.
    expect(comparativosDelMes(base).texto).toBe("▲ +86.6% vs oct 2025 · ▼ −11.3% vs septiembre");
    const m = mesConHoy({ ventas: dias, prev, ventaHoy: hoy, prevHoy });
    expect(comparativosDelMes({ ...base, conHoy: { ...m, diaCorte: 10 } }).texto)
      .toBe("▲ +85.2% vs oct 2025 · ▼ −11.3% vs septiembre, al día 10");
    const sinHora = mesConHoy({ ventas: dias, prev, ventaHoy: hoy, prevHoy: null });
    expect(comparativosDelMes({ ...base, conHoy: { ...sinHora, diaCorte: 10 } }).texto)
      .toBe("▲ +86.6% vs oct 2025, al día 10 · ▼ −11.3% vs septiembre, al día 10");
    // Los tickets y el promedio de la tarjeta también lo dicen.
    expect(leer("src/components/multifashion/ResumenMinimo.tsx")).toContain("{conHoy.conHoy && ` · ${alDiaCompleto(data.dia_actual)}`}");
  });

  it("el año: el mes en curso suma hoy y queda hasta la misma hora; el total NO se suma otra vez", () => {
    // Antes: el año traía hoy y sus meses no → no sumaban lo mismo ($2,140.40 de diferencia).
    expect(overview.retail.ytdVentas - overview.retail.meses.reduce((s, m) => s + m.ventas, 0)).toBeCloseTo(hoy, 2);
    const o = anioConHoy(overview, 2026, ventaHoy, prevHoy);
    expect(o.retail.ytdVentas).toBe(overview.retail.ytdVentas);
    expect(o.retail.meses.reduce((s, m) => s + m.ventas, 0)).toBeCloseTo(o.retail.ytdVentas, 2);
    const oct = o.retail.meses[9];
    expect(oct.ventas).toBeCloseTo(28756.62, 2);
    expect(baseDesdeRatio(oct.ventas, oct.vs2025)).toBeCloseTo(prev + prevHoy, 2);
    // Ningún otro mes cambia, ni nada fuera de retail.
    expect(o.retail.meses.filter((m, i) => m !== overview.retail.meses[i])).toHaveLength(1);
    expect(o.otro).toBe("no se toca");
    // La fila «Año» de «Mes a mes» sale de esos mismos meses: total y Δ con hoy.
    const fila = filaAnio({
      totalAnio: o.retail.ytdVentas, prevYear: 2025,
      meses: o.retail.meses.filter((m) => m.ventas > 0).map((m) => ({ label: m.mes, v: m.ventas, vPrev: baseDesdeRatio(m.ventas, m.vs2025) })),
    });
    expect(fila.total).toBeCloseTo(128756.62, 2);
    expect(fila.totalPrev).toBeCloseTo(90000 + prev + prevHoy, 2);
  });

  it("las caídas: sin los DOS lados, otro día, o un año sin mes en curso → el año de siempre, el MISMO objeto", () => {
    expect(anioConHoy(overview, 2026, ventaHoy, null)).toBe(overview);
    expect(anioConHoy(overview, 2026, null, prevHoy)).toBe(overview);
    expect(anioConHoy(overview, 2026, { ...ventaHoy, hayVentas: false }, prevHoy)).toBe(overview);
    // «Hoy» no es el día que sigue al corte (medianoche, dato viejo): nunca se suma dos veces.
    expect(anioConHoy(overview, 2026, { ...ventaHoy, fecha: "2026-10-10" }, prevHoy)).toBe(overview);
    const cerrado = { retail: { ytdVentas: 5, meses: [mesDe(5, 4)] } };
    expect(anioConHoy(cerrado, 2025, ventaHoy, prevHoy)).toBe(cerrado);
  });

  it("la proyección y el promedio diario NO ven la venta de hoy", () => {
    const minimo = leer("src/components/multifashion/ResumenMinimo.tsx");
    expect(minimo).toContain("fmtMoney(totales.proyeccion_cierre as number)");
    expect(leer("src/components/multifashion/GraficaDelMes.tsx")).toContain("graficaDelMes({ dias, year, mes, esMesActual, diaActual, feriados })");
    // La proyección del año tampoco, ni su total: `anioConHoy` solo toca el renglón del mes en curso.
    expect(leer("src/lib/multifashion/celular.ts")).toContain("return { ...overview, retail: { ...overview.retail, meses } };");
  });
});
