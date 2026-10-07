# Gastos está pausado — no es una falla, es una decisión de negocio

> Si estás leyendo esto porque el módulo **Gastos** (`/gastos-contabilidad`, pestaña *Gastos* ·
> Egresos Varios) muestra "pausado" en vez de un número, o porque Vista General y Rentabilidad
> dicen "Módulo pausado" / "Gastos pausado" para cada empresa: **no investigues esto como un
> bug**. Es exactamente lo que se apagó, y por qué, abajo.

## La decisión

Nadie registra egresos en Switch desde el **31-jul-2026** (Fashion Wear desde el **27-may-2026**).
Daniel lo comunicó el **7-oct-2026**, textual: **«Apaga gasto»**. No es una falla del sistema —
Switch sigue respondiendo bien— es que la contable (Yulissa) dejó de alimentar esa fuente.

Antes de esta pausa el cron bajaba el **año entero** cada día y renovaba `created_at`, así que el
sistema nunca se enteró de que no había nada nuevo: las alertas que debían avisar estaban calladas
por casualidad, no porque todo estuviera bien. El 7-oct-2026 se apagó la causa (el cron) y se
retiraron las alertas que se iban a disparar solas apenas el calendario las alcanzara — antes de
que lo hicieran, no después.

## Qué se apagó, exactamente

### 1. El cron de sincronización

**`sync-egresos-varios`** (`src/app/api/cron/sync-egresos-varios/route.ts`) corría todos los días a
las 10:35 UTC (05:35 a.m. Panamá), abriendo sesión web en Switch para las 7 empresas que no son
Confecciones Boston (`changesession=SI`, que expulsa a quien esté en el panel — a Daniel) y
reescribiendo el año completo enero-diciembre con filas idénticas.

Se retiró de tres lugares, los tres el mismo día:

- **`cxc/vercel.json`** — se borró la entrada `{ "path": "/api/cron/sync-egresos-varios", "schedule": "35 10 * * *" }`.
- **`cxc/src/lib/cron-telemetry.ts` › `SEED_TOLERANT_CRONS`** — se quitó la línea `"sync-egresos-varios"` (quedó un comentario fechado en su lugar).
- **`cxc/src/lib/cron-telemetry.ts` › `SWITCH_CRON_ENTRADAS`** — se quitó la entrada `{ cron: "sync-egresos-varios", hhmmUtc: "1035", empresas: CRON_EMPRESAS_EGRESOS }` y la constante `CRON_EMPRESAS_EGRESOS` (que solo servía para esa entrada).
- **`cxc/src/lib/cron-telemetry.ts` › `SYNC_TYPES_POR_CRON`** — se quitó la clave `"sync-egresos-varios": ["egresos_varios", "cuentas_contables"]`.

`esCronRetirado("sync-egresos-varios")` ya devuelve `true` solo por haber salido de
`SEED_TOLERANT_CRONS` (y nunca haber estado en `CRONS_FAIL_CLOSED`): no hizo falta tocar esa
función ni agregar un nombre a una lista aparte — el watchdog de Telegram deja de exigirle un
success reciente automáticamente.

**El route y la librería del sync NO se borraron** (`sync-egresos-varios.ts`,
`sync-cuentas-contables.ts`): siguen ahí para una corrida manual el día que haga falta, y para
reactivar el cron sin tener que reescribir nada.

### 2. Los dos avisos de Telegram que se iban a disparar solos

Ambos vivían en `src/lib/alertas/silencio-de-datos.ts` y se retiraron el mismo día, antes de que
sonaran:

- **`SYNCS_DE_UNIVERSO_COMPLETO`** — se quitaron las claves `egresos_varios: "Gastos"` y
  `cuentas_contables: "Gastos"` (alerta A: "un sync trajo cero donde siempre trae cientos").
