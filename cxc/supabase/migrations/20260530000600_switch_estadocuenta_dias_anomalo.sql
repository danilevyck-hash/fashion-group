-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_estadocuenta_dias_anomalo VIEW (auditoría 🟡-7)
--
-- switch_estadocuenta_aging bucketea por `dias` con FILTER (WHERE dias BETWEEN
-- ...). Una fila con dias NULL o negativo suma a `total` pero NO entra en ningún
-- bucket → cxcVencida la subestima sin aviso. Diagnóstico read-only (2026-05-30):
-- 0 filas con dias null/negativo (rango 0..1934). Es preventivo.
--
-- Decisión (auditoría): NEUTRAL + ALERTA — no se cambia el aging (no hay caso que
-- corregir hoy y meter null/negativo a un bucket arbitrario distorsionaría). En
-- su lugar se VIGILA: esta vista lista las filas anómalas con saldo, y el check
-- 'aging_dias_anomalo' la lee a diario y alerta si aparece alguna.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW switch_estadocuenta_dias_anomalo AS
SELECT
  empresa_key,
  COUNT(*) FILTER (WHERE dias IS NULL) AS dias_null,
  COUNT(*) FILTER (WHERE dias < 0)     AS dias_negativo,
  COALESCE(SUM(saldo), 0)              AS suma_saldo
FROM switch_estadocuenta
WHERE COALESCE(saldo, 0) <> 0
  AND (dias IS NULL OR dias < 0)
GROUP BY empresa_key;

GRANT SELECT ON switch_estadocuenta_dias_anomalo TO service_role;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación: SELECT * FROM switch_estadocuenta_dias_anomalo;  -- 0 filas hoy.
-- ─────────────────────────────────────────────────────────────────────────────
