-- Agrega el módulo 'multifashion' a los permisos del rol admin.
--
-- Contexto: Multifashion se separó del módulo Ventas a su propio módulo de
-- primer nivel (/multifashion). Por ahora SOLO admin; los demás roles se
-- definen después.
--
-- Nota: getVisibleModules() (nav) y hasModuleAccess() (gate de página) hacen
-- short-circuit para admin, y requireRole() también — así que admin ya ve y
-- usa el módulo sin esta fila. Esta migración mantiene role_permissions como
-- fuente única de verdad y prepara el terreno para sumar roles más adelante.
--
-- Idempotente: solo agrega 'multifashion' si aún no está en el array.

UPDATE role_permissions
SET modulos = array_append(modulos, 'multifashion'),
    updated_at = now()
WHERE role = 'admin'
  AND NOT ('multifashion' = ANY(modulos));
