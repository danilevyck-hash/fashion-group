# Depurador — el mapa

> Medido contra producción el **5-sep-2026** (SQL de solo lectura + el código de `src/app/productos/cargar/**`).
> Ruta: `/productos/cargar`. Key del módulo: `cargar`.

---

## Qué es, quién entra, cuánto se usa

**Qué hace.** Convierte el Excel del proveedor (Calvin, Tommy, Karl Lagerfeld, Reebok, o la factura de la tienda) en **la plantilla que Switch acepta: 25 columnas, una sola, la misma para las 6 compañías** (`OUT_COLS`, `src/lib/depurador/logic.ts`). Es **el único módulo donde un número mal escrito termina dentro de Switch**.

**Quién entra:** `admin` y `secretaria` (`src/lib/modules.ts:175`). Medido en `role_permissions`: `cargar` está en las filas `admin` y `secretaria`, y también en el `modulos_override` de las dos secretarias. Nadie más lo ve.

**Cuánto se usa — 140 descargas registradas, 25-jun a 4-sep-2026:**

| Mes | Descargas | Personas |
|---|---:|---:|
| jun-2026 (desde el 25) | 17 | 2 |
| jul-2026 | **60** | 2 |
| ago-2026 | **50** | 3 |
| sep-2026 (4 días) | 13 | 2 |

| Quién | Descargas | Desde | Hasta |
|---|---:|---|---|
| Angela | **76** | 29-jun | 4-sep |
| andrea | **47** | 2-jul | 4-sep |
| daniel | 17 | 25-jun | 24-ago |

Los 50-60 al mes de la documentación **están confirmados** (jul 60 · ago 50). Es el módulo de más uso repetido del sistema después de Guías.

| Compañía | Descargas | Estilos | Unidades |
|---|---:|---:|---:|
| Vistana International | 56 | 962 | 36.236 |
| Fashion Wear | 55 | 849 | 40.984 |
| Fashion Shoes | 28 | 203 | 39.476 |
| Active Wear | **1** | 48 | 323 |
| Active Shoes (Reebok) | **0** | — | — |
| Multifashion (Facturas Tienda) | **0** | — | — |

**Son 4 compañías en 10 semanas, y 2 de ellas concentran el 79%.** Las 20 marcas más usadas: TH Footwear 28 · TH Kids 12 · TH Menswear 12 · CK Jeans 11 · CK Accessories 10 · CK Underwear 10.

---

## Cuánto cuesta hacer las cosas

### Tarea 1 — bajar la plantilla de Switch de una marca (140 veces medidas)

**Hoy: 5 toques, 2 pantallas, 0 campos escritos.**

| # | Toque | ¿El sistema ya lo sabe? |
|---|---|---|
| 1 | Inicio → ficha «Depurador» | — |
| 2 | Toca la zona de soltar (`DepuradorDispatcher.tsx:83`) | — |
| 3 | Elige el archivo en el buscador del sistema | no |
| 4 | «Abrir» | — |
| 5 | «Descargar plantilla» (`DepuradorClient.tsx:895`) | — |

**Lo que el sistema ya llena solo, y está bien:** la compañía (de la marca del archivo, `empresasReconocidas`), la temporada (mes actual de Panamá), la tasa (`07`), el factor CIF (`1.1`), el modo de precio y la fórmula global — los cuatro últimos por `useLastUsed` → `fg_last_depurador_*`. **Nada se teclea en el camino feliz.** Este flujo ya está corto.

**Dónde se va el tiempo de verdad: 3,2 archivos por sesión.**
Medido: promedio de **3,2 descargas por (día, persona)**, máximo **13 en un día**. Cada archivo extra cuesta **5 toques más** («Otro archivo» → soltar → elegir → abrir → descargar). Una sesión típica = **~16 toques**; la peor medida (13 archivos) = **~65**.

