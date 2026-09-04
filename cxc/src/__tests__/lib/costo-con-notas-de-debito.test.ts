/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL COSTO DEL RESUMEN INCLUYE LAS NOTAS DE DÉBITO (3-sep-2026)
 *
 * Active Wear, agosto 2026: costo −$44.483,03 en Ventas › Resumen porque la
 * fuente (`switch_articulo_diario`) restó una NC de $74.166 y nunca sumó la ND
 * de $73.752 que la anuló. El costo de las ND vive en `switch_factura_utilidad`
 * y la migración 20260915120000 lo suma en las tres puntas del Resumen (meses
 * cerrados, mes en curso, año anterior) y estrena el cuadre mensual.
 *
 * Este archivo lee el SQL de la migración y el código que lo llama, y exige:
 *   1. la vista v2 suma las ND de utilidad y excluye el código 'ND' del artículo
 *      diario (una ND tiene UNA fuente: sumarla dos veces sería el error inverso);
 *   2. la MV mensual se arma sobre la v2, no sobre la vista vieja;
 *   3. el mes en curso (`summary_v2`) suma las ND;
 *   4. 🔴 el «vs año anterior» (`prev_same_period_v4`) NO lee `switch_costo_diario`
 *      (su último día de cada mes vale $0 para siempre) ni `ventas_raw.costo`;
 *   5. el cuadre deja fuera el último día del mes, los días sin fila y los
 *      leídos antes de cerrar el día;
 *   6. lo anterior queda intacto (nada in-place) y el código pide las versiones
 *      nuevas con caída a las viejas;
 *   7. el aviso del cuadre va por 🔧 SISTEMA (Telegram), no a Data Health.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const RUTA = "supabase/migrations/20260915120000_costo_con_notas_de_debito.sql";
const sqlCrudo = existsSync(RUTA) ? readFileSync(RUTA, "utf8") : "";
const sql = sqlCrudo.replace(/^\s*--.*$/gm, "");

/** El cuerpo de UNA función/vista de la migración, sin comentarios. */
function cuerpo(nombre: string): string {
  const inicio = sql.search(new RegExp(`CREATE (OR REPLACE )?(FUNCTION|VIEW|MATERIALIZED VIEW) ${nombre}\\b`));
  expect(inicio, `no encuentro ${nombre} en la migración`).toBeGreaterThanOrEqual(0);
  const resto = sql.slice(inicio);
  const fin = resto.search(/\n(CREATE|DROP|GRANT|COMMENT|NOTIFY)\b/);
  return fin < 0 ? resto : resto.slice(0, fin);
}

describe("#1 switch_costo_unificado_v2 — artículo diario (sin 'ND') + ND de utilidad", () => {
  const v = cuerpo("switch_costo_unificado_v2");

  it("existe como vista NUEVA y la vieja no se toca", () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW switch_costo_unificado_v2 AS/);
    expect(sql).not.toMatch(/CREATE OR REPLACE VIEW switch_costo_unificado_vw/);
    expect(sql).not.toMatch(/DROP VIEW/);
  });

  it("suma las Notas de Débito de switch_factura_utilidad", () => {
    expect(v).toMatch(/FROM switch_factura_utilidad/);
    expect(v).toMatch(/tipo_comprobante = 'Nota de Débito'/);
    expect(v).toMatch(/SUM\(costo\)/);
  });

  it("y excluye el código 'ND' de switch_articulo_diario: una ND tiene UNA fuente", () => {
    expect(v).toMatch(/FROM switch_articulo_diario\s+WHERE tipo <> 'ND'/);
    expect(v).toMatch(/CASE WHEN tipo = 'NC' THEN -costo_total ELSE costo_total END/);
  });

  it("nunca lee switch_costo_diario ni ventas_raw", () => {
    expect(v).not.toMatch(/switch_costo_diario|ventas_raw/);
  });
});

describe("#2 ventas_rollup_mensual_mv — recreada sobre la v2", () => {
  it("DROP + CREATE con el mismo nombre, LEFT JOIN a switch_costo_unificado_v2, mismos índices", () => {
    expect(sql).toMatch(/DROP MATERIALIZED VIEW IF EXISTS ventas_rollup_mensual_mv;/);
    const mv = cuerpo("ventas_rollup_mensual_mv");
    expect(mv).toMatch(/LEFT JOIN switch_costo_unificado_v2 c/);
    expect(mv).not.toMatch(/switch_costo_unificado_vw/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX ventas_rollup_mensual_mv_pk\s+ON ventas_rollup_mensual_mv \(empresa_key, mes\)/);
    expect(sql).toMatch(/CREATE INDEX ventas_rollup_mensual_mv_anio/);
    expect(sql).toMatch(/GRANT SELECT ON ventas_rollup_mensual_mv TO service_role/);
  });

  it("las columnas son las de siempre (los lectores no cambian)", () => {
    const mv = cuerpo("ventas_rollup_mensual_mv");
    for (const col of ["AS anio", "AS mes_num", "AS ventas_netas", "AS costo_total", "AS utilidad"]) expect(mv).toContain(col);
  });
});

