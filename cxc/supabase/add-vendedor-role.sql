-- Add vendedor role and catalogo_reebok module to role_permissions
INSERT INTO role_permissions (role, modulos, activo) VALUES
  ('vendedor', ARRAY['catalogo_reebok','cxc','directorio'], true)
ON CONFLICT (role) DO NOTHING;

-- Add catalogo_reebok to admin and director roles
UPDATE role_permissions SET modulos = array_append(modulos, 'catalogo_reebok')
WHERE role IN ('admin', 'director') AND NOT ('catalogo_reebok' = ANY(modulos));
