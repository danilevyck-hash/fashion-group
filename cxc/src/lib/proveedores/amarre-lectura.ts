// ─────────────────────────────────────────────────────────────────────────────
// Leer `proveedor_amarre` — la ÚNICA lectura de la lista de equivalencias.
//
// 🔑 FALLA ABIERTO, a propósito y en las dos direcciones:
//   · Mientras la migración `20261010120000_proveedor_amarre.sql` no corra, la
//     tabla no existe y esta lectura devuelve `[]`. La pantalla queda EXACTA a
//     la de antes (agrupada por nombre normalizado), no rota.
//   · Si la lectura falla por cualquier otra razón, tampoco se cae el módulo:
//     se anota en consola y se sigue sin amarres. Un proveedor partido en dos
//     filas es un defecto viejo y conocido; una lista vacía sería uno nuevo.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import type { AmarreProveedor } from "@/lib/proveedores/identidad";

export const TABLA_AMARRE = "proveedor_amarre";

/** Los amarres ACTIVOS. Nunca lanza: sin tabla o con error, lista vacía. */
export async function leerAmarresProveedor(): Promise<AmarreProveedor[]> {
  const { data, error } = await supabaseServer
    .from(TABLA_AMARRE)
    .select("empresa_key,proveedor_switch_id,proveedor_canonico,nombre_mostrado")
    .eq("activo", true);
  if (error) {
    console.error(`[proveedores] amarre no disponible: ${error.message}`);
    return [];
  }
  return (data ?? []) as AmarreProveedor[];
}
