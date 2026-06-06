-- ─────────────────────────────────────────────────────────────────────────────
-- Migration C (Sprint B grupo 3): home_dashboard_summary — limpiar refs legacy
-- de estados de reclamos.
--
-- COSMETICA / behavior-preserving. Tras la Migracion A, el CHECK constraint de
-- reclamos.estado solo admite Borrador/Enviado/Pagado, asi que los estados
-- legacy (Aplicado/Aplicada/Confirmado/Rechazado) ya no pueden existir. Las
-- condiciones del RPC que los mencionaban eran defensivas y redundantes:
--   - reclamosPendientes/reclamosViejos: NOT IN (...legacy..., 'Pagado')
--       equivale ahora a IN ('Borrador','Enviado').
--   - reclamosResueltosEsteMes: IN (...legacy..., 'Pagado') equivale a = 'Pagado'.
-- El conteo no cambia (cero filas legacy); solo se simplifica la logica.
--
-- Cuerpo copiado verbatim de 20260606070000_home_dashboard_ventas_switch.sql
-- (definicion vigente); SOLO cambian las 3 condiciones de estado de reclamos.
-- CREATE OR REPLACE in-place, misma firma; el frontend no cambia.
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
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
        AND estado IN ('Borrador', 'Enviado')
    ),
    'reclamosViejos', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado IN ('Borrador', 'Enviado')
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
