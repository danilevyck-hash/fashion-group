# Guías de Despacho — el mapa

> Medido contra producción el **5-sep-2026**. Ningún número sale de la documentación.
> Solo lectura. Este archivo no toca una línea del sistema.

---

## Qué es, quién entra, cuánto se usa

**Qué es.** El papel que viaja con la mercancía: qué salió, para quién, en qué camión, quién lo recibió y su firma. Es el módulo que más se toca a diario.

**Quién entra** (medido en `role_permissions` + `src/lib/modules.ts`): 4 roles, **8 personas activas**.

| Rol | Personas | Qué hace |
|---|---|---|
| Secretaria | Angela, andrea | **Crea el 99% de las guías** (200 de 202 con nombre) |
| Bodega | Bodega | Despacha (166 guardados) |
| Admin | daniel, alberto | Crea 2, despacha 17, borra 4 |
| Vendedor | rey, edwin, rodrigo | Solo lectura (no medible: no se registran lecturas) |

**Cuánto se usa** (bitácora `activity_logs`, abr–sep 2026):

| | Número |
|---|---|
| Guías vivas | **222** (221 despachadas · 1 pendiente) · 20 borradas |
| Renglones de envío vivos | **532** |
| Guías por mes | mar 9 · abr 50 · may 33 · jun 33 · jul 46 · ago 45 · sep 6 (al día 4) |
| Guías por día trabajado (jun–sep) | **2,3** |
| Envíos por guía | 2,2 promedio · **127 de 222 (57%) llevan UNO solo** · el mayor, 17 |
| Bultos movidos | **7.564** |
| De crear a despachar | mediana **1 h 51 min** |
| Clientes distintos usados | **49** (de 150 en el directorio) |
| Transportistas | **6** (RedNblue 52 · Boston 30 · Edwin 28 · Mojica 16 · Transporte Sol 16 · Sanjur 14) |

**Nadie usa:** el estado «Rechazada» (0 de 242 guías en toda la historia) · «Atar cliente» (**7 veces** desde que existe) · «Corregir renglón» (**3 veces**).

---

## Los datos, medidos

### La guía (`guia_transporte`) — 222 vivas

| Columna | Vacía | % | Nota |
|---|---|---|---|
| `firma_transportista` | 222 | **100%** | Columna muerta. Nunca se escribió |
| `nombre_entregador` | 222 | **100%** | Columna muerta |
| `cedula_entregador` | 222 | **100%** | Columna muerta |
| `monto_total` | 0 en las 222 | **100% en cero** | Viaja al navegador en cada carga y no se muestra en ninguna pantalla |
| `motivo_rechazo` | 222 | **100%** | El estado «Rechazada» no existe en producción |
| `nombre_chofer` | 206 | 93% | |
| `numero_guia_transp` (cabecera) | 158 | 71% | El bueno vive por renglón |
| `transportista` (texto viejo) | 138 | 62% | Reemplazado por `transportista_id` |
| `observaciones` | 112 | 50% | Ver abajo — 51 de las llenas son basura |
| `receptor_nombre` · `cedula` · las 2 firmas | 65 c/u | 29% | Todas de antes del 10-ago |
| `placa` (solo transportista externo) | 28 | 13% | |

**Lo que dice el estado real del despacho:**

| | Antes del 10-ago | Desde el 10-ago |
|---|---|---|
| Despachadas | 176 | **45** |
| «Salió incompleta» (sin placa / sin quién recibió / sin cédula) | **65** | **0** |
| Sin N° del transportista | 135 | 22 (**49%**) |

El bloqueo del 10-ago funciona: **0 de 45**. Las 65 viejas siguen marcadas en ámbar y **no hay forma de arreglarlas desde la pantalla** — la marca acusa sin dar salida.

**Observaciones — la mitad es basura y la otra mitad es un campo que falta:**

