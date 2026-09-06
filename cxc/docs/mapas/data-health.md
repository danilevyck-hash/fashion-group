# Data Health — el mapa

> Medido contra producción el **5-sep-2026** (SQL de solo lectura + `src/app/admin/usuarios/DataHealthTab.tsx`, `src/app/api/admin/data-health/route.ts`, `src/lib/integrity-checks.ts`, `src/lib/datos-frescos.ts`, `src/lib/ventas/centinela-tipos.ts`).
> **No es un módulo:** es la **segunda pestaña de Usuarios** (`/admin/usuarios?tab=data-health`). La dirección vieja `/admin/data-health` redirige.

---

## Qué es, quién entra, cuánto se usa

**Qué hace.** Un cron diario (12:00 UTC = 7:00 a.m. de Panamá) corre **7 revisiones** sobre los datos y guarda el resultado. La pestaña muestra cuatro contadores por severidad, la lista de las 7 con su último resultado, y un mapa de 30 días con un punto por día.

**Quién entra: solo `admin`** — dos personas, tú y alberto. Doble candado: el guard de la página (`moduleKey: "admin"`) y `esAdmin` en la pestaña. La API pide `requireRole(req, ["admin"])`.

**Cuánto se usa. Este es el número que importa:**

> 🔴 **El botón «Correr checks ahora» se tocó UNA vez en 120 días: el 7-jun-2026.** Nunca más.

Es medible sin ambigüedad: el cron escribe **una corrida por día**, así que un día con **dos** corridas es alguien que apretó el botón. De **114 días** medidos, **113 tienen exactamente una corrida** y **uno tiene dos** (7-jun-2026). Confirma lo que ya dijiste — *«yo no uso Data Health, nunca lo veo»* — con un número, no con una impresión.

⚠️ **Lo que no puedo medir:** abrir la pestaña *sin* apretar el botón no deja rastro (`activity_logs` no registra vistas de pantalla). O sea que puedes haberla mirado sin tocar nada. Lo que sí está probado es que **en 120 días nadie pidió una corrida al momento**, que es lo que se hace cuando algo te preocupa.

---

## Cuánto cuesta hacer las cosas

Es una pantalla de **mirar**, no de hacer. Tiene dos tareas y nada más.

### Tarea 1 — enterarte de si algo está mal (medido: ~0 veces en 120 días)

**Hoy: 2 toques, 1 pantalla.** Inicio → «Usuarios» (1) → pestaña «Data Health» (1).

**Es corto. El problema no son los toques: es que hay que ACORDARSE de entrar.** Nada te avisa. La pantalla es la única del sistema que espera que alguien la visite por su cuenta, y en 8 módulos con Telegram encendido esa es la razón más probable de que no se visite.

**Y cuando entras, lo que lees es esto:**

```
Estado actual por check
switch_facturas_continuidad   switch_facturas       OK    0    hace 19 h
aging_tipos_sin_clasificar    switch_estadocuenta   OK    0    hace 19 h
```

Nombres de tabla, nombres de función en inglés y con guiones bajos, y las palabras **Severity · Rows · CRITICAL · WARNING · INFO · OK**. Es la **única pantalla del sistema escrita en jerga de base de datos**. En el resto se dice «Cuentas por Cobrar», no `cxc_rows`.

> **Versión más corta: 0 toques.** Que la pantalla no haga falta — lo poco que vigila y nadie más vigila, sale por Telegram. Ver la pregunta 1.

### Tarea 2 — entender qué significa un check (medido: no medible, pero el costo se ve en el código)

**Hoy: 1 toque más** (tocar la fila abre un modal con la explicación en español y la acción sugerida — `CHECK_INFO`, `DataHealthTab.tsx:68`).

