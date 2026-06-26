-- ─────────────────────────────────────────────────────────────────────────────
-- Fórmulas de precio por marca (Depurador de Productos · /productos/cargar).
--
-- precio = TECHO(Costo CIF ÷ divisor) + extra, redondeado hacia arriba.
-- El Costo CIF ya es costo FOB × 1.1 (lo calcula el módulo) — el divisor NO
-- vuelve a multiplicar. Si divisor = 0 o la marca no tiene fórmula, el precio
-- queda vacío y la secretaria lo pone a mano.
--
-- La LLAVE es la marca: una marca = una fórmula. `empresa` es solo informativo,
-- para agrupar visualmente en la pantalla de configuración (Vistana/Calvin,
-- Fashion Wear/Tommy, Fashion Shoes/Tommy).
--
-- Migración ADITIVA. No borra ni altera datos existentes.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists marca_formulas (
  id          uuid primary key default gen_random_uuid(),
  marca       text not null unique,                 -- llave: una marca = una fórmula
  empresa     text,                                 -- informativo: agrupa en la UI
  divisor     numeric not null default 0,           -- 0 = sin fórmula (precio vacío)
  extra       integer not null default 0 check (extra between 0 and 5),
  redondeo    text not null default 'int' check (redondeo in ('int', 'half')),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Búsqueda case-insensitive por marca (el Excel trae la marca en mayúsculas).
create unique index if not exists idx_marca_formulas_marca_lower
  on marca_formulas (lower(marca));

alter table marca_formulas enable row level security;

-- Lectura/escritura solo vía service_role (la API server-side).
drop policy if exists service_role_all on marca_formulas;
create policy service_role_all
  on marca_formulas
  as permissive
  for all
  to service_role
  using (true)
  with check (true);
