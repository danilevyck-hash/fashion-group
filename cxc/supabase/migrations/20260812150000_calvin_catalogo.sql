-- ─────────────────────────────────────────────────────────────────────────────
-- 20260812150000_calvin_catalogo.sql
-- Catalogo CALVIN KLEIN (empresa Switch vistana, articulos marcaId 8 =
-- CK FOOTWEAR) — cuarta marca sobre el motor generalizado de catalogos.
-- Modelo = Tommy Hilfiger (paridad exacta), consolidando en UNA migracion lo
-- que Tommy acumulo en 20260724150000 + 20260806120000 (bulto_pzas):
--   * calvin_products        — catalogo (sync desde Switch por existencia).
--       category + gender PARSEADOS de la descripcion de Switch
--       ("Women-Sandals", "Boys-Flip Flops" — medido 12-ago-2026: 13 valores,
--       mismo vocabulario que Tommy), nombre_manual (si true el sync NO pisa
--       name — patron oculto_manual) y bulto_pzas (NULL = 12, el default de la
--       marca; se marca a mano en administrar, igual que Tommy — medido:
--       cantidadPorCaja viene 0.0000 en los 616 articulos).
--   * calvin_orders + calvin_order_items — pedidos internos (numeracion CKP-###;
--       PED/JBP/TOM ya estan tomados por las otras marcas).
--   * calvin_pedidos_publicos — pedidos del link publico (RLS SOLO service_role,
--       ip_hash de rate-limit, confirmado_cliente_at).
--   * calvin_switch_envios   — envios a Switch (at-most-once, indice parcial).
--   * RPCs calvin_create_order / calvin_order_replace_items /
--       convert_calvin_pedido_publico (prefijo CKP-).
--   * vista calvin_pedidos_unificado_vw (Mios + Del link + confirmado_cliente_at).
--   * CHECK de switch_sync_log.sync_type REESCRITO con 'catalogo_calvin' —
--       leccion del 6-ago (articulo_marca): sin el CHECK el logger es degradable
--       y la corrida queda INVISIBLE. La lista tiene que quedar IDENTICA a
--       SYNC_LOG_TYPES (src/lib/switch-api/sync-log-tipos.ts); el candado
--       sync-log-tipos-check.test.ts compara las dos.
--
-- SEGURIDAD: TODAS las tablas nuevas con RLS + SOLO service_role (no repetir el
-- USING true de anon que causo la fuga de reebok_orders; auditoria 4-jul).
--
-- Migracion ADITIVA (solo objetos nuevos + el CHECK reescrito). El codigo
-- deployado es TOLERANTE mientras esta DDL no corra: el cron calvin-catalogo se
-- omite limpio SIN tocar Switch y las pantallas Calvin fallan limpio (500/503)
-- sin tocar Reebok/Joybees/Tommy. Aplicar manual en Supabase Dashboard → SQL
-- Editor (proyecto principal). Evitar las ventanas 05:30-07:35 y 23:50-00:20 UTC.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Catalogo de productos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calvin_products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku            text UNIQUE NOT NULL,
  name           text NOT NULL,
  -- category/gender: slugs parseados de la descripcion de Switch
  -- (sneakers | flip_flops | sandals | shoes | slippers | boots | otros;
  --  women | men | boys | girls). 'otros' = descripcion no parseable.
  category       text NOT NULL DEFAULT 'otros',
  gender         text,
  price          numeric(10,2) NOT NULL DEFAULT 0,
  -- stock espejo de existencia (patron Joybees/Tommy: el catalogo publico lee stock).
  stock          int NOT NULL DEFAULT 0,
  existencia     int,
  disponibilidad int,
  keep_visible   boolean,
  image_url      text,
  active         boolean NOT NULL DEFAULT true,
  badge          text,
  -- true = el admin edito el nombre a mano y el sync NO lo pisa (patron
  -- oculto_manual). false = el sync re-deriva el nombre en cada corrida.
  nombre_manual  boolean NOT NULL DEFAULT false,
  oculto_manual  boolean NOT NULL DEFAULT false,
  -- Piezas por bulto de ESTE estilo. NULL = 12 (default de toda la marca).
  -- Igual que Tommy: el dato no existe en ninguna fuente de Switch (medido
  -- 12-ago-2026: cantidadPorCaja 0.0000 en los 616), se marca a mano.
  bulto_pzas     smallint,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DO $bulto$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calvin_products_bulto_pzas_rango'
  ) THEN
    ALTER TABLE calvin_products
      ADD CONSTRAINT calvin_products_bulto_pzas_rango
      CHECK (bulto_pzas IS NULL OR (bulto_pzas >= 1 AND bulto_pzas <= 99));
  END IF;
END
$bulto$;

COMMENT ON COLUMN calvin_products.nombre_manual IS
  'true = nombre editado a mano en el admin; el sync de catalogo no lo sobreescribe. Patron oculto_manual.';
