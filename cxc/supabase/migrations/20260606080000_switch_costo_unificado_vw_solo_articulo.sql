-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_costo_unificado_vw → FUENTE ÚNICA switch_articulo_diario
-- (sprint de costo, Paso 3). Retira el blend con ventas_raw.costo.
--
-- CONTEXTO: switch_articulo_diario fue backfilleado con TODA la historia de costo
-- desde el API (ventasucursal, 2022+), reconciliado vs ventas_raw.costo dentro de
-- la base estructural (~0.1-0.5 por ciento anual por empresa). Ya no hace falta el
-- blend con switch_costo_diario (≥2026-05) + ventas_raw.costo (<2026-05).
--
-- QUÉ CAMBIA:
--   • Antes: switch_costo_diario (≥2026-05-01) UNION ventas_raw.costo (<2026-05-01).
--   • Ahora: SOLO switch_articulo_diario, todas las fechas. Costo neto firmado por
--     tipo (NC resta, FA/CNF/otros suman). fecha ya es DATE local (Panama) → el
--     bucket mensual es directo.
--
-- LIMITACIÓN DOCUMENTADA — EXCLUYE NOTAS DE DÉBITO (ND): ventasucursal (la fuente
--   de articulo_diario) NO entrega ND. ventas_raw.costo sí las incluía. Materialidad
--   medida: ~0.1 por ciento del costo (las anclas de panel cuadraron dentro de
--   tolerancia, el residuo es exactamente las ND). Aceptado en el gate del sprint.
--
-- Schema de salida intacto (empresa_key, mes, costo_total) → consumidores sin
-- cambio (ventas_dashboard_summary, prev_same_period rama ELSE, márgenes de
-- multifashion).
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW switch_costo_unificado_vw AS
SELECT
  empresa_key,
  date_trunc('month', fecha)::date AS mes,
  SUM(CASE WHEN tipo = 'NC' THEN -costo_total ELSE costo_total END)::numeric AS costo_total
FROM switch_articulo_diario
GROUP BY empresa_key, date_trunc('month', fecha)::date;

GRANT SELECT ON switch_costo_unificado_vw TO service_role;

COMMENT ON VIEW switch_costo_unificado_vw IS
  'Costo neto pre-impuesto por empresa_key x mes. FUENTE ÚNICA switch_articulo_diario (historia backfilleada del API ventasucursal, reconciliada vs ventas_raw.costo ~0.1-0.5% base estructural). NC resta, FA/CNF/otros suman. EXCLUYE Notas de Debito (ventasucursal no las trae; materialidad ~0.1% del costo, documentada en el gate). Sprint de costo, Paso 3.';

NOTIFY pgrst, 'reload schema';
