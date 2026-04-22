-- Marketing — Regla de negocio 50/50 uniforme.
-- Cada marca asignada a una factura/proyecto cubre SIEMPRE 50% (fijo, no
-- editable). El resto se asume Fashion Group. Esta migración:
--   1. Normaliza todos los porcentajes históricos a 50.
--   2. Elimina el trigger que validaba "suma de % de mk_proyecto_marcas <= 100"
--      porque ya no aplica (3+ marcas excederían 150%, lo cual es válido bajo
--      la nueva regla — cada una pesa 50% independiente).
--   3. NO elimina la columna porcentaje (preservamos por compatibilidad y
--      por si en el futuro la regla cambia).
--   4. NO modifica el CHECK CONSTRAINT (porcentaje > 0 AND porcentaje <= 100):
--      50 sigue siendo válido bajo esa restricción.
-- Idempotente: se puede correr múltiples veces sin efectos secundarios.

-- 1. Normalizar mk_factura_marcas
UPDATE mk_factura_marcas
SET porcentaje = 50
WHERE porcentaje <> 50;

-- 2. Normalizar mk_proyecto_marcas (legacy)
UPDATE mk_proyecto_marcas
SET porcentaje = 50
WHERE porcentaje <> 50;

-- 3. Eliminar trigger obsoleto que validaba suma <= 100 en mk_proyecto_marcas
DROP TRIGGER IF EXISTS trg_mk_validar_porcentajes ON mk_proyecto_marcas;
DROP FUNCTION IF EXISTS mk_validar_porcentajes_proyecto();
