# Préstamos — el porqué

> Post-mortem del módulo `/prestamos`, escrito el **5-sep-2026** con el rediseño que Daniel definió
> entero (mockups aprobados uno por uno). Todo lo medido acá se midió **contra producción** por la
> Management API antes de tocar una línea de código.
>
> La referencia de **qué HAY** (pantallas, tablas columna por columna, cómo probarlo a mano) vive en
> [`docs/modulos/07-prestamos.md`](../modulos/07-prestamos.md). Acá está **por qué está así**, con las
> citas de Daniel y los números.
>
> Lo que se había escrito antes de este módulo estaba repartido en
> [`asistencia-planilla.md`](asistencia-planilla.md) (la casilla «Préstamo» de la planilla, 27-ago) y
> [`boston-cxc.md`](boston-cxc.md) (la pestaña de David, 2-sep). Esos dos siguen valiendo.

---

## 🔴 La regla que no se podía romper

**Cero cambio en el saldo de nadie.** Medido el 5-sep-2026, antes de escribir nada:

| | |
|---|---|
| personas con saldo | **14** |
| total vivo | **$5.062,01** |
| en 13 fichas «activas» | $4.962,01 |
| + BRICEIDA MONTERO (archivada) | $100,00 |

Las 14, una por una, están congeladas en `src/__tests__/lib/prestamos-dos-cuentas.test.ts`. Si una
migración o un refactor mueve un centavo, el build se pone rojo **con el nombre de la persona**.

---

## 1 · Tres conceptos, dos cuentas

Había **cinco conceptos** sumando a **un solo saldo**:

| concepto | signo | 2025 | 2026 |
|---|---|---|---|
| `Pago` | resta | 80 · $6.228,40 | 191 · $11.675,54 |
| `Préstamo` | **suma** | 21 · $15.321,45 | 53 · $8.540,00 |
| `Pago de responsabilidad` | resta | 27 · $761,73 | 32 · $879,79 |
| `Responsabilidad por daño` | **suma** | 4 · $1.322,25 | 20 · $573,77 |
| `Abono extra` | resta | 1 · $300,00 | 3 · $850,00 |

Daniel los llevó a **tres** —**Préstamo · Daño de mercancía · Pago**— con **dos cuentas separadas por
persona**, cada una con su propia cuota quincenal:

```
Préstamo            $220.00
Daño de mercancía    $50.00
──────────────────────────
Debe                $270.00
Préstamo $30 · Daño $10 por quincena
```

### 🔴 Lo que NO se hizo, y es lo importante

**No se renombró ningún valor guardado.** `Responsabilidad por daño` se sigue escribiendo así en la
base y se **muestra** como «Daño de mercancía»; `Abono extra` y `Pago de responsabilidad` dejaron de
**ofrecerse** —son un pago de otro monto— pero las 432 filas vivas conservan su nombre y cuentan
igual. `prestamos-saldo.ts` mantiene las **cinco** listas.

El motivo está medido en la propia documentación del módulo: **renombrar un concepto no revienta
ningún cálculo, lo deja de contar**. Un `UPDATE … SET concepto = 'Daño de mercancía'` habría cambiado
el saldo de la gente en silencio. La pantalla cambia; la base no.

### El corte, medido

De las 14 personas con saldo, **13 quedan con toda la deuda en «Préstamo» y cero en «Daño»**. Hay un
único caso cruzado y **no se reasignó nada**:

> 🩸 **STEPHANY MORALES** (ficha archivada, saldo neto $0) tiene sus pagos de daño registrados como
> `Pago`. Al separar, su cuenta Préstamo da **−$254,50** y su cuenta Daño **+$254,50**. Se respeta lo
> que alguien registró y la ficha lo muestra como está. Su total sigue siendo $0.

### La cuenta más vieja cobra primero

Un **Pago baja UNA cuenta**. Si la persona debe las dos, el formulario muestra **«Baja de»** puesto en
la más vieja y editable; si debe una sola, no se pregunta. El desempate sin fechas es **estable**
(préstamo), nunca el orden en que llegó el array.

---

## 2 · La bandera `activo` no significaba lo que decía

> 🩸 **`activo` nunca quiso decir «trabaja acá». Quería decir «tiene algo abierto».**

Medido: a **ESMER CRUZ** le archivaron la ficha al terminar de pagar sus $600 y **sigue trabajando**;
a **KENNER HERNANDEZ** igual tras pagar $3,13. También a ELOYN MENDOZA, a JORMAN HERNANDEZ y a ROXANA
HERNANDEZ. Cinco fichas «archivadas» de gente activa en la planilla.

