# Caja Menuda — mapa medido

> Medido contra producción el **5-sep-2026** (SQL de solo lectura) y contra el código de `main`.
> Todo número de aquí se remidió: nada se copió de `CLAUDE.md`.
> Lo que no se pudo medir dice **«no medido»** y por qué.

---

## Qué es, quién entra, cuánto se usa

**Qué es.** El fondo fijo de $200 de la oficina. Se abre un período, se anotan los recibos
que se van pagando en efectivo, y cuando queda poca plata se cierra y se repone.

**Quién entra.** `admin` + `secretaria`. Nadie más.
`src/lib/modules.ts:177` y `role_permissions` en producción (los dos dicen lo mismo).

**Quién lo usa de verdad**, medido sobre los 93 gastos:

| Quién | Gastos escritos | Gastos borrados |
|---|---|---|
| Angela (secretaria) | 69 | 12 |
| Daniel (admin) | 4 | 2 |
| Sin autor (antes de que se guardara quién) | 20 | 2 |

**Cuánto se usa.** Poco, y a tirones.

| Medida | Número |
|---|---|
| Períodos abiertos en toda la historia | **3** (25-mar, 8-jul, 2-sep) |
| Duración del período 1 · 2 | **105 días** · **56 días** |
| Gastos anotados | **93** (77 vivos, 16 borrados = 17%) |
| Plata que pasó por Caja en 164 días | **$563,28** |
| Plata por mes | **~$104** |
| Días distintos en que alguien escribió algo | **18** de 164 |
| Gastos escritos el 2-sep en 2 horas | **38** (41% de toda la historia) |
| Gastos escritos entre el 15-jul y el 2-sep | **1**, en 49 días |
| Filas en `activity_logs` | **39** de 2.821 del sistema (1,4%) |

**Escala.** El módulo **Gastos** (el reporte de la contadora) lleva **$827.934,71** en 7 meses.
Caja Menuda es el **0,07%** de eso. No es un módulo de plata: es un módulo de recibos sueltos.

🔴 **No se anota al día: se anota en tanda.** Las fechas de los gastos van de marzo a septiembre,
pero la escritura ocurrió en 18 días, y dos de esos días concentran **63 de los 93**. El período
no es un ciclo de caja: es **el día en que Angela se sentó a ponerse al día**.

---

## Los datos, medidos

### `caja_periodos` — 3 filas, 0 borradas

| N° | Apertura | Cierre | Días | Fondo | Gastado | Quedó | `saldo_cierre` |
|---|---|---|---|---|---|---|---|
| 1 | 25-mar | 8-jul | 105 | $200,00 | $200,00 | **$0,00** | NULL |
| 2 | 8-jul | 2-sep | 56 | $200,00 | $200,00 | **$0,00** | NULL |
| 3 | 2-sep | — (abierto) | 3 | $200,00 | $163,28 | **$36,72** | — |

- Los dos cerrados quedaron en **$0,00 exacto**. No es coincidencia: hasta el 4-sep el cierre
  exigía saldo cero, y eso produjo gastos de centavos inventados para cuadrar (se ven en la base:
  $0,05 el 22-jul y $0,87 el 1-sep, creados y borrados el mismo día del cierre). Ya está arreglado
  (`20260920120000`, aplicada), pero **todavía no se ha cerrado ningún período con la regla nueva**.
- `repuesto` = false en los 3. El botón «Aprobar reposición» **nunca se tocó**.
- `created_by` vacío en el período 1.

### `caja_gastos` — 93 filas, 16 borradas (17%)

| Columna | Llena | Vacía | Nota |
|---|---|---|---|
| `nombre`, `subtotal`, `itbms`, `total`, `categoria`, `responsable`, `descripcion`, `proveedor` | 93/93 | 0% | — |
| `nro_factura` | 51/93 | **45%** | es opcional y está bien |
| `responsable_id` | 90/93 | 3% | los 3 sin id son los viejos |
| `created_by` | 73/93 | 22% | los 20 primeros |
| `empresa` | 22/93 | **76%** | **nadie la escribe y nadie la muestra** |
| `ruc` · `dv` · `factura` | 2/93 | **98%** | **0 lectores en `src/`** |
| `deleted_by` · `deleted_at` | 14/16 borrados | — | 2 borrados sin firma |

