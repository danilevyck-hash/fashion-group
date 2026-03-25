-- Run this in Supabase Dashboard > SQL Editor
-- Migration: Directorio de Clientes

CREATE TABLE IF NOT EXISTS directorio_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  empresa text DEFAULT '',
  telefono text DEFAULT '',
  celular text DEFAULT '',
  correo text DEFAULT '',
  contacto text DEFAULT '',
  notas text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE directorio_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON directorio_clientes FOR ALL USING (true) WITH CHECK (true);