Las explicaciones están **bien escritas y son útiles**: *«Empleados con saldo de préstamo negativo (pagaron más de lo prestado)»*, *«Revisa sus movimientos: puede haber un pago duplicado o un abono mal cargado»*. **El problema es que están escondidas detrás de un clic, debajo del nombre en inglés que sí se ve.** Está al revés: lo que se lee gratis es lo que no se entiende, y lo que se entiende hay que ir a buscarlo.

---

## Los datos, medidos

### Las 7 revisiones vivas y su último resultado (5-sep-2026 12:00 UTC)

| Revisión | Tabla | Resultado | Filas afectadas |
|---|---|---|---:|
| `cheques_criticos_null` | cheques | OK | 0 |
| `prestamos_saldo_anomalo` | prestamos_movimientos | OK | 0 |
| `last_upload_age_cxc` | switch_estadocuenta | OK | 1 |
| `aging_tipos_sin_clasificar` | switch_estadocuenta | OK | 0 |
| `ventas_tipos_sin_clasificar` | switch_facturas | OK | 0 |
| `switch_facturas_continuidad` | switch_facturas | OK | 0 |
| `aging_dias_anomalo` | switch_estadocuenta | OK | 0 |

> 🔴 **En 90 días: 551 resultados, 551 en OK. Cero avisos, cero advertencias, cero críticos.**
> El último resultado que no fue OK de una revisión viva es del **5-jun-2026** — hace **93 días**.

| `data_integrity_checks` | Filas |
|---|---:|
| Total | **828** |
| De las 7 vivas, últimos 120 días | 653 |
| Con más de 90 días (nunca se borran) | **277** |
| De revisiones **retiradas** que la pantalla ya no muestra | **~175** |

**Corridas por día, últimos 30:** 7 filas/día desde el 26-ago (entró `ventas_tipos_sin_clasificar`), 6 antes. **El cron nunca falló:** `cron_heartbeats.integrity-check` = 5-sep-2026 12:00 UTC.

### Las 9 revisiones muertas que siguen en la tabla

Corrían sobre el CSV viejo (`cxc_rows`, `ventas_raw`, `cxc_uploads`) y se retiraron. Última corrida: **5-jun-2026** (8 de ellas) y **13-may-2026** (una). La API las filtra por `LIVE_CHECK_NAMES` y **no se ven en pantalla** — eso está bien resuelto. Pero sus **~175 filas siguen en la tabla** y arrastran sus últimos resultados congelados: `cxc_sin_venta_correspondiente` quedó en **warning con 98 filas**, `last_upload_age_ventas` en **warning con 12**, `upload_desync_cxc_ventas` en **warning con 7**, y `cxc_fecha_null` en **critical con 25**. Nada de eso es cierto hoy — son fotos de junio de tablas congeladas.

---

## 🩸 Lo que miente o está roto

### 1. 🩸 Un «critical» que afecta a **cero** filas

`prestamos_saldo_anomalo`, 13-may-2026: `severity = 'critical'`, **`rows_affected = 0`**, `threshold_exceeded = true`. Es la **única vez** que una revisión viva marcó crítico en toda su historia, y no había ni una fila mal.

Si esa fila hubiera aparecido con la pantalla abierta, habría pintado un **1 en rojo grande** en el contador CRITICAL, con el texto «Dato posiblemente incorrecto (afecta CXC/Ventas). **Revisar ahora.**» — sobre nada. Un tablero que grita por cero filas enseña a ignorarlo, y es la explicación más probable de por qué la única corrida manual fue un mes después y ninguna más.

### 2. 🩸 De las 7 revisiones, **4 ya avisan por Telegram desde otro lado**

Verificado en el código, no en la documentación:

| Revisión | ¿Ya avisa por Telegram? | Por dónde |
|---|---|---|
| `last_upload_age_cxc` | **Sí** | `datos-frescos.ts:183` mira `switch_estadocuenta.synced_at` → regla 1 (+24 h) |
| `switch_facturas_continuidad` | **Sí** | `datos-frescos.ts:193` mira `switch_sync_log` (`sync_type='facturas'`) + la alerta A de silencio |
| `aging_tipos_sin_clasificar` | **Sí** | `centinela-tipos.ts` / `tipos-comprobante.ts` → regla 2, canal 🔧 SISTEMA |
| `ventas_tipos_sin_clasificar` | **Sí** | `centinela-tipos.ts:63` (`switch_facturas_tipos_sin_clasificar`) → regla 2 |
| `cheques_criticos_null` | **No** | — |
| `prestamos_saldo_anomalo` | **No** | — |
| `aging_dias_anomalo` | **No** | — |

**Cuatro de las siete son un segundo tablero de algo que ya te llega al teléfono.** El módulo entero está sosteniendo **tres** revisiones que no tienen otra puerta — y esas tres llevan **90 días seguidos en cero**.

### 3. 🩸 La pantalla está escrita en jerga de base de datos, y es la única

Lo que se lee sin tocar nada: `switch_facturas_continuidad`, `prestamos_saldo_anomalo`, `switch_estadocuenta`, `prestamos_movimientos`, y los rótulos **Severity**, **Rows**, **CRITICAL**, **WARNING**, **INFO**, **OK** (`DataHealthTab.tsx:44-49` y `:281-285`). En un sistema donde la regla es «CXC → Cuentas por Cobrar» y «no hay jerga», esta pantalla usa los nombres internos de siete funciones de TypeScript como si fueran títulos.

Las traducciones **ya existen** en el mismo archivo (`CHECK_INFO`, `SEVERITY_MEANING`) — pero una está escondida tras un clic y la otra en letra chica gris debajo del número.

### 4. 🩸 «Historial 30 días» muestra 30 días para revisiones que tienen 11

`ventas_tipos_sin_clasificar` nació el **26-ago-2026** y tiene **11 corridas**. En el mapa de 30 días, sus primeros **19 días** salen con el punto gris de `SEVERITY_DOT.missing` — el mismo gris que significaría «ese día el cron no corrió». **«Todavía no existía» y «ese día falló» se dibujan igual.** Es exactamente la distinción que el catálogo de Reebok tuvo que aprender con `ficha_at`: *«todavía no llegó» no es «llegó algo que no entiendo»*.

El `title` del punto dice «sin corrida», que para esos 19 días es literalmente falso: no hubo corrida porque la revisión no existía.

### 5. Los 4 contadores de arriba ocupan una pantalla para decir «7 y tres ceros»

`CRITICAL 0 · WARNING 0 · INFO 0 · OK 7`, cada uno con su explicación de dos renglones debajo. Medido: **en 90 días esos cuatro números fueron siempre 0-0-0-7.** Son cuatro tarjetas, ocho renglones de texto y media pantalla de iPhone para decir una sola cosa: *todo bien*.

### 6. Lo que **sí** está bien y hay que dejarlo

- **El filtro de revisiones retiradas funciona.** `LIVE_CHECK_NAMES` esconde las 9 muertas sin borrar una sola fila (patrón `mayor_lineas`). La tabla queda como archivo.
- **Hay un guard de sincronía:** si una revisión emite un nombre que no está en la lista, avisa en el log en vez de desaparecer en silencio (`integrity-checks.ts:420`).
- **El respaldo la cubre.** Verificado en `src/lib/backup/tablas.ts:266`: `data_integrity_checks` está clasificada. También lo están las 6 tablas del Depurador y `fg_users`/`role_permissions`/`activity_logs`. **`user_sessions` y `login_attempts` están fuera A PROPÓSITO y con nota** (son tokens vivos). **Ninguna tabla de estos tres módulos quedó sin clasificar.**
- **El cron nunca falló** en 120 días.

---

## Coherencia con el sistema

