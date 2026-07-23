-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: lock real de corridas de sync (switch_sync_log_running_lock).
--
-- Indice UNICO PARCIAL sobre (empresa_key, sync_type) WHERE status='running':
-- el INSERT de la fila 'running' que ya hacen todas las libs de sync se vuelve
-- MUTEX — dos corridas simultaneas del mismo (empresa, tipo) hacen que la 2a
-- falle con 23505 y aborte limpio (el codigo lo detecta: isRunningLockConflict
-- en src/lib/switch-api/sync-log.ts; el endpoint /api/admin/sync-now responde
-- 409 "Ya hay una actualizacion en curso").
--
-- Autolimpieza: todas las libs cierran (status='error') las filas 'running'
-- huerfanas de mas de 30 minutos ANTES de insertar (clearStaleRunning /
-- markStaleRunningLogs), asi una corrida que murio sin finalizar nunca deja el
-- lock trancado. maxDuration de las funciones es 300s, 30 min es holgadisimo.
--
-- Mientras esta migracion NO se aplique, el codigo degrada sin romper: el
-- insert nunca conflictua y queda solo el pre-check del endpoint (tolerante).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Limpieza previa: cerrar filas 'running' huerfanas (>30 min) para que el
--    indice unico pueda crearse aunque haya basura vieja de runs que murieron.
UPDATE switch_sync_log
SET status = 'error',
    finished_at = now(),
    error_message = 'Run atascado en running; cerrado por la migracion del lock (20260723150000).'
WHERE status = 'running'
  AND started_at < now() - interval '30 minutes';

-- 2. Indice unico parcial = el lock. Si este CREATE falla por duplicados,
--    hay DOS corridas frescas (<30 min) del mismo par en este instante:
--    esperar unos minutos y volver a correr la migracion.
CREATE UNIQUE INDEX IF NOT EXISTS switch_sync_log_running_lock
  ON switch_sync_log (empresa_key, sync_type)
  WHERE status = 'running';

-- Verificacion:
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'switch_sync_log_running_lock';
