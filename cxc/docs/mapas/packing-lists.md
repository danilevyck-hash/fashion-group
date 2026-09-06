# Packing Lists — el mapa

> Medido contra producción el **5-sep-2026** (SQL de solo lectura + `src/app/packing-lists/**`, `src/app/api/packing-lists/**`, `src/lib/parse-packing-list.ts`, `src/lib/cleanup-packing-lists.ts`, historial de git).
> Ruta: `/packing-lists`. Key del módulo: `packing-lists`.
> **Ningún número de aquí sale de la documentación: todos se remidieron.**

---

## 🩸 Lo primero: el módulo está VACÍO

**`packing_lists` tiene 0 filas. `pl_items` tiene 0 filas.** No hay una sola lista de empaque en el sistema, ni activa ni borrada.

La pantalla lleva desde el **14-may-2026** —hace **114 días**— mostrando «No hay packing lists registrados».

Y no fue que la gente dejara de usarlo. **Se lo llevó el propio sistema.** El resto del mapa se lee con eso en la mano.

---

## Qué es, quién entra, cuánto se usa

**Qué hace.** Subes el PDF de la lista de empaque que manda el proveedor. El sistema lo lee, saca cada bulto con sus estilos y cantidades, y te deja bajar un PDF con casillas para que bodega vaya marcando bulto por bulto al recibir el contenedor.

**Quién entra — cuatro listas escritas a mano y no dicen lo mismo:**

| Dónde | Quién entra |
|---|---|
| `src/lib/modules.ts:166` (la ficha del inicio) | admin · secretaria · bodega |
| `role_permissions` en producción | admin · secretaria · bodega |
| `src/app/packing-lists/page.tsx:7` | admin · secretaria · bodega · **vendedor** |
| `src/app/api/packing-lists/route.ts:9` y `[id]/route.ts:9` | admin · secretaria · bodega · **vendedor** |

**Un vendedor no ve la ficha en el inicio ni en el menú, pero si escribe `/packing-lists` en la barra del navegador entra y lo ve todo.** Hoy no hay nada que ver, así que no hay daño; el día que haya listas, sí.

**Cuánto se usa — quién subió una lista de empaque alguna vez: UNA persona.**

| Quién | Lotes subidos | Listas | Cuándo |
|---|---:|---:|---|
| daniel (admin) | 7 | 22 distintas | 18 al **22-abr-2026** |
| Bodega | **0** | 0 | nunca |
| Secretaria | **0** | 0 | nunca |

**Ni bodega ni ninguna secretaria ha subido, borrado ni abierto un lote en toda la historia del módulo.** El único usuario fue Daniel, probándolo, durante 5 días de abril.

Los 7 lotes registraron **`failed: 0`**: el lector de PDF no falló ni una vez. Lo último fue un lote de **20 listas de una sentada** el 22-abr-2026.

⚠️ Los rastros nombran **22 listas distintas**, pero el cron llegó a borrar **28**. La diferencia son 6 listas subidas antes de que el módulo empezara a dejar rastro; no se puede saber cuáles.

---

## 🩸 Qué pasó el 14 de mayo

El cron de limpieza borró **las 28 listas activas**, físicamente, sin copia.

Rastro exacto en `activity_logs`:

```
14-may-2026  packing_lists_cleanup  { "deleted_count": 28, "cutoff_date": "2026-05-07" }
15-may-2026  packing_lists_cleanup  { "deleted_count": 0,  ... }   ← y así todos los días
```

El corte fue de **7 días sobre la fecha de creación**, no sobre un borrado. El código de entonces decía, textual:
`// Borra packing_lists creados hace más de 7 días.` Era un `DELETE` de verdad, y `pl_items` cayó detrás por cascada.

**El arreglo llegó 24 días tarde.** El 7-jun-2026 (commit `e90f1aa8`) el cron pasó a borrar **solo lo que alguien borró a mano**, a los **90 días**, y guardando una copia antes. Para entonces la tabla ya estaba vacía desde hacía casi un mes.

