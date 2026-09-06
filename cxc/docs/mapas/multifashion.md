# Multifashion — el mapa

> Medido contra producción el **5-sep-2026**. Ningún número sale de la documentación.
> Pantalla: `/multifashion`. Rutas: `/api/multifashion/*` (11). Código:
> `src/lib/multifashion/*` + `src/components/multifashion/*` ≈ **11.400 líneas**.
> La tienda **es `american_classic`** y la empresa nunca se lee de la URL: constante del
> servidor. ✅ verificado.

---

## 1. Qué es, quién entra, cuánto se usa

**Qué es.** La tienda de Chiriquí, con **seis pestañas**: Resumen (por defecto) ·
Vendedoras · Productos · Clientes · Caja · Metas. Arriba, fuera de las pestañas, la
tarjeta **Hoy** con la venta del día y el selector de año.

**Quién entra — medido.**

| Dónde | Qué dice |
|---|---|
| `src/lib/modules.ts:134` | `roles: ["admin","gerente_acs"]` |
| `role_permissions` (producción) | `gerente_acs` → `["multifashion"]`, **su único módulo** |
| `fg_users` | **jennifer** (`gerente_acs`, activa) + los 2 admin |
| Pantalla (`MultifashionShell.tsx:51`) | `["admin","gerente_acs"]` |
| Las 11 rutas API | **9 dejan pasar `secretaria`**; `overview` y `venta-hoy` además dejan pasar `contabilidad` |

**Cuánto se usa — Jennifer SÍ entra.**

| | Medido |
|---|---|
| Sesiones de jennifer | **42** (3-jul-2026 → 5-sep-2026) |
| Últimos 30 días | **27** |
| Días distintos con sesión | **20** |
| Entradas en `activity_logs` con rol `gerente_acs` | **40, todas `login`** |
| Acciones dentro del módulo registradas | **0** |

⚠️ **Qué pestaña abre: NO MEDIDO, y no se puede.** Las 11 rutas de `/api/multifashion/`
**no llaman `logActivity` ni una vez** (37 carpetas de `src/app/api/` sí lo hacen).

**La única telemetría real que existe es la caché de Caja** — se escribe sola cuando
alguien abre esa pestaña:

| `multifashion_caja_diaria` | |
|---|---|
| Días cacheados en toda la historia | **8** |
| Rango | 3-jul-2026 → 14-ago-2026 |
| Días desde la última vez que alguien la abrió | **22** |
| De esos 8 días, con la caja en cero | **3** |

**La pestaña Caja se abrió 8 veces en su vida y nadie la toca desde el 14 de agosto.**
Y cada apertura de un día que no está cacheado **abre una sesión en Switch** (que expulsa
a quien esté en el panel de esa empresa).

**Metas: 1 fila en toda la historia.**

| `multifashion_metas` | |
|---|---|
| Filas | **1** — «Viaje playa», grupal, $420.000, 1-sep → 31-dic-2026 |
| Creada por | **daniel**, el 14-ago-2026 |
| Veces editada | **0** (`updated_at` = `created_at`) |
| Participantes | 4 (Jailine · Milagros Torres · Jennifer Miranda · Sheynee Batista), sin objetivo individual |
| Líneas de código dedicadas a Metas | **≈ 2.700** (`MetaFormModal` 559 · `metas-lectura` 534 · `MetasSubtab` 274 · `MetaAvanceCard` 276 · `metas-avance` 259 · `metas-clave` 231 · `MetasEnVendedoras` 169 · `metas-permiso` 69 · ruta 348) |

---

## 2. Los datos, medidos

### La tienda abrió en mayo-2024 — confirmado

| Año | Venta retail | Nota |
|---|---|---|
| **2024** | **$477.843,42** | Mayo: **$0,01** (una sola línea). El primer mes real es **junio-2024: $72.663,98** |
| **2025** | **$676.337,36** | Primer año completo |
| **2026 al 5-sep** | **$369.153,24** | vs $340.982,79 de los mismos días de 2025 = **+8,3%** |
| Proyección cierre 2026 | **$732.213,29** | pesada por temporada, no por días ✅ |

Mes a mes de 2026 (retail): ene 33.272,39 · feb 38.381,69 · mar 38.325,58 · abr 47.375,17 ·
may 42.446,03 · jun 64.503,06 · jul 40.788,67 · ago 53.193,56 · sep (al día 5) 10.867,09.

