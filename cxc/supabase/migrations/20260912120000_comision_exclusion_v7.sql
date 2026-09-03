-- ═════════════════════════════════════════════════════════════════════════════
-- comision_exclusion + comision_b2b_v7 — «este vendedor NO comisiona por este
-- cliente en esta empresa»
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 Decisión de Daniel (3-sep-2026), textual:
--   «crea configuración en comisiones para desactivar cálculos de clientes»
--   Grano: «cliente vendedor». Aplica a venta y cobro: «correcto, también venta».
--
-- O sea: hay clientes por los que UN vendedor concreto no cobra comisión —ni
-- por lo que les vende ni por lo que les cobra— aunque el cliente sí comisione
-- para cualquier otro vendedor. La regla es por (empresa, cliente, vendedor):
-- si otro vendedor le vende o le cobra al mismo cliente, ese otro sí comisiona.
--
-- Cómo se identifica cada pieza:
--   • Cliente = su CÓDIGO (D-XXX), nunca el nombre. Es la identidad del cliente
--     en todo el sistema (CLAUDE.md, «LA IDENTIDAD DEL CLIENTE ES EL CÓDIGO»).
--     En la VENTA el código no está en switch_factura_utilidad (solo trae el
--     nombre), así que se resuelve por el puente de siempre:
--     switch_facturas.cliente_switch_id → switch_clientes.codigo.
--     En el COBRO switch_recibos.cliente_codigo ya lo trae.
--   • Vendedor = nombre en MAYÚSCULAS y recortado (UPPER(TRIM(…))). La v6 ya
--     recorta (joystep manda «DANIEL LEVY » con espacio) y sin-pago.ts compara
--     en mayúsculas; esta tabla guarda el nombre YA normalizado (CHECK) y los
--     JOIN normalizan el lado de las facturas/recibos con la misma fórmula.
--     ⚠️ Reinaldo tiene DOS usuarios en Active Wear: «REINALDO ESPINOSA» y
--     «REYNALDO ESPINOSA» (medido 3-sep-2026: 20+4 facturas, 25+28 recibos en
--     2026). No hay tabla de alias: la exclusión se carga UNA VEZ POR GRAFÍA,
--     y por eso Active Wear lleva dos filas por cliente.
--
-- SOFT DELETE, NUNCA DELETE. Es historial de decisiones sobre plata: quitar una
-- exclusión es `activa = false` + quién y cuándo. Hay barrido en el repo que
-- prohíbe un DELETE sobre esta tabla. Una fila inactiva NO afecta a nadie.
-- Reactivar = insertar una fila nueva (la unicidad es solo entre ACTIVAS).
--
-- RLS: solo service_role. La app usa el cliente del servidor y la ruta exige
-- rol admin; nadie más ve ni edita esta configuración.
--
-- comision_b2b_v7: función NUEVA (no pisa la v6, misma regla que con la v5).
-- Es la v6 byte a byte (candado que compara) más UN LEFT JOIN a
-- comision_exclusion en los CTE `ventas` y `cobros`, que deja fuera las filas
-- que cruzan con una exclusión ACTIVA. El detalle (comision_b2b_detalle v4)
-- excluye igual, para que el modal liste lo mismo que suma la tabla.
-- rpc.ts pide v7 → cae a v6 → cae a v5, confesando cuál corrió.
--
-- Medido sobre ene–sep 2026 antes de aplicar (v6 vs v7 con las exclusiones de
-- abajo): ver docs/postmortems/ventas-referencia.md, «Clientes que no
-- comisionan». Script: scripts/_medir-comision-exclusiones-v7.mjs.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comision_exclusion (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_key      text NOT NULL,
  -- Código del cliente (D-XXX), en mayúsculas y sin espacios: es la identidad.
  cliente_codigo   text NOT NULL,
  -- Nombre del vendedor tal como aparece en Switch, YA normalizado.
  vendedor         text NOT NULL,
  -- Soft delete. false = ya no aplica; la fila se queda como historial.
  activa           boolean NOT NULL DEFAULT true,
  creado_por       text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  desactivado_por  text,
  desactivado_en   timestamptz,
  CONSTRAINT comision_exclusion_cliente_normalizado
    CHECK (cliente_codigo = UPPER(BTRIM(cliente_codigo)) AND cliente_codigo <> ''),
  CONSTRAINT comision_exclusion_vendedor_normalizado
    CHECK (vendedor = UPPER(BTRIM(vendedor)) AND vendedor <> ''),
  -- Una desactivación se firma: sin quién ni cuándo, no hay soft delete.
  CONSTRAINT comision_exclusion_desactivacion_firmada
    CHECK (activa OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL))
);

