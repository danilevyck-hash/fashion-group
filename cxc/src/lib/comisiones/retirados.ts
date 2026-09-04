// Vendedores RETIRADOS de Comisiones — UN solo lugar.
//
// 🩸 Daniel, textual:
//   · 3-ago-2026: «quita el vendedor aguas, no lo quiero ver».
//   · 3-sep-2026: «esconder rey stoute», y al rato, corrigiendo la primera
//     versión de este cambio: «te dije que eliminaras Rey Stoute Aguas.»
//
// O sea: no es «esconder la fila». Esa persona DESAPARECE de Comisiones
// entera: la matriz de todas las empresas, la tabla por empresa, las tarjetas
// del celular, el modal de detalle, los tres Excel y la pantalla de
// Configuración (ni en «Tasas por vendedor» ni en el desplegable al agregar un
// cliente que no comisiona). Ni en tablas ni en totales. En pantalla no se dice
// nada de él: no existe. Y el servidor rechaza con mensaje una tasa o una
// exclusión a su nombre.
//
// Lo que pasó entre una fecha y la otra: la lista vivía dentro de
// `ComisionesConsolidadoView` y comparaba «AGUAS» a secas. Desde la v8 el
// SERVIDOR junta las grafías por `comision_vendedor_alias` (AGUAS → REY STOUTE
// AGUAS), así que a la pantalla ya no llegaba «AGUAS» sino «REY STOUTE AGUAS» y
// la fila reapareció ($49,83 en 2026, todo en Vistana; medido con la RPC real
// en `scripts/_medir-comisiones-aguas-retirado.mjs`). La comparación se hace
// por el nombre CANÓNICO —el que devuelve `aplicarAlias`— y por eso el alias
// AGUAS → REY STOUTE AGUAS SE QUEDA: sirve para reconocerlo por cualquier grafía.
//
// Lo que NO se borra:
//   · Sus 4 facturas de julio en Vistana (y sus recibos) siguen en Switch — de
//     ahí no se pueden borrar, y la RPC los sigue calculando. Es esta lista la
//     que los saca antes de que lleguen a una tabla o a un total.
//   · Su fila en `comision_vendedor_tasa` se DESACTIVA (`activo = false`,
//     migración `20260916120000_retirar_rey_stoute_aguas.sql`), nunca DELETE:
//     regla de la casa.
//
// ⚠️ Se excluye de la TABLA **y de los totales**, en el mismo paso. Esconder
// solo la fila dejaría un total que no cuadra con lo que se ve — y un total que
// no cuadra es lo que hace que nadie vuelva a confiar en la pantalla. Es una
// lista para que retirar a otro sea una línea, no un rediseño.
//
// «AGUAS» a secas se conserva en la lista: `aplicarAlias` falla ABIERTO (si la
// tabla de alias no se pudo leer, el nombre sale tal cual) y ese día la grafía
// vieja tampoco tiene que aparecer.

import { aplicarAlias, claveAlias, type AliasVendedor } from "@/lib/comisiones/alias";

/** Los retirados. Se comparan en mayúsculas y sin bordes, ya pasados por el alias. */
export const VENDEDORES_RETIRADOS: readonly string[] = ["REY STOUTE AGUAS", "AGUAS"];

const RETIRADOS = new Set(VENDEDORES_RETIRADOS.map(claveAlias));

/**
 * ¿Este vendedor está retirado de Comisiones?
 *
 * El nombre pasa primero por el alias (con la lista que tenga quien llama; en
 * el navegador llega vacía porque el servidor ya canonicalizó) y después se
 * compara por la misma clave que usa `alias.ts`: mayúsculas, sin bordes.
 */
export function estaRetirado(vendedor: string | null | undefined, alias: readonly AliasVendedor[] = []): boolean {
  const canonico = aplicarAlias(vendedor, alias);
  if (!canonico) return false;
  return RETIRADOS.has(claveAlias(canonico));
}

/** Quita a los retirados de una lista. Puro: no toca ningún monto de los que quedan. */
export function sinRetirados<T extends { vendedor: string }>(
  vendedores: readonly T[],
  alias: readonly AliasVendedor[] = [],
): T[] {
  return (vendedores ?? []).filter((v) => !estaRetirado(v.vendedor, alias));
}

/** Lo que contesta el servidor si alguien intenta cargarle una tasa o una exclusión. */
export const AVISO_VENDEDOR_RETIRADO = "Ese vendedor ya no está en Comisiones.";
