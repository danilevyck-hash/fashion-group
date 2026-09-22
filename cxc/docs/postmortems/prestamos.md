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

## 10 · Los movimientos de una quincena (17-sep-2026)

> **Daniel:** *«quisiera que en préstamo tener como que un botón para ver el historial de las
> quincenas. Ya que para ver movimiento tengo que meterme a cada perfil. Pero para ver los
> movimientos de x quincena?»*

Mockup aprobado: `https://claude.ai/artifact/M5UeW346S7eBKSDupT8TXZ`.

🩸 **Qué pasaba.** La pestaña Préstamos lista **quién debe plata HOY** (Colaborador · Préstamo ·
Daño · Debe · Cuota · Esta quincena). Para saber **qué pasó en una quincena** había que abrir las
**31 fichas vivas**, una por una.

**Qué se hizo.** Una vista **«Movimientos»** al lado de «Quiénes deben», adentro de la MISMA pestaña
(no una octava pestaña del módulo: comparte el selector de empresa, los roles y la puerta). Dos
bloques —**Descuentos** y **Deudas nuevas**—, cinco columnas (Colaborador · Concepto · Monto · Día ·
Origen), cada bloque con su conteo y su total, y al pie **cuánto se prestó, cuánto se descontó y
cuánto creció o bajó la deuda del grupo** — la línea que no existía en ninguna pantalla.

🔴 **Es una pantalla de LECTURA.** Su ruta (`GET /api/asistencia/prestamos-movimientos`) no tiene
POST, PUT, PATCH ni DELETE, y no hay un solo `.insert`/`.update`/`.upsert`/`.delete` adentro. No
cambia ni un cálculo: el saldo, la casilla de la planilla y el cierre quedaron intactos.

### 🔴 La columna «Origen» es la razón de ser de todo esto

Dice si el movimiento lo anotó **el cierre de la quincena** o lo escribió **alguien a mano**. 🩸 Es
lo que le habría dejado ver a Daniel de una que el domingo 13-sep-2026 se cerraron seis planillas que
nadie pidió y se anotaron dos pagos, uno de ellos —$25,00 a ELOYN MENDOZA— que su planilla nunca
descontó. La escalera vive en `lib/asistencia/movimientos-quincena.ts` y tiene cuatro peldaños:

1. **El amarre manda** (`asistencia_planilla_prestamo`, sin revertir): esa planilla lo reclama como
   suyo y no hay nada que interpretar. Un amarre revertido NO cuenta — la planilla se reabrió.
2. **Un CARGO nunca es del cierre**: el cierre descuenta, no presta. ⚠️ Hoy es un cinturón (el
   peldaño 3 ya filtra por concepto); se deja escrito porque la regla es de esta pantalla.
3. **Un PAGO que salió de la quincena**, con `esDescuentoDeQuincena` — la MISMA función que usa la
   casilla de la planilla para no cobrar dos veces. Medido el 17-sep-2026: **440 de 441 movimientos
   vivos tienen `origen_pago` en NULL** (el campo nació el 8-sep-2026), así que sin este peldaño la
   pantalla diría «a mano» de toda la historia.
4. **Todo lo demás es a mano.**

⚠️ **La celda dice DOS cosas y ninguna más: «del cierre» o «a mano».** El peldaño 4 nació agregando
de dónde salió el pago de bolsillo —«a mano · Liquidación»— y Daniel lo mandó sacar el mismo día
(17-sep-2026), textual: *«Es información de más, quítala»*. **El dato no se borró: se dejó de
MOSTRAR.** `prestamos_movimientos.origen_pago` se sigue guardando, lo sigue leyendo
`esDescuentoDeQuincena` —es lo que hace que ese mismo pago diga «a mano» y no «del cierre»— y la
ficha de la persona lo sigue enseñando.

### 🔴 Por quincena, no por rango libre — y está medido

> **Daniel:** *«¿por quincena? igual a todos se le descuenta casi el mismo día no?»*

Tiene razón en los pagos, y por eso igual va por quincena. Medido sobre los 441 movimientos vivos:
**el día 15 tiene 152 y el día 30, 153**; los cargos no pasan de 8 en ningún día y están repartidos
por todo el mes. **Los descuentos caen el 15 y el 30; los préstamos se dan cualquier día.** Agrupar
por quincena es lo único que pone las dos cosas en la misma pantalla — un rango libre invita a mirar
media quincena, y ahí los totales no significan nada.

