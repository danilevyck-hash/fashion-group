-- ============================================================================
-- Drop tabla muerta fg_user_modules
-- ============================================================================
-- fg_user_modules guardaba overrides de módulos POR USUARIO. El sistema migró a
-- permisos por rol (role_permissions) + modulos_override (columna en fg_users).
-- Ningún código consulta fg_user_modules (verificado: solo aparecía en
-- comentarios, ya retirados en este PR). Filas residuales podían overridear
-- role_permissions si algo la volviera a leer → mejor eliminar la tabla.
--
-- Destructivo (DROP TABLE). Pierde las filas residuales — no se usan.
-- Si hay objetos dependientes (FK/vistas), agregar CASCADE.
--
-- Corre esta migración UNA SOLA VEZ en Supabase SQL Editor.
-- ============================================================================

DROP TABLE IF EXISTS fg_user_modules;
