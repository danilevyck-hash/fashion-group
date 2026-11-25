// GUÍA › CADA FACTURA AMARRADA A SWITCH — la parte que LEE y ESCRIBE la base
// (25-nov-2026). Las reglas están en `amarre-facturas.ts`.
//
// 🔑 FALLA ABIERTA: si Switch (nuestra copia) no se puede leer, la guía se
// completa igual —no se frena a bodega por una lectura caída— y se registra.

import { supabaseServer } from "@/lib/supabase-server";
import { TIPO_FACTURA } from "./atajos-facturas";
import { TABLA_ETIQUETAS } from "./etiquetas-server";
import {
  GUIA_AMARRE_FACTURAS_2026_11,
  clavesPorEmpresa,
  etiquetasQueSalen,
  sinAmarre,
  type EtiquetaPendiente,
  type FacturaDeSwitch,
  type RenglonParaAmarrar,
} from "./amarre-facturas";

/** Las facturas de Switch que terminan en esas claves, con el código de su cliente. `null` = no se pudo leer. */
export async function facturasParaAmarrar(renglones: readonly RenglonParaAmarrar[]): Promise<FacturaDeSwitch[] | null> {
  const porEmpresa = clavesPorEmpresa(renglones);
  if (porEmpresa.size === 0) return [];
  const claves = [...new Set([...porEmpresa.values()].flatMap((s) => [...s]))];
  const { data, error } = await supabaseServer
    .from("switch_facturas")
    .select("empresa_key, secuencial, cliente_switch_id")
    .in("empresa_key", [...porEmpresa.keys()])
    .eq("tipo_comprobante", TIPO_FACTURA)
    .or(claves.map((c) => `secuencial.like.*${c}`).join(","))
    .limit(1000);
  if (error) {
    console.error("[guias/amarre] switch_facturas:", error.message);
    return null;
  }
  const filas = (data ?? []) as Array<{ empresa_key: string; secuencial: string; cliente_switch_id: number | null }>;
  const ids = [...new Set(filas.map((f) => f.cliente_switch_id).filter((n): n is number => n != null))];
  const codigo = new Map<string, string>();
  if (ids.length > 0) {
    const { data: cl, error: cErr } = await supabaseServer
      .from("switch_clientes")
      .select("empresa_key, cliente_switch_id, codigo")
      .in("empresa_key", [...porEmpresa.keys()])
      .in("cliente_switch_id", ids);
    if (cErr) {
      console.error("[guias/amarre] switch_clientes:", cErr.message);
      return null;
    }
    for (const c of (cl ?? []) as Array<{ empresa_key: string; cliente_switch_id: number; codigo: string | null }>) {
      if (c.codigo) codigo.set(`${c.empresa_key}:${c.cliente_switch_id}`, c.codigo.trim());
    }
  }
  return filas.map((f) => ({
    empresa_key: f.empresa_key,
    secuencial: f.secuencial,
    cliente_codigo: codigo.get(`${f.empresa_key}:${f.cliente_switch_id}`) ?? null,
  }));
}

/** Lo que falta amarrar para COMPLETAR esta guía. Vacío = se completa (también si no se pudo leer). */
export async function faltaAmarrarAlCompletar(renglones: readonly RenglonParaAmarrar[]): Promise<string[]> {
  if (!GUIA_AMARRE_FACTURAS_2026_11) return [];
  try {
    return sinAmarre(renglones, await facturasParaAmarrar(renglones));
  } catch (e) {
    console.error("[guias/amarre] leer:", e instanceof Error ? e.message : String(e));
    return []; // falla ABIERTA: no se frena a bodega por una lectura caída
  }
}

/**
 * Al completar: las etiquetas PENDIENTES de las facturas de esta guía pasan a
 * «ya salió» (se atan a su renglón). Solo escribe `guias_etiquetas.guia_item_id`
 * donde todavía está vacío. Nunca lanza: devuelve cuántas ató.
 */
export async function atarEtiquetasAlCompletar(guiaId: string): Promise<number> {
  if (!GUIA_AMARRE_FACTURAS_2026_11) return 0;
  try {
    const { data: rs, error: rErr } = await supabaseServer
      .from("guia_items")
      .select("id, empresa, facturas, cliente_codigo")
      .eq("guia_id", guiaId)
      .eq("deleted", false);
    if (rErr || !rs || rs.length === 0) return 0;
    const renglones = rs as RenglonParaAmarrar[];
    const empresas = [...clavesPorEmpresa(renglones).keys()];
    if (empresas.length === 0) return 0;
    const { data: es, error: eErr } = await supabaseServer
      .from(TABLA_ETIQUETAS)
      .select("id, empresa_key, secuencial")
      .in("empresa_key", empresas)
      .is("guia_item_id", null)
      .eq("deleted", false)
      .limit(1000);
    if (eErr || !es) return 0;
    let atadas = 0;
    for (const { etiquetaId, renglonId } of etiquetasQueSalen(renglones, es as EtiquetaPendiente[])) {
      const { data: hecha, error } = await supabaseServer
        .from(TABLA_ETIQUETAS)
        .update({ guia_item_id: renglonId })
        .eq("id", etiquetaId)
        .is("guia_item_id", null)
        .eq("deleted", false)
        .select("id");
      if (!error && hecha && hecha.length > 0) atadas++;
    }
    return atadas;
  } catch (e) {
    console.error("[guias/amarre] atar etiquetas:", e instanceof Error ? e.message : String(e));
    return 0;
  }
}
