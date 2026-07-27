# Si la app se pone lenta o se cae

Guía de 5 pasos. No hace falta saber programar. Empezá por el paso 1 y seguí en orden.

> **Contexto:** el 26 de julio de 2026 la base de datos se ahogó y la app estuvo caída
> 1 hora y 16 minutos (de 5:41 p.m. a 6:57 p.m. hora de Panamá). Tardamos horas en
> entender por qué. Con el plan Pro ahora hay **7 días de historial** para verlo en
> minutos. Esta guía es ese camino.

---

## Paso 1 — Mirá el aviso de Telegram

Desde el 27 de julio hay un vigía que revisa la base **cada 2 horas** y avisa al canal
de Telegram ANTES de que se caiga. Buscá un mensaje que empiece con:

- 🟡 **La base de datos se está apretando** — todavía funciona, pero hay que actuar.
- 🔴 **La base de datos está al límite** — se va a caer o ya se cayó.
- 🔴 **No se puede leer el estado de la base de datos** — la base no responde.

El mensaje te dice **qué** está apretado (memoria, disco, tamaño, conexiones). Anotalo
y seguí al paso 3 con ese dato.

**Si no hay ningún mensaje de Telegram**, el problema probablemente NO es la base
(puede ser Vercel, internet, o el ERP Switch). Seguí igual al paso 2.

---

## Paso 2 — Mirá el estado ahora mismo

Entrá desde tu navegador, ya logueado como admin, a:

```
https://fashiongr.com/api/cron/db-salud?test=true
```

Devuelve un texto con números. Los que importan:

| Campo | Qué significa | Está bien si… |
|---|---|---|
| `nivel` | El veredicto | dice `ok` |
| `memoriaDisponiblePct` | Memoria libre | está arriba de 20 |
| `swapUsadoPct` | Memoria de emergencia en uso | está abajo de 40 |
| `discoDisponiblePct` | Espacio libre en disco | está arriba de 25 |
| `cargaPorNucleo` | Trabajo acumulado | está abajo de 1.5 |
| `conexiones` | Conexiones abiertas | está bien abajo de 60 |

En un día normal: memoria libre ~57, swap ~14, disco ~92, carga ~0.02, conexiones ~9.

Este paso **no manda nada a Telegram** — es solo mirar.

---

## Paso 3 — Entrá al panel de Supabase y mirá los gráficos

1. Andá a **https://supabase.com/dashboard** e iniciá sesión.
2. Elegí el proyecto **rspocgqhtpveytgbtler**.
3. En el menú de la izquierda buscá **Reports** y adentro **Database**.

Ahí ves gráficos de los **últimos 7 días** (con el plan Free eran solo 24 horas):

- **CPU usage** — si está pegado arriba, la base está trabajando de más.
- **Memory usage** — si está lleno, es lo que pasó el 26 de julio.
- **Disk IOPS** — cuánto lee y escribe el disco.
- **Disk size** — cuánto pesa la base.
- **Database connections** — cuántas conexiones abiertas hay.

**Qué buscar:** el momento exacto en que la línea se disparó. Fijate qué hora fue y
compará contra la tabla de crons del `CLAUDE.md` para ver qué estaba corriendo.

---

## Paso 4 — Buscá el error exacto en los registros

Mismo panel de Supabase, menú de la izquierda:

1. **Logs & Analytics** → elegí **Postgres Logs** (errores de la base) o
   **API Logs** (errores de las llamadas de la app).
2. Arriba a la derecha hay un selector de rango de tiempo: ponelo en la hora que
   encontraste en el paso 3.
3. Guardá 7 días de historial, así que podés mirar hacia atrás toda la semana.

Errores típicos y qué significan:

| Lo que dice el log | Qué significa |
|---|---|
| `canceling statement due to statement timeout` | Una consulta tardó demasiado. La base está sobrecargada. |
| `521 Web server is down` | La base no está respondiendo. Es la caída. |
| `too many connections` | Se acabaron las conexiones. |
| `out of memory` | Se acabó la memoria. |

Si querés buscar algo puntual, usá **Logs Explorer** (mismo menú) y escribí la palabra
en el buscador.

**Bonus:** **Advisors** → **Query Performance** te muestra las consultas más lentas
del proyecto. Sirve para saber QUÉ hay que arreglar, no solo que algo está mal.

---

## Paso 5 — Qué hacer según lo que encontraste

| Lo que viste | Qué hacer |
|---|---|
| **Memoria llena** o **CPU al 100%** | Subir el compute. Panel de Supabase → **Project Settings** → **Compute and Disk** → subir de **Micro** al siguiente escalón. Cuesta plata pero es un botón y tarda unos minutos (la base se reinicia). |
| **Se llenó por un cron pesado** | Correr menos seguido el cron culpable, o moverlo fuera del horario de oficina. La tabla de crons está en `cxc/CLAUDE.md`. |
| **Disco lleno** o **base cerca de 8 GB** | Hay que borrar o archivar datos viejos. Avisar para revisar qué tabla creció. |
| **Consultas lentas** (Query Performance) | Falta un índice o una consulta está mal escrita. Es trabajo de código, no de configuración. |
| **No encontrás nada y la app anda bien** | Puede haber sido un problema pasajero de Supabase. Mirá **https://status.supabase.com**. |

### Si la app está caída AHORA y hay que levantarla ya

1. Confirmá que es la base: abrí `https://fashiongr.com` — si da 521, es la base.
2. Panel de Supabase → **Project Settings** → **Compute and Disk** → subir un escalón
   de compute. Eso reinicia la base y casi siempre la destraba.
3. Si el panel de Supabase tampoco carga, es un problema de ellos:
   **https://status.supabase.com** y esperar. No hay nada que tocar de nuestro lado.

---

## Lo que hay que saber sí o sí

- **Los backups de Supabase están adentro de Supabase.** Si el proyecto se pierde o se
  corrompe, se pierden con él. La copia que está **afuera** es la de Cloudflare R2, que
  escribe el cron `/api/cron/backup`. Esa es la red de verdad.
- **Para ver qué backups hay:** desde la carpeta `cxc/`, correr
  `node scripts/restore.mjs --list --source r2`. Solo las fechas que dicen **OK** se
  pueden restaurar enteras.
- **El vigía de recursos no depende de la base.** Lee las métricas por HTTP y escribe a
  Telegram directo. Por eso sigue avisando cuando todo lo demás se queda mudo — el
  26 de julio la caída no dejó ni un solo registro de error, porque los errores se
  guardaban en la misma base que se había caído.

## Dónde está cada cosa en el código

| Qué | Archivo |
|---|---|
| El vigía (ruta del cron) | `src/app/api/cron/db-salud/route.ts` |
| Los umbrales que disparan el aviso | `src/lib/db-recursos.ts` |
| Horarios del vigía (cada 2 h, al minuto :25) | `vercel.json` |
| El backup a R2 | `src/app/api/cron/backup/route.ts` |
| Restaurar desde un backup | `scripts/restore.mjs` |
