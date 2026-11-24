// ═════════════════════════════════════════════════════════════════════════════
// 🔴 LA TASA DE COMISIÓN TIENE VIGENCIA POR FECHA (24-nov-2026).
// ═════════════════════════════════════════════════════════════════════════════
// Daniel: a Reynaldo Espinosa le baja de 1 % a 0,5 % (venta y cobro) DESDE el
// 1-nov-2026; octubre y lo anterior siguen al 1 %. Medido contra producción en
// una transacción con ROLLBACK: octubre Active Shoes $1.271,84 y Active Wear
// $221,84 antes y después; agosto, septiembre y octubre de las 6 empresas sin
// mover un centavo; noviembre de Reynaldo, la mitad.
//
// 🩸 Lo que este candado impide: que una RPC o «Buscar cliente» vuelvan a leer
// la tasa SIN fecha de `comision_vendedor_tasa` — ahí un cambio de tasa
// recalcula todos los meses hacia atrás.
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

describe("🔴 las RPC vigentes sacan la tasa por fecha, nunca la tasa sin fecha", () => {
  // La ÚLTIMA definición de cada función en todo supabase/migrations: si una
  // migración futura la redefine leyendo la tasa sin fecha, esto se pone rojo.
  const ultima = (fn: string) => {
    const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${fn}\\s*\\(`, "i");
    const archivo = readdirSync(path.join(RAIZ, DIR)).filter((a) => /^\d{14}_.*\.sql$/.test(a)).sort().reverse()
      .find((a) => re.test(leerSql(a)));
    expect(archivo, `nadie define ${fn}`).toBeTruthy();
    return cuerpo(leerSql(archivo!), fn);
  };

  it("comision_b2b_v10: la tasa sale de comision_tasa_vigente(vendedor, inicio del mes)", () => {
    const v10 = ultima("comision_b2b_v10");
    expect(v10).toMatch(/LEFT JOIN LATERAL comision_tasa_vigente\(u\.vendedor, v_inicio\) t ON true/);
    // La tabla sin fecha solo queda en el universo (quién aparece), nunca para la tasa.
    expect(v10).not.toMatch(/comision_vendedor_tasa t ON t\.vendedor_nombre = u\.vendedor/);
  });

  it("comision_b2b_detalle: lo mismo (paridad tabla ↔ modal)", () => {
    const det = ultima("comision_b2b_detalle");
    expect(det).toMatch(/FROM comision_tasa_vigente\(v_vendedor, v_inicio\) t;/);
    expect(det).not.toMatch(/comision_vendedor_tasa\b/);
  });

  it("comision_tasa_vigente: el historial que alcanza la fecha le gana a la tasa de hoy", () => {
    const f = cuerpo(leerSql(MIG), "comision_tasa_vigente");
    expect(f).toMatch(/h\.vigente_hasta >= p_fecha/);
    expect(f).toMatch(/'infinity'::date/);
    expect(f).toMatch(/ORDER BY x\.vigente_hasta\s+LIMIT 1/);
  });

  it("el historial es por mes y no se reescribe; la migración no borra nada", () => {
    const sql = leerSql(MIG);
    expect(sql).toMatch(/CONSTRAINT comision_tasa_historial_fin_de_mes/);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON comision_vendedor_tasa_historial TO service_role/);
    expect(sql).not.toMatch(/\b(DROP\s+\w+|TRUNCATE|DELETE\s+FROM)\b/i);
  });

  it("Reynaldo: el 1 % queda guardado hasta el 31-oct-2026 ANTES de bajar la tasa de hoy", () => {
    const sql = leerSql(MIG);
    const insert = sql.indexOf("INSERT INTO comision_vendedor_tasa_historial");
    const update = sql.indexOf("UPDATE comision_vendedor_tasa");
    expect(insert).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(insert);
    expect(sql.slice(insert, update)).toMatch(/DATE '2026-10-31'/);
    // Y el UPDATE no corre si el historial no quedó escrito.
    expect(sql.slice(update)).toMatch(/EXISTS \(SELECT 1 FROM comision_vendedor_tasa_historial/);
  });
});

describe("🔴 «Buscar cliente» usa la misma regla: la tasa de la fecha del documento", () => {
  const hoy = [{ vendedor_nombre: "REYNALDO ESPINOSA", tasa_venta: 0.005, tasa_cobro: 0.005 }];
  const historial = [{ vendedor_nombre: "REYNALDO ESPINOSA", vigente_hasta: "2026-10-31", tasa_venta: 0.01, tasa_cobro: 0.01 }];

  it("octubre y antes al 1 %; desde el 1-nov al 0,5 %", () => {
    expect(tasaEnFecha(hoy, historial, "REYNALDO ESPINOSA", "2026-10-31", "tasa_venta")).toBe(0.01);
    expect(tasaEnFecha(hoy, historial, "REYNALDO ESPINOSA", "2025-03-10", "tasa_cobro")).toBe(0.01);
    expect(tasaEnFecha(hoy, historial, "REYNALDO ESPINOSA", "2026-11-01", "tasa_venta")).toBe(0.005);
    expect(tasaEnFecha(hoy, historial, "REYNALDO ESPINOSA", "2026-11-01T00:00:00", "tasa_cobro")).toBe(0.005);
  });

  it("con dos tramos pasados gana el más cercano que todavía alcanza la fecha", () => {
    const dos = [...historial, { vendedor_nombre: "REYNALDO ESPINOSA", vigente_hasta: "2025-12-31", tasa_venta: 0.02, tasa_cobro: 0.02 }];
    expect(tasaEnFecha(hoy, dos, "REYNALDO ESPINOSA", "2025-12-31", "tasa_venta")).toBe(0.02);
    expect(tasaEnFecha(hoy, dos, "REYNALDO ESPINOSA", "2026-01-01", "tasa_venta")).toBe(0.01);
  });

  it("sin historial vale la tasa de hoy, y sin fila el 0,5 % de siempre", () => {
    expect(tasaEnFecha(hoy, [], "REYNALDO ESPINOSA", "2026-10-15", "tasa_venta")).toBe(0.005);
    expect(tasaEnFecha(hoy, historial, "OTRA PERSONA", "2026-10-15", "tasa_venta")).toBe(0.005);
  });

  it("un rango que cruza el cambio cobra cada tramo con SU tasa (octubre y noviembre de Active Shoes, medidos)", () => {
    const fila = (base: number, tasa: number): FilaConBase =>
      ({ empresa: "active_shoes", vendedor: "REYNALDO ESPINOSA", base, tasa, motivo: null, comision: 0 });
    const [r] = comisionPorVendedor([fila(75581, 0.01), fila(101674, 0.005)], [fila(51603.35, 0.01), fila(8277.52, 0.005)]);
    // 755,81 + 508,37 de venta; 516,03 + 41,39 de cobro = 1.271,84 + 549,76.
    expect(r.comision).toBe(1821.6);
    expect(r.ventas_base).toBe(177255);
  });
});
