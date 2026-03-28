-- ============================================================
-- H9: Missing indexes for frequently queried columns
-- Run this in Supabase SQL Editor
-- ============================================================

-- Cheques: filtered by estado + fecha_deposito in cron and home-stats
CREATE INDEX IF NOT EXISTS idx_cheques_estado_fecha ON cheques(estado, fecha_deposito);

-- Reclamos: filtered by empresa and estado in list views and home-stats
CREATE INDEX IF NOT EXISTS idx_reclamos_empresa ON reclamos(empresa);
CREATE INDEX IF NOT EXISTS idx_reclamos_estado ON reclamos(estado);

-- Reclamo child tables: joined by reclamo_id on every detail fetch
CREATE INDEX IF NOT EXISTS idx_reclamo_fotos_reclamo ON reclamo_fotos(reclamo_id);
CREATE INDEX IF NOT EXISTS idx_reclamo_items_reclamo ON reclamo_items(reclamo_id);
CREATE INDEX IF NOT EXISTS idx_reclamo_seg_reclamo ON reclamo_seguimiento(reclamo_id);

-- Caja: gastos filtered by periodo_id, periodos filtered by estado
CREATE INDEX IF NOT EXISTS idx_caja_gastos_periodo ON caja_gastos(periodo_id);
CREATE INDEX IF NOT EXISTS idx_caja_periodos_estado ON caja_periodos(estado);

-- Guias: items joined by guia_id
CREATE INDEX IF NOT EXISTS idx_guia_items_guia ON guia_items(guia_id);

-- Prestamos: movimientos filtered by empleado_id for balance calculation
CREATE INDEX IF NOT EXISTS idx_prestamos_mov_empleado ON prestamos_movimientos(empleado_id);

-- User system: modules looked up by user_id on every auth
CREATE INDEX IF NOT EXISTS idx_fg_user_modules_user ON fg_user_modules(user_id);

-- Guia transporte: filtered by created_at for month count in home-stats
CREATE INDEX IF NOT EXISTS idx_guia_transporte_created ON guia_transporte(created_at DESC);