-- Única entre ACTIVAS: el mismo (empresa, cliente, vendedor) no puede estar
-- excluido dos veces a la vez, pero sí puede haberse excluido, quitado y vuelto
-- a excluir (tres filas, una activa). Es también el índice que usan los JOIN de
-- las RPC (empresa + cliente + vendedor, solo activas).
CREATE UNIQUE INDEX IF NOT EXISTS comision_exclusion_activa_unica
  ON comision_exclusion (empresa_key, cliente_codigo, vendedor)
  WHERE activa;

ALTER TABLE comision_exclusion ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'comision_exclusion' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON comision_exclusion
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Sin DELETE a propósito: quitar = activa = false.
GRANT SELECT, INSERT, UPDATE ON comision_exclusion TO service_role;

COMMENT ON TABLE comision_exclusion IS
  'Clientes por los que UN vendedor no comisiona (ni venta ni cobro) en UNA empresa. '
  'Daniel, 3-sep-2026: «crea configuración en comisiones para desactivar cálculos de '
  'clientes» — grano «cliente vendedor», «también venta». Soft delete (activa=false), '
  'nunca DELETE: es historial de decisiones sobre plata. La leen comision_b2b_v7 y '
  'comision_b2b_detalle.';
COMMENT ON COLUMN comision_exclusion.vendedor IS
  'UPPER(TRIM(nombre)) del vendedor de Switch. Sin alias: una grafía = una fila.';
COMMENT ON COLUMN comision_exclusion.cliente_codigo IS
  'Código D-XXX del cliente (switch_clientes.codigo / clientes_master.codigo), en mayúsculas.';

-- ─── 2) Las exclusiones iniciales (Daniel, 3-sep-2026) ───────────────────────
-- Códigos verificados contra switch_clientes de cada empresa el 3-sep-2026.
-- Active Wear va con las DOS grafías de Reinaldo (ver cabecera). Sin columna
-- de motivo: Daniel no la pidió y no se guarda lo que no se pide.
INSERT INTO comision_exclusion (empresa_key, cliente_codigo, vendedor, creado_por, creado_en)
VALUES
  ('active_shoes', 'D-84', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_shoes', 'D-103', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_shoes', 'D-145', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_shoes', 'D-104', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_shoes', 'D-115', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-156', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-49', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-98', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-42', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-104', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-50', 'REINALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-156', 'REYNALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-49', 'REYNALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-98', 'REYNALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-42', 'REYNALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-104', 'REYNALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05'),
  ('active_wear', 'D-50', 'REYNALDO ESPINOSA', 'daniel', '2026-09-03 12:00:00-05')
ON CONFLICT (empresa_key, cliente_codigo, vendedor) WHERE activa DO NOTHING;

-- ─── 2b) Reinaldo: 1% de venta y 1% de cobro ─────────────────────────────────
-- 🩸 Daniel (3-sep-2026), textual: «en comisiones me gusta que lo separes, pero
-- cuando lo configures tú, pon a Reinaldo 1 y 1». Medido antes de escribir
-- esto: las dos grafías YA están en 0.01/0.01 desde el 26-ago-2026, así que
-- hoy este UPDATE no toca ninguna fila — queda para que la decisión esté
-- escrita y para que, si alguien la mueve, correr la migración la restituya.
UPDATE comision_vendedor_tasa
SET tasa_venta = 0.0100, tasa_cobro = 0.0100, updated_at = now()
WHERE vendedor_nombre IN ('REINALDO ESPINOSA', 'REYNALDO ESPINOSA')
  AND (tasa_venta IS DISTINCT FROM 0.0100 OR tasa_cobro IS DISTINCT FROM 0.0100);

