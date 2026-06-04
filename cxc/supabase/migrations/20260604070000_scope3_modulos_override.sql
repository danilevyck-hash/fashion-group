-- ═════════════════════════════════════════════════════════════════════════════
-- SCOPE 3 — Override de módulos por usuario.
-- ═════════════════════════════════════════════════════════════════════════════
-- Agrega fg_users.modulos_override (text[] NULL):
--   • NULL           → el usuario hereda los módulos de su rol (role_permissions)
--   • array no vacío → override per-usuario; reemplaza por completo a los del rol
-- El login (/api/auth) y getVisibleModules respetan esta columna.
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE fg_users ADD COLUMN IF NOT EXISTS modulos_override text[];

NOTIFY pgrst, 'reload schema';
