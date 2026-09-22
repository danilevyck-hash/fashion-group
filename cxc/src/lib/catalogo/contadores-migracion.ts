// ─────────────────────────────────────────────────────────────────────────────
// LA MIGRACIÓN DE LOS CONTADORES, IMPRESA DESDE EL MÓDULO.
//
// 🔴 EL `.sql` DEL REPO NO SE ESCRIBE A MANO: es la salida de esta función. El
// candado (`catalogo-contadores-una-regla.test.ts`) compara el archivo con lo
// que esto genera, **byte a byte**. Editar el SQL a mano pone el build ROJO, que
// es justo lo que impide que la base y `estaALaVenta` se separen sin que nadie
// se entere.
//
// Para regenerarlo:  npx tsx scripts/_generar-migracion-contadores.ts
//
// Vive aparte de `contadores.ts` para que la pantalla no arrastre el texto de
// una migración al navegador.
// ─────────────────────────────────────────────────────────────────────────────

import { MARCAS_DEL_HUB, sqlContadores, tablaDePedidos } from "@/lib/catalogo/contadores";
import { DIAS_PULSO } from "@/lib/catalogo/pulso-pedidos";

/** Nombre del archivo en `supabase/migrations/`. */
export const ARCHIVO_MIGRACION = "20261214120000_hub_tarjetas_y_pulso.sql";

/** El nombre de la función en la base — el mismo que llama el servidor. */
export const RPC_CONTADORES = "catalogos_contadores_hub";

/** La función del pulso de cada tarjeta (comprobantes · monto · último). */
export const RPC_PULSO = "catalogos_pulso_pedidos";

/**
 * El pulso de una marca, en SQL.
 *
 * 🔴 TRES NÚMEROS, DOS ALCANCES DISTINTOS, Y ESTÁ A PROPÓSITO: cuántos y cuánto
 * son de los últimos `DIAS_PULSO` días; «el último» NO lleva ventana, para que
 * una marca dormida siga diciendo hace cuánto fue la última vez.
 *
 * 🔴 EL DÍA ES EL DE PANAMÁ, no el de la base (que corre en UTC): tanto el
 * corte como la fecha del último pasan por `at time zone 'America/Panama'`. Es
 * la misma conversión que hace `fechaPanamaDe` en el camino de respaldo.
 *
 * ⚠️ `deleted is not true` y no `= false`: un `deleted` en NULL es una fila
 * viva, y un `.eq(false)` la perdería.
 */
function selectDelPulso(marca: string): string {
  const fecha = `(o.created_at at time zone 'America/Panama')::date`;
  const dentro = `${fecha} >= ((now() at time zone 'America/Panama')::date - dias)`;
  return (
    `  select '${marca}'::text as marca,\n` +
    `         count(*) filter (where ${dentro})::int as comprobantes,\n` +
    `         coalesce(sum(o.total) filter (where ${dentro}), 0)::numeric as monto,\n` +
    `         max(${fecha}) as ultimo\n` +
    `    from public.${tablaDePedidos(marca as never)} o\n` +
    `   where o.deleted is not true`
  );
}

/** El cuerpo de la función del pulso: las cuatro marcas, una detrás de otra. */
export function sqlPulso(): string {
  return MARCAS_DEL_HUB.map(selectDelPulso).join("\n  union all\n");
}

export function migracionContadores(): string {
  return `-- ═══════════════════════════════════════════════════════════════════════════
-- EL HUB DE MARCAS DICE LO QUE EL CLIENTE VE, Y EL PULSO DE CADA MARCA
-- (22-sep-2026)
--
-- Reemplaza a 20261123120000_contadores_hub_catalogos.sql, que contaba FILAS.
--
-- 1. \`${RPC_CONTADORES}()\` — ahora devuelve CUATRO números por marca.
--    El hub decía «81 productos a la venta» de Joybees y al entrar salían 70
--    tarjetas: Joybees es la única marca que junta las tallas de un modelo en
--    UNA tarjeta, y hay 11 modelos con dos filas cada uno (-KIDS/-JUNIOR,
--    -M/-W), cada una con su inventario y a veces con su propio precio.
--    81 - 11 = 70. Daniel decidió que el hub diga 70.
--
--    \`a_la_venta\`/\`sin_foto\` NO cambian de significado: siguen siendo las FILAS
--    vendibles, con la regla de \`estaALaVenta\` intacta. Las tarjetas son un dato
--    APARTE (\`tarjetas\`/\`tarjetas_sin_foto\`), encima de esas mismas filas.
--
-- 2. \`${RPC_PULSO}(dias int)\` — el pulso de la tarjeta: cuántos
--    comprobantes vivos van en los últimos ${DIAS_PULSO} días, cuánto suman, y
--    la fecha del último (ésa SIN ventana). Joybees llevaba 29 días sin un
--    comprobante y nada en la pantalla lo decía.
--
-- 🔴 ESTE ARCHIVO NO SE EDITA A MANO. Lo GENERA
-- \`src/lib/catalogo/contadores-migracion.ts\` a partir de \`contadores.ts\`, que es
-- donde el SQL se deriva cláusula por cláusula de \`estaALaVenta\` — la regla
-- única de «se ve al entrar al catálogo» — y sufijo por sufijo de
-- \`groupByModel\`, la regla única de «qué es un modelo». Hay candado que compara
-- este archivo con esa salida byte a byte.
--
--   npx tsx scripts/_generar-migracion-contadores.ts
--
-- ADITIVA sobre los DATOS: no toca una sola fila ni una sola columna. Lo único
-- que borra es la versión vieja de \`${RPC_CONTADORES}\`, y hay que
-- borrarla porque Postgres no deja cambiarle el tipo de retorno a una función
-- con \`create or replace\`.
--
-- 🔴 FALLA ABIERTA. Mientras esto no se aplique —y también en el instante entre
-- el drop y el create— la función no está, el servidor cuenta leyendo las filas
-- con \`productosALaVenta\` + \`groupByModel\` y el hub dice los MISMOS números,
-- solo que más lento. Ninguna pantalla en blanco y ningún 81.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.${RPC_CONTADORES}();

create or replace function public.${RPC_CONTADORES}()
returns table (marca text, a_la_venta int, sin_foto int, tarjetas int, tarjetas_sin_foto int)
language sql
stable
set search_path = public
as $fn$
${sqlContadores()}
$fn$;

comment on function public.${RPC_CONTADORES}() is
  'Contadores del hub /catalogos/marcas. GENERADA desde src/lib/catalogo/contadores.ts — no editar a mano.';

revoke all on function public.${RPC_CONTADORES}() from public;
grant execute on function public.${RPC_CONTADORES}() to service_role;

create or replace function public.${RPC_PULSO}(dias int)
returns table (marca text, comprobantes int, monto numeric, ultimo date)
language sql
stable
set search_path = public
as $fn$
${sqlPulso()}
$fn$;

comment on function public.${RPC_PULSO}(int) is
  'Pulso de cada tarjeta del hub /catalogos/marcas. GENERADA desde src/lib/catalogo/contadores-migracion.ts — no editar a mano.';

revoke all on function public.${RPC_PULSO}(int) from public;
grant execute on function public.${RPC_PULSO}(int) to service_role;
`;
}
