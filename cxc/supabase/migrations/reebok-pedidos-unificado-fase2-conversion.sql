-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 2 — Campos de conversión de pedidos Reebok + CREATE OR REPLACE de la vista.
--
-- Modelo de conversión (decisión confirmada):
--   - Una pública editada NO se borra: se MIGRA a reebok_orders y la fila pública
--     se marca convertida=true + ped_order_number (idempotencia: reabrir lleva al
--     mismo PED-XXX).
--   - El ORIGEN se conserva SIEMPRE: la fila migrada vive en reebok_orders pero
--     conserva origen_original='link' → sigue mostrándose como "Del link".
--   - La vista EXCLUYE las públicas convertidas para no duplicar.
--
-- ⚠️ ORIGEN vs FUENTE: a partir de FASE 2, `origen` (lo que se muestra: 'mio' |
-- 'link') deja de coincidir con la tabla física. Por eso la vista expone también
-- `fuente` ('orders' | 'publicos') = de qué tabla salió la fila. El frontend usa
-- `origen` para el badge y `fuente` para el routing del detalle y para el borrado.
--
-- CREATE OR REPLACE VIEW: mantiene las 7 columnas de FASE 1 en el mismo orden y
-- tipo, y AÑADE `fuente` al final (única forma permitida de extender una vista).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor (proyecto principal).
-- Migración ADITIVA y segura (no toca datos). La conversión real (irreversible)
-- la ejecuta la RPC del commit 5.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. reebok_pedidos_publicos: marca de conversión ──
ALTER TABLE reebok_pedidos_publicos
  ADD COLUMN IF NOT EXISTS convertida       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ped_order_number text,
  ADD COLUMN IF NOT EXISTS convertida_at    timestamptz;

-- ── 2. reebok_orders: origen real conservado + traza al short_id de origen ──
ALTER TABLE reebok_orders
  ADD COLUMN IF NOT EXISTS origen_original text NOT NULL DEFAULT 'mio',
  ADD COLUMN IF NOT EXISTS origen_short_id text;

ALTER TABLE reebok_orders
  DROP CONSTRAINT IF EXISTS reebok_orders_origen_original_chk;
ALTER TABLE reebok_orders
  ADD CONSTRAINT reebok_orders_origen_original_chk
  CHECK (origen_original IN ('mio', 'link'));

-- ── 3. CREATE OR REPLACE de la vista unificada (FASE 2) ──
CREATE OR REPLACE VIEW reebok_pedidos_unificado_vw AS
  -- ── reebok_orders (presenciales 'mio' + públicas convertidas 'link') ──
  SELECT
    COALESCE(NULLIF(btrim(o.origen_original), ''), 'mio')::text AS origen,
    o.id::text                                               AS id_natural,
    COALESCE(NULLIF(btrim(o.client_name), ''), 'Sin nombre') AS cliente,
    o.total::numeric                                         AS total,
    o.created_at                                             AS created_at,
    o.vendor_name                                            AS vendor,
    COALESCE((
      SELECT json_agg(json_build_object(
        'sku',        i.sku,
        'name',       i.name,
        'quantity',   i.quantity,
        'image_url',  i.image_url,
        'product_id', i.product_id,
        'unit_price', i.unit_price
      ) ORDER BY i.created_at, i.id)
      FROM reebok_order_items i
      WHERE i.order_id = o.id
    ), '[]'::json)                                           AS items,
    'orders'::text                                           AS fuente
  FROM reebok_orders o

  UNION ALL

  -- ── reebok_pedidos_publicos NO convertidas ('link') ──
  SELECT
    'link'::text                                                 AS origen,
    p.short_id                                                   AS id_natural,
    COALESCE(NULLIF(btrim(p.cliente_nombre), ''), 'Sin nombre')  AS cliente,
    p.total::numeric                                             AS total,
    p.created_at                                                 AS created_at,
    NULL::text                                                   AS vendor,
    COALESCE((
      SELECT json_agg(json_build_object(
        'sku',        it->>'sku',
        'name',       it->>'name',
        'quantity',   NULLIF(it->>'quantity', '')::numeric,
        'image_url',  it->>'image_url',
        'product_id', it->>'product_id',
        'unit_price', NULLIF(it->>'unit_price', '')::numeric
      ) ORDER BY ord)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.items) = 'array' THEN p.items ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS arr(it, ord)
    ), '[]'::json)                                               AS items,
    'publicos'::text                                             AS fuente
  FROM reebok_pedidos_publicos p
  WHERE COALESCE(p.convertida, false) = false;

GRANT SELECT ON reebok_pedidos_unificado_vw TO service_role;

NOTIFY pgrst, 'reload schema';
