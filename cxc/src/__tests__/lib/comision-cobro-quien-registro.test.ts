// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — la comisión de COBRO se paga a QUIEN REGISTRÓ EL RECIBO.
//
// 🩸 Daniel, 3-sep-2026, textual: «el que vende a veces no es el que cobra.
// Edwin puede vender 50k a City Mall y Daniel o DEFAULT cobrar esa plata. Los
// 50k en comisiones en venta va a Edwin y los 50k en cobros irían a DEFAULT
// por ejemplo».
//
// Tres vendedores distintos, para que no haya confusión:
//   · «Vendedor» (de la factura, switch_facturas.vendedor_nombre) → comisión de
//     VENTA — como hoy (v5, jul-2026).
//   · «Vendedor Recibo» (quien registró el pago, switch_recibos.vendedor_registro)
//     → comisión de COBRO — EL CAMBIO (v6).
//   · «Vendedor de cartera» (dueño del cliente, switch_recibos.vendedor_cartera)
//     → DEJA DE USARSE. Ninguna comisión lo lee.
//
// Y DEFAULT y Daniel NO SE PAGAN: «se queda sin pagar, pero qué importa?
// Acuérdate que si yo cobro no le pago a nadie porque no me autopago». Su
// comisión se calcula y se muestra (para cuadrar), pero no entra al total.
//
// Medido sobre ene–ago 2026 ANTES de aplicar la DDL, con el SQL real de v5 y
// v6 corriendo sobre los datos reales (scripts/_medir-comision-cobro-v6.mjs;
// la v5 local cuadró 640 celdas / 0 distintas contra la RPC de producción):
//   grupo +1.253,58 · Reinaldo +2.325,10 (+182,04 de su otro usuario «REYNALDO»)
//   · Daniel +1.943,86 · Edwin −2.640,50 · DEFAULT queda con 2.868,71.
//
// Este archivo prueba las tres cosas en las tres capas: el SQL (forma, sin
// comentarios), el módulo que elige la RPC (conducta con supabase doblado) y
// la marca de «no se paga» (pura + conducta de la ruta).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const RAIZ = process.cwd();
const MIG_V6 = "supabase/migrations/20260911120000_comision_b2b_v6_cobro_quien_registro.sql";
const MIG_V5 = "supabase/migrations/20260703120000_comision_b2b_v5_vendedor_factura.sql";

/** El SQL sin comentarios `--`: lo que Postgres ejecuta. La cabecera de la v6
 *  NOMBRA a vendedor_cartera para explicar el cambio; eso no es código. */
const soloSql = (rel: string) =>
  readFileSync(path.join(RAIZ, rel), "utf8")
    .split("\n")
    .map((l) => (l.indexOf("--") === -1 ? l : l.slice(0, l.indexOf("--"))))
    .join("\n");

/** Un cuerpo de función, por nombre. */
function cuerpo(sql: string, fn: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${fn}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "i");
  const m = sql.match(re);
  expect(m, `no encontré el cuerpo de ${fn}`).toBeTruthy();
  return m![1];
}

/** El CTE `cobros` (desde `cobros AS (` hasta el `universo AS (` que le sigue). */
const cteCobros = (body: string) => {
  const i = body.indexOf("cobros AS (");
  const j = body.indexOf("universo AS (", i);
  expect(i, "sin CTE cobros").toBeGreaterThan(-1);
  return body.slice(i, j);
};
/** El CTE `ventas` (desde `ventas AS (` hasta `cobros AS (`). */
const cteVentas = (body: string) => {
  const i = body.indexOf("ventas AS (");
  const j = body.indexOf("cobros AS (", i);
  return body.slice(i, j);
};
const compacto = (s: string) => s.replace(/\s+/g, " ").trim();

