-- Track who soft-deleted a gasto and when.
-- Legacy rows with deleted=true keep deleted_by=NULL and deleted_at=NULL:
-- no source of truth exists to infer the author or time.
-- ON DELETE SET NULL so removing a user never erases financial history.

ALTER TABLE caja_gastos
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES fg_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index: only rows that are currently soft-deleted, for the
-- upcoming "Gastos eliminados" view and restore flow.
CREATE INDEX IF NOT EXISTS caja_gastos_deleted_at_idx
  ON caja_gastos(deleted_at) WHERE deleted = true;
