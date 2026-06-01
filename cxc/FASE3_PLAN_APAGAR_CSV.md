# Fase 3 — Mapa + Plan para apagar el CSV manual

> **Documento de exploración. NO implementa nada.** Solo mapea dependencias y propone
> orden de migración para una sesión futura. Generado por exploración read-only.
>
> **Distinción clave:** "apagar el CSV manual" = dejar de **subir data nueva** por CSV
> (los endpoints `/api/cxc/upload` y `/api/ventas/upload` dejan de usarse). **NO** significa
> dropear `cxc_rows` ni `ventas_raw` — `ventas_raw` es el ÚNICO archivo del histórico
> pre-API y debe conservarse como tabla congelada.

---

## TL;DR (hallazgo principal)

1. **CXC ya está migrado.** Home, panel y detalle de cliente leen de `switch_estadocuenta_aging` (no de `cxc_rows`). El CSV de CXC se puede apagar **ya, con riesgo bajo**.
2. **Ventas está parcialmente migrado** vía vistas unificadas (`switch_ventas_unificado_vw`, `switch_costo_unificado_vw`) que mezclan switch (reciente) + ventas_raw (histórico). Varios consumidores ya leen switch; otros aún leen `ventas_raw` para data corriente y hay que verificarlos/migrarlos antes de apagar el CSV de ventas.
3. **`ventas_raw` no se puede borrar nunca.** Es el único origen del histórico pre-2025-05-02 (todas las empresas) y del costo pre-2026-05-01 (margen histórico) + retail american_classic Ene-Abr 2025.

### Boundaries de cobertura del sync API
| Fuente | Tabla switch | Cubre desde | ventas_raw cubre |
|---|---|---|---|
| Ventas (facturas) | `switch_facturas` | **2025-05-02** | `< 2025-05-02` |
| Costo diario | `switch_costo_diario` | **2026-05-01** | `< 2026-05-01` |
| CXC (estado de cuenta) | `switch_estadocuenta` → `switch_estadocuenta_aging` | snapshot vivo (4 crons `tipo=all`) | — (ya migrado) |

Boundary verificado en `20260530000800_fix_ventas_boundary_gap_2025_05_01.sql` (el 2025-05-01 fue feriado, 0 ventas → sin pérdida de datos en el corte).

---

## 1. home_dashboard_summary + KPIs de CXC

**Estado: YA MIGRADO a switch.**

- Definición vigente: `20260530000100_home_dashboard_summary_switch_estadocuenta_aging.sql`.
  - `cxcTotal = SUM(total) FROM switch_estadocuenta_aging`
  - `cxcVencida = SUM(d121_180 + d181_270 + d271_365 + mas_365) FROM switch_estadocuenta_aging`
- Versión anterior leía `cxc_rows` (`SUM(debito - credito)`, filtro `dias_vencidos >= 121`) — **ya reemplazada**.
- **Pero** el home también lee `ventas_raw` para los KPIs de **ventas** del mes en curso (`home_dashboard_summary` líneas ~90/94: `SUM(subtotal) FROM ventas_raw WHERE anio=? AND mes=?`) y `/api/home-stats` (`src/app/api/home-stats/route.ts:85`). ⚠️ Eso es consumo de ventas, no CXC — verificar si toma data corriente de ventas_raw (si sí, depende del CSV de ventas).
- KPIs de CXC del panel (`KpiCards.tsx`) se calculan client-side desde `useAdminData()` → `switch_estadocuenta_aging`, no del RPC.

**Mapa cxc_rows → switch_estadocuenta_aging:** buckets `d0_30…mas_365` y `total` existen en ambos con igual firma. Gap semántico: `cxc_rows.dias_vencidos` (días vencidos post-vencimiento) vs `switch_estadocuenta.dias` (edad desde creación) — el aging del view se basa en edad de creación. Decisión ya tomada y validada contra 6 paneles oficiales en fase CXC. **Sin gap bloqueante para los KPIs.**

## 2. Saldo en detalle de cliente (CXC)

**Estado: YA MIGRADO a switch.**

- `src/app/admin/hooks/useAdminData.ts:47` → `supabase.from("switch_estadocuenta_aging").select("*")`. **Único `.from()` de CXC; NO toca `cxc_rows`.**
- El detalle expandido (`ContactPanel.tsx`) NO hace fetch aparte — usa los buckets ya cargados en memoria desde `switch_estadocuenta_aging` (`client.companies[key].dXX`).
- Conclusión: el saldo por empresa/aging del cliente ya viene 100% de switch. `cxc_rows` no participa en la lectura del panel.

## 3. Consumidores de ventas_raw

