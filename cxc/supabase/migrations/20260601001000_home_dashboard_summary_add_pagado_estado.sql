-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: home_dashboard_summary → soportar estado 'Pagado'
--
-- Reclamos migró su pipeline a 3 estados lineales: Borrador → Enviado → Pagado.
-- El estado final ahora es 'Pagado' (antes 'Aplicado'/'Aplicada'). Este RPC, que
-- alimenta los contadores del home, seguía contando solo los estados viejos:
--   - reclamosPendientes / reclamosViejos excluían ('Aplicado','Rechazado','Aplicada')
--   - reclamosResueltosEsteMes incluía ('Aplicado','Aplicada')
-- Sin esta migración, un reclamo 'Pagado' contaría como PENDIENTE en el home
-- (silent failure) y nunca como resuelto.
--
-- Fix: sumar 'Pagado' a las dos exclusiones de pendientes Y a la inclusión de
-- resueltos. Se MANTIENEN los valores legacy ('Aplicado','Aplicada','Rechazado')
-- por compatibilidad — no se quitan, solo se agrega 'Pagado'. El resto del RPC
-- (CXC, guías, ventas, caja, préstamos, directorio) queda idéntico.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION home_dashboard_summary(
  p_dias_45 date,
  p_month_start timestamptz,
  p_current_year int,
  p_current_month int,
  p_prev_year int,
  p_prev_month int
)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH periodo AS (
    SELECT id, fondo_inicial
    FROM caja_periodos
    WHERE estado = 'abierto'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  caja_gastos_total AS (
    SELECT COALESCE(SUM(total), 0)::numeric AS total
    FROM caja_gastos
    WHERE periodo_id = (SELECT id FROM periodo)
      AND deleted = false
  )
  SELECT jsonb_build_object(
    'reclamosPendientes', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado NOT IN ('Aplicado', 'Rechazado', 'Aplicada', 'Pagado')
    ),
    'reclamosViejos', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado NOT IN ('Aplicado', 'Rechazado', 'Aplicada', 'Pagado')
        AND fecha_reclamo < p_dias_45
    ),
    'reclamosResueltosEsteMes', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado IN ('Aplicado', 'Aplicada', 'Pagado')
        AND updated_at >= p_month_start
    ),
    'guiasEsteMes', (
      SELECT count(*) FROM guia_transporte
      WHERE created_at >= p_month_start
    ),
    'guiasPendientes', (
      SELECT count(*) FROM guia_transporte
      WHERE estado = 'Pendiente Bodega' AND deleted = false
    ),
    'totalClientes', (
      SELECT count(*) FROM directorio_clientes
      WHERE deleted = false
    ),
    'prestamosPendientes', (
      SELECT count(*) FROM prestamos_movimientos
      WHERE estado = 'pendiente_aprobacion'
        AND (deleted IS NULL OR deleted = false)
    ),
    'lastUpload', (
      SELECT uploaded_at FROM cxc_uploads
      ORDER BY uploaded_at DESC LIMIT 1
    ),
    'cxcTotal', COALESCE(
      (SELECT SUM(total) FROM switch_estadocuenta_aging), 0
    )::numeric,
    'cxcVencida', COALESCE(
      (SELECT SUM(COALESCE(d121_180,0) + COALESCE(d181_270,0) + COALESCE(d271_365,0) + COALESCE(mas_365,0)) FROM switch_estadocuenta_aging),
      0
    )::numeric,
    'ventasMes', COALESCE(
      (SELECT SUM(subtotal) FROM ventas_raw WHERE anio = p_current_year AND mes = p_current_month),
      0
    )::numeric,
    'ventasPrev', COALESCE(
      (SELECT SUM(subtotal) FROM ventas_raw WHERE anio = p_prev_year AND mes = p_prev_month),
      0
    )::numeric,
    'cajaPeriodoId', (SELECT id FROM periodo),
    'cajaFondo', (SELECT fondo_inicial FROM periodo),
    'cajaGastosTotal', (SELECT total FROM caja_gastos_total)
  )
$$;

GRANT EXECUTE ON FUNCTION home_dashboard_summary(date, timestamptz, int, int, int, int) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación:
--
--   SELECT home_dashboard_summary(
--     CURRENT_DATE - 45,
--     date_trunc('month', CURRENT_DATE),
--     EXTRACT(YEAR FROM CURRENT_DATE)::int,
--     EXTRACT(MONTH FROM CURRENT_DATE)::int,
--     EXTRACT(YEAR FROM (CURRENT_DATE - INTERVAL '1 month'))::int,
--     EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '1 month'))::int
--   );
--
--   Esperado: reclamosPendientes NO cuenta los 'Pagado'; reclamosResueltosEsteMes
--             SÍ cuenta los 'Pagado' con updated_at en el mes actual.
-- ─────────────────────────────────────────────────────────────────────────────
