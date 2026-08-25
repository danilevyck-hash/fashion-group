// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/utilidad-cliente?year=YYYY
//
// Tab Utilidad de Ventas: utilidad real por cliente. Lee switch_factura_utilidad
// (reporte web, la misma fuente que Comisiones — cuadra al centavo).
// Las NC se guardan negativas → ventas/utilidad netas pueden ser negativas
// (devoluciones > ventas): dato válido, se pasa tal cual al cliente.
//
// 🔴 LAS EMPRESAS SE DERIVAN, NO SE ESCRIBEN. La lista sale de
// `empresasConUtilidad()` — la MISMA fuente única (`EMPRESA_SYNC_CAPABILITIES`)
// de la que salen el sync de utilidad y el cronograma de crons — y viaja POR
// PARÁMETRO a la RPC. La v1 de `utilidad_por_cliente` llevaba las cinco
// empresas escritas a mano adentro del SQL y `joystep` había quedado afuera:
// su utilidad se sincroniza desde el 27-jul-2026 y ya comisiona, pero esta
// pantalla no la dibujaba. Es el mismo olvido que costó 15.262,00 de cobros
// invisibles. Con la lista derivada no puede repetirse: no hay copia que se
// aparte.
//
// ⚠️ FALLBACK: mientras la migración 20260824180000 no la haya corrido Daniel a
// mano, `utilidad_por_cliente_v2` no existe y se cae sola a la v1 (5 empresas,
// lo que se ve hoy). La pantalla NUNCA queda en blanco por eso.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { empresasConUtilidad } from "@/lib/switch-api/empresas";
import { EMPRESAS_UTILIDAD_V1 } from "@/lib/ventas/utilidad-cliente";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";
import { empresaNombre, type UtilidadClienteResponse, type UtilidadClienteRow } from "@/lib/ventas/utilidad-cliente";

export const dynamic = "force-dynamic";

interface RpcRow {
  empresa_key: string | null;
  cliente_switch_id: number | null;
  cliente: string | null;
  n_docs: number | string;
  total_subtotal: number | string;
  total_costo: number | string;
  total_utilidad: number | string;
  pct_utilidad: number | string | null;
}

const num = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  // La lista DERIVADA. Si la v2 todavía no existe en la base, el fallback usa la
  // v1 y ésa lleva sus cinco empresas adentro del SQL: el alcance REAL de la
  // respuesta pasa a ser otro, y la pantalla tiene que poder decirlo (el título
  // del Excel dice cuántas empresas se están mirando). Por eso el alcance viaja
  // en el cuerpo en vez de escribirse a mano en la pantalla.
  const empresasDerivadas = empresasConUtilidad();
  let empresas: string[] = empresasDerivadas;

  const { data, error } = await rpcConFallbackDeVersion(
    () => supabaseServer.rpc("utilidad_por_cliente_v2", { p_anio: year, p_empresas: empresasDerivadas }),
    () => {
      empresas = [...EMPRESAS_UTILIDAD_V1];
      return supabaseServer.rpc("utilidad_por_cliente", { p_anio: year });
    },
    { label: "utilidad_por_cliente_v2" },
  );
  if (error) {
    console.error("[api/ventas/utilidad-cliente]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: UtilidadClienteRow[] = ((data ?? []) as RpcRow[]).map((r) => {
    const ventas = num(r.total_subtotal);
    const costo = num(r.total_costo);
    const utilidad = num(r.total_utilidad);
    const ek = r.empresa_key ?? "";
    return {
      clienteSwitchId: r.cliente_switch_id ?? null,
      cliente: r.cliente ?? "(Sin nombre)",
      empresaKey: ek,
      empresa: empresaNombre(ek),
      nDocs: num(r.n_docs),
      ventas,
      costo,
      utilidad,
      // margen como fracción; null si no hay base de venta positiva (evita % engañoso).
      margen: ventas > 0 ? utilidad / ventas : null,
    };
  });

  const tV = rows.reduce((s, r) => s + r.ventas, 0);
  const tC = rows.reduce((s, r) => s + r.costo, 0);
  const tU = rows.reduce((s, r) => s + r.utilidad, 0);

  const body: UtilidadClienteResponse = {
    year,
    empresas,
    totales: { ventas: tV, costo: tC, utilidad: tU, margen: tV > 0 ? tU / tV : null },
    rows,
  };
  return NextResponse.json(body);
}
