-- Joybees catalog tables
-- Run this migration against Supabase project

CREATE TABLE IF NOT EXISTS joybees_products (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  gender text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  stock int NOT NULL DEFAULT 0,
  image_url text,
  active boolean DEFAULT true,
  popular boolean DEFAULT false,
  is_regalia boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE joybees_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON joybees_products FOR ALL USING (true);

-- Public orders table for Joybees
CREATE TABLE IF NOT EXISTS joybees_pedidos_publicos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  short_id text UNIQUE NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE joybees_pedidos_publicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON joybees_pedidos_publicos FOR ALL USING (true);
