// Qué RPC de comisión se llama — UNA sola vez, para las dos rutas.
//
// `comision_b2b_v6` paga el COBRO a quien REGISTRÓ el recibo
// (switch_recibos.vendedor_registro). Hasta la v5 se pagaba al dueño de la
// cartera del cliente (vendedor_cartera).
//
// 🩸 Daniel, 3-sep-2026, textual: «el que vende a veces no es el que cobra.
// Edwin puede vender 50k a City Mall y Daniel o DEFAULT cobrar esa plata. Los
// 50k en comisiones en venta va a Edwin y los 50k en cobros irían a DEFAULT
// por ejemplo». La comisión de VENTA no cambia (vendedor de la factura).
//
// Las DDL las corre Daniel a mano, así que entre el deploy y la corrida del SQL
// la v6 no existe: se cae a la v5 (regla vieja, misma forma de respuesta) en
// vez de dejar la pantalla en blanco, y la respuesta DICE con qué regla salió
// (`regla_cobro`) para que nadie lea cifras de cartera creyendo que son las
// nuevas. Un error transitorio NO cae a la anterior (rpcConFallbackDeVersion).

import { supabaseServer } from "@/lib/supabase-server";
import type { SupabaseLikeResult } from "@/lib/supabase-retry";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";

/** La regla vigente: el cobro se paga a quien registró el recibo. */
export const RPC_COMISION = "comision_b2b_v6";
/** La anterior (cobro por cartera). Se conserva para comparar y como red mientras la DDL no corra. */
export const RPC_COMISION_ANTERIOR = "comision_b2b_v5";

export type ReglaCobro = "quien_registro" | "cartera";

export interface ComisionVendedor {
  vendedor: string;
  base: number;
  tasa: number;
  comision: number;
  base_cobro: number;
  tasa_cobro: number;
  comision_cobro: number;
  comision_total: number;
}

export interface ComisionRespuesta {
  empresa_key: string;
  year: number;
  mes: number;
  /** Con qué regla se atribuyó el cobro. `cartera` = la DDL de v6 todavía no corrió. */
  regla_cobro: ReglaCobro;
  vendedores: ComisionVendedor[];
}

/**
 * Comisión de UNA empresa en UN mes, con la regla nueva y red a la vieja.
 * El `regla_cobro` lo pone acá y no la RPC: la v5 no lo trae, y es justo en el
 * fallback donde más importa que se diga.
 */
export async function leerComision(
  empresa: string,
  year: number,
  mes: number,
): Promise<SupabaseLikeResult<ComisionRespuesta>> {
  const args = { p_empresa_key: empresa, p_year: year, p_mes: mes };
  let usoAnterior = false;
  const res = await rpcConFallbackDeVersion<Record<string, unknown>>(
    () => supabaseServer.rpc(RPC_COMISION, args) as PromiseLike<SupabaseLikeResult<Record<string, unknown>>>,
    () => {
      usoAnterior = true;
      return supabaseServer.rpc(RPC_COMISION_ANTERIOR, args) as PromiseLike<SupabaseLikeResult<Record<string, unknown>>>;
    },
    { label: RPC_COMISION },
  );
  if (res.error) return { data: null, error: res.error };
  const d = (res.data ?? {}) as Partial<ComisionRespuesta>;
  return {
    data: {
      empresa_key: d.empresa_key ?? empresa,
      year: d.year ?? year,
      mes: d.mes ?? mes,
      regla_cobro: usoAnterior ? "cartera" : "quien_registro",
      vendedores: (d.vendedores ?? []) as ComisionVendedor[],
    },
    error: null,
  };
}
