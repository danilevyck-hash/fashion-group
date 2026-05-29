-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_dashboard_summary → fuente Switch (fase 2.1)
--
-- FASE 2.1: migrado de ventas_raw a switch_ventas_unificado_vw +
-- switch_costo_unificado_vw. Mismo nombre y shape de salida (empresa, mes,
-- total_subtotal, total_costo, total_utilidad, total_facturado, filas) → el
-- frontend (src/lib/ventas/queries.ts) no cambia.
--
-- Cambios de semántica (intencionales, validados contra el panel oficial):
--   - total_subtotal ahora = ventas NETAS (neto con impuesto: F+T+Tr+ND − NC),
--     no el subtotal pre-impuesto de antes. Es la cifra que cuadra con el panel.
--   - total_costo = switch_costo_diario (>= 2026-05) / ventas_raw (< 2026-05).
--   - total_utilidad = ventas_netas − costo (en query time, no almacenado).
--   - empresa = empresa_key canónica (vistana, confecciones_boston, ...).
--   - filas ya no es COUNT real (el frontend no lo usa); se deja en 0.
--
-- Validación: Fashion Wear mayo 2026 → ventas 700,628.45 / costo 447,442.61 /
-- utilidad 253,185.84 / margen 36.1% (cuadra con panel).
--
-- ⚠ Aplicar JUNTO con la migración de ventas_dashboard_prev_same_period (fase
--   2.1, pendiente): este RPC pasa el año en curso a base neto-con-impuesto;
--   si el comparativo de año anterior sigue en ventas_raw (subtotal pre-impuesto)
--   los deltas YoY del heatmap quedan inflados ~7% (el impuesto). Ambos deben
--   migrar a la vez.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor (después de las vistas unificadas).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_dashboard_summary(p_anio int)
RETURNS TABLE (
  empresa text,
  mes int,
  total_subtotal numeric,
  total_costo numeric,
  total_utilidad numeric,
  total_facturado numeric,
  filas bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    v.empresa_key AS empresa,
    EXTRACT(MONTH FROM v.mes)::int AS mes,
    v.ventas_netas::numeric AS total_subtotal,
    COALESCE(c.costo_total, 0)::numeric AS total_costo,
    (v.ventas_netas - COALESCE(c.costo_total, 0))::numeric AS total_utilidad,
    v.ventas_netas::numeric AS total_facturado,
    0::bigint AS filas
  FROM switch_ventas_unificado_vw v
  LEFT JOIN switch_costo_unificado_vw c
    ON c.empresa_key = v.empresa_key AND c.mes = v.mes
  WHERE EXTRACT(YEAR FROM v.mes)::int = p_anio
  ORDER BY v.empresa_key, EXTRACT(MONTH FROM v.mes)::int
$$;

GRANT EXECUTE ON FUNCTION ventas_dashboard_summary(int) TO service_role;

NOTIFY pgrst, 'reload schema';
