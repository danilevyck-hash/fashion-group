-- ─────────────────────────────────────────────────────────────────────────────
-- Historial liviano de cargas del Depurador de Productos (/productos/cargar).
--
-- El depurador procesa el Excel 100% en el navegador; lo ÚNICO que toca el
-- servidor es este registro, insertado al momento de descargar la plantilla.
-- Un registro = una descarga: quién cargó, a qué empresa, marca y los totales.
--
-- Migración ADITIVA. No borra ni altera datos existentes.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists carga_history (
  id                uuid primary key default gen_random_uuid(),
  usuario           text not null,            -- quién descargó la plantilla
  empresa           text not null,            -- empresa destino elegida en el dropdown
  marca             text not null,            -- marca de la carga (mayúsculas)
  cantidad_estilos  integer not null,         -- estilos (filas) en la plantilla
  total_unidades    integer not null,         -- Σ Stock Ideal
  total_costo       numeric not null,         -- Σ (Costo CIF × unidades) por estilo
  created_at        timestamptz not null default now()
);

create index if not exists idx_carga_history_created_at
  on carga_history (created_at desc);

alter table carga_history enable row level security;

-- Escritura/lectura solo vía service_role (la API server-side). El cliente nunca
-- toca esta tabla directo.
drop policy if exists service_role_all on carga_history;
create policy service_role_all
  on carga_history
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos del módulo nuevo "cargar" en role_permissions.
--
-- El acceso por defecto ya está cubierto por modules.ts (roles admin+secretaria):
-- las filas con modulos = NULL usan esos defaults y verán "cargar" sin tocar nada.
-- Solo hay que parchear las filas que tienen una lista EXPLÍCITA de módulos, para
-- que no se queden sin el módulo nuevo. NO tocamos filas con modulos NULL (eso
-- las dejaría con un único módulo y borraría sus defaults).
--
-- (Si algún usuario secretaria tiene fg_users.modulos_override explícito, hay que
--  agregarle 'cargar' a mano desde Usuarios — eso es decisión por usuario.)
-- ─────────────────────────────────────────────────────────────────────────────
update role_permissions
set modulos = array_append(modulos, 'cargar'),
    updated_at = now()
where role in ('admin', 'secretaria')
  and modulos is not null
  and not ('cargar' = any(modulos));
