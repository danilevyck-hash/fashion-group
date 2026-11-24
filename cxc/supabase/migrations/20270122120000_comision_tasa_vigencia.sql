-- ═════════════════════════════════════════════════════════════════════════════
-- LA TASA DE COMISIÓN PUEDE SER POR EMPRESA Y CON FECHA (24-nov-2026).
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel: a Reynaldo Espinosa la comisión le baja de 1 % venta / 1 % cobro a
-- 0,5 % / 0,5 % SOLO en Active Shoes y Active Wear, A PARTIR DEL 1-nov-2026. En
-- Fashion Wear, Fashion Shoes, Vistana y Joystep sigue al 1 %; y hasta octubre
-- de 2026, 1 % en todas.
--
-- 🩸 `comision_vendedor_tasa` tiene UNA tasa por vendedor, global y sin fecha:
-- un UPDATE recalcula TODOS los meses de TODAS las empresas hacia atrás.
--
-- Diseño mínimo, aditivo:
--   • `comision_vendedor_tasa` NO se toca: sigue siendo la tasa general (la que
--     muestra y guarda Comisiones › Configuración › «Tasas por vendedor»).
--   • `comision_vendedor_tasa_excepcion` (vendedor, empresa, vigente_desde,
--     tasas): «en ESTA empresa, desde ESTE mes, esta persona cobra esto».
--   • `comision_tasa_vigente(vendedor, empresa, fecha)`: la excepción más
--     reciente de esa empresa con `vigente_desde <= fecha`; sin ninguna, la tasa
--     general. Sin fila en ningún lado, las RPC siguen cayendo al 0,5 % de
--     siempre (su COALESCE).
--   • comision_b2b_v10 y comision_b2b_detalle = las de 20261111130000 BYTE A
--     BYTE salvo de dónde sale la tasa (y la marca `tasa_por_empresa_y_fecha`).
--     La empresa es la del cálculo: la de la factura para la venta y la del
--     RECIBO para el cobro (las dos son p_empresa_key).
--
-- ponytail: la vigencia es POR MES (CHECK: `vigente_desde` es día 1), porque la
-- comisión se calcula y se redondea por mes. Un cambio a mitad de mes pediría
-- tasa por documento y otro redondeo; no se pidió. Un cambio con fecha para
-- TODAS las empresas = una fila por empresa.
--
-- ⚠️ Las v9…v5 (la red de `rpc.ts`) NO miran las excepciones: si la v10 dejara
-- de existir, Reynaldo saldría al 1 % también en Active Shoes y Active Wear.
--
-- Filas que toca: 2 INSERT en comision_vendedor_tasa_excepcion. Ninguna fila
-- existente cambia. Candado: comision-tasa-vigencia.test.ts.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) Las excepciones ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comision_vendedor_tasa_excepcion (
  vendedor_nombre text NOT NULL,           -- el CANÓNICO, igual que en comision_vendedor_tasa
  empresa_key     text NOT NULL,
  vigente_desde   date NOT NULL,           -- día 1 del primer mes en que rige
  tasa_venta      numeric(6,4) NOT NULL,
  tasa_cobro      numeric(6,4) NOT NULL,
  creado_por      text NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendedor_nombre, empresa_key, vigente_desde),
  CONSTRAINT comision_tasa_excepcion_dia_uno
    CHECK (vigente_desde = date_trunc('month', vigente_desde)::date),
  CONSTRAINT comision_tasa_excepcion_tasas_validas
    CHECK (tasa_venta BETWEEN 0 AND 1 AND tasa_cobro BETWEEN 0 AND 1)
);

ALTER TABLE comision_vendedor_tasa_excepcion ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'comision_vendedor_tasa_excepcion' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON comision_vendedor_tasa_excepcion
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Sin UPDATE ni DELETE a propósito: para cambiarla se agrega otra fila con su fecha.
GRANT SELECT, INSERT ON comision_vendedor_tasa_excepcion TO service_role;

COMMENT ON TABLE comision_vendedor_tasa_excepcion IS
  'Tasa de comisión de un vendedor en UNA empresa desde un mes (vigente_desde, día 1). Le gana a la '
  'tasa general de comision_vendedor_tasa. La lee comision_tasa_vigente(vendedor, empresa, fecha), '
  'que usan comision_b2b_v10, comision_b2b_detalle y «Buscar cliente». Sin UPDATE ni DELETE.';

-- ─── 2) La tasa que rige: UNA función para todos ─────────────────────────────
CREATE OR REPLACE FUNCTION comision_tasa_vigente(p_vendedor text, p_empresa_key text, p_fecha date)
RETURNS TABLE (tasa_venta numeric, tasa_cobro numeric) LANGUAGE sql STABLE AS $$
  SELECT x.tasa_venta, x.tasa_cobro
  FROM (
    SELECT e.tasa_venta, e.tasa_cobro, e.vigente_desde
      FROM comision_vendedor_tasa_excepcion e
     WHERE e.vendedor_nombre = p_vendedor AND e.empresa_key = p_empresa_key AND e.vigente_desde <= p_fecha
    UNION ALL
    SELECT t.tasa_venta, t.tasa_cobro, '-infinity'::date
      FROM comision_vendedor_tasa t
     WHERE t.vendedor_nombre = p_vendedor
  ) x
  ORDER BY x.vigente_desde DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION comision_tasa_vigente(text, text, date) TO service_role;

