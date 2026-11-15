-- ─────────────────────────────────────────────────────────────────────────────
-- Reebok · el bulto queda ESCRITO en cada renglón del pedido (15-nov-2026).
--
-- Daniel: la ropa de Reebok se vende en bultos de 12 (medias incluidas); los
-- accesorios se quedan en 6. Hasta hoy el bulto se recalculaba con una regla
-- fija (calzado 12, todo lo demás 6) cada vez que se mostraba un pedido, así
-- que cambiar la regla habría duplicado los 18 pedidos viejos con ropa y
-- accesorios ($42.360 → $84.720).
--
-- Por eso:
--   1. Columna NUEVA y NULLABLE `reebok_order_items.bulto_pzas`. NULL = renglón
--      viejo → la app lo lee con la regla de entonces (calzado 12, resto 6).
--      SIN backfill y SIN UPDATE: ningún renglón existente cambia.
--   2. Las tres RPC que insertan renglones (crear, reemplazar, convertir el
--      pedido del link) copian `bulto_pzas` del JSON si viene. Mismo cuerpo de
--      siempre (verificado igual a producción el 15-nov-2026) + esa columna.
--   3. La vista unificada (Excel de Comprobantes) expone `bulto_pzas` en el
--      JSON de cada renglón, para que el Excel cuente las piezas igual que la
--      pantalla.
--
-- Filas que toca: 0. Es aditiva: la app ya está publicada y funciona igual
-- sin esta migración (falla abierta); al aplicarla, la ropa NUEVA sale de 12.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. La columna ───────────────────────────────────────────────────────────
ALTER TABLE reebok_order_items ADD COLUMN IF NOT EXISTS bulto_pzas smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reebok_order_items_bulto_pzas_rango'
  ) THEN
    ALTER TABLE reebok_order_items
      ADD CONSTRAINT reebok_order_items_bulto_pzas_rango
      CHECK (bulto_pzas IS NULL OR (bulto_pzas >= 1 AND bulto_pzas <= 99));
  END IF;
END $$;

COMMENT ON COLUMN reebok_order_items.bulto_pzas IS
  'Piezas por bulto con que se pidió el renglón (desde 15-nov-2026). NULL = renglón viejo: calzado 12, lo demás 6. Lo escribe la app; nunca se recalcula.';

-- ── 2. Las RPC que insertan renglones ───────────────────────────────────────
CREATE OR REPLACE FUNCTION reebok_create_order(
  p_client_name     text,
  p_vendor_name     text,
  p_client_email    text,
  p_total           numeric,
  p_idempotency_key text,
  p_items           jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id     uuid;
  v_order_number text;
  v_next         int;
  v_item         jsonb;
BEGIN
  -- Serializa TODAS las creaciones: protege tanto la numeración como el
  -- chequeo de idempotencia contra carreras.
  PERFORM pg_advisory_xact_lock(hashtext('reebok_order_number'));

  -- Idempotencia: si ya existe un pedido con este token, devolverlo sin crear
  -- otro (un retry del front cae aquí y recibe el mismo PED-###).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, order_number INTO v_order_id, v_order_number
      FROM reebok_orders WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_id', v_order_id, 'order_number', v_order_number, 'already_created', true
      );
    END IF;
  END IF;

  -- Siguiente PED-### sin carrera (protegido por el advisory lock).
  SELECT COALESCE(MAX(substring(order_number FROM '^PED-(\d+)$')::int), 0) + 1
    INTO v_next
    FROM reebok_orders
    WHERE order_number ~ '^PED-\d+$';
  v_order_number := 'PED-' || lpad(v_next::text, 3, '0');

  INSERT INTO reebok_orders (
    order_number, client_name, vendor_name, client_email, total, status, idempotency_key
  ) VALUES (
    v_order_number,
    COALESCE(NULLIF(btrim(p_client_name), ''), 'Sin nombre'),
    p_vendor_name,
    p_client_email,
    COALESCE(p_total, 0),
    'borrador',
    p_idempotency_key
  )
  RETURNING id INTO v_order_id;

  -- Items. product_id es UUID NOT NULL: un item sin uuid válido revienta el
  -- cast y hace rollback total (no quedan pedidos a medias).
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO reebok_order_items (
      order_id, product_id, sku, name, image_url, quantity, unit_price, is_preorder, bulto_pzas
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'sku',
      v_item->>'name',
      v_item->>'image_url',
      COALESCE(NULLIF(v_item->>'quantity', '')::int, 1),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0),
      COALESCE((v_item->>'is_preorder')::boolean, false),
      -- El bulto escrito (lo pone la app; sin él, NULL = la regla vieja).
      NULLIF(v_item->>'bulto_pzas', '')::smallint
    );
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'already_created', false
  );