describe("#3 ventas_dashboard_summary_v2 — el mes en curso con las ND", () => {
  const f = cuerpo("ventas_dashboard_summary_v2");

  it("es una función NUEVA; la _v1 queda intacta", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION ventas_dashboard_summary_v2\(p_anio int\)/);
    expect(sql).not.toMatch(/FUNCTION ventas_dashboard_summary\(/);
  });

  it("costo_cur = artículo diario sin 'ND' + ND de utilidad, acotados al mes en curso", () => {
    expect(f).toMatch(/FROM switch_articulo_diario a\s+WHERE a\.tipo <> 'ND'/);
    expect(f).toMatch(/FROM switch_factura_utilidad u\s+WHERE u\.tipo_comprobante = 'Nota de Débito'\s+AND u\.fecha >= \(SELECT w\.m/);
    expect(f).toMatch(/AND u\.fecha <\s+\(SELECT w\.fin_date FROM win w\)/);
  });

  it("misma firma y mismo shape de salida que la _v1", () => {
    const v1 = readFileSync("supabase/migrations/20260725170100_ventas_dashboard_summary_mes_sargable.sql", "utf8");
    const firma = /RETURNS TABLE \(\s*empresa text,\s*mes int,\s*total_subtotal numeric,\s*total_costo numeric,\s*total_utilidad numeric,\s*total_facturado numeric,\s*filas bigint\s*\)/;
    expect(v1).toMatch(firma);
    expect(f).toMatch(firma);
  });
});

describe("#4 🔴 ventas_dashboard_prev_same_period_v4 — el lector dormido ya no lee switch_costo_diario", () => {
  const f = cuerpo("ventas_dashboard_prev_same_period_v4");

  it("es una función NUEVA; _v3 queda intacta", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION ventas_dashboard_prev_same_period_v4\(p_year int\)/);
    expect(sql).not.toMatch(/FUNCTION ventas_dashboard_prev_same_period_v3\(/);
  });

  it("el CTE dia_costo lee switch_articulo_diario (sin 'ND') + ND de utilidad, y NUNCA switch_costo_diario ni ventas_raw.costo", () => {
    const dc = /dia_costo AS \(([\s\S]*?)\),\s*empresa_cuts AS/.exec(f)?.[1] ?? "";
    expect(dc).toBeTruthy();
    expect(dc).toMatch(/FROM switch_articulo_diario\s+WHERE tipo <> 'ND'/);
    expect(dc).toMatch(/FROM switch_factura_utilidad\s+WHERE tipo_comprobante = 'Nota de Débito'/);
    expect(dc).not.toMatch(/switch_costo_diario/);
    expect(dc).not.toMatch(/ventas_raw/);
    // en TODA la función, la única mención de costo es la buena
    expect(f).not.toMatch(/switch_costo_diario/);
  });

  it("conserva la regla de los mismos días en Panamá de la _v3 (hoy, corte por empresa, tope en hoy)", () => {
    expect(f).toMatch(/v_hoy\s*:=\s*multifashion_hoy_panama\(\)/);
    expect(f).toMatch(/LEAST\(MAX\(d\), v_hoy\) AS e_cur_max/);
    expect(f).toMatch(/COALESCE\(ec\.e_cur_max, v_fecha_corte\)/);
    expect(f).not.toMatch(/CURRENT_DATE/);
    expect(f).not.toMatch(/fecha::date/);
  });

  it("la rama de años cerrados (MV) queda idéntica a la de _v3", () => {
    const v3 = readFileSync("supabase/migrations/20260910120000_ventas_dashboard_prev_same_period_v3_panama.sql", "utf8").replace(/^\s*--.*$/gm, "");
    const rama = /ELSE\s*WITH final AS \(\s*SELECT\s*r\.empresa_key[\s\S]*?INTO v_rows_json FROM final;\s*END IF;/;
    expect(rama.exec(v3)?.[0]).toBeTruthy();
    expect(rama.exec(f)?.[0]).toBe(rama.exec(v3)?.[0]);
  });
});

