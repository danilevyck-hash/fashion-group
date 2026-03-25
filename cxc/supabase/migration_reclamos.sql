-- Run this in Supabase Dashboard > SQL Editor
-- Migration: Reclamos module

CREATE SEQUENCE IF NOT EXISTS reclamo_seq START 1;

CREATE TABLE IF NOT EXISTS reclamos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nro_reclamo text UNIQUE NOT NULL,
  empresa text NOT NULL,
  proveedor text NOT NULL,
  marca text NOT NULL,
  nro_factura text NOT NULL,
  nro_orden_compra text DEFAULT '',
  fecha_reclamo date NOT NULL,
  estado text DEFAULT 'Enviado',
  notas text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reclamo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamo_id uuid NOT NULL REFERENCES reclamos(id) ON DELETE CASCADE,
  referencia text DEFAULT '',
  descripcion text DEFAULT '',
  talla text DEFAULT '',
  cantidad integer DEFAULT 0,
  precio_unitario numeric DEFAULT 0,
  subtotal numeric DEFAULT 0,
  motivo text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reclamo_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamo_id uuid NOT NULL REFERENCES reclamos(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reclamo_seguimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamo_id uuid NOT NULL REFERENCES reclamos(id) ON DELETE CASCADE,
  nota text NOT NULL,
  autor text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reclamo_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa text NOT NULL,
  nombre text DEFAULT '',
  whatsapp text DEFAULT '',
  correo text DEFAULT '',
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reclamos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reclamo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reclamo_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reclamo_seguimiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE reclamo_contactos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open" ON reclamos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open" ON reclamo_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open" ON reclamo_fotos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open" ON reclamo_seguimiento FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open" ON reclamo_contactos FOR ALL USING (true) WITH CHECK (true);

-- Insert default contacts
INSERT INTO reclamo_contactos (empresa, nombre, whatsapp, correo) VALUES
  ('Vistana International', '', '', ''),
  ('Fashion Wear', '', '', ''),
  ('Fashion Shoes', '', '', ''),
  ('Active Shoes', '', '', ''),
  ('Active Wear', '', '', '')
ON CONFLICT DO NOTHING;
