-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_ventas_unificado_vw → FUENTE ÚNICA switch_facturas (Paso 2,
-- proyecto Fuente Única API). Retira el blend con ventas_raw.
--
-- CONTEXTO: switch_facturas fue backfilleado con TODA la historia desde el API
-- (2022+), reconciliado vs ventas_raw al centavo (Δ total 0.48 USD / 21.1M). Ya no
-- hace falta el UNION con ventas_raw para la era < 2025-05-02.
--
-- QUÉ CAMBIA:
--   • Antes: switch_facturas (fecha >= 2025-05-02) UNION ventas_raw (< 2025-05-02).
--   • Ahora: SOLO switch_facturas, todas las fechas.
--
-- BUCKETING EN HORA-PANAMÁ: switch_facturas.fecha es timestamptz (UTC). El bucket
--   mensual ahora usa (fecha AT TIME ZONE America/Panama) para igualar la
--   convención de fecha-local que tenía ventas_raw. Esto deja TODOS los meses con
--   la misma convención (antes el lado switch reciente bucketeaba en UTC). Pre-vuelo:
--   histórico idéntico al centavo; solo 2 meses recientes mueven un doc frontera
--   (neto cero, maxΔ 30) -> es la corrección de convención, no pérdida de monto.
--
-- BASE CONTABLE PRESERVADA: positivos (Factura+Tiquete+Transacción+Nota de Débito)
--   menos Nota de Crédito, sobre subtotal_descuento.
--
-- empresa_key ya es canónico en switch_facturas (vistana, confecciones_boston,
--   american_classic) -> no hace falta la normalización de alias del lado ventas_raw.
--
-- ventas_raw queda CONGELADA como respaldo (nadie de ventas la lee tras el proyecto).
-- El costo (switch_costo_unificado_vw) NO se toca: sigue su propio sprint.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW switch_ventas_unificado_vw AS
SELECT
  empresa_key,
  date_trunc('month', (fecha AT TIME ZONE 'America/Panama'))::date AS mes,
  SUM(
    CASE
      WHEN tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN subtotal_descuento
      WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
      ELSE 0
    END
  )::numeric AS ventas_netas
FROM switch_facturas
GROUP BY empresa_key, date_trunc('month', (fecha AT TIME ZONE 'America/Panama'))::date;

GRANT SELECT ON switch_ventas_unificado_vw TO service_role;

COMMENT ON VIEW switch_ventas_unificado_vw IS
  'Ventas netas pre-impuesto por empresa_key x mes. FUENTE ÚNICA switch_facturas (todo el historico backfilleado del API, reconciliado vs ventas_raw al centavo). Bucket mensual en hora-Panama (fecha AT TIME ZONE America/Panama). Base: Factura/Tiquete/Transaccion/Nota de Debito = +subtotal_descuento, Nota de Credito = -. Proyecto Fuente Unica API, Paso 2.';

NOTIFY pgrst, 'reload schema';
