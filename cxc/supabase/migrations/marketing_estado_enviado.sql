-- ============================================================================
-- Marketing — renombrar estado 'listo_cobrar' → 'por_cobrar' y agregar 'enviado'
-- ============================================================================
-- Flujo nuevo: abierto → por_cobrar → enviado → cobrado
-- Corre esta migración una sola vez contra Supabase.
-- ============================================================================

-- 1. Quitar el CHECK viejo
ALTER TABLE mk_proyectos DROP CONSTRAINT IF EXISTS mk_proyectos_estado_check;

-- 2. Renombrar filas existentes
UPDATE mk_proyectos SET estado = 'por_cobrar' WHERE estado = 'listo_cobrar';

-- 3. Poner el CHECK nuevo con los 4 estados
ALTER TABLE mk_proyectos
  ADD CONSTRAINT mk_proyectos_estado_check
  CHECK (estado IN ('abierto','por_cobrar','enviado','cobrado'));

-- 4. Ajustar default (sin cambio funcional, solo consistencia)
ALTER TABLE mk_proyectos ALTER COLUMN estado SET DEFAULT 'abierto';
