-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_margen_tienda_mensual — margen mensual tienda completa
--
-- La card "Margen Bruto" del subtab Detalle mostraba siempre "—" porque la
-- fuente per-factura de Multifashion (switch_facturas) no trae costo. El reporte
-- web de utilidad (per-factura) existe pero esta scopeado a empresas B2B y
-- requiere credenciales web aparte (fuera de alcance por ahora).
--
-- Solucion (Opcion B): exponer el margen MENSUAL a nivel TIENDA COMPLETA
-- (retail + mayoreo), la misma fuente que ya usa el Overview
-- (switch_ventas_unificado_vw + switch_costo_unificado_vw, que combinan costo de
-- Switch forward + ventas_raw historico). El route de Detalle lo inyecta en
-- totales.margen y la card se etiqueta "Margen . tienda completa".
--
-- RPC chico e independiente: NO duplica multifashion_detalle_mensual_v2. Devuelve
-- el margen del MES seleccionado (no YTD). margen = null cuando ese mes no tiene
-- costo (meses muy viejos) -> la card muestra "—".
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION multifashion_margen_tienda_mensual(p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_ventas numeric;
  v_costo  numeric;
  v_margen numeric;
BEGIN
  -- Mismo calculo que multifashion_mensual_v6 (margen tienda completa) pero para
  -- UN solo mes (= p_mes), no YTD. FILTER costo>0 evita meses sin costo.
  SELECT
    COALESCE(SUM(v.ventas_netas) FILTER (WHERE COALESCE(c.costo_total, 0) > 0), 0),
    COALESCE(SUM(c.costo_total)  FILTER (WHERE COALESCE(c.costo_total, 0) > 0), 0)
  INTO v_ventas, v_costo
  FROM switch_ventas_unificado_vw v
  LEFT JOIN switch_costo_unificado_vw c
    ON c.empresa_key = v.empresa_key AND c.mes = v.mes
  WHERE v.empresa_key = 'american_classic'
    AND EXTRACT(YEAR  FROM v.mes)::int = p_year
    AND EXTRACT(MONTH FROM v.mes)::int = p_mes;

  -- Margen valido solo en rango razonable [-100%, 100%]. Fuera de eso es
  -- artefacto de datos (ej. un mes con venta ~0 y algo de costo da -494900%) ->
  -- null -> la card muestra "—".
  v_margen := CASE
    WHEN v_ventas > 0 AND (v_ventas - v_costo) / v_ventas BETWEEN -1 AND 1
      THEN (v_ventas - v_costo) / v_ventas
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'year',   p_year,
    'mes',    p_mes,
    'ventas', v_ventas,
    'costo',  v_costo,
    'margen', v_margen
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_margen_tienda_mensual(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
