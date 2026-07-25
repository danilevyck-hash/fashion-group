// ─────────────────────────────────────────────────────────────────────────────
// "Duplicar y corregir" — handler COMPARTIDO Reebok/Joybees.
//
// Un pedido ya enviado a Switch no se puede editar (ver switch-lock.ts). Este
// handler lo clona (cliente + items + comentario + cliente/vendedor Switch)
// como pedido NUEVO en estado borrador, editable, con reemplaza_a apuntando al
// original. El original NO se borra: queda visible y marcado "Reemplazado por".
//
// Si ya existe un reemplazo activo del mismo original, devuelve ESE en vez de
// crear otro (yaExistia=true) — evita duplicados por doble click o dos users.
//
// Requiere la DDL 20260722120000 (columna reemplaza_a); si falta, responde 503
// con mensaje claro en vez de crear un duplicado sin trazabilidad.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getSession } from "@/lib/require-auth";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { getEnvioActivo } from "@/lib/catalogo/switch-lock";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { fetchReebokCategoryMap } from "@/lib/reebok-category-lookup";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";

const DUP_ROLES = ["admin", "secretaria", "vendedor"];
// Mismo fallback que el resto del flujo Reebok: nunca inflar a footwear=12.
const FALLBACK_CATEGORY = "apparel";

interface ItemRow {
  product_id: string;
  sku: string | null;
  name: string | null;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  is_preorder?: boolean | null;
}

interface OriginalRow {
  client_name: string | null;
  vendor_name: string | null;
  client_email: string | null;
  comment: string | null;
  cliente_switch_id: number | null;
  vendedor_switch_id: number | null;
  items: ItemRow[];
}