END;
$$;

REVOKE ALL ON FUNCTION reebok_create_order(text, text, text, numeric, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION reebok_create_order(text, text, text, numeric, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION reebok_order_replace_items(
  p_order_id uuid,
  p_total    numeric,
  p_items    jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item  jsonb;
  v_count int := 0;
BEGIN
  -- Lock de la fila del pedido para serializar PUTs concurrentes del mismo pedido.
  PERFORM 1 FROM reebok_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no existe', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Reemplazo atómico. Si un product_id no es uuid válido, el cast revienta y
  -- TODA la transacción hace rollback (incluido el DELETE) → el pedido nunca
  -- queda vacío.
  DELETE FROM reebok_order_items WHERE order_id = p_order_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO reebok_order_items (
      order_id, product_id, sku, name, image_url, quantity, unit_price, is_preorder, bulto_pzas
    ) VALUES (
      p_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'sku',
      v_item->>'name',
      v_item->>'image_url',
      COALESCE(NULLIF(v_item->>'quantity', '')::int, 1),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0),
      COALESCE((v_item->>'is_preorder')::boolean, false),
      -- El bulto escrito (lo pone la app; sin él, NULL = la regla vieja).
      NULLIF(v_item->>'bulto_pzas', '')::smallint
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE reebok_orders
    SET total = COALESCE(p_total, 0), updated_at = now()
    WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'item_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION reebok_order_replace_items(uuid, numeric, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION reebok_order_replace_items(uuid, numeric, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION convert_reebok_pedido_publico(
  p_short_id text,
  p_total    numeric,
  p_items    jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pub          reebok_pedidos_publicos%ROWTYPE;
  v_order_id     uuid;
  v_order_number text;
  v_next         int;
  v_item         jsonb;
BEGIN
  -- Lock de la fila pública para serializar conversiones concurrentes del mismo pedido.
  SELECT * INTO v_pub
    FROM reebok_pedidos_publicos
    WHERE short_id = p_short_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido publico % no existe', p_short_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotencia: ya convertida → devolver el PED existente sin crear otro.
  IF COALESCE(v_pub.convertida, false) THEN
    SELECT id INTO v_order_id
      FROM reebok_orders
      WHERE order_number = v_pub.ped_order_number;
    RETURN jsonb_build_object(
      'order_number',      v_pub.ped_order_number,
      'order_id',          v_order_id,
      'already_converted', true
    );
  END IF;

  -- Siguiente PED-### . Advisory lock para evitar carrera en la numeración.
  PERFORM pg_advisory_xact_lock(hashtext('reebok_order_number'));
  SELECT COALESCE(MAX(substring(order_number FROM '^PED-(\d+)$')::int), 0) + 1
    INTO v_next
    FROM reebok_orders
    WHERE order_number ~ '^PED-\d+$';
  v_order_number := 'PED-' || lpad(v_next::text, 3, '0');

  -- Crear el pedido conservando el origen 'link'.
  INSERT INTO reebok_orders (
    order_number, client_name, vendor_name, total, origen_original, origen_short_id
  ) VALUES (
    v_order_number,
    COALESCE(NULLIF(btrim(v_pub.cliente_nombre), ''), 'Sin nombre'),
    NULL,
    COALESCE(p_total, 0),
    'link',
    p_short_id
  )
  RETURNING id INTO v_order_id;

  -- Copiar items. product_id es UUID NOT NULL: si un item viene sin uuid válido,
  -- el cast falla y toda la conversión hace rollback (garantía atómica).
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO reebok_order_items (
      order_id, product_id, sku, name, image_url, quantity, unit_price, is_preorder, bulto_pzas
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'sku',
      v_item->>'name',
      v_item->>'image_url',
      COALESCE(NULLIF(v_item->>'quantity', '')::int, 1),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0),
      COALESCE((v_item->>'is_preorder')::boolean, false),
      -- El bulto escrito (lo pone la app; sin él, NULL = la regla vieja).
      NULLIF(v_item->>'bulto_pzas', '')::smallint
    );
  END LOOP;

  -- Marcar la pública como convertida (idempotencia futura + exclusión de la vista).
  UPDATE reebok_pedidos_publicos
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

REVOKE ALL ON FUNCTION convert_reebok_pedido_publico(text, numeric, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION convert_reebok_pedido_publico(text, numeric, jsonb) TO service_role;

-- ── 3. La vista unificada (Excel de Comprobantes) ───────────────────────────
CREATE OR REPLACE VIEW reebok_pedidos_unificado_vw AS
 SELECT COALESCE(NULLIF(btrim(o.origen_original), ''::text), 'mio'::text) AS origen,
    (o.id)::text AS id_natural,
    COALESCE(NULLIF(btrim(o.client_name), ''::text), 'Sin nombre'::text) AS cliente,
    (o.total)::numeric AS total,
    o.created_at,
    o.vendor_name AS vendor,
    COALESCE(( SELECT json_agg(json_build_object('sku', i.sku, 'name', i.name, 'quantity', i.quantity, 'image_url', i.image_url, 'product_id', i.product_id, 'unit_price', i.unit_price, 'bulto_pzas', i.bulto_pzas) ORDER BY i.created_at, i.id) AS json_agg
           FROM reebok_order_items i
          WHERE (i.order_id = o.id)), '[]'::json) AS items,
    'orders'::text AS fuente,
    ( SELECT pp.confirmado_cliente_at
           FROM reebok_pedidos_publicos pp
          WHERE (pp.short_id = o.origen_short_id)
         LIMIT 1) AS confirmado_cliente_at
   FROM reebok_orders o
  WHERE (o.deleted = false)
UNION ALL
 SELECT 'link'::text AS origen,
    p.short_id AS id_natural,
    COALESCE(NULLIF(btrim(p.cliente_nombre), ''::text), 'Sin nombre'::text) AS cliente,
    p.total,
    p.created_at,
    NULL::text AS vendor,
    COALESCE(( SELECT json_agg(json_build_object('sku', (arr.it ->> 'sku'::text), 'name', (arr.it ->> 'name'::text), 'quantity', (NULLIF((arr.it ->> 'quantity'::text), ''::text))::numeric, 'image_url', (arr.it ->> 'image_url'::text), 'product_id', (arr.it ->> 'product_id'::text), 'unit_price', (NULLIF((arr.it ->> 'unit_price'::text), ''::text))::numeric, 'bulto_pzas', (NULLIF((arr.it ->> 'bulto_pzas'::text), ''::text))::integer) ORDER BY arr.ord) AS json_agg
           FROM jsonb_array_elements(
                CASE
                    WHEN (jsonb_typeof(p.items) = 'array'::text) THEN p.items
                    ELSE '[]'::jsonb
                END) WITH ORDINALITY arr(it, ord)), '[]'::json) AS items,
    'publicos'::text AS fuente,
    p.confirmado_cliente_at
   FROM reebok_pedidos_publicos p
  WHERE ((COALESCE(p.convertida, false) = false) AND (p.deleted = false));

NOTIFY pgrst, 'reload schema';