### 🔴 Ningún movimiento queda entre dos quincenas

La quincena **paga** hasta el 30 (`ultimoDiaQueSePaga`: el 31 no se paga nunca), pero un préstamo se
puede dar el 31. 🩸 Medido: **2 movimientos el 31-mar-2026** —un préstamo de $180 y un pago de $500—.
Leyendo hasta `q.hasta` esa plata no saldría en NINGUNA quincena y desaparecería sin decir nada. La
ventana termina en **`finDeLaMedicion(q.hasta)`**, la MISMA función con la que el motor de la
planilla mide el 31. Comprobado: **441 de 441 movimientos caen en alguna quincena**.

### Lo medido contra producción (17-sep-2026, `scripts/_medir-movimientos-quincena.ts`, solo lectura)

| Quincena | Descuentos | Deudas nuevas | La deuda |
|---|---:|---:|---:|
| 1 – 15 jul | 9 · $360,00 | 3 · $450,00 | creció $90,00 |
| 16 – 30 jul | 11 · $560,00 | 2 · $140,00 | bajó $420,00 |
| 1 – 15 ago | 11 · $810,00 | 3 · $1.000,00 | creció $190,00 |
| **16 – 30 ago** | **13 · $752,72** | **6 · $1.410,00** | **creció $657,28** |
| 1 – 15 sep | 2 · $325,00 | 7 · $10.932,80 | creció $10.607,80 |

Los 13 descuentos de agosto son todos del día 30 y todos del cierre; las 6 deudas son de los días 17,
18, 19, 20 y 24, todas a mano. El más grande: MARIA V. BETHANCOURTH G., $282,72 de descuento y dos
préstamos nuevos de $300 y $400. ⚠️ La fila de septiembre es correcta y Daniel ya lo sabe: la tanda
de la quincena nunca se anotó, y los $10.932,80 incluyen el cargo de terceros de JULIO GUZMÁN, que es
un relleno viejo.

### Las dos trampas del repo, las dos puestas

- **`deleted` es NULLABLE en préstamos** → `.or("deleted.is.null,deleted.eq.false")`. Un
  `.eq("deleted", false)` pierde filas, y acá perderlas es plata que no aparece en la pantalla que se
  hizo para verla toda.
- **`db-max-rows` = 1000 y corta en silencio** → las **tres** lecturas (movimientos, fichas, amarre)
  van por `leerTodoPaginado` con `count: "exact"` y `.order("id")`.

### Detalles que no son cosméticos

- Los dos bloques se **derivan** de `CONCEPTOS_RESTAN` / `CONCEPTOS_SUMAN` (`prestamos-saldo.ts`), no
  de una segunda lista: dos respuestas a «¿esto bajó o subió la deuda?» se separan solas.
- Un concepto que el sistema no sabe leer **no se cuenta por descarte**: queda fuera de los dos
  totales y se DICE cuántos son (medido hoy: 0 de 441).
- El orden es **estable**: de mayor a menor monto, empate por fecha, nombre e id. Dos cargas de la
  misma quincena dan la misma hoja.
- **El total sigue al filtro** de empresa, igual que en «Quiénes deben».
- El Excel sale por `workbookBytes` con los encabezados en la fila 3 (hay título) y el pie en la fila
  de totales, **fuera del filtro**. ⚠️ **No usa `nota:`** — esa puerta sigue con sus DOS de siempre.
- Roles: `PRESTAMOS_PESTANA_ROLES` (admin · contabilidad · secretaria), derivados, no tecleados.

Candados: `prestamos-movimientos-quincena.test.ts` (50 casos) ·
`prestamos-movimientos-pantalla.test.tsx` (9). Verificación por mutación:
`scripts/_mutar-candados-movimientos-quincena.sh` — **22 mutaciones, 22 cazadas**, 2 controles en
verde.

---

## Lo que quedó pendiente de Daniel

1. ⚠️ **BRICEIDA MONTERO**: el brief dice que ya no trabaja; producción dice que sí (activa en la
   planilla de Boston, salario $566,52). Con la regla nueva su ficha vuelve a proponer descuento de sus
   $100. Si de verdad se fue, la baja se marca en **Asistencia**.
