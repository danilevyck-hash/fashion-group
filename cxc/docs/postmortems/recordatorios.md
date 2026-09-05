# Recordatorios — el rediseño (5-sep-2026)

> El porqué de cada invariante del módulo `cheques` / **Recordatorios**, verbatim: las citas de
> Daniel, lo que se midió contra producción, los candados y los 🩸.
> Las reglas vigentes, sin la historia, están en [`CLAUDE.md`](../../CLAUDE.md) § Recordatorios.
> El mapa de la pantalla, archivo por archivo, en
> [`docs/modulos/06-recordatorios-usuarios-infra.md`](../modulos/06-recordatorios-usuarios-infra.md) § 1.

---

## 0. De dónde salió

El módulo se llamaba **Cheques** hasta el 24-ago-2026. Daniel, textual:

> *«en el módulo de cheques, quisiera cambiarlo a recordatorios, ya que quisiera poner ahí en el
> calendario "recordar cobrar" y pongo la fecha así telegram me recuerda»*

Ese día cambió el **label** y nació la tabla `recordatorios`. Doce días después, el **5-sep-2026**,
se rediseñó lo de adentro. Lo que sigue es esa segunda vuelta.

### Lo que se midió antes de tocar nada

| Qué | Cuánto |
|---|---|
| `cheques` vivos | **19** — 17 depositados ($257.174,34) + 2 pendientes ($22.221,78) |
| Borrados | **0** en toda la historia |
| Clientes con cheque | **1**: Jerusalem de Panamá |
| Ritmo de uso | tandas (5 en abril, 14 en julio) y se van marcando depositados |
| Último movimiento | **28-ago-2026** (17 `cheque_update` en `activity_logs`, 11-may → 28-ago) |
| `recordatorios` | **1 fila**, creada el mismo 5-sep. Antes: **cero en toda su historia** |
| Pantalla | `ChequesClient.tsx`, **1.693 líneas** (el límite de la casa es 800) |
| Pestañas | **8** |

🔑 **La lectura de esos números:** el módulo SÍ se usa —la parte de cheques—, y la de recordatorios
estaba vacía **no porque no hiciera falta sino porque costaba cuatro toques y una ventana**. El
rediseño no inventa un módulo nuevo: le quita fricción al que ya se usa y le saca la que impedía usar
el otro.

---

## 1. 🩸 EL CHEQUE QUE VENCIÓ Y EL SISTEMA NUNCA VOLVIÓ A MENCIONAR

Es el hallazgo que más plata vale de toda la tanda, y salió de mirar producción antes de opinar.

El aviso de cheques mira **hoy y el próximo día hábil** (`ventanaAviso`). O sea: un cheque se anuncia
el día antes y el día mismo, y **después nunca más**. Si nadie lo marcó como depositado, el sistema
se calla para siempre.

Estaba pasando el día que se escribió esto:

| Empresa | Cheque | Vendedor | Monto | Vencía | Estado |
|---|---|---|---|---|---|
| Vistana | 018094 | Edwin | **$18.393,32** | **31-ago-2026** | pendiente, 5 días después |

(Y otro por vencer: Active Wear, chq 018089, Rey, $3.828,46, para el 11-sep.)

### La regla que se puso

🔴 **Bloque nuevo, y sale UNA SOLA VEZ.**

```
🔴 1 cheque venció y sigue sin depositar
• JERUSALEM DE PANAMA (Vistana International) $18,393.32 — vencía el lunes 31 ago · Edwin
```

Daniel no quiere que el mismo cheque le grite todos los días: si ya se avisó y decidió no hacer nada,
repetirlo lo convierte en ruido y el resto del mensaje se deja de leer.

- La memoria de «ya se avisó» vive en **`cheques.aviso_vencido_en`** (timestamp; NULL = todavía no).
  **Una columna y no una tabla nueva**: el dato es del cheque, muere con él, y `cheques` ya entra al
  respaldo diario.
- ⚠️ **Se marca DESPUÉS de que Telegram confirme.** Marcar antes y que el envío falle **quemaría el
  único aviso que ese cheque va a tener**. Al revés, lo peor que pasa es avisar dos veces un día que
  Telegram se cayó a mitad de camino, y eso es barato.
