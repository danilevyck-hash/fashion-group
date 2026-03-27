CREATE TABLE IF NOT EXISTS camisetas_productos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  genero TEXT NOT NULL CHECK (genero IN ('HOMBRE','MUJER','NIÑO')),
  color TEXT NOT NULL,
  precio_panama DECIMAL(10,2) NOT NULL,
  rrp DECIMAL(10,2) NOT NULL,
  stock_comprado INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS camisetas_clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS camisetas_pedidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES camisetas_clientes(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES camisetas_productos(id) ON DELETE CASCADE,
  paquetes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cliente_id, producto_id)
);

ALTER TABLE camisetas_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE camisetas_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE camisetas_pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all camisetas_productos" ON camisetas_productos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all camisetas_clientes" ON camisetas_clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all camisetas_pedidos" ON camisetas_pedidos FOR ALL USING (true) WITH CHECK (true);

-- Seed products
INSERT INTO camisetas_productos (nombre, genero, color, precio_panama, rrp, stock_comprado) VALUES
('Camiseta Roja', 'HOMBRE', 'ROJA', 56, 79.95, 2990),
('Camiseta Blanca', 'HOMBRE', 'BLANCA', 49, 69.95, 676),
('Camiseta Azul Navy', 'HOMBRE', 'AZUL NAVY', 56, 79.95, 1105),
('Camiseta Roja', 'MUJER', 'ROJA', 56, 79.95, 1690),
('Camiseta Blanca', 'MUJER', 'BLANCA', 49, 69.95, 520),
('Camiseta Azul Navy', 'MUJER', 'AZUL NAVY', 56, 79.95, 845),
('Camiseta Roja', 'NIÑO', 'ROJA', 42, 59.95, 1170),
('Camiseta Blanca', 'NIÑO', 'BLANCA', 35, 49.95, 260),
('Camiseta Azul Navy', 'NIÑO', 'AZUL NAVY', 42, 59.95, 715)
ON CONFLICT DO NOTHING;

-- Seed clients
INSERT INTO camisetas_clientes (nombre) VALUES
('Sporting'),('City Moda'),('Machetazo'),('City David'),('City P.Canoas'),
('Punto Poderoso'),('Sportsam'),('Hanna'),('Reina Boquete'),('Shopping Center'),
('Jerusalem'),('MetroShoes'),('Luty Luis'),('Wolf Mall'),('Xtreme Shoes'),
('Malek'),('Price Panama')
ON CONFLICT DO NOTHING;

