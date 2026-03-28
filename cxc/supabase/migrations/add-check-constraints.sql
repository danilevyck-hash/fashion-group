-- ============================================================
-- M11: CHECK constraints on estado fields
-- Run this in Supabase SQL Editor
-- ============================================================

-- Reclamos: valid estados
ALTER TABLE reclamos ADD CONSTRAINT reclamos_estado_check
  CHECK (estado IN ('Borrador', 'Enviado', 'En revisión', 'Resuelto con NC', 'Rechazado', 'Aplicada'));

-- Cheques: valid estados
ALTER TABLE cheques ADD CONSTRAINT cheques_estado_check
  CHECK (estado IN ('pendiente', 'depositado', 'vencido', 'rebotado'));

-- Caja periodos: valid estados
ALTER TABLE caja_periodos ADD CONSTRAINT caja_periodos_estado_check
  CHECK (estado IN ('abierto', 'cerrado'));

-- Prestamos movimientos: valid estados
ALTER TABLE prestamos_movimientos ADD CONSTRAINT prestamos_mov_estado_check
  CHECK (estado IN ('aprobado', 'pendiente_aprobacion'));
