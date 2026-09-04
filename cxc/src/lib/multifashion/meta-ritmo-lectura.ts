// ─────────────────────────────────────────────────────────────────────────────
// LEER LO QUE NECESITA LA LÍNEA «🎯 Meta» DEL RESUMEN DE ACS — la capa de I/O.
// La cuenta vive en `meta-ritmo.ts` (puro); acá solo se traen los números.
//
// 🔴 EL «VENDIDO» ES EL MISMO QUE EL DE LA PANTALLA DE METAS. Sale de
// `leerVentasDelPeriodo` + `totalDe` (metas-lectura.ts): la RPC
// `multifashion_meta_ventas_v1` con su caída a la lectura paginada, sobre
// `_multifashion_sf_vw`, `is_wholesale = false`, subtotal FIRMADO. Ni un filtro
// distinto: si el Telegram y la pestaña Metas dijeran dos «vendido» distintos,
// Daniel dejaría de creer en los dos.
//
// QUÉ META: la fila ACTIVA de `multifashion_metas`, `tipo = 'grupal'`, no
// borrada, cuyo rango cubre el `corte` del resumen. Si hay más de una, la de
// `created_at` más reciente. Sin meta que cubra el día → `null` y la línea no
// sale (en enero desaparece sola).
//
// FALLA ABIERTO: cualquier error se loguea y devuelve `null`. El resumen de las
// 8pm no se cae por la meta.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { unAnioAntes } from "@/lib/ventas/clientes-corte-comparativo";
import { leerVentasDelPeriodo, totalDe } from "./metas-lectura";
import { ritmoMeta, type RitmoMeta } from "./meta-ritmo";

interface FilaMetaGrupal {
  id: string;
  desde: string;
  hasta: string;
  objetivo: number | string;
}

export interface MetaGrupalVigente {
  id: string;
  desde: string;
  hasta: string;
  objetivo: number;
}

/** La meta grupal activa que cubre `corte`, o `null`. Lanza si la base falla. */
export async function leerMetaGrupalVigente(corte: string): Promise<MetaGrupalVigente | null> {
  const { data, error } = await supabaseServer
    .from("multifashion_metas")
    .select("id,desde,hasta,objetivo")
    .eq("deleted", false)
    .eq("activa", true)
    .eq("tipo", "grupal")
    .lte("desde", corte)
    .gte("hasta", corte)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`multifashion_metas: ${error.message}`);
  const fila = (data ?? [])[0] as FilaMetaGrupal | undefined;
  if (!fila || fila.desde == null || fila.hasta == null || fila.objetivo == null) return null;
  return {
    id: String(fila.id),
    desde: String(fila.desde).slice(0, 10),
    hasta: String(fila.hasta).slice(0, 10),
    objetivo: Number(fila.objetivo),
  };
}

async function ventaRetail(desde: string, hasta: string): Promise<number> {
  const { filas } = await leerVentasDelPeriodo(desde, hasta);
  return totalDe(filas);
}

/**
 * El ritmo de la meta al `corte` (el MISMO corte que usan las líneas Mes/Año:
 * si el día no sincronizó, es ayer). `null` cuando no hay meta, no hay
 * comparable, o algo falló — en los tres casos la línea no se muestra.
 */
export async function leerRitmoMeta(corte: string): Promise<RitmoMeta | null> {
  try {
    const meta = await leerMetaGrupalVigente(corte);
    if (!meta) return null;

    const [vendido, ventaPrevRango, ventaPrevHastaCorte] = await Promise.all([
      ventaRetail(meta.desde, corte),
      ventaRetail(unAnioAntes(meta.desde), unAnioAntes(meta.hasta)),
      ventaRetail(unAnioAntes(meta.desde), unAnioAntes(corte)),
    ]);

    return ritmoMeta({ objetivo: meta.objetivo, vendido, ventaPrevRango, ventaPrevHastaCorte });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[acs-resumen] no pude calcular el ritmo de la meta (${msg}); el resumen sale sin esa línea`);
    return null;
  }
}
