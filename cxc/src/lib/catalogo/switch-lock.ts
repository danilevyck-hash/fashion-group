// ─────────────────────────────────────────────────────────────────────────────
// Candado de edición post-envío a Switch — COMPARTIDO Reebok/Joybees.
//
// El API de Switch NO permite editar ni anular pedidos (solo crear). Un pedido
// con envío ACTIVO en *_switch_envios (estado 'enviado' o 'verificado') queda
// de solo lectura aquí: editarlo desincronizaría el ERP. 'pendiente' (intento
// registrado, POST aún sin respuesta) NO bloquea; 'error' libera el candado.
//
// La corrección de un pedido bloqueado es "Duplicar y corregir" (ver
// duplicar-pedido.ts): clona como pedido NUEVO en borrador con reemplaza_a
// apuntando al original. El "Reemplazado por" se deriva con query inversa
// (orders WHERE reemplaza_a = id AND deleted = false), sin columna espejo.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  ESTADOS_EN_SWITCH,
  palabraEnSwitch,
  type EnvioParaPalabra,
} from "@/lib/catalogo/documento-switch";

export interface EnvioActivo {
  estado: string;
  /** Número visible del pedido en Switch (numero_interno, fallback al id). */
  numero: string;
}

/** Envío activo (no-'error', no-'pendiente') del pedido, o null si no hay. */
export async function getEnvioActivo(
  db: SupabaseClient,
  enviosTable: string,
  orderId: string,
): Promise<EnvioActivo | null> {
  const { data, error } = await db
    .from(enviosTable)
    .select("estado, numero_interno, pedido_switch_id")
    .eq("order_id", orderId)
    .in("estado", ["enviado", "verificado"])
    .limit(1)
    .maybeSingle();
  // Tabla de envíos ausente (DDL pendiente) u otro error de lectura → sin
  // candado: la edición normal de pedidos nunca enviados no se rompe por esto.
  if (error || !data) return null;
  return {
    estado: String(data.estado),
    numero: String(data.numero_interno || data.pedido_switch_id || "?"),
  };
}

/**
 * ── LA PESTAÑA DE LA LISTA DE PEDIDOS SE DECIDE ACÁ ──
 *
 * Daniel, 14-ago-2026, textual: *"Tienen q haber dos secciones. Borradores y
 * pedidos a switch. Y en pedidos a switch tiene que estar el número de switch
 * en el pedido para saber cuál es cuál."*
 *
 * O sea que la pestaña NO la decide el estado interno (`status`), sino si el
 * pedido TIENE ENVÍO ACTIVO EN SWITCH — el MISMO criterio que el candado de
 * edición de acá arriba (#236/#237). Una sola definición de "está en Switch"
 * para las dos cosas: si no se puede editar porque ya salió, entonces está en
 * la pestaña de los que salieron. Nunca pueden discrepar.
 *
 * 🩸 POR QUÉ NO SE USA `status`, medido contra producción el 14-ago-2026:
 *   · 7 pedidos en `confirmado` NUNCA llegaron a Switch (PED-001/002/003/004
 *     y TOM-007/008/009, estos tres del 12-ago — no es historia vieja).
 *   · PED-018 decía `borrador` y SÍ está en Switch (#16-000000506).
 * `confirmado` se escribe ANTES de llamar a Switch y queda escrito aunque la
 * llamada falle. Rotular eso "Enviados a Switch" habría mentido sobre 8
 * pedidos. Con el número a la vista, la etiqueta no puede mentir: el número
 * ES la prueba.
 *
 * El Map devuelve UNA ENTRADA POR PEDIDO CON ENVÍO ACTIVO. La entrada existe
 * ⇔ el pedido está en Switch. `numero` es null solo si el envío está activo
 * pero sin `numero_interno` ni `pedido_switch_id` — hoy eso NO pasa (los 31
 * envíos activos de las 4 marcas están `verificado` y los 31 tienen número),
 * y se devuelve null en vez de inventar un "?" para que quien lo pinte decida
 * mostrarlo como el problema que es.
 */
export async function numerosSwitchPorPedido(
  db: SupabaseClient,
  enviosTable: string,
  orderIds: string[],
): Promise<Map<string, string | null>> {
  const fuera = new Map<string, string | null>();
  if (orderIds.length === 0) return fuera;
  const { data, error } = await db
    .from(enviosTable)
    .select("order_id, numero_interno, pedido_switch_id")
    .in("order_id", orderIds)
    .in("estado", ["enviado", "verificado"]);
  // Tabla ausente (DDL pendiente) u otro error → nadie queda en "Pedidos a
  // Switch". Fail-open hacia Borradores: es la lectura conservadora, y el
  // candado de edición usa la misma tolerancia.
  if (error || !data) return fuera;
  for (const e of data) {
    const num = e.numero_interno || e.pedido_switch_id;
    fuera.set(String(e.order_id), num ? String(num) : null);
  }
  return fuera;
}

