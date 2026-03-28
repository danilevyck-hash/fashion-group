-- Add contact tracking fields to cxc_client_overrides
ALTER TABLE cxc_client_overrides ADD COLUMN IF NOT EXISTS resultado_contacto text;
ALTER TABLE cxc_client_overrides ADD COLUMN IF NOT EXISTS proximo_seguimiento date;
