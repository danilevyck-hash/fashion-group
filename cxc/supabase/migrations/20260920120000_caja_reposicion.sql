-- Caja Menuda: el cierre ya no exige saldo 0 (4-sep-2026).
-- Daniel, textual: «cierro cuando queda poca plata (criterio de la secretaria)
-- y le doy la diferencia para llegar a los 200».
--
-- `saldo_cierre` congela la foto del saldo con el que se cerró el período
-- (puede ser negativo). La reposición no necesita columna propia:
-- reposición = fondo_inicial - saldo_cierre (= lo gastado), y el hecho de que
-- se repuso ya vive en `repuesto` / `repuesto_at` («Aprobar reposición»).
--
-- Los períodos ya cerrados quedan en NULL: cerraron bajo la regla vieja de
-- saldo 0 forzado, y NULL dice «no hay foto», no «cerró en $0.00».
--
-- El código cae limpio mientras esta DDL no corra (el cierre reintenta sin la
-- columna), así que se puede aplicar cuando Daniel diga.

ALTER TABLE caja_periodos
  ADD COLUMN IF NOT EXISTS saldo_cierre numeric(12,2);

COMMENT ON COLUMN caja_periodos.saldo_cierre IS
  'Saldo con el que se cerró el período (fondo - gastado al momento del cierre). NULL = cerrado antes de que existiera la foto. Reposición = fondo_inicial - saldo_cierre.';