> ⚠️ **Advertencia de versiones:** el inventario de migraciones incluye RPCs con múltiples
> versiones (`CREATE OR REPLACE` — gana la última corrida). Varias funciones `multifashion_*`
> fueron **redefinidas en `20260530000000` (fase 2.1b)** para leer de `_multifashion_sf_vw`
> (= `switch_facturas`), no de `ventas_raw`. **Antes de migrar cada RPC hay que confirmar su
> definición VIGENTE** (no asumir por el archivo más viejo). Lo de abajo marca lo que requiere
> verificación.

### YA en switch / vistas unificadas (data corriente NO depende del CSV)
- `ventas_dashboard_summary` → `switch_ventas_unificado_vw` + `switch_costo_unificado_vw`.
- `ventas_dashboard_prev_same_period` → unificado (ventas_raw solo en rama `< 2025-05-01`).
- `ventas_proyeccion_cierre_v6` → unificado + ventas_raw histórico.
- `multifashion_mensual_v6` / `multifashion_detalle_mensual_v1` → ventas/tickets de `_multifashion_sf_vw` (switch); ventas_raw SOLO para prev-year Ene-Abr 2025 (histórico).
- `/api/clientes/[codigo]/historial-mensual` → split explícito `fecha < SWITCH_START (2025-05-02)` (ventas_raw) + switch_facturas.
- `clientes_empresa_12m_vw` (`20260601000100`) → rama ventas_raw solo `<= 2025-05-01`.
- Resto de `multifashion_*` (vendedoras_v3, dia_a_dia_v4, retail_recurrentes, wholesale_clientes): **VERIFICAR** — fase 2.1b redefinió varias a `_multifashion_sf_vw`; confirmar la vigente.

### Lee ventas_raw para data CORRIENTE (depende del CSV → migrar antes de apagar)
- `/api/home-stats` (`:85`) y `home_dashboard_summary` (ventas del mes) — verificar si el mes corriente sale de ventas_raw o de switch.
- `/api/search` (`src/app/api/search/route.ts:~65`) — busca clientes en `ventas_raw` sin UNION a switch → **posible gap de resultados post-2025-05; VERIFICAR** (el agente lo marcó como bug; confirmar antes de afirmarlo).
- `/api/clientes/[codigo]` (`:53,62`) y `/app/clientes/[codigo]/page.tsx` (`:65,74`) — historial del cliente; verificar cobertura switch.
- `/api/ventas/años` (`:14`) y `lib/ventas/queries.ts` (`:377`) — bounds de años desde min/max de ventas_raw.
- `/api/ventas/metas-auto` (`:48`) — distribución del año anterior (puede ser histórico, OK).
- `get_ultima_compra()` (`ventas_ultima_compra_rpc.sql:6`) — última compra all-time, sin date guard → si se apaga el CSV, no ve compras nuevas salvo que pase a UNION switch.
- `clientes_anio()` / `clientes_12m_vw` / `clientes_ytd_materialized` — clientes por período; verificar si la ventana corriente sale de switch o ventas_raw (las materialized views son las más caras de migrar).

### HISTÓRICO puro (no migrable — ventas_raw es el único origen)
- Todo pre-2025-05-02 de TODAS las empresas (ventas) y pre-2026-05-01 (costo/margen).
- Retail american_classic Ene-Abr 2025 (solo en ventas_raw).
- `/api/cron/backup` (`:58`) — respaldo de ventas_raw (infra, se conserva).
- `lib/integrity-checks.ts` (`:152,261,327`) — checks de calidad + reconciliación cxc_rows↔ventas_raw (adaptar, no bloqueante).

## 4. Endpoints de upload

### `/api/cxc/upload` (POST) — escribe `cxc_uploads` + `cxc_rows`
- Lógica: DELETE `cxc_uploads` por empresa (CASCADE borra `cxc_rows`) → INSERT header → INSERT filas en lotes de 2000.
- Invocado SOLO por `src/app/upload/page.tsx` (tab CXC, `:398`). Roles admin/secretaria.

### `/api/ventas/upload` (POST) — escribe `ventas_raw`
- Lógica: UPSERT por `(empresa,tipo,n_sistema,fecha)`, lotes de 2000, dedupe last-write-wins. CSV/XLSX.
- Invocado SOLO por `src/app/upload/page.tsx` (tab Ventas, `:574`). Roles admin/secretaria.

### Quién más invoca / escribe
- **La página `/upload` es el único invocador en runtime.** Ya está **OCULTA del menú** (`src/lib/modules.ts:77-82`: "upload OCULTO — deprecado; el sync de Switch ya cubre la carga"). Sigue accesible por URL directa.
- Otros writers: `scripts/reupload-cxc-with-fix.ts` (backfill manual de `cxc_rows`) — script, no runtime.
- El cron `switch-sync` **NO** escribe cxc_rows ni ventas_raw — escribe `switch_facturas`, `switch_estadocuenta`, `switch_costo_diario`.

