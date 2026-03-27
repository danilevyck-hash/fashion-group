-- Add cliente role with access to catalogo_reebok only
INSERT INTO role_permissions (role, modulos, activo) VALUES
  ('cliente', ARRAY['catalogo_reebok'], true)
ON CONFLICT (role) DO UPDATE SET modulos = ARRAY['catalogo_reebok'];
