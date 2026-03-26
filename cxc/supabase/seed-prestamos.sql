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

-- 3. Historical movements (placeholder)
-- NOTE: The 161 historical transactions from control_de_prestamos.xlsx
-- need to be provided by the user and added here.
-- Example format:
-- insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, estado) values
--   ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2024-01-15', 'Préstamo', 500.00, 'aprobado'),
--   ((select id from prestamos_empleados where nombre = 'BRICEIDA MONTERO'), '2024-02-01', 'Pago', 50.00, 'aprobado');
