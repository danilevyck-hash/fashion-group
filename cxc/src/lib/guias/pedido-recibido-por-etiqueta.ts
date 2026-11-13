/**
 * 🔴 GENERAR LA ETIQUETA RECIBE EL PEDIDO (Daniel, 13-nov-2026: «si no, queda
 * pendiente para siempre»). La factura trae su N.° de pedido
 * (`switch_facturas.pedido_referencia`, «16-000002463» = pedido 2463 de la
 * MISMA empresa); si ese pedido está Preparado, pasa a Recibido con la firma
 * de quien generó la etiqueta y rastro en `activity_logs`.
 *
 *   · Es la única excepción a «Recibido lo marca la secretaria».
 *   · Anular o borrar la etiqueta NO devuelve el pedido a Preparado.
 *   · Falla ABIERTA: si algo falla, la etiqueta ya está guardada y se calla;
 *     el pedido queda Preparado y la secretaria lo recibe a mano como antes.
 */
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { columnasDelPaso, pedidoDeReferencia } from "./pedidos-flujo-simple";

export async function recibirPedidosDeEtiquetas(
  empresa: string,
  facturaIds: ReadonlyArray<number | null | undefined>,
  quien: string,
  rol: string,
  userName?: string,
): Promise<string[]> {
  const ids = [...new Set(facturaIds.filter((n): n is number => typeof n === "number"))];
  if (ids.length === 0) return [];
  try {
    const { data: facs, error: fErr } = await supabaseServer
      .from("switch_facturas")
      .select("switch_factura_id, pedido_referencia")
      .eq("empresa_key", empresa)
      .in("switch_factura_id", ids);
    if (fErr) throw new Error(fErr.message);
    const pedidos = [...new Set(((facs ?? []) as Array<{ pedido_referencia: string | null }>)
      .map((f) => pedidoDeReferencia(f.pedido_referencia))
      .filter((n): n is number => n != null))];
    if (pedidos.length === 0) return [];
    const { data: previos, error: pErr } = await supabaseServer
      .from("pedidos_bodega_estado")
      .select("*")
      .eq("empresa_key", empresa)
      .in("pedido_switch_id", pedidos)
      .eq("estado", "preparado");
    if (pErr) throw new Error(pErr.message);
    const recibidos: string[] = [];
    for (const previo of (previos ?? []) as Array<Record<string, unknown> & { pedido_switch_id: number }>) {
      const ahora = new Date().toISOString();
      const fila = { cambiado_por: quien, cambiado_en: ahora, ...columnasDelPaso("preparado", "recibido", quien, ahora) };
      // `.eq("estado", "preparado")`: si otra persona lo movió, no se pisa.
      const { error } = await supabaseServer
        .from("pedidos_bodega_estado")
        .update(fila)
        .eq("empresa_key", empresa)
        .eq("pedido_switch_id", previo.pedido_switch_id)
        .eq("estado", "preparado");
      if (error) { console.error("[etiquetas] recibir pedido:", error.message); continue; }
      await logActivity(
        rol,
        "recibido_por_etiqueta",
        "pedidos_bodega_estado",
        { pedido: `${empresa}:${previo.pedido_switch_id}`, desde: "preparado", hasta: "recibido", antes: previo, despues: fila },
        userName,
      );
      recibidos.push(`16-${String(previo.pedido_switch_id).padStart(9, "0")}`);
    }
    return recibidos;
  } catch (e) {
    console.error("[etiquetas] recibir pedidos:", e instanceof Error ? e.message : String(e));
    return [];
  }
}
