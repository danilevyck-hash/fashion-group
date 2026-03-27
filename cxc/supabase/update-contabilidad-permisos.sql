-- Update contabilidad role to include ventas module
UPDATE role_permissions SET modulos = ARRAY['prestamos','ventas'] WHERE role = 'contabilidad';
