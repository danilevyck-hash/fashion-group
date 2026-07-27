-- 20260727180000_cheques_banco_default.sql
--
-- QUÉ MEJORA: deja sana la columna `cheques.banco`, que hoy es NOT NULL y SIN
-- default para un dato que la app ya no captura. Es la trampa que tuvo el
-- guardado de cheques caído 3 meses y medio.
--
-- ⚠️ ES OPCIONAL. El arreglo del guardado YA salió con el deploy: la app escribe
-- `banco = ''` en cada INSERT (`src/lib/cheques-fila.ts`), así que Daniel no
-- tiene que correr esto para desbloquearse. Esto solo quita la trampa para el
-- futuro. El código funciona IGUAL con o sin este SQL — lo cubre el candado
-- `src/__tests__/lib/cheques-fila.test.ts`.
--
-- QUÉ PASÓ. `banco` nació NOT NULL con la tabla (25-mar-2026,
-- `supabase/migration_cheques.sql`). El 14-abr, el commit 47f1f30f
-- ("remove banco column from cheques UI") sacó el campo de la pantalla y del
-- body del POST — pero dejó la columna en la base. Desde ese minuto TODO INSERT
-- moría con:
--
--     23502 — null value in column "banco" of relation "cheques"
--              violates not-null constraint
--
-- y la ruta lo devolvía como "Error interno", que no dice nada. Los 5 cheques
-- vivos son del 14-abr **antes** de ese commit (20:21-20:45 UTC contra las
-- 22:03 UTC del commit) y son los últimos que alcanzaron a entrar.
--
-- POR QUÉ NO SE BORRA LA COLUMNA. Porque los 5 cheques históricos tienen
-- `banco = 'Otro'` y ese dato no estorba a nadie. Borrar una columna con datos
-- no se deshace; aflojar la restricción sí. Si en unos meses sigue sin usarse,
-- `ALTER TABLE cheques DROP COLUMN banco` es un renglón.
--
-- POR QUÉ NO SE AGREGA EL CAMPO AL FORMULARIO. Decisión explícita de Daniel en
-- el PR #330: "BANCO: NO se agrega. Daniel: 'no, déjalo así'".
--
-- COSTO: ninguno. Las dos sentencias son cambios de catálogo (metadata), sin
-- reescritura de la tabla y sin bloqueo apreciable — y son 5 filas.

-- 1) Un default, para que un INSERT que la omita no reviente nunca más.
ALTER TABLE cheques ALTER COLUMN banco SET DEFAULT '';

-- 2) Y sin NOT NULL: un dato que no se captura puede legítimamente no estar.
--    Con las dos juntas, omitirla da '' y mandarla en null también se acepta.
ALTER TABLE cheques ALTER COLUMN banco DROP NOT NULL;

-- Las filas existentes NO se tocan: los 5 cheques conservan su 'Otro'.