- 🔴 **Un cheque REBOTADO no avisa** — decisión de Daniel.
- **Por qué la pregunta es «vencido y sin avisar» y no «venció ayer»:** de aquí en adelante son lo
  mismo por construcción (el día que vence está en la ventana normal como «HOY»; al día siguiente le
  toca su aviso único). Pero preguntar literalmente por `fecha = ayer` habría dejado afuera **los que
  ya estaban vencidos el día que esto se encendió** — justo el caso de $18.393,32 que lo motivó.

Candados: `recordatorios-rediseno.test.ts` § E · `recordatorios-permiso-y-aviso.test.ts` (el orden de
los tres bloques y el «solo se marca si Telegram confirmó»).

---

## 2. 🔑 LAS CUATRO PESTAÑAS QUE NUNCA FUERON ESTADOS

El módulo tenía **ocho** pestañas: `pendiente · depositado · vencido · rebotado · vencen_hoy ·
vencen_manana · vencen_semana · recordatorios`.

**Cuatro de ellas —vencido, vencen hoy, vencen mañana, vencen esta semana— no son estados: son
CUÁNDO.** Cuatro pestañas para decir cuatro veces lo mismo que una fecha ya dice, y una decisión que
había que tomar antes de poder mirar nada.

Convertidas en **grupos de una sola lista**, la misma información se ve de una pasada y sin elegir:

```
Vencido (rojo, arriba) · Hoy · Esta semana · Después · Se repiten
```

Y con ellas cayeron las otras cuatro:

| Pestaña vieja | Qué le pasó |
|---|---|
| `pendiente` | es lo que la lista muestra por defecto |
| `depositado` | **fuera de la lista**; se llega por la lupa (ver abajo) |
| `rebotado` | **cero filas en toda la historia del módulo.** Es una marca roja en la fila, no una pestaña. El cheque **se queda** hasta que se redeposite o se borre |
| `recordatorios` | conviven con los cheques en la misma lista |

### 🔴 Lo depositado: fuera de la lista, dentro del buscador

La lista muestra **solo lo abierto**. Lo depositado **aparece al BUSCARLO** por cliente o por número
de cheque — el buscador mira TODO, incluido lo que la lista esconde. Un buscador que respetara el
filtro de la lista sería un buscador que no encuentra.

### 🔴 Y ningún total sumado, en ninguna parte

Las **tres tarjetas** de arriba (Total a cobrar · Vencen esta semana · Depositados) se fueron y
**Daniel eligió explícitamente que no se reemplacen por nada**. Los montos POR FILA se quedan; el
encabezado de grupo dice **cuántos** son, nunca cuánto suman. El calendario también perdió su total
del mes.

La forma de que no vuelvan no es mirar la pantalla: **`agenda.ts` no tiene una sola operación de
suma**, y hay candado que lo exige (`not.toMatch(/reduce\(/)`).

🩸 Colateral: el candado de iPhone que medía «las tres casillas entran recién en `lg`, porque a 834 px
se salían 15 px y arrastraban la página» **cambió de dirección**. Un arrastre que salía de tres
casillas que ya no existen no se puede medir; ahora mide que **no vuelvan**. Vive en el mismo archivo
a propósito: quien reponga una fila de KPIs va a estar mirando el ancho, no la regla de negocio.

### 🔴 Un recordatorio que se repite es UNA fila

Con «Cada día» sin fecha de fin, una fila por ocurrencia sería una lista infinita. La fila dice cada
cuánto y hasta cuándo, y vive en el grupo «Se repiten».

---

## 3. ESCRIBIR UN RECORDATORIO: UN RENGLÓN

Antes: menú → «Nuevo recordatorio» → ventana con cuatro campos → Guardar. **Cuatro toques antes de
poder escribir una línea**, y por eso la tabla tuvo cero filas dos semanas.

Ahora, siempre visible arriba de la lista:

```
¿Qué te recuerdo?   [ Cuándo ▾ ]  [ A quién ▾ ]  [ + Cliente ]  [ Guardar ]
```

### 🔴 «Hoy» NO existe, y no es un olvido

**Todo sale a las 9:00 a.m. en un solo mensaje.** Para cuando alguien escribe, el de hoy ya salió: un
recordatorio puesto para hoy no llegaría nunca. El primero disponible es **mañana**.

