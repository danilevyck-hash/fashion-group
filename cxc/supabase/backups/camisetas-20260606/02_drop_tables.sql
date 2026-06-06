-- ============================================================================
-- Camisetas removal — Paso FINAL (DROP de tablas)
--
-- ⚠️ NO CORRER TODAVÍA. Aplicar SOLO cuando:
--    1. El PR chore/remove-camisetas-module esté MERGEADO a main, y
--    2. El deploy de Vercel de ese merge esté CONFIRMADO OK en producción
--       (la app ya no referencia /camisetas ni las tablas camisetas_*).
--
-- Orden correcto: primero el código deja de usar las tablas (deploy), DESPUÉS
-- se dropean. Así nunca hay API viva pegándole a una tabla inexistente.
--
-- Backup de los datos: supabase/backups/camisetas-20260606/*.json
--   (camisetas_productos=9, camisetas_clientes=20, camisetas_pedidos=130 filas)
-- Schema + seed archivado: supabase/backups/camisetas-20260606/camisetas*.sql
-- ============================================================================


-- ── PASO 1: VERIFICAR FKs ENTRANTES (correr ESTO PRIMERO, solo lectura) ──────
-- Debe devolver únicamente las FKs INTERNAS del propio módulo:
--   camisetas_pedidos.cliente_id  -> camisetas_clientes
--   camisetas_pedidos.producto_id -> camisetas_productos
-- Si aparece CUALQUIER otra tabla en `tabla_que_referencia` que NO sea
-- camisetas_*, DETENERSE: hay una dependencia externa no contemplada.

SELECT
  con.conname                AS constraint_name,
  src.relname                AS tabla_que_referencia,
  tgt.relname                AS tabla_referenciada
FROM pg_constraint con
JOIN pg_class src  ON src.oid = con.conrelid
JOIN pg_class tgt  ON tgt.oid = con.confrelid
WHERE con.contype = 'f'
  AND tgt.relname IN ('camisetas_productos', 'camisetas_clientes', 'camisetas_pedidos')
ORDER BY tgt.relname, src.relname;


-- ── PASO 2: DROP (correr solo si el PASO 1 confirmó cero FKs externas) ───────
-- CASCADE limpia las FKs internas y las 3 RLS policies "Allow all camisetas_*".
-- El orden hija→padre no es estrictamente necesario con CASCADE, pero se deja
-- explícito por claridad.

DROP TABLE IF EXISTS camisetas_pedidos  CASCADE;
DROP TABLE IF EXISTS camisetas_clientes  CASCADE;
DROP TABLE IF EXISTS camisetas_productos CASCADE;


-- ── PASO 3: VERIFICAR que ya no existen (debe devolver 0 filas) ──────────────
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'camisetas_%';
