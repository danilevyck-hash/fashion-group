-- ============================================
-- SEED: Préstamos a Colaboradores
-- ============================================

-- 1. Create tables if not exist
create table if not exists prestamos_empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  empresa text,
  deduccion_quincenal numeric(10,2) not null default 0,
  notas text,
  activo boolean default true,
  created_at timestamptz default now()
);

create table if not exists prestamos_movimientos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references prestamos_empleados(id) on delete cascade,
  fecha date not null,
  concepto text not null check (concepto in ('Préstamo','Pago','Abono extra')),
  monto numeric(10,2) not null,
  notas text,
  estado text not null default 'aprobado' check (estado in ('aprobado','pendiente_aprobacion')),
  aprobado_por uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 2. Insert employees
-- (empresa left null — to be assigned from UI)
insert into prestamos_empleados (nombre, deduccion_quincenal) values
  ('BRICEIDA MONTERO', 50.00),
  ('ANGELA GARCIA', 50.00),
  ('JORMAN HERNANDEZ', 40.00),
  ('ROXANA HERNANDEZ', 100.00),
  ('JOHANA VALLEJO', 40.00),
  ('RAMON MIRANDA', 50.00),
  ('CRISTIAM BLANCO', 25.00),
  ('YULICAR CORONA', 25.00),
  ('ANDRES GONZALEZ', 50.00),
  ('STEFANY MORALES', 25.00),
  ('LUIS PARAJON', 45.00),
  ('ESMER CRUZ', 50.00),
  ('LUZ LOPEZ', 15.00);

-- 3. Historical movements (161 transactions)

-- ANGELA GARCIA (34 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-01-02', 'Préstamo', 433.40, 'Viaje a Cali', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-01-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-02-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-02-19', 'Préstamo', 650.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-02-21', 'Préstamo', 4878.05, 'Fashion Shoes', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-03-01', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-03-07', 'Pago', 200.00, 'Fashion Shoes', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-03-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-03-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-04-09', 'Pago', 400.00, 'Fashion Shoes', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-04-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-04-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-05-05', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-05-10', 'Pago', 200.00, 'Fashion Shoes', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-05-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-06-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-06-27', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-07-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-07-15', 'Pago', 100.00, 'Fashion Shoes', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-07-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-08-15', 'Pago', 200.00, 'Pago quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-08-15', 'Pago', 233.40, 'Décimo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-09-11', 'Pago', 400.00, 'Fashion Shoes', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-10-09', 'Préstamo', 1200.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-11-12', 'Pago', 380.00, 'Fashion Shoes', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-11-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-11-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-12-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2025-12-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2026-01-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2026-01-21', 'Pago', 300.00, 'Fashion Shoes', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2026-01-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2026-02-10', 'Pago', 200.00, 'Fashion Shoes', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2026-02-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANGELA GARCIA'), '2026-02-28', 'Pago', 50.00, 'Deducción quincenal', 'aprobado');

-- ANDRES GONZALEZ (5 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'ANDRES GONZALEZ'), '2025-01-13', 'Préstamo', 1700.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANDRES GONZALEZ'), '2026-01-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANDRES GONZALEZ'), '2026-01-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANDRES GONZALEZ'), '2026-02-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ANDRES GONZALEZ'), '2026-02-28', 'Pago', 50.00, 'Deducción quincenal', 'aprobado');

-- BRICEIDA MONTERO (18 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-04-11', 'Préstamo', 300.00, 'Fashion Wear', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-04-11', 'Pago', 80.00, 'Décimo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-04-29', 'Préstamo', 250.00, 'Boston', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-05-19', 'Préstamo', 250.00, 'Boston', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-05-30', 'Préstamo', 250.00, 'Boston', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-06-16', 'Préstamo', 250.00, 'Boston', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-09-03', 'Pago', 220.00, 'Depósito', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-10-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-10-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-10-30', 'Abono extra', 300.00, 'Abono', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-11-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-11-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-12-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2025-12-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2026-01-15', 'Pago', 200.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2026-01-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2026-02-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2026-02-28', 'Pago', 50.00, 'Deducción quincenal', 'aprobado');

-- CRISTIAM BLANCO (20 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-06-10', 'Préstamo', 400.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-06-30', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-07-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-07-30', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-08-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-08-30', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-09-01', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-09-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-10-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-10-27', 'Préstamo', 60.00, 'Fashion Wear', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-10-30', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-11-15', 'Pago', 55.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-11-30', 'Pago', 55.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-12-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2025-12-30', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2026-01-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2026-01-30', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2026-02-03', 'Préstamo', 100.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2026-02-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'CRISTIAM BLANCO'), '2026-02-28', 'Pago', 25.00, 'Deducción quincenal', 'aprobado');