De ahí salen tres cosas de un saque:

1. Las pastillas son seis y ninguna dice «Hoy»: `Mañana · Lunes · Elegir fecha · Cada día · Cada
   semana · Cada mes`.
2. **«Lunes» es el PRÓXIMO lunes.** Escrito un lunes, cae en el siguiente — si cayera en hoy sería la
   opción que justamente no existe.
3. **Guardar para un día que ya pasó no se permite**: el botón se apaga y **dice por qué**, pegado al
   campo: *«El aviso sale a las 9:00 de la mañana, así que hoy ya pasó. Elige de mañana en adelante.»*
   La validación vive en el módulo puro y **la exige el servidor**, con la fecha de PANAMÁ.

🔴 **Y no hay selector de hora.** No existe la hora; existe el mensaje de las 9:00.

### ⚠️ Editar no exige mover la fecha

La regla anterior, aplicada a rajatabla en el PUT, dejaría **imposible editar el texto de un
recordatorio que se repite**: su `fecha` es el día en que ARRANCÓ, casi siempre en el pasado. El
freno mira si la fecha **CAMBIÓ**: la misma pasa, otra tiene que ser de mañana en adelante. Está
escrito igual en la pantalla y en el servidor.

### `cada_dia` y el «Hasta…»

`cada_dia` se suma a las repeticiones (el mensaje es diario: era la que faltaba). Las tres
repeticiones aceptan un **`hasta` opcional**, que **corta INCLUSIVE** — el último día que suena es el
`hasta`, no el anterior.

⚠️ **Un `hasta` sobre algo que NO se repite se descarta al leer el cuerpo.** Guardado sería una bomba:
el día que a ese recordatorio le pongan repetición, la fecha de fin vieja lo apagaría sin que nadie la
haya vuelto a mirar. La base lo frena también (`CHECK (hasta IS NULL OR (repeticion <> 'una_vez' AND
hasta >= fecha))`).

### 🔴 Un recordatorio NO se marca como hecho

Daniel, textual:

> *«No quiero tener que meterme para poner que lo hice. Se supone que sí.»*

No hay —ni se agrega— estado de completado. Se manda y ya. Los de una sola vez que ya pasaron
**salen de la lista** en vez de quedarse arriba en rojo pidiendo que se los cierre uno por uno.

### 🔴 Un cheque que no se va a cobrar SE BORRA

Daniel: *«no lo quiero marcar»*. No se agregó ningún estado tipo «no se cobró»: se borra con el botón
que ya existía, que ahora vive en el detalle del cheque. Los depositados no se borran (data
histórica).

---

## 4. 🔴 «A QUIÉN LE LLEGA» — y el chat privado que es uno solo

`recordatorios.destino`: `equipo` (📊 el grupo de Telegram) o `privado` (el chat de Daniel).

- **La opción la ven SOLO los admin.** Lo que escribe una secretaria va **siempre** al equipo.
- 🔴 **Eso lo fuerza el SERVIDOR**, no la pantalla: `destinoPermitido(rol, pedido)` en el módulo puro,
  llamado desde `leerCuerpo` en las dos rutas. Esconder el control es cortesía; el candado es esto —
  una secretaria no ve la opción, pero un POST a mano sí podría mandarla.
- **Ante la duda, `equipo`.** Un valor raro (o un `destino` ilegible en la base) cae en equipo, nunca
  en privado: caer en privado escondería del grupo un aviso que nadie pidió esconder.

### ⚠️ Hay UN solo chat privado y DOS admin

El chat privado es el de Daniel (`TELEGRAM_CHAT_ID`). Los admin son **daniel y alberto**. Si Alberto
marca «solo a mí», **el mensaje le llega a DANIEL**. Daniel lo sabe y lo aprobó así; queda escrito en
el código, en la migración y acá para que nadie lo descubra por accidente.

### Son DOS mensajes, no uno con dos secciones

El del equipo va por `enviarNegocio` y el privado por `enviarNegocioPrivado`. Mezclarlos publicaría
en el grupo justo lo que se marcó como privado.

El privado va **sin el prefijo `🔧 SISTEMA ·`**: es el mismo patrón que el resumen diario de ACS —
destino de sistema, trato de negocio. Rotular un recordatorio como avería sería mentir en la
notificación del celular, que es exactamente lo que ese prefijo existe para no hacer.

