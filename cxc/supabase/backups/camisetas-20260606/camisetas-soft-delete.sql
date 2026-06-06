-- Add soft delete columns to camisetas tables
ALTER TABLE camisetas_clientes ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false;
ALTER TABLE camisetas_pedidos ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false;