El saldo ya dice lo que la bandera intentaba decir. Entonces:

- La lista muestra **solo a quien debe**, agrupado por empresa. Quien llega a cero **sale solo**.
- **«Archivar» y «Reactivar» desaparecieron**, y con ellos «Forzar Archivado» (que existía solo
  porque «Archivar» exigía saldo exactamente 0, así que `Contabilidad` —quien usa el módulo— no podía
  archivar a nadie con saldo).
- 🔴 **La columna NO se borra** (patrón `mayor_lineas`): queda sin lectores, documentada con
  `COMMENT ON COLUMN`, y hay test que pone el build rojo si una migración la dropea **o si alguien
  vuelve a filtrar por ella**.
- **Quien ya no trabaja pero debe SÍ aparece**, marcado «Ya no trabaja · no se descuenta».
- ⚠️ `GET /api/boston/inicio` contaba `activo = true` para la tarjeta de David: pasó a contar
  **quién debe**, que es lo que él miraba igual.

### ⚠️ Una consecuencia que hay que mirar

El brief daba por hecho que **BRICEIDA MONTERO ya no trabaja** ($100 desde marzo, ficha archivada).
**Producción dice lo contrario**: en `asistencia_personas` está `activo = true`, sin fecha de salida,
con salario $566,52 — o sea, en la planilla de Boston. Con la regla nueva («quién trabaja lo dice
Asistencia»), **su ficha vuelve a proponer descuento**. Es probablemente lo correcto —$100 de deuda
viva que no se descuenta desde marzo por una bandera puesta a mano— pero es un cambio de plata real y
lo decide Daniel: si de verdad ya no trabaja, la baja se marca en **Asistencia**, y ahí el sistema
avisa de la deuda (§ 6).

---

## 3 · La persona sale de Asistencia

> **Daniel:** *«deberías de usar el nombre de asistencia para que todo tenga coherencia»*

`prestamos_empleados.nombre` es texto libre que alguien tecleó; `asistencia_personas.nombre` es la
ficha del reloj, la que se imprime en la planilla. Dos nombres para la misma persona son dos personas
para cualquiera que mire dos pantallas.

Cambian **cinco** fichas: cuatro de contenido y una de mayúsculas.

| en Préstamos | en Asistencia | código |
|---|---|---|
| `LAURA CASIANI` | `Laura Lismari Casiano Vega` | 38 |
| `MARIA BETHANCOURTH` | `MARIA V. BETHANCOURTH G.` | 49 |
| `GABRIELA A. JARAMILLO P.` | `GABRIELA JARAMILLO` | 53 |
| `LUIS ADRIAN ARROYO` | `LUIS ARROYO` | 9 |
| `ROXANA HERNANDEZ` | `Roxana Hernandez` | 1 |

Ninguna mueve un centavo: el saldo cuelga del `id` de la ficha, no del nombre.

### 🩸 «Se atan en Préstamos, eligiendo la persona de la ficha» — y esa acción no existía

El aviso ámbar de la planilla decía eso, textual, desde el 2-sep-2026. **`empleado_codigo` no se podía
poner desde ninguna parte**: el PUT solo aceptaba `nombre, empresa, deduccion_quincenal, notas,
activo`. Las dos fichas creadas el **2 y el 4 de septiembre** nacieron sin código —**$400 de deuda
viva que la planilla no podía descontar**— y la única salida era otra migración.

Ahora:

- **«Nuevo préstamo» busca entre las 37 personas activas** de `asistencia_personas`, agrupadas por
  empresa (Boston 21 · Vistana 9 · Fashion Wear 7). Antes solo salían las 15 que ya tenían ficha.
- Una ficha nueva **nace con su código**: el servidor saca el nombre y la empresa de Asistencia.
- **`empleado_codigo` se edita desde la ficha**, eligiendo de una lista. Nunca se teclea: lo que viaja
  es el CÓDIGO.
- El buscador de arriba encuentra a las 37 **deban o no** — es la única forma de abrir la ficha de
  quien ya terminó de pagar.

### 🔴 Nada se ata por parecido. Ni acá ni nunca

Los dos amarres que faltaban van como **lista escrita a mano**, cada renglón con el nombre de
Préstamos, la empresa, el código y **el nombre que ese código tiene que tener en Asistencia**. Si el
nombre no es el esperado, la fila **no se escribe**:

