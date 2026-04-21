-- ============================================================================
-- Marketing — simplificar workflow a 3 estados sin mk_cobranzas
-- ============================================================================
-- Modelo nuevo: abierto → enviado → cobrado (+ anulado vía soft delete).
-- Se elimina mk_cobranzas como entidad. Las fechas históricas de envío/cobro
-- se preservan como columnas en mk_proyectos antes del DROP.
--
-- Corre esta migración UNA SOLA VEZ en Supabase SQL Editor.
-- ============================================================================

-- 1. Agregar columnas de timestamps a mk_proyectos (preservar histórico)
ALTER TABLE mk_proyectos ADD COLUMN IF NOT EXISTS fecha_enviado TIMESTAMPTZ;
ALTER TABLE mk_proyectos ADD COLUMN IF NOT EXISTS fecha_cobrado TIMESTAMPTZ;

-- 2. Migrar fechas desde mk_cobranzas (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mk_cobranzas'
  ) THEN
    UPDATE mk_proyectos p SET
      fecha_enviado = (
        SELECT MIN(c.fecha_envio)
          FROM mk_cobranzas c
         WHERE c.proyecto_id = p.id
           AND c.fecha_envio IS NOT NULL
           AND c.anulado_en IS NULL
      ),
      fecha_cobrado = (
        SELECT MAX(c.fecha_cobro)
          FROM mk_cobranzas c
         WHERE c.proyecto_id = p.id
           AND c.fecha_cobro IS NOT NULL
           AND c.anulado_en IS NULL
      );
  END IF;
END $$;

-- 3. Migrar proyectos en por_cobrar → abierto (se consolidan 2 estados en 1)
UPDATE mk_proyectos SET estado = 'abierto' WHERE estado = 'por_cobrar';

-- 4. Reemplazar el CHECK constraint de estado (quitar por_cobrar)
ALTER TABLE mk_proyectos DROP CONSTRAINT IF EXISTS mk_proyectos_estado_check;
ALTER TABLE mk_proyectos
  ADD CONSTRAINT mk_proyectos_estado_check
  CHECK (estado IN ('abierto','enviado','cobrado'));

-- 5. Drop de mk_cobranzas (con cascade de FKs si las hubiera)
DROP TABLE IF EXISTS mk_cobranzas CASCADE;

-- 6. Verificación — debe devolver solo: abierto, enviado, cobrado
SELECT estado, COUNT(*) AS total
  FROM mk_proyectos
 WHERE anulado_en IS NULL
 GROUP BY estado
 ORDER BY estado;

-- 7. Confirmar fechas migradas (opcional)
SELECT COUNT(*) AS con_fecha_enviado FROM mk_proyectos WHERE fecha_enviado IS NOT NULL;
SELECT COUNT(*) AS con_fecha_cobrado FROM mk_proyectos WHERE fecha_cobrado IS NOT NULL;
