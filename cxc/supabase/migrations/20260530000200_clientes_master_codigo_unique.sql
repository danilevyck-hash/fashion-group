-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: UNIQUE preventivo en clientes_master.codigo
--
-- Contexto (auditoría sync Switch, 🔴-5): switch_estadocuenta_aging hace
--   LEFT JOIN clientes_master m ON m.codigo = sec.cliente_codigo AND m.deleted=false
-- Si dos filas activas comparten codigo, el JOIN MULTIPLICA las filas de aging
-- y DUPLICA el saldo de ese cliente en total y todos los buckets ($3M CXC en
-- juego). Hoy el índice de codigo (clientes-master.sql:42) es PLANO, no UNIQUE —
-- nada garantiza la unicidad que la vista asume.
--
-- Diagnóstico previo (read-only, 2026-05-30): 137 filas activas, 0 codigos
-- duplicados, 0 codigos NULL/vacíos. Datos LIMPIOS → constraint preventivo seguro.
--
-- Patrón: índice UNIQUE PARCIAL WHERE deleted=false (idéntico al de
-- nombre_normalized en clientes-master.sql:39-40, y a la condición del JOIN).
-- Así un cliente soft-deleted no bloquea reusar su codigo, y los NULL no chocan
-- (Postgres trata cada NULL como distinto; codigo NULL no participa en el JOIN).
--
-- Reemplaza el índice plano redundante por el UNIQUE (el UNIQUE también sirve de
-- índice de lookup).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_clientes_master_codigo;

CREATE UNIQUE INDEX idx_clientes_master_codigo_uq
  ON clientes_master (codigo)
  WHERE deleted = false AND codigo IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación:
--
--   -- 0 duplicados esperados (si esto devuelve filas, el CREATE de arriba
--   -- habría fallado; correr ANTES si hay dudas):
--   SELECT codigo, COUNT(*) FROM clientes_master
--   WHERE deleted = false AND codigo IS NOT NULL
--   GROUP BY codigo HAVING COUNT(*) > 1;
--
--   -- Índice existe y es UNIQUE:
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'clientes_master' AND indexname = 'idx_clientes_master_codigo_uq';
-- ─────────────────────────────────────────────────────────────────────────────