// ═══ 1. El SQL ═══════════════════════════════════════════════════════════════
describe("🔴 comision_b2b_v6: el cobro se agrupa por quien REGISTRÓ el recibo", () => {
  const v6 = soloSql(MIG_V6);
  const v5 = soloSql(MIG_V5);

  it("es una función NUEVA (no pisa la v5: hay que poder comparar)", () => {
    expect(v6).toMatch(/CREATE\s+FUNCTION\s+comision_b2b_v6\s*\(/i);
    expect(v6).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+comision_b2b_v6/i);
    expect(v6).not.toMatch(/DROP\s+FUNCTION\s+(IF\s+EXISTS\s+)?comision_b2b_v5/i);
  });

  it("el CTE cobros lee vendedor_registro y NO vendedor_cartera", () => {
    const cobros = cteCobros(cuerpo(v6, "comision_b2b_v6"));
    expect(cobros).toMatch(/vendedor_registro/);
    expect(cobros).not.toMatch(/vendedor_cartera/);
    // Agrupado por el nombre RECORTADO: joystep manda «DANIEL LEVY » con espacio.
    expect(compacto(cobros)).toContain("GROUP BY NULLIF(TRIM(r.vendedor_registro), '')");
  });

  it("vendedor_cartera no alimenta NINGUNA comisión en la DDL vigente (ni resumen ni detalle)", () => {
    // Ni una sola mención en el código ejecutable del archivo: la columna dejó
    // de usarse. (La cabecera sí la nombra, para explicar el cambio.)
    expect(v6).not.toMatch(/vendedor_cartera/);
  });

  it("el detalle (v3, misma DDL) filtra los cobros por vendedor_registro — paridad con la tabla", () => {
    const det = cuerpo(v6, "comision_b2b_detalle");
    const desdeCobros = det.slice(det.indexOf("FROM switch_recibos"));
    expect(compacto(desdeCobros)).toContain("NULLIF(TRIM(r.vendedor_registro), '') = p_vendedor");
    expect(desdeCobros).not.toMatch(/vendedor_cartera/);
  });

  it("los tres filtros de la base de cobro siguen: retenciones, mostrador, intercompañía", () => {
    for (const fn of ["comision_b2b_v6", "comision_b2b_detalle"]) {
      const body = cuerpo(v6, fn);
      const desdeCobros = body.slice(body.indexOf("FROM switch_recibos"));
      expect(desdeCobros, `${fn}: retenciones`).toMatch(/es_retencion\s*=\s*false/);
      expect(desdeCobros, `${fn}: mostrador`).toContain("'TCKCTA'");
      expect(desdeCobros, `${fn}: intercompañía`).toMatch(/multi fashion holding/i);
    }
  });

  it("la comisión de VENTA no cambia: el CTE ventas de v6 es IDÉNTICO al de v5", () => {
    const a = compacto(cteVentas(cuerpo(v5, "comision_b2b_v5")));
    const b = compacto(cteVentas(cuerpo(v6, "comision_b2b_v6")));
    expect(a.length).toBeGreaterThan(200);
    expect(b).toBe(a);
  });

  it("la v5 sigue como estaba (cobro por cartera): es la vara de comparación", () => {
    const cobros = cteCobros(cuerpo(v5, "comision_b2b_v5"));
    expect(cobros).toMatch(/GROUP BY r\.vendedor_cartera/);
  });

  it("la respuesta dice con qué regla salió", () => {
    expect(v6).toContain("'regla_cobro', 'quien_registro'");
  });

  it("no hay un signo de dólar suelto fuera de los delimitadores de función (el SQL Editor revienta)", () => {
    const src = readFileSync(path.join(RAIZ, MIG_V6), "utf8");
    expect(src.replace(/\$\$/g, "")).not.toMatch(/\$/);
  });
});

// ═══ 2. El módulo que elige la RPC ═══════════════════════════════════════════
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let respuestaV6: () => { data: unknown; error: { code?: string; message: string } | null } = () => ({
  data: null,
  error: { code: "PGRST202", message: "Could not find the function public.comision_b2b_v6" },
});

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "Daniel" }),
}));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "comision_b2b_v6") return respuestaV6();
      if (fn === "comision_b2b_v5") {
        return {
          data: {
            empresa_key: args.p_empresa_key,
            vendedores: [
              { vendedor: "EDWIN", base: 0, tasa: 0.005, comision: 0, base_cobro: 1000, tasa_cobro: 0.005, comision_cobro: 5, comision_total: 5 },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: { message: `rpc inesperada ${fn}` } };
    },
  },
}));
vi.mock("@/lib/comisiones/descuentos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/comisiones/descuentos")>()),
  leerDescuentosEfectivos: async () => [],
}));

