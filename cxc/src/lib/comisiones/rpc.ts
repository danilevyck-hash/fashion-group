// Qué RPC de comisión se llama — UNA sola vez, para las dos rutas.
//
// `comision_b2b_v7` = la v6 más las EXCLUSIONES por (empresa, cliente,
// vendedor) de la tabla `comision_exclusion`: un vendedor que está excluido
// para un cliente no comisiona por él ni en venta ni en cobro; otro vendedor
// con el mismo cliente sí.
//
// 🩸 Daniel, 3-sep-2026, textual: «crea configuración en comisiones para
// desactivar cálculos de clientes» — grano «cliente vendedor», y aplica a
// venta y cobro: «correcto, también venta».
//
// `comision_b2b_v6` paga el COBRO a quien REGISTRÓ el recibo
// (switch_recibos.vendedor_registro). Hasta la v5 se pagaba al dueño de la
// cartera del cliente (vendedor_cartera). Daniel, 3-sep-2026: «el que vende a
// veces no es el que cobra».
//
// Las DDL las corre Daniel a mano, así que entre el deploy y la corrida del SQL
// la v7 (o la v6) no existe: se cae a la anterior en vez de dejar la pantalla
// en blanco, y la respuesta DICE con qué versión salió (`version`,
// `regla_cobro`, `exclusiones`) para que nadie lea cifras sin exclusiones
// creyendo que ya están aplicadas. Un error transitorio NO cae a la anterior
// (rpcConFallbackDeVersion).

import { supabaseServer } from "@/lib/supabase-server";
import type { SupabaseLikeResult } from "@/lib/supabase-retry";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";

/** La regla vigente: v6 + exclusiones por (empresa, cliente, vendedor). */
export const RPC_COMISION = "comision_b2b_v7";
/** La anterior (cobro a quien registró, sin exclusiones). Red mientras la DDL de v7 no corra. */
export const RPC_COMISION_ANTERIOR = "comision_b2b_v6";
/** La de antes de la anterior (cobro por cartera). Red mientras la DDL de v6 no corra. */
export const RPC_COMISION_V5 = "comision_b2b_v5";

export type ReglaCobro = "quien_registro" | "cartera";
export type VersionComision = "v7" | "v6" | "v5";

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
  /** Qué RPC produjo estas cifras. `v6`/`v5` = la DDL siguiente todavía no corrió. */
  version: VersionComision;
  /** Con qué regla se atribuyó el cobro. `cartera` = la DDL de v6 todavía no corrió. */
  regla_cobro: ReglaCobro;
  /** true solo cuando corrió la v7: las exclusiones por cliente YA están restadas. */
  exclusiones_aplicadas: boolean;
  vendedores: ComisionVendedor[];
}

type Cruda = Record<string, unknown>;
const rpc = (fn: string, args: Record<string, unknown>) =>
  supabaseServer.rpc(fn, args) as PromiseLike<SupabaseLikeResult<Cruda>>;

/**
 * Comisión de UNA empresa en UN mes: v7, con red a la v6 y a la v5.
 * La versión la pone acá y no la RPC: la v5 no la trae, y es justo en el
 * fallback donde más importa que se diga.
 */
export async function leerComision(
  empresa: string,
  year: number,
  mes: number,
): Promise<SupabaseLikeResult<ComisionRespuesta>> {
  const args = { p_empresa_key: empresa, p_year: year, p_mes: mes };
  // Objeto y no variable suelta: los cierres de abajo la escriben y TypeScript
  // no ve esas escrituras (angostaría `version` a "v7" para siempre).
  const corrio: { version: VersionComision } = { version: "v7" };
  const res = await rpcConFallbackDeVersion<Cruda>(
    () => rpc(RPC_COMISION, args),
    () => {
      corrio.version = "v6";
      return rpcConFallbackDeVersion<Cruda>(
        () => rpc(RPC_COMISION_ANTERIOR, args),
        () => {
          corrio.version = "v5";
          return rpc(RPC_COMISION_V5, args);
        },
        { label: RPC_COMISION_ANTERIOR },
      );
    },
    { label: RPC_COMISION },
  );
  if (res.error) return { data: null, error: res.error };
  const d = (res.data ?? {}) as Partial<ComisionRespuesta>;
  const version = corrio.version;
  return {
    data: {
      empresa_key: d.empresa_key ?? empresa,
      year: d.year ?? year,
      mes: d.mes ?? mes,
      version,
      regla_cobro: version === "v5" ? "cartera" : "quien_registro",
      exclusiones_aplicadas: version === "v7",
      vendedores: (d.vendedores ?? []) as ComisionVendedor[],
    },
    error: null,
  };
}