describe("#5 cuadre_costo_mensual_v1 — solo los días comparables", () => {
  const f = cuerpo("cuadre_costo_mensual_v1");

  it("🔴 el último día del mes queda fuera, en las dos fuentes", () => {
    const ultimo = /<> \(date_trunc\('month', \w+\.fecha\) \+ INTERVAL '1 month - 1 day'\)::date/g;
    expect((f.match(ultimo) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("una fila de switch_costo_diario vale solo si se leyó DESPUÉS de que el día cerrara en Panamá", () => {
    expect(f).toMatch(/s\.synced_at >= \(\(s\.fecha \+ 1\)::timestamp AT TIME ZONE 'America\/Panama'\)\) AS completo/);
    // y las DOS sumas de plata llevan ese filtro, no solo el conteo de días
    expect(f).toMatch(/SUM\(d\.costo_total\)\s+FILTER \(WHERE d\.completo\)/);
    expect(f).toMatch(/SUM\(r\.costo\)\s+FILTER \(WHERE d\.completo\)/);
  });

  it("compara contra la MISMA fórmula del Resumen (artículo sin 'ND' + ND de utilidad) y cuenta los días sin fila", () => {
    expect(f).toMatch(/FROM switch_articulo_diario a\s+WHERE a\.tipo <> 'ND'/);
    expect(f).toMatch(/FROM switch_factura_utilidad u\s+WHERE u\.tipo_comprobante = 'Nota de Débito'/);
    expect(f).toMatch(/WHERE s\.id IS NULL/);
    expect(f).toMatch(/AS dias_sin_fila/);
    expect(f).toMatch(/AS dias_foto_parcial/);
  });

  it("es solo lectura y solo para service_role", () => {
    expect(f).toMatch(/LANGUAGE sql STABLE/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION cuadre_costo_mensual_v1\(date, date\) TO service_role/);
  });
});

describe("#6 el código pide las versiones nuevas y cae a las viejas", () => {
  it("prev-same-period: _v4 → _v3 → _v2 → _v1", () => {
    const s = readFileSync("src/lib/ventas/prev-same-period.ts", "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(s).toMatch(/RPC_PREV_SAME_PERIOD = "ventas_dashboard_prev_same_period_v4"/);
    const orden = ["_v4", "_v3", "_v2", 'llamar("ventas_dashboard_prev_same_period")'].map((x) => s.indexOf(x));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden]).toEqual([...orden].sort((a, b) => a - b));
  });

  it("summary: Resumen, Vista General y /api/ventas/v2 leen por `leerDashboardSummary` (_v2 → _v1)", () => {
    const ds = readFileSync("src/lib/ventas/dashboard-summary.ts", "utf8");
    expect(ds).toMatch(/RPC_DASHBOARD_SUMMARY = "ventas_dashboard_summary_v2"/);
    expect(ds).toMatch(/RPC_DASHBOARD_SUMMARY_ANTERIOR = "ventas_dashboard_summary"/);
    for (const ruta of ["src/lib/ventas/queries.ts", "src/app/api/dashboard/vista-general/route.ts", "src/app/api/ventas/v2/route.ts"]) {
      const s = readFileSync(ruta, "utf8").replace(/^\s*\/\/.*$/gm, "");
      expect(s, ruta).toMatch(/leerDashboardSummary\(/);
      expect(s, ruta).not.toMatch(/rpc\("ventas_dashboard_summary"/);
    }
  });

  it("la reconciliación corre el cuadre junto al silencio de datos y lo saca en su JSON", () => {
    const s = readFileSync("src/app/api/cron/switch-reconciliacion/route.ts", "utf8");
    expect(s).toMatch(/import \{ revisarCuadreCosto \} from "@\/lib\/alertas\/cuadre-costo-io"/);
    expect(s).toMatch(/const cuadreCosto = await checkCuadreCosto\(\);/);
    expect((s.match(/^\s+cuadreCosto,$/gm) ?? []).length).toBe(2);
  });
});

// ── #7 el I/O del cuadre: Telegram 🔧 SISTEMA, una vez por (empresa, mes) ─────
const estado = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  filas: [] as Record<string, unknown>[],
  rpcError: null as null | { code: string; message: string },
  avisados: new Set<string>(),
  registrados: [] as string[],
  telegram: [] as string[],
}));

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      estado.rpc.push({ fn, args });
      if (estado.rpcError) return { data: null, error: estado.rpcError };
      return { data: estado.filas, error: null };
    },
    from: (tabla: string) => {
      let tipo = "";
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (_c: string, v: string) => { tipo = v; return q; };
      q.gte = () => q;
      q.limit = () => q;
      q.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: tabla === "cron_email_errors" && estado.avisados.has(tipo) ? [{ id: 1 }] : [], error: null }).then(res);
      return q;
    },
  },
}));
vi.mock("@/lib/alertas/canal", () => ({
  enviarSistema: async (t: string) => { estado.telegram.push(t); return true; },
  enviarNegocio: async () => { throw new Error("el cuadre NUNCA va por NEGOCIO"); },
}));
vi.mock("@/lib/cron-telemetry", () => ({
  logCronError: async (tipo: string) => { estado.registrados.push(tipo); },
}));

