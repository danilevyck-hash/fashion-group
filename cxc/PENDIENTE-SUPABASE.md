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

## 6. Permisos contabilidad (ventas) — ⛔ NO CORRER, YA CORRIÓ Y HOY DESTRUYE

```sql
-- Archivo: supabase/update-contabilidad-permisos.sql
UPDATE role_permissions SET modulos = ARRAY['prestamos','ventas'] WHERE role = 'contabilidad';
```

⛔ **Esta línea PISA la lista entera, no agrega.** Ya corrió hace meses. Hoy
`role_permissions.contabilidad.modulos` tiene 7 keys (`asistencia`,
`gastos-empresa`, `prestamos`, `proveedores`, `ventas`, `saldos-banco`,
`gastos-contabilidad`), así que volver a correrla le **borraría 5 módulos** a
contabilidad de un saque. Queda acá solo como historia. Lo que agrega un módulo
sin pisar nada es el patrón de abajo (`array_append` + guarda `NOT ... = ANY`).

## 7. Comisiones para contabilidad (25-ago-2026)

Daniel: *"Q contabilidad vea comisiones"*. Aditivo e idempotente.

```sql
-- Archivo: supabase/migrations/20260825120000_comisiones_contabilidad.sql
UPDATE role_permissions
   SET modulos = array_append(modulos, 'comisiones'), updated_at = now()
 WHERE role = 'contabilidad'
   AND NOT ('comisiones' = ANY (COALESCE(modulos, '{}')));
```

⚠️ **No es bloqueante**: la pantalla ya funciona sin esto —
`MODULO_HEREDA_PERMISO_DE` (`src/lib/modules.ts`) enciende la ficha para quien
tiene `ventas`, que contabilidad tiene. Correr esto es lo que permite RETIRAR
esa herencia más adelante.

⚠️ **No abre ningún dato nuevo**: medido con cookies firmadas contra los
handlers reales, contabilidad ya recibía **200** de las 4 rutas de lectura de
comisiones antes de esta rama. `POST /descuentos` y `/config` le siguen dando
**403**.
