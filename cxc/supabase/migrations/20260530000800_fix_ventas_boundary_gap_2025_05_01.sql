-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: boundary hermético en switch_ventas_unificado_vw (auditoría 🟢-15)
--
-- HALLAZGO: switch_facturas arranca 2025-05-02 (1-may = Día del Trabajo, feriado
-- en Panamá, sin ventas). La vista vieja excluía TODO mayo 2025 de ventas_raw
-- (make_date(anio,mes,1) < 2025-05-01) y switch cubría mayo desde el día 2 → el
-- día calendario 2025-05-01 quedaba sin caer en ninguna rama del UNION.
--
-- VERIFICADO 2026-05-30 (scripts/_diag-0501.mjs): ventas_raw tiene 0 filas / $0.00
-- el 2025-05-01 → HOY no se pierde ni se duplica nada. Este cambio es DEFENSIVO:
-- deja el boundary hermético por si un re-upload futuro trae datos de ese día.
-- Comportamiento HOY = idéntico al anterior (el día está vacío).
--
-- CÓMO: corte único en 2025-05-02. ventas_raw cubre TODO fecha < 2025-05-02
-- (incluiría el 2025-05-01 si existiera); switch cubre fecha >= 2025-05-02. Para
-- que un eventual 2025-05-01 de ventas_raw se sume al MISMO bucket de mayo que
-- switch (días 2-31) sin duplicar, se agrega un GROUP BY exterior — antes las dos
-- ramas eran disjuntas por mes y no hacía falta.
--
-- Base contable PRESERVADA: positivos (Factura+Tiquete+Transacción+Nota de Débito)
-- menos Nota de Crédito, sobre subtotal_descuento (switch) / subtotal (ventas_raw).
--
-- COSTO NO TIENE ESTE HUECO: switch_costo_diario arranca exactamente 2026-05-01,
-- contiguo con ventas_raw hasta 2026-04-30 → switch_costo_unificado_vw se deja
-- intacto.
--
-- Los RPC ventas_dashboard_prev_same_period y ventas_proyeccion_cierre_v6 leen
-- esta vista para sus totales anuales; su CTE dia_ventas (ytd día-a-día) comparte
-- el mismo boundary, también verificado vacío en 2025-05-01. No se tocan acá para
-- no reescribir funciones grandes por un hueco de $0 (ver reporte de la tanda).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW switch_ventas_unificado_vw AS
WITH src AS (
  -- switch: cubre desde 2025-05-02 (primer día con data real)
  SELECT
    empresa_key,
    date_trunc('month', fecha)::date AS mes,
    CASE
      WHEN tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN subtotal_descuento
      WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
      ELSE 0
    END AS v
  FROM switch_facturas
  WHERE fecha >= DATE '2025-05-02'
  UNION ALL
  -- ventas_raw: cubre todo lo anterior a 2025-05-02 (incluye 2025-05-01 si lo hubiera)
  SELECT
    CASE
      WHEN empresa IN ('vistana', 'vistana_international') THEN 'vistana'
      WHEN empresa IN ('boston', 'confecciones_boston') THEN 'confecciones_boston'
      ELSE empresa
    END AS empresa_key,
    make_date(anio, mes, 1) AS mes,
    subtotal AS v
  FROM ventas_raw
  WHERE fecha < DATE '2025-05-02'
)
SELECT
  empresa_key,
  mes,
  SUM(v)::numeric AS ventas_netas
FROM src
GROUP BY empresa_key, mes;

GRANT SELECT ON switch_ventas_unificado_vw TO service_role;

COMMENT ON VIEW switch_ventas_unificado_vw IS
  'Ventas netas pre-impuesto por empresa_key x mes. Corte hermetico en 2025-05-02: ventas_raw fecha < 2025-05-02, switch_facturas fecha >= 2025-05-02 (switch arranca el 02; 1-may feriado, verificado $0). GROUP BY exterior evita doble-conteo en el bucket mayo-2025. Auditoria 🟢-15 / scripts/_diag-0501.mjs.';

NOTIFY pgrst, 'reload schema';
