-- ═════════════════════════════════════════════════════════════════════════════
-- CAJA MENUDA — LAS CATEGORÍAS SE CREAN DESDE EL FORMULARIO Y QUEDAN PARA TODOS
-- (20-sep-2026). Migración ADITIVA.
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, textual: «la categoría está, y si algún momento hay una categoría
-- nueva, pon el más para configurarla y que los que tengan el módulo las puedan
-- crear para siempre en todos los usuarios».
--
-- La tabla `caja_categorias` ya existía (6 filas: Materiales · Transporte ·
-- Alimentación · Papelería · Mantenimiento · Otros; «Papelería» y
-- «Mantenimiento» nunca se usaron y se quedan). Lo que le faltaba para esto:
--
--   1. SOFT DELETE FIRMADO, NUNCA DELETE — el mismo patrón que
--      `guias_destino_lista`, `guias_destino_cliente` y `comision_exclusion`.
--      Hoy el DELETE de la ruta borra la fila de verdad.
--   2. ÚNICA ENTRE ACTIVAS — con el UNIQUE total de hoy, una categoría quitada
--      no se podría volver a agregar nunca. Se cambia por un único PARCIAL
--      `WHERE NOT deleted`, igual que las etiquetas de Guías.
--   3. QUIÉN LA CREÓ, para que una categoría nueva tenga firma.
--
-- 🔴 NI UNA FILA CAMBIA DE VALOR: las 6 categorías quedan exactamente como
-- están, activas. Ningún gasto se toca.
--
-- 🔴 El código FALLA ABIERTO: mientras esta DDL no corra, la lista se lee y se
-- crea igual que hoy (sin soft delete). Se puede aplicar cuando Daniel diga.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE caja_categorias
  ADD COLUMN IF NOT EXISTS deleted    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS created_by text;

COMMENT ON COLUMN caja_categorias.deleted IS
  'Soft delete: true = ya no se ofrece en el formulario. La fila se queda como historial. NUNCA se borra con DELETE.';
COMMENT ON COLUMN caja_categorias.deleted_by IS
  'Quién la quitó. Una baja se firma: sin quién ni cuándo, no hay soft delete.';
COMMENT ON COLUMN caja_categorias.created_by IS
  'Quién la creó desde el «＋» del formulario. NULL = las 6 de la semilla original.';

-- Una baja se firma. Se valida NOT VALID para no pelear con filas viejas que
-- todavía no tengan firma (hoy no hay ninguna borrada).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'caja_categorias_baja_firmada'
  ) THEN
    ALTER TABLE caja_categorias
      ADD CONSTRAINT caja_categorias_baja_firmada
      CHECK (NOT deleted OR (deleted_by IS NOT NULL AND deleted_at IS NOT NULL))
      NOT VALID;
  END IF;
END $$;

-- ÚNICA ENTRE ACTIVAS: el UNIQUE total impedía volver a agregar una categoría
-- quitada. El índice parcial deja convivir la quitada con la nueva.
ALTER TABLE caja_categorias DROP CONSTRAINT IF EXISTS caja_categorias_nombre_key;

CREATE UNIQUE INDEX IF NOT EXISTS caja_categorias_activa_unica
  ON caja_categorias (nombre)
  WHERE NOT deleted;

COMMENT ON TABLE caja_categorias IS
  'Catálogo de categorías de Caja Menuda, compartido por todo el equipo. Lo crea '
  'cualquiera que tenga el módulo con el «＋» del formulario; quitar es soft '
  'delete firmado, NUNCA DELETE, y única solo entre ACTIVAS.';
