-- ─────────────────────────────────────────────────────────────────────────────
-- home_dashboard_summary → reclamos a 2 estados.
--
-- Tras la migración 20260622130000 los reclamos solo tienen 'Creado'/'Pagado'.
-- Antes el RPC contaba pendientes/viejos como estado IN ('Borrador','Enviado');
-- ahora = 'Creado'. reclamosResueltosEsteMes sigue = 'Pagado'.
--
-- Cuerpo copiado verbatim de 20260606140000_home_dashboard_summary_reclamos_3estados.sql
-- (definición vigente); SOLO cambian las 2 condiciones de pendientes/viejos.
-- CREATE OR REPLACE in-place, misma firma; el frontend no cambia.
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
        AND estado = 'Creado'
    ),
    'reclamosViejos', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado = 'Creado'
        AND fecha_reclamo < p_dias_45
    ),
    'reclamosResueltosEsteMes', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado = 'Pagado'
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
      SELECT MAX(synced_at) FROM switch_estadocuenta
    ),
    'cxcTotal', COALESCE(
      (SELECT SUM(total) FROM switch_estadocuenta_aging), 0
    )::numeric,
    'cxcVencida', COALESCE(
      (SELECT SUM(COALESCE(d121_180,0) + COALESCE(d181_270,0) + COALESCE(d271_365,0) + COALESCE(mas_365,0)) FROM switch_estadocuenta_aging),
      0
    )::numeric,
    'ventasMes', COALESCE(
      (SELECT SUM(ventas_netas) FROM switch_ventas_unificado_vw
       WHERE EXTRACT(YEAR FROM mes)::int = p_current_year AND EXTRACT(MONTH FROM mes)::int = p_current_month),
      0
    )::numeric,
    'ventasPrev', COALESCE(
      (SELECT SUM(ventas_netas) FROM switch_ventas_unificado_vw
       WHERE EXTRACT(YEAR FROM mes)::int = p_prev_year AND EXTRACT(MONTH FROM mes)::int = p_prev_month),
      0
    )::numeric,
    'cajaPeriodoId', (SELECT id FROM periodo),
    'cajaFondo', (SELECT fondo_inicial FROM periodo),
    'cajaGastosTotal', (SELECT total FROM caja_gastos_total)
  )
$$;

GRANT EXECUTE ON FUNCTION home_dashboard_summary(date, timestamptz, int, int, int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