| Punto | Cómo está | Veredicto |
|---|---|---|
| **Voseo** | Cero. «Revisa sus movimientos», «Clasifícalos», «Corre el primer check» | ✅ |
| **Sin jerga** | 🔴 Es la excepción del sistema: nombres de tabla y de función a la vista, y 6 palabras en inglés | 🔴 Ver 🩸 nº 3 |
| **Un cero grande = dato roto** | Los contadores muestran **`0` en 40 px** tres veces. Aquí un 0 es una buena noticia, no un dato roto — pero se ve igual que el $0.00 que la casa prohíbe | ⚠️ El sistema ya decidió que un cero grande se lee mal. «Sin problemas» diría lo mismo sin el número |
| **Excel** | No exporta nada | ✅ No aplica |
| **Vacío** | «No hay resultados todavía. Corre el primer check con el botón de arriba.» | ✅ Frase de la casa, y dice qué hacer |
| **Error** | «Error al cargar: <mensaje crudo>» (`DataHealthTab.tsx:152`) | 🔴 Muestra el mensaje técnico tal cual. Es el mismo defecto que el CXC ya corrigió el 5-sep («qué pasó / qué significa / qué hacer») |
| **Un h1 por documento** | Cedió el suyo a «Usuarios», a propósito y documentado | ✅ |
| **Fechas** | `toLocaleString("es-PA", { timeZone: "America/Panama" })` | ✅ Panamá, no el reloj del navegador |
| **Modal** | `ModalOverlay` + `useEscapeClose` | ✅ El patrón de la casa |

---

## El iPhone (390 px)

Esta pantalla **ya pasó una auditoría de iPhone el 30-jul-2026** y los tres arrastres están arreglados, con la medición escrita en el código.

| Elemento | A 390 px | Veredicto |
|---|---|---|
| Los 4 contadores | `grid-cols-2` hasta `sm` → 2×2 | ✅ entran |
| Lista de revisiones | **Tarjetas** hasta `lg` (`DataHealthTab.tsx:254`). Antes: tabla con 353 px de arrastre y las columnas Severity y Rows fuera de pantalla | ✅ Medido y arreglado |
| Mapa de 30 días | Los 30 puntos **envuelven** (`flex-wrap`) hasta `xl`. Antes: 448 px de arrastre, se veían 7 de 30 días | ✅ La mejor decisión de la pantalla: no corrieron el corte, cambiaron la forma |
| Nombres de revisión | `break-all` — `switch_facturas_continuidad` se parte a mitad de palabra | ⚠️ Se lee `switch_facturas_contin` / `uidad`. Un nombre en español no necesitaría partirse |
| Botón «Correr checks ahora» | `min-h-[44px]` | ✅ |
| Etiquetas de severidad al pie | `flex-wrap` (las 4 no entran en 342 px y la tarjeta las recortaba) | ✅ Medido |

**A 390 px la pantalla ocupa ~3 alturas de iPhone para decir «todo bien»:** botón + 4 contadores (2 filas) + 7 tarjetas + 7 bloques de 30 puntos.

---

## Lo que sobra · lo que falta

### Sobra (quitar)

| Qué | Dónde | Por qué, con el número |
|---|---|---|
| Los 4 contadores de severidad | `DataHealthTab.tsx:~225` | Fueron 0-0-0-7 los 90 días medidos. Media pantalla de iPhone para una frase |
| El mapa de 30 días | `DataHealthTab.tsx:~325` | 210 puntos verdes idénticos (7 × 30). En 90 días no hubo **ni uno** de otro color |
| Los nombres de tabla en la lista | columna «Tabla» | `switch_estadocuenta` no le dice nada a nadie que pueda actuar sobre él |
| El mensaje crudo en el error | `DataHealthTab.tsx:152` | El CXC ya lo corrigió el 5-sep; esta quedó como la última |

### Falta (agregar)

| Qué | Por qué, con el número |
|---|---|
| **Que las 3 revisiones sin otra puerta avisen solas** | 4 de 7 ya avisan por Telegram; las otras 3 dependen de que alguien entre, y nadie entró en 120 días |
| **Nombres en español en la lista** | La traducción ya existe en `CHECK_INFO`; está escondida tras un clic |
| **Distinguir «no existía» de «no corrió»** | 19 puntos grises de `ventas_tipos_sin_clasificar` dicen «sin corrida» y es falso |
| **Que un crítico exija filas > 0** | El único crítico de la historia afectaba a 0 filas |