const VENDEDORES_V6 = [
  { vendedor: "EDWIN", base: 1000, tasa: 0.005, comision: 5, base_cobro: 0, tasa_cobro: 0.005, comision_cobro: 0, comision_total: 5 },
  { vendedor: "DEFAULT", base: 0, tasa: 0.005, comision: 0, base_cobro: 1000, tasa_cobro: 0.005, comision_cobro: 5, comision_total: 5 },
  { vendedor: "DANIEL LEVY", base: 0, tasa: 0.005, comision: 0, base_cobro: 400, tasa_cobro: 0.005, comision_cobro: 2, comision_total: 2 },
];
const v6Disponible = () => {
  respuestaV6 = () => ({ data: { empresa_key: "vistana", year: 2026, mes: 7, regla_cobro: "quien_registro", vendedores: VENDEDORES_V6 }, error: null });
};
const v6Ausente = () => {
  respuestaV6 = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.comision_b2b_v6" } });
};

describe("🔴 leerComision: v6 primero, y se DICE con qué regla salió", () => {
  beforeEach(() => { rpcCalls.length = 0; });

  it("apunta a comision_b2b_v6 y la anterior es la v5", async () => {
    const { RPC_COMISION, RPC_COMISION_ANTERIOR } = await import("@/lib/comisiones/rpc");
    expect(RPC_COMISION).toBe("comision_b2b_v6");
    expect(RPC_COMISION_ANTERIOR).toBe("comision_b2b_v5");
  });

  it("con la DDL aplicada: llama la v6, no toca la v5, regla_cobro = quien_registro", async () => {
    v6Disponible();
    const { leerComision } = await import("@/lib/comisiones/rpc");
    const r = await leerComision("vistana", 2026, 7);
    expect(r.error).toBeNull();
    expect(r.data?.regla_cobro).toBe("quien_registro");
    expect(rpcCalls.map((c) => c.fn)).toEqual(["comision_b2b_v6"]);
    expect(rpcCalls[0].args).toEqual({ p_empresa_key: "vistana", p_year: 2026, p_mes: 7 });
  });

  it("sin la DDL: cae a la v5 y lo confiesa (regla_cobro = cartera) en vez de dejar la pantalla en blanco", async () => {
    v6Ausente();
    const { leerComision } = await import("@/lib/comisiones/rpc");
    const r = await leerComision("vistana", 2026, 7);
    expect(r.error).toBeNull();
    expect(r.data?.regla_cobro).toBe("cartera");
    expect(rpcCalls.map((c) => c.fn)).toEqual(["comision_b2b_v6", "comision_b2b_v5"]);
  });

  it("un error TRANSITORIO de la v6 no cae a la v5 (sería repetir la misma consulta)", async () => {
    respuestaV6 = () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    const { leerComision } = await import("@/lib/comisiones/rpc");
    const r = await leerComision("vistana", 2026, 7);
    expect(r.error?.code).toBe("57014");
    expect(rpcCalls.map((c) => c.fn)).toEqual(["comision_b2b_v6"]);
  });
});

// ═══ 3. Boston y Multifashion NO entran ═══════════════════════════════════════
describe("🔴 las 6 del grupo y nadie más", () => {
  beforeEach(() => { rpcCalls.length = 0; v6Disponible(); });

  it("el consolidado pide la RPC para las 6 y NUNCA para Boston ni Multifashion", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/consolidado/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://x/api/ventas/comisiones/consolidado?year=2026&mes=7"));
    expect(res.status).toBe(200);
    const pedidas = rpcCalls.map((c) => String(c.args.p_empresa_key));
    expect(pedidas).toHaveLength(6);
    expect(pedidas).not.toContain("confecciones_boston");
    expect(pedidas).not.toContain("american_classic");
  });

  it("la ruta por empresa rechaza a Boston con 400", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://x/api/ventas/comisiones?empresa=confecciones_boston&year=2026&mes=7"));
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it("EMPRESAS_COMISIONAN no contiene a Boston ni a Multifashion", async () => {
    const { EMPRESAS_COMISIONAN } = await import("@/lib/comisiones/empresas");
    expect(EMPRESAS_COMISIONAN).not.toContain("confecciones_boston");
    expect(EMPRESAS_COMISIONAN).not.toContain("american_classic");
  });
});