COMMENT ON COLUMN calvin_products.oculto_manual IS
  'Toggle admin Ocultar del catalogo: true = oculto siempre (el sync lo respeta y mantiene active=false). Reversible.';
COMMENT ON COLUMN calvin_products.bulto_pzas IS
  'Piezas por bulto de ESTE estilo. NULL = 12 (el default de toda la marca). Se marca a mano desde administrar catalogo; el sync lo llena solo si Switch trae cantidadPorCaja > 0.';

ALTER TABLE calvin_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON calvin_products;
CREATE POLICY service_role_all ON calvin_products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Pedidos internos ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calvin_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number       text UNIQUE NOT NULL,
  client_name        text NOT NULL,
  vendor_name        text,
  client_email       text,
  comment            text,
  total              numeric(10,2) DEFAULT 0,
  status             text NOT NULL DEFAULT 'borrador',
  idempotency_key    text,
  -- Origen real conservado (mio = presencial, link = convertido del publico).
  origen_original    text NOT NULL DEFAULT 'mio',
  origen_short_id    text,
  -- Cliente/vendedor de Switch elegidos en el checkout (para el envio).
  cliente_switch_id  int,
  vendedor_switch_id int,
  -- Soft-delete (borrado VISUAL; Switch no permite borrar).
  deleted            boolean NOT NULL DEFAULT false,
  deleted_at         timestamptz,
  -- Trazabilidad de "Duplicar y corregir" (pedidos enviados no editables).
  reemplaza_a        uuid REFERENCES calvin_orders(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calvin_orders
  DROP CONSTRAINT IF EXISTS calvin_orders_origen_original_chk;
ALTER TABLE calvin_orders
  ADD CONSTRAINT calvin_orders_origen_original_chk
  CHECK (origen_original IN ('mio', 'link'));

CREATE TABLE IF NOT EXISTS calvin_order_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid REFERENCES calvin_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  sku        text,
  name       text,
  image_url  text,
  quantity   integer DEFAULT 1,
  unit_price numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calvin_order_items_unique_item
  ON calvin_order_items (order_id, product_id);

CREATE UNIQUE INDEX IF NOT EXISTS calvin_orders_idempotency_key_uidx
  ON calvin_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS calvin_orders_reemplaza_a_idx
  ON calvin_orders (reemplaza_a)
  WHERE reemplaza_a IS NOT NULL;

ALTER TABLE calvin_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE calvin_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON calvin_orders;
DROP POLICY IF EXISTS service_role_all ON calvin_order_items;
CREATE POLICY service_role_all ON calvin_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON calvin_order_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. Pedidos publicos (del link) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calvin_pedidos_publicos (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  short_id              text UNIQUE NOT NULL,
  items                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  total                 numeric NOT NULL DEFAULT 0,
  cliente_nombre        text,
  ip_hash               text,
  convertida            boolean NOT NULL DEFAULT false,
  ped_order_number      text,
  convertida_at         timestamptz,
  deleted               boolean NOT NULL DEFAULT false,
  deleted_at            timestamptz,
  confirmado_cliente_at timestamptz,
  confirmado_ip_hash    text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calvin_pedidos_publicos_confirm_ip
  ON calvin_pedidos_publicos (confirmado_ip_hash, confirmado_cliente_at DESC);

ALTER TABLE calvin_pedidos_publicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON calvin_pedidos_publicos;
CREATE POLICY service_role_all ON calvin_pedidos_publicos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. Envios a Switch (at-most-once) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS calvin_switch_envios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES calvin_orders(id) ON DELETE RESTRICT,
  estado           text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'enviado', 'verificado', 'error')),
  payload          jsonb NOT NULL,
  pedido_switch_id bigint,
  numero_interno   text,
  error_detalle    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Solo un envio no-fallido por pedido (el estado error libera el candado).
CREATE UNIQUE INDEX IF NOT EXISTS calvin_switch_envios_order_activo
  ON calvin_switch_envios (order_id)
  WHERE estado <> 'error';

ALTER TABLE calvin_switch_envios ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo service_role.

