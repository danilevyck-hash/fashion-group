# Mapa — Referencia

> Medido contra producción el **5-sep-2026** (Management API, solo lectura).
> Todo número de aquí se remidió; lo que no cuadra con `CLAUDE.md` va marcado 🩸.
> Esto es **mapeo**: no se tocó una línea de la aplicación.

---

## 1 · Qué es, quién entra, cuánto se usa

**Qué es.** Pegas de 1 a 50 códigos y por cada modelo sale una tarjeta con **cuánto llegó, cuánto se vendió y cuánto queda**. Nació como pestaña de Ventas y desde el 12-ago-2026 tiene su propia entrada en el inicio.

**Quién entra:** **admin · vendedor · bodega**. La secretaria no, contabilidad no, Jennifer no, David no.
El **margen** solo lo ve admin (`route.ts:278`); vendedor y bodega ven costo, precio y todo lo demás.

**Cuánto se usa: NO MEDIBLE, y esa es la primera noticia.**

- `activity_logs` tiene **0 filas** de Referencia. Solo registra acciones que escriben, y Referencia no escribe nada.
- El sistema **sí cuenta los clics de cada módulo** (`recordModuleClick`, home y sidebar), pero los guarda en el `localStorage` del navegador — *«Cero backend, cero write a DB»* (`module-frequents.ts:1-5`). El dato existe, se genera cada vez que alguien toca la ficha, y **se tira**.
- Lo único medible es el botón: **«Actualizar datos de Switch» se tocó UNA vez en toda la historia, el 10-ago-2026** (1 corrida `manual` contra 159 `cron` en `switch_sync_log`). Y entre el 11-ago y el 4-sep el botón **no estaba en la pantalla**, así que desde que volvió nadie lo ha tocado.

---

## 2 · Los datos, medidos

### El catálogo que alimenta la pantalla (`switch_articulo_info`)

| Empresa | Artículos | Con existencia | Sin precio | Sin ficha (rubro/marca) | Último sync |
|---|---|---|---|---|---|
| Vistana | 8.273 | 1.540 | 51 | 8.273 | 5-sep |
| Fashion Wear | 5.111 | 2.628 | 1 | 5.111 | 5-sep |
| Active Shoes | 1.763 | 187 | 8 | **355** | 5-sep |
| Fashion Shoes | 712 | 463 | 2 | 712 | 5-sep |
| Active Wear | 592 | 21 | 6 | 592 | 5-sep |
| Joystep | 207 | 85 | 4 | 207 | 5-sep |
| **Total** | **16.658** | **4.924** | **72** | **15.250** | |

- **4.924 artículos con existencia** — el número que le importa a Daniel (`CLAUDE.md` dice 5.040; es la deriva normal de tres días).
- **0 artículos con existencia desconocida** en las 6 empresas.
- **207.943 piezas** en bodega, sumadas las 6.

### Las llegadas (`switch_ingresos_mercancia`)

| Empresa | Líneas | Llegadas | Desde | Última |
|---|---|---|---|---|
| Fashion Wear | 18.747 | 761 | 27-ene-2023 | 4-sep-2026 |
| Vistana | 10.354 | 713 | 25-oct-2022 | 4-sep-2026 |
| Fashion Shoes | 3.581 | 218 | 29-ene-2023 | 4-sep-2026 |
| Active Shoes | 2.160 | 105 | 24-ene-2023 | 1-sep-2026 |
| Active Wear | 606 | 26 | 2-dic-2022 | 20-ago-2026 |
| **Joystep** | **124** | **2** | 5-jul-2025 | **27-ene-2026** |
| **Total** | **35.572** | **1.825** | | |

**Joystep tiene 2 llegadas en toda su historia y la última fue hace 7 meses.** Para esa empresa, Referencia no tiene casi nada que medir.

### Salud de la sincronización

`sync-articulo-info`: **159 corridas, 0 fallos**, las 6 empresas al día (5-sep, 04:33-04:53 UTC). El cron funciona.

---

## 3 · 🩸 Lo que miente o está roto

### 🩸1 · «VENDIDO no puede pasar de 100%» es cierto solo para el 57% de lo que se busca

`CLAUDE.md` § Ventas/Referencia dice el invariante así:
> **VENDIDO = `Vendí ÷ (Vendí + Stock)`** — amarrado al Stock por construcción, así que **no puede pasar de 100%**.

Medido en el código que corre (`resumen-articulo.ts:520-532`), la función tiene **dos ramas**:

| Caso | Fórmula | ¿Puede pasar de 100%? |
|---|---|---|
| El artículo está en el catálogo (existencia conocida) | `Vendí ÷ (Vendí + Stock)` | **No** |
| El artículo **no está** en el catálogo (`quedan == null`) | **`Vendí ÷ Compré`** | **Sí** |

Y la segunda rama no es teórica. Medido:

- **27.138** códigos distintos (empresa + código) tienen llegadas registradas.
- **15.440** de ellos tienen fila en el catálogo.
- **11.698 (43%) NO la tienen** → para esos, VENDIDO se calcula sobre lo comprado y **puede pasar de 100%**, y además la tarjeta sale sin Stock, sin precio de lista y sin margen.

El código lo dice y lo asume: *«`TERMO` muestra **207%**, y está bien»* (`resumen-articulo.ts:945`). No es un error del código — es que **el invariante escrito describe la mitad buena y calla la otra**.

### 🩸2 · Tres comentarios del mismo archivo describen la fórmula VIEJA

Dentro de `resumen-articulo.ts` conviven dos definiciones de VENDIDO:

| Línea | Dice | ¿Es lo que corre? |
|---|---|---|
| `:520-532` (la función) | `vendido / (vendido + max(0, quedan))` | **sí** |
| `:697` | «% VENDIDO = lo REAL: **Vendí ÷ Compré**» | no — fórmula superada |
| `:956` | «el % REAL (**Vendí ÷ Compré**), como fracción 0-1» | no |
| `referencia-excel.ts:146-151` | «Vendido = lo vendido ÷ LO QUE HUBO (Vendí + Stock), **nunca sobre lo comprado**» | sí, pero omite la rama sin catálogo |

Es la clase de dato viejo que hace que el próximo cambio salga mal: quien lea `:697` y «arregle» la función para que coincida, rompe el invariante que sí vale.

### 🩸3 · Los «TRES GRANDES» son CUATRO en la pantalla y CINCO en el Excel

| Dónde | Cuántos | Cuáles |
|---|---|---|
| `CLAUDE.md` y `resumen-articulo.ts:2, 230` | **3** | Compré · Vendí · Stock |
| La pantalla (`ReferenciaTarjeta.tsx:12, 183, 204-216`) | **4** | Compré · Vendí · Stock · **Meses** |
| El Excel (`referencia-excel.ts:142-155`, bajo el rótulo «los tres grandes») | **5** | Compré · Vendí · Stock · **Vendido** · **Meses** |

El rótulo se quedó en «tres» y el número creció dos veces. No rompe nada; miente al que lo lee.

### 🩸4 · 10.588 piezas del «Stock» que muestra Referencia no son mercancía

**7 códigos con existencia que no son un producto**, y suman el **5,1% de las 207.943 piezas del grupo**:

| Empresa | Código | Descripción | Existencia | Precio |
|---|---|---|---|---|
| Fashion Shoes | `THSPWHG3X01000` | Unisex-Store Planning | **8.800** | $0.00 |
| Fashion Wear | `S1` | Ajuste de Precio | **846** | $12.00 |
| Fashion Shoes | `AJUSTE` | Mercancía Defectuosa | **719** | $0.00 |
| Vistana | `S1` | Ajuste de Precio | **208** | $15.00 |
| Vistana | `CK-PTMDF-02000` | Unisex-Store Planning | 2 | $0.00 |
| Active Shoes | `A01` | AJUSTE DE PRECIO | 1 | $0.00 |
| Joystep | `01` | AJUSTE DE PRECIO | 1 | $2.00 |

Uno solo —`THSPWHG3X01000`— tiene **8.800 piezas con existencia y 8.000 de llegada**: más stock del que llegó. Si alguien lo busca, la tarjeta le va a dar una cuenta que no cierra sobre algo que ni siquiera es un zapato.

El módulo ya tiene la regla de que **un ajuste de inventario nunca es una venta ni una compra** (`compras.ts:33-35`) y lo muestra aparte — pero eso aplica al movimiento del día, no al artículo. Estos siete entran a la búsqueda como cualquier otro.

### 🩸5 · Pegas 60 códigos, el sistema usa 50 y no te dice cuáles se cayeron

`parsearListaCodigos` (`referencia.ts:269-278`) corta en 50 y devuelve `descartados: N`. La API lo pone en la respuesta (`route.ts:333`). **Ninguna pantalla lo lee** — grep sobre `ReferenciaView.tsx` y `ReferenciaTablaPedido.tsx`: cero coincidencias.

