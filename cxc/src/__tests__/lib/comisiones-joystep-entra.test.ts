// ─────────────────────────────────────────────────────────────────────────────
// Joystep COMISIONA — es la sexta empresa de la matriz, no la excepción.
//
// 🩸 POR QUÉ (14-ago-2026). Daniel: *"joystep sí debe de tener comisiones al
// 0.5%"*. Hasta ese día `EMPRESAS_COMISIONAN` restaba joystep a propósito, con
// un comentario que decía "Joystep tiene CXC pero NO comisiona". Los insumos
// estaban COMPLETOS desde siempre —`switch_factura_utilidad` y `switch_recibos`
// con datos, `comision_b2b_v5('joystep', …)` devolviendo cifras— y nadie las
// veía porque la empresa no se dibujaba:
//
//     joystep 2026-07   $56,33     ← medido contra producción
//     joystep 2026-06   $18,83
//     joystep 2026-05   $50,13
//
// El precedente exacto de este repo: cuando joystep se activó en recibos y
// utilidad aparecieron $15.262 de cobros de julio que llevaban meses sin
// contarse. Lo que no se dibuja, no se cuenta.
//
// ⚠️ SOBRE QUÉ se aplica el 0,5%, porque es fácil decirlo mal: sobre la VENTA
// (`subtotal_con_descuento`), NO sobre la utilidad. La utilidad es el CRITERIO
// de entrada —solo comisionan las facturas con `pct_utilidad > 20`— y las notas
// de crédito RESTAN. Está en la línea 53 de la migración de la RPC.
//
// El 0,5% NO se escribe en ninguna parte: es el default que ya aplica la RPC
// (`COALESCE(t.tasa_venta, 0.0050)`) a todo vendedor sin fila propia en
// `comision_vendedor_tasa`. La tasa de esa tabla es GLOBAL por vendedor, así
// que tocarla para "poner joystep en 0,5%" movería también a las otras
// empresas donde ese mismo vendedor trabaja — por eso no se toca.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

// ── Conducta: qué RPC dispara de verdad el endpoint consolidado ──────────────
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "Daniel" }),
}));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return {
        data: {
          empresa_key: args.p_empresa_key,
          // Un vendedor sin fila de tasa: la RPC real le pone 0,5% por default.
          vendedores: [{
            vendedor: "DEFAULT", base: 1000, base_cobro: 0,
            comision: 5, tasa: 0.005, tasa_cobro: 0.005,
            comision_cobro: 0, comision_total: 5,
          }],
        },
        error: null,
      };
    },
  },
}));
vi.mock("@/lib/comisiones/descuentos", () => ({
  leerDescuentosEfectivos: async () => [],
  totalPorVendedor: () => ({}),
}));

// ── Texto SIN comentarios: un comentario que nombra el filtro no es el filtro ─
const sinComentarios = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

const codigo = (rel: string) =>
  sinComentarios(readFileSync(path.join(process.cwd(), rel), "utf8"));

const ARCHIVOS_DE_COMISIONES = [
  "src/lib/comisiones/empresas.ts",
  "src/components/ventas/ComisionesView.tsx",
  "src/components/ventas/ComisionesConsolidadoView.tsx",
  "src/components/ventas/ComisionesPorEmpresaView.tsx",
  "src/app/api/ventas/comisiones/consolidado/route.ts",
  "src/app/api/ventas/comisiones/route.ts",
];

describe("🔴 joystep está DENTRO de la matriz de Comisiones", () => {
  it("EMPRESAS_COMISIONAN incluye joystep", () => {
    expect(EMPRESAS_COMISIONAN).toContain("joystep");
  });

  it("son las 6 empresas con CXC, ni una más ni una menos", () => {
    expect([...EMPRESAS_COMISIONAN].sort()).toEqual([...B2B_EMPRESA_KEYS].sort());
    expect(EMPRESAS_COMISIONAN).toHaveLength(6);
  });

  it("se DERIVA de B2B_EMPRESA_KEYS — la lista no se escribe a mano", () => {
    // Si alguien la copiara literal, agregar una empresa B2B nueva dejaría
    // Comisiones atrás sin que nada se queje. Se exige identidad de contenido
    // Y de orden con la fuente.
    expect([...EMPRESAS_COMISIONAN]).toEqual([...B2B_EMPRESA_KEYS]);
  });
});