2. ⚠️ **STEPHANY MORALES** queda con préstamo −$254,50 / daño +$254,50 (neto $0). Se respeta lo
   registrado; si Daniel quiere que se reasigne, es una migración aparte y a propósito.


---

## Lo que decía CLAUDE.md hasta el 14-sep-2026 (movido acá, verbatim)

> El 14-sep-2026 CLAUDE.md pasaba de 333 mil caracteres (el tope del harness es 150 mil) y las instrucciones se cortaban a la mitad. Se dejó ahí un resumen de las reglas vigentes y el texto completo —mediciones, citas de Daniel, candados y mutaciones— se movió acá sin cambiar una palabra.

### Préstamos — [docs/postmortems/prestamos.md](docs/postmortems/prestamos.md)

- 🔴 **Cada persona tiene DOS cuentas con su propia cuota: Préstamo y Daño de mercancía.** El total es
  la suma de las dos y **no cambió**: medido antes de partirlo, 14 personas y **$5.062,01** ($4.962,01
  + $100 de BRICEIDA MONTERO). Las 14 están congeladas una por una en `prestamos-dos-cuentas.test.ts`.
- 🔴 **La pantalla ofrece TRES conceptos** (Préstamo · Daño de mercancía · Pago) pero **la base guarda
  los CINCO de siempre**. `Responsabilidad por daño` NO se renombró: «Daño de mercancía» es una
  ETIQUETA. Renombrar un concepto no revienta nada — **deja de contarse en silencio**.
- Un **Pago baja UNA cuenta**; con las dos debiendo, «Baja de» viene puesto en la **más vieja** y se
  puede cambiar. Sin fechas el desempate es **estable** (préstamo), nunca el orden del array.
- 🔴 **El saldo se calcula en UN solo lugar** (`src/lib/prestamos-saldo.ts`). Había **ocho**, y el
  único que no lo usaba era la ficha, con un `console.warn` admitiendo que podía no cuadrar.
  `PRESTAMOS_ROLES` vive en `src/lib/prestamos-roles.ts`, no en seis archivos.
- 🔴 **La bandera `activo` de la ficha se retiró**: nunca significó «trabaja acá» sino «tiene algo
  abierto» (a ESMER le archivaron la ficha al terminar de pagar y sigue trabajando). **La columna NO
  se borra** — queda sin lectores, con `COMMENT` y test que pone el build rojo si se dropea o si
  alguien vuelve a filtrar por ella. La lista muestra **solo a quien debe**; quien llega a cero sale
  solo; **quien ya no trabaja pero debe SÍ aparece**, marcado y sin descuento.
- 🔴 **La persona sale de Asistencia**: el nombre, si trabaja y el salario. Una ficha nueva **nace con
  su `empleado_codigo`**, elegido de las 37 personas activas — y ese código **ya se puede editar desde
  la pantalla** (hasta el 5-sep-2026 no se podía desde ningún lado, y el aviso de la planilla decía que
  sí; así nacieron **$400** de deuda que la planilla no podía descontar).
- 🔴 **Nada se ata por parecido**, ni acá ni nunca: lista escrita a mano con el nombre que ese código
  tiene que tener en Asistencia, y el UPDATE lo EXIGE. Barrido en `prestamos-amarre-migracion.test.ts`
  sobre las **dos** migraciones del amarre.
- 🔴 **NADIE APRUEBA UN PRÉSTAMO (11-sep-2026).** Daniel, textual: *«Aprobar préstamos: eso también se
  quita»*. Un préstamo nace `aprobado` de una, lo registre quien lo registre. **El tope de UN SUELDO
  MENSUAL** sobre la deuda **TOTAL** (préstamo + daño; **sin sueldo cargado, $500**) se sigue
  calculando pero solo **AVISA**: en pantalla («pasa el tope… se registra igual y se le avisa a
  Daniel») y por Telegram al chat privado, diciendo quién lo registró. **El daño de mercancía nunca
  pasa por el tope** — ya se perdió, y no anotarla no la devuelve. Medido antes de retirarlo: **0
  préstamos esperando** (447 movimientos, todos `aprobado`), así que no hubo nada que aprobar por
  migración.