-- ─── 3) comision_b2b_v7 — la v6 más la exclusión por (empresa, cliente, vendedor)
-- Todo lo que no diga «exclusión» es la v6 tal cual (candado
-- comision-exclusion-v7.test.ts compara los dos cuerpos).
CREATE FUNCTION comision_b2b_v7(p_empresa_key text, p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_inicio date;
  v_fin    date;
  v_rows   jsonb;
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'p_mes inválido: %', p_mes; END IF;
  v_inicio := make_date(p_year, p_mes, 1);
  v_fin    := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH doc_vendedor AS (
    -- Vendedor del documento según switch_facturas. DISTINCT ON por si algún
    -- secuencial se repitiera dentro de la empresa (gana el más reciente).
    -- v7: también trae el CÓDIGO del cliente, por el puente
    -- switch_facturas.cliente_switch_id → switch_clientes.codigo.
    SELECT DISTINCT ON (sf.secuencial)
      sf.secuencial,
      NULLIF(TRIM(sf.vendedor_nombre), '') AS vendedor_factura
      , UPPER(TRIM(sc.codigo)) AS cliente_codigo
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
    WHERE sf.empresa_key = p_empresa_key
      AND sf.fecha >= v_inicio::timestamptz - INTERVAL '2 days'
      AND sf.fecha <  (v_fin + 1)::timestamptz + INTERVAL '2 days'
    ORDER BY sf.secuencial, sf.fecha DESC
  ),
  ventas AS (
    -- IDÉNTICO a v6 salvo la exclusión: un documento cuyo (cliente, vendedor)
    -- está excluido para esta empresa no entra en la base de ESE vendedor.
    -- «correcto, también venta» — Daniel, 3-sep-2026.
    SELECT
      COALESCE(dv.vendedor_factura, f.vendedor) AS vendedor,
      SUM(
        CASE
          WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -ABS(f.subtotal_con_descuento)
          WHEN f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 20 THEN ABS(f.subtotal_con_descuento)
          ELSE 0
        END
      ) AS base
    FROM switch_factura_utilidad f
    LEFT JOIN doc_vendedor dv ON dv.secuencial = f.secuencial
    LEFT JOIN comision_exclusion ce
      ON ce.empresa_key = p_empresa_key
     AND ce.cliente_codigo = dv.cliente_codigo
     AND ce.vendedor = UPPER(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)))
     AND ce.activa = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)), '') <> ''
      AND f.cliente NOT ILIKE '%multi fashion holding%'
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
    GROUP BY COALESCE(dv.vendedor_factura, f.vendedor)
  ),
  cobros AS (
    -- v6: QUIEN REGISTRÓ EL RECIBO (vendedor_registro), no el dueño de cartera.
    -- v7: y si ese (cliente, quien registró) está excluido, el recibo no
    -- comisiona a nadie — otro vendedor que cobre al mismo cliente sí.
    SELECT
      NULLIF(TRIM(r.vendedor_registro), '') AS vendedor,
      SUM(r.total) AS base,
      COUNT(*) AS num_cobros
    FROM switch_recibos r
    LEFT JOIN comision_exclusion ce
      ON ce.empresa_key = p_empresa_key
     AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo))
     AND ce.vendedor = UPPER(TRIM(r.vendedor_registro))
     AND ce.activa = true
    WHERE r.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false
      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
      AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%'
      AND NULLIF(TRIM(r.vendedor_registro), '') IS NOT NULL
    GROUP BY NULLIF(TRIM(r.vendedor_registro), '')
  ),
  universo AS (
    SELECT v.nombre AS vendedor
    FROM vendedores v
    JOIN comision_vendedor_tasa t ON t.vendedor_nombre = v.nombre AND t.activo = true
    WHERE v.empresa_key = p_empresa_key AND v.activo = true
    UNION SELECT vendedor FROM ventas
    UNION SELECT vendedor FROM cobros
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'vendedor', u.vendedor,
      'base', ROUND(COALESCE(vt.base, 0), 2),
      'tasa', COALESCE(t.tasa_venta, 0.0050),
      'comision', ROUND(COALESCE(vt.base, 0) * COALESCE(t.tasa_venta, 0.0050), 2),
      'base_cobro', ROUND(COALESCE(cb.base, 0), 2),
      'tasa_cobro', COALESCE(t.tasa_cobro, 0.0050),
      'comision_cobro', ROUND(COALESCE(cb.base, 0) * COALESCE(t.tasa_cobro, 0.0050), 2),
      -- Suma de componentes YA redondeados (no ROUND de la suma cruda), como v4/v5.
      'comision_total', ROUND(COALESCE(vt.base, 0) * COALESCE(t.tasa_venta, 0.0050), 2)
                      + ROUND(COALESCE(cb.base, 0) * COALESCE(t.tasa_cobro, 0.0050), 2)
    )
    ORDER BY (COALESCE(vt.base, 0) + COALESCE(cb.base, 0)) DESC, u.vendedor ASC
  )
  INTO v_rows
  FROM universo u
  LEFT JOIN ventas vt ON vt.vendedor = u.vendedor
  LEFT JOIN cobros cb ON cb.vendedor = u.vendedor
  LEFT JOIN comision_vendedor_tasa t ON t.vendedor_nombre = u.vendedor;

  RETURN jsonb_build_object(
    'empresa_key', p_empresa_key,
    'year', p_year,
    'mes', p_mes,
    -- Para que la pantalla y los scripts sepan QUÉ regla produjo estas cifras.
    'regla_cobro', 'quien_registro',
    'exclusiones', 'cliente_vendedor',
    'vendedores', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_v7(text, int, int) TO service_role;

COMMENT ON FUNCTION comision_b2b_v7(text, int, int) IS
  'Comisión B2B por empresa y mes = comision_b2b_v6 + exclusiones por (empresa, cliente, '
  'vendedor) de comision_exclusion (activa). Daniel 3-sep-2026: «crea configuración en '
  'comisiones para desactivar cálculos de clientes», «también venta». VENTA: vendedor de '
  'la factura, pct_utilidad > 20, NC restan. COBRO: quien registró el recibo. BASE DE '
  'COBRO: excluye retenciones (es_retencion = false), mostrador (TCKCTA) e intercompañía. '
  'Candados: comision-exclusion-v7.test.ts · comision-cobro-sin-retenciones.test.ts';

-- ─── 4) comision_b2b_detalle v4 — el modal excluye lo MISMO que la tabla ─────
-- Regla del detalle (desde v2): el modal lista TODO lo que el resumen suma y su
-- total cierra EXACTO con la fila de la tabla. Si la v7 deja fuera a Kheriddine
-- para Reinaldo y el modal lo siguiera listando, Daniel abriría la fila y vería
-- ventas que la tabla no le paga. Esta DDL y la de v7 van JUNTAS a propósito.
-- Verificación al centavo: RUN_DB_TESTS=1 npx vitest run
--   src/__tests__/integration/comisiones-detalle-rpc.test.ts

