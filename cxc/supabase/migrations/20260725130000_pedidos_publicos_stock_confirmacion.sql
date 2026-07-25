-- ─────────────────────────────────────────────────────────────────────────────
-- 20260725130000_pedidos_publicos_stock_confirmacion.sql
--
-- PROBLEMA
-- Cuando un producto del pedido del link tenía menos piezas de las pedidas, la
-- confirmación pública frenaba al cliente con un modal ("Algunos productos no
-- tienen todas las piezas disponibles" → 409 stock_corto → reenviar con
-- aceptar_stock). Ese modal se ELIMINÓ: el pedido se confirma directo.
-- Pero la cantidad real no se puede perder — ni el cliente ni la secretaria
-- deben creer que van 12 piezas si solo hay 8.
--
-- QUÉ HACE
-- Agrega `stock_confirmacion jsonb` a las 3 tablas de pedidos públicos
-- (Reebok / Joybees / Tommy Hilfiger — paridad exacta). Guarda la FOTO del
-- stock en el instante de confirmar, una entrada por línea:
--
--   [{ "product_id": "uuid", "sku": "...", "name": "...",
--      "pedido_bultos": 2, "pedido_pzas": 24,
--      "disponible_pzas": 8, "bulto_pzas": 12 }, ...]
--
-- Es un SNAPSHOT a propósito: se escribe una sola vez, en la confirmación, y
-- NUNCA se recalcula. Si mañana llega mercancía, el pedido sigue mostrando lo
-- que había cuando el cliente confirmó (que es lo que se le prometió).
-- `bulto_pzas` viaja en la foto para poder formatear "1 bulto · 8 pzas" sin
-- volver a resolver la categoría meses después.
--
-- Quién la lee:
--   · /pedido-<marca>/[short_id]  — el cliente, por línea y en el resumen.
--   · /catalogo/<marca>/pedido/[id] (admin) — la secretaria, cruzando por
--     <marca>_orders.origen_short_id.
--
-- TOLERANCIA
-- El código deployado funciona SIN esta migración: el update de confirmación
-- reintenta sin la columna, los GET la piden y caen a un juego de columnas más
-- corto, y la UI simplemente no muestra la línea de disponibilidad.
--
-- VERIFICACIÓN (tras aplicar)
--   select table_name, column_name, data_type
--     from information_schema.columns
--    where column_name = 'stock_confirmacion'
--    order by table_name;
--   -- esperado: 3 filas (joybees/reebok/tommy_pedidos_publicos, jsonb)
--
--   -- y sobre un pedido del link ya confirmado:
--   select short_id, ped_order_number,
--          jsonb_array_length(coalesce(stock_confirmacion, '[]'::jsonb)) as lineas
--     from reebok_pedidos_publicos
--    where convertida and confirmado_cliente_at is not null
--    order by confirmado_cliente_at desc limit 5;
--
-- Migración ADITIVA (no toca datos existentes; las filas viejas quedan en
-- NULL). Aplicar manual en Supabase Dashboard → SQL Editor (proyecto principal).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reebok_pedidos_publicos
  ADD COLUMN IF NOT EXISTS stock_confirmacion jsonb;

ALTER TABLE joybees_pedidos_publicos
  ADD COLUMN IF NOT EXISTS stock_confirmacion jsonb;

ALTER TABLE tommy_pedidos_publicos
  ADD COLUMN IF NOT EXISTS stock_confirmacion jsonb;

COMMENT ON COLUMN reebok_pedidos_publicos.stock_confirmacion IS
  'Foto del stock al confirmar el pedido del link: [{product_id, sku, name, pedido_bultos, pedido_pzas, disponible_pzas, bulto_pzas}]. Snapshot inmutable, NO se recalcula.';
COMMENT ON COLUMN joybees_pedidos_publicos.stock_confirmacion IS
  'Foto del stock al confirmar el pedido del link: [{product_id, sku, name, pedido_bultos, pedido_pzas, disponible_pzas, bulto_pzas}]. Snapshot inmutable, NO se recalcula.';
COMMENT ON COLUMN tommy_pedidos_publicos.stock_confirmacion IS
  'Foto del stock al confirmar el pedido del link: [{product_id, sku, name, pedido_bultos, pedido_pzas, disponible_pzas, bulto_pzas}]. Snapshot inmutable, NO se recalcula.';

NOTIFY pgrst, 'reload schema';
