-- ═════════════════════════════════════════════════════════════════════════════
-- SCOPE 2 — Comisiones como módulo propio (/comisiones), fuera de Ventas.
-- ═════════════════════════════════════════════════════════════════════════════
-- Agrega el módulo "comisiones" a los permisos de admin y secretaria.
-- Secretaria conserva sus 9 módulos actuales + comisiones (10). Admin lo suma.
-- Idempotente. (El código: modules.ts ya define el módulo con roles
-- [admin, secretaria]; /comisiones reusa ComisionesView; las APIs de comisiones
-- ya permiten secretaria en lectura; configurar tasas sigue admin-only.)
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE role_permissions
   SET modulos = array_append(modulos, 'comisiones'), updated_at = now()
 WHERE role IN ('admin', 'secretaria')
   AND NOT ('comisiones' = ANY(modulos));

NOTIFY pgrst, 'reload schema';
