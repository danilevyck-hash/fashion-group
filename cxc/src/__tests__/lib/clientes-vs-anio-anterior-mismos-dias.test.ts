// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — Ventas › Clientes: «vs 2025» compara contra los MISMOS DÍAS
//
// 🩸 EL DEFECTO (medido el 2-sep-2026, D-108 Multi Fashion Holding, «Todas»):
// la pantalla decía $238.486 · +3%. `clientes_empresa_12m_vw` sumaba 2026 del
// 1-ene al 2-sep y 2025 del 1-ene al **30-sep** — el año anterior se cortaba
// por MES (`mes <= max_mes`), o sea hasta FIN del mes en curso. Ocho meses y
// dos días contra nueve. Los mismos días de 2025 dan $174.821 → **+36%**.
// Sobre los 115 clientes del ranking: 37 cambiaban de número y 6 de signo.
//
// LA REGLA ya existía en la casa y esta vista no la cumplía: «un mes empezado
// se compara contra los MISMOS DÍAS del año pasado» (Multifashion,
// `docs/postmortems/multifashion.md`; el resumen diario de ACS —cuya línea
// «Mes» del día 1 se revisó el 2-sep y se dejó: calendario contra calendario—;
// y Ventas › Productos con `unAnioAntes`).
//
// jsdom no ejecuta plpgsql: la regla se fija con su espejo en TS
// (`corteVsAnioAnterior`, fechas FIJAS, nunca `new Date()`) y con asserts
// sobre el texto EJECUTABLE de la migración. Los números reales viven en
// `scripts/_diag-clientes-vs-2025-mismos-dias.ts` (solo lectura).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { corteVsAnioAnterior } from "@/lib/ventas/clientes-corte-comparativo";

const MIGRACIONES = path.join(process.cwd(), "supabase/migrations");
const VIGENTE = "20260909120000_clientes_vs_anio_anterior_mismos_dias.sql";
const ANTERIOR = "20260908120000_mostrador_por_codigo.sql";

const leer = (f: string) => fs.readFileSync(path.join(MIGRACIONES, f), "utf8");
/** Solo el SQL que corre: los comentarios citan el criterio viejo a propósito. */
const ejecutable = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const sql = ejecutable(leer(VIGENTE));
const mv = sql.slice(sql.indexOf("CREATE MATERIALIZED VIEW clientes_empresa_12m_vw"), sql.indexOf("CREATE VIEW clientes_agregado_12m_vw"));
const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION clientes_anio"));

describe("🔴 la regla, con fechas fijas (espejo del SQL)", () => {
  // Las horas son UTC. Panamá es UTC−5 fijo: 07:35Z = 02:35 Panamá (la hora del
  // refresh nocturno), 02:00Z = 21:00 Panamá del día ANTERIOR.

  it("a mitad de mes: el 2-sep el año anterior corta el 2-sep, no el 30", () => {
    const r = corteVsAnioAnterior("2026-09-02", new Date("2026-09-02T17:00:00Z"));
    expect(r).toEqual({ corte: "2026-09-02", cortePrev: "2025-09-02" });
    expect(r.cortePrev).not.toBe("2025-09-30");
  });

  it("el día 1 a las 02:35 de Panamá: lo cargado llega hasta ayer, y el año pasado también", () => {
    // Refresh nocturno del 1-sep: todavía no hay ninguna factura de septiembre.
    // El criterio viejo daba agosto entero (max_mes = 8) y con la PRIMERA
    // factura del mes saltaba a «hasta el 30-sep». Ahora: 31-ago contra 31-ago.
    const r = corteVsAnioAnterior("2026-08-31", new Date("2026-09-01T07:35:00Z"));
    expect(r).toEqual({ corte: "2026-08-31", cortePrev: "2025-08-31" });
  });

  it("el día 1 con la primera factura del mes cargada: 1-sep contra 1-sep, no contra el 30", () => {
    const r = corteVsAnioAnterior("2026-09-01", new Date("2026-09-01T15:00:00Z"));
    expect(r).toEqual({ corte: "2026-09-01", cortePrev: "2025-09-01" });
  });

  it("el 29 de febrero cae en el 28 del año anterior", () => {
    const r = corteVsAnioAnterior("2028-02-29", new Date("2028-02-29T12:00:00Z"));
    expect(r).toEqual({ corte: "2028-02-29", cortePrev: "2027-02-28" });
  });

  it("HOY es el de PANAMÁ: a las 21:00 de Panamá el reloj UTC ya está en mañana", () => {
    // 2026-09-03T02:00Z = 2-sep 21:00 Panamá. Una factura fechada «3-sep» sería
    // futura y no puede correr el corte: se topa en el hoy de Panamá.
    const r = corteVsAnioAnterior("2026-09-03", new Date("2026-09-03T02:00:00Z"));
    expect(r).toEqual({ corte: "2026-09-02", cortePrev: "2025-09-02" });
  });

  it("si el sync se atrasó, las dos ventanas se acortan JUNTAS", () => {
    const r = corteVsAnioAnterior("2026-09-01", new Date("2026-09-03T17:00:00Z"));
    expect(r).toEqual({ corte: "2026-09-01", cortePrev: "2025-09-01" });
  });

  it("sin ventas cargadas del año todavía, el corte es hoy", () => {
    expect(corteVsAnioAnterior(null, new Date("2027-01-02T12:00:00Z"))).toEqual({ corte: "2027-01-02", cortePrev: "2026-01-02" });
  });
});