| Qué dice | Guías |
|---|---|
| «Cerrada en bloque el 3-ago-2026: salió físicamente, sin registro de despacho» | **51** (23% de las vivas) |
| Dicen la **tienda** («Tienda 3», «Tienda # 10 metromall») | 15 |
| Dicen **muebles / paneles / ganchos** de marketing | 18 |
| Dicen el **pasillo** («Albrook pasillo del delfín») | 7 |

De las 59 observaciones reales, **40 (68%) son una de esas tres cosas** — la gente escribe ahí lo que no tiene dónde poner.

### Los renglones (`guia_items`) — 532 vivos

| Columna | Vacía | % |
|---|---|---|
| `cliente` (texto) | 0 | 0% |
| `direccion` | 0 | 0% |
| `empresa` | 0 | 0% |
| `facturas` | 0 | 0% |
| `bultos` | 0 | 0% |
| `cliente_codigo` | **93** | **17%** |
| `numero_guia_transp` | 468 | **88%** |

**Lo escrito a mano, medido:**

| | Real | Grafías tecleadas |
|---|---|---|
| Clientes | **49** códigos | **119** formas de escribir el nombre |
| Destinos | **58** lugares | **77** grafías |
| Empresas | **8** del grupo | **27** grafías |

Las 27 grafías de empresa incluyen `Fashion Shoes` · `Fashion Shoes ` · `FASHION SHOES` · `fashion Shoes` (4 para una), `Vistana International` con 6 variantes, los tipeos `Fahion Wear` y `Joysbees`, `KARL LAGUERFELD` y `VISTANA / FASHION WEAR` (dos empresas en un renglón).

Los dos destinos más tecleados: **`Paso Canoas` 209 renglones (39%)** y **`David` 110 (21%)** — entre los dos, **60% del trabajo**.

Los 5 clientes más despachados se llevan **252 de 532 renglones (47%)** y aparecen en **121 de 218 guías (56%)**: D-25 (80) · D-142 (50) · D-108 (48) · D-24 (39) · D-80 (35).

### Los destinos definidos (`guias_destino_cliente`) — 34 filas

**26 clientes · 34 destinos · 25 con «el de siempre» · todas escritas por `daniel` el 4 y 5-sep.** Ninguna borrada.

Cobertura contra el trabajo real: **195 de 532 renglones (37%)** van a un cliente con «el de siempre». Los tres más despachados están así:

| Cliente | Renglones | Grafías de destino | Destinos definidos |
|---|---|---|---|
| D-25 | 80 | 4 | 1 ✔ el de siempre |
| D-142 | 50 | **34** | 8 · **ninguno «el de siempre»** |
| D-108 | 48 | 3 | **0** |
| D-24 | 39 | 2 | **0** |
| D-126 | 20 | 1 | **0** |
| D-118 | 15 | 1 | **0** |

---

## Cuánto cuesta hacer las cosas

Cinco tareas reales, contadas contra el código. «Toques» = tocar algo con el dedo; escribir un campo cuenta aparte.

### 1 · Crear una guía — Angela y andrea, 2,3 al día

| Hoy | |
|---|---|
| Toques | **9 a 11** |
| Pantallas | 2 (`/guias` → `/guias/nueva`) |
| Campos a mano | **1** en el mejor caso (bultos) · **5** si la factura no está en el panel |
| Lo que el sistema ya sabe y aun así se toca | Transportista: el recordado **acierta 87 de 221 veces (39%)** → 61% de las veces son 2 toques más. Cliente: 47% de los renglones van a 5 clientes y aun así se busca desde cero cada vez |
| Se repite | El destino se vuelve a poner en el **63% de los renglones** (los clientes sin «el de siempre») |

Camino corto de hoy: Guías → Nueva Guía → abrir el selector → elegir el cliente → marcar la factura (llena cliente, empresa, factura y destino) → escribir los bultos → Guardar. **7 toques.** Sube a 9 cuando hay que cambiar el transportista (61% de las veces) y a 10–11 cuando el cliente no tiene destino de siempre (63%).

**La versión más corta: 6 toques.** Si al abrir «Nueva guía» ya vienen ofrecidos los 5 clientes que se llevan el 47% del trabajo (un toque en vez de una búsqueda) y los 26 clientes de la configuración cubren los tres más despachados, el camino queda: Guías → Nueva Guía → tocar el cliente → marcar la factura → bultos → Guardar.

### 2 · Despachar — Bodega, 2,3 al día

| Hoy | |
|---|---|
| Toques | **~10** |
| Pantallas | 3 (`/guias` → banner «Ver pendientes» → `/guias/[id]`) |
| Campos a mano | 3 (placa · quién recibió · cédula) + **2 firmas dibujadas** |
| Lo que el sistema ya sabe | El juego frecuente por transportista ya existe (desde el 14-ago) y **funciona**: antes 8 personas tenían la cédula escrita de más de una forma, ahora **1 de 22**. Pero solo aparece **al escribir** en «Recibido por», no al abrir |
| Se repite | La pantalla de despacho **se guarda 2,5 veces por guía**: 549 guardados para 221 despachos reales |

**El número más fuerte del módulo:** de los 549 guardados de la pantalla de despacho, solo **142 (26%) cambian el estado**. Los otros **407 (74%) reemplazan los renglones enteros** — borran e insertan las líneas con identificadores nuevos. La guía 85 pasó por eso **45 veces en 3 h 38 min**; la 79, 43 veces; la 120, 33 veces. Y quien más guarda ahí no es Bodega (166) sino **Angela (251)**: las secretarias entran a la pantalla de despacho a corregir renglones.

**Versión más corta: 6 toques.** Ofrecer el juego frecuente **al abrir** la pantalla (no al escribir) llena placa, quién recibió y cédula de un toque; quedan las dos firmas y «Despachar».

### 3 · Sacar el papel — todos los días

| Hoy | |
|---|---|
| Toques | **3** (fila → acordeón → Imprimir) · varias guías: Seleccionar → marcar N → Imprimir todas |

Esto está bien. No lo tocaría.

### 4 · Anotar el N° del transportista que llegó tarde

| Hoy | |
|---|---|
| Toques | **5** (buscar la guía → abrir la fila → Editar → escribir → Guardar) |
| Cuánto hace falta | **22 de las 45 guías despachadas desde el 10-ago (49%)** lo tienen vacío |
| Qué no ayuda | La marca ámbar «Falta N° transportista» **no es un botón**: dice el problema y no lleva a arreglarlo |
| Cuántas veces se hizo | `guia_item_correccion`: **3 en toda la historia** |

**Versión más corta: 2 toques.** Que la marca ámbar sea el botón: se toca, se escribe el número, listo.

### 5 · Decir a qué cliente fue un renglón viejo

| Hoy | |
|---|---|
| Toques | **5** (fila → acordeón → «Atar cliente» → elegir → Guardar) |
| Cuánto falta | **93 renglones (17%)** sin código |
| Cuántas veces se hizo | **7 en toda la historia** (3 daniel · 3 Angela · 1 Bodega) |

La ventana con «¿quisiste decir…?» funciona y nadie llega hasta ella. Nada en la lista dice que esos 93 renglones existen.

---

## 🩸 Lo que miente o está roto

**1 · El atajo nuevo escribe la factura con un formato que nadie más usa — y deja ciego el aviso «ya salió».**
`marcarFactura` guarda el `secuencial` crudo de Switch: `11-000002534`. Las personas escriben `2534`. Medido: **518 de 519 renglones con factura (99,8%) usan el formato corto**; hay **1** con el largo, la guía 242 del 4-sep, la primera hecha con el atajo. Dos consecuencias:
- El papel, el PDF y el Excel imprimen `11-000002534` — 12 caracteres donde siempre hubo 4 (`src/lib/guias/pdf-guia.ts:224`, `PrintDocument.tsx:148`).
- El aviso **«Ya salió en GT-XXX» no puede saltar contra ninguna guía vieja**: el índice se arma con la clave `2534` y la búsqueda pregunta por `11-000002534` (`src/lib/guias/atajos-facturas.ts:107-111` y `:206-233`). Nunca parean.

**2 · «Despachar» no despacha: 74% de las veces borra y reescribe los renglones.**
549 registros de `guia_dispatch` · **142 cambian el estado** · **407 dicen `items: replaced`**. Cada uno de esos 407 borró las líneas de la guía e insertó otras con identificadores nuevos. Sigue pasando después del arreglo del 17-ago: el 31-ago se guardaron 14 veces, 12 de ellas reemplazando. `src/app/api/guias/[id]/route.ts:196-227` usa `.delete()`, no soft delete.

**3 · `guia_items.deleted` es una defensa contra algo que no puede pasar.**
**0 de 566 filas** la tienen en `true`, y **ningún archivo del repo la escribe** — los renglones se borran de verdad. Aun así cuatro lecturas la filtran y `CLAUDE.md` la lista como soft delete del módulo. Quien lea la documentación cree que hay una red que no existe.

**4 · La lista es la única lectura que no filtra los renglones borrados.**
`GET /api/guias` trae `guia_items(...)` **sin** el campo `deleted` y sin filtrarlo (`src/app/api/guias/route.ts:55`); todas las demás sí lo hacen. Hoy no cambia nada (0 renglones marcados), pero es la única puerta abierta.

**5 · Borrar una guía deja sus renglones vivos.**
**34 renglones** pertenecen a las 20 guías borradas y siguen con `deleted = false`. La lista no los ve (filtra la cabecera), pero cualquier cuenta que arranque de `guia_items` los suma.

**6 · La fuente de los destinos está escrita dos veces, y la pantalla no puede borrar la mitad.**
La tabla tiene **26 clientes / 34 filas**; la constante `DESTINOS_DEFINIDOS` tiene **26 clientes / 34 filas** — las mismas. La precedencia es **por cliente** (`destinos-clientes.ts:195-206`): si borras en Guías › Configuración el único destino de un cliente, la fila queda apagada y **la constante lo devuelve igual**. O sea: los 26 clientes que están en el código **no se pueden borrar desde la pantalla**. (`CLAUDE.md` dice que esa migración está pendiente; está aplicada — las 34 filas están en producción con fecha 4 y 5-sep.)

**7 · El Excel dice el nombre sucio; la pantalla dice el bueno.**
La lista muestra el chip «American Classics Store · D-108». El Excel exporta `item.cliente` crudo (`excel-guias.ts:86`) — el texto tecleado, con sus tipeos — y **no lleva la columna del código**. En los 439 renglones atados el dato bueno existe y el Excel lo tira.

**8 · Hay dos vocabularios para «no hay factura».**
`0000` (**56 renglones**, usado tan tarde como el 4-sep en la guía 244) y `Traslado` (**0 renglones**; el botón salió el 4-sep). Los dos pasan la validación. El campo va al papel tal cual, así que hoy el papel dice `0000` en 56 envíos.

**9 · Bodega ya no aterriza en Guías.**
`CLAUDE.md` dice «Auto-redirect a Guías desde home (único módulo)». Bodega tiene **4 módulos** en `role_permissions` (guias · packing-lists · catalogos · referencia) y el redirect exige `length === 1` (`src/app/home/page.tsx:93`). Quien usa Guías todo el día cae en el inicio y tiene que buscar la ficha.

**10 · La bitácora del módulo tira el identificador de la guía.**
Las **770 filas** de Guías en `activity_logs` tienen `entity_id` en `NULL`; el identificador está enterrado en el texto del campo `details`. No se puede pedir el historial de una guía sin partir texto. (Y hay **8 registros de un script de medición**, `medicion-t203b`, mezclados con los reales.)

**11 · La cédula del que recibe la mercancía se escribió mal durante meses.**
**8 personas · 53 despachos (24%)** con la cédula escrita de más de una forma. El caso peor: **«Eric», 17 despachos, 4 cédulas** (`890`, `8930`, `89302114`, `89302142`) — y `8-930` fue la más tecleada, **10 veces**. Esa cédula es lo que respalda quién recibió. Desde el 14-ago, con el juego frecuente puesto, queda **1 caso de 22**.

**12 · Cinco columnas muertas siguen viajando y una todavía se puede escribir.**
`firma_transportista`, `nombre_entregador`, `cedula_entregador` (222/222 vacías), `motivo_rechazo` (0 filas) y `monto_total` (**0.00 en las 222**). Las cinco siguen en la lista de campos que acepta el `PATCH` (`src/app/api/guias/[id]/route.ts:296`), y `monto_total` viaja al navegador en cada carga de la lista sin mostrarse en ninguna pantalla.

**13 · La lista se trae las 222 guías con sus 532 renglones, sin tope.**
`GET /api/guias` no lleva `.limit()` ni paginación. Hoy funciona. Con 38 guías nuevas al mes, el techo silencioso de 1.000 filas llega alrededor de **junio de 2028** — y ese día la lista pierde guías sin decir nada.

**14 · Números viejos en la documentación** (no son errores del sistema, son de la doc):

| `CLAUDE.md` / postmortem dice | Producción hoy |
|---|---|
| 238 guías · 216 Completadas · 2 Pendientes | **242 · 221 · 1** |
| 562 renglones | **566** (532 vivos) |
| 441 líneas vivas · 320 atadas (73%) | **532 · 439 atadas (83%)** |
| 190 de 207 despachadas incompletas (92%) | **65 de 221 (29%)** |
| 34 destinos «al aplicar la migración (pendiente)» | **34 filas aplicadas**, 4-5-sep |

---

## Coherencia con el sistema

| Diferencia | Detalle |
|---|---|
| **Borrar** | Guías es el **único** módulo que pide escribir `ELIMINAR` a mano (`src/app/guias/page.tsx:70`). Los otros 13 lugares usan `ConfirmDeleteModal` con 1 s de espera |
| **Deshacer** | La regla de la casa es «5 segundos para deshacer». Borrar una guía **no tiene deshacer** — es escribir la palabra y ya. Quitar un envío del formulario sí lo tiene |
| **Soft delete** | La guía sí (`deleted`). **Los renglones se borran de verdad**, y la documentación dice lo contrario |
| **Excel** | ✅ Sale por `workbookFromSheets`, empieza en la fila 1, con la paleta y el total de la casa. La única diferencia: la columna «Estado» imprime el valor crudo (`Completada` / `Pendiente Bodega`) y la pantalla muestra `despachada` / `pendiente` |
| **Botón principal** | ✅ «Nueva Guía» negro, arriba a la derecha, como en los demás |
| **Estado en la URL** | La pestaña Configuración usa `window.history.replaceState` a mano (`page.tsx:130`) en vez de `useUrlState`; el resto del sistema usa el hook |
| **Voseo** | ✅ Ninguno. Ni en pantalla ni en comentarios |
| **Diccionario** | ✅ Nombres cortos de empresa en el selector. ⚠️ En los datos viejos conviven 27 grafías, incluidas las largas |
| **Cero grande** | ✅ Ningún `0` en letra grande. «No hay guías» y «No hay guías registradas» |
| **Vacíos y errores** | ✅ Frases humanas, sin texto crudo del servidor |

---

## iPhone (390 px)

Es de los módulos mejor cuidados del sistema. Tiene su propio candado (`iphone-targets-guias.test.ts`) y las pantallas parten en tarjeta debajo de 1024 px, no de 768 — el iPad vertical entra por el lado de la tarjeta a propósito.

**Lo que sí anoto:**

| | |
|---|---|
| **Letra de 12 px en datos** | Las pantallas nuevas (Configuración, botones de destino, panel de facturas) usan `text-xs` = **12 px** para el nombre del destino y la tienda. Es el piso del candado del módulo, pero la regla de la casa dice «mínimo 14 px para datos» y un destino es un dato que se elige |
| **La tabla del formulario** | En escritorio pide 720 px (820 con la columna del N°). En celular no se usa: manda la tarjeta. ✅ |
| **La tabla de envíos de la fila abierta** | Pide 600 px dentro de una pantalla de 390 → **210 px de arrastre lateral** para llegar a la última columna |
| **«Ver más»** | La lista abre con **15 de 222**. Llegar a la guía 1 son **14 toques** de «Ver más». El buscador tapa el caso |
| **Marcas ámbar** | En la tarjeta las dos marcas («Falta N° transportista» · «Salió incompleta») bajan a su propia línea. ✅ No se aplastan |
| **No verificado** | No abrí el navegador: esto sale de leer los componentes. Lo de los 210 px de arrastre y el tamaño de la letra hay que confirmarlo con una captura antes de tocar nada |

---

## Lo que sobra · lo que falta

### Sobra (con lo que lo prueba)

| Qué | Por qué | Medida |
|---|---|---|
| Las 51 observaciones «Cerrada en bloque el 3-ago-2026…» | Es el rastro de una operación técnica de hace un mes, en pantalla en cada guía | 51 de 222 guías (23%) |
| El total de bultos al pie de la lista | Suma 7.564 bultos de 222 guías de seis meses. Nadie decide nada con eso | 1 número |
| «Lista plana / Agrupar por fecha» | Un botón de 12 px que cambia cómo se ven 15 filas | 1 botón |
| El estado «Rechazada» y `motivo_rechazo` | 0 filas en toda la historia, no hay forma de crearlo | 0 de 242 |
| `monto_total` | 0.00 en las 222; viaja al navegador y no se muestra | 100% |
| `firma_transportista` · `nombre_entregador` · `cedula_entregador` | 222 de 222 vacías, y el `PATCH` todavía las acepta | 100% |
| La columna `transportista` de texto | 62% vacía; el bueno es `transportista_id` con su catálogo de 6 | 138 de 222 |
| La constante `DESTINOS_DEFINIDOS` en el código | Repite exactamente las 34 filas de la tabla y bloquea el borrado desde la pantalla | 34 = 34 |

### Falta

| Qué | Por qué | Medida |
|---|---|---|
| **Un campo «Tienda»** en el renglón | La gente ya lo escribe en Observaciones | 15 guías dicen «tienda» ahí |
| **Un campo «Muebles / material»** | Igual: se escribe en Observaciones porque no hay dónde | 18 guías |
| **La empresa como lista cerrada en los datos viejos** | El formulario ya la tiene cerrada. Lo viejo tiene 27 grafías para 8 empresas | 27 → 8 |
| **Destino definido para los 3 clientes más despachados** | D-108 (48 renglones), D-24 (39) y D-126 (20) no tienen ninguno; D-142 (50) tiene 8 y ninguno marcado | 147 renglones (28%) |
| **Que las marcas ámbar sean botones** | «Falta N° transportista» marca 22 guías vivas y no lleva a arreglarlas | 22 de 45 |
| **Un lugar donde se vean los 93 renglones sin cliente** | Existe la ventana para atarlos y se usó 7 veces | 93 renglones |

---

## Lo que Daniel ya cerró (no se revive)

| Decisión | Cita |
|---|---|
| Elegir cliente **no es obligatorio** al crear una guía | La pantalla la usa bodega todos los días y 93 renglones van a destinos que no están en el directorio |
| **Nada se ata por parecido** — ni con un único candidato | «Outlet Duty Free N2» y «N3» son tiendas distintas |
| El N° del transportista **no bloquea** el despacho | *«a veces el transportista lo da, a veces no»* |
| Placa, quién recibe, cédula y las dos firmas **sí bloquean** | *«Placa · quién recibe · cédula debería de bloquear no?»* — sí |
| Los **bultos** de una guía despachada no se tocan | *«es lo que el transportista firmó»* |
| **El texto escrito no se toca**; solo se guarda el código | *«el código es plomería invisible»* |
| **No definir cliente por cliente** | *«no quiero definir cliente por cliente…»* |
| La lista **no despacha ni edita** | Se sacó el 10-ago y sigue afuera |

---

## Preguntas para ti

### 1 · El formato de la factura que escribe el atajo nuevo

Marcar una factura guarda `11-000002534`. A mano siempre se escribió `2534` (518 de 519 renglones). Eso sale así en el papel y deja ciego el aviso «ya salió en otra guía».

- **a)** Guardar solo el número corto (`2534`), como se escribió siempre. El papel no cambia y el aviso vuelve a funcionar.
- **b)** Dejar el largo y arreglar solo el aviso para que compare por el número corto. El papel sigue diciendo 12 dígitos.
- **c)** Dejarlo como está.

