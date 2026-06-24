-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo Reebok auto-actualizado desde Switch: products necesita guardar las
-- DOS cifras de stock por producto + la salvaguarda de visibilidad.
--
--   existencia      = saldo físico en bodega (Switch /apiarticulos/stock.saldo).
--                     Es la cifra que decide mostrar/ocultar/agregar.
--   disponibilidad  = existencia − comprometido/apartado (Switch ...stock.disponible).
--                     Solo informativa; NO decide visibilidad.
--   keep_visible    = si Daniel la activa, el producto se muestra aunque
--                     existencia sea 0 (ej. "próximamente" o stock 0 temporal).
--
-- Aditiva, NO destructiva. Las filas viejas quedan con existencia/disponibilidad
-- NULL hasta la primera corrida del cron, y keep_visible=false.
--
-- Aplicar en el proyecto donde vive `products` (el principal por fallback de
-- reebok-supabase-server) — Supabase Dashboard → SQL Editor — ANTES de habilitar
-- el cron (sin las columnas, el upsert del sync falla y la empresa se salta).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS existencia     integer,
  ADD COLUMN IF NOT EXISTS disponibilidad integer,
  ADD COLUMN IF NOT EXISTS keep_visible   boolean NOT NULL DEFAULT false;

-- Para activar la salvaguarda en un producto puntual:
--   UPDATE products SET keep_visible = true WHERE sku = 'GH8228';
-- (o editar la fila en el Table Editor de Supabase). El cron la respeta: con
-- keep_visible=true el producto queda visible aunque existencia=0.

NOTIFY pgrst, 'reload schema';
