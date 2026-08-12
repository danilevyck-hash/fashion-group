// ─────────────────────────────────────────────────────────────────────────────
// "Duplicar y corregir" — handler COMPARTIDO Reebok/Joybees/Tommy.
//
// Un pedido ya enviado a Switch no se puede editar (ver switch-lock.ts). Este
// handler lo clona (cliente + items + comentario + cliente/vendedor Switch)
// como pedido NUEVO en estado borrador, editable, con reemplaza_a apuntando al
// original. El original NO se borra: queda visible y marcado "Reemplazado por".
//
// El body puede traer `client_name` (el mini-modal de Duplicar lo manda): si el
// nombre CAMBIÓ respecto del original, el clon sale con el nombre nuevo y SIN
// `cliente_switch_id` — copiarlo a ciegas mandaría el pedido a Switch bajo el
// cliente VIEJO. Con el nombre igual (o sin body) se copia como siempre.
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
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";

const DUP_ROLES = ["admin", "secretaria", "vendedor"];

/** ¿El nombre pedido es OTRO cliente? Espacios y mayúsculas no cuentan como
 *  cambio (retipear "juan" por "Juan" es la misma persona). */
export function nombreClienteCambio(nuevo: string | null, original: string | null): boolean {
  const n = (nuevo ?? "").trim();
  const o = (original ?? "").trim();
  return n !== "" && n.toLowerCase() !== o.toLowerCase();
}

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

  // Body opcional {client_name}: el POST histórico va sin body (→ {}).
  const body = (await req.json().catch(() => ({}))) as { client_name?: unknown };
  const nombrePedido = typeof body.client_name === "string" ? body.client_name : null;

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
  const itemCols = `product_id, sku, name, image_url, quantity, unit_price${cfg.itemsHasPreorder ? ", is_preorder" : ""}`;
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

  // ── Total con el `calcTotal` de la marca (mismo criterio que el PUT del
  //    pedido): categoría vía cfg.categoryLookup (Reebok, bulto 6/12) y piezas
  //    por bulto del ESTILO (Tommy, bulto_pzas 8/12). Antes Tommy caía en la
  //    fórmula de Joybees (12 fijo) y el total guardado salía inflado. ──
  const idsOriginal = original.items.map((i) => i.product_id);
  const categoryMap = cfg.categoryLookup
    ? await cfg.categoryLookup(idsOriginal)
    : new Map<string, string>();
  const { bultoPzasByProduct } = await leerCategoriaYBulto(db as never, cfg.productsTable, idsOriginal);
  const total = cfg.calcTotal(
    original.items.map((i) => ({
      quantity: i.quantity || 1,
      unit_price: Number(i.unit_price) || 0,
      category: categoryMap.get(i.product_id) || cfg.fallbackCategory || undefined,
      bulto_pzas: bultoPzasByProduct.get(i.product_id) ?? null,
    })),
  );

  // ── ¿Cambió el cliente? Con nombre nuevo el clon NO hereda cliente_switch_id:
  //    iría a Switch bajo el cliente viejo. Se re-elige en el detalle. ──
  const clienteCambio = nombreClienteCambio(nombrePedido, original.client_name);
  const clientNameClon = clienteCambio ? nombrePedido!.trim() : original.client_name || "Sin nombre";

  // ── Creación atómica vía RPC de la marca (numera PED-### sin race). El
  //    dedupe real es el chequeo de reemplazo activo de arriba; el token
  //    lleva sufijo para no chocar con reemplazos borrados y re-duplicados. ──
  const { data: created, error: rpcErr } = await db.rpc(cfg.createOrderRpc, {
    p_client_name: clientNameClon,
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
      ...(cfg.itemsHasPreorder ? { is_preorder: i.is_preorder === true } : {}),
    })),
  });
  if (rpcErr || !created) {
    return NextResponse.json({ error: "No se pudo crear el pedido duplicado. Intenta de nuevo." }, { status: 500 });
  }
  const { order_id, order_number } = created as { order_id: string; order_number: string };

  // ── Trazabilidad + comentario + cliente/vendedor Switch del original.
  //    Con el nombre CAMBIADO, cliente_switch_id NO viaja (queda null → se
  //    re-elige en el detalle, default Contado). El vendedor sí se copia:
  //    cambiar de cliente no cambia quién vende. ──
  const update: Record<string, unknown> = { reemplaza_a: orderId };
  if (original.comment) update.comment = original.comment;
  if (!clienteCambio && original.cliente_switch_id != null) update.cliente_switch_id = original.cliente_switch_id;
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
