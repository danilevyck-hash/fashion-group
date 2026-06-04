-- ═════════════════════════════════════════════════════════════════════════════
-- comision_b2b_detalle — reporte detallado por vendedor (tab Comisiones)
-- ═════════════════════════════════════════════════════════════════════════════
-- Documentos línea-por-línea que comisionan para UN vendedor en el período,
-- aplicando EXACTAMENTE los mismos filtros que comision_b2b_v3 (no duplica regla):
--   • VENTAS: facturas con pct_utilidad>20 (positivas) + Notas de Crédito
--     (negativas), excl. intercompañía/internos, por cartera (f.vendedor).
--   • COBROS: recibos no-retención, excl. contado (TCKCTA)/MFH, por cartera
--     (vendedor_cartera). El API no expone nº de recibo → no se muestra.
-- Devuelve también tasas y totales (= cierre del Excel manual de Daniel).
-- ═════════════════════════════════════════════════════════════════════════════

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

  -- VENTAS (mismos filtros que comision_b2b_v3.ventas)
  SELECT
    jsonb_agg(jsonb_build_object(
      'fecha', f.fecha,
      'cliente', f.cliente,
      'secuencial', f.secuencial,
      'tipo', f.tipo_comprobante,
      'subtotal', CASE WHEN f.tipo_comprobante = 'Nota de Crédito'
                       THEN -ABS(f.subtotal_con_descuento) ELSE ABS(f.subtotal_con_descuento) END,
      'pct_utilidad', f.pct_utilidad
    ) ORDER BY f.fecha, f.secuencial),
    SUM(CASE WHEN f.tipo_comprobante = 'Nota de Crédito'
             THEN -ABS(f.subtotal_con_descuento) ELSE ABS(f.subtotal_con_descuento) END)
  INTO v_ventas, v_ventas_base
  FROM switch_factura_utilidad f
  WHERE f.empresa_key = p_empresa_key
    AND f.fecha BETWEEN v_inicio AND v_fin
    AND f.vendedor = p_vendedor
    AND f.cliente NOT ILIKE '%multi fashion holding%'
    AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
    AND ((f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 20) OR f.tipo_comprobante = 'Nota de Crédito');

  -- COBROS (mismos filtros que comision_b2b_v3.cobros)
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
    AND r.vendedor_cartera = p_vendedor
    AND r.es_retencion = false
    AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
    AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%';

  v_ventas_base := COALESCE(v_ventas_base, 0);
  v_cobros_base := COALESCE(v_cobros_base, 0);

  RETURN jsonb_build_object(
    'empresa_key', p_empresa_key, 'year', p_year, 'mes', p_mes, 'vendedor', p_vendedor,
    'tasa_venta', v_tasa_venta, 'tasa_cobro', v_tasa_cobro,
    'ventas', COALESCE(v_ventas, '[]'::jsonb),
    'cobros', COALESCE(v_cobros, '[]'::jsonb),
    'ventas_base', ROUND(v_ventas_base, 2),
    'cobros_base', ROUND(v_cobros_base, 2),
    'comision_venta', ROUND(v_ventas_base * v_tasa_venta, 2),
    'comision_cobro', ROUND(v_cobros_base * v_tasa_cobro, 2),
    'comision_total', ROUND(v_ventas_base * v_tasa_venta + v_cobros_base * v_tasa_cobro, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_detalle(text, int, int, text) TO service_role;

NOTIFY pgrst, 'reload schema';