> **Versión más corta: soltar los 5 archivos de una vez.** Hoy `DepuradorDispatcher` toma `e.dataTransfer.files[0]` — **el primero y nada más** (`DepuradorDispatcher.tsx:89`). Con cola de archivos: sesión típica **16 toques → 6** (1 entrar + 1 soltar + 1 elegir varios + 1 abrir + 1 «Descargar todo» + 1 margen).

### Tarea 2 — 🩸 volver a bajar un Excel que ya se bajó (38 veces medidas)

**27% de todas las descargas son una repetición exacta.** Medido: **27 grupos** de (persona, compañía, marca, estilos, unidades, costo) idénticos, **65 filas**, **38 descargas de más** sobre 140. **21 de esas 38 ocurrieron a menos de 30 minutos de la anterior.**

Los peores: Angela · Fashion Shoes · TH Footwear · 13 estilos · 824 unidades · $21.292,48 → **4 veces** (25 al 31-ago). daniel · CK Jeans · 45/766/$9.082,15 → **4 veces el mismo día**. Angela · TH Footwear · 6/2880/$33.264,00 → **3 veces** (3 y 4-sep).

**Hoy cuesta 5 toques cada repetición = ~190 toques en 10 semanas.**

> **Versión más corta: 3 toques** (Depurador → pestaña Historial → «Descargar»). **El botón ya está construido** (`HistorialView.tsx:60`) y **hoy funciona en 0 de 140 filas** — ver 🩸 nº 1.

### Tarea 3 — cambiar el precio de una marca

Dos caminos para lo mismo, y hay que saber cuál:
- **Dentro de «Nuevo»**, con el archivo abierto: fila por marca con divisor, extra, redondeo y «Guardar» (`DepuradorClient.tsx:1090-1120`). **4 toques.**
- **En Configuración › Fórmulas**: Depurador (1) → pestaña «Configuración» (1) → ámbito «Depurador (importación)» (0, viene puesto) → buscar la marca → editar → Guardar. **5-6 toques y otra pantalla.**

Medido: **22 fórmulas por marca** y **18 por marca+rubro**, editadas por daniel (14), Angela (2), andrea (3). **`tienda_marca_formulas` y `tienda_rubro_formulas` tienen 0 filas** — el ámbito «Tienda (facturas)» nunca se usó.

> **Versión más corta:** una sola puerta. La fila dentro del archivo gana (es donde se ve el efecto); Configuración › Fórmulas queda para revisar las 40 juntas.

### Tarea 4 — aprobar una descripción nueva (54 veces medidas)

Es un **modal bloqueante**: mientras haya descripciones sin aprobar, el botón «Descargar plantilla» está **apagado** (`DepuradorClient.tsx:896` — `disabled={… || descsNuevas.length > 0 || …}`). Medido en `depurador_descripciones`: **281 filas** — 227 de semilla + **54 aprobadas a mano** entre junio y el 26-ago-2026. O sea: **1 de cada 2,6 corridas obliga a parar y aprobar algo** antes de poder bajar el archivo.

**Hoy:** por cada descripción, 1 toque para abrir la confirmación + 1 para confirmar = **2 toques × N**, y N no se sabe hasta que el archivo está procesado.

> **Versión más corta: «Aprobar las N» de un toque.** Las que ya tienen las dos mitades conocidas **ya pasan solas** (`pasaronSolas`); lo que llega al modal son las dudosas. Con un botón de lote, **2N toques → 2**.

### Tarea 5 — Tallas por bulto y «Fotos a mi Excel»

**No medible: 0 filas.** El registro de uso (`descarga_tallas` / `descarga_misfotos` en `activity_logs`, módulo `depurador`) se agregó el 4-sep-2026 y **no tiene una sola fila**. Sin datos, no opino sobre estas dos vistas — vuelve a mirar en 4 semanas.

---

## Los datos, medidos

