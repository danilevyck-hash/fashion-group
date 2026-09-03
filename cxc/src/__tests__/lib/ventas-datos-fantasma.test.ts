// ─────────────────────────────────────────────────────────────────────────────
// LO QUE NADIE LEE, NO SE PIDE Y NO VIAJA.
//
// 🩸 Cada carga de /ventas hacía una CONSULTA PROPIA a la base
// (`get_app_setting("multifashion_meta_anual_2026")`) por un número que **no se
// dibuja en ninguna pantalla**: viajaba como `kpis.metaAnualMultifashion` y
// nadie lo leía. Encima la clave estaba clavada en "2026", así que en 2027
// habría devuelto la meta del año equivocado sin que nada avisara. Es una ida
// más a una base en compute Micro —que se cayó cuatro veces en una semana—
// para un número fantasma.
//
// Con él viajaban `kpis.multifashionYTD` (mismo caso: cero renders) y la
// familia de METAS de la proyección de cierre: `meta_anual_manual`,
// `meta_sugerida`, `meta_efectiva`, `meta_anual`, `gap_vs_meta` por empresa, y
// `meta_total` + `gap_vs_meta` del grupo. Barrido completo de `src/`: cero
// consumidores.
//
// ⚠️ LO QUE **NO** SE HIZO, y es la mitad del cambio:
//   · NO se borró ninguna fila ni ninguna tabla. `app_settings` conserva su
//     `multifashion_meta_anual_2026` y las RPC de Multifashion la siguen
//     leyendo — ese módulo SÍ tiene consumidores vivos.
//   · NO se tocó el SQL de `ventas_proyeccion_cierre_v7`. Sigue calculando y
//     devolviendo las metas; se quitan del lado del servidor, al armar el
//     payload. Cambiar la RPC pide una migración a mano y es la consulta que
//     alimenta la columna "Proyección" que Daniel mira todos los días.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const rpcCalls: string[] = [];
const tablasLeidas: string[] = [];

/** La proyección tal como la devuelve la RPC: con sus metas adentro. */
const PROY_CRUDA = {
  anio: 2026,
  fecha_corte: "2026-08-24",
  mes_corte: 8,
  peso_ritmo: 0.667,
  peso_historico: 0.333,
  empresas: [{
    empresa: "vist", nombre: "Vistana International",
    ventas_ytd: 100, ventas_prev_ytd_sp: 90, ventas_prev_year: 120,
    cierre_anio_anterior: 120, delta_vs_anio_anterior: 30,
    delta_vs_anio_anterior_pct: 0.25, ritmo_actual: 1.11, ritmo_historico: 1.05,
    historia_disponible: 3, frac_ytd_estacional: 0.6, algoritmo: "estacional",
    factor_final: 1.1, proyeccion_cierre: 150, proyeccion_restante: 50,
    es_fallback_lineal: false, status: "verde",
    // ── las fantasma ──
    meta_anual_manual: 999, meta_sugerida: 888, meta_efectiva: 777,
    meta_anual: 777, gap_vs_meta: -66,
  }],
  totales_grupo: {
    ventas_ytd: 100, proyeccion_cierre: 150, proyeccion_restante: 50,
    cierre_anio_anterior_total: 120, delta_vs_anio_anterior_total: 30,
    delta_vs_anio_anterior_pct: 0.25, status: "verde",
    // ── las fantasma ──
    meta_total: 555, gap_vs_meta: -405,
  },
};

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      if (fn.startsWith("ventas_proyeccion_cierre")) return { data: PROY_CRUDA, error: null };
      if (fn === "ventas_dashboard_prev_same_period_v2") {
        return { data: { rows: [], es_periodo_parcial: false, fecha_corte: null, dia_corte_anio_anterior: null }, error: null };
      }
      return { data: [], error: null };
    },
    from: (tabla: string) => {
      tablasLeidas.push(tabla);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit", "eq", "in", "gte", "lte", "range"]) {
        q[m] = () => q;
      }
      q.then = (res: (v: unknown) => unknown) => res({ data: [], error: null, count: 0 });
      return q;
    },
  },
}));

beforeEach(() => { rpcCalls.length = 0; tablasLeidas.length = 0; });

