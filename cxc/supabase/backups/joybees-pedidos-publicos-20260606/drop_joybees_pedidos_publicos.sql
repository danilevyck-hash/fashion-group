-- ============================================================================
-- G5 Sprint A — DROP de joybees_pedidos_publicos (backend muerto de Joybees)
--
-- ⚠️ NO CORRER TODAVÍA. Aplicar SOLO cuando:
--    1. El PR fix/grupo5-sprint-a esté MERGEADO a main, y
--    2. El deploy de Vercel de ese merge esté CONFIRMADO OK en producción.
--
-- Contexto: el flujo público de Joybees nunca insertó en esta tabla (el endpoint
-- POST estaba desconectado — cero callers). El código que la leía/escribía
-- (endpoint pedido-publico, ruta pedidos, página /pedido-joybees/[id], pestaña
-- Pedidos del admin) se eliminó en este PR. La tabla queda huérfana.
--
-- Backup: supabase/backups/joybees-pedidos-publicos-20260606/joybees_pedidos_publicos.json
--   (0 filas — la tabla estaba vacía; se respalda igual por disciplina).
-- Definición original: supabase-joybees.sql:23 (con RLS).
-- ============================================================================


-- ── PASO 1: VERIFICAR FKs ENTRANTES (correr PRIMERO, solo lectura) ───────────
-- Debe devolver 0 filas. Si aparece CUALQUIER tabla referenciando a
-- joybees_pedidos_publicos, DETENERSE: hay una dependencia no contemplada.

SELECT
  con.conname AS constraint_name,
  src.relname AS tabla_que_referencia,
  tgt.relname AS tabla_referenciada
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_class tgt ON tgt.oid = con.confrelid
WHERE con.contype = 'f'
  AND tgt.relname = 'joybees_pedidos_publicos'
ORDER BY src.relname;


-- ── PASO 2: DROP (correr solo si el PASO 1 devolvió 0 filas) ─────────────────
-- CASCADE limpia las RLS policies asociadas.

DROP TABLE IF EXISTS joybees_pedidos_publicos CASCADE;


-- ── PASO 3: VERIFICAR que ya no existe (debe devolver 0 filas) ───────────────
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'joybees_pedidos_publicos';
