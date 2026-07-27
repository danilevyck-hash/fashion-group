-- 20260727160000_cheque_vendedores.sql
--
-- La lista de "vendedores" del formulario de Cheques deja localStorage y pasa a
-- la base.
--
-- POR QUÉ. Daniel: "si quiero vendedor para saber quien lo entrego". O sea que
-- el campo tiene un propósito real: saber quién entregó físicamente el cheque.
-- Hasta hoy la lista vivía en `localStorage` bajo la clave `fg_cheque_vendedores`
-- con los valores por defecto ["Rey", "Edwin"], así que:
--   * cada usuario y cada dispositivo veía una lista DISTINTA,
--   * un vendedor agregado desde la computadora de la oficina no existía en el
--     iPhone,
--   * y limpiar el navegador borraba la lista.
-- Para un dato que sirve para saber quién hizo qué, eso no alcanza.
--
-- POR QUÉ UNA TABLA NUEVA Y NO UNA QUE YA EXISTE. Se miraron las dos candidatas:
--
--   * `vendedores` — NO sirve. Es un espejo de Switch: se reescribe desde el
--     cron (medido: `updated_at` de las 16 filas se mueve todos los días a las
--     07:00 UTC), va por empresa (el mismo "REINALDO ESPINOSA" aparece en
--     fashion_wear y en fashion_shoes), y trae pseudo-vendedores como "DEFAULT"
--     que no son personas. Escribir ahí sería pisado por el próximo sync.
--
--   * `fg_users` con rol `vendedor` — casi, pero no. Hoy son rey, edwin y
--     rodrigo. El problema es que quien ENTREGA un cheque no siempre tiene
--     login: la lista equivalente de Guías (`fg_entregadores`, mismo patrón de
--     localStorage) trae "Julio", que no es usuario del sistema. Y si la fuente
--     fuera `fg_users`, "+ Agregar vendedor" pasaría a ser "crear un usuario",
--     que la secretaria no puede hacer.
--
-- Así que va una tabla propia, mínima, siguiendo el precedente que ya existe en
-- el repo para exactamente este problema: `reclamo_custom_motivos` ("Custom
-- motivos for reclamos (previously stored in localStorage)").
--
-- QUÉ PASA CON LOS CHEQUES YA GUARDADOS: nada. `cheques.vendedor` sigue siendo
-- el mismo texto libre de siempre y NO se toca — esta tabla solo alimenta el
-- desplegable. Se verificó contra producción que los 5 cheques vivos tienen
-- `vendedor = ''` (vacío), así que no hay ningún valor histórico que preservar;
-- aun así el formulario muestra el valor guardado aunque no esté en la lista.
--
-- SI ESTE SQL NO SE CORRE: no se rompe nada. La ruta
-- `/api/cheques/vendedores` detecta que la tabla no existe y responde con los
-- valores por defecto, y el formulario sigue guardando los agregados en
-- localStorage igual que hasta hoy. Al correrlo, la lista pasa a ser compartida
-- sola, sin volver a tocar el código.

create table if not exists cheque_vendedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Sin duplicados por mayúsculas/acentos de tipeo: "rey", "Rey" y "REY " son el
-- mismo. El índice es sobre la expresión, así que la fila conserva el nombre tal
-- como lo escribieron.
create unique index if not exists cheque_vendedores_nombre_uniq
  on cheque_vendedores (upper(btrim(nombre)));

-- Semilla: los dos que hasta hoy venían cableados como valores por defecto en
-- el código. Idempotente.
insert into cheque_vendedores (nombre)
  select v from (values ('Rey'), ('Edwin')) as s(v)
  where not exists (
    select 1 from cheque_vendedores cv where upper(btrim(cv.nombre)) = upper(btrim(s.v))
  );

-- RLS igual que el resto de las tablas privadas (ver
-- 20260704120000_rls_hardening_service_role.sql): la anon key es PÚBLICA — va
-- embebida en el bundle del navegador—, así que solo service_role entra. Las
-- rutas de Next ya escriben con service_role.
alter table cheque_vendedores enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'cheque_vendedores'
  loop
    execute format('drop policy if exists %I on public.cheque_vendedores', p.policyname);
  end loop;
end $$;

create policy cheque_vendedores_service_role on cheque_vendedores
  for all to service_role using (true) with check (true);
