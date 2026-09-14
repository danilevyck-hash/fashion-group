-- ═══════════════════════════════════════════════════════════════════════════
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
-- `src/lib/catalogo/contadores-migracion.ts` a partir de `contadores.ts`, que es
-- donde el SQL se deriva cláusula por cláusula de `estaALaVenta` — la regla
-- única de «se ve al entrar al catálogo». Hay candado que compara este archivo
-- con esa salida byte a byte.
--
--   npx tsx scripts/_generar-migracion-contadores.ts
--
-- ADITIVA: solo crea una función. No toca una sola fila ni una sola columna.
-- Mientras no se aplique, el servidor cuenta leyendo las filas con la misma
-- regla y el hub se comporta igual (falla ABIERTA).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.catalogos_contadores_hub()
returns table (marca text, a_la_venta int, sin_foto int)
language sql
stable
set search_path = public
as $fn$
  select 'reebok'::text as marca,
         count(*)::int as a_la_venta,
         count(*) filter (where coalesce(btrim(p.image_url), '') = '')::int as sin_foto
    from public.products p
  left join (select i.product_id as llave, sum(i.quantity) as piezas
               from public.inventory i group by i.product_id) inv
         on inv.llave = p.id
   where p.active is true
     and (
       greatest(0, coalesce(p.disponibilidad, p.existencia, inv.piezas, 0)) > 0
    or p.badge = 'proximamente'
     )
  union all
  select 'joybees'::text as marca,
         count(*)::int as a_la_venta,
         count(*) filter (where coalesce(btrim(p.image_url), '') = '')::int as sin_foto
    from public.joybees_products p
   where p.active is true
     and (
       greatest(0, coalesce(p.disponibilidad, p.existencia, p.stock, 0)) > 0
    or p.is_regalia is true
    or p.badge = 'proximamente'
     )
  union all
  select 'tommy'::text as marca,
         count(*)::int as a_la_venta,
         count(*) filter (where coalesce(btrim(p.image_url), '') = '')::int as sin_foto
    from public.tommy_products p
   where p.active is true
     and (
       greatest(0, coalesce(p.disponibilidad, p.existencia, p.stock, 0)) > 0
    or p.badge = 'proximamente'
     )
  union all
  select 'calvin'::text as marca,
         count(*)::int as a_la_venta,
         count(*) filter (where coalesce(btrim(p.image_url), '') = '')::int as sin_foto
    from public.calvin_products p
   where p.active is true
     and (
       greatest(0, coalesce(p.disponibilidad, p.existencia, p.stock, 0)) > 0
    or p.badge = 'proximamente'
     )
$fn$;

comment on function public.catalogos_contadores_hub() is
  'Contadores del hub /catalogos/marcas. GENERADA desde src/lib/catalogo/contadores.ts — no editar a mano.';

revoke all on function public.catalogos_contadores_hub() from public;
grant execute on function public.catalogos_contadores_hub() to service_role;