-- ESMER CRUZ (3 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'ESMER CRUZ'), '2026-02-11', 'Préstamo', 600.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ESMER CRUZ'), '2026-02-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ESMER CRUZ'), '2026-02-28', 'Pago', 50.00, 'Deducción quincenal', 'aprobado');

-- JOHANA VALLEJO (12 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2025-10-23', 'Préstamo', 400.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2025-11-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2025-11-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2025-12-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2025-12-24', 'Préstamo', 100.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2025-12-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2026-01-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2026-01-23', 'Préstamo', 350.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2026-01-29', 'Préstamo', 150.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2026-01-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2026-02-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JOHANA VALLEJO'), '2026-02-28', 'Pago', 40.00, 'Deducción quincenal', 'aprobado');

-- JORMAN HERNANDEZ (20 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-06-20', 'Préstamo', 900.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-06-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-07-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-07-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-08-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-08-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-08-30', 'Pago', 300.00, 'Liquidación', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-09-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-09-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-10-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-10-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-11-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-11-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-12-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2025-12-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2026-01-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2026-01-18', 'Préstamo', 300.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2026-01-30', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2026-02-15', 'Pago', 40.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'JORMAN HERNANDEZ'), '2026-02-28', 'Pago', 40.00, 'Deducción quincenal', 'aprobado');

-- LUIS PARAJON (4 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'LUIS PARAJON'), '2026-02-06', 'Préstamo', 100.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'LUIS PARAJON'), '2026-02-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'LUIS PARAJON'), '2026-02-28', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'LUIS PARAJON'), '2026-03-06', 'Préstamo', 520.00, 'Nuevo préstamo', 'aprobado');

-- LUZ LOPEZ (3 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'LUZ LOPEZ'), '2026-02-18', 'Préstamo', 50.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'LUZ LOPEZ'), '2026-02-28', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'LUZ LOPEZ'), '2026-03-03', 'Préstamo', 50.00, 'Nuevo préstamo', 'aprobado');

-- RAMON MIRANDA (20 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-07-22', 'Préstamo', 200.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-07-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-08-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-08-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-09-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-09-15', 'Préstamo', 100.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-09-30', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-10-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-10-30', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-11-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-11-21', 'Préstamo', 200.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-11-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-12-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2025-12-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2026-01-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2026-01-30', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2026-02-06', 'Préstamo', 50.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2026-02-20', 'Préstamo', 300.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2026-02-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'RAMON MIRANDA'), '2026-02-28', 'Pago', 50.00, 'Deducción quincenal', 'aprobado');

-- ROXANA HERNANDEZ (10 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'ROXANA HERNANDEZ'), '2025-10-01', 'Préstamo', 1300.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ROXANA HERNANDEZ'), '2025-10-30', 'Pago', 100.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ROXANA HERNANDEZ'), '2025-11-15', 'Pago', 100.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ROXANA HERNANDEZ'), '2025-11-30', 'Pago', 100.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ROXANA HERNANDEZ'), '2025-12-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ROXANA HERNANDEZ'), '2026-01-15', 'Pago', 100.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ROXANA HERNANDEZ'), '2026-01-30', 'Pago', 100.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ROXANA HERNANDEZ'), '2026-02-28', 'Préstamo', 1000.00, 'Cancelar 15/04/2026', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ROXANA HERNANDEZ'), '2026-02-15', 'Pago', 50.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'ROXANA HERNANDEZ'), '2026-02-28', 'Pago', 50.00, 'Deducción quincenal', 'aprobado');

-- STEFANY MORALES (4 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'STEFANY MORALES'), '2026-01-01', 'Préstamo', 170.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'STEFANY MORALES'), '2026-02-03', 'Préstamo', 50.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'STEFANY MORALES'), '2026-02-24', 'Préstamo', 60.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'STEFANY MORALES'), '2026-02-28', 'Pago', 20.00, 'Deducción quincenal', 'aprobado');

-- YULICAR CORONA (10 movimientos)
insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado) values
  ((select id from prestamos_empleados where nombre = 'YULICAR CORONA'), '2025-12-09', 'Préstamo', 500.00, 'Préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'YULICAR CORONA'), '2025-12-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'YULICAR CORONA'), '2025-12-30', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'YULICAR CORONA'), '2026-01-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'YULICAR CORONA'), '2026-01-30', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'YULICAR CORONA'), '2026-01-30', 'Pago', 18.19, 'Horas extras', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'YULICAR CORONA'), '2026-02-15', 'Pago', 25.00, 'Deducción quincenal', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'YULICAR CORONA'), '2026-02-15', 'Pago', 11.74, 'Horas extras', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'YULICAR CORONA'), '2026-02-20', 'Préstamo', 200.00, 'Nuevo préstamo', 'aprobado'),
  ((select id from prestamos_empleados where nombre = 'YULICAR CORONA'), '2026-02-28', 'Pago', 25.00, 'Deducción quincenal', 'aprobado');
