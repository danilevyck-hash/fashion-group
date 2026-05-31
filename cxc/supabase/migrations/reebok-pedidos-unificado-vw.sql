-- ─────────────────────────────────────────────────────────────────────────────
-- Vista unificada de pedidos Reebok (FASE 1 — solo lectura). Auditoría sprint.
--
-- UNE las dos fuentes de pedidos Reebok en un shape común:
--   - reebok_orders (+ reebok_order_items): presenciales del admin → origen 'mio'
--   - reebok_pedidos_publicos (items en JSONB): del link del cliente → origen 'link'
--
-- ⚠️ CO-UBICACIÓN: esta vista asume que AMBAS tablas viven en el MISMO proyecto
-- Supabase. Hoy es así: reebokServer (src/lib/reebok-supabase-server.ts) cae al
-- proyecto principal porque NEXT_PUBLIC_REEBOK_SUPABASE_URL no está seteado. Si en
-- el futuro se separan los proyectos, reebok_orders se mudaría y esta vista (en el
-- principal) dejaría de ver esa tabla. Mantener juntas o rehacer la unión en código.
--
-- ORIGEN (FASE 1): se infiere por tabla — válido porque aún NO existe conversión.
-- En FASE 2 esta vista se REEMPLAZA para leer reebok_orders.origen_original y
-- excluir reebok_pedidos_publicos.convertida = true (decisión confirmada).
--
-- ITEMS: mismo shape en ambos orígenes — 6 campos core
--   (sku, name, quantity, image_url, product_id, unit_price).
-- TOTAL: se expone el guardado, pero el endpoint lo RECALCULA (no se confía en el
-- total guardado). id_natural = clave de deep-link según origen
--   'mio'  → reebok_orders.id (UUID)  → /catalogo/reebok/pedido/[id]
--   'link' → reebok_pedidos_publicos.short_id → /pedido-reebok/[short_id]
--
-- Aplicar manual en Supabase Dashboard → SQL Editor (proyecto principal).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW reebok_pedidos_unificado_vw AS
  -- ── Presenciales (reebok_orders) ──
  SELECT
    'mio'::text                                              AS origen,
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
    ), '[]'::json)                                           AS items
  FROM reebok_orders o

  UNION ALL

  -- ── Del link (reebok_pedidos_publicos) ──
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
    ), '[]'::json)                                               AS items
  FROM reebok_pedidos_publicos p;

GRANT SELECT ON reebok_pedidos_unificado_vw TO service_role;

NOTIFY pgrst, 'reload schema';
