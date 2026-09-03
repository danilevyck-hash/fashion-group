-- ═════════════════════════════════════════════════════════════════════════════
-- comision_b2b_v6 — el COBRO se paga a QUIEN REGISTRÓ EL RECIBO
-- ═════════════════════════════════════════════════════════════════════════════
-- Igual a v5 salvo UN cambio: el vendedor del componente COBROS ya no es el
-- dueño de la cartera del cliente (switch_recibos.vendedor_cartera, que
-- sync-recibos rellena desde el maestro de clientes) sino la persona que
-- registró el recibo en Switch (switch_recibos.vendedor_registro = la columna
-- «Vendedor Recibo» del panel).
--
-- 🩸 Decisión de Daniel (3-sep-2026), textual:
--   «el que vende a veces no es el que cobra. Edwin puede vender 50k a City
--    Mall y Daniel o DEFAULT cobrar esa plata. Los 50k en comisiones en venta
--    va a Edwin y los 50k en cobros irían a DEFAULT por ejemplo»
--
-- O sea: la comisión de VENTA sigue al vendedor de la factura (v5, sin cambio)
-- y la de COBRO sigue a quien cobró. Son dos personas distintas a propósito.
-- La ayuda oficial de Switch lo dice igual: «El vendedor del recibo es quien
-- procesó el pago, mientras que la venta pudo haber sido realizada por otro
-- vendedor» (docs/switch-referencia.md, §«El vendedor del recibo NO es el
-- vendedor de la venta»).
--
-- DEFAULT COBRA. Es el usuario #1 de cada empresa en Switch (la oficina); cuando
-- un recibo se registra con ese usuario, la comisión de cobro le corresponde a
-- esa fila, y se muestra —en 2026 son ~2.869 USD que quedan ahí—. NO se
-- esconde ni se reparte: la pantalla la dibuja como «Oficina (DEFAULT)».
--
-- TRIM en el nombre: joystep registra a «DANIEL LEVY » con un espacio al final
-- (40 recibos en 2026). Sin TRIM saldría como un vendedor distinto de
-- «DANIEL LEVY» y no cruzaría con comision_vendedor_tasa. Mismo trato que ya
-- recibe el vendedor de la factura en el CTE doc_vendedor.
--
-- Lo que NO cambia (medido, no supuesto):
--   • Retenciones fuera (es_retencion = false), mostrador fuera (TCKCTA),
--     intercompañía fuera (Multi Fashion Holding). Los tres filtros son los
--     mismos de v5 y el candado comision-cobro-sin-retenciones.test.ts los
--     vigila en esta función también.
--   • Ventas: CTE idéntico a v5 (vendedor de la factura, pct_utilidad > 20, NC
--     restan, fallback a cartera si el doc no está en switch_facturas).
--   • Redondeo: suma de componentes YA redondeados, como v4/v5.
--   • Solo las 6 del grupo la llaman (EMPRESAS_COMISIONAN). Boston y ACS no.
--
-- Función NUEVA (no CREATE OR REPLACE sobre v5): el código apunta a v6 y cae a
-- v5 mientras esta DDL no corra (rpcConFallbackDeVersion). v5 queda intacta
-- para poder COMPARAR las dos reglas — scripts/_medir-comision-cobro-v6.mjs.
--
-- Medido sobre ene–ago 2026 antes de aplicar (v5 vs v6, solo la parte de
-- cobro): ver docs/postmortems/ventas-referencia.md, «El cobro se paga a quien
-- registró el recibo».
-- ═════════════════════════════════════════════════════════════════════════════

