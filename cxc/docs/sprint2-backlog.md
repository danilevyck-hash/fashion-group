# Sprint 2 — Backlog

Items pendientes capturados durante Sprint 1, no ejecutar sin aprobación de Daniel.

## Renombres de URL

- **`/admin` → `/cxc`** con redirect permanente. La URL `/admin` se quedó del nombre histórico del módulo CXC, pero el dashboard de CXC vive ahí. Renombrar mejora claridad y consistencia con `/clientes`, `/cheques`, `/guias`, etc. Setup: nueva ruta `/cxc/page.tsx` que carga el componente actual; `/admin/page.tsx` queda como redirect → `/cxc`. Actualizar `src/lib/modules.ts` (el módulo `cxc` con `href: "/admin"` apunta a `/cxc`), todos los enlaces internos (drawer, search, KPIs, atajos), y `src/lib/moduleColors.ts`.

## Cleanup de Sprint 1

- **Eliminar `directorio_clientes`** (table + endpoint + UI vieja). Bloqueado hasta que Cheques se migre a `clientes_master` (ver siguiente item).
- **Migrar Cheques a `cliente_codigo`**. Auditoría de Sprint 1 detectó 5 filas en `cheques.cliente` (text). Cambiar a `cliente_id` uuid + `cliente_codigo` text con autocomplete contra `clientes_master`.
- **Migrar Guías a `cliente_codigo`**. `guia_items.cliente` (text, 164 filas, 55 valores únicos con duplicación por casing). Mismo patrón que Cheques.
- **Retirar `/admin/seed-clientes-master`** (endpoint + página) — fue temporal de Sprint 1.
- **Borrar `src/app/directorio/DirectorioClient.tsx`** (896 líneas dead code después del redirect de Fase 4E).

## SOP semanal

- Documentar en `docs/sop-actualizacion-semanal.md`: descarga de los 3 reportes de Switch (listaclientes, listacomprobantes, detallessaldos) por cada empresa B2B, upload via UI, validación de totales contra reportes oficiales. Incluir UPSERT inteligente para `clientes_master` (no pisar telefono/celular/email/notas si fueron editados — `updated_at > last_synced_at`).

## Bugs / mejoras pendientes

- (Vacío por ahora.)
