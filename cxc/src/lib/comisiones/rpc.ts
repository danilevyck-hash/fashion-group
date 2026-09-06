// Qué RPC de comisión se llama — UNA sola vez, para las dos rutas.
//
// `comision_b2b_v9` = la v8 SIN el filtro por NOMBRE de «multi fashion
// holding»: ese cliente (D-108, la intercompañía) pasó a `comision_exclusion`
// por CÓDIGO, con el comodín de vendedor `*` = todos. Daniel, 6-sep-2026:
// «debe de ser por código, ¿no?». Medido: mientras la DDL no corra, la v8 da
// EXACTAMENTE los mismos números (el nombre sigue filtrando), así que caer a
// la anterior no mueve un centavo.
//
// `comision_b2b_v8` = la v7 más el ALIAS DE VENDEDOR (tabla
// `comision_vendedor_alias`: REINALDO/REYNALDO/REINDALDO → una sola persona,
// «Reynaldo Espinosa»; AGUAS → «Rey Stoute Aguas») y las exclusiones con
// VENTA y COBRO por separado (`excluye_venta` / `excluye_cobro`).
//
// 🩸 Daniel, 3-sep-2026, textual: «¿por qué hay 4 Reinaldo?», «llámalo
// Reynaldo y no Reinaldo», «poder quitar comisiones en ventas o comisiones sin
// que tengan que ser de los dos».
//
// `comision_b2b_v7` = la v6 más las EXCLUSIONES por (empresa, cliente,
// vendedor) de la tabla `comision_exclusion`. `comision_b2b_v6` paga el COBRO a
// quien REGISTRÓ el recibo (switch_recibos.vendedor_registro). Hasta la v5 se
// pagaba al dueño de la cartera del cliente (vendedor_cartera).
//
// Las DDL las corre Daniel a mano, así que entre el deploy y la corrida del SQL
// la versión nueva no existe: se cae a la anterior en vez de dejar la pantalla
// en blanco, y la respuesta DICE con qué versión salió (`version`,
// `regla_cobro`, `exclusiones_aplicadas`, `alias_aplicado`) para que nadie lea
// cifras viejas creyendo que son las nuevas. Un error transitorio NO cae a la
// anterior (rpcConFallbackDeVersion).

import { supabaseServer } from "@/lib/supabase-server";
import type { SupabaseLikeResult } from "@/lib/supabase-retry";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";

/** La regla vigente: v8 + el cliente de intercompañía excluido por CÓDIGO, no por nombre. */
export const RPC_COMISION = "comision_b2b_v9";
/** La anterior (D-108 filtrado por nombre dentro del SQL). Red mientras la DDL de v9 no corra. */
export const RPC_COMISION_V8 = "comision_b2b_v8";
/** Exclusiones sin casillas, sin alias. Red mientras la DDL de v8 no corra. */
export const RPC_COMISION_ANTERIOR = "comision_b2b_v7";
/** Cobro a quien registró, sin exclusiones. Red mientras la DDL de v7 no corra. */
export const RPC_COMISION_V6 = "comision_b2b_v6";
/** Cobro por cartera. Red mientras la DDL de v6 no corra. */
export const RPC_COMISION_V5 = "comision_b2b_v5";

/** De la más nueva a la más vieja: se pide la primera y se cae a la siguiente
 *  SOLO si la función no existe (o falla por algo no transitorio). */
export const CADENA_RPC_COMISION = [
  { fn: RPC_COMISION, version: "v9" },
  { fn: RPC_COMISION_V8, version: "v8" },
  { fn: RPC_COMISION_ANTERIOR, version: "v7" },
  { fn: RPC_COMISION_V6, version: "v6" },
  { fn: RPC_COMISION_V5, version: "v5" },
] as const;

export type ReglaCobro = "quien_registro" | "cartera";
export type VersionComision = (typeof CADENA_RPC_COMISION)[number]["version"];

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
  /** Qué RPC produjo estas cifras. Menor que la vigente = la DDL siguiente todavía no corrió. */
  version: VersionComision;
  /** Con qué regla se atribuyó el cobro. `cartera` = la DDL de v6 todavía no corrió. */
  regla_cobro: ReglaCobro;
  /** true desde la v7: las exclusiones por cliente YA están restadas. */
  exclusiones_aplicadas: boolean;
  /** true desde la v8: las grafías de Switch ya están colapsadas en una persona. */
  alias_aplicado: boolean;
  /** true solo con la v9: ningún cliente se excluye por su NOMBRE dentro del SQL. */
  cliente_por_codigo: boolean;
  vendedores: ComisionVendedor[];
}

type Cruda = Record<string, unknown>;
const rpc = (fn: string, args: Record<string, unknown>) =>
  supabaseServer.rpc(fn, args) as PromiseLike<SupabaseLikeResult<Cruda>>;

/**
 * Comisión de UNA empresa en UN mes: v9, con red a la v8, la v7, la v6 y la v5.
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
  // no ve esas escrituras (angostaría `version` a la primera para siempre).
  const corrio: { version: VersionComision } = { version: CADENA_RPC_COMISION[0].version };

  // La cadena, anidada de atrás hacia adelante: cada eslabón pide su función y,
  // si no existe, anota la versión del siguiente y lo llama.
  const llamar = (i: number): PromiseLike<SupabaseLikeResult<Cruda>> => {
    const eslabon = CADENA_RPC_COMISION[i];
    const siguiente = CADENA_RPC_COMISION[i + 1];
    if (!siguiente) return rpc(eslabon.fn, args);
    return rpcConFallbackDeVersion<Cruda>(
      () => rpc(eslabon.fn, args),
      () => {
        corrio.version = siguiente.version;
        return llamar(i + 1);
      },
      { label: eslabon.fn },
    );
  };

  const res = await llamar(0);
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
      exclusiones_aplicadas: version === "v9" || version === "v8" || version === "v7",
      alias_aplicado: version === "v9" || version === "v8",
      cliente_por_codigo: version === "v9",
      vendedores: (d.vendedores ?? []) as ComisionVendedor[],
    },
    error: null,
  };
}