⚠️ **Cualquier «vs año pasado» de enero a mayo de 2025 compara contra una tienda que no
existía.** El sistema lo maneja bien: mayo-2024 vale $0,01 y la pantalla escribe `n/a` en
vez de «+363.024.750%» (`MultifashionResumenView.tsx:533`, comentario explícito).

### El resto de las tablas

| Tabla / fuente | Filas | Rango | Estado |
|---|---|---|---|
| `switch_facturas` (ACS) | 29.762 | may-2024 → 5-sep-2026 | viva, la fuente de todo |
| `switch_articulo_diario` (ACS) | 46.187 · **205 días con filas en 2026** | 7-may-2024 → **4-sep-2026** | **llega hasta ayer** — alimenta Productos |
| `switch_articulo_marca` (ACS) | 8.736 · **34 marcas** | — | viva |
| `multifashion_tickets` | 15.819 | 2-may-2025 → **25-jul-2026** | **CONGELADA** (tiene candado propio) |
| `multifashion_caja_diaria` | **8** | 3-jul → 14-ago-2026 | caché a demanda, sin uso |
| `multifashion_metas` | **1** | — | viva |
| `multifashion_meta_participantes` | **4** | — | viva |
| Mayoreo 2026 (`is_wholesale = true`) | **5 facturas · $31.965,90** | abr $24.807 · jun $1.350 · jul $2.208,90 | 3 meses de 9 con movimiento |

### La configuración vive en dos lugares distintos

`app_settings` (última edición: **10-may-2026**, hace 4 meses):

| Clave | Valor | ¿Se usa? |
|---|---|---|
| `multifashion_meta_anual_2026` | **800.000** | Sí — y **no es la meta**: la meta real es $420.000 sep–dic en `multifashion_metas` |
| `multifashion_growth_target_pct` | 5 | alimenta `expectedTodayPct` (hoy 49,3%) |
| `multifashion_bono_top` | **50** | descripción: *«Bono USD a la TOP vendedora cuando supera mes anterior»* — ver 🩸 #4 |
| `multifashion_tienda` / `_ubicacion` / `_manager` / `_managers` | American Classics · Chiriquí · Jennifer Miranda | sí |

---

## 3. Cuánto cuesta hacer las cosas

Las tareas que los datos demuestran que se hacen.

### Tarea A — Jennifer entra a ver cómo va la tienda (27 veces en 30 días)

| | Hoy |
|---|---|
| Toques | **1** — entra y la app la manda sola a `/multifashion` (módulo único) |
| Pantallas | 1 |
| Campos a escribir | 0 |
| Lo primero que ve | Tarjeta **Hoy**: venta del día, tiquetes, «vs ayer», «vs el viernes pasado», hora de actualización |

**Esto está resuelto.** Es la mejor tarea del sistema entero: cero toques, el dato
arriba, con su frescura pegada. No la toques.

### Tarea B — «¿Cómo va cada vendedora este mes?»

| | Hoy | Podría ser |
|---|---|---|
| Toques | **2** (pestaña Vendedoras → chip del mes) | 1 |
| Pantallas | 1 | 1 |
| Lo que hay que recordar de memoria | **Contra qué compara la Δ.** La tabla dice «Δ vs julio 2026»; el banner de arriba, en la misma pantalla, compara contra **agosto 2025** | nada |
| Lo que se pierde al recargar | **el chip elegido** (no está en la URL) | queda en la URL |

### Tarea C — «¿Vamos a llegar a la meta del viaje?»

| | Hoy |
|---|---|
| Toques | **2** (pestaña Metas) |
| Pantallas | 1 |
| Lo que obtienes | Barra, «Faltan $X y quedan N días», «Así como van, cierran en $X» |

Bien. **Pero la meta se creó una vez en 4 meses** y el formulario para crearla pide
**8 campos** (nombre · desde · hasta · objetivo · tipo · premio · monto del premio · activa)
**más una casilla por vendedora** (4 marcadas de N candidatas), y **6 de los 8 el sistema
ya los sabe o los puede proponer**: las fechas (el trimestre en curso), el tipo (grupal es
la única que se usó), y las participantes (las 4 activas del mes). Hoy son **≈ 14 toques
y 8 campos**; podrían ser **4 campos** (nombre, hasta, monto, premio) y **≈ 6 toques**.

### Tarea D — «¿Qué se está vendiendo?» (pestaña Productos)

