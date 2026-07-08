-- ─────────────────────────────────────────────────────────────────────────────
-- Soft-delete de pedidos (Tema 3) — Reebok + Joybees.
--
-- El borrado de pedidos pasa de HARD (delete físico) a SOFT (deleted=true):
-- borrado VISUAL, NO toca la API de Switch (Switch no permite borrar y hay
-- pedidos que ya no existen en Switch pero seguían apareciendo aquí). Un pedido
-- borrado desaparece de las listas del admin pero queda recuperable en la DB.
--
-- Columnas aditivas (IF NOT EXISTS) + recreación de la vista unificada Reebok
-- para excluir borrados. Joybees no usa vista (su lista es fetch directo) → el
-- filtro deleted=false va en el endpoint.
--
-- Migración ADITIVA y segura (no toca datos). Aplicar manual en Supabase
-- Dashboard → SQL Editor (proyecto principal).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columnas de soft-delete ──
ALTER TABLE reebok_orders
  ADD COLUMN IF NOT EXISTS deleted    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE reebok_pedidos_publicos
  ADD COLUMN IF NOT EXISTS deleted    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE joybees_orders
  ADD COLUMN IF NOT EXISTS deleted    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ── 2. Recrear la vista unificada Reebok excluyendo borrados ──
-- Idéntica a FASE 2 (mismas 8 columnas, mismo orden/tipo); solo se añaden dos
-- filtros WHERE (o.deleted / p.deleted). CREATE OR REPLACE conserva la firma.
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
  WHERE o.deleted = false

  UNION ALL

  -- ── reebok_pedidos_publicos NO convertidas y NO borradas ('link') ──
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
  WHERE COALESCE(p.convertida, false) = false
    AND p.deleted = false;

GRANT SELECT ON reebok_pedidos_unificado_vw TO service_role;

NOTIFY pgrst, 'reload schema';