---

## Preguntas para Daniel

**1. La grande: si nadie lo mira, ¿sale por Telegram o se retira?**
Los números: **551 resultados en 90 días, los 551 «todo bien»**. El botón se tocó **1 vez en 120 días** (7-jun). Y **4 de las 7 revisiones ya te avisan por Telegram desde otro lado** — solo 3 dependen de esta pantalla (cheques con campos vacíos · préstamo con saldo negativo · fechas raras en la cartera), y esas 3 llevan 90 días en cero.

- a) **Se retira la pantalla y las 3 revisiones huérfanas pasan a Telegram**, dentro de la regla 2 que ya existe («algo se rompió y no se arregló solo»): el cron sigue corriendo igual, y si una de las 3 encuentra algo **dos días seguidos**, sale un 🔧 SISTEMA. Silencio = todo bien.
- b) Se retira la pantalla y **no** se avisa nada: si en 90 días no encontraron nada, que sigan corriendo callados y se revisan en la base cuando haga falta.
- c) Se queda como está.

**Recomiendo (a).** No estrena una cuarta regla de alerta —cabe en la regla 2 tal cual está escrita, con su anti-loop de 7 días— y **no te agrega ni un mensaje mientras todo esté bien**, que es lo que ha pasado 90 días seguidos. (c) es mantener una pantalla que ya sabemos que no se abre. (b) tira el único valor que tienen las 3 revisiones huérfanas.

⚠️ **Lo que no te puedo decir:** si abriste la pestaña sin tocar el botón. Eso no deja rastro. Si sí la miras de vez en cuando, dímelo y la respuesta cambia.

**2. ¿La pantalla se va entera o queda una línea?**
Si vamos por (a) de arriba, hay dos formas:
- a) Se va toda: la pestaña «Data Health» desaparece de Usuarios.
- b) Queda **una línea** en Usuarios: «Revisiones de datos: todo bien · última hace 19 h», y nada más.
- c) Queda entera pero solo se abre desde el mensaje de Telegram cuando algo falla.

**Recomiendo (b).** Es una línea, no una pantalla; te dice de un vistazo que el vigilante está despierto (que es lo único que hoy no se puede saber sin entrar), y quita las 4 tarjetas, los 210 puntos y los nombres en inglés. Cuesta 0 toques porque ya estás en Usuarios.

**3. Un «crítico» con 0 filas afectadas: ¿lo arreglamos aunque la pantalla se vaya?**
Pasó una vez, el 13-may. Si las revisiones pasan a Telegram, ese mismo defecto te mandaría un mensaje rojo por nada.
- a) Sí: una revisión no puede ser crítica con 0 filas, se corrige antes de conectar Telegram.
- b) No: pasó una vez en 4 meses.

**Recomiendo (a), y es condición para la pregunta 1.** Un aviso falso en 🔧 SISTEMA es peor que no tener el aviso: enseña a ignorar el canal, y ese canal también lleva las cosas que sí importan.

**4. Las 175 filas de las 9 revisiones retiradas: ¿se quedan?**
Son de junio y mayo, sobre tablas congeladas (`cxc_rows`, `ventas_raw`). La pantalla ya no las muestra. Cuatro de ellas quedaron congeladas en «warning» y una en «critical», y no es cierto hoy.
- a) Se quedan: es archivo y no molestan a nadie (el patrón de la casa).
- b) Se marcan como retiradas en la base para que nadie las lea mal en el futuro.
- c) Se borran.

**Recomiendo (a).** La casa no borra (`mayor_lineas`, `cxc_favorites`), la pantalla ya las filtra bien, y son 175 filas. (c) va contra la regla de la casa por nada.
