-- ─────────────────────────────────────────────────────────────────────────────
-- Confirmación del cliente en pedidos públicos (Reebok + Joybees) + RLS Reebok.
--
-- PARTE A del paquete de catálogos: el cliente confirma su pedido desde el link
-- público (/pedido-reebok/[id] o /pedido-joybees/[id]) y esa confirmación
-- AUTO-CONVIERTE el pedido a PED-### / JBP-### vía las RPC existentes
-- (convert_reebok_pedido_publico / convert_joybees_pedido_publico).
--
-- 1. Columnas nuevas en ambas tablas públicas:
--      confirmado_cliente_at  — cuándo confirmó el cliente (null = sin confirmar).
--      confirmado_ip_hash     — hash sha256 truncado de la IP que confirmó
--                               (rate-limit anti-spam fail-open, mismo patrón
--                               que ip_hash del POST de creación; nunca la IP
--                               en claro).
-- 2. Vistas unificadas: se recrean AGREGANDO confirmado_cliente_at AL FINAL
--    (CREATE OR REPLACE permite columnas nuevas solo al final). Para filas ya
--    convertidas (fuente=orders, origen=link) se resuelve vía origen_short_id.
-- 3. RLS reebok_pedidos_publicos: se endurece al modelo Joybees (SOLO
--    service_role). Verificado en el código: TODOS los accesos a esta tabla
--    van server-side con SUPABASE_SERVICE_ROLE_KEY (endpoints públicos, admin,
--    backup y rate-limit); el browser nunca la consulta directo. Se eliminan
--    las políticas públicas viejas (public_read / public_insert, USING true)
--    que permitían leer/insertar con la anon key.
--
-- El código es TOLERANTE si esta migración aún no corrió: la confirmación
-- funciona igual (solo loguea un warning y no registra confirmado_cliente_at).
--
-- Migración ADITIVA y segura (no toca datos). Aplicar manual en Supabase
-- Dashboard → SQL Editor (proyecto principal).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columnas de confirmación del cliente ──
ALTER TABLE reebok_pedidos_publicos
  ADD COLUMN IF NOT EXISTS confirmado_cliente_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_ip_hash    text;

ALTER TABLE joybees_pedidos_publicos
  ADD COLUMN IF NOT EXISTS confirmado_cliente_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_ip_hash    text;

-- Índices para el conteo del rate-limit de confirmaciones por IP.
CREATE INDEX IF NOT EXISTS idx_reebok_pedidos_publicos_confirm_ip
  ON reebok_pedidos_publicos (confirmado_ip_hash, confirmado_cliente_at DESC);
CREATE INDEX IF NOT EXISTS idx_joybees_pedidos_publicos_confirm_ip
  ON joybees_pedidos_publicos (confirmado_ip_hash, confirmado_cliente_at DESC);

-- ── 2a. Vista unificada Reebok: misma definición (soft-delete, 20260708120000)
--        + columna confirmado_cliente_at AL FINAL ──
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
    'orders'::text                                           AS fuente,
    (
      SELECT pp.confirmado_cliente_at
      FROM reebok_pedidos_publicos pp
      WHERE pp.short_id = o.origen_short_id
      LIMIT 1
    )                                                        AS confirmado_cliente_at
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
    'publicos'::text                                             AS fuente,
    p.confirmado_cliente_at                                      AS confirmado_cliente_at
  FROM reebok_pedidos_publicos p
  WHERE COALESCE(p.convertida, false) = false
    AND p.deleted = false;

GRANT SELECT ON reebok_pedidos_unificado_vw TO service_role;

-- ── 2b. Vista unificada Joybees: misma definición (fase 2, 20260708130000)
--        + columna confirmado_cliente_at AL FINAL ──
CREATE OR REPLACE VIEW joybees_pedidos_unificado_vw AS
  -- ── joybees_orders (presenciales 'mio' + públicas convertidas 'link') ──
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
      FROM joybees_order_items i
      WHERE i.order_id = o.id
    ), '[]'::json)                                           AS items,
    'orders'::text                                           AS fuente,
    (
      SELECT pp.confirmado_cliente_at
      FROM joybees_pedidos_publicos pp
      WHERE pp.short_id = o.origen_short_id
      LIMIT 1
    )                                                        AS confirmado_cliente_at
  FROM joybees_orders o
  WHERE o.deleted = false

  UNION ALL

  -- ── joybees_pedidos_publicos NO convertidas y NO borradas ('link') ──
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
    'publicos'::text                                             AS fuente,
    p.confirmado_cliente_at                                      AS confirmado_cliente_at
  FROM joybees_pedidos_publicos p
  WHERE COALESCE(p.convertida, false) = false
    AND p.deleted = false;

GRANT SELECT ON joybees_pedidos_unificado_vw TO service_role;

-- ── 3. RLS reebok_pedidos_publicos → modelo Joybees (solo service_role) ──
-- NOTA: los endpoints públicos corren server-side con la service key (que
-- bypassa RLS); estas políticas son defensa en profundidad contra accesos con
-- la anon key desde fuera de la app.
ALTER TABLE reebok_pedidos_publicos ENABLE ROW LEVEL SECURITY;

-- Se eliminan TODAS las políticas existentes de la tabla (los nombres de las
-- viejas public_read/public_insert se crearon ad-hoc y podrían variar).
DO $do$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reebok_pedidos_publicos'
  LOOP
    EXECUTE format('DROP POLICY %I ON reebok_pedidos_publicos', pol.policyname);
  END LOOP;
END
$do$;

CREATE POLICY service_role_all ON reebok_pedidos_publicos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