---

## 5. PLAN Fase 3 — orden de dependencias

### Paso 0 — CXC: apagar ya (riesgo bajo)
CXC ya no depende del CSV en ninguna lectura viva. Para apagarlo:
1. **Verificar** que el cron `tipo=all` (4 grupos) lleva ≥7 días corriendo success sin 0006 (post-fix de sesión única).
2. Confirmar que `integrity-checks` reconciliación cxc_rows↔switch no rompa al congelar cxc_rows (ajustar el check para que compare contra `switch_estadocuenta_aging` o se desactive ese check puntual).
3. Quitar el tab CXC de `/upload` (o bloquear el endpoint). `cxc_rows` queda como archivo congelado.
4. **Validación:** home `cxcTotal`/`cxcVencida` y panel CXC siguen mostrando los mismos números (ya leen switch). KPIs no cambian.

### Paso 1 — Ventas: cerrar gaps de lectura corriente (PRE-requisito para apagar)
Antes de apagar el CSV de ventas, cada consumidor de **data corriente** debe leer de switch (directo o vía vista unificada). En orden:
1. **Auditar la definición VIGENTE** de cada RPC `multifashion_*` y `clientes_*` (CREATE OR REPLACE — última gana). Marcar cuáles ya migró fase 2.1b y cuáles siguen en ventas_raw para el período corriente. *(Sin esto, el resto del plan es ciego.)*
2. **`/api/search`**: confirmar si busca solo ventas_raw (gap post-2025-05). Si sí, apuntar a una vista unificada o UNION switch. **Validar:** buscar un cliente con ventas solo post-may-2025 y ver que aparezca.
3. **`/api/home-stats` + home_dashboard_summary (ventas del mes)**: confirmar que el mes corriente salga de switch/unificado, no de ventas_raw.
4. **`/api/clientes/[codigo]` + page.tsx + clientes_anio/12m/ytd**: apuntar la ventana corriente a unificado. Las materialized views (`clientes_12m_vw`, `clientes_ytd_materialized`) son las más caras → convertir a función con UNION o crear versión unificada en paralelo.
5. **`get_ultima_compra`, `/api/ventas/años`, `lib/ventas/queries` (bounds)**: pasar a switch/unificado o UNION.
6. **Validación por consumidor:** para cada uno, comparar resultado leyendo CSV vs leyendo switch para un período post-2025-05 con data conocida. Deben cuadrar.

### Paso 2 — Apagar el CSV de ventas
Cuando todos los de Paso 1 lean corriente de switch:
1. Quitar tab Ventas de `/upload` (o bloquear `/api/ventas/upload`).
2. `ventas_raw` queda **congelada** como archivo histórico (pre-2025-05-02 ventas, pre-2026-05-01 costo). NO se dropea.
3. Las vistas unificadas siguen leyendo ventas_raw para el histórico → no se rompe nada viejo.

### Paso 3 — Limpieza final (opcional)
1. Retirar la página `/upload` y sus endpoints si ya nadie los usa (o dejarlos para backfill manual de emergencia).
2. Dropear versiones superseded de RPCs (`ventas_proyeccion_cierre_v3/v4/v5`, `multifashion_mensual_v2/v3/v4/v5`, etc.) que ya no se llaman — reduce ruido.
3. Mantener `cron/backup` respaldando ventas_raw/cxc_rows como archivo frío.

### Qué se puede apagar al final
| Artefacto | ¿Apagable? | Cuándo |
|---|---|---|
| Tab CXC de `/upload` + `/api/cxc/upload` | ✅ Sí | Paso 0 (ya) |
| Tab Ventas de `/upload` + `/api/ventas/upload` | ✅ Sí | Paso 2 (tras cerrar gaps) |
| Tabla `cxc_rows` | ⚠️ Congelar, no dropear | archivo |
| Tabla `ventas_raw` | ❌ NUNCA dropear | histórico permanente |
| Crons `switch-sync` (tipo=all) | ❌ Son la fuente nueva | se quedan |

---

## Riesgos / pendientes de verificar (NO confirmados en esta exploración)
1. **Definiciones vigentes de RPCs**: el inventario mezcla versiones; confirmar la última de cada `multifashion_*`/`clientes_*` antes de tocar.
2. **`/api/search`**: el agente lo marcó como "incompleto post-2025-05" — **verificar en vivo** antes de afirmarlo.
3. **home/ventas del mes corriente**: confirmar origen (switch vs ventas_raw).
4. **Cobertura de backfill switch_facturas**: hoy arranca 2025-05-02. Si algún consumidor corriente necesita meses anteriores, ventas_raw sigue siendo necesaria para ese consumidor (no solo como archivo).
