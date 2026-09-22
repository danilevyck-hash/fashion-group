-- ═══════════════════════════════════════════════════════════════════════════
-- EL HUB DE MARCAS DICE LO QUE EL CLIENTE VE, Y EL PULSO DE CADA MARCA
-- (22-sep-2026)
--
-- Reemplaza a 20261123120000_contadores_hub_catalogos.sql, que contaba FILAS.
--
-- 1. `catalogos_contadores_hub()` — ahora devuelve CUATRO números por marca.
--    El hub decía «81 productos a la venta» de Joybees y al entrar salían 70
--    tarjetas: Joybees es la única marca que junta las tallas de un modelo en
--    UNA tarjeta, y hay 11 modelos con dos filas cada uno (-KIDS/-JUNIOR,
--    -M/-W), cada una con su inventario y a veces con su propio precio.
--    81 - 11 = 70. Daniel decidió que el hub diga 70.
--
--    `a_la_venta`/`sin_foto` NO cambian de significado: siguen siendo las FILAS
--    vendibles, con la regla de `estaALaVenta` intacta. Las tarjetas son un dato
--    APARTE (`tarjetas`/`tarjetas_sin_foto`), encima de esas mismas filas.
--
-- 2. `catalogos_pulso_pedidos(dias int)` — el pulso de la tarjeta: cuántos
--    comprobantes vivos van en los últimos 90 días, cuánto suman, y
--    la fecha del último (ésa SIN ventana). Joybees llevaba 29 días sin un
--    comprobante y nada en la pantalla lo decía.
--
-- 🔴 ESTE ARCHIVO NO SE EDITA A MANO. Lo GENERA
-- `src/lib/catalogo/contadores-migracion.ts` a partir de `contadores.ts`, que es
-- donde el SQL se deriva cláusula por cláusula de `estaALaVenta` — la regla
-- única de «se ve al entrar al catálogo» — y sufijo por sufijo de
-- `groupByModel`, la regla única de «qué es un modelo». Hay candado que compara
-- este archivo con esa salida byte a byte.
--
--   npx tsx scripts/_generar-migracion-contadores.ts
--
-- ADITIVA sobre los DATOS: no toca una sola fila ni una sola columna. Lo único
-- que borra es la versión vieja de `catalogos_contadores_hub`, y hay que
-- borrarla porque Postgres no deja cambiarle el tipo de retorno a una función
-- con `create or replace`.
--
-- 🔴 FALLA ABIERTA. Mientras esto no se aplique —y también en el instante entre
-- el drop y el create— la función no está, el servidor cuenta leyendo las filas
-- con `productosALaVenta` + `groupByModel` y el hub dice los MISMOS números,
-- solo que más lento. Ninguna pantalla en blanco y ningún 81.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.catalogos_contadores_hub();