**Categorías.** Hay 6 en el catálogo; se usan 4.

| Categoría | Gastos vivos | Plata |
|---|---|---|
| Alimentación | 47 (61%) | $360,30 |
| Otros | 18 | $111,21 |
| Transporte | 10 | $81,50 |
| Materiales | 2 | $10,27 |
| **Papelería** | **0** | — |
| **Mantenimiento** | **0** | — |

**ITBMS.** 9 de 93 (10%) lo llevan. Que el casillero esté escondido detrás de
«＋ Agregar ITBMS» está bien medido.

**Responsables.** 8 en el catálogo, todos activos. En 5 meses se usaron **2**: Angela (91 de 93)
y Daniel (1). Uno quedó vacío.

---

## Cuánto cuesta hacer las cosas

Las tareas reales, las que los datos demuestran que se hacen — no las que el código permite.

### Tarea 1 — Anotar un gasto (la real: **38 de una sentada**)

**Hoy**

| | Hoy |
|---|---|
| Toques para llegar al formulario | **3** (Inicio → «Caja Menuda» → el período abierto → «Nuevo gasto») |
| Pantallas distintas | **3** |
| Casilleros del formulario | **7** (6 obligatorios) |
| Casilleros que se teclean por gasto | **4** — Fecha, Descripción, Proveedor, Subtotal |
| Casilleros que el sistema ya sabe | **1** — Responsable: es Angela en **91 de 93** (98%) y el sistema ya sabe quién está escribiendo (`created_by`) |
| Lo que se repite | **45 de 93 gastos (48%) tienen un proveedor que ya se había escrito antes**, y aun así se teclea de nuevo |
| Lo que se repite (2) | En el período 3: **37 gastos en 19 fechas** → 18 gastos repiten una fecha ya elegida |
| Lo que hay que recordar de memoria | Nada crítico: «Guardar y nuevo» conserva fecha, categoría y responsable (`NuevoGastoDrawer.tsx:92-96`) |

**Lo que costó de verdad el 2-sep:** 38 gastos × 4 casilleros = **152 datos tecleados** en 2 horas,
de los cuales el proveedor ya existía en la base en la mitad de los casos.

**La versión más corta**

| | Hoy | Propuesta |
|---|---|---|
| Toques para llegar | 3 | **1** — la ficha «Caja Menuda» del inicio entra directo al período abierto. Siempre hay **uno solo**: en toda la historia nunca hubo dos abiertos a la vez. |
| Casilleros por gasto | 4 | **3** — Proveedor pasa a lista de los ya usados (1 toque en el 48% de los casos, teclear solo si es nuevo); Responsable sale del formulario (lo pone quien escribe). |

Sin tocar lo que se guarda: el proveedor sigue siendo texto y el responsable se sigue guardando
por fila.

### Tarea 2 — Cerrar el período

**Hoy: 2 toques, 1 pantalla.** «Cerrar» en la tarjeta → modal de 4 líneas → «Cerrar y abrir el 4».
Ya está corto; el problema no son los toques, es **qué dice el cuadro**.

| Fila del modal | Qué muestra | Problema |
|---|---|---|
| Fondo | $200,00 | ok |
| Gastado (26 recibos) | $200,00 | ok |
| Queda en caja | $0,00 | ok — es el número de la decisión |
| **Reposición para volver a $200** | **$200,00** | 🩸 **es siempre exactamente igual a «Gastado»**, por construcción: `reposición = fondo − queda = gastado` (`CerrarPeriodoModal.tsx:29`). Cuatro líneas para decir tres cosas. |

Lo que **no** dice y hace falta para decidir: **cuántos días lleva abierto** (fueron 105 y 56) y
**cuándo fue el último gasto**. Los dos datos ya están en la pantalla de al lado.

### Tarea 3 — Encontrar un gasto viejo

**No hay buscador.** La única herramienta son 5 chips de categoría con el monto pegado.
Medido: la lista más larga es de **26 gastos**, así que hoy alcanza con mirar — pero el chip
«Materiales» filtra **2 filas de 26**.

### Tarea 4 — Sacar el papel o el Excel

**2 toques** (detalle → «···» → «Imprimir» / «Descargar Excel»). Sin problema.

---

## 🩸 Lo que miente o está roto

