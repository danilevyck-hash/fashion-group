-- ═════════════════════════════════════════════════════════════════════════════
-- comision_b2b_v4 — com. total = SUMA DE COMPONENTES YA REDONDEADOS
-- ═════════════════════════════════════════════════════════════════════════════
-- Igual a v3 (ventas + cobros por vendedor) salvo UN cambio: comision_total.
--   v3:  ROUND(base*tasa_venta + cobro*tasa_cobro, 2)   ← redondea la suma cruda
--   v4:  ROUND(base*tasa_venta, 2) + ROUND(cobro*tasa_cobro, 2)
-- Síntoma corregido: DEFAULT/fashion_shoes mayo 2026 mostraba $49.18 (=ROUND(49.175))
-- cuando sus componentes redondeados son $18.87 + $30.30 = $49.17. La total debe
-- ser la suma de los dos números que se muestran en pantalla, no un recálculo.
-- La fila Total del tab ya suma las filas (comision_total), así que con v4 cuadra.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION comision_b2b_v4(p_empresa_key text, p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_inicio date;
  v_fin    date;
  v_rows   jsonb;
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'p_mes inválido: %', p_mes; END IF;
  v_inicio := make_date(p_year, p_mes, 1);
  v_fin    := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH ventas AS (
    SELECT
      f.vendedor,
      SUM(
        CASE
          WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -ABS(f.subtotal_con_descuento)
          WHEN f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 20 THEN ABS(f.subtotal_con_descuento)
          ELSE 0
        END
      ) AS base
    FROM switch_factura_utilidad f
    WHERE f.empresa_key = p_empresa_key
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND f.vendedor IS NOT NULL AND TRIM(f.vendedor) <> ''
      AND f.cliente NOT ILIKE '%multi fashion holding%'
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
    GROUP BY f.vendedor
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

GRANT EXECUTE ON FUNCTION comision_b2b_v4(text, int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
