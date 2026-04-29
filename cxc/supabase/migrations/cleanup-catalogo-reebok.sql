-- Eliminar el módulo huérfano "catalogo_reebok" de todos los roles
UPDATE role_permissions
SET modulos = array_remove(modulos, 'catalogo_reebok');

-- Verificación post-ejecución
SELECT role, modulos FROM role_permissions;