**Recomiendo (a).** Es un cambio de una línea, el papel vuelve a verse como los 218 anteriores, y el aviso «ya salió» pasa de ver 1 renglón de 519 a verlos todos.

### 2 · Los 407 guardados que reescriben los renglones

La pantalla de despacho se guarda 2,5 veces por guía, y en 74% de esos guardados los renglones se borran y se vuelven a crear. Una guía pasó por eso 45 veces en 4 horas.

- **a)** Que la pantalla de despacho **no mande los renglones nunca** — ahí solo se firma; corregir renglones sigue estando en «Editar».
- **b)** Que los mande solo cuando de verdad cambió un renglón (ya existe esa comparación para el guardado automático; falta aplicarla al botón).
- **c)** Dejarlo.

**Recomiendo (b).** Es la misma regla que ya frenó el guardado automático el 17-ago, aplicada al botón. Con (a) Angela pierde el camino que hoy usa 251 veces.

### 3 · Los destinos de los 3 clientes que más se despachan

D-108 (48 renglones), D-24 (39) y D-126 (20) no tienen ningún destino definido, y D-142 (50 renglones, 34 grafías de destino) tiene 8 destinos y ninguno marcado «el de siempre». Son 147 renglones (28%) que se escriben a mano cada vez.

- **a)** Me dices el destino de siempre de esos cuatro y lo cargo yo (4 líneas).
- **b)** Que el sistema proponga el destino más usado de la historia de cada cliente y tú confirmes de un toque en Guías › Configuración.
- **c)** Dejarlo: se sigue escribiendo a mano.