// ═══ 4. DEFAULT y Daniel: se calcula, se muestra, NO se paga ═════════════════
describe("🔴 «no me autopago»: DEFAULT y DANIEL LEVY se muestran pero no entran al total", () => {
  beforeEach(() => { rpcCalls.length = 0; v6Disponible(); });

  it("la lista vive en UN solo lugar y son exactamente esos dos", async () => {
    const { VENDEDORES_SIN_PAGO, sePagaComision } = await import("@/lib/comisiones/sin-pago");
    expect([...VENDEDORES_SIN_PAGO].sort()).toEqual(["DANIEL LEVY", "DEFAULT"]);
    expect(sePagaComision("DEFAULT")).toBe(false);
    expect(sePagaComision("DANIEL LEVY")).toBe(false);
    expect(sePagaComision("DANIEL LEVY ")).toBe(false); // joystep, con espacio
    expect(sePagaComision("daniel levy")).toBe(false);
    expect(sePagaComision("EDWIN")).toBe(true);
    expect(sePagaComision("REINALDO ESPINOSA")).toBe(true);
  });

  it("sumarPagable deja fuera solo lo marcado se_paga=false; lo no marcado cuenta", async () => {
    const { sumarPagable, marcarSePaga } = await import("@/lib/comisiones/sin-pago");
    const filas = marcarSePaga([
      { vendedor: "EDWIN", comision_total: 10 },
      { vendedor: "DEFAULT", comision_total: 5 },
      { vendedor: "DANIEL LEVY", comision_total: 2 },
    ]);
    expect(filas.map((f) => f.se_paga)).toEqual([true, false, false]);
    // Los montos NO se tocan: la plata se ve.
    expect(filas.map((f) => f.comision_total)).toEqual([10, 5, 2]);
    expect(sumarPagable(filas, (f) => f.comision_total)).toBe(10);
    expect(sumarPagable([{ comision_total: 3 }, { comision_total: 4, se_paga: undefined }], (f) => f.comision_total)).toBe(7);
  });

  it("la ruta por empresa marca se_paga y conserva la comisión de DEFAULT y Daniel", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://x/api/ventas/comisiones?empresa=vistana&year=2026&mes=7"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { regla_cobro: string; vendedores: { vendedor: string; comision_cobro: number; se_paga: boolean }[] };
    expect(body.regla_cobro).toBe("quien_registro");
    const por = Object.fromEntries(body.vendedores.map((v) => [v.vendedor, v]));
    expect(por.EDWIN.se_paga).toBe(true);
    expect(por.DEFAULT.se_paga).toBe(false);
    expect(por["DANIEL LEVY"].se_paga).toBe(false);
    // Se calcula y viaja: no se esconde.
    expect(por.DEFAULT.comision_cobro).toBe(5);
    expect(por["DANIEL LEVY"].comision_cobro).toBe(2);
    expect(body.vendedores).toHaveLength(3);
  });

  it("el consolidado marca lo mismo, empresa por empresa", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/consolidado/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://x/api/ventas/comisiones/consolidado?year=2026&mes=7"));
    const body = (await res.json()) as { empresas: { regla_cobro: string; vendedores: { vendedor: string; se_paga: boolean }[] }[] };
    expect(body.empresas).toHaveLength(6);
    for (const e of body.empresas) {
      expect(e.regla_cobro).toBe("quien_registro");
      const por = Object.fromEntries(e.vendedores.map((v) => [v.vendedor, v.se_paga]));
      expect(por).toEqual({ EDWIN: true, DEFAULT: false, "DANIEL LEVY": false });
    }
  });

  it("ninguna vista vuelve a escribir «DEFAULT» o «DANIEL LEVY» como regla de pago", () => {
    const sinComentarios = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
    for (const rel of [
      "src/components/ventas/ComisionesConsolidadoView.tsx",
      "src/components/ventas/ComisionesPorEmpresaView.tsx",
      "src/components/ventas/ComisionesTarjetas.tsx",
      "src/lib/ventas/comisionExcel.ts",
    ]) {
      const src = sinComentarios(readFileSync(path.join(RAIZ, rel), "utf8"));
      expect(src, rel).not.toMatch(/DANIEL LEVY/);
      // Y no esconden a DEFAULT: la lista de ocultos es solo AGUAS.
      expect(src, rel).not.toMatch(/VENDEDORES_OCULTOS\s*=\s*new Set\(\[[^\]]*DEFAULT/);
    }
  });
});
