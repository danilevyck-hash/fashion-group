// ─────────────────────────────────────────────────────────────────────────────
// Eliminación masiva de pedidos (soft-delete) — COMPARTIDO Reebok/Joybees.
//
// Mismo borrado que el individual: deleted=true + deleted_at en la tabla
// física de cada fila (orders → *_orders, publicos → *_pedidos_publicos).
// NUNCA borrado físico y NUNCA toca la API de Switch: un pedido con envío
// activo (enviado/verificado en *_switch_envios) solo se OCULTA de fashiongr
// — sigue vivo en Switch y hay que anularlo en el panel. Por eso el resultado
// incluye `en_switch` con los numero_interno, para que el admin se los lleve.
//
// "Atómico razonable": se procesa TODO (un fallo no corta el batch) y se
// reporta por-ítem. Auditoría vía logActivity (activity_logs) — las tablas de
// pedidos NO tienen columna deleted_by (verificado contra esquema vivo
// 24-jul-2026), así que quién eliminó queda en el log, sin DDL nueva.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/log-activity";

export interface BulkDeleteItemInput {
  id: string;
  fuente: "orders" | "publicos";
}

export interface BulkDeleteItemResult {
  id: string;
  fuente: "orders" | "publicos";
  ok: boolean;
  /** numero_interno del envío ACTIVO en Switch (null si nunca se envió). */
  switch_numero: string | null;
  error?: string;
}

export interface BulkDeleteResult {
  eliminados: number;
  fallidos: number;
  /** Pedidos eliminados que SIGUEN en Switch — anular manual en el panel. */
  en_switch: { id: string; numero: string }[];
  resultados: BulkDeleteItemResult[];
}

// *_orders.id es UUID; *_pedidos_publicos.short_id es un slug corto. Un id
// malformado en un `.in()` tumbaría el batch COMPLETO en PostgREST (400), así
// que se valida por-ítem y los inválidos se reportan sin tocar la DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function idValido(item: BulkDeleteItemInput): boolean {
  return item.fuente === "orders" ? UUID_RE.test(item.id) : SHORT_ID_RE.test(item.id);
}

/**
 * Soft-delete masivo de pedidos de una marca. `ordersDb`/`publicosDb` van por
 * separado porque en Reebok las tablas viven en clients distintos
 * (reebok_orders → reebokServer, reebok_pedidos_publicos → supabaseServer);
 * en Joybees ambos son joybeesServer.
 */
