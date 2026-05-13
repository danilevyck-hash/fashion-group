-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: cleanup zombie de retail en cxc_uploads / cxc_rows
--
-- CXC sólo aplica a las 6 empresas B2B (vistana, fashion_wear, fashion_shoes,
-- active_shoes, active_wear, joystep). Retail (Confecciones Boston,
-- Multifashion) NO debería tener registros en cxc_uploads ni cxc_rows porque
-- sus tickets son al contado/mostrador y Switch no genera detallessaldos.
--
-- Auditoría reveló un header zombie de confecciones_boston en cxc_uploads
-- con row_count=348 pero 0 filas asociadas en cxc_rows (residuo de un upload
-- accidental). Este DELETE lo limpia + cleanup defensivo de multifashion
-- (esperado 0 rows, no debería pasar después del guard agregado en
-- /api/cxc/upload).
--
-- Auditoría previa (correr antes para confirmar):
--   SELECT company_key, COUNT(*) AS rows FROM cxc_uploads GROUP BY company_key;
-- Esperado post-fix: solo las 6 B2B.
-- ─────────────────────────────────────────────────────────────────────────────

-- Headers zombie en cxc_uploads (CASCADE eliminaría cxc_rows asociados, pero
-- las filas debajo se borran explícitamente por las dudas).
DELETE FROM cxc_uploads
WHERE company_key IN ('confecciones_boston', 'multifashion');

-- Defensivo: cualquier fila huérfana en cxc_rows con esas company_keys.
-- Esperado: 0 rows borrados (no debería existir).
DELETE FROM cxc_rows
WHERE company_key IN ('confecciones_boston', 'multifashion');

-- Verificación post-cleanup (correr después para confirmar):
--   SELECT company_key, COUNT(*) FROM cxc_uploads GROUP BY company_key;
--   -- Esperado: 6 rows, una por cada B2B (vistana, fashion_wear,
--   -- fashion_shoes, active_shoes, active_wear, joystep).
--
--   SELECT COUNT(*) FROM cxc_rows
--   WHERE company_key IN ('confecciones_boston', 'multifashion');
--   -- Esperado: 0.
