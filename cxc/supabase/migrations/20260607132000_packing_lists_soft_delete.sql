-- ============================================================================
-- Guías V2 — Ítem 5: Packing Lists con red (soft-delete + retención)
-- ============================================================================
-- Hoy el borrado de PL es HARD (API y cron borran filas físicamente; el cron
-- purga todo lo > 7 días). Esto agrega `deleted_at` para soft-delete:
--   - NULL          → activo (visible en la lista).
--   - timestamptz   → borrado lógico; sigue en DB para la red de retención.
-- El borrado de usuario pasa a setear deleted_at (código del PR). El cron pasa a
-- purgar (hard-delete) SOLO los soft-deleted con > 90 días de retención, y hace
-- snapshot/export antes de purgar (código del PR).
--
-- Aditivo, no destructivo.
--
-- Corre esta migración UNA SOLA VEZ en Supabase SQL Editor.
-- ============================================================================

ALTER TABLE packing_lists
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Índice para filtrar activos (deleted_at IS NULL) y barrer la retención.
CREATE INDEX IF NOT EXISTS idx_packing_lists_deleted_at
  ON packing_lists (deleted_at);
