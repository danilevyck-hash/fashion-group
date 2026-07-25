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
- **`maxDuration=800`** — es el TECHO del plan. La cuenta pasó a **Pro** el
  25-jul-2026; con Fluid Compute el tope sube de 300s a 800s. (Bajo Hobby el
  valor `800` se rechazaba en deploy, y por eso este archivo describía 300s.)
  El diseño budget-aware + 3 pasadas/día se mantiene igual — más presupuesto por
  pasada, misma red de seguridad.
- **Serial por empresa** (token único de Switch — un 2º login por empresa mata el
  1º). Orden por empresa: facturas → estadocuenta → costo (reusa el token).
- **Presupuesto de tiempo** (`RECOVERY_BUDGET_MS=740_000`, 60s de margen bajo el
  techo de 800s): deja de **arrancar** trabajo nuevo pasado el umbral; lo ya
  iniciado termina. Lo no arrancado lo toma la siguiente pasada.
- **Multi-pasada**: **3 entradas de cron separadas (10:00, 14:00, 18:00 UTC)**, cada
  una corre 1×/día. En una mañana mala, la 1ª recupera lo que entre en presupuesto;
  las siguientes terminan el resto. Todas idempotentes (upserts) → re-correr es
  seguro. (Bajo Hobby una expresión multi-hora `10,14,18` fallaba el deploy; con
  Pro ya es válida y las 3 entradas se podrían fusionar en una — está en el plan
  Pro como P2, no se hizo en este cambio.)
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

## Ancla de ocurrencia para los slots intradía (jul-2026)

Los tres defectos medidos el 25-jul-2026 tenían la MISMA raíz: la reconciliación
razona por **par** (empresa, sync_type) contra el **día Panamá**. Correcto para
un cron diario; ciego para uno **intradía**, cuyo trabajo es "refrescar otra vez
lo mismo" — el par ya tiene el success de la mañana.

| # | Síntoma medido | Por qué nadie lo vio |
|---|---|---|
| 1 | `facturas-1500` (ventas ACS) perdió su invocación en el deploy de las 15:00. Ventas sin refrescar 06:52 → 23:15 (16.4h) | El par `american_classic/facturas` tenía success de 05:09 y 06:52 → la reconciliación de las 18:00 lo vio sano. `slotsHuerfanos` tampoco lo certificaba (regla 4), pero nadie lo **re-ejecutaba** |
| 2 | `fashion_shoes/estadocuenta` 16:20 `statement timeout`; `fashion_wear` y `active_wear` colgados en `running` hasta las 21:1x | La invocación **murió** sin llegar a `alertSwitchCronErrors` → cero filas en `cron_email_errors`, cero Telegram. Y el success de las 10:28-10:30 tapaba el par |
| 3 | `switch-sync:all-0540` sin fila de heartbeat propia desde que se introdujeron los slots (#239, 23-jul 14:08 UTC) | Su entrada corrió y **falló** el 24-jul (joystep, auth devolvió HTML) y el 25-jul Vercel perdió la invocación: dos oportunidades, dos malas. La regla seed-tolerante ("fila ausente = aún no sembrada") **no tenía vencimiento** → invisible para health-crons Y para el watchdog (que solo recorre filas existentes) |

**Fix**: `clasificarSlots()` en `cron-telemetry.ts` cambia la pregunta de "¿el par
tuvo success hoy?" a **"¿hay un success POSTERIOR a MI ocurrencia?"**. Devuelve
`cubiertos` (huérfano con el trabajo al día → marca `#recuperado`, sin alarma) y
`desatendidos` (el trabajo de esa ocurrencia NO está hecho → re-ejecutar sus
pares aunque tengan un success previo del día, y reportar si corrió y falló).
`slotsHuerfanos()` queda como wrapper: su semántica no cambió.

Opciones descartadas:

- **Marcar los slots como "intradía" en `SWITCH_CRON_ENTRADAS` y darles una regla
  propia**: sería una segunda fuente de verdad que mantener sincronizada, y no
  arregla nada — `all-0535` y `all-0540` (matutinos, "diarios") se perdieron el
  mismo día con el mismo síntoma. El ancla de ocurrencia es uniforme y no
  necesita el flag.
- **Bajar la ventana de jitter o agregar más pasadas de reconciliación**: ataca
  el síntoma, cuesta invocaciones y sesiones de Switch todos los días.

Cuidados de costo y seguridad, verificados con tests:

- **Día sano = no-op total** (cero llamadas a Switch): si cada entrada corrió y
  dejó sus pares al día, no hay `desatendidos` ni `cubiertos`.
- **Ventana de jitter** (`SLOT_RUN_WINDOW_MIN`=120 min) para `sin-invocacion`: no
  adelantarse a una entrada que Vercel puede invocar tarde. NO aplica a
  `corrio-y-fallo` (ya no hay a quién esperar) — si aplicara, la ronda de las
  16:0x quedaría otra vez sin reportar, porque su única pasada posterior (18:00)
  cae dentro de sus 120 min.
- **Guarda de concurrencia**: una fila `running` más joven que `RUNNING_STALE_MIN`
  (30 min, misma constante que el lock de `switch_sync_log`) congela el slot — no
  se re-ejecuta encima de una corrida viva (sesión única + índice mutex).
- **Sesión única**: los pares de slot se suman al MISMO mapa por empresa que los
  pares faltantes → la recuperación sigue serial y con un solo token por empresa.
- **Anti-ruido**: el reporte de `corrio-y-fallo` delega en `alertSwitchCronErrors`
  (401/red/5xx siguen silenciándose a la 1ª y escalando a las 2 corridas
  consecutivas; un `statement timeout` no es silenciable → alerta ya) y hace
  dedup contra `cron_email_errors` para no duplicar lo que el route ya alertó.
- **Gracia de siembra acotada**: marca `switch-sync:<slot>#visto` (insert-if-absent,
  nunca se pisa) + `SLOT_SEED_GRACE_HOURS`=50h. Un slot que nunca logró un
  success propio deja de ser invisible.

Pendiente relacionado (NO tocado aquí): `tommy-catalogo` corre 17:40 y toca
`fashion_shoes`; la pasada de reconciliación de las 18:00 queda a 20 min, por
debajo de la regla de ≥50 min de la sesión única. Es previo a este cambio (la
reconciliación ya podía recuperar pares de fashion_shoes a las 18:00), pero ahora
se activa más seguido. Mover uno de los dos horarios requiere tocar `vercel.json`
+ `SWITCH_CRON_ENTRADAS` + `RECONCILIACION_PASS_HOURS`.

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
