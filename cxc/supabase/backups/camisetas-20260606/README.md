# Backup — Eliminación módulo Camisetas (2026-06-06)

Paquete completo del retiro del módulo **Camisetas Selección**.

## Contenido

| Archivo | Qué es |
|---|---|
| `camisetas_productos.json` | Datos vivos exportados (9 filas) |
| `camisetas_clientes.json` | Datos vivos exportados (20 filas) |
| `camisetas_pedidos.json` | Datos vivos exportados (130 filas) |
| `camisetas.sql` | Schema + seed archivado (migración original) |
| `camisetas-soft-delete.sql` | Migración archivada (columnas `deleted`) |
| `camisetas-estado.sql` | Migración archivada (columna `estado`) |
| `01_role_permissions_remove_camisetas.sql` | UPDATE de permisos — aplicar **con el deploy** |
| `02_drop_tables.sql` | Verificación FKs + DROP — aplicar **después del deploy OK** |

## Orden de aplicación

1. **Merge del PR** `chore/remove-camisetas-module` → deploy Vercel.
2. Correr `01_role_permissions_remove_camisetas.sql` (limpia permisos; no destructivo).
3. Confirmar que el deploy quedó OK en producción.
4. Correr `02_drop_tables.sql`: primero la verificación de FKs entrantes, luego el DROP.

## Restaurar (si hiciera falta)

Re-crear con `camisetas.sql` (+ `camisetas-soft-delete.sql` + `camisetas-estado.sql`)
y re-insertar los datos desde los `.json` (los `id` y `created_at` están preservados).