**1. `saldo_cierre` se guarda y no lo lee nadie. El saldo se calcula en 6 lugares.**
La columna existe (`20260920120000`, aplicada) y el cierre la escribe
(`src/app/api/caja/periodos/[id]/route.ts:105`), pero **0 lectores en todo `src/`**.
El saldo de un período **cerrado** se recalcula `fondo − gastado` cada vez que se pinta, en:
`PeriodoList.tsx:158` · `PeriodoList.tsx:247` · `[periodoId]/page.tsx:88` ·
`CerrarPeriodoModal.tsx:28` · `caja-excel.ts:137` · `[periodoId]/nuevo/page.tsx:219`.
Consecuencia: si mañana cambia un gasto de un período cerrado, la foto del cierre cambia sola.

**2. El encabezado del período cuenta grafías, no personas.**
`PeriodoDetailHeader.tsx:176-184` hace `new Set` sobre el texto crudo del responsable.
Medido: el período 1 tiene **3 grafías de la misma persona** — `Angela Garcia` (70),
`Angela garcia` (20), `Angela garciia` (1) — así que la pantalla dice
**«Responsable: Angela Garcia +2»** cuando el responsable es **una** persona.

**3. El proveedor es texto libre sin lista: 93 gastos → 51 grafías.**
`GastoForm.tsx:421-429` usa un `TextInput` pelado. El módulo **ya tiene** un
`AutocompleteInput` (`src/app/caja/components/AutocompleteInput.tsx`) pero solo se usa al editar
una fila (`GastoTable.tsx:384`), no al crear.

| Proveedor real | Gastos | Grafías |
|---|---|---|
| La Parrilla | **20** | **7** (`La parrilla`, `La Parrillada`, `La Gran Parrilla`, `la gran parrilada`, `La parrilada`, `La Parrilla`, `La Gran Parrila`) |
| Market Fresh | **19** | **3** (`Market Fresh`, `Market Fres`, `Market Fresch`) |

**39 de 93 gastos (42%) son de dos proveedores, repartidos en 10 grafías.** Cualquier reporte
por proveedor es inservible.

**4. Las fechas de los gastos no caen dentro de su período. 47 de 93 (51%) están fuera.**
Los 37 gastos del período 3 (abierto el 2-sep) tienen fechas desde el **23-jun**; 36 de los 37
de los 37 son anteriores a la apertura de su propio período. El período 2 y el 3 se **solapan** en junio y
julio. O sea: el período no es una ventana de tiempo, es una tanda de captura. Ni la pantalla ni
el servidor lo dicen, y el Excel se llama «Período N°3» con fechas de 3 meses distintos.

**5. `DELETE /api/caja/gastos/[id]` no revisa que el período esté abierto.**
`PATCH` sí lo revisa (`gastos/[id]/route.ts:74`) y `restore` también (`:40`), pero el `DELETE`
(`:121-151`) no. La pantalla sí lo esconde (`GastoTable` recibe `isOpen`), así que hoy no hay
camino que lo dispare — pero la puerta del servidor está abierta y borrar un gasto de un período
cerrado le mueve el total en la lista, el papel y el Excel.

**6. Ruta huérfana de 410 líneas.** `src/app/caja/[periodoId]/nuevo/page.tsx` — el propio archivo
lo admite en su línea 4: *«el alta real es NuevoGastoDrawer desde el detalle»*. **0 enlaces** en
todo `src/`. Trae su propia copia del cálculo de saldo (`:219`) y de la lógica de saldo negativo.

**7. Tres columnas muertas en la tabla de plata.** `ruc` (2/93), `dv` (2/93), `factura` (2/93):
**0 lectores** en `src/`. `empresa` (22/93): se lee solo para hacerle eco en la respuesta de
borrar y restaurar (`gastos/[id]/route.ts:57` y `:147`), **nunca se escribe y nunca se muestra**.

---

## Coherencia con el sistema

