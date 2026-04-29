-- "reebok" deja de existir como permiso. Acceso a Reebok se autoriza vía "catalogos".
UPDATE role_permissions
SET modulos = array_remove(modulos, 'reebok');

SELECT role, modulos FROM role_permissions ORDER BY role;