---

## 5. 🔴 LA LÍNEA DE WHATSAPP QUE NADIE TOCABA

El aviso de cheques cerraba con:

```
WhatsApp seguimiento: +50766745522, +50766494096
```

Dos celulares **escritos a mano** en `WA_NUMBERS`, pegados al final de CADA aviso. Daniel:

> *«nada, es recordatorio nada más»*

Se retiró. No era una acción: era una firma que nadie tocaba, y encima era el único dato del mensaje
que envejecía sin que nada lo avisara. **El resto del texto de cheques no se tocó, palabra por
palabra**, y hay candado que lo verifica en las dos direcciones (que la línea no esté, y que el resto
sí).

---

## 6. LA RETENCIÓN — 365 días, y por qué no hay cron nuevo

🔴 **A los 365 días, un cheque depositado se va solo.** Un cheque cobrado hace más de un año no es
información viva: es historia que ya está en el banco y en la contabilidad. Con la lista nueva, lo
depositado ya solo aparece al buscarlo; a partir del año, ni eso.

- 🔴 **Soft delete** (`deleted = true` + `deleted_at`), **nunca un DELETE**. Si algún día hay que
  probar que un cheque se cobró, la fila tiene que seguir estando.
- 🔴 **Solo los depositados.** Lo que todavía se debe se queda para siempre.
- Se cuenta desde **cuándo se depositó**, no desde cuándo vencía: un cheque puede depositarse tarde, y
  contar desde el vencimiento lo haría desaparecer antes de tiempo. Sin `fecha_depositado` cae a
  `fecha_deposito`, **nunca a «hoy»**, que dejaría vivo para siempre a un cheque sin esa fecha.

### Por qué corre dentro de `cheques-alert` y no en un cron propio

Ese cron ya es el del módulo, ya toca la tabla `cheques` y a partir de hoy ya escribe en ella
(`aviso_vencido_en`). Un cron nuevo habría sido una entrada más en `vercel.json` —hoy son **82** de un
tope de **100**— y otra biyección que mantener, para hacer un `UPDATE` de una vez al día sobre 19
filas.

⚠️ **Consecuencia escrita, no escondida:** `cheques-alert` no corre sábado ni domingo, así que la
limpieza tampoco. Con un umbral de 365 días, correr de lunes a viernes es exactamente igual de bueno.

🩸 Y con esto **el cron dejó de ser read-only**. Sus dos escrituras son idempotentes y las dos son
soft; ninguna toca un cheque pendiente, vencido ni rebotado.

---

## 7. EL CRON: DE LAS 9:15 A LAS 9:00

`vercel.json`: `15 14 * * *` → **`0 14 * * *`** (9:00 a.m. de Panamá, UTC−5 fijo). Misma entrada, una
sola ocurrencia al día.

⚠️ **`COLATERAL_RECOVER_AFTER_HOUR_UTC["cheques-alert"]` se queda en 15**, y es a propósito: con 14
la pasada de reconciliación de las 14:00 empataría con su propio run, y **recuperar algo que todavía
no falló no es recuperar**. Solo la pasada de las 18:00 lo recupera.

---

## 8. LA DIRECCIÓN: `/cheques` → `/recordatorios`

El módulo se llamaba Recordatorios desde agosto, pero vivía en `/cheques`. Se mudó, con redirect
temporal (307) del enlace viejo en `next.config.js` — está en marcadores, en la búsqueda global y en
el atajo `G+Q`.

🔴 **La `key` del módulo NO cambió: sigue siendo `cheques`.** Vive en `role_permissions.modulos` y en
`fg_users.modulos_override`; renombrarla dejaría sin módulo a las cuatro personas que entran. Es la
cuarta vez que este repo separa el label de la key (Cheques → Recordatorios, Asistencia → «Asistencia
y Planilla», Gastos de Empresa → Gastos, y ahora la URL).

🩸 **Colateral: siete atajos de la búsqueda global apuntaban a siete pestañas que ya no existen**
(`/cheques?filter=vencen_hoy`, `?filter=pendiente`…). Caían en una pantalla que ya no lee ese
parámetro. Se convirtieron en **UN** atajo a la lista, donde esos mismos grupos están a la vista sin
elegir nada.