create or replace function public.catalogos_contadores_hub()
returns table (marca text, a_la_venta int, sin_foto int, tarjetas int, tarjetas_sin_foto int)
language sql
stable
set search_path = public
as $fn$
  select 'reebok'::text as marca,
         count(*)::int as a_la_venta,
         count(*) filter (where coalesce(btrim(p.image_url), '') = '')::int as sin_foto,
         count(*)::int as tarjetas,
         count(*) filter (where coalesce(btrim(p.image_url), '') = '')::int as tarjetas_sin_foto
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
         coalesce(sum(b.filas), 0)::int as a_la_venta,
         coalesce(sum(b.filas_sin_foto), 0)::int as sin_foto,
         coalesce(sum(b.tarjetas), 0)::int as tarjetas,
         coalesce(sum(case when b.todas_sin_foto then b.tarjetas else 0 end), 0)::int as tarjetas_sin_foto
    from (
           select s.llave,
                  sum(s.filas)::int as filas,
                  sum(s.filas_sin_foto)::int as filas_sin_foto,
                  max(s.filas)::int as tarjetas,
                  bool_and(s.todas_sin_foto) as todas_sin_foto
             from (
                   select v.llave,
                          v.sufijo,
                          count(*)::int as filas,
                          count(*) filter (where v.sin_foto)::int as filas_sin_foto,
                          bool_and(v.sin_foto) as todas_sin_foto
                     from (
                           select case when q.sufijo = '' then 'solo:' || q.id::text
                                       else 'base:' || upper(left(q.sku, length(q.sku) - length(q.sufijo) - 1))
                                            || '|' || coalesce(q.name, '') end as llave,
                                  q.sufijo,
                                  q.sin_foto
                             from (
                                   select p.id, p.sku, p.name,
                                          coalesce(btrim(p.image_url), '') = '' as sin_foto,
                                          case when right(upper(p.sku), 7) = '-JUNIOR' then 'JUNIOR'
                                               when right(upper(p.sku), 5) = '-KIDS' then 'KIDS'
                                               when right(upper(p.sku), 2) = '-W' then 'W'
                                               when right(upper(p.sku), 2) = '-M' then 'M'
                                               else '' end as sufijo
                                   from public.joybees_products p
                                  where p.active is true
                                    and (
                                      greatest(0, coalesce(p.disponibilidad, p.existencia, p.stock, 0)) > 0
                                   or p.is_regalia is true
                                   or p.badge = 'proximamente'
                                    )
                                  ) q
                          ) v
                    group by v.llave, v.sufijo
                  ) s
            group by s.llave
         ) b
  union all
  select 'tommy'::text as marca,
         count(*)::int as a_la_venta,
         count(*) filter (where coalesce(btrim(p.image_url), '') = '')::int as sin_foto,
         count(*)::int as tarjetas,
         count(*) filter (where coalesce(btrim(p.image_url), '') = '')::int as tarjetas_sin_foto
    from public.tommy_products p
   where p.active is true
     and (
       greatest(0, coalesce(p.disponibilidad, p.existencia, p.stock, 0)) > 0
    or p.badge = 'proximamente'
     )
  union all
  select 'calvin'::text as marca,
         count(*)::int as a_la_venta,
         count(*) filter (where coalesce(btrim(p.image_url), '') = '')::int as sin_foto,
         count(*)::int as tarjetas,
         count(*) filter (where coalesce(btrim(p.image_url), '') = '')::int as tarjetas_sin_foto
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

create or replace function public.catalogos_pulso_pedidos(dias int)
returns table (marca text, comprobantes int, monto numeric, ultimo date)
language sql
stable
set search_path = public
as $fn$
  select 'reebok'::text as marca,
         count(*) filter (where (o.created_at at time zone 'America/Panama')::date >= ((now() at time zone 'America/Panama')::date - dias))::int as comprobantes,
         coalesce(sum(o.total) filter (where (o.created_at at time zone 'America/Panama')::date >= ((now() at time zone 'America/Panama')::date - dias)), 0)::numeric as monto,
         max((o.created_at at time zone 'America/Panama')::date) as ultimo
    from public.reebok_orders o
   where o.deleted is not true
  union all
  select 'joybees'::text as marca,
         count(*) filter (where (o.created_at at time zone 'America/Panama')::date >= ((now() at time zone 'America/Panama')::date - dias))::int as comprobantes,
         coalesce(sum(o.total) filter (where (o.created_at at time zone 'America/Panama')::date >= ((now() at time zone 'America/Panama')::date - dias)), 0)::numeric as monto,
         max((o.created_at at time zone 'America/Panama')::date) as ultimo
    from public.joybees_orders o
   where o.deleted is not true
  union all
  select 'tommy'::text as marca,
         count(*) filter (where (o.created_at at time zone 'America/Panama')::date >= ((now() at time zone 'America/Panama')::date - dias))::int as comprobantes,
         coalesce(sum(o.total) filter (where (o.created_at at time zone 'America/Panama')::date >= ((now() at time zone 'America/Panama')::date - dias)), 0)::numeric as monto,
         max((o.created_at at time zone 'America/Panama')::date) as ultimo
    from public.tommy_orders o
   where o.deleted is not true
  union all
  select 'calvin'::text as marca,
         count(*) filter (where (o.created_at at time zone 'America/Panama')::date >= ((now() at time zone 'America/Panama')::date - dias))::int as comprobantes,
         coalesce(sum(o.total) filter (where (o.created_at at time zone 'America/Panama')::date >= ((now() at time zone 'America/Panama')::date - dias)), 0)::numeric as monto,
         max((o.created_at at time zone 'America/Panama')::date) as ultimo
    from public.calvin_orders o
   where o.deleted is not true
$fn$;

comment on function public.catalogos_pulso_pedidos(int) is
  'Pulso de cada tarjeta del hub /catalogos/marcas. GENERADA desde src/lib/catalogo/contadores-migracion.ts — no editar a mano.';

revoke all on function public.catalogos_pulso_pedidos(int) from public;
grant execute on function public.catalogos_pulso_pedidos(int) to service_role;
