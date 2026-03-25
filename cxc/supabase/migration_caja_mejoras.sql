-- Run this in Supabase Dashboard > SQL Editor
-- Migration: Caja Menuda improvements

ALTER TABLE caja_gastos ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'Varios';
ALTER TABLE caja_gastos ADD COLUMN IF NOT EXISTS responsable text DEFAULT '';

CREATE TABLE IF NOT EXISTS caja_responsables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE caja_responsables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON caja_responsables FOR ALL USING (true) WITH CHECK (true);

INSERT INTO caja_responsables (nombre) VALUES
  ('Daniel Levy'),
  ('Angela Garcia'),
  ('Andrea Perez')
ON CONFLICT DO NOTHING;

ALTER TABLE caja_periodos ADD COLUMN IF NOT EXISTS repuesto boolean DEFAULT false;
ALTER TABLE caja_periodos ADD COLUMN IF NOT EXISTS repuesto_at timestamptz;