| Tabla | Filas | Estado |
|---|---:|---|
| `carga_history` | **140** | 0 con `archivo_path` · 0 con costo, estilos, unidades o marca vacíos |
| `depurador_descripciones` | 281 | 227 `seed` + 54 `aprobada`; 100% `activa = true` |
| `marca_formulas` | 22 | 3 con `divisor = "0"` (TH Swimwear, TH Other, CK Display & Promo) |
| `marca_rubro_formulas` | 18 | 9 con `precio_fijo` en vez de divisor |
| `tienda_marca_formulas` | **0** | nunca usada |
| `tienda_rubro_formulas` | **0** | nunca usada |
| bucket `depurador-plantillas` | **0 objetos** | creado el 5-sep-2026 01:41 UTC |

**Columnas vacías que importan:** `carga_history.archivo_path` y `.archivo_nombre` → **100% vacías (140 de 140)**. `marca_formulas.updated_by` → **7 de 22 en NULL** (las de la carga inicial del 26-jun): de un tercio de las fórmulas no se sabe quién las puso.

---

## 🩸 Lo que miente o está roto

### 1. 🩸 «El Excel se puede volver a bajar por 90 días» — hoy es cierto en **0 de 140** filas

`HistorialView.tsx:88` escribe esa frase **siempre**, sin mirar los datos. Medido: **140 de 140 filas tienen `archivo_path` en NULL** y el bucket `depurador-plantillas` tiene **0 objetos**. Ninguna fila del Historial trae botón «Descargar» hoy.

**Matiz honesto, y es la mitad del hallazgo:** la función se estrenó el 4-sep y el bucket se creó el **5-sep a las 01:41 UTC** — *después* de la última descarga registrada (4-sep 17:27 UTC). O sea que **todavía no ha tenido su primera oportunidad**: no es que falle, es que nunca corrió. Lo que sí está roto es la **frase**, que promete algo que la pantalla no puede cumplir para ninguna fila visible. La primera corrida real de Angela o andrea es la prueba; hasta entonces la línea sobra.

**La documentación miente en la otra dirección:** `CLAUDE.md` dice que la migración `20260921120000_carga_history_archivo.sql` está **«pendiente de aplicar»**. Medido: las columnas `archivo_path` y `archivo_nombre` **existen** en `carga_history` y el bucket **existe**. **La DDL ya corrió.**

### 2. 🩸 27% de las descargas son repeticiones exactas — 38 sobre 140

Ya medido arriba. Es el número más fuerte del módulo: **una de cada cuatro veces que alguien usa el Depurador, está rehaciendo algo que ya hizo.** El caso de 4 veces el mismo día (daniel, CK Jeans, 29-jun) no puede ser trabajo nuevo. La cura ya está construida (el Historial descargable) y todavía no ha servido a nadie.

### 3. 🩸 El registro de uso de Tallas y Fotos tiene **0 filas** desde el 4-sep

`activity_logs` no tiene una sola fila con `descarga_tallas` ni `descarga_misfotos`, ni ninguna con `entity_type` = `depurador`. Se instrumentó justamente para decidir si esas dos vistas valen la pena, y **la decisión sigue sin datos**. Son 375 + 254 líneas de código (`MiExcelFotosClient.tsx`, `CurvasView.tsx`) sin una sola prueba de uso.

### 4. 🩸 Dos caminos completos sin una sola corrida registrada

- **Reebok › Plantilla Switch**: `carga_history` no tiene **ni una** fila de Active Shoes. `ReebokClient.tsx` son **1.055 líneas**.
- **Facturas Tienda (Multifashion)**: **0 filas** en `carga_history`, y sus dos tablas de fórmulas (`tienda_marca_formulas`, `tienda_rubro_formulas`) están **vacías**. `FacturasTiendaClient.tsx` son **811 líneas**.

⚠️ **Matiz obligatorio:** el registro de estos dos caminos en el Historial también nació el 4-sep-2026. Antes no se anotaban, así que el 0 **no prueba que no se usen** — prueba que **no se sabe**. Lo que sí está medido, y no depende de la fecha, es que `tienda_marca_formulas` y `tienda_rubro_formulas` llevan **0 filas desde que existen**: el ámbito «Tienda (facturas)» de Configuración › Fórmulas nunca se tocó.

