-- ═════════════════════════════════════════════════════════════════════════════
-- SCOPE 1 — Taxonomía de grupos + limpieza de permisos.
-- ═════════════════════════════════════════════════════════════════════════════
-- 1) Elimina el módulo deprecado "upload" de TODOS los roles (la página /upload
--    y los endpoints /api/cxc/upload, /api/ventas/upload se eliminaron del
--    código; el sync de Switch API ya cubre la carga).
-- 2) Completa la fila de admin en role_permissions con los módulos del grupo
--    Sistema (usuarios, data-health) para que quede consistente con modules.ts.
--    (El código igual da TODO a admin por short-circuit, pero dejamos la fila
--    completa para que la fuente de verdad en DB no mienta.)
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1) Quitar 'upload' de todos los roles
UPDATE role_permissions
   SET modulos = array_remove(modulos, 'upload'), updated_at = now()
 WHERE 'upload' = ANY(modulos);

-- 2) Completar admin con 'usuarios' y 'data-health'
UPDATE role_permissions
   SET modulos = (
         SELECT array_agg(DISTINCT m)
           FROM unnest(modulos || ARRAY['usuarios', 'data-health']) AS m
       ),
       updated_at = now()
 WHERE role = 'admin'
   AND NOT (modulos @> ARRAY['usuarios', 'data-health']);

NOTIFY pgrst, 'reload schema';
