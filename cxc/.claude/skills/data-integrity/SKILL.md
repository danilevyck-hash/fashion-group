---
name: data-integrity
description: Sistema de monitoreo automático de integridad de datos. Cron diario que corre 6 checks vivos contra cheques, prestamos_movimientos, switch_estadocuenta y switch_facturas (los del CSV legacy ya se retiraron). Resultados en data_integrity_checks; dashboard /admin/data-health filtra por LIVE_CHECK_NAMES; alerta por email a daniel@ si hay críticos.
---

# Data Integrity Monitoring

Sistema preventivo que se asegura que los CSVs de Switch + uploads manuales
no introduzcan basura silenciosamente. Nació después del bug de Quality
Shoes (factura en CXC sin venta correspondiente) y el RPC home roto.

## Componentes

| Pieza | Path |
|---|---|
| Tabla histórica | `data_integrity_checks` (migration `20260524000000_data_integrity_checks.sql`) |
| Runner (6 checks vivos) + `LIVE_CHECK_NAMES` | `src/lib/integrity-checks.ts` |
| Endpoint cron | `src/app/api/cron/integrity-check/route.ts` |
| Endpoint para dashboard | `src/app/api/admin/data-health/route.ts` |
| Dashboard | `src/app/admin/data-health/page.tsx` |
| Cron schedule | `vercel.json` → `0 12 * * *` (7am Panamá) |

## Los checks

Los checks VIVOS son los que produce `runAllChecks()`. La fuente única de verdad
de esa lista es `LIVE_CHECK_NAMES` (exportada de `src/lib/integrity-checks.ts`);
el dashboard `/api/admin/data-health` filtra por ella para no mostrar el historial
stale de los checks legacy retirados.

| # | check_name | Tabla / fuente | Severity por threshold |
|---|---|---|---|
| 1 | `cheques_criticos_null` | cheques | 0=ok, >0=warning (monto o fecha_deposito NULL, no deleted) |
| 2 | `prestamos_saldo_anomalo` | prestamos_movimientos | 0=ok, >0=info (saldo<-100 derivado de movs aprobados) |
| 3 | `last_upload_age_cxc` | switch_estadocuenta (`synced_at`) | <7d=ok, 7-14=warning, >14=critical |
| 4 | `aging_tipos_sin_clasificar` | vista `switch_estadocuenta_tipos_sin_clasificar` | tipo nuevo sin saldo=warning, con saldo<>0=critical |
| 5 | `switch_facturas_continuidad` | vista `switch_facturas_cobertura_mensual` | 0=ok, >0 huecos interiores=warning (excluye ceros conocidos) |
| 6 | `aging_dias_anomalo` | vista `switch_estadocuenta_dias_anomalo` | 0=ok, >0 filas con `dias` NULL/negativo y saldo<>0=warning |

**Errores técnicos**: si un check no puede correr (query falla, schema cambió), queda como `warning` con `details.error` — no `critical`. Esto evita confundir "monitor roto" con "data corrupta" y no dispara email.

### Checks RETIRADOS (CSV legacy — histórico, no corren)

CXC migró del CSV manual a `switch_estadocuenta` (sync API). Estos checks del
pipeline CSV (`cxc_rows` / `ventas_raw` / `cxc_uploads`) **se retiraron del runner**
(última corrida ~05-jun-2026). Sus filas siguen en `data_integrity_checks` como
**archivo** (no se borran), pero el dashboard ya **no las muestra** (filtradas por
`LIVE_CHECK_NAMES`). No restaurar sin re-agregarlos a `runAllChecks` + la allowlist.

`cxc_fecha_emision_null` · `cxc_fecha_vencimiento_null` · `cxc_dias_vencidos_sin_fecha` · `cxc_sin_venta_correspondiente` · `cxc_uploads_zombie` · `upload_desync_cxc_ventas` · `last_upload_age_ventas` · `ventas_cliente_vacio` (+ el viejo `cxc_fecha_null` pre-split).

## Reaccionar a una alerta

### CRITICAL — email + dashboard rojo
- **last_upload_age_cxc > 14**: nadie sincronizó CXC (`switch_estadocuenta`) en 2+ semanas, o el sync de Switch está caído. Revisar los crons `switch-sync` / `switch-reconciliacion`.
- **aging_tipos_sin_clasificar con saldo<>0**: apareció un `tipo_comprobante` nuevo en `switch_estadocuenta` fuera de las whitelists de signo del aging y YA distorsiona CXC (subcuenta un débito o ignora un crédito). Clasificarlo (crédito vs débito) en una migration nueva.