-- ── 5. RPC: creacion atomica e idempotente (numera CKP-### sin race) ────────
CREATE OR REPLACE FUNCTION calvin_create_order(
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
  PERFORM pg_advisory_xact_lock(hashtext('calvin_order_number'));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, order_number INTO v_order_id, v_order_number
      FROM calvin_orders WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_id', v_order_id, 'order_number', v_order_number, 'already_created', true
      );
    END IF;
  END IF;

  SELECT COALESCE(MAX(substring(order_number FROM '^CKP-(\d+)$')::int), 0) + 1
    INTO v_next
    FROM calvin_orders
    WHERE order_number ~ '^CKP-\d+$';
  v_order_number := 'CKP-' || lpad(v_next::text, 3, '0');

  INSERT INTO calvin_orders (
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

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO calvin_order_items (
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

  RETURN jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'already_created', false
  );
END;
$$;

REVOKE ALL ON FUNCTION calvin_create_order(text, text, text, numeric, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION calvin_create_order(text, text, text, numeric, text, jsonb) TO service_role;

-- ── 6. RPC: reemplazo atomico de items + total ──────────────────────────────
CREATE OR REPLACE FUNCTION calvin_order_replace_items(
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
  PERFORM 1 FROM calvin_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no existe', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM calvin_order_items WHERE order_id = p_order_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO calvin_order_items (
      order_id, product_id, sku, name, image_url, quantity, unit_price
    ) VALUES (
      p_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'sku',
      v_item->>'name',
      v_item->>'image_url',
      COALESCE(NULLIF(v_item->>'quantity', '')::int, 1),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0)
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE calvin_orders
    SET total = COALESCE(p_total, 0), updated_at = now()
    WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'item_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION calvin_order_replace_items(uuid, numeric, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION calvin_order_replace_items(uuid, numeric, jsonb) TO service_role;

-- ── 7. RPC atomica de conversion: publico (link) → calvin_orders ────────────
-- Espejo de convert_tommy_pedido_publico con prefijo CKP-. IDEMPOTENTE: si ya
-- esta convertida devuelve el CKP-### existente. El TOTAL lo calcula el
-- endpoint en JS (bulto por producto, default 12) y lo pasa en p_total; la RPC
-- no recalcula.
CREATE OR REPLACE FUNCTION convert_calvin_pedido_publico(
  p_short_id text,
  p_total    numeric,
  p_items    jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pub          calvin_pedidos_publicos%ROWTYPE;
  v_order_id     uuid;
  v_order_number text;
  v_next         int;
  v_item         jsonb;
BEGIN
  SELECT * INTO v_pub
    FROM calvin_pedidos_publicos
    WHERE short_id = p_short_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido publico % no existe', p_short_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF COALESCE(v_pub.convertida, false) THEN
    SELECT id INTO v_order_id
      FROM calvin_orders
      WHERE order_number = v_pub.ped_order_number;
    RETURN jsonb_build_object(
      'order_number',      v_pub.ped_order_number,
      'order_id',          v_order_id,
      'already_converted', true
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('calvin_order_number'));
  SELECT COALESCE(MAX(substring(order_number FROM '^CKP-(\d+)$')::int), 0) + 1
    INTO v_next
    FROM calvin_orders
    WHERE order_number ~ '^CKP-\d+$';
  v_order_number := 'CKP-' || lpad(v_next::text, 3, '0');

  INSERT INTO calvin_orders (
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

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO calvin_order_items (
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

  UPDATE calvin_pedidos_publicos
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

REVOKE ALL ON FUNCTION convert_calvin_pedido_publico(text, numeric, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION convert_calvin_pedido_publico(text, numeric, jsonb) TO service_role;

-- ── 8. Vista unificada (Mios + Del link) ────────────────────────────────────
CREATE OR REPLACE VIEW calvin_pedidos_unificado_vw AS
  -- ── calvin_orders (presenciales 'mio' + publicas convertidas 'link') ──
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
      FROM calvin_order_items i
      WHERE i.order_id = o.id
    ), '[]'::json)                                           AS items,
    'orders'::text                                           AS fuente,
    (
      SELECT pp.confirmado_cliente_at
      FROM calvin_pedidos_publicos pp
      WHERE pp.short_id = o.origen_short_id
      LIMIT 1
    )                                                        AS confirmado_cliente_at
  FROM calvin_orders o
  WHERE o.deleted = false

  UNION ALL

  -- ── calvin_pedidos_publicos NO convertidas y NO borradas ('link') ──
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
  FROM calvin_pedidos_publicos p
  WHERE COALESCE(p.convertida, false) = false
    AND p.deleted = false;

GRANT SELECT ON calvin_pedidos_unificado_vw TO service_role;

-- ── 9. sync_type 'catalogo_calvin' (un CHECK no se extiende: se reescribe entero)
-- Sin esto el cron corre INVISIBLE: el INSERT viola el CHECK, el logger se traga
-- el error y la corrida no deja fila — ni racha para la politica anti-ruido, ni
-- lock anti-solape (leccion catalogo_tommy y articulo_marca).

ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;

ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN (
    'facturas',
    'estadocuenta',
    'costo',
    'utilidad',
    'recibos',
    'proveedores',
    'articulos',
    'articulo_marca',
    'articulo_info',
    'multifashion',
    'catalogo_reebok',
    'catalogo_joybees',
    'catalogo_tommy',
    'catalogo_calvin',
    'mayor'
  ));

-- ── Verificacion (correr despues; debe listar catalogo_calvin) ──────────────
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname = 'switch_sync_log_sync_type_check';

NOTIFY pgrst, 'reload schema';
