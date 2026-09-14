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

import { sqlContadores } from "@/lib/catalogo/contadores";

/** Nombre del archivo en `supabase/migrations/`. */
export const ARCHIVO_MIGRACION = "20261123120000_contadores_hub_catalogos.sql";

/** El nombre de la función en la base — el mismo que llama el servidor. */
export const RPC_CONTADORES = "catalogos_contadores_hub";

export function migracionContadores(): string {
  return `-- ═══════════════════════════════════════════════════════════════════════════
-- LOS OCHO NÚMEROS DEL HUB DE MARCAS, CONTADOS EN LA BASE (14-sep-2026)
--
-- Para escribir «182 productos a la venta · 12 sin foto» en cuatro tarjetas, el
-- navegador se bajaba el catálogo entero de las cuatro marcas: 462,8 KB medidos
-- contra producción, y 24.384 ms de p95 en Sentry. Esta función devuelve las
-- ocho cifras ya sumadas; al navegador viajan menos de 200 bytes.
--
-- Daniel, textual (14-sep-2026): «5. ok va».
--
-- 🔴 ESTE ARCHIVO NO SE EDITA A MANO. Lo GENERA
-- \`src/lib/catalogo/contadores-migracion.ts\` a partir de \`contadores.ts\`, que es
-- donde el SQL se deriva cláusula por cláusula de \`estaALaVenta\` — la regla
-- única de «se ve al entrar al catálogo». Hay candado que compara este archivo
-- con esa salida byte a byte.
--
--   npx tsx scripts/_generar-migracion-contadores.ts
--
-- ADITIVA: solo crea una función. No toca una sola fila ni una sola columna.
-- Mientras no se aplique, el servidor cuenta leyendo las filas con la misma
-- regla y el hub se comporta igual (falla ABIERTA).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.${RPC_CONTADORES}()
returns table (marca text, a_la_venta int, sin_foto int)
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
`;
}
