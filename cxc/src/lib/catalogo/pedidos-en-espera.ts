// ─────────────────────────────────────────────────────────────────────────────
// Pedidos del catálogo confirmados mientras Switch está EN PAUSA (26-nov-2026).
//
// El motor (`enviarPedidoSwitch`) no los manda ni los marca «error»: los anota
// aquí (`switch_pausa_pedidos`, una fila por pedido) y contesta «en espera».
// Al terminar la pausa —«Reanudar ahora» o el primer cron de Switch después
// del plazo— `enviarPedidosEnEspera` los toma uno por uno (update condicional
// de `tomado_en`) y los manda por el MISMO camino del checkout en segundo
// plano. El candado at-most-once no cambia: lo sigue poniendo el motor con la
// fila 'pendiente' y el índice único parcial de la tabla de envíos.
// ─────────────────────────────────────────────────────────────────────────────

import type { DocumentoSwitch } from "./documento-switch";

export const TABLA_EN_ESPERA = "switch_pausa_pedidos";

// Import dinámico: el motor de envío (que importa este archivo) se prueba sin
// variables de Supabase, y el cliente revienta al cargarse sin ellas.
async function db() {
  return (await import("@/lib/supabase-server")).supabaseServer;
}

export async function encolarPedidoEnEspera(e: {
  enviosTable: string;
  orderId: string;
  orderNumber: string;
  documento: DocumentoSwitch;
  auto: boolean;
}): Promise<void> {
  const { error } = await (await db()).from(TABLA_EN_ESPERA).upsert(
    {
      envios_table: e.enviosTable,
      order_id: e.orderId,
      order_number: e.orderNumber,
      documento: e.documento,
      auto: e.auto,
      encolado_en: new Date().toISOString(),
      tomado_en: null,
      resultado: null,
    },
    { onConflict: "envios_table,order_id" },
  );
  // Lanza: el motor lo convierte en un envío fallido con Reintentar. Nunca se pierde.
  if (error) throw new Error(`No se pudo dejar el pedido en espera: ${error.message}`);
}

/** ¿Este pedido espera el fin de la pausa? */
export async function pedidoEnEspera(enviosTable: string, orderId: string): Promise<boolean> {
  const { data } = await (await db())
    .from(TABLA_EN_ESPERA)
    .select("id")
    .eq("envios_table", enviosTable)
    .eq("order_id", orderId)
    .is("tomado_en", null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export interface FilaEnEspera {
  id: number;
  envios_table: string;
  order_id: string;
  order_number: string | null;
  documento: DocumentoSwitch;
  auto: boolean;
}

/** Toma la fila para este proceso. `false` = otro ya la tomó. */
async function tomar(id: number): Promise<boolean> {
  const { data, error } = await (await db())
    .from(TABLA_EN_ESPERA)
    .update({ tomado_en: new Date().toISOString() })
    .eq("id", id)
    .is("tomado_en", null)
    .select("id");
  return !error && (data ?? []).length > 0;
}

/**
 * Manda los pedidos en espera, en serie (sesión única por empresa). `enviar`
 * se inyecta (arma el envío del pedido guardado y corre el motor) para que
 * esto se pueda probar sin Switch. Devuelve cuántos tomó y su desenlace.
 */
export async function enviarPedidosEnEspera(
  enviar: (f: FilaEnEspera) => Promise<string>,
): Promise<Array<{ pedido: string; resultado: string }>> {
  const { data, error } = await (await db())
    .from(TABLA_EN_ESPERA)
    .select("id, envios_table, order_id, order_number, documento, auto")
    .is("tomado_en", null)
    .order("encolado_en", { ascending: true })
    .limit(200);
  if (error) {
    console.error(`[pedidos-en-espera] no pude leer la lista: ${error.message}`);
    return [];
  }
  const hechos: Array<{ pedido: string; resultado: string }> = [];
  for (const f of (data ?? []) as FilaEnEspera[]) {
    if (!(await tomar(f.id))) continue;
    let resultado: string;
    try {
      resultado = await enviar(f);
    } catch (e) {
      resultado = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
    // «en_pausa» = la pausa volvió: el motor ya lo dejó en espera otra vez
    // (su upsert puso `tomado_en` en null); no se pisa.
    if (resultado !== "en_pausa") {
      await (await db()).from(TABLA_EN_ESPERA).update({ resultado: resultado.slice(0, 500) }).eq("id", f.id);
    }
    hechos.push({ pedido: f.order_number ?? f.order_id, resultado });
  }
  return hechos;
}