export async function bulkDeletePedidos(opts: {
  marca: "reebok" | "joybees" | "tommy";
  ordersDb: SupabaseClient;
  publicosDb: SupabaseClient;
  ordersTable: string;
  publicosTable: string;
  enviosTable: string;
  pedidos: BulkDeleteItemInput[];
  session: { role: string; userName?: string };
}): Promise<BulkDeleteResult> {
  const { marca, ordersDb, publicosDb, ordersTable, publicosTable, enviosTable, session } = opts;

  // Dedupe conservando el orden de llegada.
  const vistos = new Set<string>();
  const pedidos = opts.pedidos.filter((p) => {
    const k = `${p.fuente}-${p.id}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  const orderIds = pedidos.filter((p) => p.fuente === "orders" && idValido(p)).map((p) => p.id);
  const publicoIds = pedidos.filter((p) => p.fuente === "publicos" && idValido(p)).map((p) => p.id);

  // Números de Switch de los envíos ACTIVOS ('enviado'/'verificado' — mismo
  // criterio que el candado #236/#237). Tolerante: si la tabla no responde,
  // el borrado sigue (solo se pierde el dato informativo del número).
  const switchNumeros = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: envios, error } = await ordersDb
      .from(enviosTable)
      .select("order_id, numero_interno, pedido_switch_id")
      .in("order_id", orderIds)
      .in("estado", ["enviado", "verificado"]);
    if (!error) {
      for (const e of envios || []) {
        switchNumeros.set(String(e.order_id), String(e.numero_interno || e.pedido_switch_id || "?"));
      }
    }
  }

  // Soft-delete por fuente, en batch, recogiendo qué filas SÍ se actualizaron
  // (via .select()) para poder reportar por-ítem. Un error en un batch marca
  // solo a sus ítems como fallidos — el otro batch se procesa igual.
  const deletedAt = new Date().toISOString();
  const okOrders = new Set<string>();
  const okPublicos = new Set<string>();
  let errOrders: string | null = null;
  let errPublicos: string | null = null;

  if (orderIds.length > 0) {
    const { data, error } = await ordersDb
      .from(ordersTable)
      .update({ deleted: true, deleted_at: deletedAt })
      .in("id", orderIds)
      .select("id");
    if (error) errOrders = "Error interno";
    else for (const row of data || []) okOrders.add(String(row.id));
  }

  if (publicoIds.length > 0) {
    const { data, error } = await publicosDb
      .from(publicosTable)
      .update({ deleted: true, deleted_at: deletedAt })
      .in("short_id", publicoIds)
      .select("short_id");
    if (error) errPublicos = "Error interno";
    else for (const row of data || []) okPublicos.add(String(row.short_id));
  }

  const resultados: BulkDeleteItemResult[] = pedidos.map((p) => {
    const numero = p.fuente === "orders" ? switchNumeros.get(p.id) ?? null : null;
    if (!idValido(p)) {
      return { id: p.id, fuente: p.fuente, ok: false, switch_numero: null, error: "Id inválido" };
    }
    const batchError = p.fuente === "orders" ? errOrders : errPublicos;
    if (batchError) {
      return { id: p.id, fuente: p.fuente, ok: false, switch_numero: numero, error: batchError };
    }
    const ok = p.fuente === "orders" ? okOrders.has(p.id) : okPublicos.has(p.id);
    return ok
      ? { id: p.id, fuente: p.fuente, ok: true, switch_numero: numero }
      : { id: p.id, fuente: p.fuente, ok: false, switch_numero: numero, error: "No encontrado" };
  });

  const eliminados = resultados.filter((r) => r.ok).length;
  const fallidos = resultados.length - eliminados;
  const en_switch = resultados
    .filter((r) => r.ok && r.switch_numero)
    .map((r) => ({ id: r.id, numero: r.switch_numero as string }));

  // Quién eliminó qué (sin columna deleted_by en las tablas → activity_logs).
  // logActivity ya es tolerante a fallos de insert (solo loggea a consola).
  await logActivity(
    session.role,
    "pedidos_bulk_delete",
    `catalogo_${marca}`,
    {
      total: resultados.length,
      eliminados,
      fallidos,
      orders: pedidos.filter((p) => p.fuente === "orders").map((p) => p.id),
      publicos: pedidos.filter((p) => p.fuente === "publicos").map((p) => p.id),
      en_switch,
    },
    session.userName,
  );

  return { eliminados, fallidos, en_switch, resultados };
}

export const MAX_BULK_PEDIDOS = 300;

/** Valida el body del POST bulk-delete. Devuelve la lista o un string de error. */
export function parseBulkDeleteBody(body: unknown): BulkDeleteItemInput[] | string {
  const pedidos = (body as { pedidos?: unknown } | null)?.pedidos;
  if (!Array.isArray(pedidos) || pedidos.length === 0) {
    return "Se requiere una lista de pedidos";
  }
  if (pedidos.length > MAX_BULK_PEDIDOS) {
    return `Máximo ${MAX_BULK_PEDIDOS} pedidos por operación`;
  }
  const out: BulkDeleteItemInput[] = [];
  for (const p of pedidos) {
    const id = (p as { id?: unknown } | null)?.id;
    const fuente = (p as { fuente?: unknown } | null)?.fuente;
    if (typeof id !== "string" || !id.trim() || (fuente !== "orders" && fuente !== "publicos")) {
      return "Cada pedido debe traer id y fuente ('orders' | 'publicos')";
    }
    out.push({ id: id.trim(), fuente });
  }
  return out;
}
