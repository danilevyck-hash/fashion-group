-- ============================================================================
-- Marketing — Joybees como marca interna
-- ============================================================================
-- Joybees es una marca del grupo Fashion Group que distribuye internamente.
-- A diferencia de Tommy/Calvin/Reebok (marcas externas con contraparte para
-- repartir 50/50), Joybees absorbe el 100% del gasto — no hay tercero con
-- quien compartir costos.
--
-- Este script es idempotente: seguro de correr múltiples veces.
-- ============================================================================

-- 1. Agregar columna `tipo` a mk_marcas.
--    'externa' (default): aplica regla 50/50 al cobrar.
--    'interna'         : Fashion Group absorbe 100% (sin contraparte).
ALTER TABLE mk_marcas
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'externa'
    CHECK (tipo IN ('externa', 'interna'));

-- 2. Asegurar existencia del marca Joybees.
--    codigo = 'J' (inicial única para tag visual)
--    empresa_codigo = 'vistana' (holding genérico — Joybees se distribuye
--    vía el grupo; el campo es obligatorio por schema original)
--    color visual: emerald #10b981 (distintivo del resto de la paleta).
INSERT INTO mk_marcas (nombre, codigo, empresa_codigo, tipo)
VALUES ('Joybees', 'J', 'vistana', 'interna')
ON CONFLICT (codigo) DO UPDATE SET tipo = 'interna';

-- 3. Fallback por si existe una fila con nombre Joybees pero codigo distinto
--    (no debería, pero es idempotente).
UPDATE mk_marcas SET tipo = 'interna' WHERE nombre = 'Joybees';
