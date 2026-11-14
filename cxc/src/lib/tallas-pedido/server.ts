// I/O del «Excel de tallas por pedido»: el pedido de Switch y las tallas de los
// despachos guardadas en `despacho_tallas`. Las decisiones viven en `armar.ts`.
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { bajarLineas, hayQueBajar, leerLineas } from "@/lib/guias/pedido-detalle-server";
import { candidatosDeReferencia, coincideElPedido, sumarPorCodigo, type LineaDelPedido, type TallaDeDespacho } from "./armar";
import type { FilaDespacho } from "./despacho-archivo";

export interface PedidoLeido {
  secuencial: string;
  cliente: string | null;
  lineas: LineaDelPedido[];
}

/**
 * Las líneas del pedido EN EL ORDEN del pedido. Si no están guardadas (o son de
 * hace más de 6 h) se piden a Switch — una sola llamada — y si Switch no
 * contesta se sigue con lo guardado. Una referencia repetida (talla o color
 * distintos en Switch) se suma en una sola línea.
 */
export async function leerPedido(empresa: string, id: number): Promise<PedidoLeido | null> {
  let detalle = await leerLineas(empresa, id, false);
  if (!detalle.sinTabla && hayQueBajar(detalle)) {
    try {
      await bajarLineas(empresa, id);
      detalle = await leerLineas(empresa, id, false);
    } catch {
      /* falla abierta: lo guardado */
    }
  }
  if (detalle.lineas.length === 0) return null;
  const { data } = await supabaseServer
    .from("switch_pedidos")
    .select("secuencial, cliente_nombre")
    .eq("empresa_key", empresa)
    .eq("pedido_switch_id", id)
    .maybeSingle();
  return {
    secuencial: data?.secuencial ?? String(id),
    cliente: data?.cliente_nombre ?? null,
    lineas: sumarPorCodigo(detalle.lineas),
  };
}

export type TipoDocumento = "pedido" | "factura";

export interface PedidoEncontrado {
  tipo: TipoDocumento;
  empresa: string;
  id: number;
  secuencial: string;
  cliente: string;
  fecha: string;
}

/**
 * El pedido escrito, buscado en las 6 empresas de Fashion Group (sin Boston ni
 * Multifashion), entre los pedidos activos que trae `sync-pedidos`. Los más
 * recientes primero; como mucho 10. Solo pedidos ACTIVOS (switch_pedidos): uno
 * ya facturado se encuentra por su factura (`buscarFactura`).
 */
export async function buscarPedido(escrito: string): Promise<PedidoEncontrado[]> {
  const filas = await leerTodoPaginado<{ empresa_key: string; pedido_switch_id: number; secuencial: string; cliente_nombre: string; fecha: string }>(
    "switch_pedidos",
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("switch_pedidos")
        .select("empresa_key, pedido_switch_id, secuencial, cliente_nombre, fecha", pedirCount ? { count: "exact" } : undefined)
        .in("empresa_key", [...B2B_EMPRESA_KEYS])
        .order("fecha", { ascending: false })
        .order("empresa_key")
        .order("pedido_switch_id")
        .range(desde, hasta),
  );
  return filas
    .filter((f) => coincideElPedido(escrito, f.secuencial))
    .slice(0, 10)
    .map((f) => ({ tipo: "pedido" as const, empresa: f.empresa_key, id: f.pedido_switch_id, secuencial: f.secuencial, cliente: f.cliente_nombre, fecha: f.fecha.slice(0, 10) }));
}

/**
 * La factura escrita (completa o sus últimos dígitos), en las 6 empresas. Solo
 * tipo «Factura» (ni notas de crédito ni tiquetes). 🔴 Cada empresa numera sus
 * facturas desde 1 («11-000003192» existe en varias), así que el número completo
 * casi siempre da una lista para tocar.
 */
