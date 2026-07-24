-- ═════════════════════════════════════════════════════════════════════════════
-- comision_b2b_detalle v2 — VENTAS por VENDEDOR DE FACTURA (paridad con v5)
-- ═════════════════════════════════════════════════════════════════════════════
-- BUG (caso real DANIEL LEVY / vistana / jul-2026): el resumen (comision_b2b_v5)
-- atribuye las ventas al vendedor del DOCUMENTO (switch_facturas.vendedor_nombre,
-- decision Daniel 3-jul, PR #209), pero este detalle seguia filtrando por CARTERA
-- (switch_factura_utilidad.vendedor = dueno de cartera). Resultado: el modal solo
-- listaba los docs de clientes de SU cartera (Dana Mall, base -468.00) y perdia
-- lo vendido a clientes de otras carteras (5 FA City Mall Paso Canoa + 4 NC,
-- cartera EDWIN pero vendedor de factura DANIEL LEVY) — el resumen decia
-- 43,796.50 / 223.98 y el modal 2.66.
--
-- FIX: el componente VENTAS replica EXACTAMENTE la logica de comision_b2b_v5:
--   • Mismo CTE doc_vendedor (switch_facturas, DISTINCT ON secuencial, ventana
--     ±2 dias por el borde timestamptz) + fallback a cartera si no hay match.
--   • Mismo filtro de clientes (MFH / VENTAS / CONTADO).
--   • Mismo aporte por doc: NC = -ABS(subtotal), Factura con utilidad>20 = +ABS,
--     Factura con utilidad<=20 = 0. Las facturas de utilidad<=20 SE LISTAN con
--     subtotal 0.00 (asi el usuario ve el documento y entiende por que no
--     comisiona — la columna % Util. lo explica); las Notas de Debito no se
--     listan (aportan siempre 0 en v5).
--   • Redondeo IGUAL a v5: comision_total = ROUND(ventas*tasa) + ROUND(cobros*
--     tasa) — suma de componentes YA redondeados, no ROUND de la suma (el
--     detalle viejo podia descuadrar 1 centavo contra la tabla).
-- COBROS: sin cambio — siguen por cartera (switch_recibos.vendedor_cartera),
-- igual que v5 (Switch no expone a que facturas se aplica cada recibo).
--
-- REGLA: el modal lista TODO lo que el resumen suma y su total cierra EXACTO
-- con la fila de la tabla. CREATE OR REPLACE (misma firma) → el route
-- /api/ventas/comisiones/detalle no cambia; sin riesgo de orden de deploy.
-- Verificacion al centavo: RUN_DB_TESTS=1 npx vitest run
--   src/__tests__/integration/comisiones-detalle-rpc.test.ts
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

  -- VENTAS — misma atribución y filtros que comision_b2b_v5.ventas
  WITH doc_vendedor AS (
    -- Vendedor del documento según switch_facturas. DISTINCT ON por si algún
    -- secuencial se repitiera dentro de la empresa (gana el más reciente).
    -- IDÉNTICO al CTE de comision_b2b_v5 (ventana ±2 días por timestamptz).
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
      -- v2: vendedor del documento con fallback a cartera (= llave de agrupación de v5)
      AND COALESCE(dv.vendedor_factura, f.vendedor) = p_vendedor
      AND f.cliente NOT ILIKE '%multi fashion holding%'
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
      -- Solo FA y NC se listan; otros tipos (Nota de Débito) aportan 0 en v5.
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

  -- COBROS (sin cambio: por cartera, mismos filtros que comision_b2b_v5.cobros)
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
    -- Igual que v5: suma de componentes YA redondeados (paridad al centavo).
    'comision_total', ROUND(v_ventas_base * v_tasa_venta, 2)
                    + ROUND(v_cobros_base * v_tasa_cobro, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_detalle(text, int, int, text) TO service_role;

NOTIFY pgrst, 'reload schema';
