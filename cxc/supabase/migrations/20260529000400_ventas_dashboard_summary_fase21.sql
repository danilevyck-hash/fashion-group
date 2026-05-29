-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_dashboard_summary → fuente Switch (fase 2.1)
--
-- FASE 2.1: migrado de ventas_raw a switch_ventas_unificado_vw +
-- switch_costo_unificado_vw. Mismo nombre y shape de salida (empresa, mes,
-- total_subtotal, total_costo, total_utilidad, total_facturado, filas) → el
-- frontend (src/lib/ventas/queries.ts) no cambia.
--
-- Base contable PRESERVADA: post-descuento pre-impuesto (igual que la versión
-- vieja SUM(subtotal) de ventas_raw). switch_ventas_unificado_vw usa
-- subtotal_descuento de switch_facturas (= ventas_raw.subtotal, match exacto),
-- así los YoY NO se inflan al migrar.
--   - total_subtotal = ventas netas pre-impuesto (F+T+Tr+ND − NC).
--   - total_costo = switch_costo_diario (>= 2026-05) / ventas_raw (< 2026-05).
--   - total_utilidad = ventas − costo (query time). margen = util/ventas.
--   - empresa = empresa_key canónica (vistana, confecciones_boston, ...).
--   - filas ya no es COUNT real (el frontend no lo usa); se deja en 0.
--
-- Validación (base pre-impuesto, cuadra con el reporte "Total de ventas" del panel):
--   Fashion Wear mayo 2026 → ventas 663,277.11 / costo 447,442.61 /
--   utilidad 215,834.50 / margen 32.5%.
--
-- Aplicar JUNTO con prev_same_period v2 (migration 500) y proyeccion_cierre_v6
-- (600) — todas usan la misma base unificada. Aplicar después de las vistas (300).
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
