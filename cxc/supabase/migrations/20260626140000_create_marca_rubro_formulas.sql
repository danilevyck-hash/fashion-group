-- ─────────────────────────────────────────────────────────────────────────────
-- Excepciones de fórmula de precio por marca + rubro (Depurador · /productos/cargar).
--
-- La fórmula base es por marca (marca_formulas). Pero hay rubros que marginan
-- distinto dentro de una marca. Ej: CK Underwear divisor 0.75, PERO rubro
-- BOXER BRIEF 0.62 y PANTIES 0.67. Como "BAGS de CK" ≠ "BAGS de TH", la excepción
-- es por marca+rubro (no por rubro solo).
--
-- PRIORIDAD: al calcular en modo "por marca", PRIMERO se busca excepción
-- marca+rubro; si existe gana; si no, se usa la fórmula de la marca.
--
-- Migración ADITIVA. Sin seed (el usuario llena las excepciones a mano).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists marca_rubro_formulas (
  id          uuid primary key default gen_random_uuid(),
  marca       text not null,
  rubro       text not null,
  divisor     numeric not null default 0,
  extra       integer not null default 0 check (extra between 0 and 5),
  redondeo    text not null default 'int' check (redondeo in ('int', 'half')),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Llave única por marca+rubro, insensible a caja (el Excel trae mayúsculas).
create unique index if not exists idx_marca_rubro_formulas_key
  on marca_rubro_formulas (lower(marca), lower(rubro));

alter table marca_rubro_formulas enable row level security;

-- Lectura para todos los roles (datos no sensibles, API ya auth-gated); igual que
-- marca_formulas. Escritura solo service_role (la API server-side).
drop policy if exists public_read on marca_rubro_formulas;
create policy public_read on marca_rubro_formulas
  for select
  using (true);

drop policy if exists service_role_all on marca_rubro_formulas;
create policy service_role_all
  on marca_rubro_formulas
  as permissive
  for all
  to service_role
  using (true)
  with check (true);
