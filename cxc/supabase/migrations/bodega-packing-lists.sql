-- Habilita el módulo Packing Lists para el rol "bodega".
-- Idempotente: inserta la fila si falta, agrega 'packing-lists' al array si
-- no está presente.

INSERT INTO role_permissions (role, modulos, activo)
VALUES ('bodega', ARRAY['guias','packing-lists'], true)
ON CONFLICT (role) DO UPDATE
  SET modulos = (
    SELECT ARRAY(SELECT DISTINCT unnest(role_permissions.modulos || ARRAY['packing-lists']))
  )
  WHERE NOT ('packing-lists' = ANY(role_permissions.modulos));