**Copias guardadas de aquellas 28 listas: 0.** El mecanismo de copia (`packing_list_purge_snapshot`) nació con el arreglo; medido: **0 filas en toda la historia**.

El cron sigue corriendo todos los días (último latido: **5-sep-2026, 03:00 UTC**) y borra 0 desde hace 114 días.

**El texto de la pantalla también mentía, y se arregló hoy mismo.** Decía «Los PLs se eliminan automáticamente después de 7 días» — falso en las dos mitades. Hoy dice lo correcto (`src/lib/packing-lists/retencion.ts`). Pero abajo, en la ventana de confirmación, sigue diciendo lo contrario (🩸 #3).

---

## Cuánto cuesta hacer las cosas

Todo lo que sigue está contado **contra el código**, con el lote real de 20 listas del 22-abr como referencia.

### Tarea 1 — subir un lote de listas (7 veces, siempre la misma persona)

**Hoy: 44 toques, 1 pantalla, 60 números comparados a ojo contra el PDF.**

| Paso | Toques |
|---|---:|
| Inicio → «Packing Lists» | 1 |
| Tocar la zona de arrastre + elegir el archivo | 2 |
| Abrir y cerrar cada una de las 20 tarjetas para validar | **40** |
| «Guardar 20 PLs» | 1 |

El banner ámbar exige: *«Compara el número de PL, el total de piezas y el total de bultos»* — **3 números × 20 listas = 60 comparaciones a mano**, con el PDF original abierto al lado.

**Y el sistema ya hizo esa comparación.** El lector suma los estilos de cada bulto y los contrasta con el total del encabezado del propio PDF; cuando cuadra pinta un chip verde «OK», y cuando no, pinta «N errores» y no deja guardar esa lista. Medido: **en los 7 lotes, 0 listas fallaron**. O sea que las 60 comparaciones a ojo confirmaron 60 veces lo que la máquina ya había confirmado.

**Versión más corta: 44 toques → 4.**
Subes, y **solo se abren solas las listas que el lector marcó con problema** (hoy habrían sido 0 de 22). Las demás van con su chip verde. El aviso pasa de «valida las 20» a «19 cuadran solas; revisa la #7».

### Tarea 2 — bodega busca la lista de un contenedor que acaba de llegar (0 veces)

**Hoy: no hay por dónde buscarla.**

- El historial **no tiene buscador**. El único archivo con un campo de búsqueda es el detalle, y busca referencias *dentro* de una lista ya abierta (`[id]/page.tsx:573`).
- Lo único para acotar es un filtro por empresa, y **solo aparece si hay listas de más de una empresa** (`PackingListsClient.tsx:1127`).
- **Packing Lists no está en la búsqueda global** (medido: 0 menciones en `src/app/api/search/route.ts`). Los otros 8 módulos sí.

Así que con 22 listas agrupadas por día, encontrar la del contenedor de hoy es desplazarse hasta verla.

**Versión más corta: 2 toques.** El número de PL en la búsqueda global (⌘K / la lupa), y entras directo.

### Tarea 3 — bodega marca los bultos al descargar el contenedor (es para lo que existe)

**Hoy: 4 toques** — Inicio → Packing Lists → la fila → «Descargar PDF» → imprimir. El PDF sale con casillas por bulto y por estilo, respetando la numeración física del papel del proveedor. **Esta parte está bien pensada** y es lo mejor del módulo.

Lo que la estorba: bodega trabaja desde el teléfono, y la lista que hay que tocar antes es una tabla de **700 px de ancho mínimo en una pantalla de 390** (🩸 #5).

---

## 🩸 Lo que miente o está roto

**#1 — El cron borró los 28 activos.** Contado arriba. `deleted_count: 28`, 14-may-2026, sin copia.

**#2 — Guardar una lista con un número que ya existía la borra de verdad, incluso la que estaba en la red de 90 días.**
La función de la base (`save_packing_list`) empieza con `DELETE FROM packing_lists WHERE numero_pl = …`, **sin mirar `deleted_at`**. O sea: si borras la lista 80163225 y semanas después vuelves a subir ese PDF, la copia que estaba esperando 90 días por si había que recuperarla se borra físicamente en ese instante. La red no cubre el caso más probable de todos: volver a subir la misma lista.
Además hay **dos versiones vivas de esa función en la base** (una de 2 parámetros y otra de 3): la vieja ignora el `parser_metadata` y sigue ahí, esperando a que alguien la llame por accidente.

**#3 — La ventana de confirmación dice lo contrario que el texto de arriba, en la misma pantalla.**
Arriba, bajo «Historial»: *«Un PL activo no se borra nunca. Los que borras se guardan 90 días por si hay que recuperarlos.»*
Al borrar, la ventana dice: *«¿Eliminar PL 80163225? **No se puede deshacer.**»* (`PackingListsClient.tsx:1319`). Es borrado suave y sí se puede deshacer. El texto asusta con algo que no pasa.
De paso: usa `ConfirmModal` con `destructive`, no el `ConfirmDeleteModal` con retardo de 1 s que usa el resto del sistema, y no ofrece el «Deshacer» de 5 s de la casa.

**#4 — La primera pantalla que se pinta no filtra lo borrado; la segunda sí.**
`src/app/packing-lists/page.tsx:44` lee `.select("*").order(...)` **sin `.is("deleted_at", null)`**. La API que el navegador consulta después (`api/packing-lists/route.ts:19`) **sí** filtra. Resultado: una lista borrada aparece en el primer pintado y desaparece sola un segundo después.

**#5 — En el iPhone es una tabla de 700 px en 390.**
`ScrollableTable minWidth={700}` (`PackingListsClient.tsx:1184`) y otra igual en el detalle (`[id]/page.tsx:581`). **No hay vista de tarjetas** por debajo de `lg`, a diferencia de Reclamos, Guías, CXC y Clientes, que sí la tienen. Se esconden dos columnas en móvil («Fecha Entrega» y «Estilos») y las otras cinco se arrastran de lado.
Y el botón de borrar de cada fila es un ícono de **14 px con `p-1` ≈ 22 px de área de toque** (`PackingListsClient.tsx:1272`), la mitad del mínimo de 44 px de la casa. **Bodega es el usuario de teléfono del sistema, y este módulo es el que peor lo trata.**

**#6 — «Quién subió esta lista» es una pregunta que el módulo no puede contestar.**
La columna `packing_lists.created_by` existe y **ningún código la escribe** — la función de la base no la incluye en su `INSERT`. Sería 100% vacía. Lo único que sabe quién subió qué es `activity_logs`, y solo por lote, no por lista.

**#7 — Es la única tabla del sistema que usa `deleted_at` en vez de `deleted`.**
Todo lo demás (caja, préstamos, reclamos, guías, cheques, clientes, catálogos) usa una columna `deleted` de sí/no. Aquí es una fecha. **¿Importa?** Hoy no: con la tabla vacía no hay ni una fila que migrar, y el índice `idx_packing_lists_deleted_at` ya está puesto. Pero es la excepción que obliga a acordarse de ella en cada consulta nueva, y **ya se olvidó una vez** (🩸 #4). Si alguna vez se unifica, ahora es el momento más barato de la historia: cuesta 0 filas.

**#8 — `pl_items` no tiene índice por su lista.**
El único índice es la llave primaria. Cada vez que se abre una lista, la base recorre la tabla entera para juntar sus renglones. Con 0 filas da igual; con 22 listas × ~40 estilos tampoco se nota; con un año de contenedores, sí.

**#9 — El archivo de la pantalla tiene 1.326 líneas.**
El límite de la casa es 800 (`PackingListsClient.tsx`). Es el único de los dos módulos que lo pasa.

**#10 — El módulo no está en la búsqueda global.** Los otros 8 sí. El número de PL es justo el dato que bodega tiene en la mano y buscaría.

---

## Coherencia con el resto del sistema

| Regla de la casa | Packing Lists | Nota |
|---|---|---|
| Sin voseo | ✅ | Cero voseo en pantalla y PDF. (Dos «acá» en comentarios de código; el candado no los mira.) |
| Borrado suave con `deleted` | ⚠️ | Usa `deleted_at`, la única excepción del sistema (🩸 #7). Y la función de la base lo esquiva (🩸 #2). |
| Confirmación destructiva | ❌ | `ConfirmModal` en vez de `ConfirmDeleteModal`; sin retardo de 1 s; sin deshacer de 5 s; y el texto miente (🩸 #3). |
| Excel por `workbookBytes` | — | **No tiene Excel.** Solo PDF. No es un incumplimiento; es una ausencia. |
| PDF con logo Fashion Group | ✅ | `[id]/page.tsx:177`. |
| `leerTodoPaginado` | ❌ | 0 usos. Las dos lecturas traen todo sin paginar. Con 0 filas no muerde; con más de 1.000 listas cortaría en silencio. |
| Un cero grande no se muestra | ✅ | Dice «No hay packing lists registrados», no `0`. **Bien hecho.** |
| Tarjetas en móvil por debajo de `lg` | ❌ | 🩸 #5. |
| Botones de 44 px | ⚠️ | Casi todos sí; el de borrar de la fila, no. |
| Historial espejo del breadcrumb | ⚠️ | El detalle es una ruta propia (`/packing-lists/[id]`) empujada con `push`: correcto. El filtro de empresa no va a la URL, va a `localStorage` (`useLastUsed`, `fg_last_packing_empresa`) — se recuerda entre sesiones pero no se puede compartir por enlace. |
| Búsqueda global | ❌ | 🩸 #10. |
| Nombre de empresa corto | ✅ | `displayEmpresa()` convierte «VISTANA INTERNACIONAL PANAMA» en «Vistana». |
| Colores de módulo | ⚠️ | Usa **teal** en toda la pantalla y ese color **no está en la lista de colores por módulo** de `CLAUDE.md` ni en `src/lib/moduleColors.ts`. |

---

## Lo que sobra · lo que falta

### Sobra

| Qué | Por qué (medido) |
|---|---|
| **La versión vieja de la función de la base** (2 parámetros) | Sin llamadores; ignora el `parser_metadata`. Una trampa esperando. |
| **`vendedor` en las 4 listas de permisos** de `page.tsx` y las APIs | No está en el módulo ni en `role_permissions`. |
| **La columna `created_by`** | Ningún escritor. O se llena, o se retira. |
| **Las 60 comparaciones a ojo** del banner ámbar | El lector ya las hizo, y no falló en 22 listas. |

### Falta

| Qué | La medición que lo pide |
|---|---|
| **Volver a cargar las listas** | 0 filas desde hace 114 días. Sin datos, no hay módulo. |
| **Buscar por número de PL** | Ni en la pantalla ni en la búsqueda global. Es el único dato que bodega tiene del contenedor. |
| **Tarjetas en el teléfono** | Bodega trabaja desde el teléfono y recibe una tabla de 700 px. |
| **Que alguien se entere si el cron borra algo** | La vez que borró 28 listas, **nadie se enteró**. El aviso cumple la regla de 🔧 SISTEMA: fue real, no se arregló solo, y alguien tenía que actuar. |
| **Que el borrado se pueda deshacer de verdad** | Es borrado suave con 90 días de red y la pantalla dice que no se puede deshacer. |

### No medido (y por qué)

- **Qué tan bien lee los PDF el lector.** Los 7 lotes dicen `failed: 0`, pero el detalle por lista (`parser_metadata`, qué bultos hubo que ajustar a mano, cuántos necesitaron el tercer nivel con IA) **vivía en las filas que se borraron**. Sin filas, no hay medición posible.
- **Qué empresas usaban el módulo.** Misma razón.
- **Cuánto costó el tercer nivel del lector (Claude Haiku).** No queda rastro de cuántas veces se llamó.

---

## Preguntas para Daniel

**1. La pregunta honesta: `packing_lists` tiene 0 filas desde hace 114 días, y en toda su historia lo usó una sola persona (tú), 7 veces, en 5 días de abril. Bodega y las secretarias nunca lo tocaron. ¿Se queda?**
a) **Se queda y se rescata**: se vuelven a subir las listas de los contenedores que están llegando, y bodega lo estrena con el PDF de casillas.
b) **Se queda dormido**: la pantalla se deja, no se toca nada, y el día que haga falta está.
c) **Se retira**: el módulo sale del inicio, la tabla se queda respaldada y vacía (patrón `mayor_lineas`).
→ **Recomiendo (a) o (c), pero no (b).** Un módulo vacío en el inicio es una ficha que se toca, no muestra nada y enseña que el sistema tiene cosas que no sirven. La decisión de verdad es una sola: **¿bodega marca los bultos en papel impreso hoy, sí o no?** Si sí, (a) vale la pena porque el PDF de casillas ya está hecho y funciona. Si no, (c).

**2. Si se queda: hoy validar un lote de 20 listas son 44 toques y 60 números comparados a ojo contra el PDF, y el lector ya los había comparado él solo (0 fallos en 22 listas). ¿Se confía en el lector?**
a) Sí: solo se abren solas las listas que el lector marcó con problema; el resto va con su marca verde. **44 toques → 4.**
b) Sí a medias: se sigue pidiendo revisar, pero de a una y solo el número de PL.
c) No: se sigue revisando todo a mano.
→ **Recomiendo (a).** El lector suma los estilos y los contrasta contra el total del propio PDF; cuando no cuadra, no deja guardar. Pedir que se repita a ojo lo que ya se verificó es lo que hace que un lote de 20 dure media hora.

