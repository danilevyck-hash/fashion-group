// Handler COMPARTIDO de los endpoints enviar-switch de Reebok y Joybees (los
// route files son wrappers de una línea). Resuelve pedido + cliente/vendedor
// guardados por el checkout (fallback a los defaults del piloto SOLO en Reebok
// legacy) y delega el envío al motor enviarPedidoSwitch. El caller cierra la
// sesión de Switch en su finally.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { enviarPedidoSwitch, type EnvioItem, type EnvioResult } from "@/lib/catalogo/switch-envio";

// El vendedor también puede consultar/reintentar el envío: crear+enviar desde
// el checkout ya es suyo — el Reintentar es la misma operación tras un fallo.
const SEND_ROLES = ["admin", "secretaria", "vendedor"];

interface OrderRow {
  id: string;
  order_number: string;
  client_name: string | null;
  status: string;
  cliente_switch_id?: number | null;
  vendedor_switch_id?: number | null;
  items: EnvioItem[];
}

async function fetchOrder(marca: string, orderId: string): Promise<OrderRow | null> {
  const cfg = MARCAS_CONFIG[marca];
  const db = await cfg.db();
  const itemCols = `product_id, sku, name, quantity, unit_price${marca === "reebok" ? ", is_preorder" : ""}`;
  // cliente/vendedor_switch_id pueden no existir aún (DDL 20260705120000
  // pendiente) → reintentar sin esas columnas (modo legacy).
  for (const withIds of [true, false]) {
    const cols = `id, order_number, client_name, status${withIds ? ", cliente_switch_id, vendedor_switch_id" : ""}, ${cfg.itemsRelation}(${itemCols})`;
    const { data, error } = await db.from(cfg.ordersTable).select(cols).eq("id", orderId).single();
    if (!error && data) {
      const row = data as unknown as Record<string, unknown>;
      return {
        id: String(row.id),
        order_number: String(row.order_number),
        client_name: (row.client_name as string) ?? null,
        status: String(row.status),
        cliente_switch_id: (row.cliente_switch_id as number) ?? null,
        vendedor_switch_id: (row.vendedor_switch_id as number) ?? null,
        items: (row[cfg.itemsRelation] as EnvioItem[]) ?? [],
      };
    }
    if (error && !/cliente_switch_id|vendedor_switch_id|column/i.test(error.message)) return null;
  }
  return null;
}

export async function handleGetEnvio(req: NextRequest, marca: string, orderId: string): Promise<NextResponse> {
  const auth = requireRole(req, SEND_ROLES);
  if (auth instanceof NextResponse) return auth;
  const cfg = MARCAS_CONFIG[marca];
  const db = await cfg.db();
  const { data, error } = await db
    .from(cfg.enviosTable)
    .select("estado, pedido_switch_id, numero_interno, error_detalle, created_at, updated_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // Tabla de envíos ausente (DDL pendiente en Joybees) → sin envío.
    if (/PGRST205|does not exist|could not find the table/i.test(`${error.code} ${error.message}`)) {
      return NextResponse.json({ envio: null, ddlPendiente: true });
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  return NextResponse.json({ envio: data ?? null });
}

export async function handlePostEnvio(req: NextRequest, marca: string, orderId: string): Promise<NextResponse> {
  const auth = requireRole(req, SEND_ROLES);
  if (auth instanceof NextResponse) return auth;
  const cfg = MARCAS_CONFIG[marca];
  const db = await cfg.db();

  let dry = false;
  try {
    const body = await req.json();
    dry = body?.dry === true;
  } catch { /* body vacío = envío real */ }

  const order = await fetchOrder(marca, orderId);
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  if (order.status !== "confirmado") {
    return NextResponse.json({ error: "Solo se pueden enviar a Switch pedidos confirmados" }, { status: 400 });
  }
  if (!order.items.length) {
    return NextResponse.json({ error: "El pedido no tiene productos" }, { status: 400 });
  }

  // Cliente/vendedor: los del checkout (guardados en el pedido) o, en Reebok
  // legacy, los defaults del piloto.
  const clienteId = order.cliente_switch_id ?? cfg.fallback?.clienteId ?? null;
  const vendedorId = order.vendedor_switch_id ?? cfg.fallback?.vendedorId ?? null;
  if (clienteId == null || vendedorId == null) {
    return NextResponse.json(
      { error: "El pedido no tiene cliente/vendedor de Switch asignados — créalo desde el checkout del catálogo" },
      { status: 422 },
    );
  }
  // Nombres para preview/Telegram (best-effort).
  let clienteNombre: string | null = order.cliente_switch_id == null ? cfg.fallback?.clienteNombre ?? null : null;
  if (clienteNombre == null) {
    const { data: cli } = await supabaseServer
      .from("switch_clientes")
      .select("nombre")
      .eq("empresa_key", cfg.empresaKey)
      .eq("cliente_switch_id", clienteId)
      .maybeSingle();
    clienteNombre = cli?.nombre ?? null;
  }
  let vendedorNombre: string | null = order.vendedor_switch_id == null ? cfg.fallback?.vendedorNombre ?? null : null;
  if (vendedorNombre == null) {
    const { data: v } = await supabaseServer
      .from("fg_user_switch_vendedor")
      .select("vendedor_nombre")
      .eq("empresa_key", cfg.empresaKey)
      .eq("vendedor_id", vendedorId)
      .limit(1)
      .maybeSingle();
    vendedorNombre = v?.vendedor_nombre ?? null;
  }

  // Categorías para el bulto (Switch trabaja en PIEZAS, el pedido en bultos).
  const { data: prods } = await db
    .from(cfg.productsTable)
    .select("id, category")
    .in("id", order.items.map((i) => i.product_id));
  const categoryByProduct = new Map((prods || []).map((p) => [String(p.id), p.category as string]));

  const result = await enviarPedidoSwitch({
    empresaKey: cfg.empresaKey,
    enviosTable: cfg.enviosTable,
    db,
    orderId: order.id,
    orderNumber: order.order_number,
    marcaLabel: cfg.label,
    items: order.items,
    bultoSize: cfg.bultoSize,
    categoryByProduct,
    clienteId,
    clienteNombre,
    vendedorId,
    vendedorNombre,
    dry,
  });

  return envioResultToResponse(result);
}

export function envioResultToResponse(r: EnvioResult): NextResponse {
  switch (r.kind) {
    case "preorders":
      return NextResponse.json(
        { error: `El pedido tiene ${r.count} producto(s) en preventa — no se pueden enviar a Switch (sin inventario todavía)` },
        { status: 400 },
      );
    case "ya_enviado":
      return NextResponse.json({ error: `Este pedido ya fue enviado a Switch (${r.detalle})` }, { status: 409 });
    case "carrera":
      return NextResponse.json({ error: "Este pedido ya tiene un envío en curso" }, { status: 409 });
    case "switch_caido":
      return NextResponse.json({ error: r.error }, { status: 502 });
    case "prevalidacion":
      return NextResponse.json({ error: "El pedido no pasa la pre-validación", errores: r.errores, warnings: r.warnings }, { status: 422 });
    case "preview":
      return NextResponse.json({ preview: r.preview });
    case "rechazado":
      return NextResponse.json({ error: r.error, warnings: r.warnings }, { status: 502 });
    case "ambiguo":
      return NextResponse.json({ error: r.error, ambiguo: true }, { status: 502 });
    case "ok":
      return NextResponse.json({ ok: true, numeroInterno: r.numeroInterno, pedidoSwitchId: r.pedidoSwitchId, verificado: r.verificado, warnings: r.warnings });
  }
}
