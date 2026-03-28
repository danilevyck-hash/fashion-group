-- Persist caja categories to database instead of localStorage
CREATE TABLE IF NOT EXISTS caja_categorias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed with default categories
INSERT INTO caja_categorias (nombre) VALUES
  ('Limpieza'),
  ('Materiales'),
  ('Transporte'),
  ('Alimentación'),
  ('Papelería'),
  ('Mantenimiento'),
  ('Otros')
ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE caja_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON caja_categorias FOR ALL USING (true) WITH CHECK (true);
