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
