// ─────────────────────────────────────────────────────────────────────────────
// LA venta RETAIL de Multifashion (American Classics) en un rango de días.
//
// UNA sola implementación, DOS consumidores:
//   · el resumen de las 8pm que sale por Telegram  → src/lib/acs-resumen-diario.ts
//   · la tarjeta "HOY" del módulo en pantalla      → /api/multifashion/venta-hoy
//
// 🩸 POR QUÉ VIVE ACÁ Y NO EN CADA UNO. El resumen de Telegram ya calculaba la
// venta del día; escribir una segunda cuenta para la pantalla es la forma más
// fácil de que Daniel reciba $2.619 al celular y lea $2.817 en la app. Cuando
// dos números que deberían ser el mismo no coinciden, no se deja de creer en el
// que está mal: se deja de creer en los dos. Así que la cuenta se escribe una
// vez y el candado `multifashion-venta-hoy.test.ts` verifica que los dos
// consumidores lleguen al MISMO número desde las MISMAS filas.
//
// ── LA SEMÁNTICA (la del módulo Multifashion, validada al centavo contra
//    multifashion_overview_serie_v1 el 4-jul-2026) ─────────────────────────────
//   · Fuente: `_multifashion_sf_vw` — proyección de switch_facturas de
//     american_classic con la fecha ya en día-calendario de Panamá y el
//     subtotal FIRMADO (las Notas de Crédito entran NEGATIVAS).
//   · RETAIL puro (`is_wholesale = false`): el módulo compara mostrador contra
//     mostrador; el mayoreo B2B es esporádico y de otro tamaño, y metido en el
//     pulso diario de la tienda lo distorsiona.
//   · Métrica: SUM(subtotal) — neto pre-impuesto, sobre `subtotal_descuento`.
//
// ⚠️ LAS NC RESTAN, Y ESO CAMBIA EL NÚMERO. Medido el 8-ago-2026: ese día ACS
// tuvo 48 facturas por $2.718,44 y 2 notas de crédito por $98,75. Sumando todo
// en crudo dan $2.817,19; restando las NC —que es lo correcto, y lo que hace
// esta vista— dan $2.619,69. La diferencia es EXACTAMENTE el doble de las NC
// ($197,50): esa es la firma de haberlas sumado en vez de restarlas. El número
// bueno es el de acá.
//
// `documentos` cuenta TODOS los documentos retail del rango, NC incluidas — es
// el mismo COUNT(*) que el módulo muestra como "tiquetes", así que la tarjeta
// no puede discrepar del Resumen que está justo debajo.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";

export const VISTA_RETAIL = "_multifashion_sf_vw";

export interface RetailRango {
  /** SUM(subtotal) firmado, redondeado a centavos. */
  ventas: number;
  /** COUNT(*) de documentos retail (facturas + tiquetes + NC). */
  documentos: number;
}

interface FilaRetail {
  subtotal: number | string | null;
}

/**
 * Venta retail y cantidad de documentos en `[desde, hasta]` (fechas de Panamá,
 * ambas INCLUSIVE).
 *
 * Pagina con `leerTodoPaginado`: PostgREST corta en 1.000 filas sin avisar y un
 * año de ACS pasa largamente de eso (~30.000 documentos). El orden de paginación
 * es `n_sistema` (= `switch_factura_id`, único por documento) — estable, que es
 * lo que exige paginar; acá no hay orden de presentación que conservar porque el
 * resultado es una suma.
 */
export async function leerRetailRango(desde: string, hasta: string): Promise<RetailRango> {
  const filas = await leerTodoPaginado<FilaRetail>(
    `${VISTA_RETAIL} [${desde}..${hasta}]`,
    (pedirCount, from, to) =>
      supabaseServer
        .from(VISTA_RETAIL)
        .select("subtotal", pedirCount ? { count: "exact" } : {})
        .eq("is_wholesale", false)
                .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("n_sistema", { ascending: true })
        .range(from, to),
  );

  let suma = 0;
  for (const f of filas) suma += Number(f.subtotal) || 0;
  return { ventas: Math.round(suma * 100) / 100, documentos: filas.length };
}

/** Sólo el monto — la forma que consume el resumen de Telegram. */
export async function sumRetail(desde: string, hasta: string): Promise<number> {
  return (await leerRetailRango(desde, hasta)).ventas;
}
