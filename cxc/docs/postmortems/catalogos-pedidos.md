# Post-mortems — Catálogos, pedidos y cotización

> Movido de `cxc/CLAUDE.md` el 31-ago-2026 para bajar lo que se inyecta en cada sesión.
> **Nada se resumió ni se borró: el contenido es verbatim**, con sus «Daniel, textual»,
> sus mediciones, sus «Candados», sus «Verificado por mutación» y sus 🩸.
> La REGLA vigente (sin la historia) vive en «Invariantes por módulo» de `cxc/CLAUDE.md`.

---

## 🔴 EL DESPACHO DE REEBOK ENTRA AL DEPURADOR — TRES NÚMEROS QUE SE INVENTABAN (17-sep-2026)

Daniel, textual: *«te paso un nuevo excel… puede reemplazar al viejo que se subía a
depurador para reebok»* · *«así agregamos ese Excel también para hacer preforma cliente
(con foto), plantilla switch, etc»*.

**El flujo Reebok de «Plantilla Switch» ahora tiene DOS entradas, y son dos documentos
distintos del proveedor:**

| | Qué es | Para qué sirve |
|---|---|---|
| **Confirmación de compra** (`RBK FW26 …xlsx`) | lo que **va a llegar** | cotizar antes de que la mercancía exista. **No cambió ni una coma.** |
| **Despacho** (`Detalle_Despacho…xlsx`) | lo que **de verdad llegó** | la plantilla de Switch y la preforma con los números buenos |

Las dos salidas son las mismas de siempre —preforma para el cliente (con foto) y
plantilla de Switch de 25 columnas—, y la pantalla **DICE cuál de los dos archivos se
subió**: confundirlos es cotizar con números que no son.

### 🩸 Los tres números que salían mal, medidos el 17-sep-2026

**1. EL COSTO SE INVENTABA.** `fobReebok` asume el descuento del proveedor —`× 0,80` en
calzado y `× 0,70` en ropa y accesorios— porque la confirmación no lo dice. El despacho
lo trae **columna por columna** (`% de descuento` y `Precio after Disc`), y el archivo
real trae **20 %, 25 % y 30 % en el mismo embarque**. Daniel: *«hay veces que puede
llegar un porcentaje más alto. No siempre será 20»*. Por eso el descuento **no se
reemplaza por otra constante: se LEE**.

Medido sobre los dos archivos reales, con `scripts/_medir-despacho-reebok.ts` (solo lectura):

| Archivo | Artículos | Piezas | Costo FOB leído | Costo FOB asumido | Diferencia | Artículos con otro costo |
|---|---|---|---|---|---|---|
| Ropa y accesorios | 75 | 1.403 | **$11.018,30** | $9.638,79 | **+$1.379,51** | **75 de 75** |
| Calzado | 108 | 3.306 | **$101.808,84** | $102.138,78 | **−$329,94** | 9 de 108 |

Los 9 del calzado son justamente los que traen 25 % y 30 %. Y como el precio de venta
sale del CIF, **esto mueve el precio que ve el cliente en las dos salidas**.

**2. EL CÓDIGO DE BARRAS NO ERA UN CÓDIGO DE BARRAS — en ropa.** Se escribía el `SKU`
de Reebok (`RBKAPPTR1200M`), que no se puede pistolear. Ahora sale del **`EAN` de la
talla-muestra** y, sin él, del `UPC`. Medido: **0 de 183 artículos** quedan sin un
código numérico.

🔴 **Y el orden EAN → UPC no da igual: está medido, no elegido.** Los dos son códigos de
barras válidos del mismo producto, pero **no son el mismo número**.

- En el despacho de calzado, sobre sus **1.579 filas**: `EAN` es de 13 dígitos y `UPC`
  de 12, los **1.579 con dígito verificador válido** en los dos campos, y **`EAN` ≠
  `UPC` en las 1.579**, sin una sola coincidencia. ZIGNITION 9.5 → EAN `1200186012487`,
  UPC `199307013049`. El `EAN` arranca con `120` en las 1.579.
- Sobre lo que **Switch ya tiene cargado** (export de Active Shoes,
  `listaarticulo_1_17092026024104.csv`, 183 artículos): **94 códigos de barra son EAN-13
  válidos** —y **66 de esos 94 empiezan con `120`**, el prefijo del despacho—, **4 son
  UPC-12** y 85 no son ninguno de los dos (correlativos internos de 5 y 6 dígitos:
  993277, 65388, 984730…).

O sea: **lo que está cargado en Switch es el EAN.** Cargar el UPC teniendo el EAN
dejaría el catálogo con dos formatos mezclados, y la pistola de la tienda lee el que
está impreso en la etiqueta.

⚠️ **Y hay una vuelta más, medida:** en el despacho VIEJO de calzado la columna `SKU`
**ES** el EAN —idénticas en las 1.579 filas—, así que ahí el sistema ya venía
escribiendo el código bueno sin saberlo. **El defecto del código de barras era real solo
en ropa.**

**3. LA CANTIDAD ERA UNA PROYECCIÓN** — las piezas de la columna del MES de la
confirmación. Ahora es `Quantity`, lo que llegó.

### 🔴 La regla que manda sobre todas: el mismo archivo, con o sin las columnas nuevas

Daniel, textual: *«vendrá con poname y category pero por ahora que el sistema acepte
este excel, y cuando llegue con lo otro ya sepa y me lo acepte también **sin tener que
estar reconfigurando**»*.

Y el despacho **ya tiene dos generaciones**, así que esto no es hipotético. Daniel:
*«en el despacho excel que solo trae calzado fue reemplazado por el que tiene accesory
donde sí trae category, solo falta que me agreguen poname y department»*.

| | Formato **NUEVO** (26 col., hoja `Sheet1`) | Formato **VIEJO** (25 col., hoja `Despacho`) |
|---|---|---|
| Alcance | ropa **y** calzado — el de acá en adelante | solo calzado |
| `Category` · `Color Name` | **sí** | no |
| `Composición` · `EAN` | **no** (los perdió) | **sí** |
| | ⬆️ el que hay que pedir de vuelta es el **`EAN`** | |

Los dos se tienen que poder subir: los archivos viejos existen y alguien los va a
soltar en la pantalla. Por eso la regla de respaldo es **un DATO y no un `if` suelto**
— `COLUMNAS_DESPACHO`, en `src/lib/depurador/reebok-despacho.ts`: columna, alias
aceptados, si es obligatoria y de dónde sale si falta.

| Columna | Si viene | Si NO viene |
|---|---|---|
| `PO NAME` | agrupa la preforma | **`BP Reference No.`** y, sin ella, `Orden` |
| `Category` | es el **rubro** | `SHOES` si el Department es FOOTWEAR; si no, **vacío y se dice** |
| `Department` | es la **Marca** | se deriva de `Segmento de negocio` (FTW · APP · ACC HW) |
| `Composición` | va a la columna 21 de Switch | queda vacía, como siempre |
| `EAN` | es el código de barra | el `UPC`; sin ninguno, el `SKU` (y se dice) |
| `Color Name` | viaja en el artículo | no se usa |

🔑 **El `PO NAME` tiene TRES escalones.** Daniel: *«por ahora también se puede usar BP
Reference No. como poname»*. Medido: en calzado dice `VIC` y en ropa `VIC- APP FW26`, y
la confirmación trae `VIC` en su columna `PO NAME` — **es el mismo dato con otro
nombre**. El orden de los alias ES la precedencia, así que el día que Reebok mande
`PO NAME` gana sola, sin que nadie toque nada.

🩸 **El Department se deriva por PALABRA ENTERA, nunca por `includes`.** Los 23
segmentos de los dos archivos caen en una de tres: `FTW` → FOOTWEAR, `APP` → APPAREL,
`HW` → HARDWARE. Con `includes`, un `HWY` o un `APPAREL` adentro de un segmento futuro
clasificaría mal — es la misma trampa que ya quemó al repo con «female» conteniendo
«male» (`tommy-gender.ts`). ⚠️ Un segmento que no dice ninguna de las tres **no se
adivina**: la fila sale con la Marca vacía, se cuenta y se dice en pantalla con el
valor crudo.

🔑 **El archivo de calzado también trae ropa.** `100269032` es «Reebok TRAINING APP
MEN» adentro del Excel de calzado: el Department se decide **POR FILA**, nunca por el
archivo.

### Lo que NO cambió, a propósito

- `OUT_COLS`, `TEXT_COLS`, `buildSwitchRows`, `pickSample`, `costoReebok` y
  `fotos-excel.ts`. El despacho produce los **mismos `ReebokItem`** y entra por el
  camino de siempre: no hay un segundo generador de las 25 columnas.
- 🔴 **Un solo costo por producto**: el CIF de la plantilla ES el costo de la preforma,
  de la misma función. El candado del 14-sep sigue verde.
- La talla-muestra: **M en ropa, 9 en calzado de hombre, 7 en dama, mediana en niños**.
- El costo se enchufa sin tocar `costoReebok`: `Precio Base` entra como `wholesale` y
  `Precio after Disc` como `wholesaleOff`, que es el campo que `fobReebok` ya prefiere
  cuando viene con valor. **No se escribió una segunda cuenta de costo.**

### ⚠️ Tres decisiones que quedaron abiertas, de Daniel

1. **El rubro fino contra el inventario.** Él preguntó: *«¿si no viene category usará
   Segmento de negocio y lo convertirá para mantener misma línea que ya existe en el
   inventario de Active Shoes?»*. Medido contra producción el 17-sep-2026
   (`switch_articulo_info`, 1.763 artículos de `active_shoes`): el rubro tiene **once
   valores** y tres cubren casi todo — `SHOES` 1.624 · `APPAREL` 79 · `SOCKS` 24 —, más
   `BAGS` 15, `HEADWEAR` 7, `GENERAL` 4, `MEN` 3, `DISPLAY & PROMO` 3, `OFERTA` 2,
   `SHORTS` 1 y `MUEBLES ZAPATOS` 1. El despacho de ropa trae `Category` **más fina**:
   T-SHIRTS 95 filas, SOCKS 46, SHORTS 36, BAGS 20, TOPS 12, BRA 12, JACKETS 8 — y
   **cuatro de esas (T-SHIRTS, TOPS, BRA, JACKETS) no existen todavía en el
   inventario**. Subir el archivo tal cual le agrega valores nuevos al rubro. **Eso ya
   pasaba antes de este cambio** y no se tocó: es acomodo de Switch y lo decide él. La
   regla vive en UNA función (`rubroDeRespaldo`) para que el día que decida sea una
   línea.
2. **El aviso ámbar de la talla única.** Daniel: *«ACCS063 porque solo hay S, es
   marcarla en ámbar y poner esa no?»*. La primera mitad ya pasa: se usa la que haya.
   La segunda **no**, y está medido: el ámbar de `pickSample` se enciende cuando hay
   VARIAS tallas y ninguna es la buscada (`fallback: bySize.size > 1`); con UNA sola
   talla no hay nada que elegir. Encenderlo para toda talla única pondría en ámbar
   también los bolsos —`ACCB145` viene en `N SZ`, que es talla única de verdad— y un
   aviso que grita sobre un dato bueno deja de ser un aviso. **No se cambió por cuenta
   propia**, y el candado fija la conducta de hoy para que el cambio sea deliberado.
3. **🔴 HAY QUE PEDIRLE EL `EAN` DE VUELTA A REEBOK.** El formato nuevo perdió dos
   columnas que el viejo traía, `Composición` y `EAN`, y **solo una importa**: la
   `Composición` Daniel no la usa y no la quiere (esa celda de Switch va vacía en todo
   el sistema por pedido suyo), pero el `EAN` **es el código de barra que Switch ya
   tiene cargado**. Mientras no vuelva, el despacho nuevo carga el `UPC`, que es un
   código válido pero otro número. El mapeo del `EAN` queda escrito y funcionando: el
   día que Reebok lo devuelva, no hay nada que tocar.

### Candados

`src/__tests__/lib/reebok-despacho.test.ts` (50 casos). Los fixtures son los **dos
archivos reales**, recortados a unos pocos estilos y sin tocar una celda:
`reebok-despacho-nuevo-ropa.xlsx` y `reebok-despacho-viejo-calzado.xlsx`. El bloque
central corre **el MISMO conjunto de filas dos veces** —una con las columnas nuevas y
otra sin ellas— y exige que las **25 columnas de Switch salgan iguales**, salvo
`Composición` y el rubro, que es justo lo que la columna aporta. Si alguien hace
obligatoria una columna que hoy falta, el build se pone rojo.

Dos candados **cambiaron de dirección con nota fechada y su CONTROL** en
`reebok-depurador.test.ts`: el filtro de piezas (`filtrarSinPiezas`, que ahora también
se aplica al despacho, donde 0 recibidas significa «no llegó») y el rótulo de la
columna de piezas (`piezasLabel`). Ninguno de los dos protegía lo que cambió.

Verificación por mutación: `scripts/_mutar-candados-despacho-reebok.sh` —
**16 mutaciones y 2 controles, 18 de 18 como se esperaba.**

Medición: `scripts/_medir-despacho-reebok.ts` (solo lectura, recibe los .xlsx por
argumento).

---

## 🔴 LAS CATEGORÍAS DEL CATÁLOGO REEBOK SE ADMINISTRAN, NO SE PROGRAMAN (17-sep-2026)

Preguntado *«¿las categorías del catálogo Reebok las vuelvo administrables? Hoy
viven en el código, por eso el botón «Agregarlas al catálogo» no se pudo hacer —
no hay a dónde llevarte. Cada vez que Reebok traiga una categoría nueva hay que
tocar código»*, Daniel contestó: **«sí»**.

⚠️ La recomendación había sido dejarlo en el código (son pocas al año). **Él dijo
que sí igual, y manda él.** Esa discusión está cerrada.

### 🩸 Qué pasaba

El mapa `rubro de Switch → categoría del catálogo` vivía en el código, y no en un
lugar: en **DOS listas** que había que acordarse de tocar juntas.

| Lista | Archivo | Para qué |
|---|---|---|
| `CATEGORIA_POR_RUBRO` | `src/lib/reebok-clasificacion.ts` | clasifica el producto |
| `REEBOK_CATEGORY_ESPERADAS` | `src/lib/depurador/reebok.ts` | decide si el aviso de Plantilla Switch grita o se calla |

Un candado comparaba las dos — **que es exactamente la confesión de que el espejo
estaba mal**. Y ya había cobrado: el 2-sep-2026 `HEADWEAR` entró en una sola y
**cada archivo de Reebok con gorras avisaba «valor inesperado» sobre un dato
perfectamente bueno**.

El 17-sep el despacho de ropa trajo **cuatro rubros que el catálogo no conoce**
—`T-SHIRTS`, `TOPS`, `BRA`, `JACKETS`— y el aviso marcaba **30 de 75 artículos**
sin ninguna pantalla a la que llevar a nadie. El botón solo podía decir «Copiar
las categorías», y su comentario en el código lo admitía: *«un botón
"Agregarlas al catálogo" sería un botón que promete algo que no pasa»*.

### Lo que se hizo

La tabla **`reebok_rubro_categoria`** (migración `20261205120000`), con su
pantalla en **Catálogos › Reebok › Categorías del catálogo**. Las dos listas leen
de ahí.

### 🔴 Las cuatro reglas que no se mueven

1. **Falla ABIERTA.** Sin tabla, sin migración o con la base callada se usa
   `CATEGORIA_POR_RUBRO_BASE` —las seis reglas de siempre— y el catálogo
   clasifica exactamente igual que ayer. `leerMapaDeRubros` **nunca lanza**; el
   `GET` sin la migración contesta **200** con esos seis. Un problema de base no
   puede dejar un producto sin cajón: el cajón neutro es lo que cambia el bulto
   de 12 a 6, y eso es plata.
2. **`CategoriaReebok` sigue CERRADO en el código**: calzado · ropa · accesorios.
   Lo que se administra es **a cuál de las tres va cada rubro**, no inventar
   categorías. Lo hacen cumplir el validador, la ruta y un **CHECK en la tabla**.
   Una categoría nueva cambia pantallas, filtros y el bulto: eso no sale de una
   casilla.
3. **La MARCA sigue mandando primero.** `categoriaReebok` mira el `Department`
   de Switch ANTES que el rubro; el rubro es el plan B de una marca vacía.
   Ninguna fila de la tabla mueve ese orden — hay caso que lo prueba con una
   tabla «traviesa» que manda `SHOES` a ropa y no consigue contradecir un
   `Department = FOOTWEAR`.
4. **`null` sigue siendo «no sé», nunca «otros»**, y un «no sé» **no pisa** lo
   que ya está clasificado. Quitar una fila no manda ningún producto vivo al
   cajón neutro.

### Cómo viaja el mapa sin ensuciar el módulo puro

`categoriaReebok` y `clasificacionDeArticulo` reciben el mapa **por argumento**,
con la red del código como valor por defecto. Siguen siendo **puras**: no
consultan nada. Quien lee la tabla es `reebok-rubros-server.ts`, con **import
dinámico** de `supabase-server` — por la misma razón que `cargarFichas`:
importar ese módulo nunca puede construir un cliente de Supabase.

### El espejo murió

`REEBOK_CATEGORY_ESPERADAS` ya no se escribe: **se DERIVA** con
`rubrosQueElCatalogoConoce()`. El candado viejo
(`depurador-reebok-clasificacion.test.ts`) **cambió de dirección con nota
fechada**: ya no compara dos listas —comparar una lista consigo misma no protege
nada— sino que exige que exista **UNA sola fuente** y que nadie escriba la
segunda a mano, con un barrido que pone el build ROJO si vuelve el arreglo
literal. Lleva su **CONTROL**: sin el rubro en el mapa, el aviso SÍ salta.

### La pantalla

- **Solo admin** (`RUBROS_ROLES_ESCRITURA`), con guard SSR. Leer es de admin +
  secretaria, que es el par de Plantilla Switch: el aviso necesita la lista.
  Escribir no se derivó de `CATALOGO_ADMIN_ROLES` a propósito — cambiar este
  mapa mueve el cajón de un producto y, con él, el bulto que se le cobra.
- **Soft delete firmado, NUNCA `DELETE`** (quién y cuándo, con CHECK que lo
  exige), único **entre activas**, RLS `service_role`, sin `DELETE` en el GRANT.
  Mismo patrón que `guias_destino_lista` y `comision_exclusion`.
- El rubro se guarda **en MAYÚSCULAS y sin espacios de más**, que es como llega
  de Switch (`U()`), y se compara por **igualdad exacta normalizada, NUNCA por
  parecido**: «T-Shirts» es el mismo que «T-SHIRTS»; «T-SHIRT» en singular **no**.
- Es de **Reebok y de nadie más**: cualquier otra marca cae en 404. Cada marca
  clasifica distinto —Tommy y Calvin sacan el género de la DESCRIPCIÓN— así que
  una pantalla compartida sería el mismo error que un mapa compartido. ⚠️ El
  enlace desde «Administrar» se pregunta **al TEMA** (`admin.rutaCategorias`),
  nunca por el nombre de la marca: lo exige `catalogo-admin-una-lista`.
- Las seis semilla se editan como cualquier otra: **no hay filas intocables**.

### Y el botón que quedó a medias

«Copiar las categorías» pasa a **«Agregarlas al catálogo»** y lleva a la pantalla
con los rubros del archivo listos para confirmar (`?agregar=T-SHIRTS,TOPS,…`).

⚠️ **El enlace NO guarda nada**: solo llena el formulario. Del otro lado hay que
elegir a qué cajón va cada rubro y tocar el botón. Una dirección que escribe en
la base es una dirección que cualquiera dispara sin querer. Se abre en otra
pestaña porque el archivo cargado vive en la memoria de esa pantalla.

### 📏 Medido contra producción (17-sep-2026)

`scripts/_medir-categorias-reebok.mjs` (solo lectura; la semilla la **lee del
.sql**, no la teclea — un tercer lugar donde copiarla sería estrenar el mismo
espejo):

| | |
|---|---|
| `switch_articulo_info` · `active_shoes` | **1.763** artículos, los 1.763 con ficha traída |
| Semilla de la migración vs mapa del código | **idénticas** |
| **Artículos que cambian de categoría** | 🔴 **0 de 1.763** |

🔑 **Y una cosa que conviene saber antes de tocar este mapa: hoy está DORMIDO en
producción.** De los 1.763 artículos, **0 traen el `Department` vacío**, así que
los 1.750 clasificados salen todos por el camino de la MARCA y el mapa del rubro
—el que se volvió tabla— no llega a consultarse ni una vez. Es el plan B, y por
eso agregarle un rubro **no mueve ningún cajón hoy**.

**Agregando `T-SHIRTS` · `TOPS` · `BRA` · `JACKETS`:**

| | Antes | Después |
|---|---|---|
| Artículos de `active_shoes` que cambian de cajón | — | **0** (ninguno trae hoy esos rubros) |
| Ámbar del despacho real (`reebok-despacho-ropa-columnas-nuevas.xlsx`, 75 artículos) | **30 productos**, 4 categorías | **0** |
| Ámbar del despacho chico (`reebok-despacho-nuevo-ropa.xlsx`, 5 artículos) | **2 productos**, 2 categorías | **0** |
| Ámbar del despacho de calzado | 0 | 0 |

O sea: **lo que se gana es que el aviso deje de gritar sobre datos buenos** —el
40 % de la lista en ámbar sin nada que hacer— y que el día que un artículo llegue
con el `Department` vacío el plan B lo sepa traducir. La clasificación de hoy no
se toca, que es justo lo que se quería probar.

Medición del aviso: `scripts/_medir-aviso-categorias-reebok.ts`, sobre los
archivos reales que ya están en `src/__tests__/fixtures/`.

**Candado:** `src/__tests__/lib/catalogo-reebok-rubros.test.ts` (46 casos).
**Verificado por mutación: 19 mutaciones + 2 controles, 21 de 21 cazadas**
(`bash scripts/_mutar-candados-reebok-rubros.sh`) — la lista vacía deja de caer a
la red · el servidor deja de fallar abierto · el GET sin migración deja de servir
los seis · la semilla manda SOCKS a accesorios · la semilla se olvida HEADWEAR ·
el CHECK deja de cerrar las tres · el validador acepta una categoría inventada ·
el rubro le gana a la marca · vuelve la lista escrita a mano · `valoresInesperados`
ignora la lista que recibe · el repetido se caza por parecido · el rubro se guarda
sin normalizar · quitar pasa a ser un DELETE · la baja deja de firmarse · escribir
se le abre a la secretaria · la pantalla deja de rebotar · el botón deja de llevar
a la pantalla · el sync deja de pasar el mapa · la tabla sale del respaldo.

⚠️ **La migración quedó ESCRITA, sin correr.** La aplica Daniel:
`npm run migrar supabase/migrations/20261205120000_reebok_rubro_categoria.sql`.
Hasta entonces todo se comporta como antes, por la falla abierta.

---

## 🔴 LOS OCHO NÚMEROS DEL HUB LOS SUMA LA BASE — 462,8 KB → 181 BYTES (14-sep-2026)

Daniel, textual: *«5. ok va»*.

### 🩸 Qué pasaba

El hub `/catalogos/marcas` dibuja cuatro tarjetas que dicen «182 productos a la
venta · 12 sin foto». Para escribir esos **ocho números**, el navegador se
descargaba el **catálogo entero de las cuatro marcas**. Medido contra producción
el 14-sep-2026:

| Marca   | Productos bajados | Peso |
|---------|------------------:|-----:|
| Tommy   | 477 | 227,4 KB |
| Reebok  | 232 | 107,9 KB |
| Calvin  |  83 |  39,8 KB |
| Joybees |  81 |  38,2 KB |
| `inventory` de Reebok | 391 filas | 49,5 KB |
| **TOTAL** | | **462,8 KB** |

Nombre, precio, color, descripción y fechas viajaban para tirarse después de
contar. Sentry medía **24.384 ms de p95** en esa ruta.

### 🔴 El riesgo del cambio, y cómo se cerró

Contar en la base pide escribir «a la venta» en SQL — y **una segunda definición
de la misma regla es exactamente cómo el hub y el catálogo terminaron diciendo
232 contra 182** en septiembre (ver `lib/catalogo/a-la-venta.ts`).

La salida fue **no escribir ese SQL a mano**:

1. **El SQL se GENERA** desde `src/lib/catalogo/contadores.ts`, cláusula por
   cláusula de `estaALaVenta`, con cada `or` pegado al `return true` que copia.
2. **La migración es la salida impresa** de ese módulo
   (`npx tsx scripts/_generar-migracion-contadores.ts`), y el candado la compara
   **byte a byte**: editarla a mano pone el build ROJO.
3. **El candado cuenta las cláusulas**: si `estaALaVenta` gana un `return true`
   y el SQL no gana su `or`, el build se pone ROJO.
4. **El camino de respaldo cuenta con `productosALaVenta`**, la función de
   verdad, con un barrido que prohíbe escribir una condición propia adentro.
5. **Y se comparan sobre datos reales**: `scripts/_verif-contadores-hub.ts` corre
   los dos caminos contra producción y compara los ocho números uno por uno.

La regla de «sin foto» vivía suelta dentro de un `.filter()` del hub; se sacó a
`sinFoto()` para que la base pudiera copiarla de un lugar que exista.

### ⚠️ Las cuatro tablas NO son simétricas

Medido contra `information_schema.columns`:

| Tabla | Columnas de stock | `is_regalia` |
|---|---|---|
| `products` (Reebok) | `disponibilidad` · `existencia` — **sin `stock`**; su existencia por talla se suma desde `inventory` | no |
| `joybees_products` | `disponibilidad` · `existencia` · `stock` | **sí** |
| `tommy_products` | `disponibilidad` · `existencia` · `stock` | no |
| `calvin_products` | `disponibilidad` · `existencia` · `stock` | no |

El **orden** de las columnas en el `coalesce` no es decorativo: es el orden en
que `disponibleVendible` las prueba, y el primero que no sea nulo gana.

### 🔴 Falla ABIERTA

`/api/catalogo/contadores` intenta la función `catalogos_contadores_hub()`; ante
**cualquier** problema (empezando por que la migración no esté aplicada) cuenta
leyendo las filas con la regla de siempre. El hub no ve la diferencia y el
navegador igual recibe menos de 1 KB. Ninguna pantalla en blanco.

⚠️ **Ninguna ruta vieja cambió.** `/api/catalogo/[marca]/products` y
`/api/catalogo/reebok/inventory` conservan forma y permisos: los usan el catálogo
del vendedor y la pantalla de administrar.

### Medido antes y después (solo lectura)

| Marca | A la venta (antes → después) | Sin foto (antes → después) |
|---|---|---|
| Reebok | 178 → **178** | 0 → **0** |
| Joybees | 81 → **81** | 0 → **0** |
| Tommy | 453 → **453** | 0 → **0** |
| Calvin | 82 → **82** | 0 → **0** |

Hoy los cuatro contadores de foto dan **0** porque todo lo que no tiene foto está
apagado; un 0 contra un 0 no prueba nada, así que la cláusula se comparó aparte
sobre **todas** las filas de cada tabla — **1 · 2 · 8 · 6**, idénticas por los dos
caminos. Un tercer control comprueba que el camino de respaldo, que pide **solo
las columnas que la regla lee**, da lo mismo que pedir todas.

La migración se probó dentro de `begin; … rollback;` contra producción: compila y
devuelve esos mismos ocho números sin dejar nada creado.

**Candado:** `catalogo-contadores-una-regla.test.ts` (22 casos);
**13 mutaciones, 13 cazadas** con 2 controles
(`scripts/_mutar-candados-contadores-hub.sh`).
**Medición:** `scripts/_verif-contadores-hub.ts`.

---

## 🔴 CUATRO ARREGLOS DE CATÁLOGOS — LA EXISTENCIA CONGELADA, LA FOTO DE CALVIN, LA PUERTA ABIERTA Y CUATRO RUTAS SIN DUEÑO (6-sep-2026)

> Cuatro cosas independientes que salieron de una auditoría del módulo. Ninguna
> cambia lo que la persona hace en pantalla; las cuatro tapan un agujero que
> nadie podía ver desde adentro de la app.

### 1 · 🩸 LA EXISTENCIA DE UN PRODUCTO ESCONDIDO SE CONGELABA

**Qué pasaba.** Esconder un producto a mano (`oculto_manual = true`, el toggle
del admin) le pone `active = false`. El motor (`src/lib/switch-api/sync-catalogo.ts`)
arma el conjunto de artículos a los que le pregunta la existencia a Switch como:

    catálogo ACTIVO  ∪  Switch dice disponible ≥ 1

Un escondido **sin disponible en Switch no cae en ninguna de las dos**. O sea:
desde el día que se escondió, **nunca se le volvió a preguntar el número** y su
`stock` quedó clavado ahí para siempre.

🔑 Lo que hace este bug difícil de ver es que el módulo ya había tapado la mitad
del agujero: el bloque **(4b)**, de julio-2026, alinea el PRECIO de todo lo que
queda fuera del `/stock` usando el bulk de `/lista` (que sí trae el precio de
todo el universo). El precio se arreglaba solo; la existencia, no — porque
`/lista` no la trae por bodega.

**Medido contra producción el 6-sep-2026** (cada escondido cruzado contra
`switch_articulo_info` por `(empresa_key, codigo)`):

| marca | escondidos | el catálogo dice | Switch dice | de más | filas que difieren |
|---|---|---|---|---|---|
| Tommy | 16 | **252** | **72** | 180 | 13 de 16 |
| Calvin | 6 | **121** | **49** | 72 | 2 de 6 |
| Reebok | 1 | 90 | 90 | 0 | 0 de 1 |
| Joybees | 2 | 2 | 2 | 0 | 0 de 2 |
| **TOTAL** | **25** | **465** | **213** | **252** | 15 de 25 |

Los peores, uno por uno: Tommy `FW0FW05821DW5` y `T3A932982265` dicen **24
piezas** y Switch dice **0**; Calvin `KCSALYA050` dice **60** contra **0**.
Reebok y Joybees coinciden **hoy y por casualidad** — sus escondidos tienen
disponible en Switch, así que entran por la segunda vía.

**El arreglo.** Los escondidos a mano también entran al conjunto. La regla vive
en UN solo lugar (`ocultosManualSkus`, dentro del motor) y las cuatro marcas la
heredan; hay candado que prohíbe que una marca se haga su copia.

🔴 **ESCONDER SIGUE SIENDO ESCONDER.** Preguntar la existencia **no puede volver
a mostrar** un producto: la visibilidad la decide `esVisibleEnCatalogo`, donde
`oculto_manual = true` gana SIEMPRE. Los 25 escondidos son una decisión
explícita de Daniel y se quedan escondidos. El candado lo exige en las **dos**
direcciones — que al escondido se le pregunte el número, y que su UPDATE siga
saliendo con `active: false` aunque Switch le mande 7 piezas.

**Lo que cuesta** (medido contra `switch_sync_log`, 30 días):

| marca | /stock hoy | escondidos | de más | corrida más lenta (techo 800 s) |
|---|---|---|---|---|
| Tommy | ~463 | +16 | +3,5 % | 218 s |
| Reebok | ~233 | +1 | +0,4 % | 172 s |
| Calvin | ~88 | +6 | +6,8 % | **282 s** |
| Joybees | ~83 | +2 | +2,4 % | 62 s |

⚠️ **Tolerancia intacta:** si la columna `oculto_manual` no existiera (fallback
de lectura pre-migración), el conjunto queda vacío y todo se comporta **como
antes**. Y el fail-closed del sync **no se tocó**: `/lista` con 0 artículos sigue
abortando sin escribir, y un `/stock` que falle sigue tirando la empresa entera
antes de la primera escritura.

⚠️ **El bloque (4b) NO se retiró**: los escondidos a mano ahora salen por su
`continue`, pero sigue cubriendo al producto que se apagó **solo** por llegar a
existencia 0 (ése no tiene el toggle puesto y sigue fuera del `/stock`, a
propósito — el candado tiene un CONTROL que lo exige).

**Candado:** `src/__tests__/lib/catalogo-escondidos-existencia-viva.test.ts` (9,
sobre el motor REAL con un Switch y un Supabase simulados; mira qué `/stock` se
pidieron y qué payloads se escribieron).
**Medición:** `scripts/_medir-catalogo-escondidos-y-fotos.mjs`.

### 2 · 🩸 CALVIN ERA LA ÚNICA MARCA SIN CANDADO DE FOTO

La migración `20260725120000_foto_manual.sql` creó la columna en las **tres**
marcas que existían ese día (Reebok `products`, Joybees, Tommy). **Calvin nació
el 12-ago-2026, dieciocho días después**, y nadie volvió a esa lista. Verificado
contra producción en `information_schema.columns`: `calvin_products` es la única
sin `foto_manual`.

No es cosmético. El código es el MISMO para las cuatro
(`lib/catalogos/variantes-server.ts`, por `cfg.productsTable`), y sin la columna:

- `skusConFotoManual` devuelve el conjunto **vacío** → el ZIP del banco B2B
  **pisa sin avisar** la foto que alguien eligió a mano;
- el manifiesto la cuenta como **«asignada»** en vez de «respetada», así que en
  pantalla parece que todo salió bien.

Medido: **Tommy tiene 30 fotos protegidas** así; **Calvin, 0** — no porque nadie
haya elegido, sino porque no se puede marcar.

**El arreglo es SOLO la migración**, `20261011120000_calvin_foto_manual.sql`
(**pendiente de aplicar**): aditiva, una sola tabla, mismo `default false`, sin
un DROP/DELETE/UPDATE adentro. **El código no cambió y no lo necesita** — ya era
tolerante a que la DDL no haya corrido (`guardarFotoElegida` reintenta sin la
columna; `skusConFotoManual` falla abierto), y el candado exige que siga siéndolo.

**Candado:** `src/__tests__/lib/catalogo-calvin-foto-manual.test.ts` (13).

### 3 · 🩸 LA PANTALLA DE ADMINISTRAR NO COMPROBABA NINGÚN ROL

`src/app/catalogos/admin/[marca]/page.tsx` resolvía la marca y montaba el
componente, y punto. El único guardia era del navegador, y el middleware solo
valida que la sesión **exista** — o sea que cualquiera con sesión (un vendedor,
bodega, David de Boston) abría esa dirección y la pantalla de administrar se le
armaba antes de rebotarlo.

⚠️ **No había fuga de datos:** las rutas que traen la información sí contestan
**403** (`products` PUT/POST, `upload`, `variantes`, el manifiesto del ZIP). Lo
que se cierra es la PUERTA.

Es el mismo hueco que se cerró en Multifashion el mismo día y se aplicó el MISMO
patrón: guard en el SERVIDOR, **antes de resolver la marca y antes de montar el
cliente**, con la lista **derivada** de `CATALOGO_ADMIN_ROLES`
(`puedeAdministrarCatalogo`, en `src/lib/catalogo/roles.ts`) — la misma que ya
protege las rutas de datos, nunca una copia a mano.

🔴 Administrar es **admin y secretaria**. Vendedor, bodega y `gerente_boston`
solo **VEN** el catálogo: a ellos la pantalla de administrar les rebota a
`/home`, y desde ahí cada uno cae en su casa.

**Candado:** `src/__tests__/lib/catalogo-admin-pantalla-cerrada.test.ts` (21) —
de CONDUCTA: llama a la página real, rol por rol y marca por marca, y mira a
dónde manda.

### 4 · 🩸 CUATRO RUTAS SIN UN SOLO LLAMADOR

Verificadas una por una (barrido sobre `src/`, sin contar comentarios) antes de
tocarlas.

🔴 **`POST /api/catalogo/joybees/seed` — la urgente.** Reescribía **precio,
existencia, regalía y visibilidad** de los productos de Joybees desde una lista
**escrita a mano dentro del código** (`src/lib/joybees-seed.ts`, 82 SKUs y
**10.065 piezas inventadas**, precios de $0 a $14). Producción tiene **83
productos, 8.927 piezas, 6 regalías y 2 escondidos a mano**: correrla habría
pisado los precios que manda Switch, reemplazado la existencia real por la de la
lista y, con su `active: true`, **vuelto a mostrar los 2 escondidos**. No tenía
botón en ninguna pantalla — la disparaba cualquier admin o secretaria que
supiera la dirección. Con la ruta se fue la lista, que no tenía otro consumidor.

**`GET /api/catalogo/[marca]/pedidos-unificado`** — la lista VIEJA de
administrar, reemplazada el 25-ago-2026 por `/catalogo/<marca>/pedidos`. Además
**calcula mal la plata**: hasta **$680 de diferencia en un solo pedido**, porque
no pasa las piezas por el bulto (el defecto ya documentado en
`src/lib/catalogo/fila-comprobante.ts`).

**`GET /api/catalogo/reebok/stats`** y **`POST /api/catalogo/reebok/inventory/bulk`**.

🔴 **Las TABLAS no se tocaron** — patrón de la casa (`mayor_lineas`,
`cxc_favorites`): se retiran RUTAS, y solo rutas. ⚠️ Y siguen vivas
`reebok/inventory` (sin `/bulk`), `joybees/import`, `pedidos-export` y `orders`;
las vistas `<marca>_pedidos_unificado_vw` tampoco se tocaron, porque
`pedidos-export` las sigue leyendo.

**Candados que cambiaron de dirección, con nota fechada y ninguno borrado:**
`catalogo-superficie.test.ts` (el snapshot de la superficie API baja de 4 rutas),
`require-admin-no-miente.test.ts` (de **10 a 9** rutas con `requireAdminOSecretaria`
— baja **a propósito**: no se apagó un permiso, se fue la ruta entera),
`bodega-ve-pedidos`, `boston-ve-catalogo`, `pedidos-link-flujo-vendedor` y
`catalogo-paridad-listas` (cada uno pierde el paso de `pedidos-unificado` y gana
la nota; el bloque de `pedidos-export` no se tocó) y `supabase-paginado`.
**Candado nuevo:** `src/__tests__/lib/rutas-de-catalogo-retiradas.test.ts` (9) —
exige las dos mitades: que el archivo no exista **y** que nadie las vuelva a
llamar desde `src/`, con CONTROL de que las rutas vecinas siguen ahí.

### Verificado por mutación

**25 mutaciones, 25 cazadas**, con **2 CONTROLES en verde**
(`bash scripts/_mutar-candados-catalogo-4-arreglos.sh`): el conjunto vuelve a ser
el de antes · el conjunto de escondidos se queda vacío · **el escondido se vuelve
a mostrar al actualizarle la existencia** · la visibilidad la decide la
existencia · el conjunto se abre a TODO · se pierde la tolerancia · se pregunta y
no se escribe · la migración deja a Calvin afuera · la columna nace en `true` ·
la migración toca filas · se pierde la tolerancia a la DDL en las dos funciones ·
las fotos protegidas se leen siempre de Tommy · **la pantalla vuelve a no
comprobar el rol** · el guard corre después de dibujar · la lista se escribe a
mano y entra el vendedor · la función se hace su propia lista y entra bodega ·
sin sesión ya no se manda al login · administrar sale de quien ve el catálogo ·
**vuelven las cuatro rutas, una por una** · vuelve la lista escrita a mano de
Joybees · una pantalla vuelve a llamar a `/pedidos-unificado`.

---

## 🔴 Pedidos — LOS VIEJOS NO SE BORRAN; LA LISTA MUESTRA 90 DÍAS Y LA BASURA DE PRUEBAS SÍ SE VA (4-sep-2026)

> **La pregunta de Daniel, textual:** *«si un pedido se mandó a switch, ya está safe, no?»*
> Y sobre lo otro: *«borro de verdad de la base»*.

Son dos preguntas que parecen una y tienen respuestas opuestas.

### 1. Un pedido viejo NO se borra. La respuesta es NO, por dos razones medidas.

**a) El pedido guarda lo que Switch no tiene.** Que el documento haya llegado al ERP no
significa que el pedido sea desechable: en `<marca>_orders` viven **quién lo armó**
(`vendor_name`), **el comentario** (`comment`), **si salió como pedido o como cotización**
(el envío activo en `<marca>_switch_envios.documento`), **el correo al que se le mandó**
(`client_email`) y el PDF que se generó desde ahí. Switch guarda el documento; no guarda
cómo se llegó a él. Borrar la fila es perder la única copia de eso.

**b) Son POCOS.** Medido contra producción el 4-sep-2026, pedidos internos creados en todo
2026: **23 Reebok · 38 Tommy · 21 Calvin · 41 Joybees**. No hay un problema de volumen que
borrar resuelva — 123 filas en cuatro tablas no le pesan a nadie.

Lo que sí pesaba es **la LISTA**: la pantalla de Comprobantes abría con el año entero, así
que había que buscar antes de ver. Se recorta la lista, no los datos:

- **Los últimos 90 días** se muestran; el resto queda detrás de **«Ver más (N)»** al pie.
- 🔴 **Sin texto explicativo al lado del botón.** Daniel: *«no me gustan tantas palabras
  extras»*. El botón dice lo que hace; el número es lo único que la persona no puede ver
  por sí misma.
- El corte va **DESPUÉS** del filtro y de la búsqueda, así que «Ver más» siempre trae lo que
  falta **de lo que se está mirando ahora**. Y la selección masiva solo alcanza lo visible:
  lo que la ventana escondió no se puede borrar por accidente.
- 🔴 **El corte es por FECHA, no por cantidad.** «Los últimos 90 días» es una pregunta que la
  persona puede contestar sin contar («¿esto es de este trimestre?»); «los últimos 20» no lo
  es, y además cambia de significado según cuánto se haya vendido.
- Una fecha ilegible **se muestra**: esconder un comprobante por un dato roto es peor que
  mostrarlo de más.
- Definición única en **`src/lib/catalogo/comprobantes-ventana.ts`**, módulo PURO que recibe
  el «ahora» por parámetro — un candado con `new Date()` adentro no podría medirlo.

**Candado:** `src/__tests__/lib/comprobantes-ventana-90-dias.test.ts` (12 casos: el borde de
los 90 días, que recientes + viejos sean SIEMPRE la lista entera, la fecha ilegible, que los
grupos por mes se armen sobre lo visible y no sobre `filtered`, y que el botón vaya solo).

🩸 **Un gotcha que este cambio dejó en los candados de conducta.** El fixture de
`pedidos-chips-y-verdad-de-la-fila.test.tsx` está calcado de producción **con sus fechas
reales** (mayo a agosto de 2026), así que a medida que pasa el tiempo se va cayendo fuera de
la ventana y las filas dejan de estar montadas. La solución es **tocar «Ver más»** —lo mismo
que haría una persona— y no congelar el reloj: así el candado mide la pantalla de verdad y
no envejece.

### 2. La basura de las PRUEBAS sí se borra, de verdad, y una sola vez.

Otra cosa distinta son las corridas de verificación de agosto: **16 pedidos en
`calvin_orders` y 37 en `joybees_orders`**, todos ya marcados `deleted = true`, todos en
estado `borrador`, con nombres «PRUEBA T143/T169/T173 — BORRAR» y «PRUEBA-BOT» o creados por
el usuario `medicion` para medir el flujo del checkout. Eso no es un dato del negocio: es
basura, y Daniel la pidió fuera por su nombre.

Va por migración — **`supabase/migrations/20260924120000_borrar_pedidos_de_prueba.sql`**,
que **no se aplicó**: la corre Daniel. Trae sus frenos adentro, no en la medición que la
precedió:

1. 🔴 **Lista EXPLÍCITA de ids.** Nada de `WHERE client_name LIKE '%PRUEBA%'`, que mañana
   engancharía un pedido de verdad de un cliente que se llame así.
2. 🔴 **El que tenga un envío VIVO a Switch se saca de la lista y no se toca** (`EXISTS`
   contra `<marca>_switch_envios` con `estado <> 'error'` — el mismo criterio del índice
   parcial único del at-most-once). Medido el 4-sep-2026: `calvin_switch_envios` tiene 3
   filas y `joybees_switch_envios` 4, y **ninguna** apunta a los 53 ids de la lista, o sea
   que **cero pedidos se salvan por esta vía hoy**. El filtro está igual: si alguno ganara un
   envío entre que se escribe la migración y que se aplica, se salva solo.
3. **Segundo freno:** solo se borra lo que ya estaba `deleted IS TRUE`.
4. Se borran también sus renglones (`<marca>_order_items`: 16 de Calvin, 45 de Joybees),
   explícitamente y no solo por el `ON DELETE CASCADE`.
5. Todo o nada (`BEGIN` / `COMMIT`), y no toca ninguna otra tabla — ni Reebok, ni Tommy, ni
   los pedidos del link.

⚠️ Quedan a propósito dos filas de `joybees_pedidos_publicos` (`jz3tcmm2` y `wsui927p`, del
bot del 24-jul) cuyo `ped_order_number` apunta a JBP-004 / JBP-005. Las dos están ya
borradas (`deleted = true`), así que ninguna pantalla las mira; borrar filas que Daniel no
pidió borrar sería pasarse del encargo.

🔴 **Esto es un borrado REAL y no se deshace. Es la excepción, no la regla:** la casa borra
suave (`deleted`) y conserva las tablas aunque se queden sin lectores (`mayor_lineas`,
`cxc_favorites`). Se borra acá porque lo que se va no es un dato del negocio.

**Candado:** `src/__tests__/lib/borrar-pedidos-de-prueba.test.ts` (15 casos: que la lista sea
de ids y tenga exactamente 16 y 37, que el filtro del envío exista y corra ANTES de los dos
`DELETE`, que no haya `LIKE` ni criterio por nombre/fecha, y que la migración no toque
ninguna otra tabla).

**Verificado por mutación:** las cinco mutaciones de esta migración —quitarle el filtro del
envío en Calvin, quitárselo en Joybees, cambiar la lista por un `LIKE`, perder el
`deleted IS TRUE` y llevarse por delante los pedidos del link— **caen las cinco**
(`scripts/_mutar-limpieza-ventas.py`).

---

## 🔴 COMPROBANTES — LA LISTA QUE SE LEE, Y LOS TRES ARREGLOS DEL DETALLE (6-sep-2026)

> Diez cambios aprobados por Daniel uno por uno. Todo medido contra producción el
> **7-sep-2026: 56 comprobantes vivos** — Tommy 32 · Reebok 15 · Calvin 5 ·
> Joybees 4.

### 1 · Los dos filtros tenían dos aspectos distintos, y uno de ellos mentía

Arriba una barra de **pestañas subrayadas** (`Todos (20) · Del link (6) · Míos
(14)`) y abajo **píldoras** (`Pedidos 18 · Cotizaciones 0 · Borradores 2`). Son
dos preguntas del mismo rango —**quién lo armó** y **qué es**—, así que van con
el mismo aspecto: dos grupos de píldoras, cada uno con su rótulo chico. El
subrayado en este sistema es el aspecto de la NAVEGACIÓN, y ahí no se navega a
ningún lado.

🔴 **Lo que está en CERO no aparece.** «Cotizaciones 0» ocupaba un lugar para
decir que no hay nada. La ÚNICA excepción es el chip activo: esconderlo dejaría
la pantalla sin ningún chip encendido y sin forma de volver (el filtro por tipo
está SIEMPRE puesto — no hay «Todos»).

### 2 · 🔴 «Del cliente» y «Del vendedor»

> Daniel, textual: *«no me gusta la palabra del link y míos, no suena
> profesional»* y, confirmando: *«cambia los nombres a cliente y vendedor»*.

🔑 **Antes de ponerle nombre se verificó QUÉ FILTRA CADA UNO.** «Míos» **no era
del usuario que entró**: el origen se decide en `fila-comprobante.ts` con una
sola línea —`o.del_link === true || fuente === "publicos" ? "link" : "mio"`— y
ahí no aparece la sesión por ningún lado. O sea que «Míos» quería decir «los que
armó alguien de la casa», y con Angela mirando la pantalla le decía «míos» a los
pedidos de Reinaldo. **Medido en Tommy: las 32 filas son «Míos» y las armaron
TRES personas** (REINALDO ESPINOSA 28 · daniel 2 · rey 2).

Por eso los nombres describen de dónde VINO el pedido, no de quién es. Los dos
textos viven en UN lugar (`origen-comprobante.ts`) porque los leen el chip **y**
la etiqueta de la fila. ⚠️ El Excel de la pantalla sigue escribiendo «Del link» /
«Mío» en su columna Origen: tiene su propio candado y su propia decisión.

### 3 · 🔴 El PDF sale a la fila; «Eliminar» se va al «···»

La fila ofrecía `Editar · Duplicar · Eliminar` y **«Eliminar» era el más a la
vista** —rojo, al final, del mismo tamaño—, mientras que el PDF, el correo y el
vendedor solo existían ADENTRO del pedido. Se invirtió: **«Ver PDF»** sale a la
fila y `Editar · Duplicar · Reenviar el correo · Eliminar` pasan al `OverflowMenu`
de la casa (el mismo de Guías, Préstamos y Caja).

🩸 **En iOS la descarga se pierde si hay un `await` de red en el medio.** El PDF
necesita los renglones, que no viajan en la fila: **la lectura arranca en el
`pointerdown`**, como resolvió Guías, y la promesa se guarda por id (pasar el
dedo por encima no dispara dos lecturas).

⚠️ **«Duplicar» solo se dibuja donde el servidor lo permite.** Salía en las 56
filas y solo funciona en las que YA están en Switch: `duplicar-pedido.ts` exige
un envío activo y contesta **409 «Este pedido no está en Switch»** a las otras.

### 4 · 🔴 Los que no llegaron a Switch se notan

La fila **sí lo decía** (`TEXTO_NO_ENVIADO`), pero en gris chiquito, con el mismo
peso que todo lo demás, sin días y sin forma de filtrarlos. Medido: **7 de 56 no
han salido, y DOS están CONFIRMADOS**:

| | | | |
|---|---|---|---|
| PED-004 | Reebok · CITY MALL PASO CANOA | $420,00 | hace 65 d |
| CKP-020 | Calvin · HJsn | $1.284,00 | hace 23 d |

Los dos se trabaron por lo mismo: no tienen cliente de Switch elegido, así que el
botón de mandar les contesta «falta elegir el cliente» y ahí quedan. Los otros 5
son **borradores** (1 Reebok · 3 Tommy · 1 Calvin) y no entran: un borrador
todavía no es un pedido, y **un aviso que exagera se aprende a ignorar**.

Chip **«Sin mandar (2)»** que filtra, y la frase de la fila **en rojo con los
días** («Sin mandar a Switch · hace 65 días»), contados con el día de **PANAMÁ**.
🔴 **No es un cuarto balde**: `sin_mandar` vive FUERA de `FILTROS_COMPROBANTE`
—es un subconjunto de «Pedidos»— así que la partición de los tres sigue exigida
tal cual por su candado de siempre.

### 5 · 🔴 El pedido del link que nadie confirmó se va a los 30 días

Medido: **6 pedidos del link llevan meses sin confirmar, $31.620,00**, entre 48 y
62 días (5 son pruebas de Daniel en Reebok; uno es real: **CITY MALL PASO CANOAS,
Joybees, $3.264 del 21-jul**). A los 30 días salen de la lista y quedan detrás de
**«Ver más»**, sin texto explicativo.

🔴 **No se borra nada, y no se estrenó un mecanismo**: es la MISMA
`partirPorVentana` de los 90 días, que ahora acepta un plazo por fila
(`diasDeVentana`). ⚠️ El que el cliente SÍ confirmó se queda con sus 90 días: eso
es trabajo esperando, no un carrito abandonado.

### 6 · 🩸 Joybees abría con la pantalla vacía

La lista abría el mes del CALENDARIO. Joybees no vende todos los meses —su pedido
más nuevo es del **24-ago**— y en septiembre la pantalla mostraba **tres
encabezados de mes y CERO filas**. Ahora abre el **mes más reciente CON
comprobantes**, que en una lista por fecha desc es siempre el primer grupo.

Y el encabezado decía **«Julio De 2026»**: la `D` mayúscula venía de la clase
`capitalize` de CSS, que capitaliza CADA palabra. Se capitaliza solo la primera
letra, y en el TEXTO, no en el estilo.

### 7 · 🔴 Los chips cuentan lo que se está mirando

Contaban sobre todo el listado, sin importar el filtro de origen ni la ventana.
Hoy casi no se nota; **en octubre sí**: los pedidos de julio caen fuera de los 90
días y el chip diría 20 donde la lista muestra 5.

🔑 **El universo de cada grupo es «todo menos su propia pregunta»**: el conteo de
«Cotizaciones» se calcula sobre las filas que pasan el origen, la búsqueda y la
ventana, pero NO el filtro por tipo. Contarlo con el tipo ya aplicado dejaría
todos los chips en 0 menos el encendido, que es como no decir nada.

### 8 · 🔴 Ficha en vez de tabla por debajo de 1024 px

La tabla pide ~660 px y el iPad acostado le da 512: lo que se cortaba era justo
**la tira de acciones**, y los tres botones medían **27 px de alto** contra los 44
que este sistema exige. Es el mismo arreglo de Guías y del CXC. De `lg` para
arriba la tabla se queda igual, y los dos dibujos comen de las MISMAS piezas.

### 9 · 🩸 El correo del cliente se tecleaba y se tiraba

**`client_email` está VACÍO en los 56 pedidos vivos** aunque la columna existe
desde el día uno: la pantalla lo pedía, lo mandaba y hacía `setClientEmail("")`.

> Daniel, textual: *«no quiero que sea obligatorio mandar el correo, pero sí que
> sea opcional, ya escrito automáticamente el mail del cliente»*.

Ahora viene **ya escrito** del cliente elegido —`clientes_master.email`, unido por
**CÓDIGO** y nunca por nombre (`correo-del-cliente.ts`, **falla abierta**: sin
correo el campo queda vacío como siempre; medido: 100 de las 150 filas vivas lo
traen)— y **queda guardado en el pedido**.

🔑 **Lo anota el SERVIDOR, en `send-order`, DESPUÉS de que Resend confirma**, y no
con un PUT desde la pantalla, por dos razones: es el patrón del CXC (anotar antes
registraría un correo que nunca salió), y **el PUT de `orders/[id]` cuenta
`client_email` como CONTENIDO y el candado post-envío a Switch lo rechaza con
409** — o sea que en el pedido ya mandado, que es justo el que se le manda al
cliente, no se habría podido guardar nunca. ⚠️ Solo cuando el correo fue al
CLIENTE: el aviso interno va a `daniel@fashiongr.com` y ése no es el correo de
nadie. 🔴 **No se manda solo y no es obligatorio.**

### 10 · 🩸 Al mandar una cotización el aviso decía «Pedido enviado»

El PDF, el nombre del archivo, el adjunto y la lista sí decían «Cotización» (hay
3 reales en Tommy: TOM-027, TOM-030, TOM-031). Ahora el aviso usa la MISMA
palabra, derivada del envío activo con la misma `palabraDelPapel` que arma el
papel. ⚠️ Desde el detalle solo se manda mientras el pedido **no salió** —la caja
«Enviar por email al cliente» vive dentro del bloque que el candado post-envío
esconde—, así que ahí la palabra la decide el `status`, que es exactamente el
caso que estaba mal. Con el pedido ya en Switch se manda desde **«Reenviar el
correo»** de la fila.

### 11 · 🩸 Dos cosas que solo se descubrían con el mouse

- **El nombre del cliente parecía texto fijo y se edita**: su raya era
  `border-transparent` y solo aparecía al pasar el mouse — y en el iPad no hay
  mouse. Ahora la raya punteada está SIEMPRE y se pone sólida al escribir.
- **El encabezado de la tabla del pedido estaba puesto para quedarse fijo y no lo
  hacía.** `overflow-x-auto` convierte la caja en un contenedor de
  desplazamiento (en CSS, fijar un eje pone el otro en `auto`) y un `sticky` se
  pega al contenedor que lo desplaza, no a la página; como la caja no tenía alto,
  no había de dónde pegarse. En el pedido más largo de producción (**TOM-023, 38
  líneas**) los encabezados se perdían y no volvían. Se le dio alto a la caja.

⚠️ **RECHAZADO por Daniel, no se hizo:** el aviso de «este pedido se parece a otro
que ya está en Switch». Textual: *«no, porque se puede duplicar el pedido a
veces»*.

**Candados:** `comprobantes-rediseno.test.ts` (40) ·
`comprobantes-rediseno-pantalla.test.tsx` (27) ·
`pedido-detalle-rediseno.test.tsx` (12) ·
`api/comprobantes-correo-del-cliente.test.ts` (9).
Script de mutación: `scripts/_mutar-candados-comprobantes-rediseno.sh`.

**Candados que cambiaron de DIRECCIÓN con nota fechada, ninguno borrado:**
`comprobantes-ventana-90-dias` (el corte va antes de los dos filtros) ·
`comprobantes-panel` (cuarto chip, 7 columnas, cero no se dibuja) ·
`pedidos-numeros-en-la-lista` (columna Vendedor, la frase en rojo, el «···») ·
`pedidos-chips-y-verdad-de-la-fila` (los tres siguen particionando; el cuarto es
subconjunto) · `pedidos-lista-del-link` y `bodega-solo-mira-comprobantes` (las
acciones se tocan en el «···») · `catalogo-pedidos-ux-arreglos` (idem).

---

## 🔴 Depurador — LA PLANTILLA DE SWITCH ES UNA SOLA, TIENE 25 COLUMNAS, Y AHORA VIVE EN EL REPO (3-sep-2026)

> **Lo que pasaba.** El Depurador (`/productos/cargar`) generaba DOS variantes de 24 columnas (`OUT_COLS_DEFAULT` para Vistana / Fashion Wear / Active Wear / Reebok, `OUT_COLS_SHOES` para Fashion Shoes y Facturas Tienda) y **ninguna coincidía con la plantilla que Switch entrega**, que tiene **25**: la «default» no traía «Composición» (col 21) y las cuatro últimas quedaban corridas; la «shoes» tenía una sola «Costo *» en vez de «Costo FOB *» + «Costo CIF *», así que le faltaba una **obligatoria** y 18 columnas quedaban corridas. Daniel bajó la plantilla de Fashion Shoes y de Multifashion: **idénticas byte a byte** (MD5 `b622f171713642a0393b3c95c7f30de7`, 10.305 bytes), guardadas desde `C:\xampp\htdocs\switch\public\plantillas\` — el archivo fijo de Switch.
>
> **De dónde salió el error — 🩸 los dos cambios se hicieron contra plantillas que hoy no están en el repo:**
> - **27-jun-2026 (Tarea 3, `2a853d26`)**: se quitó «Composición» «a propósito» del header default.
> - **27-jun-2026 (Tarea 5, `310e1d5c`)**: Fashion Shoes recibió su lista propia con la «Costo *» única (= CIF). Facturas Tienda (`0fa27542`) nació sobre esa misma lista.
> - **1-sep-2026 (`f6cd1966`)**: esa columna única pasó de llevar el CIF a llevar el FOB — se cambió el CONTENIDO de una columna que Switch no tiene.
>
> **Las decisiones de Daniel (3-sep-2026), textuales:**
> - *«¿Las otras 4 empresas también descargan este mismo archivo?»* → **«creo que sí, revisa»**. Verificado: se abrió UNA sesión web (Vistana, 22:20 UTC, ventana a ≥15 min de los crons) para sacar la ruta real del enlace «Descargar plantilla modelo» → `/plantillas/productosplantillaimportarpafob.xlsx`. Apache la sirve **sin login**, así que las otras 7 empresas se bajaron sin abrir sesión (cero expulsiones extra). **Las 8 dan el mismo MD5.** Script: `scripts/_bajar-plantilla-articulos-switch.ts`.
> - Fashion Shoes con FOB y CIF separados, CIF = FOB × 1,10 como Vistana → **«sí»**.
> - Multifashion (Facturas Tienda): FOB = CIF = el precio que le factura la empresa del grupo a la tienda → **«mismo número»**.
> - Composición → **«vuelve vacía, no la quiero»**.
> - Tasa de impuesto → **«pon el 0 adelante pues»**: `07` como TEXTO, como dice la guía de Switch (`Flujo_articulo_orden_de_compra_switchsoft2026.pdf`, p. 3). Antes el Depurador escribía `7` y Facturas Tienda `7.00`.
>
> **Lo que quedó:**
> - **`OUT_COLS` (logic.ts) es LA plantilla**: 25 columnas, encabezados exactos (acentos, asteriscos, espacios). `OUT_COLS_DEFAULT`, `OUT_COLS_SHOES` y `outColsForEmpresa` **se retiraron**; `buildAoa` ya no recibe empresa porque las columnas no dependen de ella. Los tres generadores —Depurador CK/TH/KL, `buildTiendaAoa` y `buildSwitchAoa` (Reebok)— escriben la misma fila 1.
> - **Lo que cambia por empresa es el CONTENIDO:** Fashion Shoes FOB 10 → CIF 11 (el cálculo de `processRows`, que nunca cambió); Multifashion FOB = CIF = 12,50; Reebok FOB → CIF × 1,1 como siempre. Composición `""` en los tres. `tasaSwitch()` convierte «7», «7.00», `7` → `"07"` (y `0` → `"0"`, exento); lo que no es número se deja tal cual.
> - **`TEXT_COLS = [0, 1, 2]` no se movió**: es posicional y las tres primeras columnas de la plantilla (Código, Referencia, Código Barra) siguen donde estaban aunque Composición haya vuelto en la 21. Candado explícito.
> - **La plantilla real está en el repo:** `src/__tests__/fixtures/plantilla-switch-articulos.xlsx`. `depurador-plantilla-switch.test.ts` la LEE y exige igualdad posición por posición contra `OUT_COLS` y contra la fila 1 de los tres generadores; si Switch cambia la plantilla, hay que cambiar el fixture a propósito y el test dice qué columna se movió. También fija FOB/CIF por empresa, Composición vacía y la tasa `"07"` (incluido el viaje de escritura+lectura del `.xlsx`: la celda queda `t: "s"`, `v: "07"`).
> - Los candados viejos **cambiaron de dirección** con su nota (`depurador-validate.test.ts` — «24 cols, sin Composición» y el bloque «plantilla por empresa (Tarea 5)»; `reebok-depurador.test.ts` — «24 columnas OUT_COLS_DEFAULT»).
> - **Verificado con Excel reales** (`scripts/_verif-plantilla-switch.ts`: escribe el archivo como la pantalla, lo relee y compara encabezado por encabezado): las 4 empresas del Depurador, Multifashion y Reebok → **25/25 iguales, ninguna distinta**.
> - **Mutación** (`scripts/_mutar-plantilla-switch.sh`): quitar Composición · cambiar un encabezado (tilde) · perder un asterisco · volver a la «Costo *» única · CIF = FOB en Fashion Shoes · Multifashion con flete · Multifashion sin CIF · Composición con texto · tasa «7» · tasa numérica · tienda «7.00» · Reebok tasa cruda · Reebok CIF = FOB → **13 de 13 cazadas, control en verde**.
>
> ⚠️ **Lo que NO se tocó, a propósito:** la plantilla de Switch formatea las columnas 1–13 y 19 como Texto; el sistema sigue forzando a texto solo las 3 primeras y manda Precio/Costos como números — es lo que está «validado al centavo contra plantillas manuales reales» y Switch lo acepta. Cambiarlo es otra decisión.

---

## 🔴 Depurador — LA PANTALLA VALIDA LO QUE SE TECLEA Y NO BORRA EL TRABAJO HECHO (4-sep-2026)

> **El riesgo que esto cierra.** El Depurador es **el único módulo donde un número mal escrito termina DENTRO de Switch** (50-60 corridas/mes: Angela 76 y andrea 42 desde junio). `validarDivisor` existía desde el 27-jul-2026 (el caso `TH Tommy Jeans` con divisor 70), pero **solo corría en las 4 rutas API al guardar fórmulas**: los inputs de divisor de la pantalla (`DepuradorClient.tsx`) no validaban nada. Escribir `70` en vez de `0.70` en el modo global calculaba y **descargaba un Excel con los costos 100× mal**, sin pasar por ningún candado — exactamente la clase de error que motivó el guard, en el único punto donde el número llega al Excel. Y el campo «Tasa» era texto libre: `abc` llegaba tal cual a la columna «Tasa de Impuesto *».
>
> **Lo que quedó:**
> - **El divisor se valida EN LA PANTALLA, reusando `validarDivisor`** (vía `mensajeDivisorEnPantalla`, en `src/lib/depurador/divisor.ts` — el MISMO guard de las rutas, no otra copia de la regla). Fuera de rango: el campo se marca en rojo, sale **«Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?»** (la sugerencia es el valor ÷ 100, solo cuando cae en rango) y **se apaga la DESCARGA, nunca el tecleo** — se puede borrar y corregir sin pelear con el campo. Vale para el input global Y para los de fórmula por marca; **cada modo bloquea solo con SUS divisores** (un 70 en una fórmula por marca no traba el modo global, que no come de ahí). «Aplicar a todo» y el «Guardar fórmula» de la fila también se apagan con el divisor malo.
> - **La tasa pasó de texto libre a una lista de dos.** Daniel, textual: ***«solo existen esas dos»*** — **7%** → `07` (TEXTO, con el cero adelante) y **Exento (0%)** → `0`. `tasaSwitch` **no se tocó** (sigue traduciendo lo que traiga una factura en otros caminos) y `TEXT_COLS = [0, 1, 2]` sigue posicional: la tasa viaja como texto por ser string en el AOA, y hay candado que abre la celda descargada y exige `t: "s"`.
> - 🔴 **Los precios escritos a mano se CONSERVAN.** Antes, cambiar CUALQUIER campo de configuración re-leía el Excel y hacía `setPriceEdits({})`: se perdían todos los precios corregidos a mano. Daniel, textual (respuesta a «¿y si cambias de empresa o de mes?»): ***«y también consérvalos»***. Ahora los edits se guardan por **REFERENCIA de artículo** (`cols["Código *"]`, la llave estable de la fila), **nunca por índice**: al re-procesar se re-pegan solos a su artículo aunque las filas se muevan, y un artículo que salió del archivo conserva su precio por si vuelve (no estorba ni aparece). La pantalla lo dice — «N precios escritos a mano se conservaron» — con el botón **«Borrarlos todos»** (un botón, nunca automático). 🩸 El caso que de verdad importa está mutado: con edits por índice, el precio de un artículo caería en el artículo EQUIVOCADO cuando otro archivo lo corre de fila — y el test lo caza con un archivo B donde el artículo editado cambia de índice.
> - **Año y factor ya no re-procesan en cada tecla**: esperan 300 ms o el blur (`reprocesarLuego` / `reprocesarAlSalir`). Mes y tasa (selects) siguen re-procesando al momento. Cero cambio en el resultado: la misma corrida, disparada menos veces.
> - **La pantalla abre como quedó la última vez.** Empresa, mes, año, tasa, factor, modo de precio y la fórmula global (esta última, COMO QUEDÓ APLICADA — no cada tecla del draft, y un divisor guardado inválido no se revive) se recuerdan por usuario con el patrón de la casa (`useLastUsed` → `fg_last_depurador_*`, sin servidor). El archivo NO se recuerda. «Otro archivo» ya no limpia la empresa: limpiarla era re-elegirla en la corrida siguiente.
> - **CONTROL: con datos válidos el Excel sale IDÉNTICO al de hoy** — mismos 25 encabezados de `OUT_COLS`, mismos valores, mismo FOB/CIF, misma «Composición» vacía. El candado descarga el archivo desde el componente REAL (writeFile capturado), lo relee con la librería de Excel y lo compara celda por celda contra `processRows` + `buildAoa` de siempre.
>
> **Candado: `src/__tests__/lib/depurador-validacion-pantalla.test.tsx` (18).** Monta el `DepuradorClient` real con un Excel de verdad, teclea en los inputs reales y abre el archivo descargado. 🩸 Gotcha de verificación: el caché global de SWR sobrevive entre tests — sin un proveedor propio por render, el catálogo llega ya cacheado en el PRIMER render y el archivo se procesa antes de que la config recordada hidrate (cosa que en producción no pasa: el archivo siempre se suelta después de montar).
> - **Verificado por mutación, 10 de 10 cazadas** (`bash scripts/_mutar-candados-depurador-pantalla.sh`): sin validación en el input global · descarga encendida con divisor malo · por marca sin validar · re-procesar borra los precios a mano · **precios por índice de fila** · tasa como número · tercera opción de tasa · «Borrarlos todos» no borra · la sugerencia divide entre 10 · la tasa deja de recordarse.
>
> ⚠️ **Lo que NO se tocó, a propósito:** el cálculo de precios (`TECHO(CIF ÷ divisor) + extra`), `tasaSwitch`, `fobEstimado`, la plantilla de 25 columnas y su fixture. Y ~~**Reebok y Facturas Tienda tienen sus propios inputs de divisor SIN esta validación de pantalla** — extenderla ahí es otra decisión, con Daniel~~ **superado el mismo 4-sep: Daniel la aprobó para los tres caminos** (ver la sección del rediseño, arriba).

---

## 🔴 Depurador — 3 PESTAÑAS, LA COMPAÑÍA SE RECONOCE Y EL EXCEL SE PUEDE VOLVER A BAJAR 90 DÍAS (4-sep-2026)

> Rediseño de la NAVEGACIÓN del módulo, aprobado por Daniel («Aprobado»), **sin tocar lo que se calcula**: mismos costos, mismo FOB/CIF, misma plantilla de 25 columnas (`OUT_COLS`, candado `depurador-plantilla-switch.test.ts` intacto y en verde).
>
> **1 · De 7 pestañas a 3** (`src/app/productos/cargar/pestanas.ts`, módulo puro): **Plantilla** (vistas *Nuevo* e *Historial*) · **Tallas y catálogo** (*Tallas por bulto* · *Fotos a mi Excel*) · **Configuración** (*Fórmulas* con sus dos ámbitos de siempre · *Descripciones*, solo admin · *Reglas*). Los tres caminos de generación (`DepuradorClient`, `ReebokClient`, `FacturasTiendaClient`) viven dentro de «Plantilla › Nuevo» y **dejan de nombrarse en pantalla**: el dispatcher reconoce el formato (Reebok por sus headers Book4, Facturas Tienda por `detectFactura` o `.csv`, el resto CK/TH/KL). Nada se borró ni se reescribió — los componentes son los mismos, cambia dónde cuelgan. Se conserva el patrón de la casa (`SelectorPestanas` + `DesplegableFlotante`, candado `desplegables-flotan`), la URL `?tab=` (+ `?vista=`), y **todo `?tab=` viejo redirige** a su pestaña nueva (`TAB_VIEJO_A_NUEVO`): un enlace guardado no se rompe.
>
> **2 · La compañía se reconoce, no se elige.** Daniel: *«¿para qué elegir la compañía si la puede detectar?»*. `empresasReconocidas` (logic.ts) la deriva de las MARCAS del archivo vía `empresaDeMarcaCatalogo` (CK → Vistana · TH FOOTWEAR → Fashion Shoes · resto TH → Fashion Wear · KL → Active Wear); si ninguna marca del catálogo opina, cae al destinatario del archivo como antes. El selector «Empresa» se quitó: al soltar el archivo sale UNA línea — **«Vistana International · CK Footwear»** — con el nombre del archivo debajo y un **«cambiar»** discreto que abre las 6 compañías (`COMPANIAS_DEPURADOR`: las 4 destino + Active Shoes + Multifashion). La elegida a mano sigue alimentando lo mismo de siempre (`proveedorParaEmpresa`, la etiqueta al guardar fórmulas, el historial) y **gana hasta que se cargue OTRO archivo** — el re-proceso del mismo archivo no la toca. 🔴 **Un archivo trae una sola marca, así que una sola compañía** (Daniel: «No» a marcas de dos compañías); si aun así llegara uno mixto, **se dice en pantalla y no se adivina** — se elige con «cambiar», nunca se bloquea en silencio. La compañía **ya no se recuerda** en localStorage: la del archivo manda.
>
> **3 · «Temporada», no «Mes» y «Año».** Ese par NO era la fecha de la corrida: arma la columna «Temporada» del Excel (AAAA-MM) y **entra a Switch** — el rótulo engañaba. Queda UN campo `type="month"` rotulado **«Temporada»** con el valor real al lado («Septiembre 2026 → 2026-09»). 🔴 **Arranca SIEMPRE en el mes actual de Panamá** (Daniel: *«la temporada es el mes que se hace el archivo»*; `hoyPanama`, UTC−5, no el reloj del navegador) y **NO se recuerda** — recordarla haría que el 1 de septiembre siguiera diciendo agosto. Tasa, factor y modo de precio SÍ se siguen recordando (`fg_last_depurador_*`); `depurador_mes`/`depurador_anio` salieron del recuerdo. La temporada automática de Reebok también pasó a `hoyPanama`.
>
> **4 · Historial: se puede volver a descargar, 90 días.** Al descargar, **el MISMO Excel que bajó** (los bytes se generan UNA sola vez — escribir dos veces podría diferir porque SheetJS estampa la hora — y el mismo blob va al disco vía `saveAs` y al servidor vía multipart) queda en el bucket privado **`depurador-plantillas`** (migración `20260921120000_carga_history_archivo.sql`, **pendiente de aplicar** — mientras no corra, la fila se registra igual y queda sin botón, sin huérfanos en Storage). 🔴 **SOLO los Excel de Switch** (Daniel: *«el historial solo quiero los excel para switch»*): la plantilla CK/TH, la **Plantilla Switch de Reebok** (que antes ni registraba historial) y Facturas Tienda (que ahora se anota como **«Multifashion»**, su compañía real; el ZIP de +500 filas se guarda como ZIP). El **pedido para cliente** de Reebok (con fotos), Tallas y Fotos a mi Excel **no se guardan**. **90 días** (Daniel: *«que el archivo dure 90 días»*): el cron `cleanup-depurador-archivos` (03:20 UTC, solo DB+Storage, registrado en `SEED_TOLERANT_CRONS` con la biyección de `cron-registro.test.ts`) borra el archivo vencido y 🔴 **la fila con los totales se queda para siempre** — solo pierde el botón. La lista vive en «Plantilla › Historial» con filtro por compañía (Todas + las 6) y columnas Fecha · Quién · Compañía · Marca · Estilos · Unidades · Descargar; **todos ven todo** (Daniel: *«todos»* — Angela baja lo que corrió Andrea). Las ~140 corridas viejas no tienen archivo: gris, sin botón. El bucket **no entra a la réplica R2 a propósito** (archivos generados, re-derivables, con vencimiento).
>
> **5 · El divisor se valida en los TRES caminos.** `mensajeDivisorEnPantalla` (el guard de `9d1eb50e`, cero copias) llegó a `ReebokClient` (fórmulas A/B y borradores por Name) y a `FacturasTiendaClient` (fórmulas por marca): campo rojo, «Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?» y **la descarga apagada, nunca el tecleo**. Cada salida bloquea con SUS divisores: la plantilla Switch de Reebok solo con el Precio elegido; el pedido con A y B (los dos van en el archivo); un borrador por Name no alimenta el Excel hasta guardarse, así que apaga solo SU «Guardar».
>
> **6 · Tallas y Fotos a mi Excel dejan rastro de uso, sin salir en el Historial.** Daniel quiere saber en unas semanas si valen la pena: cada descarga registra `descarga_tallas` / `descarga_misfotos` en **`activity_logs`** (módulo `depurador`), vía `logActivityClient` → `/api/activity` — solo números, nunca el archivo ni las fotos (el candado «no hay un solo fetch» de Fotos a mi Excel sigue en pie: la llamada vive en `logActivityClient`). 🩸 De paso se encontró que **`/api/activity` POST estaba roto desde siempre**: insertaba columnas `user_name` y `module` que `activity_logs` no tiene (las reales son `entity_type` + details) — nunca se notó porque `logActivityClient` no tenía callers. Se arregló espejando `logActivity`.
>
> ⚠️ **Lo que NO se tocó, a propósito — decisión de Daniel:** la **marca desconocida se queda EXACTAMENTE como está**. Daniel, textual: *«Como está»* — se avisa («Marca desconocida: … van a salir sin precio») y **se deja descargar**. No se bloquea, no se cambió el texto, no se cuentan productos sin precio.
>
> **Candados:** `depurador-validacion-pantalla.test.tsx` (25 — extendido: temporada fija con fecha FIJA y sin recuerdo, compañía reconocida/«cambiar»/archivo mixto, el blob del historial ES el descargado, CONTROL con el Excel idéntico) · `depurador-divisor-tres-caminos.test.tsx` (5) · `depurador-pestanas-rediseno.test.ts` (9) · `api/depurador-historial-archivo.test.ts` (7 — bytes byte a byte, 91/89 días, la fila se queda, DDL pendiente = no-op, roles). **Verificado por mutación: 10 de 10 cazadas** (`bash scripts/_mutar-candados-depurador-rediseno.sh`) + las 10/10 del script anterior (`_mutar-candados-depurador-pantalla.sh`) siguen cazando.

---

## 🔴 EL CLIENTE DE SWITCH TAMBIÉN SE ELIGE DE UN SOLO LUGAR (17-ago-2026)

> El #567 dejó **una excepción anotada a propósito**: el checkout del carrito tenía su PROPIA lista de clientes sobre el MISMO universo de Switch que `ClienteSwitchPicker` —el control del detalle del pedido y de "Duplicar"—, con su propia ruta, su propio buscador y su propia forma de resolver el mostrador. Daniel, textual: ***"si unificalo"***.
>
> **Quedó `ClienteSwitchPicker`, y el checkout delega en él.** Dos controles para la misma pregunta se separan solos: el que gana una mejora deja al otro viejo, y acá el otro es el que manda plata a Switch.
>
> ### 🔴 LO QUE **NO** CAMBIÓ: CÓMO SE MANDA UN PEDIDO A SWITCH
>
> Se verificó ANTES de tocar nada, porque era la condición para hacerlo: el cuerpo del POST a `/api/catalogo/checkout` sigue siendo el MISMO `{ cliente: { id, nombre }, vendedor_id, items, idempotency_key }`, con los MISMOS valores. `switch-envio.ts` no cambió, y el **nombre del cliente que viaja a Switch nunca salió de esta pantalla** — `clienteNombre` solo alimenta el `client_name` local y el aviso de Telegram; lo que Switch recibe es el **id**, y el nombre lo lee el servidor del directorio.
> - 🔴 **El mostrador se sigue guardando como `"Contado"` a secas**, no como la etiqueta de pantalla. Es lo que se escribe en `<marca>_orders.client_name` desde el primer día; cambiarlo cambiaría el dato de los pedidos NUEVOS, y eso no es parte de unificar un selector. Constante con nombre: `NOMBRE_CONTADO_GUARDADO`.
> - **Lo único propio que tenía el checkout se MUDÓ, no se reescribió**: convertir lo elegido en `{ id, nombre }` vive en `clienteParaCheckout()` (`lib/catalogo/cliente-elegido.ts`), el módulo que ya definía la regla del cliente elegido.
>
> ### 🩸 QUÉ HACÍA EL DEL CHECKOUT QUE EL OTRO NO — y cómo se conservó
>
> | | checkout (lo que había) | `ClienteSwitchPicker` (lo que quedó) |
> |---|---|---|
> | fuente | `/api/catalogo/switch-clientes?marca=` — el directorio ENTERO, paginado | `/[marca]/clientes-switch?q=` — 20 por búsqueda |
> | filtrar | en el navegador, sobre la lista ya bajada | en el SERVIDOR, con debounce de 300 ms |
> | mostrador | id histórico `1` escrito a mano, pisado con el TCKCTA hallado en la lista | el servidor devuelve el `contado` de la empresa |
> | id sin resolver | **caía al `1`** | devolvía `null` |
>
> 🔴 **La única de esas cuatro que se podía PERDER era la última, y se conservó.** Si el directorio no resuelve el mostrador, `ClienteSwitchPicker` entrega `id: null`; con eso el botón se encendería y el servidor contestaría **400 con el cliente ya elegido en pantalla** — la peor forma de fallar. `clienteParaCheckout` cae al `ID_CONTADO_RESPALDO = 1`: ante la duda se conserva la elección de la persona, nunca se inventa una. Hay candado y mutación para eso.
> - **Lo que se cambió a propósito es el filtrado**: dejó de bajarse el directorio entero (**1.710 filas paginadas por apertura**) para preguntar solo lo que se busca. Menos carga contra una base en compute Micro, y es exactamente lo que ya hacía el detalle.
> - **La ruta paralela `/api/catalogo/switch-clientes` se RETIRÓ**: sin consumidores, era la segunda puerta al mismo directorio. Con ella se fue el mapa `marca → empresa` como punto de fallo — la ruta que queda deriva la empresa de `getMarcaConfig(marca).empresaKey`, así que **el bug de Calvin no puede volver por construcción**, no por un test.
>
> ### 🔴 Lo que NO se puede romper, y sigue intacto
>
> **El cliente arranca VACÍO y el botón apagado diciendo qué falta** (`useState<ClienteSwitchOpcion | undefined>(undefined)`, "Elige el cliente" en ámbar, *"Falta: elegir el cliente"*) · **"Contado (venta de mostrador)" sigue elegible, primero en la lista y con el id REAL de su empresa** (TCKCTA), pero hay que TOCARLO — el selector recibe `valor={cliente}` sin respaldo, así que nada viene marcado · **el candado del SERVIDOR (422 si un pedido interno no tiene cliente) no se tocó** · **el pedido del LINK conserva su texto libre y no sale solo** · el flujo de 3 toques, duplicar sin confirmar y el modo pedido `?agregarA=` · **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok**.
>
> ### Verificación contra producción
>
> **`BASE=… node scripts/_verif-checkout-selector-unico.mjs`** (solo lectura; **aborta en el navegador cualquier POST a `/api/catalogo/checkout`** y nunca toca "Enviar a Switch"). Con una sesión de **`vendedor`**, en las 4 marcas: el checkout arranca sin cliente y con el botón apagado, dibuja el buscador del selector único, el directorio devuelve **20 clientes**, "Contado (venta de mostrador)" aparece **exactamente una vez**, escribir dispara una consulta al SERVIDOR y elegir un cliente saca "elegir el cliente" del *"Falta:"* (queda *"Falta: elegir el vendedor"*, correcto: ese usuario no tiene vendedor mapeado).
> - El mostrador se resuelve con el nombre de SU empresa y el mismo id: `active_shoes` "Contado" · `joystep` "Contado" · `fashion_shoes` **"VENTAS LOCA"** · `vistana` **"VENTAS"**, los cuatro `TCKCTA` id **1** — idéntico a lo medido en el #556.
> - 🩸 **Gotcha de verificación:** exigir que el botón se ENCIENDA al elegir cliente da rojo por nada — al usuario de prueba le falta el vendedor, y eso está bien. Lo que se exige es que el CLIENTE deje de faltar.
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con pedidos REALES** (`BASE=… node scripts/_medir-cliente-pedido-anchos.mjs`, solo lectura, 5 estados): **390 · 834 · 1024 · 1440 → las cajas del cliente dan 0 px de arrastre, 0 recorte, 0 táctil <44 y 0 texto <12 px** en los 20 casos. Con el selector abierto la caja mide **379 px de alto en los cuatro anchos**: crece **hacia abajo** y no ensancha nada. Los tocables <44 px que el script reporta en el resto de la pantalla (`← Catálogo`, el precio por pieza, `← Volver a Pedidos`, los inputs de cantidad, la `x` y `Eliminar pedido`) son los **PRE-EXISTENTES ya medidos idénticos en `origin/main` en el #556**, en código que este cambio no toca.
>
> ### Candados
>
> **`src/__tests__/un-solo-selector-de-cliente.test.ts`** — se **quitó la excepción de `CheckoutClient`**, así que si alguien le devuelve su lista propia el build se pone ROJO. Y el barrido se **EXTENDIÓ por el otro costado**: ahora también vigila **quién puede PEDIR el directorio de clientes de Switch** (`clientes-switch?q=`), que es lo que el detector de selectores no podía ver — solo `ClienteSwitchPicker`, con una lista de excepciones VACÍA, más un test que exige que las tres pantallas de pedido lo dibujen y otro que impide que la ruta paralela vuelva. El detector se prueba con fuentes SINTÉTICAS y distingue LISTAR de preguntar por el cliente de UN pedido (`?orderId=`) o asignarlo (PATCH), que el detalle hace a propósito.
> - **`lib/cliente-elegido.test.ts`** cubre los bordes de `clienteParaCheckout` —incluido que **todo lo que sale de ahí pasa el candado del servidor** (id entero > 0 y nombre no vacío)— y **`components/pedido-cliente-obligatorio.test.tsx`** es el de CONDUCTA: renderiza el checkout REAL, toca los botones REALES y cuenta qué salió por `fetch`.
> - **Verificado por mutación, 7 de 7 cazadas** (`bash scripts/_mutar-candados-selector-switch.sh`): el checkout vuelve a tener su propia lista · el mostrador viaja con el nombre de su empresa en vez de "Contado" · sin id resuelto se manda un id vacío · el mostrador se reconoce por NOMBRE en vez de por código · el nombre puede viajar vacío · el selector vuelve a preseleccionar el mostrador · el mostrador vuelve a aparecer DOS veces.
> - 🩸 **La restauración del script va por COPIA, no por `git checkout`**: hay archivos NUEVOS y BORRADOS en la rama y git aborta el comando entero sin restaurar nada, así que las mutaciones se apilarían y ninguna se probaría por separado.


> 🔴 **UNA línea atada a `111380`, que no es del grupo** (GT-183, "American Classic Store"). Se coló por el backfill de jun-2026 (`20260607131000`), que filtraba `cm.codigo IS NOT NULL` en vez de `LIKE 'D-%'` — y Boston/Multifashion usan códigos numéricos pelados. **No se corrigió automáticamente porque no es inequívoco** si va a NULL o a un D-XXX ("American Classic Store" de Boston vs "American Classics" D-201 del grupo no son obviamente el mismo negocio). Se arregla desde la pantalla: `/guias` → GT-183 → tocar el chip `111380` → elegir o "Quitar".

> **DESPACHAR ES UNA PANTALLA, NO UN ACORDEÓN — y el N° del transportista es POR LÍNEA (10-ago-2026).**
>
> 🩸 **Había DOS caminos para lo mismo dentro de la misma tarjeta.** Al abrir una guía pendiente en `/guias` aparecía un botón "Editar" arriba **y**, más abajo, el formulario de despacho ENTERO desplegado (placa, N° de guía, receptor, cédula, dos canvas de firma y "Confirmar despacho"). Daniel lo vio en **ESCRITORIO** —o sea que nunca fue un problema de pantalla chica— y fue textual: *"mira como me sale editar al hacer clic en por despachar y esta ya aparece el campo para editar, confunde, solo quiero una y en boton de editar para entrar a la guia y terminarla"*. Y sobre el gesto: *"al hacer slide a la izquierda de una guia no despachada da la opcion de despachar, no quiero eso asi"*.
>
> **Ahora:** la lista solo MUESTRA (los envíos, el chip del cliente, "Imprimir" y el menú "···" siguen igual), **un solo botón "Editar"** lleva a **`/guias/[id]`**, y ahí se corrige y se despacha. Desde esa página se sigue llegando a `/guias/[id]/editar` para cambiar los renglones — el camino viejo no se perdió. **Las guías DESPACHADAS no cambiaron en la lista**: Daniel dijo *"me gusta como esta actualmente las de despachados"*.
> - **`SwipeableRow` NO se borró**: `cheques` lo usa para "depositar" y ahí el gesto se queda. Lo que se quitó es la acción `despachoSwipeAction` de guías, que era su único uso en el módulo.
> - **El estado del despacho se MUDÓ de hook.** `useGuiasState` (la lista) perdió placa/receptor/cédula/chofer/firmas/`confirmarDespacho`; viven en `useDespachoGuia` (`/guias/[id]`). Dejarlos en una pantalla que ya no despacha era la mitad del problema de vuelta. El borrador en `localStorage` por guía se conserva, ahora con los N° por línea adentro.
>
> 🔴 **EL N° DE GUÍA DEL TRANSPORTISTA ES POR LÍNEA.** Daniel: *"la info de guia de transp, debe de ser por linea, no por guia porque nos hacen varias guias el transportista por guia"*. La columna `guia_items.numero_guia_transp` **ya existía** (~470 filas pobladas) — **no hace falta ninguna DDL**. Lo que faltaba era pedirla renglón por renglón y, sobre todo, IMPRIMIRLA: los dos papeles (`PrintDocument` y `pdf-guia`) tenían la columna "N GUIA TRANSP." pero pintaban **`g.numero_guia_transp` (el de la cabecera) en TODAS las filas**, así que aunque la línea tuviera el suyo, el papel mostraba el mismo en todas.
> - **Se guarda con `items_guia_transp`, NUNCA mandando `items`.** `items` en el PUT es un **reemplazo completo** (borra e inserta): usarlo en pleno despacho le cambiaría el id a cada línea y tiraría el trabajo de atar clientes. El campo nuevo toca UNA columna, con `.eq("guia_id", id)` — sin eso, el id de cualquier línea del sistema serviría para escribirle encima.
> - **`guia_transporte.numero_guia_transp` NO se retira**: la usan el buscador de la lista, el Excel y el encabezado del papel. Se llena con el **primer** número de línea que haya (`numeroGuiaDeCabecera`).
> - **Una guía VIEJA sale igual que siempre**: si la línea no trae número propio, hereda el de la cabecera (`numeroTranspDeLinea`).
> - **El encabezado del papel solo anuncia un número cuando hay UNO SOLO en toda la guía** (`numeroTranspUnico`). Con varios distintos, poner uno arriba sería una mentira impresa en un documento que alguien firma.
>
> **EL BOTÓN SE APAGA Y DICE QUÉ FALTA.** Antes se podía tocar siempre y contestaba con un toast por vez que se iba solo a los 3 segundos; faltando tres cosas había que tocar tres veces. Ahora `Despachar` va deshabilitado y justo debajo: *"Falta: placa, recibido por y cédula"*. Las reglas viven en el módulo PURO `src/lib/guias/falta-para-despachar.ts`, **las mismas que aplica el servidor** — si difirieran, el botón se pondría verde y el PUT rechazaría igual, que es peor que el botón apagado. ⚠️ **La placa sigue sin ser obligatoria en entrega directa** (ver `guias-placa-entrega-directa.test.ts`) y **una línea sin número no traba el despacho**: lo que el servidor exige es que **al menos una** lo traiga.
>
> **Verificado con una guía de prueba REAL (creada y borrada el 10-ago-2026):** GT-192 con dos líneas, `TR-4471` y `TR-9999`. En la base quedaron distintas (cabecera `TR-4471`), y **los DOS papeles imprimen el de cada línea**: el PDF de compartir (`scripts/_verif-guia-transp-por-linea.ts` + `pdftotext`) y el impreso HTML (`/guias/[id]/imprimir` a PDF). En los dos, el encabezado **omite** "N GUIA TRANSP.:" porque los números difieren. Las dos guías de prueba se borraron (soft delete) y la lista volvió a 177.
>
> **Los 3 anchos, medidos en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… GUIA_PENDIENTE=… GUIA_DESPACHADA=… node scripts/_medir-guias-rediseno.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre de página en las tres pantallas** (lista, lista abierta, página de la guía pendiente y despachada), **0 blancos táctiles bajo 44 px y 0 textos bajo 12 px en la página de la guía**. Y el rediseño **redujo** los recortes que ya había: la lista a 390 pasó de **7 a 1** recortado y la lista abierta de **19 a 1**; a 834, de 21/33 a 15/15 y el peor recorte de **340 px a 190**. Lo que queda es PRE-EXISTENTE y medido idéntico en main: los `truncate` del resumen de la fila (puntos suspensivos = el mecanismo, no un defecto), el input de búsqueda de 39 px de alto en escritorio/iPad y los 8 px del `-mx-2` de los botones de `SignatureCanvas` (9 veces en main, 3 en la página nueva — es el mismo componente, sin tocar).
>
> Candados: `src/__tests__/lib/guias-despacho-una-sola-puerta.test.ts` (la lista no puede volver a despachar ni por swipe ni por formulario, el hook de la lista no puede recuperar estado de despacho, el papel tiene que imprimir el de cada línea, y el "Falta:" del mockup aprobado) y `guias-placa-entrega-directa.test.ts`, que pasó a probar las reglas sobre el módulo puro en vez de sobre los `if` del formulario.


---

> ## 🔴 Depurador — EL PEDIDO DE REEBOK SALE CON LAS FOTOS PEGADAS, Y LAS FOTOS NO SE SUBEN (17-ago-2026)
>
> Hasta hoy Daniel armaba ese Excel **a mano con un macro de VBA**: pegaba los códigos en una columna, corría el macro, elegía una carpeta y el macro le pegaba la foto de cada código al lado. Lo quiere desde el sistema para que su secretaria (Windows) lo use **sin instalar nada**. Para qué es, textual: ***"interno"*** — nadie más lo usa; esos códigos entran a Switch más adelante, hoy todavía no están.
>
> **El flujo:** se carga el Excel del proveedor como siempre → en *Pedido para cliente* aparece **"Fotos del pedido (opcional)"** → se elige la carpeta (selector de carpeta del navegador, `webkitdirectory`) → antes de descargar la pantalla ya dice **"172 de 172 códigos con foto · no falta ninguna"** → el Excel baja con la foto incrustada en la **primera columna**, a la izquierda del código.
>
> ### 🔑 LAS FOTOS NO SE SUBEN A NINGÚN LADO — todo pasa en el navegador
>
> La carpeta real (`OneDrive-FashionGroup/Reebok/Fotos`) son **4.744 .jpg y ~818 MB**. Subirlas sería otro problema —almacenamiento, sincronización, permisos— que nadie pidió. El emparejado, el achicado y el armado del ZIP ocurren **en la máquina de la persona**: en `fotos-carpeta.ts` no hay un solo `fetch`, y el índice de la carpeta se arma **solo con los NOMBRES** (no se lee el contenido de ningún archivo que no empareje con un código del pedido).
>
> ### 🔴 EL EMPAREJADO ES POR NOMBRE EXACTO, SIN MAYÚSCULAS Y NADA MÁS
>
> `100262385` ↔ `100262385.jpg`. No se quitan guiones, no se recorta, no se comparan parecidos ni distancias de edición. **Es la lección de `Outlet Duty Free N2` vs `N3`** (ver Guías): dos códigos parecidos son DOS artículos, y pegarle al pedido la foto del artículo de al lado **no deja ningún rastro** — el cliente recibe el catálogo con la foto equivocada y nadie se entera nunca. Un código sin foto exacta sale con **`NO IMAGEN`**, que es la verdad, y **la fila NO se salta** (mismo texto que usa hoy el macro). Hay candado con los casos que engañan: `100073063_black.jpg` no es `100073063`, `T1A8-32600-313.jpg` no es `T1A832600313`, `00100262385.jpg` no es `100262385`.
>
> ### ⚠️ `xlsx-js-style` NO SABE INCRUSTAR IMÁGENES — y NO se cambió la librería
>
> Verificado abriendo el bundle publicado (`dist/xlsx.bundle.js`, v1.2.0): **cero apariciones** de `xdr:`, `oneCellAnchor`, `twoCellAnchor`, `xl/media`, `drawing1.xml` y `sheet_add_image`. No hay opción escondida.
>
> **La salida la sigue armando `xlsx-js-style` exactamente como hoy** (mismas celdas, mismos anchos, mismo forzado a texto de los códigos) y después `src/lib/depurador/fotos-xlsx.ts` le agrega al ZIP las partes que le faltan (`xl/media/*`, `xl/drawings/drawing1.xml` + sus rels, el `<drawing r:id>` de la hoja y el Override de `[Content_Types].xml`). **`jszip` YA era dependencia** (lo usa el ZIP de Marketing) y se importa perezoso, así que solo se descarga cuando de verdad hay fotos. Cambiar de librería de exports habría tocado TODO el sistema por un botón.
> - La hoja se resuelve por el índice del propio archivo (`workbook.xml` → `workbook.xml.rels`), no adivinando `sheet1.xml`.
> - El `<drawing>` va al FINAL del `<worksheet>` (después de `<ignoredErrors>`, que es lo último que escribe SheetJS): ese es el orden del esquema.
> - Si la hoja YA tenía un dibujo, **corta con error en vez de pisarlo**.
> - Dos filas con la MISMA foto (el mismo artículo en dos PO) comparten un solo archivo dentro del ZIP: medido, **172 anclas contra 109 imágenes**.
>
> ### Las fotos se achican REUSANDO `compressImage`, no con un segundo compresor
>
> `compressImage` (el de Reclamos) ganó un `opts` OPCIONAL —`{ maxDimension, quality }`— y **sin `opts` se comporta exactamente igual que siempre** (1600 px · JPEG 0.8), así que Reclamos y Mobiliario no cambian. El Depurador le pide **300 px · 0.72**: 203 fotos de 600×600 sin achicar son **20,5 MB** y el Excel sería imposible de mandar por correo.
> - **La foto se encaja en la celda con UNA SOLA escala para los dos ejes** (`encajar`): dos escalas distintas deforman el producto. Nunca agranda una foto más chica que la caja.
> - Una foto que no se puede leer NO deja la celda en blanco: ese código sale de `conFoto` y su celda dice `NO IMAGEN`. Una celda vacía se vería igual que "no se pegó y nadie se dio cuenta".
>
> ### 🔴 SIN CARPETA, EL EXCEL DE HOY SALE IDÉNTICO
>
> `buildCatalogoAoa(rows, mes)` sin el tercer parámetro devuelve **exactamente** las 10 columnas de siempre, y `incrustarFotosEnXlsx` con la lista vacía **devuelve los mismos bytes sin abrir el ZIP** (no lo re-empaqueta "por las dudas"). Medido en el navegador: sin carpeta el archivo pesa **87 KB, primera columna `PO NAME`, 10 columnas, 0 imágenes en el ZIP**.
> - ⚠️ **Con la columna `Foto` adelante, `New Article` pasó del índice 1 al 2** y el `forceTextCols` se corrió con él: forzar el índice viejo habría dejado los códigos en **notación científica**. Verificado en el archivo descargado: `C2 = "100277416"` con `t="s"`.
> - **La plantilla Switch NO lleva fotos** (se sube a Switch, no la mira nadie) y el bloque ni se dibuja en ese modo. **El Depurador CK/TH tampoco cambió**: la carpeta de fotos y los códigos son de Reebok.
> - ⚠️ **No se tocó una sola línea del cálculo de precios** (`TECHO(CIF ÷ divisor) + extra`, `validarDivisor`).
>
> ### Medido con la carpeta REAL y el pedido REAL
>
> `BASE=… node scripts/_medir-fotos-pedido.mjs` (solo lectura sobre la carpeta). **Se le pasa la CARPETA ENTERA de verdad** —las 4.744 fotos, 818 MB—, que es lo que hace la persona; `MUESTRA=1` arma una copia por enlaces duros (mismos bytes, sin copiar) para iterar más rápido, y da los mismos números. La entrada son los **203 códigos del `1000 fiver excel.xlsm`** de Daniel, puestos en el formato Book4 que el Depurador lee.
>
> | | |
> |---|---|
> | del clic a que el archivo baja | **906 ms** |
> | peso del .xlsx | **0,65 MB** (contra **20,5 MB** de originales) |
> | filas / fotos | 172 filas · **172 de 172 con foto** · 109 imágenes distintas |
> | elegir la carpeta de 4.744 y emparejar | **299 ms** |
> | sin carpeta de fotos | 87 KB · `PO NAME` · 10 columnas · 0 imágenes |
>
> ⚠️ **Las 172 filas no son un recorte de las 203 líneas del macro:** el Depurador agrupa por PO + artículo y descarta los que no tienen piezas del mes, que es lo que ya hacía antes de este cambio. Y **109 imágenes contra 172 anclas** es el mismo artículo repetido en dos PO, no fotos perdidas.
>
> **El archivo se abre de verdad, y con DOS parsers independientes:** `xlsx-js-style` lo relee (172 filas, 1ª columna `Foto`, el código sigue siendo texto) y **`openpyxl` ve las 172 imágenes** ancladas en `col 0`, con `alto de fila 72` y `ancho de columna 14,83`. Una de las miniaturas extraída del ZIP es un JPEG real de 300×300 y 7 KB.
>
> **Los 3 anchos (+ el iPad acostado), contra el build de producción:** **390 · 834 · 1024 · 1440 → 0 px de arrastre de página**, y la caja nueva da **0 recorte, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en los cuatro (crece hacia abajo: 211 px de alto a 390, 174 a 834, 156 a 1024 y 1440). Su rótulo va a **12 px y no a los 11 de los dos rótulos vecinos**, a propósito: es texto NUEVO. El único recorte de la pantalla es el **scroller declarado de la vista previa** (`DIV.max-h-[440px].overflow-auto`, 291 px a 390 y 71 a 834): es PRE-EXISTENTE y es el mecanismo, no un defecto. El script **falla** si no encuentra la caja, si falta alguna foto, si el archivo no baja o si no se puede abrir.
>
> **Candado: `src/__tests__/lib/depurador-fotos-excel.test.ts` (26).** No busca texto en archivos: arma libros de verdad, los incrusta, los vuelve a abrir con la librería de Excel y con JSZip, y lee las anclas. Incluye un bloque que corre contra la **carpeta real** si está en la máquina (y se saltea en CI en vez de dar verde por nada).


---

> ## 🔴 Depurador — "FOTOS A MI EXCEL": un camino APARTE que no calcula nada (17-ago-2026)
>
> Daniel, textual: ***"quiero poder subir un excel con el código en la columna B y que también funcione"*** · ***"código en la columna B, y la info en otras columnas pero dejando vacío la columna A para las fotos"*** · ***"es para otro camino, no reemplaza"*** · ***"siempre en la B"***.
>
> **Pestaña nueva del Depurador: `Fotos a mi Excel`** (`/productos/cargar?tab=misfotos`). Subir el Excel → elegir la carpeta → descargar **el mismo archivo** con las fotos pegadas en la columna A. El camino de Reebok (#564) **no se tocó**.
>
> ### 🔴 LO QUE LO HACE DISTINTO: ACÁ NO SE CALCULA NADA
>
> No pasa por el precio (`CEILING(CIF÷divisor)+extra`, `validarDivisor`), no reordena, no agrega ni quita una columna. Es *"tomá mi archivo y ponele las fotos"*. Es exactamente el archivo que hoy resuelve con un macro de VBA (`1000 fiver excel.xlsm`: `NO IMAGEN · New Article · Name · Precio · Piezas · PO NAME`).
>
> ### 🔑 POR ESO NO PASA POR `xlsx-js-style` — y esa es la decisión que sostiene todo
>
> Leer con SheetJS y volver a escribir produce un archivo **NUEVO**: se pierden el `vbaProject.bin` (o sea **el macro**), los `xr:uid`, las extensiones de Excel y todo lo que la librería no entiende. Acá se abre el **.zip que ES el .xlsx/.xlsm**, se tocan **tres partes** (la hoja, el dibujo y el `[Content_Types]`) y se vuelve a cerrar. **Toda entrada que no se nombra sale byte por byte igual.**
> - Módulo PURO: `src/lib/depurador/excel-propio.ts` (entra XML como texto, sale XML como texto). El lado archivo: `app/productos/cargar/excel-propio-archivo.ts`. La pantalla: `MiExcelFotosClient.tsx`.
> - **El emparejador, el compresor y el armador del ZIP se REUSAN** (`fotos-excel.ts`, `prepararFotos`→`compressImage`, `fotos-xlsx.ts`). Si se separaran, dos pantallas pegarían fotos distintas para el mismo código.
>
> ### ✅ EL MACRO SE CONSERVA — medido, no supuesto
>
> `vbaProject.bin` viaja como una entrada más del zip: **26.624 bytes, byte por byte idéntico**, y el archivo baja como **`.xlsm`**. La pantalla lo dice antes de descargar. `nombreDeSalida(nombre, conservaMacro)` existe igual para el caso contrario: si algún día no se pudiera, baja como `.xlsx` y la pantalla lo avisa.
>
> ### 🔴 EL CÓDIGO ESTÁ EN LA COLUMNA B. NO SE BUSCA NI SE ADIVINA
>
> `COL_CODIGO_INDICE = 1`, fijo. La fila 1 es el encabezado y no se toca. **Emparejado EXACTO** (`codigo` + `.jpg`, sin mayúsculas, nada de parecidos — la lección de `Outlet Duty Free N2` vs `N3`). Sin foto, la celda A dice **`NO IMAGEN`** y **la fila nunca se salta**. Una foto que no se puede leer también sale como `NO IMAGEN`: una celda vacía se vería igual que "se pegó y nadie se dio cuenta".
> - Una fila **sin código en B** se deja tal cual (ni foto ni texto) y la pantalla dice cuántas son.
> - 🔴 **El ancla NO es `i + 1`.** Esa cuenta vale para el pedido Reebok, donde el Excel lo arma el sistema; acá las filas son las del archivo y pueden tener huecos. Vive en `filaAnclaDe()` (módulo puro) para que la pantalla no la vuelva a calcular.
>
> ### ⚠️ ORDENAR NO VA A FUNCIONAR, Y ESTÁ DECIDIDO ASÍ
>
> Daniel: *"prefiero ordenar no se pueda y quede solo filtrar"*. Se ancla con **`oneCellAnchor`**, así que al **FILTRAR** la foto se esconde con su fila; al **ORDENAR** las fotos **no se mueven**. La pantalla lo dice en una línea, antes de descargar, para que no lo descubra rompiendo un pedido.
>
> ### Lo demás que la pantalla DICE antes de descargar (enterarse después no sirve)
>
> - **La columna A se reemplaza entera** (es la columna de las fotos) — y si ya tenía algo escrito, dice **cuántas celdas** se van a pisar. Es lo que hace el macro hoy.
> - **Si la hoja ya tiene fotos pegadas** (el archivo de Daniel YA pasó por el macro), se **reemplazan**: se borra el dibujo viejo y sus imágenes, reusando el mismo part y la misma relación. Sin eso el archivo se llevaría el peso de dos juegos de fotos. ⚠️ Es una opción NUEVA (`reemplazarDibujo`) y **por defecto va apagada**: en el pedido Reebok un dibujo preexistente sigue **cortando con error**, porque ahí solo puede ser algo que escribió alguien más.
> - **Si el libro tiene varias hojas**, solo se toca la primera y lo dice con su nombre.
> - **Las fotos no se suben a ningún lado** y el Excel tampoco: en los dos archivos del camino no hay un solo `fetch` (hay candado).
>
> ### La celda la mide el ARCHIVO, no una constante
>
> El ancho de la columna A y el alto de CADA fila se leen del propio libro (`medirCeldaFoto`), porque este camino **no los cambia**. La foto se encaja con `encajar()` —una sola escala para los dos ejes, nunca agranda— dejando 8 px de margen. Medido en el archivo real: celda **94×101 px** → fotos de **86 px** de lado mayor, centradas.
>
> ### Medido con el archivo REAL y la carpeta REAL
>
> `BASE=… node scripts/_medir-excel-propio.mjs` (solo lectura; `MUESTRA=1` usa una copia por enlaces duros). Entrada: `1000 fiver excel.xlsm` (203 filas, 1,26 MB, con macro) y la carpeta entera de **4.744 fotos**.
>
> | | |
> |---|---|
> | leer el Excel y contar los códigos | **45 ms** · 203 de 203 |
> | elegir la carpeta de 4.744 y emparejar | **292 ms** · **203 de 203 con foto** |
> | del clic a que el archivo baja | **945 ms** |
> | peso | 1,26 MB → **0,67 MB** (originales emparejados: 20,5 MB) |
> | fotos | 203 anclas `oneCellAnchor` · **110 imágenes** (el mismo artículo repetido) |
>
> 🔴 **Y la prueba que importa: el archivo vuelve IGUAL.** El script compara **celda por celda contra el original**: **994 celdas fuera de la columna A idénticas · 204 filas en el mismo orden · el macro byte por byte igual**, y el `autoFilter`, el ancho de columna (13,33) y el alto de fila (76 pt) intactos. Verificado además con **openpyxl** (otro parser): 203 imágenes `OneCellAnchor` en la columna 0 y el VBA presente. Verificación fuera del navegador: `npx tsx scripts/_verif-excel-propio.ts <archivo> <carpeta>`.
>
> **Los 3 anchos (+ el iPad acostado), contra el build de producción:** **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recorte, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px.** El script **falla** si no encuentra los 7 avisos, si falta alguna foto, si el archivo no baja, si el macro no viaja o si alguna celda fuera de la columna A cambió.
> - 🩸 **La pestaña nueva hizo desbordar la fila de pestañas a 1024 px** (de 6 a 7 fichas: 24 px de más, o sea la última quedaba fuera de la pantalla — el iPad ACOSTADO, que es justo donde arranca ese layout). El relleno de cada pestaña bajó a `px-2.5` hasta `xl`; desde `xl` vuelve el de siempre. **No se acortó ningún rótulo.**
> - 🩸 **Y un candado viejo FIJABA el defecto**: `iphone-targets-operacion.test.ts` exigía `px-4` LITERAL, cuando lo que protege es que la pestaña mida 44 px, no se comprima y no parta el texto. Pasó a exigir eso.
>
> **Candado: `src/__tests__/lib/depurador-excel-propio.test.ts` (32).** No busca texto: arma libros de verdad, los pasa por los mismos módulos que corre la pantalla y los relee con la librería de Excel **y** con JSZip. Incluye un bloque contra el **.xlsm REAL** de Daniel (se saltea si la carpeta no está, en vez de dar verde por nada) y un barrido de reuso que **borra los comentarios primero**.
> - **Verificado por mutación, 14 de 14 cazadas** (`bash scripts/_mutar-candados-excel-propio.sh`): el código se lee de otra columna · el encabezado entra como código · la celda sin foto queda vacía en vez de decir NO IMAGEN · la celda A se escribe al final de la fila · se pierde su formato · el ancho de columna se inventa · la foto se ancla por índice del par y no por la fila real · las filas sin foto se saltan · Reebok deja de cortar con un dibujo ajeno · las fotos viejas del macro quedan pegadas · el ancla deja de ser `oneCellAnchor` · la pantalla escribe su propio "NO IMAGEN" · la pantalla sube el archivo a algún lado · el `.xlsm` baja como `.xlsx` aunque el macro viaje.
> - 🩸 **La primera corrida dio 0 de 14 y era EL SCRIPT**: `--reporter=basic` no existe en vitest 4, así que la corrida moría y el conteo de fallos daba vacío → todo "sobrevivió". Y dos mutaciones sobrevivieron de verdad por candados flojos (un ternario que quedaba en pie, y un literal en JSX que el barrido buscaba entre comillas). **Un verificador que miente en cualquiera de las dos direcciones es peor que no tenerlo.**


---

## 🔴 Catálogos — LAS ESCRITURAS QUE NO CAMBIAN NADA NO SE HACEN (14-ago-2026)

> Daniel lo autorizó con una condición textual: ***"solo si no me daña nada"***. **Lo único que cambia es CUÁNTAS escrituras se hacen: el `UPDATE` que guardaría exactamente el mismo valor que ya está en la base, no se hace.**
>
> 🩸 **EL DATO.** El sync de Tommy manda **455 UPDATE de a uno** por corrida (Reebok 127, Joybees 79→83, Calvin 79) y esas escrituras eran cerca de la mitad de su tiempo. Medido con `_verif-stock-concurrencia.ts`, que saca foto de las 5 tablas antes y después de cada corrida: **en las 5 vueltas previas al cambio, 1.228 filas y 17.672 campos → 🟢 IDÉNTICO**. O sea que las **744 escrituras de cada vuelta le escribían a la base exactamente lo que ya tenía.**
>
> ### ⛔ LO QUE NO SE HIZO, y es la mitad de por qué se pudo hacer
>
> En ese write path viven la **foto** (`image_url` / `foto_manual`), el **nombre editado** (`nombre_manual`), la **etiqueta** (`badge`), el **"ocultar"** (`oculto_manual`) y el **bulto** (`bulto_pzas`) — trabajo hecho A MANO que **no vuelve de Switch si se pierde**: 389 fotos de Tommy subidas una por una y 493 productos con foto.
> - **NO se agruparon las escrituras en lotes.** Un `upsert` mal armado se lleva puestas las fotos de 490 productos. *"Agrupar las escrituras es OTRO día"* sigue siendo cierto — y ya no hace falta.
> - **NO cambió QUÉ columnas escribe un UPDATE ni con qué valores.** El payload es el MISMO objeto de siempre; lo único que ganó es un nombre (`cambios`) para poder compararlo antes de mandarlo.
> - **NO se reordenó el write path**, ni se tocaron el read-all-then-write, el guard del barrido de páginas (#498), el guard de precios imposibles ni la regla de visibilidad.
> - **El `inventory` de Reebok se sigue escribiendo SIEMPRE**, aunque el producto no cambie: saber si ya tiene esa cantidad exigiría **leer** `inventory`, y eso sí sería una consulta nueva contra una base en compute Micro.
>
> **Comparar no cuesta una lectura extra** — eso se VERIFICÓ antes de avanzar: el motor ya hacía read-all-then-write. Lo único que se agregó son **columnas a la consulta que ya existía** (`existencia`, `disponibilidad`, `stock`, `category`, `gender`, `bulto_pzas`, `codigo_barra_id`): misma consulta, mismo viaje, más columnas. Cero consultas nuevas.
>
> ### 🩸 EL RIESGO REAL NO ES ESCRIBIR DE MÁS: ES NO ESCRIBIR NUNCA
>
> Si la comparación se equivoca diciendo "igual", se saltea el 100% y **el catálogo se congela sin un solo error** — el "cero silencioso" que este repo ya pagó. Tres cosas lo cubren:
> 1. **Comparación por tipo EXPLÍCITO** (`src/lib/switch-api/catalogo-igualdad.ts`, módulo PURO): `entero` / `monto` / `texto` / `booleano` declarados **columna por columna** contra el tipo REAL de la base. 🔴 `campoIgual` devuelve `true` **solo cuando puede PROBAR la igualdad**: columna sin declarar, columna que no se leyó o tipo inesperado ⇒ **se escribe**, o sea el comportamiento de ayer. Los pares que engañan están todos en el test: `0` vs `"0.00"` (iguales, es la misma plata) · `null` vs `""` (**DISTINTOS**) · `"10"` vs `10` (iguales en un entero) · `"Sandals "` vs `"Sandals"` (**DISTINTOS**: el write path escribe el texto tal cual). Los montos se comparan **al centavo con aritmética de texto**, no con `Math.round(n*100)` — en coma flotante `16.555*100` da `1655.4999…` y el precio no se saltearía nunca.
> 2. **Contadores POR CORRIDA**: `comparados` / `escrituras` / `sinCambios` en el resultado (y en el JSON de los 4 routes) y en **`switch_sync_log.skip_details`** con el campo `catalogo_escrituras`. **Sin DDL**: la columna ya existe y los guards de montos ya la usan con SU propio `campo`. `records_updated` y `records_skipped` **no cambiaron de significado** (siguen siendo procesados y ocultados).
> 3. **Guard de sanidad**: saltearse el **100%** queda registrado (`skip_details` + `console.warn`) y **NO falla cerrado, a propósito**: un catálogo que de verdad no se movió entre dos pasadas del mismo día es posible —Joybees son 83 artículos y las 4 pasadas están a 2-3 h—, así que tumbar la corrida sería estrenar la alerta que suena para siempre. Si esto sale todos los días en todos los catálogos, la comparación se rompió.
>
> Y el peor caso del acierto es benigno: si se saltea una actualización que hacía falta, los 4 catálogos corren **4×/día** y la siguiente la agarra. **No existe un camino donde esto borre una foto**, porque no cambia lo que hace una escritura.
>
> 🩸 **LA ESCALERA DE LECTURA, y por qué no alcanzaba el fallback que había.** El motor tenía UN fallback pre-migración: si el SELECT fallaba, se releía con `COLS_BASE` a secas. Con las columnas nuevas adentro, una que todavía no exista (`bulto_pzas` antes de su DDL) habría disparado ese fallback y se habría llevado puesto también **`nombre_manual`** — y sin `nombre_manual` el sync **PISA el nombre editado a mano**. O sea: una optimización de velocidad borrando trabajo manual, justo lo que este cambio no podía hacer. Ahora son **tres escalones** que quitan lo menos posible, y un error ajeno (permisos, red) se propaga como siempre.
>
> ### EL ANTES/DESPUÉS, en producción, 5 corridas de cada lado y MEDIANA
>
> | catálogo | UPDATE/corrida | antes | después | |
> |---|---:|---:|---:|---|
> | Joybees | 83 → **0** | 15 s | **8 s** | −47% |
> | Reebok | 127 → **0** | 53 s | **28 s** | −47% |
> | Calvin | 79 → **0** | 56 s | **57 s** | ~ |
> | Tommy | 455 → **0** | 87 s | **65 s** | −25% |
>
> Las 5 corridas una por una — antes (06:17-06:38 UTC, sobre `main`) y después (08:05-08:23, ya deployado):
> `antes` joybees 36·41·15·15·15 · reebok 41·38·64·53·63 · calvin 56·56·60·106·46 · tommy 77·84·87·109·116
> `después` joybees 8·28·7·22·7 · reebok 57·28·27·39·27 · calvin 47·106·57·47·90 · tommy 37·64·65·65·65
> - ⚠️ **Calvin no se mueve, y es lo esperado**: son 79 escrituras contra el barrido de las **164 páginas** de `vistana` (8.173 artículos), que es lo que se come su sync. Mismo motivo por el que casi no se movió cuando se subió `STOCK_CONCURRENCIA`.
> - ⚠️ **Tommy mejora menos que los ~50 s que se esperaban**: esa cifra salía de una medición de otro horario; en esta franja (01:00-03:30 a.m. Panamá) la base contesta más rápido y las 455 escrituras costaban ~22 s. Lo que sí mejoró mucho es la **dispersión**: de 77-116 s a 37-65 s, o sea que el peor caso —el que ve Daniel esperando en "Actualizar ahora"— se partió casi al medio.
>
> ### 🔴 La identidad, campo por campo — primera foto contra última
>
> La foto de las **06:17** (antes de todo, con el código viejo) contra la de las **08:23**, con **10 corridas de sync de por medio**: `joybees_products` 83 · `products` 284 · `inventory` 284 · `calvin_products` 80 · `tommy_products` 497 = **1.228 filas y 17.672 campos → 🟢 IDÉNTICO, cero cambios**, con las 493 fotos de Tommy y las 283 de Reebok en su lugar. `image_url`, `foto_manual`, el nombre, la etiqueta, `oculto_manual` y el bulto están **fuera** de la lista de movimiento legítimo del verificador: si alguno se hubiera movido, sería un fallo y no un resultado. En las 20 corridas el log dejó `escrituras=0 · sinCambios=744`.
>
> ### Candados
>
> `src/__tests__/lib/catalogo-sin-escrituras-iguales.test.ts` (51 casos). **Son de CONDUCTA, no de texto**: corren el motor REAL contra un Supabase simulado que **proyecta a las columnas pedidas** (como PostgREST) y miran los payloads exactos de cada escritura. Uno recorre las **4 marcas reales** y exige que toda columna del UPDATE esté declarada con su tipo **y** se lea en la misma consulta — si mañana alguien agrega una columna al write path y se olvida, ese catálogo vuelve a escribir siempre (seguro) y el test lo dice.
> - **Verificado por mutación, 14 de 14 cazadas** (`bash scripts/_mutar-candados-catalogo.sh`): `campoIgual` siempre true · "no la leí" = "es igual" · comparación laxa (`null` == `""` == `0`) · textos normalizados · montos en coma flotante · payload vacío = igual · el guard del 100% no marca · el motor no escribe nunca · el motor escribe siempre · la escalera pierde su escalón intermedio · los contadores no se registran · el inventario deja de escribirse · Tommy deja de declarar sus columnas · una columna del UPDATE sin tipo.
> - 🔴 **La prueba de que SÍ actualiza lo que cambió**: `MARCA=tommy DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-catalogo-escribe-lo-que-cambio.ts` corre el motor REAL contra los **productos REALES de producción** y el **Switch REAL**, en `dryRun` (cero escrituras), dos veces: control y con **UNA** columna movida en la RESPUESTA de la lectura (no en la base). Medido el 14-ago-2026: **CONTROL 455 comparados · 0 escrituras · 455 sinCambios** · **MUTADO `T1XH343351800` disponibilidad 20→21 ⇒ 455 comparados · 1 escritura · 454 sinCambios**, y la base quedó **INTACTA** (`disponibilidad=20`). Un solo campo distinto ⇒ exactamente una escritura más.
>   - 🩸 **La primera corrida dio 🔴 y era EL SCRIPT, no el motor**: eligió `FW0FW06158-DW5`, un producto **inactivo**. El loop que compara solo recorre el set de `/stock` (= activos ∪ disponible≥1), así que mover una fila que no está ahí no produce ninguna escritura y el veredicto habría acusado al motor de algo que no hacía. Ahora elige un producto **activo**. Un verificador que miente en cualquiera de las dos direcciones es peor que no tenerlo.


---

## Pedido o COTIZACIÓN — el mismo botón, dos salidas (24-ago-2026)

> ⚠️ **SUPERADO EN PARTE el 25-ago-2026 — ver *«LAS DOS SALIDAS SE OFRECEN DIRECTO»* más abajo.** Lo que cambió es SOLO cómo se ofrecen: **no hay ventana en el medio, no hay párrafo, y el componente `ElegirDocumentoSwitch` YA NO EXISTE**. Todo lo demás de este bloque —el endpoint sin documentar y cómo se mapeó, el 422 del cliente, `normalizarDocumento`, el at-most-once, el aviso de Telegram, el DDL tolerante y el pedido del LINK— **sigue vigente tal cual**.
>
> "Enviar a Switch" tenía UNA sola salida: `POST /apipedido/terminar`, que crea un PEDIDO. Daniel pidió poder mandar también una **cotización** y fue textual sobre cómo: ***"que estén los dos"*** — se elige cada vez, ninguna reemplaza a la otra.
>
> ### El endpoint, y cómo se mapeó SIN ensuciar producción
>
> **`POST /apicotizacion/terminar` EXISTE y NO está documentado** (el PDF solo trae leer cotizaciones —§5.31 `/lista`, §5.32 `/info`— y §5.33 `/correo`). Es el **cuarto endpoint sin documentar** de este conector. Se mapeó el 24-ago-2026 contra `active_shoes` mandando **un campo a la vez y SIN `articulos`**: sin líneas no puede crear nada, así que cada respuesta es solo una validación y la empresa queda intacta.
>
> ```
> {}                       → 400 code 0315 "VENDEDOR NO SE ENCUENTRA DISPONIBLE"
> {vendedorId}             → 400 code 0316 "CLIENTE NO SE ENCUENTRA DISPONIBLE"
> {vendedorId, clienteId}  → 400 code 0319 "INFORMACIÓN DE ARTICULOS INCORRECTA"
> ```
>
> O sea: **contrato idéntico al del pedido**, campo por campo y en el mismo orden de validación. Por eso el motor de envío es UNO solo y lo único que cambia son dos líneas: a qué ruta sale el POST y con cuál se verifica después (`/apicotizacion/info` devuelve `detalle[]` con las mismas columnas que el del pedido).
> - ⚠️ **`/apicotizacion/crear`, `/guardar` y `/nueva` NO existen**: devuelven la página de excepción de Switch con **HTTP 200** (200, no 404). En este conector un endpoint se prueba por el SHAPE de la respuesta, nunca por el status.
> - ⚠️ **El nombre del id de la respuesta NO está medido** (no se manda una cotización de prueba a producción). Se lee con tolerancia —`cotizacionId`, `pedidoId`, `id`— y **el motor nunca depende de él**: sin id la cotización queda creada igual, con su `numeroInterno`, solo que sin verificación. Un id inventado (`Number(undefined)` = NaN, `Number(null)` = 0) sería peor que ningún id, y hay mutación para eso.
>
> ### 🔴 LA PANTALLA DICE LA DIFERENCIA ANTES DE MANDAR
>
> Una cotización **NO aparta mercancía**: si se cotizan 500 pares, a los otros vendedores les siguen apareciendo disponibles y los pueden vender. **Enterarse de eso después es el problema**, así que el botón ahora **pregunta qué** y la advertencia viaja pegada a la opción:
>
> > **Pedido** — Aparta la mercancía para este cliente.
> > **Cotización** — La cotización NO aparta la mercancía: si cotizas 500 pares, a los otros vendedores les siguen apareciendo disponibles y los pueden vender. · *Si después lo compran, duplica el pedido y mándalo como pedido.*
>
> **Un toque más, no un flujo nuevo.** Dos botones gemelos al lado se tocan sin leer —y el que se toca de más manda 500 pares de la forma equivocada—, así que la elección cuesta un toque y ese toque trae la explicación.
> - Los textos viven en **`lib/catalogo/documento-switch.ts`**, no en las pantallas: son TRES las que mandan a Switch (checkout, detalle del pedido y confirmación) y tres copias de una advertencia se separan solas — la que quede vieja es la que manda plata al ERP. Hay candado que prohíbe reescribirla a mano en cualquiera de las tres.
> - **Una sola pieza para las 4 marcas** (`ElegirDocumentoSwitch`): Reebok · Joybees · Tommy · Calvin comparten el mismo componente. **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok.**
> - El estado de después también lo dice: *"Cotización creada en Switch: 16-…"*, el banner del candado (*"ya está en Switch como cotización #…"*) y, en la confirmación, la misma frase de que no aparta mercancía.
>
> ### 🔴 EL CANDADO DEL CLIENTE CUBRE LAS DOS SALIDAS
>
> `documento` se lee **DESPUÉS** del 422 de `handlePostEnvio` y del 400 de `/api/catalogo/checkout`: una cotización pasa por el MISMO candado que un pedido. Si se saltara por este costado, el agujero de los **15 pedidos por $53.124 a nombre de "Contado"** volvería a estar abierto con otro nombre. Hay test de conducta (se renderiza la pantalla, se toca el botón y se cuenta qué salió por `fetch`) y test de contrato para los dos orígenes, interno y del link.
> - **El servidor NO confía en el navegador**: `normalizarDocumento` acepta exactamente dos valores y **cualquier otra cosa cae a PEDIDO**. El modo de fallo aceptable es crear el documento de siempre, nunca una cotización que nadie pidió. Un body viejo, sin el campo, sigue creando un pedido igual que ayer.
> - **El pedido del LINK público no se tocó ni se amplió**: sigue esperando a que una persona le ponga el cliente.
>
> ### ⚠️ EL CANDADO at-most-once NO SE TOCÓ — y eso tiene una consecuencia que se dice ANTES
>
> El índice parcial único sigue siendo **`(order_id) WHERE estado <> 'error'`**: **UN envío no-fallido por pedido, salga como pedido o como cotización**. Meterle `documento` a la clave permitiría dos escrituras al ERP por el mismo pedido, que es exactamente lo que ese índice existe para impedir.
> - **Consecuencia:** cotizar CONSUME el envío de ese pedido. Para vender de verdad lo cotizado se **duplica** (el botón ya existe y pregunta el cliente). Está dicho en la propia elección —*"Si después lo compran, duplica el pedido y mándalo como pedido"*— y hay test que lo fija.
> - 🔴 **Si Daniel prefiere que una cotización NO trabe el pedido**, es cambiar el índice a `(order_id, documento)`. Es una decisión suya, no de un refactor: se dejó como está a propósito.
>
> ### El aviso de Telegram dice cuál de las dos fue
>
> **📝** en vez de 📦, etapa *"COTIZACIÓN enviada a Switch"* y una línea extra: *"No aparta mercancía — sigue disponible para los demás."* En una lista de avisos el emoji es lo primero que se ve, y quien lee el canal decide cosas con eso. Sigue pasando por el armador único (`telegram-pedido.ts`), no por un texto inline.
>
> ### DDL
>
> **`20260824160000_switch_envios_documento.sql`** agrega `documento TEXT NOT NULL DEFAULT 'pedido'` + CHECK a las 4 tablas de envíos. **No hace falta backfill**: todo lo viejo es pedido, que es lo único que el sistema sabía crear. **El código es TOLERANTE a que no esté corrida** —la escritura reintenta sin la columna y la lectura también—, así que mientras tanto todo se comporta como antes; hay test que lo prueba (con el DDL pendiente la cotización SALE IGUAL).
>
> ### Medición
>
> **`BASE=… node scripts/_medir-cotizacion-anchos.mjs`** (el navegador **ABORTA cualquier POST** a `/api/catalogo/checkout` y a `**/enviar-switch`: abrir la elección no manda nada por diseño, y así es imposible aunque el diseño cambie). Contra el build de producción y con datos reales, en **390 · 834 · 1024 · 1440**: la elección mide **358×399 px en el iPhone** y **448×381 px en los otros tres** (se topa con el ancho disponible y crece hacia ABAJO — en 390 px es 41 px más alta y 90 px más angosta, no más ancha) → **0 arrastre · 0 recorte · 0 táctil <44 px · 0 texto <12 px**, con las dos opciones y la advertencia a la vista en los cuatro. Escrituras bloqueadas: **0**.
> - Los tocables <44 px que el script reporta en el resto de la pantalla (`← Inicio`, `← Catálogo`, el precio por pieza, `← Volver a Pedidos`, `Ocultar de la lista`) son los **PRE-EXISTENTES**, en código que este cambio no toca: se listan aparte como informativos y no tumban la medición.
> - 🩸 **Gotcha de medición:** al usuario de prueba no le corresponde vendedor, así que hay que **elegir uno** además del cliente — si no, el botón queda apagado **con razón** y no hay elección que medir.
> - 🩸 **Bajo el candado post-envío la pantalla NO dibuja el renglón de estado** (`switchLock ? null : …`, comportamiento de siempre): lo que se lee ahí es el BANNER. La primera versión del script exigía el renglón y daba rojo por nada.
>
> ### Candados
>
> **`lib/documento-switch.test.ts`** (la regla, las palabras y la estructura) · **`lib/switch-envio-paralelo.test.ts`** (corre el motor REAL: la cotización sale por `/apicotizacion/terminar` y NO toca `/apipedido/terminar`, la verificación usa la ruta de SU documento, la MISMA pre-validación, el at-most-once, el DDL pendiente y el texto exacto del aviso) · **`components/pedido-cliente-obligatorio.test.tsx`** (CONDUCTA: la advertencia está en pantalla y todavía no salió nada; sin cliente no sale ninguna de las dos) · **`api/catalogo-paridad-enviar-switch.test.ts`** (el 422 para la cotización, el passthrough y la normalización).
> - **Verificado por mutación, 20 de 20 cazadas** (`bash scripts/_mutar-candados-cotizacion.sh`): un documento inventado se acepta · el default se vuelve cotización · la advertencia deja de decir que no aparta · la opción de cotizar pierde su advertencia · todo sale como pedido · todo sale como cotización · la verificación usa siempre la ruta del pedido · el envío no guarda qué se mandó · con el DDL pendiente el envío se cae · un id que no existe se guarda igual · el motor ignora el documento · **el servidor deja pasar una cotización sin cliente** · las dos rutas dejan de pasar el documento · las dos pantallas mandan sin preguntar · el selector dibuja su propia lista · el selector deja de dibujar la advertencia · Telegram no dice cuál fue · Telegram calla que no aparta mercancía.
> - ⚠️ **Las guardas del NAVEGADOR que abren la elección NO son verificables por mutación y se dice de frente**: React no despacha el click de un botón deshabilitado ni forzándole `disabled = false` (vuelto a medir el 24-ago-2026 quitando cada guarda: los 30 casos siguen verdes). Son segunda capa; el candado que no se puede saltear es el 422 del servidor, y ése SÍ está mutado.
> - 🩸 **La restauración del script va por COPIA, no por `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada — las mutaciones se apilarían y ninguna se probaría por separado.


---

## 🔴 Pedidos — LA LISTA DEL ADMIN DICE LOS DOS NÚMEROS (25-ago-2026)

> «Administrar catálogo › Pedidos» mostraba **cliente, total y fecha, y ningún número**. Para cruzar un pedido contra Switch había que abrirlos **de a uno**.
>
> Un pedido tiene **DOS** números y ninguno reemplaza al otro:
> - **el de la casa** — `order_number` (`PED-017` · `JBP-041` · `TOM-026` · `CKP-005`), lo pone el sistema al crearlo;
> - **el de Switch** — el `numero_interno` del envío ACTIVO (`16-000000503`).
>
> 🩸 **MEDIDO CONTRA PRODUCCIÓN ANTES DE CONSTRUIR** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pedidos-numeros-lista.ts`, solo lectura): **42 pedidos internos vivos, los 42 con `order_number` (100%)** · **38 de 42 (90,5%) con número de Switch**, los otros 4 todavía no salieron · **0 envíos activos sin número** · **6 pedidos del LINK sin convertir**, que NO tienen número propio porque se lo asigna la conversión. Un campo que está lleno siempre y otro que falta en el 10% **no se muestran igual**.
>
> ### 🔴 EL NÚMERO DE SWITCH SOLO NO ALCANZA — dice si fue PEDIDO o COTIZACIÓN
>
> Desde el #579 un envío puede ser un pedido **o una cotización**, y **una cotización NO aparta mercancía**. Pintar `Switch: 16-000000503` a secas hace que las dos se vean idénticas en la lista, y quien lo lea va a creer que la mercancía está apartada cuando no lo está. Por eso el texto **siempre nombra cuál de las dos es**: `Pedido en Switch: 16-000000503` / `Cotización en Switch: 16-000000503`.
> - **Medido: los 38 envíos activos de las 4 marcas son `documento='pedido'`** — la primera cotización todavía no existe, y **justamente por eso el rótulo tiene que estar puesto ANTES de que aparezca**.
> - El `documento` se lee con el **escalón tolerante** de siempre (DDL `20260824160000`): si la columna no estuviera, se relee sin ella y todo sale como PEDIDO, que es lo único que el sistema sabía crear. Hay mutación que lo prueba.
>
> ### 🔴 UN PEDIDO QUE NO FUE A SWITCH NO DICE «—»
>
> Un guion en la columna de un número se lee como un cero, o como un dato que no cargó. Dice lo que es:
>
> ```
> Sporting Shoes                          Zapatería Nueva                 Nathalie   [Del link]
> PED-017 · Pedido en Switch: 16-000000503   PED-019 · No se ha mandado    Se numera al abrirlo ·
>                                                       a Switch           No se ha mandado a Switch
> ```
>
> El pedido del **link sin convertir** no tiene número propio y **también lo dice** (*«Se numera al abrirlo»* — se lo asigna la conversión, que es lo que hace «Editar»). Los textos viven en **`src/lib/catalogo/numeros-pedido.ts`** (módulo PURO), no sueltos en la pantalla: la lista es **una sola pieza para las 4 marcas** y una copia que quede vieja es la que le miente a alguien sobre si tiene la mercancía apartada. **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok.**
> - ⚠️ El **`"?"` heredado** de `pedidos-unificado` (envío activo sin `numero_interno` ni `pedido_switch_id` — hoy **0 casos**) NO se pinta como si fuera un número: se dice *«Pedido en Switch, sin número»*. Un signo de pregunta donde va un número es el vacío que parece un dato.
>
> ### 🔴 NO SON COLUMNAS NUEVAS: van DEBAJO DEL NOMBRE
>
> Dos columnas más ensanchan la tabla justo en el **iPad acostado (1024)**, que es el ancho donde este repo ya se quemó. Los números van como **segunda línea bajo el cliente**: la tabla crece **hacia ABAJO**, que es gratis. La tabla conserva **exactamente sus 6 columnas** y hay candado que las cuenta tabla por tabla.
> - 🩸 **Y aun sin columna nueva la tabla pedía 13 px de más en el iPad de 834**: el número de Switch es un token largo y subía el `min-content` de la columna Cliente de 95 a 108 px. **Los gutters de ESA columna se aprietan por debajo de `lg`** (`px-2 lg:px-4`) — de `lg` para arriba no cambia un píxel. ⛔ **Se probó `overflow-wrap: anywhere` y se DESCARTÓ midiendo**: arregla el ancho, pero **parte el número por la mitad** en 12 de 19 filas de Reebok y 17 de 20 de Tommy a 390 y 834 px. Un número cortado en dos es exactamente lo que este cambio vino a evitar.
>
> ### El buscador encuentra por los DOS números
>
> Pasó de *«Buscar por cliente…»* a **«Buscar por cliente o número…»**: el número que Daniel tiene a mano puede ser el de la casa o el que le dice el ERP. Es el mismo `textoBuscablePedido` del módulo puro.
>
> ### De dónde salen (sin DDL, sin consultas nuevas por fila)
>
> `order_number` **NO está en la vista unificada** (que expone `id_natural`, el uuid), así que `/[marca]/pedidos-unificado` lo pide a la tabla de orders **en UNA sola query por ids** (`.in("id", orderIds)`), al lado de la de envíos que ya existía. Sin DDL y sin barrer la tabla entera — hay mutación para las dos cosas. **`switch_numero` no cambió de significado** (lo usa el modal de eliminación masiva y no se tocó); lo nuevo son `numero_pedido` y `switch_documento`.
>
> ### Medición
>
> **Los 3 anchos + el iPad acostado, en el navegador contra el build de producción, con datos de producción, en las 4 marcas y con TODOS los meses desplegados, y CONTRA `origin/main`** (`BASE=… ETAPA=antes|despues node scripts/_medir-pedidos-numeros-anchos.mjs`, solo lectura — el navegador **aborta todo pedido que no sea GET**):
>
> | recorte de la tabla | 390 | 834 | **1024** | 1440 |
> |---|---:|---:|---:|---:|
> | `origin/main` | 214 · 201 · 227 · 211 | 0 · 0 · **7** · 0 | **0** | 0 |
> | esta rama | 217 · 209 · **218** · 214 | **0 · 0 · 0 · 0** | **0** | 0 |
>
> **0 px de arrastre de página en los 16 casos · 0 textos <12 px · táctiles <44 px IDÉNTICOS a main** (reebok 57 · joybees 3 · tommy 60 · calvin 12 — son las casillas de 16 px y los botones «Editar»/«Eliminar» de 28 px de alto, **PRE-EXISTENTES**, en código que este cambio no toca). El recorte de 390 px es el `overflow-x-auto` que la tabla ya declaraba —arrastrarla ES el mecanismo— y **Tommy MEJORÓ ahí** (227 → 218). Escrituras bloqueadas: las mismas 12 de main (Sentry).
> - 🩸 **El script FALLA si alguna fila no trae sus dos números**, si aparece un guion suelto donde va un número, o si alguna tabla deja de tener 6 columnas.
> - 🩸 **Gotcha de medición que daba «no apareció la tabla» por nada:** por defecto solo se abre el mes ACTUAL, y **los 19 pedidos de Reebok son de julio** — sin desplegar los meses NO hay una sola fila en el DOM. Primero se despliega, después se esperan las filas.
>
> ### Candados
>
> `src/__tests__/lib/numeros-pedido.test.ts` (la regla y las palabras) · **`src/__tests__/components/pedidos-numeros-en-la-lista.test.tsx` (CONDUCTA: renderiza la pestaña real, lee el DOM, cuenta los `<th>`, verifica que los dos números vivan DENTRO de la celda del cliente y que ninguna otra celda los repita, y compara la segunda línea de Reebok y Joybees carácter por carácter)** · `src/__tests__/api/pedidos-unificado-numeros.test.ts` (contrato en las 4 marcas + el escalón tolerante del DDL) · `catalogo-paridad-listas.test.ts`, actualizado.
> - **Verificado por mutación, 18 de 18 cazadas** (`bash scripts/_mutar-candados-pedidos-numeros.sh`): el número de Switch se pinta solo · toda cotización se rotula como pedido · el que no salió vuelve a decir «—» · el del link vuelve a un blanco · nadie está en Switch · todos están en Switch · el «?» se pinta como número · el número propio se ignora · el buscador vuelve a mirar solo el cliente (en el módulo y en la pantalla) · la fila deja de dibujar los números · deja de pintar el de Switch · deja de pintar el propio · el pedido del link se trata como interno · el número no viaja al navegador · qué se mandó no viaja · se pierde el escalón tolerante del DDL · los `order_number` se piden barriendo la tabla entera.
> - 🩸 **La restauración del script va por COPIA, no con `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada — las mutaciones se apilarían y ninguna se probaría por separado.
>
> ### Lo que NO se tocó
>
> El modal de eliminación masiva y su `switch_numero` · el candado at-most-once · el envío a Switch · la agrupación por mes · el routing de «Editar» (fila y botón al MISMO lado) · el Excel de «Exportar» · y **nada del detalle del pedido**.


---

## 🔴 EL PAPEL DECÍA «PEDIDO» SIENDO UNA COTIZACIÓN (25-ago-2026)

> Daniel mandó **TOM-027 como COTIZACIÓN**, Switch la aceptó (`15-000000123`), y:
> - la pantalla de confirmación decía **«Pedido TOM-027 guardado»** en el título grande, y recién abajo, en chico, *«Cotización enviada a Switch»* — **el título mentía y es lo primero que se lee**;
> - el **PDF decía «Pedido: TOM-027»** en el encabezado, al lado del cliente y la fecha. **Ese papel se le manda al cliente**, y una cotización NO aparta mercancía: el papel que dice «Pedido» hace creer que sí.
>
> Daniel, textual: ***"esto fue una cotización, porque dice pedidos en pdf?"***
>
> 🩸 **EL CASO ES REAL Y ESTÁ EN PRODUCCIÓN**: al 25-ago-2026, de los **39 envíos activos** de las 4 marcas (reebok 15 · joybees 4 · tommy 18 · calvin 2) hay **UNA sola cotización, y es TOM-027**. Las otras 38 son pedidos. O sea que el bug se disparó con la PRIMERA cotización que existió.
>
> ### 🔴 EL NÚMERO NO CAMBIA — CAMBIA LA PALABRA QUE LO ACOMPAÑA
>
> `TOM-027` es el número de la casa y se llama así **siempre**, salga como pedido o como cotización. No se le pone otro prefijo ni se renombra. Hay mutación para el caso contrario (*el NÚMERO de la casa se renombra con la palabra adelante*).
>
> ### La regla, y por qué son TRES estados y no dos
>
> Todo sale de **`palabraEnSwitch` / `palabraDelPapel`** en `src/lib/catalogo/documento-switch.ts` (módulo PURO):
>
> ```
> envío ACTIVO documento='cotizacion'  → "Cotización"
> envío ACTIVO documento='pedido'      → "Pedido"
> SIN envío activo                     → null  ← no es ninguna de las dos
> ```
>
> - 🔴 **El `null` es el punto del módulo.** Un pedido que todavía no se mandó no es ninguna de las dos y **no se le inventa etiqueta**: cada pantalla se queda con la palabra que ya usaba, o sea **exactamente lo que decía antes de este cambio**. Cero cambio de conducta para lo que no salió a Switch.
> - **Manda lo que hay en SWITCH, no el `status` de la casa**, porque es lo único comprobable. 🩸 Y el status solo NO alcanza, medido: **mandar a Switch escribe `status = confirmado`**, así que la regla vieja del #584 (`status === "confirmado" ? "Pedido" : "Cotización"`) bajaba **`Pedido-TOM-027.pdf` para una cotización**.
> - **«Está en Switch» es el MISMO criterio que el candado de edición** (`ESTADOS_EN_SWITCH = ['enviado','verificado']`, importado por `switch-lock.ts`): dos definiciones de lo mismo se separan solas, y la que quede vieja le miente a alguien sobre si tiene la mercancía apartada.
> - **Escalón tolerante de siempre** (DDL `20260824160000`): sin la columna `documento` se relee sin ella y sale **«Pedido»**. La lectura vive en `palabraDelEnvioActivo` (`switch-lock.ts`); **cualquier error devuelve `null`**, o sea la palabra de siempre — un PDF que no se genera es peor que uno con el rótulo por defecto.
>
> ### Lo que dice AHORA, textual
>
> ```
> COTIZACIÓN          título   «Cotización TOM-027 guardado»
>                     PDF      «Cotización: TOM-027»
>                     archivo  Cotización-TOM-027-2026-08-25.pdf
> PEDIDO              título   «Pedido TOM-027 guardado»
>                     PDF      «Pedido: TOM-027»
>                     archivo  Pedido-TOM-027-2026-08-25.pdf
> NO SALIÓ a Switch   igual que antes: «Pedido …» (y el detalle sigue con el #584)
> ```
>
> ### 🩸 «Cotización» LLEVA TILDE Y `Content-Disposition` ES UN ENCABEZADO HTTP
>
> Un `filename="…ó…"` a secas viaja como latin-1 y el navegador baja **`CotizaciÃ³n-TOM-027.pdf`**. La ruta `/orders/[id]/pdf` usa **RFC 6266**: `filename` en ASCII puro de respaldo **más** `filename*=UTF-8''…` percent-encoded, que es el que ganan Chrome, Safari y Firefox. Hay mutación (*el nombre del archivo pierde el RFC 6266 y la tilde viaja rota*). En el detalle NO hace falta: ahí el nombre va por `doc.save()`, sin encabezado de por medio (es el arreglo del #584 y sigue igual).
>
> ### Se fue el párrafo — y la constante también
>
> Daniel, textual: ***"no siempre tiene que haber explicación, eso ensucia mi ERP"***. La confirmación dibujaba `TEXTO_NO_RESERVA` (*«La cotización NO aparta la mercancía: si cotizas 500 pares…»*) **después** de mandar. Se fue de la pantalla **y la constante se BORRÓ**: dejarla muerta es el párrafo esperando a que alguien la vuelva a montar — el mismo motivo por el que `ElegirDocumentoSwitch.tsx` se borró en vez de dejarse sin usar. Hay candado que exige que el `export` no exista y que **ninguna de las 4 pantallas** vuelva a escribir «500 pares» a mano.
> - **Lo que se queda:** la etiqueta de 3 palabras pegada al botón (`NOTA_COTIZACION`, con su candado de largo) y la línea propia del **aviso de Telegram** (*«No aparta mercancía — sigue disponible para los demás.»*), que es del armador de Telegram y **no se duplicó**: quien lee el canal no estaba ahí cuando se eligió.
>
> ### Las superficies, barridas (con los comentarios borrados antes de grepear)
>
> | Superficie | Antes | Ahora |
> |---|---|---|
> | Título de la confirmación | `Pedido TOM-027 guardado` | **corregida** — la palabra sale del módulo |
> | Encabezado del PDF | `Pedido: TOM-027` | **corregida** — `documentoLabel` |
> | Nombre del archivo, «Ver PDF» de la confirmación | `Pedido-TOM-027-….pdf` | **corregida** + RFC 6266 |
> | Nombre del archivo, «Descargar PDF» del detalle | por `status` (#584) | **corregida** — Switch manda; sin envío, el #584 intacto |
> | Adjunto del correo al cliente | `Pedido-TOM-027-….pdf` | **corregida** (y el papel adentro también) |
> | Detalle: banner del candado y renglón de estado | ya decía cuál | sin tocar |
> | Lista del admin (`numeros-pedido.ts`) | ya decía cuál (#593) | sin tocar |
> | Excel de «Exportar» (columna Switch) | ya decía cuál (#596) | sin tocar |
> | Aviso de Telegram (📝 vs 📦) | ya distinguía | sin tocar, **sin duplicar** |
> | Párrafo rojo de la confirmación | se dibujaba | **BORRADO**, constante incluida |
> | 🔴 Asunto del correo + banda de marca (`marcas.ts` ×4 ×2) | `Recibimos tu pedido X` · `Pedido X — cliente` · `Gracias por tu pedido` | **NO corregida — decide Daniel** |
> | PDF del pedido del LINK público y su WhatsApp | `Pedido-Reebok-….pdf` | no aplica: un pedido del link nunca es una cotización de Switch |
>
> - 🔴 **Por qué el asunto y la banda del correo NO se tocaron:** no es un cambio de palabra, es **reescribir copy que ve el cliente** en 8 plantillas (4 marcas × equipo/cliente). *«Recibimos tu pedido»* → *«Recibimos tu cotización»* suena raro (el cliente no la mandó) y *«Gracias por tu pedido»* no tiene equivalente de una palabra. **El adjunto ya sale bien**, así que el papel no miente; lo que falta es la carta que lo acompaña. **Es decisión de Daniel** y queda escrito acá.
> - 🩸 **MEDIDO Y SE DICE DE FRENTE:** bajo el candado post-envío el detalle **NO dibuja el bloque «Compartir pedido»** (`switchLock ? null : …`, conducta de siempre), así que por «Descargar PDF» **nunca se llega** a la rama de la cotización de Switch. Hoy el papel de una cotización sale por el **«Ver PDF» de la confirmación**, que es una RUTA y está cubierta con 20 casos en las 4 marcas. La regla igual es UNA sola y hay candado de fuente para que el detalle no vuelva a decidir por su cuenta.
>
> ### Verificación
>
> **🔴 EL PDF SE GENERA DE VERDAD Y SE LEE CON `pdftotext`** (`npx tsx scripts/_verif-pdf-dice-la-verdad.mjs`, solo lectura): genera los tres casos con el MISMO core que usa la app, los guarda y les pasa `pdftotext -layout`. Se lee **«Pedido: TOM-027»** y **«Cotización: TOM-027»**, cada archivo pesa **77,7 KB** y **el número no cambia en ninguno**. Además mide el ANCHO del encabezado con la fuente real: la línea vive en columnas FIJAS (Cliente x=14 · documento x=90 · Fecha x=150) y «Cotización: TOM-027» mide **29,8 mm de los 60 disponibles** — no se monta encima de la fecha (el de «Pedido» mide 24,9).
>
> **🔴 EL BUG REPRODUCIDO Y ARREGLADO CONTRA LA APP DE VERDAD, sobre TOM-027**, el mismo pedido de la captura. Los dos builds de producción levantados a la vez (rama :3479 · `origin/main` :3480), el PDF pedido por HTTP y leído con `pdftotext`:
>
> ```
> main   Content-Disposition: inline; filename="Pedido-TOM-027-2026-08-25.pdf"
>        Cliente: A-Amani, S.A.        Pedido: TOM-027        Fecha: 25 de agosto de 2026
>        título «Pedido TOM-027 guardado» · renglón «Cotización» → ❌ SE CONTRADICEN · párrafo ❌ presente
>
> rama   Content-Disposition: inline; filename="Cotizacion-TOM-027-2026-08-25.pdf";
>                             filename*=UTF-8''Cotizaci%C3%B3n-TOM-027-2026-08-25.pdf
>        Cliente: A-Amani, S.A.        Cotización: TOM-027    Fecha: 25 de agosto de 2026
>        título «Cotización TOM-027 guardado» · renglón «Cotización» → ✅ coinciden · párrafo ✅ 0
> ```
>
> El script corrido contra `main` da **16 hallazgos** (el título contradiciendo al renglón + el párrafo, en los 4 anchos); contra la rama, **0**.
>
> **Los 4 anchos, las 4 marcas** (`BASE=… MARCA=… PEDIDO_EDITABLE=… PEDIDO_EN_SWITCH=… node scripts/_medir-documento-directo-anchos.mjs`), contra el build de producción y con datos de producción → **🟢 reebok · joybees · tommy · calvin: 0 arrastre · 0 recorte · 0 táctil <44 px · 0 texto <12 px** en 390 · 834 · 1024 · 1440. Se le sumó al script `verificarTituloConfirmacion`, que exige que **el título nombre lo MISMO que el renglón de abajo**, que **conserve el número** y que **el párrafo no vuelva**. Y una pantalla nueva: la **confirmación de un pedido YA en Switch** —el caso de TOM-027—, donde además se mide que **no vuelva a ofrecer las dos salidas** (at-most-once).
> - 🔴 **El navegador sigue ABORTANDO todo POST** a `/api/catalogo/checkout` y a `**/enviar-switch`. **Escrituras bloqueadas: 0** en todas las corridas.
> - 🔴 **Y CONTRA `origin/main`, mismo build de producción y mismos datos**: `SOLO_PANTALLA=1` corre **el MISMO archivo en las dos ramas** (dos scripts distintos no comparan nada). Resultado en las 4 marcas × 4 anchos: **arrastre 0, recorte 0, textos <12 px 0 y los táctiles <44 px IDÉNTICOS** — reebok 4·6·2·2 · joybees 4·2·2 · tommy 3·21·1·1·2 · calvin 3·5·1·1·3, los mismos números en las dos. Con `SOLO_PANTALLA=1` la exigencia del título NO corre: en main el título todavía miente, que es el punto.
> - Los táctiles <44 px son los **PRE-EXISTENTES** (`← Inicio`, `← Catálogo`, el precio por pieza, `← Volver a Pedidos`, la `x` de quitar línea, `Ocultar de la lista`, `Eliminar pedido`), en código que este cambio no toca.
>
> ### Candados
>
> `lib/documento-switch.test.ts` (la regla, los tres estados, el criterio compartido, la tolerancia al DDL, que el párrafo no exista y que ninguna pantalla lo reescriba) · **`api/pdf-pedido-o-cotizacion.test.ts`** (llama a las RUTAS de verdad: la palabra que le llega al generador, el `Content-Disposition` con su tilde, el adjunto del correo — **32 casos, las 4 marcas**) · **`components/confirmacion-dice-la-verdad.test.tsx`** (CONDUCTA: monta la pantalla REAL en las 4 marcas, lee el `h1` y cuenta **0 POST**) · **`components/pedido-pdf-dice-la-verdad.test.tsx`** (CONDUCTA: toca «Descargar PDF» de verdad).
> - **Verificado por mutación, 32 de 32 cazadas** (`bash scripts/_mutar-candados-cotizacion-dice-la-verdad.sh`): toda salida se rotula pedido · toda salida se rotula cotización · **un pedido que NO salió se rotula igual** · un intento fallido cuenta como «está en Switch» · la palabra ignora lo que hay en Switch · sin envío el papel queda en blanco · **vuelve el PÁRRAFO** · la lectura pierde el escalón tolerante · un error de lectura se vuelve cotización · la lectura no filtra por estado · **el PDF vuelve a decir siempre «Pedido:»** · el PDF ignora la palabra · el PDF pierde el número · la ruta no mira el envío · **el nombre del archivo vuelve a «Pedido-»** · el encabezado y el nombre se separan · **pierde el RFC 6266 y la tilde viaja rota** · **el NÚMERO de la casa se renombra** · el correo no mira el envío · **el adjunto vuelve a «Pedido-»** · el adjunto no lleva la palabra adentro · **el título vuelve a mentir** · el título dice siempre cotización · el título pierde el número · **vuelve el párrafo a la confirmación** · el detalle decide solo por status · el detalle pierde el #584 · en el detalle el archivo y el papel se separan · la lista del admin calla cuál fue · el Excel calla cuál fue · Telegram deja de distinguir 📝 de 📦 · Telegram calla que no aparta.
> - 🩸 **CUATRO NO SE CAZARON EN LA PRIMERA CORRIDA y las cuatro enseñaron algo.** Dos eran del core del PDF: los tests de ruta **mockean** `order-pdf`, así que nadie generaba el papel — se sumó a `catalogo-pdf.test.ts` la lectura del PDF con pdf.js. Una era la consulta: el doble de Supabase **no filtra por su cuenta**, así que sacar el `.in("estado", …)` no cambiaba ningún resultado — ahora se inspecciona la CONSULTA que salió, no la respuesta. Y la cuarta es la del detalle, que abajo se explica por qué solo puede tener candado de FUENTE.
> - El script restaura **por COPIA y no con `git checkout`** (hay archivos nuevos en la rama y git aborta el comando entero sin restaurar nada), **denuncia el patrón que no muta** en vez de darlo por cazado, y **exige que la corrida haya colectado tests** (si vitest muere, «0 fallos» se leería como «sobrevivió»).
> - 🩸 **El reemplazo lo hace `python3`, no `perl -0pi -e 's|A|B|'`**: en este repo un `||` del código real se des-escapa dentro del patrón de perl, la expresión se come el archivo entero y el informe dice «SOBREVIVIÓ». Los textos son literales, no regex.
>
> ### Lo que NO se tocó
>
> El endpoint `/apicotizacion/terminar` y el motor único de envío · el 422 del cliente · `normalizarDocumento` · el at-most-once · el DDL `20260824160000` y su tolerancia · el aviso de Telegram · el pedido del LINK público · la lista del admin (#593) · el Excel (#596) · la etiqueta «no aparta mercancía» pegada al botón · el flujo de 3 toques y «Duplicar».


---

## 🔴 EL AVISO DE TELEGRAM, EN DOS LÍNEAS — y la barra de instalar se fue de iOS (25-ago-2026)

> Daniel, textual: ***"lo quiero más simple… solo quiero lo útil"***, y eligió el formato EXACTO:
>
> ```
> 📝 Cotización TOM-027 · A-Amani, S.A.
> Tommy Hilfiger · $648 · 12 piezas · Switch 15-000000123
>
> 📦 Pedido TOM-028 · Hafez, S.A.
> Tommy Hilfiger · $2,760 · 48 piezas · Switch 16-000002058
> ```
>
> **LA REGLA: línea 1 = QUÉ es + DE QUIÉN es. Línea 2 = marca + monto + piezas + N° de Switch.** El monto va en la SEGUNDA a propósito — lo puso ahí él. Y aplica a **TODOS** los avisos de este tipo: *"este mensaje es solo de ejemplo, así mismo aplicarlo para todos los pedidos, cotizaciones etc"* — los 3 eventos y las 4 marcas.
>
> ### 🔴 LO QUE SE FUE, Y NO VUELVE — cada cosa con su motivo
>
> | Se fue | Por qué |
> |---|---|
> | `No aparta mercancía — sigue disponible para los demás.` | él ya lo sabe, y la advertencia sigue viva **DONDE SE DECIDE** (`NOTA_COTIZACION`, pegada al botón). Un renglón DESPUÉS de mandar no evita nada |
> | `✓ verificado` | es lo NORMAL. Solo se escribe la excepción: **`⚠️ sin verificar`** sigue pegado al número |
> | `— COTIZACIÓN enviada a Switch` | lo dicen ya la primera palabra y el número de abajo. Tres veces lo mismo en dos líneas |
> | `Cliente:` y `Vendedor:` | el nombre tras el `·` ya se lee como el cliente, y **EL VENDEDOR SALIÓ DEL MENSAJE** (sigue en el pedido, en el detalle y en la comisión) |
> | `1 referencia · 1 bulto` | quedan las **PIEZAS**, la unidad que factura Switch |
>
> ⚠️ **LOS AVISOS DE ERROR NO SE PODARON.** Cuando el envío falla o Switch no responde, el mensaje sale por `enviarSistema` desde `switch-envio.ts` y sigue diciendo qué pasó y qué hacer (`🚨 Envío a Switch FALLÓ … (se puede reintentar desde la confirmación)` · `🚨 … AMBIGUO … REVISAR EL PANEL antes de reintentar`). Ahí el detalle ES lo útil. La poda es SOLO del aviso de éxito, y hay candado.
>
> ⚠️ **EL ARMADOR SIGUE SIENDO UNO** (`src/lib/catalogo/telegram-pedido.ts`). No se duplicó: `ResumenAviso` se redujo a `piezas` y los tres emisores le mandan `piezas:` — el `resumen: {referencias, bultos, piezas}` ya no existe.
>
> **EMOJIS:** la creación lleva el de la MARCA (🛒 Reebok · 🐝 Joybees · 🔵 Tommy · ⚫ Calvin) y la salida a Switch **📦 pedido / 📝 cotización** — el mismo pedido se lee avanzando (🔵 TOM-005 → 📦 TOM-005) y las dos salidas se distinguen antes de leer una palabra. **Pedido y cotización NO pueden compartir emoji.**
>
> 🔑 **LA TERCERA LÍNEA DEL PEDIDO DEL LINK NO SE PODÓ** (*"Falta ponerle el cliente y mandarlo a Switch — está en Borradores."*): no es explicación, es una **ACCIÓN pendiente** — es lo único que hay entre el pedido y el ERP, y sin decirla el pedido se queda quieto y nadie se entera.
>
> 🔑 **El canal va SIN `parse_mode` y así se queda** (ver `telegram.ts`): texto PLANO, así un cliente que se llame `Ropa & Más <Panamá>` viaja tal cual sin escapes y sin que Telegram rechace el mensaje. Hay candado que exige que no aparezcan `<>` ni marcado.
>
> **`etapaTelegram()` SE BORRÓ** de `documento-switch.ts` junto con la etapa deletreada — no se deja sin usar: una etapa muerta es la etapa esperando a que alguien la vuelva a montar. La palabra que grita cuál de las dos es la sigue dando `etiquetaDocumento`.
>
> ### 🔴 LA BARRA «Instala Fashion Group» SE FUE DE iOS
>
> Safari **NO dispara `beforeinstallprompt`**, así que ahí la barra nunca pudo instalar nada: lo único que hacía era un párrafo explicando cómo hacerlo A MANO (*"Toca Compartir y luego Agregar a inicio"*), fijo al borde de abajo de la pantalla. Daniel ya tiene la app en su inicio y aprobó sacarla. `isIosSafari()` se **BORRÓ** (su único consumidor era el hint).
>
> ⚠️ **EN ANDROID Y ESCRITORIO SE QUEDA, y está medido.** Ahí el navegador SÍ ofrece instalar y el botón «Instalar app» sigue vivo — **idéntico a `origin/main`, píxel por píxel**.
>
> **Los 4 anchos, en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… ETAPA=antes|despues node scripts/_medir-install-prompt-anchos.mjs`, solo lectura — el navegador **aborta todo pedido que no sea GET**; escrituras bloqueadas: 0):
>
> | | 390 | 834 | 1024 | 1440 |
> |---|---|---|---|---|
> | **iPhone · main** | barra SÍ, **tapa 101 px** | SÍ, 101 | SÍ, 101 | SÍ, 101 |
> | **iPhone · esta rama** | **no · 0 px** | no · 0 | no · 0 | no · 0 |
> | **Android · main** | barra SÍ + botón, tapa 138 px | SÍ, 138 | SÍ, 138 | SÍ, 138 |
> | **Android · esta rama** | **IDÉNTICO** | idéntico | idéntico | idéntico |
>
> **0 px de arrastre · 0 táctiles <44 px · textos <12 px IDÉNTICOS (2, PRE-EXISTENTES)** en los 16 casos. Los recortados bajan de 3 a 2 (390) y de 2 a 1 (los otros tres): el que se va es la barra.
> - 🩸 **El script FALLA si mide cero sin haber mirado nada**: en `ETAPA=antes` exige que la barra de iOS APAREZCA (si no, el "antes" no prueba nada) y en las DOS etapas exige que Android conserve barra y botón. Y limpia `fg_modoviaje_install_dismissed` antes de navegar — con esa key puesta la barra no se dibuja NUNCA y todo daría "0" en verde.
> - 🩸 Chrome headless no cumple los criterios de instalación por su cuenta: el script dispara el evento **REAL** `beforeinstallprompt`, con la misma forma que manda el navegador.
>
> ### `NotasProveedorMobiliario.tsx` se BORRÓ (523 líneas)
>
> **Comprobado muerto antes de borrarlo**, con barrido sobre los 1.408 archivos de `src/` **y los comentarios eliminados primero**: 0 imports, 0 `dynamic(`/`import()`, no está en el barril de `components/marketing/`, 0 referencias por string. El único match "vivo" era un comentario de `PreciosProveedorAyuda.tsx` que decía textualmente *"sigue sin montarse en ningún lado"*.
> - 🔴 **SUS 3 CANDADOS SE MUDARON, NINGUNO SE BORRÓ** — los tres vigilaban reglas que siguen vivas en `PreciosProveedorAyuda.tsx`. En `marketing-notas-proveedor.test.ts`, `RUTA_COMPONENTE` → **`RUTA_AYUDA_PRECIOS`** apuntando al archivo vivo (con un helper `soloCodigo()`, porque el archivo vivo **CITA** la regla en su encabezado y eso daba rojo falso). En `poda-textos-ayuda.test.ts`, la aserción salió de la lista `EN_PANTALLA` —que prohíbe esconder un aviso detrás de un ⓘ, y ahora está detrás de un toque **a propósito**— y se mudó a un `describe` propio con el texto íntegro.
>
> ### Candados
>
> `telegram-pedido-origen.test.ts` (33, **CAMBIÓ DE DIRECCIÓN**: exigía las 4 cifras y los rótulos, o sea fijaba lo que Daniel podó; hoy compara el mensaje ENTERO carácter por carácter y exige que lo podado no vuelva) · `documento-switch.test.ts` · `switch-envio-paralelo.test.ts` (corre el motor REAL) · **`components/install-prompt-solo-donde-se-instala.test.tsx` (9), que RENDERIZA el componente y dispara el evento** — un barrido de texto no puede ver que el botón siga llegando a la pantalla, y se cumpliría con el propio comentario que explica el cambio.
> - **Verificado por mutación, 23 de 23 cazadas y 0 sobrevivientes** (`bash scripts/_mutar-candados-telegram-simple.sh`): vuelve el «no aparta mercancía» · vuelve el vendedor · vuelve el «✓ verificado» · vuelve la etapa deletreada · vuelven los rótulos «Cliente:» · vuelven referencias y bultos · **pedido y cotización con el MISMO emoji** · todo se rotula «Pedido» · la marca desaparece de la 2ª línea · el monto se va a la 1ª · el N° de Switch deja de decirse · se inventa un «0 piezas» · el link pierde su acción pendiente · los emisores dejan de mandar las piezas (×2) · **el envío FALLIDO pierde su detalle** · el AMBIGUO pierde el «REVISAR EL PANEL» · el error pierde su 🚨 · la etiqueta del botón deja de decir que no aparta · **la barra vuelve en iOS** · la barra desaparece también de Android · el botón queda decorativo · el botón baja de 44 px.
> - 🩸 **El script trae una mutación de CONTROL que a propósito no matchea**: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido con el comentario adentro.
> - 🩸 **Restaura por COPIA, no con `git checkout`** (hay archivos NUEVOS y git aborta el comando entero), **denuncia el patrón muerto**, **exige que vitest haya colectado** antes de creerle a un cero, y **el reemplazo es LITERAL con `python3`, no `perl -0pi -e 's|…|…|'`**: con el delimitador `|`, un `||` del código real se des-escapa a una alternación con rama vacía y **se come el archivo entero**, dando un «SOBREVIVIÓ» falso.
>
> **Dry-run sin spamear el chat** (no importa el canal ni `sendTelegramAlert`, así que no hay camino por el que pueda escribirle a Daniel): `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_dryrun-avisos-pedido.ts TOM-027`.


---

## 🔴 LAS DOS SALIDAS SE OFRECEN DIRECTO — se fue la ventana y se fue el párrafo (25-ago-2026)

> Daniel, textual: ***"quiero que en vez de que diga «enviar a switch», salga cotización o pedido como opción (sin párrafo explicando, btw no siempre hay q estar explicando todo, se vuelve tedioso)"***.
>
> ```
> ANTES (24-ago)                          AHORA
> [ Enviar a Switch ]                     ┌──────────┬─────────────────────┐
>        ↓ abre una ventana               │  Pedido  │     Cotización      │
> ┌────────────────────────────────┐      │          │ no aparta mercancía │
> │ ¿Qué mandas a Switch?          │      └──────────┴─────────────────────┘
> │ Pedido — Aparta la mercancía…  │        (sólido)      (ámbar, contorno)
> │ Cotización — La cotización NO  │
> │ aparta la mercancía: si coti-  │      Falta: elegir el cliente
> │ zas 500 pares, a los otros…  · │
> │ Si después lo compran, dupli-  │
> │ ca el pedido y mándalo como…   │
> │ [ Cancelar ]                   │
> └────────────────────────────────┘
> ```
>
> **Los textos EXACTOS son cuatro palabras: «Pedido» · «Cotización» + «no aparta mercancía».** Un toque manda.
>
> ### 🔴 SE VA EL PÁRRAFO, NO EL DATO — y la etiqueta tiene candado de LARGO
>
> Esto **revierte un criterio del 24-ago** (*"dos botones gemelos al lado se tocan sin leer"*). **La decisión nueva es de Daniel y manda**, pero el riesgo que ese criterio protegía es REAL y no desaparece: **una cotización NO aparta mercancía**, y tocar la equivocada manda 500 pares de la forma que no era. Así que de toda la explicación queda **lo único material, pegado a la opción y en el mínimo de palabras**: `NOTA_COTIZACION = "no aparta mercancía"`.
> - **Eso NO es un párrafo, es una etiqueta, y el largo es parte del candado**: ≤ 4 palabras, ≤ 24 caracteres, sin punto y sin el ejemplo de los 500 pares. Si mañana alguien le agrega media frase "para que se entienda mejor", vuelve a ser lo que Daniel sacó — y el build se pone rojo.
> - **Se fue todo el resto del texto didáctico**: `TEXTO_SI_RESERVA` (*"Aparta la mercancía para este cliente"*) y `TEXTO_COTIZACION_DESPUÉS` (*"Si después lo compran, duplica el pedido…"*) **ya no existen**.
> - ~~**`TEXTO_NO_RESERVA` (la frase larga) SIGUE VIVA donde sí hay lugar para leerla**: la confirmación DESPUÉS de mandar y el aviso de Telegram. No se dibuja antes de mandar.~~ ⚠️ **SUPERADO el 25-ago-2026** — Daniel lo señaló en su captura (*"no siempre tiene que haber explicación, eso ensucia mi ERP"*): la constante **se BORRÓ** y la confirmación ya no la dibuja. Telegram nunca la usó (tiene su propia línea). Ver *«EL PAPEL DECÍA «PEDIDO» SIENDO UNA COTIZACIÓN»*.
> - 🔴 **Y las dos NO se ven iguales, que es lo que impide el toque sin leer**: el pedido es el sólido (negro en checkout/confirmación, verde en el detalle) y la cotización es la de **contorno ámbar** con su etiqueta. Hay mutación para el caso simétrico: si el PEDIDO también llevara etiqueta, vuelven a ser gemelos y el build se pone rojo.
>
> ### 🔴 NINGÚN CANDADO SE AFLOJÓ — y los cuatro están mutados
>
> - **El cliente sigue siendo obligatorio.** El **422** de `handlePostEnvio` se lee ANTES del documento y no se tocó; las dos salidas **nacen APAGADAS y diciendo qué falta** (*"Falta: elegir el cliente y elegir el vendedor"*). La elección directa no es una puerta de atrás: hay test de CONDUCTA que toca las dos opciones sin cliente y cuenta **0 envíos**.
> - **`normalizarDocumento` intacto**: cualquier valor que no sea exactamente `pedido` o `cotizacion` **cae a PEDIDO**. El servidor no confía en el navegador.
> - **El at-most-once no se tocó** (`(order_id) WHERE estado <> 'error'`): cotizar sigue consumiendo el envío de ese pedido, y para vender de verdad se duplica. ⚠️ **Esa consecuencia ya NO se dice en la elección** (era la línea *"Si después lo compran, duplica…"*, que se fue con el párrafo). Se sigue diciendo el banner del candado post-envío. Es lo que costó sacar el párrafo, y queda escrito.
> - **Telegram sigue diciendo cuál fue** (📝 vs 📦, *"COTIZACIÓN enviada a Switch"* + *"No aparta mercancía"*), y **el pedido del LINK público no se tocó**.
> - **Mientras manda, las dos opciones DESAPARECEN** y queda el renglón del paso vivo: sin ventana de por medio, eso es lo que impide el doble toque (más el `enviandoRef` del detalle). Hay mutación.
>
> ### Una sola pieza para las 4 marcas y las 3 pantallas
>
> `src/components/catalogo/EnviarDocumentoSwitch.tsx` — **NO es un modal**: sin `createPortal`, sin `useBodyScrollLock`, sin `autoFocus`. Lo dibujan `CheckoutClient`, `PedidoDetalleClient` y `ConfirmacionClient`; **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok**. `ElegirDocumentoSwitch.tsx` **se BORRÓ** — dejarlo sin usar sería una segunda forma de mandar plata al ERP esperando a que alguien la vuelva a montar; hay test que exige que el archivo no exista.
> - **En el checkout las dos salidas bajaron del costado del total a un renglón propio a todo el ancho**: en 390 px dos opciones no entran al lado del monto.
> - **Textos que se podaron por quedar repetidos:** en el detalle, *"Elige pedido o cotización, y se crea de verdad en Switch"* → *"Se crea de verdad en Switch (…)"* (las dos salidas están a la vista con sus nombres). En la confirmación se fue el *"Reintentar envío a Switch"*: el estado ya lo dice arriba (*"El envío a Switch falló"* / *"Este pedido aún no se ha enviado"*).
>
> ### El Excel de Pedidos lleva los DOS números
>
> **«Catálogos › Administrar › Pedidos › Exportar»** bajaba un .xlsx **sin los números que la pantalla muestra desde el #593**. Ahora lleva **dos columnas nuevas, AL FINAL**: `N° pedido` y `Switch`.
> - 🔴 **AL FINAL, NO INTERCALADAS.** Daniel puede tener una planilla enganchada a ese archivo y mover una columna existente **se la corre entera**. Las 6 de siempre quedan donde estaban, en su orden, y el orden de las FILAS tampoco cambia. Hay mutación que intercala una columna y pone el build rojo.
> - 🔴 **El que no salió DICE que no salió**: `No se ha mandado a Switch`, **nunca un guion** (un guion en la columna de un número se lee como un cero o como un dato que no cargó). El del LINK sin convertir dice `Se numera al abrirlo`. **Es el criterio EXACTO de la pantalla porque es el MISMO módulo** (`numeros-pedido.ts`), no una copia: hay mutación que reescribe los textos a mano.
> - 🔴 **La columna de Switch dice si fue PEDIDO o COTIZACIÓN**: `Cotización en Switch: 16-000000506`. Con el número solo, las dos se ven iguales en una planilla.
> - **Los datos salen de las MISMAS dos consultas que `pedidos-unificado`** (envío activo + `order_number`, acotadas por los ids que la vista ya trajo), con el **escalón tolerante** del DDL `20260824160000`: sin la columna `documento` el Excel sale igual y todo se lee como pedido.
> - 🔴 **SIN LOS DATOS NO SE INVENTA:** si la vista no pudiera dar `id_natural`/`fuente`, el libro sale **como salía antes, con sus 6 columnas** (`conNumeros: false`). Escribir «No se ha mandado a Switch» en las 42 filas sin haberlo mirado sería una **mentira en una planilla**, que es peor que una columna que no está. Hay mutación.
> - **La banda de TOTALES crece con las columnas**: un `totals` más corto deja las dos últimas celdas sin celda y la banda se ve cortada justo donde están los números nuevos.
>
> ### Medición
>
> **`BASE=… MARCA=… PEDIDO_EDITABLE=… PEDIDO_EN_SWITCH=… node scripts/_medir-documento-directo-anchos.mjs`** — el navegador **ABORTA cualquier POST** a `/api/catalogo/checkout` y a `**/enviar-switch`. Ahora importa MÁS que antes: **tocar una opción MANDA**, así que ese candado es lo único que separa una medición de un pedido de verdad (el script ni las toca, pero medir no puede depender de que nadie se equivoque). **Escrituras bloqueadas: 0.**
>
> Contra el build de producción y con datos de producción, en las **4 marcas** y las **3 pantallas** (checkout · detalle · confirmación) + el detalle YA en Switch: **390 · 834 · 1024 · 1440 → 0 arrastre · 0 recorte · 0 táctil <44 px · 0 texto <12 px**, con las dos opciones y la etiqueta a la vista en los 4 anchos. Las opciones miden **175×56 px en el iPhone** y hasta 428×56 en escritorio: **crecen hacia abajo, no ensanchan nada**.
> - 🔴 **Y CONTRA `origin/main`, mismo build de producción y mismos datos**: `SOLO_PANTALLA=1` mide únicamente la pantalla entera y **corre el MISMO archivo en las dos ramas** (dos scripts distintos no comparan nada). Resultado en las 4 marcas × 4 pantallas × 4 anchos: **arrastre 0, recorte 0, textos <12 px 0 y los táctiles <44 px IDÉNTICOS** — tommy 3·21·1·2 · reebok 4·6·2·2 · joybees 4·2 · calvin 3·6·1·3, los mismos números en las dos. Lo único que se mueve es la ALTURA (el detalle de calvin queda **12 px más CORTO** que en main).
> - Los táctiles <44 px son los **PRE-EXISTENTES** (`← Inicio`, `← Catálogo`, el precio por pieza, `← Volver a Pedidos`, la `x` de quitar línea, `Ocultar de la lista`), en código que este cambio no toca.
> - 🩸 **Gotcha ya documentado y sigue vigente:** al usuario de medición **no le corresponde vendedor**, así que hay que elegirle uno además del cliente — si no, las salidas quedan apagadas **con razón** y no hay nada que medir.
> - 🩸 **El detalle bajo el candado post-envío NO ofrece salidas, y eso se mide como exigencia**: si aparecieran, se podría mandar dos veces.
>
> **🔴 EL EXCEL SE ABRE DE VERDAD, CON DOS PARSERS** (`BASE=… node scripts/_verif-excel-pedidos-numeros.mjs`, solo lectura): pide el archivo a la app corriendo, lo guarda, verifica la firma `PK` del zip y lo lee con **`xlsx-js-style`** y con **`jszip` + el XML crudo de `sheet1.xml`/`sharedStrings.xml`** — dos caminos que no comparten una línea de código. Medido en las 4 marcas: **48 filas, 96 celdas, 0 distintas entre los dos parsers**, columnas `… Fecha · N° pedido · Switch`, **13 pedidos dicen «No se ha mandado a Switch», 6 del link dicen «Se numera al abrirlo»**, y ni un guion. Un test que mire el workbook en memoria no prueba que el archivo salga bien.
>
> ### Candados
>
> `lib/documento-switch.test.ts` (la etiqueta, su largo, que el pedido NO la lleve, y que el modal viejo no exista) · **`components/pedido-cliente-obligatorio.test.tsx`** y **`components/pedido-un-toque.test.tsx`** (CONDUCTA: montan las pantallas REALES, tocan las opciones REALES y cuentan qué salió por `fetch`) · **`api/pedidos-export-numeros.test.ts`** (llama al handler del export, **abre el .xlsx que devuelve** y lee las celdas, en las 4 marcas) · `excel-exports-catalogos.test.ts` · `api/catalogo-paridad-enviar-switch.test.ts` · `lib/switch-envio-paralelo.test.ts`.
> - **Verificado por mutación, 36 de 36 cazadas** (`bash scripts/_mutar-candados-documento-directo.sh`): la etiqueta deja de decir que no aparta · vuelve a ser un párrafo · la cotización la pierde · el PEDIDO también la lleva (gemelos) · un documento inventado se acepta · el default se vuelve cotización · el control dibuja su propia lista · deja de dibujar la etiqueta · las salidas no se apagan sin cliente · el control no dice qué falta · las salidas siguen tocables mientras manda · el checkout / el detalle / la confirmación mandan sin ofrecer las dos salidas · el checkout y el detalle dejan de apagar la elección · **el SERVIDOR deja pasar una cotización sin cliente** · las dos rutas dejan de pasar el documento · todo sale como pedido · todo sale como cotización · el envío no guarda qué se mandó · el Excel pierde las dos columnas · **las columnas se INTERCALAN** · el que no salió vuelve a un guion · la columna de Switch deja de decir cuál fue · toda cotización se rotula como pedido · el Excel escribe los textos a mano · el del link vuelve a un blanco · la banda de totales se corta · la ruta del export no manda el número de la casa / el de Switch / qué se mandó · pierde el escalón tolerante del DDL · barre la tabla de orders entera · **sin `id_natural` el Excel inventa que nadie salió a Switch**.
> - 🩸 **DOS mutaciones no se cazaron en la primera corrida, y las dos enseñaron algo.** Una era del SCRIPT (patrón muerto: el texto no matcheaba, el archivo quedaba SANO y los tests pasaban) — por eso `mutar()` **denuncia el patrón que no muta** en vez de darlo por cazado, y exige que el archivo CAMBIE. La otra era un **candado flojo**: la banda de totales cortada no rompía nada porque ningún test miraba el ESTILO de las últimas celdas de esa fila.
> - 🩸 **La restauración va por COPIA, no con `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada — las mutaciones se apilarían y ninguna se probaría por separado.
> - ⚠️ **Las guardas del NAVEGADOR siguen sin ser verificables por mutación y se dice de frente**: React no despacha el click de un botón deshabilitado ni forzándole `disabled = false`. Son segunda capa; el candado que no se puede saltear es el 422 del servidor, y ése SÍ está mutado.
>
> ### Lo que NO se tocó
>
> El endpoint `/apicotizacion/terminar` y el motor único de envío · el 422 del cliente · `normalizarDocumento` · el at-most-once · el DDL `20260824160000` y su tolerancia · el aviso de Telegram · el pedido del LINK público · los dos números en la LISTA del admin (#593) · el resto de las columnas del Excel y el orden de las filas · el flujo de 3 toques, «Duplicar» y el modo pedido.


---

## 🔴 EL PANEL SE LLAMA «COMPROBANTES», Y SE LLEGA EN UN TOQUE (25-ago-2026)

> Daniel, textual: ***"al terminar un pedido, un botón para ver los comprobantes… o dejarlo volver a catálogo y ya en catálogo entras al panel de pedidos (debería de llamarse **comprobantes**, ya que dentro podrás ver las cotizaciones enviadas y los pedidos enviados)"***.
>
> El panel se llamaba «Pedidos» **cuando adentro solo había pedidos**. Desde el #579 un envío sale como PEDIDO o como COTIZACIÓN, así que adentro hay dos cosas y el rótulo viejo nombraba una sola.
>
> 🔑 **EL NOMBRE NO ES UNA OCURRENCIA: ES EL DE SWITCH.** Su propio panel llama **«Reportes de comprobantes»** a esa pantalla y los separa en **8 tipos** —Facturas/Notas · Transacción · Tiquete · Ventas · Pedidos · Cotización · Abonos · Cotización Email— (`docs/switch-panel.md`, extraído de la base pública de Switch el 25-ago-2026). Usamos la palabra del ERP contra el que cuadramos, no una nuestra.
>
> ### ⚠️ EL LABEL CAMBIA, LA LLAVE NO
>
> La `key` de la pestaña **sigue siendo `pedidos`**: `/catalogos/admin/<marca>?tab=pedidos`. Un marcador guardado tiene que seguir llegando, y la medición lo comprueba entrando **por esa URL** en las 4 marcas × 4 anchos. Es la misma decisión ya escrita dos veces en este repo: **Cheques→«Recordatorios»** (*"la key sigue siendo `cheques`"*) y **Asistencia→«Asistencia y Planilla»**.
> - **Y los pedidos internos SIGUEN llamándose pedidos cuando son pedidos**: el badge de la fila, «¿Eliminar pedido?», `order_number`, el `documento` de la API y la lista del vendedor (`/catalogo/<marca>/pedidos`, que se llama «Pedidos» a propósito) **no se tocaron**. Lo que cambió de nombre es el CONTENEDOR y su chrome: la pestaña, los vacíos («No hay comprobantes aún» · «Ningún comprobante coincide») y el contador del mes.
> - **«Comprobantes» no choca con ninguna ficha** de `modules.ts` — hay candado que compara contra las 29 etiquetas, sin tildes y en los dos sentidos (que ninguna sea igual y que ninguna la contenga), y que exige que **no aparezca una key nueva `comprobantes`** (sería un módulo sin fila en `role_permissions`).
> - **La hoja del Excel sigue llamándose «Pedidos» y el archivo también.** Daniel puede tener una planilla enganchada: renombrar la hoja la desengancha. Es el mismo criterio que puso las dos columnas nuevas AL FINAL.
>
> ### 🔴 ADENTRO SE FILTRA POR TIPO — TRES CHIPS, SIN «TODOS» (25-ago-2026)
>
> ```
> [ Pedidos ]  [ Cotizaciones ]  [ Borradores ]
> ```
>
> Daniel, textual: ***"entonces haz un tap de borrador, para q esté organizado. No quiero opción de todos."*** El panel **abre en «Pedidos»**, que es lo que más se mira.
>
> ~~`[ Todos 42 ] [ Pedidos 30 ] [ Cotizaciones 2 ] [ Sin mandar 10 ]`~~ — **SUPERADO**: se fue «Todos» y **«Sin mandar» pasó a «Borradores» CAMBIANDO DE CRITERIO**.
>
> #### 🔴 «BORRADORES» NO ES «SIN MANDAR»: SON DOS PREGUNTAS DISTINTAS
>
> El balde viejo preguntaba *"¿salió a Switch?"*. El nuevo pregunta *"¿está terminado?"* — **`status = 'borrador'`**, lo que la tabla de orders dice y lo que el checkout cambia a `'confirmado'`. **Y hay un caso REAL en producción donde se separan:**
>
> ```
> reebok  PED-018  Hafez, S.A.  $2.520  status='borrador'  Y EN SWITCH como pedido
> ```
>
> un pedido que salió al ERP y cuyo `status` nunca se cerró (el update del checkout tiene reintento). Con el criterio viejo caía en «Pedidos»; con el nuevo cae en «Borradores», que es lo que Daniel pidió ver. **Y al revés**: reebok y calvin tienen un `confirmado` cada uno que NUNCA salió — con el criterio viejo caían en «Sin mandar» y ahora caen en «Pedidos».
>
> #### 🔴 LOS TRES CHIPS PARTICIONAN — ES LO QUE PERMITE QUE «TODOS» SE VAYA
>
> **Esto no es un detalle.** Con «Todos» en la fila, una fila que no encajara en ningún criterio seguía siendo alcanzable. **Sin «Todos», una fila sin chip es una fila INVISIBLE** — y en producción hay **8 filas vivas** que ningún criterio estricto atrapa: los **6 pedidos del LINK sin convertir** (5 reebok + 1 joybees) y **2 confirmados que nunca salieron**. Por eso **«Pedidos» es el balde de RESTO**, y por eso hay candado que exige que la suma de los tres dé SIEMPRE el total y que cada fila caiga en **exactamente un** chip.
>
> El orden de decisión es **borrador → cotización → pedido**: el borrador gana sobre todo (no está terminado, da igual dónde esté).
> - ⚠️ **Y la fila SIGUE diciendo la verdad línea por línea**: `textoEnSwitch` no se tocó, así que un pedido del chip «Pedidos» que no salió sigue leyéndose *«No se ha mandado a Switch»*. **El chip organiza; la fila informa.**
> - **Cero consultas nuevas.** `documento` viaja en la fila desde el #593 y **`status` desde el #607, en la MISMA query que ya traía `order_number`**. La base está en compute Micro. Hay mutación para el caso "se pide en una consulta aparte".
> - 🩸 **EL `.in("id", orderIds)` DE ESA QUERY ES EL FILTRO DE VIDA, no una optimización.** `orderIds` sale de la VISTA, que descarta `deleted = true`. Barrer la tabla entera traería los **67 pedidos borrados** y el chip contaría contra **110 en vez de 43** — el error que ya se cometió una vez con este mismo dato. Hay mutación.
> - **Escalón tolerante también para `status`**: si la columna faltara, la lectura se reintenta sin ella y **nada queda marcado como borrador** (la lista nunca se cae). El del DDL `20260824160000` (`documento`) sigue valiendo. 🩸 Ese sí perdió su mutación **a propósito**: con «Pedidos» de balde de resto la tolerancia dejó de ser una rama que se pueda romper — se intentó y SOBREVIVIÓ con razón, y contarla habría sido inventar una verificación. El lado positivo tiene candado.
> - **El vacío mira si el PANEL está vacío, no si hay un filtro puesto.** Sin «Todos» el filtro SIEMPRE está puesto, y la condición vieja habría dicho *«Ningún comprobante coincide»* hasta con cero comprobantes en la marca. Hay mutación.
> - **Se cruza con el filtro de ORIGEN** (Todos · Del link · Míos), que **NO se tocó** — ése conserva su «Todos». Hay test que toca los dos.
> - **Sin avisos y sin borrado automático.** Daniel: *"no quiero q me avises nada. Que no se borre automático por ahora."*
> - 🔴 **NO ES UNA COLUMNA NUEVA**: la fila de filtros va ARRIBA de la tabla, que conserva **exactamente sus 6 columnas** — el ancho del iPad acostado (1024) no se movió ni un píxel (medido, ver abajo).
>
> **Medido en producción el 25-ago-2026, los tres chips en las 4 marcas × 4 anchos, tocando cada uno y contando las filas que quedan:**
>
> | marca | Pedidos | Cotizaciones | Borradores | = filas vivas |
> |---|---:|---:|---:|---:|
> | reebok | 17 | 0 | **2** | 19 |
> | tommy | 17 | 1 | **3** | 21 |
> | joybees | 5 | 0 | **0** | 5 |
> | calvin | 3 | 0 | **1** | 4 |
>
> 🩸 **Las «filas vivas» del PANEL son 49, no 43.** 43 son los pedidos vivos de las tablas `<marca>_orders` (14 · 21 · 4 · 4); el panel muestra ADEMÁS los **6 pedidos del link sin convertir** que la vista unificada trae. Los **6 borradores** sí son exactamente los 6 medidos: `PED-018` · `PED-019` · `TOM-005` · `TOM-006` · `TOM-023` · `CKP-007`.
>
> **Verificado por mutación, 32 de 32 cazadas** (`bash scripts/_mutar-candados-borradores.sh`): vuelve «Todos» · el filtro deja pasar todo · «Borradores» vuelve a llamarse «Sin mandar» · el panel deja de abrir en «Pedidos» · **«Borradores» vuelve al criterio viejo de «nunca se envió»** · nada/todo es borrador · el del link se cuenta como borrador · el status deja de tolerar mayúsculas · **PED-018 se cuenta como PEDIDO (orden invertido)** · **«Pedidos» deja de ser el balde de resto (filas invisibles)** · los chips dejan de ser disjuntos · **la API barre orders SIN filtrar por ids (el chip cuenta filas borradas)** · el status no viaja · se pierde el escalón · los conteos sobre lo ya filtrado · el filtro pisa al de ORIGEN · la tabla gana una columna · el vacío vuelve a mirar el filtro.
>
> ### 🔴 DE LA CONFIRMACIÓN A LA LISTA: 4 TOQUES → 1, Y EL DESTINO DEPENDE DEL ROL
>
> 🩸 **EL BOTÓN NO PUEDE SER UNO SOLO.** La confirmación la ven los **tres** roles que arman pedidos (`createRoles` = admin, secretaria y **vendedor**), y `/catalogos/admin/<marca>` es de `CATALOGO_ADMIN_ROLES` (admin + secretaria): mandar ahí a un vendedor es mandarlo a una pantalla cuyas peticiones mueren en **403** en el servidor.
>
> | rol | destino | antes | después |
> |---|---|---:|---:|
> | admin · secretaria | `/catalogos/admin/<marca>?tab=pedidos` — **«Ver comprobantes»** | **4** | **1** |
> | vendedor | `/catalogo/<marca>/pedidos` — **«Ver pedidos»** | **2** | **1** |
>
> **Los toques se contaron TOCANDO**, no estimando: el script drivea los clics uno por uno en las 4 marcas y verifica dónde terminó. El camino viejo del admin era `← Inicio` · `Catálogos` · `Administrar` · pestaña `Pedidos`; el del vendedor, `Volver al catálogo` · `Pedidos`.
> - **El destino y su rótulo salen del MISMO lugar** (`lib/catalogo/destino-comprobantes.ts`, módulo puro): un `href` y un `label` que se puedan separar son exactamente un botón que dice una cosa y lleva a otra. Hay mutación para el caso.
> - 🩸 **El default es la lista que NO rebota.** Un rol desconocido, vacío o todavía sin leer de `sessionStorage` va a `/catalogo/<marca>/pedidos`. El modo de fallo aceptable es mandar a alguien a una lista que puede ver, nunca a una que le va a dar 403.
> - `adminHref` pasó a vivir en **`MARCA_THEME`** (las 4 marcas), para que el botón y el «Administrar» del hub salgan del mismo lugar. Hay candado que compara los dos.
> - **El techo de 3 acciones de la confirmación (5-jul) sigue valiendo en el camino normal**: con el pedido ya en Switch no hay «Enviar», así que quedan exactamente tres. Las cuatro solo aparecen cuando el envío falló o todavía no salió, y ahí «Enviar» es lo que la persona vino a hacer. **«Ver PDF» y «Volver al catálogo» no se tocaron.**
>
> ### Y CUATRO TEXTOS QUE SE FUERON (aprobados por Daniel uno por uno)
>
> | dónde | lo que decía |
> |---|---|
> | `CheckoutClient` + `PedidoDetalleClient` | *"La venta se le acredita a esta persona."* — el rótulo dice **Vendedor** y debajo está el nombre |
> | `PedidoDetalleClient` (pie del envío) | *"Se crea de verdad en Switch (BOSTON). Si sale mal, hay que borrarlo a mano en el panel de Switch."* — las dos salidas están a la vista con sus nombres |
> | `PedidoDetalleClient` (modal de ocultar) | *"El pedido sigue en Switch como #4821 — aquí solo se oculta de la lista. Para anularlo de verdad, hazlo en el panel de Switch."* |
> | `CatalogoFilters` | *"Escribe un precio y ves solo ese. El «hasta» se llena solo."* — los campos ya dicen desde/hasta |
>
> 🔴 **SE FUE EL PÁRRAFO, SE QUEDÓ EL DATO.** Del modal de ocultar sobrevive el **número**: el título ya pregunta *"¿Ocultar … de la lista?"* y el botón que lo abre dice *"Ocultar de la lista (el pedido sigue en Switch)"*, así que lo único que el párrafo traía y no estaba en ningún otro lado era `#16-000000503` — y eso no es explicación, es con lo que se busca en Switch. Queda como `En Switch como #16-000000503.`
>
> 🔴 **LO QUE **NO** SE PODÓ, y que nadie lo "termine" después** — los tres tienen candado propio en la sección `EN_PANTALLA` de `poda-textos-cxc-multifashion.test.ts`, y mutación:
> - **`no aparta mercancía`** pegado al botón de Cotización: **no es explicación, es el dato** que decide cuál se toca. Sigue con su candado de LARGO (≤4 palabras, ≤24 caracteres).
> - **"Este pedido reemplaza al PED-XXX. Borra el pedido #… en el panel de Switch para no duplicar"**: frena una acción.
> - **"No tienes vendedor de Switch asignado"**: es la salida de un 422, no una descripción.
>
> ### Medición
>
> **`BASE=… ETAPA=despues node scripts/_medir-comprobantes-anchos.mjs`** — el navegador **ABORTA cualquier petición que no sea GET/HEAD**. Esta medición pasa por pantallas con botones de borrar, de exportar y de **MANDAR A SWITCH**, y desde el 25-ago tocar una salida MANDA sin ventana en el medio: el script no las toca, pero medir no puede depender de que nadie se equivoque. **Escrituras bloqueadas: 35 · mandadas a Switch: 0.**
>
> Contra el build de producción, con datos de producción, **4 marcas × 4 anchos (390 · 834 · 1024 · 1440)**, con TODOS los meses desplegados, y **CONTRA `origin/main` corriendo EL MISMO ARCHIVO** (`ETAPA=antes`; dos scripts distintos no comparan nada):
>
> | panel, por marca | arrastre | recorte @390 | recorte @834/1024/1440 | táctil <44 | texto <12 |
> |---|---:|---:|---:|---:|---:|
> | `origin/main` | 0 | 217 · 209 · 218 · 214 | **0 · 0 · 0** | 57 · 3 · 63 · 12 | 0 |
> | esta rama | 0 | 217 · 209 · 218 · 214 | **0 · 0 · 0** | 57 · 3 · 63 · 12 | 0 |
>
> **Re-medido el 25-ago-2026 con los TRES chips: los recortes siguen IDÉNTICOS** (217 · 209 · 197 · 218 · 214), 0 arrastre en las 16 celdas, **6 columnas** en las 4 marcas × 4 anchos, y el alto de la caja de chips **no cambió** (96 px en 390, 44 px en 834/1024/1440 — los mismos que con cuatro). Los táctiles del contenedor bajan (reebok 57→51, tommy 63→51) **solo porque el chip por defecto muestra menos filas**, no por markup nuevo. **1 toque de la confirmación a la lista en las dos etapas.**
>
> **IDÉNTICO en las 16 celdas**: la fila de filtros vive ARRIBA del contenedor de la tabla, así que la caja que se mide no cambió ni un píxel. El recorte de 390 px es el `overflow-x-auto` que la tabla ya declaraba —arrastrarla ES el mecanismo— y está en main igual. Los táctiles <44 son los **PRE-EXISTENTES** (las casillas de 16 px y los botones «Editar»/«Eliminar» de 28 px de alto), en código que este cambio no toca.
>
> **La confirmación crece 56 px hacia ABAJO y nada más** (main 396/319/319/319 → esta rama 452/375/375/375; Calvin 439/383 → 495/439): **0 arrastre · 0 recorte · 0 táctil <44 · 0 texto <12** en las 4 marcas × 2 roles × 4 anchos, con el botón a la vista en los cuatro.
>
> **El filtro se toca y se comprueba que FILTRA**: en cada marca y cada ancho el script toca «Pedidos», «Cotizaciones» y «Borradores» y exige que las filas visibles sean **exactamente** el número que el propio chip muestra.
> - 🔴 **Y que los tres SUMEN el universo vivo — que ya no se puede leer de la pantalla.** Sin «Todos», las filas que se ven al cargar NO son el universo (son solo los pedidos). La vara se pide aparte a `/api/catalogo/<marca>/pedidos-unificado`, que lee la vista (`deleted = false`), y contra ÉSA se compara la suma. **Si algún criterio dejara una fila afuera, el medidor lo dice.**
> - **El chip «Borradores» se compara contra el `status` de la base, fila por fila**, con los números de pedido en el mensaje de error: si diera otra cosa, estaría contando filas borradas.
> - 🩸 **El «antes» se venció y daba 20 rojos que no eran del cambio.** `ETAPA=antes` exigía que la pestaña dijera «Pedidos» y contaba el camino de 4 toques — **pero el #603 YA está en `origin/main`**, así que main dice «Comprobantes» y tiene el botón de un toque. Se corrigió: las dos etapas esperan lo mismo y **lo único que las separa es el filtro** (`antes` = 4 chips con «Todos» · `despues` = 3 sin él). Un baseline vencido acusa al cambio de algo que ya estaba.
> - 🩸 **Gotcha de medición que daba rojo por nada:** por defecto solo se abre el mes ACTUAL y **los 19 pedidos de Reebok son de julio** — el "¿llegué a la lista?" no puede preguntar por un `<table>`, porque con todos los meses cerrados no hay ninguno. Se pregunta por el filtro por tipo (o, en `antes`, por el buscador).
> - 🩸 **El contador del mes dice «pedidos» en `origin/main` y «comprobantes» acá**: el selector acepta LOS DOS, o `ETAPA=antes` no encontraría un solo mes y el rojo sería del renombre, no de la caja.
>
> ### Candados
>
> **`lib/comprobantes-nombre-y-tipo.test.ts`** (el nombre, la llave congelada, el choque de labels contra `modules.ts`, `tipoComprobante`, los conteos y el destino por rol) · **`components/comprobantes-panel.test.tsx` (CONDUCTA: monta la pestaña REAL y la confirmación REAL en las 4 marcas, TOCA los filtros, lee el DOM, cuenta las `<th>` y verifica que el vendedor no tenga NI UN enlace a `/catalogos/admin/`)** · `poda-textos-cxc-multifashion.test.ts` (los 4 textos que se fueron + los 3 que se quedan) · `lib/numeros-pedido.test.ts` · `components/pedidos-numeros-en-la-lista.test.tsx` · `lib/catalogo-roles.test.ts`.
> - **Verificado por mutación, 38 de 38 cazadas** (`bash scripts/_mutar-candados-comprobantes.sh`): la pestaña vuelve a llamarse «Pedidos» · **la key cambia y rompe el marcador** · el shell escribe el label a mano · el shell deja de dibujar la pestaña · los dos vacíos vuelven a hablar de pedidos · **el que no salió se cuenta como PEDIDO** · **toda cotización se cuenta como pedido** · se pierde el escalón tolerante del DDL · todo se cuenta como cotización · el filtro deja pasar todo · «Cotizaciones» y «Sin mandar» desaparecen · los conteos dejan afuera a los que no salieron · los conteos se quedan en cero · la pantalla esconde el filtro · la pantalla dibuja su propia lista · **el filtro se ignora al filtrar** · el filtro pisa al de ORIGEN · los conteos se calculan sobre lo ya filtrado · **la tabla gana una columna** · el vacío se escribe a mano · **el VENDEDOR sale apuntado al admin (403)** · el ADMIN pierde el panel · los roles se invierten · el rótulo y la dirección se separan · el destino pierde el `?tab=pedidos` · la confirmación pierde el botón · escribe la dirección a mano · deja de leer el rol · el `adminHref` de una marca apunta a otra · **vuelven los 4 textos podados** · **se borran los 2 avisos que se quedan**.
> - 🩸 **DOS mutaciones sobrevivieron en la primera corrida, y las dos eran candados flojos, no falsos positivos**: esconder el filtro con `hidden` y esconder el botón de la lista con el atributo `hidden` dejaban los elementos EN el DOM, y los tests los encontraban con `getByText`. Se arreglaron leyendo la capa que sí distingue: `getAllByRole` (que descarta `hidden`/`aria-hidden`) más un chequeo explícito de las clases que esconden. **Existir en el DOM no es estar en pantalla.**
> - 🩸 **La restauración del script va por COPIA, no con `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada — las mutaciones se apilarían y ninguna se probaría por separado. Y **no hay delimitador**: los textos viajan como ARGUMENTOS a python (argv), no dentro de un `s|de|a|` de sed — el código real tiene `||`, `/` y `#`, y cualquier delimitador se des-escapa, se come el archivo y deja un "SOBREVIVIÓ" falso.
>
> ### Lo que NO se tocó
>
> El **422 sin cliente** leído ANTES del documento · `normalizarDocumento` cayendo a PEDIDO ante cualquier basura · el **at-most-once** `(order_id) WHERE estado <> 'error'` · el aviso de Telegram (📝 vs 📦) · el pedido del **LINK público** · el motor único de envío y `/apicotizacion/terminar` · los dos números de la lista (#593) · el Excel, su hoja «Pedidos», sus columnas y el orden de las filas · la lista del vendedor y su «← Volver a Pedidos» · el modal de eliminación masiva · **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok**.


---

## 🔴 Pedidos — EL CLIENTE SE ELIGE, NUNCA VIENE PUESTO (14-ago-2026)

> El checkout del catálogo nacía con **`Contado` PUESTO** y "Enviar a Switch" no exigía tocar nada: se armaba el pedido, se apretaba, y salía a nombre de Contado sin que nadie lo notara. Daniel, textual: ***"Que arranque vacío y el botón apagado hasta elegir cliente."***
>
> 🩸 **EL DATO, medido contra producción y reproducido al centavo** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pedidos-sin-cliente.ts`, solo lectura): **18 de 33 pedidos vivos (55%) sin cliente real · 15 ya confirmados y en Switch por $53.124**, ocho de $1.000 o más (TOM-002 $16.920 · TOM-017 $16.722 · TOM-003 $7.254 · PED-017 $2.760 · PED-006 $2.100 · CKP-005 $1.704 · TOM-001 $1.584 · PED-015 $1.560). **Ninguno era venta de mostrador**, y los 18 son INTERNOS — ni uno del link.
>
> ⚠️ **"Sin cliente real" son DOS formas del mismo olvido:** `cliente_switch_id` en NULL (4 pedidos) **o** apuntando al cliente de mostrador (14). Contar solo los NULL da 4 de 33 y esconde el problema.
>
> ### Las dos mitades del arreglo
>
> **1. El checkout arranca VACÍO.** `useState<Cliente | undefined>(undefined)`, la caja dice **"Elige el cliente"** en ámbar y el botón va apagado **diciendo qué falta** (*"Falta: elegir el cliente"*, el patrón de Guías: apagado Y explicado, no un toast por vez). 🔴 **Contado NO desaparece** — sigue primero en la lista, rotulado **"Contado (venta de mostrador)"** con todas las letras, pero hay que TOCARLO; dejó de decir "(default)" porque ya no lo es.
>
> **2. En el detalle el cliente es UNO SOLO.** Había DOS nombres que no se hablaban: el título era un `<input>` de texto libre con sugerencias y más abajo una caja aparte "Cliente de Switch" cuyo "Cambiar" NO tocaba el título. Medido: **PED-004 quedó con `client_name = "CITY MALL PASO CANOA"` y `cliente_switch_id = null`** — el nombre correcto en pantalla y NINGÚN cliente atrás. Ahora manda el picker: al elegir se guarda el cliente **y** se escribe el título (por `clientNameRef`, el mecanismo que este archivo ya usa para que el guardado nunca mande un valor viejo).
>
> ### ⚠️ LA EXCEPCIÓN REAL: EL LINK PÚBLICO, y no se rompe
>
> En un pedido del link no hay sesión que aporte cliente: la persona escribe su nombre a mano y el sistema le asigna el mostrador de la empresa (`publico-switch-actor`, código TCKCTA). **Eso es la regla del sistema, no un olvido** — medido: **PED-022 vive con `client_name = "Nathalie"` y `cliente_switch_id = 1`**. Ahí el texto libre se queda y el envío no se traba.
> - **El origen se mira por `origen_original` Y por `origen_short_id`**, nunca por uno solo: el primero solo viaja en el select base de **Reebok**, así que mirarlo solo dejaría a Joybees/Tommy/Calvin leyendo un pedido del link como interno y **cerrándole el campo al cliente**.
>
> ### 🔴 EL CANDADO QUE NO SE PUEDE SALTEAR VIVE EN EL SERVIDOR
>
> `handlePostEnvio` responde **422** si un pedido interno no tiene cliente. Hacía falta porque justo debajo hay **tres redes que INVENTAN un cliente cuando falta** (el fallback del piloto Reebok y `resolvePublicoSwitchActor`) — exactamente cómo los 15 pedidos se fueron a Switch. **Esas redes NO se retiran**: siguen sirviendo para el pedido del link, que es para lo que se hicieron.
> - ⚠️ **Un candado viejo CAMBIÓ DE DIRECCIÓN**: `catalogo-paridad-enviar-switch.test.ts` exigía que un pedido interno sin cliente cayera al Contado del piloto. **Eso ERA el agujero.** Ahora exige 422, y un test nuevo (con `origen_short_id`) prueba que el fallback sigue vivo para el link.
> - ⚠️ **Los `return` de guarda del NAVEGADOR son segunda capa y NO son verificables por mutación**: React no despacha el click de un botón deshabilitado ni forzándole `disabled = false` (medido). Está dicho así en el código; el candado es el del servidor.
>
> ### 🔴 CONTADO PASA A USAR EL ID REAL — y el destino NO se movió
>
> `null` significaba las DOS cosas a la vez ("elegí mostrador" / "nadie eligió"), y con esa ambigüedad no hay forma de exigir una elección deliberada. Ahora `GET /[marca]/clientes-switch` devuelve el `contado` de la empresa (código **TCKCTA**, el mismo que ya usa el link público) y elegirlo guarda un id.
> - **Verificado en las 4 empresas antes de mergear** (`scripts/_diag-contado-por-empresa.ts`, solo lectura): TCKCTA es **único** en cada una, **es el id 1 en las cuatro** (o sea que el cambio **no mueve el destino**, es idéntico al `1` escrito a mano), **no hay ningún otro cliente con nombre confundible** (0 candidatos), y las cuatro tienen facturación real de mostrador: `active_shoes "Contado"` 43 · `joystep "Contado"` 65 · `fashion_shoes "VENTAS LOCA"` 388 · `vistana "VENTAS"` 500 facturas.
> - 🩸 **La primera medición dijo "0 facturas" en las 4 y era EL SCRIPT**: preguntaba por `cliente_id`, columna que no existe (es `cliente_switch_id`), y devolvía 0 **sin error visible**. Un cero que parece un dato y no es ninguno.
> - **El mostrador se dice SIEMPRE con la misma frase** aunque en Switch cada empresa lo llame distinto: se toca "Contado (venta de mostrador)" y eso mismo se ve después. El nombre que viaja a Switch NO sale de ahí — lo lee el servidor del directorio.
> - **Efecto en las 4 marcas**: el picker es compartido, así que Reebok · Joybees · Tommy · Calvin se comportan igual. **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok.**
>
> ### Medición
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con pedidos REALES** (`BASE=… node scripts/_medir-cliente-pedido-anchos.mjs`, solo lectura, 5 estados): **390 · 834 · 1024 · 1440 → las cajas del cliente dan 0 px de arrastre, 0 recorte, 0 táctil <44 y 0 texto <12px** en los 20 casos. El script **falla** si no encuentra "Elige el cliente", el "Falta:", el botón apagado o el nombre del pedido del link.
> - 🔴 **Los tocables <44px que quedan en el resto de la pantalla se COMPARARON contra `origin/main`** (`scripts/_medir-tactiles-comparar.mjs`, mismo script en las dos ramas): **main 42 · esta rama 39**, y la ÚNICA diferencia es que este cambio **quitó 3** (el input de texto libre del pedido interno). Todo lo demás —`← Catálogo`, `← Volver a Pedidos`, la `x` de quitar línea, `Eliminar pedido`, el precio por pieza y **los inputs de cantidad de 48×26 / 56×26**— está **idéntico en main: es PRE-EXISTENTE y NO se tocó** (Daniel no aprobó arreglarlo; los inputs de cantidad son el hallazgo conocido de Tommy/Calvin/Joybees).
> - 🩸 **Dos falsos hallazgos del MEDIDOR, no del producto:** `innerText` **no incluye el valor de un `<input>`**, así que acusaba al pedido del link de haber perdido "Nathalie" con el campo escrito; y el caso "pedido del link EDITABLE" **no se puede simular en el navegador** — al neutralizar el candado de Switch el autoguardado dispara un PUT, el SERVIDOR (que sí sabe que el pedido está en Switch) responde 409 y el candado vuelve. Se retiró del script y se dice de frente: ese caso lo cubre el candado de conducta. **En el estado REAL no sale ningún PUT, ni acá ni en main** (medido en las dos ramas).
>
> ### Candados
>
> `src/__tests__/components/pedido-cliente-obligatorio.test.tsx` (19) y `cliente-elegido.test.ts` (16). **Son de CONDUCTA**: renderizan las pantallas reales, tocan los botones reales y cuentan qué salió por `fetch` — el `disabled` y el `return` se pueden mutar sin cambiar una palabra del archivo.
> - **Verificado por mutación, 16 de 16 cazadas** (`bash scripts/_mutar-candados-cliente-pedido.sh`): el checkout vuelve a arrancar con Contado · el botón deja de exigir lo que falta · deja de decir qué falta · Contado vuelve a un id escrito a mano · el detalle deja mandar sin cliente · elegir cliente deja de escribir el título · vuelve el texto libre en los internos · el picker vuelve a preseleccionar el mostrador · **el SERVIDOR deja pasar un pedido sin cliente** · el servidor deja de leer el origen · el origen se mira solo por `origen_original` · el pedido del link se traba · `null` vuelve a contar como elegido · el selector ignora el mostrador real · las dos etiquetas.
> - 🩸 **LA PRIMERA CORRIDA DIO 16/16 **MINTIENDO**.** El script restauraba con `git checkout` y `cliente-elegido.ts` es un archivo NUEVO: git **aborta el comando entero** y no restaura NADA, así que las mutaciones se **apilaban** y ninguna se probó por separado. Con restauración por copia el resultado honesto fue **13/16**, y las 3 brechas se cerraron (una era un barrido de texto cuyo regex no matcheaba nunca). **Un verificador que miente en verde es peor que no tenerlo.**
>
> ### 🔴 Lo que NO se tocó
>
> El flujo de ~10 toques a 3 (#504/#506/#508/#509) · **Duplicar sigue preguntando el cliente y agregándolo DE UNA, sin botón de confirmar** · el modo pedido `?agregarA=` · **los 15 pedidos que ya están en Switch NO se corrigen desde acá** (es data en Switch y la decide Daniel aparte) · y nada más del informe de auditoría (precio por pieza/bulto, ITBMS, cantidad escribible en el catálogo público, renombrar los productos de Tommy).


---

## 🔴 Catálogos — EL CÓDIGO DESEMPATA EL ORDEN, y el público ordenaba DISTINTO que el vendedor (17-ago-2026)

> Daniel, mirando el catálogo de **Calvin**: los productos `KCMEENA683`, `KCMEENA004`, `KCMEENA-A210` y `KCMEENAA962` salían **desperdigados** entre los `HW0HW…` y los `KCTO…` en vez de juntos.
>
> 🩸 **LA CAUSA: el orden "Relevancia" ordena por categoría → género → NOMBRE, y los cuatro se llaman igual (`Women-Flip Flops`).** Al empatar el nombre, el orden final quedaba **como viniera de la base**, o sea arbitrario. **El código nunca se miraba.**
>
> **El nombre no distingue, así que tampoco puede ordenar. Medido contra producción el 17-ago-2026:** Tommy tiene **498 productos con solo 19 nombres distintos** (103 dicen `Women-Sneakers`, 99 `Women-Flip Flops`) y Calvin **81 con 5**. O sea que en Tommy **el 100% de las tarjetas empata con alguna otra**.
>
> ### El arreglo: el SKU es el desempate FINAL
>
> `compararCodigos()` (`src/lib/catalogos/orden-codigo.ts`, módulo PURO) va **al final de todo**, después de categoría, género y nombre. **No mueve nada que hoy no empate**, y está medido: la secuencia de SECCIONES es idéntica antes y después en las dos marcas — ningún producto sale de su categoría/género.
> - **También en "Nombre A-Z"**, donde el empate es todavía más obvio.
> - 🔑 **Y también en "Precio: menor a mayor" y "mayor a menor".** Dos productos del mismo precio también quedaban arbitrarios; es el mismo defecto y va al final igual, así que no cambia el orden de nada que tenga precios distintos.
> - 🔴 **SON CUATRO `.sort()`, no uno.** Cada pantalla tiene **DOS pipelines** —la lista plana y los GRUPOS (`groupByModel`, que es como se dibuja Joybees)— y el de grupos desempata por el `baseSku` del grupo. Tocar uno solo dejaba la vista agrupada igual de desordenada; hay candado por mutación para los cuatro.
>
> ### 🔴 HALLAZGO — el MISMO catálogo salía en orden DISTINTO según quién lo mirara
>
> Medido en el navegador contra `origin/main`, mismo build, mismos datos, catálogo de Calvin:
>
> | | vendedor `/catalogo/calvin` | público `/catalogo-publico/calvin` |
> |---|---|---|
> | dónde caen los 4 `KCMEENA` | repartidos entre **#25 y #33** | repartidos entre **#12 y #31** |
> | orden entre ellos | `683 · 004 · -A210 · A962` | `A962 · 004 · 683 · -A210` |
>
> **El código de orden de las dos pantallas era idéntico byte a byte** — lo que difería era el orden en que cada endpoint devolvía las filas, y al empatar el nombre ESE orden era el que mandaba. O sea: el vendedor compartía un link y el cliente veía el mismo catálogo en otro orden. En Tommy el efecto es mayor: la familia `FW0FW08…` salía en **44 corridas** en el público contra **9** en el vendedor, y las dos desordenadas. **Ahora las dos dan #28–#31 y el mismo orden.** No se unificó nada a la fuerza: el desempate hace que el orden deje de depender de la base, y con eso las dos superficies coinciden solas.
>
> ### ⚠️ El ADMIN ordena distinto A PROPÓSITO — se dice, no se fuerza
>
> `/catalogos/admin/[marca]` **no** usa el orden del catálogo: ordena por NOMBRE a secas, y la vista de lista pone primero lo que tiene stock. Es una **cola de trabajo, no una vitrina** (se entra a subir fotos, no a vender), así que ese criterio **no se tocó** — unificarlo con el catálogo es una decisión de Daniel, aparte. Lo que sí se le puso es el mismo **desempate por código**, porque tenía el mismo defecto: con 19 nombres para 498 productos, "ordenado por nombre" dejaba bloques enteros en el orden de la base. En `ProductosTarjetas` era peor todavía — `localeCompare(…, { sensitivity: "base" })` devuelve **0** para todo un bloque de nombres iguales, así que no era orden alfabético de nada.
>
> ### 🔑 LA COMPARACIÓN ES CRUDA Y EN MAYÚSCULAS — se REUSÓ, no se escribió de nuevo
>
> El repo ya tenía esta decisión tomada en `ordenarCodigosAZ` (`fotos-faltantes.ts`, el Excel de la plantilla B2B): **nada de `localeCompare` con opciones**, porque el resultado tiene que ser el mismo en el navegador de Daniel, en Node y en el test, y **las tablas de ICU no lo garantizan**. El cuerpo se **MUDÓ** a `orden-codigo.ts` sin reescribirlo y `ordenarCodigosAZ` ahora lo importa: dos formas de ordenar un código es una que se corrige y otra que se queda vieja.
>
> 🔴 **EL GUIÓN NO SE QUITA, Y ESTÁ MEDIDO, NO SUPUESTO.** Tentaba normalizar (`KCMEENA-A210` contra `KCMEENAA962`), pero al ordenar los **579 SKU reales** de Calvin + Tommy en crudo, **los 41 códigos con guión ya caen pegados a su propia familia**: `KCMEENA-A210` justo antes de `KCMEENA004`, `T1A8-32600-313` justo antes de `T1A8-32600313`, `FW0FW06158-DW5` entre `FW0FW06149-DW5` y `FW0FW06447DW5`. Quitarlo sería maquinaria que no cambia **ni un caso real** y que estrenaría una segunda idea de "qué es el mismo código" al lado de la regla de fotos, donde pegar por parecido está **PROHIBIDO** a propósito (la lección de `Outlet Duty Free N2` vs `N3`). Tampoco es numérico (`numeric: true` / `Intl.Collator`): los segmentos de estos SKU son de ancho fijo, así que en crudo `T30400-800 < T30408-800 < T30547-800` ya sale bien, y la comparación numérica es justo la que depende del entorno.
>
> ⚠️ **Una familia PUEDE quedar partida y estar BIEN.** `FW0FW08…` vive en **5 secciones** de Tommy (sneakers · flip_flops · sandals · shoes · slippers de mujer) y se parte donde cambia la sección, porque **categoría y género le ganan al código**. Medido: de las familias que quedan partidas después del cambio, **el 100% cruza sección** — dentro de una sección no queda ninguna.
>
> ### La medición
>
> **Contra producción, el caso de Daniel** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-catalogo-orden-codigo.ts`, solo lectura, corre el `.sort()` REAL sobre las filas reales):
>
> | | Calvin (81 prod, 5 nombres) | Tommy (498 prod, 19 nombres) |
> |---|---|---|
> | los 4 `KCMEENA` | **#17 · #22 · #37 · #39 → #32 · #33 · #34 · #35** | — |
> | familias (prefijo 7) partidas | **15/18 → 2/18** | **33/38 → 11/38** |
> | secuencia de secciones | **idéntica ✅** | **idéntica ✅** |
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción, con datos de producción y CONTRA `origin/main`** (`BASE=… node scripts/_medir-catalogo-orden.mjs`, solo lectura, 4 superficies × 4 anchos): **390 · 834 · 1024 · 1440 → 0 px de arrastre en los 16 casos**, y los `KCMEENA` **pegados en #28–#31 en los cuatro anchos, en el vendedor Y en el público**. Los recortes (el `DIV.space-y-3` de los filtros a 1024+), los tocables de 217×38 ("Agregar" a 1440) y los textos de 10 px ("Bulto de 12") son **PRE-EXISTENTES y salen IDÉNTICOS en main, uno por uno**: este cambio **no agrega ni quita un solo elemento del DOM** — reordena tarjetas dentro de un `grid-cols-2 sm:3 lg:4 xl:5`, donde el ancho de la columna lo pone el contenedor (`1fr`), no el contenido.
> - 🩸 **Gotcha de medición que daba 0 elementos y verde sin haber mirado nada:** `CatalogoAuthGuard` **NO mira el rol** — mira `sessionStorage.fg_modules`. Sin sembrarlo, la pantalla del vendedor redirige al login y el script mide una pantalla vacía. Por eso **falla** si encuentra menos de 10 tarjetas.
>
> ### Candados
>
> **`src/__tests__/components/catalogo-orden-por-codigo.test.tsx` (10).** Son de **CONDUCTA**: montan `CatalogoVendedorPage` y `CatalogoPublicoPage` de verdad, con los cuatro `KCMEENA` REALES y sus vecinos REALES en el orden en que los devolvía la base, y **leen el orden en que se pintaron las tarjetas**. Un barrido de texto sobre el .tsx no puede ver que los DOS pipelines queden ordenados, y encima se cumple con su propia explicación — este repo ya lo pagó cuatro veces; los barridos que quedan **borran los comentarios primero**.
> - **Verificado por mutación, 11 de 11 cazadas** (`bash scripts/_mutar-candados-orden-codigo.sh`): la lista plana del vendedor pierde el desempate · la vista AGRUPADA (Joybees) lo pierde · la lista plana del público · la agrupada del público · "Nombre A-Z" · "Precio ascendente" · el admin lista · el admin tarjetas · el comparador se come los guiones · el comparador vuelve a `localeCompare` · el comparador siempre devuelve 0.
> - 🩸 **El script de mutación restaura por COPIA, no con `git checkout`**: `orden-codigo.ts` es un archivo NUEVO y git aborta el comando entero, así que las mutaciones se apilarían y ninguna se probaría por separado — un verificador que miente en verde es peor que no tenerlo.
>
> ### Lo que NO se tocó
>
> **Reebok es espejo de Joybees y no se tocó nada propio de Reebok** (el desempate entra por el componente único de las 4 marcas). **La visibilidad no se movió** (`disponibleVendible`, `active`, `oculto_manual`): el conteo de tarjetas es **idéntico en main y acá — 76 en Calvin, 435 en Tommy, en los 4 anchos**. Tampoco el modo pedido, ni el carrito de sesión, ni los precios.


---

## Catálogos — auto-recorte del fondo al subir (12-ago-2026)

> **Las fotos del banco B2B de PVH vienen con el producto CHICO abajo y un fondo enorme; en la tarjeta se ven diminutas al lado de las buenas.** Caso real de Daniel: `HW0HW02958AEF.jpg`, **1364×1819**, una sandalia que ocupa el **9% del área** y el resto es fondo gris en degradado. Fuente única: **`src/lib/catalogos/foto-recorte.ts`** — núcleo PURO (fondo, caja, guardas, plan de encuadre) + un envoltorio de canvas que solo dibuja lo que el plan ya decidió.
>
> **Entra en el pipeline COMPARTIDO de las 4 marcas**, en los dos caminos: `compress()` de `photoUpload.ts` (subida individual y masiva) y `recortarYEncuadrar()` de `zip-b2b-client.ts` (ZIP del banco). Después sigue la compresión de siempre (1600 px, JPEG 0.82).
>
> 🔴 **FAIL-OPEN, y es la regla que manda: el recorte NUNCA puede bloquear ni limitar una subida.** Ante cualquier duda se sube LA ORIGINAL sin tocar. Cinco motivos, cada uno con su nombre en `MotivoNoRecorte`: `muy-chica` (lado menor < 300 px) · `fondo-no-uniforme` · `sin-producto` · `toca-bordes` (los 4) · `ya-encuadrada` (la caja ya llena ≥85% de ancho **y** alto). Dos capas más: `recortarEnCanvas` atrapa CUALQUIER excepción y devuelve `null`, y el `catch` de `compress()` devuelve el archivo original.
> - 🩸 **Fail-open no es solo "no revientes".** Una foto que el detector prefirió no tocar tiene que seguir **comprimiéndose a 1600 como antes**. Un `return file` metido entre el recorte y el resize se ve inofensivo (sube la original) y en realidad subiría fotos de 5 MB sin comprimir a todo el catálogo — **esa mutación sobrevivía a los candados y por eso existe el test que exige que el resize sea ALCANZABLE**, no solo que el texto esté en el archivo.
> - **Daniel preguntó explícitamente si esto tocaría las fotos normales.** No: solo entra cuando el fondo es uniforme **Y** el producto ocupa una parte chica. `ya-encuadrada` es lo que protege a las buenas de un re-encode que solo pierde calidad.
>
> 🩸 **Por qué no alcanzaba `detectarBBox` de `fotos-b2b.ts`** (el detector que el ZIP ya usaba): estima el fondo como el promedio de las 4 esquinas con tolerancia fija 12, y el fondo de estudio de PVH es un **degradado vertical** — las puntas difieren del promedio en más de 12, TODO el fondo se marca como producto, la caja da la imagen entera y el recorte es un **no-op**. Acá el fondo se estima **POR FILA** (banda izquierda + banda derecha, interpolado a lo ancho), que absorbe el degradado vertical **y** el horizontal sin inventar nada. El ZIP prueba primero `medirRecorte` y **cae al detector de siempre** si no es confiable.
>
> **Cómo distingue un fondo de estudio de una foto de local: la RUGOSIDAD del borde**, no su rango. `rugosidadBorde` = promedio de |Δ luminancia| entre píxeles CONSECUTIVOS recorriendo el borde como un camino continuo. Un degradado de estudio da **<1,5** (cambia suave aunque el rango sea grande); una escena da 8-40. El umbral es **4**. `RANGO_BORDE_MAX = 230` es un techo de SANIDAD, no el detector: medido sobre las 33 fotos reales del banco CK, un producto oscuro que asoma al borde sobre fondo blanco llega a **190-215** con rugosidad baja — un rango apretado habría rechazado fotos buenas.
>
> **El encuadre no distorsiona ni agranda:** margen PAREJO de **8%** del lado mayor de la caja en los 4 lados, **una sola escala** para ancho y alto (mirar solo el ancho dejaba salir lienzos de 2320 px de alto), techo 1600. El margen sale de la FOTO REAL —conserva el degradado, sin costuras— y solo lo que se pasa del límite se rellena con el color promedio del borde.
>
> **Medido sobre las 33 fotos reales de `Downloads/CK 2`** (`DIR=… OUT=… npx tsx scripts/_test-recorte-local.ts`, no toca red ni DB): **33/33 recortadas, ocupación previa 8%–35%**. Ninguna cayó en el fail-open porque ninguna era dudosa — no es que el detector sea permisivo. Antes/después en `~/.claude/jobs/5b66fe8c/tmp/recorte-antes-despues/` (`index.html`).
>
> **Re-proceso de las fotos YA subidas: `npx tsx scripts/_recortar-fotos-calvin.ts [--confirm]`** (dry-run por defecto). ⚠️ **SOLO CALVIN** — la tabla y el prefijo van FIJOS, sin parámetro de marca a propósito: Tommy/Reebok/Joybees ya están curadas a mano. Criterio: el MISMO módulo puro, y solo si la caja ocupa menos de **`OCUPACION_REPROCESO` = 50%** del área. Respalda cada original antes de escribir (si el backup falla, esa foto NO se toca), re-sube al MISMO path —la URL no cambia— **renovando el `?v=`** (sin eso, con `cacheControl` de 1 año el navegador seguiría mostrando los bytes viejos y el arreglo sería invisible), y **verifica por HTTP** (200, `image/*`, >5 KB, y que el producto ahora llene ≥70% de la dimensión que manda).
>
> Candado: `src/__tests__/lib/foto-recorte.test.ts` (25 casos con imágenes SINTÉTICAS píxel a píxel — producto abajo sobre degradado → recorta; centrado/lleno → no toca; toca los 4 bordes → no toca; fondo ruidoso → no toca; casi del color del fondo → no toca). Verificado por mutación, **10 de 10 cazadas**: quitar el `catch` de `recortarEnCanvas`, apagar cualquiera de los 4 guards, romper el fail-open de `compress`, saltarse la compresión cuando no hay recorte, que el ZIP deje de caer al detector de siempre, margen desparejo y escala por eje (distorsión).


---

## Catálogos — fotos faltantes (30-jul-2026)

> **El aviso de "entraron productos NUEVOS sin foto" es un delta de ESTADO, no el resultado de una corrida.** Daniel, textual: *"meti productos nuevos al sistema, y no me llega, almenos no instantaneo, q hay productos nuevos para subir fotos"*. Fuente única: `src/lib/catalogos/fotos-nuevos.ts` (I/O) + `planAvisoNuevos` en `fotos-faltantes.ts` (puro).
>
> 🩸 **El aviso ya existía y era imposible que llegara, medido contra producción.** Estaba atado al evento de una corrida: el motor empujaba el código a `nuevosSinFoto` en el MISMO `if` que hacía el INSERT, y solo los 3 routes de cron leían ese resultado. Los 60 productos de Reebok entraron en `2026-07-28T17:23:23` con **`triggered_by='manual'`** —el botón "Actualizar ahora"— y **`/api/admin/sync-now` nunca mandaba ese mensaje**. Las 6 corridas del cron de esos días (12:10 y 17:00 UTC) registraron `records_inserted = 0`: para cuando llegó el cron las filas YA existían y caían por la rama "producto conocido". O sea, **el único camino por el que entraron era justo el que no avisaba, y el aviso no se atrasaba: se perdía para siempre.** (61 en la captura = 60 nuevos + 1 anterior; ya los subió, hoy Reebok está en 0.)
>
> **Se cambió la PREGUNTA:** de "¿esta corrida insertó algo?" a "¿hay productos sin foto más nuevos que la última vez que avisé?". Consecuencias, todas buscadas:
> - **Cubre los 5 caminos**: los 3 crons de catálogo, `sync-now` y los 3 colaterales de `switch-reconciliacion`. Candado: `catalogos-aviso-nuevos-sin-foto.test.ts` incluye un **barrido estático** — un archivo que dispare `syncCatalogo{Reebok,Joybees,Tommy}` sin llamar a `avisarNuevosSinFoto` pone el build ROJO, y otro test prohíbe volver a leer `nuevosSinFotoTotal` desde los routes.
> - **No repite.** Los 61 de siempre no vuelven a sonar a diario (eso lo cubre el resumen semanal de los lunes).
> - **Marca de agua en `cron_heartbeats`**, una fila por marca (`catalogos-fotos-nuevos:<marca>`) — **sin DDL**: es la misma tabla que ya guarda "cuándo salió bien esto por última vez". Los 3 nombres están en `HEARTBEATS_NO_CRON` para que ni el watchdog Telegram ni health-crons los vigilen como crons (nadie los programa → estar stale es su estado normal). Se repiten como literales en `cron-telemetry.ts` a propósito: importar `fotos-nuevos.ts` desde ahí arrastraría `MARCAS_CONFIG` a toda la telemetría. La coherencia la sostiene el test.
> - **La marca de agua nueva es `max(ahora, created_at más nuevo)`**, no `ahora` a secas. Una fila insertada MIENTRAS corría la consulta tiene `created_at > ahora`: entra en este aviso y, sin el `max`, volvería a entrar en el siguiente → el mismo producto anunciado dos veces.
> - **Avanza SOLO si Telegram aceptó el mensaje.** Si falla, el aviso se reintenta en la corrida siguiente en vez de perderse. Y una marca de agua **ilegible ≠ "nunca se avisó"**: si el select falla no se hace nada (tratarlo como `null` sembraría de nuevo y se comería el aviso en silencio).
> - **Primera pasada SIEMBRA EN SILENCIO** (y con la tabla vacía no siembra: escondería el atraso real). Después del deploy, el primer producto nuevo es el primero que suena.
> - **Paginado obligatorio** (`leerTodoPaginado`, orden por `sku`): hoy son 490 filas, pero un aviso ciego a partir del producto 1.001 sin error ni señal es el bug de `db-max-rows` que este proyecto ya pagó. ✅ **`fotos-resumen.ts` (resumen semanal) TAMBIÉN pagina desde el 12-ago-2026.** Tenía el mismo bug latente: hoy la marca más grande es Tommy con 453 activos, pero desde la fila 1.001 el aviso diría *"faltan N fotos"* quedándose corto, sin error y sin señal — **un aviso que subestima es peor que no tenerlo**. 🔴 **EL ORDEN DE NEGOCIO SE CONSERVA**: sigue mandando `disponibilidad` desc (lo más vendible primero, que es lo que se lee en el Telegram) y solo se le agrega `sku` como DESEMPATE — es `text UNIQUE NOT NULL` en las cuatro tablas, así que el orden queda total. Ningún número cambió: las 4 marcas están muy por debajo de 1.000 (products 126 activos · joybees 81 · tommy 453 · calvin 80).
> - **Canal 📊 NEGOCIO** (`enviarNegocio`, sin perilla de silenciar) y el texto de siempre (`buildNuevosSinFotoMsg`, no se tocó). Frecuencia sin cambios (2×/día por marca) — lo que le faltaba a Daniel no era otro horario, era que el clic manual avisara.
> - Para revisar contra producción sin spamear: `npx tsx scripts/_dryrun-fotos-nuevos.ts` (usa el MISMO `avisarNuevosSinFoto` con `dryRun`, no una segunda implementación).

> **El botón "Excel sin foto" sale con la forma de la plantilla del banco B2B.** Daniel: *"quiero que al descargar los codigos de fotos sin excel, se me ponga en orden de a-z en la columna b, para que asi se me descargue automatico (los numeros que aparecen en el excel no deberian de estar ahi, es solo la muestra)"*. Fuente única: `src/lib/catalogos/dash-busqueda-excel.ts`, usada por las 3 marcas.
> - Estructura MEDIDA sobre `Dash Search Template.xlsx` (no supuesta): hoja `DASHBOARD DE BUSQUEDA`, `B1` = "INSERTE ARTICLE NUMBER AQUÍ (máximo 200)" con fondo `FFC000`, `D1` = "COPIAR " combinada D1:K1, `A2:A201` contador, `B2:B201` los códigos, `D2` la expresión combinada D2:K17, anchos A=4 B=52.78 C=8.89 D=85.11. Los ART Number de muestra NO se copian.
> - **`D2` va con la expresión `"cod" OR "cod" OR …` YA RESUELTA como texto.** En la plantilla es una fórmula que apunta a una hoja auxiliar `DATA ` (A=`"`, B=código, C=`"`, D=` OR `, E=CONCAT acumulado); escribirla resuelta hace que el archivo sirva recién abierto, sin recalcular y sin arrastrar la hoja auxiliar. El flujo del portal es copiar esa celda en la barra de búsqueda de Dash, **no subir el archivo** — por eso una segunda hoja no molesta.
> - **DOS hojas, y la de la plantilla va PRIMERA** (es la que abre Excel). La hoja de detalle de siempre ("Sin foto", con descripción/categoría/stock) **NO se quitó**.
> - **Los códigos van como TEXTO**, no número: hay SKU con guión (`T1A8-32600-313`) y con ceros a la izquierda.
> - **Orden A-Z con comparación cruda en MAYÚSCULAS, sin `localeCompare`**: el orden tiene que ser el mismo en el navegador, en Node y en el test, y las tablas de ICU no lo garantizan.
> - **Más de 200 códigos → hojas extra** (`DASHBOARD DE BUSQUEDA 2`, …), porque 200 es el tope del portal.
> - Candados: `dash-busqueda-excel.test.ts` (incluye el viaje completo de escritura+lectura del `.xlsx`, no solo el objeto en memoria) y el `SheetNames` actualizado en `excel-exports-catalogos.test.ts`. Verificado además con **openpyxl** (parser independiente del que escribe).

> **¿Qué foto de Storage está EN USO? — criterio en `src/lib/catalogos/fotos-en-uso.ts` (puro).** Pedido de Daniel: *"revisa todas mis fotos del catalogo de fashion shoes tommy, y borra solo las que no esten en uso"*. **El módulo CLASIFICA y arma el plan; el borrado vive aparte, en un script que por defecto es dry-run**: una foto borrada no vuelve y Daniel subió 389 a mano. Informe: `npx tsx scripts/_diag-fotos-tommy.ts [--lista]` (read-only; sirve para las 3 marcas con `MARCA=`), que le da datos de producción al MISMO módulo que cubre el test, así que informe y candado no pueden contradecirse.
> - **Cuatro clases, y tres de ellas SÍ están en uso:** `EN USO` (su ruta exacta está en `image_url`) · `BANCO VIVO` (variante `_v/{sku}/{n}.jpg` de un SKU que existe — NO referenciada y eso es NORMAL: el selector de variantes las necesita) · `REEMPLAZADA` (objeto de nivel raíz cuyo SKU existe **y** ya tiene otra foto) · `HUÉRFANA` (no se ató a ninguna fila).
> - **Solo se propone borrar las REEMPLAZADAS.** Es la única clase donde el reemplazo es DEMOSTRABLE: la fila existe y tiene otra foto, así que borrar no puede dejar a ningún producto sin foto.
> - 🩸 **La HUÉRFANA NO se borra.** "No hay fila" no significa "no sirve", significa "no encontré la fila", y las dos formas conocidas de eso terminan con la foto necesitándose otra vez: (a) Switch deja de traer un artículo un rato —estar fuera del catálogo es el estado normal y reversible de un agotado—, y (b) un SKU con guión que se corrige en Switch (**precedente real: 12 SKU de Tommy perdieron la foto por eso**). El housekeeping semanal ya borra el caso acotado y verificable (`_v/{sku}/` de un SKU que desapareció, ver `variantes-housekeeping.ts`); acá no se amplía.
> - **Guard anti-catástrofe**, igual que el housekeeping: sin filas de la tabla no se propone NADA ("la query falló" y "la marca no tiene productos" se ven igual, y solo una es segura). Se le pasan **TODAS** las filas, activas e inactivas: un producto oculto o agotado conserva sus fotos.
> - **Tolera las 3 formas de nombre que existen de verdad** (medidas 30-jul-2026): `{skuStorage}.jpg`, `{skuNormalizado}` sin extensión (endpoint legacy `/upload` con SKU) y `{epoch}-{archivo}` (subida masiva legacy SIN SKU — el SKU va adentro del nombre). Ignorar la tercera fue el primer error de medición: daba 39 falsas huérfanas que en realidad son duplicados de productos vivos.
> - **Inventario de Tommy antes de la limpieza (30-jul-2026):** 2.667 archivos / 74,73 MB → **468 EN USO (16,31 MB) · 2.157 BANCO VIVO (52,74 MB) · 42 REEMPLAZADAS (5,67 MB) · 0 HUÉRFANAS**. Las 42 eran 39 subidas el 29-jul y re-subidas ~8 min después (el lote se subió dos veces) + 3 miniaturas de 7-11 KB del 27-jul.
>
> **EJECUTADO el 30-jul-2026 con el OK de Daniel: se borraron 2.199 archivos (58,41 MB) y Tommy quedó en 468 / 16,31 MB.** Dos tandas: primero las 42 reemplazadas, después las **2.157 alternativas del banco**. Lo segundo fue decisión suya, reafirmada tras advertirle dos veces que pierde la posibilidad de cambiar la foto: *"ya escogi la que utilizare, asi que ya no necesito tenerla como opcion"*. Herramienta: `npx tsx scripts/_borrar-fotos-reemplazadas.ts [--confirm]` (dry-run por defecto).
> - 🩸 **"Borrar las variantes de un SKU" es una frase que suena inofensiva y NO lo era: 383 de las 468 fotos elegidas VIVEN dentro de `_v/`.** El selector guarda en `image_url` la ruta de la variante elegida, no una copia aparte — barrer la carpeta habría dejado sin foto a 383 de 490 productos. Por eso `planBorradoAlternativas` opera por OBJETO, no por carpeta, y salva la elegida comparando la ruta exacta.
> - **Segura por construcción:** solo se borra la alternativa de un SKU con foto elegida **VIVA** (que `image_url` traiga una ruta no prueba que el archivo exista: se verifica contra Storage). Un SKU sin elegida viva conserva TODAS sus variantes. Garantía: **ningún producto puede quedar sin foto**. Medido: 468 → 468 en uso, "sin foto" 18 → 18, y 30 fotos al azar verificadas por HTTP (>5 KB, `content-type: image/*`).
> - **Última red independiente del criterio**, en el script: si alguna ruta de la lista aparece en `image_url` de algún producto, aborta sin borrar nada.
> - **El selector ya no deja un control muerto — y el primer intento NO alcanzó.** Daniel, con captura del producto `THS10159C000`: *"no me deberia de salir el boton de Cambiar foto si no hay opciones"*. El botón se pintaba con solo **EXISTIR** la carpeta `_v/{sku}/`, y tras la limpieza esa carpeta conserva UN archivo: **justamente la foto elegida**. Resultado: botón visible → clic → *"Este código no tiene más fotos guardadas"*. Enterarse DESPUÉS de tocar es exactamente lo que se quería evitar.
>   - **La pregunta correcta no es "¿hay carpeta?" ni "¿hay fotos?", es "¿hay alguna foto que NO sea la puesta?"** — `tieneAlternativas` / `contarAlternativas` en `variantes-paths.ts` (puras), alimentadas por el `image_url` que la pantalla YA tiene. El botón ahora dice cuántas hay: `Cambiar foto (2)`.
>   - ⚠️ **El costo era la trampa: saberlo exige el CONTENIDO de cada carpeta, y un `list()` por SKU serían 383 llamadas por carga de pantalla** — los metadatos de Storage viven en el mismo Postgres del negocio. Se resolvió con **`list-v2` + `delimiter: ""`**, que devuelve rutas completas de forma **recursiva**: todo el banco de una marca en **1 llamada** (Tommy: 383 objetos, 1 página, ~230 ms). **Mismo costo que el listado de carpetas que reemplaza.** No está en supabase-js: se llama por REST con las credenciales del MISMO client de la marca (`db.supabaseKey` + `db.storage.url`), nunca leyendo env aparte. Si `list-v2` fallara, se degrada al listado de carpetas con `exacto:false` y el cliente vuelve al comportamiento viejo (mostrar el botón) — **ante la duda se muestra de más, nunca se esconde una función que sirve**.
>   - **Verificado en el navegador contra el build de producción y datos de producción:** Tommy real → **0 botones en los 490 productos** (469 fotos renderizadas, así que el 0 no es "no cargó"); el mismo Tommy con el banco **como estaba antes de la limpieza** → aparece **1 botón, `Cambiar foto (2)`** en `THS10159C000` (vistas 1/6/13 menos la puesta). **Reebok y Joybees NUNCA tuvieron banco** (0 carpetas en `_v/`, medido) → ahí el botón tampoco se pinta, y no se les quitó nada: el control ya estaba muerto para ellas.
>   - ⚠️ **Hoy NO existe en producción ningún producto con alternativas** (Tommy quedó sin banco por decisión de Daniel; Reebok/Joybees nunca lo tuvieron). Por eso el caso positivo se verifica sirviéndole a la pantalla la forma exacta que tenía el banco antes de la limpieza, no inventando datos.
>   - Candado: 9 casos nuevos en `variantes-fotos.test.ts`, incluido el caso real `THS10159C000` (1 foto y ES la puesta → 0 alternativas) y que Reebok/Joybees conserven el botón cuando sí hay banco.
> - ⚠️ **Volver a tener alternativas = volver a subir el ZIP del B2B.** No hay vuelta atrás para las 2.157.

---

## La pantalla que ve el CLIENTE — «como si fuese el mismo catálogo» (7-sep-2026)

> Daniel, textual: *«quiero que el cliente cuando abra el catálogo por el link se sienta como si fuese el mismo catálogo, solamente con par de limitaciones que ya sabemos, por ejemplo escoger el cliente, porque no quiero que él vea toda la cartera de clientes que tengo»*.

Seis cosas, todas medidas antes de tocar nada. Las 4 marcas, iguales.

### 1. 🔴 La barra del carrito tapaba el botón «Agregar» de la última fila

La página reservaba abajo **112 px** escritos a mano (`pb-28`). En el catálogo PÚBLICO la barra lleva encima el bloque **«Tu nombre \*»** —obligatorio y siempre visible— y mide **≈164 px**: sobraban ≈52 px, justo el alto de un botón. El botón de «subir» quedaba escondido detrás por el mismo motivo. Del lado del vendedor la barra mide ~93 px y no se notaba.

- **El espacio sale de la MEDIDA, no de un número.** `CatalogoStickyCartBar` mide su alto real con un `ResizeObserver` y lo avisa (`onAltoChange`); las tres pantallas —público, revisar y vendedor— reservan `alto + 16`. Sin `ResizeObserver` (navegador viejo) se mide una vez: mejor un número real de una sola lectura que volver al 112.
- El **botón de subir** se levanta con el mismo número, y sin carrito se queda con el `bottom` del tema.
- 🔑 De paso, la barra del catálogo dejó de pedir el nombre (ver el punto 4): en la pantalla donde está el grid, la barra ahora es la corta.

### 2. El cliente no podía teclear la cantidad

El número entre el `−` y el `+` era un botón que **no hacía nada** en el público: colgaba de `showBultos`, un interruptor que solo prendía el vendedor. Para pedir 30 bultos había que tocar «+» treinta veces.

- Se **quitó la condición**, no se agregó un control: es la MISMA ventana de cantidad de siempre (`Cantidad de bultos`), una por tarjeta.
- `showBultos` se retiró de las dos tarjetas — en `CatalogoProductCard` ya ni se leía— y de los 4 llamadores del vendedor.
- El número dice qué hace (`aria-label="Escribir la cantidad"`) y los botones de la ventana llegan a los 44 px en las dos tarjetas.

### 3. El cliente no podía descargar el catálogo en PDF

Vivía solo del lado del vendedor, en «Compartir › Descargar PDF» — y es **exactamente el mismo archivo** que Daniel manda a mano por WhatsApp.

- Se ofrece también en el público, con el **hook compartido** (`useDescargarCatalogoPdf`): un solo archivo, no una segunda copia.
- El verbo es **«Descargar»** en los dos lados (la palabra de la casa).
- **Con cero resultados el botón no se dibuja**: bajaría un PDF vacío.
- ⚠️ El PDF sí respeta los filtros de quien lo pide y los escribe en su subtítulo — es la foto de lo que estás mirando. El **enlace** compartido sigue saliendo pelado.

### 4. 🔴 El cliente REVISA antes de confirmar

Aterrizaba en su pedido **ya confirmado, de un toque**: «Confirmar pedido» creaba el pedido, lo mandaba a Switch y lo dejaba en una página donde ya no había nada que cambiar. El vendedor, en cambio, pasa por su checkout y revisa antes de mandar. Daniel: *«así puede agregar, quitar o editar»*.

- Pantalla nueva: **`/catalogo-publico/<marca>/revisar`** (`RevisarPedidoPublico`). La ruta se **deriva de la marca** y cuelga del catálogo público, así que hereda sin tocar nada las dos listas de `rutas-publicas.ts` (ni barra lateral, ni prompt de instalar el ERP).
- 🔑 **No es una segunda pantalla que haga lo mismo.** Las líneas las dibuja `LineasPedidoEditables`, que **SALIÓ del checkout del vendedor** (~70 líneas mudadas, no copiadas) y ahora la usan los dos. El nombre del cliente y «Confirmar pedido» viven en `CatalogoStickyCartBar`, la MISMA barra del catálogo.
- Ahí puede **cambiar cantidades**, **quitar líneas** y **volver al catálogo a agregar más** sin perder nada: el carrito vive en la sesión de la pestaña y el nombre en `localStorage`, como siempre.
- 🔴 **El precio NO se toca.** No es por esconder un botón: el servidor **reescribe los precios desde la base** al recibir el pedido del link, y eso no se tocó. En la lista compartida el precio editable es un `renderPrecio` OPCIONAL — el checkout se lo pasa, el cliente no.
- ⚠️ **La cartera de clientes sigue cerrada**: el cliente escribe su propio nombre (`validarNombreCliente`, la regla de siempre) y nunca elige del directorio. Las rutas de la cartera siguen exigiendo sesión.
- ⚠️ **El pedido del link sigue sin salir solo a Switch** — alguien de adentro le pone el cliente (decisión del 14-ago-2026).
- El aviso «Guardando tu pedido, no cierres esta pantalla» y el freno del cierre de la pestaña **viajaron con el paso que vigilan**.

### 5. El aviso de error se quedaba pegado para siempre

En el público el `Toast` **no se auto-ocultaba y no tenía botón de cerrar**, y quedaba encima de la barra del carrito. El único aviso de esa pantalla era un error.

- El `Toast` compartido se cierra solo cuando le pasan `onDismiss`: **8 s un error, 3 s un éxito** (`lib/ui/toast-duracion.ts`, un solo lugar), y trae su ✕.
- 🩸 El reloj **NO depende de `onDismiss`**: casi todas las pantallas lo pasan como `() => setToast(null)`, una función nueva en cada render — como dependencia, el reloj se reiniciaría solo y el aviso no se iría nunca. Viaja por `ref`.
- ⚠️ Sin `onDismiss` el comportamiento es el de antes: las ~20 pantallas con su propio `setTimeout` no cambian.

### 6. Lo que viajaba al navegador del cliente

- 🩸 **La existencia física viajaba y nadie la dibujaba.** Las 4 marcas mandaban `existencia` (y `stock`, su espejo) junto a `disponibilidad`, que es la única que se pinta — y **difieren en 282 de 857 productos**. Ahora el servidor **resuelve y manda un solo número**: `disponibleVendible` corre del lado del servidor (con su caída a existencia cuando el sync todavía no escribió la columna) y afuera sale solo `disponibilidad`. ⚠️ No se puede arreglar quitando las columnas de la LECTURA: sin `existencia` desaparece el respaldo y un producto con el sync a medias se vería agotado.
- 🩸 **Reebok mandaba 4 columnas que las otras tres no mandan** y que nadie dibuja: `description`, `sub_category`, `on_sale`, `created_at`. Salieron de `publicCatalog.cols`. `created_at` sigue **ordenando** la consulta (PostgREST ordena por una columna que no se selecciona), solo dejó de viajar.
- 🩸 **Reebok mandaba el inventario de productos apagados**: 391 filas, **159 de productos que no están en el catálogo** (`products` se acotaba a `active = true` e `inventory` se leía entera). Ahora el inventario se acota a los productos del mismo paquete.
- Regla única y PURA en `src/lib/catalogo/publico-payload.ts`.
- 🔴 **El catálogo interno de Reebok se leía SIN sesión** (`/api/catalogo/reebok/products?active=true`); las otras tres siempre la exigieron. No agregaba fuga nueva —devuelve las mismas columnas que el público— pero era una puerta abierta de más y la única de su clase. Ahora pide sesión con los roles del módulo Catálogos; el `scope=admin` sigue siendo suyo y sigue exigiendo admin o secretaria. El `authStyle` pasó de `publico-scope-admin` a **`scope-admin`**.
- 🔴 **Y la otra mitad de la misma puerta: `/api/catalogo/reebok/inventory`**, que decía «endpoint público» y devuelve la EXISTENCIA por talla de todo Reebok — justo lo que el paquete público dejó de mandar. Las **dos** rutas salieron de `PUBLIC_PREFIXES` en `src/middleware.ts`; sus únicos llamadores (el hub de marcas y el catálogo del vendedor) entran con sesión, así que no pierden nada. ⚠️ Lo público de verdad es `/api/catalogo/reebok/public`, que se queda.
- **El estado vacío prometía un WhatsApp que no estaba**: decía «escríbenos por WhatsApp» y en esa pantalla no había ningún número (existían, pero solo salían en el pedido ya confirmado — o sea, después de comprar). Ahora ofrece los **mismos dos contactos** de siempre (`WHATSAPP_CONTACTOS`), con nombre y número a la vista.

**Candados:** `catalogo-publico-como-el-catalogo.test.ts` (38 casos, contratos y barridos) · `catalogo-publico-revisar.test.tsx` (18 casos de CONDUCTA: se renderiza la pantalla del cliente, se tocan los botones y se mira qué quedó en el carrito y qué `fetch` salió). Dos candados **cambiaron de dirección con nota fechada**, ninguno se borró: `catalogo-publico-ux-paridad.test.ts` (el aviso de guardado se mudó con el paso que vigila, y el CONTROL nuevo exige que el catálogo ya no confirme nada) y `catalogo-paridad-products.test.ts` (la puerta de Reebok, con el CONTROL de que `scope=admin` sigue siendo de admin/secretaria). **47 mutaciones, 47 cazadas** con 2 controles (`scripts/_mutar-candados-catalogo-publico.sh`).

---

## Los cuatro polos «Core» del catálogo van en PLURAL (9-sep-2026)

Es la **segunda mitad** del arreglo del 8-sep-2026. Ese día se acotó a la marca
el alcance de la regla de las dos mitades (`MITADES_POR_MARCA`), que era lo que
dejaba pasar la gemela. Esto arregla **lo que la gemela dividió**: el catálogo.

### 🩸 El dato

Medido contra producción el 9-sep-2026 (`switch_articulo_info`, Fashion Wear —
la única empresa donde existe esta descripción):

| Descripción | Artículos | Piezas | Con existencia |
|---|---:|---:|---:|
| `Men-Polo S/S Core` (singular) | 42 | 4.280 | 28 |
| `Men-Polos S/S Core` (plural) | 81 | 2.939 | 37 |
| **La misma prenda, partida en dos** | **123** | **7.219** | |

Los estilos **MW0MW32346** y **MW0MW32347** están escritos de las **dos formas
y al mismo precio**: 26 códigos bajo el singular y 50 bajo el plural.

### 🔑 Por qué se coló: el catálogo se contradecía solo

`depurador_descripciones` guardaba, para la misma prenda, el **singular en los
adultos** y el **plural en los niños**:

| Marca | Decía | ¿Plural? |
|---|---|---|
| TH Menswear | `Men-Polo S/S Core` | ❌ |
| TH Womenswear | `Women-Polo S/S Core` | ❌ |
| TH Kids | `Boys-Polos S/S Core` | ✅ |
| TH Kids | `Toddler Boys-Polos S/S Core` | ✅ |

La regla de las dos mitades encontraba «Men» en TH Menswear y «Polos S/S Core»
en **TH Kids**, daba la descripción por buena, y la casi-gemela real —la
singular, **de su propia marca**— nunca se llegaba a mirar.

⚠️ **La señal ya estaba escrita y nadie la juntó.** La migración de Multifashion
del **9-ago-2026** (`20260809140000`) dejó anotado, en un comentario, que *«69 de
3.941 códigos tienen MÁS DE UNA descripción en la ventana ("Women-Polo S/S Core"
vs "Women-Polos S/S Core")»*. Se usó para justificar un `ORDER BY`, no para
preguntarse por qué la misma prenda tenía dos nombres.

### 🔴 Daniel eligió el PLURAL, con dos razones medidas

1. De las **18 filas de polo** del catálogo, **16 ya van en plural**. El singular
   es la excepción, no la regla.
2. En plural se tocan **menos artículos en Switch** que al revés.

### Lo que se hizo

**Migración `20261026120000_polos_core_en_plural.sql`** — dos `UPDATE`,
**acotados al VALOR EXACTO** (marca y descripción completas), jamás un `LIKE`:
un `ILIKE '%polo%'` se llevaría por delante las 16 filas que ya están bien, en
seis marcas distintas.

| Marca | Decía | Dice |
|---|---|---|
| `TH Menswear` | `Men-Polo S/S Core` | `Men-Polos S/S Core` |
| `TH Womenswear` | `Women-Polo S/S Core` | `Women-Polos S/S Core` |

- 🔴 **Nada se borra**: son dos `UPDATE`, sin un solo `DELETE`, `DROP` ni
  `TRUNCATE`.
- 🔴 **TH Kids no se toca**: sus dos filas ya venían en plural desde la semilla
  del 22-jul-2026. Con esto **las cuatro quedan emparejadas**, que es el punto.
- ⚠️ **Guarda `NOT EXISTS` en los dos**: el índice único es
  `(lower(marca), lower(descripcion))`. Medido antes de escribir, el destino
  **no existía** en ninguna de las dos marcas; aun así, si alguien aprueba el
  plural antes de que la migración corra, **no duplica y no falla** — deja la
  fila como está y hay que mirarla a mano.
- 🔴 **Nada por parecido.** Que el singular y el plural sean la misma prenda lo
  dijo Daniel mirando los dos estilos al mismo precio, no una distancia de
  edición. `esCasiIgual` los sigue viendo como dos descripciones **distintas** —
  eso es la alarma, no el amarre.
- ⚠️ **`normalizeDescripcion` no se tocó.** Sigue sin pluralizar «Polo → Polos»
  (`logic.ts`, principio comentado a propósito). Es justamente lo que hace que
  el orden importe.

### ⚠️ Lo que queda pendiente de Daniel, y el ORDEN importa

1. **Él cambia los 42 artículos en Switch** (Fashion Wear,
   `Men-Polo S/S Core` → `Men-Polos S/S Core`). 🔴 **Primero la migración,
   después Switch.** Al revés, esos 42 artículos le saltan la alarma de
   descripción desconocida hasta que la migración corra.
2. **En mujer no hay nada que tocar en Switch**: medido,
   `Women-Polo S/S Core` (singular) **no existe en ningún artículo** — solo vivía
   en el catálogo. Lo que Switch manda ya es `Women-Polos S/S Core`
   (**22 artículos · 1.409 piezas**), que hasta hoy **no estaba en el catálogo**
   y con esta migración empieza a estarlo.

### Candado

`src/__tests__/lib/depurador-polos-core-plural.test.ts` (23 casos): el valor
exacto sin `LIKE`, sin `DELETE`, con guarda; TH Kids intacto; **ninguna
migración posterior puede devolver el singular**; y la **conducta real** de
`veredictoDescripcion` **dada vuelta** — con el catálogo arreglado alerta el
singular y pasa el plural, y el CONTROL exige que antes fuera exactamente al
revés. **18 mutaciones, 18 cazadas** con 2 controles
(`scripts/_mutar-candados-polos-core-plural.sh`).

---

## 🔴 Las 23 descripciones que Switch ya tenía y el catálogo no conocía (9-sep-2026)

Daniel, textual: **«apruébalas todas»**.

### 🔑 Por qué faltaban — esto es lo que hay que dejar escrito

**`depurador_descripciones` SOLO se llena por la Plantilla Switch**: la semilla
del 22-jul-2026 (227 filas `seed`) y lo que la secretaria aprueba al procesar un
archivo del proveedor (54 filas `aprobada`). Estos artículos **no entraron por
ahí: se tecleron DIRECTO en Switch**, así que el catálogo nunca se enteró de que
existían.

La consecuencia se veía todos los meses: al llegar el archivo, esas
descripciones caían fuera del catálogo, el producto salía **sin precio** y la
alarma sonaba otra vez por lo mismo. No era un defecto del veredicto — es el
catálogo con un agujero por donde entra la mercancía tecleada a mano. Es el
mismo agujero, por el otro lado, que el de los polos «Core» de arriba.

### 🔴 Son 23 FILAS, no 27 — el conteo del encargo estaba mal

El grano de la tabla es `(marca, descripción)` y **cuatro descripciones llegan
en las DOS compañías** — `Boys-Shorts Denim` · `Boys-Short Knit` ·
`Men-Short Knit` · `Girls-Panties` —, así que cada una lleva su fila en la casa
TH y otra en la CK. **Esas ocho filas ya estaban enumeradas**, una en cada
lista: **13 (Fashion Wear) + 10 (Vistana) = 23 filas sobre 19 descripciones
distintas**. Sumarle 4 a 23 contaba los duplicados dos veces.

### Lo medido contra producción (`switch_articulo_info`, existencia > 0)

Las 23 filas dan exactamente las piezas del encargo — 332 · 97 · 83 · 72 · 32 ·
29 · 27 · 23 · 20 · 20 · 6 · 2 · 1 en Fashion Wear, y 428 · 376 · 191 · 96 · 73
· 36 · 10 · 6 · 1 · 1 en Vistana.

### ⚠️ La marca es una propuesta razonada, NO un dato medido

Sale de mirar en qué marca vive la **hermana** de cada descripción en el
catálogo de hoy (`Girls-Bras` junto a `Women-Bras` en CK Underwear;
`Boys-Underwear Bottoms` junto a `Men-Underwear Bottoms` en TH Underwear;
`Women-Socks Dress` junto a `Men-Socks Dress` en TH Legwear). **La marca de
verdad la manda el Excel del proveedor.** Medido: las 23 filas de
`switch_articulo_info` traen **`marca` en NULL** — Switch solo devuelve la ficha
con marca para Active Shoes—, así que no había contra qué contrastarla.

### ⚠️ Pregunta abierta: tres «Short Knit» de Tommy sin hermana en Tommy

En **todo** el catálogo «Short Knit» existe **UNA sola vez**:
`Women-Short Knit`, en **CK Performance**. Por eso `Boys-Short Knit`,
`Girls-Short Knit` y `Men-Short Knit` entran a la casa TH **sin una hermana que
respalde la marca**: esa prenda Tommy nunca la ha tenido en el catálogo. O son
prendas nuevas de verdad, o llegaron con la marca equivocada en el archivo. Lo
decide Daniel; si lo decide distinto se corrige con un `UPDATE` de la marca, sin
borrar nada.

⚠️ La cuarta que el encargo señalaba, `Girls-Panties`, **sí tiene hermana en
Tommy**: `Girls-Panties 7PK`, en TH Underwear (7-pack contra unidad, la misma
distinción que ya existe entre `Women-Panties` y `Women-Panties 3PK`).

### Lo que se verificó antes de escribir, con el código real

1. **Ninguna de las 23 existe hoy** en el catálogo, en ninguna marca (0 filas).
2. Las **9 marcas** usadas existen en `MARCAS_CATALOGO` (`src/lib/depurador/logic.ts`).
3. **Ninguna se mueve** al pasar por `normalizeDescripcion`: lo que se da de alta
   es exactamente lo que sale al Excel de Switch. (Las tres candidatas
   descartadas —`Men-Ties / Neckwear`, `Men-Shirts Woven Tops L/S` y
   `Men-Shirts Woven Tops S/S`— quedaron fuera justo por esto.)
4. **Ninguna dispara `esCasiIgual`** contra una fila de su marca ni de ninguna
   otra: no se crea una gemela por una «s».

### La migración

`supabase/migrations/20261027120000_descripciones_que_switch_ya_tiene.sql`
(**pendiente de aplicar**). Un `INSERT` con la **lista explícita de 23 filas**,
jamás generada de un `SELECT`. `origen = 'aprobada'` y `aprobada_por = 'daniel'`
— el CHECK de la tabla solo admite `seed` o `aprobada`, y `seed` es la carga
inicial: esto es una aprobación de Daniel, igual que las otras 54.
**Aditiva e idempotente** (`ON CONFLICT DO NOTHING` contra el índice único
`(lower(marca), lower(descripcion))`, nunca `DO UPDATE`, que pisaría una fila
que alguien ya aprobó a mano). 🔴 **Nada se borra**: ni un `DELETE`, ni un
`DROP`, ni un `UPDATE`.

⚠️ El número **20261027120000** se eligió después de comprobar las dos cosas:
`supabase_migrations.schema_migrations` llega hasta **20261025120000**, y en la
carpeta hay una **sin aplicar**, `20261026120000_polos_core_en_plural.sql`.

### Candado

`src/__tests__/lib/depurador-descripciones-tecleadas-en-switch.test.ts`
(142 casos): las 23 filas exactas con su marca, escritas a mano y pareadas
contra el SQL; la lista explícita (nada de `SELECT`, `LIKE` ni `%`); las 9
marcas en `MARCAS_CATALOGO`; ninguna se mueve al normalizarse; ninguna es
casi-gemela de nada; nada se borra y corre dos veces sin daño; la **conducta
real dada vuelta** —cada una pasa de alertar a ser del catálogo, con el CONTROL
de que antes **ninguna** lo era—; y ninguna migración posterior las saca.
**17 mutaciones, 17 cazadas** con 2 controles
(`scripts/_mutar-candados-descripciones-tecleadas.sh`).


---

## 🔴 EL LOGO DE TOMMY SE LEE — su banderita salía invertida (20-sep-2026)

Daniel: *«veo que el logo de TH no está bien»*.

### Qué le pasaba, medido píxel a píxel

El defecto está en la versión **BLANCA** del wordmark
(`public/tommy/tommy-horizontal-blanco.png`): la **banderita** entre TOMMY y HILFIGER sale
**invertida**. Comparando los dos PNG (900×52 los dos), dentro del recuadro de la bandera
(x 389-466):

| Archivo | Opacos en la bandera | Blancos | Navy | Rojo |
|---|---|---|---|---|
| `tommy-horizontal.png` (color) | **4.004** | 1.105 | 272 | 851 |
| `tommy-horizontal-blanco.png` | **3.051** | 3.051 | 0 | 0 |

O sea: las **953 franjas blancas de la bandera quedaron transparentes** y lo navy y lo rojo
quedaron blancos. Sobre la banda navy del papel eso se lee **al revés** — un bloque blanco con
muescas donde iban las franjas. En total se perdió el **6,8 %** del arte opaco (15.461 → 14.414
píxeles), y prácticamente todo cae dentro del recuadro de la bandera.

**La causa** está escrita en `scripts/_generar-logo-tommy.mjs`: el alfa se deriva de la **oscuridad**
del píxel (`alpha = (255 − min(r,g,b)) / 128`), así que todo lo blanco del arte original se vuelve
transparente. Con un wordmark monocromo —Calvin, que usa `negate`— esa regla funciona; con una
bandera de tres colores, no. **Tommy es la única de las cuatro marcas con bandera**, y por eso la
única rota.

### El arreglo — sin inventar ningún archivo

Se usa el wordmark **OFICIAL de COLOR sobre PLACA BLANCA**, que es exactamente lo que ya hace la
pantalla del pedido público (`marcas-ui.tsx` → `pedidoPublico`, 25-jul-2026). Mismo arte, mismo
patrón, cero arte nuevo. Se aplicó en:

| Lugar | Antes | Ahora |
|---|---|---|
| PDF del pedido (`order-pdf-core.ts`) | wordmark blanco sobre banda navy | placa blanca redondeada + wordmark de color |
| Correo al equipo (`marcas.ts`) | `<img blanco 160×9>` | placa blanca + `<img color 156×9>` |
| Correo al cliente (`marcas.ts`) | igual | igual |
| Vista previa del link (`generar-og-catalogos.mjs`) | wordmark blanco al lado de la bandera buena | placa blanca + wordmark de color |

⚠️ **De paso, el aplastado del correo.** El PNG es 900×52 (**17,31:1**) y se dibujaba en `160×9`
(**17,78:1**): un **2,6 % más bajo** de lo que corresponde. Tommy era la única de las cuatro marcas
que pasaba el 2 % —Reebok −0,1 %, Joybees y Calvin +0,44 %—. Ahora va `156×9` (17,33:1).

### Lo que queda pendiente

- 🔴 **De Daniel: el master REVERSADO de Tommy Hilfiger** (el que la marca publica para fondos
  oscuros). Ninguna regla automática sobre el arte de color puede inventar el contorno que la
  bandera necesita para leerse sobre navy, así que **no se genera: se pide**. La constante
  `TOMMY_LOGO_BLANCO_BASE64` y el PNG blanco **se quedan rotulados** (patrón `mayor_lineas`) para
  cuando llegue.
- ⚠️ **De correr**: `node scripts/generar-og-catalogos.mjs` para rehacer
  `public/og/catalogo-tommy.png` con el logo arreglado. Pide `npx playwright install chromium` (el
  binario que hay en caché no es el que espera la versión instalada). **El script ya quedó
  corregido; la imagen sigue siendo la de hoy.**

Candado: `tommy-logo-que-se-lee.test.ts` — **6 mutaciones, 6 cazadas**. Cambia de dirección, con
nota fechada adentro, la URL del correo de Tommy en `logos-marca`, y la banda del correo al cliente
en `order-email-cliente`.

---

## Lo que decía CLAUDE.md hasta el 14-sep-2026 (movido acá, verbatim)

> El 14-sep-2026 CLAUDE.md pasaba de 333 mil caracteres (el tope del harness es 150 mil) y las instrucciones se cortaban a la mitad. Se dejó ahí un resumen de las reglas vigentes y el texto completo —mediciones, citas de Daniel, candados y mutaciones— se movió acá sin cambiar una palabra.

### Catálogos, pedidos y cotización — [docs/postmortems/catalogos-pedidos.md](docs/postmortems/catalogos-pedidos.md)

- 4 marcas: Reebok (`active_shoes`) · Joybees (`joystep`) · Tommy (`fashion_shoes`) · Calvin (`vistana`). **Joybees es espejo exacto de Reebok.**
- Roles en `src/lib/catalogo/roles.ts`: `CATALOGO_ROLES` = ver · `CATALOGO_ADMIN_ROLES` (admin + secretaria) = administrar.
- 🔴 **El cliente se elige, nunca viene puesto.** El checkout arranca vacío, el botón se apaga diciendo qué falta, y el **servidor responde 422** si un pedido interno sale sin cliente. El mostrador es el código `TCKCTA` y hay que tocarlo.
- **Un solo selector de cliente en todo el sistema**: `ClientePicker` (directorio propio) y `ClienteSwitchPicker` (directorio de Switch). Hay barrido que pone el build ROJO si aparece otro.
- Un envío sale como **pedido** (`/apipedido/terminar`) o **cotización** (`/apicotizacion/terminar`). **Una cotización NO aparta mercancía**, y eso se dice pegado al botón. `normalizarDocumento` cae a **pedido** ante cualquier valor raro.
- **At-most-once**: índice parcial único `(order_id) WHERE estado <> 'error'`. Cotizar consume el envío de ese pedido; para vender se **duplica**.
- El papel, el nombre del archivo y el adjunto del correo dicen **cuál de las dos fue**, derivado del **envío activo**, no del `status`.
- El panel de admin se llama **«Comprobantes»**; la key de la pestaña sigue siendo `pedidos` (está en `role_permissions`).
- 🔴 **Los pedidos viejos NO se borran, se muestran menos** (4-sep-2026). Daniel: *«si un pedido se mandó a switch, ya está safe, no?»* — la respuesta es **no**: el pedido guarda lo que Switch no tiene (quién lo armó, el comentario, si fue pedido o cotización, el PDF que se le mandó al cliente) y son pocos (23 Reebok · 38 Tommy · 21 Calvin · 41 Joybees en todo 2026). Lo que se recorta es la LISTA: **los últimos 90 días**, y el resto detrás de **«Ver más»** sin texto explicativo (`src/lib/catalogo/comprobantes-ventana.ts`, módulo puro). Candado: `comprobantes-ventana-90-dias.test.ts`.
**La pantalla que ve el CLIENTE (7-sep-2026).** Daniel, textual: *«quiero que el cliente cuando abra el catálogo por el link se sienta como si fuese el mismo catálogo, solamente con par de limitaciones que ya sabemos, por ejemplo escoger el cliente, porque no quiero que él vea toda la cartera de clientes que tengo»*. Detalle en [catalogos-pedidos.md](docs/postmortems/catalogos-pedidos.md).

- 🔴 **EL CLIENTE REVISA ANTES DE CONFIRMAR** — `/catalogo-publico/<marca>/revisar`. Aterrizaba en su pedido **ya confirmado, de un toque**; ahora ve lo que va a pedir, cambia cantidades, quita líneas y vuelve al catálogo sin perder nada. 🔑 **No es una segunda pantalla**: las líneas las dibuja `LineasPedidoEditables`, que SALIÓ del checkout del vendedor, y el nombre y el botón de confirmar viven en la MISMA barra del catálogo. 🔴 **El precio NO se toca** —el servidor reescribe los precios desde la base y eso no cambió— y ⚠️ **la cartera de clientes sigue cerrada**: el cliente escribe su propio nombre. ⚠️ El pedido del link **sigue sin salir solo a Switch**.
- 🔴 **El espacio de abajo sale de la MEDIDA de la barra, nunca de un número escrito a mano.** Eran 112 px fijos; con el bloque «Tu nombre \*» encima la barra mide ≈164 y tapaba el «Agregar» de la última fila y el botón de subir. Lo mide un `ResizeObserver` y lo usan las tres pantallas (público, revisar, vendedor).
- 🔴 **El cliente TECLEA la cantidad y DESCARGA el PDF.** El número entre el − y el + colgaba de `showBultos` (solo vendedor): 30 bultos costaban treinta toques. Se quitó la condición y `showBultos` se retiró de las dos tarjetas. El PDF es el MISMO archivo del vendedor (hook compartido `useDescargarCatalogoPdf`), con el verbo **«Descargar»**; con cero resultados el botón no se dibuja.
- 🔴 **El aviso se cierra solo y se puede cerrar**: 8 s un error, 3 s un éxito (`lib/ui/toast-duracion.ts`). 🩸 El reloj viaja por `ref` y NO depende de `onDismiss` —que casi siempre es una función nueva por render—: como dependencia se reiniciaría solo y el aviso no se iría nunca. Sin `onDismiss`, el `Toast` se comporta como antes.
- 🔴 **LO QUE VIAJA AL NAVEGADOR SE RESUELVE EN EL SERVIDOR** (`lib/catalogo/publico-payload.ts`, puro). 🩸 Las 4 marcas mandaban `existencia` (y `stock`) además de `disponibilidad` —difieren en **282 de 857** productos— y nadie las dibujaba. Ahora sale UN número, con la caída a existencia hecha del lado del servidor. ⚠️ Las columnas se siguen LEYENDO: sin `existencia` no hay respaldo y un producto con el sync a medias se vería agotado. Reebok además mandaba 4 columnas que las otras tres no (`description`, `sub_category`, `on_sale`, `created_at`) y **el inventario de productos apagados** (159 de 391 filas); las dos cosas se cerraron.
- 🔴 **El catálogo interno de Reebok ya no se lee sin sesión** — `/api/catalogo/reebok/products` **y** `/api/catalogo/reebok/inventory` (que decía «endpoint público» y devuelve la existencia por talla de todo Reebok). Era la única de las 4 con esa puerta; las dos salieron de `PUBLIC_PREFIXES` del middleware y sus llamadores (el hub y el catálogo del vendedor) ya entraban con sesión. `authStyle` pasó de `publico-scope-admin` a `scope-admin`; el `scope=admin` sigue exigiendo admin o secretaria. ⚠️ Lo público de verdad, `/api/catalogo/reebok/public`, se queda.
- El estado vacío decía «escríbenos por WhatsApp» **sin ningún WhatsApp** en la pantalla: ahora ofrece los mismos dos contactos de siempre (`WHATSAPP_CONTACTOS`).
- Candados: `catalogo-publico-como-el-catalogo.test.ts` · `catalogo-publico-revisar.test.tsx` (conducta); dos candados cambiaron de dirección con nota fechada (`catalogo-publico-ux-paridad` y `catalogo-paridad-products`). **47 mutaciones, 47 cazadas** con 2 controles (`scripts/_mutar-candados-catalogo-publico.sh`).

- 🩸 **La basura de las pruebas SÍ se borra de verdad, una vez y con lista explícita.** 16 pedidos de Calvin y 37 de Joybees de las corridas de verificación del 12-13 de agosto (Daniel: *«borro de verdad de la base»*) salen por la migración `20260924120000_borrar_pedidos_de_prueba.sql` (**aplicada** (verificado el 5-sep-2026)). Es la excepción, no la regla, y trae sus frenos adentro: lista de **ids**, nunca un `LIKE`; el que tenga un **envío vivo** a Switch (`estado <> 'error'`) se saca de la lista; y solo se borra lo que ya estaba `deleted`. Candado: `borrar-pedidos-de-prueba.test.ts`.
- **Las escrituras del sync que no cambian nada no se hacen** — comparación por tipo declarado columna por columna; ante la duda, se escribe.
- **El precio lo manda Switch.** A mano solo `image_url`/`badge` (+`name` en Tommy, que marca `nombre_manual`).
- **La clasificación de Reebok la manda Switch** (`src/lib/reebok-clasificacion.ts`): la **MARCA** manda la categoría (FOOTWEAR/APPAREL/HARDWARE, 3 valores estables) y el **SUBRUBRO** el género; el `rubro` es el plan B de una marca vacía. `UNISEX` → **Hombre**, y solo ahí el nombre desempata (`WOMEN` o una `W` sola → Mujer). Lo que el mapa no conoce cae en el cajón neutro (`otros`/`sin_clasificar`) y **nunca pisa** una clasificación que ya existía — de la categoría sale el bulto, y el bulto es plata.
- 🩸 **«Todavía no llegó» NO es «llegó algo que no entiendo».** El 2-sep-2026 salió un 🔧 SISTEMA por *233 productos* con `rubro`/`subrubro` «(vacío)» que **no tenían nada malo**: la migración acababa de crear las columnas y el cron de fichas no había corrido. De la regla 2 fallaba las TRES. La distinción vive en **`fichaLlego` y en UN solo lugar** —el módulo puro, no el `select`—: sin `ficha_at` no se avisa **ni se clasifica**; con `ficha_at`, un valor desconocido **o un campo vacío** sí avisan. Candados: `reebok-clasificacion.test.ts` + `catalogo-reebok-clasifica.test.ts` (conducta, contra el Telegram).
- 🔴 **El Depurador genera UNA sola plantilla: la de Switch, 25 columnas** (`OUT_COLS`, `src/lib/depurador/logic.ts`), la misma para las 4 empresas destino, para Facturas Tienda (Multifashion) y para Reebok. La plantilla real vive en el repo: `src/__tests__/fixtures/plantilla-switch-articulos.xlsx` (bajada de las 8 empresas el 3-sep-2026, MD5 idéntico `b622f171…`), y `depurador-plantilla-switch.test.ts` exige igualdad **encabezado por encabezado**. Si Switch la cambia, se cambia el fixture a propósito. Ya no existe «plantilla por empresa» (`OUT_COLS_DEFAULT` / `OUT_COLS_SHOES` / `outColsForEmpresa` se retiraron).
- **Lo que cambia por empresa es el CONTENIDO, no las columnas:** Fashion Shoes → «Costo FOB *» y «Costo CIF *» separados, **CIF = FOB × 1,10** como Vistana; Multifashion → **FOB = CIF** = el precio de la factura. **«Composición» siempre vacía.** **«Tasa de Impuesto *» = `07` como TEXTO** (`tasaSwitch`), nunca `7` ni `7.00`. `TEXT_COLS = [0, 1, 2]` es posicional y no se movió.
- 🩸 Las dos «plantillas de 24 columnas» (27-jun y 1-sep-2026) se hicieron contra archivos que no estaban en el repo, y ninguna coincidía con Switch. Post-mortem con las citas de Daniel, la verificación de las 8 empresas y las 13 mutaciones en el archivo enlazado.
- 🔴 **La pantalla del Depurador valida lo que se teclea y no borra el trabajo hecho (4-sep-2026).** El divisor pasa por `validarDivisor` TAMBIÉN en los inputs (global y por marca, vía `mensajeDivisorEnPantalla`): fuera de rango, el campo se marca en rojo, dice «Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?» y **la DESCARGA se apaga — nunca el tecleo** (antes, un `70` bajaba un Excel con los costos 100× mal directo a Switch, 50-60 corridas/mes). La tasa es un **select de dos** — Daniel, textual: *«solo existen esas dos»* — 7% → `07` y Exento (0%) → `0`, siempre TEXTO (`tasaSwitch` no se tocó). Los **precios escritos a mano se conservan** al re-procesar y al cambiar empresa/mes/tasa/factor — Daniel: *«y también consérvalos»* — pegados por **REFERENCIA de artículo, nunca por índice de fila**, con aviso en pantalla («N precios escritos a mano se conservaron») y botón «Borrarlos todos». Año/factor ya no re-procesan en cada tecla (300 ms o blur). La config (empresa, mes, año, tasa, factor, modo de precio, fórmula global) **se recuerda por usuario** (`useLastUsed` / `fg_last_depurador_*`); el archivo no. Candado: `depurador-validacion-pantalla.test.tsx` (18); **10 mutaciones, 10 cazadas** (`scripts/_mutar-candados-depurador-pantalla.sh`). ⚠️ Reebok y Facturas Tienda tienen sus propios inputs de divisor SIN esta validación en pantalla (el guard de las rutas API sí les aplica al guardar) — pendiente de decidir con Daniel.
- 🔴 **El módulo se llama «Plantilla Switch» y la pestaña «Reglas» quedó minimalista (8-sep-2026).** Daniel: *«se cambia a Plantilla Switch»* y, sobre Reglas, *«es solo para nosotros los usuarios ver en caso de algo, se usará muy poco… justo lo necesario y ordenado de manera minimalista»*. 🔴 **La `key` sigue siendo `cargar` y la dirección `/productos/cargar` NO cambió** (la key está en `role_permissions` y en `fg_users.modulos_override`). En Reglas quedan **DOS secciones**: *Cómo se elige la talla* y *Descripciones por marca*. 🔴 **La tabla de talla se GENERA del código** (`CASOS_TALLA` + `CASO_TALLA_RESTO` en `logic.ts`, `CASOS_TALLA_REEBOK` + `casoTallaReebok` en `reebok.ts`): estaba TECLEADA a mano «como espejo» y ya se había separado de la regla real. Se fueron los 8 principios y la tabla de 22 reglas de normalización; quedan las **10 que de verdad hacen falta**, **derivadas** (`reglasDeNormalizacionQueHacenFalta`) y mostrando **lo que sale al Excel** (`normalizeDescripcion`), nunca el valor crudo del mapa — 🩸 una fila **mentía**: decía que `Boys-Shirts - Woven Tops S-S` queda `…Woven Tops S/S` y al Excel sale **`Boys-Shirts Woven S/S`**, porque el principio `SHIRTS_WOVEN` la reescribe después. El **buscador busca EN LAS DESCRIPCIONES** (antes la sección de marcas ignoraba la búsqueda entera) y las **7 marcas sin descripciones se MUESTRAN** (Daniel: *«no se esconden»*) diciendo «Todavía sin descripciones cargadas» en vez de un «(0)» pelado. 🩸 **El short de baño se mide en LETRA**: `SWIMSHO` vivía en la lista de CALZADO desde el primer commit, así que `Men-Swimshorts` —descripción viva en **3 marcas**— probaba la **talla 41**; ahora hay una familia `TALLA_LETRA` que le gana a calzado Y a pantalón (sacarlo de calzado a secas lo mandaba a la 32 por la palabra «SHORT»). 🔴 **La secretaria puede QUITAR una descripción** (`PATCH /api/productos/cargar/descripciones/[id]` acepta `secretaria`; sigue siendo `activa = false`, **nunca un DELETE**) — Daniel: *«que también la pueda quitar — ella la escribió»*; ya podía agregarlas (54 de las 281 nacen así) y no podía deshacerlas. Candados: `plantilla-switch.test.ts` · `plantilla-switch-pantalla.test.tsx`; **33 mutaciones, 33 cazadas** con 2 controles (`scripts/_mutar-candados-plantilla-switch.sh`). Cuatro candados cambiaron de dirección con nota fechada, ninguno se borró: `poda-textos-cxc-multifashion` (el h1 dice el nombre nuevo), `poda-textos-explicaciones` (los principios se fueron de la pantalla, con CONTROL de que no quedó vacía), `depurador-pestanas-rediseno` (el ámbito de fórmulas dice «Plantilla (importación)») e `iphone-tocables-y-letra` (el buscador de Reglas cambió de ancho, los 44 px no).
- 🩸 **LAS DOS MITADES DE UNA DESCRIPCIÓN SOLO VALEN DENTRO DE LA MISMA MARCA (8-sep-2026).** La regla 1 de Daniel («si las dos mitades existen, pasa») estaba **tapando a su regla 2** («lo que me preocupa es que sea por ejemplo tshirts y diga tshirt y lo deje pasar»): `Men-Polos S/S Core` pasaba **sin alarma** porque «Men» existe en TH Menswear y «Polos S/S Core» existe… en **TH Kids**, así que la casi-gemela real, `Men-Polo S/S Core` (singular, misma marca), nunca se llegaba a mirar. Costó plata: en Fashion Wear conviven `Men-Polo S/S Core` (28 artículos · 4.361 piezas) y `Men-Polos S/S Core` (37 · 3.027) — **7.388 piezas de la misma prenda partidas en dos**, con los estilos MW0MW32346 y MW0MW32347 escritos de las dos formas al mismo precio. Daniel eligió la opción **b**: las mitades cuentan solo dentro de la marca que se evalúa (`veredictoDescripcion(desc, catalogo, marca)`, índice `porMarca`). ⚠️ **No cambió nada más**: «ya-existe», `normalizarEspacios` y la casi-gemela COMPLETA siguen mirando todo el catálogo. **Medido antes de encenderlo** (`scripts/_medir-veredicto-por-marca.ts`): de las **360** descripciones vivas del inventario (existencia > 0, cruzadas a su marca real) **13 cambian de `pasa` a `alerta`** y 347 quedan igual; las 281 del catálogo, **0 cambios**. Interruptor `MITADES_POR_MARCA` en `true`.
- 🔴 **El Depurador tiene 3 pestañas** (4-sep-2026): **Plantilla** (Nuevo · Historial) · **Tallas y catálogo** (Tallas por bulto · Fotos a mi Excel) · **Configuración** (Fórmulas · Descripciones solo admin · Reglas). Los tres caminos de generación (CK/TH, Reebok, Facturas Tienda) viven en «Plantilla › Nuevo» y **no se nombran en pantalla**: el dispatcher reconoce el formato. Todo `?tab=` viejo redirige (`pestanas.ts`). Nada se borró: los componentes son los mismos, cambia dónde cuelgan.
- 🔴 **La compañía se RECONOCE de la marca del archivo, no se elige** (Daniel: *«¿para qué elegir la compañía si la puede detectar?»*): `empresasReconocidas` ← `empresaDeMarcaCatalogo` (CK → Vistana · TH FOOTWEAR → Fashion Shoes · resto TH → Fashion Wear · KL → Active Wear). Queda un **«cambiar»** con las 6 compañías (`COMPANIAS_DEPURADOR`); con marcas de DOS compañías **se dice y no se adivina**. No se recuerda: la del archivo manda.
- 🔴 **La «Temporada» es UN campo (AAAA-MM), arranca SIEMPRE en el mes actual de Panamá y NO se recuerda** (Daniel: *«la temporada es el mes que se hace el archivo»*) — ese dato entra a Switch como columna «Temporada». Tasa, factor y modo de precio sí se siguen recordando.
- 🔴 **El Historial guarda EL MISMO Excel que se descargó (bytes idénticos), 90 días**, en el bucket privado `depurador-plantillas` (migración `20260921120000`, **aplicada** (verificado el 5-sep-2026)). **SOLO los Excel de Switch** — el pedido para cliente de Reebok, Tallas y Fotos a mi Excel no se guardan. El cron `cleanup-depurador-archivos` (03:20 UTC) borra el archivo vencido y **la fila con los totales se queda para siempre** (solo pierde el botón). Todos ven y bajan todo. Filtro por compañía (Todas + las 6); Facturas Tienda se anota como «Multifashion».
- **El divisor se valida en pantalla en los TRES caminos** (CK/TH desde `9d1eb50e`; Reebok y Facturas Tienda desde el 4-sep-2026), reusando `mensajeDivisorEnPantalla`: campo rojo, «¿Quisiste poner 0.70?» y la **descarga apagada, nunca el tecleo**.
- Las descargas de **Tallas** y **Fotos a mi Excel** dejan rastro en `activity_logs` (`descarga_tallas` / `descarga_misfotos`, módulo `depurador`) para medir si valen la pena — sin salir en el Historial. Y ⚠️ **la marca desconocida se queda EXACTAMENTE como está** (Daniel: *«Como está»*): se avisa y se deja descargar.
- 🔴 **LA EXISTENCIA DE UN PRODUCTO ESCONDIDO NO SE CONGELA** (6-sep-2026). Esconder a mano (`oculto_manual`) pone `active = false`, y el motor armaba el conjunto al que le pregunta la existencia a Switch como «activo ∪ Switch dice disponible ≥ 1»: un escondido sin disponible **no caía en ninguna de las dos** y su existencia se quedaba clavada en el número del día que se escondió. 🩸 Medido contra `switch_articulo_info`: **25 escondidos mostraban 465 piezas contra 213 reales** — Tommy **252 contra 72** (13 de sus 16 mal) y Calvin **121 contra 49**; Reebok y Joybees coincidían por casualidad. Ahora los escondidos entran al conjunto (`ocultosManualSkus`, una sola vez en `sync-catalogo.ts`). 🔴 **Esconder sigue siendo esconder**: la visibilidad la decide `esVisibleEnCatalogo`, donde `oculto_manual` gana SIEMPRE, y el candado lo exige en las dos direcciones. Costo medido: **+25 llamadas /stock** en las cuatro marcas (Tommy +16 sobre 463, +3,5%); la corrida más lenta de 30 días fue **282 s contra un techo de 800**. ⚠️ Sin la columna (DDL pendiente) el conjunto queda vacío y todo se comporta como antes. El bloque (4b) que alineaba el PRECIO de los ocultos **no se tocó**. Candado: `catalogo-escondidos-existencia-viva.test.ts`; medición `scripts/_medir-catalogo-escondidos-y-fotos.mjs`.
- 🩸 **Calvin era la ÚNICA marca sin candado de foto** (6-sep-2026). `foto_manual` nació el 25-jul en las tres marcas que existían ese día; **Calvin nació el 12-ago** y quedó afuera, así que el ZIP del banco B2B **pisa sin avisar** la foto elegida a mano y la cuenta como «asignada» en vez de «respetada» (Tommy tiene 30 protegidas; Calvin, 0 — no por falta de elecciones sino porque no puede marcarse). Migración **`20261011120000_calvin_foto_manual.sql`** (**pendiente de aplicar**), aditiva y con el mismo `default false`. **El código no cambió y no lo necesita**: ya era el mismo para las cuatro (`cfg.productsTable`) y ya toleraba la DDL pendiente. Candado: `catalogo-calvin-foto-manual.test.ts`.
- 🩸 **La pantalla de administrar no comprobaba ningún rol** (6-sep-2026). `/catalogos/admin/[marca]` resolvía la marca y montaba el componente; el único guardia era del navegador y el middleware solo valida que la sesión EXISTA, así que cualquiera con sesión abría la pantalla antes de rebotar. ⚠️ **No había fuga de datos** (las rutas de datos sí contestan 403). Guard SSR con el MISMO patrón que Multifashion, y la lista **derivada de `CATALOGO_ADMIN_ROLES`** (`puedeAdministrarCatalogo`), nunca escrita a mano: administrar es **admin y secretaria**; vendedor, bodega y `gerente_boston` rebotan a `/home`. Candado: `catalogo-admin-pantalla-cerrada.test.ts`.
- 🩸 **Cuatro rutas retiradas, ninguna con un solo llamador desde `src/`** (6-sep-2026). 🔴 La urgente: **`POST /api/catalogo/joybees/seed`**, que reescribía **precio, existencia, regalía y visibilidad** de los 83 productos de Joybees desde una lista escrita a mano (82 SKUs, 10.065 piezas inventadas contra las 8.927 reales) y con su `active: true` **habría vuelto a mostrar los 2 escondidos**; sin botón en ninguna pantalla, la disparaba cualquier admin o secretaria que supiera la dirección. Con ella se fue `src/lib/joybees-seed.ts`. Las otras tres: **`[marca]/pedidos-unificado`** (la lista vieja de administrar, reemplazada el 25-ago, que además calculaba mal la plata — hasta **$680** en un pedido por no pasar las piezas por el bulto), **`reebok/stats`** y **`reebok/inventory/bulk`**. ⚠️ `reebok/inventory` (sin `/bulk`) y `pedidos-export` **siguen vivos**, y las vistas `<marca>_pedidos_unificado_vw` **no se tocaron**. 🔴 **Las tablas no se tocan** (patrón `mayor_lineas`). Candado: `rutas-de-catalogo-retiradas.test.ts`; `require-admin-no-miente.test.ts` bajó de 10 a 9 rutas **a propósito y con nota**.
- Candados de los cuatro arreglos (6-sep-2026): **25 mutaciones, 25 cazadas** con 2 controles (`scripts/_mutar-candados-catalogo-4-arreglos.sh`).
**Los defectos del 11-sep-2026** (auditoría del módulo; siete arreglos aprobados por Daniel, **ni un precio, existencia ni visibilidad cambió** — medido antes y después con `scripts/_medir-catalogos-multifashion-defectos.mjs`: 25 escondidos siguen escondidos, Reebok 232 · Tommy 475 · Calvin 83 · Joybees 81 filas en el público, idénticas).

- 🩸 **El chip «Escondidos» NUNCA aparecía** (las 4 marcas). Esconder pone `active = false` **y** `oculto_manual = true`, y la pantalla tiraba `active === false` ANTES de contar: `escondidos` daba 0 siempre y «Mostrar» era código inalcanzable — los **25** (Tommy 16 · Calvin 6 · Joybees 2 · Reebok 1) solo volvían tocando la base. Daniel: *«que yo pueda activar o desactivar»*. La regla vive en `seAdministra` (`admin-chips.ts`): lo escondido a mano ENTRA a la pantalla y `pasaElChip` lo sigue sacando de «Todos», de las categorías y de «Sin foto» — solo se ve en SU chip, y desde ahí «Mostrar» recalcula `active` con `esVisibleEnCatalogo`. **Ninguno de los 25 se tocó.**
- 🩸 **La foto subida a mano NO quedaba protegida**: la subida mandaba solo `image_url` y la allow-list rechazaba `foto_manual`, así que el próximo ZIP del banco B2B la pisaba (Reebok 0 protegidas de 390, Joybees 0 de 81, Calvin 0 de 89). Ahora viaja `foto_manual: true` junto con la foto, igual que elegir una variante. El servidor acepta **solo `true` y solo con `image_url`**; `false` sigue siendo cosa del sync. Las fotos existentes no se tocaron.
- 🔴 **VER ≠ PEDIR — una lista, `PEDIDO_ROLES`** (`lib/catalogo/roles.ts`: admin · secretaria · vendedor). Bodega y David (`gerente_boston`) ven el catálogo y llenaban el carrito hasta topar con el 403 del checkout («No se pudo cargar el directorio», «Sin permiso»). Ahora sus fichas salen en **solo lectura** (`soloLectura` en las dos tarjetas): sin «Agregar», sin carrito, sin «Ver pedido»; en el detalle de un comprobante los dos correos van detrás de `isEditorRole` y el PDF se queda. De la MISMA lista salen `createRoles` de las 4 marcas (Reebok suma su 'cliente' legacy), el checkout, `send-order` y `COMPROBANTES_EDITAR_ROLES` (que ES la misma constante).
- 🩸 **`?tab=pedidos` viejo mandaba a `/home` a vendedor y bodega**: el redirect de compatibilidad corría DESPUÉS del guard de administrar. Ahora corre antes; la pantalla de destino tiene su propio guard.
- 🩸 **Dos puertas de comprobantes**: `GET /api/catalogo/[marca]/orders/[id]` exigía solo sesión (contabilidad y David leían cliente, correo y montos por uuid) → exige `COMPROBANTES_ROLES` como la lista; y `/catalogo/[marca]/pedidos` no tenía guard SSR y ante el 403 decía «No hay comprobantes aún» → guard con `puedeVerComprobantes`.
- 🔴 **`POST /api/catalogo/joybees/import` se retiró** (gemela de `seed`, sin llamadores; recalculaba `active = stock > 0` sin `esVisibleEnCatalogo` y habría devuelto al público los 2 escondidos de Joybees). Es la QUINTA ruta de `rutas-de-catalogo-retiradas.test.ts`, que la usaba como CONTROL y cambió de dirección con nota; `require-admin-no-miente` bajó de 9 a 8 rutas a propósito. La tabla no se toca.
- El aviso negro de `catalogos/marcas` y del catálogo del vendedor lleva `onDismiss` (se quedaba pegado en el celular).
- Candados: `catalogo-escondidos-y-solo-lectura.test.tsx` · `catalogo-foto-a-mano-protegida.test.ts` · `catalogo-comprobantes-guard.test.ts`. Cambiaron de dirección con nota fechada: `catalogo-admin-una-lista` (la pantalla escribe `foto_manual: true`, solo al subir), `catalogo-admin-pantalla-cerrada` (el orden es sesión → marca → `?tab=pedidos` → rol → montar), `pedidos-link-flujo-vendedor` (el detalle GET exige rol), `catalogo-modo-pedido`, `catalogo-superficie`.

- La lista de valores esperados del **Depurador** (`REEBOK_CATEGORY_ESPERADAS`) es **ESPEJO** del mapa del catálogo y hay candado que compara las dos: agregar en una sin la otra pone el build rojo. `HEADWEAR` (gorras → accesorios) entró el 2-sep-2026 por ahí — por la marca `HARDWARE` ya resolvía bien, pero sin él el Depurador gritaba «valor inesperado» sobre un dato bueno.


---

## Las dos pantallas de Plantilla Switch, más útiles (17-sep-2026)

Daniel miró las dos pantallas —la de Reebok y la de Calvin/Tommy/KL— y pidió:
*«¿cómo me lo mejorarías? más eficiente, ect, lo que ya sabes»*. Después aprobó
los dos mockups. Y dejó dicho lo que ya sabíamos y el código ya trataba así:
*«los excel de calvin son los mismos que tommy y kl btw»* — **son DOS pantallas,
no cuatro**, y tres de las cinco mejoras son el MISMO código en las dos.

🔴 **Todo esto es PANTALLA.** No se movió un número del cálculo: ni el costo, ni
el precio, ni el redondeo, ni la talla-muestra. Lo único que cambió del archivo
descargado es el **filtro desde A1 y la fila de encabezados fija**, que
`CLAUDE.md` ya exigía para todo Excel del sistema y del que estos archivos se
habían escapado (ver la sección de abajo).

### 1 · El costo del archivo, para cuadrar contra la factura

`src/lib/depurador/resumen-del-archivo.ts` (PURO). Suma `Costo FOB × Stock Ideal`
y `Costo CIF × Stock Ideal` sobre **las mismas filas que se descargan**.

🔑 **No recalcula: suma lo que las filas YA traen.** El costo de un artículo se
decide en `costoReebok` (Reebok) y en `processRows` (CK/TH/KL). Si este módulo
tuviera una multiplicación por un factor, sería la SEGUNDA definición de costo
del módulo — que es exactamente el defecto que `costoReebok` cerró el 14-sep.

🔴 **Un artículo sin costo NO vale cero**: sale de la suma y se cuenta aparte, y
la pantalla lo dice. Un total que miente es peor que no tenerlo. ⚠️ Un costo que
de verdad es 0 —los SERVICIOS de CK/TH, tipo de artículo 02— SÍ cuenta: es un
número, no un hueco. ⚠️ Y a la fila a la que le falta el FOB pero le sobra el CIF
se la cuenta como SIN COSTO entera: medio artículo en un total no lo ve nadie.

**Medido el 17-sep-2026 sobre el despacho de ropa real** (229 filas, el archivo
con las columnas nuevas): **75 artículos · 229 tallas · 1.403 piezas · FOB
$11.018,30 · CIF $12.117,19**, cero artículos sin costo.

⚠️ **El CIF medido es $12.117,19, no $12.120,13.** Los dos números son de este
archivo, y la diferencia ($2,94) no es un error de nadie: **$12.120,13 es
`FOB total × 1,10`**, mientras que **$12.117,19 es la SUMA de la columna
`Costo CIF *`** — que es lo que va a quedar cargado en Switch. `costoReebok`
redondea el FOB a centavos y **recién ahí** le aplica el flete, artículo por
artículo (ese redondeo está medido: daba un centavo distinto en 66 artículos del
archivo de septiembre). La pantalla dice la suma de la columna, porque es contra
eso que se cuadra.

**Las facturas del archivo** (`facturasDelArchivo`) salen del `Document Number`
del despacho —que se agregó a `COLUMNAS_DESPACHO` y **no entra a ninguna de las
25 columnas**, con candado— y del `Codigo CPBS` en CK/TH, que ya se leía. 🔴 Si
el archivo no las trae, **no se inventan**: la lista vuelve vacía y no se dibuja
nada. Medido: el despacho de ropa trae **la 3971 y la 3970**.

### 2 · Qué es nuevo y qué ya está en Switch

`POST /api/productos/cargar/nuevos-en-switch` + `useNuevosEnSwitch`. Se cuenta
contra `switch_articulo_info`, que el sistema **ya sincroniza** de las seis
empresas — no hace falta subir nada ni pedirle un archivo a nadie. Medido contra
producción el 17-sep-2026: active_shoes 1.763 · vistana 8.274 · fashion_wear
5.117 · fashion_shoes 731 · active_wear 592 · joystep 207.

🔴 **Se compara por `codigo`, acotado a la `empresa_key`** que la pantalla ya
reconoció: el mismo código nombra artículos distintos en dos empresas. El grano
es el ARTÍCULO, no la fila (un código repetido cuenta una vez).

⚠️ **Falla ABIERTA**: si la consulta falla, si la empresa no se reconoció o si esa
empresa no tiene catálogo sincronizado, la línea **no sale** y la pantalla
funciona igual. Nunca frena la descarga. Y un pedazo de la consulta que falla
invalida la cuenta entera: decir «40 nuevos» cuando faltó mirar la mitad del
archivo es peor que no decir nada.

🔑 Se manda la lista de códigos y vuelven DOS números, no 8.274 códigos: el
catálogo entero de Vistana pesa ~100 KB y viajaría en cada archivo cargado.

**Medido contra producción el 17-sep-2026 sobre el despacho de ropa: 56 nuevos ·
19 ya están** (de 75). ⚠️ El encargo traía **63 · 12**, medido unas horas antes;
el total de 75 coincide y los siete de diferencia son artículos que aparecieron
en `switch_articulo_info` entre las dos mediciones (la corrida de esa mañana
quedó con `synced_at` de las 04:50 UTC). El mecanismo es el mismo; lo que cambió
es el catálogo, que es justo el dato que esta línea mira.

### 3 · Los botones se llaman igual en las dos

`src/lib/depurador/rotulos.ts`: **«Descargar plantilla Switch»** y **«Subir otro
archivo»**. Reebok decía «Descargar plantilla Switch» y CK/TH «Descargar
plantilla»; las dos decían «Otro archivo», que no decía si era subir otro o bajar
otro. Barrido que pone el build rojo si un botón vuelve a escribirlos a mano.

### 4a · Reebok — el ámbar que asustaba y no decía qué hacer

🩸 Medido: el aviso marcaba **30 de 75 artículos** (T-SHIRTS 22 · BRA 3 · TOPS 3 ·
JACKETS 2) y decía «Estos artículos van a quedar sin categoría… Revísalos antes
de subir el archivo». **No había nada que revisar**: esas cuatro categorías
vienen BIEN en el archivo de Reebok y el que no las conoce es el catálogo de la
web (`CATEGORIA_POR_RUBRO`, en `src/lib/reebok-clasificacion.ts`). Con el 40 % de
la lista en ámbar y sin nada que hacer, la próxima vez nadie lo lee — y ahí
adentro van los avisos que sí hay que mirar.

`src/lib/depurador/reebok-categorias.ts` parte el resultado de
`valoresInesperados` en dos problemas distintos. **`valoresInesperados` no se
tocó**: sigue devolviendo las tres columnas.

- **CATEGORY** → caja gris, sin ámbar, con el texto que Daniel aprobó y el conteo
  de productos. 🔴 **Una CATEGORY vacía NO es una categoría que falte en el
  catálogo**: no hay nada que agregarle al catálogo llamado «(vacío)», ahí el
  dato falta en el ARCHIVO. Medido sobre los dos despachos de CALZADO (que no
  traen la columna `Category`): sin esa línea el aviso habría dicho «Falta 1
  categoría en el catálogo: (vacío)», que no significa nada.
- **Department y GENDER** → **el aviso NO cambió**: mismo ámbar, mismo texto,
  misma lista de artículos. Ahí el valor sí puede venir mal del proveedor.
- 🔴 El filtro es «no es CATEGORY», no una lista de columnas a mano: el día que
  `ValorInesperado` gane una cuarta columna, esa columna entra **sola** al aviso
  que pide revisar, que es el lado seguro.

⚠️ **El botón «Agregarlas al catálogo» del mockup no existe, y no es un olvido.**
Las categorías del catálogo Reebok **no viven en una tabla ni en una pantalla**:
son un mapa del CÓDIGO (`CATEGORIA_POR_RUBRO` + su espejo
`REEBOK_CATEGORY_ESPERADAS`, con candado que compara las dos listas). No hay
ninguna pantalla a la que llevar a nadie, así que ese botón habría prometido algo
que no pasa. En su lugar hay un **«Copiar las categorías»**, que es lo único
verdadero que se puede hacer hoy. 🔴 **Decisión pendiente de Daniel**: volver ese
mapa una tabla administrable (y entonces sí, un botón que agregue) o dejarlo en
el código.

### 4b · Reebok — la caja gris arranca plegada

«Este despacho no trae N columnas · EAN y Composición ⌄», y se abre al tocarla.
Es correcta y no hay que actuar sobre ella; abierta ocupaba media pantalla
encima de los avisos que sí piden algo.

### 5a · Calvin/Tommy/KL — el ámbar lleva a los estilos

🔴 **UN SOLO MECANISMO DE FILTRADO** (`src/lib/depurador/filtro-ambar.ts`). La
tabla ya tenía su desplegable («Todas las descripciones»); «Ver solo esos N» **no
agrega un segundo filtro**: escribe un valor especial (`__ambar`) EN EL MISMO
desplegable. Por eso el filtro se ve puesto, se quita por donde se quitan los
otros, y no hay dos estados que puedan contradecirse. ⚠️ El valor crudo nunca se
le muestra a nadie (`rotuloFiltro`).

### 5b · «1 marca(s)» pasa a «1 marca»

`plural(n, singular, plural)`: el plural se escribe entero, porque los del
español no siempre son + «s». Barrido que prohíbe `marca(s)` y `estilo(s)` en la
fila de totales.

### Los candados

- `src/__tests__/lib/plantilla-switch-mas-util.test.ts` — las cinco mejoras **y
  la prueba de que el Excel no cambió**: se arma el MISMO libro dos veces (como
  salía antes, `XLSX.write` a secas y sin filtro; y como sale hoy, por
  `workbookBytes` con filtro), se leen los dos de vuelta y se comparan **todas
  las celdas de todas las hojas** —valor, tipo y formato— en las TRES plantillas
  (Reebok, la preforma y CK/TH). Más los totales medidos, clavados.
- `scripts/_mutar-candados-plantilla-mas-util.sh` — **30 mutaciones y 2
  controles, 32 de 32 cazadas**. Entre ellas, las dos que más importan: cambiar
  `Costo FOB *` por `Costo CIF *` en las 25 columnas, y colar el
  `Document Number` adentro del Excel.
- `scripts/_medir-resumen-del-archivo.ts` — SOLO LECTURA, dice para un archivo
  real exactamente lo que la pantalla va a mostrar.

---

## Todo Excel sale por el camino común (17-sep-2026)

Daniel abrió el `Pedido_ActiveShoes_2026-09.xlsx` —la preforma de Reebok con
fotos— y preguntó por qué ese Excel «se ve sin el menú de arriba normal». Le
faltaban el **filtro desde A1** y la **fila de encabezados fija**.

🔴 **Y estaba incumpliendo una regla escrita.** `cxc/CLAUDE.md`: «Los Excel de
todo el sistema empiezan en la fila 1, con filtro desde A1 y la fila de
encabezados fija. Todo export sale por `workbookBytes`/`workbookBuffer`/
`workbookBlob`.» No era un gusto: ya estaba decidido, y **once archivos se habían
escapado**. Una regla escrita que nadie verifica no es una regla: es una nota.

Los once, todos enchufados al camino común:

| Dónde | Qué archivo | Qué le faltaba |
|---|---|---|
| `ReebokClient` (×3) | la preforma sin fotos, la preforma con fotos, la plantilla Switch | filtro y panel |
| `DepuradorClient` | la plantilla Switch de CK/TH/KL | filtro y panel |
| `FacturasTiendaClient` | la plantilla Switch de Multifashion (suelta y en ZIP) | filtro y panel |
| `asistencia/ReporteTab` | el Reporte de asistencia | el camino común |
| `productos/cargar/BulkExcel` | `Formulas-precio.xlsx` | filtro y panel |
| `productos/cargar/CurvasView` | el Excel de tallas | el camino común |
| `api/reclamos/export-excel` y `api/reclamos/[id]/excel` | los dos Excel de Reclamos | el camino común |
| `marketing/inventario-excel` (×2), `generar-zip`, `zip-export`, `zip-marca` | los Excel de Marketing | el camino común |

🔑 **Enchufarlos es byte-idéntico salvo por el filtro**: `workbookBytes` es
`XLSX.write` + `congelarEncabezadosXlsx`, y ese último **solo toca las hojas que
YA tienen `<autoFilter>`** (la fila que congela la LEE del `ref` del filtro). O
sea: **el filtro es lo que enciende el panel fijo**, y por eso las dos cosas se
piden juntas. `filtroDesdeA1(aoa)` (en `excel-export.ts`) arma ese `ref`.

🔴 **EN LA PREFORMA CON FOTOS EL ORDEN NO ES LIBRE: PRIMERO EL PANEL, DESPUÉS LAS
FOTOS.** Los dos parches reescriben el ZIP, pero de formas incompatibles si se
invierten: `congelarEncabezadosXlsx` **solo sabe tocar entradas SIN COMPRIMIR**
—así las escribe SheetJS, y por eso ese camino puede ser síncrono— y
`incrustarFotosEnXlsx` regenera el ZIP con JSZip en **DEFLATE**. Al revés, el
panel se encontraría con todo comprimido, **fallaría ABIERTO** y el archivo
saldría sin fila fija **sin que nadie se entere**. En este orden, JSZip se limita
a agregar las partes del dibujo y el `<pane>` que ya está en la hoja viaja
intacto. Hay test que lo prueba en los dos sentidos.

⚠️ **Los dos exentos, con su porqué escrito:**

- **`MiExcelFotosClient`** — baja el Excel **DEL USUARIO**, no uno del sistema:
  se le pegan las fotos al archivo que él subió y se le devuelve. Puede ser
  `.xlsm` (con macros), que `xlsx-js-style` no sabe reescribir sin romperle el
  VBA. Ahí no se arma ningún libro.
- **Curvas de tallas** — **sin filtro a propósito**: esa hoja NO es una tabla con
  encabezados en la fila 1, lleva **una sección por referencia, cada una con su
  propia fila de encabezados** (`meta.headerRows`). Un filtro desde A1 filtraría
  secciones ajenas y la fila fija congelaría el encabezado de la primera sección
  sobre los datos de las otras. Mismo trato que las fichas de Reclamos. **Igual
  pasa por el camino común.**

Candado: `src/__tests__/lib/excel-por-el-camino-comun.test.ts` — barrido estático
que pone el build ROJO si vuelve a aparecer un `XLSX.write`/`XLSX.writeFile`
fuera de `lib/excel-export.ts`, más la lista de exentos de `saveAs` **con el
motivo escrito** (y la exige: un exento cuyo archivo ya no existe, o sin motivo,
también pone el build rojo). Cambió de dirección con nota fechada y su CONTROL:
`depurador-divisor-tres-caminos` (la preforma bajaba por `XLSX.writeFile`; el
control es que `writeFile` quede en **cero**).

### El archivo nuevo de Reebok, la misma tarde

Reebok mandó las columnas que Daniel les pidió, con dos sorpresas:

- 🔑 **La columna del PO se llama `PO` a secas** (antes `PO NAME`), **y de paso
  quitaron `BP Reference No.`**, que era justo el respaldo que se estaba usando:
  sin el alias nuevo el PO se perdía del todo y el archivo se agrupaba por
  `Orden`. La escalera quedó **`PO NAME` → `PO` → `BP Reference No.` → `Orden`**,
  los cuatro como alias de la MISMA entrada de `COLUMNAS_DESPACHO`.
- ⚠️ **Un archivo trae VARIOS PO.** Medido sobre las 229 filas: **`VIC` en 217 y
  `ACTIVE SHOES` en 12**. El PO se lee POR FILA; el que asuma «un PO por archivo»
  junta dos pedidos.
- 🔴 **`Department` viene, y la derivación era CORRECTA — medido, no supuesto**:
  la columna (APPAREL 163 · HARDWARE 66) coincide con lo que
  `departmentDelSegmento` derivaba del «Segmento de negocio» en **229 de 229,
  cero diferencias**. Por eso se quedan las dos: cuando la columna viene se usa,
  y cuando no, el respaldo da exactamente lo mismo.
- **`Category` viene completa**: T-SHIRTS 95 · SOCKS 46 · SHORTS 36 · BAGS 20 ·
  TOPS 12 · BRA 12 · JACKETS 8. El respaldo a `SHOES` sigue siendo solo para los
  archivos viejos.
- 🔴 **El `EAN` SIGUE sin venir**: solo `UPC`. El orden `EAN → UPC → SKU` no
  cambia y sigue cayendo al UPC. **Es lo único que todavía hay que pedirle a
  Reebok**, porque el EAN es el que Switch tiene cargado.

El fixture `reebok-despacho-ropa-columnas-nuevas.xlsx` es ese archivo **entero**
(229 filas, sin recortar), y con él el candado de «el mismo archivo con y sin las
columnas nuevas» pasó de fabricar las columnas a mano a tener **el caso real**.

### La accesibilidad de la preforma

🩸 Cada foto se escribía como `<xdr:cNvPr id="N" name="Foto N"/>`, **sin el
atributo `descr`**. Por eso el Excel de la preforma abría diciendo
«Accesibilidad: es necesario investigar» y el MISMO archivo sin fotos decía «todo
correcto». Es un archivo que Daniel le manda a clientes. Ahora cada foto lleva
como texto alternativo **el nombre del artículo de esa fila** (el `Name` del
pedido), **escapado como XML** —viene del archivo del proveedor y puede traer `&`
o comillas—. ⚠️ Es OPCIONAL: sin descripción el dibujo sale exactamente como
salía.

## El descuento del proveedor se escribe, no se inventa (18-sep-2026)

Daniel, textual:

> «se debería de poner el descuento yo después de subir el archivo, pongo el % en
> número»
> «como configurar así como la fórmula, pongo el % y que se auto calcule solo»
> «como a veces vienen muchas líneas, hacerlo como que más fácil, GLOBAL»

### 🩸 El defecto

Reebok manda **dos Excel**. El de **despacho** trae el costo ya descontado
(`Precio after Disc`) y se **LEE tal cual** desde el 17-sep-2026. La **preforma**
—la confirmación de compra, con la que se cotiza semanas antes del embarque— **no
dice el descuento**, y el sistema lo **inventaba**: `fobReebok` multiplicaba por
**0,80** el calzado y por **0,70** la ropa y los accesorios.

Esos dos números venían de una columna **`WholesalePrice OFF`** que el parser
busca (`findReebokCols`) y que **no aparece en ningún Excel real** que Daniel
haya recibido: medido, **cero veces**. Y los descuentos reales de Reebok
**varían** —**20 %, 25 % y 30 % en el mismo embarque**, medido sobre el despacho
real del 17-sep-2026, con Daniel diciendo *«hay veces que puede llegar un
porcentaje más alto. No siempre será 20»*—.

Así que la cotización podía salir equivocada **y nada en pantalla lo decía**. Ese
silencio era el defecto de fondo: un costo supuesto que se lee igual que uno
medido no se puede corregir, porque nadie se entera de que hay algo que corregir.

🔴 **Y mueve plata**: el «Costo CIF *» es el costo con el que el artículo entra a
Switch, y de él sale el precio de venta (`TECHO(CIF ÷ divisor)`).

### Qué se hizo

**Un solo campo**, «Descuento del proveedor %», **al lado del flete** y con la
misma forma — es lo mismo que el flete: los dos convierten el precio del
proveedor en el costo que entra a Switch. Se escribe **un número** (25) después
de subir el archivo, se aplica a **todas** las líneas (`WholesalePrice × (1 −
%/100)`) y **se recalcula sin volver a subir nada**, igual que al cambiar el
flete o la tasa. 🔑 **GLOBAL porque una preforma trae ~75 artículos**: teclearlos
uno por uno no lo hace nadie.

La regla vive en el módulo PURO **`src/lib/depurador/descuento-proveedor.ts`** y
se **LLAMA desde `fobReebok`**, que sigue siendo el único lugar donde el
descuento se aplica. 🔴 **No se copia**: duplicar esta cuenta es exactamente cómo
nacieron los dos costos que el 14-sep-2026 hubo que volver a juntar.

### 🔴 Las tres reglas, en este orden, y no hay una cuarta

1. **El dato real GANA SIEMPRE.** Si el archivo trae el precio ya descontado
   (`WholesalePrice OFF` en la preforma, `Precio after Disc` en el despacho), el
   FOB **ES** ese número y el porcentaje escrito no se aplica.
2. **El porcentaje escrito manda sobre la suposición.** Uno solo, para todo el
   archivo, en las **dos salidas** (plantilla Switch y pedido para cliente): un
   solo costo por producto, como el 14-sep.
3. **Vacío = lo de hoy, pero DICHO.** Sin porcentaje se sigue estimando 0,80 /
   0,70 —para no romper a nadie— **y la pantalla lo dice en ámbar**, con cuántos
   artículos son, con qué porcentajes y **dónde escribir el real**.

### 🔴 El despacho no se movió ni un centavo

Dos candados en direcciones distintas, porque uno solo se puede saltar:

- **La pantalla no ofrece el campo en el despacho** y el valor que viaja a los
  builders se apaga ahí (`formato === "confirmacion" ? … : null`). Escribir un
  descuento donde el archivo ya lo trae sería pisar un dato real con una
  suposición.
- **Y aunque viajara, no haría nada**: dentro de `fobReebok` el
  `WholesalePrice OFF` gana antes de que el porcentaje se mire. El candado corre
  los **dos fixtures reales** del despacho (el formato nuevo de ropa y el viejo
  de calzado) con 25 %, 50 % y 90 % escritos y exige que las **25 columnas salgan
  idénticas, celda por celda**.

### ⚠️ Es un campo libre, y el flete son dos botones

A propósito, y la diferencia importa. El flete tiene **dos valores que Daniel
nombró** y un `11` tecleado donde va `1.1` mandaría costos diez veces mal (el
defecto del divisor, `divisor.ts`). El descuento **no tiene lista**: Reebok manda
el que quiera. La red contra el tecleo es otra: se acepta **solo 0–95** y
cualquier otra cosa —un `150`, una letra— **cae al estimado y se dice en
pantalla**. 🔴 Nunca se aplica un número que no se entendió, y nunca en silencio.

⚠️ **Un `0` escrito es un descuento de verdad** (costo = precio de lista), no un
campo vacío. Vaciar el campo **borra lo recordado**: si no, volver al costo
estimado sería imposible después de recargar la pantalla.

### Lo que se recuerda y lo que no

El porcentaje se guarda en **`fg_last_depurador_descuento_reebok`** (este
navegador, esta persona), la misma familia que la tasa, el factor y el modo de
precio. ⚠️ **No es** el flete por defecto, que vive en `app_settings` y lo
comparte todo el equipo: el descuento cambia de embarque en embarque.

### El aviso

Cuenta **artículos, no filas** —una preforma trae una fila por talla, y decir
«229 costos estimados» donde hay 75 artículos asusta sin informar— y **gana la
PRIMERA fila del artículo**, que es exactamente la que `buildCatalogo` y
`buildSwitchRows` usan para el costo del grupo. **Ámbar solo cuando hay costos
supuestos**, que es lo único que pide una acción; con el porcentaje escrito baja
a gris y dice cuánto se descontó. Cuando conviven las dos cosas, **dice que el
del archivo manda**.

### Candados

`src/__tests__/lib/reebok-descuento-proveedor.test.ts` (31 casos, con los
controles de que la preforma sin porcentaje sale número por número como antes).
**15 mutaciones, 15 cazadas**, 2 controles
(`scripts/_mutar-candados-descuento-proveedor.sh`).

⚠️ `reebok-costo-unico.test.ts` **cambió de dirección con nota fechada**, no se
borró: el 0,80 / 0,70 **se mudó** de `fobReebok` al módulo del descuento
(`DESCUENTO_ESTIMADO_CALZADO` / `DESCUENTO_ESTIMADO_RESTO`). La regla que ese
candado protege no cambió —el multiplicador vive en **un solo lugar** y el pedido
para cliente no puede volver a tener el suyo—; cambió cuál es ese lugar.

---

## 🔴 «SIN MANDAR» DICE DESDE CUÁNDO, Y LA TARJETA SE PODA (22-sep-2026)

Dos cambios de Catálogos aprobados el mismo día. Otros cuatro que se propusieron quedaron
**rechazados** y no se tocaron.

---

### A · $32.208 QUE NUNCA LLEGARON A SWITCH Y NADIE VEÍA

**Medido contra producción el 22-sep-2026** (las 4 marcas, `<marca>_orders` vivas cruzadas
contra `<marca>_switch_envios` con envío ACTIVO — `enviado` o `verificado`):

| Pedido | Marca | Cliente | Monto | Creado | Días |
|---|---|---|---|---|---|
| **PED-019** | reebok | Contado | **$2.760,00** | 22-jul-2026 | **62** |
| **TOM-005** | tommy | Contado | **$16.920,00** | 12-ago-2026 | **41** |
| **TOM-006** | tommy | Contado | **$7.254,00** | 12-ago-2026 | **41** |
| **CKP-007** | calvin | ACTIVE SHOES, S.A. | **$1.704,00** | 12-ago-2026 | **41** |
| **TOM-023** | tommy | Wolf Mall Center Int | **$3.570,00** | 20-ago-2026 | **33** |
| | | **TOTAL** | **$32.208,00** | | |

⚠️ **CKP-007 nació a las 02:35 UTC del 13-ago, o sea el 12-ago de PANAMÁ.** Contarlo en UTC
diría 40 días donde son 41. Es la trampa de siempre de este repo, y por eso el día llega por
parámetro desde `hoyPanama()` y nunca se lee un reloj adentro del módulo.

⚠️ **Estos cinco se BORRAN aparte**, en su propio cambio del mismo día
(`20261213120000_borrar_pedidos_parados.sql`, borrado suave por lista de ids). Esa migración
los cuenta en **UTC** (61 · 40 · 40 · 40 · 32) y esta tabla en **PANAMÁ** (62 · 41 · 41 · 41 ·
33): la diferencia de un día es exactamente la trampa que este cambio cierra. Lo de acá no es
la limpieza de lo que ya pasó, sino que **el próximo no tarde 62 días en verse**.

🔴 **LOS CINCO SON BORRADORES, Y ÉSE ERA EL AGUJERO.** La línea roja del 6-sep-2026
(`esSinMandar` → `textoSinMandar`) solo agarra los **TERMINADOS** que no salieron, y de ésos
hoy hay **CERO**: nadie ve esa línea en ninguna marca. Los cinco caían en la otra rama —
`TEXTO_NO_ENVIADO`, «No se ha mandado a Switch»— **en `text-gray-400`, del mismo tamaño que
todo lo demás y sin decir hace cuánto**. PED-019 llevaba 62 días ahí y se leía exactamente
igual que uno armado esa mañana.

#### 🔑 DE DÓNDE SALE EL UMBRAL DE 7 DÍAS

No es un gusto. **Un pedido que sale a Switch, sale en el acto.** Medido sobre los **71
envíos activos** de las 4 marcas, la distancia entre crear el pedido y mandarlo:

| | |
|---|---|
| p50 | **0,00 h** |
| p75 | 0,01 h |
| p95 | 0,02 h |
| p99 | 4,38 h |
| **máximo** | **4,38 h** |
| mismo día de Panamá | **71 de 71 — 100 %** |

Ni uno cruzó la medianoche. Y entre «lo normal» (≤ 4,4 horas) y lo trabado (**33 días**, el
más nuevo de los cinco) **no hay absolutamente nada**: el corte se puede poner en cualquier
parte de ese hueco sin cambiar a quién agarra. Se eligió **7** por ser el más chico que
además: es ~38 veces el caso real más lento (ningún pedido sano lo puede tocar, ni con un
fin de semana largo de por medio), deja **26 días de margen** por debajo del más nuevo de
los cinco, y se lee como lo que es —«lleva una semana ahí»—, no como un umbral.

#### Qué quedó

- 🔴 **El borrador que se quedó también dice DESDE CUÁNDO**: mismas palabras
  (`TEXTO_NO_ENVIADO`) más la antigüedad — «No se ha mandado a Switch · hace 41 días».
- ⚠️ **El del PRIMER día no dice «· hoy» ni cambia de color.** Un borrador armado esta
  mañana no es noticia, y una alarma que suena siempre no se oye.
- 🔴 **A partir de los 7 días se pinta como el trabado** (`font-medium text-red-600`). El
  tono sale de `tonoSinLlegar` + `CLASES_TONO` y **la pantalla no elige ningún color**: la
  tabla del escritorio y la ficha del teléfono leen la misma tabla y no pueden discrepar.
- ⚠️ **EL TERMINADO NO ESPERA LA SEMANA.** Un confirmado sin envío activo está mal desde el
  primer minuto: sigue rojo desde el día cero, igual que el 6-sep-2026. La semana es solo
  para el borrador.
- 🔴 **Los días se cuentan en UN solo lugar** (`diasSinLlegarASwitch`), con el día de Panamá
  por parámetro, y **sin fecha legible no se inventa un número** — «hace NaN días» es peor
  que no decir cuánto.

#### Lo que **NO** cambió, a propósito

- 🔴 **`esSinMandar` no se tocó.** Quién es «trabado» lo sigue decidiendo el **ENVÍO ACTIVO**,
  nunca el `status` ni el número (regla del módulo desde el 24-ago-2026). Un envío activo sin
  número sigue contando como que salió.
- 🔴 **El chip filtro «Sin mandar» sigue contando solo los CONFIRMADOS** (hoy 0, por eso ni
  se dibuja). Meter los borradores ahí es una decisión de Daniel que **no está tomada**: la
  nota del 6-sep-2026 razona justamente en contra («un aviso que exagera se aprende a
  ignorar»). Los cinco ya son alcanzables por el chip **«Borradores»**, que los tiene a los
  cinco, y ahora la fila grita.
- 🔴 **El pedido del LINK sin convertir queda afuera de esta cuenta.** Todavía no es un
  pedido de la casa y su abandono se mide con la ventana de 30 días
  (`comprobantes-ventana.ts`).

⚠️ **NOTA FECHADA sobre un candado anterior.** `comprobantes-rediseno-pantalla.test.tsx`
(6-sep-2026) dice «un BORRADOR conserva su frase gris». Sigue siendo cierto **el primer
día**; a partir de la semana se pinta como el trabado. Ese candado no se tocó: su borrador
de prueba nace hoy.

**Candados:** `comprobantes-antiguedad.test.ts` · `comprobantes-antiguedad-pantalla.test.tsx`.

---

### B · LA TARJETA DEL PRODUCTO, PODADA — SE VA EL COLOR, SE QUEDAN EL BADGE Y «CONSULTAR»

Se auditaron los tres adornos de `CatalogoProductCard.tsx` que en producción no se dibujan
nunca. **El criterio no fue «está vacío», fue «¿hay alguien que lo pueda llenar?»**, y los
tres dieron respuestas distintas.

| | Medido el 22-sep-2026 | ¿Quién lo puede escribir? | Veredicto |
|---|---|---|---|
| **`color`** (puntito + nombre) | vacío en **391 de 391** de Reebok (390 NULL + 1 vacío); **las otras 3 marcas ni tienen la columna** | **NADIE** | 🩸 **SE VA** |
| **`badge`** (Oferta · Nuevo · Próximamente) | NULL en **1.140 de 1.140** de las 4 marcas | ✅ `PUT`/`POST /api/catalogo/[marca]/products` | 🔴 **SE QUEDA** |
| **«Consultar»** (producto sin precio) | **0 de 1.140** sin precio (el único con precio 0 está apagado) | el sync y la columna admiten NULL | 🔴 **SE QUEDA** |

#### 🩸 `color` se va: no está vacío por ahora, está muerto

Las cinco vías, verificadas una por una:

1. **Admin** — `AdminProducto` no tiene el campo; ninguna pantalla de `catalogos/**` lo nombra.
2. **API** — `EDITABLE_FIELDS` es `["image_url", "badge"]`. `color` **no está**, y la ruta lo
   **rechaza con 400** («Campos no editables: color»).
3. **Sync de Switch** — ni el genérico ni los cuatro por marca lo escriben, ni en el INSERT
   ni en el UPDATE.
4. **Scripts** — ninguno.
5. **Migraciones** — **cero DDL** que lo toque desde que nació en `reebok-setup.sql`.

Switch **sí** trae un `color` en `/apiarticulos/lista`, y está medido vacío desde el
6-ago-2026 (migración `20260806120000`: *«`talla` y `color` de /apiarticulos/lista … vacios
en los 650»*). O sea que aunque se quisiera llenar, **solo podría ser un campo a mano**, y
ese campo no existe en ninguna pantalla.

**Qué se quitó, y de dónde:** el puntito y el nombre de la tarjeta (con su `COLOR_DOT_MAP` de
24 hex adivinados por `includes` del texto), las **dos** `cols` de Reebok en `marcas.ts` —así
**deja de viajar al navegador**, no solo de dibujarse—, los buscadores del catálogo público y
del vendedor, el PDF del catálogo y los dos tipos (`CatalogoProducto`, `reebok/supabase.Product`).
🔑 **La COLUMNA `products.color` NO se dropea** (patrón `mayor_lineas`): queda sin lectores.

#### 🔴 `badge` se queda: tiene puerta viva

Está igual de vacío que `color`, pero **esa misma ruta SÍ lo escribe y lo valida** contra tres
valores (`nuevo` · `oferta` · `proximamente`), con `requireAdminOSecretaria` e invalidación del
caché público. Los controles de la pantalla se retiraron el 6-sep-2026 por tener 0 usos, pero
**la puerta quedó abierta a propósito** — reponerlos es solo UI.

Y de `badge` cuelgan **tres cosas vivas**, no una:

- la **PRE-ORDEN** de Reebok (`is_preorder = badge === "proximamente"`, y el botón
  «Pre-ordenar»);
- la regla de **«a la venta»** (`a-la-venta.ts`, cláusula 3), que está **espejada byte a byte**
  en la migración `20261123120000` de los contadores del hub, con candado que compara las dos;
- el color del precio en el **PDF** del catálogo.

Quitar los tres adornos dejaría la puerta escribiendo un dato que ya nadie dibuja. **No se
tocó.**

#### 🔴 «Consultar» se queda

`price` es `number | null` en la columna y en el tipo, y un producto sin precio es un estado
**real y posible** — hoy no hay ninguno activo, pero el sync puede dejarlo. Borrarlo dejaría
un **hueco en blanco donde va el precio**, que es peor que una palabra. ⚠️ Ojo: la condición
es `product.price ? … : "Consultar"`, así que un precio **0** también cae ahí.

**Candado:** `catalogo-tarjeta-podada.test.tsx` — build ROJO si el color vuelve a la tarjeta,
al payload, al buscador o al PDF; **y también** si alguien se lleva el badge, sus tres adornos
o «Consultar».

---

### Verificado por mutación

`scripts/_mutar-candados-catalogo-22sep.sh` — **31 mutaciones, 31 cazadas; 2 controles en
verde; 0 problemas.** Entre ellas: la frase sin antigüedad, el «hoy» del navegador en vez del
de Panamá, la fecha partida en UTC (CKP-007 diciendo 40 en vez de 41), el umbral apagado en
0 · 3650 · 45, el tono que deja de escalar, el rojo que se vuelve gris, «trabado» deducido del
número en vez del envío, el color de vuelta en la tarjeta / el payload / el buscador / el PDF,
y los tres adornos, el badge y «Consultar» sacados.

🩸 **Y de paso se arregló un defecto del arnés viejo.**
`scripts/_mutar-candados-comprobantes-rediseno.sh` mutaba `fila-comprobante.ts` y
`numeros-pedido.ts` **sin tenerlos en su lista `ARCHIVOS`**, así que `restaurar()` no los
tocaba: el script terminaba **dejando los dos archivos rotos en el árbol de trabajo**, y con
ellos rotos todo lo que corría después del cuarto mutante daba «cazada» por el motivo
equivocado. Ahora están en la lista. Con el arnés honesto quedan **2 mutantes que SOBREVIVEN**
y que **no son de este cambio** (los dos archivos están intactos): «los conteos vuelven a
contar TODO el listado» (`ComprobantesPanel.tsx`) y «el correo del directorio deja de fallar
abierta» (`correo-del-cliente.ts`). ⚠️ **Pendiente: esos dos candados hay que apretarlos.**

---

## Lo que decía CLAUDE.md hasta el 22-sep-2026 (movido acá, verbatim)

### Catálogos, pedidos y cotización — [docs/postmortems/catalogos-pedidos.md](docs/postmortems/catalogos-pedidos.md)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/catalogos-pedidos.md](docs/postmortems/catalogos-pedidos.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- 4 marcas: Reebok (`active_shoes`) · Joybees (`joystep`) · Tommy (`fashion_shoes`) · Calvin (`vistana`). **Joybees es espejo exacto de Reebok.**
- Roles (`catalogo/roles.ts`): `CATALOGO_ROLES` = ver · `CATALOGO_ADMIN_ROLES` (admin + secretaria) = administrar · `PEDIDO_ROLES` (admin · secretaria · vendedor) = pedir.
- 🔴 **VER ≠ PEDIR**: bodega y `gerente_boston` ven en **solo lectura**. De `PEDIDO_ROLES` salen los `createRoles` de las 4 marcas (Reebok suma su `cliente` legacy), el checkout, `send-order` y `COMPROBANTES_EDITAR_ROLES`.
- 🔴 **El cliente se elige, nunca viene puesto**: el servidor responde **422** si un pedido interno sale sin cliente. El mostrador es `TCKCTA` y hay que tocarlo.
- **Un solo selector de cliente** (`ClientePicker` · `ClienteSwitchPicker`); barrido que pone el build ROJO si aparece otro.
- **Pedido** (`/apipedido/terminar`) o **cotización** (`/apicotizacion/terminar`); **una cotización NO aparta mercancía**. `normalizarDocumento` cae a **pedido** ante un valor raro.
- **At-most-once**: único parcial `(order_id) WHERE estado <> 'error'`. Cotizar consume el envío; para vender se **duplica**. El papel dice cuál fue por el **envío activo**, no por el `status`.
- El panel «Comprobantes» conserva la key `pedidos` (`role_permissions`). 🔴 **Los pedidos viejos NO se borran, se muestran menos**: **90 días** (`catalogo/comprobantes-ventana.ts`).
- 🔴 **En el pedido público el precio NO se toca**: el servidor lo reescribe desde la base. ⚠️ La cartera sigue cerrada: el cliente teclea su nombre. ⚠️ Ese pedido **sigue sin salir solo a Switch**.
- 🔴 **Lo que viaja al navegador se resuelve en el SERVIDOR** (`catalogo/publico-payload.ts`, puro): UN número de disponibilidad. ⚠️ Las columnas se siguen LEYENDO: sin `existencia` no hay respaldo.
- 🔴 **El catálogo interno de Reebok exige sesión**: `products` e `inventory` salieron de `PUBLIC_PREFIXES`, `authStyle` = `scope-admin`. ⚠️ `/api/catalogo/reebok/public` se queda.
- 🔴 **LOS OCHO NÚMEROS DEL HUB LOS SUMA LA BASE, Y LA REGLA SIGUE SIENDO UNA (14-sep-2026).** Daniel: *«5. ok va»*. 🩸 `/catalogos/marcas` bajaba el catálogo entero de las 4 marcas —**462,8 KB**, **24.384 ms de p95**— para escribir «N a la venta · N sin foto»; hoy es UNA petición de **181 bytes**. 🔴 **No hay dos definiciones de «a la venta»**: el SQL **se GENERA** desde `catalogo/contadores.ts` y la migración `20261123120000` (aplicada) es su salida impresa, comparada byte a byte. 🔴 **Falla ABIERTA**. Candado: `catalogo-contadores-una-regla`. Detalle en el postmortem.
- 🔴 **LAS CATEGORÍAS DE REEBOK SE ADMINISTRAN, NO SE PROGRAMAN (17-sep-2026).** Daniel: **«sí»**. El mapa `rubro → categoría` vive en `reebok_rubro_categoria` (`20261205120000`, aplicada), se edita en **Catálogos › Reebok** (**solo admin**) y el Depurador lo **DERIVA**: el ESPEJO murió. 🔴 **Falla ABIERTA** a las SEIS del código; **`CategoriaReebok` CERRADO** (CHECK); **manda la MARCA**. **1.763, 0 cambios.**
- 🔴 **El logo de Tommy va de COLOR sobre placa blanca** (20-sep): el blanco tiene la bandera invertida. 🔴 Pendiente de Daniel: el master REVERSADO. `tommy-logo-que-se-lee`.
- Candados: `catalogo-publico-como-el-catalogo` · `catalogo-publico-revisar` · `catalogo-reebok-rubros`.

**Sync, clasificación y puertas.**

- **Las escrituras del sync que no cambian nada no se hacen**; ante la duda, se escribe. **El precio lo manda Switch**: a mano solo `image_url`/`badge` (+`name` en Tommy, que marca `nombre_manual`).
- 🔴 **CADA MARCA CLASIFICA EL GÉNERO DE OTRA FORMA. Un solo mapa rompe dos marcas.** Tommy y Calvin lo sacan **de la DESCRIPCIÓN** (el guion de `Women-Slippers`), en `tommy-gender.ts` y `calvin-gender.ts`, y el pareo es por **igualdad sobre una tabla de alias, NUNCA por `includes`** — «female» contiene «male» y «women» contiene «men». Reebok no: usa `rubro`/`subrubro` con desempate por nombre. Daniel: *«Pero tommy y calvin es por descripción. No como reebok»*.
- 🔑 **Lo que entra a Switch en Active Shoes SALE de la plantilla del Depurador.** La cadena es **Depurador → Excel de 25 columnas → se sube a Switch → el cron lo lee → catálogo público**, así que un producto mal clasificado en el catálogo **no se arregla en el catálogo**: se arregla en la plantilla o en Switch.
- **La clasificación de Reebok la manda Switch** (`reebok-clasificacion.ts`): la MARCA da la categoría, el SUBRUBRO el género, el `rubro` es plan B; `UNISEX` → Hombre y solo ahí desempata el nombre. Lo desconocido cae en `otros`/`sin_clasificar` y **nunca pisa** lo ya clasificado.
- 🔴 **«Todavía no llegó» NO es «llegó algo que no entiendo»** (`fichaLlego`): sin `ficha_at` no se avisa **ni se clasifica**; con `ficha_at`, un valor desconocido o vacío sí avisa.
- 🔴 **La existencia de un escondido NO se congela**: entra al conjunto que se le pregunta a Switch (`ocultosManualSkus`). 🔴 **Esconder sigue siendo esconder**: manda `esVisibleEnCatalogo`, donde `oculto_manual` gana SIEMPRE y con ella se recalcula `active`. ⚠️ Sin la columna, todo como antes.
- 🔴 **La foto a mano queda protegida**: viaja `foto_manual: true` con la foto y el servidor acepta **solo `true` y solo con `image_url`**; el `false` es del sync. ⚠️ La de Calvin (`20261011120000_calvin_foto_manual.sql`) está **aplicada** (verificado contra producción el 14-sep-2026).
- 🔴 Guard SSR en `/catalogos/admin/[marca]` con la lista derivada de `CATALOGO_ADMIN_ROLES` (`puedeAdministrarCatalogo`); `?tab=pedidos` redirige **antes** del guard; `orders/[id]` exige `COMPROBANTES_ROLES` y `/catalogo/[marca]/pedidos`, `puedeVerComprobantes`.
- 🔴 **Cinco rutas retiradas**: `joybees/seed`, `joybees/import`, `[marca]/pedidos-unificado`, `reebok/stats`, `reebok/inventory/bulk`. ⚠️ `reebok/inventory` y `pedidos-export` siguen vivos. 🔴 **Las tablas no se tocan** (patrón `mayor_lineas`).
- 🩸 Borrar de verdad es la excepción (`20260924120000`, aplicada): lista de **ids**, nunca un `LIKE`; el que tenga envío vivo se saca; solo lo ya `deleted`.
- Candados: `reebok-clasificacion` · `catalogo-reebok-clasifica` · `catalogo-escondidos-existencia-viva` · `catalogo-calvin-foto-manual` · `catalogo-admin-pantalla-cerrada` · `rutas-de-catalogo-retiradas` · `borrar-pedidos-de-prueba` · `catalogo-escondidos-y-solo-lectura` · `catalogo-foto-a-mano-protegida` · `catalogo-comprobantes-guard`.

**Plantilla Switch (era el Depurador).**

- 🔴 **REEBOK ENTRA POR DOS ARCHIVOS, Y LA PANTALLA DICE CUÁL SE SUBIÓ (17-sep-2026):** la **confirmación de compra** (para cotizar — **no cambió**) y el **despacho**, que arregla tres números inventados: el **costo se LEE** (`Precio after Disc`), el **código de barra sale del `EAN` y, sin él, del `UPC`** y la **cantidad es `Quantity`**. 🔴 **Pendiente: el `EAN`**, lo ÚNICO que falta. 🔴 **El MISMO archivo con o sin las columnas nuevas**: el respaldo es un DATO (`COLUMNAS_DESPACHO`), `PO NAME` → **`PO`** → `BP Reference No.` → `Orden`, y **nada de lo que falta es obligatorio**. ⚠️ **Un archivo trae VARIOS PO**: se lee por FILA. No hay un segundo generador de las 25 columnas ni otra cuenta de costo. Candado `reebok-despacho.test.ts`; detalle en el postmortem.
- 🔴 **EL DESCUENTO DE LA PREFORMA SE ESCRIBE (18-sep-2026):** campo GLOBAL «Descuento del proveedor %» al lado del flete, recordado por persona; vacío = se estima 20/30 % **y se dice en ámbar**. El `WholesalePrice OFF` real y el DESPACHO le ganan siempre. Candado `reebok-descuento-proveedor`.
- 🔴 **LAS DOS PANTALLAS SE PORTAN COMO UNA (17-sep-2026):** los totales dicen **FOB y CIF** (suma de lo que las filas YA traen; el **sin costo se cuenta aparte**, nunca vale 0), las **facturas solo si el archivo las trae** y **«N nuevos · N ya están en Switch»** por `empresa_key` (**falla ABIERTA**). Los rótulos, en UNA constante. El ámbar de **CATEGORY** de Reebok se separó del de Department/GENDER (que NO cambió); «Ver solo esos N» va por el MISMO desplegable. 🔴 **Ningún número del cálculo se movió.** Candado: `plantilla-switch-mas-util`.
- 🔴 **TODO EXCEL SALE POR `workbookBytes`/`workbookBuffer`/`workbookBlob` (17-sep-2026)**, y la hoja tabular pone `filtroDesdeA1`: **enciende el panel fijo**. Se habían escapado **once**. 🔴 **Con fotos, el panel PRIMERO.** Candado: `excel-por-el-camino-comun.test.ts`.
- 🔴 **UNA sola plantilla: la de Switch, 25 columnas** (`OUT_COLS`, `depurador/logic.ts`) para las 4 empresas destino, Facturas Tienda y Reebok; fixture en el repo y candado de igualdad encabezado por encabezado.
- **Cambia el CONTENIDO, no las columnas:** Fashion Shoes → FOB y CIF separados, **CIF = FOB × 1,10** como Vistana; Multifashion → **FOB = CIF** = precio de la factura. **«Composición» siempre vacía.** **Tasa `07` como TEXTO** (`tasaSwitch`), nunca `7` ni `7.00`. `TEXT_COLS = [0, 1, 2]` es posicional.
- 🔴 **La key `cargar` y `/productos/cargar` NO cambiaron** (están en `role_permissions` y `fg_users.modulos_override`).
- 🔴 **El divisor se valida en los TRES caminos** (`validarDivisor`): se apaga **la DESCARGA, nunca el tecleo**. La tasa es un select de dos: 7% → `07`, Exento → `0`, siempre TEXTO.
- 🔴 **Los precios escritos a mano se conservan** al re-procesar y al cambiar la configuración, pegados por **REFERENCIA de artículo, nunca por índice de fila**. La config se recuerda por usuario (`fg_last_depurador_*`); el archivo no.
- 🩸 **El short de baño se mide en LETRA** (`TALLA_LETRA`), que le gana a calzado y a pantalón.
- 🔴 **La secretaria puede QUITAR una descripción** (`PATCH /api/productos/cargar/descripciones/[id]`); es `activa = false`, **nunca un DELETE**.
- 🔴 **Las dos mitades de una descripción solo valen dentro de la MISMA marca** (`veredictoDescripcion(desc, catalogo, marca)`, índice `porMarca`). ⚠️ «ya-existe», `normalizarEspacios` y la casi-gemela COMPLETA miran todo el catálogo. Interruptor `MITADES_POR_MARCA` en **`true`**.
- 🔴 **La compañía se RECONOCE de la marca del archivo, no se elige** (`empresaDeMarcaCatalogo`); con marcas de DOS compañías **se dice y no se adivina**. No se recuerda.
- 🔴 **La «Temporada» es UN campo (AAAA-MM), arranca en el mes actual de Panamá y NO se recuerda**; tasa, factor y modo de precio sí.
- 🔴 **El Historial guarda el MISMO Excel (bytes idénticos), 90 días**, en el bucket privado `depurador-plantillas` (`20260921120000`, **aplicada**), **SOLO los Excel de Switch**. El cron `cleanup-depurador-archivos` (03:20 UTC) borra el vencido y **la fila con los totales queda para siempre**.
- Tallas y Fotos a mi Excel se anotan en `activity_logs` y no salen en el Historial. ⚠️ **La marca desconocida se queda EXACTAMENTE como está**.
- `REEBOK_CATEGORY_ESPERADAS` es **ESPEJO** del mapa del catálogo (candado que compara las dos).
- ⚠️ **Decisión pendiente de Daniel:** Reebok y Facturas Tienda no validan el divisor en pantalla como CK/TH (el guard de las rutas API sí aplica al guardar).
- Candados: `depurador-plantilla-switch` · `depurador-validacion-pantalla` · `plantilla-switch` · `plantilla-switch-pantalla`.
