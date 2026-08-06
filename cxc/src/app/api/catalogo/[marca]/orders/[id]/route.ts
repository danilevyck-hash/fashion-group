// Detalle / edición / soft-delete de un pedido interno, dirigido por config.
//
// GET: total SIEMPRE re-calculado desde items (nunca la columna guardada);
// en Reebok además enriquece items con category (bulto 6/12). Pedido
// inexistente responde 500 — contrato ACTUAL fijado por el arnés (sin 404).
// Si el pedido vino del LINK público, además se le pega la foto del stock del
// momento de la confirmación (disponible_pzas por item) para que la secretaria
// vea la cantidad REAL que había — sin recalcular con el stock de hoy.
// PUT: candado post-envío a Switch (#236) solo para cambios de CONTENIDO;
// reemplazo de items atómico vía RPC. DELETE: soft-delete visual.

import { NextRequest, NextResponse } from "next/server";
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";
import { getSession } from "@/lib/require-auth";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { getEnvioActivo, switchLockResponse, fetchReemplazoInfo } from "@/lib/catalogo/switch-lock";

const EDIT_ROLES = ["admin", "secretaria", "vendedor"];

interface StockLineaGuardada {
  product_id: string;
  pedido_pzas: number;
  disponible_pzas: number;
  bulto_pzas?: number;
}

/** stock_confirmacion de la fila pública que originó el pedido (origen 'link').
 *  null = pedido presencial, sin foto, o DDL 20260725130000 pendiente. */
async function fetchStockConfirmacion(
  cfg: NonNullable<ReturnType<typeof getMarcaConfig>>,
  origenShortId: string | null,
): Promise<StockLineaGuardada[] | null> {
  if (!origenShortId) return null;
  try {
    const publicosDb = await cfg.publicosDb();
    const { data, error } = await publicosDb
      .from(cfg.publicosTable)
      .select("stock_confirmacion")
      .eq("short_id", origenShortId)
      .maybeSingle();
    if (error || !data) return null;
    const stock = (data as { stock_confirmacion?: unknown }).stock_confirmacion;
    return Array.isArray(stock) ? (stock as StockLineaGuardada[]) : null;
  } catch {
    return null;
  }
}
const DELETE_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { marca: string; id: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = await cfg.db();
  const itemCols = `id, order_id, product_id, sku, name, image_url, quantity, unit_price, created_at${cfg.itemsHasPreorder ? ", is_preorder" : ""}`;
  // origen_short_id se necesita en las 3 marcas para cruzar la foto de stock
  // del pedido del link; en Reebok ya viene en ordersSelectExtra. Si alguna
  // marca no tuviera la columna se reintenta sin ella (tolerante).
  const colsBase = `id, order_number, client_name, vendor_name, client_email, comment, total, created_at, updated_at, idempotency_key, status${cfg.ordersSelectExtra}`;
  const extraOrigen = cfg.ordersSelectExtra.includes("origen_short_id") ? "" : ", origen_short_id";
  let data: Record<string, unknown> | null = null;
  for (const extra of [extraOrigen, ""]) {
    const res = await db
      .from(cfg.ordersTable)
      .select(`${colsBase}${extra}, ${cfg.itemsRelation}(${itemCols})`)
      .eq("id", params.id)
      .single();
    if (!res.error && res.data) {
      data = res.data as unknown as Record<string, unknown>;
      break;
    }
    if (extra === "") return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const row = data;
  const items = (row[cfg.itemsRelation] || []) as { product_id: string; quantity: number; unit_price: number }[];

  // Reebok: pedidos viejos pueden tener total inflado en la columna (bulto 12 a
  // ciegas) — items enriquecidos con category y total recalculado con bulto
  // correcto por categoría, sin tocar la DB. Joybees: recalcula con bulto 12.
  //
  // 🩸 SE ENRIQUECE SIEMPRE, no solo cuando la marca tiene `categoryLookup`.
  // Tommy lo tiene en null (su bulto no depende de la categoría) y por eso sus
  // items llegaban PELADOS a todos lados: el total se recalculaba con 12 fijo y
  // el PDF también. Fue el bug de TOM-003 — un estilo de 8 facturado como 12.
  // La CATEGORÍA se sigue resolviendo con `cfg.categoryLookup` — no se toca:
  // Reebok la lee con su propio cliente de base y cambiarlo le rompió el total
  // recalculado en las pruebas. Lo único que se agrega son las PIEZAS.
  const categoryByProduct = cfg.categoryLookup
    ? await cfg.categoryLookup(items.map((i) => i.product_id))
    : new Map<string, string>();
  const { bultoPzasByProduct } = await leerCategoriaYBulto(
    db as never,
    cfg.productsTable,
    items.map((i) => i.product_id),
  );
  const enrichedItems = items.map((i) => ({
    ...i,
    category: categoryByProduct.get(i.product_id) || cfg.fallbackCategory || undefined,
    bulto_pzas: bultoPzasByProduct.get(i.product_id) ?? null,
  }));
  let itemsOut: Record<string, unknown>[] = enrichedItems as unknown as Record<string, unknown>[];
  const recalcTotal = cfg.calcTotal(
    enrichedItems.map((i) => ({
      quantity: i.quantity,
      unit_price: i.unit_price,
      category: i.category || undefined,
      bulto_pzas: i.bulto_pzas,
    })),
  );

  // Trazabilidad de reemplazo (Duplicar y corregir). Tolerante a la DDL
  // 20260722120000 pendiente (todo null hasta que corra).
  const reemplazo = await fetchReemplazoInfo(db, cfg.ordersTable, cfg.enviosTable, params.id);

  // Foto del stock al confirmar (solo pedidos del link). Tolerante a la DDL
  // 20260725130000 pendiente: sin la columna, queda null y la UI no muestra
  // nada — el pedido se ve igual que siempre.
  const stockConfirmacion = await fetchStockConfirmacion(cfg, row.origen_short_id as string | null);
  if (stockConfirmacion) {
    const porProducto = new Map(stockConfirmacion.map((l) => [l.product_id, l]));
    itemsOut = itemsOut.map((i) => {
      const l = porProducto.get(String(i.product_id));
      return l ? { ...i, disponible_pzas: l.disponible_pzas, bulto_pzas: l.bulto_pzas } : i;
    });
  }

  return NextResponse.json({
    ...row,
    [cfg.itemsRelation]: itemsOut,
    total: recalcTotal,
    stock_confirmacion: stockConfirmacion,
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

    // Mismo criterio que al LEER: categoría y piezas por bulto SIEMPRE, no solo
    // cuando la marca tiene `categoryLookup`. Editar un pedido de Tommy con la
    // rama de abajo le habría vuelto a escribir el total con 12 fijo — el bug
    // de TOM-003 otra vez, esta vez al corregir el pedido.
    const catEdicion = cfg.categoryLookup
      ? await cfg.categoryLookup(typedItems.map((i) => i.product_id))
      : new Map<string, string>();
    const { bultoPzasByProduct: bultoEdicion } = await leerCategoriaYBulto(
      db as never,
      cfg.productsTable,
      typedItems.map((i) => i.product_id),
    );
    const total = cfg.calcTotal(
      typedItems.map((i) => ({
        quantity: i.quantity || 1,
        unit_price: Number(i.unit_price) || 0,
        category: catEdicion.get(i.product_id) || i.category || cfg.fallbackCategory || undefined,
        bulto_pzas: bultoEdicion.get(i.product_id) ?? null,
      })),
    );

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