| en Préstamos | → | código | nombre en Asistencia | saldo |
|---|---|---|---|---|
| `MARTHA AZUCENA CHAVARRIA` | | **43** | `MARTHA ASUCENA CHAVARRIA Z.` | $300 |
| `YERITZA Y. SOLIS CASTRO` | | **51** | `YERITZA YANETH SOLIS CASTRO` | $100 |

AZUCENA con **Z** y ASUCENA con **S** no cruzan solas, y así tiene que ser. El barrido de
`prestamos-amarre-migracion.test.ts` (que prohíbe `LIKE`, `similarity`, `unaccent`, `levenshtein`,
`substring`, `regexp_*`…) se **extendió a la migración nueva**.

### Ramón Miranda vuelve a ser una sola persona

`RAMON MIRANDA` tenía **dos fichas con el mismo código 21** —la única duplicada del módulo— y la
archivada existía **solo porque le crearon una segunda ficha para poder cobrarle un daño de $3,13**.
Es exactamente el problema que las dos cuentas vienen a resolver.

🔴 **$220 + $0 = $220. No cambia ningún número.** Los 2 movimientos de la ficha vieja se **mudan** a la
viva (no se borran) y la sobrante queda `deleted`. Quedan 36 movimientos en una sola persona. El guard
exige que las dos sigan siendo las medidas: mismo código, mismo nombre, y la que se retira con saldo
CERO.

**8 fichas viejas de Boston sin código** (JOHANA VALLEJO ×2, LUZ LOPEZ ×2, STEFANY/STEPHANY MORALES,
YANKATERY, YEISON LLORENTE) se quedan como están: gente que salió, saldo 0, no están en Asistencia.
Su historial se conserva y no aparecen.

---

## 4 · El tope: un sueldo mensual

Al registrar un **Préstamo** se compara **deuda total (préstamo + daño) + lo nuevo** contra el
**salario mensual** de `asistencia_personas`.

- **Sin salario cargado, el tope es $500.** No «sin tope» ni «cero»: las dos serían una decisión que
  nadie tomó.
- **Se recalcula siempre** con el sueldo del momento. No hay foto guardada.
- 🔴 **Solo frena el PRÉSTAMO. El daño de mercancía se registra SIEMPRE**, sin freno: no es plata que
  se entrega, es plata que **ya se perdió**, y no anotarla no la devuelve.
- 🔴 **Mira la deuda TOTAL**, no solo la cuenta de préstamos: un daño encima es exactamente el caso
  que el tope existe para frenar.

Si pasa: aviso **«Este préstamo necesita aprobación de Daniel»** con el detalle (cuánto debe, cuánto
pide, cuánto quedaría, contra qué techo), el botón dice **«Mandar aprobación»** y se guarda
**pendiente**.

### 🩸 Y esta vez lo que espera NO se esconde

Esta es la diferencia con el freno de $500 que existió hasta el 27-ago-2026 y que se retiró porque
**escondía plata**: **LUIS ADRIAN ARROYO** tuvo **$700 del 5-ago atrapados en `pendiente_aprobacion`
durante 22 días**, con su saldo mostrando **$0** y sin que se le descontara nada. Se supo porque la
contadora lo mencionó de pasada.

> **El freno no protegía: escondía.**

Por eso lo pendiente **no suma al saldo** (no se entregó) **pero se ve, en tres superficies**:

1. en la **lista**: «Esperando aprobación $200.00 · no suma al saldo hasta que Daniel lo apruebe»;
2. en la **ficha**: el movimiento resaltado en ámbar, con **«Esperando a Daniel · hace N días»** y la
   columna Saldo diciendo «No suma»;
3. en su **pantalla propia** (`/prestamos/aprobaciones`), con **Aprobar / Rechazar**.

Y **se acaba**: sin respuesta en **7 días se elimina solo** (cron `prestamos-caducan`, 13:15 UTC =
8:15 a.m. Panamá, antes de que la contadora empiece), avisando por Telegram con nombre y monto. Un
pendiente que espera para siempre es plata escondida.

### 🔴 Solo Daniel aprueba — y eso es una persona, no un rol

Hay **dos usuarios con rol `admin`** en producción (`daniel` y `alberto`), así que preguntar por el
rol dejaría aprobar a alguien que no lo decide. `puedeAprobarPrestamo` pide **rol admin Y que sea él**.
Contabilidad y David **lo ven** —el GET es de todo el módulo— con los botones apagados y una línea que
lo dice. Esconderlo de ellos sería volver a tener plata que espera sin que nadie sepa que espera.

