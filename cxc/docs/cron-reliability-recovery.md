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
- **Ventana de jitter** (`SLOT_RUN_WINDOW_MIN`=**30 min**) para `sin-invocacion`:
  no adelantarse a una entrada que Vercel puede invocar tarde. NO aplica a
  `corrio-y-fallo` (ya no hay a quién esperar).
  - **120 → 30 el 26-jul-2026, con la cuenta ya en Pro.** El 120 venía del jitter
    de Hobby: retraso del primer run de cada slot medido en `switch_sync_log` del
    20-24 jul → p50 28.7 min, p90 55 min, máx 58.4 min. Bajo Pro el disparo es
    puntual — en las ocurrencias del 25/26-jul el primer run arrancó a +1s
    (`estadocuenta-2110` 21:10:01), +13s (2115), +22s (2120), +32s
    (`facturas-2315` 23:15:32) y +40s (`facturas-0015` 00:15:40); la deriva que
    se ve en el heartbeat (23:15:39, 00:15:47) es la **duración** del sync, no
    retraso de disparo. El slot más largo termina entero en ~4 min.
  - **Por qué el 120 era dañino:** tapaba pérdidas reales. La ronda de las 16:0x
    tiene UNA sola pasada de reconciliación después (18:00); con 120 min las
    ocurrencias de 16:05 y 16:10 vencían recién 18:05/18:10 → ese día no se
    re-ejecutaban nunca. Con 30 vencen 16:35/16:40 y la pasada de las 18:00 sí
    las atiende.
  - **Por qué 30 y no 20:** los slots `all` (05:30/05:35/05:40/06:30) hacen
    facturas+estadocuenta+costo de dos empresas y son los únicos sin muestra bajo
    Pro todavía; bajo Hobby su duración medida fue de 2 a 5 min. 30 deja ~5x de
    margen y coincide con `RUNNING_STALE_MIN` (una corrida más vieja que eso ya
    se considera muerta en el resto del sistema).
  - Verificado contra el incidente REAL del 25-jul: la ronda de las 16:0x arrancó
    a +15/+29 min y con la ventana de 30 sigue clasificando `corrio-y-fallo`
    (tests D2 de `cron-slots-intradia.test.ts`, intactos).
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
`fashion_shoes`; la pasada de reconciliación de las 18:00 queda a 20 min, y el
sync de Tommy mide hasta 433 s → el margen real es de ~13 min. Es previo a este
cambio (la reconciliación ya podía recuperar pares de fashion_shoes a las 18:00),
pero ahora se activa más seguido. Mover uno de los dos horarios requiere tocar
`vercel.json` + `SWITCH_CRON_ENTRADAS` + `RECONCILIACION_PASS_HOURS`.

## Paso 1 del calendario nuevo (26-jul-2026) — ventas y pagos intradía

Las ventas B2B se sincronizaban **1×/día**, dentro del bloque `tipo=all` de la
madrugada: el dato más importante del negocio podía tener 24 h. Este paso lo baja
a 4 h en horario de oficina. **Los saldos de CXC (`estadocuenta`) NO se tocaron**
—es el paso 2— a propósito: cuestan 101/121/152 s por empresa (p50/p90/máx)
contra 4-8 s de `facturas`, y son los que el 25-jul reventaron la base con
`canceling statement due to statement timeout`.

### Calendario resultante (UTC · Panamá)

| UTC | Panamá | Qué | Empresas |
|---|---|---|---|
| 15:00 · 19:00 · 23:00 | 10:00 · 14:00 · 18:00 | **Ventas** (`tipo=facturas`) | las 8 con facturas = ACS + las 7 B2B |
| 13:00 · 17:00 · 21:00 | 08:00 · 12:00 · 16:00 | **Ventas ACS** | american_classic |
| 00:15 | 19:15 | Cierre de ACS — **NO TOCAR** (el resumen de la 01:00 depende de él) | american_classic |
| 07:50 · 15:15 · 19:15 · 23:15 | 02:50 · 10:15 · 14:15 · 18:15 | **Pagos** (`sync-recibos`) | las 5 B2B con CXC + ACS |

Entradas de `vercel.json`: **47 → 52**. Límite del plan Pro: 100.

### Tres cosas que se verificaron, no se asumieron

1. **`switch-sync?tipo=facturas` SÍ acepta `&empresas=a,b,c`** (CSV, con
   precedencia sobre `&empresa=` singular) y procesa las empresas
   **serialmente** — requisito de la sesión única. Universo validado contra
   `empresasConFacturas()`, así que las 8 pasan.
2. **`sync-recibos` NO tiene guard no-op.** Sus 3 entradas no eran "segundas
   oportunidades" como las de `backup`/`acs-fidelizacion`: son 3 corridas REALES
   que re-sincronizan la ventana rodante de 3 meses. Por eso mover sus horas
   cambia la frescura de verdad. Su heartbeat es plano (sin `slot=`): lo vigila
   `COLATERAL_RECOVER_AFTER_HOUR_UTC["sync-recibos"] = 0` (recuperable en
   cualquier pasada) y NO está en `EXTRA_ENTRY_HOURS_UTC`, así que cambiarle las
   horas no toca la metadata de recuperación.
3. **Las 7 B2B** = `empresasConFacturas()` menos `american_classic` = vistana,
   fashion_wear, fashion_shoes, active_shoes, active_wear, joystep y
   **confecciones_boston** (que tiene `facturas:true`, `cxc:false`).

### Por qué NO están en las horas pedidas originalmente

