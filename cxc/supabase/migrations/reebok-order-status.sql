-- Add status column to reebok_orders
ALTER TABLE reebok_orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'borrador';
-- Valid values: 'borrador', 'enviado', 'confirmado'
