-- Run this in Supabase Dashboard > SQL Editor
CREATE TABLE IF NOT EXISTS cheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente text NOT NULL,
  empresa text NOT NULL,
  banco text NOT NULL,
  numero_cheque text NOT NULL,
  monto numeric(12,2) NOT NULL,
  fecha_deposito date NOT NULL,
  notas text DEFAULT '',
  estado text DEFAULT 'pendiente',
  fecha_depositado date,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON cheques FOR ALL USING (true) WITH CHECK (true);
