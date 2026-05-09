-- ─────────────────────────────────────────────────────────────────────────────
-- BACKUP — cxc_rows  (Sprint 1, 2026-05-09)
--
-- ⚠️ TABLA GRANDE: ~50K filas. La descarga como CSV puede tardar / fallar
-- en el dashboard. PRIORIZAR la SECCIÓN B (snapshot in-DB) — es instantánea
-- y no depende del navegador.
--
-- Cómo correr:
--   1. Abrir Supabase Dashboard → SQL Editor
--   2. Ejecutar SECCIÓN B (snapshot) — siempre.
--   3. SECCIÓN A (CSV) opcional, sólo si querés copia local. Si el editor
--      cuelga, basta con la sección B.
-- ─────────────────────────────────────────────────────────────────────────────


-- ===== SECCIÓN A — descarga como CSV (opcional, lento) =====
SELECT *
FROM cxc_rows
ORDER BY company_key, codigo;


-- ===== SECCIÓN B — snapshot dentro de la DB (REQUERIDO) =====
DROP TABLE IF EXISTS backup_cxc_rows_20260509;
CREATE TABLE backup_cxc_rows_20260509 AS
SELECT * FROM cxc_rows;

-- Verificar:
SELECT COUNT(*) AS filas_backup FROM backup_cxc_rows_20260509;
-- Reportar este número antes de avanzar a Fase 2.