**3. `packing_lists` es la única tabla del sistema que borra con fecha (`deleted_at`) en vez de sí/no (`deleted`). Ya causó un descuido (la primera pantalla no filtraba). Con la tabla vacía, unificarla cuesta 0 filas migradas. ¿Se unifica?**
a) Sí, ahora que no cuesta nada.
b) No: la fecha dice *cuándo* se borró y eso sirve para la retención de 90 días.
→ **Recomiendo (a) con las dos columnas**: `deleted` sí/no para que todas las consultas del sistema se escriban igual, y la fecha al lado para la retención. Es lo que hace Caja (`deleted` + `deleted_at`).

**4. Volver a subir una lista con un número que ya existía borra de verdad la copia que estaba guardada por 90 días. ¿Qué debería pasar?**
a) La versión nueva reemplaza a la vieja y la copia de la borrada se queda sus 90 días.
b) Avisa: «Ya existe la lista 80163225 del 22-abr. ¿La reemplazo?».
c) Como está.
→ **Recomiendo (a) + (b).** Reemplazar en silencio una lista que bodega ya imprimió es la clase de cosa que se descubre con el contenedor abierto.

**5. Bodega es quien debería usar esto desde el teléfono, y hoy recibe una tabla de 700 px en una pantalla de 390, sin buscador y sin estar en la búsqueda global. ¿Se arregla la parte de bodega primero?**
a) Sí: tarjetas en el teléfono + el número de PL en la búsqueda global. Es lo que separa «existe» de «se usa».
b) Primero que vuelvan a haber listas, y después se ve.
→ **Recomiendo (a) junto con (1a).** Rescatar los datos sin arreglar el teléfono deja el módulo en el mismo lugar donde ya estuvo: subido por una persona en la computadora y nunca abierto por quien tenía que usarlo.
