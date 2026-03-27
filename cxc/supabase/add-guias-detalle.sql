ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS monto_total numeric(10,2) DEFAULT 0;
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS estado text DEFAULT 'Preparando';
