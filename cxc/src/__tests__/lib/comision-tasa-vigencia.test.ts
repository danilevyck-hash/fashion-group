// ═════════════════════════════════════════════════════════════════════════════
// 🔴 LA TASA DE COMISIÓN PUEDE SER POR EMPRESA Y CON FECHA (24-nov-2026).
// ═════════════════════════════════════════════════════════════════════════════
// Daniel: a Reynaldo Espinosa le baja de 1 % a 0,5 % (venta y cobro) SOLO en
// Active Shoes y Active Wear, DESDE el 1-nov-2026. En las otras cuatro sigue al
// 1 %, y hasta octubre va 1 % en todas. Medido contra producción en una
// transacción con ROLLBACK: octubre igual en todo (Active Shoes $1.271,84,
// Active Wear $221,84, total $12.230,79); noviembre Active Shoes $1.099,52 →
// $549,76, y Fashion Wear $6.406,70 y Fashion Shoes $3.834,88 sin cambio.
//
// 🩸 Lo que este candado impide: que una RPC o «Buscar cliente» vuelvan a leer
// la tasa general de `comision_vendedor_tasa` sin mirar empresa ni fecha — ahí
// un cambio de tasa recalcula todos los meses de todas las empresas hacia atrás.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { comisionPorVendedor, tasaEnFecha, type FilaConBase } from "@/lib/comisiones/buscar-cliente";

const RAIZ = process.cwd();
const DIR = "supabase/migrations";
const MIG = "20270122120000_comision_tasa_vigencia.sql";
const sinComentarios = (sql: string) =>
  sql.split("\n").map((l) => (l.indexOf("--") === -1 ? l : l.slice(0, l.indexOf("--")))).join("\n");
const leerSql = (archivo: string) => sinComentarios(readFileSync(path.join(RAIZ, DIR, archivo), "utf8"));
function cuerpo(sql: string, fn: string): string {
  const m = sql.match(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${fn}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "i"));
  expect(m, `no encontré ${fn}`).toBeTruthy();
  return m![1];
}

