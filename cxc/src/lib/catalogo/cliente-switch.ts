// ─────────────────────────────────────────────────────────────────────────────
// El cliente de Switch de un pedido — resolución ÚNICA (12-ago-2026).
//
// Tres rutas escriben `<marca>_orders.cliente_switch_id`: el PATCH del detalle
// (clientes-switch), el POST /orders (pedido nuevo o duplicado desde la lista)
// y el POST /duplicar ("Duplicar y corregir"). Las tres tienen que validar lo
// MISMO antes de escribir: que el id exista en el directorio Switch de LA
// EMPRESA de esa marca.
//
// 🩸 Por qué la validación no es opcional: `cliente_switch_id` viaja en el
// payload del pedido a Switch. Un id de otra empresa se guardaría sin error y
// recién reventaría (o peor, apuntaría a OTRO cliente) al crear el pedido en el
// ERP. Se valida contra `switch_clientes` filtrando por `empresa_key`.
// ─────────────────────────────────────────────────────────────────────────────

import type { MarcaConfig } from "@/lib/catalogo/marcas";

export interface ClienteSwitchResuelto {
  clienteSwitchId: number;
  nombre: string | null;
  codigo: string | null;
}

/** ¿El body trae una elección de cliente? `null` explícito = Contado; ausente =
 *  "no lo mandaron" (el POST histórico), que NO es lo mismo. */
export function traeEleccionDeCliente(body: unknown): boolean {
  return !!body && typeof body === "object" && "cliente_switch_id" in (body as Record<string, unknown>);
}

/**
 * Normaliza el `cliente_switch_id` del body.
 *   · `null`  → Contado (mostrador), elección válida
 *   · number  → id a validar contra el directorio
 *   · inválido → error con mensaje para el usuario
 */
export function parsearClienteSwitchId(
  valor: unknown,
): { ok: true; id: number | null } | { ok: false; error: string } {
  if (valor == null) return { ok: true, id: null };
  const n = Number(valor);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { ok: false, error: "clienteSwitchId inválido" };
  }
  return { ok: true, id: n };
}

/** Busca el cliente en el directorio local de LA EMPRESA de la marca.
 *  `null` = no existe ahí (id de otra empresa, o cliente borrado del sync). */
export async function resolverClienteSwitch(
  cfg: MarcaConfig,
  clienteSwitchId: number,
): Promise<ClienteSwitchResuelto | null> {
  const mainDb = await cfg.mainDb();
  const { data } = await mainDb
    .from("switch_clientes")
    .select("codigo, nombre")
    .eq("empresa_key", cfg.empresaKey)
    .eq("cliente_switch_id", clienteSwitchId)
    .maybeSingle();
  if (!data) return null;
  return {
    clienteSwitchId,
    nombre: (data as { nombre: string | null }).nombre ?? null,
    codigo: (data as { codigo: string | null }).codigo ?? null,
  };
}

/** Mensaje único para el id que no está en el directorio de la marca. */
export function errorClienteNoExiste(cfg: MarcaConfig): string {
  return `Ese cliente no existe en el directorio Switch de ${cfg.switchDirectorioLabel}`;
}

/**
 * Escribe `cliente_switch_id` en un pedido recién creado, tolerando la DDL
 * 20260705120000 pendiente (misma tolerancia que el checkout y el duplicar).
 * Devuelve `false` si la columna no existe — el pedido queda creado igual.
 */
export async function guardarClienteSwitchEnPedido(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ordersTable: string,
  orderId: string,
  clienteSwitchId: number | null,
): Promise<boolean> {
  const { error } = await db
    .from(ordersTable)
    .update({ cliente_switch_id: clienteSwitchId })
    .eq("id", orderId);
  if (!error) return true;
  if (/cliente_switch_id|column/i.test(error.message ?? "")) return false;
  throw new Error(error.message ?? "No se pudo guardar el cliente del pedido");
}
