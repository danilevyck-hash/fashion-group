// Detalle / edición / soft-delete de un pedido interno, dirigido por config.
//
// GET: total SIEMPRE re-calculado desde items (nunca la columna guardada);
// en Reebok además enriquece items con category (bulto 6/12). Pedido
// inexistente responde 500 — contrato ACTUAL fijado por el arnés (sin 404).
// PUT: candado post-envío a Switch (#236) solo para cambios de CONTENIDO;
// reemplazo de items atómico vía RPC. DELETE: soft-delete visual.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { getEnvioActivo, switchLockResponse, fetchReemplazoInfo } from "@/lib/catalogo/switch-lock";

const EDIT_ROLES = ["admin", "secretaria", "vendedor"];
const DELETE_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { marca: string; id: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = await cfg.db();
  const itemCols = `id, order_id, product_id, sku, name, image_url, quantity, unit_price, created_at${cfg.itemsHasPreorder ? ", is_preorder" : ""}`;
  const { data, error } = await db
    .from(cfg.ordersTable)
    .select(
      `id, order_number, client_name, vendor_name, client_email, comment, total, created_at, updated_at, idempotency_key, status${cfg.ordersSelectExtra}, ${cfg.itemsRelation}(${itemCols})`,
    )
    .eq("id", params.id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const row = data as unknown as Record<string, unknown>;
  const items = (row[cfg.itemsRelation] || []) as { product_id: string; quantity: number; unit_price: number }[];

  // Reebok: pedidos viejos pueden tener total inflado en la columna (bulto 12 a
  // ciegas) — items enriquecidos con category y total recalculado con bulto
  // correcto por categoría, sin tocar la DB. Joybees: recalcula con bulto 12.
  let itemsOut: Record<string, unknown>[] = items as unknown as Record<string, unknown>[];
  let recalcTotal: number;
  if (cfg.categoryLookup) {
    const categoryMap = await cfg.categoryLookup(items.map((i) => i.product_id));
    const enrichedItems = items.map((i) => ({
      ...i,
      category: categoryMap.get(i.product_id) || cfg.fallbackCategory,
    }));
    itemsOut = enrichedItems as unknown as Record<string, unknown>[];
    recalcTotal = cfg.calcTotal(
      enrichedItems.map((i) => ({
        quantity: i.quantity,
        unit_price: i.unit_price,
        category: i.category || undefined,
      })),
    );
  } else {
    recalcTotal = cfg.calcTotal(
      items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price })),
    );
  }

  // Trazabilidad de reemplazo (Duplicar y corregir). Tolerante a la DDL
  // 20260722120000 pendiente (todo null hasta que corra).
  const reemplazo = await fetchReemplazoInfo(db, cfg.ordersTable, cfg.enviosTable, params.id);

  return NextResponse.json({
    ...row,
    ...(cfg.categoryLookup ? { [cfg.itemsRelation]: itemsOut } : {}),
    total: recalcTotal,
    ...reemplazo,
  });
}

export async function PUT(req: NextRequest, { params }: { params: { marca: string; id: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const session = getSession(req);
  if (!session || !EDIT_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso para editar" }, { status: 403 });
  }

  const { client_name, vendor_name, client_email, comment, items, status } = await req.json();
  const db = await cfg.db();

  // ── Candado post-envío a Switch (defensa en profundidad) ──
  // Solo bloquea CONTENIDO (cliente, items, precios, comentario). Un PUT de
  // solo status —el flujo "Editar y re-enviar pedido" del email— sigue pasando.
  const tieneContenido = [client_name, vendor_name, client_email, comment, items].some((v) => v !== undefined);
  if (tieneContenido) {
    const envio = await getEnvioActivo(db, cfg.enviosTable, params.id);
    if (envio) return switchLockResponse(envio);
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (client_name !== undefined) update.client_name = client_name;
  if (vendor_name !== undefined) update.vendor_name = vendor_name;
  if (client_email !== undefined) update.client_email = client_email;
  if (comment !== undefined) update.comment = comment;
  if (status !== undefined) update.status = status;

  if (items && Array.isArray(items)) {
    type IncomingItem = {
      product_id: string;
      sku?: string;
      name?: string;
      image_url?: string;
      quantity: number;
      unit_price: number;
      category?: string;
      is_preorder?: boolean;
    };
    const typedItems = items as IncomingItem[];

    let total: number;
    if (cfg.categoryLookup) {
      const categoryMap = await cfg.categoryLookup(typedItems.map((i) => i.product_id));
      total = cfg.calcTotal(
        typedItems.map((i) => ({
          quantity: i.quantity || 1,
          unit_price: Number(i.unit_price) || 0,
          category: categoryMap.get(i.product_id) || i.category || cfg.fallbackCategory || undefined,
        })),
      );
    } else {
      total = cfg.calcTotal(
        typedItems.map((i) => ({ quantity: i.quantity || 1, unit_price: Number(i.unit_price) || 0 })),
      );
    }

    // Reemplazo atómico de items + total vía RPC (delete+insert+update en UNA
    // transacción). Si el insert falla tras el delete, todo hace rollback y el
    // pedido nunca queda vacío (antes era delete()+insert() sin transacción).
    const { error: rpcErr } = await db.rpc(cfg.replaceItemsRpc, {
      p_order_id: params.id,
      p_total: total,
      p_items: typedItems.map((i) => ({
        product_id: i.product_id,
        sku: i.sku || null,
        name: i.name || null,
        image_url: i.image_url || null,
        quantity: i.quantity || 1,
        unit_price: Number(i.unit_price) || 0,
        ...(cfg.itemsHasPreorder ? { is_preorder: i.is_preorder === true } : {}),
      })),
    });
    if (rpcErr) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // Campos escalares (client_name, vendor_name, etc.): update seguro aparte.
  // El total y updated_at de los items ya los fijó la RPC.
  const { error } = await db.from(cfg.ordersTable).update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  // El email se envía aparte vía /api/catalogo/<marca>/send-order para evitar
  // correos duplicados cuando el frontend también llama send-order.

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { marca: string; id: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const session = getSession(req);
  if (!session || !DELETE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Solo admin y secretaria pueden eliminar" }, { status: 403 });
  }

  // Soft-delete (borrado VISUAL): no toca Switch, queda recuperable en DB. La
  // vista unificada excluye deleted=true (y la lista Joybees filtra en query).
  const db = await cfg.db();
  const { error } = await db
    .from(cfg.ordersTable)
    .update({ deleted: true, deleted_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
