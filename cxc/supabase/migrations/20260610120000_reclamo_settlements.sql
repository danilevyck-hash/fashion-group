-- ─────────────────────────────────────────────────────────────────────────────
-- Settlement de Reclamos — monto recuperado + nota(s) de crédito por reclamo.
--
-- Tabla hija reclamo_settlements: 1 o N filas por reclamo (settlement fraccionado).
-- Cada fila = una NC / recuperación. + snapshot del monto reclamado en reclamos
-- (congelado al marcar Pagado, para que el % recuperado no derive si luego se
-- editan los items).
--
-- Aditivo, nullable, NO toca data existente. Correr a mano en el SQL Editor.
-- (Sin signos de dolar en comentarios — gotcha del parser del SQL Editor.)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists reclamo_settlements (
  id                   uuid primary key default gen_random_uuid(),
  reclamo_id           uuid not null references reclamos(id) on delete cascade,
  monto                numeric not null check (monto >= 0),  -- monto recuperado de esta NC
  nota_credito         text,                                 -- N de la nota de credito (opcional en V1)
  nota_credito_ccte_id integer,                              -- id interno Switch si se linkea (V2; null en V1 manual)
  fecha                date    not null,                     -- fecha del settlement
  created_at           timestamptz not null default now(),
  deleted              boolean not null default false
);

create index if not exists idx_reclamo_settlements_reclamo
  on reclamo_settlements (reclamo_id) where deleted = false;

-- Snapshot del monto reclamado, congelado al marcar Pagado. Null en reclamos sin
-- settlement (incluidos los ya "Pagado" pre-migracion: recuperacion desconocida).
alter table reclamos
  add column if not exists monto_reclamado_snapshot numeric;