/**
 * ── 🔴 LA PALABRA QUE VA EN EL PAPEL, LEÍDA DE LA FUENTE ÚNICA (25-ago-2026) ──
 *
 * «Pedido» si el envío ACTIVO fue un pedido, «Cotización» si fue una
 * cotización, y `null` si este pedido TODAVÍA NO SALIÓ a Switch — ahí no es
 * ninguna de las dos y no se le inventa etiqueta.
 *
 * Existe porque el PDF que recibe el cliente decía «Pedido: TOM-027» aunque lo
 * mandado hubiera sido una cotización. La regla vive en `documento-switch.ts`
 * (módulo puro); acá está solo la LECTURA, con el escalón tolerante de siempre:
 * si la columna `documento` no existe todavía (DDL `20260824160000` pendiente)
 * se relee sin ella y sale «Pedido», que es lo único que este sistema sabía
 * crear antes del 24-ago-2026.
 *
 * ⚠️ Cualquier error de lectura devuelve `null` — o sea, la palabra de siempre.
 * Un PDF que no se genera es peor que un PDF con el rótulo por defecto.
 */
export async function palabraDelEnvioActivo(
  db: SupabaseClient,
  enviosTable: string,
  orderId: string,
): Promise<string | null> {
  const filtrar = (cols: string) =>
    db
      .from(enviosTable)
      .select(cols)
      .eq("order_id", orderId)
      .in("estado", ESTADOS_EN_SWITCH as string[])
      .limit(1)
      .maybeSingle();

  let leido = await filtrar("estado, documento");
  if (leido.error && /documento|column/i.test(leido.error.message || "")) {
    leido = await filtrar("estado");
  }
  if (leido.error || !leido.data) return null;
  return palabraEnSwitch(leido.data as EnvioParaPalabra);
}

/** 409 estándar cuando se intenta editar contenido de un pedido bloqueado. */
export function switchLockResponse(envio: EnvioActivo): NextResponse {
  return NextResponse.json(
    {
      error: `Este pedido ya está en Switch como #${envio.numero} — no se puede editar aquí. Duplícalo para corregirlo o edítalo en el panel de Switch.`,
      switchLock: true,
    },
    { status: 409 },
  );
}

export interface ReemplazoInfo {
  reemplaza_a: string | null;
  /** Pedido activo que reemplaza a ESTE (query inversa). */
  reemplazado_por: { id: string; order_number: string } | null;
  /** Pedido original que ESTE reemplaza, con su número en Switch (para el
   *  recordatorio anti-duplicado del modal de envío). */
  original: { id: string; order_number: string; switch_numero: string | null } | null;
}

const REEMPLAZO_VACIO: ReemplazoInfo = { reemplaza_a: null, reemplazado_por: null, original: null };

/** Trazabilidad de reemplazo para el GET del pedido. Tolerante a la DDL
 *  20260722120000 pendiente (columna reemplaza_a ausente → todo null). */
export async function fetchReemplazoInfo(
  db: SupabaseClient,
  ordersTable: string,
  enviosTable: string,
  orderId: string,
): Promise<ReemplazoInfo> {
  const { data: row, error } = await db
    .from(ordersTable)
    .select("reemplaza_a")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !row) return REEMPLAZO_VACIO;

  // ¿Este pedido ya fue reemplazado por otro (activo, no borrado)?
  const { data: rep } = await db
    .from(ordersTable)
    .select("id, order_number")
    .eq("reemplaza_a", orderId)
    .eq("deleted", false)
    .limit(1)
    .maybeSingle();

  // ¿Este pedido reemplaza a otro? → número del original en Switch.
  let original: ReemplazoInfo["original"] = null;
  if (row.reemplaza_a) {
    const { data: orig } = await db
      .from(ordersTable)
      .select("id, order_number")
      .eq("id", row.reemplaza_a)
      .maybeSingle();
    if (orig) {
      const envio = await getEnvioActivo(db, enviosTable, String(orig.id));
      original = {
        id: String(orig.id),
        order_number: String(orig.order_number),
        switch_numero: envio?.numero ?? null,
      };
    }
  }

  return {
    reemplaza_a: (row.reemplaza_a as string | null) ?? null,
    reemplazado_por: rep ? { id: String(rep.id), order_number: String(rep.order_number) } : null,
    original,
  };
}