export async function handleDuplicarPedido(
  req: NextRequest,
  marca: string,
  orderId: string,
): Promise<NextResponse> {
  const auth = requireRole(req, DUP_ROLES);
  if (auth instanceof NextResponse) return auth;
  const session = getSession(req);
  const cfg = MARCAS_CONFIG[marca];
  const db = await cfg.db();

  // ── DDL disponible? (probe barato de la columna reemplaza_a) ──
  const probe = await db.from(cfg.ordersTable).select("id, reemplaza_a").eq("id", orderId).maybeSingle();
  if (probe.error) {
    if (/reemplaza_a|column/i.test(probe.error.message)) {
      return NextResponse.json(
        { error: "Duplicar no está disponible todavía — falta correr la migración 20260722120000 en la base de datos." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!probe.data) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  // ── Solo pedidos realmente bloqueados por Switch se duplican ──
  const envio = await getEnvioActivo(db, cfg.enviosTable, orderId);
  if (!envio) {
    return NextResponse.json(
      { error: "Este pedido no está en Switch — se puede editar directamente, no hace falta duplicarlo." },
      { status: 409 },
    );
  }

  // ── ¿Ya existe un reemplazo activo? → devolver ese, no crear otro ──
  const { data: existente } = await db
    .from(cfg.ordersTable)
    .select("id, order_number")
    .eq("reemplaza_a", orderId)
    .eq("deleted", false)
    .limit(1)
    .maybeSingle();
  if (existente) {
    return NextResponse.json({ ok: true, id: existente.id, order_number: existente.order_number, yaExistia: true });
  }

  // ── Pedido original (cliente + items). cliente/vendedor_switch_id pueden no
  //    existir aún (DDL 20260705120000 pendiente) → reintento sin ellas. ──
  const itemCols = `product_id, sku, name, image_url, quantity, unit_price${marca === "reebok" ? ", is_preorder" : ""}`;
  let original: OriginalRow | null = null;
  for (const withIds of [true, false]) {
    const cols = `id, order_number, client_name, vendor_name, client_email, comment${withIds ? ", cliente_switch_id, vendedor_switch_id" : ""}, ${cfg.itemsRelation}(${itemCols})`;
    const { data, error } = await db.from(cfg.ordersTable).select(cols).eq("id", orderId).single();
    if (!error && data) {
      const row = data as unknown as Record<string, unknown>;
      original = {
        client_name: (row.client_name as string) ?? null,
        vendor_name: (row.vendor_name as string) ?? null,
        client_email: (row.client_email as string) ?? null,
        comment: (row.comment as string) ?? null,
        cliente_switch_id: (row.cliente_switch_id as number) ?? null,
        vendedor_switch_id: (row.vendedor_switch_id as number) ?? null,
        items: (row[cfg.itemsRelation] as ItemRow[]) ?? [],
      };
      break;
    }
    if (error && !/cliente_switch_id|vendedor_switch_id|column/i.test(error.message)) {
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
  }
  if (!original) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  if (!original.items.length) {
    return NextResponse.json({ error: "El pedido no tiene productos para duplicar" }, { status: 400 });
  }

  // ── Total con la fórmula de cada marca (bulto por categoría en Reebok) ──
  let total = 0;
  if (marca === "reebok") {
    const categoryMap = await fetchReebokCategoryMap(original.items.map((i) => i.product_id));
    total = calculateReebokOrderTotal(
      original.items.map((i) => ({
        quantity: i.quantity || 1,
        unit_price: Number(i.unit_price) || 0,
        category: categoryMap.get(i.product_id) || FALLBACK_CATEGORY,
      })),
    );
  } else {
    total = calculateJoybeesOrderTotal(
      original.items.map((i) => ({ quantity: i.quantity || 1, unit_price: Number(i.unit_price) || 0 })),
    );
  }

  // ── Creación atómica vía RPC de la marca (numera PED-### sin race). El
  //    dedupe real es el chequeo de reemplazo activo de arriba; el token
  //    lleva sufijo para no chocar con reemplazos borrados y re-duplicados. ──
  const { data: created, error: rpcErr } = await db.rpc(cfg.createOrderRpc, {
    p_client_name: original.client_name || "Sin nombre",
    p_vendor_name: original.vendor_name || session?.userName || null,
    p_client_email: original.client_email || null,
    p_total: total,
    p_idempotency_key: `dup-${orderId}-${Date.now().toString(36)}`,
    p_items: original.items.map((i) => ({
      product_id: i.product_id,
      sku: i.sku || null,
      name: i.name || null,
      image_url: i.image_url || null,
      quantity: i.quantity || 1,
      unit_price: Number(i.unit_price) || 0,
      ...(marca === "reebok" ? { is_preorder: i.is_preorder === true } : {}),
    })),
  });
  if (rpcErr || !created) {
    return NextResponse.json({ error: "No se pudo crear el pedido duplicado. Intenta de nuevo." }, { status: 500 });
  }
  const { order_id, order_number } = created as { order_id: string; order_number: string };

  // ── Trazabilidad + comentario + cliente/vendedor Switch del original ──
  const update: Record<string, unknown> = { reemplaza_a: orderId };
  if (original.comment) update.comment = original.comment;
  if (original.cliente_switch_id != null) update.cliente_switch_id = original.cliente_switch_id;
  if (original.vendedor_switch_id != null) update.vendedor_switch_id = original.vendedor_switch_id;
  let upErr = (await db.from(cfg.ordersTable).update(update).eq("id", order_id)).error;
  if (upErr && /cliente_switch_id|vendedor_switch_id/i.test(upErr.message)) {
    const soloTraza: Record<string, unknown> = { reemplaza_a: orderId };
    if (original.comment) soloTraza.comment = original.comment;
    upErr = (await db.from(cfg.ordersTable).update(soloTraza).eq("id", order_id)).error;
  }
  if (upErr) {
    // El duplicado quedó creado pero SIN marca de reemplazo → avisar claro
    // (sin la marca no saldría el recordatorio anti-duplicado al enviarlo).
    return NextResponse.json(
      {
        error: `El pedido se duplicó como ${order_number} pero no se pudo marcar como reemplazo. Revísalo antes de enviarlo a Switch.`,
        id: order_id,
        order_number,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: order_id, order_number, yaExistia: false });
}
