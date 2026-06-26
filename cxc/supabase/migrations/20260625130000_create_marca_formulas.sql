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

-- ─────────────────────────────────────────────────────────────────────────────
-- Pre-carga de fórmulas de Calvin Klein (empresa Vistana International).
-- Idempotente: ON CONFLICT DO NOTHING no pisa lo que el usuario ya editó.
-- Tommy (Fashion Wear / Fashion Shoes) queda vacío a propósito — se llena a mano
-- en la pestaña de configuración del módulo.
-- ─────────────────────────────────────────────────────────────────────────────
insert into marca_formulas (marca, empresa, divisor, extra, redondeo) values
  ('CK Accessories', 'Vistana International', 0.75, 0, 'int'),
  ('CK Underwear',   'Vistana International', 0.73, 0, 'int'),
  ('CK Jeans',       'Vistana International', 0.73, 0, 'int'),
  ('CK Menswear',    'Vistana International', 0.73, 0, 'int'),
  ('CK Footwear',    'Vistana International', 0.75, 0, 'int'),
  ('CK Legwear',     'Vistana International', 0.63, 0, 'half'),
  ('CK Kids',        'Vistana International', 0.75, 0, 'int'),
  ('CK Swimwear',    'Vistana International', 0.75, 0, 'int'),
  ('CK Womenswear',  'Vistana International', 0.73, 0, 'int')
on conflict do nothing;