CREATE OR REPLACE FUNCTION comision_b2b_detalle(
  p_empresa_key text, p_year int, p_mes int, p_vendedor text
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_inicio date;
  v_fin    date;
  v_ventas jsonb;
  v_cobros jsonb;
  v_ventas_base numeric;
  v_cobros_base numeric;
  v_tasa_venta numeric;
  v_tasa_cobro numeric;
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'p_mes inválido: %', p_mes; END IF;
  v_inicio := make_date(p_year, p_mes, 1);
  v_fin    := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  SELECT t.tasa_venta, t.tasa_cobro INTO v_tasa_venta, v_tasa_cobro
  FROM comision_vendedor_tasa t WHERE t.vendedor_nombre = p_vendedor;
  v_tasa_venta := COALESCE(v_tasa_venta, 0.0050);
  v_tasa_cobro := COALESCE(v_tasa_cobro, 0.0050);

  -- VENTAS — misma atribución, filtros y exclusión que comision_b2b_v7.ventas
  WITH doc_vendedor AS (
    SELECT DISTINCT ON (sf.secuencial)
      sf.secuencial,
      NULLIF(TRIM(sf.vendedor_nombre), '') AS vendedor_factura
      , UPPER(TRIM(sc.codigo)) AS cliente_codigo
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
    WHERE sf.empresa_key = p_empresa_key
      AND sf.fecha >= v_inicio::timestamptz - INTERVAL '2 days'
      AND sf.fecha <  (v_fin + 1)::timestamptz + INTERVAL '2 days'
    ORDER BY sf.secuencial, sf.fecha DESC
  ),
  docs AS (
    SELECT
      f.fecha, f.cliente, f.secuencial, f.tipo_comprobante, f.pct_utilidad,
      CASE
        WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -ABS(f.subtotal_con_descuento)
        WHEN f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 20 THEN ABS(f.subtotal_con_descuento)
        ELSE 0
      END AS aporte
    FROM switch_factura_utilidad f
    LEFT JOIN doc_vendedor dv ON dv.secuencial = f.secuencial
    LEFT JOIN comision_exclusion ce
      ON ce.empresa_key = p_empresa_key
     AND ce.cliente_codigo = dv.cliente_codigo
     AND ce.vendedor = UPPER(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)))
     AND ce.activa = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(dv.vendedor_factura, f.vendedor) = p_vendedor
      AND f.cliente NOT ILIKE '%multi fashion holding%'
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
      AND f.tipo_comprobante IN ('Factura', 'Nota de Crédito')
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'fecha', d.fecha,
      'cliente', d.cliente,
      'secuencial', d.secuencial,
      'tipo', d.tipo_comprobante,
      'subtotal', d.aporte,
      'pct_utilidad', d.pct_utilidad
    ) ORDER BY d.fecha, d.secuencial),
    SUM(d.aporte)
  INTO v_ventas, v_ventas_base
  FROM docs d;

  -- COBROS — v3: los recibos que ESTA persona registró (paridad con
  -- comision_b2b_v7.cobros: mismos filtros, mismo TRIM, misma exclusión).
  SELECT
    jsonb_agg(jsonb_build_object(
      'fecha', r.fecha,
      'cliente', r.cliente_nombre,
      'monto', r.total
    ) ORDER BY r.fecha),
    SUM(r.total)
  INTO v_cobros, v_cobros_base
  FROM switch_recibos r
  LEFT JOIN comision_exclusion ce
    ON ce.empresa_key = p_empresa_key
   AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo))
   AND ce.vendedor = UPPER(TRIM(r.vendedor_registro))
   AND ce.activa = true
  WHERE r.empresa_key = p_empresa_key
    AND ce.id IS NULL
    AND r.fecha BETWEEN v_inicio AND v_fin
    AND NULLIF(TRIM(r.vendedor_registro), '') = p_vendedor
    AND r.es_retencion = false
    AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
    AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%';

  v_ventas_base := COALESCE(v_ventas_base, 0);
  v_cobros_base := COALESCE(v_cobros_base, 0);

  RETURN jsonb_build_object(
    'empresa_key', p_empresa_key, 'year', p_year, 'mes', p_mes, 'vendedor', p_vendedor,
    'regla_cobro', 'quien_registro',
    'exclusiones', 'cliente_vendedor',
    'tasa_venta', v_tasa_venta, 'tasa_cobro', v_tasa_cobro,
    'ventas', COALESCE(v_ventas, '[]'::jsonb),
    'cobros', COALESCE(v_cobros, '[]'::jsonb),
    'ventas_base', ROUND(v_ventas_base, 2),
    'cobros_base', ROUND(v_cobros_base, 2),
    'comision_venta', ROUND(v_ventas_base * v_tasa_venta, 2),
    'comision_cobro', ROUND(v_cobros_base * v_tasa_cobro, 2),
    -- Igual que v7: suma de componentes YA redondeados (paridad al centavo).
    'comision_total', ROUND(v_ventas_base * v_tasa_venta, 2)
                    + ROUND(v_cobros_base * v_tasa_cobro, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_detalle(text, int, int, text) TO service_role;

COMMENT ON FUNCTION comision_b2b_detalle(text, int, int, text) IS
  'Detalle doc-por-doc de comision_b2b_v7 para UN vendedor. Excluye los (cliente, vendedor) '
  'de comision_exclusion (activa) igual que el resumen. COBROS: los recibos que esa persona '
  'REGISTRÓ (switch_recibos.vendedor_registro). BASE DE COBRO: excluye retenciones de ITBMS '
  '(es_retencion = false), el mostrador (TCKCTA) y la intercompañía. Candados: '
  'comision-exclusion-v7.test.ts · comision-cobro-sin-retenciones.test.ts';

NOTIFY pgrst, 'reload schema';
