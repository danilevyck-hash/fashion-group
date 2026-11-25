// Despachos › Pedidos › «Muestras» — lo que lee y escribe la base. Las reglas
// son de `muestras.ts`; aquí solo el I/O. Escribe SOLO `pedidos_muestras` y las
// columnas de espera de `pedidos_bodega_estado` (la espera automática).
import { supabaseServer } from "@/lib/supabase-server";
import { columnasEsperaMuestra } from "./pedidos-flujo-simple";
import {
  ESTADOS_POR_MANDAR,
  agruparPorPedido,
  cambioDeEspera,
  muestraSigueViva,
  type MuestraLeida,
  type PedidoDeMuestras,
} from "./muestras";

export const COLUMNAS_MUESTRA =
  "id, empresa_key, pedido_switch_id, codigo, descripcion, estado, pedida_por, pedida_en, enviada_por, enviada_en, reclamada_por, reclamada_en, guia_envio";

/** Las muestras vivas de UN pedido (todas: falta, enviada y no llegó). */
export async function leerMuestrasDelPedido(empresa: string, pedido: number): Promise<MuestraLeida[]> {
  const { data, error } = await supabaseServer
    .from("pedidos_muestras")
    .select(COLUMNAS_MUESTRA)
    .eq("empresa_key", empresa)
    .eq("pedido_switch_id", pedido)
    .eq("deleted", false)
    .order("id");
  if (error) throw new Error(`pedidos_muestras: ${error.message}`);
  return (data ?? []) as MuestraLeida[];
}

/**
 * Lo que el vendedor tiene por mandar en SUS empresas, agrupado por pedido.
 * 🔴 Un pedido recibido o que Switch ya sacó de la lista (facturado) se cae
 * solo de aquí: se decide al LEER, sin cron.
 */
export async function leerPorMandar(empresas: readonly string[]): Promise<PedidoDeMuestras[]> {
  if (empresas.length === 0) return [];
  // ponytail: sin paginar; lo pendiente son decenas, nunca 1.000.
  const { data, error } = await supabaseServer
    .from("pedidos_muestras")
    .select(COLUMNAS_MUESTRA)
    .in("empresa_key", [...empresas])
    .in("estado", [...ESTADOS_POR_MANDAR])
    .eq("deleted", false)
    .limit(1000);
  if (error) throw new Error(`pedidos_muestras: ${error.message}`);
  const muestras = (data ?? []) as MuestraLeida[];
  if (muestras.length === 0) return [];
  const ids = [...new Set(muestras.map((m) => m.pedido_switch_id))];
  const emps = [...new Set(muestras.map((m) => m.empresa_key))];
  const [ped, est] = await Promise.all([
    supabaseServer
      .from("switch_pedidos")
      .select("empresa_key, pedido_switch_id, secuencial, cliente_nombre")
      .in("empresa_key", emps)
      .in("pedido_switch_id", ids),
    supabaseServer
      .from("pedidos_bodega_estado")
      .select("empresa_key, pedido_switch_id, estado")
      .in("empresa_key", emps)
      .in("pedido_switch_id", ids),
  ]);
  if (ped.error) throw new Error(`switch_pedidos: ${ped.error.message}`);
  if (est.error) throw new Error(`pedidos_bodega_estado: ${est.error.message}`);
  const estado = new Map((est.data ?? []).map((e) => [`${e.empresa_key}:${e.pedido_switch_id}`, e.estado as string]));
  const vivos = new Map<string, { secuencial: string; cliente_nombre: string }>();
  for (const p of ped.data ?? []) {
    const k = `${p.empresa_key}:${p.pedido_switch_id}`;
    if (muestraSigueViva(true, estado.get(k))) vivos.set(k, { secuencial: p.secuencial, cliente_nombre: p.cliente_nombre });
  }
  return agruparPorPedido(muestras, vivos);
}

/** Cuántas muestras pendientes tiene cada pedido de la lista (para «En espera de muestra · N referencias»). */
export async function contarAbiertasPorPedido(empresas: readonly string[]): Promise<Map<string, number>> {
  const cuenta = new Map<string, number>();
  if (empresas.length === 0) return cuenta;
  const { data, error } = await supabaseServer
    .from("pedidos_muestras")
    .select("empresa_key, pedido_switch_id")
    .in("empresa_key", [...empresas])
    .in("estado", [...ESTADOS_POR_MANDAR])
    .eq("deleted", false)
    .limit(1000);
  if (error) return cuenta; // falla ABIERTA: sin la tabla, la lista sigue como antes
  for (const m of data ?? []) {
    const k = `${m.empresa_key}:${m.pedido_switch_id}`;
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  return cuenta;
}

/**
 * 🔴 LA ESPERA AUTOMÁTICA. Prende o apaga «En espera de muestra» del pedido
 * según sus muestras pendientes. Solo En preparación (CHECK de la base); el
 * UPDATE exige el estado y la espera leídos, así que correrlo dos veces no
 * escribe nada nuevo. Falla ABIERTA: la muestra ya quedó guardada.
 * Devuelve lo que hizo, para el rastro.
 */
export async function sincronizarEspera(empresa: string, pedido: number, quien: string): Promise<"poner" | "quitar" | null> {
  try {
    const [abiertas, fila] = await Promise.all([
      supabaseServer
        .from("pedidos_muestras")
        .select("id", { count: "exact", head: true })
        .eq("empresa_key", empresa)
        .eq("pedido_switch_id", pedido)
        .in("estado", [...ESTADOS_POR_MANDAR])
        .eq("deleted", false),
      supabaseServer
        .from("pedidos_bodega_estado")
        .select("estado, espera_muestra_desde")
        .eq("empresa_key", empresa)
        .eq("pedido_switch_id", pedido)
        .maybeSingle(),
    ]);
    if (abiertas.error || fila.error) return null;
    const f = fila.data as { estado: string; espera_muestra_desde: string | null } | null;
    const cambio = cambioDeEspera(f?.estado, !!f?.espera_muestra_desde, abiertas.count ?? 0);
    if (!cambio) return null;
    const base = supabaseServer
      .from("pedidos_bodega_estado")
      .update(columnasEsperaMuestra(cambio === "poner", quien, new Date().toISOString()))
      .eq("empresa_key", empresa)
      .eq("pedido_switch_id", pedido)
      .eq("estado", "en_preparacion");
    const { error } = await (cambio === "poner" ? base.is("espera_muestra_desde", null) : base.not("espera_muestra_desde", "is", null));
    return error ? null : cambio;
  } catch {
    return null;
  }
}