**Aprobar** → suma al saldo y **entra al descuento de la quincena en curso aunque ya haya empezado**
(el saldo no mira fechas y la cuota se calcula sobre él). **Rechazar** → soft delete, con registro.

El Telegram va a `enviarNegocioPrivado` —destino de sistema, trato de negocio, **sin el prefijo
🔧 SISTEMA**: rotular un préstamo que espera como una avería sería mentir en la notificación del
celular.

### ⚠️ Dos personas ya pasan el tope hoy

**ÁNGELA GARCÍA** debe $1.798,05 con sueldo $800 · **ANDRÉS GONZÁLEZ** debe $900 con $850.
**No se les pide nada por lo que ya deben**: el tope solo mira un préstamo NUEVO.

### El aviso viejo de los $500 era mentira

El texto «⚠ Este préstamo requiere aprobación por el monto (≥ $500)» aparecía en **dos** modales y
**era falso desde el 27-ago**: la API aprobaba todo. Se fue con su botón.

---

## 5 · «De dónde salió», y el freno que estaba apagado

Al registrar un **Pago**, botones: **Quincena** (por defecto) · Décimo · Vacaciones · Liquidación ·
Efectivo.

Medido: **9 pagos reales salieron de una liquidación, del décimo o de vacaciones** y hoy eso solo se
sabe si alguien lo escribió a mano en la nota — JOHANA $700 + $286 de liquidación, ROXANA «Deducción
quincenal 50.00 y vacaciones 400.00», ÁNGELA $233,40 del décimo.

**La nota pasa a ser OPCIONAL.** Las 432 filas vivas la tienen y **8 de cada 10 son un eco del
concepto** («PRESTAMO», «DEDUCCION QUINCENAL»): obligar a escribirla producía ruido, no información.

### 🩸 Y por eso el freno de duplicados deja de leer texto

El dedup del POST bloqueaba la segunda deducción de la quincena **solo si `notas` empezaba con
«Deducción quincenal»**, con un `ilike`. Y `ilike` **no ignora los acentos**. Medido el 5-sep-2026,
filas vivas que ese freno **dejaba pasar**:

| nota | filas |
|---|---|
| `DEDUCCION QUINCENAL ` | 8 |
| `DEDUCCION QUINCENAL` | 4 |
| `DEDUCCION DE QUINCENA` (+1 con espacio) | 3 |
| `DESCUENTO QUINCENAL ` | 1 |
| `Pago quincenal` | 1 |
| `Descontar 25 por quincena ` | 1 |
| **total** | **18** |

**El candado estaba apagado y nadie lo sabía.**

Ahora mira **concepto + origen + fecha** (la ventana de quincena que ya existía, asimétrica
`[inicio, fin+3]`), **por cuenta**: un segundo pago de **Quincena** de la misma cuenta dentro de la
misma quincena se rechaza. `origen_pago` en NULL —los 443 movimientos viejos— **se lee como
Quincena**: en la duda se omite, nunca se cobra dos veces. Los pagos de otro origen (décimo,
vacaciones, liquidación, efectivo) **no se frenan**: son plata distinta y a propósito.

---

## 6 · Cuando alguien sale debiendo

> **Daniel:** avisar **ahí mismo**, al marcar la fecha de salida. Sin Telegram (eligió la opción (a)).

En **Asistencia › Configuración**, el bloque «¿Se fue de la empresa?» dice, en ámbar, pegado al
formulario: **«Debe $100 en Préstamos — descuéntalo de la liquidación.»** Y el aviso viaja también en
el toast de guardado, porque la ficha se cierra al guardar y el cartel se va con ella.

Es el momento en que se decide la liquidación, y el único en que ese dato sirve: después la persona ya
cobró y la plata se fue.

⚠️ **Si Préstamos no contesta, la planilla NO se cae**: el mapa de deuda vuelve vacío y el aviso falta,
nada más. Cambiar eso por un `throw` convertiría «no sé cuánto debe» en «no hay pantalla de
Asistencia».

---

## 7 · La planilla

> **Daniel, al ver el mockup de las dos cuentas:** *«juntos»*

