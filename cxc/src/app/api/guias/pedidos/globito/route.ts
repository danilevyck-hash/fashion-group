// ─────────────────────────────────────────────────────────────────────────────
// GET /api/guias/pedidos/globito (27-nov-2026, `MANTENER_PRESIONADO_2026_11`)
//
// El número rojo del ícono de la app, SOLO para bodega: cuántos pedidos están
// «Pendiente» (esperan «Iniciar preparación») entre las empresas que ESA
// persona ve (`empresasQueVe`: Jorman solo Vistana). Es la MISMA cuenta que la
// pestaña «Pendientes» de Despachos › Pedidos con «Todas las empresas».
// Cualquier otro rol recibe `{ pendientes: null }` (sin número). Solo lectura.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { empresasQueVe } from "@/lib/guias/pedidos-bultos";
import { PEDIDOS_FLUJO_SIMPLE_2026_10, estadoFlujoSimpleLeido } from "@/lib/guias/pedidos-flujo-simple";
import { PEDIDOS_VER_ROLES } from "@/lib/guias/pedidos-bodega";
import { MANTENER_PRESIONADO_2026_11 } from "@/lib/ui/mantener-presionado-2026-11";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...PEDIDOS_VER_ROLES]);
  if (auth instanceof NextResponse) return auth;
  if (!MANTENER_PRESIONADO_2026_11 || !PEDIDOS_FLUJO_SIMPLE_2026_10 || auth.role !== "bodega") {
    return NextResponse.json({ pendientes: null });
  }
  const empresas = [...empresasQueVe(auth.userName, auth.role)];
  try {
    // Los pedidos abiertos son decenas (como `GET /api/guias/pedidos`, con su mismo tope).
    const [ped, est] = await Promise.all([
      supabaseServer.from("switch_pedidos").select("empresa_key, pedido_switch_id").in("empresa_key", empresas).limit(1000),
      leerTodoPaginado<{ empresa_key: string; pedido_switch_id: number; estado: string }>("pedidos_bodega_estado (globito)", (pedirCount, a, b) =>
        supabaseServer
          .from("pedidos_bodega_estado")
          .select("empresa_key, pedido_switch_id, estado", pedirCount ? { count: "exact" } : {})
          .in("empresa_key", empresas)
          .order("empresa_key", { ascending: true })
          .order("pedido_switch_id", { ascending: true })
          .range(a, b),
      ),
    ]);
    if (ped.error) throw new Error(ped.error.message);
    const marca = new Map(est.map((e) => [`${e.empresa_key}:${e.pedido_switch_id}`, e.estado]));
    const pendientes = (ped.data ?? []).filter(
      (p) => estadoFlujoSimpleLeido(marca.get(`${p.empresa_key}:${p.pedido_switch_id}`)) === "pendiente",
    ).length;
    return NextResponse.json({ pendientes });
  } catch (e) {
    console.error(`[guias/pedidos/globito] ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "No se pudo contar" }, { status: 500 });
  }
}