- 🩸 **Lo que se fue con la aprobación**: la ruta `/api/prestamos/pendientes`, la pantalla «Por
  aprobar», `puedeAprobarPrestamo` (admin **y** `daniel`), el estado pendiente en la lista, la ficha y
  las tarjetas, y el cron **`prestamos-caducan`** (7 días sin respuesta → se borraba solo): salió de
  `vercel.json`, del registro y de los crons que avisan. `ESTADO_PENDIENTE` y `pendienteDeAprobacion`
  quedan en `prestamos-saldo.ts` sin lectores, para leer una fila vieja si apareciera. Candados que
  cambiaron de dirección con nota: `prestamos-tope` · `prestamos-tope-y-duplicados` ·
  `prestamos-un-solo-lugar` · `prestamos-salida-con-deuda` · `iphone-targets-prestamos` ·
  `alertas-que-llegan` · `ipad-caja-prestamos-cheques`.
- 🩸 **El freno de duplicados mira concepto + origen + fecha, NUNCA la nota.** Leía `notas ilike
  'Deducción quincenal%'` y `ilike` no ignora acentos: **18 filas vivas lo burlaban**. `origen_pago`
  en NULL se lee como Quincena — en la duda se omite, nunca se cobra dos veces. **La nota es opcional**
  (8 de cada 10 eran un eco del concepto).
- La planilla propone la cuota del **préstamo** en su casilla y la de **terceros** en la suya (el daño
  no propone cuota), cada una capeada a SU saldo — y desde el 11-sep-2026 **entran solas**, sin
  aprobar (ver Asistencia).
- 🔴 **«No descontar el préstamo esta quincena» se decide en la FILA de la planilla, escribiendo 0** (11-sep-2026, Daniel: *«sí»* a poder saltarse una quincena). Las casillas «Préstamo» y «Terceros» de `asistencia_planilla_manual` tienen **tres estados** (migración `20261115120000`, **aplicada**): `NULL` = nadie escribió nada, va la cuota automática · `0` = escrito a propósito, **esta quincena no se descuenta** · monto = se descuenta ese monto. 🩸 Eran `NOT NULL DEFAULT 0` y el 0 se leía como «vacío → la cuota»: borrar la casilla traía la cuota, escribir 0 traía la cuota; el único camino era bajar la cuota en la ficha y volver a subirla. La regla vive en `lib/asistencia/casilla-sin-descontar.ts` (`estadoCasilla` · `valorTecleado`, la MISMA función para la pantalla y para `normalizarManuales`). Con 0 la celda muestra el 0 y debajo, **visible**, «No se descuenta esta quincena»; «Antes de cerrar» lo lista en la parte informativa (*«N préstamos sin descontar esta quincena, a propósito (nombre · $cuota)»*); el cierre **no anota pago** y lo dice como decisión (`sin-descontar`), no como olvido. **El 0 se muestra solo donde había una cuota que saltar.** La ficha del préstamo y «Anotar abono» **no se tocaron**. Backfill: **todo 0 pasó a NULL** — medido: 28 filas, `prestamo = 0` en 6 y `terceros = 0` en 28; hasta ese día un 0 solo podía significar «vacío», y así **nadie cambia de neto** (1–15 sep, 3 empresas: 12 personas, $495,00 antes = $495,00 después, 0 cambios; `scripts/_medir-sin-descontar-esta-quincena.ts`). ⚠️ `mercancia`, `isr` y `otros_servicios` siguen `NOT NULL DEFAULT 0`: no proponen cuota, así que 0 y vacío dicen lo mismo. Candados: `planilla-sin-descontar.test.ts` · `planilla-manual-cero-route.test.ts`; verificación por mutación en `scripts/_mutar-candados-sin-descontar.sh`.
- 🩸 **«Eliminar Todo el Historial» dejó de ser el único hard delete del repo**: soft delete con
  `logActivity`.
- Al marcar la **fecha de salida** de alguien con deuda, Asistencia lo dice ahí mismo: *«Debe $100 —
  descuéntalo de la liquidación»*. Sin Telegram.