| | Hoy | Podría ser |
|---|---|---|
| Toques hasta ver el ranking | **3** (pestaña → período → agrupador) | 1 |
| Lo que se pierde al recargar | **período, agrupador y marca** — ninguno está en la URL | quedan en la URL |
| Listas recortadas sin decirlo | **3** (ver 🩸 #6) | 0 |
| Filas visibles del ranking largo | 100 de **3.925**, y sí lo dice | igual |

**Un enlace a «Productos, marca X, agosto» no existe**: de los 11 controles del módulo,
**solo 4 viven en la URL** (pestaña, mes, y los dos filtros de Clientes). El año, el
período de Productos, el agrupador, el chip de Vendedoras, el toggle del gráfico y el día
de Caja se pierden en cada recarga.

### Tarea E — Cerrar el bono del mes

| | Hoy |
|---|---|
| Toques | **3** (pestaña Vendedoras → bajar al banner → leer) |
| Lo que hay que recordar | **Que el % del bono compara contra el año pasado y el de la tabla de al lado contra el mes pasado** |
| Lo que la pantalla no dice | **Que el bono de vendedora se lo lleva la que más vendió, aunque haya vendido menos que el mes anterior** |

### Lo que se repite en todo el módulo

- **Ningún Excel.** Cero `xlsx` / `workbookBytes` / `jsPDF` en las 11.400 líneas. Ni las vendedoras, ni los 3.925 artículos, ni el cuadre de caja se pueden bajar. Es el módulo grande sin una sola descarga.
- **Ninguna acción deja rastro** en `activity_logs`.
- **El mismo total se pide a dos RPC distintas** en pantallas contiguas (ver 🩸 #1 y #2).

---

## 4. 🩸 Lo que miente o está roto

### #1 — 🩸 Dos «YTD» en la misma pantalla, con **$3.364,19** de diferencia

`multifashion_mensual_v7(2026, 9)`, la MISMA llamada, devuelve:

| Lo que se ve en Resumen | Valor | De dónde |
|---|---|---|
| «Panorama del año 2026 → **VENTAS YTD**» | **$369.153,24** | `retail.ytdVentas` (`MultifashionResumenView.tsx:386`) |
| «Mes a mes vs 2025 → fila **YTD**» | **$365.789,06** | suma de los meses de la tabla (`:552-554`) |
| «Mes a mes → fila **Sep**» | **$7.502,90** | `retail.meses[8]`, `fecha_corte: 2026-09-04` |
| El gráfico acumulado, último punto | **$369.153,24** al 5-sep | `multifashion_overview_serie_v1` |

Septiembre vale **$7.502,90 en la tabla** y **$10.867,09 en el gráfico y en el YTD de
arriba** — la diferencia es exactamente el sábado 5-sep ($3.364,19). Dos cortes distintos
(«ayer» y «hoy») conviviendo en la misma pantalla, ambos rotulados igual.

### #2 — 🩸 La tienda vale una cosa aquí y otra en Ventas / Vista General

| Mes | Multifashion › Resumen | Ventas › Resumen y Vista General | Diferencia |
|---|---|---|---|
| **abril 2026** | **$47.375,17** | **$72.182,17** | **$24.807,00 (34,4%)** |
| 2026 al 5-sep | $369.153,24 | **$397.519,14** | **$28.365,90** |

La causa es real y correcta: **Multifashion muestra retail; Ventas muestra retail + mayoreo.**
El módulo tiene el número completo (`total.ytdVentas` = $397.519,14) y hay una nota de
mayoreo bajo el KPI — pero **el número grande de la tienda es el retail**, y son 5 facturas
de mayoreo en todo el año las que abren un boquete de $28.365,90 entre dos pantallas.

### #3 — 🩸 Tres personas partidas en dos por MAYÚSCULAS, y el arreglo solo vive en Metas

Medido hoy en `_multifashion_sf_vw`:

| Persona | Grafía 1 | Grafía 2 | Documentos bajo la segunda |
|---|---|---|---|
| Ana Trejos | `Ana Trejos` $188.480,89 | `ANA TREJOS` **$1.786,77** | 37 |
| Yeisibeth Muñoz | `Yeisibeth Muñoz` $18.883,41 | `YEISIBETH MUÑOZ` **$2.042,21** | 47 |
| Cindy De Gracia | `Cindy De Gracia` $13.120,79 | `CINDY DE GRACIA` **$1.607,98** | 37 |
| | | **$5.436,96** | **121** |

Las tres grafías en mayúscula viven en una ventana estrecha: **20-jun a 21-jul-2026**.

`claveVendedora` (`metas-clave.ts:54`) las junta bien — **pero solo lo usa la pestaña Metas.**
`multifashion_vendedoras_v3` y `multifashion_bonos_v3` agrupan con
`REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ')` — **sin `UPPER`**. Consecuencia medida:
en junio-2026 la pestaña Vendedoras lista `ANA TREJOS`, `CINDY DE GRACIA` y
`YEISIBETH MUÑOZ` como si fueran otras personas, y **la Δ de Cindy en agosto sale `null`**
porque el sistema no la encuentra en julio (donde figura en mayúscula).

### #4 — 🩸 El bono de la vendedora **no premia crecer: premia ser la que más vendió**

`app_settings.multifashion_bono_top` dice: *«Bono USD a la TOP vendedora **cuando supera
mes anterior**»*.

El SQL de `multifashion_bonos_v3` dice otra cosa:
```
'bono_vendedora', v_elegible AND NOT j.is_mgr AND mx.m IS NOT NULL AND j.ventas = mx.m
```
Es **la que más vendió del mes**, sin ninguna comparación. Medido en agosto-2026:
**Sheynee Batista se lleva el bono con `tiene_comparacion: false` y `delta_ventas_pct: null`**
— no existía en agosto-2025, así que no superó nada.

Además el badge `🏆 Bono $50` es un **texto escrito a mano** en la pantalla
(`VendedorasSubtab.tsx:295`), no viene del dato: si cambias el monto en la configuración,
el badge sigue diciendo $50. Y el bono del gerente (**$100** si crece ≥10%, $50 si ≥5%)
está **escrito dentro del SQL**, no en la configuración.

### #5 — 🩸 Jennifer sale **−10%** en una pestaña y **+15.073%** en la de al lado

Agosto-2026, la misma persona, el mismo mes, dos bloques de la misma pantalla:

| Bloque | Δ | Contra qué |
|---|---|---|
| Tabla de Vendedoras | **−10,2%** | julio-2026 ($6.235,94) |
| Banner de Bonos | **+150,73** → en pantalla **+15.073%** | agosto-**2025**, cuando vendió **$36,90 en 1 documento** |

Las dos son aritméticamente correctas y **usan comparaciones distintas** (`vendedoras_v3`
compara contra el mes anterior; `bonos_v3` contra el año anterior). La tabla sí dice
«Δ vs julio 2026» ✅ — el banner no dice contra qué año compara, y un número de cinco
cifras al lado de un nombre no se lee como información.

### #6 — 🩸 Cuatro listas se cortan sin decir de cuántos salieron

| Lista | Se ven | ¿Avisa? | Cita |
|---|---|---|---|
| «Se vende mucho pero deja poco» | **3** | **No** | `ProductosSubtab.tsx:196` |
| «Lo que más cambió → Subió / Bajó» | **3 + 3** | **No** | `ProductosSubtab.tsx:199` |
| «Por departamento» | 50 | **No** (hoy hay ~32, así que no se nota todavía) | `productos/route.ts:124` |
| «Lo que más se vende / más plata deja» | 5 | parcial (dice qué % suman, no de cuántos) | `ProductosSubtab.tsx:190` |
| Tabla «Ver todo» | 100 de 3.925 | **Sí**, y ofrece «Ver 100 más» ✅ | `ProductosSubtab.tsx:186` |
| Clientes identificados | 50 | **Sí** ✅, pero el subtítulo no refleja el chip activo | `retail-recurrentes/route.ts:30` |

### #7 — 🩸 Las tarjetas de Clientes cuentan un universo y los chips filtran otro

Las cuatro tarjetas (`Frecuentes` · `Nuevos del mes` · `Dormidos` · `5% pendiente`)
cuentan **todos** los clientes de fidelización. Los chips del mismo bloque filtran **solo
los 50 visibles**. Tocas «Dormidos» con la tarjeta diciendo 143 y aparecen 4 filas.
`ClientesMultifashionSubtab.tsx:257-267` vs `:341-368`.

### #8 — 🩸 La pestaña Clientes no dice de qué mes habla, y el control que lo elige está escondido

El título con el período (`Septiembre 2026`, `Últimos 3 meses · hasta septiembre 2026`)
es **`sr-only`** (`ClientesMultifashionSubtab.tsx:311`). Las píldoras dicen el LARGO de la
ventana (Mes · 3 meses · 6 · 12), nunca el mes de corte. Y el selector de mes **se oculta
en esta pestaña** (`MultifashionView.tsx:125-126`) aunque el rango se ancla en él.
Un dato manejado por un control que no está en pantalla.

### #9 — 🩸 Un `?subtab=` con basura deja la pantalla en blanco

`?subtab=overview` y `?subtab=mes` se normalizan a `resumen` (`MultifashionView.tsx:65`),
pero **cualquier otro valor no cae a ningún default**: `Tabs value` no coincide con nada,
no se dibuja ningún contenido y queda la tira de pestañas sola.

### #10 — 🩸 La pantalla de Caja muestra el error CRUDO del servidor

`CajaSubtab.tsx:111-113` imprime `{error.message}` tal cual — el mismo defecto que se
corrigió en Cuentas por Cobrar el 5-sep. Y **si la caja llega vacía sin error, el
componente devuelve `null`**: pantalla en blanco bajo el selector de día, sin una palabra
(`:174`). En total **6 pantallas del módulo imprimen el mensaje crudo**:
`MultifashionResumenView.tsx:352` · `BonosSection.tsx:82` · `VendedorasSubtab.tsx:181` ·
`ProductosSubtab.tsx:450` · `ClientesMultifashionSubtab.tsx:296` · `MultifashionShell.tsx:171`.

### #11 — 🩸 A Jennifer se le puede mostrar el nombre de un archivo SQL

`MetasSubtab.tsx:137-143`: *«Falta correr el archivo **20260813170000_multifashion_metas.sql**
en Supabase»*. Es su único módulo y no puede hacer nada con eso.

### #12 — ⚠️ Permisos: 9 de 11 rutas dejan pasar a `secretaria`, que no tiene el módulo

`role_permissions` en producción: `secretaria` **no** tiene `multifashion`; `contabilidad`
tampoco (ni `ventas`). Sin embargo:

- 9 rutas aceptan `secretaria` (`bonos:25`, `caja:47`, `clientes-wholesale:23`, `detalle-mensual:28`, `fidelizacion:67`, `metas`, `productos:148`, `retail-recurrentes:21`, `vendedoras:35`)
- `overview:22` y `venta-hoy:27` aceptan además **`contabilidad`**
- **`/multifashion/page.tsx` no tiene guard de servidor**: corre `fetchMultifashion()` sin mirar el rol, así que el resumen de la tienda viaja en el HTML a **cualquier sesión válida** (bodega, vendedor, contabilidad, David) antes de que el navegador redirija. `/ventas/page.tsx:22-24` sí lo hace bien y dice por qué.

### #13 — ⚠️ La línea «🎯 Meta» de tu Telegram saltó **52 puntos en dos días**

Medido, día por día, con el cálculo real (factor 420.000 ÷ 340.698,55 = 1,2328):

| Corte | Vendido | Ritmo | Lo que diría el mensaje |
|---|---|---|---|
| 1-sep | $1.624,63 | $1.000,08 | +62% |
| 2-sep | $3.432,10 | $2.895,93 | +19% |
| 3-sep | $4.599,07 | $4.061,12 | **+13%** |
| 4-sep | $7.502,90 | $4.667,78 | +61% |
| **5-sep** | **$10.867,09** | **$6.587,85** | **+65%** |

El cálculo es correcto (el «vendido» sale del mismo lugar que la pestaña Metas ✅). Lo que
pasa es que con **5 días de 122** cada día bueno mueve el porcentaje 40 puntos, y la
comparación es contra **la misma fecha de calendario**, no el mismo día de la semana:
el sábado 5-sep-2026 se compara contra el viernes 5-sep-2025. En una tienda, sábado y
viernes no venden lo mismo.

### #14 — ⚠️ Rótulos y comentarios que describen otro código

| Qué | Dónde |
|---|---|
| `dia_corte_anio_anterior: "2026-07-31"` — el campo se llama «año anterior» y trae el **mes anterior** | `multifashion_vendedoras_v3` (la pantalla sí lo rotula bien: «Δ vs julio 2026» ✅) |
| «`CIERRE 2026`» sobre un año en curso mostrando el acumulado a hoy | `MultifashionResumenView.tsx:414-425` |
| «Ningún **artículo** coincide con la búsqueda» estando en «Por categoría» | `ProductosSubtab.tsx:1094` |
| «% del total» sigue siendo del total GLOBAL con una marca filtrada | `ProductosSubtab.tsx:1308` |
| `Total` de Formas de pago (lo suma el navegador) ≠ `Gran total del día` (lo manda Switch) | `CajaSubtab.tsx:158` vs `:139` |
| El comentario dice `multifashion_bonos_v1`; el código llama `_v3` | `bonos/route.ts:2` vs `:42` |
| El comentario cita el rol **`director`**, que no existe en el sistema | `vendedoras/route.ts:10` |
| Cuatro comentarios dicen «Multifashion es módulo admin-only por ahora»; los arrays traen 3 roles desde el 13-ago | `clientes-wholesale:21`, `detalle-mensual:26`, `retail-recurrentes:19`, `vendedoras:33` |
| `showMesCerradoHint` **no puede ser `true` jamás** — el `<p>` «último mes cerrado · septiembre en curso» es UI muerta, y el comentario que la explica describe otro cálculo | `MultifashionView.tsx:95`, `:134-135`, `:205-209` |
| `HorasChart` importado con `next/dynamic` y **nunca renderizado** | `MultifashionResumenView.tsx:36-39` |
| `VendedorasSubtab` recibe 4 props y lee 2 | `VendedorasSubtab.tsx:59-68` |

### ✅ Lo que está bien y conviene no tocar

- **La tienda es constante del servidor.** `american_classic` nunca sale de la URL.
- **Productos corta en el último día CARGADO**, no en «hoy» ✅ — y lo dice: *«Comparado con 1 sep – 3 sep (los mismos días del año pasado, para que sea comparable)»*.
- **Vendedoras es la excepción a propósito y el rótulo lo dice**: «Δ vs julio 2026», nunca «vs año pasado» ✅.
- **La proyección pesa por temporada**, no por días, y bajo el 5% no proyecta ✅.
- **La meta grupal mide toda la venta de la tienda** (incluye lo vendido bajo `DEFAULT`, $296,43 en septiembre) y **no reparte el objetivo solo** ✅.
- **El borrado de una meta es soft delete** en el servidor ✅.
- **Cero voseo en texto de pantalla** ✅ (86 «acá» en comentarios, que el candado no mira).
- **Nunca un `$0.00` grande**: dice «Todavía no hay ventas hoy», «Sin movimientos este día», «no registra ventas retail».
- **Ningún dato del año anterior se inventa**: mayo-2024 vale $0,01 y la pantalla escribe `n/a`.

---

## 5. Coherencia con el resto del sistema

| Regla de la casa | Multifashion | |
|---|---|---|
| Cero voseo en pantalla | limpio, 0 hallazgos | ✅ |
| Excel por `workbookBytes` desde la fila 1 | **no exporta nada** | — (no aplica) |
| Confirmación de borrado con `ConfirmDeleteModal` | usa una confirmación **en línea de dos toques** («Retirar» → «Sí, retirar»), sin el retardo de 1 s ni el **Deshacer de 5 s** de la casa | ⚠️ `MetaFormModal.tsx:536-551` |
| Textos de vacío | siguen el patrón | ✅ |
| Textos de error | **6 pantallas imprimen el mensaje crudo** | 🩸 |
| Botón principal `rounded-md bg-black text-white active:scale-[0.97]` | sí | ✅ |
| Filtros en la URL | **4 de 11 controles** | 🩸 |
| Formato de plata | usa `fmtMoney` de la casa (`−$100.00`, con centavos) en 12 componentes ✅ … **menos Caja**, que usa `fmt` de `lib/format` (sin `$`), y 5 lugares que imprimen `.toFixed(2)` crudo, sin separador de miles | ⚠️ |
| Porcentajes sin decimal | `fmtMargen` y `fmtPctTotal` usan 1 decimal | ⚠️ `ProductosSubtab.tsx:210,214` |
| Nombre de empresa corto | no aplica: es una sola tienda | — |
| «vs año pasado» = los mismos días | **dos definiciones conviviendo**: Productos corta en el último día CARGADO, Detalle mensual en «hoy Panamá − 1» | ⚠️ |
| Un cero grande nunca | ✅ | ✅ |
| Soft delete, nunca DELETE | ✅ en Metas | ✅ |
| Guard de servidor antes de leer | **no lo tiene** | 🩸 |

---

## 6. El iPhone (390 px)

| Qué | Estado |
|---|---|
| Las 6 pestañas | entran: los íconos se esconden bajo `lg` a propósito ✅ |
| Targets táctiles | **todos ≥ 44 px** (chips, píldoras, encabezados ordenables, selector de año, botones de Metas) ✅ |
| Grillas | bajan a 1 columna (Panorama, Pulso, ListaTop) ✅ … **menos Caja**: `grid-cols-2 sm:grid-cols-4`, nunca baja a 1 → cada KPI queda con ~151 px para un `$#,###.##` |
| **Montos con `truncate`** | en las tarjetas de Productos la cifra de Venta / Utilidad puede cortarse con `…` sin avisar. **Es una pantalla de plata** — `ProductosSubtab.tsx:1259` |
| **Textos que solo se leen con el mouse** | los nombres de artículo se truncan con `title=` (hover, que en el teléfono no existe) — `:860`, `:1019`; las tarjetas del ranking truncan **sin `title`** — `:1212-1213` |
| **La regla del bono es inalcanzable en el teléfono** | es un `<span title=…>`, no el `<Ayuda>` de la casa (que abre al tocar y mide 44 px) — `BonosSection.tsx:135-137` |
| **Los mini-gráficos no dicen nada en el teléfono** | «Mejor día de semana» y «Hora pico» ponen el monto de cada barra en `title` — `MultifashionResumenView.tsx:868` |
| **Caja: la tabla de Formas de pago no tiene arrastre propio** | única tabla del módulo sin `overflow-x-auto` — `CajaSubtab.tsx:152` |
| Caja: la fila de frescura | 3 controles + 2 textos en `flex-wrap` → se apila en 3-4 líneas antes de los KPI — `:79-99` |
| Metas: input de monto individual `w-40` fijo | la fila queda al borde a 390 px — `MetaFormModal.tsx:496` |

---

## 7. Lo que sobra · lo que falta

### Sobra

| Qué | La medición que lo prueba |
|---|---|
| **La pestaña Caja** | **8 días abiertos en toda su historia**, ninguno desde hace 22 días, 3 de esos 8 en cero. Y cada apertura abre una sesión en Switch |
| **La sección de Mayoreo dentro de Clientes** | **5 facturas en todo 2026** ($31.965,90), en 3 meses de 9 |
| **La segunda «YTD»** de la tabla Mes a mes | Ya está arriba, con otro número (#1) |
| **El formulario de Metas con 8 campos** | Se usó **una vez en 4 meses**; 6 de los 8 el sistema los puede proponer |
| **`showMesCerradoHint` y `HorasChart`** | Código que no puede ejecutarse y componente que no se dibuja |
| **La columna «Comisión» de Vendedoras** | Va con `.toFixed(2)` sin separador de miles y son montos de $26 a $92; ⚠️ **si es plata que se paga, no sobra — dímelo** |

### Falta

| Qué | La medición que lo prueba |
|---|---|
| **Un solo corte para septiembre** | $7.502,90 en un lado y $10.867,09 en el otro, en la misma pantalla |
| **Juntar las tres vendedoras partidas en dos** en Vendedoras y Bonos | $5.436,96 en 121 documentos bajo un segundo nombre; el arreglo ya existe y solo lo usa Metas |
| **Que el banner de Bonos diga contra qué compara** | «+15.073%» al lado del nombre de Jennifer |
| **Que el bono diga su regla de verdad** | Se lo lleva la que más vendió, no la que creció |
| **El guard de servidor en `/multifashion/page.tsx`** | Son 3 líneas, copiadas de `/ventas/page.tsx:22-24` |
| **Sacar a `secretaria` y `contabilidad` de las rutas, o darles el módulo** | 9 rutas de 11 · 2 roles que no lo tienen |
| **Poder bajar algo a Excel** | 0 exportaciones en 11.400 líneas |
| **Saber qué pestaña se usa** | 0 registros de acción; la única señal es una caché de 8 días |
| **Que los filtros vivan en la URL** | 4 de 11 controles |

---

## 8. Preguntas para Daniel

### 1. Septiembre vale $7.502,90 en la tabla «Mes a mes» y $10.867,09 en el gráfico y en «VENTAS YTD» de la misma pantalla. La diferencia es el día de hoy.

- **a)** Que todo el Resumen corte en **ayer** (el último día completo): números estables, pero la venta de hoy no aparece en el mes.
- **b)** Que todo corte en **hoy**: ves la venta del día dentro del mes, con la advertencia de que el día no cerró.
- **c)** Dejar los dos y escribir al lado de cada uno hasta qué día llega.

