-- Correr en Supabase SQL Editor
-- Elimina el empleado de prueba "Aaaa" y sus movimientos
DELETE FROM prestamos_movimientos WHERE empleado_id IN (SELECT id FROM prestamos_empleados WHERE nombre ILIKE 'aaa%');
DELETE FROM prestamos_empleados WHERE nombre ILIKE 'aaa%';
