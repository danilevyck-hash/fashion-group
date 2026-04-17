-- Add created_by tracking to caja_gastos and caja_periodos.
-- Historical rows remain NULL: no source of truth exists to infer the author.
-- ON DELETE SET NULL so removing a user does not delete financial history.

ALTER TABLE caja_gastos
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES fg_users(id) ON DELETE SET NULL;

ALTER TABLE caja_periodos
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES fg_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS caja_gastos_created_by_idx ON caja_gastos(created_by);
CREATE INDEX IF NOT EXISTS caja_periodos_created_by_idx ON caja_periodos(created_by);