| Regla de la casa | Caja Menuda | Diferencia |
|---|---|---|
| Botones `rounded-md`, negro | `rounded-full` en el modal de período nuevo (`page.tsx:85,92`), y el botón principal es **teal** (`GastoTable.tsx:200`) | ✗ |
| Color del módulo: **violet** (`CLAUDE.md`) | **teal** (`skin.css:51`) | ✗ contradicción medida |
| Sin hojas de estilo por módulo | **`src/app/caja/skin.css`, 135 líneas** — el único módulo del sistema con piel propia, y **carga 2 fuentes de Google** (Playfair Display + Geist Mono, `skin.css:7`) | ✗ |
| Borrado destructivo con `ConfirmDeleteModal` (1 s de espera) | **0 usos.** Usa `ConfirmModal` para el período y un cuadro hecho a mano para el gasto (`[periodoId]/page.tsx:184-208`) | ✗ |
| **Deshacer de 5 segundos** en lo destructivo | **0 usos de `UndoToast`.** Para recuperar un gasto hay que ir a «Ver gastos eliminados» y restaurarlo | ✗ |
| Soft delete, nunca DELETE | ✅ `deleted` + `deleted_by` + `deleted_at` en gastos y períodos | ✓ |
| Excel desde la fila 1, por la librería de la casa | ✅ `workbookBuffer` + `buildReportSheet` (`caja-excel.ts`) | ✓ |
| Sin `$0.00` en letra grande | ✅ `EmptyState` dice «Sin gastos registrados» | ✓ |
| Panamá UTC−5 fijo | ✅ `gastos/route.ts:42` | ✓ |
| Tuteo, cero voseo | ✅ en pantalla. **2 «acá» en comentarios** (`DeletedGastosModal.tsx:91`, `[periodoId]/nuevo/page.tsx:272`). El candado ignora comentarios; la regla escrita no | ⚠ |
| Confirmación solo para lo destructivo | ✅ guardar no confirma | ✓ |

---

## El iPhone (390 px)

**No medido en el navegador en esta sesión** (no abrí las pantallas; solo leí el código y los
candados estáticos). Lo que sí se puede afirmar:

- **La tabla no aparece en el teléfono.** Está `hidden lg:block` y por debajo de 1024 px hay
  tarjetas (`GastoTable.tsx:306` y `:242`). El comentario del archivo trae la medición vieja:
  a 834 px la tabla pedía 702 px contra 538 útiles.
- **Los chips de categoría envuelven**, no arrastran (`GastoTable.tsx:222`). Medición del
  archivo: antes sobraban 327 px a 390.
- **Nada por debajo de 12 px**: 0 usos de `text-[10px]` y `text-[11px]` en todo el módulo.
- Todos los botones que revisé declaran `min-h-[44px]`.
- Candados vigentes: `iphone-tocables-y-letra.test.ts` (líneas 150-164, sobre `skin.css` y
  `GastoTable`) y `ipad-caja-prestamos-cheques.test.ts`.

**Lo que sí preocupa desde el teléfono, y es medible sin navegador:**
`skin.css:7` hace un `@import` de **dos familias de Google Fonts**. Es la única pantalla del
sistema que va a la red por tipografía antes de pintar — y es la que la secretaria abre en la
calle, con el recibo en la mano.

---

## Lo que sobra · lo que falta

### Sobra (con la medición que lo prueba)

| Qué | Prueba |
|---|---|
| La ruta `/caja/[periodoId]/nuevo` | 410 líneas, 0 enlaces |
| Las columnas `ruc`, `dv`, `factura` | 2 de 93 llenas, 0 lectores |
| La columna `empresa` | 0 escritores, 0 pantallas |
| La fila «Reposición para volver a $200» del cierre | siempre igual a «Gastado» |
| Los montos pegados a los 5 chips de categoría | 4 categorías con 26 filas en pantalla; el monto por chip tapa el monto por fila |
| Las 2 categorías sin usar (Papelería, Mantenimiento) | 0 gastos en 5 meses |
| Los 6 responsables sin usar del catálogo de 8 | 2 usados en 5 meses |
| La piel propia (135 líneas + 2 fuentes de red) | el resto del sistema no la tiene |

### Falta