describe("#7 revisarCuadreCosto — el I/O", () => {
  beforeEach(() => {
    estado.rpc.length = 0;
    estado.filas = [];
    estado.rpcError = null;
    estado.avisados.clear();
    estado.registrados.length = 0;
    estado.telegram.length = 0;
  });

  const activeWearRota = {
    empresa_key: "active_wear", mes: "2026-08-01", dias_comparados: 30, dias_sin_fila: 0, dias_foto_parcial: 0,
    costo_diario: "5558.17", costo_resumen: "-44483.03",
  };
  const vistanaBien = {
    empresa_key: "vistana", mes: "2026-08-01", dias_comparados: 30, dias_sin_fila: 0, dias_foto_parcial: 0,
    costo_diario: "79065.87", costo_resumen: "79065.88",
  };

  it("pide la RPC con la ventana de meses cerrados y avisa por 🔧 SISTEMA solo lo descuadrado", async () => {
    estado.filas = [activeWearRota, vistanaBien];
    const { revisarCuadreCosto } = await import("@/lib/alertas/cuadre-costo-io");
    const etiquetas = await revisarCuadreCosto("2026-09-03", Date.UTC(2026, 8, 3, 10));
    expect(estado.rpc).toEqual([{ fn: "cuadre_costo_mensual_v1", args: { p_desde: "2026-06-01", p_hasta: "2026-09-01" } }]);
    expect(etiquetas).toEqual(["active_wear/2026-08:900.3%"]);
    expect(estado.telegram).toHaveLength(1);
    expect(estado.telegram[0]).toContain("Active Wear, agosto 2026");
    expect(estado.telegram[0]).not.toContain("Vistana");
    expect(estado.registrados).toEqual(["cuadre_costo:active_wear:2026-08-01"]);
  });

  it("anti-loop por (empresa, mes): ya avisado → no repite, pero lo sigue reportando en el JSON", async () => {
    estado.filas = [activeWearRota];
    estado.avisados.add("cuadre_costo:active_wear:2026-08-01");
    const { revisarCuadreCosto } = await import("@/lib/alertas/cuadre-costo-io");
    const etiquetas = await revisarCuadreCosto("2026-09-03");
    expect(etiquetas).toEqual(["active_wear/2026-08:900.3%"]);
    expect(estado.telegram).toHaveLength(0);
    expect(estado.registrados).toHaveLength(0);
  });

  it("todo cuadra → ni Telegram ni registro", async () => {
    estado.filas = [vistanaBien];
    const { revisarCuadreCosto } = await import("@/lib/alertas/cuadre-costo-io");
    expect(await revisarCuadreCosto("2026-09-03")).toEqual([]);
    expect(estado.telegram).toHaveLength(0);
  });

  it("la migración todavía no corrió (PGRST202) → se omite sin inventar nada ni tumbar la pasada", async () => {
    estado.rpcError = { code: "PGRST202", message: "Could not find the function public.cuadre_costo_mensual_v1" };
    const { revisarCuadreCosto } = await import("@/lib/alertas/cuadre-costo-io");
    expect(await revisarCuadreCosto("2026-09-03")).toEqual([]);
    expect(estado.telegram).toHaveLength(0);
  });

  it("otro error de la base sí se lanza (la reconciliación lo anota y sigue)", async () => {
    estado.rpcError = { code: "57014", message: "statement timeout" };
    const { revisarCuadreCosto } = await import("@/lib/alertas/cuadre-costo-io");
    await expect(revisarCuadreCosto("2026-09-03")).rejects.toThrow(/statement timeout/);
  });

  it("🔴 no toca Data Health: no escribe en data_integrity_checks", () => {
    const io = readFileSync("src/lib/alertas/cuadre-costo-io.ts", "utf8");
    expect(io).not.toMatch(/data_integrity_checks|integrity/i);
    expect(io).toMatch(/enviarSistema\(/);
    expect(io).not.toMatch(/enviarNegocio|sendTelegramAlert/);
  });
});
