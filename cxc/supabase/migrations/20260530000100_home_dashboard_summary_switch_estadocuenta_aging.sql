-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: home_dashboard_summary → switch_estadocuenta_aging
--
-- Sprint CXC migración fase 3: último lector estructural de cxc_aging.
-- Reemplaza las 2 sub-queries del RPC home_dashboard_summary (cxcTotal y
-- cxcVencida) para que el dashboard del home consuma switch_estadocuenta_aging
-- (API diario validado 6/6) en vez de cxc_aging (CSV manual semanal).
--
-- Solo cambian dos líneas (las dos sub-queries de CXC). El resto del RPC
-- (reclamos, guías, ventas, caja, préstamos, directorio) queda idéntico.
--
-- Después de esta migración, los únicos consumidores restantes de cxc_aging
-- son la página /upload (mantenida como red de seguridad por decisión
-- consciente). El decommission de cxc_aging queda para un sprint posterior
-- tras N semanas estables.
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
--   Esperado: cxcTotal cerca de $4,519,076 (suma 6 empresas validadas).
--             cxcVencida = SUM de los buckets 121+ de las 6 empresas.
-- ─────────────────────────────────────────────────────────────────────────────
