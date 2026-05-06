-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: home_dashboard_summary RPC
--
-- Consolida en 1 round-trip las 12 queries del endpoint /api/home-stats.
-- Postgres ejecuta los sub-SELECTs en paralelo internamente, eliminando
-- N round-trips Vercel → Supabase (~300-500ms cada uno).
--
-- Devuelve JSONB con todos los KPIs del dashboard /home.
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
        AND estado NOT IN ('Aplicado', 'Rechazado', 'Aplicada')
    ),
    'reclamosViejos', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado NOT IN ('Aplicado', 'Rechazado', 'Aplicada')
        AND fecha_reclamo < p_dias_45
    ),
    'reclamosResueltosEsteMes', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado IN ('Aplicado', 'Aplicada')
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
      (SELECT SUM(total) FROM cxc_rows), 0
    )::numeric,
    'cxcVencida', COALESCE(
      (SELECT SUM(COALESCE(d121_180,0) + COALESCE(d181_270,0) + COALESCE(d271_365,0) + COALESCE(mas_365,0)) FROM cxc_rows),
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