Además, cualquier palabra pegada que no parezca un código (el encabezado del Excel, por ejemplo) **se descarta sin contarse siquiera en ese número**.

Es exactamente el patrón que `CLAUDE.md` marca como el peligro del sistema — *«corta EN SILENCIO»* — y el módulo lo tiene en su puerta de entrada. Contexto: la lista real de Daniel que motivó el arreglo de agosto **traía 47 modelos**. El margen contra el tope es de 3.

### 🩸6 · La pantalla de error muestra el mensaje CRUDO del servidor

`ReferenciaView.tsx:126-128` muestra tal cual el `error` que devuelve la ruta. Y la ruta, en el caso 500, devuelve **el mensaje de la excepción** (`actualizar/route.ts:117`: `NextResponse.json({ error: msg }, { status: 500 })`).

`CLAUDE.md` marca esto como 🩸 resuelto en otro módulo: *«La pantalla de error del CXC mostraba el mensaje CRUDO y el stack, **la única del sistema**»*. **No era la única.** Aquí sigue, y la ven vendedor y bodega.

Peor: el caso 503 le dice a un bodeguero *«La tabla switch_articulo_info todavía no existe — falta correr la migración 20260810130000 en Supabase»* (`actualizar/route.ts:96-102`).

### 🩸7 · La lista de roles tiene una CUARTA copia escrita a mano

El postmortem del 4-sep dice, textual: *«tres copias a mano fue exactamente el defecto… Con una sola lista eso no puede volver a desincronizarse»* (`referencia.ts:38-46`). Las tres unificadas son la página, la búsqueda y el botón.

**Hay una cuarta**: `src/lib/modules.ts:132` escribe `roles: ["admin", "vendedor", "bodega"]` a mano y **no importa `REFERENCIA_ROLES`**. Es el archivo que decide si la ficha aparece en el inicio y en el menú.

Consecuencia si mañana se agrega un rol a `REFERENCIA_ROLES`: entra escribiendo la URL, pero **no ve la ficha en su inicio**. Es el mismo defecto, un archivo más allá.

### 🩸8 · El botón «Actualizar datos de Switch» solo aparece DESPUÉS de una búsqueda con resultados

`ReferenciaView.tsx:194` lo monta dentro de `{hayResultados && …}`. Y refresca **solo las empresas de esa búsqueda** (`empresasDeLaBusqueda`), en serie.

O sea: **no se puede pedir el dato fresco antes de buscar** — hay que buscar con el dato viejo, verlo, y recién ahí refrescar y volver a buscar. Para lo que el botón existe (*«el dato del momento antes de comprar»*, `actualizar/route.ts:20-22`), es el orden al revés.

Lo dicho arriba: se ha tocado **una vez en toda la historia**.

### 🩸9 · El comentario de la pantalla cita un texto que ya no existe

`ReferenciaClient.tsx:18` dice: *«la caja del buscador ya dice "**Podés** pegar hasta N códigos juntos"»*. La caja hoy dice **«Puedes pegar hasta 50 códigos juntos»** (`ReferenciaView.tsx:161-163`) — el texto se corrigió con el candado de tuteo y el comentario se quedó con el voseo. **En pantalla no hay voseo; en el comentario sí.**

### 🩸10 · El nombre de la empresa sale de una copia a mano, no del diccionario

El diccionario que definiste el 5-sep dice que el nombre de empresa **corto** sale de `EMPRESA_KEY_TO_NOMBRE_CORTO` — *«segundo campo de la MISMA lista, con candado de paridad»*.

La tarjeta de Referencia **no lo usa**: `ReferenciaTarjeta.tsx:112-121` define su propio mapa de 6 empresas y su propia `etiquetaEmpresa`. Los seis nombres son idénticos hoy; el problema es que son **una tercera copia** (la primera es el diccionario, la segunda `asistencia/config.ts:44`, que además devuelve el nombre LARGO).

Consecuencia si mañana cambias un nombre en el diccionario: Referencia sigue diciendo el viejo, y el candado de paridad no lo ve porque no mira este archivo.

### ✅ Lo que se revisó y está bien

