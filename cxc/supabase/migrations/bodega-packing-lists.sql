-- Habilita el módulo Packing Lists para el rol "bodega".
-- Idempotente:
--   - Si la fila no existe, la inserta con [guias, packing-lists].
--   - Si existe, agrega 'packing-lists' al array sin duplicarlo, preserva
--     cualquier otro módulo que ya tuviera.

INSERT INTO role_permissions (role, modulos, activo)
VALUES ('bodega', ARRAY['guias', 'packing-lists'], true)
ON CONFLICT (role) DO UPDATE
  SET modulos = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(role_permissions.modulos || ARRAY['packing-lists'])
    )
  ),
  updated_at = NOW();
