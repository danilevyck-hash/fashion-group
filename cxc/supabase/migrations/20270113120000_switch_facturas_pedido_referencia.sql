-- 🔴 EL N.° DE PEDIDO SE GUARDA CON LA FACTURA (12-nov-2026, Despachos › Etiquetas).
--
-- El API de Switch no trae el pedido; la vista de la factura en el panel sí
-- («Referencia Pedido: 16-000002889»). Leerlo al marcar la factura tardaba
-- 3–12 s (casi todo el LOGIN del panel). Ahora lo lee el sync de facturas, una
-- vez por factura, y la pantalla lo recibe con la lista.
--
--   pedido_referencia  el número leído; NULL = sin pedido o todavía sin leer.
--   pedido_leido_en    cuándo se leyó; NULL = nadie lo leyó todavía.
--
-- ADITIVO y seguro con el sync: el upsert de switch_facturas manda SOLO sus
-- columnas, así que nunca pisa estas dos.
ALTER TABLE switch_facturas
  ADD COLUMN IF NOT EXISTS pedido_referencia text,
  ADD COLUMN IF NOT EXISTS pedido_leido_en timestamptz;

COMMENT ON COLUMN switch_facturas.pedido_referencia IS
  'N.° de pedido («Referencia Pedido») leído del panel de Switch. NULL = sin pedido o sin leer (ver pedido_leido_en). Lo escribe lib/guias/pedido-de-factura.ts.';
COMMENT ON COLUMN switch_facturas.pedido_leido_en IS
  'Cuándo se leyó el pedido del panel. NULL = todavía no se leyó.';