**Recomiendo (b).** Ya tienes la tarjeta «Hoy» arriba diciendo que el día no cerró, y la
pestaña Metas y el Telegram ya cuentan hasta hoy. Que la tabla corte en ayer hace que en
septiembre te falten $3.364 sin ninguna señal. **Lo que no puede quedar es (c) con dos
cifras iguales de nombre y distintas de valor.**

### 2. La tienda vale $47.375 en Multifashion y $72.182 en Ventas para abril. Multifashion muestra retail; Ventas suma el mayoreo. En todo 2026 el mayoreo son **5 facturas, $31.965,90**.

- **a)** Dejarlo: retail es el negocio de la tienda, el mayoreo es otra cosa.
- **b)** Que el número grande de Multifashion sea **la tienda completa** (retail + mayoreo) para que cuadre con Ventas, y el retail vaya debajo.
- **c)** Retirar el mayoreo de Multifashion y que viva solo en Ventas.

**Recomiendo (a) y que se diga.** Con 5 facturas al año, el mayoreo distorsiona un mes y
desaparece los otros ocho: promediarlo dentro del ritmo de la tienda le quita sentido al
número de Jennifer. Pero hoy la única señal es una nota chica; debería decir, al lado del
título, «tienda · sin mayoreo». **Es tu decisión de negocio, no del código: dime si el
mayoreo es de la tienda o de Ventas.**