---

## 9. EL ARCHIVO DE 1.693 LÍNEAS

El límite de la casa es **800**. La pantalla quedó repartida:

| Archivo | Líneas |
|---|---|
| `RecordatoriosClient.tsx` (orquestador) | 784 |
| `components/ChequeFormModal.tsx` | 457 |
| `components/CalendarioMes.tsx` | 447 |
| `components/RecordatorioFormModal.tsx` | 367 |
| `components/LineaNueva.tsx` | 276 |
| `components/AgendaLista.tsx` | 250 |
| `components/ChequeModales.tsx` | 241 |

Y las **decisiones** (qué se ve, en qué grupo cae, qué encuentra el buscador, cuándo toca un
recordatorio, a quién le llega) salieron a **módulos puros** bajo `lib/recordatorios/` y
`lib/cheques-*`, testeables sin montar React. Hay candado que recorre `src/app/recordatorios/**` y
pone el build rojo si un archivo pasa de 800.

---

## 10. LOS CANDADOS Y LA VERIFICACIÓN POR MUTACIÓN

`scripts/_mutar-candados-recordatorios.sh` — **56 mutaciones, 56 cazadas**: 54 rupturas del producto
que ponen los tests en rojo, más **2 controles** que se mutan a propósito y tienen que quedar
**verdes** (sin ellos, un `TESTS` mal escrito pondría todo en rojo y el script diría «N de N cazadas»
sin haber probado nada).

🩸 **Cinco mutaciones sobrevivieron en la primera corrida** y las cinco eran huecos reales, no ruido:

| Sobrevivió | Qué faltaba |
|---|---|
| editar EXIGE mover la fecha | no había test de la RUTA para el PUT con la fecha sin cambiar |
| la ruta lee el destino del CUERPO | no había test de que una secretaria no pueda mandar `destino: privado` a mano |
| la marca se pone ANTES de enviar | no había test de «Telegram falló → no se marca» |
| el orden de los bloques | el fixture no tenía vencidos, así que el swap no cambiaba nada |
| un `destino` ilegible se lee como privado | no había test del mapeo de lectura |

Se escribieron los cinco tests que faltaban. Es exactamente para lo que sirve la mutación: **los
candados que faltan no se ven leyendo los que hay.**

### Candados que cambiaron de dirección (no se borraron)

| Archivo | Medía antes | Mide ahora |
|---|---|---|
| `iphone-g1-textos-cortados.test.ts` | que las 3 casillas de totales entraran en `lg` | que **no vuelvan**, y que nadie sume montos |
| `excel-exports-operacion.test.ts` | el round-trip del Excel de cheques | que el Excel **no vuelva** |
| `excel-encabezados-fila-1.test.ts` | «25 lugares arman una hoja» | **24** — con nota de que el de cheques se retiró a propósito |
| `ipad-caja-prestamos-cheques.test.ts` | el corte tarjetas/tabla en `xl` | que **la tabla no vuelva** (hay UNA presentación) |
| `recordatorios-pantalla.test.tsx` | las pestañas y el «+ Recordatorio» | la lista única, el renglón, el buscador y los totales ausentes |

---

## 11. LO QUE NO CAMBIÓ

- Los **19 cheques** y sus datos, intactos.
- El **texto del aviso de cheques por vencer**, palabra por palabra, menos la línea de WhatsApp.
- **Quién entra** al módulo: admin y secretaria.
- **Marcar «depositado»** lo siguen haciendo las secretarias, con el botón de siempre.
- **El calendario**: los dos layouts, el globo flotante, las píldoras.

---

## 12. LO QUE QUEDA PENDIENTE

| Qué | Estado |
|---|---|
| **Correr `20260925130000_recordatorios_rediseno.sql`** | 🔴 pendiente. El código **no degrada** sin ella (la tolerancia a «falta el DDL» se retiró de este módulo el 3-sep-2026, a propósito) |
| «Recordarme este cliente» desde la hoja **Cobrar** del CXC | pendiente — toca archivos del módulo CXC, que se estaba tocando en paralelo |
| Un chat privado por admin | ⚠️ no existe y no se inventó. Ver § 4 |