CREATE FUNCTION comision_b2b_v6(p_empresa_key text, p_year int, p_mes int)
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
    -- IDÉNTICO a v5.
    SELECT DISTINCT ON (sf.secuencial)
      sf.secuencial,
      NULLIF(TRIM(sf.vendedor_nombre), '') AS vendedor_factura
    FROM switch_facturas sf
    WHERE sf.empresa_key = p_empresa_key
      AND sf.fecha >= v_inicio::timestamptz - INTERVAL '2 days'
      AND sf.fecha <  (v_fin + 1)::timestamptz + INTERVAL '2 days'
    ORDER BY sf.secuencial, sf.fecha DESC
  ),
  ventas AS (
    -- IDÉNTICO a v5: vendedor del documento; fallback al de cartera si no hay match.
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
    WHERE f.empresa_key = p_empresa_key
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)), '') <> ''
      AND f.cliente NOT ILIKE '%multi fashion holding%'
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
    GROUP BY COALESCE(dv.vendedor_factura, f.vendedor)
  ),
  cobros AS (
    -- v6: QUIEN REGISTRÓ EL RECIBO (vendedor_registro), no el dueño de cartera.
    -- Un recibo sin usuario registrador no comisiona a nadie (en 2026 no hay
    -- ninguno: medido 0 de 1.615). Se agrupa por el nombre recortado.
    SELECT
      NULLIF(TRIM(r.vendedor_registro), '') AS vendedor,
      SUM(r.total) AS base,
      COUNT(*) AS num_cobros
    FROM switch_recibos r
    WHERE r.empresa_key = p_empresa_key
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
    'vendedores', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_v6(text, int, int) TO service_role;

COMMENT ON FUNCTION comision_b2b_v6(text, int, int) IS
  'Comisión B2B por empresa y mes. VENTA: vendedor de la factura (switch_facturas), '
  'facturas con pct_utilidad > 20 y NC restan. COBRO: QUIEN REGISTRÓ EL RECIBO '
  '(switch_recibos.vendedor_registro) — decisión de Daniel 3-sep-2026: «el que vende a '
  'veces no es el que cobra». BASE DE COBRO: excluye retenciones de ITBMS '
  '(es_retencion = false), el mostrador (TCKCTA) y la intercompañía (Multi Fashion '
  'Holding). Candados: comision-cobro-sin-retenciones.test.ts · '
  'comision-cobro-quien-registro.test.ts';

-- ─────────────────────────────────────────────────────────────────────────────
-- comision_b2b_detalle v3 — el modal doc-por-doc lista los MISMOS cobros que v6
-- ─────────────────────────────────────────────────────────────────────────────
-- Regla del detalle (desde v2): el modal lista TODO lo que el resumen suma y su
-- total cierra EXACTO con la fila de la tabla. Si el resumen atribuye el cobro
-- a quien registró el recibo y el modal siguiera filtrando por cartera, Daniel
-- abriría la fila de Edwin y vería cobros que la tabla no le paga. Por eso el
-- componente COBROS pasa a `TRIM(vendedor_registro) = p_vendedor`. VENTAS no
-- cambia (ya iba por vendedor de factura desde v2).
--
-- CREATE OR REPLACE con la misma firma → /api/ventas/comisiones/detalle no
-- cambia. Esta DDL y la de v6 van JUNTAS en el mismo archivo a propósito: el
-- resumen y el detalle cambian de regla en la misma corrida, nunca uno solo.
-- Verificación al centavo: RUN_DB_TESTS=1 npx vitest run
--   src/__tests__/integration/comisiones-detalle-rpc.test.ts
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- VENTAS — misma atribución y filtros que comision_b2b_v6.ventas (= v5)
  WITH doc_vendedor AS (
    SELECT DISTINCT ON (sf.secuencial)
      sf.secuencial,
      NULLIF(TRIM(sf.vendedor_nombre), '') AS vendedor_factura
    FROM switch_facturas sf
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
    WHERE f.empresa_key = p_empresa_key
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
  -- comision_b2b_v6.cobros: mismos filtros, mismo TRIM).
  SELECT
    jsonb_agg(jsonb_build_object(
      'fecha', r.fecha,
      'cliente', r.cliente_nombre,
      'monto', r.total
    ) ORDER BY r.fecha),
    SUM(r.total)
  INTO v_cobros, v_cobros_base
  FROM switch_recibos r
  WHERE r.empresa_key = p_empresa_key
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
    'tasa_venta', v_tasa_venta, 'tasa_cobro', v_tasa_cobro,
    'ventas', COALESCE(v_ventas, '[]'::jsonb),
    'cobros', COALESCE(v_cobros, '[]'::jsonb),
    'ventas_base', ROUND(v_ventas_base, 2),
    'cobros_base', ROUND(v_cobros_base, 2),
    'comision_venta', ROUND(v_ventas_base * v_tasa_venta, 2),
    'comision_cobro', ROUND(v_cobros_base * v_tasa_cobro, 2),
    -- Igual que v6: suma de componentes YA redondeados (paridad al centavo).
    'comision_total', ROUND(v_ventas_base * v_tasa_venta, 2)
                    + ROUND(v_cobros_base * v_tasa_cobro, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_detalle(text, int, int, text) TO service_role;

COMMENT ON FUNCTION comision_b2b_detalle(text, int, int, text) IS
  'Detalle doc-por-doc de comision_b2b_v6 para UN vendedor. COBROS: los recibos que '
  'esa persona REGISTRÓ (switch_recibos.vendedor_registro), decisión de Daniel '
  '3-sep-2026. BASE DE COBRO: excluye retenciones de ITBMS (es_retencion = false), el '
  'mostrador (TCKCTA) y la intercompañía. Candado: comision-cobro-sin-retenciones.test.ts';

NOTIFY pgrst, 'reload schema';
