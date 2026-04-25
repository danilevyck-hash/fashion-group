-- Cleanup completo de usuarios, roles, y tablas/endpoints zombie de auth.
-- Pre-req: pgcrypto (en Supabase suele estar instalado por default).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Sesiones huérfanas + sesiones de usuarios que vamos a eliminar
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM user_sessions
WHERE user_name IN ('Gabriel', 'cliente', 'secretaria', 'upload');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Eliminar usuarios zombie/inactivos
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM fg_users WHERE name IN ('Gabriel', 'cliente');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Crear Alberto (director) con bcrypt
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO fg_users (name, role, password, active, is_owner)
VALUES ('alberto', 'director', crypt('alberto', gen_salt('bf', 10)), true, false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Re-hash universal: todos los usuarios actuales con su nombre lowercase
--    como password (bcrypt cost 10). El login ya hace
--    bcrypt.compare(password.toLowerCase(), hash), así que entrar con
--    "DANIEL" / "Daniel" / "daniel" todos matchean.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE fg_users SET password = crypt('daniel',       gen_salt('bf', 10)) WHERE name = 'daniel';
UPDATE fg_users SET password = crypt('andrea',       gen_salt('bf', 10)) WHERE name = 'andrea';
UPDATE fg_users SET password = crypt('angela',       gen_salt('bf', 10)) WHERE name = 'Angela';
UPDATE fg_users SET password = crypt('rey',          gen_salt('bf', 10)) WHERE name = 'rey';
UPDATE fg_users SET password = crypt('edwin',        gen_salt('bf', 10)) WHERE name = 'edwin';
UPDATE fg_users SET password = crypt('bodega',       gen_salt('bf', 10)) WHERE name = 'Bodega';
UPDATE fg_users SET password = crypt('contabilidad', gen_salt('bf', 10)) WHERE name = 'Contabilidad';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Eliminar roles zombie de role_permissions
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM role_permissions WHERE role IN ('cliente', 'david');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Drop tablas zombie
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS role_passwords CASCADE;
DROP TABLE IF EXISTS fg_user_modules CASCADE;
