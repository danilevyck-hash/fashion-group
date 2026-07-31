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
// jsdom no ejecuta plpgsql: la regla se congela acá con una implementación de
// REFERENCIA en TS (fechas fijas, misma aritmética que el SQL) y con asserts
// sobre el texto de la migración. La verificación con números reales vive en
// el PR (simulación read-only contra producción).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

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
