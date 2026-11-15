import { supabaseServer } from "@/lib/supabase-server";

export interface MiVendedor { id: number; nombre: string | null }

/** Roles que arman pedidos y tienen «su» vendedor de Switch. */
export const ROLES_MI_VENDEDOR = ["admin", "secretaria", "vendedor"];

/**
 * El vendedor de Switch mapeado a un usuario en una empresa
 * (`fg_user_switch_vendedor`). UNA lectura, la usan la ruta
 * `/api/catalogo/mi-vendedor` y la página de «Confirmar pedido», que lo trae
 * desde el servidor para abrir con el vendedor puesto (reebok-cat-03).
 *
 * `null` = sin mapeo. `undefined` = no se pudo leer: quien llama decide
 * (la página cae al pedido del navegador, como antes).
 */
export async function leerMiVendedor(userId: string, empresa: string): Promise<MiVendedor | null | undefined> {
  try {
    const { data, error } = await supabaseServer
      .from("fg_user_switch_vendedor")
      .select("vendedor_id, vendedor_nombre")
      .eq("user_id", userId)
      .eq("empresa_key", empresa)
      .maybeSingle();
    if (error) return undefined;
    return data ? { id: data.vendedor_id as number, nombre: (data.vendedor_nombre as string | null) ?? null } : null;
  } catch {
    return undefined;
  }
}
