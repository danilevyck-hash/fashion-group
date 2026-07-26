// ─────────────────────────────────────────────────────────────────────────────
// CLIENTE y VENDEDOR de Switch para un pedido del LINK PÚBLICO (las 3 marcas).
//
// EL PROBLEMA
// El checkout del vendedor tiene sesión: el cliente lo elige a mano y el
// vendedor sale del mapeo fg_user_switch_vendedor del usuario logueado. En el
// link público NO hay sesión: el cliente escribe su nombre a mano y nadie firma
// el pedido. La RPC de conversión (convert_<marca>_pedido_publico) deja el
// pedido con cliente_switch_id y vendedor_switch_id en NULL — y sin esos dos
// ids Switch no acepta el pedido.
//
// LA REGLA (ids REALES, ninguno inventado; verificado en la DB 25-jul-2026)
//   1. Override explícito por empresa en fg_catalogo_publico_switch — la manija
//      de Daniel si mañana quiere otro cliente/vendedor. Tolerante: si la tabla
//      no existe (DDL pendiente) se salta.
//   2. CLIENTE = el de mostrador/contado de la empresa en Switch, identificado
//      por su código propio de Switch 'TCKCTA' en switch_clientes:
//        active_shoes 1 "Contado" · joystep 1 "Contado" · fashion_shoes 1 "VENTAS LOCA"
//      Es el mismo cliente que ya usa el checkout del vendedor cuando no se
//      elige uno (PED-011/012/015/017, JBP-001/002/003). El nombre que escribió
//      la persona NO se pierde: queda en <marca>_orders.client_name.
//   3. VENDEDOR = el vendedor "DEFAULT" de la empresa (la casa, no una persona
//      — un pedido del link no es venta de nadie y no debe pagar comisión a un
//      vendedor real). Se busca en el maestro `vendedores` (sincronizado desde
//      Switch) y, si ahí no está, en fg_user_switch_vendedor:
//        active_shoes 3 · joystep 1 · fashion_shoes 1
//
// Si algo NO resuelve NO se inventa nada: se devuelve el motivo, el pedido
// queda guardado y confirmado, y el envío se reintenta desde el admin cuando
// Daniel complete el dato.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

/** Código con el que Switch identifica al cliente de mostrador/contado. */
export const CODIGO_CLIENTE_CONTADO = "TCKCTA";
/** Nombre del vendedor "de la casa" en Switch. */
export const NOMBRE_VENDEDOR_DEFAULT = "DEFAULT";
/** Override por empresa (DDL 20260725140000, opcional). */
export const TABLA_OVERRIDE = "fg_catalogo_publico_switch";

export interface PublicoSwitchActor {
  clienteId: number;
  clienteNombre: string | null;
  vendedorId: number;
  vendedorNombre: string | null;
}

export type PublicoSwitchActorResult =
  | { ok: true; actor: PublicoSwitchActor }
  | { ok: false; motivo: string };

function idValido(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/**
 * Resuelve cliente + vendedor de Switch para un pedido del link.
 * `db` = client del proyecto PRINCIPAL (switch_clientes, vendedores,
 * fg_user_switch_vendedor y el override viven ahí).
 */
export async function resolvePublicoSwitchActor(
  db: SupabaseClient,
  empresaKey: string,
): Promise<PublicoSwitchActorResult> {
  // ── 1. Override explícito por empresa (tolerante a DDL pendiente) ──
  try {
    const { data, error } = await db
      .from(TABLA_OVERRIDE)
      .select("cliente_switch_id, cliente_nombre, vendedor_id, vendedor_nombre")
      .eq("empresa_key", empresaKey)
      .maybeSingle();
    if (!error && data) {
      const cid = Number(data.cliente_switch_id);
      const vid = Number(data.vendedor_id);
      if (idValido(cid) && idValido(vid)) {
        return {
          ok: true,
          actor: {
            clienteId: cid,
            clienteNombre: (data.cliente_nombre as string) ?? null,
            vendedorId: vid,
            vendedorNombre: (data.vendedor_nombre as string) ?? null,
          },
        };
      }
    }
  } catch {
    /* tabla ausente → seguimos con la regla por defecto */
  }

  // ── 2. Cliente de mostrador/contado de la empresa ──
  let clienteId: number | null = null;
  let clienteNombre: string | null = null;
  try {
    const { data } = await db
      .from("switch_clientes")
      .select("cliente_switch_id, nombre")
      .eq("empresa_key", empresaKey)
      .eq("codigo", CODIGO_CLIENTE_CONTADO)
      .limit(1)
      .maybeSingle();
    if (data && idValido(Number(data.cliente_switch_id))) {
      clienteId = Number(data.cliente_switch_id);
      clienteNombre = (data.nombre as string) ?? null;
    }
  } catch {
    /* se reporta abajo */
  }
  if (clienteId == null) {
    return {
      ok: false,
      motivo: `No se encontró el cliente de contado (código ${CODIGO_CLIENTE_CONTADO}) de ${empresaKey} en el directorio de Switch`,
    };
  }

  // ── 3. Vendedor DEFAULT de la empresa (maestro `vendedores` y, si falta,
  //       el mapeo de usuarios) ──
  let vendedorId: number | null = null;
  let vendedorNombre: string | null = null;
  try {
    const { data } = await db
      .from("vendedores")
      .select("switch_id, nombre")
      .eq("empresa_key", empresaKey)
      .eq("nombre", NOMBRE_VENDEDOR_DEFAULT)
      .limit(1)
      .maybeSingle();
    if (data && idValido(Number(data.switch_id))) {
      vendedorId = Number(data.switch_id);
      vendedorNombre = (data.nombre as string) ?? NOMBRE_VENDEDOR_DEFAULT;
    }
  } catch {
    /* seguimos con el mapeo de usuarios */
  }
  if (vendedorId == null) {
    try {
      const { data } = await db
        .from("fg_user_switch_vendedor")
        .select("vendedor_id, vendedor_nombre")
        .eq("empresa_key", empresaKey)
        .eq("vendedor_nombre", NOMBRE_VENDEDOR_DEFAULT)
        .limit(1)
        .maybeSingle();
      if (data && idValido(Number(data.vendedor_id))) {
        vendedorId = Number(data.vendedor_id);
        vendedorNombre = (data.vendedor_nombre as string) ?? NOMBRE_VENDEDOR_DEFAULT;
      }
    } catch {
      /* se reporta abajo */
    }
  }
  if (vendedorId == null) {
    return {
      ok: false,
      motivo: `No se encontró el vendedor ${NOMBRE_VENDEDOR_DEFAULT} de ${empresaKey} — asignarlo en ${TABLA_OVERRIDE} o correr el sync de vendedores`,
    };
  }

  return { ok: true, actor: { clienteId, clienteNombre, vendedorId, vendedorNombre } };
}
