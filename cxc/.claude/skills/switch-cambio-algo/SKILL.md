---
name: switch-cambio-algo
description: Switch Soft cambió el formato de un reporte o movió un endpoint, y un módulo dejó de recibir datos. Libreto operativo probado tres veces en dos semanas (cartera de Boston 19-ago-2026, egresos varios 1-sep-2026, el cero silencioso del catálogo 12-ago-2026). Usar cuando un cron falla dos corridas seguidas, cuando un sync se anota success con cero filas donde siempre trae cientos, o cuando alguien dice que un módulo está vacío o congelado.
---

# Switch cambió algo

Switch Soft es un ERP externo del que no controlamos nada: cambia el formato de un reporte, mueve un endpoint o pega dos datos en una celda, sin avisar. Pasó **tres veces en dos semanas**. Siempre el mismo libreto, y siempre se vuelve a descubrir desde cero. Este es el libreto.

**Regla de oro:** medir primero, ver el archivo antes de arreglar, ensanchar el envoltorio sin aflojar el valor, y revisar qué se descarta en silencio. En ese orden.

---

## Paso 0 — Reconocer el síntoma

Cualquiera de estos tres:

1. **Dos corridas seguidas fallando del mismo par (empresa, `sync_type`).** Es la regla 2 de alertas de SISTEMA. Un fallo solo no cuenta: si el propio cron, la reconciliación o una segunda oportunidad lo recuperan, no se avisa.
2. **`status = success` con `records_inserted = 0`** donde ese par venía trayendo cientos. Es el modo más peligroso porque nadie mira un `success`. Lo caza `src/lib/alertas/silencio-de-datos.ts` (alerta A), pero solo para los syncs de universo completo.
3. **Un módulo que dejó de recibir datos** — «Gastos está vacío», «la cartera de Boston se congeló el 19». Suele llegar por boca de Daniel, no por una alerta.

⚠️ **Cero no siempre es malo.** `joystep` en `egresos_varios` trae 0 todos los días y está bien; `american_classic` no tiene artículos ni líneas de factura a propósito. Lo que importa es **que ese par cambió de comportamiento**, no el número absoluto.

---

## Paso 1 — Medir en `switch_sync_log`, antes de opinar

Tres datos y nada más: **última corrida buena · primer fallo · el `error_message` verbatim, por empresa**.

Herramienta lista (solo lectura, no abre sesión en Switch):

```bash
node scripts/_diag-egresos-log.mjs 2026-08-20
```

🩸 Con esta herramienta se diagnosticó la 2ª ola del 2-sep-2026 **sin abrir una sola sesión web en Switch**: el `error_message` guarda el motivo del PRIMER renglón que no se pudo leer, y ese motivo trae **la celda entera verbatim**. De ahí salió el formato nuevo.

Para cualquier otro `sync_type`, PostgREST directo (credenciales en `.env.local`, **solo GET**):

```bash
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/switch_sync_log?select=empresa_key,status,started_at,records_inserted,records_skipped,error_message&sync_type=eq.egresos_varios&order=started_at.desc&limit=40"
```

Columnas reales: `empresa_key · sync_type · status (running|success|error) · started_at · finished_at · records_inserted · records_updated · records_skipped · error_message (truncado a 2000) · skip_details (jsonb) · range_from · range_to · triggered_by`. **No existen columnas `rows_*`.** Se escriben solo desde `src/lib/switch-api/sync-log.ts` (`createSwitchSyncLog` / `finishSwitchSyncLog`).

**Lo que se busca es el corte limpio de fechas.** Así se vio el 2-sep:

```
2026-08-31T10:35  vistana   success  ins=378
2026-09-01T10:35  vistana   error    ins=0   Código de cuenta inválido: "6.03.98.00.00 - GASTO DE TARJETA DE CREDITO"
```

Verde hasta un día, rojo desde el siguiente, **en varias empresas a la vez, con el mismo mensaje** = cambió Switch. Si el corte es difuso, o solo una empresa, o coincide con un deploy, probablemente no fue Switch.

---

## Paso 2 — Descartar que sea nuestro

```bash
git log --since=2026-08-25 --until=2026-09-02 --oneline -- src/lib/egresos/ src/lib/switch-api/sync-egresos-varios.ts src/lib/contable/
git log -1 --format="%h %ad %s" --date=iso <commit>   # ¿el deploy fue antes o después del corte?
```

Si nadie tocó esos archivos en semanas y el corte cae en una fecha sin deploy, **no fuimos nosotros**. Al revés también: comparar la hora del corte (UTC) con la hora del commit **en UTC** antes de declarar que un arreglo no funcionó — un cron que corre a las 10:35 UTC y un fix commiteado a las 14:33 UTC no se cruzaron todavía.