-- Seed orders
INSERT INTO camisetas_pedidos (cliente_id, producto_id, paquetes)
SELECT c.id, p.id, v.paquetes
FROM (VALUES
  ('Sporting','Camiseta Roja','HOMBRE',13),('Sporting','Camiseta Blanca','HOMBRE',2),('Sporting','Camiseta Azul Navy','HOMBRE',9),
  ('Sporting','Camiseta Roja','MUJER',10),('Sporting','Camiseta Azul Navy','MUJER',4),
  ('Sporting','Camiseta Roja','NIÑO',8),('Sporting','Camiseta Azul Navy','NIÑO',6),
  ('City Moda','Camiseta Roja','HOMBRE',30),('City Moda','Camiseta Blanca','HOMBRE',20),('City Moda','Camiseta Azul Navy','HOMBRE',20),
  ('City Moda','Camiseta Roja','MUJER',20),('City Moda','Camiseta Blanca','MUJER',20),('City Moda','Camiseta Azul Navy','MUJER',20),
  ('City Moda','Camiseta Roja','NIÑO',10),('City Moda','Camiseta Blanca','NIÑO',10),('City Moda','Camiseta Azul Navy','NIÑO',10),
  ('Machetazo','Camiseta Roja','HOMBRE',25),('Machetazo','Camiseta Azul Navy','HOMBRE',14),
  ('Machetazo','Camiseta Roja','MUJER',25),('Machetazo','Camiseta Azul Navy','MUJER',14),
  ('Machetazo','Camiseta Roja','NIÑO',25),('Machetazo','Camiseta Azul Navy','NIÑO',14),
  ('City David','Camiseta Roja','HOMBRE',4),('City David','Camiseta Blanca','HOMBRE',4),('City David','Camiseta Azul Navy','HOMBRE',4),
  ('City David','Camiseta Roja','MUJER',4),('City David','Camiseta Blanca','MUJER',2),('City David','Camiseta Azul Navy','MUJER',4),
  ('City David','Camiseta Roja','NIÑO',4),('City David','Camiseta Azul Navy','NIÑO',4),
  ('City P.Canoas','Camiseta Roja','HOMBRE',4),('City P.Canoas','Camiseta Blanca','HOMBRE',4),('City P.Canoas','Camiseta Azul Navy','HOMBRE',4),
  ('City P.Canoas','Camiseta Roja','MUJER',4),('City P.Canoas','Camiseta Blanca','MUJER',2),('City P.Canoas','Camiseta Azul Navy','MUJER',4),
  ('City P.Canoas','Camiseta Roja','NIÑO',4),('City P.Canoas','Camiseta Azul Navy','NIÑO',4),
  ('Punto Poderoso','Camiseta Roja','HOMBRE',6),('Punto Poderoso','Camiseta Blanca','HOMBRE',3),
  ('Punto Poderoso','Camiseta Roja','MUJER',6),('Punto Poderoso','Camiseta Blanca','MUJER',3),
  ('Punto Poderoso','Camiseta Roja','NIÑO',3),
  ('Sportsam','Camiseta Roja','HOMBRE',2),('Sportsam','Camiseta Blanca','HOMBRE',2),('Sportsam','Camiseta Azul Navy','HOMBRE',1),
  ('Sportsam','Camiseta Roja','MUJER',2),('Sportsam','Camiseta Blanca','MUJER',2),('Sportsam','Camiseta Azul Navy','MUJER',1),
  ('Sportsam','Camiseta Roja','NIÑO',2),('Sportsam','Camiseta Azul Navy','NIÑO',1),
  ('Hanna','Camiseta Roja','HOMBRE',30),('Hanna','Camiseta Blanca','HOMBRE',15),('Hanna','Camiseta Azul Navy','HOMBRE',15),
  ('Hanna','Camiseta Roja','MUJER',15),('Hanna','Camiseta Blanca','MUJER',8),('Hanna','Camiseta Azul Navy','MUJER',8),
  ('Hanna','Camiseta Roja','NIÑO',15),('Hanna','Camiseta Blanca','NIÑO',8),('Hanna','Camiseta Azul Navy','NIÑO',8),
  ('Reina Boquete','Camiseta Roja','HOMBRE',1),('Reina Boquete','Camiseta Blanca','HOMBRE',1),
  ('Reina Boquete','Camiseta Roja','MUJER',1),('Reina Boquete','Camiseta Roja','NIÑO',1),
  ('Shopping Center','Camiseta Roja','HOMBRE',2),('Shopping Center','Camiseta Blanca','HOMBRE',2),('Shopping Center','Camiseta Azul Navy','HOMBRE',2),
  ('Shopping Center','Camiseta Roja','MUJER',2),('Shopping Center','Camiseta Blanca','MUJER',2),('Shopping Center','Camiseta Azul Navy','MUJER',2),
  ('Shopping Center','Camiseta Roja','NIÑO',2),('Shopping Center','Camiseta Azul Navy','NIÑO',2),
  ('Jerusalem','Camiseta Roja','HOMBRE',2),('Jerusalem','Camiseta Blanca','HOMBRE',1),('Jerusalem','Camiseta Azul Navy','HOMBRE',1),
  ('Jerusalem','Camiseta Roja','MUJER',2),('Jerusalem','Camiseta Blanca','MUJER',1),('Jerusalem','Camiseta Azul Navy','MUJER',1),
  ('MetroShoes','Camiseta Roja','HOMBRE',3),('MetroShoes','Camiseta Blanca','HOMBRE',2),('MetroShoes','Camiseta Azul Navy','HOMBRE',2),
  ('MetroShoes','Camiseta Roja','MUJER',3),('MetroShoes','Camiseta Blanca','MUJER',2),('MetroShoes','Camiseta Azul Navy','MUJER',2),
  ('MetroShoes','Camiseta Roja','NIÑO',2),('MetroShoes','Camiseta Azul Navy','NIÑO',2),
  ('Luty Luis','Camiseta Roja','HOMBRE',7),('Luty Luis','Camiseta Blanca','HOMBRE',1),('Luty Luis','Camiseta Azul Navy','HOMBRE',2),
  ('Luty Luis','Camiseta Roja','NIÑO',7),('Luty Luis','Camiseta Blanca','NIÑO',1),('Luty Luis','Camiseta Azul Navy','NIÑO',2),
  ('Wolf Mall','Camiseta Roja','HOMBRE',2),('Wolf Mall','Camiseta Blanca','HOMBRE',1),
  ('Wolf Mall','Camiseta Roja','MUJER',2),('Wolf Mall','Camiseta Blanca','MUJER',1),
  ('Xtreme Shoes','Camiseta Roja','HOMBRE',4),('Xtreme Shoes','Camiseta Blanca','HOMBRE',4),('Xtreme Shoes','Camiseta Azul Navy','HOMBRE',2),
  ('Xtreme Shoes','Camiseta Roja','MUJER',2),('Xtreme Shoes','Camiseta Blanca','MUJER',2),('Xtreme Shoes','Camiseta Azul Navy','MUJER',1),
  ('Xtreme Shoes','Camiseta Roja','NIÑO',2),('Xtreme Shoes','Camiseta Azul Navy','NIÑO',1),
  ('Malek','Camiseta Azul Navy','HOMBRE',1),
  ('Price Panama','Camiseta Roja','HOMBRE',4),('Price Panama','Camiseta Blanca','HOMBRE',4),('Price Panama','Camiseta Azul Navy','HOMBRE',4),
  ('Price Panama','Camiseta Roja','MUJER',4),('Price Panama','Camiseta Blanca','MUJER',4),('Price Panama','Camiseta Azul Navy','MUJER',4),
  ('Price Panama','Camiseta Roja','NIÑO',3),('Price Panama','Camiseta Blanca','NIÑO',3),('Price Panama','Camiseta Azul Navy','NIÑO',3)
) AS v(cliente_nombre, producto_nombre, genero, paquetes)
JOIN camisetas_clientes c ON c.nombre = v.cliente_nombre
JOIN camisetas_productos p ON p.nombre = v.producto_nombre AND p.genero = v.genero
ON CONFLICT (cliente_id, producto_id) DO UPDATE SET paquetes = EXCLUDED.paquetes;
