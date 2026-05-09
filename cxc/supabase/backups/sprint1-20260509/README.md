# Sprint 1 — Backups + Migration design (2026-05-09)

Este folder contiene:

- `backup_clientes_master.sql` — backup de las 167 filas actuales
- `backup_cxc_rows.sql` — backup de ~50K filas de cxc_rows
- `backup_ventas_raw.sql` — backup de ~100K filas de ventas_raw
- `migration.sql` — diseño de migración (NO EJECUTAR aún — esperar confirmación)

## Orden de ejecución una vez aprobado

1. **Backups (Fase 1)** — correr los 3 archivos `backup_*.sql`. Priorizar la
   "SECCIÓN B" (snapshot in-DB). El CSV es opcional.
2. **migration.sql Pasos 1–3** — pre-truncate + truncate + alter schema.
3. **Fase 2** — seed via `POST /api/admin/seed-clientes-master`.
4. **migration.sql Paso 4** — re-vincular `camisetas_pedidos.cliente_id`.
5. **Fase 3** — re-poblar `ventas_raw`.
6. **Fase 4** — re-poblar `cxc_rows` + nueva UI.

## Rollback

Si algo sale mal después del TRUNCATE, las tablas `backup_*_20260509` siguen
en la DB. Restaurar con:

```sql
TRUNCATE clientes_master;
INSERT INTO clientes_master SELECT * FROM backup_clientes_master_20260509;
-- (aplica análogo para cxc_rows, ventas_raw)
```

⚠️ Si el ALTER ya se corrió, las columnas no van a coincidir. En ese caso,
restaurar requiere primero revertir el schema (DROP nuevas, RENAME inverso,
ADD viejas). Documentar más detalle si llegamos a este escenario.
