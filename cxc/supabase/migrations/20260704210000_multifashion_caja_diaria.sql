-- Caché del cierre diario de caja de ACS (Multifashion · subtab Caja).
-- Fuente: GET /apireporte/diarioventas de Switch (instancia MULTI, sucursal 1).
-- Días cerrados quedan permanentes; el día en curso se refresca con TTL corto
-- desde el route (api/multifashion/caja) para no golpear la sesión única de
-- Switch en cada vista. El route funciona sin esta tabla (modo directo, sin
-- caché) hasta que se corra este DDL.
create table if not exists multifashion_caja_diaria (
  fecha date primary key,
  data jsonb not null,
  synced_at timestamptz not null default now()
);