describe("🔴 las RPC vigentes sacan la tasa por empresa y fecha, nunca la general a secas", () => {
  // La ÚLTIMA definición de cada función en todo supabase/migrations: si una
  // migración futura la redefine leyendo la tasa general, esto se pone rojo.
  const ultima = (fn: string) => {
    const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${fn}\\s*\\(`, "i");
    const archivo = readdirSync(path.join(RAIZ, DIR)).filter((a) => /^\d{14}_.*\.sql$/.test(a)).sort().reverse()
      .find((a) => re.test(leerSql(a)));
    expect(archivo, `nadie define ${fn}`).toBeTruthy();
    return cuerpo(leerSql(archivo!), fn);
  };

  it("comision_b2b_v10: la tasa sale de comision_tasa_vigente(vendedor, empresa, inicio del mes)", () => {
    const v10 = ultima("comision_b2b_v10");
    expect(v10).toMatch(/LEFT JOIN LATERAL comision_tasa_vigente\(u\.vendedor, p_empresa_key, v_inicio\) t ON true/);
    // La tabla general solo queda en el universo (quién aparece), nunca para la tasa.
    expect(v10).not.toMatch(/comision_vendedor_tasa t ON t\.vendedor_nombre = u\.vendedor/);
  });

  it("comision_b2b_detalle: lo mismo (paridad tabla ↔ modal)", () => {
    const det = ultima("comision_b2b_detalle");
    expect(det).toMatch(/FROM comision_tasa_vigente\(v_vendedor, p_empresa_key, v_inicio\) t;/);
    expect(det).not.toMatch(/comision_vendedor_tasa\b/);
  });

  it("comision_tasa_vigente: la excepción de ESA empresa que ya rige le gana a la general", () => {
    const f = cuerpo(leerSql(MIG), "comision_tasa_vigente");
    expect(f).toMatch(/e\.empresa_key = p_empresa_key AND e\.vigente_desde <= p_fecha/);
    expect(f).toMatch(/'-infinity'::date/);
    expect(f).toMatch(/ORDER BY x\.vigente_desde DESC\s+LIMIT 1/);
  });

  it("las excepciones son por mes y no se reescriben; la migración no borra ni toca la tasa general", () => {
    const sql = leerSql(MIG);
    expect(sql).toMatch(/CONSTRAINT comision_tasa_excepcion_dia_uno/);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON comision_vendedor_tasa_excepcion TO service_role/);
    expect(sql).not.toMatch(/\b(DROP\s+\w+|TRUNCATE|DELETE\s+FROM)\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+comision_vendedor_tasa\b/i);
    expect(sql).not.toMatch(/INSERT INTO comision_vendedor_tasa\s*\(/i);
  });

  it("Reynaldo: 0,5 % solo en Active Shoes y Active Wear, desde el 1-nov-2026", () => {
    const sql = leerSql(MIG);
    const filas = sql.slice(sql.indexOf("INSERT INTO comision_vendedor_tasa_excepcion")).match(/\('REYNALDO ESPINOSA'[^)]*\)/g) ?? [];
    expect(filas.map((f) => f.replace(/\s+/g, " "))).toEqual([
      "('REYNALDO ESPINOSA', 'active_shoes', DATE '2026-11-01', 0.0050, 0.0050, 'daniel')",
      "('REYNALDO ESPINOSA', 'active_wear', DATE '2026-11-01', 0.0050, 0.0050, 'daniel')",
    ]);
  });
});

describe("🔴 «Buscar cliente» usa la misma regla: la tasa de la empresa y la fecha del documento", () => {
  const generales = [{ vendedor_nombre: "REYNALDO ESPINOSA", tasa_venta: 0.01, tasa_cobro: 0.01 }];
  const excepciones = ["active_shoes", "active_wear"].map((empresa_key) => (
    { vendedor_nombre: "REYNALDO ESPINOSA", empresa_key, vigente_desde: "2026-11-01", tasa_venta: 0.005, tasa_cobro: 0.005 }
  ));
  const tasa = (empresa: string, fecha: string, campo: "tasa_venta" | "tasa_cobro" = "tasa_venta", vendedor = "REYNALDO ESPINOSA") =>
    tasaEnFecha(generales, excepciones, { vendedor, empresa, fecha }, campo);

  it("Active Shoes y Active Wear: octubre y antes al 1 %; desde el 1-nov al 0,5 %", () => {
    expect(tasa("active_shoes", "2026-10-31")).toBe(0.01);
    expect(tasa("active_wear", "2025-03-10", "tasa_cobro")).toBe(0.01);
    expect(tasa("active_shoes", "2026-11-01")).toBe(0.005);
    expect(tasa("active_wear", "2026-11-01T00:00:00", "tasa_cobro")).toBe(0.005);
    expect(tasa("active_shoes", "2027-02-15")).toBe(0.005);
  });

  it("las otras empresas siguen al 1 %, también en noviembre (venta y cobro)", () => {
    for (const empresa of ["fashion_wear", "fashion_shoes", "vistana", "joystep"]) {
      expect(tasa(empresa, "2026-11-20")).toBe(0.01);
      expect(tasa(empresa, "2026-11-20", "tasa_cobro")).toBe(0.01);
    }
  });

  it("con dos excepciones de la misma empresa gana la más reciente que ya rige", () => {
    const dos = [...excepciones, { vendedor_nombre: "REYNALDO ESPINOSA", empresa_key: "active_shoes", vigente_desde: "2027-03-01", tasa_venta: 0.002, tasa_cobro: 0.002 }];
    const en = (fecha: string) => tasaEnFecha(generales, dos, { vendedor: "REYNALDO ESPINOSA", empresa: "active_shoes", fecha }, "tasa_venta");
    expect(en("2027-02-28")).toBe(0.005);
    expect(en("2027-03-01")).toBe(0.002);
  });

  it("sin excepción vale la tasa general, y sin fila el 0,5 % de siempre", () => {
    expect(tasaEnFecha(generales, [], { vendedor: "REYNALDO ESPINOSA", empresa: "active_shoes", fecha: "2026-11-15" }, "tasa_venta")).toBe(0.01);
    expect(tasa("active_shoes", "2026-11-15", "tasa_venta", "OTRA PERSONA")).toBe(0.005);
  });

  it("un rango que cruza el cambio cobra cada tramo con SU tasa (octubre y noviembre de Active Shoes, medidos)", () => {
    const fila = (base: number, t: number): FilaConBase =>
      ({ empresa: "active_shoes", vendedor: "REYNALDO ESPINOSA", base, tasa: t, motivo: null, comision: 0 });
    const [r] = comisionPorVendedor([fila(75581, 0.01), fila(101674, 0.005)], [fila(51603.35, 0.01), fila(8277.52, 0.005)]);
    // 755,81 + 508,37 de venta; 516,03 + 41,39 de cobro = 1.271,84 + 549,76.
    expect(r.comision).toBe(1821.6);
    expect(r.ventas_base).toBe(177255);
  });
});