### 3. Tres vendedoras están partidas en dos porque Switch mandó su nombre en mayúscula entre el 20-jun y el 21-jul ($5.436,96 en 121 documentos). El arreglo ya existe en el sistema, pero solo lo usa la pestaña Metas.

- **a)** Aplicar el mismo arreglo (mayúsculas + sin tildes, igualdad exacta) a Vendedoras y a Bonos.
- **b)** Corregir los nombres en Switch y no tocar el sistema.
- **c)** Las dos.

**Recomiendo (c), empezando por (a).** La (a) es un cambio de lectura, reversible, que no
escribe una fila y que usa la función que ya está probada. La (b) evita que vuelva a
pasar, pero es trabajo tuyo en Switch y no arregla los 121 documentos que ya están.
Hoy, sin (a), la Δ de Cindy en agosto sale vacía y nadie sabe por qué.

### 4. El bono de la vendedora se lo lleva **la que más vendió**, aunque haya vendido menos que el mes pasado. La configuración dice «cuando supera mes anterior». ¿Cuál es la regla de verdad?

- **a)** La que más vendió del mes, sin comparar. (Lo que hace el código hoy.)
- **b)** La que más vendió **y** superó su propio mes anterior; si ninguna lo hizo, no hay bono ese mes.
- **c)** La que más CRECIÓ, aunque no sea la que más vendió.