export async function buscarFactura(escrito: string): Promise<PedidoEncontrado[]> {
  const digitos = String(escrito ?? "").replace(/\D/g, "");
  if (!digitos) return [];
  // El filtro grueso en la base (los últimos 9 dígitos están después del guion);
  // el exacto, el MISMO que el de los pedidos.
  const filas = await leerTodoPaginado<{ empresa_key: string; switch_factura_id: number; secuencial: string; cliente_nombre: string | null; fecha: string }>(
    "switch_facturas",
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("switch_facturas")
        .select("empresa_key, switch_factura_id, secuencial, cliente_nombre, fecha", pedirCount ? { count: "exact" } : undefined)
        .in("empresa_key", [...B2B_EMPRESA_KEYS])
        .eq("tipo_comprobante", "Factura")
        .like("secuencial", `%${digitos.slice(-9)}`)
        .order("fecha", { ascending: false })
        .order("empresa_key")
        .order("switch_factura_id")
        .range(desde, hasta),
  );
  return filas
    .filter((f) => coincideElPedido(escrito, f.secuencial))
    .slice(0, 10)
    .map((f) => ({ tipo: "factura" as const, empresa: f.empresa_key, id: f.switch_factura_id, secuencial: f.secuencial, cliente: f.cliente_nombre ?? "", fecha: f.fecha.slice(0, 10) }));
}

/** Los renglones de la factura (tipo «Factura»), sumados por referencia. */
export async function leerFactura(empresa: string, id: number): Promise<PedidoLeido | null> {
  const { data: cab, error } = await supabaseServer
    .from("switch_facturas")
    .select("secuencial, cliente_nombre")
    .eq("empresa_key", empresa)
    .eq("tipo_comprobante", "Factura")
    .eq("switch_factura_id", id)
    .maybeSingle();
  if (error) throw new Error(`switch_facturas: ${error.message}`);
  if (!cab) return null;
  const lineas = await leerTodoPaginado<{ codigo: string; descripcion: string | null; cantidad: number }>(
    "switch_factura_lineas",
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("switch_factura_lineas")
        .select("codigo, descripcion, cantidad", pedirCount ? { count: "exact" } : undefined)
        .eq("empresa_key", empresa)
        .eq("tipo_comprobante", "Factura")
        .eq("switch_factura_id", id)
        .order("linea_orden")
        .order("id")
        .range(desde, hasta),
  );
  if (lineas.length === 0) return null;
  return {
    secuencial: cab.secuencial,
    cliente: cab.cliente_nombre ?? null,
    lineas: sumarPorCodigo(lineas.map((l) => ({ codigo: l.codigo, descripcion: l.descripcion ?? "", cantidad: Number(l.cantidad) }))),
  };
}

const COLUMNAS = "referencia, codigo_caja, talla, ean, cantidad, cajas, pares_por_caja, factura, correo_id, fecha_despacho, proveedor, curva";

/** Las tallas de despacho de esas referencias (con y sin el «000» de niños). */
export async function leerTallasDeDespacho(empresa: string, codigos: readonly string[]): Promise<TallaDeDespacho[]> {
  const refs = [...new Set(codigos.flatMap(candidatosDeReferencia))];
  if (refs.length === 0) return [];
  const filas = await leerTodoPaginado<TallaDeDespacho>("despacho_tallas", (pedirCount, desde, hasta) =>
    supabaseServer
      .from("despacho_tallas")
      .select(COLUMNAS, pedirCount ? { count: "exact" } : undefined)
      .eq("empresa_key", empresa)
      .in("referencia", refs)
      .order("id")
      .range(desde, hasta),
  );
  return filas.map((f) => ({ ...f, cantidad: Number(f.cantidad), cajas: f.cajas === null ? null : Number(f.cajas), pares_por_caja: f.pares_por_caja === null ? null : Number(f.pares_por_caja) }));
}

/** ¿Ya se cargó este correo? (para no volver a bajar sus adjuntos). */
export async function correoYaCargado(correoId: string): Promise<boolean> {
  const { count, error } = await supabaseServer
    .from("despacho_tallas")
    .select("id", { count: "exact", head: true })
    .eq("correo_id", correoId);
  if (error) throw new Error(`despacho_tallas: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Guarda las filas; un despacho repetido no se duplica (único por correo+factura+referencia+caja+talla). */
export async function guardarTallasDeDespacho(filas: readonly FilaDespacho[]): Promise<number> {
  let guardadas = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const tanda = filas.slice(i, i + 500);
    const { error } = await supabaseServer
      .from("despacho_tallas")
      .upsert(tanda, { onConflict: "correo_id,factura,referencia,codigo_caja,talla", ignoreDuplicates: true });
    if (error) throw new Error(`despacho_tallas: ${error.message}`);
    guardadas += tanda.length;
  }
  return guardadas;
}