- **`TABLAS_VIGILADAS`** — se quitó la entrada de la tabla `egresos_varios` (alerta B: "una tabla
  de negocio dejó de recibir escrituras", columna `created_at`, módulo "Gastos").

Por qué estas dos y no antes: el cron reescribía el año entero y renovaba `created_at` todos los
días, así que **A** nunca veía un cero (el mes ya cargado seguía con su número) y **B** nunca veía
la tabla quieta (se reescribía a diario). Con el cron apagado en la Tarea 1, `created_at` deja de
renovarse — y al cruzar el 1-ene-2027 la descarga del año nuevo habría vuelto vacía de cualquier
forma. Las dos se iban a disparar solas, y antes todavía, porque el cron ya no corre.

## Qué cambió en pantalla

- **`src/lib/egresos/gasto-mostrable.ts`** (Vista General y Rentabilidad, por empresa):
  - `ETIQUETA_SIN_GASTO_EGRESOS.sin_movimientos` → **"Gastos pausado"** (antes "Sin movimientos").
  - `ETIQUETA_SIN_GASTO_EGRESOS.sin_datos` → **"Módulo pausado"** (antes "Sin datos").
  - `textoSinGastoEgresos` para `sin_movimientos` y `sin_datos` → **"Registro de gastos pausado."**
    (antes "Sin egresos este mes. Último mes con movimientos: julio 2026." / "Este mes todavía no
    se ha traído de Switch."). Ya no cita el mes: durante una pausa indefinida esa fecha no es un
    dato útil, es una fecha fija que envejece mal.
  - Sin cambios: `no_automatico` ("Carga manual", Confecciones Boston) y `sin_gasto` ("Sin
    gastos", salió plata pero nada fue gasto) — no son parte de esta pausa.
- **`src/app/gastos-contabilidad/components/ResumenEgresos.tsx`** (módulo Gastos, pestaña Gastos):
  - `explicacionEgresos` para `sin_movimientos` y `sin_datos` → **"Registro de gastos pausado."**
    (antes "Sin egresos este mes." / "Este mes todavía no se ha traído de Switch.").
  - La píldora **"Cargado hasta julio 2026"** (`fraseAlDia`) se dejó tal cual a propósito: sigue
    siendo un hecho verdadero (hasta dónde llegó la última carga) y, junto al texto nuevo, se lee
    como "tenemos datos hasta julio; el registro está pausado" — no como un sistema atascado.

## Cómo reactivar todo, el día que Yulissa retome el registro en Switch

En orden, los cuatro pasos:

1. **Prender el cron.**
   - Devolver a `cxc/vercel.json` la entrada `{ "path": "/api/cron/sync-egresos-varios", "schedule": "35 10 * * *" }`.
   - En `cxc/src/lib/cron-telemetry.ts`: devolver `"sync-egresos-varios"` a `SEED_TOLERANT_CRONS`,
     devolver la entrada a `SWITCH_CRON_ENTRADAS` (con `CRON_EMPRESAS_EGRESOS = empresasConEgresosEnCron()` otra vez declarada), y devolver la clave a `SYNC_TYPES_POR_CRON`
     (`["egresos_varios", "cuentas_contables"]`). Los tres puntos tienen un comentario fechado
     7-oct-2026 que dice exactamente esto.
2. **Devolver las dos alertas de Telegram** en `cxc/src/lib/alertas/silencio-de-datos.ts`: la
   clave `egresos_varios` (y `cuentas_contables`) a `SYNCS_DE_UNIVERSO_COMPLETO`, y la entrada de
   `egresos_varios` a `TABLAS_VIGILADAS` (columna `created_at`, módulo "Gastos", horas:
   `HORAS_SIN_ESCRIBIR`).
3. **Devolver el texto de pantalla**: en `gasto-mostrable.ts` y `ResumenEgresos.tsx`, las ramas
   `sin_movimientos`/`sin_datos` que hoy dicen "pausado" — cada comentario fechado 7-oct-2026 en
   esos archivos dice la frase exacta que tenían antes.
4. **Correr la suite de pruebas** (`npm test` dentro de `cxc/`) y revisar los candados que se
   actualizaron el 7-oct-2026 con esta pausa (búscalos por `Daniel («Apaga gasto»)` o
   `7-oct-2026` en `src/__tests__/`): varios quedaron con la expectativa "retirado" y hay que
   devolverlos a su forma anterior, no solo revertir el código de producción.

No hace falta tocar la base de datos ni ninguna migración: nada se borró, solo se dejó de
programar y de vigilar.
