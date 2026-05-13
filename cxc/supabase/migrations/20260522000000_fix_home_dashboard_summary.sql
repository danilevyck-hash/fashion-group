-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: fix home_dashboard_summary RPC
--
-- El RPC viejo (20260506000000_home_dashboard_summary.sql) lee SUM(total) y
-- SUM(d121_180+...) de cxc_rows, pero esas columnas fueron eliminadas en la
-- migración Sprint 1 Fase 4 (per-document schema con debito/credito/saldo +
-- dias_vencidos). El RPC quedó devolviendo NULL/error → el home muestra $0
-- en cxcTotal/cxcVencida porque /api/home-stats hace `Number(r.cxcTotal) || 0`.
--
-- Reemplazo: leer directo de cxc_rows con el net (debito - credito), igual
-- que cxc_aging.total. Así el cxcTotal del home matchea el Total Pendiente
-- del Panel CXC. cxcVencida se filtra por dias_vencidos >= 121 (mismo cutoff
-- que el bucket "vencido" del módulo).
--
-- El resto de los KPIs (reclamos, guías, cheques, caja, ventas, préstamos)
-- queda igual al RPC original — solo cambian las dos sub-queries de cxc_*.
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
    -- cxcTotal: net debito-credito sobre todos los documentos en cxc_rows.
    -- Mismo cálculo que cxc_aging.total → matchea el Total Pendiente del
    -- Panel CXC (~$3.96M). Las NCs y pagos parciales reducen el saldo igual
    -- que en el módulo.
    'cxcTotal', COALESCE(
      (SELECT SUM(debito - credito) FROM cxc_rows),
      0
    )::numeric,
    -- cxcVencida: net debito-credito de documentos con dias_vencidos >= 121
    -- (mismo cutoff del bucket "vencido" del Panel CXC: d121_180 + d181_270
    -- + d271_365 + mas_365).
    'cxcVencida', COALESCE(
      (SELECT SUM(debito - credito) FROM cxc_rows WHERE dias_vencidos >= 121),
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
