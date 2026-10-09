// ============================================================================
// Marketing — LOS PROVEEDORES QUE YA EXISTEN (I/O). Server-side, solo lee.
//
// Los proveedores salen de las facturas vivas (no hay catálogo aparte, a
// propósito: ver `20270101120000_mkt_proveedores.sql`) y el amarre de alias de
// `mk_proveedor_alias`, sobre la lista escrita en `ALIAS_DE_PROVEEDOR`.
// Falla abierta: si la base no contesta, lista vacía / la lista del código.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { ALIAS_DE_PROVEEDOR } from "./proveedores-2026-10";

/** Los nombres tal como se guardaron, con repeticiones (una por factura viva). */
export async function historicoDeProveedores(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("mk_facturas")
    .select("proveedor")
    .is("anulado_en", null)
    .is("impulsadora_id", null)
    .limit(1000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ proveedor: string | null }>)
    .map((r) => String(r.proveedor ?? "").trim())
    .filter((p) => p.length > 0);
}

/** El amarre vigente: la tabla manda; la lista del código queda de respaldo. */
export async function aliasDeProveedores(): Promise<Record<string, string>> {
  const alias: Record<string, string> = { ...ALIAS_DE_PROVEEDOR };
  try {
    const { data, error } = await supabaseServer
      .from("mk_proveedor_alias")
      .select("alias_normalizado, canonico")
      .is("anulado_en", null);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ alias_normalizado: string; canonico: string }>) {
      if (r.alias_normalizado && r.canonico) alias[r.alias_normalizado] = r.canonico;
    }
  } catch (err) {
    console.error("marketing/proveedor_alias:", err instanceof Error ? err.message : err);
  }
  return alias;
}