Se pidieron 09:00/13:00/17:00 Panamá = **14:00/18:00/22:00 UTC**. 14:00 y 18:00
son EXACTAMENTE las pasadas de `switch-reconciliacion`, que puede abrir la sesión
de cualquier empresa hasta 12 min (`RECOVERY_BUDGET_MS` = 740 s). Se corrió todo
una hora → 15:00/19:00/23:00 UTC.

### Choque encontrado y corregido: dos entradas ≠ dos slots

El plan original tenía **entradas separadas** para ventas B2B y ventas ACS a las
mismas horas (15/19/23), con el argumento de que tocan empresas disjuntas. Eso es
cierto para la sesión de Switch, pero **rompe el sistema de slots**: el nombre del
slot es `<tipo>-<hhmm>` y se DERIVA del horario, así que dos entradas de
`tipo=facturas` a las 15:00 producen las dos el slot `facturas-1500`. Con el
nombre duplicado:

- `SWITCH_SYNC_SLOT_HEARTBEATS` tendría el mismo nombre dos veces y las dos
  entradas escribirían/pisarían el MISMO heartbeat,
- `clasificarSlots()` evaluaría el slot dos veces con universos de empresas
  distintos → re-ejecuciones espurias,
- y `slotsHuerfanos` dejaría de poder decir **cuál** de las dos ocurrencias se
  perdió, que es justo lo que el 25-jul detectó 3 slots caídos.

Solución: a las 15/19/23 va **UNA entrada con las 8 empresas**
(`american_classic` primero, luego las 7 B2B). Es idéntico en efecto —las mismas
empresas a las mismas horas, serial dentro del route— y conserva el invariante
**una entrada = una ocurrencia = un slot**. Un test nuevo lo fija
(`no hay dos entradas de switch-sync del mismo tipo a la misma hora`).

Por la misma razón **no se usan listas de horas** (`0 15,19,23 * * *`), que Vercel
Pro sí acepta: una entrada con 3 ocurrencias diarias vuelve indistinguibles las
tres. Hay un test que rechaza cualquier `schedule` con lista o rango en hora o
minuto.

### Efecto colateral cerrado: slots retirados que alertan para siempre

Mover `facturas-2315` → `facturas-2300` deja la fila
`switch-sync:facturas-2315` en `cron_heartbeats` envejeciendo sin dueño.
`health-crons` no la ve (vigila la lista derivada de `SWITCH_SYNC_SLOTS`), pero el
**watchdog Telegram de la reconciliación recorre TODAS las filas** → habría
alertado todos los días por un cron que ya no existe. Se agregó `esSlotRetirado()`
en `cron-telemetry.ts` y su filtro en `checkStaleCrons`. Es código, no limpieza
manual de datos: el próximo cambio de horario ya queda cubierto.

### Separación mínima: 50 → 15 min

`SEPARACION_MINIMA_MIN = 15`. El 50 venía de cuando el bloque `tipo=all` (2
empresas × facturas+estadocuenta+costo, 2-5 min) era la única referencia. Con las
duraciones medidas —facturas 4-8 s/empresa, costo 1-2 s— una corrida de ventas de
las 8 empresas termina en ~1 min y cierra sus sesiones
(`logoutAllSwitchSessions()` en el `finally` del route). Los pagos van 15 min
después de las ventas porque sí comparten 6 empresas.

`src/__tests__/lib/cron-calendario.test.ts` recorre los **417 pares** de
`SWITCH_CRON_ENTRADAS` que comparten al menos una empresa y falla si alguno queda
por debajo del umbral. Mide **inicio contra inicio**, así que para los crons
LARGOS el margen real es menor y esas parejas se dejaron a ≥50 min a propósito.
Los pares más ajustados del calendario nuevo:

| Gap | Par | Estado |
|---|---|---|
| 15 min | ventas 15/19/23 → pagos 15:15/19:15/23:15 | por diseño (ventas duran ~1 min) |
| 20 min | tommy-catalogo 17:40 → reconciliación 18:00 | **pre-existente**, ver arriba |
| 30 min | sync-proveedores 09:30 → reconciliación 10:00 | pre-existente |
| 30 min | acs-fidelizacion 16:30 → ventas ACS 17:00 | nuevo, benigno: la de 16:30 es no-op si la de 11:30 salió bien; en el peor caso topa en `maxDuration` 800 s → termina 16:43 |

### Frescura recalculada

El hueco más largo entre dos refrescos consecutivos del mismo dato, dando la
vuelta al día:

| Dato | Antes | Ahora (peor caso absoluto) | En horario laboral |
|---|---|---|---|
| Ventas B2B | 24 h | **9 h 30** (05:3x → 15:00) | **4 h** |
| Ventas ACS | 8 h 30 | **6 h 30** (06:30 → 13:00) | **2 h** |
| Pagos | 12 h 20 | **8 h 35** (23:15 → 07:50) | 4 h |
| Saldos CXC | 10 h 40 | 10 h 40 (sin cambio — paso 2) | 5 h |

**Corrección al cálculo del plan**: el peor caso de ventas B2B no baja a 4 h sino
a **9 h 30**, y el de ventas ACS no baja a 2 h sino a **6 h 30**. Los números de 4
h y 2 h son el ritmo DENTRO de la ventana de trabajo; el hueco largo es el
nocturno, entre el bloque `all` de la madrugada y la primera pasada de la mañana
(15:00 UTC = 10:00 Panamá). Si se quisiera un peor caso absoluto de 4 h habría que
agregar una pasada de ventas ~11:00 UTC (06:00 Panamá) — **no se hizo**: nadie
consulta a esa hora y cada pasada cuesta sesiones de Switch. Queda como opción
para el paso 2. El cálculo de pagos (12 h 20 → 8 h 35) sí da exacto.

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
