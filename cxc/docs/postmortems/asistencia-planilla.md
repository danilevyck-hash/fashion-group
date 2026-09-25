# Post-mortems — Asistencia y planilla

> Movido de `cxc/CLAUDE.md` el 31-ago-2026 para bajar lo que se inyecta en cada sesión.
> **Nada se resumió ni se borró: el contenido es verbatim**, con sus «Daniel, textual»,
> sus mediciones, sus «Candados», sus «Verificado por mutación» y sus 🩸.
> La REGLA vigente (sin la historia) vive en «Invariantes por módulo» de `cxc/CLAUDE.md`.

---

## 🔴 Las horas del día se arrastran de columna (25-sep-2026)

**Qué aprobó Daniel.** Del mockup `asistencia-marcas-propuestas.html`, **solo la segunda idea**:
«Arrastrar la hora». La primera —la «propuesta de marcas», que rellenaba el día solo y pedía
«Así fue ✓»— **la rechazó**, y no se construyó nada de eso. El aviso de entrada temprana tampoco
se tocó.

**Qué hace.** En el detalle del colaborador, dentro de la fila del día:

1. una **marca suelta** —la de la línea «Otra marca del día: 13:14:49»— se agarra y se suelta en
   una columna VACÍA (Entrada · Sale almz. · Vuelve · Salida);
2. una hora que **ya está en una columna** se lleva a otra (la 13:48:07 de «Salida» a «Vuelve»);
3. mientras se arrastra, la columna que puede recibirla se prende en azul y la hora de origen
   queda tenue; **soltar fuera de una columna no hace nada**;
4. al soltar, se abre la casilla de destino con la hora puesta, el porqué escrito solo —«Marca
   movida de columna», que se puede cambiar— y «Guardar · Cancelar». 🔴 **Soltar NO guarda.**

**Sin ratón.** La misma acción está como botón dentro de la casilla abierta: se toca el hueco de
la columna y sale **«Mover aquí la marca suelta»**. Es la MISMA regla (`puedeSoltar`), nunca una
segunda. Con eso el teclado y el teléfono no quedan afuera: **el arrastre en sí es de computadora**
—el arrastrar y soltar de HTML5 no existe en un navegador táctil— y no se inventó un toque largo.

**🔴 Lo que se guarda es lo de siempre.** Arrastrar no es una forma nueva de escribir: es una forma
nueva de CAPTURAR lo mismo. `escritoDelArrastre` produce las DOS entradas del MISMO mapa `escrito`
que ya llenaba el teclado —la hora en la casilla de destino y «Quitar» en la de origen—, y de ahí
salen el MISMO `planDelDia` y el MISMO cuerpo del `POST /api/asistencia/correcciones/dia`. Medido
por el candado sobre el día real: el cuerpo trae exactamente `codigo · fecha · motivo · cambios`,
y los cambios son, uno por uno, los de teclear la hora y tocar «Quitar» a mano. Ni una columna
nueva en la base, ni un campo nuevo. La marcación del reloj sigue sin editarse ni borrarse.

**Los cuatro frenos** (`lib/asistencia/arrastrar-hora.ts`, puro):

| Freno | Por qué |
|---|---|
| **Una hora por columna** | No se suelta donde ya hay una: ««Salida» ya tiene una hora…» |
| **No a la misma columna** | Mover algo a donde ya está no es mover |
| **El día queda en orden** | entrada ≤ sale a almorzar ≤ vuelve ≤ salida; si no, se rechaza y se dice |
| **Solo horas del RELOJ** | Una agregada a mano no se puede vaciar («Quitar» solo existe sobre el reloj): se deshace su corrección |

**⚠️ LO QUE HAY QUE SABER ANTES DE LEER UN NÚMERO, y es la parte incómoda.** Las cuatro columnas
de la pantalla son **POSICIONALES**: `columnasClasicas` reparte las marcas del día por su ORDEN
—la 1.ª es la entrada, la última la salida— y las marcas vienen ordenadas por hora
(`reporte.ts`: `crudas = (…).slice().sort((a, b) => a - b)`). El sistema **no guarda a qué columna
pertenece cada marca: la deduce**.

Consecuencia, dicha sin adornos: **mover una hora de una columna a otra no cambia lo que el motor
lee.** Se anula la marca del reloj y se escribe una a mano con la misma hora, con su firma y su
motivo; el día sigue leyéndose igual, porque el conjunto de horas es el mismo. Lo que cambia el
día sigue siendo la HORA, no la columna.

Se construyó igual porque es lo que Daniel aprobó, porque el gesto ahorra teclear la hora y porque
deja rastro firmado de quién decidió qué; pero **queda dicho acá**: si él quiere que la columna
sea un dato guardado —«esta 13:14:49 es la salida a almorzar, y la que falta es la vuelta»—, eso
es otra decisión, otra columna y otra migración. **Es una pregunta para Daniel, no un olvido.**

**Interruptor y candado.** `ARRASTRAR_HORA` en `lib/asistencia/arrastrar-hora.ts`, hoy `true`;
en `false` las horas no se pueden agarrar y la pantalla es exactamente la de hoy.
Candado: `src/__tests__/asistencia/arrastrar-hora.test.tsx` (18 casos: la regla pura, la pantalla
con arrastre real, el rechazo dicho, el camino sin ratón, el apagado, y la comparación del cuerpo
del POST contra el de teclearlo a mano). Dos mutaciones probadas, las dos cazadas: quitarle al
movimiento la mitad que vacía el origen (3 fallos) y apagar el freno del orden (1 fallo).

---

## 🔴 Marcaciones, agrupadas por día (25-sep-2026) — «scroll down en vez de chips»

> Interruptor: `MARCACIONES_POR_DIA` (`lib/asistencia/marcaciones-por-dia.ts`, hoy `true`).
> En `false` vuelve ENTERA la pantalla de chips y seis columnas, que se conservó sin tocar
> una línea en `src/app/asistencia/marcaciones/PantallaDeAntes.tsx`.
> Candado: `src/__tests__/asistencia/marcaciones-por-dia.test.tsx` (28 casos).

Daniel, textual, sobre el mockup: *«hazlo minimalista, user friendly; ya sabes que tienes que
usar scroll down en vez de chips con cada persona»*.

### 🩸 Lo que había, medido el 25-sep-2026 contra producción

- **37 marcas de teléfono en toda la base**, de cinco personas y cuatro días.
- La tabla de la computadora las ponía en **37 renglones sueltos y SIN columna de fecha**:
  para saber de qué día era cada uno había que tocar uno de los **cinco chips de día**,
  arriba de los **seis chips de colaborador**.
- **32 de las 37 llegaron al instante** y aun así cada una gastaba una celda entera diciéndolo
  en la columna «Llegó».
- En el celular, **cuatro filas de botones** —empresa (5) · período · colaboradores (6) ·
  días (5)— antes de la primera hora, y **el día repetido en la esquina de cada tarjeta**.
- El lugar salía con el código de mapa del servicio: **«G5P6+2GH, Paso Canoas · a 46,4 km»**.
- La columna «Aparato» mostraba seis letras del sello del teléfono. Medido: en esos cuatro
  días **no hubo un solo teléfono compartido** — las cuatro marcas con sello del vie 25 son
  cuatro teléfonos distintos y las otras 33 vienen sin sello.

### Las reglas

1. **El día es el encabezado**, y dentro va **UNA fila por colaborador** con sus marcas en
   orden. De **37 renglones sueltos a 17 bajo cuatro días**. El día se baja con la rueda.
2. **Arriba quedan dos cosas**: el período y **UN** desplegable, «Colaborador: todos ▾».
   🔴 **Sin filtro de día y sin filtro de empresa**: la empresa se elige una sola vez en el
   selector del módulo y vale para todo Asistencia.
3. **Las cuatro marcas se leen como tres tramos**: `Entrada 08:59 · Almuerzo 18:01 – 18:01 ·
   Salida 18:01`. El almuerzo junta la salida y la vuelta en un solo rango.
4. **«Sin señal» es un PUNTO gris** delante de la marca (con su `title`), no una pastilla
   naranja que empuja el renglón.
5. **El lugar se dice UNA vez por fila y en palabras**: «Paso Canoas · 46 km de la tienda».
   🔴 El código de mapa se va (`sinCodigoDeMapa`); sin punto de referencia, solo el nombre;
   sin nombre, «—». ⚠️ **El número exacto no se pierde**: «a 46,4 km» sigue entero en la hoja
   que abre la fila (`lineasDeLaHoja`).
6. **El atraso se dice SOLO cuando lo hubo**, en gris bajo la fila:
   `sin señal: la entrada se envió 9 h después · la salida, 6 min después`.
   🔴 **Nunca la palabra «llegó»** — la contadora la leería como que la persona llegó tarde a
   trabajar, y a esa hora lo que llegó fue el dato. Misma regla que `linea-del-dia.ts` y
   `lib/marcacion/en-el-reporte.ts`, con **barrido** sobre la pantalla y sobre su regla.
7. **La columna «Aparato» se va.** En su lugar, un **aviso ROJO en la fila** y solo cuando dos
   colaboradores marcaron con el **mismo teléfono ese día** (`marcasDeAparatoCompartido`, la
   MISMA regla del aviso de Telegram). 🔑 Dos marcas **sin sello nunca** son «el mismo
   teléfono»: `null` no es igual a `null`.
8. **La nota del pie pasa a un ⓘ** al lado del conteo de marcas.
9. **Tocar la fila abre las fotos y el mapa** de ese día, en la MISMA hoja del reporte
   (`FotosDeLaMarcaModal`), con las marcas del día una debajo de la otra.
10. **En el celular, la misma agrupación**: encabezado de día y una tarjeta por colaborador,
    sin las cuatro filas de botones y sin el día repetido en cada tarjeta. No hay tabla: en
    390 px una `ScrollableTable minWidth={880}` se arrastra de lado.

### 🔴 Ningún número cambia

- Las horas son las mismas (`horaCorta`, Panamá UTC−5 fijo) y el día es el mismo (`diaPanamaDe`).
- El atraso sale de **UNA sola cuenta con dos redacciones**: `cuantoDespues()` en
  `marcaciones-pestana.ts`, de la que hoy se deriva `demoraEnPalabras()` —la de la pantalla de
  antes—. El candado lo compara caso por caso.
- La única cifra que se redondea es la **distancia de la pantalla** (46,4 km → «46 km de la
  tienda»), tal como el mockup que Daniel aprobó; la exacta sigue en la hoja de la marca.
- La ruta `GET /api/asistencia/marcaciones` solo **agregó** `lugar.nombre` (el nombre crudo,
  sin la distancia pegada): `lugar.texto` no cambió un carácter, y **no se escribe nada**.

### Los archivos

- `src/lib/asistencia/marcaciones-por-dia.ts` — la regla, pura: interruptor, tramos, lugar en
  palabras, la frase del envío y la agrupación por día.
- `src/lib/asistencia/marcaciones-pestana.ts` — `cuantoDespues()`, del que ahora sale
  `demoraEnPalabras()`.
- `src/app/asistencia/MarcacionesTab.tsx` — la pantalla nueva; elige la de antes con el
  interruptor apagado.
- `src/app/asistencia/marcaciones/PantallaDeAntes.tsx` — la de chips, entera.
- `src/app/api/asistencia/marcaciones/route.ts` — manda `lugar.nombre`, aditivo.

### Lo que NO cambió

Quién la ve (`MARCACIONES_ROLES` = `admin`, y lo decide el servidor), que **solo se mira** —ni
un POST, PUT, PATCH o DELETE, con barrido—, la hoja de fotos y mapa, y el pie común de la casa
(«9 marcas de 37»). La pestaña sigue al final de la barra: el aterrizaje de nadie se movió.

---

## 🩸 «3a · Lo que sobra» (25-sep-2026) — dos cosas que se dejan de dibujar

> Interruptor propio: `ASISTENCIA_SOBRA_3A` (`lib/asistencia/sobra-3a.ts`, hoy `true`).
> Candado: `src/__tests__/asistencia/sobra-3a.test.tsx`.
> 🔴 **Nada se borra de la base y ningún número se mueve.**

### 1 · Préstamos › Movimientos: la lista de 24 quincenas

Vivía en `MovimientosQuincenaTab.tsx` una constante `CUANTAS_QUINCENAS = 24` y un `<select>`
con un año entero de quincenas: **la CUARTA forma de elegir período del módulo**.

⚠️ **Precisión medida el 25-sep-2026**: desde el **24-sep** (`ed64ad7f`, el selector único) esa
lista ya no se dibujaba — quedaba en el camino apagado de `ASISTENCIA_PANTALLA_2026_09`. El
informe del mockup la daba por VIVA porque midió la constante, no la rama que se pinta. Lo que
se hizo hoy es sacarla del archivo para que no pueda volver sola.

Queda: el selector único de arriba (`SelectorPeriodo` + `usePeriodoAsistencia`), y la quincena
que se mira es la que **contiene** ese período (`quincenaDelPeriodo`). ⚠️ Un enlace viejo con
`?quincena=` sigue abriendo donde decía. 🔑 `quincenasHasta()` **no se borró**: la Planilla y
Aprobaciones la siguen usando para la quincena en curso.

### 2 · Colaboradores: la franja amarilla

La pestaña abría con «**1 colaborador de 44 todavía no sale en la planilla** · 1 marca en el
reloj y todavía no tiene ficha…». El **mismo dato** ya sale en **«Antes de cerrar»**, en la
Planilla, como «código del reloj sin ficha» (`antes-de-cerrar.ts`) — que es donde de verdad
**frena el cierre**. Un cartel permanente arriba de una lista se deja de leer; el mismo aviso
pegado al botón que frena, no.

🔑 **`avisoPendientes()` NO se borra** y sigue probada: el dato no se pierde, cambia de lugar.
⚠️ **El aviso ROJO no se tocó**: «dada de baja y sigue marcando» y el de la migración piden que
alguien haga algo hoy y siguen arriba de la lista.

---

## Lo que decía CLAUDE.md hasta el 25-sep-2026 (podado ese día para hacer sitio)

Cinco reglas que vivían en «Invariantes por módulo» y estaban **verbatim** más abajo en este
mismo archivo. Se podaron para que CLAUDE.md siguiera bajo el tope del harness; siguen
VIGENTES, y aquí quedan tal como estaban escritas:

- 🔴 **LOS DÍAS DE VACACIONES SE CALCULAN SOLOS, Y NO SON UN SALDO (17-sep-2026).** **30 días corridos por cada 11 MESES** desde `fecha_ingreso`, menos las registradas (`vacaciones-corresponden.ts`). 🔴 Se lee **«Le corresponden N días», NUNCA «le quedan»**, con la línea gris de lo que no incluye. 🔴 **NO entra a ningún cálculo de plata**, con barrido. 🔴 **Sin `fecha_ingreso` no sale un número, ni cero.** 🩸 El saldo a mano se RETIRÓ.
- 🔴 **UN PERMISO DE HORAS PERDONA LAS TRES COLUMNAS, CON LA MISMA REGLA (16-sep-2026).** `minutosPerdonadosDe` cruza la ventana del permiso con la del INCUMPLIMIENTO —tardanza · salida temprana · exceso de almuerzo— y perdona la **intersección**, capeada a SU propio bruto. 🔴 **Nada callado**: el día lleva los tres perdones por separado y el chip dice cuál y cuánto. Un permiso de horas **no justifica el día entero**.
- 🔴 Una vacación **no es una justificación** (tabla propia; «Vacaciones» no está entre los motivos ni los retirados); **el motor las honra pase lo que pase** y un día de vacaciones **no genera horas, tardanza ni ausencia**. Sin marcar no cuesta nada; **«ya se le pagó» es lo ÚNICO que mueve plata**: ausencia de día completo (**8 h × rata**) en hábiles no feriados.
- 🔴 Dar de baja a alguien con deuda **avisa** (`salida-con-deuda.ts`), y la deuda son las **tres cuentas** (`calcularSaldoPrestamo`). 🔴 Las columnas de dinero salen de **un solo lugar**: `columnas-dinero-planilla.ts` (**19**), leído por `PlanillaTab` y `PlanillaBoston`.
- Corregir una hora: el porqué es obligatorio; los motivos frecuentes se derivan de lo guardado en **90 días** por clave normalizada (**igualdad exacta, nada por parecido**), **4** con **2+** usos (`motivos-frecuentes.ts`, solo lectura). *(Podada el 25-sep-2026 para hacer sitio a «las horas se arrastran de columna»; la mitad que importa —«Otro…» abre el campo libre con los más usados de 90 días— sigue dicha en la línea del panel del día.)*

---

## 🔴 La fila de mandos, arreglada (25-sep-2026) — los siete detalles que Daniel vio en producción

> Interruptor: el MISMO `ASISTENCIA_PANTALLA_2026_09` (hoy `true`). Con él apagado, todo lo de abajo
> vuelve a ser lo de antes, sin excepción.
> Candado: `src/__tests__/asistencia/fila-de-mandos.test.tsx` (33 casos).

**Daniel, textual**, mirando Asistencia › Asistencia en la computadora:

> «otra vez calendario chueco. Estos botones no me gusta cómo los hiciste en Asistencia: quita el
> Solo a revisar, la flecha cámbiala a descargar o flecha para abajo, los 3 puntitos no hacen nada.
> Reloj Multifashion y Boston ¿puedes merge en una y que Traer ahora al tocar sea a los dos? y que
> esté en el mismo panel de arriba junto a las otras para no ocupar mucho espacio sucio»

Y, en la misma tanda, sobre la Planilla y sobre el día abierto de un colaborador:

> «ese mensaje no tiene que decir desde el 28 si ya está en el calendario; debería decir desde
> cuándo lee (la última apertura, día después); y algo minimalista que se sepa que es el cierre del
> reloj»

> «¿estas informaciones se pueden resumir? quitar lo obvio, para no ensuciar tanto la pantalla»

### 1 · El calendario chueco — 🩸 la causa, medida

El popover del 📅 se cortaba a la derecha: «DO» y los días 6, 13, 20, 27 y 4 quedaban medio tapados.

Medido en Chromium (390, 768, 1024 y 1440 de ancho, con el DOM y las clases reales del panel):

| Qué | Medida |
|---|---|
| Ancho que pedía el panel (`ANCHO_CALENDARIO = 308 + 24`) | **332 px** |
| Menos el borde (`border`, 2) y el `p-3` (24) | **306 px de contenido** |
| Lo que mide la grilla: 7 columnas × 44 px | **308 px** |
| Sobrante | **−2 px**, y las celdas **no se encogen** (son `<td>` de 44 px fijos en una tabla) |
| Con barra de scroll clásica (Windows, o macOS con «mostrar siempre») | **−17 px**: 17 de los 44 de la última columna |

Dos cosas se juntaban: el `332` estaba escrito como un número suelto que **no contaba el borde**
(Tailwind pone `box-sizing: border-box`), y el panel es `overflow-y-auto` — que por la regla de CSS
vuelve `auto` también el horizontal, así que cuando el mes no entra a lo alto aparece la barra y se
come ancho. Con barras superpuestas (macOS por omisión) el recorte era de 2 px y casi no se veía;
con las clásicas —las PC de la oficina— era de 17.

🔴 **El arreglo es de aritmética, no de maquillaje**: `ANCHO_CALENDARIO` se suma por partes en
`src/components/ui/RangoFechas.tsx` —`ANCHO_DIA_CALENDARIO × COLUMNAS_CALENDARIO + padding + borde +
barra de scroll` = **350 px**— y el cuerpo del desplegable va dentro de un
`flex justify-center overflow-x-auto`, igual que el modo en línea, para que si algún día una pantalla
lo aprieta se deslice ESA caja y no se recorte una columna en silencio. El candado recalcula la
posición con `calcularPosicionDesplegable` a los cuatro anchos y exige dos cosas: que el panel **no
se salga de la pantalla** y que le queden **≥ 308 px** de grilla.

### 2 · «Solo a revisar» sale de la fila — y la función no se borra

Daniel: *«quita el Solo a revisar»*. **Dónde quedó: como chip en el encabezado de la columna
«A revisar»**, que es la columna que cuenta esos días y donde se está mirando cuando hace falta. En
el celular el encabezado no se dibuja, así que ahí el chip va al lado del pie de la tabla.

🔴 **Nada de la función cambió**: el mismo estado, el mismo filtro (`soloConDiasARevisar`), el mismo
`?revisar=1` en la dirección —con `replace`, como siempre—, el mismo «34 de 45 colaboradores» y los
mismos «Excel · 34» / «PDF · 34». El nombre accesible del chip sigue siendo `Solo a revisar`, que es
lo que leen los candados de `asistencia-solo-a-revisar`, `asistencia-guardar-sin-salto` y
`asistencia-justificar-a-varios`.

### 3 · La flecha pasa a ser «Descargar»

🩸 Era un **«⇧» de solo ícono**: una flecha hacia ARRIBA para BAJAR dos archivos. Ahora es un botón
con texto —`DESCARGAR` en `pantalla-2026-09.ts`— con una flecha **hacia abajo** al lado, y abre el
MISMO menú de siempre: Excel y PDF, con los mismos generadores y el «· 34» cuando la pantalla está
recortada. En el celular es el mismo botón.

### 4 · Los tres puntitos — 🩸 por qué no hacían nada

Daniel: *«los 3 puntitos no hacen nada»*. Tenía razón, y la causa son dos cosas a la vez:

1. **Su panel estaba VACÍO.** En `ReporteTab.tsx` el `<div className="relative">` del «···» tenía el
   botón y, donde debía ir el desplegable, una línea en blanco. Nunca se dibujó nada adentro.
2. **Lo único que el botón movía era `escondidoSiTodoBien`**, que escondía la caja de los relojes
   cuando TODOS estaban al día. Como la PC de la oficina se apaga de noche, los dos relojes están
   «callados» casi siempre: la caja salía igual, y tocar el «···» no cambiaba un píxel.

Después del arreglo 5 no quedaba nada que poner adentro, así que **el botón se quitó** junto con su
estado (`relojesAbiertos`) y con la prop `escondidoSiTodoBien` de `EstadoReloj`. El candado de
`asistencia-corregir-hora` que exigía «exactamente UN ··· y que sea el de los relojes» ahora exige
**cero**: es más estricto, no menos.

### 5 · Los dos relojes, una pastilla y un «Traer ahora»

🩸 Eran **dos cajas amarillas de ancho completo** debajo de la fila («RELOJ DE MULTIFASHION · La PC
de la oficina no responde · Traer ahora» y la de Boston), con dos botones que hacen lo mismo.

Ahora es **una pastilla dentro de la misma fila de mandos** (`EstadoReloj` en modo `resumen`, el que
ya usaba el celular), con la regla en el módulo puro `src/lib/asistencia/relojes-en-la-fila.ts`:

| Estado | Lo que dice |
|---|---|
| Todos al día, dos relojes | «Relojes al día · hace 3 minutos» (el más viejo manda) |
| Todos al día, uno solo | «Reloj de Boston al día · hace 3 minutos» |
| Uno callado | «Reloj de Multifashion sin señal hace 2 horas» |
| Los dos mal | «Reloj de Multifashion y Reloj de Boston no se pudo leer» (el peor manda) |

🔴 **Nombra solo al que falla.** La línea vieja (`resumenDeRelojes`, retirada) decía «1 de 2 relojes
no están entrando»: un conteo que obliga a abrir algo para saber cuál.

🔴 **Un «Traer ahora» para los dos.** Son las MISMAS llamadas de antes —un `POST /api/asistencia/reloj`
por dispositivo, uno detrás del otro—; nada nuevo viaja al servidor. El acuse dice a quiénes salió
(«Pedido enviado a los 2 relojes: la PC lo recoge en unos minutos»). ⚠️ **No dice cuántas marcas
trajo**, y no es un olvido: el POST solo deja el pedido en el buzón y las marcaciones aparecen
recién cuando el agente de la PC da su vuelta, minutos después. Inventar un «12 marcas» sería
inventarle un dato a Daniel.

🔴 **Lo que NO se perdió de las cajas viejas**: el aviso accionable «La PC de la oficina no ha
recogido el pedido: revisa que esté prendida» sigue saliendo, con las mismas palabras
(`avisoDeLaPastilla`), y el lector del reloj sigue montado y siguiendo el pedido en el aire.

**Con la empresa filtrada, solo su reloj.** Hasta hoy `/api/asistencia/reloj` devolvía los dos
siempre y nadie los filtraba. La lista es ESCRITA A MANO (`RELOJ_DE_EMPRESAS`) y salió de medir
producción el 25-sep-2026, sobre las marcaciones de septiembre:

| Reloj | Empresas | Marcaciones (sep-2026) |
|---|---|---|
| `reloj cboston` | confecciones_boston · vistana · fashion_wear | 1.190 · 479 · 456 |
| `reloj acs` | american_classic | 347 |

🔴 **Falla ABIERTA**: un reloj que no esté en la lista se muestra siempre, y si el filtro no deja
ninguno se muestran todos. Esconder el estado del reloj es peor que mostrar uno de más — si el reloj
no está entrando, **cualquier número de esa pantalla está incompleto**.

### 6 · La línea del corte, en la Planilla

🩸 Decía: «El reloj se lee hasta el 28 sep · cambiar — Del 29 al 30 se paga normal y se ajusta en la
siguiente.» Tres problemas en un renglón: repetía el 28 que el campo de al lado ya dice; **no decía
DESDE cuándo** se está leyendo el reloj, que es el único dato que no está en ninguna otra parte de la
pantalla; y «cambiar» mandaba a un campo que está a dos centímetros.

Ahora: **«Corte del reloj · lee del 14 al 28 sep»**, con la cola en un ⓘ al final. Regla pura en
`src/lib/asistencia/corte-del-reloj.ts`:

- el **desde** es el día SIGUIENTE al `corte` de la última planilla **CERRADA** de esa empresa
  (`asistencia_planilla_guardada.corte`; sin corte, su `hasta`) — el primer día que todavía no se
  leyó. Sale del MISMO historial que ya devuelve la ruta del cierre, sin endpoint nuevo;
- **sin cierre anterior**, el desde es el inicio de la quincena: no se inventa una fecha;
- **con el corte vacío** (la ×), se lee hasta `finDeLaMedicion(hasta)` — la misma función de la frase
  del ajuste, así que en un mes de 31 días dice 31 y no 30;
- un cierre más nuevo que el corte de hoy (una quincena vieja que se regenera) **no produce «del 29
  al 28»**: ahí la línea dice solo «lee hasta el 13 sep»;
- el mes se dice UNA vez si es el mismo («del 14 al 28 sep») y las dos si cambia («del 26 ago al 28
  sep»).

🔑 **Ningún número se mueve y el corte que se manda a generar tampoco**: este módulo redacta una
línea, no decide un período. La cola del ⓘ es la MISMA `fraseCorte` de siempre.

### 7 · El día abierto, resumido en una línea

🩸 Debajo de cada día salía una línea POR MARCA, repitiendo horas que la fila ya muestra en sus
cuatro columnas (Entrada · Sale almz. · Vuelve · Salida), y otra línea por cada repetida:

```
Entrada 8:58 a. m. · Marcada sin señal · el teléfono la envió 09:01 · Ver la selfie y el mapa
Salida 6:00 p. m.  · Marcada sin señal · el teléfono la envió 09:01 · Ver la selfie y el mapa
Marca repetida: 18:01:25 — repetida, 12 s después de 18:01:13 — no cuenta
```

Ahora, regla pura en `src/lib/asistencia/linea-del-dia.ts`:

```
Teléfono · sin señal, enviada 3 h después · 2 repetidas · ver fotos
```

- **las horas no se repiten**: están en la fila;
- **UNA línea por día, y solo si hay algo que decir** — un día marcado entero desde el reloj, sin
  repetidas, **no dibuja nada**;
- el atraso que se dice es **el MAYOR del día**, y por debajo de **5 minutos** no se dice (mismo
  umbral con el que ya se avisa que el reloj del teléfono está corrido);
- **las repetidas se CUENTAN, no se listan** («· 2 repetidas»); su porqué entero —con el MISMO texto
  del Excel, `explicacionRepetida`— se lee al pasar el cursor por la línea, y ⚠️ **el Excel no
  cambió**: sigue llevando cada una en «Todas las marcas»;
- una marca deshecha desde el teléfono se dice («· 1 deshecha»), no se esconde;
- **«ver fotos» sale UNA vez por día** y abre las fotos de todas las marcas de ese día, una debajo de
  la otra.

🔴 **«llegó» sigue prohibido.** Se dice **«enviada 3 h después»** y no «llegó con 3 h de atraso»: la
contadora leería lo segundo como que la persona llegó tarde a trabajar, y a esa hora lo que pasó es
que el teléfono encontró señal. Es la misma regla de `lib/marcacion/en-el-reporte.ts`, y el barrido
que la sostiene ahora también mira `linea-del-dia.ts`.

🔴 **«Selfie» se fue del módulo.** Daniel, 24-sep-2026: *«sus fotos son del lugar, no de su cara»*.
`SelfieMarcacionModal.tsx` → **`FotosDeLaMarcaModal.tsx`**, `SelfieParaVer` → `FotoParaVer`, «Ver la
selfie y el mapa» → «ver fotos», «Abriendo la selfie…» → «Abriendo la foto…», «las selfies se borran
solas» → «las fotos del lugar se borran solas». ⚠️ La constante `RETENCION_SELFIE_DIAS` (90) vive en
`lib/marcacion/marcacion.ts` y **no se tocó**: es un identificador, no un rótulo.

### Lo que NO cambió, y hay candado que lo exige

- **Ningún número**: ni un minuto, ni un centavo, ni un pedido al servidor
  (`pantalla-no-mueve-un-numero.test.ts` sigue verde).
- **`?revisar=` sigue funcionando** desde la dirección.
- **El lector del reloj sigue montado** (`9525a544`): `EstadoReloj` no se desmonta, y adentro sigue
  viviendo el pedido en el aire de «Traer ahora».
- **El camino APAGADO del interruptor está intacto**: las dos cajas amarillas, la línea por marca, la
  fila por repetida y la línea «El reloj se lee hasta el …» siguen ahí para `false`.

### Candados

`src/__tests__/asistencia/fila-de-mandos.test.tsx` — 33 casos en siete bloques, uno por arreglo.
Actualizados sin debilitarlos: `pantalla-2026-09-pantallas` (la fila de mandos y los tres casos del
«···», que pasan a exigir la pastilla siempre visible), `pantalla-selector-unico` (se fueron
`lineaDelCorte`, `resumenDeRelojes` y `CAMBIAR_EL_CORTE`), `asistencia-corregir-hora` (de «exactamente
un ···» a **cero**), `asistencia-solo-a-revisar` y `asistencia-sin-marcas-visible` («Descargar» en vez
de «Bajar Excel o PDF»), `asistencia-marca-repetida` (la repetida se cuenta y su porqué va en el
`title`), `asistencia-poda-textos` (el aviso de la PC sigue a la vista),
`planilla-elegir-quincena` (la línea nueva del corte y la cola en el ⓘ),
`marcacion-reloj-del-telefono` (el barrido de «llegó» suma `linea-del-dia.ts`),
`asistencia-siete-pantallas` y `marcaciones-pestana` (el modal renombrado).

---

## 🔴 El rediseño de la pantalla (24-sep-2026) — celular y computadora

> Interruptor: `ASISTENCIA_PANTALLA_2026_09` en `src/lib/asistencia/pantalla-2026-09.ts`, hoy `true`.
> `false` = las pantallas de antes, intactas.
> Mockups aprobados letra por letra por Daniel: `cel-asistencia.html` (11 secciones, 18 letras) y
> `esc-asistencia.html` (8 secciones, 25 letras), con sus dos informes de opciones.

**Lo que eligió Daniel, letra por letra:** `1b` (portada del celular) · `2b` (tarjeta por
colaborador) · `2d` (el colaborador abierto, acciones al pasar el mouse) · `2e` (2b con su cambio:
sin la columna «Sale», el código a la izquierda, la salida en burbuja) · `3a` (el panel recogido; y
en la computadora, una sola fila de mandos con el número encabezando Aprobaciones) · `4a` sin «Hoy»
ni «Ayer» / `1f` (el selector único) · `1d` (el corte como línea gris) · `4b` (las 14 columnas en su
caja) · `5` (Aprobaciones se queda con Colaborador · Día) · `5c` (Colaboradores, tabla directa con el
código a la izquierda) · `6b` (el tablero de cierre del celular solo informa) · `7a` (de la Planilla
a la Asistencia de esa persona) · `7b` (Colaboradores agrupado por empresa en el celular) · `9a`
(Préstamos como hoy). `6a` (las tres reglas nuevas) ya estaba construido y no se tocó.

### 🩸 Lo que se midió antes de tocar nada

| Qué | Medida | Dónde |
|---|---|---|
| Selectores de período del módulo | **4**, con **3** memorias y **2** listas de quincenas que no coinciden | el código, 24-sep |
| Asistencia en el teléfono: ancho de la tabla | **888 px** dentro de una ventana de **356** | `IMG_3118`/`IMG_3119` |
| Bloques antes del primer nombre (celular) | **9** · **1.085 px** · **22 controles** con «Todas» | `IMG_3117` + `IMG_3118` |
| Casillas de «justificar a varios» | **16 × 16 px**; iOS pide 44 | medido |
| Planilla en la computadora (1440 px) | la tabla se corta después de «ISR»: **el NETO queda fuera del borde** | `d12` |
| Un colaborador abierto | **32 cosas para tocar**, **12 de ellas en días que no llegaron** | `d04`, `d05` |
| De la Planilla a la Asistencia de una persona | **4 toques** y buscar entre **43 filas** | medido |
| Colaboradores con «Todas» | página de **4.206 px**; dos botones negros apilados | `d01`, `e09` |

### 1 · Un solo selector de período (`4a` sin chips / `1f`)

**La barra:** `‹  16 – 30 sep 2026  ›` y, al lado, un 📅 que abre el calendario de siempre para un
día o un rango. **Sin «Hoy» ni «Ayer»** — Daniel los pidió fuera: la quincena es lo que se mira.

- **Las flechas saltan de QUINCENA, siempre.** Mirando un día suelto o un rango elegido en el
  calendario, «‹» y «›» llevan a la quincena anterior o siguiente a la que CONTIENE el primer día de
  lo que se mira. Un paso que a veces es «un día» y a veces «una quincena» es un control que no se
  puede predecir.
- **«›» se apaga cuando la quincena que sigue todavía no empezó** — la misma regla del mes del
  celular de Multifashion: nunca al futuro.
- **El rótulo no miente:** «16 – 30 sep 2026» cuando es una quincena, «18 sep 2026» cuando es UN día,
  «18 sep – 22 sep 2026» cuando es cualquier otro rango, y **vacío** con una fecha rota.
- **Una clave y una memoria.** `?desde=&hasta=` con `replace` (es un filtro del mismo nivel: el Atrás
  del navegador no cicla por fechas) y `fg_last_asistencia_periodo`. 🩸 Antes Asistencia recordaba con
  `asistencia_reporte` y Aprobaciones con `asistencia_aprobaciones` — **cambiar el período en una
  pestaña no cambiaba el de la otra**.
- **Con qué período abre:** manda la dirección, después la memoria, y al final **la quincena en
  curso**. 🩸 Asistencia abría en «hace 14 días → hoy», que no es ninguna quincena: las flechas
  habrían estado mintiendo desde el primer segundo.
- ⚠️ **En la Planilla y en Movimientos el selector va SIN calendario.** En la Planilla solo se pagan
  quincenas (Daniel, 15-sep-2026: *«si la quincena es fija, que no haya opción de rango, solo las
  opciones»*) y en Movimientos no hay movimientos de un rango libre. Es una desviación deliberada del
  mockup, que dibujaba el 📅 en las cinco.
- ⚠️ **`?quincena=` sigue entrando en Movimientos y GANA**: un enlace viejo abre donde decía.

#### 🩸 El defecto que encontró el candado: las dos fechas se pisaban

Escribirlas con dos `useUrlState` seguidos **pierde una**. Cada setter arma la dirección nueva a
partir de la que había AL PINTAR, así que el segundo pisa al primero: pedir la quincena anterior
dejaba `desde=2026-09-16&hasta=2026-09-15` — **un rango al revés**. Por eso `usePeriodoAsistencia`
arma UNA dirección con las dos fechas y llama al router una sola vez, con su propio valor optimista
para que la barra no se sienta con un toque de retraso.

⚠️ El defecto ya existía en el `elegirPeriodo` de Asistencia (16-sep-2026); lo tapaba el valor
optimista de `useUrlState`. Lo destapó el candado nuevo.

### 2 · El corte del reloj, en una línea gris (`1d`)

🩸 «Quincena» y «Cortar el reloj el» estaban uno al lado del otro, con rótulo propio y el mismo peso:
**por eso parecían dos períodos**. Y al lado del campo había un botón **«Quincena entera»** y un chip
gris **«Corte 17 sep»** que solo repetía el valor que el campo ya decía.

Hoy: el campo, una **«×»** que lo vacía, y debajo **una línea gris** — «El reloj se lee hasta el
28 sep · cambiar», o «El reloj se lee hasta el fin de la quincena» cuando está vacío. «cambiar»
lleva al campo (`showPicker` donde el navegador lo tiene).

🔑 **El corte no cambia lo que se paga**: el período queda entero y solo se recorta hasta dónde se
mira el reloj. Eso ya era así y no se tocó. El corte propuesto sigue siendo `CORTE_SUGERIDO`
(13 / 28) y se pone solo al cambiar de quincena.

### 3 · La Planilla cabe en la pantalla (`4b`) y el nombre lleva a su Asistencia (`7a`)

- **Las 14 columnas dentro de SU caja**: `max-h-[70vh] overflow-auto`, la cabecera pegada arriba y la
  columna del nombre fija a la izquierda. **Ninguna columna se pliega**: la contadora las ve todas.
  🩸 A 1440 px la tabla se cortaba después de «ISR» y el NETO —el número por el que existe la
  pantalla— quedaba fuera del borde derecho.
- **`7a`**: el nombre de cada fila es un enlace a
  `/asistencia?tab=asistencia&empresa=…&desde=…&hasta=…&abre=<código>`. De **cuatro toques a uno**.
  El camino de vuelta ya estaba resuelto por `pestanas-vivas.ts`: el Atrás devuelve la Planilla
  armada, sin regenerarla. En el celular el enlace va **debajo** del encabezado tocable de la
  tarjeta: un `<a>` dentro de un `<button>` no es HTML válido y en iOS se pelean los dos toques.
- 🔴 **La plata sigue sin dibujarse sola.** La regla de Daniel del 1-sep-2026 no se toca: al montar no
  se pide nada, y el cuadro aparece cuando alguien aprieta «Generar». Lo que cambió es el VACÍO: con
  la quincena ya puesta por el selector, decía «Elige el período que vas a pagar» y ahora dice
  «Esta quincena todavía no se generó · Toca **Generar**».

### 4 · Asistencia: una fila de mandos y diez columnas (`3a` · `2e` · `2d`)

- **Una sola fila:** el selector · la lupa (el buscador aparece al tocarla, y se queda si hay texto) ·
  «Solo a revisar» · el ícono de compartir con Excel y PDF adentro · un «···» con los relojes y
  «Traer ahora».
- **Los avisos se pliegan** tras «N avisos del período». **Ninguno se borró**: se abren tocando la
  línea.
- **La columna «Sale» se retiró** (11 → 10). Daniel, textual: *«pone salida como en una burbuja al
  lado del nombre, y el código a la izquierda del nombre»*. Los códigos van alineados entre sí
  (`anchoDelCodigo`), así que el nombre arranca siempre en el mismo punto. **El dato no se perdió**:
  la salida se lee en la burbuja gris.
- **`2d` — las acciones al pasar el mouse.** «Arreglar el día» y «Justificar» viven en
  `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`: siguen en el DOM y **el teclado
  las sigue alcanzando**. Esconderlas del tabulador sería sacarlas de verdad.
- **Los días que todavía no llegaron no ofrecen nada que arreglar** — `d.enCurso && d.fecha > hoy`,
  o sea ESTRICTAMENTE futuros. **Hoy sí se puede arreglar**: para eso está.

### 5 · El celular (`1b` · `2b` · `3a` · `6b` · `7b`)

- **`1b` — la portada.** Al entrar al módulo sin `?tab=`, las cinco pestañas como filas de una lista
  iOS, con el selector de empresa arriba y su conteo REAL al lado. Tocar una fila escribe `?tab=`,
  que es una clave de PANTALLA (`useUrlState`): en el celular empuja historial, así que **el Atrás
  devuelve la portada**.
  - Los conteos salen de las MISMAS rutas que usa cada pestaña: `configuracion` (colaboradores y
    cuántos no tienen ficha), `planilla?aprobaciones=1` (por decidir y sus horas), `prestamos-deuda`
    (quién debe y cuánto) y `planilla-guardada` (si la quincena está cerrada, solo con UNA empresa
    elegida). **Mientras viaja, la fila no dice nada: nunca un cero inventado.**
  - ⚠️ **Lo que esto cuesta, dicho:** son hasta cuatro lecturas al abrir el módulo, y la pestaña que
    se toque después vuelve a pedir lo suyo. Son lecturas: no escriben nada y no cambian un centavo.
  - ⚠️ La fila de Asistencia queda **sin detalle**: su número («8 colaboradores · 11 ausencias») sale
    del motor del reporte, que es la lectura más cara del módulo, y no valía una quinta petición al
    abrir. El mockup lo dibujaba.
- **`2b` — una tarjeta por colaborador.** Nombre y código, «6 días · sale 18:30», y lo que le falló
  (ausencias en rojo, tardanzas en ámbar, extras en gris, «a revisar» en ámbar) o
  **«sin nada que revisar»** en verde. Es la MISMA fila de la tabla: el mismo `onToggle`, la misma
  selección, y adentro **el MISMO detalle de días**. El pie dice lo mismo que el de la tabla.
- **`3a` — los relojes en una línea** (`resumenDeRelojes`: «Los relojes están al día», «1 de 2
  relojes no están entrando», «Ningún reloj está entrando»). ⚠️ **«Traer ahora» quedó en esa misma
  línea y no dentro del «···»**, como pedía el mockup: separarlos obligaba a montar el lector del
  reloj DOS veces, con dos pollers para el mismo dato.
- **`6b` — el tablero de cierre solo informa.** Desde el teléfono la quincena se cierra entrando a la
  empresa: un toque más a cambio de no cerrar la empresa equivocada con el pulgar. 🔴 **Sigue sin
  haber un total del grupo** y cada cierre sigue siendo el de SU empresa por su propia puerta.
- **`7b` — Colaboradores agrupado por empresa.** Es la MISMA lista, en otro orden, con un encabezado
  cuando cambia la empresa. No se agrega ni se quita a nadie.

### 6 · Colaboradores en la computadora (`5c`)

🩸 La lista vivía dentro de una tarjeta plegable que **repetía el título de la pestaña**
(«Colaboradores» arriba de «Colaboradores») y se podía cerrar sin querer, dejando la pestaña en
blanco. Y los dos botones NEGROS —«Todos (44)», que es un filtro, y «+ Nuevo colaborador», que es una
acción— ocupaban un renglón entero cada uno.

Hoy: la tabla, directa; el buscador y «+ Nuevo colaborador» en la fila de los chips; y el código
delante del nombre, igual que en Asistencia. **Horarios, Feriados y Reglas siguen plegados al pie**,
exactamente como estaban.

### 7 · Aprobaciones (`3a`)

Una sola fila de mandos —selector · Colaborador / Día · buscador · Excel · «Sí a todo»— y el número
grande («5 por decidir · 10:36 h») **encabezando la lista** en vez de metido entre los botones. Las
dos vistas se quedan y abre en Colaborador, como hoy.

### 🔴 Ningún número cambia

Dos pruebas, porque una sola no alcanza (`pantalla-no-mueve-un-numero.test.ts`):

1. **Barrido** — ni el motor del reporte, ni el de la planilla, ni sus ayudantes puros, ni **una sola
   ruta de `/api/asistencia/**`** importan `pantalla-2026-09` o `celular-asistencia`. Si nadie que
   calcula o escribe lo conoce, no lo puede consultar. Y los dos módulos del rediseño no importan el
   motor, ni usan `fetch`, ni `supabase`, ni `new Date()`.
2. **Datos fijos** — un día con todo (entra 35 min antes, almuerza 66, sale 25 después) pasa por
   `armarReporte` → `medirHoras` → `calcularDinero` y se compara contra números escritos a mano:
   rata **$4,81**, quincenal **$500**, extra **$2,51**, bruto **$502,51**, seguros **$48,99** y
   **$6,28**, neto **$447,24**.

### Los archivos

| Archivo | Qué es |
|---|---|
| `src/lib/asistencia/pantalla-2026-09.ts` | **Puro.** El interruptor, el período compartido, el salto de quincena, los rótulos, el corte y la ruta de `7a`. |
| `src/lib/asistencia/celular-asistencia.ts` | **Puro.** La tarjeta, el pie y las filas de la portada. |
| `src/components/asistencia/SelectorPeriodo.tsx` | La barra `‹ … ›` + 📅 y el hook `usePeriodoAsistencia`. |
| `src/app/asistencia/PortadaCelular.tsx` | La lista iOS de las cinco pestañas, con sus conteos. |
| `src/components/ui/RangoFechas.tsx` | `iconoSolo`: el MISMO calendario detrás de un 📅 de 44 px. |
| `src/app/asistencia/EstadoReloj.tsx` | `resumen`: los relojes en una línea, con «Traer ahora» para todos. |

### Candados (`src/__tests__/asistencia/`)

- `pantalla-selector-unico` (40) — una clave, una memoria, las cuatro pestañas con el mismo hook, el
  salto de quincena y el freno al futuro, los rótulos, el corte sin botón ni chip, `7a`, las diez
  columnas, el tablero sin total del grupo, la caja de la tabla y el barrido de voseo.
- `pantalla-no-mueve-un-numero` (8) — el barrido del motor y de las rutas, y el día con datos fijos.
- `pantalla-2026-09-pantallas` (22) — lo que se dibuja de verdad, en computadora y en celular.

Dos candados de antes, ajustados sin perder lo que protegen: `barras-pegajosas` (la Planilla entra a
«no son barras de página» con su motivo: su `<thead>` se pega a la caja de la tabla) y
`asistencia-corregir-hora` (el «···» sigue prohibido en la fila del día, y ahora se exige que haya
**exactamente uno** en el archivo y que sea el de los relojes).

### Lo que NO se hizo

- **La fila «Asistencia» de la portada no lleva número** (ver arriba: costaba una quinta lectura).
- **El 📅 no se dibuja en la Planilla ni en Movimientos**, aunque el mockup lo ponía en las cinco: en
  la Planilla un rango libre está retirado desde el 15-sep-2026 y reponerlo por la puerta del
  selector habría revivido justo lo que se sacó.
- **`8a`/`8b` (la entrada autorizada de un día o de un rango)** no entra acá: `8a` ya se construyó
  esta misma mañana — ver «Las tres reglas de horas del 24-sep-2026».
- **«Antes de cerrar» no se tocó**: ya era una lista de renglones, que es lo que pedía el encargo.

---

## 🔴 Cuatro marcas también en el teléfono (24-sep-2026) — y el almuerzo, de un solo toque

> Interruptor: `MARCACION_CUATRO_MARCAS` en `src/lib/marcacion/cuatro-marcas.ts`, hoy `true`.
> `false` = las DOS marcas de siempre, byte a byte.
> Candado: `src/__tests__/marcacion/marcacion-cuatro-marcas.test.tsx`.
> **Nada en la base. Ninguna migración.**

> 📄 **Lo que se podó de `CLAUDE.md` el 24-sep-2026 para hacerle sitio a esta
> regla, de la nota «MARCACIÓN «UN TOQUE»»**, verbatim: *«…la **ubicación se
> pide AL ABRIR** y negada dice «Ajustes › Safari › Ubicación»; se van la nota y
> «Mis marcas» y queda una línea solo si **ayer** faltó la salida; el encabezado
> dice **«Marcación»** (decía `marcacion`) y a ese rol no se le dibujan campana,
> lupa ni menú; sin señal, una línea propia en vez de la franja naranja que
> tapaba el encabezado»*. Las mediciones de ese rediseño (el botón que saltaba
> 202 → 344 px, los cuatro toques, el «Deshacer» que se pisaba 15 px con el
> botón de marcar) siguen enteras en el encabezado de
> `src/lib/marcacion/un-toque.ts`.

### Qué decidió Daniel (textual)

- *«Cuatro marcas también en el teléfono»*.
- ¿El botón las va pidiendo en orden, y las cuatro llevan foto?
  *«sí el botón va solo en orden, y sí va foto en las cuatro»*.
- Y enseguida, el cambio: **las dos marcas del almuerzo van SIN foto**, de un
  solo toque; la ubicación se guarda igual que en las otras. La entrada y la
  salida siguen con foto, con la misma regla de «aceptar la foto ES marcar».

### 🩸 Cómo estaba hasta hoy

El reloj físico de la oficina siempre tomó **cuatro** marcas al día: entrada,
salida a almuerzo, vuelta de almuerzo y salida. El teléfono nació el 14-sep-2026
con **dos** (`MARCAS_POR_DIA = 2`, Daniel entonces: *«dos, no cuatro»*), así que
quien dejó el reloj y pasó al teléfono —las cuatro personas medidas el
24-sep-2026: Ana, Cindy, Angel y Yeisibeth— **perdía el almuerzo**, y el reporte
de la contadora le quedaba con dos marcas donde ella espera cuatro.

### Las reglas

1. 🔴 **El botón va SOLO EN ORDEN, como el reloj.** «Marcar entrada» → «Marcar
   salida a almuerzo» → «Marcar vuelta de almuerzo» → «Marcar salida», y tras la
   cuarta queda gris en «Listo por hoy». 🔴 **La persona NUNCA elige cuál marca
   es**: la decide el orden del día. Es la MISMA regla que ya usaba el motor de
   Asistencia (la primera del día es la entrada, la última la salida, las del
   medio el almuerzo), así que no hay una segunda definición que pueda diferir.
   Los cuatro rótulos viven en UNA lista (`ROTULOS_DEL_BOTON`), no en un `if`
   por estado; el botón sigue en el mismo cajón fijo de abajo y **no se mueve un
   píxel** entre los cinco estados (candado que mide el borde de arriba).
2. 🔴 **Foto en la ENTRADA y en la SALIDA; el ALMUERZO, un solo toque.** La 1.ª
   y la 4.ª abren la cámara y aceptar la foto ES marcar; la 2.ª y la 3.ª marcan
   al tocar el botón, sin abrirla. 🔴 **La ubicación se guarda en las cuatro**,
   igual que antes, y el «Deshacer» de 2 minutos también.
   🔴 **Quién pide foto lo decide el SERVIDOR, no el teléfono** (`pideFoto`, que
   mira el ORDEN del día leído de la base): la ruta vuelve a validar con esa
   respuesta, así que un teléfono no puede saltarse la foto de la entrada
   diciendo que es el almuerzo.
3. 🔴 **«Deshacer» sigue siendo sobre la ÚLTIMA marca, 2 minutos**, y ahora la
   NOMBRA: «Deshacer la salida a almuerzo», «Deshacer la vuelta de almuerzo».
   El número de marca lo calcula el servidor (`queSePuedeDeshacer` devuelve
   `indice`) y la pantalla usa el mismo para la de la cola.
4. 🔴 **La pastilla verde dice cada marca con su nombre** —«Entrada 8:00 a. m. ·
   Almuerzo 12:00 p. m. · Vuelta 1:00 p. m. · Salida 6:00 p. m.»—. 🩸 Antes
   dibujaba la primera y la última: a mediodía, con la salida a almuerzo recién
   puesta, decía «Entrada 8:00 · Salida 12:00», que se lee como que ya salió del
   trabajo.
5. 🔴 **El tope lo comprueba el SERVIDOR con la MISMA regla del botón**
   (`estadoDelBotonHoy`), nunca con un número escrito a mano en la ruta. La
   quinta marca del día se rechaza con 409 y su motivo («Ese día ya tiene sus
   cuatro marcas. Si algo está mal, avísale a Roxana.»).
6. **La cola sin señal aguanta las cuatro.** Nunca hubo un tope de dos en el
   teléfono: `cola-offline.ts` guarda por `eventoId` y no cuenta nada. Lo único
   que cambia es que una marca del almuerzo va con `selfie: null`.
7. ⚠️ **Un día que quede en 2 o 3 marcas no se arregla desde el teléfono**: el
   reporte lo marca «a revisar», igual que con el reloj físico. No se inventó
   nada para eso. La línea de «ayer faltó la salida» tampoco se tocó.

### 🔴 Lo que se guarda

La marca viaja con el **MISMO payload de siempre** —los ocho campos de
`marcacion-payload-igual`, por la misma puerta, con el mismo método— y cae en
`asistencia_marcaciones` por `guardarMarcaciones`, la única puerta de escritura.

- **El `tipo` NO aprendió un valor nuevo.** Sigue siendo `entrada` o `salida`
  —lo único que `validarPayloadMarca` acepta— y se alterna por el orden del día:
  1.ª `entrada` · 2.ª `salida` (a almuerzo) · 3.ª `entrada` (la vuelta) · 4.ª
  `salida`. Es lo que de verdad pasa, y no hace falta más: **el motor del
  reporte ni siquiera lee esa columna** —selecciona `id, empleado_codigo,
  empleado_nombre, ocurrio_en, dispositivo`— y asigna por ORDEN. El reloj físico
  escribe ahí su `attendanceStatus` crudo, así que la columna nunca fue un
  vocabulario cerrado.
- ⚠️ **Lo ÚNICO que se ve distinto en la base**: las dos marcas del almuerzo
  caen con **`foto_path` en NULL**. La columna es `text` NULLABLE desde que
  nació (`20261127120000_marcacion_telefono.sql`) y ya venía en NULL en **todas**
  las marcas del reloj físico, que nunca tuvieron foto; el reporte de la
  contadora ya lo contemplaba (`en-el-reporte.ts` › `tieneFoto` es
  `Boolean(String(f.foto_path ?? "").trim())`). Sin foto no se sube nada al
  bucket, así que tampoco queda un archivo suelto.
- Todo lo demás viaja igual en las cuatro: la ubicación (`lat`, `lng`,
  `precision_m`), las dos horas (`ocurrio_en` del servidor y `hora_telefono`
  como testigo), `sin_senal`, `dispositivo`, `evento_id` y `marcada_por`.

### Los archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/marcacion/cuatro-marcas.ts` | **Nuevo.** El interruptor y toda la regla, puro: los rótulos, el tipo por orden, quién pide foto, el nombre de cada marca, el resumen de la pastilla y el aviso del día completo. |
| `src/lib/marcacion/un-toque.ts` | `botonUnToque` llama a `estadoDelBotonHoy` y sigue siendo el único que rebautiza el estado apagado «Listo por hoy». |
| `src/lib/marcacion/marcacion.ts` | `validarPayloadMarca` toma `exigeFoto = true`; por omisión, la foto sigue siendo obligatoria. |
| `src/lib/marcacion/deshacer.ts` | `queSePuedeDeshacer` devuelve también el `indice` de la marca. |
| `src/lib/marcacion/estado-server.ts` | El `boton` del estado sale de `estadoDelBotonHoy`. |
| `src/lib/marcacion/cola-offline.ts` | `MarcaPendiente.selfie` pasa a `Blob \| null`. |
| `src/app/api/marcacion/route.ts` | El tope con la regla del botón; la foto la exige el servidor según el orden; sin foto no sube nada. |
| `src/app/api/marcacion/deshacer/route.ts` | El aviso nombra la marca deshecha. |
| `src/app/marcacion/MarcacionClient.tsx` | El almuerzo marca de un toque; la foto viaja solo cuando la hay. |
| `src/app/marcacion/PantallaUnToque.tsx` | La pastilla con cada marca y el rótulo de «Deshacer». |

### Candados

- `src/__tests__/marcacion/marcacion-cuatro-marcas.test.tsx` — **nuevo**, 31
  pruebas: los cuatro rótulos en orden contra la pantalla real, el botón que no
  se mueve, gris tras la cuarta, foto solo en la 1.ª y la 4.ª, el almuerzo de un
  toque con su ubicación, «Deshacer» nombrando la marca, la cola con las cuatro,
  el `tipo` que no cambió, el `foto_path` nullable, el motor que no lee esa
  columna, el tope del servidor y el camino apagado escrito.
- `src/__tests__/components/marcacion-un-toque.test.tsx` — se actualizó para
  medir **todos** los estados del día (cuatro con el interruptor prendido, dos
  apagado) en vez de tres fijos. No se le quitó ninguna comprobación.
- `src/__tests__/lib/marcacion-payload-igual.test.ts` — **verde tal cual**: no se
  tocó una sola comprobación. Solo se aclaró el texto de dos títulos, porque
  «la foto viaja SIEMPRE» ahora quiere decir «cuando hay foto, viaja igual».

---

## 🔴 Las tres reglas de horas del 24-sep-2026 — gracia del almuerzo, entrada autorizada y el aviso

> 🔴 **Mueven plata hacia adelante y NINGUNA hacia atrás.** Solo cambian lo que
> el motor GENERA desde ahora; una quincena cerrada es su resultado congelado
> (`asistencia_planilla_guardada`) y nadie la recalcula (candado
> `quincena-cerrada-no-cambia`). Interruptores en
> `src/lib/asistencia/reglas-nuevas.ts`: `GRACIA_ALMUERZO` y
> `ENTRADA_AUTORIZADA`, hoy los dos en `true`; en `false` —o sin las columnas
> de la migración— el cálculo es el de antes, byte a byte.
>
> ✅ **Migración `20261219120000_asistencia_gracia_almuerzo_entrada_autorizada.sql` APLICADA el 24-sep-2026** (la aplicó Daniel). Sin ella —o con los interruptores en `false`— la gracia es 0, no sale el aviso y «Hoy entraba a las» contesta 503 con el nombre del archivo: el código sigue fallando ABIERTO.

### Qué decidió Daniel (textual)

1. **Gracia del almuerzo, 5 minutos sobre la duración.** *«Almuerzo de 60 que
   dura 65 no descuenta nada; si dura 66, se descuentan los 6, igual que la
   tardanza se cuenta desde la hora y no desde el minuto 11. En Multifashion 60
   más 5, en las otras 30 más 5.»* ¿Una sola regla para las cuatro? *«sí»*.
2. **Entrada autorizada por día.** En «Arreglar el día» se marca «Hoy entraba a
   las __:__» con motivo; ese día la extra se mide desde esa hora autorizada
   hasta la hora de entrada del horario (*«horario 10:00, autorizada 06:00,
   marcó 05:58 → 4 h de extra de entrada, medidas desde las 06:00, no desde
   las 05:58»*), va a Aprobaciones como cualquier extra y se paga al recargo
   que corresponda por la hora del día. **No cambia nada para quien no la tiene.**
3. **Aviso de entrada temprana** *«solo desde 30 minutos»*, configurable. Solo
   aviso: no cuenta, no frena, no entra a «Antes de cerrar».
4. **Salida temprana: como hoy**, desde el minuto uno. No se tocó.

### 🩸 Cómo contaba hasta hoy (informe del 24-sep-2026, medido contra producción)

- El exceso de almuerzo se descontaba **desde el primer minuto**:
  `max(0, tomado − programado)`. Sheynee Batista (304), 19-sep: 47,9 min de 60
  → 0 (y los 12 que no usó no valían nada). 0,77 min de exceso en su quincena.
- **Llegar antes valía cero, siempre.** Ángel Pizza (305, Multifashion,
  horario 10:00) entró 08:59 los días 22 y 23 de septiembre: 61 minutos de
  adelanto a $0 y 29,6 min de salida temprana descontados ($2,33 en dos días).
  Del 16 al 23 de septiembre: **1.885 minutos** de adelanto en las cuatro
  empresas (768 en Multifashion, promedio 20,2 por día).
- El encabezado del motor mentía en dos puntos («ENTRADA 8:00» y «ALMUERZO 30
  MINUTOS, IGUAL PARA TODOS»): hoy son 53 horarios, 8 con 60 de almuerzo y 8
  con entrada a las 09:00 o 10:00. Se reescribió con la verdad de hoy.

### La regla, entera

**1 · Gracia del almuerzo** (`reglas-nuevas.ts` › `excesoAlmuerzoBrutoMin`).
Una PUERTA como la tolerancia: hasta `programado + gracia` no hay exceso; un
segundo más y se cuenta **todo** desde el minuto programado.

| Almuerzo | Duró | Antes | Ahora (gracia 5) |
|---|---|---|---|
| 60 (Multifashion) | 65:00 | 5 | **0** |
| 60 | 66:00 | 6 | **6** |
| 30 (las otras tres) | 35:00 | 5 | **0** |
| 30 | 36:00 | 6 | **6** |
| 60 | 47:54 (Sheynee) | 0 | 0 |

- Vive en `asistencia_reglas.gracia_almuerzo_min` (**DEFAULT 5**, 0–60), UNA
  fila para las cuatro empresas, editable en Configuración › Reglas del cálculo
  › «Gracia del almuerzo», al lado de «Tolerancia de tardanza».
- 🔴 **Falla ABIERTA**: con `GRACIA_ALMUERZO = false`, o si la fila de la base
  NO trae la columna (`select *` sin la migración), la gracia es **0** —el
  cálculo de hoy—, no el DEFAULT (`VALOR_SIN_COLUMNA`). El permiso de horas
  sigue perdonando sobre el exceso ya con gracia. Guardar las reglas sin las
  columnas reintenta sin ellas y lo dice (`avisoReglasNuevas`).
- El Excel y el PDF del Reporte dicen la gracia con la que se calculó; sin
  dato, no la afirman.

**2 · Entrada autorizada** (`entrada-autorizada.ts` › `extraDeEntrada`;
I/O en `entrada-autorizada-server.ts`; tabla **`asistencia_entradas_autorizadas`**).

- 🔴 **Es una TABLA NUEVA, no un tipo de corrección.** Una corrección cambia
  QUÉ HORA VALE (pisa, agrega o quita una marca); la autorización no toca una
  marca: cambia DESDE DÓNDE SE MIDE la extra de la entrada. En la misma tabla
  habría pedido un `tipo`, que `aplicarCorrecciones` y cada lector la filtren,
  y chocaría con el único parcial `(empleado_codigo, fecha, hora) WHERE
  marcacion_id IS NULL` al agregar una marca a la misma hora. Misma forma que
  las correcciones: `motivo` y `creada_por` obligatorios con CHECK, UNA viva
  por persona y día (único parcial), `anulada_en`/`anulada_por` (se anula,
  nunca se borra), RLS sin políticas.
- La cuenta: `desde = max(marca, autorizada)`; extra = `entrada del horario −
  desde`, si la autorizada es ANTERIOR a la entrada; pasa por la **misma
  puerta del mínimo** (`extraMinimoMin`, hoy 10) que la extra de salida.
  `DiaReporte.extraMin` es la extra COMPLETA (salida + entrada) y
  `extraEntradaMin` dice cuánto vino de la entrada (subconjunto).

  | Horario | Autorizada | Marcó | Extra de entrada |
  |---|---|---|---|
  | 10:00 | 06:00 | 05:58 | **240 min**, medidos de 06:00 a 10:00 |
  | 10:00 | 06:00 | 06:30 | 210 (desde que marcó) |
  | 10:00 | 06:00 | 10:15 | 0 — y **15 de tardanza**, como siempre |
  | 10:00 | — | 05:58 | 0 — como hoy |
  | 10:00 | 06:00 (anulada) | 05:58 | 0 |

- **La planilla** (`clasificarDia`): la extra de entrada se reparte con SU
  ventana (`desde` → entrada del horario) contra el MISMO corte de la tarde:
  6–10 a.m. cae entera de día (1,25) con el corte en 18:00 y en 18:01. La de
  salida se reparte como siempre. `HorasPersona` **no ganó columnas** (25, las
  mismas que se congelan): el desglose `extraEntradaDiurnoMin/NocturnoMin`
  viaja solo dentro de `clasificarDia` → `medirHoras`.
- **Aprobaciones**: sale del mismo `diasConExtra` (`clasificarDia`), con los
  minutos y «entró 06:00 (autorizado)» al lado. Sin aprobar → `extraNoAprobada`
  (aviso ámbar y freno del cierre); «No» → decidido; **los 30 min sin aprobar
  de Multifashion son de la SALIDA** (el horario de la tienda) y no se comen la
  extra de la entrada.
- **Pantalla**: en «Arreglar el día» (editor de la fila, `EDITAR_EL_DIA`) va el
  campo «Hoy entraba a las» con «Quitar»; se guarda con el MISMO porqué y el
  mismo botón por `POST /api/asistencia/correcciones/dia`
  (`entradaAutorizada: { hora } | { quitar: true }`); sin motivo, **400 y cero
  escrituras**. Bajo el día queda la línea azul «Entrada autorizada a las 06:00
  · yulissa: motivo · 240 min de extra medidos de 06:00:00 a 10:00:00» con
  «Deshacer» (`DELETE /api/asistencia/correcciones?entrada=<id>`, anula con
  firma). Editar es editar: otra hora anula la viva y escribe la nueva.
- Lecturas: el Reporte y la Planilla leen la tabla con la MISMA
  `leerEntradasAutorizadas(desde, hasta)` (paginada, solo vivas); sin la
  tabla, vacío.

**3 · El aviso** (`entrada-autorizada.ts` › `avisoEntradaTemprana`). Se dibuja
«llegó N min antes · ¿entrada autorizada?» (chip gris, tocarlo abre «Arreglar
el día») solo si la primera marca cae **N ≥ umbral** minutos antes de su
entrada (`asistencia_reglas.aviso_entrada_temprana_min`, **DEFAULT 30**, 0 =
apagado, editable en Reglas del cálculo) y el día no tiene autorización. 29 →
no · 30 → sí. Viaja en `DiaReporte.entradaTempranaMin` y NADA lo lee salvo la
fila: ni `revisar`, ni `planilla.ts`, ni `antes-de-cerrar*.ts`, ni
`planilla-guardada.ts` (barrido).

### La migración, en palabras simples

`supabase/migrations/20261219120000_asistencia_gracia_almuerzo_entrada_autorizada.sql`
— aditiva, idempotente, **sin aplicar**:

1. `asistencia_reglas` gana dos columnas con valor puesto: `gracia_almuerzo_min`
   (5) y `aviso_entrada_temprana_min` (30). **Toca 1 fila** (la única, id = 1).
2. Nace `asistencia_entradas_autorizadas`, vacía, con sus dos índices y RLS.

No borra, no reescribe, no toca la planilla guardada (candado que lee el SQL).
La tabla nueva entró al respaldo (`backup/tablas.ts` › `TABLAS_PERSONAS` y
`DATASETS` del cron).

### Candados (`src/__tests__/asistencia/`, 68 pruebas)

- `gracia-almuerzo.test.ts` — 65 → 0, 66 → 6 (30+5 y 60+5), el borde `>`, el
  DEFAULT 5, apagado = antes, sin columna = 0, validación, la migración y la
  pantalla.
- `entrada-autorizada.test.ts` — el caso 06:00/10:00/05:58 → 240, 06:30 → 210,
  sin autorización 0, anulada 0, tardanza intacta, 240 al 1,25 con el corte en
  18:00 y 18:01, Aprobaciones y los 30 de ACS, la ruta (400 sin motivo, cero
  escrituras; anular+escribir; quitar), y que nada toque el reloj.
- `aviso-entrada-temprana.test.ts` — 29 no / 30 sí / con autorización no,
  DEFAULT 30, sin columna apagado, no mueve ni un número, barrido del cierre.
- `quincena-cerrada-no-cambia.test.ts` — el I/O de la planilla guardada no
  importa el motor ni las reglas nuevas; la migración no toca lo cerrado;
  `HorasPersona` sigue con 25 cifras; con los interruptores apagados el motor
  da lo de antes.

**Verificado por mutación** (las cinco cazadas, medido): DEFAULT 5 → 0 (7
pruebas caen) · gracia `>` → `>=` (5) · aviso `>=` → `>` (2) · la extra desde
la marca en vez de la autorizada (10) · DEFAULT 30 → 0 (4).

**Candados viejos que se ajustaron, y por qué**: `asistencia-segundos` y
`permiso-tres-columnas` pasan `graciaAlmuerzoMin: 0` (prueban medir al segundo
y el perdón sobre un exceso de 2 min, que con gracia no existiría);
`asistencia-config` documenta que una fila sin la columna vale 0; el candado de
la ruta del día mockea el I/O nuevo; el de la pantalla cuenta solo las cuatro
casillas de hora (`aria-label="Hora …"`).

### Lo que NO se hizo, y lo que queda de Daniel

- ⚠️ **La extra de entrada pasa por el mínimo de 10 minutos** («como cualquier
  extra»). Si Daniel quiere que una autorización de 5 minutos cuente, es un
  `if` en `extraDeEntrada`.
- ⚠️ El aviso no sale en el Excel ni en el PDF del Reporte: es de pantalla.
- ⚠️ El Excel y el PDF del Reporte llevan en «Extras» la extra COMPLETA (con la
  de entrada), sin desglose; el desglose está en la línea azul del día.
- La salida temprana no se tocó. La marcación del reloj sigue sin editarse.

---

## 🔴 Los tres arreglos del 24-sep-2026 — las pestañas vivas, guardar sin salto, y quien no marcó

> 🔴 **Ningún número de plata cambia y nada de lo que se guarda se toca.** El
> `POST /api/asistencia/correcciones/dia` es el mismo, la ruta de la Planilla no
> recibe ningún parámetro nuevo, y el cuadro de la planilla sale byte a byte
> igual. Los tres arreglos van bajo interruptor en
> `src/lib/asistencia/pestanas-vivas.ts`, hoy los tres en `true`.

### El mapa

| Interruptor | Qué prende | `false` = |
|---|---|---|
| `ASISTENCIA_PESTANAS_VIVAS` | Las pestañas visitadas quedan montadas y escondidas; la quincena y el corte de la Planilla viajan en la dirección | Una pestaña dibujada con un `if`, como antes |
| `ASISTENCIA_GUARDAR_SIN_SALTO` | La recarga de después de guardar es silenciosa y la fila corregida se queda anclada | El «Cargando…» que reemplaza la tabla, y la fila se va |
| `ASISTENCIA_SIN_MARCAS_VISIBLE` | Quien no marcó ni un día sale en gris en la lista | La lista solo con quien marcó |

---

### A · Las pestañas visitadas se quedan armadas

**🩸 El defecto, medido el 24-sep-2026.** `AsistenciaClient.tsx` dibujaba la
pestaña activa con un `if` (`{tab === "planilla" && <PlanillaTab …>}`), así que
la pestaña que se dejaba **se desarmaba entera**.

Yendo de **Planilla a Asistencia** y volviendo se perdía todo:

| Lo que tenía en Planilla | Al volver |
|---|---|
| La quincena elegida | ❌ Sin elegir — la pantalla abría vacía |
| **El corte del reloj** | ❌ Volvía al propuesto (13 / 28) |
| El cuadro generado (personas, sueldos, descuentos, neto) | ❌ Se perdía |
| «Antes de cerrar» y el estado del cierre | ❌ Se perdían (salen del cuadro) |
| Línea de colaborador abierta | ❌ Cerrada |

Y de **Asistencia a Planilla**: el colaborador desplegado, lo escrito en el
buscador, las horas a medio corregir, los marcados para justificar a varios y el
lugar donde estaba la página.

**El punto que cuesta plata, no tiempo:** el **corte** volvía al propuesto. Si la
contadora lo había movido (por ejemplo al 10 en vez del 13) y volvía a generar
sin darse cuenta, la planilla que veía era **de otro corte** —o sea, se leyó el
reloj hasta otro día— y nada lo avisaba.

**Medido:** volver costaba 2 toques (la quincena + «Generar»), 3 si tocó el
corte, y **3 llamadas al servidor**; las lecturas de la planilla son las 1.641
marcaciones de la quincena más otras diez tablas, **≈3,1 s solo de lectura**.

**Lo que se hizo.**

- Las pestañas **ya visitadas** quedan montadas y se esconden (`hidden` +
  `hidden` de Tailwind). La que nadie tocó **no se monta**: entrar al módulo no
  puede disparar las cinco lecturas de golpe.
- 🔑 El envoltorio se escribe a mano en cada renglón y **no** como un componente
  definido adentro del render: un componente nuevo en cada render tiene un tipo
  nuevo, React lo desarma y lo vuelve a armar, y se perdería justo lo que esto
  viene a conservar. Hay candado que lo prohíbe.
- Con la ayuda («?») abierta las pestañas **se esconden**, no se desarman.
- La quincena y el corte viajan además en la dirección, con claves **propias**:
  `plQuincena` (el primer día de la quincena) y `plCorte`. `quincena` ya es de
  Préstamos › Movimientos y `desde`/`hasta` de Asistencia y Aprobaciones;
  reusarlas haría que dos pantallas se pisaran el período.
- 🔴 **`CORTE_ENTERA = "0"`**: «la quincena entera» es un VALOR, no la ausencia
  del parámetro. Escrito vacío, la dirección lo borraría y al volver reaparecería
  el corte propuesto — el defecto que esto viene a cerrar.
- 🔴 **Son filtros, no pantallas**: van con `replace` y **no** entran a
  `CLAVES_DE_PANTALLA`. En el celular la que empuja historial sigue siendo `tab`.
- La dirección se lee **una sola vez, al montar**. Una quincena que ya no está
  entre las elegibles (un enlace del mes pasado) se ignora y la Planilla abre
  vacía — la regla de Daniel del 1-sep-2026 no se toca.

**🔴 Lo que NO se hizo, a propósito:** el cuadro generado **no se guarda en
ningún storage**. Plata dibujada desde una copia es un número viejo con cara de
nuevo, y ésa es la clase de error que este módulo lleva años evitando. Al
recargar la página se vuelve a generar, como hoy. Hay candado.

**Candado:** `src/__tests__/components/asistencia-pestanas-vivas.test.tsx`.

---

### B · Guardar una hora no borra la tabla ni salta arriba

Daniel: *«guardo una hora y se me sale de la pantalla»*.

**🩸 La causa A (pasa siempre).** Al guardar se llamaba `onGuardadoElDia()` →
`cargar()` → `setCargando(true)`, y la tabla estaba condicionada a `!cargando`:
**se desmontaba entera** y en su lugar quedaba una sola línea, «Cargando…». La
página pasaba de medir varias pantallas de alto a medir una línea, así que el
navegador dejaba al teléfono arriba de todo. Medido contra producción, las
lecturas de esa misma recarga: **2.031 ms** la primera página de marcaciones
(1.000 filas) **+ 1.108 ms** la segunda (641) **+ 996 ms** de las otras lecturas.
Segundos, no décimas.

**🩸 La causa B (con «Solo a revisar» prendido).** Si la corrección dejaba al
colaborador **sin días por revisar**, al recargar la persona **salía de la
tabla**. Ahí no es una sensación: la fila ya no está.

**Lo que se hizo.**

- `cargar(silenciosa)`: la recarga de después de guardar prende `refrescando`, no
  `cargando`. La tabla se queda dibujada con los datos viejos hasta que llegan
  los nuevos.
- El aviso es una pastilla **FIJA** abajo (`position: fixed`), fuera del flujo:
  una línea que aparece y desaparece arriba de la tabla empujaría la página y
  movería el lugar donde se estaba mirando.
- **La fila recién corregida se ancla**: a lo filtrado se le devuelven los
  anclados **en su lugar** de la lista (`conAnclados`), con un chip «listo» que
  dice por qué sigue ahí. Se van al cambiar el filtro, el período o la empresa.
- 🔴 La regla de qué es «a revisar» **no se toca**: la sigue poniendo el motor.
  Lo único que se agrega es que los anclados vuelven.

**🔴 El guardado no cambia**: el mismo `POST /api/asistencia/correcciones/dia`,
con motivo obligatorio, la corrección por encima y `asistencia_marcaciones`
intacta.

**Candado:** `src/__tests__/components/asistencia-guardar-sin-salto.test.tsx`.

---

### C · Quien no marcó en el período aparece igual

**🩸 El defecto, medido contra producción.** La lista se armaba **solo con quien
tiene marcas en el período** (`reporte.ts`, `porPersona` se llena únicamente con
marcaciones). Sin una marca, la persona no existía para esa pantalla —aunque su
ficha estuviera activa y vigente— y **no había forma de arreglarle las horas**.

Lo que eso escondía, barriendo las 49 fichas contra las marcas de cada quincena
(descontando los 6 códigos escondidos):

- **1–15 sep:** **Yeisibeth Muñoz (306, Multifashion)**, activa, `fecha_ingreso`
  16-ene-2026, `fecha_salida` NULL, **0 marcas** en esa quincena (5 en toda su
  historia, todas del teléfono: 22, 23 y 24 de septiembre). Las otras 7 fichas de
  Multifashion sí tenían marcas, por eso la lista se veía llena.
- **16–30 sep:** **María V. Bethancourth (49, Confecciones Boston)**, activa, sin
  la casilla «no marca el reloj» y **sin una sola marca** en la quincena en
  curso.
- (V-EG Edwin Gómez, Vistana, sale en las dos: tiene «no marca el reloj»
  encendido, o sea que es normal.)

**🔴 Qué hace HOY la planilla con alguien sin marcas — medido, no supuesto.**
En `armarPlanilla` los códigos del cuadro salen de las **FICHAS** de la empresa ∪
quien marcó, así que la persona **sí** entra al cuadro. Sin reporte se le asigna
`HORAS_CERO`: **cero ausencias, cero tardanzas, cero descuentos**. Y con la ficha
completa y sin explicación, la línea sale con `FALTA.sinMarcaciones` («no marcó
ni un día en esta quincena») y **`dinero: null`** → va a «Tú decides», sin pago
calculado.

**O sea: la planilla NO le cobra una sola ausencia.** Por eso la fila gris del
Reporte **solo informa** y no cuenta ausencias — contarlas haría que la pantalla
y el pago dijeran cosas distintas del mismo período. Esto es lo que Daniel pidió:
*«no inventes un descuento nuevo»*.

**Lo que se hizo.**

- `armarReporte` acepta `sinMarcas?: ReadonlySet<string>`. Esos códigos se
  siembran en `porPersona` **después** de recorrer las marcaciones, así que un
  código que sí marcó nunca pasa por ahí.
- Sus días existen —para poder TOCARLOS— pero con el **veredicto suspendido**,
  igual que el día en curso y el día fuera de vigencia: todo en cero,
  `ausente: false`, `revisar: false`. Su resumen queda en cero y **no mueve
  ningún total**.
- La persona viaja con `sinMarcas: true`. La pantalla la dibuja en gris, con el
  chip «sin marcas en el período», el aviso de arriba («N colaboradores no
  marcaron ni un día…») y, al abrirla, la nota que dice que la planilla no le
  descuenta ausencias.
- 🔴 Su día dice **«Sin marcas — no se cuenta como ausencia»**, nunca «Ausencia
  sin justificar»: un rojo ahí diría lo contrario de lo que se paga.
- Se corrige por **la puerta de siempre**: `POST …/correcciones/dia` ya aceptaba
  un día con cero marcas (`tipo: "agregar"` con `marcacionId: null` y el
  `codigo`/`fecha` del cuerpo), así que **la ruta no se tocó** y el formato de lo
  que se guarda no cambió.
- Quedan afuera: el que sí marcó, el que no estaba trabajando en el rango
  (`codigosFueraDeRango`, la MISMA regla que ya saca a los demás), el código
  escondido, y el que el buscador o la página de una persona no pidieron.
- **Excel y PDF la llevan igual que la pantalla** (regla: lo que sale de la
  pantalla nunca se recorta).

**⚠️ Lo que su día NO dice:** si tenía vacaciones o una justificación. Su
veredicto está suspendido entero; lo que explica el período sigue estando en la
Planilla («Tú decides») y en Justificaciones. Antes esa persona no aparecía en
absoluto, así que es estrictamente más información.

**🔴 La PLANILLA no pasa esta lista**: su ruta no manda `sinMarcas` y su cuadro
es el de siempre. Hay candado que lo mide.

**Candado:** `src/__tests__/components/asistencia-sin-marcas-visible.test.tsx`.

---

### Dato para Daniel, no una afirmación

La ficha de **Yeisibeth Muñoz (306)** dice que entró el **16-ene-2026**, pero su
primera marca de la historia es del **22-sep-2026** y la ficha se editó el
20-sep. La misma `fecha_ingreso` (16-ene-2026) y el mismo salario ($550) los
tiene Cindy De Gracia (código 3). No se puede saber si es un error de tecleo; si
lo fuera, mueve los días de vacaciones que le corresponden y el prorrateo de su
primera quincena. **No está medido, no se afirma.**

---

## 🔴 Los seis cambios del 19-sep-2026 — el día se arregla en la fila, y el cierre se ve de una

### Qué decidió Daniel

Seis cosas, aprobadas una por una:

1. **Arreglar el día completo sin abrir una ventana**, y **sin ventana** —no una ventana mejor—: que se edite en la misma fila del Reporte.
2. **Decidir las horas extra desde el Reporte**, sin ir a Aprobaciones.
3. **Justificar a varios desde el Reporte** seleccionando filas (no la opción del formulario con selector de personas).
4. **El tablero de cierre con las cuatro empresas**, con «Todas» elegido.
5. **Quitar la columna «Vacaciones» de la lista de Colaboradores.** Textual: *«se habló que días de vacaciones no existe, sino por plata, ya se habló de eso»*.
6. **Las direcciones viejas de las pestañas que se mudaron.** Textual: *«no creo que debería de existir, ¿no?»*.

---

### 1 · El día completo se arregla en la fila

#### 🩸 Lo que había

Una ventana (`CorregirMarcacionModal`) **por cada marca**, y para cambiar una hora ya corregida había que **deshacer primero y volver a escribir el motivo** — porque el único parcial de la base admite UNA corrección viva por marcación.

Medido contra producción: **232 correcciones sobre 141 días de 33 personas**; **58 días necesitaron 2, 3 y hasta 7 ventanas**; **58 correcciones se anularon** y **44 de ellas fueron seguidas de otra del mismo día en menos de 10 minutos** — o sea, deshacer-para-reescribir.

#### La regla, entera

- Tocar una hora **o un hueco** vuelve la celda escribible **en la misma fila**: `<input type="time" step="1">` en las cuatro columnas de siempre, más las marcas sueltas de un día de 5 o 6 en su propia línea. Debajo de la fila, **un solo campo de porqué** (con los botones de los motivos más usados) y **un solo botón «Guardar el día»**.
- 🔴 **Editar es editar, sin deshacer previo.** Cambiar una hora ya corregida **ANULA la anterior** (con firma, `anulada_en`) **y escribe la nueva**. Las dos filas quedan: lo que se ahorra es el viaje, no el rastro.
- 🔴 **`asistencia_marcaciones` NO se edita ni se borra.** La ruta nueva no nombra esa tabla, no importa la base y no tiene un solo `.update(`/`.delete(`/`.upsert(` — hay barrido.
- 🔴 **Nada se aplica solo.** Una casilla que nadie tocó no produce nada; una hora igual a la que ya valía, tampoco; vaciar una casilla NO borra la marca (quitar es otra cosa y se pide con su botón). Una hora que no sirve **se DICE** y frena el guardado, nunca se descarta en silencio.
- 🔴 **El motivo sigue siendo OBLIGATORIO**, y es UNO para todo el día: la razón por la que ese día se tocó. Los motivos frecuentes se siguen derivando de lo guardado en 90 días — ahora se piden **una vez por pantalla**, no una por ventana.
- 🔴 **«Deshacer» se queda para lo ya guardado**, en la línea de la corrección (donde se lee «Reloj 08:14:22 → 08:00:00»). 🩸 Y ahora alcanza también a una marcación **QUITADA**, que hasta hoy no se podía deshacer por ninguna puerta: no está en `marcas`, así que la ventana nunca se abría sobre ella.
- 🔴 **El servidor valida TODO antes de escribir NADA** (`POST /api/asistencia/correcciones/dia`): el motivo, cada hora, que lo que se quita exista en el reloj, que ninguna marcación venga dos veces (el único parcial reventaría a mitad de camino) y que **la persona y el día salgan de la MARCACIÓN**, nunca del navegador — aceptar el `fecha` del cuerpo dejaría mover horas de una quincena a otra.
- **Interruptor `EDITAR_EL_DIA`** (`lib/asistencia/editar-el-dia.ts`), hoy en `true`. En `false` la pantalla es exactamente la de antes, con su ventana, sin migración de por medio.

#### Medido

`scripts/_medir-vs-yulissa.ts`, solo lectura, antes y después: **1–15 sep y 16–31 ago IDÉNTICAS byte a byte** (46 líneas cada una). Es una pantalla, no un cálculo, y se midió igual.

#### Candados

`asistencia-editar-el-dia.test.ts` (36 casos: la regla pura, el servidor, los barridos) y `asistencia-editar-el-dia.test.tsx` (11 casos, renderizando el Reporte de verdad). Mutación: **26 de 26 cazadas, 2 controles en verde** (`scripts/_mutar-candados-editar-el-dia.sh`).

---

### 2 · Las horas extra se deciden desde el Reporte

- La columna «Extras» pasa a tener **Sí / No** en la fila del día, donde ya se está mirando el reloj.
- 🔴 **Al aprobar manda el SERVIDOR.** Son los MISMOS botones (`aprobaciones/BotonesSiNo`), el MISMO endpoint (`POST /api/asistencia/aprobaciones`), el MISMO cuerpo y el MISMO `?empresa=`: el alcance del aprobador, el filtro por empresa y el «todo o nada» los sigue decidiendo la ruta. Hay barrido que prohíbe que el Reporte importe `diasConExtra`, `clasificarDia` o `recargoDomingoFeriado`.
- ⚠️ **La pestaña Aprobaciones NO se tocó**, y sigue siendo la única que ofrece el **DOMINGO** y el **FERIADO** trabajados: esos minutos viven en `domingoMin`/`feriadoMin` (`clasificarDia`), no en el `extraMin` que muestra esta columna. Ofrecerlos aquí pediría rehacer la clasificación en la pantalla — una segunda verdad.
- Los botones solo salen con hora extra y con la casilla «¿Cobra horas extra?» en sí (`seDecideEnElReporte`); quien no puede aprobar no los ve (y el servidor lo frena igual); la decisión se pinta en el acto y **se REVIERTE si el POST falla**, diciendo por qué; volver a tocar el prendido vuelve a pendiente.
- **Medido**: 0 diferencias en las dos quincenas. Candado `asistencia-extras-en-el-reporte.test.tsx`; mutación **13 de 13 cazadas, 2 controles**.

---

### 3 · Justificar a varios desde el Reporte

#### 🩸 De dónde salió

El **día de lluvia del 17-ago-2026** son **13 justificaciones cargadas una por una con la misma nota** — 13 de las 29 de toda la historia del módulo. Cada una pedía abrir la ficha de esa persona, elegir el motivo, escribir la nota y guardar.

#### La regla, entera

- Cada fila del Reporte lleva su **casilla** (dentro de la celda «Colaborador», no en una columna nueva: la tabla ya tiene once y una doceava la aprieta en el iPad). Con alguien marcado aparece arriba una barra: «N colaboradores seleccionados · Justificar a varios · Quitar la selección».
- 🔴 **La lista de motivos sigue CERRADA** (`motivos.ts`). Con varios marcados se ofrece la **INTERSECCIÓN** de los suyos (`motivosParaVarios`), nunca la unión: con alguien de Multifashion adentro, «Día libre de la empresa» no se ofrece a nadie — el servidor lo rechazaría y el lote quedaría a medias.
- 🔴 **El guardado usa la MISMA ruta y la MISMA validación de hoy**, con el cuerpo de siempre, **una petición por persona**. NO nace una ruta «en lote» con reglas propias, que sería una segunda verdad sobre qué se puede justificar y quién puede hacerlo.
- 🔴 **La ventana monta el MISMO `JustificarForm`** de la ficha y de la fila del día; lo único nuevo es la prop `codigos` y un bucle. El de adentro del bucle se llama `codigo` a propósito: el cuerpo que viaja es letra por letra el de siempre.
- 🔴 **Se dice a quiénes, POR NOMBRE, antes de guardar** — justificar mueve plata—, y **lo que no entra se dice también por nombre**: «Se guardaron 11 de 13. Faltó: Andrea Perez · Jenifer Gomez.»
- 🔴 **Abre en UN día** (el primero del período que se mira), nunca el período entero: con los atajos «Hoy» y «Ayer» es exactamente el día buscado, y justificar catorce días por defecto sería regalar media quincena.
- 🔴 **La selección se deriva de lo que SE VE**: quien sale de la tabla (cambió el período, se prendió «Solo a revisar») sale de la selección, y no se justifica a escondidas.
- **Medido**: 0 diferencias. Candado `asistencia-justificar-a-varios.test.tsx`; mutación **17 de 17 cazadas, 2 controles**.

⚠️ **Lo que NO se arregló, y Daniel preguntó**: las **3 justificaciones duplicadas** de producción. `asistencia_justificaciones` no tiene soft delete, pero **sí se pueden borrar**: `DELETE /api/asistencia/justificaciones?id=<uuid>` existe desde siempre y hace un DELETE de verdad, y la sección «Justificaciones» de la ficha del colaborador ya lo llama. O sea: **se borran desde la ficha de esa persona**, no hace falta tocar la tabla. Lo que no hay es forma de borrarlas desde la lista del período. No se tocó nada: es una decisión de Daniel.

---

### 4 · El tablero de cierre con las cuatro empresas

#### 🩸 Lo que había

Con «Todas» elegido, la Planilla decía *«Elige una empresa arriba para armar su planilla: con «Todas» no se paga nada»* y **no mostraba nada más**. Para saber cómo venía la quincena había que entrar empresa por empresa, generar y mirar — cuatro veces, seis veces al mes.

#### La regla, entera

- Con «Todas», una línea por empresa: **Empresa · Colabor. · Neto · Qué falta para cerrar · Cerrar**.
- 🔴 **NUNCA UN TOTAL DEL GRUPO.** El tablero muestra ESTADO, no totales: no hay fila «Total», ni pie (`<tfoot>`), ni un número que sume dos empresas. El módulo puro no tiene una operación de suma entre filas y hay barrido que lo exige. Y **se DICE por qué**, en una línea bajo la tabla: *«Cada empresa se cierra por su lado y paga su propia planilla: aquí no se suman.»* Sin ella, el primer instinto de cualquiera que vea cuatro netos en columna es sumarlos.
- 🔴 **Cada cierre es el de SU empresa, por su propia puerta.** El botón de una fila manda el MISMO `POST /api/asistencia/planilla-guardada` con `{ empresa, desde, hasta }` de esa empresa, una por vez, detrás de la **MISMA ventana de confirmación** que la Planilla (`ModalCierre`, la que muestra los números que se van a congelar). **No existe un «cerrar todas».**
- 🔴 **Sigue valiendo que solo se cierran quincenas**: el freno (`frenoSoloQuincenas`) es del servidor y el tablero no tiene uno propio que pueda separarse de aquél.
- El cuadro de cada empresa sale de **su PROPIA lectura**, a la ruta de siempre (`/api/asistencia/planilla?empresa=K`), que ya fuerza la empresa para David y recorta por el alcance.
- 🔴 **«Qué falta» sale del MISMO «Antes de cerrar»** que dibuja la Planilla de una empresa. Para eso su entrada —quince campos— se mudó a un módulo puro, `antes-de-cerrar-del-cuadro.ts`: dos copias serían dos verdades sobre qué frena un cierre, y el día que se agregue un aviso una de las dos se quedaría vieja sin que nadie se entere.
- Detalles: una lectura caída **se DICE** y no se disfraza de «no hay nadie», y no tumba a las demás; una empresa ya cerrada no ofrece cerrar otra vez; quien no cierra no ve un botón; y **se espera al alcance del servidor** antes de armar el tablero — sin eso se arma dos veces, parpadea a «Cargando…» delante de quien mira y les muestra un instante a David y a Julio empresas que su rol no ve.
- **Medido**: 0 diferencias. Candado `asistencia-tablero-cierre.test.tsx` (21 casos); mutación **16 de 16 cazadas, 2 controles**.

---

### 5 · Los días de vacaciones se van de la lista de Colaboradores

> *«se habló que días de vacaciones no existe, sino por plata, ya se habló de eso»*

🩸 La columna mostraba un número **PELADO**: **Briceida decía 665** — los días acumulados desde su ingreso en 2006, sin restar lo que se tomó antes de que las vacaciones existieran en el sistema (25-ago-2026). Entre los 44 colaboradores sumaban **2.160 días**. En una lista de 44 filas no hay lugar para la línea que explica que ese número no es un saldo, así que el número engaña.

- Se quita **la columna de la LISTA**: el encabezado, la celda de escritorio y el dato de la tarjeta del celular. Con ella se va la lectura que la llenaba, así que la pantalla hace **una petición menos** al abrirse, y la rejilla vuelve a ser UNA (la de cinco columnas de siempre).
- 🔴 **La FICHA de cada persona NO se toca**: ahí el mismo número se lee **«Le corresponden N días»** con su línea de aviso («No incluye vacaciones tomadas antes del 17 de septiembre de 2026»). Ahí está bien puesto.
- 🔴 **El cálculo se queda entero** (`vacaciones-corresponden.ts`): la regla de la ley (30 días por cada 11 meses), el `null` cuando falta la fecha de ingreso, y el barrido que exige que **no entre a ningún cálculo de plata**.
- Candado `asistencia-vacaciones-fuera-de-la-lista.test.ts`; mutación **9 de 9 cazadas, 2 controles**.

---

### 6 · Las direcciones viejas de las pestañas

> *«no creo que debería de existir, ¿no?»*

🩸 `?tab=justificaciones`, `?tab=vacaciones`, `?tab=configuracion` y `?tab=reporte` **se aceptaban y abrían otra pantalla EN SILENCIO**: la URL seguía diciendo «justificaciones» mientras se veía Asistencia. La dirección quedaba viva: se podía volver a compartir, y el Atrás del navegador la devolvía. (Son cuatro, más `personas`, que es la misma mudanza de una tarde de septiembre.)

- Ahora la URL **se reescribe** a la pestaña real, con `replace` —es el mismo nivel, y el Atrás no tiene que pasar por la dirección que se acaba de corregir—.
- **La mudanza NO cambió**: cada una sigue cayendo donde de verdad vive eso (`MUDANZA`). Lo que cambia es que la dirección vieja deja de existir en cuanto se usa una vez.
- 🔴 **Sin `?tab=` no se escribe nada.** Entrar a `/asistencia` a secas no puede empezar a poner `?tab=` en el historial de todo el mundo.
- 🔴 **No se toca nada hasta saber QUIÉN mira.** El rol sale de `sessionStorage` en un efecto y en el primer render no hay ninguna pestaña visible: reescribir ahí convertiría un `?tab=planilla` compartido por WhatsApp en la pestaña por defecto **antes** de saber que esa persona sí ve la Planilla.
- La regla vive en el módulo puro (`claveQueSeReescribe`), y la pantalla no tiene su propia tabla de mudanzas.
- ⚠️ **Con el acomodo nuevo APAGADO** (`NEXT_PUBLIC_PERSONA_EN_EL_CENTRO`), esas cuatro claves SON pestañas de verdad y no se corrige nada. En producción el interruptor está prendido.
- Candado `asistencia-direcciones-viejas.test.tsx`; mutación **10 de 10 cazadas, 2 controles**.

---

### Lo que NO se hizo

- No se escribió nada en producción ni en ninguna base; no hay migración nueva.
- No se tocó la pestaña Aprobaciones, ni la ficha del colaborador, ni el motor de la planilla.
- **Los netos no se movieron**: 1–15 sep y 16–31 ago salen idénticas byte a byte antes y después de los seis cambios.

---


## 🔴 Solo se cierran quincenas (18-sep-2026, noche) — el freno es del servidor

### Qué decidió Daniel

Se le preguntó si el sistema debía FRENAR cuando el período a cerrar no es una quincena. Textual: **«si frenalo, quitalo y quita la opcion de poner rango»**.

Son dos cosas, y una ya estaba hecha:
1. **Quitar de la Planilla la opción de elegir un rango libre.** Hecho el 15-sep-2026 (`fc0b5b7b`: «Otro rango ⌄» se fue, quedan los cuatro botones de `quincenasElegibles`; candado `quincena-fija-sin-rango-libre`). Verificado hoy: `PlanillaTab` no importa `RangoFechas`.
2. **El cierre FRENA en el SERVIDOR** si aun así llega un período que no es quincena. Esto es lo nuevo.

### 🩸 El caso real

La pantalla avisaba en gris («los montos a mano se guardan por quincena…») y **dejaba cerrar igual**. Medido contra producción el 18-sep-2026: `asistencia_planilla_guardada` tiene **8 filas**, y dos son «15–28 de agosto» —`5bc68925…` Fashion Wear ($1.784,25, 8 personas) y `b7923fbf…` Vistana ($2.318,71, 9 personas)—, con `quincena = NULL`, cerradas por Contabilidad el 13-sep y **reabiertas por Daniel el 16-sep** (*«Pruebas del módulo… se revierte todo para arrancar limpio»*). Las otras tres pruebas (`09bc634d`, `e47211e7`, `4996da0f`) ya no están: la migración `20261201120000` **corrió**.

Lo que pasa al cerrar un rango así: el sueldo se prorratea por `factorBase`, los montos a mano no se aplican (`claveManuales = null`)… y el cierre anotaba igual los pagos de préstamo (`planearCierre` no mira la clave). Plata escrita sobre un período que nadie paga.

### La regla, entera

- 🔴 **`frenoSoloQuincenas(periodo)`** (`lib/asistencia/planilla-guardada.ts`, puro): `null` si `periodo.esQuincena`; si no, el texto: *«Solo se cierran quincenas. Llegó del 15 ago 2026 al 28 ago 2026, y eso no es una quincena. Elige una de las quincenas de arriba y vuelve a generar. No se cerró nada.»*
- 🔴 **El POST de `/api/asistencia/planilla-guardada` lo pregunta ANTES de leer las cabeceras y antes de pedir el cuadro**: contesta **400** con `ok: false` y ese texto. Ni una lectura de la base, ni una escritura. Da igual la empresa (Boston 15–25 ago también rebota).
- 🔑 «Quincena» es lo que ya decidía `periodoDesdeRango`: `1–15` y `16–último día que paga` (**nunca el 31**). Por eso 16–31 ago tampoco pasa.
- ⚠️ **La ruta que GENERA (`/api/asistencia/planilla`) NO lleva el freno y no lo puede llevar**: `medirAjusteAnterior` se llama a sí misma con el rango corto de los días sin medir. El freno es del CIERRE. (Es el control C del candado del 15-sep, y ahora también el bloque D del nuevo.)
- La pantalla, de paso: el botón «Cerrar quincena» no se dibuja si `avisos.rangoLibre`, y el aviso gris ya no manda a «escribir las fechas» que no se pueden escribir. Solo puede verse si alguien pide el cuadro por fuera de los cuatro botones.

### 🔴 Lo que NO se tocó

- **Lo ya guardado.** Las dos cabeceras de «15–28 ago» se quedan como están (reabiertas). Esto impide que vuelva a pasar; no reescribe el pasado. Hay candado (bloque E): ninguna migración las nombra y la única que borra cabeceras sigue siendo la de las tres pruebas, por lista de ids.
- **Las otras cinco pantallas** (Reporte, Aprobaciones, Justificaciones, Vacaciones y la planilla de Boston) conservan `RangoFechas`: ahí mirar cualquier rango sigue siendo válido. Candado (bloque C).
- **La planilla de Boston**: David solo mira; su pestaña hace un GET a `planilla-guardada` y ningún POST.
- **Ningún número**: esto es una puerta, no un cálculo. `scripts/_medir-vs-yulissa.ts 2026-09-1 --corte=2026-09-10` antes y después: **0 diferencias en 46 líneas** (ver «Medido» abajo).

### Candados

- `src/__tests__/api/planilla-solo-quincenas.test.ts` — 24 casos en 5 bloques: la regla pura · el servidor rechaza sin leer ni escribir (y una quincena de verdad pasa, por fechas y por clave) · las cinco pantallas conservan su rango y la Planilla no lo recupera · control: la ruta que genera no lleva el freno · lo ya guardado no se reescribe.
- `planilla-guardada-route.test.ts` cambió de dirección con nota fechada en dos casos: el solapamiento se prueba con la MISMA quincena cerrada dos veces (un «10–20» ya no llega a ese freno) y el choque del EXCLUDE con la quincena de al lado.
- Verificación por mutación: `scripts/_mutar-candados-solo-quincenas.sh` — **13 mutaciones, 13 cazadas, 2 controles en verde**.

### Medido

`scripts/_medir-vs-yulissa.ts 2026-09-1 --corte=2026-09-10`, solo lectura, antes y después del cambio: **46 líneas, las 46 idénticas; totales idénticos** — neto **$11.317,31** (bruto 12.932,68 · préstamo 686,61 · terceros 282,71 · mercancía 17,80). Era lo esperado —es una puerta, no un cálculo— y se midió igual. Mutación: **13 de 13 cazadas, 2 de 2 controles en verde** (`scripts/_mutar-candados-solo-quincenas.sh`).

---

## 🔴 Todo de lunes a sábado en Multifashion, y sin deuda de día libre (18-sep-2026, tarde)

### Qué decidió Daniel

> *«obvio todo de lunes a sábado con multifashion»*
> *«multifashion no se comporta igual, ese día se les regala, igual no van a marcar»* · *«te dije que no hay deuda del día libre a multifashion»*
> *«no existe que entre semana Multifashion cierre pero las otras trabajen»* — por eso NO hay feriados por empresa: la lista global alcanza.

Son **cuatro** empresas en planilla: `fashion_wear` · `vistana` · `confecciones_boston` · `american_classic`.

### 🩸 Lo que quedó a medias por la mañana

El cambio de los horarios configurables (`784fe1fa`) hizo que el MOTOR contara el sábado de Multifashion como día laborable —para la ausencia y el día normal—, pero dejó **TRES cuentas que seguían preguntando «lunes a viernes» a secas**, cada una con su propio bucle sobre `esHabil`:

| # | Cuenta | Dónde | Qué pasaba |
|---|---|---|---|
| 1 | «faltan N días hábiles» del encabezado | `periodo.ts` › `diasHabilesPendientes` | Mirando Multifashion decía 9 cuando faltaban 11 |
| 2 | El prorrateo de quien entra o sale a mitad de quincena | `prorrateo-ingreso.ts` › `diasHabilesEntre` | A alguien de Multifashion que entrara un lunes le pagaba 7 días en vez de 8: **el sábado trabajado no se le pagaba** |
| 3 | La deuda del día libre de la empresa | `dia-libre-empresa.ts` › `diasHabilesDelRango` | Un sábado regalado no generaba deuda ni a quien lo trabaja |

Barrido completo de `src/lib/asistencia/**` y `src/app/api/asistencia/**` por `esHabil`, `getUTCDay` y `dow` con `1..5` a mano: **eran exactamente esas tres**, más `planilla.ts:749`, que usa `esHabil` solo como RESPALDO de `clasificarDia` para un día viejo que no traiga `habil` (el motor siempre lo trae; se deja), y el propio `esHabil` de `reporte.ts`, que queda como esa única definición.

### La regla, entera

- 🔴 **UN SOLO CONTADOR**: `diasLaborablesDelRango(desde, hasta, dias, tope)` en `horario-configurable.ts`, y las tres cuentas pasan por él con los días de cada quien (`resolverDiasLaborables`: la columna de la persona, si no la EMPRESA de la ficha; sin la migración, lunes a viernes). Ninguna vuelve a tener bucle propio.
- **«Faltan N días hábiles»** cuenta con los días de la empresa que se mira; con las cuatro juntas, la **unión** (`diasLaborablesDeEmpresas`, lunes a sábado): un sábado que a Multifashion todavía no se le contó ES un día que falta. Ejemplo real: quincena 16–30 sep, hoy viernes 18 → **9** de lunes a viernes, **11** con el sábado.
- **El prorrateo** recibe los días de ESA persona (`prorrateoPorVigencia(v, desde, hasta, dias)`): quien entra en Multifashion el lunes 7-sep cobra **8 días** (con el sábado 12), no 7. Yeritza (Vistana, 27-jul) sigue en **5 × $23,08**.
- **La deuda del día libre** se arma persona por persona con SUS días: Boston debe viernes y lunes de un rango vie→lun; quien tenga el sábado configurado en Horarios, también el sábado.
- 🔴 **MULTIFASHION NUNCA LLEVA DEUDA DE DÍA LIBRE.** A ellas ese día se les regala: no se descuenta y no queda debiendo nada. La lista es `EMPRESAS_SIN_DIA_LIBRE = ["american_classic"]` en `motivos.ts` (escrita a mano, por `empresa_key` de la ficha). Se cierra en TRES lugares: `planearCargaDiaLibre` rechaza por empresa (antes de leer nada) y por persona (con la ficha en la mano, no con lo que diga el cuerpo); `registrarDeudasDiaLibre` —la única puerta que escribe— se corta sola si alguien le manda una; y la pantalla (`JustificarForm` con `motivosParaElegir(empresa)`) no le ofrece el motivo: a Multifashion se le ofrecen SEIS, a las otras tres los siete. Las dos rutas contestan **400** con `TEXTO_DIA_LIBRE_NO_APLICA`. Cualquier otro motivo le entra a Multifashion como siempre.
- 🔴 **El domingo no se toca**: ningún contador lo cuenta ni con una lista que lo traiga, y el motor lo sigue mandando a `domingoMin`.
- Para que la pantalla sepa la empresa: `SeccionJustificaciones` la recibe de la ficha (`persona.empresa`) y la fila del día del Reporte la manda en `DiaParaJustificar.empresa` (la ruta del Reporte ya la pegaba a cada persona). Sin empresa se ofrecen todos y decide el servidor.

### Lo medido, contra producción (solo lectura, `scripts/_medir-vs-yulissa.ts`, migración `20261208120000` YA corrida, feriado 12-sep cargado)

- `asistencia_dia_libre_deuda`: **CERO filas**. No hay nada que limpiar; solo se cerró la puerta.
- **1–15 sep**, las cuatro empresas, antes → después: **0 diferencias en 46 líneas**. Multifashion 1.887,85 · Boston 4.831,42 · Fashion Wear 2.044,82 · Vistana 2.453,80. Nadie de Multifashion entró ni salió a mitad de quincena y no hay deudas de día libre, así que las dos cuentas que cambian no tenían a quién tocar.
- **16–31 ago**: **0 diferencias en 46 líneas** (Multifashion 1.094,96 · Boston 5.619,07 · Fashion Wear 2.143,94 · Vistana 2.470,21).
- 🔑 **El sábado 12-sep, ya con el feriado «Fiesta Judia» puesto**: las cuatro ausencias de Jenifer (301), Milagros (302), Jailine (303) y Sheynee (304) **desaparecieron solas** — el día sale `feriado=Fiesta Judia · ausente=false` para las ocho fichas de Multifashion, y el neto de la tienda pasó de los 1.122,01 medidos ayer a **1.887,85** (con las fichas de Ana, Cindy y Yeisibeth adentro). ⚠️ **Angel Pizza (305)** tiene UNA marca suelta ese día a las 19:15:21: para la PLATA no cuenta nada (día feriado: ni ausencia, ni tardanza, ni recargo porque trabajó 0 min), pero el **Reporte** le sigue mostrando ese día con **555 min de tardanza** y «marca de menos» (una marca sola es impar). Es la conducta de siempre del Reporte en un feriado con marca; no se tocó. Sus 2 ausencias reales son el 8 y el 9 de septiembre.

### Candados

- `src/__tests__/lib/multifashion-sabado-y-dia-libre.test.ts` — 23 casos en 5 bloques: el contador único y las tres cuentas · la regla pura y la pantalla · el servidor rechaza (por empresa sin leer una ficha, por persona, en la puerta que escribe, y las dos rutas con 400) con Boston de control · el domingo con su recargo · las otras tres empresas idénticas a lo de siempre. Barridos: nadie importa `esHabil` en las tres cuentas, ningún «1..5» a mano fuera de `esHabil`, la ruta de planilla y el instrumento de medición pasan los días.
- Cambiaron de forma con nota fechada (misma conducta): `asistencia-corregir-hora` (`motivosParaElegir(empresa)`, `empresa` en `onJustificar`), `asistencia-dia-31` (quinto argumento del aviso), `asistencia-reglas-de-la-contable` (cuarto argumento del prorrateo).
- Verificación por mutación: `scripts/_mutar-candados-multifashion-sabado.sh` — **17 mutaciones, 17 cazadas, 2 controles en verde**.

### Lo que NO se hizo, y lo que queda de Daniel

- No se escribió nada en producción; no hay migración nueva.
- No se construyeron feriados por empresa (Daniel: la lista global alcanza).
- No se tocó el Reporte del feriado con marca suelta (Angel, 12-sep): muestra tardanza que la planilla no cobra.
- ⚠️ **Pendiente de Daniel**: si un día entre semana las tres empresas cierran con «día libre de la empresa» (deuda) y Multifashion también cierra, hoy a Multifashion no se le puede cargar NADA que la justifique (el día libre está cerrado para ellas y un feriado global les borraría la deuda a las otras tres). Daniel dijo que ese caso no existe (*«no existe que entre semana Multifashion cierre pero las otras trabajen»*); si un día existe, es una decisión suya, no un mecanismo que se inventa acá.

---

## 🔴 Los días y los dos horarios, configurables por persona (18-sep-2026) — Multifashion trabaja el sábado

### Qué decidió Daniel

> *«todo eso de horario que sea configurable por si hay cambios en un futuro»*
> *«multifashion es de 10-1830»* · *«multifashion sus dias laborales es de lunes a sabado»*
> *«Ana · Cindy · Yeisibeth su horario es de 9-18 cuando estan afuera. cuando estan afuera marcan por el sistema marcaciones. al igual rodrigo, su horario cambia cuando esta afuera y usa el celular de 10-1830»*
> *«si marca por el telefono es el horario que te dije, que se fije por la primera marcacion pues. la persona no deberia de marcar en ambos sistemas, o es uno o es el otro»*
> *«el maximo es 48 a la semana»*

Y sobre el sábado, las dos consecuencias, aprobadas una por una:
> *«1. Desaparece ese aviso — las horas del sábado dejan de ser un caso raro, son el día normal. 2. El que no viene el sábado, falta. Con su descuento, como cualquier otro día.»*

### 🩸 Los dos supuestos que el motor tenía escritos a fuego

**A · «Hábil = lunes a viernes», para las OCHO empresas.** `esHabil` (`reporte.ts`) era `dow >= 1 && dow <= 5`, global y sin excepción. Por eso los sábados de Multifashion no los pagaba nadie —el motor los medía (`horas.sabadoMin`) y «Antes de cerrar» avisaba *«N trabajaron un sábado: esas horas no se pagan aquí»*—, y al revés: al que no venía el sábado no se le descontaba nada. Fue una abstención deliberada (*«el cuadro no tiene columna y acá no se inventa un recargo»*), y Daniel dio la respuesta.

**B · «Un solo horario por persona».** `asistencia_horarios` tenía UN `entrada` y UN `salida`. La pantalla de Horarios ofrecía **dos botones de salida (16:30 · 17:00)** y nada más: la entrada de las 10:00 de Multifashion no se podía ni ver, y el 18:30 tampoco se podía elegir (estaba en la base, cargado a mano).

### La regla, entera (`src/lib/asistencia/horario-configurable.ts`, puro)

- **Los días que trabaja** son una lista por persona (1 = lunes … 6 = sábado) en `asistencia_horarios.dias_laborables`. **NULL = manda la EMPRESA de la ficha** (`DIAS_LABORABLES_POR_EMPRESA`): Multifashion lunes a sábado; Boston, Vistana y Fashion Wear lunes a viernes. La columna de la persona le gana a la empresa (`resolverDiasLaborables`).
- Un día laborable sin marca es **AUSENCIA** (8 h × rata, `MIN_DIA_NO_TRABAJADO`, como cualquier día); con marca es un **día NORMAL**: tardanza, salida temprana, hora extra. 🔑 **Para Multifashion el sábado no lleva recargo**: el quincenal ya lo paga. Candado: el neto de un sábado normal es idéntico al del mismo día un lunes.
- 🔴 **El domingo NO se toca.** `esDiaLaborable` devuelve `false` en domingo pase lo que pase, `normalizarDiasLaborables` descarta el 0, el CHECK de la base lo prohíbe y la pantalla no lo ofrece. Sigue yendo a `domingoMin` con `recargoDomingoFeriado`.
- **Dos horarios**: `entrada`/`salida` (cuando marca en el RELOJ) y `entrada_afuera`/`salida_afuera` (cuando marca por el TELÉFONO). 🔴 **Cuál aplica lo decide la PRIMERA marca del día** (`horarioDelDia`), por HORA y no por orden de llegada: una marca del teléfono que llegó tarde al servidor (sin señal) sigue siendo la primera si se tomó antes. La segunda marca no decide nada. Una hora agregada a mano no trae aparato: es del reloj.
- 🔑 **Vacío = el mismo de adentro, campo por campo.** Con las dos horas de afuera vacías, una marca del teléfono se mide con el horario de siempre y el día NO se marca «de afuera».
- **La planilla ya no le pregunta al calendario**: `clasificarDia` mira `d.habil`, que el motor calcula persona por persona. `esHabil` (lunes a viernes) queda de respaldo para un día que no lo traiga, y para lo que cuenta días hábiles del CALENDARIO sin persona adelante: «faltan N días hábiles» del encabezado (`periodo.ts`), el prorrateo de quien entra a mitad de quincena (`prorrateo-ingreso.ts`) y la deuda del día libre de la empresa (`dia-libre-empresa.ts`). ~~⚠️ Esos tres siguen contando lunes a viernes también para Multifashion — decisión pendiente de Daniel, no se tocó.~~ → **RESUELTO esa misma tarde** (Daniel: *«obvio todo de lunes a sábado con multifashion»*): los tres pasan por `diasLaborablesDelRango` con los días de cada quien. Ver la sección de arriba.

### Dónde vive

| Qué | Dónde |
|---|---|
| La regla (días, primera marca, vacío = adentro, validadores, palabras) | `src/lib/asistencia/horario-configurable.ts` |
| La lectura ÚNICA de `asistencia_horarios`, tolerante a la migración | `src/lib/asistencia/horarios-server.ts` (`leerHorarios`) — la llaman `/planilla`, `/reporte` y `/horarios`; hay barrido que prohíbe un `select` propio |
| El motor | `reporte.ts`: `Marcacion.dispositivo`, `HorarioPersona.entrada_afuera/salida_afuera`, `diasLaborables` por código, `DiaReporte.horarioDeAfuera` (informativo) |
| La planilla | `planilla.ts` › `clasificarDia` mira `d.habil` |
| La pantalla | Asistencia › Configuración › **Horarios** (`HorariosTab.tsx`): por persona, **Días que trabaja** (Lun…Sáb, 44 px), **Cuando marca en el reloj** (entrada → salida, ahora las dos se escriben), **Cuando marca por el teléfono** (vacío = el mismo de arriba), almuerzo como dato. Se guarda al cambiar, sin botón |
| La ruta | `PUT /api/asistencia/horarios` acepta `entrada`, `salida`, `diasLaborables`, `entradaAfuera`, `salidaAfuera`; lo que el cuerpo no trae se conserva; el almuerzo lo sigue poniendo la empresa |
| La migración | `supabase/migrations/20261208120000_asistencia_horario_configurable.sql` — ⚠️ **pendiente, la corre Daniel**. Tres columnas NULL + CHECK, y por LISTA de códigos el horario de afuera que él dictó (2 · 3 · 306 → 9:00–18:00; 13 → 10:00–18:30), solo donde esté vacío |

🔴 **Falla ABIERTA, y está medido**: con la migración sin correr, `leerHorarios` vuelve a leer solo lo de siempre y `resolverDiasLaborables` devuelve vacío → lunes a viernes y un horario para todos. Corrido contra producción el 18-sep-2026 (código nuevo, migración sin aplicar) contra la foto de antes: **0 diferencias en las 46 líneas** de 1–15 sep. «Antes de cerrar» y la pantalla de Horarios dicen «Falta correr el SQL …» mientras tanto, y la pantalla esconde los controles nuevos.

### Lo medido, contra producción (solo lectura, `scripts/_medir-vs-yulissa.ts --simular-migracion`)

- **Nadie ha marcado nunca por el teléfono** desde el 1-ago: 4.873 marcas, 4.526 del reloj de Boston, 343 del de Multifashion (que arranca el 29-ago) y **4 del teléfono, todas de Daniel (52) el 15-sep**. Ana 2 · Cindy 3 · Yeisibeth 306 · Rodrigo 13: cero. El horario de afuera no se dispara todavía, y es lo esperado.
- Multifashion sí trabaja el sábado: días-persona con marca por día de semana (29-ago → 15-sep): lun 14 · mar 14 · mié 14 · jue 20 · vie 18 · **sáb 11** · dom **0**. Sábados: 29-ago (301, 302, 304, 305), 5-sep (los siete: 2, 3, 301–305), **12-sep (solo una marca suelta de Angel Pizza 305 a las 19:15)**.
- Horarios guardados hoy: los ocho de Multifashion **ya están en 10:00 → 18:30 con 60 de almuerzo** (lo que Daniel dictó); Rodrigo 08:00 → 16:30; el resto 08:00 → 16:30/17:00.

**1–15 sep (quincena entera, sin corte)** — se mueve SOLO Multifashion, **−$87,13 de neto** (11.209,14 → 11.122,01). Boston, Vistana y Fashion Wear: **0 diferencias**.

| Quién | Qué pasó el sábado 12-sep | Ausencia $ antes → después | Neto antes → después |
|---|---|---|---|
| Jenifer Miranda (301) | sin marca → **1 ausencia** | 0 → 28,88 | 205,40 → 182,11 |
| Milagros Torres (302) | sin marca → 1 ausencia | 9,17 → 28,13 | 227,11 → 211,81 |
| Jailine Quispe (303) | sin marca → 1 ausencia | 5,22 → 24,18 | 230,59 → 215,30 |
| Sheynee Batista (304) | sin marca → 1 ausencia | 0 → 18,96 | 237,33 → 222,03 |
| Angel Pizza (305) | UNA marca a las 19:15 → día laborable con **555 min de tardanza** (columna «Ausencia») y **marca de menos** (frena el cierre) | 37,92 → 59,86 | 222,17 → 204,22 |
| Ana (2) · Cindy (3) · Yeisibeth (306) | trabajan afuera → el sábado sin marca es «Trabajo de vendedor», **se paga** | sin cambio | sin cambio |

⚠️ **El sábado 12-sep no marcó NADIE en la tienda.** Eso huele a tienda cerrada o reloj caído, no a cinco faltas y una tardanza de 9 horas. **No se trata como ausencia sin que Daniel lo confirme**: si la tienda no abrió, va como feriado (Configuración › Feriados) o con justificación ANTES de cerrar la quincena. La migración lo dice en su encabezado.

**16–31 ago** — se mueve SOLO Multifashion, **−$102,92** (1.197,88 → 1.094,96): los sábados 22-ago (sin reloj todavía: 301, 302, 303, 304, 305) y 29-ago (303) pasan a ausencia. ⚠️ Esa quincena ya tenía 8–9 ausencias por persona porque el reloj de Multifashion no existía antes del 29-ago; la contadora la pagó a mano. Lo nuevo se suma a un cuadro que ya no describía lo pagado.

### ⚠️ Las 48 horas

Daniel: *«el máximo es 48 a la semana»*. Con estos horarios nadie se pasa por horario: Multifashion 7,5 h × 6 = **45**; Ana afuera 8 h × 6 = **48**, justo en el tope. Queda anotado como el LÍMITE; **no se construyó un tope semanal**: el extra se mide por DÍA y cambiarlo es otra pregunta.

### Candados

- `src/__tests__/lib/horario-configurable.test.ts` — 36 casos en 8 bloques: sin migración = como hoy · Multifashion lunes a sábado (ausencia, día normal sin recargo, aviso que desaparece, el Reporte recorre el sábado, trabaja afuera) · el domingo no se toca · manda la primera marca (por hora, no por llegada) · vacío = el mismo de adentro · normalización y validadores · barridos de rutas, motor, planilla y pantalla · el PUT (guarda, conserva, rechaza, y sin migración lo dice).
- `asistencia-correcciones.test.ts` cambió con nota fechada: el `select` de las dos rutas ganó `dispositivo`.
- Verificación por mutación: `scripts/_mutar-candados-horario-configurable.sh` — **18 mutaciones, 18 cazadas, 2 controles en verde**.

### Lo que NO se hizo

- No se corrió la migración ni se escribió nada en producción; no se cambió ningún horario guardado (los 18:30 de Multifashion ya estaban).
- No hay recargo de sábado, ni tope de 48 h semanales, ni almuerzo de afuera (el de la fila vale para los dos horarios).
- ~~No se tocaron `periodo.ts`, `prorrateo-ingreso.ts` ni `dia-libre-empresa.ts`: siguen contando lunes a viernes.~~ → hecho esa misma tarde (sección de arriba).
- ~~No se decidió el 12-sep: es de Daniel.~~ → Daniel cargó el feriado global **12-sep-2026 «Fiesta Judia»** y las cuatro ausencias desaparecieron solas (medido, sección de arriba).

---

## 🔴 Encontrar rápido los días a revisar (18-sep-2026) — el número lleva al día

### Qué decidió Daniel

Se le mostró un mockup con cuatro cuadros —lo de hoy, la opción A (el número
como enlace), la opción B (tres botones que parten la columna) y las dos
juntas—. Eligió, textual:

> «opcion a con mockup»

> «si y nada más el botón de "Solo a revisar"»

O sea **dos cosas, y nada más que esas dos**:

1. **El número de la columna «A revisar» es un enlace.** Se toca y se abre a esa
   persona con SOLO esos días.
2. **Un botón «Solo a revisar»** al lado del buscador, que deja en la tabla
   únicamente a quien tiene algo.

🔴 **Lo que NO se hizo, y es una decisión, no un olvido**: partir la columna en
«marcó de más» y «le falta una marca». Era la opción B del mockup, se le ofreció
con sus números medidos y dijo que no. Hay un candado que lo sostiene, para que
nadie lo agregue «de paso» dentro de seis meses.

### 🩸 El problema

El número de la columna era **muerto**: decía cuántos días había que revisar y
no decía cuáles. Para trabajar la quincena había que entrar a la ficha de cada
colaborador con algo y recorrer sus once días, uno por uno.

### Lo medido, contra producción

El encargo traía la medición del 18-sep-2026 por la mañana, quincena 1–15 sep:
**426 días-persona con marca, 82 a revisar, en 34 colaboradores de 45**.

Se volvió a medir con el motor real esa misma tarde
(`scripts/_medir-solo-a-revisar.ts`, solo lectura) y **da distinto, con causa
conocida**:

| | encargo (mañana) | remedido (tarde) |
|---|---|---|
| colaboradores en el reporte | 45 | **46** |
| días-persona con marca | 426 | **433** |
| **días a revisar** | 82 | **57** |
| colaboradores con algo | 34 | **26** |

🔑 **La caída de 82 a 57 la explica un cambio de ESTA MISMA MAÑANA**, no este:
la marca repetida que se olvida sola (commit `6cda3a81`, ver el bloque de abajo
de este archivo). `revisar` se cuenta **después** de olvidar la repetida
(`reporte.ts`: `!enCurso && buenas.length !== 4`), así que un día de 5 marcas
con una repetida dejó de estar a revisar. El script imprime el número con la
regla vieja para que se pueda comprobar: **66**. Los que faltan para los 82 son
cohorte —quién entra al reporte y qué se cuenta como «día con marca»—, y
ninguno de los dos números depende de este cambio.

⚠️ **Y la base se mueve mientras se mide**: dos corridas separadas por dos
minutos dieron neto 11.497,90 y 11.471,70. Alguien estaba trabajando en
producción (una aprobación o una corrección). Dos corridas seguidas después
dieron **exactamente el mismo** número, que es la huella que vale.

### 🔴 Ningún número de plata cambió

El cambio es de PANTALLA y no toca el motor: del código de producción se movió
**un solo archivo**, `src/app/asistencia/ReporteTab.tsx` (un componente de
cliente), más un módulo puro nuevo. `reporte.ts`, `planilla.ts`, las rutas del
API y todo lo que calcula quedan byte a byte iguales.

Medido igual, por si acaso: **46 líneas de planilla, neto total 11.471,70**, con
la huella persona por persona en el script. Lo que sí cambia —a propósito— es el
**pie del Reporte**, que ahora se suma sobre lo que se ve:

| | colaboradores | ausencias | min tarde | no trabajado | extras | a revisar |
|---|---|---|---|---|---|---|
| filtro apagado | 46 | 81 | 5.279,40 | 7.889,73 | 16.401,92 | **57** |
| filtro prendido | 26 | 56 | 4.819,52 | 6.729,03 | 10.570,75 | **57** |

🔑 «A revisar» da igual en los dos: quien no tenía nada aportaba cero. Las otras
cuatro columnas bajan, y **tienen que bajar** — es la regla.

### 🔴 Cómo está construido

Todo lo que decide vive en un módulo PURO, `src/lib/asistencia/solo-a-revisar.ts`
(sin base, sin red, sin `new Date()`, sin un solo número de plata).

**1. La regla no se inventa acá.** Qué es «a revisar» lo decide el motor y nada
más: `revisar` por día y `resumen.diasARevisar` por persona. El filtro de filas
usa `resumen.diasARevisar > 0` —la MISMA cuenta que dibuja la columna, para que
no pueda haber una fila que el filtro esconda y la columna muestre en ámbar— y
el recorte de días usa `d.revisar`. El script de medición comprueba que las dos
cuentas dan lo mismo (26 personas por las dos vías, 57 días por las dos vías).

**2. 🔴 El total sigue al filtro.** Es la regla escrita de la casa
(`lib/buscar-en-lista.ts`): *«o el total sigue al filtro, o no hay buscador»*.
El pie se suma sobre `visibles`, el «N colaboradores» del pie cuenta `visibles`,
y al lado del botón se dice **«26 de 46 colaboradores»** para que el total
recortado no se lea como el de todos.

**3. 🔴 El filtro va en la URL con `replace`, nunca `push`.** Dos parámetros:
`?revisar=1` (el botón) y `?diasDe=<código>` (qué fila está abierta mostrando
solo sus días). Son filtros del MISMO nivel —como `?desde=`, `?buscar=` y
`?empresa=`—, así que el Atrás del navegador no cicla por ellos. Solo `"1"`
prende el filtro: un `0` en la URL lo deja apagado.

**4. 🔴 Una sola forma de llegar al día.** El enlace del número se arma **sobre**
`enlaceDiasDe` (`marcas-impares.ts`), la misma dirección que ya usan «Ver sus
días ›» de la ficha y el aviso «Antes de cerrar» de la Planilla. Lo único propio
es el `&diasDe=`. Queda así:

```
/asistencia?tab=asistencia&q=43&desde=2026-09-01&hasta=2026-09-15&diasDe=43
```

Es un `<a>` de verdad —se copia, se abre en otra pestaña con Cmd, y un enlace
compartido llega con la persona ya abierta en sus días—, y el clic normal lo
resuelve en el acto, sin recargar la pantalla.

**5. 🔴 Con 0 días a revisar no hay enlace**: va el guion de siempre. Un enlace
que abre una lista vacía es peor que no tenerlo.

**6. El detalle recortado se DICE, y se suelta sin un control nuevo.** Una fila
abierta con 3 de 11 días lleva una línea gris: «Solo los 3 días a revisar, de 11
del período. Toca la fila para verlos todos.» Tocar la fila la abre entera —era
lo que ya hacía—, así que no hizo falta inventar un botón. ⚠️ Cuando **todos**
los días de la persona son a revisar no se dice nada: no se recortó nada.

**7. Apagar el filtro suelta la fila recortada.** Dejar una fila mostrando 3 de
11 días bajo un filtro apagado sería mentir con la pantalla.

**8. El vacío se dice con palabras**: «Nadie tiene días a revisar en este
período», con «Ver a todos» al lado. Nunca una tabla en blanco.

### ⚠️ El Excel y el PDF — decidido a propósito

La regla de la casa es *«lo que sale de la pantalla nunca se recorta, salvo un
botón que DIGA a cuántos afecta»*. Acá se eligió la excepción, por dos razones:

- **Ya era así.** El buscador de esta pestaña filtra en el **SERVIDOR** (`?q=`),
  así que con un nombre escrito el Excel y el PDF ya bajaban recortados. Un
  botón que se portara distinto haría que la pantalla dijera 26 y el archivo 46.
- **Y el botón lo dice**: con el filtro prendido se llaman **«Excel · 26»** y
  **«PDF · 26»**; apagados, «Excel» y «PDF» como siempre.

Dos candados lo sostienen: el rótulo (`rotuloDescarga`) y el contenido (los dos
generadores reciben exactamente las 2 personas visibles del fixture, no las 3).

⚠️ **Dos candados cambiaron de dirección, con nota fechada**:
`asistencia-config.test.ts` y `peso-muerto-js.test.ts` exigían el literal
`construirExcel({ personas, desde, hasta, reglas`; ahora exigen
`construirExcel({ personas: visibles, …`. Lo que sostienen no cambió —mismo
motor, mismas reglas—; lo que cambió es cuántas filas se le mandan.

### Candados

`src/__tests__/components/asistencia-solo-a-revisar.test.tsx` — **30 casos**.
Se renderiza la pestaña de verdad, porque que `soloConDiasARevisar` devuelva dos
personas no prueba que el pie sume sobre esas dos, ni que el filtro se escriba
con `replace`, ni que la fila sin días muestre un guion en vez de un enlace.

**Verificado por mutación**: `scripts/_mutar-candados-solo-a-revisar.sh` —
**18 mutaciones, 18 cazadas**, 2 controles en verde, 0 corridas muertas.
Entre ellas las tres obligatorias del encargo: el pie sumando la lista entera
sobre una tabla recortada, el filtro pasado a `push`, y el guion convertido en
un enlace a ningún día.

### Medición

`scripts/_medir-solo-a-revisar.ts` (solo lectura):

```
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
  scripts/_medir-solo-a-revisar.ts 2026-09-1
```

---

## 🔴 La marca repetida se olvida sola (18-sep-2026) — «1 minuto»

### Qué decidió Daniel

> «quiero que el sistema agarre la primera marcación y olvide la próxima si es en x cantidad de
> tiempo (esa x la quiero definir contigo)»

Y después de ver la medición por umbral (1 s · 2 s · 30 s · 60 s · 5 min): **«1 minuto»**.

O sea: dentro del MISMO día, una marca que llega a **60 segundos o menos de la última que cuenta**
NO CUENTA. Se conserva la PRIMERA. Automático, sin que nadie toque nada.

### 🩸 El caso

El motor mide el almuerzo entre la 2.ª y la 3.ª marca. Cuando el dedo toca dos veces al entrar, la
2.ª marca deja de ser la salida a almorzar:

```
Ramón Miranda (21) · 3-ago-2026        REAL
   07:58:36   entrada                   entrada      07:58:36
   07:58:37   ← repetida, 1 s después   almuerzo     13:55:43 → 14:22:04 = 26 min
   13:55:43                             salida       17:10:43
   14:22:04
   17:10:43
```

Para el Reporte ese día almorzó **5 h 57 min**: 327 minutos de «exceso de almuerzo» en la pantalla
y en el Excel que se descarga, y el día en ámbar frenando el cierre.

### ⚠️ Lo que el encargo decía y NO era así: el neto de la planilla no se movía

El encargo llegó como *«hoy se descuenta de más: 17 días, $205,50 mal descontados»*. **Medido: el
exceso de almuerzo NO entra al dinero de la planilla.** `planilla.ts` no lee `excesoAlmuerzoMin`
en ningún lado (ya estaba escrito en este mismo archivo, en el bloque del 16-sep: *«no es un
concepto de la planilla —solo entra a `tiempoNoTrabajadoMin`, el número que se MIRA en el
Reporte—»*). Lo que la marca repetida rompía era **lo que se muestra y se descarga** (columna
«Exceso almuerzo» y «Tiempo no trabajado» del Reporte), y **el freno del cierre** (día de 5 marcas).
Si la contadora descontó a mano a partir de ese Excel, eso pasó fuera del sistema y no se puede
saber desde aquí — queda como decisión de Daniel en `docs/pendientes-vivos.md`.

Los $205,50 del encargo se reproducen **sobre las marcas crudas del reloj** (sin correcciones):
`scripts/_medir-marca-repetida.ts --sin-correcciones` da los mismos **107 marcas olvidadas y 50
días que siguen con más de 4** a 60 s. La diferencia con lo medido «de verdad» es que **la contadora
cerró HOY las tres planillas de 16–30 ago (Fashion Wear, Boston y Vistana, entre 16:38 y 17:09 UTC)
y antes quitó marcas a mano**: aplicadas las correcciones —que es como trabaja el motor— quedan
**1.959 días-persona, 1.644 con exactamente 4, 98 con más de 4, 193 impares**.

### La medición, con las correcciones aplicadas (1-jun → 17-sep, solo lectura)

| umbral | marcas que se olvidan | días de +4 que quedan en 4 | siguen con +4 | almuerzos que cambian |
|---|---|---|---|---|
| 1 s | 27 | 20 | 78 | 16 |
| 2 s | 44 | 31 | 67 | 20 |
| 30 s | 69 | 45 | 53 | 24 |
| **60 s** | **78** | **53** | **45** | **26** |
| 5 min | 103 | 71 | 27 | 31 |

A 60 s cambian **26 almuerzos**: 20 grandes (de 64 a 363 minutos de exceso que desaparecen: Ramón
Miranda 3-ago, 8-jul y 23-jul · Andrea Pérez 20-jul y 23-jul · Yeishka Diaz 11-sep · Yeritza Solís
5-ago y 29-jul · Laura Casiano 28-jul y 14-ago · Martha Chavarría 2-jul y 21-jul · Kenner Hernández
20-jul · Eloyn Mendoza 1-sep · Esmer Cruz 8-sep (07:32:56 → 07:33:56, **60 s exactos**) · Briceida
Montero 10-sep · Jorman Hernández 15-sep · Cristiam Blanco 24-ago · Martha 16-sep) y 6 chicos en
sentido contrario (de 0 a entre 0,37 y 6,65 minutos: el doble toque era al salir a almorzar y el
almuerzo se medía de un segundo). Al valor del minuto de cada uno son **$242,31** de «exceso» que
el Reporte mostraba y ya no muestra — repartidos **$25,41 en 1–15 jul · $97,06 en 16–31 jul ·
$43,58 en 1–15 ago · $3,24 en 16–30 ago · $72,79 en 1–15 sep · $0,23 en 16–30 sep**.

- **Días «a revisar»** (terminados, sin exactamente 4 marcas): **314 → 272**. Los 45 días que
  siguen con más de 4 no tienen ningún par a 60 s: piden ojo humano igual que antes.
- **Solo uno tiene una justificación encima**: Cristiam Blanco, 24-ago, permiso de 08:00 a 11:06 —
  no perdona el almuerzo, y ese día queda en 3 marcas y a revisar (antes parecía completo).
- **Quincenas cerradas EN EL SISTEMA**: solo Boston 16–30 ago (cerrada hoy), $3,24. Lo pagado por
  la contadora con su Excel (todo lo anterior al 1-sep) suma $169,29 de los $242,31.

### 🔴 Lo que SÍ se mueve además del almuerzo, y por qué

Cuando el doble toque es a la **SALIDA**, conservar la primera corre la salida hasta 60 s antes:
la hora extra baja **segundos**. Es consecuencia directa de «agarre la primera», no un error del
motor. `scripts/_medir-vs-yulissa.ts` antes y después:

- **16–30 ago: 0 diferencias** en 46 líneas (neto $11.455,42 = $11.455,42).
- **1–15 sep (corte 10): 1 línea por la regla.** Sheynee Batista (304, Multifashion), 4-sep: la
  salida 19:04:25 era un segundo toque 9 s después de 19:04:16 → extra 1.143,65 → 1.143,50 min,
  bruto −$0,01, seguro social −$0,01, **neto igual**. (Rodrigo Miranda aparece con
  `otrosServicios` 0 → 194,13: lo escribió Contabilidad a las 17:28:53 UTC, entre las dos
  corridas; no es de esto.)
- En todo el rango desde junio, 23 días mueven la salida entre 1 y 58 s (el mayor: Rodrigo Miranda
  24-jul, 16:57:14 → 16:56:16, un minuto de extra). Y dos días de Daniel Levy (52, inactivo) de DOS
  marcas a menos de un minuto quedan con UNA: entrada conocida, salida no — que es la verdad.

### Lo que se construyó

**1. Un módulo PURO: `src/lib/asistencia/marca-repetida.ts`.** `SEGUNDOS_MARCA_REPETIDA = 60`, el
número en UN solo lugar (el motor y el Excel lo importan). `olvidarRepetidas(segundos)` parte las
marcas de un día en `buenas` y `olvidadas`; se compara contra la **última que CUENTA** —una
repetida no estira la ventana: 08:00:00 · 08:00:50 · 08:01:40 deja la primera y la tercera— y
**60 s exactos se olvidan, 61 no**. Los textos (`explicacionRepetida`, `textoTodasLasMarcasConRepetidas`,
`avisoRepetidas`) viven ahí para que pantalla y Excel digan lo mismo.

**2. El motor la aplica al LEER (`reporte.ts`),** por día de Panamá, sobre las marcas que YA
QUEDARON después de las correcciones (una quitada a mano ya no está; una corregida entra con su
hora nueva). De ahí para abajo todo se calcula sobre `buenas`: entrada, salida, almuerzo, extra,
`revisar` y `salidaSospechosa`. Las olvidadas viajan en **`DiaReporte.repetidas`** (hora, la marca
que la hizo repetida, segundos después, `id`) y el resumen las cuenta (`marcasRepetidas`). En un día
de vacaciones o fuera de vigencia no se calcula nada y las marcas se muestran tal cual.

🔴 **`asistencia_marcaciones` no se toca.** Ni un update, delete ni upsert: la fila sigue ahí, con
su `id` en `repetidas`. Igual que una corrección, se descarta al leer.

**3. Se VE.** En la pestaña Asistencia, debajo del día: «Marca **repetida**: ~~07:58:37~~ —
repetida, 1 s después de 07:58:36 — no cuenta», en gris (nadie la tocó a mano: no va en azul como
una corrección). Arriba de la tabla: «N marcaciones repetidas del reloj se olvidaron solas (a 60 s o
menos de la anterior) — se ven tachadas en su día y no cuentan para nada». En el Excel, «Todas las
marcas» la lleva en su lugar por hora como «07:58:37 (repetida, no cuenta)», «Cuántas marcas»
cuenta las que cuentan (4), las cuatro columnas de siempre llevan las buenas y la hoja «Cómo se
calcula» la explica.

**4. El freno del cierre cuenta DESPUÉS de olvidar.** `marcasMalContadas` no cambió; lo que cambió
es que `d.marcas` ya no trae la repetida. Un día de 5 con una repetida deja de frenar; uno de 5 sin
repetida sigue frenando.

### Candados

`src/__tests__/lib/asistencia-marca-repetida.test.ts` (23 casos: la regla, el motor, el Excel, el
freno, y que nada escribe en la base) · `src/__tests__/components/asistencia-marca-repetida.test.tsx`
(3 casos: lo que ve la contadora). Cambiaron de dirección con nota fechada: `marcas-impares.test.ts`
y `asistencia-cinco-arreglos.test.tsx` (`revisar` se cuenta sobre `buenas`).

**Verificado por mutación:** `scripts/_mutar-candados-marca-repetida.sh` — **15 mutaciones, 15
cazadas**, 0 corridas muertas, **2 de 2 controles en verde** (apagar la regla · 59 y 61 · «menos
que» en vez de «o menos» · conservar la última · comparar contra la anterior a secas · el motor la
ignora · el freno sobre las crudas · olvidar en silencio · el resumen en cero · el Excel la esconde
· la guía no la explica · la pantalla no la tacha · sin aviso arriba · la celda sin «no cuenta»).
🩸 El script trae un arreglo que los anteriores no tienen: `grep` sin `-q`. Con `set -o pipefail`,
`grep -q` cierra el tubo al encontrar «Test Files» y el `echo` de una salida grande (vitest imprime
el archivo entero cuando falla un `toContain` sobre la fuente) muere por SIGPIPE: una mutación
cazada se leía como «corrida muerta». Pasó con la 8.

### Lo que NO se hizo

- No se reabrió ninguna planilla ni se escribió una sola fila en producción.
- No se tocó la línea del reloj del teléfono (`senalarQuitadas`): una marca del teléfono repetida
  se tacha en la fila del día, no en la línea «envió…».
- No se cambió el umbral de «pegadas» (5 min, ámbar, solo aviso): sigue señalando la que queda
  entre 61 s y 5 min, para que la quiten a mano.
- No se adivina cuál sobra cuando el par está a más de 60 s: siguen frenando el cierre.

---

## 🔴 Ver y quitar las marcaciones de MÁS (18-sep-2026) — lo que frenaba el cierre

### Qué pasó

La contadora no podía cerrar la quincena. Lo dijo por WhatsApp el 17-sep-2026, textual:

> «el motivo de que no me deja cerrar es porque hay marcaciones de mas y no me deja eliminar»

Daniel aclaró de cuáles hablaba: *«las marcaciones del reloj, no las del app que hicimos»*. Y al
día siguiente, mirando el archivo que se descarga:

> «y como veo quien marco de mas? en el excel solo salen max 4 marcaciones el excel que descargo»

Eran **dos problemas encadenados, y el primero era peor**.

### 🩸 Problema 1 — la quinta marca no se veía EN NINGÚN LADO

La pantalla (`ReporteTab.tsx`) dibujaba exactamente cuatro horas y las elegía **por índice**:

```tsx
<Hora idx={0}      mostrar={d.marcas.length > 0} />
<Hora idx={1}      mostrar={d.marcas.length >= 4} tenue />
<Hora idx={2}      mostrar={d.marcas.length >= 4} tenue />
<Hora idx={ultima} mostrar={d.marcas.length > 1} />
```

El Excel (`exportar.ts`) hacía lo mismo, con columnas fijas *Entrada · Sale almuerzo · Vuelve ·
Salida*. O sea: **un día de 5 marcas mostraba la 1.ª, la 2.ª, la 3.ª y la 5.ª. La CUARTA —que
suele ser justo la repetida— era invisible.** Y con 3 marcas se perdía la del medio, por la misma
cuenta. Ella veía un día en ámbar con cuatro horas que se ven normales y no tenía cómo saber cuál
sobraba.

Casos reales (`scripts/_medir-marcas-de-mas.ts`, solo lectura):

```
Ramón Miranda (21) · 26-ago       Alejandra Camaño (22) · 9-sep
   08:10:21                          07:59:20
   13:58:34                          13:03:44
   14:23:38  ←  se veía               13:33:07  ←  se veía
   14:23:39  ←  NO se veía            13:33:58  ←  NO se veía
   18:00:50                          16:58:25
```

### 🩸 Problema 2 — no había cómo quitarla

`CorregirMarcacionModal.tsx` tenía **dos casos y nada más**, escrito en su propia cabecera:
corregir una hora que el reloj sí registró, y AGREGAR una que nunca registró. Y
`POST /api/asistencia/correcciones` **no aceptaba `quita`**: la palabra no aparecía ni una vez.

🔑 **La capacidad EXISTÍA, pero por otra puerta y solo para el teléfono.**
`asistencia_correcciones.quita` nació el 14-sep-2026 con el «Deshacer» de dos minutos del reloj del
celular, y lo escribe `/api/marcacion/deshacer`, que la pantalla de ella no puede llamar. Resultado:
**una marca del reloj físico no se podía quitar de ninguna forma.**

⚠️ La migración `20261128120000_marcacion_deshacer.sql` dice en su encabezado «SIN APLICAR» y
**eso estaba viejo**: verificado contra producción el 18-sep-2026, la columna `quita` existe y el
CHECK está puesto. El botón nuevo funciona hoy, sin correr nada.

### Lo medido, antes de tocar nada

`scripts/_medir-marcas-de-mas.ts`, ventana **19-ago → 17-sep**, 3.248 marcaciones, **840
días-persona con marca**:

| marcas en el día | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| días | 9 | 48 | 49 | **679** | 50 | 5 |

- **679 de 840 (80,8 %) tienen exactamente 4** y se ven IGUAL que antes.
- **55 con 5 o más** (50 de cinco, 5 de seis, ninguno de siete), repartidos en **28 colaboradores**:
  Yeishka Irene Diaz Markham (54) con 8 días, Martha Asucena Chavarria (43) con 5, Laura Lismari
  Casiano Vega (38) con 4, Rodrigo Miranda (13) y Julio Guzmán (11) con 3.
- **108 impares** con la regla que había hasta hoy.
- **47 de los 55** tienen dos marcas a menos de 5 minutos una de otra; **27 a 3 segundos o menos**
  (el dedo doble en el reloj). Los **8** que quedan no tienen ningún par cercano y piden ojo humano.

### 🔴 La regla del cierre CAMBIÓ DE DIRECCIÓN: impar **o** más de 4

Daniel, el 18-sep-2026, textual:

> «osea las quincena solo cierran con 4, hay q quitar hasta que llegue a 4 maximo. cuando hay 5 o
> mas es porq es error. quiero saber todos los que marcaron 5 veces last 30 days y si marcan 5 o
> mas poder quitarlas»

🩸 `marcas-impares.ts` decía lo contrario, y con todas las letras: *«LA REGLA ES IMPAR, PUNTO — Y 6
ES PAR, ASÍ QUE NO LA ATRAPA. Esto NO es un olvido y no hay que “arreglarlo”: un día de 6 marcas
puede ser perfectamente correcto (entró, almorzó, salió a un mandado y volvió)»*. **Ese párrafo se
conserva entero en el archivo**, con la nota fechada al lado explicando por qué se dio vuelta — y
lo mismo en su candado (`marcas-impares.test.ts`), donde la prueba «6 marcas: NO entra» pasó a «6
marcas: SÍ entra».

La pregunta vive ahora en **una sola función**, `marcasMalContadas(n)` = `n % 2 === 1 || n > 4`, y
el 4 se DERIVA de `MARCAS_NORMALES` (`marcas-del-dia.ts`): `MARCAS_MAXIMO = MARCAS_NORMALES`. Dos
cuatros separados dejarían dibujar un día completo y frenar el cierre igual.

🔑 **Esto no contradice el «no adivinar» del 15-sep.** No se adivina cuál marca sobra —eso lo sigue
decidiendo una persona, quitándola a mano—: se dice que un día con más de 4 no se cierra sin
mirarlo. Y desde hoy hay con qué. **El par de 2 sigue pasando**, deliberadamente (el caso de Andrea
Pérez, 1-sep: con dos marcas no se puede PROBAR que falte una).

🩸 Y la pantalla ya prometía esta regla: *«"A revisar" es un día TERMINADO sin las 4 marcas»*
estaba escrito desde siempre, y `revisar` en `reporte.ts` es `crudas.length !== 4`. **El freno del
cierre era el único de los tres que decía otra cosa.** Los textos se afinaron a «que no tiene
EXACTAMENTE 4 marcas —le falta alguna, o marcó de más—», en pantalla y en la hoja «Guía» del Excel,
porque «sin las 4» se leía como «le faltan».

### Lo que se construyó

**1. Un módulo PURO nuevo: `src/lib/asistencia/marcas-del-dia.ts`.** Dice qué se dibuja y nada más.

- `columnasClasicas(n)` es EXACTAMENTE la cuenta que la pantalla hacía a mano, escrita en un solo
  lugar para poder preguntarle qué esconde. Con 4 devuelve `[0,1,2,3]`: la fila se dibuja idéntica.
- `marcasEscondidas(n)`: `[]` con 0, 1, 2 y 4; `[1]` con 3; `[3]` con 5; `[3,4]` con 6.
- `marcasPegadas(marcas)` señala la marca que quedó a menos de **`SEGUNDOS_PEGADAS = 300`** de la
  anterior.

🔑 **Los 5 minutos no son un número redondo elegido a ojo.** Son el error REAL de Daniel, medido
por él mismo el 14-sep-2026 al probar el reloj del teléfono: *marcó la SALIDA cinco minutos después
de la entrada, por error de dedo* (ver el encabezado de `20261128120000_marcacion_deshacer.sql`).
Y contra los datos: de los 55 días de más de 4 marcas, con ≤3 s se señalan 27, con ≤2 min 40 y con
**≤5 min, 47**; a 10 minutos ya empieza a marcar salidas cortas que pueden ser de verdad.

🔴 **Es un aviso para el OJO, nunca una regla**: la marca pegada no se quita sola, no cambia un
minuto y no frena nada.

**2. La pantalla muestra TODAS las marcas.** Si entran en las cuatro columnas —el 80,8 % de los
días— se dibujan las cuatro columnas de siempre, sin un pixel de diferencia. Si no entran, las
cuatro celdas se vuelven UNA (`colSpan={4}`) con todas las horas en orden, cada una tocable, el
rótulo «5 marcas» adelante y la pegada en ámbar con su título («Marcó otra vez 1 segundo después.
Si sobra, quítala con “Quitar esta marcación”»).

> 🔄 **Ese párrafo quedó viejo el MISMO día, dos veces.** Fundir celdas rompía la grilla y Daniel lo
> corrigió con la captura en la mano —*«no está en su columna, se ve desordenado»* y *«y aun se ve
> desordenado»*—: hoy **las cuatro columnas se dibujan SIEMPRE** y lo que no entra baja a **su
> propia línea** debajo del día, con las horas como botones. Y esa línea, más tarde, dejó de
> nombrar cuál sobra: ver la sección de abajo.

**3. El Excel dice quién marcó de más.** Dos columnas NUEVAS, **H «Todas las marcas»** e **I
«Cuántas marcas»**, insertadas justo al lado de las horas.

⚠️ **Las cuatro de siempre no se movieron ni cambiaron de contenido**: siguen en D, E, F y G, que es
como ella las lee. Las posiciones están escritas como constantes exportadas (`COL_ENTRADA`,
`COL_SALIDA`, `COL_TODAS_LAS_MARCAS`, `COL_CUANTAS_MARCAS`) y el candado las comprueba una por una.
«Cuántas marcas» va como NÚMERO, no texto: con el filtro de la fila 1 se piden «5 o más» en dos
clics. El PDF no lleva las marcas (solo el resumen), así que no cambió.

**4. La tercera opción: «Quitar esta marcación».** Al lado de «Corregir la hora», en la misma
ventana, y solo donde tiene sentido: hace falta una marcación DEL RELOJ sin corrección viva (no se
ofrece al agregar, ni sobre una ya corregida — ésa primero se deshace).

🔴 **NO BORRA NADA.** `asistencia_marcaciones` es append-only y hay barrido estático que lo exige.
Quitar es escribir ENCIMA una corrección con `quita = true` — la misma tabla y el mismo mecanismo
que usa el teléfono todos los días—, con el porqué obligatorio, la firma de quien la quitó y su
`anulada_en` para deshacerla. El servidor **exige `marcacionId`** (400 si falta: no se quita una
marcación que no existe) y la persona y el día salen de la MARCACIÓN, nunca del navegador. Mismos
roles que corregir una hora: no se inventó ninguna lista.

**5. Lo quitado se VE y se cuenta.** La fila de abajo dice «Marcación **quitada**: 14:23:39 — no
cuenta» (nunca «borrada»), el Excel escribe `QUITADA 14:23:39 (el reloj la registró; no cuenta)` y
el aviso azul de arriba suma «— 1 es una marcación quitada». Y deja de contar para `revisar` y para
el freno del cierre solo: `aplicarCorrecciones` la saca de la lista efectiva antes de que el motor
la mire.

### La medición, antes y después

- **Ningún neto se movió.** `scripts/_medir-vs-yulissa.ts 2026-09-1 --corte=2026-09-10`, las 46
  líneas, **byte a byte idénticas** antes y después (neto del período: **$11.519,07**). Es una
  puerta nueva y una columna nueva, no un cambio de cálculo.
- **La simulación de quitar** (`scripts/_simular-quitar-marcacion.ts 21 2026-08-26 14:23:39`, solo
  lectura, no escribe nada): el día de Ramón Miranda pasa de 5 marcas a 4, entra en las cuatro
  columnas y **deja de frenar el cierre**. La tabla sigue con sus 5 filas.

### Candados

`src/__tests__/lib/asistencia-marcas-de-mas.test.ts` (32 casos) ·
`src/__tests__/components/asistencia-marcas-de-mas.test.tsx` (12 casos).

Cambiaron de dirección, con nota fechada: `marcas-impares.test.ts` (el 6 ahora entra) ·
`asistencia-corregir-hora.test.ts` (la ventana tiene tres formas) · `asistencia-poda-textos.test.tsx`
(el ⓘ dice «EXACTAMENTE 4»).

**Verificado por mutación:** `scripts/_mutar-candados-marcas-de-mas.sh` — **16 mutaciones, 16
cazadas**, 0 corridas muertas, **2 de 2 controles en verde**.

### Lo que NO se hizo

- No se tocó el motor: la última marca sigue siendo la salida y el almuerzo sigue entre la 2.ª y la
  3.ª (`reporte.ts`, regla 5).
- No se quita ninguna marca sola, ni se sugiere cuál. El sistema señala; decide la persona.
- No se corrió ninguna migración ni se escribió una sola fila en producción.

---

## 🔴 La línea de «más de 4 marcas» dejó de nombrar cuál sobra (18-sep-2026)

### 🩸 Qué costó

La línea decía **«Marca de más: 13:28:13»**. Esa hora no era un diagnóstico: era la marca que
quedaba fuera de las cuatro columnas **por POSICIÓN** (`marcasEscondidas` cuenta índices), sin
mirar el reloj ni un segundo. El rótulo la leía como si fuera un veredicto.

El día de **Enrique Sánchez, 7-sep-2026**, la que sobraba era la **11:17:58** —el doble de la
entrada—, no la 13:28:13 que la línea señalaba. **La contadora leyó la línea, quitó la 13:28:13, y
el día quedó igual de mal**: el sistema le sigue leyendo un almuerzo de 112 minutos, con 82 de
exceso.

### Qué decidió Daniel

> «no quiero que me recomiende cuál quitar, sino como está, que me diga abajo las otras marcaciones
> y la contable decide cómo arreglarlo»

### Cómo quedó

| Marcas | Decía | Dice |
|---|---|---|
| 5 | `Marca de más: 16:37:50 — el día tiene 5, y son 4` | `El día tiene 5 marcas, y son 4 — quita la que sobra:` + la hora |
| 6 | `Marcas de más: … — el día tiene 6, y son 4` | `El día tiene 6 marcas, y son 4 — quita las que sobren:` + las horas |
| 3 | `Otra marca del día: … — le falta una marca, así que no se sabe si ésta es la salida a almorzar o el regreso` | **IGUAL** |
| 4 | no se dibuja | igual |

- La frase entera vive ahora en el **rótulo** (`rotuloMarcasSueltas`) y la **nota**
  (`notaMarcasSueltas`) va vacía con 5 o más. Las dos funciones se conservan —y su llamada en la
  pantalla— porque con MENOS de 4 sí hay algo que decir, y porque son las que dejan la hora **en el
  medio**.
- 🔴 **Las horas siguen siendo BOTONES**: se borró media frase, no el botón. De ahí se abre
  «Corregir o quitar esta marcación», que es lo único que arregla el día.
- 🔴 **Con 3 marcas el texto NO se tocó.** Ahí la afirmación SÍ es verdad: falta una, y la del medio
  es la única que puede ser la salida a almorzar o el regreso.
- El plural sale de **cuántas sobran**, no del día (5 → «la que sobra», 6 → «las que sobren»), y el
  **4 de la frase se deriva de `MARCAS_NORMALES`**: no hay un segundo cuatro tecleado.

### 🔴 Ningún número se movió

Es TEXTO. El motor sigue leyendo la última marca como la salida y el almuerzo entre la 2.ª y la
3.ª; `revisar`, el freno del cierre (`marcasMalContadas`), el Excel y la tabla quedaron **idénticos
al pixel**.

### Candados

`src/__tests__/lib/asistencia-marcas-de-mas.test.ts` — el texto de 5, 6 y 3 letra por letra, que
ningún texto de la línea diga «marca de más», el plural por cuántas sobran y el 4 derivado ·
`src/__tests__/components/asistencia-marcas-de-mas.test.tsx` — la línea dibujada, con la hora
todavía como `<button>` y el caso de 3 marcas como control.

**Verificado por mutación** junto con el otro cambio de texto del día:
`scripts/_mutar-candados-una-palabra-y-la-linea.sh` — **12 mutaciones, 12 cazadas**, 0 corridas
muertas, **2 de 2 controles en verde**.

---

## 🔴 Las vacaciones calculadas solas (17-sep-2026) — «Le corresponden N días»

### Qué pidió Daniel

> *«las vacaciones no funciona por día, hay que cambiar eso, funciona que por cada 11 meses trabajado, 1 mes de vacaciones»*

> *«1. Un mes son 30 días corridos. 2. La fecha de ingreso que tiene la ficha. 3. [las ya tomadas] lo vemos después»*

> *«Quita lo del saldo vacaciones»*

### 🩸 Qué reemplaza, y por qué se fue

Hasta hoy el número salía de un **SALDO INICIAL** que contabilidad escribía a mano en la ficha, con su **fecha de corte** (`saldo_vacaciones_dias` y `saldo_vacaciones_corte`, migración `20260826040000`). La idea era buena —contabilidad tiene el número en sus registros, y pedirle que reconstruya siete años no lo haría nadie— y **en la práctica no la usó nadie**.

**Medido el 17-sep-2026 contra producción:** de las **49** fichas, **ninguna** tiene un número cargado — 47 con las dos columnas vacías y **2 con un 0** (Andrea Perez, código 16, corte 26-ago; Luis Adrián Arroyo, código 9, corte 2-sep), que es lo que queda cuando alguien guarda la ficha sin tocar el campo. O sea: la pantalla decía **«Falta el saldo» para todo el mundo**, y el dato que Daniel quería ver —cuántos días le tocan a alguien por su antigüedad— no se veía nunca.

### La regla, entera

- **30 días corridos por cada 11 MESES** trabajados desde `fecha_ingreso` (Código de Trabajo de Panamá, art. 54). Once, no doce.
- Cada bloque de 11 meses cumplidos suma 30 días enteros; el bloque **en curso** suma `30 ÷ 11 = 2,7272…` por mes cumplido y se **TRUNCA** a día entero. 🔑 Hacia abajo a propósito: un día de más es un día que alguien se va sin haberlo ganado, y eso después se paga en plata.
- Se le restan las vacaciones **registradas** en `asistencia_vacaciones` — las «ya pagadas» también restan (el derecho se consumió igual) y se cuentan **aparte**, para poder distinguir lo que descansó de lo que le pagaron.
- Los días son de **CALENDARIO**, domingos adentro: los 30 de la ley son un mes corrido. Descontar solo los hábiles sería comparar dos unidades distintas y regalarle ~8 días por mes tomado.
- 🔴 **Sin `fecha_ingreso` no sale un número. Ni cero.** Son **9 de las 49** fichas (medido): aparecen igual en la lista diciendo «Falta la fecha de ingreso», que además es la acción que hay que hacer.
- 🔑 **Puede dar NEGATIVO y se muestra negativo:** se adelantan vacaciones, y recortar a cero escondería justo el caso que hay que mirar.

### 🔴 NO ES UN SALDO, y ése es el punto

Las vacaciones solo existen en el sistema desde el 25-ago-2026, y los días se ganan desde el ingreso — hay fichas de 2019. Así que el número es *lo que le corresponde por antigüedad menos lo registrado acá*, y **nadie sabe qué se tomó antes**. Por eso:

- se lee **«Le corresponden N días»**, nunca «le quedan»;
- va **siempre** con la línea, en gris: *«No incluye vacaciones tomadas antes del 17 de septiembre de 2026»*;
- 🔴 **no entra a ningún cálculo de plata** —ni a la planilla ni a una liquidación—, y hay **barrido** que exige que ningún módulo que decide dinero lo importe y que el módulo mismo no nombre una rata, un salario ni `centavos()`.

🩸 Ya pasó una vez: en el PR #626 el número era «ganados desde que entró menos lo tomado», aritméticamente correcto e inútil — ANGELA GARCIA figuraba con **245 días disponibles**. Cierto, y peligroso. La diferencia con hoy no es la cuenta: es que el número **dice lo que es** y no se usa para pagar.

### El saldo a mano se RETIRA, no se dropea

Patrón `mayor_lineas`. Las dos columnas se quedan en `asistencia_personas`, **sin lectores ni escritores**, con su `COMMENT` (migración **`20261204120000`**, pendiente de aplicar). El candado pone el build ROJO si una migración las dropea **o si el código vuelve a nombrarlas** (barrido sobre `src/lib/asistencia`, `src/app/api/asistencia` y `src/app/asistencia`, sin comentarios).

Lo que se fue con ellas: el campo de la ficha (`FichaEditar` y `ConfiguracionTab`), su validación y su escritura en el PUT de `/api/asistencia/configuracion`, `datosSaldoDeFila` en `config-server.ts`, las dos columnas del `select`, y el faltante «saldo de vacaciones» de `que-le-falta.ts` — donde ahora manda la **fecha de ingreso**, que vale el doble.

### Medido

`scripts/_medir-vs-yulissa.ts` sobre 1–15 sep con corte 10-sep: **0 diferencias en 46 líneas**, $11.314,29 = $11.314,29. Era lo esperado —esto no toca plata— y se midió igual.

### Candados

`vacaciones-le-corresponden.test.ts` (28 casos, incluido el barrido de «nada de plata»). **15 mutaciones, 15 cazadas**, 2 controles en verde (`scripts/_mutar-candados-vacaciones-corresponden.sh`).

Cambiaron de dirección con nota fechada **y CONTROL**: `asistencia-falta-configurar` (B) · `asistencia-lista-que-falta` (7 y 9) · `tolerancia-ddl-retirada-asistencia` (1 y 7) · `persona-en-el-centro` (I) · `asistencia-colaboradores-no-personas` · `asistencia-pestana-fichas-y-26` · `vacaciones-el-motor-las-honra`. Dos se rehicieron enteros, con su historia en la cabecera: `asistencia-saldo-configuracion` → **`asistencia-vacaciones-sin-saldo-a-mano`** y `asistencia-vacaciones-saldo` → **`asistencia-vacaciones-corresponden`**.

### ⚠️ Lo que queda pendiente de Daniel

1. **Correr la migración `20261204120000`** (solo pone dos `COMMENT`; no cambia ningún dato).
2. **Las 9 fichas sin fecha de ingreso**: sin ella no hay número para esa gente.
3. **Las vacaciones tomadas antes del 17-sep-2026** (*«lo vemos después»*). Hasta que estén cargadas, el número **no se puede usar para pagar**.

---

## 🔴 El día libre de la empresa (17-sep-2026) — se paga completo y deja debiendo 8 horas

### Qué es, en palabras de Daniel

> *«en las fiestas judías hay días libres, dentro de las jornadas ordinarias, que son libres para el colaborador, pero se pagan con el tiempo de horas extra»*

> *«se le paga ese día pero deben las horas laborales (8 horas para todos)»*

> *«debe de ser el dólares pienso, porque no todas las horas valen igual, 8 horas de trabajo normal no son lo mismo que hora extra»*

> *«queda debiendo para la próxima quincena hasta cancelar la deuda de horas»*

> *«A ése [al que sí trabaja ese día] se le paga normal»* · *«[si se va debiendo, se le descuenta de la liquidación] no»* · *«arrastra para siempre hasta que haga horas extra»*

> *«contabilidad y admin [lo cargan] y sí, a todos los colaboradores de esa empresa»* · *«se carga cuando haya ese día… y son pocas al año»*

### 🔑 ESTO YA EXISTÍA, EN EL EXCEL DE LA CONTADORA. No se inventó nada.

Medido el 17-sep-2026 sobre sus tres planillas reales. En la hoja de cada persona hay una línea así:

```
DESC. POR FIESTA JUDÍA (22 DE MAYO)              18.50
HORAS EXTRAS (1.25)  1.5*1.25*3.02                5.6625
HORAS EXTRAS (1.50)  0*1.50*3.02                  0
EXCEDENTE DE HORAS   0*1.5*1.75*3.02              0
DOMINGO              0                            0
FERIADOS                                          0
HORAS PENDIENTES A DESCONTAR                     12.8375
```

Una deuda **en dólares**, las horas extra de la quincena la van pagando, y lo que sobra queda pendiente para la siguiente. Andando a mano desde mayo.

**Dos saldos vivos** (a cargar como saldo inicial cuando Daniel confirme):

| Colaborador | Empresa | Debía | Ya pagó | **Le queda** |
|---|---|---:|---:|---:|
| Kenny Vargas (28) | Confecciones Boston | $97.46 | $43.77 | **$53.69** |
| Samir Polo (42) | Confecciones Boston | $18.50 | $5.66 | **$12.84** |

### 🔴 EL NOMBRE NO ES «FIESTA JUDÍA»

> Daniel: *«a veces damos un día libre antes de una fiesta panameña para que los colaboradores vayan a su casa, y cuenta como si fuese un día religioso… ¿habría que cambiar el nombre?»*

Se llama **«Día libre de la empresa»** y es el **séptimo** motivo de `MOTIVOS_JUSTIFICACION`. Va **último**, lejos de «Compensatorio», y con esta nota debajo (`notaDelMotivo` → `TEXTO_DIA_LIBRE_EMPRESA`):

> Se paga el día completo y quedan debiendo 8 horas, que se pagan con sus horas extra hasta saldar. Nunca sale del sueldo.

⚠️ **Es LO CONTRARIO de `MOTIVO_COMPENSATORIO`**, que ya existía: aquél es un libre que la empresa le **DEBÍA** al colaborador (por un domingo trabajado) y **no cuesta nada**; éste es un libre que la empresa **REGALA** y deja debiendo horas. Si los dos textos se parecieran, alguien elegiría el equivocado y eso mueve plata. Hay un CONTROL en `dias-afuera-y-compensatorio.test.ts` que exige que sus notas no se parezcan.

### 🔴 POR QUÉ EN DÓLARES Y NO EN HORAS

Una hora extra diurna vale `1,25 × rata` y una de domingo `1,50 × rata`. Una deuda de «8 horas» se cancelaría con 6,4 horas extra diurnas o con 5,33 de domingo, y nadie podría decir cuánto se le debe sin volver a multiplicar. En dólares la cuenta es una resta y se puede cotejar contra el Excel — que es exactamente lo que ella ya hace.

### La regla, entera

1. **El día se paga COMPLETO.** No es ausencia, no descuenta sueldo, no genera tardanza ni salida temprana. Es una justificación más, y en esta casa **justificar significa que se paga**.
2. **Nace una deuda de `8 × rata` de ESA persona**, en dólares, el día que se carga. La rata sale de `rata.ts` (`salario ÷ divisorDe(jornada)`), la misma de todo el módulo — y el monto **se congela**: recalcularlo después haría que un aumento de sueldo le subiera, retroactivamente, una deuda que ya estaba andando.
3. **Se paga SOLO con horas extra**: cada quincena se le resta lo que valen sus horas extra **aprobadas** (las CINCO columnas que suman al bruto: diurna · nocturna · excedente · domingo · feriado).
4. **Lo que no alcanza queda debiendo.** Arrastra sin límite y no caduca.
5. **Lo que sobra se le paga**, como hoy.
6. 🔴 **NUNCA sale del sueldo.** El tope de lo que se cobra es el EXTRA de la quincena, **no el neto** — y por eso este módulo NO se parece a `prestamos-planilla.ts`. Quien nunca haga horas extra se queda con la deuda para siempre: es un beneficio que dio la empresa.
7. 🔴 **No se descuenta de la liquidación.** Daniel dijo «no», explícito.
8. **Quien SÍ trabajó ese día cobra normal** y no le nace ninguna deuda: a él no se le cargó el día libre.

### 🔴 CÓMO SE COBRA: se consumen las horas extra, no se agrega un descuento

En el Excel de ella las horas extra de esa quincena simplemente **no se pagan** y el resto queda pendiente. Acá es lo mismo: las cinco columnas del extra bajan hasta cubrir lo cobrado, el bruto baja con ellas y los dos seguros se recalculan sobre el bruto nuevo — el MISMO trato que ya recibe el ajuste de la quincena anterior (`aplicarAjusteEnLinea`, 11-sep-2026, Daniel: *«los seguros, va»*), con sus mismas tres condiciones (porcentajes a mano, paga seguros, sin base propia).

Un descuento aparte habría dejado el bruto —y por lo tanto el seguro social— calculado sobre plata que la persona no cobró.

🔑 El ORDEN en que se consumen las columnas (diurna → nocturna → excedente → domingo → feriado) **no cambia un centavo del total**: solo decide en qué celda se ve la baja. Hay un CONTROL de mutación que lo prueba.

### Dónde vive

- **`lib/asistencia/dia-libre-empresa.ts`** — la regla, módulo PURO.
- **`lib/asistencia/dia-libre-empresa-server.ts`** — leer, cargar, cerrar y revertir. 🔴 **Una sola puerta** (`cargarDeudasDiaLibre`) para los DOS caminos de alta.
- **`POST /api/asistencia/dia-libre`** — la carga por EMPRESA, por rango de días, solo **admin y contabilidad** (`diaLibreRoles()`, derivada de `ASISTENCIA_ROLES` sacando a quien mira pero no firma pagos). Escribe la DEUDA primero y la JUSTIFICACIÓN después: sin la migración no se guarda nada, porque una justificación sin su deuda regalaría el día dos veces.
- **`POST /api/asistencia/justificaciones`** — el alta de UNA persona con ese motivo pasa por la misma puerta y exige el mismo rol.
- Solo **días hábiles** del rango (`diasHabilesDelRango`, la misma definición de `esHabil` que usa el motor): un domingo adentro del rango no genera deuda porque ese día no había jornada que perdonar.
- El **cierre** anota el pago (`escribirPagosDiaLibre`, único `(empleado_codigo, quincena)` entre vivas: cerrar dos veces no cobra dos veces) y **reabrir lo revierte** con soft delete firmado — si no, al volver a cerrar sus horas extra pagarían dos veces la misma deuda.
- Se DICE en cuatro lados: el sello ámbar de la fila (`textoDiaLibreCelda`), «Antes de cerrar», el Excel y el PDF de la planilla, y su propia sección en la ficha del colaborador (**aparte de Préstamos, a propósito**: juntarlas haría que alguien la descuente del sueldo).
- Migración **`20261203120000_asistencia_dia_libre_empresa.sql`** — dos tablas (`asistencia_dia_libre_deuda` y `asistencia_dia_libre_pago`), soft delete firmado, RLS service_role, las dos en el respaldo (`personas`). **Pendiente de aplicar**; aditiva y tolerada: sin ella no hay deudas, no se cobra nada y el cuadro es EXACTAMENTE el de ayer.

### Medido contra producción (1–15 sep, corte 10-sep, `scripts/_medir-vs-yulissa.ts`)

- **Sin ninguna deuda cargada: 0 diferencias en 46 líneas.** Neto total $11.314,29 antes y después, hasta el centavo.
- **Con un día libre cargado a SAMIR POLO (42, rata $3,02):** deuda $24,16 · su extra diurno de **$6,28 se va a cero** · bruto y neto bajan exactamente $6,28 ($265,62 → $259,34) · **queda debiendo $17,88** · **nadie más se mueve**.

### Candados

`dia-libre-empresa.test.ts` (37 casos). **15 mutaciones, 15 cazadas**, 2 controles en verde (`scripts/_mutar-candados-dia-libre.sh`).

Cambiaron de dirección con nota fechada **y un CONTROL** (la lista de motivos pasó de seis a siete): `asistencia-motivo-trabajo-fuera` · `planilla-tres-descuentos` (H) · `dias-afuera-y-compensatorio` (4).

### ⚠️ Lo que queda pendiente de Daniel

1. **Cargar los dos saldos vivos** (Kenny $53,69 y Samir $12,84). El sistema no los inventa: hoy la deuda arranca vacía.
2. **Correr la migración `20261203120000`.**
3. Confirmar que los seguros se recalculen sobre el bruto sin esas horas. Se hizo así porque es lo que ya decidió para el ajuste del corte (*«los seguros, va»*), pero nadie se lo preguntó **para este caso**.

---

## 🔴 Los cinco arreglos de pantalla del Reporte (16-sep-2026)

Ninguno mueve plata: los cinco cambian lo que se VE. Daniel, textual, uno por uno.

### 1. El calendario se veía raro — cuatro botones

> *«arregla la manera de seleccionar en el calendario que se ve raro, tiene que ser normal, facil»*

🩸 Para mirar UN día había que abrir el calendario y tocar **dos veces**: es un selector de RANGO, así que el primer toque solo pone el ancla y hasta el segundo la pantalla no cambia.

**Hoy · Ayer · Esta quincena · Quincena pasada**, en `lib/asistencia/atajos-periodo.ts`. 🔴 **No es un tercer selector**: las quincenas salen de `quincenasElegibles` y los rótulos de `rotuloQuincena` (`elegir-quincena.ts`), las MISMAS que dibujan los cuatro botones de la Planilla. El calendario NO se fue: queda para todo lo que no es un atajo.

⚠️ **Esto no contradice «un preset que miente es peor que no tenerlo»** (`RangoFechas`). Aquellos cuatro atajos estaban calculados a mano como «del 1 al 15» y «del 16 a fin de mes», y se retiraron porque el corte de quincena de Daniel es VARIABLE. Lo que cambió desde entonces (15-sep-2026): **la quincena es fija** y lo que se mueve es el CORTE DEL RELOJ, que es otra cosa. Éstos salen de esa función, así que no pueden mentir.

🔴 **«Esta quincena» no se recorta en hoy**: es la quincena entera, igual que en la Planilla. Los días que no pasaron ya salen `enCurso` (regla 6) y la pantalla lo dice en una línea.

### 2. El período se reseteaba al cambiar de pestaña

> *«si estoy en asistencia y voy a planilla y vuelvo se me resetea asistencia, quiero q se quede»*

🩸 `desde`/`hasta` eran `useState` dentro de `ReporteTab`, y la pestaña se **desmonta** al cambiar de pestaña: volver la montaba de cero con «hace 14 días → hoy». El rango recordado tapaba el síntoma a medias y solo en el mismo dispositivo.

Ahora viven en `?desde=&hasta=` con `useUrlState` y **`replace`**, porque es un filtro del MISMO nivel y el Atrás del navegador no tiene que ciclar por cada cambio de fechas (igual que `?tab=` y `?empresa=`). La precedencia es la de antes, escrita en un solo lugar (`periodo-en-la-url.ts`): **URL → recordado en este dispositivo → la sugerencia de siempre**. «Ver sus días ›» desde la ficha sigue mandando su rango y sigue ganando.

🔴 **Las dos fechas se validan JUNTAS**: media URL (`?desde=` sin `?hasta=`) o un rango al revés se descartan enteros. Mostrar medio período pedido es peor que mostrar el de siempre — lo sostiene el candado viejo `asistencia-reporte-desde-la-ficha`.

### 3. El aviso de la hora de salida no decía quién

> *«debería de haber un link directo para ir al problema»*

Daba el número y nada más, así que había que buscar a mano a cuál de las cuarenta personas le falta. Ahora los NOMBRA a todos, con enlace a su ficha (`rutaDePersona`, nunca una ruta escrita a mano). La ruta devuelve `sinHorarioLista` junto al conteo.

⚠️ **Sigue contando solo a los que aparecen en el período que se mira**, que es lo que ya hacía y está bien. Medido el 16-sep-2026: sin horario hay 4 en total — Ana Trejos (2), Cindy De Gracia (3), Yeisibeth Muñoz (306) y Enrique Sánchez (56).

### 4. Dos marcas y la segunda a mediodía

🩸 **Andrea Pérez (16), 1-sep-2026**: marcó **08:04:03 y 12:07:32**, y nada más. El motor leyó las 12:07 como su salida y le contó 292 minutos de salida temprana. `marcas-impares.ts` no lo atrapa —y no tiene por qué: **dos es par**— así que el día pasaba entero sin que nadie avisara.

⚠️ **No es «dos marcas»**: sus días 7 y 9 de septiembre también tienen dos y están perfectos (la segunda cae 17:11 y 17:00). Lo sospechoso es **dónde cae la última**.

🔑 **El umbral, medido**: sobre los días hábiles ya cerrados con exactamente dos marcas —**24 días** del 1 al 15 de septiembre y **21** del 16 al 31 de agosto— el reparto por «cuánto antes de su salida cae la última marca» es casi binario: 19 y 17 días en **0 minutos**, **un solo caso intermedio (58,1 min)** y ocho entre **179,7 y 295,4**. **Entre 58 y 180 no hay nada en 45 días.** El umbral queda en **120 minutos**, en el medio de ese hueco (`SALIDA_SOSPECHOSA_MIN`, `lib/asistencia/salida-sospechosa.ts`).

🔴 **Va en su propio campo, nunca dentro de `revisar`**: `revisar` entra a la planilla que se guarda (`dias_a_revisar`), así que prender esto habría movido un número de una quincena cerrada. Se dibuja como un «Revisar» más, en ámbar, en la fila del día.

🔴 **Mira la salida temprana NETA, no la bruta.** Un día cubierto por un permiso de horas ya está explicado —Andrea el 1-sep tiene su Constancia de 12:00 a 17:00, y desde el arreglo de esa misma fecha no se le descuenta nada— y no hay nada que ir a arreglar. El aviso desaparece solo cuando alguien carga el permiso o agrega la marca que falta, que es exactamente lo que se quiere que pase.

**Lo que avisaría hoy, medido**: 1–15 sep, **2 días** (Yulissa Juárez el 11, Daniel Levy el 15 con dos marcas a 2 minutos una de otra); 16–31 ago, **4 días** (Yulissa el 31, María Bethancourth el 21, Eloyn Mendoza el 31, Briceida Montero el 18).

### 5. La columna «Extras» no decía cuánto está aprobado

> Preguntado si la celda tenía que decir las dos cosas: *«Si»*

Mostraba los minutos que midió el reloj y se leía como plata que se va a pagar. No lo es: la planilla paga **solo lo aprobado** (regla de la contadora, *«Sólo se pagan las horas extras autorizadas»*).

`lib/asistencia/extras-decididas.ts` reparte **el MISMO número que la columna ya sumaba** (`d.extraMin`), día por día, según la `decision` de ese día (si · no · null = pendiente), así que **aprobado + rechazado + pendiente es el total por construcción**: no es una segunda cuenta que pueda separarse de la primera. La ruta manda las decisiones ya tomadas, de la MISMA lectura que usa la planilla (`leerAprobaciones`).

🔴 **Lo pendiente se dice primero** cuando existe: es lo único que frena el cierre. Con TODO pendiente la línea no se dibuja — serían los mismos minutos de arriba dichos dos veces.

⚠️ **Medido, y con una diferencia que vale explicar.** Kener Hernández (17), ventana 26-ago → 10-sep: la columna del Reporte suma **326,50 minutos**, que se reparten en **254,05 aprobados y 72,45 rechazados**. El encargo decía 386,50 y 314,05 — **exactamente 60 minutos más** en los dos, porque ese número sale de `diasConExtra`, que además de la hora extra suma el **domingo y el feriado trabajados**, y la columna «Extras» del Reporte nunca los incluyó (son `domingoMin`/`feriadoMin`, no `extraMin`). Se repartió lo que la columna suma: una sub-línea que no cerrara con el número de arriba sería visiblemente falsa. Los **72,45 rechazados coinciden al centavo**.

### Candados

`src/__tests__/components/asistencia-cinco-arreglos.test.tsx` (29 casos), que **renderiza la pestaña real**: que `atajosDePeriodo` devuelva cuatro rangos no prueba que la pantalla dibuje cuatro botones.

**Verificado por mutación: `scripts/_mutar-candados-cinco-arreglos.sh` — 19 de 19 cazadas, 0 corridas muertas, 2 de 2 controles en verde.**

🩸 **Colateral del arreglo 2**: cuatro candados de pantalla que montan `ReporteTab` necesitaron el `vi.mock("next/navigation")` que ya tenía `asistencia-reporte-desde-la-ficha` — sin App Router, `useRouter()` lanza. Es el arnés, no la regla: ninguno cambió lo que prueba.

---

## 🔴 El permiso de horas perdona las TRES columnas (16-sep-2026)

> Daniel, textual:
> *«1. El permiso perdona lo que se solape con la ventana, sea tardanza, salida temprana o exceso de almuerzo. Una sola regla, tres columnas. 2. La columna muestra los minutos reales y, al lado, cuánto se perdonó. Nada callado. — haslo»*
> *«permiso justificado se paga»*
> *«y si tuviese tardanza, deberia de salir en tardanza no callado»*

### 🩸 El defecto, medido contra producción el 16-sep-2026

`minutosPerdonados` solo sabía cruzar la ventana del permiso con **el atraso de ENTRADA**, y `reporte.ts` lo llamaba en UN solo lugar. La salida temprana y el exceso de almuerzo se calculaban sin mirar el permiso:

| Colaborador | Día | Permiso cargado | Marcas | Se le descontaba |
|---|---|---|---|---:|
| **Andrea Pérez (16)** | 1-sep-2026 | Constancia **12:00–17:00** | 08:04:03 · 12:07:32 | **292,47 min · $16,43** |
| **Briceida Montero (8)** | 7-sep-2026 | Constancia **12:30–16:30** | 08:05:29 · 12:32:57 | **237,05 min · $12,92** |

Andrea **entró puntual** (08:04, dentro de la tolerancia de 10 min) y su permiso cubría **exactamente** lo que pasó — y la pantalla le escribía **«Permiso 0 min»**, porque el chip también contaba solo tardanza. Los minutos se descontaban y el renglón se veía como un día normal: lo que Daniel llama «callado».

Hay **23 justificaciones con horas** en producción. La mayoría son del día de lluvia del **17-ago** (nueve personas, permisos de mañana) y ésas **ya funcionaban**: no se podían romper.

### La regla — una sola, tres ventanas

Se perdona la **INTERSECCIÓN** de la ventana del permiso con la del incumplimiento, **ni un minuto más**, y cada perdón se capea a **su propio bruto** (perdonar de más sería regalar minutos de otra columna). La regla vive entera en `src/lib/asistencia/permiso-horas.ts` → `minutosPerdonadosDe`:

| Columna | Ventana del incumplimiento | Borde del reloj |
|---|---|---|
| Tardanza | `[entrada programada, primera marca]` | `fin` |
| **Salida temprana** | `[última marca, salida programada]` | **`inicio`** |
| **Exceso de almuerzo** | `[sale + almuerzo permitido, vuelve]` | `fin` |

🔴 **El estiramiento del MISMO MINUTO (27-ago-2026) se generaliza al borde que mira a la marca, y a ése solo.** El permiso se teclea en MINUTOS y el reloj mide en SEGUNDOS: en la tardanza la marca CIERRA la ventana y el que se estira es el FINAL del permiso —conducta intacta, la de las nueve personas de la lluvia—; en la salida temprana la marca la **ABRE** (se fue 12:07:32 con permiso «desde las 12:00») y el que se estira es el **PRINCIPIO**. El borde que no mira a una marca **no se corre**: un permiso de 08:05 a 08:10 sigue sin perdonar el atraso de 08:00 a 08:05.

🔴 **Las dos reglas viejas siguen en pie**: un permiso de horas **NO justifica el día entero** (quien no vino sigue siendo ausencia de día completo — es el test que protege ocho horas de sueldo) y **solo se perdona lo que SE SOLAPA**. `minutosPerdonados` conserva **firma y conducta** y hoy es un envoltorio de `minutosPerdonadosDe` con `bordeDelReloj: "fin"`.

⚠️ **Con 2 marcas no se inventa un almuerzo.** El exceso solo se mide con 4+ marcas (ya era así) y sin exceso no hay nada que perdonar.

### 🔴 Nada callado

- `DiaReporte` lleva los **tres perdones por separado** —`permisoPerdonaMin` (tardanza, conserva nombre y significado porque lo leen la pantalla, el Excel y tres candados), `permisoPerdonaSalidaMin` y `permisoPerdonaAlmuerzoMin`— más `permisoRango` («12:00–17:00»).
- El resumen por persona suma los tres en `minutosPerdonadosPorPermiso` y los abre en `minutosPerdonadosTarde` · `...SalidaTemprana` · `...Almuerzo`. Para un permiso de mañana —lo que había en producción— el total da **exactamente el mismo número que antes**.
- El chip del día pasó de **«Permiso 0 min»** a **«Permiso 12:00–17:00 · perdona 292 min de salida temprana»**, y el título lleva el texto largo. En el detalle de la persona aparece una línea azul: *«Los permisos de horas perdonaron 292 min de salida temprana. Esos minutos ya NO se descuentan.»*
- 🔑 **El texto sale de un módulo PURO** (`textoPerdon` · `etiquetaPermisoDelDia` · `textoPermisoDelDia` · `textoPerdonDelPeriodo`), nunca escrito dentro del `.tsx`: la pantalla, el título y el **Excel** dicen lo mismo, palabra por palabra. El Excel decía `perdona N min` a secas y ahora usa el mismo módulo.

### La medición contra producción, antes y después

`scripts/_medir-vs-yulissa.ts` (solo lectura), el mismo instrumento de las dos tandas anteriores.

**1–15 sep, corte 10-sep** — 46 líneas, **2 se mueven**:

| Código | Colaborador | Salida temprana (min) | Salida temprana ($) | Neto |
|---|---|---:|---:|---:|
| 16 | Andrea Pérez (vistana) | 292,47 → **0** | 16,43 → **0** | 285,53 → **301,96** (+16,43) |
| 8 | Briceida Montero (Boston) | 237,05 → **0** | 12,92 → **0** | 240,60 → **252,10** (+11,50) |

Briceida paga seguros: su bruto sube $12,92 y el seguro social y educativo suben $1,42, así que el neto sube **$11,50**. **Nadie más se movió**; neto total del período **11.286,36 → 11.314,29**.

**16–30 ago** (el día de lluvia) — 46 líneas, **0 diferencias de plata**, neto **11.091,64 → 11.091,64**.

⚠️ **Un cambio que NO es plata**: el 17-ago, Luis Ballesta (42) tiene DOS justificaciones cargadas y el motor toma la primera, que dice **08:00 a 20:00** (un tipeo del día de lluvia). Con la regla nueva esa ventana le perdona **2,62 minutos de exceso de almuerzo**. El exceso de almuerzo **no es un concepto de la planilla** —solo entra a `tiempoNoTrabajadoMin`, el número que se MIRA en el Reporte—, así que no mueve un centavo. Se deja anotado porque es la única fila del período que cambia de aspecto.

### Candados

`src/__tests__/lib/permiso-tres-columnas.test.ts` (32 casos), con los tres casos reales como fixtures: Andrea, Briceida y el día de lluvia **que no cambia**. Bordes cubiertos: permiso sin solape, permiso que cubre de más, ventana de duración cero y al revés, día sin marcas (sigue siendo ausencia), día con una sola marca, día con dos marcas (sin almuerzo que medir), y los dos bordes del mismo minuto por separado.

**Verificado por mutación: `scripts/_mutar-candados-permiso-tres-columnas.sh` — 15 de 15 cazadas, 0 corridas muertas, 2 de 2 controles en verde.** La corrida incluye los dos candados viejos (`asistencia-permiso-horas` y `justificar-horas-solo-constancia`), que pasan **sin tocarlos**.

🩸 **Cuatro mutaciones se escaparon en la primera vuelta y el candado se arregló, no se bajó la vara**: el estiramiento del borde en la salida temprana no se estaba probando con un permiso que tuviera SEGUNDOS (con horas al minuto la resta da lo mismo por los dos caminos), y la línea del resumen se comprobaba por «¿se llama a la función?» — un `false &&` delante la apagaba sin borrar la llamada. Ahora se exige el guard exacto.

---

## Asistencia — el almuerzo es FIJO y quién marca sin ir en planilla (13-ago-2026)

> Daniel va a usar la **planilla** de verdad (calcular pago, horas extra, tardanzas), así que estas dos cosas dejaron de ser cosméticas.
>
> ### 1. EL ALMUERZO ES SIEMPRE 30 MINUTOS — una sola fuente
>
> Daniel, textual: *"todos 30 minutos de almuerzo (puedes quitar la opcion de elegir tiempo de almuerzo, siempre es fijo 30 mins)"*.
>
> 🩸 **HABÍA DOS PERILLAS PARA EL MISMO DATO**, y es la forma conocida de que dos números se separen: la columna `asistencia_horarios.almuerzo_minutos` (por persona, con botones de 30 y 60 en Horarios) y la regla `almuerzo_default_min` de `asistencia_reglas` (una casilla más en «Reglas del cálculo»). **Medido en producción el 13-ago-2026: las 33 personas con horario tienen 30, sin UNA excepción en toda la historia de la tabla, y la regla también vale 30.** Era una perilla que nadie usó nunca y que solo podía quedar mal puesta.
> - **Fuente única: `ALMUERZO_FIJO_MIN` (`src/lib/asistencia/config.ts`).** `almuerzoDefaultMin` salió de `ReglasAsistencia`, de `validarReglas`, de `reglasDesdeFila` y de `reglasHaciaFila`: mandarlo en el cuerpo ahora se **ignora**, y una fila vieja de la base con otro valor **ya no se lee**.
> - 🔴 **LA COLUMNA POR PERSONA NO SE BORRA Y EL CÁLCULO LA SIGUE LEYENDO** (lo pidió Daniel). Borrar una columna es irreversible y no compra nada: lo que se retira es la POSIBILIDAD DE ELEGIR MAL. La pantalla de Horarios la muestra como dato (`30 minutos`) y **el PUT escribe `ALMUERZO_FIJO_MIN` mire lo que mire el cuerpo** — esconder los botones sin cerrar la ruta habría sido cosmético, y el almuerzo entra en la jornada con la que se valúa una ausencia, o sea en plata.
> - `asistencia_reglas.almuerzo_default_min` **queda en la base con su 30** (el upsert solo pisa lo que manda) y nadie la lee. En la pantalla, el almuerzo pasó de ser una CASILLA a ser una regla declarada en «Esto no se cambia desde acá», junto a las otras tres.
>
> ### 2. «SERVICIO PROFESIONAL» — marca en el reloj y NO va en planilla
>
> Daniel sobre **YULISSA JUAREZ** (código 26): *"yulissa es servicio profesional, no esta en planilla pero quiero medir asistencia"*.
>
> 🩸 **El módulo no sabía decir eso.** Una ficha sin salario era, para TODAS las pantallas, un dato PENDIENTE: salía en «les falta el salario», en la píldora «Falta configurar» y en la sección ámbar de la planilla — o sea que una decisión de negocio se veía **idéntica a un olvido, para siempre**. Y peor: el día que alguien le escribiera un salario "para que deje de molestar", el sistema le habría calculado quincena, seguros y neto sin que nadie lo pidiera.
> - **Las dos mitades:** FUERA de todo cálculo de pago · **DENTRO** del control de asistencia (marcaciones, tardanzas, ausencias, horas y reportes). La segunda es la que Daniel quiere conservar, y por eso **esto NO se resuelve dando de baja a la persona**: la baja la sacaría también del reporte.
> - 🔴 **EL CANDADO DEL PAGO ES `armarLinea` (`planilla.ts`), no la falta de sueldo:** el `if` pregunta por la BANDERA, así que una ficha marcada **con salario cargado tampoco produce un centavo**. `LineaPlanilla.fueraDePlanilla` es un tercer estado —ni pagada ni pendiente—: `totalizar` lo cuenta aparte de `sinConfigurar`, `faltantesDe` deja de pedirle salario y jornada (la **empresa sí** se sigue pidiendo: separa las tres planillas), y en pantalla/Excel/PDF va en **gris**, nunca en ámbar (el color es la mitad del mensaje).
> - **Por qué una bandera y no "no tiene salario":** un salario en blanco es AMBIGUO y hoy conviven los dos casos — YULISSA es servicio profesional, y GABRIELA JARAMILLO (53) y YEISHKA DIAZ MARKHAM (54) son altas de Boston a las que **todavía les falta el sueldo**.
> - ⚠️ **DDL ADITIVA PENDIENTE — `supabase/migrations/20260813120000_asistencia_servicio_profesional.sql`, la corre Daniel A MANO. La app funciona ANTES de que corra** (patrón `cols-opcionales`): `leerPersonas` es ahora una ESCALERA (todo → sin `servicio_profesional` → sin las columnas de baja → sin tabla) y cada peldaño se baja solo si el error NOMBRA la columna que ese peldaño quita. Sin la columna nadie queda fuera de planilla y la pantalla dice qué archivo falta; el PUT **no guarda a medias**: si se estaba marcando a alguien devuelve 503 con el aviso, y si no, reintenta sin la columna para que poner un nombre o un salario siga funcionando igual que ayer.
>
> ### La prueba de que NO se movió un centavo
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-planilla-no-se-movio.ts` (solo lectura) corre el motor **VIEJO** —sacado de `origin/main` al ejecutar, no una copia versionada que envejece— y el NUEVO sobre los MISMOS datos de producción. Medido el 13-ago-2026, 4 quincenas × 3 empresas: **148 líneas, 2.040 cifras de dinero, 0 diferencias** (netos idénticos: Boston $4.282,97 / $4.595,93 / $4.255,86 · Vistana $1.704,88 / $1.990,38 / $1.837,13 · Fashion Wear $1.745,14 / $1.544,76 / $1.345,97). La 2ª pasada marca al código 26 y demuestra lo que importa del cambio 2: **0 cambios en las otras personas y los totales de las 3 empresas idénticos**; lo único que se mueve en Yulissa es que pierde «falta el salario», gana `fueraDePlanilla` y **conserva sus horas exactamente iguales**.
>
> **Los 3 anchos, en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… ETAPA=antes|despues node scripts/_medir-asistencia-almuerzo-planilla.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre y 0 blancos táctiles bajo 44 px en las 4 pantallas** (ficha, Horarios, Reglas y Planilla), y los recortes y textos chicos **idénticos elemento por elemento a main** (el `h1.sr-only` y los `truncate` del nombre; los 10,5 px son las etiquetas de columna que el módulo ya tenía). Lo único que cambió en pantalla: **78 botones de almuerzo → 0** y «Almuerzo por defecto» fuera de las reglas.
> - 🩸 **Gotchas de medición, los dos costaron una vuelta:** esta app **no tiene `<main>`**, y quedarse con el primer `div[class*="transition-"]` agarra un overlay VACÍO del menú → 0 en todo y verde sin haber mirado nada (se elige el contenedor con más texto); y la pestaña vive en la URL (`?tab=configuracion`), no en un clic.
>
> Candados: `src/__tests__/lib/asistencia-almuerzo-fijo.test.ts` (13) y `asistencia-servicio-profesional.test.ts` (20). **Ejecutan la conducta, no buscan texto**: llaman a los PUT REALES con supabase mockeado y miran qué fila se escribe. **Verificado por mutación, 10 de 10 cazadas:** calcularle pago al servicio profesional (4 tests), volver a pedirle el salario (2), contarlo como pendiente (1), que el PUT acepte el almuerzo del cuerpo (2), que el almuerzo vuelva a entrar por reglas (2), dejar de leer la columna por persona (2), que la pantalla vuelva a pedir el salario (1), guardar a medias sin la columna (1), mezclarlo en el orden con los que cobran (1) y que la pantalla deje de declarar el almuerzo fijo (1).


---

## Asistencia — la planilla por RANGO de fechas y la marcación AL SEGUNDO (13-ago-2026)

> Daniel pidió dos cosas el mismo día, y las dos son de plata.
>
> ### 3. LA PLANILLA POR UN RANGO DE FECHAS CUALQUIERA
>
> Antes solo se podía pedir por quincena. Ahora el selector tiene dos modos —**Quincena** (lo que se mira el 95% de las veces, y sigue siendo lo que abre la pantalla) y **Rango de fechas**— y las horas, extras, tardanzas y ausencias se cuentan solo dentro de esas fechas.
>
> 🔴 **EL SUELDO ES MENSUAL, ASÍ QUE PRORRATEARLO NECESITA UNA REGLA. LA ELEGIDA: la fracción de QUINCENA que el rango cubre**, no la de mes ni la de días hábiles. Se eligió por una razón verificable: **es la única que deja la quincena en factor exactamente 1**. El negocio paga medio sueldo por quincena sin importar que tenga 15 o 16 días (`salario ÷ 2`, y el día 31 no paga base); prorratear por días del MES daría 15/31 = 0,4839 para la primera de julio — **un 3% menos en TODAS las planillas por haber agregado una pantalla**. Para un rango partido, cada quincena aporta su parte: del 25-jul al 10-ago = **7/16 + 10/15 = 1,104167**.
> - **`factorBase` viaja hasta `calcularDinero` y su valor por defecto es 1**, así que todo lo que ya existía sigue dando el mismo número sin tocar una llamada. `× 1` no cambia un número IEEE-754: con el factor por defecto es literalmente el `centavos(salarioMensual / 2)` de siempre.
> - 🩸 **Un factor `NaN`/0/negativo cae en 1, NUNCA en $0** — y el guard va en `calcularDinero`, no solo en `armarPlanilla`: `centavos(NaN)` devuelve 0, o sea una planilla de $0 que se paga en silencio. Ante la duda se paga la quincena completa, que es lo que se pagaba ayer.
> - ⚠️ **LOS MONTOS ESCRITOS A MANO NO SE REPARTEN.** Viven por quincena —`asistencia_planilla_manual.quincena` tiene un CHECK que solo acepta `2026-07-2`— así que en un rango libre **no se aplican y las celdas se muestran apagadas**, con el aviso en ámbar arriba de todo: repartir un ISR por días sería inventar plata. Para pagar, se elige la quincena.
> - **El aviso del rango libre va PRIMERO y no se esconde detrás de un ⓘ**: dice cuántos días son, qué porcentaje del sueldo quincenal se está pagando y que los montos a mano no entran. También viaja al **Excel y al PDF** (subtítulo + hoja «Cómo se calcula»): el papel se manda por correo y sobrevive a la conversación donde se explicó.
> - **El camino viejo NO se tocó:** `?quincena=2026-07-2` sigue funcionando igual, y si el rango COINCIDE con una quincena, `periodoDesdeRango` devuelve el período de ESA quincena (misma clave de montos manuales, factor 1). **Medido contra la ruta real en el build de producción: los dos caminos dan el MISMO cuadro, campo por campo, en 6 combinaciones** (2 quincenas × 3 empresas).
> - **Tope de 366 días** y validación de fechas (`2026-02-31` → 400): cada consulta pagina TODAS las marcaciones del rango, y un rango de diez años sería una forma de tumbar la base desde la barra de direcciones.
>
> ### 4. LA MARCACIÓN SE MIDE AL SEGUNDO
>
> Daniel, textual: *"y la marcancion tiene que ser al segundo, porque redondeas minutos"*.
>
> 🩸 **EL DATO SIEMPRE ESTUVO COMPLETO** (medido: 198 de las últimas 200 marcaciones traen segundos ≠ 00). Lo que redondeaba era el CÁLCULO: `minutosDelDia` devolvía minutos enteros y empujaba los segundos al minuto más cercano, con un comentario al lado que decía *"discutir por segundos es exactamente lo que la tolerancia evita"* — un argumento que **confunde medir con perdonar**. La tolerancia perdona 10 minutos a la entrada y sigue igual; lo que no se puede es medir mal a la salida, porque ahí no hay nada que perdonar y el error se paga a 1,25 o 1,50.
> - **`segundosDelDia` es la unidad del día entero.** Los umbrales de negocio siguen en MINUTOS y se escalan: tolerancia, mínimo de hora extra y almuerzo no cambiaron ni un número. `minutosDelDia` sigue existiendo **solo** para sugerir la hora de salida (elegir entre 16:30 y 17:00 con la mediana no cambia por 29 segundos, y no toca plata).
> - 🔴 **LAS MARCAS SE MUESTRAN CON SEGUNDOS** (`08:04:39`, en pantalla y en el papel). Son el dato del que sale todo: si el papel dijera 08:04, nadie podría reproducir a mano las horas que la planilla paga.
> - **Los minutos se muestran con 2 decimales cuando tienen fracción** (`fmtMin`, fuente única de pantalla y exports). Redondear cada celda al entero haría que la columna no sumara su propio total.
> - ⚠️ **EL REDONDEO DEL DINERO NO SE TOCÓ.** `centavos` y su corrección de coma flotante quedaron intactos — eso es de plata, no de tiempo.
>
> ### La prueba de que ninguna regla se movió, y el impacto REAL
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-planilla-segundos-impacto.ts` (solo lectura). 🔴 **Acá no se espera un cero —medir mejor cambia números, ese es el punto—: lo que se prueba es más fuerte.** Se le dan al motor NUEVO las marcas REDONDEADAS al minuto (lo que hacía el viejo) y se exige que dé **EXACTAMENTE lo mismo que `origin/main`, campo por campo**. Medido el 13-ago sobre 3 quincenas × 3 empresas: **🟢 idéntico**. Toda la diferencia viene de la precisión del reloj y de nada más.
> - 🩸 **Una tolerancia de "30 s por marca" NO servía, y medirlo lo demostró: en un UMBRAL, 29 segundos mueven MINUTOS.** Los 3 casos reales: quien marcó **8:10:15** pasa de 0 a **10,25 min** de tardanza (la gracia son 10 minutos y el atraso se cuenta DESDE las 8:00 — regla vieja, sin cambios; lo que cambió es de qué lado del umbral cae el segundo), y quien se quedó hasta **17:29:31** pierde los 30 minutos de extra porque no alcanza el mínimo de 30 (en producción `extra_minimo_min` = 30). Un tope por marca habría marcado eso como "regla rota" **y habría dejado pasar un error real de 1 minuto**.
> - **Impacto en dólares, 3 quincenas × 3 empresas: $22.918,02 → $22.914,74 (−$3,28).** Los tres más movidos: ANDREA PEREZ −$1,73 (−29,43 min de extra), CARLOS BALTODANO −$1,05, ANDRES GONZALEZ −$0,64. Las otras 34 personas se mueven ±$0,09 o menos.
> - ⚠️ **Si Daniel prefiere que 8:10:15 no sea tarde, NO hay que tocar código: se sube la tolerancia a 11 minutos en «Reglas del cálculo».** Ya es configurable.
>
> **Los 3 anchos, en el navegador contra el build de producción** (`BASE=… node scripts/_medir-asistencia-rango-segundos.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre y 0 blancos táctiles bajo 44 px** en Planilla (modo quincena y modo rango) y en el Reporte con el detalle abierto. Los recortes (3 a 390, 1 en los otros) y los textos de 10,5 px son **los mismos que ya medía el módulo antes de este PR**.
> - 🩸 **Dos gotchas más de medición, y los dos daban verde sin haber mirado nada:** contar `tbody tr` a secas mezcla las filas de la tabla ANIDADA del detalle con las de las personas —el índice deja de significar "la persona i" y los clics terminan abriendo y cerrando a la misma—, y buscar horas con segundos en `document.body` encuentra la del banner del reloj aunque el detalle esté vacío (se cuentan solo dentro de la tabla anidada). El script **falla** si no encuentra el selector, el aviso del rango libre o una marca con segundos.
>
> Candados: `asistencia-planilla-rango.test.ts` (17) y `asistencia-segundos.test.ts` (15). **Verificado por mutación, 6 de 6 cazadas:** prorratear por días del mes rompe 6, volver a redondear la marca al minuto rompe 9, quitarle la tolerancia a la tardanza rompe 6, quitar el guard del factor (NaN → planilla de $0) rompe 1, aplicar los montos manuales en un rango libre rompe 1, y descartar los segundos en la frontera de las 18:00 rompe 1.


---

## ✅ Asistencia — LA REGLA DE PRORRATEO, CERRADA POR LA CONTADORA (13-ago-2026)

> Daniel había contestado que el prorrateo era *"8 horas por dias por los total de dia trabajado"*, que **no es** lo que hace el módulo. Se midió contra producción ANTES de tocar el cálculo, se paró y se preguntó — y la respuesta cerró el tema:
>
> **Daniel, textual:** *"pero me dijo mi contable que el calculo dio exacto, solo le falto elegir la fecha exacta y no redonear minutos"*.
>
> O sea: **lo que faltaba eran las dos cosas que ya se construyeron** (el rango de fechas libre y medir al segundo). **La matemática de la planilla NO se toca.**
>
> ### Por qué se paró, y por qué estuvo bien parar (`scripts/_medir-prorrateo-daniel.ts`)
>
> | quincena | días hábiles | hoy (`salario ÷ 2`) | 8 h × días hábiles |
> |---|---|---|---|
> | 1 al 15 de julio | 11 | $9.647,40 | $9.204,80 (**−4,6 %**) |
> | 16 al 31 de julio | 12 | $9.647,40 | $10.041,60 (**+4,1 %**) |
> | 1 al 15 de agosto | 10 | $9.647,40 | $8.368,00 (**−13,3 %**) |
>
> El mismo sueldo habría pagado **13 % menos en una quincena que en otra** según cuántos lunes-a-viernes le tocaron. Implementarlo "porque lo dijo el dueño" habría roto una planilla que la contadora ya daba por exacta.
>
> ### ⛔ Las tres dudas que quedaron abiertas están CONTESTADAS. Ninguna era un bug
>
> 1. **Las 13 personas de 48 h/semana están BIEN cargadas.** Daniel: *"no"*, explícito — no se pasan a 40. Su jornada **contratada** es de 48 horas, aunque marquen lunes a viernes.
> 2. **La media hora de los que salen 17:00 NO es hora extra.** Daniel, textual: *"los que salen a las 5 no es mediahora extra, sino que eso es un reemplzao de sus horas para completar 48 mensuales, me explico? aun q alfinal no se completa"* — se quedan media hora de lun-vie para **reponer el sábado que no trabajan**, no completan las 48, y **está bien así**: no genera extra ni deducción. (Por eso «nadie marca sábado» con divisor 208 NO era un error de carga.)
> 3. **Días trabajados = días con marcación, y la incapacidad justificada SÍ SE PAGA.**
>
> ### 🔴 La incapacidad justificada se paga, y ahora hay candado EN DÓLARES
>
> El módulo ya lo hacía —un día justificado no es `ausente`, así que no entra a `ausenciaMin`— pero **no había un solo test que lo probara en dinero**, y la diferencia entre "se paga" y "no se paga" era un `!justificado` que alguien podía borrar sin que se cayera nada.
> - **Verificado en producción con el caso real:** MARTHA ASUCENA CHAVARRIA Z. (código 43) tiene dos días sin marcas en la quincena 1-15 de agosto — el **4 con «Incapacidad»** y el **14 sin justificar**. El 4 sale `ausente=false` y **no se le descuenta**; el 14 sí. Se le descuenta **un** día, no dos.
> - Candado nuevo: sin justificación el día se descuenta, con incapacidad **el neto es idéntico al de haber trabajado**, y el día se sigue viendo aparte (`ausenciaJustificadaDias`) en vez de desaparecer.
>
> ### Lo demás que quedó confirmado y con candado
>
> - **Décimo tercer mes y vacaciones NO se provisionan** (*"se registran cuando se pagan"*). Se verificó el cálculo línea por línea: no había nada que sacar. El test fija las **20 columnas exactas** de `DineroLinea` y la fórmula del bruto.
> - **Seguro social 9,75 % y educativo 1,25 % son los correctos** y salen del BRUTO.
> - **La quincena no depende de sus días hábiles** (10, 11 o 12 → la misma base).
> - **Verificado por mutación:** volver a descontar la incapacidad rompe 3 tests; prorratear con `8 h × días hábiles` rompe 14.
>
> **La distinción del servicio profesional ya existía en la contabilidad:** a Daniel y a David se les paga por **SERVICIOS PROFESIONALES (6.02.01)**, otra cuenta que **SALARIOS POR PAGAR (2.01.05.01)**. Va en el ⓘ de la ficha, donde la contable reconoce los números de cuenta.



---

## 🔴 Asistencia — EL 90% DE LO QUE LA PLANILLA DESCONTABA POR AUSENCIA ERA FALSO (14-ago-2026)

> La contadora corre la primera quincena real en 2 días. Una auditoría medida contra producción encontró que de los **$1.127,78** que la planilla descontaba por ausencia en la quincena del 1 al 15 de agosto, **$1.013,87 (el 90%) eran falsos**. Reales: **$113,91**.
>
> 🔴 **NINGUNO DE LOS TRES ARREGLOS TOCA EL MOTOR DE CÁLCULO.** `planilla.ts` está cotejado al centavo contra el Excel de la contadora y su matemática NO se tocó: ni una fórmula, ni un redondeo, ni un recargo. Los tres son sobre **qué días entran** al cálculo y **de quién se abstiene el sistema**.
>
> ### 1. El día que no terminó no puede ser ausencia
>
> `armarReporte` sabía callarse el día en curso desde el 13-ago —lo usaba el Reporte— y **la Planilla no le pasaba `diaEnCurso`**: un `grep` sobre `route.ts`, `PlanillaTab.tsx`, `planilla.ts` y `planilla-exportar.ts` daba **cero**. Resultado medido: las **33 personas** salían ausentes el **14-ago (hoy)** = **$866,99**.
> - 🔴 **Y NO ALCANZABA CON EXCLUIR HOY.** `diaEnCurso` excluía UNO solo (`fecha === diaEnCurso`): abierta la quincena un día 3, quedaban ~9 días hábiles futuros contándose como falta **a ~$870 cada uno**. La comparación pasó a **`fecha >= diaEnCurso`** — *"de acá en adelante todavía no pasó nada"*. Un día futuro no es que "no terminó": es que ni siquiera empezó.
> - **El día es el de PANAMÁ (`hoyPanama()`, UTC−5 fijo).** Agrupar por UTC ya dio números falsos dos veces en este módulo: entre las 7 p.m. y la medianoche el día salta y "hoy" pasaría a ser mañana.
> - ⚠️ **Se pasa SIEMPRE, sin mirar si cae dentro del período.** Una quincena vieja no tiene ningún día que lo alcance y su cálculo no se mueve un centavo: eso es lo que hace que reimprimir julio siga dando lo de julio.
> - 🔑 **Lo que ya se trabajó se sigue midiendo**: quien llegó tarde HOY se lo cobra igual. Lo único que se suspende es el veredicto (`ausente` y `revisar`), no la medición.
> - **Aviso arriba del cuadro** (`avisoPeriodoAbierto`, azul): *«Esta quincena todavía no termina — falta 1 día hábil. Los días que no pasaron no se cuentan.»* Desaparece solo cuando el período cierra — un cartel permanente se deja de leer.
>
> ### 2. Quien entró o salió a mitad del período NO recibe un número inventado
>
> **YEISHKA DIAZ (54)**, ingreso 10-ago, salía ausente el 3, 4, 5, 6 y 7 —días en que no trabajaba acá— y su neto quedaba en **$133,34 sobre un quincenal de $300**. **GABRIELA JARAMILLO (53)**, ingreso 4-ago, ausente el 3.
> - 🔴 **EL ARREGLO OBVIO ES EL EQUIVOCADO, y hay un test que lo demuestra en dólares:** medirla solo desde su ingreso le borra las ausencias y le paga **$300 completos** por 4 días trabajados de 10 hábiles. Las dos cuentas automáticas están mal por lados opuestos.
> - **Lo que Daniel decidió: el sistema NO le calcula pago.** Sale en **«Tú decides»** (rótulo renombrado el 1-sep-2026; se llamaba «Decidilo vos») con la leyenda *«entró el 10 de agosto de 2026»*, con el quincenal que le correspondería a la vista, y **fuera del total**. La contadora usa el **rango de fechas libre** (10 al 15), que ya existe. Textual: *«pero igual nos pagan por quincena, no? Solo hay que escoger cada vez de qué fecha a qué fecha se calcula y ya»*.
> - 🔑 **Es la MISMA regla que el módulo ya aplica** y que está escrita en `planilla.ts`: cuando el sistema no puede saber, se abstiene. *"Descontarle la quincena entera en automático sería inventarle una renuncia; pagarle completo, inventarle unas vacaciones."* **NO SE CONSTRUYÓ PRORRATEO.** La única cifra que se muestra es la quincena COMPLETA, rotulada como lo que le TOCARÍA — nunca una fracción calculada por el sistema.
> - **El candado del pago vive en `armarLinea`, en el MISMO `if` que el de servicio profesional**: no pregunta por el sueldo ni por los días, pregunta por el motivo. Con salario cargado, marcando todos los días, sigue sin producir un centavo.
> - ⚠️ **29 de 38 fichas no tienen `fecha_ingreso`** (medido): con ésas `motivoPeriodoParcial` devuelve `null` y se comportan EXACTAMENTE como hoy. Los bordes son ESTRICTOS: quien entró el primer día del período (o salió el último) trabajó el período completo.
>
> ### 3. Quien tiene justificación viva sale del cajón «falta configurar»
>
> **RODRIGO MIRANDA** (Trabajo fuera de la oficina, 1→13 ago) y **ELOYN MENDOZA** (Vacaciones, 16-jul→13-ago) salían los dos en ámbar diciendo *«falta configurarles algo… se arreglan en Configuración»* — **y en Configuración no hay nada que arreglarles**.
> - **La bolsa ámbar se partió en DOS grupos con nombre propio** (`grupoDeLinea`, fuente ÚNICA usada por la pantalla, el orden, los totales, el Excel y el PDF): **«Falta un dato»** (ámbar, con el botón a Configuración) y **«Tú decides»** (GRIS, con el motivo escrito —*«Vacaciones del 16 jul 2026 al 13 ago 2026»*— y el quincenal que les correspondería). El color es la mitad del mensaje: ámbar dice "arreglame".
> - ⚠️ **La justificación solo cuenta cuando la persona NO marcó NI UN DÍA.** Quien se tomó dos días y trabajó trece **cobra normal**: confundir los dos casos le quitaría la quincena entera a quien sí vino. Hay candado.
> - **El código 50** (sin ficha) aparecía **tres veces, una por empresa** — `armarPlanilla` los mete en todas a propósito para que nadie los borre en silencio. Ahora sale del cuadro (`separarSinFicha`) y se muestra **una sola vez arriba**: *«1 código marcó N veces y no tiene ficha (código 50). Hasta saber quién es, no se le puede calcular pago.»* **La intención de que no desaparezca se conserva; lo que cambia es dónde se muestra.**
> - **Los avisos viajan al Excel y al PDF**: el papel se manda por correo y sobrevive a la conversación donde se explicó.
>
> ### La medición contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-planilla-dias-que-no-pasaron.ts` (solo lectura) corre la lógica de la ruta **VIEJA** —sacada de `origin/main` AL EJECUTAR, no una copia versionada que envejece— y la nueva sobre los MISMOS datos:
>
> | | antes | después |
> |---|---:|---:|
> | Ausencias (3 empresas) | **$1.127,78** | **$113,91** |
> | Neto | $7.194,92 | $7.583,01 |
> | Yeishka (54) | neto $133,34 | **sin número** · «entró el 10 de agosto» · quincena completa $300,00 |
> | Gabriela (53) | neto $206,62 | **sin número** · «entró el 4 de agosto» · quincena completa $300,00 |
> | Rodrigo (13) | ámbar «no marcó ni un día» | **gris** · «Trabajo fuera de la oficina del 1 ago al 13 ago» · $400,00 |
> | Eloyn (29) | ámbar «no marcó ni un día» | **gris** · «Vacaciones del 16 jul al 13 ago» · $283,26 |
> | Código 50 | 3 filas (una por empresa) | 1 aviso arriba |
>
> 🔴 **Y LAS DOS QUINCENAS YA CERRADAS DE JULIO NO SE MOVIERON: 1.264 cifras comparadas, 0 diferencias** (Boston $4.264,23 y $4.550,78 · Vistana $2.092,04 y $2.379,29 · Fashion Wear $1.699,15 y $1.500,22, idénticos antes y después). El script **falla** si una sola cifra cambia, si Yeishka cobra, o si el código sin ficha sigue adentro del cuadro. Para reproducir la auditoría desde cero: `scripts/_diag-planilla-dias-que-no-pasaron.ts`.
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con datos de producción** (`BASE=… node scripts/_medir-planilla-dias-que-no-pasaron.mjs`, solo lectura, en las 3 empresas): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos NUEVOS bajo 12 px** en los 12 casos. Los únicos recortes son el `H1.sr-only` (77 px) y el `truncate` del nombre en la tarjeta de celular — los dos PRE-EXISTENTES, en código que este PR no toca; los textos de 10-11 px son las etiquetas de columna que el módulo ya tenía. El script **falla** si la planilla sale vacía, si falta alguno de los tres avisos, o si el del código sin ficha aparece más de una vez.
>
> **Candados:** `src/__tests__/lib/asistencia-dias-que-no-pasaron.test.ts` (38, incluido un bloque que llama al **handler REAL de la ruta** — el bug original era que la ruta no pasaba el parámetro, y eso ninguna prueba del motor puede verlo) y **`src/__tests__/components/asistencia-planilla-decidir-pantalla.test.tsx` (10), que RENDERIZA `PlanillaTab`** y lee los renglones: que `grupoDeLinea` devuelva "decidir" no prueba nada sobre lo que la contadora ve.
> - **Verificado por mutación, 16 de 16 cazadas:** volver a `===` en el motor (1) · que la ruta deje de pasar el día de hoy (1) · quitarle a `armarLinea` el candado de la abstención (7) · que `armarPlanilla` deje de pasar el motivo (7) · que la ruta deje de armar el mapa de vigencia (1) o el de justificaciones (1) · contar «decidir» como pendiente (2) · que `separarSinFicha` no separe (1) o que la ruta no lo llame (1) · `quincenalReferencia` siempre null (3) · aflojar el borde del ingreso (1) · aplicar la justificación a quien SÍ marcó (1) · que la pantalla vuelva a una sola bolsa ámbar (5) · que pierda el aviso del período (1) o el del código sin ficha (2) · que la ruta deje de mandar el aviso (1).
> - 🔑 **Ningún candado busca texto en un archivo**: todos ejecutan la conducta y miran los dólares o el DOM. En este repo ya fallaron varios candados por leer sus propios comentarios.


---

## 🔴 Asistencia — LA MARCACIÓN DEL RELOJ NUNCA SE BORRA NI SE EDITA (13-ago-2026)

> Daniel, textual: *"en asistencia- reporte, quiero poder editar el registro de marcacion en caso de caso especial, se puede? o enrreda mucho?"*. Y a las dos preguntas del diseño: **"1. todos pueden corregir. 2. si"** (la razón es obligatoria).
>
> ### 🔴 LA REGLA QUE NO SE NEGOCIA
>
> `asistencia_marcaciones` **es lo que dijo el reloj, y es la única prueba de a qué hora entró una persona — o sea que define un pago.** Un UPDATE ahí destruye esa prueba para siempre y no hay de dónde recuperarla (el reloj tiene memoria limitada y los eventos viejos se le caen). **Por eso la marcación queda INTACTA y la corrección va ENCIMA**, en `asistencia_correcciones`. La corrección manda para el cálculo; en pantalla se ven las dos:
>
> ```
> mié 5 ago   08:00:00   12:00:23   12:31:07   17:04:12   Revisar
>             Reloj 08:47:12 → 08:00 · "se le dañó el carro, avisó" · Daniel · 13 ago
> ```
>
> Es el MISMO patrón que Guías (el texto que escribió bodega se conserva; encima va `guia_items.cliente_codigo`) y que `mk_proyectos.tienda` + `tienda_codigo`. **No es un patrón nuevo.**
>
> ### El caso que Daniel no nombró y es el más común: la marcación que NO existe
>
> Quien **olvidó marcar** no tiene registro que corregir. **Medido en producción el 13-ago-2026** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-marcaciones-incompletas.ts`, solo lectura) sobre las **3.894 marcaciones cargadas** (1-jul → 13-ago, 38 personas, 1.020 días-persona):
>
> | Marcas en el día | Días-persona | % |
> |---|---:|---:|
> | 1 (entrada sin salida) | 12 | 1,2% |
> | 2 (sin almuerzo) | 69 | 6,8% |
> | 3 (falta una) | 85 | 8,3% |
> | **4 (completo)** | **789** | **77,4%** |
> | 5-7 (de más) | 65 | 6,4% |
>
> 🔴 **231 de 1.020 días están mal marcados (22,6%)**, **97 con número IMPAR de marcas** (falta una) y **12 con una sola**. Más **24 días hábiles sin NINGUNA marca y sin justificación**. **No es un caso raro: es pan de todos los días**, y por eso se puede **AGREGAR** una marcación faltante con el mismo motivo obligatorio y la misma firma.
>
> ⚠️ **La marcación agregada NUNCA se escribe dentro de `asistencia_marcaciones`** — se mezclaría con lo que dijo el reloj y se perdería la separación que es todo el punto. Va en `asistencia_correcciones` con `marcacion_id = NULL`, y en pantalla dice *"Marcación **agregada** — el reloj no registró nada"*. En el motor se distingue porque `DiaReporte.marcasIds[i]` viene en `null`.
>
> ### Dónde entra al cálculo
>
> `aplicarCorrecciones` (módulo PURO, `src/lib/asistencia/correcciones.ts`) devuelve una **COPIA** de la lista de marcaciones con las horas corregidas, y **las DOS rutas la aplican ANTES de llamar al motor**: `/api/asistencia/reporte` y `/api/asistencia/planilla`. 🔴 **Si la corrección no llegara al pago, no serviría para nada**: la pantalla diría una cosa y la planilla pagaría otra.
> - **`DiaReporte.correcciones` y `resumen.diasCorregidos` son INFORMATIVOS y no entran en ninguna cuenta** — las horas ya vienen aplicadas. Hay un test que le pasa al motor un mapa lleno de correcciones absurdas y exige que ni un minuto se mueva.
> - 🔑 **Una corrección NO puede mover una marcación de DÍA.** Para la forma «pisar una hora», el día sale de la MARCACIÓN (`diaPanama(ocurrio_en)`), nunca del campo `fecha` de la corrección: mover horas de un día a otro es mover plata de una quincena a otra sin que nada lo avise. Y la ruta tampoco se cree la persona ni el día que manda el navegador: los lee de la marcación.
> - **Deshacer NO borra**: `anulada_en` + `anulada_por`. La fila queda y el cálculo vuelve a la hora del reloj. Un botón que no se puede deshacer sobre un dato de pago es una trampa; y deshacer sin dejar rastro es peor que no haber corregido.
>
> ### Quién puede, y la firma
>
> **TODOS los roles de Asistencia** (`asistenciaRoles()` = admin, secretaria, contabilidad). Decisión explícita de Daniel. **Por eso mismo la FIRMA no es opcional**: sale de la sesión (`auth.userName`), nunca del cuerpo del pedido — sin ella, "todos pueden" se vuelve "nadie sabe quién fue". El **motivo es obligatorio** en las tres capas: el botón se apaga y dice qué falta, la ruta rechaza con 400, y el CHECK de la base exige `btrim(motivo) <> ''` (⚠️ `NOT NULL` a secas deja pasar `""` y `"   "`, que es justo lo que teclea quien quiere saltarse el campo).
>
> ### Se ve SIN abrir nada
>
> Arriba de la tabla: *"**1** hora corregida a mano en **1** día. Los números de abajo ya cuentan con eso."* · chip azul **«N días corregidos»** en la fila de la persona · la línea con las dos horas dentro del detalle. Y también en el **Excel** (columna «Corregido a mano» en Detalle con la hora del reloj, la corregida, el motivo y quién; «Días corregidos a mano» en Resumen) y en el **PDF que se firma** (columna «Días correg.» + pie de página). No hay forma de leer un total sin enterarse de que hay una hora tocada a mano.
>
> ### 🔴 EL CANDADO PRINCIPAL, verificado por mutación
>
> `src/__tests__/lib/asistencia-correcciones.test.ts` (42 casos). **BARRIDO ESTÁTICO sobre todo `src/`, sin listas de archivos que se queden viejas**: ningún `.from("asistencia_marcaciones")` puede encadenar `.update(`, `.delete(` ni `.upsert(`. ⚠️ El barrido **borra los comentarios primero** — un candado que se cumple a sí mismo con su propia explicación da permiso para romper (este repo ya se quemó con eso, ver la nota de `revalidateOnFocus`). La ÚNICA forma de upsert admitida es la del INGEST con `ignoreDuplicates: true`, que **nunca pisa una fila**: es lo que hace idempotente el repaso nocturno del reloj. Otro barrido recorre TODAS las migraciones y prohíbe `DROP TABLE` / `TRUNCATE` / `DELETE FROM` sobre la tabla. Y hay **test de CONDUCTA**: llama a la ruta REAL con supabase mockeado y mira qué se escribió de verdad.
> - **Verificado por mutación, 13 de 13 cazadas:** escribir un UPDATE (1) o un DELETE (1) sobre las marcaciones · aflojar el motivo obligatorio (4) · que la planilla NO aplique las correcciones (1) · que el reporte no las aplique (1) · que el select pierda el `id` (1) · que una corrección pueda mover el día (1) · que `aplicarCorrecciones` mute el original (2) · que deshacer borre en vez de anular (1) · que la firma salga del cuerpo (1) · que la ruta se crea la persona/día del cuerpo (1) · la llave con CASCADE en vez de RESTRICT (1) · el motivo sin su CHECK (1).
>
> ### 🔴 SIN CORRECCIÓN NO SE MOVIÓ UN CENTAVO — medido contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-correcciones-no-mueven-nada.ts` (solo lectura) corre el motor **VIEJO** —sacado de `origin/main` AL EJECUTAR, no una copia versionada que envejece— y el NUEVO sobre los MISMOS datos. **4 quincenas × 3 empresas: 150 líneas, 3.992 cifras, 🟢 0 diferencias** (netos idénticos: Boston $4.282,31 / $4.596,04 / $4.465,79 · Vistana $2.177,55 / $2.488,80 / $1.677,11 · Fashion Wear $1.745,05 / $1.544,90 / $1.249,86).
> - **Candado de dinero, con una tardanza REAL de producción:** ALEJANDRA CAMAÑO, 1-jul, marcó 08:15 → corregida a 08:00 → tardanza **15,75 → 0,00 min**, neto **$251,94 → $252,64**. **Personas ajenas movidas: 0.** Deshacerla devuelve **620 cifras idénticas** y el neto exacto a $251,94.
>
> ### ⚠️ DDL ADITIVA PENDIENTE — la corre Daniel A MANO, y la app funciona ANTES
>
> `supabase/migrations/20260813150000_asistencia_correcciones.sql`. Patrón `cols-opcionales`: **sin la tabla, la pantalla NO ofrece corregir y lo dice** (*"Pídele a Daniel que corra el archivo…"*), y el cálculo es el de siempre. **Verificado contra producción con la DDL SIN correr** (`scripts/_verif-correcciones-sin-ddl.ts` + el navegador): el reporte carga sus 48 personas, **0 botones de corregir**, el aviso a la vista, y la detección de «falta la tabla» es ESTRECHA — 6/6 casos (permiso denegado, timeout, red caída y «otra tabla no existe» se PROPAGAN, no se leen como migración faltante).
> - 🩸 **Gotcha de verificación:** el primer probe usaba `select(…, { head: true })` y decía **«EXISTE»** sobre una tabla que no estaba creada — con `head` PostgREST puede contestar sin cuerpo y el error se pierde. Un script de verificación que miente es peor que no tenerlo.
>
> ### Los 3 anchos (+ el iPad acostado)
>
> `BASE=… node scripts/_medir-correcciones-anchos.mjs` (solo lectura), en **5 estados** — reporte cerrado, detalle abierto, ventana de corregir, de deshacer y de agregar: **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px NUEVOS** en los 20 casos. El único recorte es el `H1.sr-only` y los textos de 10,5/10/11 px son las etiquetas de columna y el chip «Revisar» que el módulo ya tenía — **medidos IDÉNTICOS con y sin correcciones**, o sea que este cambio no agregó ni un texto chico (la primera versión sí: el chip y los «Agregar hora» salieron a 11 px y se subieron a 12). Modal con el patrón de la casa: `createPortal` + `inset-0` + `useBodyScrollLock`, **sin `autoFocus`**.
> - 🩸 **La tabla no existe todavía en producción, así que la medición INTERCEPTA la respuesta de `/api/asistencia/reporte`** y le inyecta UNA corrección con la forma exacta que va a tener. Los datos siguen siendo los de producción y el componente medido es el REAL; no se toca la base ni se aprieta ningún botón que guarde. Sin eso no habría nada que medir y el script pasaría en verde sin haber mirado nada — por eso **falla** si no encuentra el aviso, el chip, la línea con la hora del reloj o el botón de guardar apagado.


---

## 🔴 Asistencia — LA CASILLA «PRÉSTAMO» SE LLENA SOLA, CON APROBACIÓN (27-ago-2026)

> La contadora, textual: ***«El préstamo si debe ser por aprobarlo»***.
>
> La casilla `Préstamo` del cuadro quincenal la tecleaba una persona mirando el
> módulo de Préstamos **en otra pantalla**. Ahora la llena el propio módulo —y
> queda editable— pero **el descuento se APRUEBA, no se aplica solo**.
>
> ### 🩸 EL HUECO, MEDIDO CONTRA PRODUCCIÓN (quincena 1 al 15 de agosto)
>
> | | |
> |---|---:|
> | el módulo de Préstamos registró | **9 deducciones · $360,00** |
> | la casilla de la planilla decía | **7 montos · $265,00** |
>
> - **KEVIN LUBO ($50) · LUIS PARAJON ($45) · YULICAR CORONA ($50)** tenían la
>   deducción registrada en el módulo y **la casilla en CERO**.
> - **LUIS ARROYO** tenía **$50 en la casilla y NINGÚN pago en el módulo** — su
>   préstamo estuvo atrapado en `pendiente_aprobacion` hasta el #651, así que la
>   plata se le descontó del sueldo y el saldo del módulo **nunca bajó**.
>   ⚠️ **Eso NO se corrigió desde acá**: es plata en producción y lo decide
>   Daniel. Queda escrito.
> - GABRIELA, MARÍA y LUZ no tenían descuento **y era correcto**: sus préstamos
>   nacieron el 17, 18 y 20 de agosto, o sea DESPUÉS de esa quincena.
>
> ### 🔴 EL AMARRE: por CÓDIGO, y los que no cruzan van A MANO
>
> `prestamos_empleados` guarda un **nombre tecleado a mano** y la planilla
> conoce a la gente por el **código del reloj**. Medido: de las **30 fichas de
> préstamo, 18 cruzan por igualdad EXACTA** de nombre (mayúsculas + espacios) y
> 12 no.
>
> Columna nueva **`prestamos_empleados.empleado_codigo`**
> (`20260902120000_prestamos_amarre_codigo.sql`), con **DOS pasos y ninguno
> adivina**:
> - **PASO 1** — igualdad EXACTA de nombre **y** de empresa, y **solo con un
>   único candidato** en la planilla. La traducción de empresa es una lista
>   CERRADA con `ELSE NULL`: una empresa desconocida no ata «de más».
> - **PASO 2** — **tres renglones escritos a mano**, cada uno con el nombre que
>   ese código tiene que tener en la planilla, y el UPDATE **lo EXIGE**:
>   `GABRIELA A. JARAMILLO P.`→53 · `LUIS ADRIAN ARROYO`→9 ·
>   `MARIA BETHANCOURTH`→49. Si mañana renombran al 53, la migración deja de
>   escribir esa fila en vez de atar el préstamo de Gabriela a otra persona.
>
> 🔴 **NADA POR PARECIDO. NI CON UN CASO BARATO.** Es la lección de
> `Outlet Duty Free N2` vs `N3` (ver § Guías): dos nombres parecidos pueden ser
> DOS personas, y un descuento a la persona equivocada **no deja rastro**. En
> esta misma tabla está el caso que lo prueba: **`LAURA CASIANI` (Préstamos)
> contra `Laura Lismari Casiano Vega` (código 38)** — CASIAN**I** y CASIAN**O**
> no son la misma palabra. **Se queda SIN atar**, aunque su saldo sea $0 y atarla
> hoy no costaría nada.
>
> **Resultado: 21 de 30 atadas, y las 14 con saldo vivo están TODAS atadas.**
> Las 9 sin atar están en $0,00: `LAURA CASIANI` · `LUZ LOPEZ` ×2 (fichas viejas;
> la viva es **LUZ BOSQUEZ**, que la contadora ya renombró y **cruza sola**) ·
> `STEFANY`/`STEPHANY MORALES` · `YANKATERY` · `YEISON LLORENTE` ·
> `JOHANA VALLEJO` ×2.
>
> 🔴 **UN PRÉSTAMO CON SALDO QUE NO ES DE NADIE SE DICE, EN ROJO.** Callarlo es
> exactamente cómo se perdieron los $700 de LUIS ADRIAN ARROYO durante 22 días.
>
> ### 🔴 DE DÓNDE SALE EL NÚMERO — dos casos, no uno
>
> `src/lib/asistencia/prestamos-planilla.ts` (módulo PURO). **Acá NO se vuelve a
> calcular el saldo**: llega ya calculado por la MISMA cuenta del módulo
> (`prestado − pagado` sobre los movimientos aprobados y no borrados, la de
> `prestamos_aplicar_quincena`).
>
> 1. **Si el módulo YA registró el descuento de ESTA quincena**, la casilla dice
>    EXACTAMENTE eso — es un hecho consumado, no una estimación.
> 2. **Si no**, dice `min(cuota, saldo)`, la fórmula de la RPC.
>
> 🩸 **El orden importa y el caso es real.** Si la contadora aprieta «Aplicar
> quincena» ANTES de armar el cuadro, el saldo YA bajó: **KEVIN LUBO** tenía
> saldo $50 y cuota $50, y con la quincena aplicada `min(cuota, saldo)` daría
> **$0 el mismo mes en que se le descontaron los $50**.
>
> - ⚠️ **`Abono extra` NO cuenta como descuento de planilla.** Es plata que la
>   persona pagó de su bolsillo; descontársela otra vez del sueldo sería cobrarle
>   dos veces. Sí baja el saldo, y el saldo ya viene con eso adentro.
>   `Pago de responsabilidad` SÍ cuenta: medido, 59 movimientos y **35 con la
>   nota «Deducción quincenal»**.
> - ⚠️ **VENTANA EXACTA, sin la tolerancia de ±3 días de la RPC.** Los pagos caen
>   el 15 y el 30, o sea justo en el borde: con tolerancia, un pago del 15
>   entraría a la vez en la quincena 1-15 y en la 16-31. El mismo descuento
>   contado dos veces.
> - **La ficha ARCHIVADA no propone cuota nueva** (misma condición que la RPC).
>   Por eso **BRICEIDA MONTERO no aparece**, con $100 de saldo vivo: su ficha
>   está archivada en Préstamos.
> - **Se agrupa por CÓDIGO, no por ficha.** `RAMON MIRANDA` tiene DOS fichas
>   atadas al código 21 y la planilla tiene UNA casilla.
>
> ### 🔴 LA APROBACIÓN NO ESCONDE PLATA — la lección del #651
>
> Hace un día un préstamo de $700 nacía en `pendiente_aprobacion`, el saldo solo
> suma lo aprobado, y **la pantalla lo mostraba en CERO durante 22 días**. Ese
> freno se retiró (*«quita poder aprobar prestamos, todos deben de pasar»*), y
> ésta es **otra aprobación**: no decide si la deuda existe, decide si el número
> entra a la casilla. La forma es la de las horas extra (#649/#652):
>
> - **lo que está sin aprobar SE VE**, con nombre y monto, en ámbar, arriba del
>   cuadro — *«N personas tienen préstamo por descontar sin aprobar: NO se
>   descontó en este cuadro»*;
> - **el saldo del módulo no depende de esta tabla**: un préstamo sin aprobar
>   sigue apareciendo entero en Préstamos;
> - **el aviso viaja al Excel y al PDF** que firma la contadora: si la pantalla
>   avisa y el papel no, el papel decide un pago con menos información.
>
> ⚠️ **Y si la casilla YA tiene monto escrito a mano, NO se dice «no se
> descontó»**: la planilla SÍ lo descontó, y decir lo contrario sería mentirle a
> quien paga.
>
> ### 🔑 SE GUARDA LA DECISIÓN, NO UNA SEGUNDA CUENTA
>
> `asistencia_prestamo_aprobado` (quincena, código) guarda **aprobado + quién +
> cuándo + `monto_visto`**. El MONTO sigue viviendo donde siempre:
> **`asistencia_planilla_manual.prestamo`**, y sigue siendo editable. Aprobar lo
> escribe ahí; `planilla.ts` **no se tocó**.
> - **La llave es la QUINCENA** —y acá sí corresponde: un descuento de préstamo
>   pertenece a un cuadro, igual que el ISR. Las horas extra se aprueban por DÍA
>   porque la contadora mueve el corte del período (#652); esto no.
> - **`monto_visto` es el TESTIGO**: si el módulo cambia o alguien corrige la
>   casilla, la pantalla lo DICE con los dos números — no se corrige solo.
>   *Una plata que se mueve sola es peor que una que se explica.*
> - 🔴 **Retirar la aprobación NO borra un número que escribió una persona**: la
>   casilla se vacía **solo si todavía dice exactamente lo que puso la aprobación
>   anterior**. Si alguien la corrigió, se deja y **se dice**.
> - **Quién aprueba: `asistenciaRoles()`, NO `aprobacionesRoles()`.** Son dos
>   aprobaciones distintas: las horas extra las autoriza Julio con el usuario
>   `bodega`, que a propósito **no ve un solo sueldo**. Un descuento de préstamo
>   ES plata del sueldo. Por eso el bloque vive en la pestaña **Planilla** y no en
>   Aprobaciones, y el candado de `asistencia-bodega-solo-aprueba.test.ts`
>   —que congela los 4 campos de esa respuesta— sigue verde sin tocarlo.
>
> ### ⚠️ LAS DDL YA CORRIERON — y la app funcionaba ANTES
>
> Patrón `cols-opcionales`, verificado en las dos direcciones: sin la columna del
> amarre nadie queda atado y la casilla se escribe a mano como hasta ayer; sin la
> tabla no se puede aprobar y **la planilla da EXACTAMENTE lo de hoy hasta el
> centavo**. Las dos ausencias se DICEN en pantalla, con el nombre del archivo.
> - 🩸 **El escalón de lectura quita LO MÍNIMO.** Un fallback que releyera con las
>   columnas base se llevaría puesto `nombre_manual`… — acá el reintento solo
>   quita `empleado_codigo`, y **solo cuando el error NOMBRA esa columna**.
>
> ### Los números, antes y después
>
> | | antes | después |
> |---|---|---|
> | fichas de préstamo atadas | **0 de 30** | **21 de 30** · las 14 con saldo, todas |
> | préstamos con saldo sin persona | 14 | **0** |
> | casilla `prestamo` de la quincena 1-15 | $280,00 en 8 renglones | **$265,00 en 7** |
> | casilla `mercancia` | $10,00 | **$25,00** |
> | **total de descuentos manuales** | **$385,00** | **$385,00** |
> | JOHANA VALLEJO activa en Préstamos | 1 ficha | **0** (archivada, 78 movimientos intactos) |
> | movimientos de préstamo | 414 · $44.650,21 | **414 · $44.650,21** |
>
> **Saldo vivo hoy: $5.964,73 entre 13 fichas activas** (+ $100,00 de BRICEIDA,
> archivada, = $6.064,73 en 14). ⚠️ El $5.264,73 con el que arrancó este trabajo
> era correcto **para su momento**: creció exactamente $700 cuando el #651 liberó
> el préstamo de LUIS ADRIAN ARROYO ese mismo día.
>
> **Lo que la pantalla va a proponer para la quincena 16-31 de agosto: 13
> personas, $485,00** (`_verif-prestamo-planilla.ts`, solo lectura, corre los
> MISMOS módulos que la pantalla) — **con las 6 que se habían quedado afuera**:
> Kevin $50 · Gabriela $60 · Luis Parajón $45 · Yulicar $25 · María $25 · Luz $15.
>
> ### 🔴 NINGÚN NÚMERO DE PAGO SE MOVIÓ, y está EJECUTADO
>
> El argumento *«las dos columnas están en la misma suma, así que el neto no se
> mueve»* es correcto **y no alcanza**.
> `scripts/_verif-martha-mercancia-no-mueve-nada.ts` (solo lectura) llama a
> **`calcularDinero`, la misma función que paga**, con los montos de antes y los
> de después, sobre **LAS 12 PERSONAS** de la quincena, y compara los 20 campos
> de dinero: **288 campos · 2 cambios (las dos casillas de Martha) · 0 cambios no
> pedidos**, con `totalDeducciones`, `netoPagar` y `totalBruto` verificados por
> su nombre. Y la tabla entera, campo por campo: **72 campos comparados, 2
> distintos y los 2 son los pedidos**.
>
> ### ⚠️ QUEDA ABIERTO — decide Daniel
>
> - 🔴 **A LUIS ARROYO se le descontaron $50 en la quincena 1-15 que el módulo de
>   Préstamos no registra.** Su saldo está $50 alto. Corregirlo es escribir un
>   movimiento de plata en producción y no se hizo.
> - **Aprobar NO registra el pago en el módulo.** La casilla se llena; el saldo lo
>   sigue bajando «Aplicar quincena», como hasta hoy. Que la aprobación además
>   escriba el `Pago` es una decisión de negocio (y el dedup de ±3 días del módulo
>   ya evitaría el doble cobro), no un refactor.
> - **`LAURA CASIANI` vs `Laura Lismari Casiano Vega`**: si son la misma persona,
>   se ata a mano. El sistema **no lo va a adivinar nunca**.
> - Las 6 fichas de saldo $0 sin ficha en la planilla (`STEFANY`/`STEPHANY
>   MORALES`, `YANKATERY`, `YEISON LLORENTE`, `LUZ LOPEZ` ×2) quedan sin atar.
>
> ### Candados
>
> `src/__tests__/lib/asistencia-prestamo-planilla.test.ts` (22) y
> `prestamos-amarre-migracion.test.ts` (13). El segundo **lee el SQL SIN
> COMENTARIOS** —el archivo NOMBRA lo que prohíbe («nada de parecidos», «LAURA
> CASIANI»), así que un barrido sobre el archivo entero se engañaría solo, cuarta
> vez que este repo paga lo mismo— y prohíbe LIKE, similitud, `unaccent`,
> distancia de edición, `substring`, `translate` y regex sobre el nombre; exige
> la empresa, el único candidato, el `EXISTS` que valida el nombre del código, que
> no haya un cuarto amarre a mano, y que el `SET` escriba **exactamente una
> columna** (un `SET empleado_codigo = …, nombre = …` reescribiría el nombre que
> tecleó una persona).
> - **Verificado por mutación, 15 de 15 cazadas y 0 corridas muertas**
>   (`bash scripts/_mutar-candados-prestamo-planilla.sh`): el hecho consumado deja
>   de ganarle a la cuota · `min(cuota,saldo)` → cuota pelada · la ficha archivada
>   propone cuota · el código sale de parecerse al nombre · el aviso de «préstamo
>   sin persona» se calla · el aviso pierde el monto · «Abono extra» se vuelve
>   descuento · dos fichas del mismo código no suman · la migración usa LIKE ·
>   ignora la empresa · ata con dos candidatos · pierde el guard del nombre · pisa
>   un amarre ya hecho · se cuela `LAURA CASIANI` · el backfill reescribe el
>   nombre.
> - 🩸 **El script NO usa `perl -0pi -e 's|…|…|'`**: con ese delimitador, un `||`
>   del código real se des-escapa a una alternación con rama vacía, **se come el
>   archivo entero**, vitest no colecta nada y el «0 fallos» se lee como
>   «SOBREVIVIÓ». El reemplazo es LITERAL (`scripts/_mutar-aplicar.py`, textos por
>   argv), **denuncia el patrón que no muta**, `probar()` **exige que la corrida
>   haya colectado tests**, la restauración va **por COPIA** (hay archivos NUEVOS
>   y `git checkout` aborta el comando entero) y hay una **mutación de CONTROL que
>   a propósito no matchea**: si no sale ⛔, el denunciador está roto y todos los
>   ✅ valen lo mismo que un barrido con el comentario adentro.


---

## 🔴 Asistencia — «TRABAJO FUERA DE LA OFICINA»: el motivo que NO es una ausencia (13-ago-2026)

> El caso: **RODRIGO MIRANDA (código 13, vistana, $800/mes) no marca desde el 31 de julio porque está trabajando FUERA de la empresa.** Daniel, textual: *"rodrigo esta trabajando fuera de la empresa (justificado)"*. Los cinco motivos que había —`Vacaciones · Incapacidad · Permiso · Luto · Otro`— describen a alguien que **NO trabajó**. Rodrigo **sí trabajó**.
>
> | | Vacaciones | Trabajo fuera |
> |---|---|---|
> | ¿se le paga? | sí | sí |
> | **¿trabajó ese día?** | **NO** | **SÍ** |
> | ¿le consume días de vacaciones? | **SÍ** | no |
>
> Metidos como lo mismo, en tres meses nadie puede distinguir quién estuvo de vacaciones de quién estuvo trabajando afuera — y las vacaciones son un derecho que se acumula y se gasta.
>
> 🩸 **SE DICE «OFICINA» Y NO «EMPRESA», aunque la palabra de Daniel fuera "empresa".** En castellano *"está fuera de la empresa"* se lee, con la misma naturalidad, como *"ya no trabaja acá"* — la confusión más cara posible justo en la pantalla que decide un pago. "Fuera de la oficina" dice lo mismo sin esa segunda lectura.
>
> ### ⚠️ NO HIZO FALTA NINGUNA DDL — y está COMPROBADO contra producción, no deducido
>
> `asistencia_justificaciones.motivo` es un `text NOT NULL` **sin CHECK** (`20260805120000_asistencia_reglas.sql`). Pero "las migraciones dicen" no es "la base hace": `npx tsx scripts/_probe-motivo-check.ts` **inserta los 6 motivos de verdad y los borra**, verificando que no quede ninguna fila (PostgREST no expone `information_schema`, así que no hay forma de leer un CHECK). Medido: **6/6 aceptados, 2 filas antes y 2 después.** El centinela es un código imposible (`__PROBE_MOTIVO__`) con fechas de 1900.
>
> ### 🔴 EL PAGO ES EXACTAMENTE EL DE UNA JUSTIFICACIÓN DE HOY — medido contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-motivo-trabajo-fuera.ts` (**solo lectura**; la justificación de Rodrigo se calcula EN MEMORIA, no se escribe). Corre el motor **VIEJO** —sacado de `origin/main` AL EJECUTAR, no una copia versionada que envejece— y el nuevo sobre los MISMOS datos. Medido el 13-ago-2026, 3 quincenas × 3 empresas:
>
> - **El código no mueve nada: 114 líneas · 1.880 cifras de dinero · 0 diferencias 🟢**
> - **Nadie más se mueve al justificar a Rodrigo: 0 personas ajenas movidas 🟢**
> - 🔴 **«Vacaciones» y «Trabajo fuera de la oficina» pagan IDÉNTICO: 94 personas comparadas campo por campo, 0 diferencias 🟢.** Es la prueba directa de "no se descuenta", y no depende de leer un `if`.
> - **Casos reales de "descontado → no descontado"**, con los dos números: HECTOR LEONEL PEREZ **$245,22 → $267,00** (ausencia $24,48 → $0,00) · SAMIR POLO **$207,29 → $228,80** · GABRIELA JARAMILLO **$206,62 → $228,41** · YEISHKA DIAZ **$133,34 → $155,13**. En los cuatro, con «Vacaciones» el neto es EL MISMO.
> - ⚠️ **CERO HORAS EXTRA, y es lo correcto:** sin marcaciones no hay horas que medir. `extraDiurnoMin`, `extraNocturnoMin`, `domingoMin` y `feriadoMin` quedan en 0 — ni se le inventan 8 horas ni se le quitan las de los días que sí trabajó.
>
> 🩸 **HALLAZGO — RODRIGO NUNCA ESTUVO "DESCONTADO", Y LA JUSTIFICACIÓN NO LE CAMBIA EL NÚMERO.** Con **cero marcaciones en toda la quincena** no llega a existir en el reporte, así que la planilla lo lista con `dinero: null` y `faltaConfigurar = ["no marcó ni un día en esta quincena"]` — **antes y después de la justificación, exactamente igual**. Medido, y **ELOYN MENDOZA (29) con «Vacaciones» 16-jul→13-ago sale idéntico**: `dinero=NO · falta=[no marcó ni un día]`. O sea que el motivo nuevo **hereda** el comportamiento que ya había, no estrena uno. Es una decisión deliberada y escrita en `planilla.ts`: *"Descontarle la quincena entera en automático sería inventarle una renuncia; pagarle completo, inventarle unas vacaciones. Se lista y lo decide una persona."* **NO se tocó.** Si Daniel quiere que una quincena 100% justificada se pague sola, es una decisión suya y cambia a los cinco motivos de golpe, no solo a éste.
>
> ### El reporte lo DISTINGUE, que es el punto de haberlo agregado
>
> - El renglón del día dice **«Trabajando fuera de la oficina»**, sin la palabra *ausencia* — el genérico habría sido *"Ausencia justificada — Trabajo fuera de la oficina"*, que afirma lo contrario de lo que pasó. Fuente única: `textoDiaJustificado()` en `motivos.ts`, usada por la pantalla **y** por el Excel.
> - 🔴 **Chip en la fila de la persona: «N días trabajando fuera», SIN abrir nada.** Sin él, quien trabajó todo el mes afuera aparece con «0 días trabajados» y ninguna explicación: idéntico a alguien que no vino.
> - **`resumen.diasTrabajandoFuera` va APARTE de `ausenciasJustificadas`, y los dos conjuntos son DISJUNTOS.** Ningún número histórico se mueve: hasta hoy el motivo no existía, así que no había un solo día que sacar de ahí.
> - **Excel:** la columna «Ausencia» del Detalle pasó a **«Ausencia / justificación»** (a secas ya no alcanzaba), el Resumen gana **«Días trabajando fuera»** en columna propia, y la hoja «Cómo se calcula» explica que **NO es una ausencia**. ⚠️ Al insertar la columna, el índice de la celda que se pinta en ROJO se corrió de 8 a **9**: pintar la de al lado teñiría los minutos tarde, que no son una advertencia.
> - **PDF (el que se firma):** en el papel esa persona sale con «Días 0», así que el pie lo dice — *"N días son de trabajo fuera de la oficina: la persona trabajó (no marcó porque no estaba acá), no se descuenta y no genera extras"*.
>
> ### Los 3 anchos (+ el iPad acostado)
>
> `BASE=… node scripts/_medir-trabajo-fuera-anchos.mjs` (solo lectura), en 3 estados — reporte cerrado, detalle abierto y Justificaciones: **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px NUEVOS** en los 12 casos. El único recorte es el `H1.sr-only` (77 px) y los textos de 10,5 px son las etiquetas de columna que el módulo ya tenía. El chip mide 20 px de alto y no ensancha la fila.
> - 🩸 **En producción todavía no hay ninguna justificación con este motivo**, así que la medición **INTERCEPTA** `/api/asistencia/reporte` y le inyecta días con la forma exacta que van a tener; los datos siguen siendo los de producción y el componente medido es el REAL. Sin eso el script pasaría en verde sin haber mirado nada — por eso **falla** si no encuentra el chip, el renglón o la opción en el desplegable, y **también si encuentra «Ausencia justificada — Trabajo fuera»**.
>
> ### Candados
>
> `src/__tests__/lib/asistencia-motivo-trabajo-fuera.test.ts` (23) y **`src/__tests__/components/asistencia-trabajo-fuera-pantalla.test.tsx` (6, RENDERIZA `ReporteTab` y `JustificacionesTab` de verdad)**. Ninguno busca texto en un archivo: corren el motor, corren la planilla, arman el Excel y el PDF y leen las celdas. **Verificado por mutación, 15 de 15 cazadas:** `esTrabajoFuera` siempre false (6) · el texto vuelve al genérico en el módulo (2) o en la pantalla (1) · el día cuenta como ausencia justificada (3) · `diasTrabajandoFuera` siempre 0 (3) · el día se marca como AUSENTE, o sea toca el pago (7) · el motivo sale de la lista (1 + 1) · la celda roja del Excel vuelve al índice 8 (1) · el Excel Detalle vuelve al genérico (2) · se quita la columna del Resumen (3) o su valor, que desalinea el TOTAL (1) · se cae el pie del PDF (1) o su total (1) · se cae el chip (2) o queda siempre en plural (1) · se borra la fila de «Cómo se calcula» (1).
>
> ### ❓ NO existe cuenta de días de vacaciones — y NO se construyó
>
> ⚠️ **SUPERADO el 25/26-ago-2026: las vacaciones tienen tabla, pestaña y SALDO propios** — ver *«LAS VACACIONES SE MUDAN DE MESA»*, la sección siguiente. Lo de abajo es de la tarde del 13-ago y se conserva como registro de qué había cuando nació el motivo de Rodrigo; **hoy no describe el sistema**: existen la tabla `asistencia_vacaciones`, las columnas `asistencia_personas.saldo_vacaciones_dias` / `saldo_vacaciones_corte` y `src/lib/asistencia/saldo-vacaciones.ts`, y la justificación con motivo «Vacaciones» **ya no existe** — la borró la migración de la mudanza.
>
> Barrido completo (`supabase/migrations/` y `src/`): **no hay columna, ni tabla, ni cálculo** que lleve el saldo de vacaciones de nadie. `asistencia_personas` tiene nombre, salario, jornada, empresa, activo, fechas de ingreso/salida y `servicio_profesional` — nada de vacaciones. Lo único que existe es la justificación con motivo «Vacaciones» como un rango suelto: **nadie cuenta cuántos días se ganaron ni cuántos se gastaron.** Es una decisión de Daniel y no se construyó.


---

## 🔴 Asistencia — LAS VACACIONES SE MUDAN DE MESA, y ahora SÍ llevan cuenta de días (25/26-ago-2026)

> Es lo que la sección anterior daba por no construido. Tres migraciones aditivas: `20260825160000_asistencia_vacaciones.sql` (la tabla), `20260826040000_asistencia_saldo_vacaciones_inicial.sql` (el arranque del saldo) y `20260826060000_asistencia_saldo_vacaciones_medios_dias.sql` (el medio día).
>
> ### 🔴 UNA VACACIÓN NO ES UNA JUSTIFICACIÓN, Y POR ESO SE MUDÓ
>
> Una justificación explica por qué alguien **faltó** un día que tenía que trabajar; unas vacaciones son un **derecho que se gana, se gasta y lleva su propia cuenta de días**. Metidas en la misma lista, en tres meses nadie distingue quién estuvo enfermo de quién estuvo de vacaciones — y solo una de las dos se acumula. Una vacación es **persona + desde + hasta + un interruptor**, y nada más (`asistencia_vacaciones`, soft delete y RLS sin políticas, como el resto del módulo).
>
> - **La mudanza movió UNA fila y estaba contada ANTES de correr:** de las 5 justificaciones vivas, una sola tenía motivo «Vacaciones» — ELOYN MENDOZA (código 29, 16-jul → 13-ago-2026). El PASO 1 es una vista previa que no escribe y la corrida se para si el conteo no da 1. El orden es **INSERT y recién después DELETE**, y el DELETE borra **solo lo que ya quedó copiado** (`EXISTS` fila por fila): al revés, un INSERT que fallara habría convertido esos días en ausencias.
> - 🔴 **Nació SIN MARCAR a propósito** (`ya_pagadas` en su default `false`): es exactamente como se comportaba siendo justificación. Un default en `true` le habría descontado una quincena entera sin que nadie tocara nada.
> - 🔴 **«Vacaciones» NO está en `MOTIVOS_JUSTIFICACION` NI en `MOTIVOS_RETIRADOS`, y no es un olvido.** Ponerla en la segunda la devolvería al desplegable por la puerta de atrás, y el mismo día podría existir **dos veces** —una como vacación y otra como «Ausencia justificada — Vacaciones»—, con dos etiquetas contradictorias en el renglón que decide un pago.
> - El cartel de **Cómo funciona** dejó de nombrar «vacaciones» y «permiso» entre las justificaciones: los motivos de ese texto salen de `MOTIVOS_JUSTIFICACION` y no de una lista escrita a mano. Es la misma lección que la tolerancia — un cartel que contradice a la pantalla es peor que no tener cartel.
>
> ### 🔴 EN UN DÍA DE VACACIONES NO SE CALCULA NADA DEL RELOJ
>
> Daniel, textual: *"si alguien pasó por el reloj estando de vacaciones, no genera horas, ni tardanza, ni ausencia"*. Las marcas de ese día **no se borran ni se esconden** —viajan en `marcasIgnoradas` y la pantalla las muestra—: descartar un dato es una cosa, descartarlo EN SILENCIO es otra. En `clasificarDia` la vacación se mira **PRIMERO**, antes que el feriado y que todo lo demás. Y el renglón nunca dice *ausencia*: dice «Vacaciones», o «Vacaciones (ya pagadas)».
>
> ### 🔴 EL INTERRUPTOR «YA SE LE PAGÓ» ES LO ÚNICO QUE MUEVE PLATA
>
> La regla es de la contadora, textual: *"Si la persona había cobrado sus vacaciones anteriormente en dinero y no se había ido esos tres días, yo se los descuento porque ya se los pagué; si la persona no ha cobrado sus vacaciones entonces se los pago."*
>
> - **SIN MARCAR (el default) no cuesta nada:** el quincenal (`salario ÷ 2`) ya cubre esos días y no se descuenta un centavo. Pagarlos no necesita ninguna cuenta.
> - **MARCADA:** esos días se descuentan y se valúan **igual que una ausencia de día completo** — `MIN_DIA_NO_TRABAJADO` (8 h) × rata, la MISMA constante, **no** el horario de la persona. Van en columna propia (`vacacionesYaPagadasMin`) adentro de `ausencias`: el total no se mueve y el renglón igual puede decir de dónde sale.
> - ⚠️ **Solo se descuentan los días que iba a trabajar: hábil (L-V) y no feriado.** Un domingo o un 3 de noviembre adentro del rango no tenía jornada que pagar, y descontarlo sería cobrarle dos veces el mismo día.
> - 🔴 **Y SE DICE EN PANTALLA, con nombre, rango y monto** (`textoVacacionesNoPagadas`): rechazar sí, esconder no — la misma regla que el préstamo sin aprobar y el reparto que no cuadra. Sin el monto no se coteja contra nada; sin el rango no se sabe de qué vacación habla; sin el nombre no se sabe a quién reclamarle.
>
> ### 🩸 EL SALDO NO ES «GANADOS DESDE QUE ENTRÓ MENOS LO TOMADO»
>
> Lo fue durante un PR (#626), y era **aritméticamente correcto e INÚTIL**: las vacaciones existen en el sistema desde el 25-ago-2026 (medido por la puerta de la app: UNA cargada), pero los días ganados se cuentan desde el ingreso y hay fichas de 2019. **ANGELA GARCIA figuraba con 245 días disponibles** — cierto, y peligroso: alguien se para en esa pantalla y reclama días que ya se tomó. Un número que no se puede usar para decidir es peor que no mostrar ninguno.
>
> 🔴 **El arranque son DOS datos que escribe contabilidad y que el sistema no puede deducir:** el saldo a hoy (*"a Angela le quedan 12 días"*, que sale de sus registros sin hacer cuentas) y **la fecha de corte**. Van **juntos o ninguno** y lo obliga un CHECK: de la fecha depende qué se resta después — lo anterior al corte **ya está adentro** de ese 12, y volver a restarlo sería cobrarle dos veces los mismos días. Pedirle a contabilidad *"¿cuántos días tomó desde 2019?"* sería pedirle que reconstruya siete años: no lo haría nadie, y la pantalla quedaría vacía para siempre.
>
> ```
> saldo = saldo inicial − tomadas DESPUÉS del corte − ya pagadas DESPUÉS del corte + lo ganado entre el corte y hoy
> ```
>
> - **Lo ganado se mide contra el INGRESO, no contra el corte.** El ciclo de la ley está anclado al aniversario de entrada, así que *«lo ganado hasta hoy menos lo ganado hasta el corte»* respeta ese calendario; contar los 11 meses desde el corte lo correría para siempre. Por eso hace falta `fecha_ingreso` **además** del saldo, y por eso **no hay dos fórmulas** según qué dato haya: dos fórmulas son dos verdades, y el día que se separan nadie sabe cuál vale.
> - **La ley: 30 días por cada 11 MESES trabajados** (once, no doce — no es un typo que alguien deba "arreglar"). El bloque en curso prorratea 30 ÷ 11 por mes cumplido y **se TRUNCA**: mostrar un día de más habilita a alguien a irse un día que todavía no ganó, y eso se paga en plata; un día de menos se corrige solo al mes siguiente.
> - 🔴 **Las «ya pagadas» TAMBIÉN bajan del saldo.** El derecho se consumió igual: se cobró en vez de disfrutarse. Se llevan en un contador aparte por una sola razón —quien mire el renglón tiene que distinguir los días que descansó de los que le pagaron—, pero los dos restan.
> - 🩸 **Los días del saldo se cuentan de CALENDARIO, con domingos y feriados adentro** (`diasDeVacacion`), y **NO** con el filtro de «hábil y no feriado» de la planilla. No es un descuido: ese filtro contesta *¿qué días había jornada que pagar?* —una regla de PLATA—, y acá la pregunta es *¿qué días de derecho gastó?*, medida en meses corridos como los 30 días de la ley. Descontar solo los hábiles contra un techo de días corridos regalaría ~8 días por cada mes tomado.
> - **Medios sí, cuartos no.** `numeric(4,1)` más un CHECK de múltiplos de 0,5: la contadora lleva la planilla a mano en Excel y un 12,5 es más probable que lo contrario, pero un 12,3 no es un dato, es un dedo pesado. ⚠️ El medio día entra **solo por el arranque**: lo ganado sigue truncando a día entero y los días tomados son de calendario, así que la única fuente de una coma en toda la cadena es el número que escribe contabilidad. El tipo se cambió con la columna **VACÍA**, que es cuando sale gratis: con 36 fichas cargadas habría sido una migración sobre datos vivos de una planilla.
> - 🔴 **Sin los dos datos NO HAY SALDO. Ni cero, ni un número grande.** `saldo` es `number | null` y ese `null` no se confunde con un `0`: a quien le falte la fecha de ingreso o el saldo inicial **aparece en la lista diciendo cuál de los dos le falta** — que además es la acción que hay que hacer.
>
> ### ⚠️ EL MECANISMO ESTÁ VIVO Y ESPERANDO A CONTABILIDAD
>
> Medido el 1-sep-2026: **2 vacaciones cargadas** (las dos de ELOYN MENDOZA) y **1 sola ficha de 40 con saldo**. No es que no funcione: el número de arranque lo tiene que escribir contabilidad ficha por ficha, y hasta que lo haga la pantalla dice «Falta el saldo» en vez de mostrar uno inventado. **Las tres migraciones son aditivas y la app funciona sin ninguna** (patrón `cols-opcionales`): sin la tabla, `leerVacaciones` devuelve cero filas y la pestaña lo dice en ámbar; sin las columnas, nadie tiene saldo y Configuración avisa qué archivo falta correr.
>
> ### Candados
>
> `asistencia-vacaciones.test.ts` · `asistencia-saldo-vacaciones.test.ts` · `asistencia-vacaciones-decidir.test.ts` · `asistencia-vacaciones-pantalla.test.tsx` · `asistencia-vacaciones-saldo.test.tsx`.

> ### ⚠️ SUPERADO EN PARTE — la PESTAÑA se apagó el 1-sep-2026 (el motor, NO)
>
> Daniel, textual: *«olvida lo de las vacaciones por ahora, quitalo del ERP para no enrredar»*. Y el motivo, con la pantalla delante: *«me enrreda lo de Ya se le pagó / Se le pagan estos días»*.
>
> **Es un defecto de REDACCIÓN, no de lógica.** El título del interruptor es el ESTADO y la línea de abajo es la CONSECUENCIA de cómo está la casilla ahora (`efectoDelInterruptor` sí cambia al marcarla), pero desmarcadas las dos frases se leen como una sola que se contradice: *«Ya se le pagó / Se le pagan estos días»*. Se le ofrecieron las dos salidas —arreglar el texto ahora u ocultar la pestaña mientras se trabaja el flujo de generar y cerrar la planilla— y eligió **ocultarla**. El texto quedó **sin tocar**: cambiar la redacción de una pantalla que nadie ve es un cambio que nadie revisa. El arreglo propuesto (*«¿Ya cobró estos días antes?»* con la consecuencia visible SOLO al marcar) está escrito pegado a `PESTANAS_OCULTAS`, que es donde lo va a leer quien la reactive.
>
> - **Se apagó la PANTALLA, no el trabajo.** `PESTANAS_OCULTAS = ["vacaciones"]` en `src/lib/asistencia/roles.ts`; `vePestana` la deja fuera para todos, admin incluido. `VacacionesTab.tsx`, la ruta `/api/asistencia/vacaciones`, la tabla y las migraciones quedan **enteros**, y la pestaña sigue declarada y montada en `AsistenciaClient`. **Volver a encenderla es borrar una línea.**
> - 🔴 **EL MOTOR SIGUE HONRANDO LAS VACACIONES CARGADAS, y ése era todo el riesgo.** Hay 2 filas vivas, las dos de ELOYN MENDOZA (29, fashion_wear): 16-jul→13-ago y 14-ago, ninguna «ya se le pagó». Entender «quitar» como *dejar de leer `asistencia_vacaciones`* le habría convertido esos días en AUSENCIA —ella no marca— y le habría comido una quincena entera **en silencio**. No se tocó una línea de `reporte.ts`, `planilla.ts`, `vacaciones.ts`, `saldo-vacaciones.ts` ni de `/api/asistencia/planilla`, y el barrido de `asistencia-vacaciones-decidir.test.ts` sigue exigiendo `leerVacaciones` en todo lo que arma la planilla contra producción.
> - **Un `?tab=vacaciones` de un marcador cae en la pestaña por defecto**, no en blanco: la pantalla resuelve la URL contra `visibles`, que ya no la contiene.
> - **Los tests de la pantalla apagada NO se borraron**: `describe.skip` con la nota de qué garantizaban y cómo reactivarlos (`asistencia-vacaciones-pantalla.test.tsx`, solo el bloque de `VacacionesTab` — los de Reporte y Planilla siguen corriendo, y son la prueba de que el motor no cambió; `asistencia-vacaciones-saldo.test.tsx`, entero). Borrarlos habría dejado sin definición escrita lo que esa pantalla tenía que cumplir.
> - **Candado nuevo, en la dirección contraria:** `asistencia-pestanas.test.ts` ahora exige que **nadie** la vea, que el componente y la ruta **sigan existiendo**, y —lo que importa— corre el motor sobre el rango REAL de ELOYN y verifica **en dólares** que no se le descuenta nada: con la vacación viva `ausencias = $0.00` y neto idéntico a la quincena trabajada entera; sin ella, 9 ausencias de día completo. Medido por mutación (`const vacaciones = []` en `reporte.ts`): esos dos casos se ponen rojos.


---

## 🔴 Asistencia — JULIO GARAY COBRA EN DOS EMPRESAS, y la rata sale del sueldo COMPLETO (27-ago-2026)

> La contadora, textual: *«El salario de Julio es 1000 y están divididos en dos empresas. 800 en Vistana, sobre los cuales se aplican seguro social y educativo. Los otros 200 están en Fashion Wear. Aquí es servicios profesionales y es aquí donde se le pagan las horas extras. **En ambas empresas su rata por hora es 5.77**»*.
>
> 🩸 **EL OBSTÁCULO, MEDIDO CONTRA PRODUCCIÓN:** `asistencia_personas` tiene `PRIMARY KEY (empleado_codigo)` y **una persona = una fila = UNA empresa** — `empresa`, `salario_mensual`, `servicio_profesional` y `paga_seguros` son todos POR PERSONA. Julio estaba entero en Vistana con $1.000, y sus horas extra pagaban el 11 % de seguros que en Fashion Wear no les corresponde.
>
> ### 🔴 NO SE TOCÓ LA LLAVE DE `asistencia_personas`
>
> Es LA tabla del módulo —40 fichas— y el motor entero (el directorio, las justificaciones, las vacaciones, las correcciones, las aprobaciones) asume **una ficha por código**. Partirla en dos filas rompería esa suposición en veinte lugares a la vez, y diecinueve no tienen nada que ver con el sueldo. **El reparto CUELGA de la ficha** (`asistencia_reparto_empresa`, una fila por empresa): la ficha sigue siendo UNA, y lo que se parte es el PAGO.
>
> ### 🔴 LA RATA SALE DEL SUELDO COMPLETO, Y ES TODO EL PUNTO
>
> `$1.000 × 12 ÷ 52 ÷ 40 = 5,769…` → **$5,77**, la misma en las dos. Por eso `asistencia_personas.salario_mensual` **SIGUE SIENDO EL TOTAL ($1.000)** y la tabla nueva dice lo que paga cada empresa. `calcularDinero` recibe DOS números: el mensual COMPLETO —de donde sale la rata— y `salarioDeLaParte`, que **solo** prorratea el quincenal. 🩸 Con la rata sacada de sus $200 su hora valdría **$1,15** y sus horas extra —que se pagan justamente ahí— se pagarían **CINCO VECES MENOS**. Hay mutación para eso.
>
> ### 🔴 CADA COLUMNA DEL RELOJ CAE EN UNA SOLA LÍNEA
>
> Es lo que hace que el reparto no invente ni pierda un centavo:
> - las **HORAS EXTRA** (1,25 · 1,50 · excedente) van a la parte marcada `paga_horas_extra`, y a ninguna otra;
> - **TODO EL RESTO DEL RELOJ** —domingos, feriados, tardanzas, ausencias, vacaciones ya pagadas—, los **montos escritos a mano** y la **base propia de seguros** van a la parte **PRINCIPAL** (la de `orden` más bajo), y a ninguna otra;
> - el **sueldo quincenal** se parte según el monto de cada parte.
>
> Sumando las partes se reconstruye la medición original **columna por columna**, y hay test que lo exige sobre las horas REALES de producción: una ausencia contada en las dos líneas se descontaría dos veces, y una hora extra en ninguna desaparecería en silencio. **El BRUTO TOTAL no se mueve** ($596,97 antes y después) — lo único que cambia es que la parte de Fashion Wear deja de pagar el 11 %.
>
> ⚠️ **LOS DOMINGOS Y FERIADOS SE QUEDAN EN LA PLANILLA, y es una decisión que hay que confirmar.** La contadora dijo *«horas extras»*, y en Panamá el recargo de domingo es otra cosa. Ante la duda se quedan del lado que SÍ paga seguros —retener de más se ve en el neto y se reclama el mismo día; no retener se descubre meses después cuando la Caja pide lo que no se retuvo—, la misma asimetría de `seguros.ts`. 🔴 **En la quincena del 16 al 31 de julio son $27,05 de recargo de domingo, o sea plata de verdad**: si la contadora dice que también van a Fashion Wear, es cambiar `COLUMNAS_EXTRA`/`COLUMNAS_RELOJ` en `planilla.ts` y nada más.
>
> ### 🔴 UN REPARTO QUE NO CUADRA SE RECHAZA ENTERO — y rechazar es volver a HOY
>
> `validarReparto` (`src/lib/asistencia/reparto.ts`, módulo PURO) exige **cinco** cosas, y cada una tapa una forma distinta de perder plata: **(1)** al menos DOS partes · **(2)** empresas válidas y sin repetir · **(3)** cada monto > 0 · **(4) 🔴 los montos SUMAN el salario de la ficha, al centavo** —es la que sostiene que la rata sea honesta— · **(5)** exactamente UNA parte paga las horas extra (ninguna las perdería en silencio; dos las pagarían dos veces).
> - **Ante cualquier duda se rechaza, y rechazar es la planilla de ayer**: UNA línea, con su sueldo entero y sus seguros.
> - 🔴 **Y SE DICE EN PANTALLA**, con el nombre y el motivo (*«Un sueldo repartido no se aplicó y se pagó en una sola planilla, como antes: JULIO GARAY (las partes suman $900.00 y el salario de la ficha es $1000.00)»*). Rechazar sí, esconder no.
> - **El motor NO se fía del llamador**: `partesUsables` (en `planilla.ts`, donde se decide la plata) vuelve a exigir lo estructural. Un test, un script o una ruta nueva que arme la ficha a mano no puede saltearlo.
>
> ### ⚠️ `paga_seguros = false` NO ES `servicio_profesional`
>
> La contadora llama *«servicios profesionales»* a lo de Fashion Wear, y lo único que eso significa acá es **sin los seguros**: esa parte **SÍ se paga** (es plata que Julio cobra). Marcar la ficha como `servicio_profesional` es otra cosa —deja a la persona SIN pago— y no se tocó. El interruptor de la FICHA sigue mandando: con `paga_seguros = false` en `asistencia_personas`, la parte **no puede encenderlos**.
>
> ### En pantalla
>
> - **Configuración › la ficha:** tarjeta **«Se reparte en»**, de SOLO LECTURA, con las dos empresas, su modo (*Planilla* / *Servicios profesionales*), el sello **Horas extra** y el **Total SUMADO** (no copiado del salario: es lo que deja ver de un vistazo que las partes cuadran). La regla la fija la contadora y un campo editable sería la forma de dejarlo mal puesto.
> - **Planilla:** chip **«sueldo repartido»** en la línea (escritorio y celular), con el detalle en el `title`. Sin él, un quincenal de $400 donde la ficha dice $1.000 se lee como un error de carga.
> - **Aprobaciones:** con dos líneas por código gana **la que paga las extras** — quien aprueba tiene que ver dónde caen. 🩸 Un `new Map(lineas.map(...))` a secas se queda con la última y en el orden natural eso coincide *por casualidad*; hay mutación con el orden INVERTIDO.
>
> ### ⚠️ DDL ADITIVA — **YA CORRIDA** (27-ago-2026), y la app funcionaba ANTES
>
> `supabase/migrations/20260901120000_asistencia_reparto_empresa.sql`. Patrón `cols-opcionales`: sin la tabla, `leerRepartos()` devuelve cero filas y `faltaTabla: true`, **nadie reparte nada, la planilla da lo de ayer hasta el centavo** y las dos pantallas dicen en ÁMBAR qué archivo falta. La degradación solo ocurre cuando el error **NOMBRA la tabla**.
> - **Siembra las dos filas de Julio en la MISMA migración**, a propósito: con la tabla vacía correr el archivo se leería como «no pasó nada».
> - **NO toca `asistencia_personas`** (el $1.000 se queda), ni `asistencia_planilla_manual`, ni una quincena vieja. Idempotente. **Para deshacerlo: borrar las 2 filas** y la planilla vuelve exactamente a lo de antes.
> - **Índice único parcial** `asistencia_reparto_una_extra`: una sola parte con `paga_horas_extra` por persona. Es la única de las cinco reglas que la base puede sostener sola, y sostenerla ahí vale porque decide dónde cae la plata de las extras.
> - **La lectura PAGINA** aunque hoy sean 2 filas: `db-max-rows` = 1000 corta EN SILENCIO, y acá un truncado no da error — da un reparto que **no suma**, así que el guard lo rechaza y la persona vuelve a una sola planilla. Se vería como «se deshizo solo».
>
> ### La medición contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-julio-dos-empresas.ts` (**solo lectura**; `EXIGIR=0` mide con las horas extra pagadas). Corre el motor **VIEJO** —sacado de `origin/main` AL EJECUTAR, con cierre transitivo de sus imports— y el NUEVO sobre los MISMOS datos, y lee el reparto **de la tabla de verdad**.
>
> | | PASADA 1 (sin reparto) | PASADA 2 (con reparto) | PASADA 3 |
> |---|---|---|---|
> | 4 quincenas × 3 empresas | **145 líneas · 3.516 cifras · 0 diferencias** | **5.940 cifras de OTRAS personas · 0 movidas** | **7 de 7 mutaciones del guard cazadas** |
>
> **JULIO, con las horas extra pagadas:**
>
> | quincena | ANTES (una línea) | Vistana | Fashion Wear | NETO |
> |---|---:|---:|---:|---:|
> | 1-15 jul | $559,43 | $356,00 | $228,58 | **$584,58** (+$25,15) |
> | 16-31 jul | $597,30 | $373,90 | $251,02 | **$624,92** (+$27,62) |
> | 1-15 ago | $521,31 | $346,00 | $196,97 | **$542,97** (+$21,66) |
> | 16-31 ago | $406,71 | $246,41 | $180,11 | **$426,52** (+$19,81) |
>
> 🔴 **El 1-15 de agosto reproduce el mockup aprobado AL CENTAVO**: Vistana `$400,00 · — · $44,00 · $356,00` y Fashion Wear `$100,00 · $96,97 · — · $196,97`, con **$5,77 de rata en las dos**. La suma del mockup ($552,97) no incluye los **$10,00 de mercancía** escritos a mano de esa quincena, que la planilla sí descuenta (y **una sola vez**, del lado del reloj) → neto real **$542,97**.
> - ⚠️ **El 16-31 de julio da $624,92 y el encargo decía $623,59.** La diferencia son **$1,33** y sale del **recargo de domingo ($27,05)**, que se quedó del lado que paga seguros (ver arriba). Ningún reparto de los que se probaron reproduce exactamente $623,59; el que reproduce el mockup aprobado es éste.
> - ⚠️ **En producción HOY las horas extra están en $0** para todo el mundo: `asistencia_horas_extra_aprobadas` existe y está **vacía**, así que se exige aprobación y no hay ni un día aprobado. Con ese estado real la diferencia es **+$11,00 por quincena** (el 11 % de los $100 de Fashion Wear). Los números de la tabla de arriba son con `EXIGIR=0`.
>
> ### Candados
>
> `src/__tests__/lib/asistencia-reparto.test.ts` (**55**, con las horas REALES de producción) y **`src/__tests__/api/asistencia-reparto-route.test.ts` (12), que LLAMA a la ruta real** — el bug que ese archivo caza es el de la JUNTURA (que la ruta lea la tabla y le pase el reparto al motor), que es el modo de fallo que este módulo ya pagó con `diaEnCurso`, y ningún test del motor lo puede ver. Ninguno de los dos busca texto en un archivo.
> - **Verificado por mutación, 28 de 28 cazadas y 0 sobrevivientes** (`bash scripts/_mutar-candados-reparto.sh`): la rata sale del monto de la parte · el quincenal ignora la parte · las horas no se reparten · las extras van al reloj · el resto del reloj se copia a las dos (ausencia doble) · los montos a mano se descuentan dos veces · la parte enciende los seguros que la ficha apagó · la base propia se aplica dos veces · la línea conserva la empresa de la ficha · el motor ignora el reparto · las dos líneas salen en TODOS los cuadros · el guard no exige la suma · deja pasar dos partes con extras · el quincenal de referencia muestra el sueldo completo · las cinco reglas del validador, una por una · el reloj lo lleva la última parte · el monto que llega como TEXTO se pierde · `partesDe` devuelve lo rechazado · lo rechazado se calla · la ruta no pasa el reparto · no dice lo rechazado · calla la migración faltante · Aprobaciones se queda con la última línea.
> - 🩸 **Tres cosas del verificador que este repo ya pagó y acá no se repiten:** restaura **por COPIA** (hay archivos NUEVOS y `git checkout` aborta el comando entero sin restaurar nada), el reemplazo es **LITERAL con python** (con `perl -0pi -e 's|A|B|'` un `||` del código real se des-escapa y **se come el archivo**, dejando un «SOBREVIVIÓ» falso), y **denuncia el patrón que no muta** en vez de darlo por cazado. Trae una **mutación de CONTROL** que a propósito no matchea: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido con el comentario adentro.
> - 🩸 **Cuatro mutaciones sobrevivieron en la primera corrida y las cuatro eran candados flojos, no producto sano:** la base propia solo se probaba con la parte que además tenía los seguros APAGADOS (así que su `null` salía por el otro camino), el reparto de una sola empresa se probaba con una parte que **también** violaba la regla 5, `quincenalReferencia` no lo miraba nadie, y el orden de Aprobaciones coincidía **por casualidad** con el `new Map` de última-gana.
>
> ### ⚠️ Lo que queda PENDIENTE
>
> - 🔴 **CONFIRMARLE A LA CONTADORA dónde van los DOMINGOS y FERIADOS.** Hoy se quedan en Vistana (con seguros). Son $27,05 en la quincena del 16 al 31 de julio.
> - **El reparto NO se puede crear ni editar desde la pantalla**: se muestra y se siembra por SQL. La regla la fija la contadora y los montos tienen que sumar el salario de la ficha; un editor invita a dejarlo mal puesto —y un reparto que no suma se rechaza entero, o sea que la persona volvería a cobrar en una sola planilla sin que nadie lo busque. Si Daniel quiere editarlo, es una decisión suya y va aparte.
> - **El Excel y el PDF de la planilla NO se tocaron**: salen por empresa, así que cada uno trae su parte con la empresa correcta, pero **no dicen que el sueldo está repartido**. Anotado, no construido.

## 🩸 Asistencia — EL AVISO «HORAS EXTRA SIN APROBAR» NUNCA SALÍA, y el cierre nunca frenó (3-sep-2026)

> El aviso ámbar de la planilla (*«N personas tienen horas extra sin aprobar: NO se pagaron en este cuadro»*) y el freno del cierre (`frenosParaCerrar`, `planilla-guardada.ts`) salían los dos de `extrasNoAprobadas(lineas)` (`aprobaciones.ts`), que filtraba `l.extraMedido.minutos > 0 && !l.extraAprobada`. Pero `extraMedido` se arma con `horasMedidas.extraDiurnoMin/extraNocturnoMin`, que `medirHoras` **ya dejó sin los días no aprobados** desde que la aprobación es por día (27-ago): lo no aprobado quedaba apartado en `h.extraNoAprobadaMin` y **nadie lo llevaba a la línea**. El comentario del motor decía la intención (*«Lo que NO se pagó, para poder DECIRLO. Rechazar sí, esconder no»*); el dato existía, solo no llegaba a donde se dice.
>
> - Todo sin aprobar → `extraMedido` es `null` → **ni aviso ni freno**. Se podía cerrar la quincena con extras sin aprobar, «sin forma de arreglarlo después sin reabrir» (texto del propio freno).
> - Aprobación parcial (martes sí, miércoles no) → el aviso decía los minutos **aprobados** como «sin aprobar». Número equivocado.
>
> **Arreglo.** `HorasPersona` conserva el total `extraNoAprobadaMin` y suma su desglose `extraNoAprobadaDiurnoMin` / `extraNoAprobadaNocturnoMin` (no se congelan: `COLUMNAS_HORAS` los excluye por nombre y la tabla guardada sigue con sus 20 columnas). `LineaPlanilla.extraNoAprobada = { minutos, diurnoMin, nocturnoMin, monto }` se calcula en `armarLinea` con `resumenExtra`, **la misma función** que valúa `extraMedido` — misma rata de la línea, 1,25 y 1,50 a centavos por columna—, así el monto del aviso es exactamente lo que se pagaría al aprobar. Con sueldo repartido sale **solo en la línea que paga las extras** (`horasEfectivas`, después de `repartirHoras`), así una persona no se cuenta dos veces. `extrasNoAprobadas` lee `extraNoAprobada`; `extraAprobada` sigue como rótulo. Para David (`lineaSinDinero`) viajan los minutos y **no el monto**, por la misma razón que `extraMedido`. **Cero cambio en lo que se paga**: solo cambian el aviso y el freno.
>
> **Medido contra producción, quincena 1–15 sep al 3-sep-2026** (`scripts/_medir-aviso-extras-sin-aprobar.ts`, solo lectura, mismos datos que la ruta): la tabla de aprobaciones tiene **0** días aprobados; el aviso viejo decía **0 personas**; el real dice **24 personas · 1.213 min = 20,22 h · $81,19** (Boston 11 · 7,74 h · $29,83 — Fashion Wear 8 · 9,14 h · $39,16 — Vistana 5 · 3,34 h · $12,20; todo diurno, nadie pasó las 18:00), y el cierre **sí frena**. ⚠️ Yulissa Juárez (servicio profesional, sin monto) también sale y frena — es lo que la pestaña Aprobaciones ya hacía con ella; si no debe frenar el cierre, lo decide Daniel.
>
> **Candados.** `src/__tests__/lib/planilla-aviso-extras-sin-aprobar.test.ts` (motor real, 16 casos: todo sin aprobar · parcial · control · sin exigir · monto al centavo contra el pago real · reparto). **21 mutaciones, 21 cazadas, 0 sobrevivientes** (`scripts/_mutar-candados-aviso-extras.sh`): el aviso vuelve a leer `extraMedido` · exige además algo pagado · dice los minutos pagados en parcial · pierde el monto · `medirHoras` deja de apartar (total y desglose) · aparta todo como diurno · paga todo aunque se exija · valúa con media rata · con la rata de los $200 · todo al 1,25 (dos formas) · el nocturno al 1,25 · sale en las dos líneas del reparto · llama «sin aprobar» a lo pagado · el reparto no lleva el desglose · media hora no se dice · el freno deja de frenar (dos formas) · el monto viaja a Boston · lo no aprobado no viaja a Boston.

## Asistencia — el aviso lleva a la persona, y el servicio profesional no genera horas extra (3-sep-2026, noche)

> Dos decisiones de Daniel sobre el aviso del mismo día, textual: *«si, no dejar cerrar hasta que se apruebe o se rechace, y al hacer clic en el mensaje de aprobacion, que te lleve al colaborador para aprobar»* y *«yulisa marca pero no deberia de calcular ya que es salario fijo, es solo para ver sus tardanzas y ausencias.»*
>
> ### A. El aviso lleva a la persona
>
> El aviso ámbar «N personas tienen horas extra sin aprobar: NO se pagaron en este cuadro» era un párrafo plano con los nombres adentro, y el freno rojo del cierre tenía un solo enlace «Ir a Aprobaciones». Ahora **cada persona es un enlace** («Fulano · 2,50 h · $12,20») a `/asistencia?tab=aprobaciones&persona=<código>&desde=…&hasta=…` (`enlaceAprobaciones`, `aprobaciones.ts`; `PARAM_PERSONA = "persona"`, medido contra `useUrlState(` en `src/app/asistencia`: solo existía `tab`). Va con `next/link` + `replace`: es el mismo nivel del breadcrumb, el Atrás no cicla por pestañas. El freno lleva ahora `codigos` (en el mismo orden que `quienes`) y cada nombre es un enlace; un 409 viejo sin `codigos` cae al enlace único de antes.
> - En **Aprobaciones**: el rango `desde/hasta` de la URL manda sobre el recordado (`ultimoRango`); al cargar se abre el **primer día donde esa persona tiene extras SIN aprobar** (`primerDiaPendienteDe`: un día ya aprobado no cuenta), su fila se resalta (fondo ámbar, `aria-current="true"`) y se hace `scrollIntoView` una sola vez; arriba un chip «Mostrando a Fulano — ver a todos ×» que limpia `persona`. Si no tiene nada pendiente en el rango: «Fulano no tiene horas extra pendientes en este período.» 🔴 **No se filtra a los demás**: se ve todo, con la persona resaltada — esconder al resto es cómo se aprueba a uno y se olvida a veinte.
> - Candado: `src/__tests__/components/planilla-aviso-lleva-a-aprobaciones.test.tsx` (8 casos: los enlaces del aviso y del freno con el href exacto; en Aprobaciones el rango de la URL, el día correcto abierto, la fila resaltada y solo ésa, el chip y su limpieza, el «no tiene pendientes», y el CONTROL sin `persona`). **6 mutaciones a mano, 6 cazadas**: quitar `persona` del href · el freno sin enlaces por persona · no abrir el día · resaltar a todos los del día · abrir el primer día en que aparece aunque esté aprobado · el rango recordado pisa el de la URL.
>
> ### B. Servicio profesional: tardanzas y ausencias sí; horas extra NO
>
> `fueraDePlanilla` ya impedía pagarle, pero sus horas viajaban enteras «para poder decirlas» (postmortem del 13-ago: *«sus horas se miden igual»*). Medido el 3-sep, Yulissa Juárez (código 26, la única servicio profesional hoy) salía en el aviso con 0,72 h, **frenaba el cierre** de la quincena y la pestaña Aprobaciones la ofrecía para aprobar horas que nunca se iban a pagar. Daniel precisó cuál mitad se conserva.
> - **Motor** (`planilla.ts`): `sinHorasExtra(h)` deja en cero extra diurna/nocturna, excedente, lo no aprobado con su desglose, domingo y feriado; `armarLinea` la aplica a `horasMedidas` cuando `fueraDePlanilla`, ANTES de `extraMedido`/`extraNoAprobada`, así los dos quedan en `null` sin una segunda condición que pueda olvidarse; `extraAprobada` (el rótulo) dice `true`. Tardanza, ausencia, vacaciones, sábado y días trabajados pasan intactos. `armarDiasAprobacion` (`aprobaciones.ts`) salta las líneas `fueraDePlanilla`: si alguien la había aprobado antes, esas filas se **ignoran, no se borran**.
> - **Dónde se muestra** (medido): `PlanillaTab` ya no pintaba sus horas (fila gris con el motivo, `colSpan`); el **Excel de la planilla**, hoja «Horas», mostraba sus extras/domingo/feriado con número → ahora «—»; el PDF de la planilla solo tiene la tabla de plata (ya en blanco). El **Reporte** de asistencia (pantalla, Excel y PDF) mostraba «Extra (min)» para ella y la sumaba al total → `PersonaReporte.servicioProfesional?` lo pone la ruta `/api/asistencia/reporte` desde la ficha, y `cuentaHorasExtra` / `extraQueCuenta` (`reporte.ts`, definición única) deciden la raya y el total. El motor del reporte no se tocó. `EXPLICACION_SERVICIO_PROFESIONAL` (ficha, planilla, Excel) dice ahora «tardanzas y ausencias … ni se le cuentan horas extra … no entra a Aprobaciones».
> - «Tú decides» para servicio profesional **sigue igual**: `grupoDeLinea` devuelve `"fuera"` antes de mirar nada más y `totalizar` la cuenta aparte.
> - **Medido contra producción, quincena 1–15 sep** (`scripts/_medir-aviso-extras-sin-aprobar.ts`, solo lectura; ahora también lista quién es servicio profesional): 1 servicio profesional (26 YULISSA JUAREZ, Vistana). El aviso pasa de **24 personas · 1.213,22 min = 20,22 h · $81,19** a **23 · 1.169,73 min = 19,50 h · $81,19** (Vistana 5 → 4 personas, 3,34 h → 2,62 h; Boston 11 y Fashion Wear 8 sin cambio). El monto no se mueve porque el suyo era `null`. El cierre sigue frenando por los otros 23.
> - Candados: `planilla-aviso-extras-sin-aprobar.test.ts` sección **g** (7 casos: control sin la bandera, ni aviso ni freno, `null` y ceros, tardanza y ausencia idénticas a la persona sin la bandera, Aprobaciones no la ofrece, la aprobación vieja se ignora, la persona de al lado igual) · `aprobaciones-no-lista-servicio-profesional.test.ts` (la ruta real, `?aprobaciones=1`, dos personas que salieron a la misma hora) · `reporte-servicio-profesional-sin-extras.test.ts` (Excel y PDF del Reporte: «—» y el total sin ella) · `asistencia-servicio-profesional.test.ts` actualizado a la decisión nueva (antes exigía `extraDiurnoMin = 120`). `scripts/_mutar-candados-aviso-extras.sh`: **26 mutaciones, 26 cazadas, 0 sobrevivientes** — los 21 de antes siguen cazados, más 5: quitar el `if` de servicio profesional · que también deje de contar tardanzas y ausencias · seguir contando domingo/feriado · el rótulo diciendo que le quedó algo sin aprobar · Aprobaciones volviéndola a ofrecer.


---

## Lo que decía CLAUDE.md hasta el 14-sep-2026 (movido acá, verbatim)

> El 14-sep-2026 CLAUDE.md pasaba de 333 mil caracteres (el tope del harness es 150 mil) y las instrucciones se cortaban a la mitad. Se dejó ahí un resumen de las reglas vigentes y el texto completo —mediciones, citas de Daniel, candados y mutaciones— se movió acá sin cambiar una palabra.

### Asistencia y planilla — [docs/postmortems/asistencia-planilla.md](docs/postmortems/asistencia-planilla.md)

- 🔴 **Son «COLABORADORES», no «personas»** (10-sep-2026). Daniel, textual: *«no lo llames personas, sino colaboradores»*. Con `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO` prendido, la pestaña que abre el módulo se rotula **«Colaboradores»** (`?tab=colaboradores`; era «Personas» esa misma mañana) y la página de cada quien vive en **`/asistencia/colaboradores/[codigo]`**. Lo viejo sigue llegando: `?tab=personas` (y `?tab=configuracion` · `?tab=vacaciones`) caen en esa pestaña por la MUDANZA del módulo puro, y `/asistencia/personas/:codigo` redirige **307** con la query intacta desde `next.config.js`. Todo texto de pantalla, Excel, PDF y avisos del módulo dice colaborador/es («N colaboradores tienen horas extra sin aprobar», columna «Colaborador», «+ Nuevo colaborador», «Elige al colaborador»). ⚠️ **NO cambian** los identificadores (`asistencia_personas`, `persona-en-el-centro.ts`, `PersonaPagina`, `RUTA_PERSONAS`, el `persona=<código>` de Aprobaciones) ni las frases donde «persona» es «un humano decide» («lo decide una persona»). Candado: `asistencia-colaboradores-no-personas.test.ts` (rótulo, mudanza, redirect y barrido de «Personas»); 13 candados cambiaron de texto con nota fechada, ninguno se borró.
- 🔴 **DOS CHIPS EN LA LISTA DE COLABORADORES: «Falta para pagar» y «Falta completar»** (10-sep-2026). Daniel, textual: *«veo falta configurar 4 y sin saldo bastantes, todos deben de estar en sin configurar no?»* → sí, y separados **por si el dato que falta hace que la quincena salga mal**. «Falta para pagar» = sin ficha (código del reloj sin nombre) · sin empresa · sin salario (salvo servicio profesional) · sin horario (salvo quien cobra fijo y no marca). «Falta completar» = sin cargo · sin cédula · sin saldo de vacaciones (**los dos datos**: saldo + fecha de corte) · sin fecha de ingreso. Solo ACTIVOS; uno puede estar en los dos; el chip en cero **no se dibuja**. Reemplazan a «Falta configurar» (solo ficha y salario) y a «Sin saldo». La regla vive en **`src/lib/asistencia/que-le-falta.ts`** (`queLeFalta(ficha) → { paraPagar, completar }`, `textoFaltantes`) y la fila lo dice en texto corto debajo del nombre, lo de pagar primero («Falta horario, cargo y cédula»), **sin chip «Falta» encima**. El servidor manda `tieneHorario` (¿hay fila en `asistencia_horarios`?) y **falla abierto**: sin lectura, `null`, y no se acusa a nadie. ⚠️ Un código sin ficha cuenta solo en «para pagar» y dice «Falta ficha»: sin ficha no hay cargo ni cédula que revisar. **Medido contra producción** (`scripts/_medir-falta-configurar.ts`): 47 activos · ANTES «Falta configurar (10)» + «Sin saldo (45)» · DESPUÉS «Falta para pagar (11)» + «Falta completar (37)», 1 en los dos (Enrique Sanchez, sin horario). Nada de lo que se guarda cambia. Candado: `asistencia-falta-configurar.test.ts`; `persona-en-el-centro` («Sin saldo» → «Falta completar») y `asistencia-poda-textos` cambiaron de texto con nota fechada.
- 🔴 **Las 7 pantallas revisadas por Daniel (10-sep-2026, tarde)** — ocho arreglos y una carga. **(1)** Los totales del Reporte se muestran con dos decimales (`fmtMin`, eran `9544.499999999998`): solo PRESENTACIÓN. **Verificado**: la plata de la planilla se suma a centavos en cada paso (`totalizar` → `centavos(t.x + d.x)`), el cierre redondea (`totalesDe`), y Excel/PDF/comprobante leen `d.totales` sin re-sumar — **ningún total de pago se armaba con flotantes sin redondear**. **(2)** El Reporte capitaliza los nombres como la lista (`capitalizarNombre`; solo cómo se muestra). **(3)** «Justificaciones del período» no se dibuja sin justificaciones: el enlace vive en `JustificacionesDelPeriodo`, que devuelve `null` vacío o cargando. **(4)** Un código sin ficha muestra «—» en Jornada. **(5)** Los avisos del reloj son **UNA línea por reloj** (Daniel: *«debe de ser más chico, que no estorbe tanto»*): punto · nombre (si hay dos) · título · estado del pedido; el párrafo explicativo pasó a un «?» con `title`; el error de un reloj sigue a la vista; el botón se queda; nada de la lógica cambió. **(6)** **El aviso «QUÉ CAMBIÓ» se marca visto AL MOSTRARSE**, no al cerrarlo (Daniel: *«se muestra una vez y se va solo al cerrarlo; si no lo cierran, no se vuelve a mostrar»*): `marcarVistas` en `NovedadesAviso` anota en `localStorage` y en `novedades_vistas` al dibujarse (mismo mecanismo, sin tabla nueva); la × sigue apagándola en el acto; solo se anota lo que de verdad se dibuja. **(7)** Asistencia › Préstamos: la columna «Descuento a terceros» **solo cuando alguien lo tiene** (`hayTerceros`), y la tarjeta del celular lo dice cuando el saldo > 0; la página del colaborador ya desglosaba solo las cuentas con saldo. **(8)** 🔴 **EL ALMUERZO ES POR EMPRESA**: `ALMUERZO_POR_EMPRESA` (`config.ts`) = 30 en las tres de siempre, **60 en Multifashion** (Daniel: *«entrada 10am, una hora de almuerzo»*, que choca con el *«siempre es fijo 30 mins»* del 13-ago y se resuelve como `EXTRA_AUTOMATICO_POR_EMPRESA`); sigue **sin casilla**: el PUT de Horarios escribe el de la empresa de la ficha (y conserva la entrada guardada: Multifashion entra a las 10:00), el motor sigue leyendo la columna por persona, y las pantallas y papeles dicen «30 minutos (60 en Multifashion)» (`textoAlmuerzo()`). **Medido contra producción antes y después** (`scripts/_medir-almuerzo-por-empresa.ts`, quincena 1–15 sep, 45 colaboradores): **0 diferencias**. Candados: `asistencia-siete-pantallas.test.ts` · `novedades-una-vez.test.tsx`; tres cambiaron con nota fechada (`persona-en-el-centro`, `asistencia-poda-textos`, `asistencia-almuerzo-fijo`). **(9)** Las **5 fichas de Multifashion** (301–305) y sus horarios (10:00 → 19:00, almuerzo 60) se cargaron en producción el 10-sep-2026 con `scripts/_cargar-acs-fichas.mjs` (idempotente), única escritura aprobada por Daniel (*«a los de multifashion que te mandé la foto configúralos»*); salario NULL hasta que la contable lo llene.
- 🔴 **La lista de colaboradores y la Planilla, con el mockup que aprobó Daniel (10-sep-2026, tarde; puntos 7–10).** En la lista (`ConfiguracionTab.tsx`, la MISMA tabla): **(7)** «Falta el saldo» deja de ir en rojo — la celda Vacaciones dice **`—`** gris sin saldo cargado y «N días» con saldo (Daniel: *«un rojo que sale siempre no avisa nada»*); que falta lo dice el chip «Falta completar» y la columna nueva. **(8)** La columna **«Rata / hora» salió de la lista**; el dato vive en la página de cada colaborador (`datosDeLaFicha` → «Rata por hora», pegado al salario). El cálculo no se tocó. **(9)** La columna **«Estado» (Listo / Falta) se reemplazó por «Qué falta»**, que dibuja `lineasQueFalta(queLeFalta(p))`: lo de pagar en **rojo** («Para pagar: empresa, salario, horario»), lo de completar en **gris** («Completar: cargo, cédula»), **vacía** cuando no falta nada; un código sin ficha dice lo que le falta para cobrar (empresa, salario, horario), no la palabra «ficha». Nada de dos columnas diciendo lo mismo, y el rojo largo de Vacaciones («Faltan la fecha de ingreso y el saldo») desapareció. **(10)** En Planilla (`PlanillaTab.tsx`) **la quincena se elige con DOS botones** —«1 – 15 sep» y «16 – 30 sep», el mes en curso de Panamá y el último día REAL del mes— más **«Otro rango ⌄»**, que es el calendario de siempre (`RangoFechas` con `textoVacio`); módulo puro `src/lib/asistencia/elegir-quincena.ts`. **«Cortar el reloj el» se ve DESDE EL INICIO**, con el corte propuesto ya puesto (13 o 28, `corteSugerido`) y una frase corta («Del 14 al 15 se paga normal y se ajusta en la siguiente.»); vacío = quincena entera, como siempre. «Generar» negro. **Excel / PDF / Comprobantes solo con la planilla ya generada.** 🔴 **Lo que se guarda y lo que se calcula NO cambia**: los botones ponen el mismo `desde`/`hasta`/`corte` que ponía el calendario y `generar` arma el MISMO pedido — hay candado que compara las dos URL. Candados: `asistencia-lista-que-falta.test.tsx` · `planilla-elegir-quincena.test.tsx`; cambiaron con nota fechada `persona-en-el-centro` (rejilla y «rata»), `asistencia-falta-configurar` (columna en vez de texto bajo el nombre), `asistencia-planilla-cerrar-quincena` (el calendario ya no va en línea) y `asistencia-planilla-solo-rango` (lo elegido se ve en el botón prendido).
- 🔴 **LO QUE DEJÓ DEFINIDO EL BACKTEST CONTRA LOS EXCEL DE LA CONTABLE (10-sep-2026, noche).** Daniel, textual: *«a, sí. b, se descuenta obvio. c, se paga días trabajados. kener 40h, reloj»*, *«ISR a mano por ahora, quién aprueba horas extra de cada empresa: daniel y contabilidad en todas las empresas incluyendo boston, david solo boston»*, y corrigiendo: *«bodega también aprueba fashion wear y vistana. domingo también necesita aprobación»*, *«si salió 20 minutos antes no debería de haber tolerancia»*. **(1)** 🩸 **El domingo y el feriado trabajados NO se podían aprobar**: Aprobaciones solo ofrecía la hora extra de lunes a viernes, así que se perdían EN SILENCIO (5 personas el domingo 26-jul y 7 el 23-ago-2026; la contable pagó $90,38 y $223,88 de recargo, el sistema $0). Ahora `diasConExtra` los OFRECE (con `tipo` domingo/feriado y su etiqueta en la pantalla), el aviso ámbar y el freno del cierre los cuentan (`extraNoAprobadaDomFerMin`, valuado con `recargoDomingoFeriado`), y **siguen necesitando aprobación**: aprobado se paga, no aprobado no se paga pero se ve. **(2)** **Salir antes de la hora se descuenta desde el minuto uno**: `salidaTempranaMin` (sin tolerancia — los 10 min de gracia son SOLO de la entrada) × valor del minuto = `DineroLinea.salidaTemprana`, columna propia en Planilla, Excel, PDF, comprobante y el cierre (`salida_temprana`, migración `20261104120000`, **aplicada**). **(3)** 🔴 **Quien entra (o sale) a mitad de la quincena cobra los DÍAS TRABAJADOS**: `sueldo quincenal ÷ hábiles (L–V) de la quincena × hábiles desde que entró (o hasta que salió)` (`src/lib/asistencia/prorrateo-ingreso.ts`, factor compuesto con el del rango libre), dicho al lado del nombre («entró el 27 de julio de 2026: 5 de 12 días hábiles») y congelado en el cierre (`prorrateo`). **Reemplaza a la regla del 25-ago** («ni completo ni prorrateado: Tú decides»; `asistencia-dias-que-no-pasaron` cambió de dirección con nota, y sigue exigiendo que Yeishka NO cobre $300 por 6 días). 🔴 **El día vale sueldo mensual ÷ 26** (esa misma noche Daniel eligió «a»: la costumbre de Panamá y lo que la contable ya paga; `DIAS_PAGADOS_POR_MES`, factor `días ÷ 13` sobre el quincenal). Caso de control: Yeritza (51), 5 días → **$115,38** con $600. La primera versión dividía el quincenal entre los hábiles de la quincena ($125,00) y cambió de dirección con nota. **(4)** Las horas extra son EXACTAS del reloj (`extraMin = brutoSeg / 60`, sin cuartos) — verificado, no cambió nada. **(5)** Aprobadores (`asistencia_aprobador_empresa`, migración `20261103120000`, **aplicada**, solo INSERT): daniel y Contabilidad en las cuatro, david solo Boston, **Bodega sigue en Fashion Wear y Vistana**. **(6)** Kener (17) pasó a **40 h** (`scripts/_ajustar-kener-jornada.mjs`, escritura aprobada): rata $2,88 → $3,46. **(7)** **El ISR sigue a mano.** 🔴 **Los centavos: «el sistema manda y ella se adapta»** (Daniel, 10-sep-2026, opción **a**). La contable usa sueldo ÷ 26 = $23,08 por día y seguros con 4 decimales; el sistema usa rata por hora × 8 y 2 decimales (`centavos`). **No se copia su convención**: 1–4 centavos de diferencia contra sus Excel viejos NO son un defecto y nadie lo «arregla». **Medido contra producción, quincena 16–30 ago 2026, 40 colaboradores** (`scripts/_medir-almuerzo-por-empresa.ts`): **6 cambian de neto** — 5 por salida temprana (**−$68,08**: Andrea 16 −11,93 · Eloyn 29 −21,51 · María B. 49 −14,18 · Yeishka 54 −5,69 · Angela 7 −14,77) y Kener +0,52 por la jornada; domingo/feriado pagados: 0 (los 7 del 23-ago quedan en Aprobaciones, pendientes); prorrateo: nadie en esa quincena. Candado: `asistencia-reglas-de-la-contable.test.ts`; `asistencia-planilla-guardada` (25 cifras / 22 del reloj), `asistencia-planilla-rango` y `asistencia-dias-que-no-pasaron` cambiaron con nota fechada. 🔴 **Ningún aviso del módulo manda a «Configuración» ni a «Personas»** (10-sep-2026, noche): la pestaña de las fichas se nombra desde `nombrePestanaFichas()` / `PESTANA_FICHAS` (`persona-en-el-centro.ts`: «Colaboradores» prendido, «Configuración» apagado) y el saldo de vacaciones dice «Se cargan en la ficha de cada colaborador» (`dondeSeCargaLaFicha()`). Barrido en `asistencia-pestana-fichas-y-26.test.ts`.
- 🔴 **«REPORTE» SE LLAMA «ASISTENCIA», EL ORDEN ES EL DEL TRABAJO, Y HAY UN SELECTOR DE EMPRESA PARA TODO EL MÓDULO (10-sep-2026, noche).** Daniel, textual: *«Reporte pasa a llamarse Asistencia. Tu orden»* y *«que reporte se pueda filtrar también por empresa y sacar un excel filtrado para revisar tardanzas, ausencia, etc. Aprobaciones también se debería de poder ver por empresa, todo por empresa no?»*. Pestañas (prendido): **Colaboradores · Asistencia · Aprobaciones · Planilla · Préstamos**; `?tab=reporte` (y `justificaciones`) caen en Asistencia por la MUDANZA; el aterrizaje sigue en Colaboradores. **UN selector** arriba de las pestañas (`src/lib/asistencia/empresa-para-todo.ts`): «Todas» + las 4 con nombre corto, en la URL (`?empresa=`, `replace`) y recordado (`fg_last_asistencia_empresa`); las opciones se **derivan del rol** (`empresasQueVe`: David solo Boston, sin «Todas»). Filtra Asistencia (la ruta `/api/asistencia/reporte?empresa=` filtra tabla, totales, «A revisar» y las justificaciones del período), Aprobaciones (la ruta de planilla ya filtraba las líneas; «Aprobar todo» y el aviso cuentan lo filtrado), Colaboradores (**los chips de empresa se fueron**; quedan Todos · Falta para pagar · Falta completar) y Préstamos (lista y total). **Planilla lo REUSA** como su selector (el suyo se retiró) y con «Todas» pide elegir una. Los Excel/PDF salen filtrados y el archivo lleva la empresa: `Asistencia-Boston-2026-09-01_2026-09-15.xlsx`, `Horas-extra-Todas-…`. 🔴 **Es un filtro de LECTURA**: nada de lo que se guarda cambia; y `POST /api/asistencia/aprobaciones?empresa=` **rechaza (400) cualquier código de otra empresa, todo o nada**. **Medido contra producción (1–15 sep 2026, `scripts/_medir-asistencia-por-empresa.ts`)**: el Excel con «Todas» trae **45 filas, las mismas que hoy**; Boston **20** (todas con empresa Boston) · Vistana 8 · Fashion Wear 7 · Multifashion 5 · sin ficha 5 = 45, cuadra. Candado: `asistencia-empresa-para-todo.test.ts`; cambiaron con nota fechada `persona-en-el-centro`, `asistencia-colaboradores-no-personas`, `asistencia-siete-pantallas`, `asistencia-planilla`, `asistencia-config`, `asistencia-planilla-cerrar-quincena`, `aprobaciones-excel` y `peso-muerto-js`.
- 🔴 **APROBAR NO ESPERA (10-sep-2026, noche).** Daniel: *«¿por qué al seleccionar un colaborador en aprobaciones se pone como un segundo cada vez que aprieto? no debería ser así»*. 🩸 Cada toque hacía el POST y después `await cargar()` —el período entero, recalculado— apagando toda la pantalla con `guardando` (~1 s por toque; con 115 pendientes, 115 s). Ahora es **optimista** (CLAUDE.md › UX): la casilla y los contadores cambian EN EL ACTO desde el estado local (`aplicarAprobacionLocal` / `previoDe` / `revertirAprobacionLocal`, puras en `aprobaciones.ts`), el POST va detrás, **solo la casilla que viaja se apaga** (`enVuelo`, claves `codigo|fecha`; dos toques = dos POST), y la recarga completa va **UNA sola vez, 1,5 s después del último toque** (`RECARGA_MS`, silenciosa: sin «Cargando…»). 🔴 **El servidor manda**: lo que devuelva reemplaza lo local — es lo que la planilla paga. Si el POST falla (o la ruta contesta `ok: false`), **la casilla vuelve a como estaba** y sale el aviso. Nada cambia en la ruta ni en lo que se guarda. Candado: `aprobaciones-optimista.test.tsx`.
- La quincena paga `salario ÷ 2`. Un **rango libre** prorratea por la fracción de QUINCENA cubierta y **no aplica los montos escritos a mano** — se dice en pantalla, en el Excel y en el PDF.
- **El almuerzo es fijo: 30 min** (`ALMUERZO_FIJO_MIN`). El PUT lo escribe mire lo que mire el cuerpo.
- Las marcaciones se miden **al segundo**; los umbrales de negocio siguen expresados en minutos.
- 🔴 **La marcación del reloj nunca se edita ni se borra.** La corrección va ENCIMA, en `asistencia_correcciones` (motivo obligatorio, firma de la sesión, deshacer = `anulada_en`). Barrido estático prohíbe `update`/`delete`/`upsert` sobre `asistencia_marcaciones`.
- **Los días que no pasaron no se cuentan** (`fecha >= diaEnCurso`, con el día de Panamá).
- 🔑 **Cuando el sistema no puede saber, se abstiene**: servicio profesional, ingreso o salida a mitad de período y justificación de período completo salen en «Tú decides» — sin número, fuera del total. (El rótulo se llamó «Decidilo vos» hasta el 1-sep-2026; se renombró por el candado de tuteo.) 🔴 **El servicio profesional no genera horas extra ni entra a Aprobaciones; solo tardanzas y ausencias** (3-sep-2026, Daniel: *«yulisa marca pero no deberia de calcular ya que es salario fijo, es solo para ver sus tardanzas y ausencias»*): `sinHorasExtra` en `armarLinea` deja en cero extra/excedente/domingo/feriado, `extraMedido` y `extraNoAprobada` en `null` —no sale en el aviso ámbar, no frena el cierre, `armarDiasAprobacion` no la ofrece— y en Planilla, Reporte, Excel y PDF esas columnas van con «—». Candados: `planilla-aviso-extras-sin-aprobar.test.ts` (g) · `aprobaciones-no-lista-servicio-profesional.test.ts` · `reporte-servicio-profesional-sin-extras.test.ts`.
- 🔴 **APROBACIONES ES UNA SOLA LISTA DE DECISIONES: SÍ · NO · PENDIENTE (10-sep-2026, noche).** Daniel, textual: *«Aprobaciones es una sola lista de decisiones. Cada renglón es una persona en la quincena, con sus horas extra sumadas. Dos botones: Sí y No. Se decide, y el renglón se va»* · *«Cobra horas extra por default a todos sí»* · *«y si quiero poder ver por día y por persona? con un tab arriba que diga colaborador / día»*. 🩸 Hasta ese día `aprobado` era true/false y **`false` significaba PENDIENTE**: no existía «lo miré y NO se paga», y lo que nadie marcaba quedaba en el aviso ámbar y frenando el cierre para siempre. Columna **`decision`** (`'si' | 'no' | NULL`, migración `20261105120000`, **aplicada**; backfill acotado: 391 de 555 filas con `aprobado = true` → `'si'`, 0 `'no'`). 🔴 **`aprobado` se conserva y se escribe DERIVADO** (`decision = 'si'` ⇔ `aprobado = true`): el motor paga exactamente como antes. Un **`no`** no se paga (igual que pendiente) y **deja de ser pendiente**: `diasExtraNo` en `medirHoras` no lo aparta en `extraNoAprobada*`, así que ni aviso ámbar ni freno del cierre; los 30 min automáticos de ACS se siguen pagando igual (son «los minutos que no hay que aprobar»). Pendiente = sin fila o `decision IS NULL`, y es lo ÚNICO que avisa y frena.
- 🔴 **Dos vistas, UNA fuente** (`lib/asistencia/aprobaciones-vistas.ts`, puro): **Colaborador** (abre por defecto) — un renglón por persona con «N días · H:MM h» y **Sí · No** que deciden TODOS sus días pendientes; el ⌄ abre sus días con Sí/No cada uno; domingo y feriado salen como un día más con su marca. **Día** — lo mismo agrupado por día (como era), con los mismos botones en el día y en la persona; solo lo pendiente. Control `Colaborador · Día` en la URL (`?vista=`) y recordado por usuario. Arriba «N por decidir · H:MM h» cuenta **renglones** (personas) en las dos vistas. Abajo, plegado, **«Ya decididas (N) ▸»** con nombre · Sí/No/«Sí y No» · horas · **«cambiar»** (los mismos días con su botón prendido: tocar el prendido vuelve a pendiente, tocar el otro cambia). 🔴 **Se decide, y el renglón se va** (optimista, mismo patrón del 10-sep). **«Aprobar todo» sigue** como **«Sí a todo lo pendiente»**; ⛔ **no existe «No a todo»**. La casilla se retiró; la fila por semana también (era una forma de seleccionar, no un dato). El deep link `?persona=` abre su renglón (o, en Día, su primer día pendiente) y lo resalta. Excel de Aprobaciones: columna **«Decisión»** (Sí / No / Pendiente) entre Estado y Aprobó, con el pie «N Sí · N No · N pendientes».
- 🔴 **La ficha tiene «¿Cobra horas extra?», en SÍ para todos** (`asistencia_personas.cobra_horas_extra boolean NOT NULL DEFAULT true`, misma migración; módulo `lib/asistencia/cobra-horas-extra.ts`; se edita en Editar › Excepciones de `/asistencia/colaboradores/[codigo]`; solo un `false` explícito apaga). Con **`false`**: no aparece en Aprobaciones ni en el aviso «N sin aprobar», no frena el cierre, y el motor le cierra la MISMA mitad que al servicio profesional (`sinHorasExtra`: extra, excedente, domingo y feriado en cero) — pero **SIGUE en planilla** con su quincenal, seguros y neto, y **tardanzas, ausencias y salida temprana se siguen contando**. La ficha lo marca en ámbar («No cobra horas extra»). Con la casilla encendida **nada cambia respecto a hoy** (candado: línea idéntica centavo por centavo).
- **Medido contra producción (solo lectura, `scripts/_medir-almuerzo-por-empresa.ts` antes y después, 1–15 sep 2026):** 45 colaboradores, 33 con neto (Vistana 7 · Fashion Wear 7 · Boston 19; los 5 de Multifashion sin salario), neto total **$8.853,42 = $8.853,42, 0 diferencias**.
- Candados: `aprobaciones-por-persona.test.ts` (27) · `aprobaciones-por-persona.test.tsx` (11); **19 mutaciones, 19 cazadas con 2 controles** (`scripts/_mutar-candados-aprobaciones-por-persona.sh`). Cuatro cambiaron de dirección con nota fechada, ninguno se borró: `asistencia-aprobaciones-pantalla` (de casillas por día a Sí/No por colaborador, con la vista Día como CONTROL), `aprobaciones-optimista` (el renglón se va; `previoDe` guarda la decisión), `planilla-aviso-lleva-a-aprobaciones` (abre su renglón; `?vista=dia` conserva el control de «el primer día pendiente») y `aprobaciones-excel` (12 columnas, `A1:L3`).
- 🔴 **El aviso «N personas tienen horas extra sin aprobar» y el freno del cierre llevan a la persona** (3-sep-2026, Daniel: *«al hacer clic en el mensaje de aprobacion, que te lleve al colaborador para aprobar»*): cada nombre es un enlace a `?tab=aprobaciones&persona=<código>&desde=…&hasta=…` (`enlaceAprobaciones`, `replace`: mismo nivel). La pestaña Aprobaciones toma el rango de la URL, abre el primer día que esa persona tiene sin aprobar, resalta su fila (`aria-current`) y muestra el chip «Mostrando a … — ver a todos ×». **No filtra a los demás.** Candado: `planilla-aviso-lleva-a-aprobaciones.test.tsx`.
- La **incapacidad justificada se paga**. «Trabajo fuera de la oficina» **no es una ausencia**: no descuenta y no genera extras.
- 🔴 **Una vacación NO es una justificación**: tabla (`asistencia_vacaciones`) y pestaña propias, y «Vacaciones» **no está** en la lista de motivos —ni en la de retirados— para que el desplegable no la ofrezca por la puerta de atrás.
- 🩸 **La pestaña Vacaciones se apagó y se volvió a encender el 1-sep-2026**: lo que enredaba era el TEXTO, no la pantalla. La casilla **pregunta** («¿Ya cobró estos días antes?») y la consecuencia se ve **solo al marcarla** (`efectoDelInterruptor`); no quedó ningún mecanismo de «pestañas apagadas».
- 🔴 **El motor honra las vacaciones cargadas pase lo que pase** — dejar de leer `asistencia_vacaciones` en el cálculo convierte esos días en ausencias y come una quincena en silencio (candado: `vacaciones-el-motor-las-honra.test.ts`).
- 🔴 **Un día de vacaciones no genera horas, ni tardanza, ni ausencia.** Las marcas de ese día se muestran, pero no entran en ninguna cuenta.
- Una vacación **sin marcar no cuesta nada** — el quincenal la cubre. El interruptor **«ya se le pagó» es lo ÚNICO que mueve plata**: se valúa como una ausencia de día completo (8 h × rata), solo en días hábiles no feriados, y se dice en pantalla a quién y cuánto no se le pagó.
- El **saldo de vacaciones arranca de dos datos que escribe contabilidad** (saldo + fecha de corte, juntos o ninguno por CHECK) y **sin los dos no hay saldo, ni cero**. Se gana 30 días por cada 11 meses, el período en curso se **trunca** a día entero y solo resta lo posterior al corte. **Medios días sí, cuartos no.**
- Un sueldo **repartido en dos empresas** saca la rata del **sueldo COMPLETO**; las partes tienen que sumar el salario de la ficha o el reparto se rechaza entero (y se dice en pantalla).
- 🔴 **El descuento de préstamo ENTRA SOLO a la planilla; ya no se aprueba (11-sep-2026).** Daniel, textual: *«quita lo de aprobación a préstamos, no es necesario»*. La cuota (préstamo y terceros, cada una capeada a SU saldo) entra a la casilla sola (`aplicarPrestamoEnLinea`, `lib/asistencia/prestamos-planilla.ts`): **lo escrito a mano manda, vacío = lo que propone el módulo**; va a `dinero`, nunca a `manuales`. Se retiraron el bloque «Préstamos por descontar», la ruta `POST /api/asistencia/prestamos` y el freno del cierre por préstamo; `asistencia_prestamo_aprobado` **no se dropea** (patrón `mayor_lineas`, sin lectores, con candado). Se avisa SOLO la última cuota («se le descuenta $40 y no su cuota de $45») y quien debe pero no está en el cuadro (no se le descuenta). 🩸 **«Ya descontado» mira el ORIGEN del pago**: CRISTIAM BLANCO canceló con $125 de LIQUIDACIÓN el 7-sep y la planilla se lo habría vuelto a quitar del sueldo. Medido 1–15 sep: **10 colaboradores, $495** que la planilla no descontaba por falta de «Aprobar». ⚠️ Hoy NO hay forma de «no descontar esta quincena» escribiendo un 0 (la columna es `NOT NULL DEFAULT 0` y el 0 se lee como vacío): decisión pendiente de Daniel. Candados: `asistencia-prestamo-planilla` · `planilla-prestamo-sin-aprobacion`.
- 🔴 **Las HORAS de una justificación solo van con «Constancia» (11-sep-2026).** Daniel: *«que se ponga rango de hora solamente en constancia, porque no siempre es todo el día, sino unas horas»*. `motivoAdmiteHoras` / `horasParaGuardar` (`permiso-horas.ts`); `JustificarForm` (la ficha y la fila del día) dibuja «De» y «Hasta» (`type="time"`) solo con Constancia; la ruta rechaza con 400 un motivo de día completo que llegue con horas; la pestaña vieja se alinea. El motor honra las horas guardadas sin mirar el motivo. Candado: `justificar-horas-solo-constancia`.
- 🔴 **La SALIDA TEMPRANA entra al ajuste del corte (11-sep-2026).** Daniel: *«la salida temprana incluirla»*. `CONCEPTOS_DEL_RELOJ` son **OCHO** (era siete: «Salida temprana» nació el 10-sep, después del corte, y quedaba afuera). Medido: Eloyn (29), 29–31 ago, **$11,83**. 🔴 **Y los SEGUROS se calculan sobre el bruto CON el ajuste** — Daniel: *«los seguros, va»* (Yulissa calcula 9,75 % y 1,25 % sobre todo lo ganado, extras incluidas). `aplicarAjusteEnLinea` recibe los porcentajes de las reglas y recalcula los dos seguros (positivo o negativo), respetando `paga_seguros` y la base propia. Medido 16–31 ago → 1–15 sep: cambian **4 netos** — Eloyn −$11,83, Luis Arroyo −$0,93, Alejandra Camaño +$0,08, Roxana Hernández +$0,08. Candado: Ana (+$0,49 / +$0,06) y Eloyn en `planilla-ajuste-por-concepto`.
- 🔴 **«Antes de cerrar»: UNA lista en vez de siete cajas (11-sep-2026, mockup aprobado).** Encabezado «Antes de cerrar · borrador, faltan N días hábiles» (o «quincena terminada»); arriba lo que hay que ARREGLAR con número en negrita y enlace a la derecha («N con horas extra sin decidir · H:MM h → Aprobaciones ›», «N códigos del reloj sin ficha → Colaboradores ›», «N sin hora de salida confirmada → Colaboradores ›»); abajo en gris lo informativo (el corte, los que no salen). Sin nombres sueltos («ver quiénes» los trae, cada uno con su enlace a su día), sin el párrafo del borrador y sin la caja de préstamos. «Todo listo para cerrar» cuando no falta nada. Los avisos **siguen viajando como datos** (Excel y PDF los leen igual). Botones: `Regenerar · Descargar ⌄ (Excel · PDF · Comprobantes)` y **Cerrar quincena** a la derecha; el chip dice «Corte 11 sep». Regla en `lib/asistencia/antes-de-cerrar.ts`; candado `planilla-antes-de-cerrar`.
- 🔴 **El corte de la quincena (día 13/28) y el ajuste de los días que quedaron sin medir ENTRAN EN LAS COLUMNAS DE SIEMPRE, cada cosa en la suya — nunca una línea neta (11-sep-2026).** La contadora (Yulissa), textual: *«no puedes netear las horas extras con las horas de tardanza o de ausencia porque valen diferente… debe poner lo que llegó en tardanza en tardanza y lo que llegó como extra en extra porque los valores de la rata por hora son diferentes porque una tiene recargo»*. Daniel: *«el ajuste separado como lo hace ella»* → *«sí»*. Medido en sus Excel: ella NO tiene columna de ajuste. Así que la extra diurna del 14–15 va a «Horas extra 1.25», la nocturna a «1.50», la tardanza a «Tardanzas», la ausencia a «Ausencias» — cada monto ya valuado por el motor con SU rata (`repartirAjuste` → `aplicarAjusteEnLinea`, `lib/asistencia/corte-quincena.ts`, aplicado en la ruta ANTES de totalizar, así `dinero.netoPagar` ES el neto que se paga y nadie lo vuelve a restar). La columna «Ajuste quincena anterior» se retiró de Planilla, Excel, PDF y comprobante; en su lugar, la celda lo dice en su `title`, el pie del cuadro/Excel/PDF/comprobante dice «Horas extra 1.25 y Tardanzas incluyen los días 14–15 sep, que la quincena anterior pagó sin medir», y el Excel gana la hoja «Ajuste anterior» (solo cuando hay ajuste). 🔴 **EL NETO POR PERSONA NO CAMBIA**: medido contra producción (16–31 ago con corte el 28 → días 29–31 ago → quincena 1–15 sep, las 3 empresas, 35 personas, 9 con ajuste): diferencia de neto **$0,00** y Σ signo × reparto = el ajuste viejo, al centavo. `ajusteDeDiasSinMedir` se conserva DERIVADA del reparto (el testigo `ajuste_anterior` del cierre sigue igual). ⚠️ Los seguros NO se recalculan sobre lo repartido (nunca lo hicieron) y ⚠️ **la salida temprana de esos días NO entra al ajuste** (`CONCEPTOS_DEL_RELOJ` son 7; medido: $11,83 de Eloyn el 29–31 ago) — las dos son decisiones pendientes de Daniel. Candados: `planilla-ajuste-por-concepto.test.ts`; **23 mutaciones** (`scripts/_mutar-candados-ajuste-por-concepto.sh`); medición `scripts/_medir-ajuste-por-concepto.ts`. Tres candados cambiaron de dirección con nota fechada, ninguno se borró: `planilla-unida-comprobante` (bloque C), `planilla-unida-corte-y-cableado` (H e I) y `excel-encabezados-fila-1` (27 → 28 hojas).
- Panamá es **UTC−5 fijo**; los tests usan fechas fijas, nunca `new Date()`.
- 🔴 **O EL TOTAL SIGUE AL FILTRO, O NO HAY BUSCADOR — y Planilla eligió lo segundo (11-sep-2026).** Daniel: *«pon buscador en módulos o tabs que lo ameriten, como colaboradores por ejemplo»* → *«pon buscador a lo que normalmente llevaría buscador, no es tan complicado»*. **UN solo componente** (`src/components/BuscadorDeLista.tsx`) sobre el módulo puro `src/lib/buscar-en-lista.ts`, que es donde vive la regla. Filtra lo que **YA está cargado** —cero peticiones nuevas— por **subcadena exacta normalizada, NUNCA por parecido**; el texto vive en la URL (`?buscar=`, `replace`) con la **MISMA llave en todas**. 🩸 **La regla nació al revés**: el buscador tachaba renglones, el pie seguía sumando todo y una línea de letra chica lo explicaba. Daniel, al verlo en la Planilla: *«entonces no lo pongas en planilla»*. 🔑 Una lista recortada al lado de un total que no lo está hace dudar de cuál de los dos manda, y la nota al pie no arregla esa duda: la confiesa. Quedan **dos salidas y no una tercera** — **(a) el total sigue al filtro**, sumado sobre lo que se VE, con el conteo «3 de 12» al lado para que ese recorte no se lea como el de todos; **(b) no hay buscador**, cuando el total es plata que se PAGA. 🔴 **PLANILLA ES LA (b)**: su pie es la quincena que se cierra y baja al Excel, así que **no tiene buscador** y hay candado —incluido un barrido sobre `PlanillaTab.tsx`— que impide que vuelva. Su Excel, su PDF, sus comprobantes y el CIERRE siguen saliendo COMPLETOS. **Lo llevan, con la (a): Asistencia › Colaboradores · Asistencia › Préstamos · Asistencia › Aprobaciones › Colaborador · Caja Menuda (los gastos de un período: proveedor · categoría · N° de recibo · monto) · Gastos (`/gastos-contabilidad`, las cuentas de UNA empresa: nombre · código · referencia) · Boston › Préstamos (31 fichas de tres empresas) · Plantilla Switch › Historial (140 descargas y creciendo 50-60/mes).** 🔴 **Lo que NUNCA se recorta es lo que SALE de la pantalla**: Excel, PDF y acciones en lote salen de la lista completa. La única excepción es un botón que **DIGA** a cuántos afecta: en **Aprobaciones**, sin búsqueda dice «Sí a todo lo pendiente» y manda todo lo pendiente de la empresa; con búsqueda pasa a **«Sí a los 3 que ves»** y manda exactamente esos tres (`rotuloDeLote` + `toquesDeEstos`) — las dos direcciones son plata y las dos tienen candado. ⚠️ **En Gastos, «en N documentos» desaparece mientras se busca**: un documento toca varias cuentas y ese número no se puede recortar; y **por N° interno no se puede buscar** porque el servidor agrupa por cuenta y ese dato no llega al navegador. ⚠️ **La regla de que los gastos de las 8 empresas nunca se suman entre sí NO se toca**: acá se ve UNA empresa. ⚠️ En **Caja Menuda** el bloque de arriba (Fondo · Gastado · Saldo) **no se recorta y es deliberado**: es el estado de la CAJA, no la suma de esas filas — un «Saldo» recortado sería un saldo falso; por eso la línea de la lista dice «3 de 41 gastos» pegada a su total. ⚠️ La pestaña **Asistencia** (`ReporteTab`), **Clientes** y el **⌘K** global buscan contra el SERVIDOR: otro camino, no pasan por acá. Candados: `asistencia-buscadores.test.tsx` · `buscador-caja-y-gastos.test.tsx`; **20 mutaciones, 20 cazadas** con 2 controles (`scripts/_mutar-candados-buscadores.sh`). Los casos de Planilla, el total de Préstamos y el botón de Aprobaciones **cambiaron de dirección con nota fechada; ninguno se borró**.

**Los defectos de la auditoría del 11-sep-2026 (Asistencia · Planilla), arreglados sin rediseñar.**
- 🔴 **«Ver sus días ›» de la ficha LLEVA a sus días.** 🩸 Mandaba `?tab=asistencia&desde&hasta&q=<código>` y la pestaña Asistencia no leía ninguno de los tres: aterrizaba en la lista de TODOS con el último rango guardado. Ahora `ReporteTab` lee `desde`, `hasta` y `q` de la URL UNA vez al montar, como Aprobaciones; **el rango de la URL le gana al recordado por dispositivo**; basura (rango al revés) se ignora. Candado: `asistencia-reporte-desde-la-ficha.test.tsx`.
- 🔴 **Dar de baja a alguien con deuda AVISA en la página de la persona.** 🩸 El aviso «Debe $X en Préstamos — descuéntalo de la liquidación» vivía solo en el panel de la lista vieja (`ConfiguracionTab`), que con `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO` prendido nunca se dibuja; el candado seguía verde porque era un barrido de TEXTO. Ahora el texto vive en UN módulo puro (`lib/asistencia/salida-con-deuda.ts`: `avisoSalidaConDeuda` · `avisoGuardadoConSalida`), la ficha lo muestra pegado a «Dar de baja…» (`FichaEditar`, prop `deudaPrestamo`), el aviso de guardado lo repite con nombre y monto (ámbar, 8 s) y la lista vieja usa el mismo texto. La deuda son las **tres cuentas** (`leerDeudaPorCodigo` → `calcularSaldoPrestamo`). Candado: `prestamos-salida-con-deuda.test.tsx` (ahora MONTA la ficha; cambió de dirección con nota fechada).
- 🔴 **El selector de empresa ofrece SOLO lo que su rol puede ver en el servidor.** 🩸 A `bodega` (Julio) le ofrecía las 4 y el servidor le recortaba a fashion_wear + vistana (`asistencia_aprobador_empresa`): eligiendo Boston la pestaña quedaba vacía sin decir por qué. Ruta nueva **`GET /api/asistencia/alcance`** (solo lectura, `null` = las cuatro, una lista = exactamente ésas; la MISMA `leerAlcanceAprobador` que recorta la planilla y las aprobaciones); `empresasQueVe(rol, alcance)` intersecta y David sigue siendo Boston. Hasta que conteste, lo del rol. Candados: `asistencia-empresa-para-todo.test.ts` (E) · `asistencia-alcance-route.test.ts`.
- 🔴 **«Descargar › Comprobantes» se nombra con el período del CUADRO** (`nombreDelCuadro(data)`), como el Excel y el PDF. 🩸 Usaba el del selector: con el cuadro viejo (ámbar «Los números que ves son de antes») salían los montos de una quincena dentro de un PDF llamado como la otra. Candado: `planilla-comprobantes-nombre-del-cuadro.test.ts`.
- 🔴 **Las columnas de dinero de la planilla salen de UN solo lugar**: `lib/asistencia/columnas-dinero-planilla.ts` (`COLUMNAS_DINERO_PLANILLA`, 19, `montosDePlanilla`), leído por `PlanillaTab` (encabezados y pie) y por `PlanillaBoston`. Ver el bloque de Boston.

**Corregir una hora en la pestaña Asistencia (11-sep-2026, mockup aprobado por Daniel).** Archivos: `CorregirMarcacionModal.tsx` · `ReporteTab.tsx` · `JustificarForm.tsx` · `JustificarDiaModal.tsx` · `lib/asistencia/motivos-frecuentes.ts` · `GET /api/asistencia/correcciones/motivos`.

- 🔴 **La hora se ELIGE con el selector del sistema, nunca texto libre** (`<input type="time" step="1">`: ruedita en el iPhone, flechas en la computadora, formato 24 h del módulo). Daniel: *«no me gusta texto libre para escribir la hora, enreda. algo que se sienta más seguro y que el formato vaya con el módulo»*. Precargada con la hora del reloj CON segundos. **Los segundos son opcionales** (`completarSegundos`): si vienen se respetan; si no vienen y la hora:minuto es la del reloj, se conservan los del reloj (13:22:02 no se vuelve 13:22:00); si la hora cambió, `:00`. Se fue «Como 8:00 o 17:04…».
- 🔴 **La ventana dice arriba, en UNA línea, «Yulissa Juárez · lun 31 ago · el reloj marcó 13:22:02»** (`encabezadoCorreccion`) y **se retiró el recuadro «Esto no se borra nunca…»**: eso se lee UNA vez en el «?» de la pestaña. Botones: «Cerrar» y «Guardar».
- 🔴 **El porqué es obligatorio, campo libre, con botones de los más usados que se ARMAN SOLOS** — Daniel: *«campo libre con opciones rápidas de las más usadas (autocrear a medida de tiempo poniendo las más usadas y eliminando si una no se usa, empezar vacíos)»*, *«máximo 4»*. Regla en `motivos-frecuentes.ts`: motivos guardados en `asistencia_correcciones` (anuladas incluidas) de los **últimos 90 días**, agrupados por clave (minúsculas, sin acentos, sin bordes — igualdad exacta, **nada por parecido**), los **4** más usados con **2 o más** usos, mostrando la **grafía más reciente**; sin historia, ningún botón. Tocar uno escribe en el campo; **el campo es lo que se guarda**. **Ninguna lista escrita a mano** y **ninguna tabla nueva**: la ruta es solo lectura. Medido 11-sep-2026: 8 correcciones → 3 botones («No marco salida» · «Boda de Daniel» · «ENFERMEDAD»).
- 🔴 **«Justificar» en la fila del día**, al lado de «Agregar hora», **sin menú «···»**: abre el **MISMO formulario** de la ficha del colaborador (`JustificarForm`, que SALIÓ de `SeccionJustificaciones`) con el colaborador y ESE día puestos (desde = hasta). Al guardar, la pestaña se refresca y el día deja de contar según la regla de siempre. No se ofrece en feriados, vacaciones ni días ya justificados (un control que no ofrece nada no se dibuja).
- 🩸 **Ningún aviso manda a «Horarios»**, que ya no es una pestaña: el aviso «N colaboradores no tienen su hora de salida confirmada» (Asistencia y Planilla) y «Cómo funciona» mandan a la ficha del colaborador vía `dondeSeCargaLaFicha()` + `PESTANA_FICHAS`.
- Medido antes y después (solo lectura, `scripts/_medir-almuerzo-por-empresa.ts`, quincena 1–15 sep 2026): 45 colaboradores, neto **$8.793,42 = $8.793,42**, 0 diferencias; 8 correcciones en la base, intactas.
- Candados: `asistencia-corregir-hora.test.ts` (30) · `asistencia-corregir-hora.test.tsx` (10); **31 mutaciones, 31 cazadas** con 2 controles (`scripts/_mutar-candados-asistencia-corregir-hora.sh`). Cambiaron de dirección con nota fechada, ninguno se borró: `poda-textos-explicaciones` (el rótulo es «Por qué»), `persona-en-el-centro` y `asistencia-siete-pantallas` (el formulario vive en `JustificarForm`; `JustificacionesDelPeriodo` recibe `refresco`).

### La Planilla Unida — TODO detrás de DOS interruptores, los dos APAGADOS (10-sep-2026)

> 🔴 **Al 10-sep-2026 los dos están APAGADOS en producción y el módulo es EXACTAMENTE el de siempre.** Se prenden con una **variable en Vercel + un despliegue** (Next reemplaza `NEXT_PUBLIC_*` como TEXTO al compilar: cambiarla en caliente no basta). Daniel los prende uno por uno.

| Interruptor | Dónde vive | Qué prende |
|---|---|---|
| `NEXT_PUBLIC_PLANILLA_UNIDA` | `src/lib/asistencia/planilla-unida.ts:26` | El comprobante de pago · el cierre que escribe el pago del préstamo (y reabrir que lo revierte) · el corte 13/28 y el «Ajuste quincena anterior» · **la pestaña Préstamos** y con ella la «una sola puerta» |
| `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO` | `src/lib/asistencia/persona-en-el-centro.ts:43` | El acomodo nuevo: 6 pestañas → 4 (5 con Préstamos), Personas primera, la página `/asistencia/personas/[codigo]` con Editar, el saldo de vacaciones como columna en Personas y las justificaciones del período en Reporte |

⚠️ **Lo que NO cuelga de un interruptor, porque es ADITIVO POR DATOS** — medido contra producción antes de subirlo, y hoy inerte: la tercera cuenta «Descuento a terceros» (0 movimientos; el daño dejó de proponer cuota y **0 de 31 empleados tenían cuota de daño**, así que esa casilla no se dibujaba), `asistencia_codigos_ignorados` (tabla vacía = nada escondido), **ACS como cuarta empresa** (los CHECK se ensancharon; producción tiene **0 personas** en `american_classic`) y sus **30 min de extra automáticos** (`EXTRA_AUTOMATICO_POR_EMPRESA`: las otras tres empresas están en **0**, y con 0 el motor da lo mismo campo por campo). Lo único que se VE hoy sin prender nada es una cuarta opción en el desplegable de conceptos de Préstamos, que no hace nada hasta que alguien la use.

- 🔴 **PRÉSTAMOS: UNA SOLA PUERTA, NUNCA DOS** (`src/lib/prestamos-una-puerta.ts`). Con `PLANILLA_UNIDA` **apagado** todo es lo de hoy: la ficha en el menú y el home, `/prestamos` sin redirigir, y Asistencia SIN pestaña de Préstamos. **Prendido**: la ficha se **FILTRA** de `getVisibleModules` (no se borra de `ALL_MODULES` — la key sigue en `role_permissions` y en `fg_users.modulos_override`), y `/prestamos` **EXACTO** redirige a `/asistencia?tab=prestamos` con **307 temporal** y la **query intacta**. 🔴 **`/prestamos/<id>` —los movimientos de una persona— NO redirige desde el 11-sep-2026** (Daniel: *«sí, arregla lo de préstamos»*): la pestaña la enlaza al tocar el nombre y esa página vuelve con «← Préstamos» (`enlaceVolverAPrestamos`). 🩸 Del 10 al 11-sep todo `/prestamos/*` rebotaba y se perdió la única pantalla con los movimientos y el saldo corrido. ⚠️ **`/api/prestamos/*` NO se redirige**: son las MISMAS rutas que usa la pestaña.
- 🔴 **La pestaña se autoriza por `PRESTAMOS_ROLES`, no por tener Asistencia** — si la autorizara `ASISTENCIA_ROLES`, mover la puerta le quitaría el módulo en silencio a quien tiene Préstamos y no tiene Asistencia. La lista se **deriva** (`PRESTAMOS_PESTANA_ROLES` = admin · contabilidad **+ secretaria, que entra SOLO A VER** y ya entraba antes). Bodega y vendedor, no. Lo de «solo ver» lo decide el SERVIDOR.
- **La sección Préstamos de la página de la persona ENLAZA, no duplica**: `enlaceAPrestamos()` manda a la pestaña (prendido) o a la lista de siempre (apagado); `enlaceAPrestamos(id)` a los movimientos de esa persona. No dibuja formulario ni hace POST.
- 🔴 **La pestaña Préstamos hace todo lo del módulo (11-sep-2026, mockup aprobado)**: «+ Nuevo préstamo» arriba (el MISMO `ElegirPersonaModal` + `NuevoMovimientoModal` del módulo; el formulario pregunta la **cuota** junto al monto —préstamo y terceros, no daño— y la escribe en la ficha en una segunda llamada; «Descuento a terceros» es la **cuarta tarjeta**), tocar el nombre abre `/prestamos/<id>`, «Anotar abono» por fila, la columna Terceros solo si alguien lo tiene y **los ceros con guion**. La secretaria sigue solo mirando (`puedeAnotar` lo decide el servidor). Con la planilla unida, la ficha ofrece «Anotar abono» y «+ Nuevo préstamo a …» y NO «Pago Quincenal» (el descuento lo escribe el cierre). Candado: `prestamos-pestana-completa`.
- 🔴 **El comprobante de pago** es UNO para las cuatro empresas, una hoja por persona, con TODOS los renglones aunque vayan en 0.00. Multifashion sale con **`MULTI FASHION HOLDING CORP.` · `155638923-2-2016`**, de la MISMA lista fiscal del estado de cuenta, **sin correo ni teléfono** (es otra entidad). Sin cargo cargado, el papel pone un guion: no se inventa.
- 🔴 **El pago del préstamo lo escribe el CIERRE**, con `await`, y **reabrir lo revierte** con soft delete. Cerrar dos veces no cobra dos veces (índice único). 🩸 Medido en la quincena 1-15 ago 2026: Préstamos tenía 9 descuentos por $360,00 y la casilla decía 7 por $265,00.
- 🔴 **El corte (13/28) NO prorratea el sueldo**: el período queda entero y solo se recorta **hasta dónde se MIDE el reloj** (`hastaReloj`). El **«Ajuste quincena anterior»** va en su **propio renglón**, nunca mezclado con la ausencia.
- 🔴 **En ACS aprueba `daniel`**, no la contadora — y **cerrar no sale de esa tabla**, así que ella sigue cerrando las cuatro empresas.
- **Los nombres se capitalizan** en pantalla con `src/lib/nombre-en-pantalla.ts` (UN solo lugar; Comisiones lo LLAMA en vez de tener el suyo). Solo cambia cómo se MUESTRA y **no se inventan acentos**: «LUIS PARAJON» → «Luis Parajon».
- **La foto de la cédula** vive en el bucket **PRIVADO `asistencia-cedulas`**; se guarda la RUTA y la URL se **firma al leer**, con vencimiento de una hora.
- Migraciones **aplicadas el 10-sep-2026**: `20261028120000_planilla_unida` · `20261029120000_terceros_tercera_cuenta` · `20261030120000_codigos_ignorados` · `20261031120000_acs_cuarta_empresa` · `20261101120000_acs_aprueba_daniel` · `20261102120000_cedula_foto_bucket`. Todas aditivas; los CHECK que se re-crean van **más anchos** (ninguna fila existente deja de ser válida). ⚠️ La única sentencia no aditiva es el `DELETE` de la fila `(Contabilidad, american_classic)` en `20261101120000`: **medido antes y después, 0 filas** — esa fila no existía, y Contabilidad conserva sus 3.
- Candados: `planilla-unida-comprobante` · `planilla-unida-cierre-prestamo` · `planilla-unida-corte-y-cableado` · `planilla-tres-descuentos` · `persona-en-el-centro` · `prestamos-una-puerta`. Mutación: **90/90** (`_mutar-candados-planilla-unida.sh`), **86/86** (`_mutar-candados-persona-en-el-centro.sh`) y **17/17** (`_mutar-candados-prestamos-una-puerta.sh`), cada uno con 2 controles.

## Lo que decía CLAUDE.md de los días afuera y el compensatorio, hasta el 18-sep-2026

🔴 **Movido acá el 18-sep-2026 porque `CLAUDE.md` llegó a su tope** (130.000
caracteres; el harness corta ahí en silencio). La REGLA sigue en `CLAUDE.md`, en
una línea; el detalle —las citas de Daniel, las mediciones y los candados— es
esto, verbatim:

- 🔴 **LOS DÍAS AFUERA SON «TRABAJO DE VENDEDOR» POR RANGO, DESDE LA FICHA, Y EL HORARIO 9–18 NO SE GUARDA (14-sep-2026).** Daniel, textual: *«a ellas cuando están afuera se les paga el día regular como si hubiesen trabajado las 8 horas, en horario de 9-6, con una hora de almuerzo»* · *«alguien va a decir cada quincena qué días estuvieron afuera, así como a Rodrigo, siempre y cuando no marquen»*. Las impulsadoras de Multifashion y Rodrigo (13). 🔑 **No nació un mecanismo**: el motivo ya no descuenta, no genera extras y `JustificarForm` (ficha y fila del día) ya tenía «Días» de-hasta. Lo que se agregó es la **nota debajo del motivo** (`notaDelMotivo` → `TEXTO_DIA_AFUERA`, `motivos.ts`): se paga como un día normal de 8 horas (9:00 a 18:00 con una hora de almuerzo) y cuenta solo los días sin marca. 🔴 **El horario NO se guarda**: 9–18 con almuerzo son las 8 horas que el quincenal ya paga cuando el día no se descuenta; y guardado como `hora_desde`/`hora_hasta` sería un PERMISO de horas, el día NO quedaría justificado y pasaría a ser AUSENCIA — 🩸 medido: Rodrigo tiene **dos filas del 14-ago-2026** con «Trabajo de vendedor» de 08:00 a 16:30, cargadas antes de que las horas se cerraran a Constancia, y ese día para el motor es un permiso, no un día afuera. `motivoAdmiteHoras` sigue siendo solo Constancia. 🔴 **Si marcó ese día, manda el reloj** (con marcas, `justificado` es solo un rótulo — conducta de siempre, ahora con candado). ⚠️ Medido 1–15 sep: Rodrigo ya tiene 7 justificaciones día por día (2, 3, 4, 7, 8, 9 y 10 de septiembre) y UNA sola marca (1-sep); con el rango, es una fila. Candados: `dias-afuera-y-compensatorio.test.ts` · `justificar-form-nota-motivo.test.tsx`.

- 🔴 **«COMPENSATORIO» ES EL SEXTO MOTIVO, AL LADO DE INCAPACIDAD, Y NO DESCUENTA (14-sep-2026).** Daniel, textual: *«compensatorio es cuando por ejemplo trabajan un día domingo y se le compensa ese día por uno de la semana»* · *«así como incapacidad, una opción de compensatorio de días que le debemos libres; al poner qué día será compensatorio, no se le descuente»*. `MOTIVO_COMPENSATORIO` en `MOTIVOS_JUSTIFICACION` (`Incapacidad · Compensatorio · Catástrofe · Escolares · Trabajo de vendedor · Constancia`), de día completo, se lee «Día compensatorio (libre que se le debía)» y no como «ausencia». **Sin migración**: la base no tiene CHECK sobre `motivo` (a propósito desde `20260825140000`). Sigue valiendo: *justificar significa que se paga*. Candado en `dias-afuera-y-compensatorio.test.ts`; `planilla-tres-descuentos` (H) y `asistencia-motivo-trabajo-fuera` cambiaron de «cinco» a «seis» con nota fechada. Verificación por mutación de los tres puntos: `scripts/_mutar-candados-dias-afuera-y-extras-sp.sh` (**20 mutaciones, 20 cazadas**, 2 controles).

---

## Marcar desde el teléfono sin señal — lo que está construido y lo que NO se puede probar (19-sep-2026)

Daniel, textual: *«supuestamente si se puede, busca la mejor manera de que se pueda para que ellas confíen»*. Auditado contra producción antes de proponer nada; el hallazgo fue que **ya estaba construido y andando**.

### Lo que hay

- **`src/lib/marcacion/cola-offline.ts`** (IndexedDB) guarda la marca en el teléfono y la manda sola: al volver el internet, al reabrir la app, al volver a la pestaña **y cada 60 segundos** mientras quede algo esperando.
- **Probado en producción el 15-sep-2026**: Daniel marcó dos veces en modo avión y las dos entraron solas, una a los 3 min y la otra a 1 min 41 s (`sin_senal = true` en las dos filas).
- El teléfono manda: `eventoId` (uuid suyo, con índice único `(dispositivo, evento_id)` que impide el duplicado), entrada/salida, `sinSenal`, su hora, lat/lng/precisión y la selfie (achicada a 1.000 px, calidad 0,8, ~70-90 KB) al bucket privado `asistencia-marcaciones`, que se barre a los 90 días dentro de `asistencia-vigia`.
- **Quién marca sale de la SESIÓN, nunca del pedido.** Selfie y ubicación obligatorias; tope de 2 marcas por día, comprobado en el servidor.

### La hora, que es lo que mueve plata

- **Con señal la pone el SERVIDOR** (hora de Panamá); la del teléfono queda de testigo.
- **Sin señal vale la del teléfono**, con dos frenos: **no más de 10 minutos adelantada** y **no más de 7 días vieja**. Además se guarda `created_at` (cuándo LLEGÓ) y el desfase entre `hora_telefono` y `ocurrio_en` se le avisa a la contadora desde 5 minutos.

### 🔑 Lo que NINGUNA comprobación del servidor puede probar

Hay que decírselo a Daniel con estas palabras: **una marca sin señal es, por construcción, la palabra del teléfono.**

- Que el internet haya estado caído de verdad: `sinSenal` lo manda el propio teléfono.
- Un **reloj movido para atrás**: poner el teléfono en las 8:00, activar modo avión, marcar y devolver la hora produce una marca **idéntica** a una legítima.
- La hora real de la foto: la selfie se vuelve a codificar en el teléfono antes de viajar, y eso borra los metadatos de la cámara.
- Que la ubicación sea real (hay apps de ubicación falsa) ni que la selfie sea de esa persona en ese momento (una foto de una foto pasa).

Todo lo que se agregue **achica** la ventana manipulable; ninguna la cierra. Hoy esa ventana es de 7 días para atrás y 10 minutos para adelante.

### Los dos huecos reales

1. ⚠️ **Con la app CERRADA no sale nada.** El service worker no se tocó (solo cachea `/_next/static` e imágenes) y en iPhone no existe Background Sync: la marca sale la próxima vez que ella abra la app.
2. ⚠️ **Una marca en cola no está respaldada en ningún lado.** Teléfono perdido, app borrada o teléfono cambiado = marca perdida, **y el servidor nunca se entera de que existió**. `activity_logs` tiene 0 filas de este módulo.

### El uso, medido el 19-sep-2026

Las únicas **4 marcas de teléfono** de toda la historia son las pruebas de Daniel (7.352 del reloj de Boston · 343 del de ACS). De las cuatro con rol `marcacion`: Ana (2) y Cindy (3) tienen 4 marcas cada una en 60 días —un solo día, el 5-sep—, **Yeisibeth (306) tiene cero en toda la historia** y Angel (305) marca por el reloj. Las tres mujeres tienen `trabaja_afuera = true`, así que hoy el sistema les evita la ausencia y **nadie mide su hora**.

🔴 **El problema no es técnico: es que todavía nadie lo usa.** Antes de construirle nada encima, el paso siguiente es que marquen.

---

## Lo que decía CLAUDE.md de los dos arreglos del 16-sep-2026, hasta el 19-sep-2026 (movido aquí, verbatim)

> El 19-sep-2026 entró a CLAUDE.md la regla del conector de Supabase y el archivo estaba a 24 caracteres del tope del harness. Estos dos párrafos se resumieron allá a una línea cada uno; el texto completo queda aquí sin cambiar una palabra. El porqué, las citas de Daniel y las mediciones ya estaban arriba, en «Los cinco arreglos de pantalla del Reporte (16-sep-2026)» y «El permiso de horas perdona las TRES columnas (16-sep-2026)».

- 🔴 **UN PERMISO DE HORAS PERDONA LAS TRES COLUMNAS, CON LA MISMA REGLA (16-sep-2026).** Daniel: *«El permiso perdona lo que se solape con la ventana, sea tardanza, salida temprana o exceso de almuerzo. Una sola regla, tres columnas»* · *«permiso justificado se paga»*. `minutosPerdonadosDe` cruza la ventana del permiso con la del INCUMPLIMIENTO —tardanza `[entrada, 1.ª marca]` · salida temprana `[última marca, salida]` · almuerzo `[sale + permitido, vuelve]`— y perdona la **intersección**, capeada a SU propio bruto. 🩸 Antes solo sabía tardanza de ENTRADA: Andrea Pérez (16) entró **puntual** el 1-sep y se fue 12:07:32 con Constancia de 12:00 a 17:00, y perdía **$16,43**; Briceida Montero (8) el 7-sep, **$12,92**. El estiramiento del **mismo minuto** (27-ago) se generaliza al borde que mira a la marca: el FINAL en tardanza y almuerzo, el **PRINCIPIO** en salida temprana. Siguen valiendo: un permiso de horas **no justifica el día entero** y `minutosPerdonados` conserva firma y conducta. 🔴 **Nada callado**: el día lleva los **tres perdones por separado** (`permisoPerdonaMin` · `...SalidaMin` · `...AlmuerzoMin`) más `permisoRango`, el resumen los suma en `minutosPerdonadosPorPermiso` y los abre en tres, y el chip pasó de «Permiso 0 min» a «Permiso 12:00–17:00 · perdona 292 min de salida temprana» — texto de un módulo PURO que comparten pantalla, título y Excel. **Medido contra producción**: 1-15 sep (corte 10-sep) solo se mueven 16 y 8 (neto 11.286,36 → 11.314,29); 16-30 ago, **0 diferencias**. Candado: `permiso-tres-columnas.test.ts`; **15 mutaciones, 15 cazadas**, 2 controles (`scripts/_mutar-candados-permiso-tres-columnas.sh`).

- 🔴 **CINCO ARREGLOS DE PANTALLA DEL REPORTE (16-sep-2026), y ninguno mueve plata.** (1) **El período se elige con cuatro botones** —Hoy · Ayer · Esta quincena · Quincena pasada— derivados de `quincenasElegibles` (`atajos-periodo.ts`), la MISMA función de la Planilla; el calendario se queda para lo demás. Daniel: *«arregla la manera de seleccionar en el calendario que se ve raro, tiene que ser normal, facil»*. (2) **El período vive en la URL** (`?desde=&hasta=`, `replace`): antes era `useState` y se reseteaba al volver de otra pestaña (*«quiero q se quede»*). Precedencia en `periodo-en-la-url.ts`: URL → recordado → sugerencia, y **media URL o un rango al revés se descartan enteros**. (3) **El aviso de la hora de salida NOMBRA a cada uno**, con enlace a su ficha (`rutaDePersona`); la ruta devuelve `sinHorarioLista`. (4) 🔴 **Dos marcas y la última a más de DOS HORAS de su salida se avisa** (`salida-sospechosa.ts`, `SALIDA_SOSPECHOSA_MIN = 120`): `marcas-impares` no lo atrapa —dos es par—. Viaja en su propio campo, **nunca dentro de `revisar`** (que entra a `dias_a_revisar` de la planilla guardada) y **mira la salida temprana NETA**: un día con permiso ya está explicado. Umbral medido: en 45 días con 2 marcas, **entre 58 y 180 minutos no hay nada**. (5) **La columna «Extras» dice cuánto está aprobado** (`extras-decididas.ts`): reparte el MISMO número que ya sumaba según `decision`, así que aprobado + rechazado + pendiente **es** el total. ⚠️ Cambia lo que se MUESTRA, nunca lo que se paga. Candado: `asistencia-cinco-arreglos.test.tsx`; **19 mutaciones, 19 cazadas**, 2 controles (`scripts/_mutar-candados-cinco-arreglos.sh`).

---

## Lo que decía CLAUDE.md de los dos cambios del 18-sep-2026, hasta el 19-sep-2026 (movido aquí, verbatim)

> El 19-sep-2026 entraron a CLAUDE.md las seis reglas nuevas de Asistencia y el archivo estaba a 14 caracteres del tope del harness. Estos dos párrafos se resumieron allá a una regla cada uno; acá quedan ENTEROS, con sus mediciones y sus candados. **Las reglas siguen vigentes**; lo único que se movió es el detalle.

- 🔴 **LOS DÍAS Y LOS DOS HORARIOS SON CONFIGURABLES POR PERSONA (18-sep-2026):** «hábil» ya no es «lunes a viernes» en el código sino la lista de cada quien (`asistencia_horarios.dias_laborables`; en NULL manda la EMPRESA: **Multifashion lunes a SÁBADO**, las otras lunes a viernes), así que un sábado de Multifashion sin marca es **ausencia** con sus 8 h y con marca es un **día normal sin recargo** (el aviso «trabajó un sábado» desaparece para ellos); **el domingo no se toca**. Y cada persona tiene DOS horarios —el del reloj y el del teléfono (`entrada_afuera`/`salida_afuera`, **vacío = el mismo de adentro**)— y **cuál aplica lo decide la PRIMERA marca del día**. Regla en `lib/asistencia/horario-configurable.ts`, lectura ÚNICA en `horarios-server.ts`; migración `20261208120000` ⚠️ **pendiente (la corre Daniel)** y **falla ABIERTA**: sin ella, todo como hoy. Medido: solo Multifashion se mueve (1–15 sep −$87,13 · 16–31 ago −$102,92); el 12-sep quedó como feriado global y sus 4 ausencias se fueron solas. Candado `horario-configurable` (18 mutaciones, 2 controles). Detalle en el postmortem.

- 🔴 **TODO DE LUNES A SÁBADO EN MULTIFASHION, Y SIN DEUDA DE DÍA LIBRE (18-sep-2026, tarde).** Daniel: *«obvio todo de lunes a sábado con multifashion»* · *«ese día se les regala… no hay deuda del día libre a multifashion»*. Las TRES cuentas que seguían en «lunes a viernes» a secas —«faltan N días hábiles», el prorrateo de quien entra o sale a mitad de quincena y la deuda del día libre— pasan por **UN contador** (`diasLaborablesDelRango`, `horario-configurable.ts`) con los días de cada quien; **el domingo no se toca**. **Multifashion NUNCA lleva deuda de día libre**: `EMPRESAS_SIN_DIA_LIBRE` (`motivos.ts`), el servidor rechaza con 400 por empresa, por persona y en la puerta que escribe, y la pantalla no le ofrece el motivo. **No hay feriados por empresa**. Medido: 0 cambios de neto (1–15 sep y 16–31 ago). Candado `multifashion-sabado-y-dia-libre` (17 mutaciones, 2 controles). Detalle en el postmortem.

### Y lo que decía del día libre de la empresa, hasta el 19-sep-2026 (verbatim)

- 🔴 **EL DÍA LIBRE DE LA EMPRESA: SE PAGA COMPLETO Y QUEDA DEBIENDO 8 HORAS EN DÓLARES, QUE SOLO PAGAN LAS HORAS EXTRA (17-sep-2026).** Séptimo motivo, **lejos de «Compensatorio», que es lo CONTRARIO** (un libre que se le DEBÍA, gratis). Deuda = `8 × rata`, **congelada** al cargarse; se cobra consumiendo las CINCO columnas del extra y los seguros se recalculan sobre el bruto nuevo. 🔴 **El tope es el EXTRA, nunca el neto**: sin horas extra no se cobra un centavo y la deuda arrastra sin caducar, y **no se descuenta de la liquidación**. Una sola puerta (`cargarDeudasDiaLibre`), admin y contabilidad, solo hábiles; el cierre anota el pago y reabrir lo revierte. 🔑 No se inventó: la contadora lo lleva a mano desde mayo. Candado `dia-libre-empresa`.

### Y lo que decía de los tres cambios del 14-sep-2026, hasta el 19-sep-2026 (verbatim)

- 🔴 **LAS HORAS EXTRA LAS APAGA SOLO LA CASILLA «¿Cobra horas extra?» DE LA FICHA — SER SERVICIO PROFESIONAL YA NO LAS APAGA (14-sep-2026).** Daniel: *«solo yulissa no cobra, todos los demás sí»*. Con la casilla en SÍ un servicio profesional **mide** sus extras y sale en Aprobaciones, pero **sigue sin `dinero`** (`fueraDePlanilla` no se tocó): no se inventa una rata. El Reporte y su ruta preguntan por la MISMA casilla. **0 cambios de neto medidos.** ⚠️ Marcar a alguien de Fashion Wear como servicio profesional lo SACA de la planilla entera — es otra pregunta. Candado `servicio-profesional-cobra-extra`. Detalle y citas en el postmortem.

- 🔴 **LOS DÍAS AFUERA SON «TRABAJO DE VENDEDOR» POR RANGO, DESDE LA FICHA, Y EL HORARIO 9–18 NO SE GUARDA (14-sep-2026).** No nació un mecanismo: el motivo ya no descuenta y `JustificarForm` ya tenía «Días» de-hasta; lo nuevo es la nota bajo el motivo (`notaDelMotivo` → `TEXTO_DIA_AFUERA`). 🔴 **El horario NO se guarda**: guardado como `hora_desde`/`hora_hasta` sería un PERMISO y el día pasaría a AUSENCIA (`motivoAdmiteHoras` sigue siendo solo Constancia). 🔴 **Si marcó ese día, manda el reloj.** Candados: `dias-afuera-y-compensatorio` · `justificar-form-nota-motivo`. Detalle y citas en el postmortem.

- 🔴 **«TRABAJA AFUERA» ES UNA CASILLA DE LA FICHA, Y NADIE CARGA NADA (14-sep-2026).** A quien la tiene, un día hábil ya pasado, sin marca, sin feriado y sin justificación —la condición que lo habría hecho ausencia— se le pone «Trabajo de vendedor» solo (`lib/asistencia/trabaja-afuera.ts`). **El día que SÍ marca se mide del reloj.** Feriado, fin de semana, vacación, justificación cargada y día en curso siguen mandando. ⚠️ **NO es `no_marca_reloj`** (ésa apaga el reloj SIEMPRE; con las dos, gana). Se lee APARTE de las fichas (`leerTrabajaAfuera`, tolerante). Candado `planilla-trabaja-afuera`.

### Y lo que decía de «Compensatorio», hasta el 19-sep-2026 (verbatim)

- 🔴 **«COMPENSATORIO» ES EL SEXTO MOTIVO, AL LADO DE INCAPACIDAD, Y NO DESCUENTA (14-sep-2026).** `MOTIVO_COMPENSATORIO` en `MOTIVOS_JUSTIFICACION` (`Incapacidad · Compensatorio · Catástrofe · Escolares · Trabajo de vendedor · Constancia`), de día completo. **Sin migración**: la base no tiene CHECK sobre `motivo`. Sigue valiendo: *justificar significa que se paga*. Candado en `dias-afuera-y-compensatorio`. Detalle y citas en el postmortem.

### Y lo que decía de los días de vacaciones, hasta el 19-sep-2026 (verbatim)

- 🔴 **LOS DÍAS DE VACACIONES SE CALCULAN SOLOS, Y NO SON UN SALDO (17-sep-2026).** **30 días corridos por cada 11 MESES** desde `fecha_ingreso`, período en curso truncado, menos las registradas (`lib/asistencia/vacaciones-corresponden.ts`). 🔴 Se lee **«Le corresponden N días», NUNCA «le quedan»**, con la línea gris de que no incluye lo tomado antes del 17-sep-2026. 🔴 **NO entra a ningún cálculo de plata** —ni planilla ni liquidación—, con barrido que lo exige. 🔴 **Sin `fecha_ingreso` no sale un número, ni cero.** 🩸 El saldo a mano se RETIRÓ (`saldo_vacaciones_dias`/`_corte`, sin lectores, con `COMMENT`). Candado `vacaciones-le-corresponden`.

### Y lo que decía de los cinco arreglos, el corte y el ajuste por concepto, hasta el 19-sep-2026 (verbatim)

- 🔴 **CINCO ARREGLOS DE PANTALLA DEL REPORTE (16-sep-2026), y ninguno mueve plata**: los cuatro botones de período (`atajos-periodo.ts`, los MISMOS de la Planilla), el período en la URL (`periodo-en-la-url.ts`: URL → recordado → sugerencia, y media URL o un rango al revés se descartan enteros), el aviso de la hora de salida que NOMBRA a cada uno, el de **salida sospechosa** (`salida-sospechosa.ts`, **120 min**, en su propio campo y **nunca dentro de `revisar`**) y la columna «Extras», que reparte el MISMO número según `decision` (`extras-decididas.ts`). ⚠️ Cambia lo que se MUESTRA, nunca lo que se paga. Candado: `asistencia-cinco-arreglos`. Detalle en el postmortem.

- 🔴 El corte y el ajuste de los días sin medir entran **cada concepto en su columna — nunca una línea neta**, cada monto con SU rata (`corte-quincena.ts`, antes de totalizar: `dinero.netoPagar` ES el neto que se paga). **El neto por persona no cambia.** 🔴 **Y los seguros SÍ se recalculan sobre el bruto CON el ajuste** desde el 11-sep-2026 (Daniel: *«los seguros, va»*): la ruta le pasa a `aplicarAjusteEnLinea` los porcentajes vigentes. ⚠️ No se tocan con `paga_seguros` apagado ni con base propia (`seguros_base_quincena`), porque ahí el seguro no sale del bruto.

- 🔴 **EL DÍA DEL CORTE LO ELIGE LA CONTADORA, NO EL SISTEMA.** Daniel: *«los cortes no son 13 y 28, es depende de la contable cuando elige la fecha del corte»*. `CORTE_SUGERIDO = { 1: 13, 2: 28 }` es **solo lo que se propone** en la casilla; ella escribe el que quiera y vacío = quincena entera. La quincena real (1-15 · 16-fin) **sí es fija**; lo que el corte mueve es hasta dónde se LEE EL RELOJ, y los días que quedan se pagan normal y se ajustan en la siguiente.

---

## Lo que decía CLAUDE.md hasta el 22-sep-2026 (movido acá, verbatim)

### Asistencia y planilla — [docs/postmortems/asistencia-planilla.md](docs/postmortems/asistencia-planilla.md)

- 🔴 **EL DÍA COMPLETO SE ARREGLA EN LA FILA, SIN ABRIR UNA VENTANA (19-sep-2026).** Tocar una hora (o un hueco) vuelve la celda escribible ahí mismo: **las cuatro marcas a la vez**, UN porqué y UN botón. 🔴 **Editar es editar, sin deshacer previo**: cambiar una hora ya corregida **ANULA la anterior y escribe la nueva**, y las dos filas quedan. Siguen valiendo: la marcación del reloj NO se edita ni se borra, el motivo es OBLIGATORIO y **nada se aplica solo**. «Deshacer» se queda en la línea de la corrección. `POST …/correcciones/dia` valida TODO antes de escribir NADA y el día sale de la MARCACIÓN. Interruptor `EDITAR_EL_DIA` (hoy `true`). Candado `asistencia-editar-el-dia`.
- 🔴 **LAS HORAS EXTRA SE DECIDEN DESDE EL REPORTE (19-sep-2026):** Sí / No en la fila del día. 🔴 **Al aprobar manda el SERVIDOR**: mismos botones, mismo endpoint, mismo `?empresa=`, sin una cuenta rehecha en la pantalla (barrido). ⚠️ **Aprobaciones no se tocó**: sigue siendo la única que ofrece el DOMINGO y el FERIADO trabajados. Candado `asistencia-extras-en-el-reporte`.
- 🔴 **SE JUSTIFICA A VARIOS DESDE EL REPORTE (19-sep-2026):** se marcan filas y se justifican de una vez (el 17-ago son 13 cargadas una por una). Misma ruta, misma validación, **una petición por persona**; los motivos son la **INTERSECCIÓN** (`motivosParaVarios`) y la lista sigue CERRADA. Abre en UN día, nunca el período entero; **lo que no entra se dice con nombre**. Candado `asistencia-justificar-a-varios`.
- 🔴 **CON «TODAS», EL TABLERO DE CIERRE (19-sep-2026):** una línea por empresa —personas · neto · qué falta · Cerrar—. 🔴 **NUNCA UN TOTAL DEL GRUPO** (sin pie, sin suma entre filas, con barrido, y se DICE por qué). 🔴 **Cada cierre es el de SU empresa, por su propia puerta**, con la MISMA ventana; sigue valiendo `frenoSoloQuincenas`. «Qué falta» sale del MISMO «Antes de cerrar» (`antes-de-cerrar-del-cuadro.ts`). Candado `asistencia-tablero-cierre`.
- 🔴 **LOS DÍAS DE VACACIONES SE FUERON DE LA LISTA DE COLABORADORES (19-sep-2026).** Daniel: *«días de vacaciones no existe, sino por plata»*. 🩸 Briceida decía **665** —acumulados desde 2006 sin restar lo tomado antes—; entre los 44, 2.160. ⚠️ **La FICHA no se tocó** («Le corresponden N días», con su línea) ni el cálculo. Candado `asistencia-vacaciones-fuera-de-la-lista`.
- 🔴 **LAS DIRECCIONES VIEJAS DE LAS PESTAÑAS DEJAN DE EXISTIR (19-sep-2026).** `?tab=justificaciones` · `vacaciones` · `configuracion` · `reporte` abrían otra pantalla EN SILENCIO: ahora la URL **se reescribe** a la pestaña real (`claveQueSeReescribe`, `replace`). La mudanza no cambió. ⚠️ **Sin `?tab=` no se escribe nada** y **no se toca hasta saber quién mira**. Candado `asistencia-direcciones-viejas`.
- 🔴 **LOS DÍAS Y LOS DOS HORARIOS SON CONFIGURABLES POR PERSONA (18-sep-2026):** «hábil» es la lista de cada quien (`asistencia_horarios.dias_laborables`; en NULL manda la EMPRESA: **Multifashion lunes a SÁBADO**), y cada persona tiene DOS horarios —el del reloj y el del teléfono (`entrada_afuera`/`salida_afuera`, vacío = el de adentro)—, **y cuál aplica lo decide la PRIMERA marca del día**. 🔴 **El domingo no se toca.** Regla en `horario-configurable.ts`, lectura ÚNICA en `horarios-server.ts`; migración `20261208120000` ⚠️ **pendiente (la corre Daniel)** y **falla ABIERTA**. Candado `horario-configurable`. Detalle, citas y mediciones en el postmortem.
- 🔴 **TODO DE LUNES A SÁBADO EN MULTIFASHION, Y SIN DEUDA DE DÍA LIBRE (18-sep-2026, tarde).** Las TRES cuentas que seguían en «lunes a viernes» a secas pasan por **UN contador** (`diasLaborablesDelRango`) con los días de cada quien; **el domingo no se toca**. **Multifashion NUNCA lleva deuda de día libre** (`EMPRESAS_SIN_DIA_LIBRE`, `motivos.ts`): el servidor rechaza con 400 por empresa, por persona y en la puerta que escribe, y la pantalla no le ofrece el motivo. **No hay feriados por empresa.** Candado `multifashion-sabado-y-dia-libre`. Detalle y citas en el postmortem.
- 🔴 **EL DÍA LIBRE DE LA EMPRESA: SE PAGA COMPLETO Y QUEDA DEBIENDO 8 HORAS EN DÓLARES, QUE SOLO PAGAN LAS HORAS EXTRA (17-sep-2026).** Séptimo motivo, **lejos de «Compensatorio», que es lo CONTRARIO**. Deuda = `8 × rata`, **congelada** al cargarse. 🔴 **El tope es el EXTRA, nunca el neto**: sin horas extra no se cobra un centavo, la deuda arrastra sin caducar y **no se descuenta de la liquidación**. Una sola puerta (`cargarDeudasDiaLibre`), admin y contabilidad, solo hábiles. Candado `dia-libre-empresa`. Detalle en el postmortem.
- 🔴 **LAS HORAS EXTRA LAS APAGA SOLO LA CASILLA «¿Cobra horas extra?» DE LA FICHA — SER SERVICIO PROFESIONAL YA NO LAS APAGA (14-sep-2026).** Con la casilla en SÍ un servicio profesional **mide** sus extras y sale en Aprobaciones, pero **sigue sin `dinero`**: no se inventa una rata. ⚠️ Marcar a alguien de Fashion Wear como servicio profesional lo SACA de la planilla entera — es otra pregunta. Candado `servicio-profesional-cobra-extra`. Detalle en el postmortem.
- 🔴 **LOS DÍAS AFUERA SON «TRABAJO DE VENDEDOR» POR RANGO, DESDE LA FICHA, Y EL HORARIO 9–18 NO SE GUARDA (14-sep-2026).** Lo nuevo es la nota bajo el motivo (`notaDelMotivo` → `TEXTO_DIA_AFUERA`). 🔴 **El horario NO se guarda**: como `hora_desde`/`hora_hasta` sería un PERMISO y el día pasaría a AUSENCIA. 🔴 **Si marcó ese día, manda el reloj.** Candados: `dias-afuera-y-compensatorio` · `justificar-form-nota-motivo`. Detalle en el postmortem.
- 🔴 **«COMPENSATORIO» ES EL SEXTO MOTIVO, AL LADO DE INCAPACIDAD, Y NO DESCUENTA (14-sep-2026).** `MOTIVO_COMPENSATORIO` en `MOTIVOS_JUSTIFICACION`, de día completo. **Sin migración**: la base no tiene CHECK sobre `motivo`. Sigue valiendo: *justificar significa que se paga*. Candado en `dias-afuera-y-compensatorio`.
- 🔴 **«TRABAJA AFUERA» ES UNA CASILLA DE LA FICHA, Y NADIE CARGA NADA (14-sep-2026).** A quien la tiene, un día hábil ya pasado, sin marca, sin feriado y sin justificación se le pone «Trabajo de vendedor» solo (`trabaja-afuera.ts`). **El día que SÍ marca se mide del reloj.** ⚠️ **NO es `no_marca_reloj`** (ésa apaga el reloj SIEMPRE; con las dos, gana). Candado `planilla-trabaja-afuera`. Detalle en el postmortem.
- 🔴 Son **COLABORADORES**, no «personas», en todo texto del sistema. `/asistencia/personas/:codigo` redirige **307** con la query intacta; ⚠️ los identificadores NO cambian (`asistencia_personas`, `persona=<código>`).
- 🔴 Selector de empresa (`empresa-para-todo.ts`, `?empresa=`): opciones = rol ∩ `GET /api/asistencia/alcance` (`null` = las cuatro); hasta que conteste, lo del rol. Es filtro de LECTURA; `POST …/aprobaciones?empresa=` **rechaza (400) un código ajeno, todo o nada**.
- 🔴 Almuerzo **por empresa** (`ALMUERZO_POR_EMPRESA`): **30 min**, **60 en Multifashion**; sin casilla, el PUT de Horarios escribe el de la empresa de la ficha y conserva la entrada.
- La quincena paga `salario ÷ 2`. 🔴 **SOLO SE CIERRAN QUINCENAS (18-sep-2026, Daniel: *«si frenalo»*)**: el POST de `planilla-guardada` rechaza (400) cualquier otro rango ANTES de leer la base (`frenoSoloQuincenas`); «Otro rango» ya no está en la Planilla; la ruta que GENERA sigue aceptando rangos libres (`medirAjusteAnterior`). Candado `planilla-solo-quincenas`.
- 🔴 **EL DÍA DEL CORTE LO ELIGE LA CONTADORA, NO EL SISTEMA.** Daniel: *«los cortes no son 13 y 28, es depende de la contable»*. `CORTE_SUGERIDO = { 1: 13, 2: 28 }` es **solo lo que se propone**; vacío = quincena entera. La quincena real (1-15 · 16-fin) **sí es fija**; lo que el corte mueve es hasta dónde se LEE EL RELOJ, y los días que quedan se ajustan en la siguiente.
- 🔴 **El día vale sueldo mensual ÷ 26** (`DIAS_PAGADOS_POR_MES`); quien entra o sale a mitad de quincena cobra **días hábiles trabajados** (`prorrateo-ingreso.ts`), congelado en el cierre.
- 🔴 Salir antes se descuenta **desde el minuto uno, sin tolerancia** (los 10 min de gracia son solo de la entrada) y tiene concepto propio en el cierre.
- Horas extra exactas del reloj (`brutoSeg / 60`, sin cuartos); ISR a mano. 🔴 Centavos: **manda el sistema y la contable se adapta**: 1–4 centavos no son defecto.
- Marcaciones al segundo, umbrales en minutos; Panamá **UTC−5 fijo**, tests con fechas fijas, y **los días que no pasaron no se cuentan** (`fecha >= diaEnCurso`). Aprobadores (`asistencia_aprobador_empresa`): daniel y Contabilidad en las cuatro; david solo Boston; Bodega en Fashion Wear y Vistana.
- 🔴 **La marcación del reloj nunca se edita ni se borra**: la corrección va encima, en `asistencia_correcciones` (motivo obligatorio, firma, deshacer = `anulada_en`), con barrido que prohíbe `update`/`delete`/`upsert`.
- 🔑 Cuando el sistema no puede saber, **se abstiene**: servicio profesional, ingreso o salida a mitad de período y justificación de período completo van a «Tú decides», sin número y fuera del total. ⚠️ Hasta el 14-sep-2026 el servicio profesional **no generaba horas extra ni entraba a Aprobaciones**; hoy eso lo decide SOLO la casilla «¿Cobra horas extra?» de la ficha (ver el primer bullet de este bloque).
- 🔴 Aprobaciones decide **SÍ · NO · PENDIENTE** (`decision`); `aprobado` se conserva DERIVADO (`'si'` ⇔ `true`). Un `no` no se paga y **deja de ser pendiente**; los 30 min automáticos de ACS se pagan igual. **Pendiente = sin fila o `decision IS NULL`: lo ÚNICO que avisa y frena.**
- 🔴 Domingo y feriado trabajados **se aprueban** (`diasConExtra`, valuados con `recargoDomingoFeriado`); no aprobado no se paga, pero se ve. Al aprobar **manda el servidor**.
- 🔴 «¿Cobra horas extra?» (`cobra_horas_extra NOT NULL DEFAULT true`; **solo un `false` explícito apaga**): con `false` no entra a Aprobaciones ni frena el cierre, pero **sigue en planilla** con tardanzas, ausencias y salida temprana.
- 🔴 Una vacación **no es una justificación** (tabla propia; «Vacaciones» no está entre los motivos ni los retirados); **el motor las honra pase lo que pase** y un día de vacaciones **no genera horas, tardanza ni ausencia**. Sin marcar no cuesta nada; **«ya se le pagó» es lo ÚNICO que mueve plata**: ausencia de día completo (**8 h × rata**) en hábiles no feriados.
- 🔴 **LOS DÍAS DE VACACIONES SE CALCULAN SOLOS, Y NO SON UN SALDO (17-sep-2026).** **30 días corridos por cada 11 MESES** desde `fecha_ingreso`, menos las registradas (`vacaciones-corresponden.ts`). 🔴 Se lee **«Le corresponden N días», NUNCA «le quedan»**, con la línea gris de lo que no incluye. 🔴 **NO entra a ningún cálculo de plata**, con barrido. 🔴 **Sin `fecha_ingreso` no sale un número, ni cero.** 🩸 El saldo a mano se RETIRÓ. Candado `vacaciones-le-corresponden`.
- 🔴 El descuento de préstamo **entra solo a la planilla; ya no se aprueba** (`prestamos-planilla.ts`): préstamo y terceros, cada cuota capeada a SU saldo; **lo escrito a mano manda, vacío = la cuota del módulo**; va a `dinero`, nunca a `manuales`. «Ya descontado» mira el ORIGEN del pago. `asistencia_prestamo_aprobado` **no se dropea**.
- 🔴 Las casillas de préstamo y terceros tienen **tres estados**: `NULL` = cuota automática · `0` = esta quincena **no se descuenta** y el cierre **no anota pago** · monto = ese monto (`casilla-sin-descontar.ts`, misma función para pantalla y guardado). ⚠️ `mercancia`, `isr` y `otros_servicios` siguen `NOT NULL DEFAULT 0`.
- 🔴 Las horas de una justificación **solo van con «Constancia»** (`permiso-horas.ts`): la ruta rechaza con **400** un motivo de día completo que llegue con horas; el motor honra las horas guardadas sin mirar el motivo.
- 🔴 **UN PERMISO DE HORAS PERDONA LAS TRES COLUMNAS, CON LA MISMA REGLA (16-sep-2026).** `minutosPerdonadosDe` cruza la ventana del permiso con la del INCUMPLIMIENTO —tardanza · salida temprana · exceso de almuerzo— y perdona la **intersección**, capeada a SU propio bruto. 🔴 **Nada callado**: el día lleva los tres perdones por separado y el chip dice cuál y cuánto. Un permiso de horas **no justifica el día entero**. Candado: `permiso-tres-columnas`. Citas, mediciones y mutaciones en el postmortem.
- 🔴 La salida temprana entra al ajuste del corte (`CONCEPTOS_DEL_RELOJ` son **ocho**) y **los seguros se calculan sobre el bruto CON el ajuste** (`aplicarAjusteEnLinea`, respeta `paga_seguros`).
- 🔴 El corte y el ajuste de los días sin medir entran **cada concepto en su columna — nunca una línea neta**, cada monto con SU rata (`corte-quincena.ts`). **El neto por persona no cambia.** 🔴 Y **los seguros SÍ se recalculan sobre el bruto CON el ajuste** desde el 11-sep-2026. ⚠️ No se tocan con `paga_seguros` apagado ni con base propia (`seguros_base_quincena`). Detalle en el postmortem.
- 🔴 **CINCO ARREGLOS DE PANTALLA DEL REPORTE (16-sep-2026), y ninguno mueve plata**: los cuatro botones de período (`atajos-periodo.ts`, los MISMOS de la Planilla) · el período en la URL (`periodo-en-la-url.ts`) · el aviso de la hora de salida NOMBRA a cada uno · **dos marcas y la última a más de DOS HORAS de su salida se avisa** (`salida-sospechosa.ts`, 120 min, **nunca dentro de `revisar`**) · la columna «Extras» dice cuánto está aprobado. Candado `asistencia-cinco-arreglos`. Detalle en el postmortem.
- 🔴 **O el total sigue al filtro, o no hay buscador** (`buscar-en-lista.ts`): filtra lo ya cargado por **subcadena exacta normalizada, nunca por parecido**, con el texto en la URL (`?buscar=`). 🔴 **Planilla no tiene buscador** —su pie es plata que se paga—, con barrido sobre `PlanillaTab.tsx`. Los avisos de «Antes de cerrar» (`antes-de-cerrar.ts`) viajan como datos: Excel y PDF los leen igual.
- 🔴 **Lo que sale de la pantalla nunca se recorta** (Excel, PDF, cierre, lotes), salvo un botón que DIGA a cuántos afecta. ⚠️ Asistencia, Clientes y ⌘K buscan contra el SERVIDOR.
- 🔴 Dar de baja a alguien con deuda **avisa** (`salida-con-deuda.ts`), y la deuda son las **tres cuentas** (`calcularSaldoPrestamo`). 🔴 Las columnas de dinero salen de **un solo lugar**: `columnas-dinero-planilla.ts` (**19**), leído por `PlanillaTab` y `PlanillaBoston`.
- 🔴 **JUSTIFICAR SIGNIFICA QUE SE PAGA. No existe «justificado pero no se paga».** Daniel: *«no hagamos justificar que no pague, ensucia»*. La lista de motivos es **cerrada** (`motivos.ts`): Incapacidad · Catástrofe · Escolares · Trabajo de vendedor · Constancia.
- 🔑 **Tres reglas de la planilla son de la CONTADORA (Yulissa), no de Daniel** — por eso no se renegocian con él: la información *«se le configura en el perfil y la debe tomar de allí»*, nunca a mano; **terceros se maneja igual que un préstamo** (monto inicial + cuota quincenal); y **daño de mercancía permanece en blanco**, con la cantidad escrita quincena por quincena.
- **«Descuento por compras» y «Daño de mercancía» son LA MISMA línea**, no dos conceptos.
- ⚠️ **Un colaborador sin cédula ni salario no siempre es un dato olvidado**: Daniel, *«creo que porque no tienen permiso de trabajo»*.
- La incapacidad justificada **se paga**; «Trabajo fuera de la oficina» **no es ausencia**; un sueldo repartido saca la rata del **sueldo COMPLETO** y las partes deben sumar el salario de la ficha o se rechaza entero.
- Corregir una hora: el porqué es obligatorio; los motivos frecuentes se derivan de lo guardado en **90 días** por clave normalizada (**igualdad exacta, nada por parecido**), **4** con **2+** usos (`motivos-frecuentes.ts`, solo lectura).
- Candados: `asistencia-colaboradores-no-personas` · `asistencia-falta-configurar` · `asistencia-siete-pantallas` · `asistencia-lista-que-falta` · `planilla-elegir-quincena` · `asistencia-reglas-de-la-contable` · `asistencia-empresa-para-todo` · `asistencia-alcance-route` · `aprobaciones-por-persona` · `aprobaciones-optimista` · `vacaciones-el-motor-las-honra` · `asistencia-prestamo-planilla` · `planilla-sin-descontar` · `justificar-horas-solo-constancia` · `planilla-ajuste-por-concepto` · `planilla-antes-de-cerrar` · `asistencia-buscadores` · `prestamos-salida-con-deuda` · `asistencia-corregir-hora`.

### La Planilla Unida — los dos interruptores, PRENDIDOS en producción (11-sep-2026)

> Detalle completo: [el postmortem](docs/postmortems/asistencia-planilla.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026». ⚠️ Sus reglas de PANTALLA viven SOLO ahí: léelo antes de tocar una pantalla suya.

> 🔴 **Los dos están PRENDIDOS en producción desde el 11-sep-2026** (`NEXT_PUBLIC_PLANILLA_UNIDA="1"` y `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO="1"` en Vercel, verificado el 14-sep-2026), así que lo de abajo es lo que Daniel VE hoy. Apagarlos pide cambiar la variable **y volver a desplegar**: Next reemplaza `NEXT_PUBLIC_*` como TEXTO al compilar. Daniel los prende uno por uno.

| Interruptor | Dónde vive | Qué prende |
|---|---|---|
| `NEXT_PUBLIC_PLANILLA_UNIDA` | `planilla-unida.ts:26` | El comprobante de pago · el cierre que escribe el pago del préstamo (reabrir lo revierte) · el corte de quincena y el «Ajuste quincena anterior» · Préstamos con «una sola puerta» |
| `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO` | `persona-en-el-centro.ts:43` | El acomodo nuevo y `/asistencia/personas/[codigo]` con Editar |

⚠️ **No cuelga de un interruptor, es aditivo por datos** y hoy inerte: la tercera cuenta «Descuento a terceros», `asistencia_codigos_ignorados` (vacía), ACS como cuarta empresa (CHECK más anchos) y sus 30 min de extra automáticos (`EXTRA_AUTOMATICO_POR_EMPRESA`: las otras tres en **0**).

- 🔴 Préstamos: **una sola puerta, nunca dos** (`prestamos-una-puerta.ts`). Prendido: la ficha se filtra de `getVisibleModules` (no se borra de `ALL_MODULES`: la key sigue en `role_permissions` y `modulos_override`) y `/prestamos` exacto redirige a `/asistencia?tab=prestamos`, **307 temporal**, query intacta. 🔴 `/prestamos/<id>` **no redirige**, ni `/api/prestamos/*`: son las rutas de la pestaña.
- 🔴 La pestaña se autoriza por `PRESTAMOS_ROLES`, **no por tener Asistencia**: `PRESTAMOS_PESTANA_ROLES` = admin · contabilidad + secretaria **solo a ver**; bodega y vendedor no, y el «solo ver» lo decide el SERVIDOR.
- La sección Préstamos de la persona **enlaza, no duplica** (`enlaceAPrestamos`): no dibuja formulario ni hace POST, y la ficha NO ofrece «Pago Quincenal»: lo escribe el cierre.
- 🔴 El comprobante de pago es UNO para las cuatro empresas, una hoja por persona, con todos los renglones aunque vayan en 0.00. Multifashion sale con `MULTI FASHION HOLDING CORP.` · `155638923-2-2016`, de la lista fiscal del estado de cuenta, sin correo ni teléfono; sin cargo va un guion, no se inventa.
- 🔴 El pago del préstamo lo escribe el CIERRE, con `await`, y **reabrir lo revierte** con soft delete; cerrar dos veces no cobra dos veces (índice único).
- 🔴 El corte **no prorratea el sueldo**: el período queda entero y solo se recorta hasta dónde se mide el reloj (`hastaReloj`); el «Ajuste quincena anterior» va en **renglón propio**, nunca dentro de la ausencia.
- 🔴 En ACS aprueba `daniel`, no la contadora; **cerrar no sale de esa tabla**: ella sigue cerrando las cuatro.
- Los nombres se capitalizan con `nombre-en-pantalla.ts` y **no se inventan acentos**. La cédula vive en el bucket **privado `asistencia-cedulas`**: se guarda la RUTA y la URL se **firma al leer**, una hora.
- Candados: `planilla-unida-comprobante` · `planilla-unida-cierre-prestamo` · `planilla-unida-corte-y-cableado` · `planilla-tres-descuentos` · `persona-en-el-centro` · `prestamos-una-puerta` · `prestamos-pestana-completa`.
