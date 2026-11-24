/**
 * 🔴 EL PEDIDO FACTURADO SE CIERRA SOLO (24-nov-2026, interruptor
 * `PEDIDO_SE_CIERRA_CON_FACTURA`). Copia el patrón de
 * `pedido-recibido-por-etiqueta.ts`:
 *
 *   · Solo mueve un pedido En preparación o Preparado → Recibido. Un Recibido
 *     (firma humana o de la etiqueta) NUNCA se pisa: el UPDATE exige el estado
 *     que se leyó, así que correrlo dos veces no escribe nada nuevo.
 *   · Un pedido Pendiente (sin fila) NO se toca: crearle una fila «Recibido»
 *     inventaría un paso que bodega nunca dio, y la lista de Pedidos lee
 *     `pedidos_bodega_estado` entera (tope 1.000 de la base). Switch lo saca
 *     solo de la lista al facturarlo (`sync-pedidos` borra lo no Activo).
 *   · Falla ABIERTA: nunca lanza; si algo falla, el pedido queda como estaba.
 */
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { columnasDelPaso, columnasEsperaMuestra, pedidoDeReferencia, type EstadoFlujoSimple } from "./pedidos-flujo-simple";
import { TIPO_FACTURA } from "./atajos-facturas";

export const FIRMA_FACTURADO = "Facturado en Switch";
const SE_CIERRAN: readonly EstadoFlujoSimple[] = ["en_preparacion", "preparado"];

export function firmaFacturado(secuencial: string | null | undefined): string {
  const s = String(secuencial ?? "").trim();
  return s ? `${FIRMA_FACTURADO} · ${s}` : FIRMA_FACTURADO;
}

/** Devuelve `true` si cerró el pedido de esa factura. */
export async function cerrarPedidoFacturado(empresa: string, facturaId: number, pedidoRef: string | null): Promise<boolean> {
  const pedido = pedidoDeReferencia(pedidoRef);
  if (pedido == null) return false;
  try {
    const { data: previo, error: pErr } = await supabaseServer
      .from("pedidos_bodega_estado")
      .select("*")
      .eq("empresa_key", empresa)
      .eq("pedido_switch_id", pedido)
      .in("estado", [...SE_CIERRAN])
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!previo) return false;
    const desde = (previo as { estado: EstadoFlujoSimple }).estado;
    const { data: fac, error: fErr } = await supabaseServer
      .from("switch_facturas")
      .select("secuencial, tipo_comprobante")
      .eq("empresa_key", empresa)
      .eq("switch_factura_id", facturaId)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    const f = fac as { secuencial: string | null; tipo_comprobante: string | null } | null;
    if (!f || f.tipo_comprobante !== TIPO_FACTURA) return false;
    const firma = firmaFacturado(f.secuencial);
    const ahora = new Date().toISOString();
    const fila = {
      cambiado_por: firma,
      cambiado_en: ahora,
      ...columnasDelPaso(desde, "recibido", firma, ahora),
      // El CHECK de la base solo deja la espera de muestra En preparación.
      ...columnasEsperaMuestra(false, firma, ahora),
    };
    const { data: hecho, error } = await supabaseServer
      .from("pedidos_bodega_estado")
      .update(fila)
      .eq("empresa_key", empresa)
      .eq("pedido_switch_id", pedido)
      .eq("estado", desde) // si alguien lo movió entretanto, no se pisa
      .select("pedido_switch_id");
    if (error) throw new Error(error.message);
    if (!hecho || hecho.length === 0) return false;
    await logActivity("sistema", "recibido_por_factura", "pedidos_bodega_estado", {
      pedido: `${empresa}:${pedido}`, factura: f.secuencial, switch_factura_id: facturaId,
      desde, hasta: "recibido", antes: previo, despues: fila,
    }, FIRMA_FACTURADO);
    return true;
  } catch (e) {
    console.error(`[guias/pedido] cerrar por factura ${empresa}:${pedido}:`, e instanceof Error ? e.message : String(e));
    return false;
  }
}