### 5. 🩸 Dos Excel que lee una PERSONA bajan sin la fila de encabezados fija

La regla de la casa es que **todo Excel sale por `workbookBytes`**, y el comentario de esa función dice por qué: *«Escribir con `XLSX.write` a secas deja el archivo sin panel fijo… y eso no se ve hasta que alguien baja por la hoja y pierde los nombres de las columnas»* (`src/lib/excel-export.ts:341`). El candado cuenta **25 lugares** que arman una hoja de la casa.

Medido: el Depurador tiene **8 salidas de Excel y ninguna de las 8 pasa por ahí** — `DepuradorClient.tsx:665`, `ReebokClient.tsx:428/451/496`, `FacturasTiendaClient.tsx:377/388`, `CurvasView.tsx:109`, `BulkExcel.tsx:84`.

**Para las 6 primeras está bien y no se tocan:** son la plantilla de Switch, que **lee una máquina**, tiene sus 25 columnas fijas y su propio candado contra el fixture real (`depurador-plantilla-switch.test.ts`). Meterle formato de la casa sería cambiar un archivo que Switch acepta hoy.

**Las otras dos no son eso:**
- **`CurvasView.tsx:109`** — «Tallas por bulto», un Excel que **abre una persona y desliza**.
- **`BulkExcel.tsx:84`** — `Formulas-precio.xlsx`, la lista de las **40 fórmulas** (22 de marca + 18 de marca+rubro) para revisarlas juntas.

Son exactamente el caso para el que existe la regla: bajas por la hoja y pierdes los nombres de las columnas. Y quedan fuera del candado porque el barrido busca `buildReportSheet({`, que estas dos no usan.

### 6. 🩸 De 7 fórmulas de marca no se sabe quién las puso

`marca_formulas.updated_by` en NULL en **7 de 22** filas (CK Menswear, CK Swimwear, CK Accessories, CK Kids, CK Jeans, CK Womenswear, y una más), todas con `updated_at` = 26-jun-2026 01:09. Son la carga inicial. **Esas 7 fórmulas mandan el precio de 4 de las 6 marcas Calvin más usadas** (CK Jeans 11 corridas, CK Accessories 10, CK Underwear 10, CK Kids 6) y nadie firma por ellas.

### 7. La validación del divisor **sí llegó a los tres caminos** — la nota de `CLAUDE.md` está vieja

`CLAUDE.md` dice: *«⚠️ Reebok y Facturas Tienda tienen sus propios inputs de divisor SIN esta validación en pantalla»*. **Verificado: ya no es cierto.** `mensajeDivisorEnPantalla` está en `ReebokClient` y en `FacturasTiendaClient` desde el rediseño del 4-sep, con su candado `depurador-divisor-tres-caminos.test.tsx` (5 casos). El postmortem lo tiene tachado; el invariante de `CLAUDE.md` no. **Es la línea la que está vieja, no el código.**

### 8. Un divisor `0` significa «sin precio», y la pantalla no lo dice

3 de 22 fórmulas de marca y 9 de 18 de marca+rubro tienen `divisor = "0"`. `validarDivisor` lo acepta a propósito (0 ó 0.10–1.00). Pero en la fila de la marca **se ve un `0` pelado**, igual que se vería un error de tecleo. En las de marca+rubro el `0` va acompañado de `precio_fijo` (11, 20, 9, 17, 31, 26, 30, 12.5) — ahí se entiende; en `marca_formulas` no hay `precio_fijo` y el `0` queda solo.

---

## Coherencia con el sistema

