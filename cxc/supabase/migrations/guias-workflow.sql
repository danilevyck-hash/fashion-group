-- Guias 2-step workflow: Secretaria → Bodega
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS nombre_entregador TEXT;
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS cedula_entregador TEXT;
-- firma_transportista already added in previous migration

-- Add bodega user
INSERT INTO fg_users (name, password, role, active)
VALUES ('Bodega', 'bodega2025', 'staff', true)
ON CONFLICT DO NOTHING;

-- Add guias module for bodega user (run after fg_users insert)
-- INSERT INTO fg_user_modules (user_id, module_key, enabled)
-- SELECT id, 'guias', true FROM fg_users WHERE name = 'Bodega'
-- ON CONFLICT DO NOTHING;
