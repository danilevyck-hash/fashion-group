-- ============================================================================
-- Camisetas removal — Paso 1 (PERMISOS)
-- Quita la key "camisetas" del array `modulos` en role_permissions.
--
-- CUÁNDO APLICAR: junto con el deploy del merge (o inmediatamente después).
--   No rompe nada si se aplica antes: el módulo ya no existe en ALL_MODULES,
--   así que getVisibleModules() lo ignora aunque siga en el array. Esto solo
--   deja los permisos limpios.
--
-- NO es destructivo. `modulos` es text[]; array_remove es idempotente.
-- ============================================================================

UPDATE role_permissions
SET modulos = array_remove(modulos, 'camisetas')
WHERE 'camisetas' = ANY(modulos);

-- Verificación (debe devolver 0 filas después del UPDATE):
SELECT role, modulos
FROM role_permissions
WHERE 'camisetas' = ANY(modulos);
