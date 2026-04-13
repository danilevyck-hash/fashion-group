-- Migration: Add badge column to products tables
-- Values: 'nuevo', 'oferta', or NULL (no badge)
-- Replaces the old on_sale boolean for badge display

-- Reebok products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge text;

-- Joybees products table
ALTER TABLE joybees_products ADD COLUMN IF NOT EXISTS badge text;

-- Optional: Add check constraint
-- ALTER TABLE products ADD CONSTRAINT products_badge_check CHECK (badge IN ('nuevo', 'oferta') OR badge IS NULL);
-- ALTER TABLE joybees_products ADD CONSTRAINT joybees_products_badge_check CHECK (badge IN ('nuevo', 'oferta') OR badge IS NULL);