### WARNING — solo dashboard
- **cheques_criticos_null > 0**: alguien guardó un cheque sin monto o fecha_deposito desde la UI. Revisar `/cheques/nuevo`.
- **switch_facturas_continuidad > 0**: empresa-mes interior sin filas en `switch_facturas` → el dashboard lo cuenta como $0 (indistinguible de mes futuro). Backfill con `scripts/switch-backfill.ts --tipo=facturas --empresa=X`. Si es un mes con cero ventas reales, agregarlo a `CONTINUIDAD_CEROS_CONOCIDOS`.
- **aging_dias_anomalo > 0**: filas de estado de cuenta con `dias` NULL/negativo y saldo → no entran a ningún bucket del aging, `cxcVencida` los subestima. Revisar `fechaCreacion`/`dias` en `switch_estadocuenta`.
- **aging_tipos_sin_clasificar sin saldo**: tipo nuevo apareció pero aún no pesa. Clasificarlo antes de que tenga saldo.

### INFO — log nada más
- **prestamos_saldo_anomalo > 0**: empleado con saldo más negativo que -$100 (calculado como `SUM(Préstamo+Responsabilidad) - SUM(Pago+Abono+Pago_responsabilidad)` sobre movimientos aprobados no deleted). Casi siempre es un préstamo mal capturado o devolución duplicada.

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

3. **Sumar el `check_name` a `LIVE_CHECK_NAMES`** (en el mismo archivo). Si no, el dashboard lo OCULTA (filtra por esa allowlist). El guard de `runAllChecks` avisa en logs si se te olvida.

4. **No hace falta ALTER TABLE** — `data_integrity_checks` es genérica.

5. **Documentarlo acá**: agregar fila a la tabla de checks vivos + sección "Reaccionar a una alerta".

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
WHERE check_name = 'aging_tipos_sin_clasificar'
ORDER BY checked_at DESC LIMIT 1;
```

## Troubleshooting de falsos positivos

- **`cxc_fecha_vencimiento_null` reporta Recibo / NC / Saldo Anterior**: el filtro `NOT IN ('Saldo Anterior','Nota de Crédito','Recibo')` ya los excluye. Si aparecen es por casing distinto en Switch ("RECIBO", "Nota De Credito"). Normalizar en el parser o agregar variantes al filtro.
- **`cxc_sin_venta_correspondiente` reporta clientes obvios**: ajustar el filtro `gap > 30 días` si es demasiado sensible. O agregar `WHERE cliente_codigo NOT IN (lista de excepciones)` para clientes legítimamente fuera del flow.
- **`upload_desync` siempre warning**: probablemente la rutina humana es CXC lunes / Ventas miércoles. Si es esperado, subir el threshold a >=14d o bajarlo a "info".
- **Check con `severity: warning` y `details.error`**: la query falló (probablemente schema cambió). El check name + table_name del row indica qué arreglar. No es data corrupta — es el monitor roto.

### Histórico de calibraciones

- 2026-06-07: **`LIVE_CHECK_NAMES` + filtro del dashboard.** El runner ya solo corre 6 checks (los del CSV legacy se habían retirado el 05-jun), pero el dashboard seguía mostrando ~9 check_name stale de `data_integrity_checks` dentro de la ventana de 30d (severidades congeladas engañosas, ej. `cxc_fecha_null=critical` del 13-may). Se exportó `LIVE_CHECK_NAMES` (fuente única de verdad) y `/api/admin/data-health` filtra por ella. `data_integrity_checks` queda INTACTA (historial = archivo). Agregar un check ahora exige sumarlo a la allowlist (guard en `runAllChecks` lo avisa).
- 2026-05-13: thresholds de `cxc_sin_venta_correspondiente` recalibrados de `0=ok, 1-5=info, 6-20=warning, >20=critical` a `0-20=ok, 21-50=info, 51-150=warning, >150=critical`. Razón: NDs/intereses/refacturación normal alcanzan ~50-100 sin ser anómalos. Solo volumen >150 sugiere pipeline roto.
- 2026-05-13: `cxc_fecha_null` split en `cxc_fecha_emision_null` (excluye solo `Saldo Anterior`) y `cxc_fecha_vencimiento_null` (excluye `Saldo Anterior`, `Nota de Crédito`, `Recibo`). Razón: Recibos son pagos sin vencimiento por naturaleza — quedaban marcados como anómalos.
- 2026-05-13: `prestamos_saldo_anomalo` reescrito para calcular saldo en runtime desde `prestamos_movimientos` (no existe columna `saldo` en `prestamos_empleados`). Razón: el query original siempre fallaba y el check tiraba CRITICAL por error técnico.
- 2026-05-13: `checkError` cambiado de `critical` a `warning`. Razón: un check técnicamente roto NO es data corrupta — separar señales para no disparar email cuando el monitor se rompe.

## Email de alerta

Solo se manda cuando hay >=1 critical. Subject: `[fashiongr] Alerta integridad: X checks críticos`. Body con tabla de TODOS los checks (no solo los críticos) para dar contexto. From: `notificaciones@fashiongr.com`. To: `daniel@fashiongr.com`.

Warnings solos NO mandan email — quedan en el dashboard. Esto evita ruido en el inbox.

## Por qué un cron diario y no por evento

Los checks corren contra estado, no contra eventos. Un upload puede traer datos que pasen el parser pero rompan invariantes (ej: factura sin venta cruzada). Solo se ven al re-evaluar el dataset completo. El cron diario captura eso sin tener que invalidar tras cada mutación.
