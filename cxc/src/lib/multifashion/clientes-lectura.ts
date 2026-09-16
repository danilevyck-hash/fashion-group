// ─────────────────────────────────────────────────────────────────────────────
// LEER EL UNIVERSO DE CLIENTES DE MULTIFASHION — el I/O, y nada más.
//
// La decisión vive en `clientes-universo.ts` (módulo PURO). Acá solo están las
// dos lecturas, y están acá para que la pestaña Clientes y la fidelización
// lean EXACTAMENTE lo mismo: dos lecturas parecidas pero distintas es cómo dos
// pantallas del mismo módulo terminan diciendo números diferentes.
//
// 🔴 LAS DOS VAN CON `leerTodoPaginado`. `db-max-rows` = 1000 y corta EN
// SILENCIO: `switch_clientes` de ACS ya son 1.060 filas (medido el 16-sep-2026)
// y `switch_facturas` identificadas son 1.619. La primera YA pasa el corte, así
// que sin paginar la lista perdería 60 clientes sin un solo error.
//
// 🔴 EL ORDEN DE PAGINACIÓN ES `id`, y no es de presentación: tiene que ser
// único y estable, o PostgREST puede repetir o saltear filas entre páginas. El
// orden que ve la vendedora lo pone `clientes-seguimiento.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { MOSTRADOR_ID, type FilaFactura, type FilaRegistrado } from "./clientes-universo";

/** Multifashion ES `american_classic`. Constante del servidor, nunca de la URL. */
export const EMPRESA_KEY = "american_classic";

export interface LecturaDelUniverso {
  registrados: FilaRegistrado[];
  facturas: FilaFactura[];
  /**
   * `false` = la columna `descuento_global_pct` todavía no existe (migración
   * 20260704090000 sin correr) y nadie puede figurar como «5 % usado».
   */
  detalleActivo: boolean;
}

/** Las columnas de la factura, con y sin la del 5 %. */
const COLS_FACTURA = "cliente_switch_id, cliente_nombre, fecha, tipo_comprobante, subtotal_descuento, is_wholesale";
const COLS_FACTURA_CON_5 = `${COLS_FACTURA}, descuento_global_pct`;

function leerFacturas(cols: string, etiqueta: string): Promise<FilaFactura[]> {
  return leerTodoPaginado<FilaFactura>(etiqueta, (pedirCount, desde, hasta) =>
    supabaseServer
      .from("switch_facturas")
      .select(cols, pedirCount ? { count: "exact" } : {})
      .eq("empresa_key", EMPRESA_KEY)
      // 🔴 SIN filtro de `tipo_comprobante`: las notas de crédito hacen falta
      // para que el monto reste. Quién cuenta como VISITA lo decide el módulo
      // puro, que sigue mirando solo las «Factura».
      .not("cliente_switch_id", "is", null)
      .neq("cliente_switch_id", MOSTRADOR_ID)
      .order("id", { ascending: true })
      .range(desde, hasta),
  );
}

/** ¿El error de PostgREST es «todavía no existe `descuento_global_pct`»? */
function faltaColumnaDel5(err: unknown): boolean {
  return err instanceof Error && /descuento_global_pct/.test(err.message);
}

/**
 * Trae el directorio de la tienda y sus facturas, completos.
 *
 * Falla ABIERTA en un solo punto: si la columna del 5 % no existe todavía, se
 * vuelve a leer sin ella y `detalleActivo` sale en `false`. Todo lo demás
 * —quién es cliente, cuándo vino, cuánto compró— no depende de esa migración.
 */
export async function leerUniversoDeClientes(): Promise<LecturaDelUniverso> {
  const registrados = await leerTodoPaginado<FilaRegistrado>(
    "switch_clientes (clientes de Multifashion)",
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("switch_clientes")
        .select(
          "cliente_switch_id, nombre, telefono, celular, raw_data",
          pedirCount ? { count: "exact" } : {},
        )
        .eq("empresa_key", EMPRESA_KEY)
        .neq("cliente_switch_id", MOSTRADOR_ID)
        .order("id", { ascending: true })
        .range(desde, hasta),
  );

  try {
    const facturas = await leerFacturas(
      COLS_FACTURA_CON_5,
      "switch_facturas (clientes de Multifashion)",
    );
    return { registrados, facturas, detalleActivo: true };
  } catch (err) {
    if (!faltaColumnaDel5(err)) throw err;
    const facturas = await leerFacturas(
      COLS_FACTURA,
      "switch_facturas (clientes de Multifashion, pre-DDL)",
    );
    return { registrados, facturas, detalleActivo: false };
  }
}
