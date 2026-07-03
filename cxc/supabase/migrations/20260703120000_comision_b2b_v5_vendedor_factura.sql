-- ═════════════════════════════════════════════════════════════════════════════
-- comision_b2b_v5 — VENTAS atribuidas al VENDEDOR DE LA FACTURA (query-time)
-- ═════════════════════════════════════════════════════════════════════════════
-- Igual a v4 salvo UN cambio: el vendedor del componente VENTAS ya no es el
-- dueño de cartera (switch_factura_utilidad.vendedor, que sync-utilidad puebla
-- del maestro de clientes) sino el vendedor del documento en switch_facturas
-- (vendedor_nombre), join por (empresa_key, secuencial). Decisión Daniel 3-jul:
--   - Facturas Y notas de crédito: vendedor propio del documento (la NC usa el
--     vendedor de la NC, no el de la factura original).
--   - Documentos con vendedor "DEFAULT": siguen agrupando en la fila DEFAULT
--     (no comisionan a nadie), igual que hoy.
--   - Retroactivo: al ser query-time la regla nueva aplica a todos los meses
--     sin reescribir un solo dato (switch_factura_utilidad queda intacta).
--   - Fallback: si el doc no existe en switch_facturas (no debería: junio 0
--     sin match) o su vendedor viene vacío, cae al de cartera como antes.
-- COBROS: sin cambio — siguen por vendedor_cartera de switch_recibos, porque
-- ni la tabla ni el API de Switch exponen a qué facturas se aplica cada recibo
-- (verificado en vivo 3-jul: /apifactura/info solo trae formasPago de emisión
-- y saldo; /apirecibo/* y /apifactura/pagos no existen).
-- Función NUEVA (no CREATE OR REPLACE sobre v4): el route apunta a v5 en el
-- mismo deploy; v4 queda intacta como fallback/rollback y se dropea después.

CREATE FUNCTION comision_b2b_v5(p_empresa_key text, p_year int, p_mes int)
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
    SELECT
      -- v5: vendedor del documento; fallback al de cartera si no hay match.
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
    SELECT
      r.vendedor_cartera AS vendedor,
      SUM(r.total) AS base,
      COUNT(*) AS num_cobros
    FROM switch_recibos r
    WHERE r.empresa_key = p_empresa_key
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false
      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
      AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%'
      AND r.vendedor_cartera IS NOT NULL AND TRIM(r.vendedor_cartera) <> ''
    GROUP BY r.vendedor_cartera
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
      -- v4: suma de componentes YA redondeados (no ROUND de la suma cruda).
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
    'vendedores', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_v5(text, int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
