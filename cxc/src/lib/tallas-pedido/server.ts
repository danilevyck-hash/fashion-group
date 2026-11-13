// I/O del «Excel de tallas por pedido»: el pedido de Switch y las tallas de los
// despachos guardadas en `despacho_tallas`. Las decisiones viven en `armar.ts`.
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { bajarLineas, hayQueBajar, leerLineas } from "@/lib/guias/pedido-detalle-server";
import { candidatosDeReferencia, type LineaDelPedido, type TallaDeDespacho } from "./armar";
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

  const porCodigo = new Map<string, LineaDelPedido>();
  for (const l of detalle.lineas) {
    const previa = porCodigo.get(l.codigo);
    porCodigo.set(
      l.codigo,
      previa ? { ...previa, cantidad: previa.cantidad + l.cantidad } : { codigo: l.codigo, descripcion: l.descripcion, cantidad: l.cantidad },
    );
  }
  const { data } = await supabaseServer
    .from("switch_pedidos")
    .select("secuencial, cliente_nombre")
    .eq("empresa_key", empresa)
    .eq("pedido_switch_id", id)
    .maybeSingle();
  return {
    secuencial: data?.secuencial ?? String(id),
    cliente: data?.cliente_nombre ?? null,
    lineas: [...porCodigo.values()],
  };
}

const COLUMNAS = "referencia, codigo_caja, talla, ean, cantidad, cajas, pares_por_caja, factura, correo_id, fecha_despacho";

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