| Punto | Cómo está | Veredicto |
|---|---|---|
| **Voseo** | Cero. «elige», «toca», «Suelta el archivo aquí» | ✅ |
| **Excel** | **8 salidas, ninguna por `workbookBytes`** — ver 🩸 nº 5 | ⚠️ Justificado para la plantilla de Switch, **no** para Tallas ni Fórmulas |
| **Respaldo** | Las 6 tablas del módulo están clasificadas en `src/lib/backup/tablas.ts:121-126` | ✅ Ninguna quedó sin copia |
| **Pestañas** | `SelectorPestanas` + `DesplegableFlotante`, corte `lg`, 44 px | ✅ El patrón de la casa, con candado |
| **`?tab=` viejo** | Redirige (`TAB_VIEJO_A_NUEVO`) | ✅ |
| **Confirmación de borrado** | «Borrarlos todos» (precios a mano) **borra directo, sin ConfirmModal** (`DepuradorClient.tsx:977`) | 🔴 El resto del sistema usa `ConfirmDeleteModal` con 1 s de espera para lo destructivo. Aquí se pierde trabajo tecleado a mano de un toque. |
| **Deshacer de 5 s** | No existe en este módulo | ⚠️ El «Borrarlos todos» es exactamente el caso para el que se hizo `useUndoAction` |
| **Vacío** | «Todavía no hay cargas registradas» | ✅ Frase de la casa |
| **Error** | «No se pudo procesar. …» | ✅ |
| **Nombre de la compañía** | Nombre LARGO («Vistana International», «Fashion Wear») | ⚠️ El diccionario del 5-sep fijó el **corto** (`EMPRESA_KEY_TO_NOMBRE_CORTO`) para Clientes. Aquí va el largo, y es lo que se guarda en `carga_history.empresa` |

---

## El iPhone (390 px)

Medido leyendo los cortes del código, no la pantalla.

| Elemento | A 390 px | Veredicto |
|---|---|---|
| Las 3 pestañas | Desplegable (`lg:hidden`), 44 px | ✅ |
| Las vistas (Nuevo/Historial) | Fila con `overflow-x-auto`, 2 botones | ✅ entran |
| Zona de soltar | `py-6`, texto `text-base` | ✅ |
| Historial | Tarjetas hasta `lg` (`HistorialView.tsx:105`), medido y con candado | ✅ |
| «Editar temporada y costos» | `<details>` cerrado + grid `grid-cols-2` | ⚠️ Tres campos en 2 columnas a 390 px: Temporada (`type="month"`) y Tasa quedan en la primera fila, Factor solo abajo. Entra, pero el `type="month"` nativo de Safari es angosto |
| **La tabla de estilos** | `DepuradorClient.tsx:1182+`, tabla con selección múltiple, precio por fila, select de talla | 🔴 **No medida y es la parte grande de la pantalla.** No hay corte `lg:hidden` en ese bloque como sí lo tienen el Historial y Data Health |
| **Las filas de fórmula por marca** | 4 controles por fila (divisor, extra, redondeo, Guardar) con `miniSelectCls` | 🔴 Cuatro controles en 390 px es arrastre seguro |

> **A verificar con captura, no con grep:** la tabla de estilos y las filas de fórmula. El resto de la pantalla sí tiene sus cortes medidos y con candado.

---

## Lo que sobra · lo que falta

### Sobra (quitar)

| Qué | Dónde | Por qué, con el número |
|---|---|---|
| La frase «El Excel se puede volver a bajar por 90 días» | `HistorialView.tsx:88` | Es cierta en 0 de 140 filas; el botón ya lo dice cuando existe |
| El ámbito «Tienda (facturas)» de Configuración › Fórmulas | `page.tsx:FormulasScopeRow` | 0 filas en sus dos tablas desde que existen |
| El filtro «Compañía» del Historial con las 6 opciones | `HistorialView.tsx:76` | Solo 4 compañías aparecen en 140 filas; 2 de las 6 opciones no devuelven nada nunca |
| La columna «Estilos» **o** «Unidades» del Historial | `HistorialView.tsx:137` | Nadie ordena por ellas (no son ordenables) y no ayudan a elegir qué re-bajar; con Fecha + Marca + Quién alcanza |
| «Borrarlos todos» sin confirmación | `DepuradorClient.tsx:977` | No sobra el botón: sobra que borre de un toque |