**Recomiendo (b) si el bono es por esfuerzo, (a) si es por resultado.** No lo puedo
decidir yo: es tu política de pago. Lo que sí puedo decir es que **hoy la pantalla no
dice ninguna regla** y el monto ($50) está escrito a mano en dos lugares — cambiarlo en
la configuración no cambia lo que se ve.

### 5. La pestaña Caja se abrió **8 días en toda su historia** y nadie la toca desde el 14 de agosto. Cada vez que se abre un día nuevo, abre una sesión en Switch.

- **a)** Retirarla (los datos se quedan; solo se va la pestaña).
- **b)** Dejarla.
- **c)** Fundirla dentro de Resumen: una línea con las formas de pago del último día, sin pestaña propia.

**Recomiendo (a).** 8 aperturas en dos meses, con 3 de ellas cayendo en un día sin ventas,
es la señal más clara del módulo. Y es la única pestaña que abre sesión en Switch cada
vez: retirarla también le quita un riesgo al panel. Si algún día quieres el cuadre de
caja, vuelve — nada se borra.

### 6. Todo el módulo son 11.400 líneas y **no se puede bajar nada a Excel**: ni las vendedoras, ni los 3.925 artículos, ni el cuadre del día.

- **a)** Dejarlo así: es una pantalla para mirar.
- **b)** Un solo botón «Bajar a Excel» en Vendedoras (que es lo que se paga).
- **c)** Uno en cada pestaña.

**Recomiendo (b).** Vendedoras es donde hay plata que se paga y donde alguien va a querer
guardar el cierre del mes. Un Excel por pestaña es trabajo que probablemente nadie use —
y el resto de la app ya tiene la función lista (`workbookBytes`), así que agregar el
primero cuesta poco.