**Recomiendo (b).** Con (a) tendrías que definir cliente por cliente, que es justo lo que dijiste que no querías; (b) te muestra lo que ya hacen y solo confirmas. D-142 va aparte: sus 8 tiendas son destinos de verdad distintos y ahí sí hay que elegir cada vez.

### 4 · Las 51 guías con «Cerrada en bloque el 3-ago-2026…» en Observaciones

Es el rastro de una operación técnica de hace un mes que bodega ve en 23% de las guías.

- **a)** Borrar esa frase de las 51 (las observaciones reales de 3 de ellas se conservan).
- **b)** Esconderla en pantalla y dejarla en la base.
- **c)** Dejarla.

**Recomiendo (b).** Borrar texto de un documento ya firmado es lo que este módulo evita; esconderlo limpia la pantalla sin tocar el historial.

### 5 · Lo que la gente escribe en Observaciones y no tiene campo

40 de las 59 observaciones reales dicen una de tres cosas: la **tienda** (15), los **muebles o paneles** que van en el viaje (18) y el **pasillo** del destino (7).

- **a)** Agregar «Tienda» al renglón (la tabla de destinos ya la tiene) y dejar muebles y pasillo en Observaciones.
- **b)** Agregar «Tienda» y «Material de marketing» al renglón.
- **c)** No agregar nada: Observaciones alcanza.

**Recomiendo (a).** «Tienda» ya existe en la configuración de destinos y hoy solo la usa D-142; sacarla al renglón cierra el hueco de las 15. Los muebles son 18 casos en seis meses y un campo más por envío se paga todos los días.

### 6 · Las 65 guías marcadas «Salió incompleta» que nadie puede arreglar

Salieron sin placa, sin quién recibió o sin cédula, todas antes del 10-ago. Desde entonces son 0 de 45. La marca ámbar está puesta para siempre y esos tres campos siguen cerrados a propósito.

- **a)** Quitar la marca de las anteriores al 10-ago y dejarla solo para lo nuevo (que hoy es cero).
- **b)** Abrir esos tres campos para completarlos.
- **c)** Dejarla como está.

**Recomiendo (a).** El bloqueo ya garantiza que no vuelva a pasar; 65 marcas permanentes que nadie puede quitar entrenan a la gente a ignorar el color ámbar — y ese mismo color es el que avisa las 22 guías a las que sí les falta el N° del transportista y sí se pueden arreglar.
