-- Add "Cargo por daño" to concepto check constraint
ALTER TABLE prestamos_movimientos DROP CONSTRAINT IF EXISTS prestamos_movimientos_concepto_check;
ALTER TABLE prestamos_movimientos ADD CONSTRAINT prestamos_movimientos_concepto_check CHECK (concepto IN ('Préstamo','Pago','Abono extra','Cargo por daño'));