- **Las NC restan**, en un solo lugar (`signoTipo`). El error histórico (diferencia = 2× las NC) tiene su test.
- **Nada de FIFO**: el reparto por tanda se retiró entero y está documentado con la cita de Daniel.
- **Stock es siempre la existencia de Switch** y el cuadre **no se fuerza** (`ReferenciaTarjeta.tsx:195`).
- **El FOB se calcula** (`CIF ÷ 1,10`, `PCT_IMPORTACION`), no se toma el de Switch.
- **Un solo buscador para 1 y para 50 códigos**, por prefijo. El bug de las dos semánticas del 12-ago está cerrado.
- **Excel**: lo baja por el generador de la casa (`workbookFromSheets` / `downloadWorkbook`), encabezados en la fila 1 y la aclaración larga **al pie, fuera del rango del filtro** — el patrón correcto.
- **El Excel respeta el rol**: sin margen para vendedor y bodega, no lo esconde en pantalla y lo baja igual.
- **Voseo en pantalla: cero.**

---

## 4 · Cuánto cuesta hacer las cosas

### Tarea A — Consultar 47 modelos pegados de un Excel (la tarea del módulo)

**Hoy: 2 toques + 1 pegado.**

| Paso | Pantalla | Toques |
|---|---|---|
| Inicio → Referencia (ficha directa) | `/home` → `/referencia` | 1 |
| Pegar la lista y tocar «Buscar» | misma | 1 (+ el pegado) |

**Campos a mano: 1** (la lista). **El sistema no puede saberla**: sale del Excel de Daniel, fuera del sistema.

**No hay nada que recortar en toques.** Lo que cuesta está después del segundo toque:

- **Lo que hay que recordar de memoria: cuántos códigos llevas.** El tope es 50, no se ve en ningún lado antes de pegar (el texto lo dice, pero debajo del campo), y si te pasas **no te avisa** (🩸5).
- **En el iPhone, la tabla del modo pedido mide 768 px y la pantalla 390.** Ver el Stock exige deslizar (ver § 5).
- **Filtros que se pierden: ninguno.** La pantalla no tiene filtros ni recuerda nada — se pega y ya. Está bien así.

**La versión más corta: 2 toques → 2 toques.** No hay ahorro de toques que proponer. Lo que sí se puede: **decir cuántos códigos se descartaron** (una línea al lado de «No encontré…», que ya existe) — cero toques nuevos y cierra el corte silencioso.

### Tarea B — Bajar el Excel de lo consultado

**Hoy: 3 toques** (Inicio → pegar/Buscar → «Bajar a Excel»). Nada que recortar.

### Tarea C — Traer el dato del momento antes de comprar

**Hoy: 4 toques y hay que buscar dos veces.**

| Paso | Toques |
|---|---|
| Inicio → Referencia | 1 |
| Pegar + «Buscar» (**con el dato viejo**) | 1 |
| «Actualizar datos de Switch» (solo aparece ahora) | 1 |
| La pantalla vuelve a buscar sola | 0 |

Se ha hecho **1 vez en toda la historia**. Los datos llegan solos todas las madrugadas (159 corridas, 0 fallos), así que puede que sencillamente no haga falta — o que nadie sepa que el botón está ahí, porque estuvo 24 días desaparecido.

**La versión más corta: 4 → 3**, si el botón vive junto a «Buscar» en vez de aparecer después de los resultados. Pero antes de moverlo hay que saber si alguien lo quiere (pregunta 3).

---

## 5 · iPhone (390 px)

| Dónde | Qué pasa | Archivo:línea |
|---|---|---|
| **Tabla del modo pedido** (2+ códigos) | **768 px de ancho** (Código 210 + Compré 72 + Vendí 72 + Stock 72 + Vendido 84 + Meses 64 + Margen 66 + Últ. compra 92 + 36) contra ~358 px útiles. **Deslizas para ver el Stock.** La tabla sí tiene su propio `overflow-x-auto` y el cuerpo de la página no se mueve — el patrón es el correcto, pero se ven 2 de las 8 columnas | `ReferenciaTablaPedido.tsx:78-89`, `:186` |
| Tarjeta de un artículo | `grid-cols-2` en el teléfono con números de **34 px**: se ven 2 de los 4 grandes por fila. Entra bien | `ReferenciaTarjeta.tsx:203`, `:236` |
| Buscador, botones, coincidencias | `min-h-[44px]` en todos | `ReferenciaView.tsx:151-158`, `:196`, `:207`, `:281` |
| Encabezados de la tabla | `text-xs` en mayúsculas | `ReferenciaTablaPedido.tsx:207` |

**Sin margen (vendedor y bodega) la tabla baja a 702 px** — sigue siendo el doble de la pantalla.

Nada desborda la página. El costo real del teléfono en este módulo es **uno**: con varios códigos, el número que más le importa a un vendedor (Stock) queda a dos deslizadas.

