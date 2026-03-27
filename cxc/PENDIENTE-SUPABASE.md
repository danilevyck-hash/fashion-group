# SQL pendiente de ejecutar en Supabase

Correr estos scripts en el **SQL Editor de Supabase** en el orden indicado.

## 1. Categoría y empresa en gastos de caja
```sql
-- Archivo: supabase/add-caja-categoria.sql
ALTER TABLE caja_gastos ADD COLUMN IF NOT EXISTS empresa text;
```

## 2. Detalle de guías (monto total + estado)
```sql
-- Archivo: supabase/add-guias-detalle.sql
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS monto_total numeric(10,2) DEFAULT 0;
ALTER TABLE guia_transporte ADD COLUMN IF NOT EXISTS estado text DEFAULT 'Preparando';
```

## 3. Campo WhatsApp en directorio
```sql
-- Archivo: supabase/add-directorio-whatsapp.sql
ALTER TABLE directorio_clientes ADD COLUMN IF NOT EXISTS whatsapp text;
```

## 4. Constraint de conceptos de préstamos
```sql
-- Archivo: supabase/add-cargo-dano.sql
ALTER TABLE prestamos_movimientos DROP CONSTRAINT IF EXISTS prestamos_movimientos_concepto_check;
ALTER TABLE prestamos_movimientos ADD CONSTRAINT prestamos_movimientos_concepto_check CHECK (concepto IN ('Préstamo','Pago','Abono extra','Responsabilidad por daño','Pago de responsabilidad'));
```

## 5. Eliminar empleado de prueba "Aaaa"
```sql
-- Archivo: supabase/delete-empleado-prueba.sql
DELETE FROM prestamos_movimientos WHERE empleado_id IN (SELECT id FROM prestamos_empleados WHERE nombre ILIKE 'aaa%');
DELETE FROM prestamos_empleados WHERE nombre ILIKE 'aaa%';
```

## 6. Permisos contabilidad (ventas)
```sql
-- Archivo: supabase/update-contabilidad-permisos.sql
UPDATE role_permissions SET modulos = ARRAY['prestamos','ventas'] WHERE role = 'contabilidad';
```