| Qué | Prueba |
|---|---|
| Que la lista de proveedores se ofrezca al escribir | 45 de 93 gastos (48%) repiten un proveedor ya escrito; 51 grafías para 48 proveedores |
| Que el responsable lo ponga el sistema | 91 de 93 son la misma persona, en 3 grafías |
| Que la pantalla del cierre diga días abiertos y último gasto | los períodos duraron 105 y 56 días y el modal no menciona el tiempo |
| Que un período cerrado muestre **su** saldo, no uno recalculado | `saldo_cierre` escrito, 0 lectores |
| Deshacer de 5 s al borrar un gasto | 16 borrados de 93 (17%) y ninguno tuvo deshacer |
| El guard de «período cerrado» en el `DELETE` del servidor | `PATCH` y `restore` sí lo tienen |

---

## Preguntas para Daniel

**1. Caja Menuda mueve $563 en 5 meses — el 0,07% de lo que ya se mide en el módulo Gastos ($827.934 en 7 meses). ¿Qué hacemos con el módulo?**
- a) Dejarlo como está y solo arreglar los defectos de arriba.
- b) Arreglarlo **y** achicarlo: una sola pantalla (sin lista de períodos), porque siempre hay un solo período abierto.
- c) Retirarlo y que esos recibos entren por Gastos.
**Recomiendo (b).** Los recibos de $5 de almuerzo no tienen dónde más vivir, pero el módulo está armado como si fueran muchos: tres pantallas para 26 filas. Achicarlo es lo que más se va a sentir. (c) no, porque Gastos viene de la contadora y estos recibos no pasan por ella.

**2. El proveedor se escribe a mano y ya hay 51 grafías para 48 proveedores — «La Parrilla» aparece de 7 formas distintas en 20 gastos. ¿Cómo lo cerramos?**
- a) Dejar el texto libre y solo ofrecer, al escribir, los que ya usaste (1 toque en el 48% de los casos).
- b) Lista cerrada de proveedores, como el responsable: para agregar uno nuevo hay un botón.
- c) Dejarlo como está.
**Recomiendo (a).** Es reversible, no cambia lo que se guarda y no te obliga a mantener una lista. La (b) te deja a mitad de camino el día que compras en un chino que nunca volviste a pisar.

**3. El responsable es Angela en 91 de 93 gastos y el sistema ya sabe quién está escribiendo. ¿Lo sacamos del formulario?**
- a) Sacarlo: lo pone el sistema con quien está escribiendo, y queda un «cambiar» chiquito para el caso raro.
- b) Dejarlo obligatorio como hoy.
- c) Sacarlo del todo y no guardarlo más.
**Recomiendo (a).** Es un casillero obligatorio de cada gasto para un dato que acierta el 98% de las veces solo. (c) no: el día que Julio ponga la plata, quieres que quede escrito.

**4. Los períodos duraron 105 y 56 días, y las fechas de los gastos se solapan entre uno y otro. Hoy el período es «la tanda en que Angela se puso al día», no un ciclo de caja. ¿Está bien así?**
- a) Está bien: el período es la tanda, y la pantalla debería decirlo así («Tanda del 2-sep», no «Período N°3»).
- b) El período debería ser una ventana de fechas de verdad, y un gasto fuera de la ventana debería avisar.
- c) Da igual.
**Recomiendo (a).** El sistema no debería pelear con cómo se trabaja de verdad. Y avisar por cada gasto fuera de fecha serían 47 avisos de 93 — puro ruido. Tú decides si el nombre en pantalla cambia.

**5. En el cuadro de cerrar, la línea «Reposición para volver a $200» es siempre el mismo número que «Gastado». ¿La quitamos y ponemos otra cosa?**
- a) Quitarla y poner en su lugar «Abierto hace 56 días · último gasto el 1-sep».
- b) Quitarla y no poner nada (3 líneas).
- c) Dejarla.
**Recomiendo (a).** Es la misma cantidad de líneas, pero la que queda te dice algo que hoy no está en ninguna pantalla y que sí influye en cerrar o no.

**6. Caja Menuda es el único módulo con su propia piel: letra Playfair, acento verde-azulado y botones redondos, distinto a todo lo demás. ¿La igualamos al resto?**
- a) Igualarla al sistema (mismos botones, misma letra, mismo color de módulo).
- b) Dejarla como está — te gusta cómo se ve.
- c) Dejar la letra y solo igualar los botones.
**Recomiendo (a).** Además de verse aparte, trae dos fuentes desde internet antes de pintar, y esta es justo la pantalla que se abre en la calle con el recibo en la mano. Pero si te gusta cómo se ve, esto es tuyo, no mío.
