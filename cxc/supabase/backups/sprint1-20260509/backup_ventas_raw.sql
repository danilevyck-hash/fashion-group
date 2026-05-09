-- ─────────────────────────────────────────────────────────────────────────────
-- BACKUP — ventas_raw  (Sprint 1, 2026-05-09)
--
-- ⚠️ TABLA MUY GRANDE: ~100K filas. La descarga como CSV es prácticamente
-- inviable desde el dashboard. PRIORIZAR LA SECCIÓN B (snapshot in-DB).
--
-- Cómo correr:
--   1. Abrir Supabase Dashboard → SQL Editor
--   2. Ejecutar SECCIÓN B (snapshot) — siempre.
--   3. SECCIÓN A (CSV) NO recomendada salvo que tengas razón fuerte.
-- ─────────────────────────────────────────────────────────────────────────────


-- ===== SECCIÓN A — descarga como CSV (NO recomendada para 100K filas) =====
-- Si querés probar igual:
SELECT *
FROM ventas_raw
ORDER BY empresa, fecha;


-- ===== SECCIÓN B — snapshot dentro de la DB (REQUERIDO) =====
DROP TABLE IF EXISTS backup_ventas_raw_20260509;
CREATE TABLE backup_ventas_raw_20260509 AS
SELECT * FROM ventas_raw;

-- Verificar:
SELECT COUNT(*) AS filas_backup FROM backup_ventas_raw_20260509;
-- Reportar este número antes de avanzar a Fase 2.
