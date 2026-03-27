CREATE TABLE IF NOT EXISTS reebok_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  vendor_name TEXT,
  comment TEXT,
  total DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reebok_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES reebok_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  sku TEXT,
  name TEXT,
  image_url TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reebok_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reebok_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all reebok_orders" ON reebok_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all reebok_order_items" ON reebok_order_items FOR ALL USING (true) WITH CHECK (true);