describe("🔴 nadie vuelve a restar joystep a mano", () => {
  // La 4ª copia de la lista era una línea suelta en `ComisionesView.tsx`:
  //   const EMPRESAS = B2B_EMPRESA_KEYS.filter((k) => k !== "joystep");
  // mientras las otras tres ya leían `EMPRESAS_COMISIONAN`. Ese banner de
  // "Sincronizado" habría seguido sin vigilar joystep.
  for (const rel of ARCHIVOS_DE_COMISIONES) {
    it(`${rel} no filtra joystep en código vivo`, () => {
      const src = codigo(rel);
      expect(src).not.toMatch(/!==\s*["'`]joystep["'`]/);
      expect(src).not.toMatch(/!=\s*["'`]joystep["'`]/);
      // Ni el patrón inverso: excluirlo con un `filter` por lista negra.
      expect(src).not.toMatch(/EXCLU\w*\s*=\s*\[[^\]]*joystep/i);
    });
  }

  it("el comentario de `empresas.ts` ya no miente", () => {
    const doc = readFileSync(
      path.join(process.cwd(), "src/lib/comisiones/empresas.ts"),
      "utf8",
    );
    expect(doc).not.toMatch(/Joystep[^\n]*NO comisiona/i);
    expect(doc).toMatch(/joystep/i); // el porqué queda escrito, no borrado
  });
});

describe("🔴 conducta: el endpoint consolidado pide la RPC de joystep", () => {
  beforeEach(() => { rpcCalls.length = 0; });

  it("dispara comision_b2b_v5 para las 6 empresas, joystep incluida", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/consolidado/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://x/api/ventas/comisiones/consolidado?year=2026&mes=7"),
    );
    expect(res.status).toBe(200);

    const pedidas = rpcCalls
      .filter((c) => c.fn === "comision_b2b_v5")
      .map((c) => c.args.p_empresa_key);
    expect(pedidas).toContain("joystep");
    expect([...pedidas].sort()).toEqual([...B2B_EMPRESA_KEYS].sort());

    // Y joystep llega hasta la respuesta, no se cae en el camino.
    const body = (await res.json()) as { empresas: { empresa_key: string }[] };
    expect(body.empresas.map((e) => e.empresa_key)).toContain("joystep");
    expect(body.empresas).toHaveLength(6);
  });

  it("la ruta por-empresa acepta `empresa=joystep` (no la rechaza con 400)", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://x/api/ventas/comisiones?empresa=joystep&year=2026&mes=7"),
    );
    expect(res.status).toBe(200);
  });
});

describe("🔴 el 0,5% sale del default de la RPC, no de escribir tasas", () => {
  const rpc = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260703120000_comision_b2b_v5_vendedor_factura.sql",
    ),
    "utf8",
  );

  it("comision_b2b_v5 usa 0.0050 (0,5%) cuando el vendedor no tiene tasa propia", () => {
    // 0.005 = 0,5%. Un punto decimal de más acá multiplica la comisión por 100.
    expect(rpc).toContain("COALESCE(t.tasa_venta, 0.0050)");
    expect(rpc).toContain("COALESCE(t.tasa_cobro, 0.0050)");
    expect(rpc).not.toMatch(/COALESCE\(t\.tasa_venta,\s*0\.5\b/);
  });

  it("la RPC no conoce a joystep: es la MISMA función para las 6 empresas", () => {
    // Si la RPC tuviera un caso especial por empresa, agregar joystep a la
    // lista del front no bastaría — y peor, las otras 5 podrían moverse.
    expect(rpc).not.toMatch(/joystep/i);
    expect(rpc).toContain("p_empresa_key");
  });

  it("las retenciones NO comisionan y TCKCTA queda fuera del cobro", () => {
    // Reglas duras que joystep hereda igual que las otras 5.
    expect(rpc).toContain("r.es_retencion = false");
    expect(rpc).toContain("'TCKCTA'");
  });
});
