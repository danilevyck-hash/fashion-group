-- ─────────────────────────────────────────────────────────────────────────────
-- Fórmulas de precio de TIENDA (Multifashion / ACS) — pestaña "Facturas Tienda"
-- del módulo Depurador de Productos (/productos/cargar).
--
-- Son un set SEPARADO de las fórmulas del Depurador (marca_formulas y
-- marca_rubro_formulas) porque el markup de tienda es distinto al de mayoreo.
-- Mismo esquema y misma jerarquía de precio:
--   precio fijo > excepción marca+rubro > fórmula de la marca.
--
-- DIFERENCIA vs las tablas originales: el CHECK de redondeo permite
-- ('int','half','par') desde el inicio — las viejas solo permitían int/half
-- y eso fue un problema.
--
-- Migración ADITIVA e idempotente. Sin seed: Daniel configura las fórmulas
-- desde la UI.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists tienda_marca_formulas (
  id          uuid primary key default gen_random_uuid(),
  marca       text not null unique,                 -- llave: una marca = una fórmula
  empresa     text,                                 -- informativo: agrupa en la UI
  divisor     numeric not null default 0,           -- 0 = sin fórmula (precio vacío)
  extra       integer not null default 0 check (extra between 0 and 5),
  redondeo    text not null default 'int' check (redondeo in ('int', 'half', 'par')),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Búsqueda case-insensitive por marca (el Excel trae la marca en mayúsculas).
create unique index if not exists idx_tienda_marca_formulas_marca_lower
  on tienda_marca_formulas (lower(marca));

alter table tienda_marca_formulas enable row level security;

-- Lectura para todos los roles (datos no sensibles, API ya auth-gated).
-- Escritura solo service_role (la API server-side).
drop policy if exists public_read on tienda_marca_formulas;
create policy public_read on tienda_marca_formulas
  for select
  using (true);

drop policy if exists service_role_all on tienda_marca_formulas;
create policy service_role_all
  on tienda_marca_formulas
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Excepciones de fórmula de TIENDA por marca + rubro.
-- Igual que marca_rubro_formulas, pero para el markup de tienda e incluyendo
-- precio_fijo desde el inicio: si precio_fijo está lleno, es el precio asignado
-- directo y GANA a la fórmula (ignora costo/divisor/extra/redondeo).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists tienda_rubro_formulas (
  id          uuid primary key default gen_random_uuid(),
  marca       text not null,
  rubro       text not null,
  divisor     numeric not null default 0,
  extra       integer not null default 0 check (extra between 0 and 5),
  redondeo    text not null default 'int' check (redondeo in ('int', 'half', 'par')),
  precio_fijo numeric,                              -- lleno = precio directo, gana a la fórmula
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Llave única por marca+rubro, insensible a caja (el Excel trae mayúsculas).
create unique index if not exists idx_tienda_rubro_formulas_key
  on tienda_rubro_formulas (lower(marca), lower(rubro));

alter table tienda_rubro_formulas enable row level security;

drop policy if exists public_read on tienda_rubro_formulas;
create policy public_read on tienda_rubro_formulas
  for select
  using (true);

drop policy if exists service_role_all on tienda_rubro_formulas;
create policy service_role_all
  on tienda_rubro_formulas
  as permissive
  for all
  to service_role
  using (true)
  with check (true);
