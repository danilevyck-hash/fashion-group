---
name: data-integrity
description: Sistema de monitoreo automático de integridad de datos. Cron diario que corre 9 checks contra cxc_rows, ventas_raw, cheques, prestamos. Resultados en data_integrity_checks; dashboard /admin/data-health; alerta por email a daniel@ si hay críticos.
---

# Data Integrity Monitoring

Sistema preventivo que se asegura que los CSVs de Switch + uploads manuales
no introduzcan basura silenciosamente. Nació después del bug de Quality
Shoes (factura en CXC sin venta correspondiente) y el RPC home roto.

## Componentes

| Pieza | Path |
|---|---|
| Tabla histórica | `data_integrity_checks` (migration `20260524000000_data_integrity_checks.sql`) |
| Runner + 9 checks | `src/lib/integrity-checks.ts` |
| Endpoint cron | `src/app/api/cron/integrity-check/route.ts` |
| Endpoint para dashboard | `src/app/api/admin/data-health/route.ts` |
| Dashboard | `src/app/admin/data-health/page.tsx` |
| Cron schedule | `vercel.json` → `0 12 * * *` (7am Panamá) |

## Los 9 checks

| # | check_name | Tabla | Severity por threshold |
|---|---|---|---|
| 1 | `cxc_fecha_null` | cxc_rows | 0=ok, 1-5=warning, >5=critical |
| 2 | `cxc_dias_vencidos_sin_fecha` | cxc_rows | 0=ok, >0=warning |
| 3 | `upload_desync_cxc_ventas` | cxc_uploads, ventas_raw | <7d=ok, 7-14=warning, >14=critical |
| 4 | `cheques_criticos_null` | cheques | 0=ok, >0=warning |
| 5 | `prestamos_saldo_anomalo` | prestamos_empleados | 0=ok, >0=info (margen -100) |
| 6 | `ventas_cliente_vacio` | ventas_raw | 0=ok, >0=warning |
| 7a | `last_upload_age_cxc` | cxc_rows | <7d=ok, 7-14=warning, >14=critical |
| 7b | `last_upload_age_ventas` | ventas_raw | igual |
| 8 | `cxc_sin_venta_correspondiente` | cxc_rows + ventas_raw | 0=ok, 1-5=info, 6-20=warning, >20=critical (filtro gap > 30d) |
| 9 | `cxc_uploads_zombie` | cxc_uploads | 0=ok, >0=warning |

## Reaccionar a una alerta

### CRITICAL — email + dashboard rojo
- **cxc_fecha_null > 5**: Switch cambió formato de fecha o el parser regresionó. Revisar `src/lib/cxc-fecha.ts` y los rejects del último upload.
- **upload_desync > 14**: alguien dejó de subir uno de los dos CSVs hace tiempo. Pingear a quien hace los uploads.
- **last_upload_age > 14**: nadie ha actualizado data en 2+ semanas. Recordatorio.
- **cxc_sin_venta_correspondiente > 20**: hay un patrón sistémico — probablemente un cliente_codigo que existe en CXC pero no en ventas. Caso típico: Quality Shoes / cliente nuevo creado fuera del flow de ventas.

### WARNING — solo dashboard
- **cxc_uploads_zombie > 0**: header de upload sin filas. Limpiar con `DELETE FROM cxc_uploads WHERE id = ...`. Si recurrente, hay un crash silencioso en el upload.
- **cheques_criticos_null > 0**: alguien guardó un cheque sin monto o fecha_deposito desde la UI. Revisar `/cheques/nuevo`.
- **ventas_cliente_vacio > 0**: filas en ventas_raw con cliente vacío (debería ser imposible — el parser no las dejaría pasar).

### INFO — log nada más
- **prestamos_saldo_anomalo > 0**: empleado con saldo más negativo que -$100. Casi siempre es un préstamo mal capturado o devolución duplicada.

## Cómo agregar un check nuevo

1. **Definir el check en `src/lib/integrity-checks.ts`**:

```ts
async function checkMyNewIssue(): Promise<CheckResult> {
  const { count, error } = await supabaseServer
    .from("mi_tabla")
    .select("id", { count: "exact", head: true })
    .gt("campo_sospechoso", 100);

  if (error) {
    return checkError("mi_check_name", "mi_tabla", error.message);
  }

  const c = count ?? 0;
  return {
    check_name: "mi_check_name",
    table_name: "mi_tabla",
    severity: c === 0 ? "ok" : c < 10 ? "warning" : "critical",
    rows_affected: c,
    threshold_exceeded: c > 0,
    details: { threshold: { warning: "<10", critical: ">=10" } },
  };
}
```

2. **Sumarlo al runner**:

```ts
// En runAllChecks()
const grouped = await Promise.all([
  // ...checks existentes,
  checkMyNewIssue(),
]);
```

3. **No hace falta ALTER TABLE** — `data_integrity_checks` es genérica.

4. **Documentarlo acá**: agregar fila a la tabla "Los 9 checks" + sección "Reaccionar a una alerta".

## Correr checks manualmente

### Vía dashboard
1. Ir a `/admin/data-health`
2. Click en "Correr checks ahora" (auth via cookie de admin)
3. Resultado aparece en la tabla + queda persistido

### Vía curl (con CRON_SECRET)
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://fashiongr.com/api/cron/integrity-check | jq
```

### Vía SQL (sin correr nuevos checks, solo leer histórico)
```sql
-- Último resultado por check
SELECT DISTINCT ON (check_name)
  check_name, severity, rows_affected, checked_at
FROM data_integrity_checks
ORDER BY check_name, checked_at DESC;

-- Detalles de un check específico
SELECT details FROM data_integrity_checks
WHERE check_name = 'cxc_fecha_null'
ORDER BY checked_at DESC LIMIT 1;
```

## Troubleshooting de falsos positivos

- **`cxc_fecha_null` reporta "Saldo Anterior" o "Nota de Crédito"**: el filtro `comprobante NOT IN ('Saldo Anterior','Nota de Crédito')` ya los excluye. Si aparecen es porque vienen con casing distinto ("SALDO ANTERIOR", "Nota De Credito"). Normalizar en el parser o agregar al filtro.
- **`cxc_sin_venta_correspondiente` reporta clientes obvios**: ajustar el filtro `gap > 30 días` si es demasiado sensible. O agregar `WHERE cliente_codigo NOT IN (lista de excepciones)` para clientes legítimamente fuera del flow.
- **`upload_desync` siempre warning**: probablemente la rutina humana es CXC lunes / Ventas miércoles. Si es esperado, subir el threshold a >=14d o bajarlo a "info".
- **Check tira `severity: critical` con `details.error`**: la query falló (probablemente schema cambió). El check name + table_name del row de error indica qué arreglar.

## Email de alerta

Solo se manda cuando hay >=1 critical. Subject: `[fashiongr] Alerta integridad: X checks críticos`. Body con tabla de TODOS los checks (no solo los críticos) para dar contexto. From: `notificaciones@fashiongr.com`. To: `daniel@fashiongr.com`.

Warnings solos NO mandan email — quedan en el dashboard. Esto evita ruido en el inbox.

## Por qué un cron diario y no por evento

Los checks corren contra estado, no contra eventos. Un upload puede traer datos que pasen el parser pero rompan invariantes (ej: factura sin venta cruzada). Solo se ven al re-evaluar el dataset completo. El cron diario captura eso sin tener que invalidar tras cada mutación.