---

## Paso 3 — 🔴 Ver el archivo real antes de arreglar

Nunca calibrar un parser contra un formato que no se vio.

Los endpoints de diagnóstico **bajan y parsean sin escribir una sola fila**:

| Ruta | Qué hace | Auth |
|---|---|---|
| `/api/diag/egresos-varios` | Baja Egresos Varios, lo parsea y lo cuenta. Devuelve `renglones`, `total`, `cuentasDistintas`, `montoMaximo`, `erroresParseo` y **`primerosErrores`** (los 5 primeros). Params obligatorios: `empresas` (UNA), `desde`, `hasta` | `Authorization: Bearer $CRON_SECRET` |
| `/api/diag/canales-telegram` | A qué bot y chat va cada canal. Read-only de verdad | `Bearer $CRON_SECRET`, `?secret=`, o cookie de admin |

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.fashiongr.com/api/diag/egresos-varios?empresas=vistana&desde=2026-08-01&hasta=2026-09-01"
```

⚠️ **Esto expulsa a Daniel del panel de Switch.** El login web usa `changesession="SI"` (`src/lib/switch-api/web-client.ts:178`), y Switch admite **una sola sesión por empresa**: toma la sesión y saca a quien esté adentro. Además, los crons que tocan esa misma empresa van a **≥15 min** (`SEPARACION_MINIMA_MIN = 15`, `src/lib/cron-telemetry.ts:773`), y **aquí esa separación la tiene que respetar una persona: no hay cron que la haga cumplir**.

Entonces, antes de correrlo: **elegir la empresa y la ventana horaria, decirlo, y esperar el visto bueno.** Madrugada de Panamá, una empresa a la vez, mirando el calendario de crons (`SWITCH_CRON_ENTRADAS`).

**Si no se puede ver el archivo, se dice y se arregla DEFENSIVO.** Es lo que se hizo el 2-sep: la máquina no tenía credenciales, así que el parser acepta el código seguido de **cualquier cosa**, en vez de calibrarse a un separador `" - "` que nadie vio. Y la procedencia del fixture quedó escrita en el test (`src/__tests__/lib/egresos-parser.test.ts:238-249`) para que el próximo sepa cuánta confianza merece.

---

## Paso 4 — Arreglar ensanchando el envoltorio, nunca aflojando el valor

El precedente exacto está en `src/lib/egresos/parser.ts:14-23`:

> «Acá se aceptan las DOS formas (la posición del año de 4 dígitos las distingue sin ambigüedad) **para que un cambio de formato de Switch no vuelva a vaciar el módulo en silencio**.»

`fechaEgresoAIso()` acepta `YYYY-MM-DD` **y** `DD-MM-YYYY`, con `-` o `/`, y tolera una hora pegada detrás. Rechaza lo que no sea una fecha real del calendario.

La misma idea aplicada a la cuenta (`src/lib/contable/csv.ts`): **el valor se declara UNA vez y de ahí salen las dos formas.**

```ts
const CUENTA_TRAMOS = String.raw`\d+(?:\.\d+){4}`;
export const CUENTA_RE   = new RegExp(`^${CUENTA_TRAMOS}$`);          // el ancla $ INTACTA
const CELDA_CUENTA_RE    = new RegExp(`^(${CUENTA_TRAMOS})(?![\\d.])`); // lee por el PRINCIPIO
```

Qué significa «ensanchar el envoltorio, no aflojar el valor»:
- ✅ Aceptar el mismo dato en más envases (dos formatos de fecha, código con o sin nombre pegado, `-` o `/`).
- ❌ Bajar de 5 tramos a 4, o recortar un código hasta que entre. Eso cambiaría de cuenta en silencio, y `esGasto` decide con el primer tramo. **Seis tramos siguen siendo error, a propósito.**
- ✅ Cuando el endpoint entero se mueve (Boston, 19-ago), escribir un **adaptador** que traduzca el formato nuevo al viejo. Así `switch_estadocuenta`, `construirFilas`, `ccteIdSintetico`, el cuadre, el guard de montos y el reconcile **no se tocaron**.
- ✅ Y poner un **guard de reporte incompleto** donde el silencio hace daño: `PISO_CLIENTES_REPORTE = 0.7` (`src/lib/switch-api/sync-estadocuenta-web.ts:129`), porque el reconcile pone saldo = 0 a todo lo que la corrida no reescribió — un reporte a medias dejaría saldos buenos en cero con la corrida en `success`.

---

## Paso 5 — 🩸 Buscar el descarte silencioso

**Cada vez que Switch cambia algo, revisar qué se descarta y si eso se dice.** No es opcional: es la mitad del trabajo.

En los egresos, `erroresParseo` **solo viajaba en la respuesta HTTP del cron, que nadie lee**. Si el cambio hubiera tocado 3 renglones de 378 en vez de los 378, esos 3 gastos se caían en silencio con la corrida en `success`. Nos salvó que el cambio fue del 100% y disparó el guard.

El patrón correcto son **tres estaciones** (`src/lib/switch-api/renglones-ilegibles.ts:27-35`):

1. **REGISTRO** → `switch_sync_log.records_skipped` + `skip_details`, con la misma forma de fila que el guard de montos (`{ facturaId, secuencial, campo, valorCrudo }`). Un solo lector después.
2. **PANTALLA** → `src/lib/rechazos-de-switch.ts`, fuente ÚNICA del texto de «lo que Switch mandó y no entró». Ventana de 7 días, ámbar, **cuenta por empresa nunca en un solo número**, y si no hay nada devuelve `null` y no se dibuja nada.
3. **TELEGRAM** → 🔧 SISTEMA por `enviarSistema`, **un mensaje por corrida** (`MAX_EN_MENSAJE = 5`), con anti-loop de 7 días por clave (`clavesYaAvisadasPorCampo`, compartida con el guard de montos).

Detalles que ya costaron caro:
- 🩸 **La clave del anti-loop es el N. INTERNO del documento, NO el número de línea.** El número de línea se corre entero en cuanto alguien arregla un renglón de arriba, y haría ver descartes nuevos todos los días.
- El `campo` de los ilegibles (`"renglon_ilegible"`) es **distinto** del de los montos imposibles: si compartieran etiqueta, el anti-loop de uno silenciaría al otro.
- Anti-loop **fail-open**: si no puede leer el log, avisa. Perder un aviso es peor que repetirlo.
- Los avisos van en `try/catch`: nunca tumban una corrida que ya escribió bien.
- Sumar el `sync_type` nuevo a `consecuenciaDeSyncType` (`src/lib/switch-api/alert-policy.ts`), o el aviso cae al texto genérico.

Archivos: `renglones-ilegibles.ts` · `monto-guard.ts` (puro) · `monto-guard-io.ts` (base + Telegram) · `rechazos-de-switch.ts` (pantalla) · cableado en `sync-egresos-varios.ts:293-343`.

---

## Paso 6 — Los textos de error mienten. Arreglarlos también.

`src/lib/egresos/parser.ts:288-296`, verbatim:

> «🩸 EL TEXTO DICE LA VERDAD, Y ESO ES LA MITAD DEL ARREGLO. Hasta el 2-sep-2026 decía «Código de cuenta inválido», que era falso: el código estaba impecable y lo que había cambiado era que la celda traía dos datos. Quien lo leía se iba a Switch a buscar una cuenta mal creada y perdía la mañana. **Un mensaje que manda a mirar el lugar equivocado cuesta más que no decir nada.**»

El texto de reemplazo dice **qué pasó, qué se esperaba, y que no es culpa del usuario**:

```
No reconozco el código de cuenta en esta celda: "…". Se esperan 5 tramos de
números separados por puntos al principio (y detrás puede venir el nombre).
Es cómo lo manda Switch, no una cuenta mal creada.
```

Checklist del mensaje: nombra el **MÓDULO que Daniel abre** («Gastos», no `egresos_varios`) · dice qué hacer · sin nombres de tabla, códigos HTTP ni HTML del proveedor · y **deja un candado** de que el texto viejo no vuelve:

```ts
expect(r.errores[0].motivo).not.toContain("Código de cuenta inválido");
```

---

## Paso 7 — Verificar por mutación, con los dos fixtures al lado

🔴 **El fixture del formato viejo NO se toca** (`src/__tests__/lib/egresos-parser.test.ts:250-253`):

> «El formato pelado tiene que seguir leyéndose: lo que hay guardado en la base se leyó así, y una empresa puede volver a mandarlo. **Los dos archivos tienen que dar EL MISMO NÚMERO.**»

| Formato | Fixture |
|---|---|
| Egresos, viejo | `src/__tests__/fixtures/egresos-vistana-2026.csv` — real, 378 renglones, $243.342,48 |
| Egresos, nuevo | `src/__tests__/fixtures/egresos-vistana-2026-formato-nuevo.csv` — derivado, mismos 378 / $243.342,48 |
| Boston cartera, viejo | `src/__tests__/fixtures/boston-cartera-web.json` |
| Boston cartera, nuevo | `src/__tests__/fixtures/boston-cartera-consola.json` |

El test del fixture nuevo debe además **probar que el fixture trae el formato nuevo** (si no, el candado no prueba nada), y que **las dos formas conviven en el mismo archivo**.

Después, mutación: romper el arreglo a mano y verificar que algún test se pone rojo.

```bash
bash scripts/_mutar-candados-boston-consola.sh   # 14 de 14 cazadas
npx vitest run src/__tests__/lib/egresos-parser.test.ts
npx vitest run src/__tests__/lib/renglon-descartado-no-desaparece.test.ts
```

`renglon-descartado-no-desaparece.test.ts` es de **conducta**: corre el sync de verdad y lee el log. Cazó la mutación que dejaba el import en pie y vaciaba `skipDetails` — la que habría pasado un barrido de texto.

---

## Los tres precedentes, en una línea cada uno

| Fecha | Qué cambió Switch | Síntoma | Arreglo | Commit |
|---|---|---|---|---|
| **19-ago-2026 12:37** | Cambió el motor de reportes: `POST /estadodecuenta/obtener` dejó de existir y devolvía **HTTP 200 con la página de excepción** («Controller method not found»). Nuevo camino: `crearreporteconsola` → uuid → `buscarreporteconsola/<uuid>` cada 2 s. Renombró todos los campos y **dejó de mandar el saldo por documento** (ahora se deriva de `debito − credito`) | Cartera de Boston congelada en el 19-ago, 5 corridas seguidas caídas | Adaptador formato nuevo → viejo, + guard de reporte incompleto al 70% | `e5d52658` |
| **1-sep-2026** | Empezó a mandar `"6.03.98.00.00 - GASTO DE TARJETA DE CREDITO"` donde antes mandaba el código pelado | Módulo Gastos **dos días vacío**; 5 empresas en error; 709 renglones que no entraron | Leer el código por el principio de la celda; `CUENTA_RE` conserva su `$` | `76d30e18` + `b00415e2` |
| **12-ago-2026** | *(No fue Switch: fue crecimiento de datos, pero el modo de fallo es idéntico)* Calvin llegó a 8.173 artículos = 164 páginas y chocó el tope `MAX_PAGES = 80` | El catálogo entró con **4 productos de ~80 y se anotó `success`** | `MAX_PAGES = 250` y llegar al tope sin ver la página corta ahora es **error, nunca un éxito a medias** | `d7395294` |

Relacionado en el mismo archivo (`src/lib/switch-api/sync-catalogo.ts:858-862`): si el conjunto filtrado queda vacío —p. ej. porque Switch cambió el formato del campo proveedor— **no se oculta nada en masa**.

---

## Cuando Switch cambia algo y NO da error

Desde el 2-sep-2026 hay una red para eso: `src/lib/alertas/silencio-de-datos.ts` (+ `-io.ts`), colgada de `switch-reconciliacion`, sin entradas nuevas en `vercel.json`.

- **Alerta A**: un sync trajo cero donde ese par venía trayendo volumen estable.
- **Alerta B**: una tabla de negocio dejó de escribirse.
- Solo aplica a `SYNCS_DE_UNIVERSO_COMPLETO` — lista **declarada, no inferida**: `estadocuenta · costo · articulo_info · articulo_marca · cuentas_contables · egresos_varios · proveedores · los cuatro catalogo_*`. Con ese filtro el backtest de 96 días dio **0 falsos positivos**; sin él, 14.
- Tres candados por par: ≥10 corridas previas · mediana ≥ 10 · ni un cero en esa historia.
- El mensaje incluye, literal: *«Switch cambió el formato de su reporte, y eso hay que enseñárselo a la app.»*

⚠️ **No cubre todo, y está declarado**: el incidente de los egresos dejó `status = error`, así que A no lo habría visto. Lo agarró B, 35 min antes que la regla 2.

---

## Errores que no hay que repetir

- ❌ Calibrar el parser a un separador que no se vio.
- ❌ Aflojar la validación del valor (menos tramos, recortes) para que «entre».
- ❌ Arreglar el parseo y dejar el descarte silencioso como estaba.
- ❌ Dejar un mensaje de error que manda a mirar el lugar equivocado.
- ❌ Borrar o «actualizar» el fixture del formato viejo.
- ❌ Correr un `/api/diag/*` sin decir antes a qué empresa y a qué hora — expulsa a Daniel del panel.
- ❌ Declarar que un arreglo no funcionó comparando una hora UTC con una hora de Panamá.