COMMENT ON FUNCTION comision_tasa_vigente(text, text, date) IS
  'Tasa de venta y de cobro de un vendedor (canónico) en una empresa y una fecha: la excepción más '
  'reciente de esa empresa con vigente_desde <= fecha; si no hay, la tasa general '
  '(comision_vendedor_tasa). Cero filas = sin tasa propia.';

-- ─── 3) comision_b2b_v10 — la misma, con la tasa de la EMPRESA y el MES ──────
CREATE OR REPLACE FUNCTION comision_b2b_v10(p_empresa_key text, p_year int, p_mes int)
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
    -- v8: el vendedor pasa por el alias (una persona, una fila).
    SELECT DISTINCT ON (sf.secuencial)
      sf.secuencial,
      COALESCE(cfv.vendedor, comision_vendedor_canonico(sf.vendedor_nombre)) AS vendedor_factura
      , UPPER(TRIM(sc.codigo)) AS cliente_codigo
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
    LEFT JOIN comision_factura_vendedor cfv ON cfv.empresa_key = sf.empresa_key AND cfv.switch_factura_id = sf.switch_factura_id AND cfv.activa = true
    WHERE sf.empresa_key = p_empresa_key
      AND sf.fecha >= v_inicio::timestamptz - INTERVAL '2 days'
      AND sf.fecha <  (v_fin + 1)::timestamptz + INTERVAL '2 days'
    ORDER BY sf.secuencial, sf.fecha DESC
  ),
  ventas AS (
    -- IDÉNTICO a v7 salvo el alias y la casilla: un documento cuyo (cliente,
    -- vendedor) está excluido PARA LA VENTA no entra en la base de ESE vendedor.
    -- «correcto, también venta» — Daniel, 3-sep-2026.
    SELECT
      COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) AS vendedor,
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
     AND (ce.vendedor = '*' OR ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))))
     AND ce.activa = true
     AND ce.excluye_venta = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) IS NOT NULL
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
    GROUP BY COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))
  ),
  cobros AS (
    -- v6: QUIEN REGISTRÓ EL RECIBO (vendedor_registro), no el dueño de cartera.
    -- v7: y si ese (cliente, quien registró) está excluido, el recibo no
    -- comisiona a nadie — otro vendedor que cobre al mismo cliente sí.
    -- v8: quien registró pasa por el alias, y la exclusión solo aplica si tiene
    -- la casilla de COBRO marcada.
    SELECT
      comision_vendedor_canonico(r.vendedor_registro) AS vendedor,
      SUM(r.total) AS base,
      COUNT(*) AS num_cobros
    FROM switch_recibos r
    LEFT JOIN comision_exclusion ce
      ON ce.empresa_key = p_empresa_key
     AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo))
     AND (ce.vendedor = '*' OR ce.vendedor = UPPER(comision_vendedor_canonico(r.vendedor_registro)))
     AND ce.activa = true
     AND ce.excluye_cobro = true
    WHERE r.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false
      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
      AND comision_vendedor_canonico(r.vendedor_registro) IS NOT NULL
    GROUP BY comision_vendedor_canonico(r.vendedor_registro)
  ),
  universo AS (
    SELECT comision_vendedor_canonico(v.nombre) AS vendedor
    FROM vendedores v
    JOIN comision_vendedor_tasa t ON t.vendedor_nombre = comision_vendedor_canonico(v.nombre) AND t.activo = true
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
  LEFT JOIN LATERAL comision_tasa_vigente(u.vendedor, p_empresa_key, v_inicio) t ON true;

  RETURN jsonb_build_object(
    'empresa_key', p_empresa_key,
    'year', p_year,
    'mes', p_mes,
    -- Para que la pantalla y los scripts sepan QUÉ regla produjo estas cifras.
    'regla_cobro', 'quien_registro',
    'exclusiones', 'cliente_vendedor_o_todos',
    'alias', 'canonico',
    'vendedor_por_factura', 'aplicado',
    'tasa_por_empresa_y_fecha', 'aplicado',
    'vendedores', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION comision_b2b_v10(text, int, int) TO service_role;

-- ─── 4) El detalle mira lo MISMO (paridad tabla ↔ modal) ────────────────────
CREATE OR REPLACE FUNCTION comision_b2b_detalle(
  p_empresa_key text, p_year int, p_mes int, p_vendedor text
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_inicio date;
  v_fin    date;
  v_vendedor text;
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
  v_vendedor := comision_vendedor_canonico(p_vendedor);

  SELECT t.tasa_venta, t.tasa_cobro INTO v_tasa_venta, v_tasa_cobro
  FROM comision_tasa_vigente(v_vendedor, p_empresa_key, v_inicio) t;
  v_tasa_venta := COALESCE(v_tasa_venta, 0.0050);
  v_tasa_cobro := COALESCE(v_tasa_cobro, 0.0050);

  -- VENTAS — misma atribución, filtros, alias y exclusión que comision_b2b_v8.ventas
  WITH doc_vendedor AS (
    SELECT DISTINCT ON (sf.secuencial)
      sf.secuencial,
      COALESCE(cfv.vendedor, comision_vendedor_canonico(sf.vendedor_nombre)) AS vendedor_factura
      , UPPER(TRIM(sc.codigo)) AS cliente_codigo
      , sf.switch_factura_id
      , CASE WHEN cfv.vendedor IS NOT NULL THEN comision_vendedor_canonico(sf.vendedor_nombre) END AS vendedor_switch
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
    LEFT JOIN comision_factura_vendedor cfv ON cfv.empresa_key = sf.empresa_key AND cfv.switch_factura_id = sf.switch_factura_id AND cfv.activa = true
    WHERE sf.empresa_key = p_empresa_key
      AND sf.fecha >= v_inicio::timestamptz - INTERVAL '2 days'
      AND sf.fecha <  (v_fin + 1)::timestamptz + INTERVAL '2 days'
    ORDER BY sf.secuencial, sf.fecha DESC
  ),
  docs AS (
    SELECT
      f.fecha, f.cliente, f.secuencial, f.tipo_comprobante, f.pct_utilidad,
      dv.switch_factura_id, dv.vendedor_switch,
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
     AND (ce.vendedor = '*' OR ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))))
     AND ce.activa = true
     AND ce.excluye_venta = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) = v_vendedor
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
      'pct_utilidad', d.pct_utilidad,
      'switch_factura_id', d.switch_factura_id,
      'vendedor_switch', d.vendedor_switch
    ) ORDER BY d.fecha, d.secuencial),
    SUM(d.aporte)
  INTO v_ventas, v_ventas_base
  FROM docs d;

  -- COBROS — los recibos que ESTA persona registró, con cualquiera de sus
  -- grafías (paridad con comision_b2b_v8.cobros: mismos filtros, mismo alias,
  -- misma casilla de cobro).
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
   AND (ce.vendedor = '*' OR ce.vendedor = UPPER(comision_vendedor_canonico(r.vendedor_registro)))
   AND ce.activa = true
   AND ce.excluye_cobro = true
  WHERE r.empresa_key = p_empresa_key
    AND ce.id IS NULL
    AND r.fecha BETWEEN v_inicio AND v_fin
    AND comision_vendedor_canonico(r.vendedor_registro) = v_vendedor
    AND r.es_retencion = false
    AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA';

  v_ventas_base := COALESCE(v_ventas_base, 0);
  v_cobros_base := COALESCE(v_cobros_base, 0);

  RETURN jsonb_build_object(
    'empresa_key', p_empresa_key, 'year', p_year, 'mes', p_mes, 'vendedor', v_vendedor,
    'regla_cobro', 'quien_registro',
    'exclusiones', 'cliente_vendedor_o_todos',
    'alias', 'canonico',
    'vendedor_por_factura', 'aplicado',
    'tasa_por_empresa_y_fecha', 'aplicado',
    'tasa_venta', v_tasa_venta, 'tasa_cobro', v_tasa_cobro,
    'ventas', COALESCE(v_ventas, '[]'::jsonb),
    'cobros', COALESCE(v_cobros, '[]'::jsonb),
    'ventas_base', ROUND(v_ventas_base, 2),
    'cobros_base', ROUND(v_cobros_base, 2),
    'comision_venta', ROUND(v_ventas_base * v_tasa_venta, 2),
    'comision_cobro', ROUND(v_cobros_base * v_tasa_cobro, 2),
    -- Igual que v8: suma de componentes YA redondeados (paridad al centavo).
    'comision_total', ROUND(v_ventas_base * v_tasa_venta, 2)
                    + ROUND(v_cobros_base * v_tasa_cobro, 2)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION comision_b2b_detalle(text, int, int, text) TO service_role;

-- ─── 5) Reynaldo Espinosa: 0,5 % en Active Shoes y Active Wear desde nov-2026 ─
-- Su tasa general (1 % / 1 %) NO se toca. Correr esto dos veces no hace nada.
INSERT INTO comision_vendedor_tasa_excepcion (vendedor_nombre, empresa_key, vigente_desde, tasa_venta, tasa_cobro, creado_por)
VALUES
  ('REYNALDO ESPINOSA', 'active_shoes', DATE '2026-11-01', 0.0050, 0.0050, 'daniel'),
  ('REYNALDO ESPINOSA', 'active_wear',  DATE '2026-11-01', 0.0050, 0.0050, 'daniel')
ON CONFLICT (vendedor_nombre, empresa_key, vigente_desde) DO NOTHING;

NOTIFY pgrst, 'reload schema';
