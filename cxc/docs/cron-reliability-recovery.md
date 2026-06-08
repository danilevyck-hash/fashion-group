# Confiabilidad de crons Switch — recuperación durable

## Problema

El scheduler de Vercel **pierde invocaciones de cron** (best-effort: sin retry, sin
recuperación de invocaciones perdidas, sin garantía de horario). El 7-jun-2026
pasó dos veces el mismo día: 3 de 4 crons de `switch-sync` + `sync-utilidad` +
`sync-clientes-master` murieron **sin dejar ni una fila** (ni `running`) → las
funciones nunca se ejecutaron. Recuperadas a mano.

La reconciliación existente (10:00 UTC) **alertaba pero no recuperaba**, por 3
defectos estructurales:

1. Recuperaba por **self-fetch** (`fetch(${origin}/api/cron/switch-sync?...)`) → si
   el caller muere, el request en vuelo se cae con él.
2. **Excedía su propio `maxDuration=300`**: 6 empresas × ~200s en lotes de 2 → la
   mataban a media recuperación.
3. **Cobertura parcial**: solo switch-sync; no cubría utilidad/clientes-master/
   recibos/articulos.

## Diseño (Fase 0 + Fase 1 — aprobado por Daniel, Opción 1)

Recuperación **in-process, idempotente, multi-pasada, cobertura total**. Sin infra
nueva (sigue 100% en Vercel). Fase 2 (scheduler externo pg_cron/QStash) queda para
evaluar después.

### Reconciliación endurecida (`/api/cron/switch-reconciliacion`)

- **In-process**: llama las funciones de sync directamente (`syncEmpresaFacturas/
  EstadoCuenta`, `syncCostoDiario`, `syncAllUtilidad`, `syncAllRecibos`,
  `syncArticulosDiario`, `syncClientesMaster`) — **sin self-fetch**. Elimina el
  fallo "el caller muere y el callee no sobrevive".
- **`maxDuration=300`** — es el TECHO del plan. La cuenta está en **Hobby**
  (descubierto al fallar el deploy con la regla cron once-per-day): Hobby con
  Fluid Compute permite hasta 300s; `800` se rechaza en deploy. El diseño
  budget-aware + 3 pasadas/día absorbe el menor presupuesto por pasada.
- **Serial por empresa** (token único de Switch — un 2º login por empresa mata el
  1º). Orden por empresa: facturas → estadocuenta → costo (reusa el token).
- **Presupuesto de tiempo** (`RECOVERY_BUDGET_MS=760_000`): deja de **arrancar**
  trabajo nuevo pasado el umbral; lo ya iniciado termina. Lo no arrancado lo toma
  la siguiente pasada.
- **Multi-pasada**: **3 entradas de cron separadas (10:00, 14:00, 18:00 UTC)**, cada
  una corre 1×/día (requisito Hobby: una expresión multi-hora `10,14,18` falla el
  deploy). En una mañana mala, la 1ª recupera lo que entre en presupuesto; las
  siguientes terminan el resto. Todas idempotentes (upserts) → re-correr es seguro.
- **Cobertura total**:
  - switch-sync (facturas/estadocuenta/costo): detección **por par** vía
    `switch_sync_log` (las funciones escriben ahí; re-query = fuente de verdad).
  - colaterales (clientes-master, utilidad, recibos, articulos): detección **por
    heartbeat** (`cron_heartbeats.last_success_at` sin success hoy). Al recuperar
    OK, la reconciliación **registra el heartbeat** del colateral (las funciones
    lib no lo tocan) para que el watchdog no alerte después.
- **Watchdog** (`checkStaleCrons`, 30h sin success → Telegram): se mantiene como
  **última alerta humana** si hasta la recuperación falla.
- **Telegram**: recuperó todo → info; algo sigue mal / sin tiempo → alerta; sano
  desde el inicio → silencio.

### Extracción `sync-clientes-master`

La lógica estaba inline en el route. Se extrajo a
`src/lib/switch-api/sync-clientes-master.ts` (`syncClientesMaster()`) para poder
invocarla in-process. El route quedó como caller de producción (auth + heartbeat +
mapeo HTTP); la lógica vive una sola vez.

## Fuera de alcance / decisiones

- **`multifashion-sync` NO se auto-recupera**: no registra heartbeat → sin señal
  fiable. Su data igual entra por `american_classic` en switch-sync (cubierto).
  Candidato a follow-up (agregarle heartbeat primero).
- **"Horarios redundantes" (stopgap Fase 0)**: se interpretó como las **3 pasadas
  in-process** de la reconciliación (re-ejecutan el trabajo faltante hasta 3× más
  al día, idempotente, **solo cuando falta** — cero desperdicio en días sanos), en
  vez de **duplicar los 4 schedules crudos de switch-sync** (que re-pegarían a
  Switch todos los días aunque esté sano). Si se prefieren los schedules duplicados
  literales además, es un cambio de una línea en `vercel.json`.
- **Fase 2 (scheduler externo)**: pendiente de evaluación. Movería el *disparo* de
  la reconciliación a pg_cron+pg_net o QStash para que la red de seguridad no
  dependa del mismo scheduler que falla.

## Verificación

- Idempotencia confirmada en producción (incidente 7-jun: re-corridas mostraron
  `updated`, cero duplicados).
- Gate: `tsc --noEmit` + `vitest` + `next build` (este último con `.env.local` del
  repo principal — los worktrees no lo tienen; ver [[project_fg_git_worktrees]]).
- PR sin merge — toca el backbone de datos; Daniel valida el preview antes de
  mergear.
