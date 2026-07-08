-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 2 — Joybees "Del link": persistir pedidos públicos + Origen unificado.
-- Espejo EXACTO de la infraestructura Reebok (reebok_pedidos_publicos + vista
-- unificada + RPC de conversión), adaptado al modelo Joybees:
--   * order_number = 'JBP-###' (no 'PED-###').
--   * joybees_order_items NO tiene is_preorder (concepto exclusivo Reebok) →
--     ni la vista ni el RPC lo referencian.
--   * joybees_orders.id es UUID (Reebok igual) y status NOT NULL DEFAULT 'borrador'.
--
-- SEGURIDAD: la tabla nueva se crea con RLS + SOLO service_role (los endpoints
-- públicos corren server-side con SUPABASE_SERVICE_ROLE_KEY). NO se usa el
-- USING(true) anon que causó la fuga de reebok_orders (auditoría 4-jul).
--
-- Migración ADITIVA y segura (no toca datos existentes). Correr MANUAL en
-- Supabase Dashboard → SQL Editor (proyecto principal) ANTES del deploy del código.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabla de pedidos públicos Joybees (espejo de reebok_pedidos_publicos) ──
CREATE TABLE IF NOT EXISTS joybees_pedidos_publicos (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  short_id         text UNIQUE NOT NULL,              -- token del link (8 chars, generado con crypto en el endpoint)
  items            jsonb NOT NULL DEFAULT '[]'::jsonb,
  total            numeric NOT NULL DEFAULT 0,
  cliente_nombre   text,
  ip_hash          text,                              -- rate-limit anti-spam por IP (fail-open)
  convertida       boolean NOT NULL DEFAULT false,    -- true = ya migrada a joybees_orders (la vista la excluye)
  ped_order_number text,                              -- JBP-### resultante de la conversión (idempotencia)
  convertida_at    timestamptz,
  deleted          boolean NOT NULL DEFAULT false,    -- soft-delete (paridad Fase 1)
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS: SOLO service_role (los endpoints usan esa key; nada de anon USING(true)).
ALTER TABLE joybees_pedidos_publicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON joybees_pedidos_publicos;
CREATE POLICY service_role_all ON joybees_pedidos_publicos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. joybees_orders: origen real conservado + traza al short_id de origen ──
-- (espejo de reebok_orders: un pedido migrado desde el link conserva
--  origen_original='link' → sigue mostrándose como "Del link").
ALTER TABLE joybees_orders
  ADD COLUMN IF NOT EXISTS origen_original text NOT NULL DEFAULT 'mio',
  ADD COLUMN IF NOT EXISTS origen_short_id text;

ALTER TABLE joybees_orders
  DROP CONSTRAINT IF EXISTS joybees_orders_origen_original_chk;
ALTER TABLE joybees_orders
  ADD CONSTRAINT joybees_orders_origen_original_chk
  CHECK (origen_original IN ('mio', 'link'));

-- ── 3. Vista unificada Joybees (Míos + Del link), espejo de la Reebok ──
-- Joybees no tenía vista (su lista era fetch directo a joybees_orders). Esta la
-- crea. Mismas 8 columnas/orden/tipo que la Reebok. `origen` = badge (mio|link);
-- `fuente` = de qué tabla salió (orders|publicos) → routing del detalle y borrado.
-- Excluye borrados (deleted=false) y públicas ya convertidas (convertida=false).
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
    'orders'::text                                           AS fuente
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
    'publicos'::text                                             AS fuente
  FROM joybees_pedidos_publicos p
  WHERE COALESCE(p.convertida, false) = false
    AND p.deleted = false;

GRANT SELECT ON joybees_pedidos_unificado_vw TO service_role;

-- ── 4. RPC atómica de conversión: público (link) → joybees_orders ──
-- Espejo de convert_reebok_pedido_publico. Diferencias: JBP-###, sin is_preorder,
-- status='borrador', vendor_name NULL. El TOTAL lo calcula el endpoint en JS
-- (calculateJoybeesOrderTotal, bulto 12) y lo pasa en p_total; la RPC no recalcula.
-- IDEMPOTENTE: si ya está convertida devuelve el JBP-### existente. SECURITY
-- DEFINER + search_path fijo; EXECUTE solo a service_role.
CREATE OR REPLACE FUNCTION convert_joybees_pedido_publico(
  p_short_id text,
  p_total    numeric,
  p_items    jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pub          joybees_pedidos_publicos%ROWTYPE;
  v_order_id     uuid;
  v_order_number text;
  v_next         int;
  v_item         jsonb;
BEGIN
  -- Lock de la fila pública para serializar conversiones concurrentes del mismo pedido.
  SELECT * INTO v_pub
    FROM joybees_pedidos_publicos
    WHERE short_id = p_short_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido publico % no existe', p_short_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotencia: ya convertida → devolver el JBP existente sin crear otro.
  IF COALESCE(v_pub.convertida, false) THEN
    SELECT id INTO v_order_id
      FROM joybees_orders
      WHERE order_number = v_pub.ped_order_number;
    RETURN jsonb_build_object(
      'order_number',      v_pub.ped_order_number,
      'order_id',          v_order_id,
      'already_converted', true
    );
  END IF;

  -- Siguiente JBP-### . Advisory lock para evitar carrera en la numeración.
  PERFORM pg_advisory_xact_lock(hashtext('joybees_order_number'));
  SELECT COALESCE(MAX(substring(order_number FROM '^JBP-(\d+)$')::int), 0) + 1
    INTO v_next
    FROM joybees_orders
    WHERE order_number ~ '^JBP-\d+$';
  v_order_number := 'JBP-' || lpad(v_next::text, 3, '0');

  -- Crear el pedido conservando el origen 'link'. status default 'borrador'.
  INSERT INTO joybees_orders (
    order_number, client_name, vendor_name, total, status, origen_original, origen_short_id
  ) VALUES (
    v_order_number,
    COALESCE(NULLIF(btrim(v_pub.cliente_nombre), ''), 'Sin nombre'),
    NULL,
    COALESCE(p_total, 0),
    'borrador',
    'link',
    p_short_id
  )
  RETURNING id INTO v_order_id;

  -- Copiar items (SIN is_preorder). product_id es UUID NOT NULL: si un item viene
  -- sin uuid válido, el cast falla y toda la conversión hace rollback (atomicidad).
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO joybees_order_items (
      order_id, product_id, sku, name, image_url, quantity, unit_price
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'sku',
      v_item->>'name',
      v_item->>'image_url',
      COALESCE(NULLIF(v_item->>'quantity', '')::int, 1),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0)
    );
  END LOOP;

  -- Marcar la pública como convertida (idempotencia + exclusión de la vista).
  UPDATE joybees_pedidos_publicos
    SET convertida       = true,
        ped_order_number = v_order_number,
        convertida_at    = now()
    WHERE short_id = p_short_id;

  RETURN jsonb_build_object(
    'order_number',      v_order_number,
    'order_id',          v_order_id,
    'already_converted', false
  );
END;
$$;

REVOKE ALL ON FUNCTION convert_joybees_pedido_publico(text, numeric, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION convert_joybees_pedido_publico(text, numeric, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
