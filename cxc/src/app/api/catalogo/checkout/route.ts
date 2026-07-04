// ─────────────────────────────────────────────────────────────────────────────
// POST /api/catalogo/checkout — Confirmar y enviar a Switch en UN paso.
// Body: { marca, cliente: {id, nombre}, items: CartItem[], idempotency_key }.
//
// Flujo: (1) crea el pedido en DB vía el RPC idempotente de la marca y lo marca
// confirmado con cliente/vendedor de Switch guardados (Reintentar los usa);
// (2) dispara el envío al ERP con el motor compartido. Si Switch falla, el
// pedido YA quedó guardado — la respuesta lo dice y la confirmación ofrece
// Reintentar; el carrito solo se limpia en el cliente cuando (1) fue ok.
//
// Vendedor: AUTOMÁTICO por login (fg_user_switch_vendedor) — sin mapeo → 422
// SIN_VENDEDOR (el checkout lo muestra y bloquea antes, esto es el cinturón).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { enviarPedidoSwitch, type EnvioItem } from "@/lib/catalogo/switch-envio";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

const ROLES = ["admin", "secretaria", "vendedor"];

interface CheckoutItem extends EnvioItem {
  image_url?: string | null;
  category?: string | null;
}

async function handleCheckout(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const cfg = MARCAS_CONFIG[body?.marca || ""];
  if (!cfg) return NextResponse.json({ error: "marca inválida" }, { status: 400 });

  const clienteId = Number(body?.cliente?.id);
  const clienteNombre = typeof body?.cliente?.nombre === "string" ? body.cliente.nombre.trim() : "";
  const items: CheckoutItem[] = Array.isArray(body?.items) ? body.items : [];
  const idempotencyKey = typeof body?.idempotency_key === "string" ? body.idempotency_key : null;

  if (!Number.isInteger(clienteId) || clienteId <= 0 || !clienteNombre) {
    return NextResponse.json({ error: "Elige el cliente del pedido" }, { status: 400 });
  }
  if (!items.length) return NextResponse.json({ error: "El carrito está vacío" }, { status: 400 });
  for (const it of items) {
    if (!it.product_id || !(Number(it.quantity) > 0) || !(Number(it.unit_price) > 0)) {
      return NextResponse.json({ error: `Producto inválido en el carrito (${it.name || it.sku || "?"})` }, { status: 400 });
    }
  }
  if (items.some((i) => i.is_preorder === true)) {
    return NextResponse.json(
      { error: "El carrito tiene productos en preventa — quítalos para enviar a Switch (se piden aparte)" },
      { status: 422 },
    );
  }

  // ── Vendedor automático por login ──
  const { data: mapping } = await supabaseServer
    .from("fg_user_switch_vendedor")
    .select("vendedor_id, vendedor_nombre")
    .eq("user_id", auth.userId ?? "")
    .eq("empresa_key", cfg.empresaKey)
    .maybeSingle();
  if (!mapping) {
    return NextResponse.json(
      { error: "No tienes vendedor de Switch asignado — pídele al admin asignarlo en Sistema → Usuarios", code: "SIN_VENDEDOR" },
      { status: 422 },
    );
  }

  // ── Categorías (bulto) + total server-side ──
  const { data: prods } = await cfg.db
    .from(cfg.productsTable)
    .select("id, category")
    .in("id", items.map((i) => i.product_id));
  const categoryByProduct = new Map((prods || []).map((p) => [String(p.id), p.category as string]));
  const total = items.reduce(
    (s, i) => s + Number(i.quantity) * cfg.bultoSize(categoryByProduct.get(i.product_id)) * Number(i.unit_price),
    0,
  );

  // ── 1) Crear pedido en DB (RPC idempotente de la marca) ──
  const { data: created, error: rpcErr } = await cfg.db.rpc(cfg.createOrderRpc, {
    p_client_name: clienteNombre,
    p_vendor_name: mapping.vendedor_nombre || auth.userName || null,
    p_client_email: null,
    p_total: Math.round(total * 100) / 100,
    p_idempotency_key: idempotencyKey,
    p_items: items.map((i) => ({
      product_id: i.product_id,
      sku: i.sku || null,
      name: i.name || null,
      image_url: i.image_url || null,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      is_preorder: i.is_preorder === true,
    })),
  });
  if (rpcErr || !created) {
    return NextResponse.json({ error: `No se pudo guardar el pedido: ${rpcErr?.message || "?"}` }, { status: 500 });
  }
  // El RPC devuelve { order_id, order_number, already_created } — NO `id`.
  // (Bug del piloto 4-jul: leer .id daba "undefined" → redirect a
  // /confirmacion/undefined, update a 0 filas y envío nunca registrado.)
  const orderId = String((created as { order_id: string }).order_id ?? "");
  const orderNumber = String((created as { order_number: string }).order_number ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    console.error(`[checkout] RPC ${cfg.createOrderRpc} devolvió order_id inválido:`, JSON.stringify(created));
    return NextResponse.json({ error: "No se pudo guardar el pedido (id inválido). Intenta de nuevo." }, { status: 500 });
  }

  // Confirmado + cliente/vendedor de Switch guardados (para el Reintentar).
  // Tolerante a DDL 20260705120000 pendiente: sin las columnas, el envío de
  // ESTE request igual usa los ids explícitos de abajo.
  const { error: updErr } = await cfg.db
    .from(cfg.ordersTable)
    .update({ status: "confirmado", cliente_switch_id: clienteId, vendedor_switch_id: mapping.vendedor_id })
    .eq("id", orderId);
  if (updErr) {
    console.error(`[checkout] update cliente/vendedor falló (${updErr.message}) — reintento solo status`);
    const { error: updErr2 } = await cfg.db.from(cfg.ordersTable).update({ status: "confirmado" }).eq("id", orderId);
    if (updErr2) console.error(`[checkout] update status también falló: ${updErr2.message}`);
  }

  // ── 2) Envío a Switch (motor compartido) ──
  const result = await enviarPedidoSwitch({
    empresaKey: cfg.empresaKey,
    enviosTable: cfg.enviosTable,
    db: cfg.db,
    orderId,
    orderNumber,
    marcaLabel: cfg.label,
    items,
    bultoSize: cfg.bultoSize,
    categoryByProduct,
    clienteId,
    clienteNombre,
    vendedorId: mapping.vendedor_id,
    vendedorNombre: mapping.vendedor_nombre,
  });

  const base = { ok: true as const, order_id: orderId, order_number: orderNumber };
  switch (result.kind) {
    case "ok":
      return NextResponse.json({ ...base, switch: { ok: true, numeroInterno: result.numeroInterno, pedidoSwitchId: result.pedidoSwitchId, verificado: result.verificado, warnings: result.warnings } });
    case "ya_enviado": // reintento de un checkout que ya había pasado (idempotencia)
      return NextResponse.json({ ...base, switch: { ok: true, numeroInterno: result.detalle, verificado: false, warnings: [] } });
    case "prevalidacion":
      return NextResponse.json({ ...base, switch: { ok: false, error: "El pedido no pasa la pre-validación de Switch", errores: result.errores, warnings: result.warnings } });
    case "rechazado":
      return NextResponse.json({ ...base, switch: { ok: false, error: result.error, warnings: result.warnings } });
    case "ambiguo":
      return NextResponse.json({ ...base, switch: { ok: false, error: result.error, ambiguo: true } });
    case "switch_caido":
      return NextResponse.json({ ...base, switch: { ok: false, error: result.error } });
    case "preorders":
      return NextResponse.json({ ...base, switch: { ok: false, error: "Productos en preventa" } });
    case "carrera":
      return NextResponse.json({ ...base, switch: { ok: false, error: "Envío en curso — revisa la confirmación" } });
    default:
      return NextResponse.json({ ...base, switch: { ok: false, error: "Estado de envío desconocido" } });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    return await handleCheckout(req);
  } finally {
    await logoutAllSwitchSessions();
  }
}