const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map(l => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

async function resumen() {
  const { fetchVentasResumen } = await import("@/lib/ventas/queries");
  return fetchVentasResumen({ year: 2026 });
}

describe("la consulta fantasma se dejó de hacer", () => {
  it("🔴 /ventas ya NO pide `get_app_setting`", async () => {
    await resumen();
    expect(rpcCalls).not.toContain("get_app_setting");
  });

  it("las consultas que SÍ hacen falta siguen saliendo", async () => {
    await resumen();
    // Las tres que alimentan lo que se dibuja: el año, el comparativo y la
    // proyección de cierre. Si alguna se fuera, la pantalla quedaría vacía.
    expect(rpcCalls).toContain("ventas_dashboard_summary");
    // Desde el 3-sep-2026 el comparativo sale de `_v3` (corte en día de
    // Panamá); `_v2` queda como respaldo mientras la DDL no corra.
    expect(rpcCalls).toContain("ventas_dashboard_prev_same_period_v3");
    expect(rpcCalls.some(f => f.startsWith("ventas_proyeccion_cierre"))).toBe(true);
    expect(tablasLeidas).toContain("switch_facturas");
  });

  it("el nombre de la clave no vuelve al código de /ventas", () => {
    const src = sinComentarios(leer("src/lib/ventas/queries.ts"));
    expect(src).not.toContain("multifashion_meta_anual_2026");
    expect(src).not.toContain("metaAnualMultifashion");
  });
});

describe("los campos sin consumidor no viajan al navegador", () => {
  it("🔴 `kpis` ya no lleva la meta ni el YTD de Multifashion", async () => {
    const r = await resumen();
    expect(Object.keys(r.kpis).sort()).toEqual([
      "margen2025YTD", "margenYTD",
      "utilidad2025YTD", "utilidadYTD",
      "ventas2025YTD", "ventasNetasYTD",
    ]);
  });

  it("🔴 la proyección llega SIN la familia de metas, por empresa y del grupo", async () => {
    const r = await resumen();
    const e = r.proyeccion!.empresas[0] as Record<string, unknown>;
    for (const k of ["meta_anual_manual", "meta_sugerida", "meta_efectiva", "meta_anual", "gap_vs_meta"]) {
      expect(k in e, `"${k}" sigue viajando por empresa`).toBe(false);
    }
    const g = r.proyeccion!.totales_grupo as Record<string, unknown>;
    for (const k of ["meta_total", "gap_vs_meta"]) {
      expect(k in g, `"${k}" sigue viajando en el grupo`).toBe(false);
    }
  });

  it("⚠️ TODO lo que la proyección SÍ dibuja queda intacto, valor por valor", async () => {
    const r = await resumen();
    const e = r.proyeccion!.empresas[0];
    expect(e.empresa).toBe("vist");
    expect(e.proyeccion_cierre).toBe(150);
    expect(e.proyeccion_restante).toBe(50);
    expect(e.cierre_anio_anterior).toBe(120);
    expect(e.delta_vs_anio_anterior).toBe(30);
    expect(e.algoritmo).toBe("estacional");
    expect(e.factor_final).toBe(1.1);
    expect(e.frac_ytd_estacional).toBe(0.6);
    expect(e.es_fallback_lineal).toBe(false);
    expect(e.status).toBe("verde");
    const g = r.proyeccion!.totales_grupo;
    expect(g.proyeccion_cierre).toBe(150);
    expect(g.cierre_anio_anterior_total).toBe(120);
    expect(g.status).toBe("verde");
    expect(r.proyeccion!.anio).toBe(2026);
    expect(r.proyeccion!.mes_corte).toBe(8);
  });

  it("una proyección que llega NULA sigue llegando nula (no se inventa un objeto)", async () => {
    const src = sinComentarios(leer("src/lib/ventas/queries.ts"));
    expect(src).toContain("let proyeccion: ProyeccionResp | null = null;");
  });
});

describe("⚠️ NO se borró ningún dato", () => {
  it("ninguna migración dropea `app_settings` ni borra la fila de la meta", () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    for (const f of readdirSync(dir).filter(n => n.endsWith(".sql"))) {
      const sql = readFileSync(path.join(dir, f), "utf8")
        .split("\n").map(l => l.replace(/--.*$/, "")).join("\n");
      expect(sql, `${f} dropea app_settings`).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?(public\.)?app_settings/i);
      expect(sql, `${f} borra la meta de Multifashion`)
        .not.toMatch(/DELETE\s+FROM\s+(public\.)?app_settings[\s\S]{0,200}multifashion_meta_anual/i);
    }
  });

  it("las RPC de Multifashion siguen leyendo esa clave — ahí SÍ tiene consumidores", () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    const usan = readdirSync(dir).filter(n =>
      n.endsWith(".sql") && readFileSync(path.join(dir, n), "utf8").includes("multifashion_meta_anual_2026"));
    expect(usan.length).toBeGreaterThan(0);
  });

  it("el SQL de la proyección NO se tocó: sigue calculando sus metas", () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    const v7 = readdirSync(dir).find(n => n.includes("ventas_proyeccion_cierre_v7"));
    expect(v7, "no encontré la migración de la v7").toBeTruthy();
    expect(readFileSync(path.join(dir, v7!), "utf8")).toContain("meta_sugerida");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL AÑO CONTRA EL QUE SE COMPARA VIAJA CON EL DATO QUE HACE LA CUENTA
//
// 🩸 Los rótulos de Ventas › Clientes decían "Δ vs 2025" ESCRITO A MANO. Con
// 2025 elegido arriba, la pantalla mostraba "Compras 2025 · Δ vs 2025" y la
// columna comparaba contra 2024. El año lo calcula ahora el servidor, en la
// MISMA función que arma el delta, así que no se pueden separar.
// ─────────────────────────────────────────────────────────────────────────────

describe("el servidor manda el año contra el que compara", () => {
  async function clientes(year: number) {
    const { fetchClientes } = await import("@/lib/ventas/queries");
    return fetchClientes({ year, empresaKey: "vistana" });
  }

  it("🔴 el año en curso compara contra el anterior", async () => {
    expect((await clientes(2026)).anioComparativo).toBe(2025);
  });

  it("🔴 un año cerrado compara contra el SUYO anterior, no contra 2025 fijo", async () => {
    expect((await clientes(2025)).anioComparativo).toBe(2024);
    expect((await clientes(2024)).anioComparativo).toBe(2023);
  });

  it("las DOS ramas de la función comparan contra `year - 1` — por eso se puede derivar", () => {
    const src = leer("src/lib/ventas/queries.ts");
    // La rama de año cerrado usa la RPC `clientes_anio(p_year)`, que resta 1
    // adentro; la de año en curso usa la vista rolling, que resta 1 sobre el
    // año calendario (y esa rama solo corre cuando year === año actual).
    expect(src).toContain("anioComparativo: year - 1");
  });
});
