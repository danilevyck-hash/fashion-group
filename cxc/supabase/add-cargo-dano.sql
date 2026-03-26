-- Add "Responsabilidad por daño" and "Pago de responsabilidad" to concepto check constraint
ALTER TABLE prestamos_movimientos DROP CONSTRAINT IF EXISTS prestamos_movimientos_concepto_check;
ALTER TABLE prestamos_movimientos ADD CONSTRAINT prestamos_movimientos_concepto_check CHECK (concepto IN ('Préstamo','Pago','Abono extra','Responsabilidad por daño','Pago de responsabilidad'));