La casilla «Préstamo» del cuadro es **UNA** y así se queda: propone **la suma de las dos cuotas**
($30 + $10 = $40). 🔑 **Cada cuenta se capea a SU propio saldo y recién después se suman** — capear la
suma contra el total dejaría cobrar de más en una cuenta lo que sobra en la otra.

El sueldo repartido entre empresas **no reparte el descuento**: va al total de la persona.

Lo que ya estaba fijado en `prestamos-planilla.ts` **no se tocó**: acá no se recalcula el saldo, el
hecho consumado le gana a la estimación, «Abono extra» no es descuento, se agrupa por **CÓDIGO**, el
descuento se **aprueba** y lo no aprobado **se ve en ámbar**, y la ventana de «ya descontado» es
**exacta** (sin los ±3 días de la RPC).

Lo único que se retiró de ahí es el `if (!f.activo) return 0`: la bandera se fue, y el filtro de verdad
ya estaba puesto y es más fuerte — **solo entra quien está en el cuadro de esta quincena**, o sea quien
cobra.

---

## 8 · Lo que se fue

| qué | por qué |
|---|---|
| Las **3 pestañas de estado** (Pendientes 0 · Aprobados 443 · Rechazados 0) y el botón «Aprobar» viejo | con 443 de 443 en `aprobado` decían siempre lo mismo y la columna Estado nunca se pintaba. Lo que espera va **resaltado en la misma lista**, no detrás de un filtro que nadie toca |
| El aviso de los **$500** y `approveMov()` | mentira desde el 27-ago; la función era inalcanzable |
| Los dos **`UndoToast`** | se destructuraba `scheduleUndoMov` y **nunca se llamaba**: el «Deshacer» no se mostró jamás. Son registros financieros |
| La columna **«Estado» del Excel** | `estadoLabel()` traducía dos valores que la pantalla no produce |
| 🩸 **«Eliminar Todo el Historial» como hard delete** | era el **único `.delete()` real del repo**, en la tabla de plata, **sin `logActivity`**. Si alguien lo tocaba, el saldo pasaba a $0 y no quedaba forma de saber quién ni cuándo. Ahora es soft delete **con registro** |
| El modal de **6 tarjetas para 5 conceptos** | «Pago Quincenal» y «Pago Extra» eran el mismo `Pago` |
| El **panel deslizante del celular** y el paso «Seleccionar Empleado» de la lista | eran dos de los **cinco caminos** para registrar el mismo pago |

### 🔴 Y el saldo se calcula en UN solo lugar

Había **ocho**, y el único que no usaba `calcularSaldoPrestamo` era **la ficha**, que traía un
`console.warn` diciendo, textual: *«Saldo running ($X) no coincide con saldo backend ($Y)»* — la
advertencia que `prestamos-saldo.ts` fue creado para evitar, escrita en el único archivo que no lo
usaba. Hoy pasan por ahí los ocho: la lista, la ficha, los dos endpoints de validación, el Excel,
Data Health, el buscador global, la planilla y las dos rutas de Boston. La RPC lo hace en SQL con la
**misma derivación**, y hay candado que compara las dos.

`PRESTAMOS_ROLES` estaba tecleado a mano en **seis archivos** (dos con el literal repetido adentro).
Ahora vive en `src/lib/prestamos-roles.ts`, y un barrido pone el build rojo si vuelve a aparecer.

---

## 9 · El Excel

Al tocar «Descargar historial» se pregunta **«¿Solo los que deben o todos?»**.

> **Daniel:** *«que esté la opción después de apretar descargar»*

Antes salía `.eq("activo", true)` y punto: el historial de las 17 fichas archivadas **no salía en
ningún export**, incluidos los $100 de BRICEIDA MONTERO. La hoja Resumen trae ahora las dos cuentas
(cuota y saldo de cada una) y la de Movimientos la cuenta y de dónde salió el pago. **Lo que espera
aprobación no sale**: en un papel sin su contexto se leería como si ya se hubiera entregado.

---

## Lo que quedó pendiente de Daniel

1. ⚠️ **BRICEIDA MONTERO**: el brief dice que ya no trabaja; producción dice que sí (activa en la
   planilla de Boston, salario $566,52). Con la regla nueva su ficha vuelve a proponer descuento de sus
   $100. Si de verdad se fue, la baja se marca en **Asistencia**.
2. ⚠️ **STEPHANY MORALES** queda con préstamo −$254,50 / daño +$254,50 (neto $0). Se respeta lo
   registrado; si Daniel quiere que se reasigne, es una migración aparte y a propósito.