- 🔴 **El aviso «pasa el tope de un sueldo» sale en ÁMBAR y por 8 s** (11-sep-2026). 🩸 Salía como éxito verde y se iba a los 3 s: la pestaña clasificaba por el TEXTO (`startsWith("Error")`). Ahora `useMovimientoForm` manda el TIPO con el mensaje (`warning` con `sobreTope`, `error` ante un error, `success` si no), y `ToastSystem` lee `duracionToastMs(tipo)` — la regla de la casa: éxitos 3 s, errores y avisos 8 s — en vez de un 3000 escrito a mano.
- 🔴 **«+ Préstamo» de la ficha abre el formulario CON esa persona** (`enlaceANuevoPrestamo(codigo)` → `?tab=prestamos&nuevo=<código>`; la pestaña elige a esa persona como si se la hubiera tocado). Sigue siendo LA MISMA puerta, no un formulario propio. 🩸 Llevaba a la lista general y había que volver a buscarla.
- 🔴 **«+ Nuevo préstamo» ofrece solo a los de la empresa elegida arriba** (con «Todas», todos). 🩸 La lista y el total filtraban; el alta ofrecía a las 4.
- 🩸 **`cron_heartbeats` conservaba la fila `prestamos-caducan`** (el cron se retiró el 11-sep): migración `20261116120000_borrar_heartbeat_prestamos_caducan.sql` (DELETE por nombre EXACTO, patrón `sync-mayor`), **aplicada y verificada** (0 filas). Candados: `prestamos-tope-ambar-y-nuevo-desde-ficha.test.tsx` · `prestamos-salida-con-deuda.test.tsx` (la migración).


---

## Lo que decía CLAUDE.md de las tres cuotas y del neto no negativo, hasta el 19-sep-2026 (verbatim)

> El 19-sep-2026 entraron a CLAUDE.md las seis reglas nuevas de Asistencia y el archivo estaba al tope del harness. Estos dos párrafos se resumieron allá; acá quedan ENTEROS, con sus citas y sus mediciones. **Las reglas siguen vigentes**: lo único que se movió es el detalle.

- 🔴 **LAS TRES CUOTAS ENTRAN SOLAS: préstamo, terceros y DAÑO DE MERCANCÍA** (14-sep-2026), cada una capeada a SU saldo y sin aprobar. Daniel: *«Tanto el chico como el grande que sea por cuota. Agregan el daño como se hace un préstamo, se elige la cuota y listo»*. El daño se registra en «+ Nuevo préstamo» **con su cuota, igual que un préstamo**, y desde ahí baja solo hasta saldarse. Las tres casillas tienen los MISMOS tres estados (`NULL` = va la cuota · `0` = no se descuenta esta quincena · monto = ese monto); la de mercancía por la migración `20261122120000` (**aplicada y verificada el 14-sep-2026**: 25 ceros pasaron a vacío, los 4 con monto intactos). 🔑 Lo ya anotado le gana a la cuota: un «Pago de responsabilidad» de otro origen no se vuelve a cobrar. Las tres cuotas **se editan en «Editar ficha»** (un `0` apaga la cuota y **no borra la deuda**). 🔴 **Boston suma las TRES en su «descuenta $X por quincena»**: dejar una afuera le muestra a David menos de lo que la planilla aplica.

- 🔴 **EL DESCUENTO NUNCA DEJA EL NETO EN NEGATIVO** (14-sep-2026, Daniel: *«a) Que nunca pase del neto: descuenta lo que alcance y el resto queda debiendo»*; es red de seguridad). 🩸 El motor no tenía piso. `recortarAlNeto` (`lib/asistencia/neto-no-negativo.ts`) corre **al FINAL de la ruta**, achica **solo lo AUTOMÁTICO** (lo escrito a mano manda), en el orden **daño → terceros → préstamo** (decisión de construcción: el préstamo es el compromiso más viejo), y anota `prestamoAutomatico.recortado`. **El saldo no baja por lo que no se cobró**: el cierre anota solo lo que entró (omisión `neto-no-alcanzo` si quedó en cero). Se DICE en la celda y en «Antes de cerrar». **El ISR sigue a mano.** Medido: la cuota más pesada hoy es $70 sobre ~$262 (27 %).

---

## Lo que decía CLAUDE.md hasta el 22-sep-2026 (movido acá, verbatim)