---

## 6 · Coherencia con el resto del sistema

| Regla de la casa | Referencia |
|---|---|
| Cero voseo en pantalla | ✅ (en un comentario sí, 🩸9) |
| Excel desde la fila 1, por el generador de la casa | ✅ |
| Un cero grande no se escribe | ✅ los vacíos dicen «—» o «sin compra registrada» |
| `db-max-rows` = 1000, siempre `leerTodoPaginado` | ✅ con pre-conteo que rechaza búsquedas amplias |
| Identidad por CÓDIGO, nunca por nombre ni por parecido | ✅ por prefijo, semántica única |
| Errores accionables y humanos | 🩸6 — el 500 devuelve el mensaje crudo y el 503 nombra una migración |
| Una sola lista de roles | 🩸7 — hay una cuarta copia en `modules.ts:132` |
| Diccionario: **porcentajes sin decimal** | ✅ `pctVendido` redondea a entero |
| Diccionario: **plata con centavos** | ✅ `$26.92`, `$16.56` |
| Nombre de empresa **corto** | ⚠️ los nombres son los correctos, pero salen de una **copia a mano** — ver 🩸10 |

---

## 7 · Que se sienta más fácil — qué quitaría y qué dejaría

| Quitaría | Por qué (medido) |
|---|---|
| La columna **«Vendido»** de la tabla del modo pedido en el teléfono | La tabla mide 768 px contra 390. «Vendido» es `Vendí ÷ (Vendí+Stock)` y las dos ya están ahí al lado: es la única columna derivada de otras dos visibles. Quitarla en celular baja la tabla a 684 px. |
| El botón **«Actualizar datos de Switch»** de su lugar actual | 1 uso en toda la historia, y aparece justo cuando ya no sirve (después de buscar). O se sube junto a «Buscar», o se va. |
| Los **7 pseudo-artículos** de la búsqueda | 10.588 piezas de «stock» que no son mercancía. |

| Dejaría | Por qué |
|---|---|
| **La aclaración al pie del Excel** («cuando la bodega quedó en 0…») | Es la única frase larga que quedó de un subtítulo de ~900 caracteres que Daniel mandó sacar, y sin ella un «Compré 36 / Stock 12» parece un error de cuenta. |
| El texto bajo el buscador (**«Puedes pegar hasta 50 códigos…»**) | Es la única instrucción del módulo y explica algo que no se puede adivinar. |
| **Sin filtros, sin memoria, sin chips** | Es la pantalla más limpia del sistema: 2 toques y datos. No agregarle nada. |

| Agregaría (una línea, sin chip) | Por qué |
|---|---|
| **«Pegaste 60, usé los primeros 50»** al lado del «No encontré…» que ya existe | Hoy se cortan en silencio y la lista real de Daniel trae 47. |

---

## 8 · Preguntas para Daniel

**1. Si pegas más de 50 códigos, el sistema usa los primeros 50 y no te lo dice.**
Tu lista real tiene 47, así que el margen es de 3. El sistema ya cuenta cuántos descartó; simplemente no lo muestra en ningún lado.
- a) Dejarlo así.
- b) Que lo diga en una línea («pegaste 60, usé los primeros 50»), en el mismo lugar donde ya te dice «No encontré el código X».
- c) Subir el tope a 100.
→ **Recomiendo (b), y (c) solo si me dices que tus listas se están alargando.** Subir el tope sin avisar deja el mismo hueco un poco más lejos; lo que no puede seguir es que se corte callado.

**2. «Vendido» dice más de 100% en 11.698 códigos y menos de 100% en 15.440, y no se distingue en pantalla.**
Cuando el artículo está en el catálogo de Switch, «Vendido» es lo vendido sobre lo que hubo y nunca pasa de 100%. Cuando **no** está (43% de lo que tiene llegadas), es lo vendido sobre lo comprado y puede decir 207%.
- a) Dejarlo — el número informa que faltan compras por registrar.
- b) Poner un «—» en esos casos en vez de un porcentaje que no compara con el resto.
- c) Dejar el número y marcarlo (por ejemplo, en gris con el título explicando).
→ **Recomiendo (c).** Un 207% te está diciendo algo real (se vendió más de lo que se registró que llegó) y borrarlo sería perder la señal; pero verlo igualito a un 80% en la misma columna es lo que no se puede.

