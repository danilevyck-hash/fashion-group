-- ─────────────────────────────────────────────────────────────────────────────
-- BACKUP — clientes_master  (Sprint 1, 2026-05-09)
--
-- Cómo correr:
--   1. Abrir Supabase Dashboard → SQL Editor (proyecto rspocgqhtpveytgbtler)
--   2. Pegar el bloque SECCIÓN A y ejecutar
--   3. Click "Export" → "Download CSV"  (debería bajar ~167 filas, archivo chico)
--   4. Ejecutar ADEMÁS el bloque SECCIÓN B  → crea snapshot dentro de la DB
--      (recuperable con SELECT * si algo sale mal en cualquier paso del sprint)
--
-- Recomendación: correr LAS DOS secciones. El CSV es paranoia extra, el
-- snapshot in-DB es la red de seguridad real.
-- ─────────────────────────────────────────────────────────────────────────────


-- ===== SECCIÓN A — descarga como CSV =====
SELECT *
FROM clientes_master
ORDER BY codigo;


-- ===== SECCIÓN B — snapshot dentro de la DB (recomendado) =====
DROP TABLE IF EXISTS backup_clientes_master_20260509;
CREATE TABLE backup_clientes_master_20260509 AS
SELECT * FROM clientes_master;

-- Verificar:
SELECT COUNT(*) AS filas_backup FROM backup_clientes_master_20260509;
-- Debería retornar 167.
