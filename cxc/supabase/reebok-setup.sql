-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- Go to your project → SQL Editor → New Query → Paste and Run

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  category TEXT NOT NULL DEFAULT 'footwear',
  gender TEXT,
  sub_category TEXT,
  color TEXT,
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  quantity INT DEFAULT 0,
  UNIQUE(product_id, size)
);

-- Enable RLS but allow all operations (public catalog)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on inventory" ON inventory FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for product images
-- Note: You need to create this in the Supabase Dashboard:
-- Go to Storage → New Bucket → Name: "product-images" → Public: ON
