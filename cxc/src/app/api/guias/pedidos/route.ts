/**
 * Guías › «Pedidos» (5-oct-2026, `PEDIDOS_BODEGA_2026_10`).
 *
 *   GET   → { pedidos: PedidoBodega[], actualizado: string | null }
 *   PATCH → { empresa_key, pedido_switch_id, estado } → { ok, cambiado_por, cambiado_en }
 *
 * Ven los de `PEDIDOS_VER_ROLES`; marcan solo admin y bodega. Sin montos:
 * la pantalla la ve bodega, así que `total` no sale de aquí. Lee `switch_pedidos` (lo escribe el cron de madrugada)
 * y escribe SOLO `pedidos_bodega_estado`. 🔴 No abre Switch: la ruta no saca
 * a nadie del panel. El quién sale de la cookie FIRMADA, nunca del cuerpo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  PEDIDOS_BODEGA_2026_10,
  PEDIDOS_BODEGA_ROLES,
  PEDIDOS_VER_ROLES,
  esEstadoPedido,
  ordenarPedidos,
  type EstadoPedido,
  type PedidoBodega,
} from "@/lib/guias/pedidos-bodega";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { aplicarAlias } from "@/lib/comisiones/alias";
import { leerAliasOVacio } from "@/lib/comisiones/exclusiones-server";

export const dynamic = "force-dynamic";

const apagado = () => NextResponse.json({ error: "No disponible" }, { status: 404 });

export async function GET(req: NextRequest) {
  if (!PEDIDOS_BODEGA_2026_10) return apagado();
  // VER: los de Guías (con v2); MARCAR (PATCH): solo admin y bodega.
  const auth = requireRole(req, [...PEDIDOS_VER_ROLES]);
  if (auth instanceof NextResponse) return auth;

  // ponytail: sin paginar; los Activo medidos el 5-oct son decenas, no miles.
  // El alias de Comisiones (REINALDO/REYNALDO/REINDALDO → una persona); falla abierto.
  const [ped, est, alias] = await Promise.all([
    supabaseServer
      .from("switch_pedidos")
      .select("empresa_key, pedido_switch_id, secuencial, fecha, cliente_codigo, cliente_nombre, vendedor_nombre, synced_at")
      .order("fecha")
      .limit(1000),
    supabaseServer.from("pedidos_bodega_estado").select("empresa_key, pedido_switch_id, estado, cambiado_por, cambiado_en").limit(5000),
    leerAliasOVacio(),
  ]);
  if (ped.error) return NextResponse.json({ error: "No se pudieron leer los pedidos" }, { status: 500 });
  if (est.error) return NextResponse.json({ error: "No se pudo leer el estado de bodega" }, { status: 500 });

  const marca = new Map((est.data ?? []).map((e) => [`${e.empresa_key}:${e.pedido_switch_id}`, e]));
  let actualizado: string | null = null;
  const pedidos: PedidoBodega[] = (ped.data ?? []).map((p) => {
    if (!actualizado || p.synced_at > actualizado) actualizado = p.synced_at;
    const m = marca.get(`${p.empresa_key}:${p.pedido_switch_id}`);
    return {
      empresa_key: p.empresa_key,
      pedido_switch_id: p.pedido_switch_id,
      secuencial: p.secuencial,
      fecha: p.fecha,
      cliente_codigo: p.cliente_codigo,
      cliente_nombre: p.cliente_nombre,
      vendedor_nombre: p.vendedor_nombre ? aplicarAlias(p.vendedor_nombre, alias) : null,
      estado: (m && esEstadoPedido(m.estado) ? m.estado : "pendiente") as EstadoPedido,
      cambiado_por: m?.cambiado_por ?? null,
      cambiado_en: m?.cambiado_en ?? null,
    };
  });
  return NextResponse.json({ pedidos: ordenarPedidos(pedidos), actualizado });
}

export async function PATCH(req: NextRequest) {
  if (!PEDIDOS_BODEGA_2026_10) return apagado();
  const auth = requireRole(req, [...PEDIDOS_BODEGA_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const empresa = String(body?.empresa_key ?? "");
  const id = Number(body?.pedido_switch_id);
  const estado = body?.estado;
  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa) || !Number.isInteger(id) || !esEstadoPedido(estado)) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  const fila = {
    empresa_key: empresa,
    pedido_switch_id: id,
    estado,
    cambiado_por: auth.userName || auth.userId,
    cambiado_en: new Date().toISOString(),
  };
  const { error } = await supabaseServer.from("pedidos_bodega_estado").upsert(fila, { onConflict: "empresa_key,pedido_switch_id" });
  if (error) return NextResponse.json({ error: "No se pudo guardar el estado" }, { status: 500 });
  return NextResponse.json({ ok: true, cambiado_por: fila.cambiado_por, cambiado_en: fila.cambiado_en });
}