**3. El botón «Actualizar datos de Switch» se ha tocado una vez en toda la historia.**
Los datos llegan solos todas las madrugadas: 159 corridas seguidas sin un fallo. Y el botón estuvo desaparecido de la pantalla del 11-ago al 4-sep, así que desde que volvió nadie lo ha usado. Hoy además solo aparece **después** de buscar, o sea que hay que buscar con el dato viejo primero.
- a) Dejarlo donde está y esperar unas semanas a ver si alguien lo usa.
- b) Subirlo junto a «Buscar» para que se pueda refrescar antes.
- c) Quitarlo: el cron alcanza.
→ **Recomiendo (a) por dos semanas más.** Acaba de volver y todavía no se le ha dado oportunidad; decidir hoy sería decidir sobre un botón que nadie vio. Si en octubre sigue en 0, va (c).

**4. Hay 10.588 piezas de «stock» que no son mercancía.**
Son 7 códigos: «Store Planning» (8.800 piezas en Fashion Shoes), «Mercancía Defectuosa» (719), «Ajuste de Precio» (846 en Fashion Wear, 208 en Vistana) y tres más de 1-2 piezas. Es el 5,1% de las 207.943 piezas del grupo.
- a) Dejarlos: son códigos de Switch y ahí están.
- b) Esconderlos de la búsqueda de Referencia (solo de esta pantalla; en Switch siguen).
- c) Mostrarlos, pero marcados como «no es mercancía».
→ **Recomiendo (b).** Referencia responde «¿cuánto me queda de este modelo?»; un ajuste de precio no es un modelo. Y tú ya definiste que un ajuste de inventario no es ni venta ni compra — esto es la misma idea, un nivel más arriba. Pero dime tú si «Store Planning» es algo que quieres poder buscar.

**5. No sé cuánta gente usa Referencia, y el sistema ya tiene el dato guardado en el teléfono de cada quien.**
Cada vez que alguien toca una ficha del inicio, se suma +1 a un contador — pero vive en el navegador de esa persona y nunca llega a la base. Para todos los módulos, no solo este.
- a) Dejarlo así (nada que guardar, nada que mirar).
- b) Que el clic en una ficha del inicio también quede anotado en la base, como ya quedan las descargas del Depurador.
- c) Preguntarle directamente a Reinaldo, Andrea y bodega si lo usan.
→ **Recomiendo (c) primero y (b) después.** Tres preguntas te dan la respuesta esta semana; el contador te la da para siempre, pero recién dentro de un mes. Y ojo: (b) sirve para **los 22 módulos**, no solo para éste — hoy no puedes medir el uso de ninguna pantalla de solo lectura.

**6. La lista de quién entra a Referencia está escrita en cuatro lugares, no en uno.**
El postmortem dice que se unificó en una sola lista para tres lugares (la pantalla, la búsqueda y el botón). Falta el cuarto: el archivo que decide si la ficha aparece en tu inicio.
- a) Dejarlo (hoy los cuatro coinciden).
- b) Derivar el cuarto de la misma lista.
→ **Recomiendo (b).** Es el mismo defecto que ya te costó un botón muerto en 403: hoy coinciden, y el día que agregues a la secretaria entraría por la URL pero no vería la ficha.

---

## 9 · Lo que sobra · lo que falta

**Sobra, con la medición:**
- La columna «Vendido» en la tabla del teléfono — se deriva de dos columnas visibles y cuesta 84 px de los 768.
- Los 7 pseudo-artículos en la búsqueda — 10.588 piezas.
- El mensaje de error que nombra una migración de Supabase a un bodeguero.
- La cuarta copia de la lista de roles (`modules.ts:132`) y la tercera copia de los nombres de empresa (`ReferenciaTarjeta.tsx:112-121`).

**Falta:**
- Decir cuántos códigos se descartaron (el dato ya viaja del servidor a la pantalla; nadie lo lee).
- Distinguir el «Vendido» que puede pasar de 100% del que no.
- Un error humano en el 500 (hoy sale el mensaje crudo).
- Poder medir si alguien abre la pantalla.

**No medido (y por qué):**
- **Cuánta gente usa Referencia**: `activity_logs` solo guarda acciones que escriben y este módulo no escribe. Los contadores de clic viven en el `localStorage` de cada teléfono.
- **Cuántos códigos pega Daniel de verdad**: no queda rastro de las búsquedas.
- **El cruce exacto de códigos con llegada y sin ficha por empresa**: la consulta excede el tiempo máximo de la base. El total (11.698) sí se midió, con dos consultas más chicas.