### Falta (agregar)

| Qué | Por qué, con el número |
|---|---|
| **Soltar varios archivos de una vez** | 3,2 archivos por sesión, máximo 13. Hoy `files[0]`: sesión típica 16 toques → 6 |
| **Que el Historial de verdad guarde el archivo** | 38 descargas repetidas (27%). Ya está construido; falta que corra su primera vez |
| **Aprobar descripciones en lote** | 54 aprobaciones, 2 toques cada una, y cada una bloquea la descarga |
| **Firma en las 7 fórmulas sin `updated_by`** | 7 de 22, y mandan el precio de las 4 marcas Calvin más corridas |
| **Confirmación en «Borrarlos todos»** | Es lo único destructivo del módulo y es lo único sin freno |

---

## Preguntas para Daniel

**1. El 27% de descargas repetidas (38 de 140) — ¿qué las causa?**
Es el número más grande del módulo y no lo puedo contestar con datos: sé *que* pasa, no *por qué*. Las opciones que veo:
- a) Se pierde el archivo en la carpeta de descargas y lo vuelven a generar.
- b) Se dan cuenta de un precio mal y rehacen todo.
- c) Switch rechaza el archivo y hay que corregir y volver a bajar.

**Recomiendo preguntarle a Angela y a andrea antes de tocar nada.** Si es (a), el Historial ya lo resuelve y no hay nada más que hacer. Si es (b) o (c), la cura es otra y sería un error construir para (a).

**2. Soltar varios archivos de una vez — ¿lo hacemos?**
- a) Sí: cola de archivos, un Excel por archivo, «Descargar todo».
- b) Sí, pero de a uno como hoy, solo que sin volver a pasar por «Otro archivo».
- c) No, así está bien.

**Recomiendo (a).** El promedio es 3,2 archivos por sesión y el máximo medido 13; hoy cada archivo extra cuesta 5 toques completos. La sesión típica bajaría de ~16 toques a ~6.

**3. Reebok y Facturas Tienda: 1.866 líneas de código sin una sola corrida registrada. ¿Se usan?**
El 0 no prueba que estén muertos (el registro es del 4-sep), pero las fórmulas de Tienda llevan 0 filas **desde siempre**.
- a) Sí se usan, esperemos 4 semanas a que el Historial los cuente.
- b) Facturas Tienda ya no se usa: se retira.
- c) Ninguno de los dos se usa: se retiran los dos.

**Recomiendo (a) para Reebok y consultarte (b) para Facturas Tienda.** Retirar código que alguien usa una vez al mes es peor que dejarlo cuatro semanas más; pero un ámbito de fórmulas con 0 filas históricas sí es evidencia dura.

**4. «Borrarlos todos» borra los precios escritos a mano de un toque, sin preguntar. ¿Le ponemos freno?**
- a) `ConfirmDeleteModal` («¿Borrar los N precios escritos a mano?»), como el resto del sistema.
- b) Deshacer de 5 segundos, como depositar un cheque.
- c) Se queda como está.

**Recomiendo (b).** Es trabajo tecleado a mano que no se puede reconstruir, y el sistema ya tiene ese patrón (`useUndoAction`) para exactamente esto. La confirmación previa suma un toque a algo que casi nunca se hace; el deshacer no suma ninguno.

**5. Tallas por bulto y «Fotos a mi Excel»: 629 líneas y 0 registros de uso desde el 4-sep. ¿Qué hacemos?**
- a) Esperar 4 semanas más y decidir con el número.
- b) Preguntarle directo a Angela y andrea si las usan.
- c) Retirarlas ya.

**Recomiendo (b) y (a) juntas.** Cuatro días de instrumentación no son evidencia de nada, pero una pregunta de un minuto a las dos personas que usan el módulo sí lo es — y no hace falta esperar.