### Préstamos — [docs/postmortems/prestamos.md](docs/postmortems/prestamos.md)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/prestamos.md](docs/postmortems/prestamos.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- 🔴 DOS cuentas con su cuota (Préstamo · Daño de mercancía) y el total es la suma; en la base son CINCO conceptos, «Daño de mercancía» es solo ETIQUETA de `Responsabilidad por daño`.
- Un **Pago baja UNA cuenta**; con las dos debiendo, «Baja de» viene puesto en la **más vieja** y se puede cambiar. Sin fechas el desempate es **estable** (préstamo), nunca el orden del array.
- 🔴 El saldo sale de UN solo lugar (`prestamos-saldo.ts`); los roles, de `prestamos-roles.ts`.
- 🔴 `activo` se retiró y la columna NO se borra: sin lectores, con `COMMENT` y build rojo si se dropea o si vuelven a filtrar por ella. Solo se lista a quien debe; el que ya no trabaja pero debe SÍ aparece, sin descuento.
- 🔴 La persona sale de Asistencia y la ficha nace con su `empleado_codigo`, editable. Nada se ata por parecido: lista a mano, y el UPDATE lo EXIGE.
- 🔴 NADIE APRUEBA UN PRÉSTAMO: nace `aprobado`. El tope de UN SUELDO MENSUAL sobre la deuda TOTAL (sin sueldo, $500) solo AVISA, en pantalla y Telegram privado; el daño nunca pasa por el tope.
- 🔴 El freno de duplicados mira concepto + origen + fecha, NUNCA la nota (`origen_pago` NULL = Quincena). Soft delete con `logActivity` hasta en «Eliminar Todo el Historial».
- 🔴 **LAS TRES CUOTAS ENTRAN SOLAS: préstamo, terceros y DAÑO DE MERCANCÍA** (14-sep-2026), cada una capeada a SU saldo y sin aprobar. El daño se registra en «+ Nuevo préstamo» **con su cuota, igual que un préstamo**. Las tres casillas tienen los MISMOS tres estados (`NULL` = va la cuota · `0` = no se descuenta esta quincena · monto = ese monto); la de mercancía por `20261122120000` (**aplicada**). 🔑 Lo ya anotado le gana a la cuota. Se editan en «Editar ficha» (un `0` apaga la cuota y **no borra la deuda**). 🔴 **Boston suma las TRES** en su «descuenta $X por quincena». Detalle y citas en el postmortem.
- 🔴 «No descontar esta quincena» = un 0 en la FILA: `asistencia_planilla_manual` tiene tres estados (`NULL` = cuota · `0` = no se descuenta · monto) en `lib/asistencia/casilla-sin-descontar.ts`, la MISMA para pantalla y `normalizarManuales`; con 0 el cierre no anota pago.
- 🔴 **LA CUOTA ES OBLIGATORIA al registrar Préstamo · Daño de mercancía · Descuento a terceros** (14-sep-2026, Daniel: *«a) La cuota es obligatoria: no te deja guardar sin ella»*); **un Pago no la pide**. 🩸 Sin cuota la deuda no se descontaba nunca sola, y desde `/prestamos` (la puerta viva) ni se preguntaba. El botón apagado DICE qué falta («Falta: la cuota», visible). Regla en `lib/prestamos-registrar.ts`. Medido: 31 fichas vivas, las 31 con cuota.
- 🔴 **EL DESCUENTO NUNCA DEJA EL NETO EN NEGATIVO** (14-sep-2026; red de seguridad). `recortarAlNeto` (`neto-no-negativo.ts`) corre **al FINAL de la ruta**, achica **solo lo AUTOMÁTICO** (lo escrito a mano manda), en el orden **daño → terceros → préstamo**. **El saldo no baja por lo que no se cobró**: el cierre anota solo lo que entró. Se DICE en la celda y en «Antes de cerrar». **El ISR sigue a mano.** Detalle y mediciones en el postmortem.
- 🔴 **Los movimientos de UNA quincena, en una pantalla y no en 31 fichas** (17-sep): vista «Movimientos» adentro de la pestaña, solo LECTURA, con «Origen» (del cierre o a mano). Postmortem › 10.
- Candados: `prestamos-dos-cuentas.test.ts` · `planilla-sin-descontar.test.ts` · `prestamos-cuota-obligatoria-y-neto.test.tsx` (26 casos, con los dos controles; `planilla-unida-cierre-prestamo` cambió de dirección con nota fechada).
