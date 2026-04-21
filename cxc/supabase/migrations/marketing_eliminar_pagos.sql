-- ============================================================================
-- Marketing — eliminar lógica de pagos, simplificar cobro a binario NC
-- ============================================================================
-- Decisión de negocio: las marcas pagan con Nota de Crédito (NC), no con
-- transferencia. No hay pagos parciales. Es binario: cobrada o no cobrada.
--
-- Si en el futuro se quisiera volver a activar pagos parciales:
--   1. Recrear tabla mk_pagos con el mismo schema que en marketing.sql
--      líneas 114-125 del commit original
--   2. Revertir el CHECK de estado:
--        ALTER TABLE mk_cobranzas DROP CONSTRAINT mk_cobranzas_estado_check;
--        ALTER TABLE mk_cobranzas ADD CONSTRAINT mk_cobranzas_estado_check
--          CHECK (estado IN ('borrador','enviada','pagada_parcial','pagada','disputada'));
--   3. Restaurar triggers trg_mk_actualizar_estado_cobranza sobre mk_pagos
--
-- Corre esta migración UNA SOLA VEZ contra Supabase.
-- ============================================================================

-- 1. Drop del trigger que dependía de mk_pagos
DROP TRIGGER IF EXISTS trg_mk_actualizar_estado_cobranza ON mk_pagos;
DROP FUNCTION IF EXISTS mk_actualizar_estado_cobranza();

-- 2. Drop de la tabla pagos
DROP TABLE IF EXISTS mk_pagos CASCADE;

-- 3. Agregar fecha_cobro a mk_cobranzas (cuándo se marcó como cobrada)
ALTER TABLE mk_cobranzas
  ADD COLUMN IF NOT EXISTS fecha_cobro DATE;

-- 4. Migrar datos existentes al nuevo vocabulario
-- 'pagada' → 'cobrada' (con fecha_cobro = updated_at como mejor aproximación)
UPDATE mk_cobranzas
   SET fecha_cobro = updated_at::date
 WHERE estado = 'pagada' AND fecha_cobro IS NULL;

UPDATE mk_cobranzas SET estado = 'cobrada' WHERE estado = 'pagada';
-- 'pagada_parcial' vuelve a 'enviada' (ya no existe concepto de parcial)
UPDATE mk_cobranzas SET estado = 'enviada' WHERE estado = 'pagada_parcial';

-- 5. Reemplazar el CHECK de estado
ALTER TABLE mk_cobranzas DROP CONSTRAINT IF EXISTS mk_cobranzas_estado_check;
ALTER TABLE mk_cobranzas
  ADD CONSTRAINT mk_cobranzas_estado_check
  CHECK (estado IN ('borrador','enviada','cobrada','disputada'));

-- 6. Corregir monto de cobranzas existentes creadas con subtotal (bug previo)
-- Recalcular como SUM(facturas.total) * porcentaje / 100.
-- Solo actualiza cobranzas en estado 'borrador' para no tocar cobranzas ya enviadas
-- cuyo monto ya quedó fijado en el PDF enviado.
UPDATE mk_cobranzas c
   SET monto = sub.monto_correcto
  FROM (
    SELECT
      cb.id AS cobranza_id,
      ROUND(COALESCE(SUM(f.total), 0) * pm.porcentaje / 100, 2) AS monto_correcto
    FROM mk_cobranzas cb
    JOIN mk_proyecto_marcas pm
      ON pm.proyecto_id = cb.proyecto_id AND pm.marca_id = cb.marca_id
    LEFT JOIN mk_facturas f
      ON f.proyecto_id = cb.proyecto_id AND f.anulado_en IS NULL
    WHERE cb.estado = 'borrador' AND cb.anulado_en IS NULL
    GROUP BY cb.id, pm.porcentaje
  ) AS sub
 WHERE c.id = sub.cobranza_id
   AND c.monto <> sub.monto_correcto;
