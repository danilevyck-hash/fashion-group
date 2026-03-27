-- Add WhatsApp field to directorio_clientes
ALTER TABLE directorio_clientes ADD COLUMN IF NOT EXISTS whatsapp text;
-- Note: telefono and celular columns preserved in DB for backward compatibility but hidden from UI
