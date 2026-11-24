// I/O del resumen del día (`resumen-del-dia.ts`): solo LEE Supabase.
//
// 🔑 La hora de despacho: `guia_transporte` no la guarda, pero la bitácora sí —
// `activity_logs` con `guia_dispatch` y `changes.estado.to = "Completada"` (el PUT
// la escribe al despachar; el PATCH, desde el 24-nov-2026, también). Sin
// migración.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { transportistaLabel } from "@/lib/transportistaLabel";
import type { FacturaDelDia, GuiaDespachada } from "./resumen-del-dia";

const inicioPanama = (ymd: string) => `${ymd}T00:00:00-05:00`;
const diaSiguiente = (ymd: string) => new Date(Date.parse(`${ymd}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export async function leerFacturasDelDia(fecha: string): Promise<FacturaDelDia[]> {
  const filas = await leerTodoPaginado<{ empresa_key: string; cliente_switch_id: number | null; cliente_nombre: string | null; tipo_comprobante: string; subtotal_descuento: number | string }>(
    "switch_facturas (resumen del día)",
    (pedirCount, a, b) =>
      supabaseServer
        .from("switch_facturas")
        .select("empresa_key, cliente_switch_id, cliente_nombre, tipo_comprobante, subtotal_descuento", pedirCount ? { count: "exact" } : {})
        .in("empresa_key", CXC_GRUPO_EMPRESA_KEYS as unknown as string[])
        .gte("fecha", inicioPanama(fecha))
        .lt("fecha", inicioPanama(diaSiguiente(fecha)))
        .order("id", { ascending: true })
        .range(a, b),
  );
  // Cliente por CÓDIGO: (empresa, cliente_switch_id) → switch_clientes.codigo.
  const codigoDe = new Map<string, string>();
  for (const emp of [...new Set(filas.map((f) => f.empresa_key))]) {
    const ids = [...new Set(filas.filter((f) => f.empresa_key === emp && f.cliente_switch_id != null).map((f) => f.cliente_switch_id))];
    if (!ids.length) continue;
    const { data, error } = await supabaseServer
      .from("switch_clientes")
      .select("cliente_switch_id, codigo")
      .eq("empresa_key", emp)
      .in("cliente_switch_id", ids)
      .limit(1000);
    if (error) throw new Error(`switch_clientes (resumen del día): ${error.message}`);
    for (const c of data ?? []) if (c.codigo) codigoDe.set(`${emp}|${c.cliente_switch_id}`, c.codigo);
  }
  return filas.map((f) => ({
    empresa: f.empresa_key,
    codigo: codigoDe.get(`${f.empresa_key}|${f.cliente_switch_id}`) ?? null,
    cliente: f.cliente_nombre,
    tipo: f.tipo_comprobante,
    subtotal: Number(f.subtotal_descuento) || 0,
  }));
}

export async function leerDespachosDelDia(fecha: string): Promise<GuiaDespachada[]> {
  const logs = await leerTodoPaginado<{ details: string | null }>(
    "activity_logs (despachos del día)",
    (pedirCount, a, b) =>
      supabaseServer
        .from("activity_logs")
        .select("details", pedirCount ? { count: "exact" } : {})
        .eq("entity_type", "guias")
        .eq("action", "guia_dispatch")
        .gte("created_at", inicioPanama(fecha))
        .lt("created_at", inicioPanama(diaSiguiente(fecha)))
        .order("id", { ascending: true })
        .range(a, b),
  );
  const ids = new Set<string>();
  for (const l of logs) {
    try {
      const d = JSON.parse(l.details ?? "null");
      if (d?.changes?.estado?.to === "Completada" && typeof d.guiaId === "string") ids.add(d.guiaId);
    } catch {
      /* detalle ilegible: no es un despacho */
    }
  }
  if (!ids.size) return [];
  const { data, error } = await supabaseServer
    .from("guia_transporte")
    .select("numero, modo_entrega, transportistas(nombre), guia_items(orden, empresa, cliente, cliente_codigo, facturas, bultos, deleted)")
    .in("id", [...ids])
    .eq("estado", "Completada")
    .eq("deleted", false)
    .order("numero", { ascending: true });
  if (error) throw new Error(`guia_transporte (despachos del día): ${error.message}`);
  type Item = { orden: number; empresa: string | null; cliente: string | null; cliente_codigo: string | null; facturas: string | null; bultos: number | null; deleted: boolean | null };
  return (data ?? []).map((g) => ({
    transportista: transportistaLabel(g as Parameters<typeof transportistaLabel>[0]) || "—",
    renglones: ((g.guia_items ?? []) as Item[])
      .filter((i) => !i.deleted)
      .sort((a, b) => a.orden - b.orden)
      .map((i) => ({ empresa: i.empresa, codigo: i.cliente_codigo, cliente: i.cliente, facturas: i.facturas, bultos: i.bultos })),
  }));
}