describe("🔴 el SQL vigente corta el año anterior por DÍA, en las DOS ramas", () => {
  it("la vista del año en curso ya no tiene `max_mes` ni `mes <=`", () => {
    expect(mv).not.toContain("max_mes");
    expect(mv).not.toMatch(/\bmes\s*<=/);
    expect(mv).toContain("k.anio = cy.y - 1 AND k.fecha <= cp.d");
  });

  it("la función de años cerrados dice lo mismo, palabra por palabra", () => {
    expect(fn).not.toContain("v_max_mes");
    expect(fn).not.toMatch(/\bmes\s*<=/);
    expect(fn).toContain("k.anio = p_year - 1 AND k.fecha <= v_corte_prev");
    // Año cerrado: 31-dic, sin caso especial.
    expect(fn).toContain("v_corte := make_date(p_year, 12, 31)");
  });

  it("el corte es el último día CARGADO del año en curso, topado en HOY", () => {
    expect(mv).toContain("LEAST(COALESCE(MAX(k.fecha), h.d), h.d) AS d");
    expect(fn).toContain("LEAST(COALESCE(MAX((fecha AT TIME ZONE 'America/Panama')::date), v_hoy), v_hoy)");
  });

  it("la misma fecha un año antes con INTERVAL '1 year' — el 29-feb cae en el 28", () => {
    // `make_date(año − 1, mes, día)` revienta el 29-feb; el intervalo recorta al
    // último día del mes, igual que `unAnioAntes` en la app.
    expect(mv).toContain("(c.d - INTERVAL '1 year')::date AS d");
    expect(fn).toContain("v_corte_prev := (v_corte - INTERVAL '1 year')::date");
    expect(sql).not.toMatch(/make_date\([^)]*EXTRACT\(DAY/);
  });

  it("HOY es el día de PANAMÁ y de él salen el año, el piso de 12 meses y el corte", () => {
    expect(mv).toContain("SELECT (NOW() AT TIME ZONE 'America/Panama')::date AS d");
    expect(mv).toContain("SELECT EXTRACT(YEAR FROM h.d)::int AS y FROM hoy h");
    expect(mv).toContain("date_trunc('month', h.d::timestamp)");
    expect(fn).toContain("v_hoy      := (NOW() AT TIME ZONE 'America/Panama')::date");
    expect(fn).toContain("v_year_now := EXTRACT(YEAR FROM v_hoy)::int");
    // `CURRENT_DATE` es UTC: entre las 7 p.m. y la medianoche de Panamá ya es mañana.
    expect(sql).not.toContain("CURRENT_DATE");
    expect(sql).not.toContain("date_trunc('month', NOW())");
  });

  it("«Compras <año>» NO se toca: sigue siendo todo lo cargado del año", () => {
    expect(mv).toMatch(/WHERE k\.anio = cy\.y\n/);
    expect(fn).toMatch(/WHERE k\.anio = p_year\n/);
  });

  it("el año anterior se lee por rango de fechas, no con EXTRACT(YEAR …)", () => {
    // `switch_facturas` es la tabla grande; EXTRACT la tira a seq scan.
    const corteFn = fn.slice(fn.indexOf("IF p_year = v_year_now THEN"), fn.indexOf("ELSE"));
    expect(corteFn).not.toMatch(/EXTRACT\(YEAR FROM \(fecha/);
    expect(corteFn).toContain("fecha >= (make_date(p_year, 1, 1)::timestamp AT TIME ZONE 'America/Panama')");
    expect(corteFn).toContain("fecha <  (make_date(p_year + 1, 1, 1)::timestamp AT TIME ZONE 'America/Panama')");
  });
});

describe("lo que la migración anterior hacía queda como foto, no como regla", () => {
  it("20260908120000 cortaba el año anterior por MES — es lo que costó el +3%", () => {
    // 🩸 Esta migración es historia y se lee tal cual quedó: ahí está escrito
    // el criterio que hacía que un cliente que crecía +36% se viera +3%.
    const vieja = ejecutable(leer(ANTERIOR));
    expect(vieja).toContain("WHERE k.anio = cy.y - 1 AND k.mes <= mm.m");
    expect(vieja).toContain("WHERE k.anio = p_year - 1 AND k.mes <= v_max_mes");
  });

  it("todo lo demás de 20260908120000 sigue igual: el mostrador por código, el puente, los totales", () => {
    const filtros = [...sql.matchAll(/filtered AS \(([\s\S]*?)\n\s*\),/g)].map((m) => m[1]);
    expect(filtros.length, "las dos ramas del ranking").toBe(2);
    for (const f of filtros) expect(f).toMatch(/del_grupo\s+AND\s+\S*cliente_codigo\s*=\s*'TCKCTA'/);
    expect(sql).toContain("SELECT *, true  AS del_grupo FROM src_a");
    expect(sql).toContain("SELECT *, false AS del_grupo FROM src_b");
    for (const fuente of ["ventas_dashboard_summary", "ventas_rollup_mensual_mv", "comision_b2b_v5", "switch_estadocuenta_aging", "cliente_ficha_ventas"]) {
      expect(sql, `${fuente} no se toca`).not.toContain(fuente);
    }
  });
});
