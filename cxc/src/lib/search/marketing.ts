// ============================================================================
// EL RESULTADO DE MARKETING EN LA BÚSQUEDA GLOBAL (⌘K). Módulo PURO.
//
// Daniel (22-sep-2026): *«debería estar organizado: ver por cliente, busco el
// cliente o proyecto y ver adentro la info (por marca etc.)»*.
//
// 🔴 EL RESULTADO LLEVA A DONDE DICE: un resultado de Marketing abre la vista
// de ESA tienda, `/marketing/tienda/<código>` — la misma regla que la guía que
// abre `/guias/<id>` y el cliente que abre `/clientes/<código>`. La dirección
// NO se escribe acá: sale de `marketing/vista-tienda.ts › hrefDeTienda`, que
// es el único lugar donde está.
//
// 🔴 LA TIENDA SE BUSCA POR PALABRA, no por parecido ni por «contiene»: ver
// `texto.ts` (medido — «nova» traía «Renovación»). Y el CÓDIGO se compara
// igual: escribir «D-25» encuentra D-25.
// ============================================================================

import { hrefDeTienda } from "@/lib/marketing/vista-tienda";
import { coincidePorPalabra } from "./texto";

/** Una tienda con gasto de Marketing, como viaja al navegador. */
export interface TiendaDeMarketing {
  /** Código del directorio (D-25) o `null` para el cajón «General». */
  codigo: string | null;
  /** Nombre del directorio; sin él, el código. */
  nombre: string;
  /** Cuántos gastos tiene (facturas + muebles + pagos de impulsadora). */
  gastos: number;
  /** Cuánto suman los que SE REPORTAN. */
  monto: number;
}

/** A dónde lleva el resultado. Una sola definición, la de `vista-tienda.ts`. */
export function hrefDelResultado(t: Pick<TiendaDeMarketing, "codigo">): string {
  return hrefDeTienda(t.codigo);
}

/**
 * Las tiendas que coinciden con lo que se escribió: por NOMBRE o por CÓDIGO,
 * por palabra. Orden: la de más gasto reportado primero. Nunca devuelve más
 * de `max` (5, como las demás secciones del buscador).
 */
export function buscarTiendas(
  consulta: string,
  tiendas: ReadonlyArray<TiendaDeMarketing>,
  max = 5,
): TiendaDeMarketing[] {
  const c = String(consulta ?? "").trim();
  if (c.length === 0) return [];
  return tiendas
    .filter((t) => coincidePorPalabra(t.nombre, c) || coincidePorPalabra(t.codigo ?? "", c))
    .sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, max);
}
