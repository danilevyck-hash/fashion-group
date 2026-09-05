# Catálogos · Referencia · Depurador

> **Documento de REFERENCIA, no de sugerencias.** Aquí está lo que HAY: pantallas, campos,
> tablas, endpoints, reglas fijadas y lo que no cuadra. Las mejoras viven en `docs/eficiencia/`.
>
> Medido contra producción el **4-sep-2026**. Donde algo no se pudo medir, lo dice.
> Complementa —no repite— `cxc/CLAUDE.md` y los post-mortems de `docs/postmortems/`.
>
> **Los tres módulos de este archivo:**
>
> | Módulo | Ruta | key | Roles | Qué es en una línea |
> |---|---|---|---|---|
> | **Catálogos** | `/catalogos/marcas` | `catalogos` | admin · secretaria · vendedor · bodega · gerente_boston | Las 4 marcas, sus catálogos público e interno, los pedidos y **la única puerta por la que un pedido sale hacia Switch** |
> | **Referencia** | `/referencia` | `referencia` | admin · vendedor · bodega | Qué llegó, cuánto, cuánto se vendió y en cuánto tiempo — para decidir la recompra |
> | **Depurador** | `/productos/cargar` | `cargar` | admin · secretaria | Convierte el Excel del proveedor en la plantilla de 25 columnas que se sube a Switch a mano |
>
> **Lo que los tres comparten:** los tres viven pegados a **Switch Soft**, y en direcciones
> distintas. Catálogos **lee** el catálogo por API y **escribe** pedidos por API. Referencia
> **lee** por API *y* por scraping del panel web. El Depurador **no habla con Switch por código**:
> produce un archivo que una persona sube a mano. ⚠️ **La sesión de Switch es por USUARIO, no
> por empresa**, y el sistema entra como `daniel`: cada corrida que toca el panel web lo expulsa,
> y por eso los crons de una misma empresa van a ≥ 15 minutos.

---

# Catálogos (`/catalogos/marcas`, key `catalogos`)

> Módulo grande: cuatro marcas, tres públicos distintos (el vendedor con sesión, el
> cliente sin sesión, el administrador de fotos) y **la única puerta del sistema por la
> que un pedido SALE hacia Switch**. La regla de negocio vigente está en
> `CLAUDE.md § Catálogos, pedidos y cotización`; la historia completa con las citas
> textuales en [`docs/postmortems/catalogos-pedidos.md`](../postmortems/catalogos-pedidos.md).
> Este documento es el mapa: qué pantallas hay, qué endpoint responde cada botón, qué
> tabla toca y quién lee lo que produce.

## Qué es

El catálogo de las **cuatro marcas propias** con foto, precio y existencia, en tres
formas: (1) el **catálogo interno**, donde un vendedor arma el pedido; (2) el **catálogo
público**, un link que se manda por WhatsApp y que el cliente usa sin login; (3) el
**panel de administración por marca**, donde se suben las fotos y se ocultan productos.
El pedido termina en **Switch**, como *pedido* o como *cotización*, y queda listado en el
panel **«Comprobantes»**.

| Marca (label en pantalla) | key | Empresa de Switch | Prefijo del número | Tabla de productos | Proyecto Supabase |
|---|---|---|---|---|---|
| **Reebok** | `reebok` | `active_shoes` | `PED-` | `products` (+ `inventory`) | 🔴 **otro proyecto** (`reebokServer`) |
| **Joybees** | `joybees` | `joystep` | `JBP-` | `joybees_products` | principal |
| **Tommy Hilfiger** | `tommy` | `fashion_shoes` | `TOM-` | `tommy_products` | principal |
| **Calvin Klein** | `calvin` | `vistana` | `CKP-` | `calvin_products` | principal |

Toda la diferencia entre marcas vive en **dos catálogos de configuración**, no en cuatro
copias del código:
- `src/lib/catalogo/marcas.ts` — `MARCAS_CONFIG`, **server-only** (resuelve clients
  service-role; los clients son **lazy** a propósito: importar el módulo nunca construye
  un client).
- `src/lib/catalogo/marcas-ui.tsx` — `MARCA_THEME`, el lado del navegador (rutas, logos,
  colores, rótulos de filtro, métricas del admin).

Las divergencias entre marcas están marcadas en el código como **QUIRK heredado** y se
conservan a propósito: «unificarlas requiere OK de Daniel, no es decisión de un refactor».

## Quién entra

Dos niveles, y solo dos (`src/lib/catalogo/roles.ts`, **fuente única**; candado
`src/__tests__/lib/catalogo-roles.test.ts` congela las dos listas):

| Lista | Valor | Qué abre |
|---|---|---|
| `CATALOGO_ROLES` | `admin, secretaria, vendedor, bodega, gerente_boston` | Ver el hub, ver el catálogo, armar pedidos |
| `CATALOGO_ADMIN_ROLES` | `admin, secretaria` | Administrar la marca: fotos, ZIP del B2B, etiquetas, ocultar productos, exportar y borrar comprobantes |
| `COMPROBANTES_ROLES` | `admin, secretaria, vendedor, **bodega**` | **VER** la lista de comprobantes (bodega entró el 25-ago-2026) |
| `COMPROBANTES_EDITAR_ROLES` | `admin, secretaria, vendedor` | Editar / duplicar / convertir un comprobante — **bodega no** |

**Qué ve cada rol de distinto**

- **admin** (daniel, alberto): todo.
- **secretaria** (andrea, Angela): todo el admin de las 4 marcas. Se sumó el 27-jul-2026 — Daniel: *«a las secretarias, ponle que puedan ver catálogos como a daniel, con administrar también»*. Antes la API ya la dejaba entrar a casi todo y **la UI le escondía el botón «Administrar»**: el cambio alineó las tres capas.
- **vendedor** (rey, edwin, rodrigo): ve el catálogo, arma pedidos, envía a Switch, convierte un pedido del link, duplica. **No ve** los botones «Administrar» ni «Exportar Excel» (el endpoint le contesta 403).
- **bodega** (usuario «Bodega»): ve el catálogo y **mira** los comprobantes. En cada fila el botón dice **«Ver»**, no «Editar»: `PUT /orders/[id]`, `POST /pedidos-publicos/[id]/convertir` y `POST /orders` le responden **403** (medido con cookies firmadas en las 4 marcas: 200 en el GET de `orders`, 403 en las 10 rutas de escritura).
- **gerente_boston** (david): **solo VER** (27-ago-2026, Daniel: *«catalogo para david si, solo eso»*). Está en `CATALOGO_ROLES` y por eso pasa el hub y el `GET /products`; **no** está en `COMPROBANTES_ROLES`, así que la lista de comprobantes le contesta 403 y el botón «Pedidos» del hub no se le dibuja.
- **contabilidad** y **gerente_acs** (jennifer): **no entran**. `/catalogos/marcas` los rebota; el `GET /products` de Joybees/Tommy/Calvin les contesta 403.

**El guard de las pantallas con sesión no mira el rol, mira los MÓDULOS.**
`CatalogoAuthGuard` (`src/components/catalogo/CatalogoAuthGuard.tsx`) lee
`sessionStorage.fg_modules` + `cxc_role` y pregunta `fgModulesDaAcceso(mods, "catalogos", role)`
— la MISMA regla del menú. Sin eso, un módulo prestado se pintaría en el sidebar y la
página lo rebotaría.

**Medido en `role_permissions` el 4-sep-2026**: `catalogos` está en las listas de
`admin`, `secretaria`, `vendedor`, `bodega` y **`gerente_boston`** (`["boston","catalogos","asistencia"]`).
O sea que la DDL `20260902130000` **ya corrió** — ver «Lo que sobra o no cuadra».

## Las pantallas

### 1. El hub — «Catálogos › Marcas» (`/catalogos/marcas`)
`src/app/catalogos/marcas/page.tsx`. Cuatro tarjetas: **REEBOK · JOYBEES · TOMMY HILFIGER · CALVIN KLEIN**.
- Cada tarjeta cuenta **«N productos»** y, si los hay, **«N sin foto»** en color de alerta. Los conteos se piden a `GET /api/catalogo/<marca>/products?active=true` — **cuatro llamadas en paralelo**, cada una independiente: si una falla, esa tarjeta dice «Contadores no disponibles» y las otras tres siguen.
- Botones: **«Ver catálogo»** (todos) · **«Pedidos»** (solo `COMPROBANTES_ROLES`) · **«Administrar»** (solo `CATALOGO_ADMIN_ROLES`). Con los tres, la fila **baja de línea, no se aplasta** (`flex-wrap`; medido en 390 / 834 / 1024 / 1440 px, cero arrastre horizontal, todos ≥ 44 px de alto).
- El `<h1>Catálogos</h1>` es `sr-only`.

### 2. El catálogo con sesión (`/catalogo/[marca]`)
`CatalogoVendedorPage`. La grid canónica: **la raíz es la grid en las cuatro marcas** y
`/catalogo/[marca]/productos` redirige aquí **conservando los query params** (los links
viejos de Reebok compartidos por WhatsApp siguen funcionando).
- **Filtros** (`CatalogoFilters`): **Género · Categoría · Bulto · Precio (desde / hasta)** y un orden — **Relevancia · Precio: menor a mayor · Precio: mayor a menor · Nombre A-Z**. El chip de bulto se rotula **«2 bultos o más»** (`MIN_BULTOS = 2`). El precio exacto se explica en una línea: *«Escribe un precio y ves solo ese. El "hasta" se llena solo.»*; con «hasta» menor que «desde» dice *«El precio de "hasta" es menor que el de "desde". Cámbialos y vuelve a intentar.»*
- Los valores de cada filtro se **derivan de lo que hay** (`filtros-derivados.ts`): un filtro sin datos no se dibuja — *«Un filtro que no se ve no existe»*.
- Vacíos, literales: «No pudimos cargar el catálogo» · «Por ahora no hay productos disponibles» · «No encontramos productos con estos filtros».
- **Barra de carrito pegada abajo** (`CatalogoStickyCartBar`): «Tu pedido», total, botones **«Vaciar»** y **«Confirmar pedido»**. Con carrito y sin nombre dice **«Falta tu nombre»**.
- **Modo «agregar a un pedido existente»**: si la URL trae `?agregarA=<orderId>` (`PARAM_AGREGAR_A`) aparece la barra negra `BarraModoPedido` — «Agregando al pedido / \<número\> · \<cliente\> / N bultos en el pedido» y el botón **«Listo, volver al pedido»**. Si ese pedido ya está en Switch, la barra se pone ámbar: **«Este pedido ya está en Switch — no se le pueden agregar productos»**. Solo `ROLES_QUE_AGREGAN = admin, secretaria, vendedor`.
- Botón **«Pedidos»** en el encabezado y menú de **compartir** (copiar link público / descargar el catálogo en PDF).
- Las primeras **10 fotos** cargan con prioridad (`FOTOS_PRIORITARIAS`).

### 3. El catálogo PÚBLICO (`/catalogo-publico/[marca]`)
`CatalogoPublicoPage`. **Sin login.** Es el link que se manda por WhatsApp
(`https://www.fashiongr.com/catalogo-publico/<marca>`).
- Mismos filtros y misma grid; **no** tiene la barra de modo pedido ni el botón «Pedidos».
- La `metadata` (título, descripción e **imagen** de la vista previa) sale de
  `src/lib/catalogo/metadata-publica.ts`: sin eso heredaba el «Fashion Group · Sistema
  interno» del layout raíz y la previsualización en el teléfono del cliente decía texto
  interno.
- Al confirmar: el cliente escribe su nombre (`placeholder="Ej: María Pérez"`,
  `validarNombreCliente`: **al menos 3 letras**, máximo 120) → `POST /pedido-publico` →
  `POST /pedido-publico/<short_id>/confirmar` — **dos llamadas, un solo toque**.

### 4. El pedido público (`/pedido-<marca>/[short_id]`)
`PedidoPublicoClient`, una página por marca (`/pedido-reebok/[id]`, `/pedido-joybees/[id]`,
`/pedido-tommy/[id]`, `/pedido-calvin/[id]`). **Sin login** — es el link que el cliente
reenvía. Muestra «Tu pedido», las líneas con foto, el **Total**, el estado
(**«Confirmado»** / **«En proceso»**, nunca la jerga interna), **«Descargar PDF»** y
**«¿A quién le avisas?»** con los dos contactos de WhatsApp (`WHATSAPP_CONTACTOS`:
Daniel 6674-5522 y Rey 6615-6106). Link roto: «No pudimos abrir tu pedido · Este enlace
puede haber expirado o ser incorrecto.»
⚠️ Estas cuatro páginas **no son módulos**: no tienen ficha ni entrada en `role_permissions`.

### 5. Confirmar pedido — el checkout (`/catalogo/[marca]/checkout`)
`CheckoutClient`. Título **«Confirmar pedido»** + el label de la marca.
Cuatro bloques, en este orden:
1. **Los productos** — foto, nombre, `SKU · bulto de N`, el **precio tocable** (botón con lápiz, `title="Tocar para cambiar el precio"`), `− / N bultos / +`, **«Quitar»**, el subtotal y `N pzas` (+ «preventa» en ámbar si aplica).
2. **Cliente** — 🔴 **arranca VACÍO**, con borde ámbar y el texto **«Elige el cliente»** (`SIN_CLIENTE_ELEGIDO`). Botón **«Elegir»** / **«Cambiar»** / **«Cerrar»** que abre el `ClienteSwitchPicker`. El mostrador se rotula siempre igual: **«Contado (venta de mostrador)»** (`LABEL_CONTADO`), con su código real `TCKCTA`, y **hay que tocarlo**.
3. **Vendedor** — viene puesto el mapeado a tu login (`GET /api/catalogo/mi-vendedor?empresa=`), con la coletilla **«· tu vendedor»**, y se puede cambiar. Sin mapeo: **«Sin vendedor — elígelo abajo»** + el aviso ámbar *«No tienes vendedor de Switch asignado — elige uno para este pedido, o pídele al admin asignarlo en Sistema → Usuarios.»*
4. **Total del pedido** + `N producto(s) · N piezas` + las **dos salidas directas** (`EnviarDocumentoSwitch`): **Pedido** y **Cotización — no aparta mercancía**.

**Campos obligatorios para poder enviar** (`faltaParaEnviar`, `src/lib/catalogo/cliente-elegido.ts`):
agregar productos · **elegir el cliente** · elegir el vendedor · quitar los productos en
preventa. El botón se apaga y dice qué falta: *«Falta: elegir el cliente y elegir el
vendedor»* (`textoFaltaEnviar`).

**La tarea más frecuente, en pasos:** catálogo → agregar N productos → «Confirmar pedido»
→ **«Elegir»** cliente → tocar **«Pedido»** (o «Cotización») → pantalla de confirmación
con el número de Switch. **Cinco toques** más los del carrito. El carrito vive en
`localStorage` y **NO se borra si el envío falla** («el carrito sigue guardado»).

### 6. Confirmación (`/catalogo/[marca]/confirmacion/[id]`)
`ConfirmacionClient`. Dice **«Pedido creado en Switch»** o **«Cotización creada en Switch»**
según lo que salió (`tituloCreadoEnSwitch`). Si falló: *«El envío a Switch falló — el
pedido está guardado en el sistema y no se pierde.»* con **Reintentar**
(`POST /orders/[id]/enviar-switch`). Si Switch no respondió, el aviso dice **AMBIGUO** y
manda a revisar el panel antes de reintentar.

### 7. Comprobantes (`/catalogo/[marca]/pedidos`)
`PedidosListClient` + `ComprobantesPanel`. Se llama **«Comprobantes»** (`PANEL_COMPROBANTES`)
desde el 25-ago-2026; la `key` de permiso sigue siendo `pedidos` y `?tab=pedidos` del panel
de admin **redirige aquí** — «se cambia a dónde lleva, nunca la llave con la que alguien lo
tiene anotado».
- **Buscador**: `placeholder="Buscar por cliente o número…"` — busca en cliente, número de la casa y número de Switch (`textoBuscablePedido`).
- **Filtro por origen**: `Todos (N)` · `Del link (N)` · `Míos (N)`.
- 🔴 **Filtro por tipo, TRES chips y SIN «Todos»**: **Pedidos · Cotizaciones · Borradores**. Abre en «Pedidos». Los tres **particionan** (sin «Todos», una fila que no cayera en ningún chip sería invisible: «Pedidos» es el balde de resto). ⚠️ «Borradores» es `status = 'borrador'`, **no** «no salió a Switch».
- **Agrupado por MES**, colapsable; el mes en curso abre solo.
- 🔴 **La lista arranca en los ÚLTIMOS 90 DÍAS**, y el resto queda detrás de un botón **«Ver más (N)»** al pie — sin texto explicativo al lado (Daniel: *«no me gustan tantas palabras extras»*). El corte va DESPUÉS del filtro y de la búsqueda, así que «Ver más» siempre trae lo que falta **de lo que se está mirando ahora**, y una vez tocado muestra todo. El corte es por FECHA y no por cantidad: «¿esto es de este trimestre?» es una pregunta que se contesta sin contar. Definición única en `src/lib/catalogo/comprobantes-ventana.ts` (módulo puro, recibe el «ahora» por parámetro). Candado: `comprobantes-ventana-90-dias.test.ts`.
- 🔴 **Los pedidos viejos NO se borran.** Daniel preguntó si convenía (*«si un pedido se mandó a switch, ya está safe, no?»*) y la respuesta es **no**: el pedido guarda lo que Switch no tiene —quién lo armó, el comentario, si salió como pedido o cotización, y el PDF que se le mandó al cliente— y son **pocos** (23 Reebok · 38 Tommy · 21 Calvin · 41 Joybees en todo 2026). Lo que pesaba era la LISTA, y eso es lo que se recorta. Ver `docs/postmortems/catalogos-pedidos.md`.
- Cada fila: chip de origen (**«Del link»** con ✓ si el cliente lo confirmó, o **«Mío»**), cliente, **los DOS números** (`PED-018` · `Pedido en Switch: 16-000000506`, o `Se numera al abrirlo` / `Sin número` / `No se ha mandado a Switch`), fecha y total.
- Acciones: **«Editar»** (o **«Ver»** para bodega) · **«Duplicar y corregir»** · **«Eliminar pedido»** · selección múltiple con borrado masivo · **«Exportar Excel»** (solo `CATALOGO_ADMIN_ROLES` — al vendedor el endpoint le contesta 403, «ofrecérselo sería ofrecer un botón que no funciona»).
- Confirmación de borrado, literal: *«¿Eliminar el pedido de \<cliente\> por $N? Desaparecerá de la lista. **No se envía nada a Switch.**»*

### 8. El detalle del pedido (`/catalogo/[marca]/pedido/[id]`)
`PedidoDetalleClient` — la pantalla más grande del módulo (1.469 líneas). Desde aquí se
manda a Switch.
- Bloques **«Cliente del pedido»** (*«El pedido se creará en Switch a nombre de este cliente.»*) y **«Vendedor del pedido»** (*«La venta —y su comisión— se le acredita a esta persona.»*), cada uno con **«Elegir» / «Cambiar»** y guardado inmediato («Guardando…» → «Guardado»).
- Tabla de líneas: **Producto · Bultos · Piezas · Precio · Precio Switch · Subtotal**.
- **«Agregar productos»** (lleva al catálogo con `?agregarA=`), **«Compartir pedido»**, PDF, **«Avisar por correo a Fashion Group»**.
- Antes de mandar corre una **pre-validación** contra Switch: «Revisando el pedido contra Switch…» → si algo no cruza, **«Revisa esto antes de enviar»** / **«No se puede enviar a Switch»** con la lista de errores y avisos, y **«Lo que sí cruzó con Switch»**.
- Un pedido ya enviado queda **bloqueado**: *«Este pedido ya está en Switch — no se puede editar aquí.»* La salida es **«Duplicar y corregir»**.
- **«Ocultar de la lista (el pedido sigue en Switch)»** para los ya enviados.

### 9. Administrar la marca (`/catalogos/admin/[marca]`)
`AdminCatalogoClient`. Encabezado con el logo, el título de la marca, «última
sincronización» (`GET /sync-status`) y el botón **«Actualizar ahora»** (`SyncNowButton`,
cooldown **10 min**, roles admin/secretaria/vendedor).
- **Cinco métricas** por marca (Reebok: Productos · Sin foto · Footwear · Apparel · Accessories; Joybees: Productos · Sin foto · Clogs · Sandalias · Flips; etc.).
- Botón **«Excel sin foto»**.
- **Dos pestañas visibles**: **«Faltan foto»** (con badge del conteo) y **«Catálogo completo»**.
- Dos estilos de pantalla según la marca (`theme.admin.productosStyle`): **tarjetas** (`ProductosTarjetas`) o **lista/batch** (`ProductosBatch`).
- Acciones sobre un producto: **«Subir foto»** / **«Cambiar foto»** · **«Más fotos»** (el `VariantePicker`, que muestra las vistas del banco B2B y marca **«Foto actual»** con ✓) · **«Etiqueta»** (`Sin etiqueta` · **Nuevo** · **Oferta** · **Próximamente**) · **«Ocultar del catálogo» / «Mostrar en catálogo»** · **«Editar nombre (el sync deja de cambiarlo)»** (solo Tommy y Calvin) · **«Piezas por bulto»** (solo Tommy y Calvin).
- **«Subir fotos masivo»**: arrastrar muchas; *«El nombre del archivo debe ser el código (SKU). Ej. GH8228.jpg»*, y acepta `GH8228 (1)`, `GH8228-1`, `GH8228_1`, `GH8228 1`, `GH 8228`. Dice **«No se subirán (no coincide ningún producto):»**.
- **«Subir ZIP del B2B»** (`ZipB2BUpload`): el ZIP de PVH (27–78 MB, ~2.500 fotos) se **descomprime y recorta EN EL NAVEGADOR** y cada foto sube directo a Storage con token firmado. Avisa *«No cierres esta pestaña hasta que termine.»*

### 10. 🔴 Una pantalla SIN entrada visible: «Importar» (`/catalogos/admin/joybees?tab=importar`)
`ImportarTab` (`ProductosBatch.tsx`). El array `tabs` de `AdminCatalogoClient` tiene **solo
dos entradas** (`faltan-foto` y `completo`), pero el render tiene un tercer bloque
`{tab === "importar" && theme.admin.importarTab && …}`. `importarTab` vale **`true` solo en
Joybees** (`marcas-ui.tsx:1127`; `false` en las otras tres, con candado que lo congela en
`tommy-config.test.ts:178` y `calvin-config.test.ts:190`).
O sea: **existe una pantalla de importación masiva de Joybees a la que solo se llega
escribiendo `?tab=importar` en la barra de direcciones.** Ofrece descargar la plantilla
(`SKU,Nombre,Precio,Cantidad,Genero,Estado`), pegar un archivo y **«Confirmar importacion»**;
por debajo llama a `POST /api/catalogo/joybees/import`, que hace un upsert por `sku` y
**pone `stock:0, active:false` a todos los SKU que no vengan en el archivo** — el write path
más agresivo de la marca.

### 11. Redirecciones que hay que conocer
| Dirección vieja | A dónde va |
|---|---|
| `/catalogo/[marca]/productos?…` | `/catalogo/[marca]?…` (conserva los filtros) |
| `/catalogo/[marca]/pedido` (sin id) | `/catalogo/[marca]/pedidos` |
| `/catalogos/admin/[marca]?tab=pedidos` | `/catalogo/[marca]/pedidos` |
| marca que no existe en `MARCA_THEME` | `notFound()` → 404 |
## Los datos

**Medido contra producción el 4-sep-2026.** 21 objetos de base de datos.

### Los productos — una tabla por marca

| Tabla | Filas | Sin foto | Activos | Ocultos a mano |
|---|---:|---:|---:|---:|
| `products` (Reebok) | **391** | 1 | 232 | 1 |
| `tommy_products` | **552** | 8 | 460 | 16 |
| `calvin_products` | **94** | 6 | 84 | 6 |
| `joybees_products` | **83** | 2 | 81 | — |
| `inventory` (Reebok) | **391** | — | — | — |

⚠️ `CLAUDE.md` dice Tommy 546 y Calvin 81: **los catálogos crecieron** (552 y 94 medidos hoy).

**Columna por columna, lo que importa:**

| Columna | Quién la escribe | Quién la lee | Estado medido |
|---|---|---|---|
| `sku`, `name`, `price`, `existencia`, `disponibilidad`, `stock` | 🤖 **el cron** (`<marca>-catalogo`, de Switch) | catálogo, checkout, PDF, correo, envío | 100% llenas en las 4 |
| `category` | 🤖 el cron | 💰 **decide el tamaño del BULTO** | Reebok: `footwear` 288 · `apparel` 66 · `accessories` 37 (los 3 valores estables). Tommy: `sneakers` 267 · `flip_flops` 189 · `sandals` 50 · `shoes` 32 · `slippers` 9 · `boots` 5. Calvin: `flip_flops` 57 · `sandals` 20 · `sneakers` 17. Joybees: `clogs` 81 + ⚠️ **`nuevo` 2** (valor accidental) |
| `gender` | 🤖 el cron | filtros del catálogo | Reebok `male` 231 · `female` 137 · `unisex` 19 · `kids` 4. Tommy `women` 285 · `men` 172 · `boys` 57 · `girls` 38. Calvin `women` 61 · `men` 30 · `boys` 2 · `girls` 1. Joybees `kids` 29 · `women` 26 · `unisex` 11 · `adults_m` 10 · `adults` 7 |
| `active` | 🤖 el cron, con `esVisibleEnCatalogo` | todo | Reebok 232/391 · Tommy 460/552 · Calvin 84/94 · Joybees 81/83 |
| `image_url` | 🧑 **la persona** (subir foto, ZIP, VariantePicker) | catálogo, PDF, correo | 🔴 el sync **NUNCA la toca** |
| `foto_manual` | 🧑 la persona (`VariantePicker`) | el manifiesto del ZIP, para no pisar | Tommy `true` 30 · **Reebok `false` en las 391** |
| `oculto_manual` | 🧑 la persona | `esVisibleEnCatalogo` | Tommy 16 · Calvin 6 · Reebok 1 |
| `nombre_manual` | 🧑 la persona (solo Tommy y Calvin) | el sync, para no pisar el nombre | 🔴 **`false` en las 552 de Tommy y en las 94 de Calvin — nadie renombró nada nunca** |
| `bulto_pzas` | 🧑 la persona (solo Tommy y Calvin) | 💰 el total del pedido | 🔴 Tommy: **51 de 552** llenas, todas con el valor **8**. Calvin: **0 de 94**. Joybees y Reebok **no tienen la columna** |
| `badge` | 🧑 la persona | la etiqueta de la tarjeta | 🔴 **VACÍA EN LAS CUATRO MARCAS: 0 de 1.120 productos.** Nadie ha puesto nunca una etiqueta |
| `keep_visible` | 🧑 la persona | `esVisibleEnCatalogo` | 🔴 **NULL en Tommy, Calvin y Joybees; `false` en las 391 de Reebok — nunca se encendió** |
| `codigo_barra_id` | 🤖 el cron (solo Reebok) | el envío a Switch | ⚠️ **46 de 391 vacías**: esos productos no cruzan |
| `sub_category` | 🤖 el cron (solo Reebok) | el PDF y el orden | ⚠️ **287 de 391 vacías** |
| `description`, `color` (Reebok) | — | — | 🔴 **100% vacías** |
| `on_sale` (Reebok) | 🤖 el cron | la tarjeta | 82 en `true` |
| `popular`, `is_regalia` (Joybees) | — | la tarjeta | `popular` 1 · `is_regalia` 6 |

`inventory` (Reebok): `id`, `product_id`, `size`, `quantity`, todas llenas. 🔴 **`size` tiene un
solo valor, `UNICA`, en las 391 filas** — la tabla de tallas no lleva tallas (el sync descarta
`talla` y `color` de Switch).

**Ninguna tabla de productos tiene soft delete.** Reebok «borra» con `active = false`; las
otras tres no tienen DELETE en absoluto.

### Los pedidos internos

| Tabla | Filas | Vivas | Borradas | `confirmado` | `borrador` |
|---|---:|---:|---:|---:|---:|
| `reebok_orders` | 23 | 15 | 8 | 19 | 4 |
| `tommy_orders` | 38 | 32 | 6 | 32 | 6 |
| `calvin_orders` | 21 | **5** | **16** | 4 | 17 |
| `joybees_orders` | 41 | **4** | **37** | 4 | 37 |

**Soft delete: `deleted boolean` + `deleted_at`**, la convención normal del sistema.

| Columna | Para qué | Estado medido |
|---|---|---|
| `order_number` | El número de la casa (`PED-018`, `TOM-027`, `CKP-020`, `JBP-041`). Lo asigna la RPC con advisory lock | 100% |
| `client_name` | El nombre que sale en el papel | ⚠️ Reebok tiene **la misma tienda con dos grafías**: `CITY MALL PASO CANOA` (2) y `City Mall Paso Canoa` (2) |
| `cliente_switch_id` | 💰 A nombre de quién sale en Switch | Reebok 15/23 · Tommy 31/38 · Joybees 14/41 · 🔴 **Calvin 4 de 21** |
| `vendedor_switch_id` | 💰 A quién se le acredita la comisión | Reebok 15 · Tommy 28 · Calvin 17 · 🔴 **Joybees 3 de 41** |
| `vendor_name` | Solo para mostrar | ⚠️ Sin formato: mezcla login (`daniel`, `andrea`) con nombre de Switch (`REINALDO ESPINOSA`, `DANIEL LEVY ` con espacio) y `DEFAULT` |
| `origen_original` / `origen_short_id` | Si vino del link | 🔴 **Solo Reebok**: `link` 3, `mio` 20. Tommy: los 38 `mio`. |
| `idempotency_key` | Evita el pedido doble por doble toque | Reebok 17/23 · Tommy 27/38 · 🔴 **Joybees 3 de 41** |
| `reemplaza_a` | El original que este clon corrige | Reebok 1 · Calvin 8 · 🔴 **Tommy y Joybees 0** |
| `client_email` | El correo del cliente | 🔴 **VACÍA EN LAS CUATRO** |
| `comment` | Nota del pedido | 🔴 **VACÍA EN LAS CUATRO** |
| `total` | Se recalcula en cada lectura, pero se guarda | — |

**Los renglones** (`<marca>_order_items`): `reebok` 316 · `tommy` 532 · `calvin` 52 ·
`joybees` 77. Columnas `order_id, product_id, sku, name, image_url, quantity, unit_price`
(+ `is_preorder` solo en Reebok). 🔴 **`is_preorder` es `false` en las 316 filas de Reebok: la
preventa nunca se usó.** `image_url` falta en 4 de las 532 de Tommy y en **19 de las 52 de Calvin**.

⚠️ **`quantity` está en BULTOS, no en piezas.** Tommy tiene 35 renglones con `quantity = 12`:
eso son 12 **bultos**, no 12 piezas.

⚠️ **Datos de prueba en producción — SE VAN por migración (4-sep-2026).** Calvin tiene **16 de 21**
pedidos borrados y Joybees **37 de 41**, todos `borrador` y con nombres «PRUEBA … — BORRAR» /
«PRUEBA-BOT» o vendedor `medicion`. Están marcados `deleted`, así que no se ven — pero están, y
Daniel los pidió fuera: *«borro de verdad de la base»*. Los borra
`supabase/migrations/20260924120000_borrar_pedidos_de_prueba.sql` (**pendiente de aplicar**), con
lista explícita de ids y un filtro que salva a cualquiera que tenga un envío vivo a Switch (hoy:
ninguno). Ver `docs/postmortems/catalogos-pedidos.md`.

### Los pedidos del link

| Tabla | Filas | Vivas | Convertidas | Confirmadas por el cliente |
|---|---:|---:|---:|---:|
| `reebok_pedidos_publicos` | 18 | 6 | 3 | **1** |
| `joybees_pedidos_publicos` | 4 | 2 | 3 | **0** |
| `calvin_pedidos_publicos` | 1 | 1 | 1 | 1 |
| `tommy_pedidos_publicos` | **0** | — | — | — |

Columnas: `short_id` (8 chars base36 con `randomInt` — **aleatoriedad criptográfica**, para que
el token del link no sea adivinable) · `items` (jsonb) · `total` · `cliente_nombre` ·
`convertida` + `convertida_at` + `ped_order_number` · `confirmado_cliente_at` +
`confirmado_ip_hash` (sha256 truncado a 32 hex, **nunca la IP en claro**) · `stock_confirmacion`
(la foto del stock al confirmar) · `ip_hash` (el del rate limit) · `deleted` + `deleted_at`.

🔴 **`calvin_pedidos_publicos` es la única de las cuatro que NO tiene la columna
`stock_confirmacion`.** 🔴 **`cliente_nombre` está vacío en 9 de las 18 de Reebok.**

### Los envíos a Switch

| Tabla | Filas | Estado | `documento` | `error_detalle` |
|---|---:|---|---|---|
| `reebok_switch_envios` | 16 | **verificado 16** | pedido 16 | vacío |
| `tommy_switch_envios` | 29 | **verificado 29** | pedido 26 · **cotizacion 3** | vacío |
| `calvin_switch_envios` | 3 | **verificado 3** | pedido 3 | vacío |
| `joybees_switch_envios` | 4 | **verificado 4** | pedido 4 | vacío |

🔴 **Las 52 filas están en `verificado` y `error_detalle` está vacío al 100%. Cero errores de
envío en producción, nunca.** `pedido_switch_id` y `numero_interno` llenos al 100%; los números
llevan prefijo `16-` (`16-000002299`).

Las cuatro tienen **exactamente las mismas 10 columnas** y el índice que importa:

```
<marca>_switch_envios_order_activo   UNIQUE (order_id) WHERE estado <> 'error'
```

🔴 **Ese índice parcial ES el at-most-once.** Está en las cuatro. Asimetría medida: Reebok tiene
además un índice `btree(estado)` que las otras tres no tienen.

**Sin soft delete**: una fila de envío no se borra nunca.

### Las vistas unificadas

`reebok_pedidos_unificado_vw` (20 filas) · `tommy_` (32) · `calvin_` (5) · `joybees_` (5).
Las cuatro son **byte a byte la misma definición** cambiando los tres nombres de tabla:
9 columnas (`origen, id_natural, cliente, total, created_at, vendor, items (json), fuente,
confirmado_cliente_at`), un `UNION ALL` de `<marca>_orders WHERE deleted = false` con
`<marca>_pedidos_publicos WHERE convertida = false AND deleted = false`.
⚠️ **Las alimenta solo `pedidos-unificado` y `pedidos-export`** — la pantalla viva lee `/orders`.

### Las tablas de apoyo

| Tabla | Filas | Nota |
|---|---:|---|
| `fg_user_switch_vendedor` | 28 | La administra **Usuarios**, la lee Catálogos |
| `fg_catalogo_publico_switch` | 🔴 **0** | El override de quién firma el pedido del link. **Ninguna pantalla la escribe** y está vacía |
| `reebok_cart` | 🔴 **0** | No aparece en `CLAUDE.md` ni tiene lectores en el código vivo |

### ⚠️ Corrección a `CLAUDE.md`: Reebok NO vive en otro proyecto Supabase

`CLAUDE.md` dice dos veces que `products` e `inventory` de Reebok «viven en **otro proyecto
Supabase** (`reebokServer`)». Medido el 4-sep-2026:
- En `.env.local`, `NEXT_PUBLIC_REEBOK_SUPABASE_URL` apunta a **`rspocgqhtpveytgbtler`, el proyecto principal**.
- `REEBOK_SERVICE_ROLE_KEY` **no existe** en `.env.local`, y `src/lib/reebok-supabase-server.ts` cae a `SUPABASE_SERVICE_ROLE_KEY`.
- Las 391 filas de `products` que cita `CLAUDE.md` están **en el proyecto principal**.
- Existe un segundo proyecto en la cuenta (`halqekrjfttpwoqtazjm`, «Apps Familia») con una copia **congelada y vieja** de `products`: 83 filas, todo `footwear`, todo `active`.

⚠️ **No medible:** las variables de entorno **de Vercel** (no se ejecutó `vercel env ls`). Si en
producción `NEXT_PUBLIC_REEBOK_SUPABASE_URL` apuntara a otro lado, esto cambiaría. Lo que dice
el repo hoy es que **es un solo proyecto**.

## De dónde vienen los datos

> Fuente cruzada con [`docs/switch-flujo.md`](../switch-flujo.md) y
> [`docs/switch-referencia.md`](../switch-referencia.md), **verificado contra el código**. Las
> discrepancias van en «Lo que sobra o no cuadra».

### 1. El catálogo — API de Switch con token

**Vía: API JSON con token** (`src/lib/switch-api/client.ts`; `SWITCH_<EMPRESA>_API_URL/_USER/_PASSWORD`;
header `Authorization: <token>` **sin `Bearer`**). Motor común `syncCatalogo`
(`src/lib/switch-api/sync-catalogo.ts`) + una envoltura por marca.

**Dos llamadas por pasada, no tres:**

| Endpoint | Qué trae | Cómo se llama |
|---|---|---|
| `GET /apiarticulos/lista?porPagina=50&paginaActual=N` | El catálogo entero de la empresa | Barrido paginado. **Solo se mandan esos dos parámetros.** El corte legítimo es la página corta; llegar a `MAX_PAGES = 250` (12.500 artículos, 1,5× la empresa más grande) es **ERROR, nunca éxito a medias** |
| `GET /apiarticulos/stock?articuloId=` | El saldo real | **Una por artículo** del set `{activos en la tabla} ∪ {disponible ≥ 1}`, de a **8 en paralelo** (`STOCK_CONCURRENCIA`). **Read-all-then-write**: si una sola falla, se aborta la empresa **sin escribir nada** |

| Cron (UTC) | Marca | Empresa | Filtro | `sync_type` |
|---|---|---|---|---|
| **14:30 · 17:00 · 19:40 · 21:55** | Tommy | `fashion_shoes` | `marcaId === 3` | `catalogo_tommy` |
| **14:35 · 17:05 · 19:45 · 22:00** | Calvin | `vistana` | `marcaId === 8` (CK FOOTWEAR) | `catalogo_calvin` |
| **14:40 · 17:10 · 19:50 · 22:05** | Reebok | `active_shoes` | proveedor `LATIN FITNESS GROUP`, excluye `KL*` | `catalogo_reebok` |
| **14:45 · 17:15 · 19:55 · 22:10** | Joybees | `joystep` | proveedor `JCBBRANDS` | `catalogo_joybees` |

Las cuatro bandas caen **dentro de la ventana de uso de Panamá** (9:40 a. m. – 5:10 p. m.).
El escalonamiento de 5 min entre las cuatro **no es por la sesión de Switch** (tocan empresas
distintas) sino para no apilar cuatro barridos sobre una base en compute Micro. Tommy va
**primero** porque es el más largo; Joybees **último** porque es el más corto.
⚠️ **El `marcaId` es POR EMPRESA**: en `vistana` el 3 es CK Legwear, no Tommy.

**También lo dispara «Actualizar ahora»** del panel de admin (`modulo: "catalogo-<marca>"`,
cooldown 10 min). Medido: 17 corridas manuales de Tommy y 8 de Reebok desde julio.

#### 🔴 Lo que Switch manda y el catálogo TIRA

`/apiarticulos/lista` devuelve `id · codigo · descripcion · codigoBarra · codigoBarraId ·
costo · disponible · precio · listaPrecioId · unidadmedidaId · unidadmedida · proveedorId ·
proveedor` + cuatro campos **no documentados**: `marcaId · talla · color · cantidadPorCaja`.

El catálogo **guarda**: `sku` (=`codigo`), `name` (=`descripcion`), `price` (=`precio`),
`existencia`/`disponibilidad`/`stock` (de `/stock`), `codigo_barra_id` (solo Reebok) y
`bulto_pzas` (solo Tommy/Calvin, de `cantidadPorCaja`).

**Se descarta, en las CUATRO marcas:**
- 🔑 **`costo`** — el CIF del artículo. El tipo lo declara (`client.ts:731`) y **ninguna marca lo lee ni lo guarda**. Es la razón de que el catálogo del vendedor no muestre margen.
- 🔑 **`id`** (el `articuloId` de Switch) — no se persiste en ninguna tabla de catálogo. Consecuencia directa: al enviar un pedido hay que **volver a resolver cada SKU** con `/apiarticulos/lista?filtro=SKU`.
- 🔑 **`codigoBarra`** (el EAN legible) — solo Reebok guarda el `codigoBarraId` numérico. El EAN se pierde en las cuatro.
- **`talla` y `color`** — se tiran enteros. Por eso `inventory` de Reebok escribe siempre `size: "UNICA"` en sus 391 filas.
- `listaPrecioId` (qué lista de precios se aplicó) · `unidadmedida` · `unidadmedidaId` · `proveedorId` · `proveedor` (solo se usa en el filtro) · `marcaId` (solo filtro) · el `disponible` de `/lista` (solo acota el set de `/stock`).

`/apiarticulos/stock` devuelve `articuloCodigo · sucursalId · sucursal · saldo · disponible ·
costo · costopromedio`. El código **suma `saldo` y `disponible` sobre todas las filas** y
descarta:
- 🔑 **`costo` y `costopromedio`** — el costo promedio del inventario, gratis, en una llamada que en Tommy ya se hace 455 veces por corrida.
- **El desglose por sucursal**: se colapsa a un total. Hoy cada empresa tiene una sucursal, así que no pierde nada — **el día que haya dos, el catálogo no lo notará**.

**Parámetros que `/apiarticulos/lista` acepta y NUNCA se mandan:** `rubroId` · `clienteId`
(precio específico por cliente) · `proveedorId` · `sucursalId` · `estatus` · `comprobante`.
El filtro por marca o proveedor se hace **en memoria, después de bajar el catálogo entero**.

### 2. El envío del pedido — la única escritura de negocio en Switch

`src/lib/catalogo/switch-envio.ts`. **Vía: API con token.** No hay cron: lo dispara una persona.

| Paso | Endpoint | Qué hace |
|---|---|---|
| 1 | — | **Candado at-most-once**: busca en `<marca>_switch_envios` un envío con `estado <> 'error'` |
| 2a | `GET /apiarticulos/lista?porPagina=50&paginaActual=1&filtro=<SKU>` | Resuelve cada SKU. **Sin `clienteId`** → valida contra el precio de la lista por defecto. De a 4 en paralelo (`SKU_CONCURRENCIA`) |
| 2b | `GET /apiarticulos/tallacolor?articuloId=` | Solo para **contar `codigoBarraId` distintos**; con más de uno, aviso informativo. Se descartan `talla`, `color`, `saldo`, `disponible`, `codigoBarra`, `sucursalId`, `sucursal` |
| 3 | `POST /apipermiso?proceso=0001` | Solo si alguna línea lleva precio ≠ lista (`|Δ| ≥ $0,01`). Caché de **15 min para el «sí»**, 60 s para el error, y el **«no» NUNCA se cachea**. **Fail-open** |
| 4 | `GET /apivendedor/lista` | La lista de vendedores, en vivo |
| 5 | — | El **cliente NO se le pregunta a Switch**: sale de la tabla local `switch_clientes` acotada por `empresa_key` |
| 6 | — | Se inserta la fila `pendiente` **ANTES** del POST |
| 7 | **`POST /apipedido/terminar`** o **`POST /apicotizacion/terminar`** | La escritura |
| 8 | `GET /apipedido/info` · `GET /apicotizacion/info` | La verificación |

**El cuerpo, idéntico en las dos rutas:**
```json
{ "vendedorId": 3, "clienteId": 1,
  "articulos": [ { "codigoBarraId": "123", "cantidad": "12.0000",
                   "precio": "30.00", "descuento": "0.00" } ] }
```
- `cantidad` = **PIEZAS**, `toFixed(4)` — los bultos ya se multiplicaron en `lineas-pedido.ts`.
- `precio` = el **del pedido**, no el de lista (verificado en vivo: pedido `16-000000492`, $30 sobre lista $35).
- **Nunca se manda `descuentoGlobal`** (el cliente lo soporta, cero llamadores) ni `vendedorId` por línea.
- **Nunca se mandan `comprobante` / `comprobanteId`**: el API permite **convertir una cotización en pedido sin reescribir las líneas**, y hoy «para vender se duplica». Es decisión nuestra, no límite del API.

**La respuesta del pedido** trae `mensaje · numeroInterno · pedidoId · clienteEmail ·
urlswitchpay`. Se guardan `numeroInterno` y `pedidoId`. **Se descartan:**
- 🔑 **`urlswitchpay`** — el link de pago SwitchPay de ese pedido.
- `clienteEmail` y `mensaje`.

**La respuesta de la cotización**: el nombre del id **no está medido** (no se manda una
cotización de prueba a producción). Se leen `cotizacionId`, `pedidoId` e `id` con tolerancia;
si ninguno sirve queda `null` y la cotización **igual queda creada y trazable por su
`numeroInterno`**, solo que sin verificar. `primerIdNumerico` exige entero > 0 justamente para
que `Number(null) === 0` no escriba un id inventado.

**Códigos de error de Switch observados:**
| Código | Mensaje | Cuándo |
|---|---|---|
| `0315` | VENDEDOR NO SE ENCUENTRA DISPONIBLE | falta `vendedorId` |
| `0316` | CLIENTE NO SE ENCUENTRA DISPONIBLE | falta `clienteId` |
| `0319` | INFORMACIÓN DE ARTICULOS INCORRECTA | `articulos[]` vacío o mal |
| `0005` | token vencido — puede traer `new_token` | se renueva sin re-login |
| `0006` | TOKEN INVALIDO — **te sacaron** | otro login del mismo usuario |

🔑 **La verificación post-escritura lee UNA sola cosa: `info.detalle.length`.** Si el número de
líneas cuadra → `verificado`. **No se compara ni una cantidad, ni un precio, ni un descuento**,
y se descartan enteros `clienteImpuesto` / `clienteImpuestoCodigo` de la cabecera y
`articuloImpuesto` por línea. **Un pedido que Switch creó con la cantidad cambiada pasa la
verificación.**

⚠️ `POST /apicotizacion/terminar` **no está en la documentación oficial de Switch** (el PDF solo
trae `/lista` §5.31, `/info` §5.32 y `/correo` §5.33). Se mapeó contra producción el 24-ago-2026
mandando un campo a la vez, **sin `articulos`**. Y `/apicotizacion/crear`, `/guardar` y `/nueva`
**no existen**: devuelven la página de excepción de Switch **con HTTP 200**. 🔴 **De ahí la regla
del módulo: un endpoint nuevo se valida por la FORMA de la respuesta, jamás por el status.**

### 3. Lo que sube la gente
- **Fotos sueltas** (`POST /upload`, multipart). Path **determinístico** `{prefijo}/{sku normalizado}` → cada re-subida sobrescribe el mismo objeto, sin huérfanos. `cacheControl: 31536000` (1 año) + cache-buster `?v=<timestamp>` fijado una vez.
- **El ZIP del banco B2B de PVH** (27–78 MB, ~2.500 fotos): se descomprime y se recorta **en el navegador**, y cada foto (~25 KB) sube **directo a Storage con token firmado** — Vercel corta el body en ~4,5 MB. Cada path se valida contra el prefijo de variantes de ESA marca (`{prefijo}/_v/{sku}/{n}.jpg`): un token firmado escribe **saltándose RLS**, así que nunca se firma la foto elegida ni nada fuera de `_v/`.
- **El CSV de inventario de Reebok** (`POST /reebok/inventory/bulk`, `{sku, quantity}` → `size: 'UNICA'`).
- **El Excel de importación de Joybees** (solo por `?tab=importar`).

### Qué pasa si la fuente falla
- **Switch caído o cambiado** → **fail-safe: el catálogo NO se modifica**. La corrida se anota `error` en `switch_sync_log`; con **2 corridas seguidas fallidas del mismo par** sale 🔧 SISTEMA (`alertSwitchCronErrors`), y la reconciliación (10/14/18 UTC) reintenta antes de avisar (`COLATERAL_CRONS`).
- **Un cron no corre** → el catálogo se congela con precios y existencias viejas. **No hay aviso propio**: se ve en la línea «última sincronización» del panel de admin.
- **La DDL de Tommy (`20260724150000`) o de Calvin (`20260812150000`) no corrió** → el cron **se omite limpio, sin tocar Switch y sin Telegram**, y responde **503**.
- **Storage caído** → las fotos no cargan y el ZIP falla; el catálogo sigue.

## Las reglas que ya están fijadas

Regla vigente en `CLAUDE.md § Catálogos, pedidos y cotización`; la historia en el postmortem.
Aquí, la regla con **el archivo del candado**.

### El cliente y el vendedor (💰)
- 🔴 **Ningún pedido sale a Switch sin un cliente elegido a propósito.** El checkout arranca vacío, el botón está apagado y dice qué falta, tocar la salida apagada no manda nada, y **ni forzando el botón** el handler manda. Y **el servidor responde 422** (`tieneClienteElegido`, `src/lib/catalogo/cliente-elegido.ts`): «Es la capa que NO se puede saltear. La pantalla apaga el botón, pero un botón apagado solo protege a quien mira la pantalla». Justo debajo hay **tres redes que INVENTAN un cliente**, «que es exactamente cómo **15 pedidos por $53.124** se fueron a Switch a nombre de Contado sin que nadie lo decidiera». Candados: `components/pedido-cliente-obligatorio.test.tsx` · `api/catalogo-paridad-enviar-switch.test.ts`.
- 🔴 **El pedido del LINK tampoco es excepción** (14-ago-2026): confirmarlo **NO llama a `enviarPedidoSwitch` nunca** y queda `confirmado` **sin `cliente_switch_id` ni `vendedor_switch_id`**. Candado: `api/catalogo-paridad-publico-switch.test.ts`.
- **Lo que sobrevive de las redes es el VENDEDOR**, en este orden: el guardado en el pedido → `cfg.fallback.vendedorId` (solo Reebok legacy, Reinaldo id 2) → el DEFAULT de la empresa.
- 🔴 **La venta de mostrador tiene su id de verdad.** Antes «Contado» iba con `id: null`, y `null` significa **las dos cosas a la vez**: «el usuario eligió el mostrador» y «nadie eligió nada». Hoy se devuelve el cliente real, código `TCKCTA` (medido: existe en las 4 empresas, id 1 en todas).
- 💰 **Un `vendedorSwitchId` que no está en la lista de ESA empresa se rechaza con 404**: los ids son **por empresa** y guardarlo le atribuiría la venta —**y la comisión**— a otra persona. Candado: `api/catalogo-vendedor-switch.test.ts`.
- ⚠️ **El nombre del vendedor se guarda LITERAL**: `joystep` manda `"DANIEL LEVY "` con espacio final y **Switch parea contra eso** — recortarlo rompería el pareo.
- 🔴 **Un solo selector de cliente en todo el sistema**: `ClientePicker` (directorio propio) y `ClienteSwitchPicker` (directorio de Switch). Barrido `un-solo-selector-de-cliente.test.ts` con detector **puro** (probado con fuentes sintéticas, porque un detector roto que solo corriera contra el repo de hoy daría verde), que borra los comentarios primero y tiene excepciones con motivo escrito.

### El at-most-once del envío (💰)
- 🔴 **Un pedido admite UN solo envío no fallido.** Tres capas: (1) chequeo previo en JS, (2) **el índice parcial único `(order_id) WHERE estado <> 'error'`** en las cuatro tablas, (3) el intento se registra **antes** del POST.
- 🔴 **El candado no distingue pedido de cotización: cotizar CONSUME el envío del pedido.** Para vender se **duplica**.
- 🔴 **Timeout o respuesta ambigua queda `'enviado'`** con `error_detalle` → **bloquea reintentos** hasta que una persona mire el panel. **Solo un rechazo claro del API marca `'error'`** y permite reintentar.
- `23505` (otro envío ganó la carrera) → **409**. Candado: `lib/switch-envio-paralelo.test.ts`.

### Pedido o cotización
- `normalizarDocumento` (`src/lib/catalogo/documento-switch.ts`): `VALIDOS = ["pedido","cotizacion"]`, y **cualquier otra cosa cae a PEDIDO** — «el modo de fallo aceptable es crear el documento de siempre, nunca una cotización que nadie pidió».
- 🔴 **El `documento` va DESPUÉS del candado del cliente** tanto en `enviar-switch` como en `checkout`: «la cotización pasa por el MISMO 422 que el pedido».
- 🔴 **El papel dice cuál de las dos fue**, derivado del **envío activo**, no del `status` (mandar a Switch escribe `status = confirmado`, así que el status solo no alcanza). El encabezado del PDF, el nombre del archivo y el adjunto del correo **nunca se separan**, y el NÚMERO no cambia entre los dos casos. Candados: `components/pedido-pdf-dice-la-verdad.test.tsx` · `api/pdf-pedido-o-cotizacion.test.ts`.
- 🩸 **«Cotización» lleva tilde y eso es un encabezado HTTP**: `Content-Disposition` con `filename` ASCII de respaldo + `filename*=UTF-8''…` (RFC 6266). Sin eso baja como `CotizaciÃ³n-TOM-027.pdf`.

### El precio y el bulto (💰)
- 🔴 **El bulto sale del ESTILO, no de la marca** (`bulto_pzas`, solo Tommy y Calvin). `normalizarBultoPzas` rechaza `0`, `""`, `[]`, `NaN`, negativos, decimales y fuera de rango → `null`: **un bulto de 0 dividiría el pedido por cero**. Candado: `lib/tommy-bulto-por-estilo.test.ts`.
- 🩸 **El caso TOM-003**: 1 bulto de un estilo de 8 son **$304**, no $456, y sale a Switch con `cantidad: 8`, no 12. `leerCategoriaYBulto` lee categoría y piezas **juntas**, el mapa `bultoPzasByProduct` es **obligatorio** en el motor de envío (que lo cace el compilador), y hay barrido que prohíbe volver a escribir `select("id, category")` en 6 archivos.
- 🔴 **La multiplicación `bultos × piezas` vive en UN solo lugar** (`resolverLineas` / `resumirPedido`, `src/lib/catalogo/lineas-pedido.ts`), con barrido que prohíbe cualquier otra multiplicación por bulto en `src/lib/catalogo`, `src/app/api/catalogo` y `src/components/catalogo`. **El total se redondea UNA vez, al final.**
- 🔴 **El total NUNCA sale de la columna guardada** en ninguna superficie viva (`/orders`, detalle, PDF, correo, checkout, export). La única excepción es `pedidos-unificado`, y por eso está retirado.
- 💰 **El total del checkout se calcula en el SERVIDOR y se guarda**: «si el tamaño del bulto está mal, el pedido queda mal escrito para siempre, no solo mal mostrado».
- 💰 **Re-preciado total del pedido público**: el `unit_price` (y en Reebok la `category`, que define el bulto 6/12) que manda el cliente **se ignoran** y se sustituyen por los de la tabla.
- 🩸 **Un precio entero se imprime sin decimales (`$35`) y uno con `.50` conserva los dos.** «Nunca redondea hacia arriba» — el bug real cobraba **50¢ de más por unidad en 68 de 797 productos**. Verificado contra el texto REAL extraído del PDF.
- 💰 **El catálogo no muestra costo ni margen, y no es por la lista de roles: es la forma de la consulta.** `cfg.products.cols` enumera las columnas y la única de plata es `price` (el de VENTA). No hay `costo`, `cif`, `fob` ni `margen` en ninguna de las 4 marcas.

### La clasificación (💰, porque la categoría define el bulto)
- 🔴 **La MARCA manda la categoría** (FOOTWEAR/APPAREL/HARDWARE) y **gana sobre el rubro**; el rubro es el plan B de una marca vacía. `SOCKS` → apparel (Daniel: *«es apparel, o sea ropa»*), `HEADWEAR` → accessories (**bulto 6, no 12**).
- 🔴 **`UNISEX` → Hombre**, y **solo ahí el nombre desempata** (palabra completa `WOMEN` o una `W` sola — la W de «LOW» no). Nunca contradice un MALE/FEMALE/KIDS explícito.
- 🩸 **Sin `ficha_at` no se clasifica NI se avisa**; con ficha, un valor desconocido **o vacío** sí avisa nombrando los tres campos. Es la distinción entre «todavía no llegó» y «llegó algo que no entiendo» — la falsa alarma de los 233 productos del 2-sep-2026.
- 🔴 **Un «no sé» nunca pisa una clasificación que ya existe** — si pisara, **288 zapatillas cobrarían la mitad de bulto**.
- 🧹 **Un cajón por defecto nunca puede ser un valor real**: barrido sobre los 4 `sync-catalogo-*.ts` (el `defaultCategory` no puede coincidir con sus `categoryOptions`) **y sobre las migraciones** (ninguna columna de clasificación puede tener un `DEFAULT` con valor de negocio). Es lo que arregló el `DEFAULT 'male'` de `products.gender`, que mintió en **173 de 173 altas** desde el 24-jun-2026.
- 🔴 **Ningún artículo cae bajo dos chips de género a la vez** (`FILTER_TO_GROUPS` disjuntas). Daniel: *«no quiero nunca que mismos productos salgan en dos lados»*.

### El sync
- 🔴 **Las escrituras que no cambian nada no se hacen** — comparación **por tipo declarado** (`TIPOS_CAMPO_CATALOGO`): los enteros aceptan `10` y `"10"`, pero `null ≠ 0` y `0 ≠ ""`; los montos comparan **al centavo**; los textos **exacto** (un espacio de más es cambio). **Columna no declarada o no leída → nunca «igual»: ante la duda, se escribe.**
- 🔴 **El UPDATE del sync NUNCA toca** `image_url`, `foto_manual`, `badge`, `oculto_manual`, `keep_visible`, `nombre_manual`, `sku` ni `id`. Daniel lo autorizó con una condición: *«solo si no me daña nada»*.
- 🩸 `PER_PAGE × MAX_PAGES ≥ 12.000`: con el tope viejo (80 páginas) el barrido de Calvin **se cortó en 4.000 EN SILENCIO y se anotó success con 4 productos**.
- **Regla única `esVisibleEnCatalogo`** (`src/lib/catalogos/visibilidad.ts`), compartida por el sync y el toggle del admin: visible con existencia ≥ 1; `keep_visible` o badge `proximamente` fuerzan visible con 0; **`oculto_manual = true` gana sobre todo** y sobrevive al sync.
- 💰 **El catálogo decide con DISPONIBILIDAD** (saldo − apartado), no con existencia (`disponibleVendible`): negativa se lee 0, nunca deuda. La **visibilidad** sigue decidiéndose por existencia, a propósito.
- 🔴 **El reloj «Sincronizado hace X» lee `switch_sync_log`, y el botón «Actualizar ahora» NO escribe `cron_heartbeats`.** Si lo hiciera, **una persona taparía un cron caído ante el watchdog**. 🩸 Medido el 14-ago-2026: heartbeat 14:32 contra una corrida manual terminada 15:39 — «el banner decía "hace una hora" seis minutos después de sincronizar».

### Las lecturas grandes
- 🩸 **`db-max-rows` = 1000 y corta EN SILENCIO.** `inventory` de Reebok (una fila por producto **y talla**) fue la primera en pasarse: «truncarla es el peor síntoma: el producto sí aparece en la tienda pero **sin ninguna talla**, o sea **Agotado** a la vista del cliente», y la versión truncada **quedaba cacheada**. Hoy todo va por `leerTodoPaginado` con verificación contra el COUNT exacto.
- 🩸 El `.limit(5000)` de `/reebok/stats` **no era el tope que decía ser**: el corte real lo ponía PostgREST en 1.000, sin avisar. «Un tope silencioso no es una defensa.»
- 🔴 Los números de Switch se piden **por los ids que la vista ya filtró** (`.in(...)`), nunca barriendo la tabla: 43 vivos contra 110 si se rompe el filtro.

### La caché del catálogo público
- Tag `catalogo:<marca>`, **una marca nunca invalida a otra**. TTL de respaldo 10 min. Una corrida real invalida, un `dryRun` **no**; si `revalidateTag` lanza, **no rompe la escritura que la llamó**.
- ⚠️ **No volver a poner `fetchCache = "force-no-store"` en `/public`**: Next lo trata como **bypass total** de `unstable_cache` → la caché queda escrita y **jamás leída**.
- Una edición **rechazada (400) no invalida** la caché.

### Los permisos
- 🔐 `CATALOGO_ROLES` y `CATALOGO_ADMIN_ROLES` están **congeladas** por `lib/catalogo-roles.test.ts`, que además congela el **inventario de módulos por rol de todo el sistema**: abrir un permiso en cualquier módulo pone el build rojo.
- 🔐 **Bodega recibe 200 con filas en `GET /orders` y 403 en las 10 rutas de escritura** en las 4 marcas. 🩸 Las mismas rutas dejan pasar a `admin` — «un 403 que le sale a todos es una ruta rota, no un permiso».
- 🔐 **`gerente_boston` recibe 200 en `GET /products` y 403 en las 12 rutas restantes**, y las dos fugas del #659 siguen tapadas (búsqueda global 403, su casa sigue siendo Boston aunque tenga dos módulos).
- ⚠️ **Trampa documentada**: el gate de la PÁGINA `/catalogos/admin/[marca]` es `hasModuleAccess` sobre `fg_modules`, **no `allowedRoles`** — vendedor y bodega ya cargaban la página. **El 403 del servidor es el gate de verdad.**
- ⚠️ **Hueco pre-existente, dejado pasar a propósito**: `GET /orders/[id]` (el detalle) **solo exige sesión, no rol**. Bodega y contabilidad pueden leer un pedido por URL directa aunque la lista les conteste 403. Está escrito como hallazgo en `api/pedidos-link-flujo-vendedor.test.ts`, no como candado.
- **Allow-list de edición manual**: `image_url` y `badge` (+ `name` solo en Tommy y Calvin, + `bulto_pzas` solo en Tommy y Calvin). **Cualquier otra columna se RECHAZA con 400, no se ignora en silencio** — el cron es dueño del resto.

### El pedido público
- **Rate limit por IP**: **5 pedidos en 10 min** al crear (429), **15 confirmaciones en 10 min** al confirmar. Se guarda un **hash sha256 truncado a 32 hex**, nunca la IP. ⚠️ **Fail-open total**: IP desconocida, columna sin migrar o store caído → el pedido pasa. «Es una capa anti-spam, NO seguridad.»
- Límites del cuerpo: `MAX_ITEMS = 200` · `MAX_QUANTITY = 500` · `MAX_UNIT_PRICE = 10.000` · nombre 3–120 letras · `product_id` debe ser UUID válido. Whitelist estricta de campos.
- **`short_id` de 8 chars base36 con `randomInt`** — aleatoriedad criptográfica, «para que el token del link público no sea adivinable».
- **Sin modal de stock** desde el 25-jul-2026: se guarda la **foto del stock** (`stock_confirmacion`) y, si hay líneas cortas, va un aviso a Telegram. **Fail-open**: si no se puede leer el stock se confirma sin aviso — «es cortesía».
- El link expone `estado_cliente` (`Confirmado` / `En proceso` / `null`) — «español simple, sin exponer el pipeline interno ni Switch» — y **nunca la columna `deleted`**.

### Divergencias entre marcas capturadas A PROPÓSITO
El refactor no debe «aprovechar» para cambiarlas (`catalogo-paridad-orders.test.ts`):
`GET /orders` sin sesión responde **403, no 401** · `createRoles` de Reebok incluye el rol
legacy **`cliente`** y las otras tres no · `GET /orders/[id]` de un pedido inexistente responde
**500, no 404** · Reebok edita productos con **PUT por `id`** y las otras con **POST por `sku`**
(el verbo que la marca no usa devuelve **405 con body vacío**) · solo Reebok tiene DELETE de
productos · solo Reebok es **público** en `GET /products`.
## Con qué conecta

### Qué LEE de otros módulos

| Qué | De dónde | Para qué |
|---|---|---|
| **Los clientes de Switch** | `switch_clientes` (empresa_key, cliente_switch_id, codigo, nombre, **activo**) — la llena el sync de clientes | El `ClienteSwitchPicker` del checkout y del detalle. 🔴 Desde el 4-sep-2026 el selector filtra `.eq("activo", true)`: un cliente que Switch dejó de mandar deja de ofrecerse. Los pedidos viejos que lo tengan siguen resolviendo su nombre por el camino de `orderId`, que **no** filtra |
| **El mostrador** | `switch_clientes` con `codigo = 'TCKCTA'` (`CODIGO_CLIENTE_CONTADO`) | «Contado (venta de mostrador)» con su id REAL. Medido: existe en las 4 empresas, id 1 en todas — `active_shoes` «Contado» · `joystep` «Contado» · `fashion_shoes` «VENTAS LOCA» · `vistana` «VENTAS» |
| **El vendedor de tu login** | `fg_user_switch_vendedor` (`user_id`, `empresa_key`, `vendedor_id`, `vendedor_nombre`) — la administra **Usuarios** (`/api/admin/vendedor-mapping`) | Precargar el vendedor del checkout. **28 filas para 7 usuarios**, medido 4-sep-2026: `fashion_shoes/REINALDO ESPINOSA` 7 · `joystep/DEFAULT` 6 · `active_shoes/DEFAULT` 5 · `vistana/DANIEL LEVY` 5 · `active_shoes/REINALDO ESPINOSA` 2 · `joystep/DANIEL LEVY ` (con espacio) 1 · `vistana/EDWIN` 1 · `vistana/Rodrigo` 1 |
| **El DEFAULT de la empresa** | `vendedores` (`empresa_key`, `nombre = 'DEFAULT'`, `switch_id`) | Última red del vendedor cuando el pedido no trae ninguno |
| **La manija del pedido público** | `fg_catalogo_publico_switch` (`empresa_key`, `cliente_switch_id`, `cliente_nombre`, `vendedor_id`, `vendedor_nombre`) | Override explícito de quién firma un pedido del link. 🔴 **Está VACÍA: 0 filas** (medido 4-sep-2026). Ninguna pantalla la escribe |
| **El directorio manual** | `directorio_clientes` (`nombre`, `empresa`, `correo`, `whatsapp`/`celular`/`telefono`) — módulo **Clientes** | El `clientes-search` que sugiere el nombre al escribirlo. **No es específico de marca**: la marca de la URL solo valida la ruta |
| **Los módulos del usuario** | `sessionStorage.fg_modules` + `role_permissions` | `CatalogoAuthGuard` y el hub |
| **El estado del sync** | `switch_sync_log` (`empresa_key`, `sync_type = catalogo_<marca>`, `status`, `finished_at`) | El «última sincronización» del panel de admin (`/sync-status`) |
| **El catálogo de Switch** | `switch_articulo_info` (`rubro`, `subrubro`, `marca`, `ficha_at`) — cron `sync-articulo-info`, **solo `active_shoes`** | La clasificación de Reebok (`src/lib/reebok-clasificacion.ts`) |

### Quién lee lo de Catálogos

| Quién | Qué lee | Para qué |
|---|---|---|
| **Switch Soft (el ERP)** | Nada de nuestras tablas: **recibe** el pedido o la cotización por API | Es el destino real de todo el módulo. Lo que sale de aquí termina siendo la FACTURA que después alimenta Ventas, Comisiones, CXC y Vista General |
| **📊 NEGOCIO (Telegram)** | `<marca>_orders`, `<marca>_pedidos_publicos`, `<marca>_switch_envios` | 4 avisos: pedido creado por un vendedor · pedido creado desde el link · **pedido/cotización enviado a Switch** (`avisoPedidoEnviado`) · **📷 productos nuevos sin foto** (`fotos-nuevos.ts`) · el **resumen semanal de fotos** de los lunes |
| **🔧 SISTEMA (Telegram)** | `<marca>_switch_envios` | «🚨 Envío a Switch FALLÓ» y «🚨 Envío a Switch AMBIGUO» (`switch-envio.ts:431,444`) · «valor sin clasificar» del catálogo de Reebok (`clasificacion-aviso.ts`) |
| **El cron `backup`** | Las tablas de pedidos y productos | La copia diaria |
| **`switch-reconciliacion`** (10/14/18 UTC) | `switch_sync_log` de los 4 `catalogo_*` | Re-ejecuta el cron caído y avisa ella, no el cron (`COLATERAL_CRONS`) |
| **`silencio-de-datos.ts`** | `switch_sync_log` | Vigila que un sync no traiga CERO donde siempre trae cientos |
| **El Depurador** | `src/lib/reebok-clasificacion.ts` (el mapa de categorías de Reebok) | 🔴 `REEBOK_CATEGORY_ESPERADAS` del Depurador es **ESPEJO** de ese mapa y hay candado que compara los dos: agregar un valor en uno sin el otro pone el build ROJO |
| **`data_integrity_checks` / Data Health** | — | ⚠️ **Ninguno de sus checks vivos mira Catálogos** (verificado) |

**Lo que NO conecta, y conviene saberlo:**
- 🔴 **Catálogos no está en la búsqueda global.** Sus 8 módulos son CXC, Reclamos, Guías, Directorio, Cheques, Ventas, Préstamos y Caja. Un número de pedido (`TOM-027`) **no se encuentra** desde el buscador `⌘K`; solo desde el buscador de la pantalla Comprobantes.
- 🔴 **Catálogos no tiene badge** (`useBadges` no lo nombra): un pedido del link que llega no enciende ningún contador en el menú. El único aviso es el de Telegram.
- **Boston no toca nada de esto**: `confecciones_boston` no es empresa de ninguna marca, y `gerente_boston` solo VE el catálogo.

### Qué se rompería si cambiara la forma de sus datos

| Cambio | Qué se rompe, con nombre |
|---|---|
| Renombrar una tabla `<marca>_orders` / `_order_items` / `_switch_envios` / `_pedidos_publicos` | **Todo el módulo de esa marca**: `MARCAS_CONFIG` las nombra por string, y además las RPC `<marca>_create_order`, `<marca>_order_replace_items` y `convert_<marca>_pedido_publico` las escriben desde SQL |
| Quitar el **índice parcial único `(order_id) WHERE estado <> 'error'`** de `<marca>_switch_envios` | Se cae el **at-most-once**: dos toques a «Enviar» crean **dos pedidos en Switch**. Es el único candado real; el chequeo previo en JS es solo la primera línea |
| Cambiar `bulto_pzas` o `category` en la tabla de productos | El **total del pedido queda mal escrito**, no solo mal mostrado: el checkout guarda el total calculado (bug **TOM-003**, $456 donde iban $304) |
| Borrar `foto_manual` de la tabla de productos | El ZIP del B2B volvería a pisar las **389 fotos de Tommy que Daniel subió a mano** |
| Borrar `oculto_manual` | `esVisibleEnCatalogo` deja de respetar el «Ocultar del catálogo» y el sync vuelve a encender productos apagados a propósito |
| Borrar `nombre_manual` | El sync de Tommy/Calvin vuelve a pisar los nombres editados |
| Cambiar `switch_clientes.activo` o `codigo` | El selector de cliente se vacía o pierde el mostrador → **el checkout no puede enviar** (422) |
| Vaciar `fg_user_switch_vendedor` | Todos los checkouts arrancan «Sin vendedor»; se puede elegir a mano, pero la comisión depende de ese nombre |
| Cambiar el `short_id` de `<marca>_pedidos_publicos` | Se rompen **todos los links de WhatsApp ya mandados** (`/pedido-<marca>/<short_id>`) |
| Cambiar `EMPRESAS_CATALOGO` | `GET /api/catalogo/mi-vendedor` empieza a rechazar empresas válidas (400) |

## Por qué está así

Cada línea es una decisión cerrada. Las citas son textuales; están verbatim en
[`docs/postmortems/catalogos-pedidos.md`](../postmortems/catalogos-pedidos.md).

| Cuándo | Decisión | Cita de Daniel |
|---|---|---|
| 14-ago-2026 | 🔴 **El cliente se elige, nunca viene puesto.** El checkout arrancaba con «Contado» y el botón encendido; **15 pedidos por $53.124** salieron a nombre del mostrador sin que nadie lo decidiera | ***«Que arranque vacío y el botón apagado hasta elegir cliente.»*** |
| 14-ago-2026 | 🔴 **El pedido del LINK ya no sale solo a Switch.** Antes se auto-enviaba al confirmar; un pedido ya en Switch queda bloqueado, así que nada de lo que Daniel pedía era posible | ***«cuando alguien interno le llega el pedido por WhatsApp, pueda entrar al sistema interno, escoger, editar precio, agregar o quitar y ponerle el nombre del cliente para así mandarlo a Switch»*** |
| 14-ago-2026 | Los pedidos del link **entran a la lista** aunque no estén convertidos (7 estaban invisibles) | ***«si yo mando el link al público quiero que el que lo use pueda hacer su pedido…»*** |
| 12-ago-2026 | El **vendedor** también se elige, y todos los roles que arman pedidos pueden elegir cliente de Switch (antes era admin+secretaria y todo lo del vendedor iba a Contado) | ***«un vendedor TIENE que elegir un cliente de switch, todos siempre no solo vendedor»*** |
| 24-ago-2026 | **Pedido y COTIZACIÓN, las dos** | ***«que estén los dos»*** |
| 25-ago-2026 | Las dos salidas se ofrecen **directo**, sin ventana intermedia ni párrafo | ***«quiero que en vez de que diga «enviar a switch», salga cotización o pedido como opción (sin párrafo explicando, btw no siempre hay q estar explicando todo, se vuelve tedioso)»*** |
| 25-ago-2026 | El **papel** dice cuál de las dos fue (el PDF decía «Pedido» siendo cotización) | ***«esto fue una cotización, porque dice pedidos en pdf?»*** |
| 25-ago-2026 | Se **borró** el párrafo explicativo de la cotización (`TEXTO_NO_RESERVA`), no se ocultó | ***«no siempre tiene que haber explicación, eso ensucia mi ERP»*** |
| 25-ago-2026 | El panel se llama **«Comprobantes»** y se llega en un toque desde el catálogo | ***«al terminar un pedido, un botón para ver los comprobantes… debería de llamarse comprobantes, ya que dentro podrás ver las cotizaciones enviadas y los pedidos enviados»*** |
| 25-ago-2026 | **Tres chips y sin «Todos»** | ***«haz un tap de borrador, para q esté organizado. No quiero opción de todos.»*** |
| 25-ago-2026 | **Bodega entra a mirar** los comprobantes | ***«Dale acceso a bodega a la lista de pedidos.»*** |
| — | Convertir un pedido del link: **vendedor sí, bodega no** | ***«los 3, bodega no»*** |
| 25-ago-2026 | El aviso de Telegram, **en dos líneas** | ***«lo quiero más simple… solo quiero lo útil»*** |
| 27-jul-2026 | **Secretaria administra** las 4 marcas | ***«a las secretarias, ponle que puedan ver catálogos como a daniel, con administrar también»*** |
| 27-ago-2026 | **David ve el catálogo**, solo ver | ***«catalogo para david si, solo eso»*** |
| 17-ago-2026 | **Un solo selector de cliente** en todo el sistema (el checkout tenía el suyo) | ***«si unificalo»*** |
| 30-jul-2026 | El aviso de fotos faltantes **solo cuando faltan** | ***«solo dime si me faltan fotos, no si no me faltan fotos»*** |
| — | El aviso de productos nuevos sin foto es un **delta de estado**, no el resultado de una corrida | ***«meti productos nuevos al sistema, y no me llega, almenos no instantaneo, q hay productos nuevos para subir fotos»*** |
| 28-jul-2026 | El **«Excel sin foto»** sale con la forma de la plantilla del banco B2B, ordenado A-Z en la columna B | ***«quiero que al descargar los codigos de fotos sin excel, se me ponga en orden de a-z en la columna b, para que asi se me descargue automatico»*** |
| 30-jul-2026 | Se borraron **2.199 fotos** de Tommy (58,41 MB), incluidas las 2.157 alternativas del banco, tras advertirle dos veces | ***«ya escogi la que utilizare, asi que ya no necesito tenerla como opcion»*** |
| 22-jul-2026 | «Ocultar del catálogo» **sobrevive al sync** (`oculto_manual`) | decisión de Daniel, 22-jul-2026 |
| 13-ago-2026 | Los 4 crons pasan de 2 a **4 corridas/día**, todas dentro de la ventana de uso | ***«se usa catalogo mas de 10am a 6pm aproximadamente»*** |
| 14-ago-2026 | La concurrencia de `/stock` sube de 4 a 8 | ***«sobre tommy solo mejoralo si no hay riesgo»*** · ***«solo si no me daña nada»*** |
| 12-ago-2026 | Se podó el subtítulo «Catálogo Panamá» de las 4 marcas | auditoría de textos |
| 25-ago-2026 | El asunto y la banda del correo **no** se tocaron para la cotización — decisión pendiente | «*Recibimos tu cotización*» suena raro (el cliente no la mandó) |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se quitó |
|---|---|---|
| **El auto-envío del pedido público a Switch** | vivió del 25-jul al 14-ago-2026 | Marcaba el pedido con el cliente de mostrador + vendedor DEFAULT y lo mandaba solo. Dejaba el pedido **bloqueado** para editar. Queda un solo rastro en producción: **PED-022 «Nathalie»**, a nombre del mostrador y hoy intocable |
| **El modal de «stock corto»** (409 `stock_corto` + `aceptar_stock`) | retirado el 25-jul-2026 | Se reemplazó por guardar la **foto del stock** (`stock_confirmacion`) y un aviso a Telegram. El cliente ya no ve una ventana que no entiende |
| **`TEXTO_NO_RESERVA`** — el párrafo «La cotización NO aparta la mercancía: si cotizas 500 pares…» | borrado el 25-ago-2026 | *«no siempre tiene que haber explicación, eso ensucia mi ERP»*. Se **borró la constante**, no se dejó muerta: «dejarla muerta es el párrafo esperando a que alguien la vuelva a montar». Hay candado que exige que el `export` no exista |
| **`ElegirDocumentoSwitch.tsx`** (la ventana intermedia para elegir pedido/cotización) | borrado el 25-ago-2026 | Las dos salidas se ofrecen directo en el checkout |
| **El quirk `listaFiltraDeleted`** | borrado el 25-ago-2026 | En Reebok valía `false` y la lista mostraba 27 filas donde la pantalla veía 19, 3 de ellas todavía en Switch. Se **borró el flag** en vez de ponerlo en `true`: «un booleano que vale lo mismo en 4 de 4 marcas no es una opción, es un interruptor muerto» |
| **La pestaña «Pedidos» del panel de admin** (`/catalogos/admin/[marca]?tab=pedidos`) | 25-ago-2026 | Se volvió UNA pantalla propia (`/catalogo/[marca]/pedidos`), igual para los tres roles. La `key` no se tocó y la dirección vieja **redirige** |
| **`/api/catalogo/[marca]/pedidos-unificado`** | retirado de las pantallas el 25-ago-2026 | **Calculaba mal el total**: no le pasa las piezas por bulto del estilo. Medido en 5 pedidos de Tommy, daba de más hasta **$680** (TOM-020: $11.088 vs $10.408). Se conserva vivo solo como cheque independiente de la vista de la base |
| **La grid de Reebok en `/productos`** con redirect desde la raíz | PR-2 | La grid vive en la raíz para las 4 marcas; `/productos` redirige conservando los filtros |
| **El CartProvider y el auth propio de Reebok** | abril 2026 | Código muerto tras unificar |
| **El módulo «Camisetas»** | eliminado por completo en #35 (jun 2026) | Dejó 24 filas huérfanas en `activity_logs` (`pedido_create`/`pedido_update` con `entity_type = "camisetas"`, abr–jun 2026) |
| **`fetchCache = "force-no-store"` en `/public`** | retirado | Next lo trata como **bypass total** de `unstable_cache`: la caché quedaba escrita y jamás leída |
| **`.limit(5000)` en `/reebok/stats`** | retirado el 26-jul-2026 | «No era el tope que decía ser»: el corte real lo ponía PostgREST en 1.000 y sin avisar. «Un tope silencioso no es una defensa» |

## Cuánto se usa

**Medido contra producción el 4-sep-2026.** ⚠️ `activity_logs` solo registra algunas
escrituras (no clics ni pantallas vistas), así que la medición fuerte son **las filas que el
módulo escribe**.

### Pedidos internos creados, por mes

| Marca | Total | Vivos (no borrados) | 2026-05 | 06 | 07 | 08 | 09 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Reebok | 23 | 15 | 1 | 2 | 19 | — | 1 |
| Tommy | 38 | 32 | — | — | — | 32 | 6 |
| Calvin | 21 | 5 | — | — | — | 20 | 1 |
| Joybees | 41 | 4 | — | — | 5 | 36 | — |

**El módulo se mudó de marca en el tiempo**: julio fue de Reebok y Joybees, agosto de
Tommy y Calvin. **Tommy es la única marca viva en septiembre.**

### Pedidos del link público (los que hace el cliente sin login)

| Marca | Filas | Vivas | Convertidas | Confirmadas por el cliente |
|---|---:|---:|---:|---:|
| Reebok | 18 (abr 6 · may 4 · jul 8) | 6 | 3 | 1 |
| Joybees | 4 (jul) | 2 | 3 | 0 |
| Calvin | 1 (ago) | 1 | 1 | 1 |
| Tommy | **0** | 0 | 0 | 0 |

🔴 **El catálogo público casi no se usa: 23 pedidos en cinco meses, y ninguno desde
agosto.** Tommy —la marca con más pedidos internos— **nunca recibió uno por el link**.

### Envíos a Switch (lo que de verdad salió del sistema)

| Marca | Envíos | Estado | Pedido | Cotización | Por mes |
|---|---:|---|---:|---:|---|
| Tommy | 29 | **verificado 29/29** | 26 | **3** | ago 23 · sep 6 |
| Reebok | 16 | verificado 16/16 | 16 | 0 | jul 15 · sep 1 |
| Joybees | 4 | verificado 4/4 | 4 | 0 | jul 3 · ago 1 |
| Calvin | 3 | verificado 3/3 | 3 | 0 | ago 2 · sep 1 |

**52 envíos en total, TODOS en estado `verificado`** — o sea que Switch confirmó las
líneas en los 52. **Cero `error`, cero `pendiente`, cero ambiguos.** Las **3 cotizaciones**
son todas de Tommy (agosto-septiembre 2026, desde que existe la función).

### Quién arma los pedidos (`vendor_name` de los últimos 200 por marca)

- **Reebok**: REINALDO ESPINOSA 9 · DEFAULT 7 · daniel 2 · edwin 2 · (null) 3
- **Tommy**: REINALDO ESPINOSA 28 · daniel 7 · rey 2 · andrea 1
- **Calvin**: DANIEL LEVY 13 · EDWIN 3 · Angela 2 · daniel 1 · Rodrigo 1 · (null) 1
- **Joybees**: daniel 19 · **medicion 16** · DANIEL LEVY (con espacio) 2 · DEFAULT 1 · (null) 3

⚠️ `vendor_name` **no tiene un formato**: mezcla el nombre de login (`daniel`, `andrea`,
`rey`, `Angela`) con el nombre del vendedor de Switch en mayúsculas (`REINALDO ESPINOSA`,
`DANIEL LEVY `) y con `DEFAULT`. Y **16 de las 41 filas de Joybees dicen `medicion`**: son
filas de un script de medición que quedaron en producción (37 de las 41 de Joybees están
marcadas como borradas).

### Actividad registrada (`activity_logs`, 17-abr → 2-sep-2026)

| Acción | `entity_type` | Rol | Veces |
|---|---|---|---:|
| `product_foto_variante` | tommy | secretaria | 27 |
| `product_ocultar_catalogo` | tommy | secretaria | 17 |
| `product_ocultar_catalogo` | calvin | secretaria | 6 |
| `product_foto_variante` | tommy | admin | 3 |
| `product_mostrar_catalogo` | tommy | admin | 2 |
| `product_ocultar_catalogo` | joybees | secretaria | 2 |
| `product_ocultar_catalogo` | tommy | admin | 1 |
| `pedidos_bulk_delete` | catalogo_reebok | admin | 1 |

**Quien administra el catálogo es la SECRETARIA** (52 de las 59 acciones), y casi todo el
trabajo es de **Tommy** (50 de 59). ⚠️ Subir una foto (`upload`) y editar precio o etiqueta
**no dejan rastro** en `activity_logs`, así que esto es un piso, no el total.

### Los crons, medidos en `switch_sync_log`

| Sync | Corridas leídas | Éxito | Error | Manual | Última corrida (4-sep) |
|---|---:|---:|---:|---:|---|
| `catalogo_reebok` | 186 (10-jul → 4-sep) | 184 | 2 | 8 | 22:05 · 233 productos · 51 s |
| `catalogo_tommy` | 167 (26-jul → 4-sep) | 163 | 4 | **17** | 21:55 · 462 productos |
| `catalogo_joybees` | 183 (10-jul → 4-sep) | 179 | 4 | 2 | 22:10 · 83 productos · 20 s |
| `catalogo_calvin` | 124 (12-ago → 4-sep) | **124** | 0 | 6 | 22:03 · 88 productos |

Los 10 errores son **de red o de sesión**, ninguno de datos: `ECONNREFUSED` /
`UND_ERR_CONNECT_TIMEOUT` en `/autenticacion`, «Run previo atascado en 'running'» y un
`Auth respondió 200 pero sin token: <!DOCTYPE html>` de Joybees (la página de excepción de
Switch con HTTP 200). **Duración medida:** Tommy 56–151 s · Reebok 51–113 s · Calvin
17–69 s · Joybees 5–22 s.

**Los catálogos CRECEN**: el 4-sep entraron **13 productos nuevos a Calvin** (75 → 88) y
**6 a Tommy** (457 → 463), los dos en corridas **manuales** («Actualizar ahora»).

## Qué papeles y Excel produce

| Qué sale | Nombre del archivo | Contenido | Quién lo recibe | Desde qué botón |
|---|---|---|---|---|
| **PDF del pedido/cotización** (interno) | `<Pedido\|Cotización>-<order_number>-<AAAA-MM-DD>.pdf` | Logo de la marca, número, cliente, vendedor, una fila por producto con foto, bultos, piezas, precio y subtotal, total. **El encabezado dice PEDIDO o COTIZACIÓN según lo que de verdad salió a Switch** | Se comparte por WhatsApp con el cliente | «Descargar PDF» del detalle |
| **PDF del pedido, servido por el servidor** | igual, vía RFC 6266 | idem | idem | `GET /orders/[id]/pdf`. 🩸 Se manda `filename` ASCII **y** `filename*=UTF-8''…`: sin eso «Cotización» baja como `CotizaciÃ³n-TOM-027.pdf` |
| **PDF del pedido público** | `Pedido-<Marca>-<AAAA-MM-DD>.pdf` | El pedido tal como lo ve el cliente | El cliente, sin login | «Descargar PDF» en `/pedido-<marca>/[id]` |
| **PDF del catálogo** | `catalogo-<marca>-<AAAA-MM-DD>.pdf` | El catálogo filtrado con fotos, agrupado por género/categoría | Se comparte por WhatsApp | Menú de compartir del catálogo |
| **Excel de comprobantes** | `Pedidos-<Marca>-<AAAA-MM-DD>.xlsx`, hoja **«Pedidos»** | Origen · Cliente · Vendedor · Items · Total · Fecha · **N° pedido** · **Switch** | Uso interno (admin/secretaria) | «Exportar Excel» de Comprobantes. 🔴 La hoja y el archivo **siguen llamándose «Pedidos»** aunque el panel se llame Comprobantes: «Daniel puede tener una planilla enganchada; renombrar la hoja la desengancha» |
| **Excel «sin foto»** | `<marca>-sin-foto-<fecha>.xlsx` | Reebok: `Código · Descripción · Categoría · Disponible · Existencia`. Joybees/Tommy/Calvin: la forma de la **plantilla del portal B2B de PVH** (`DASHBOARD DE BUSQUEDA`), con los códigos **ordenados A-Z en la columna B**, encabezado `INSERTE ARTICLE NUMBER AQUÍ (máximo 200)`, y una hoja nueva cada 200 códigos | Quien va a bajar las fotos del portal | «Excel sin foto» del panel de admin |
| **Correo al equipo** | asunto propio por marca, remitente `<Marca> Panama <pedidos@fashiongr.com>` | Banda de la marca, tabla `Producto · Bultos · Piezas · Precio/u · Subtotal`, sección **Pre-orden** aparte en ámbar | `daniel@fashiongr.com` | «Confirmar pedido» / «Avisar por correo a Fashion Group» |
| **Correo al cliente** | mismo remitente, **otro texto**: «Gracias por tu pedido» | Igual pero escrito para afuera, con el adjunto PDF | El cliente mayorista | «Enviar por email al cliente». ⚠️ Hasta el 26-jul-2026 los dos botones mandaban el correo interno: el cliente recibía «Estimado equipo Fashion Group» e instrucciones de bodega |
| **Excel de importación de Joybees** | plantilla `SKU,Nombre,Precio,Cantidad,Genero,Estado` | — | Quien carga el catálogo | 🔴 solo desde `?tab=importar` escrito a mano |

**Y lo que sale sin ser archivo:** los mensajes de Telegram. `avisoPedidoEnviado` (📊 NEGOCIO):
`<emoji> <Pedido|Cotización> <numero> · <cliente>` en la primera línea y el monto, las piezas y
el número de Switch en la segunda. Los emoji por marca son 🛒 Reebok · 🐝 Joybees · 🔵 Tommy · ⚫ Calvin.

## Cómo probarlo a mano

**Escrito para alguien que no programa.** Todo se hace desde la app.

### A · Que el catálogo esté vivo y actualizado
1. Entra a **Catálogos** → mira las cuatro tarjetas. Cada una debe decir «N productos». Si dice «Contadores no disponibles», esa marca tiene un problema de lectura.
2. Entra a **Administrar** de una marca → arriba dice cuándo fue la última sincronización. Si dice más de un día, el cron de esa marca no corrió.
3. Toca **«Actualizar ahora»**. Espera (Tommy tarda hasta 2½ minutos). Al terminar, la hora de arriba debe cambiar.
   👉 Dónde confirmar: la línea de «última sincronización» sale de `switch_sync_log`, no del reloj de los crons — si cambió, la corrida ocurrió de verdad.

### B · Que un pedido llegue completo a Switch (la prueba que importa)
1. **Catálogo** de la marca → agrega 2 productos, cantidades distintas.
2. **«Confirmar pedido»**. Verifica que el bloque **Cliente** esté en **ámbar** diciendo «Elige el cliente» y que el botón de enviar esté **apagado** diciendo qué falta. *Si arranca con un cliente puesto, algo se rompió: eso es exactamente lo que costó $53.124.*
3. Toca **«Elegir»** → busca el cliente por nombre o código → elígelo.
4. Revisa que el **Vendedor** diga tu nombre con «· tu vendedor».
5. Toca el precio de una línea y cámbialo. El total de abajo debe cambiar.
6. Toca **«Pedido»**. Espera.
7. Debe aparecer **«Pedido creado en Switch»** con un número tipo `16-000000506`.
   👉 Dónde confirmar: entra al panel de Switch de esa empresa y busca ese número. Las líneas y las cantidades deben ser las mismas.
8. Vuelve a **Comprobantes**: la fila debe mostrar **los dos números** — el de la casa (`TOM-030`) y el de Switch.
9. Abre el pedido: debe decir **«Este pedido ya está en Switch — no se puede editar aquí.»** *Si te deja editar, el candado se rompió.*
10. Repite el paso 6 (vuelve atrás y toca enviar otra vez): debe contestar **«Este pedido ya fue enviado a Switch»**. *Si crea un segundo pedido en Switch, el at-most-once se rompió — es el fallo más caro del módulo.*

### C · Que la cotización se distinga del pedido
1. Arma otro pedido igual pero toca **«Cotización — no aparta mercancía»**.
2. La confirmación debe decir **«Cotización creada en Switch»**.
3. Baja el PDF: el encabezado y **el nombre del archivo** deben decir **Cotización**, con tilde y sin caracteres raros.
4. En Comprobantes, el chip **«Cotizaciones»** debe contarla; el chip «Pedidos» no.

### D · Que el link público funcione
1. En el catálogo, menú de compartir → **copiar link**. Ábrelo en el teléfono **en modo incógnito** (sin sesión).
2. Debe cargar el catálogo. Agrega algo, escribe un nombre y confirma.
3. Debe salir la pantalla del pedido con **«Ya lo recibimos»**.
4. En el sistema, **Comprobantes** → chip **«Del link»**: la fila nueva debe estar ahí, sin número de la casa («Se numera al abrirlo»).
5. Toca **«Editar»**: se numera y se abre como pedido interno, **sin cliente puesto**.
   👉 *Si sale ya en Switch a nombre de «Contado», volvió el auto-envío que se retiró el 14-ago-2026.*

### E · Que las fotos se guarden
1. Panel de admin → **«Faltan foto»** → **«Subir foto»** en un producto. La tarjeta debe pasar a «Con foto» y el badge de la pestaña bajar en 1.
2. Toca **«Más fotos»**: la foto elegida debe llevar el ✓.
3. 👉 Dónde confirmar que aguanta: espera a la siguiente corrida del cron (o toca «Actualizar ahora») y vuelve a mirar. **La foto no puede desaparecer** — si desaparece, el sync está pisando `image_url`.

### F · Que «Ocultar del catálogo» sobreviva
1. Oculta un producto → debe decir «Listo — producto oculto del catálogo».
2. Ábrelo en el **catálogo público** (link, sin sesión): no debe aparecer. *Si aparece, falló la invalidación de caché — el bug #244.*
3. Toca «Actualizar ahora» y vuelve a mirar: debe seguir oculto.

## Qué lo rompe

| Qué falla | Qué pasa | **Cómo se nota** |
|---|---|---|
| **Switch cambia el formato de `/apiarticulos/*`** | El barrido de páginas deja de reconocer la página corta o los campos; **fail-safe: no se modifica el catálogo** | El cron se anota `error` en `switch_sync_log` y, con **2 corridas seguidas fallidas del mismo par**, sale 🔧 SISTEMA. La pantalla de admin sigue diciendo la hora vieja |
| **Switch devuelve la página de excepción con HTTP 200** | Ya pasó: `Auth respondió 200 pero sin token: <!DOCTYPE html>` en Joybees el 4-ago-2026 | El código lo caza porque valida el **SHAPE** de la respuesta, no el status. **Esta es la regla del módulo: cualquier endpoint nuevo se prueba por la forma del body, nunca por el código HTTP** |
| **El cron `<marca>-catalogo` no corre** | El catálogo se congela: precios y existencias viejas, productos nuevos sin entrar | «Última sincronización» del panel de admin envejece. El watchdog de `cron_heartbeats` avisa. ⚠️ **Un catálogo congelado NO tiene aviso propio**: se ve mirando esa línea |
| **Dos crons de la misma empresa se pisan** | 🔴 Switch admite **un solo token válido por USUARIO** y el sistema entra como `daniel`: el segundo login mata el token del primero (código `0006`) | `Error de red en /autenticacion` o `sin token` en `switch_sync_log`. Por eso los crons de la misma empresa van a **≥15 min** y cada cron cierra la sesión en su `finally` (`logoutAllSwitchSessions`) |
| **Un cron entra al panel web mientras Daniel está adentro** | Lo **expulsa**. Los catálogos no usan el panel (van por API), pero comparten el usuario | Daniel se cae del panel de Switch de esa empresa |
| **La migración `20260824160000` (columna `documento`) no está** | El envío escribe la fila **sin** esa columna (reintento tolerante) y todo sale como «Pedido» | Las cotizaciones se ven como pedidos en la lista y en el PDF |
| **La migración `20260806120000` (`bulto_pzas`) no está** | Guardar «Piezas por bulto» responde **500** con el mensaje de la migración; el total de Tommy/Calvin cae al bulto por defecto | El error dice literalmente «Falta correr la migración 20260806120000» |
| **La migración `20260723120000` (`oculto_manual`) no está** | La pantalla de administrar **no carga ningún producto** sin el fallback | Hay fallback: se reintenta sin la columna. Sin él, pantalla vacía |
| **Se pierde el índice único de `<marca>_switch_envios`** | 🔴 **Un pedido se puede mandar dos veces a Switch** | No se nota desde la app: se nota en Switch, con dos pedidos iguales |
| **`switch_clientes` llega vacía para una empresa** | El selector no ofrece clientes **ni el mostrador** → no se puede enviar ningún pedido de esa marca | El picker sale vacío y el botón queda apagado diciendo «Falta: elegir el cliente» |
| **Storage de fotos caído** | Las fotos no cargan y el ZIP del B2B falla | Las tarjetas salen sin imagen; el ZIP dice «No se pudieron guardar:» |
| **`RESEND_API_KEY` sin configurar** | El correo del pedido responde **500** | «No se pudo enviar el correo. Intenta de nuevo.» |
| **Una lectura grande sin paginar** | 🩸 `db-max-rows = 1000` **corta en silencio**. Pasó con `inventory` de Reebok: el producto aparece **sin ninguna talla**, o sea **Agotado** a la vista del cliente — y la versión truncada quedaba **cacheada** | Productos que dicen Agotado teniendo stock. Hoy todo va por `leerTodoPaginado` con verificación contra el COUNT exacto |
| **Un precio imposible en Switch** | El guard de montos rechaza **la fila**; el producto conserva el último precio bueno | Se dice en pantalla (Data Health) y queda en `switch_sync_log.skip_details` |
| **Un valor de clasificación que el mapa de Reebok no conoce** | El producto cae en el cajón neutro y **nunca pisa** una clasificación que ya existía | 🔧 SISTEMA con el valor crudo y cuántos productos toca. 🩸 Con `ficha_at` en NULL **no se avisa ni se clasifica** — «todavía no llegó» no es «llegó algo que no entiendo» (la falsa alarma de los 233 productos del 2-sep-2026) |
## Lo que sobra o no cuadra

### Contradice a `CLAUDE.md` o a la documentación
1. 🔴 **`CLAUDE.md` dice que los productos de Reebok viven en OTRO proyecto Supabase. Medido, no.**
   `NEXT_PUBLIC_REEBOK_SUPABASE_URL` en `.env.local` apunta a `rspocgqhtpveytgbtler`, el
   proyecto principal; `REEBOK_SERVICE_ROLE_KEY` **no existe** y `reebok-supabase-server.ts`
   cae a la key del principal. Las 391 filas están ahí. Existe un segundo proyecto en la cuenta
   (`halqekrjfttpwoqtazjm`, «Apps Familia») con una copia **congelada**: 83 filas, todo
   `footwear`, todo activo. ⚠️ **No medible: las env vars de Vercel** (no se corrió `vercel env ls`).
2. ⚠️ **`docs/switch-flujo.md` §16 dice que el sync de catálogo hace TRES llamadas**, incluida
   `GET /apiarticulos/tallacolor` «para tallas», citando `client.ts:1298`. **`sync-catalogo.ts`
   NUNCA llama a tallacolor**: son **dos**. `client.ts:1298` es el cuerpo del método, no un sitio
   de llamada. El **único** llamador en todo `src/` es `switch-envio.ts`, y solo para contar
   variantes. Consecuencia material: **los catálogos no tienen ni una talla** y `inventory` de
   Reebok escribe siempre `size: "UNICA"` en sus 391 filas.
3. ⚠️ **`docs/switch-referencia.md` §1.4 dice que `/apiarticulos/tallacolor` lo usan
   `switch-envio.ts`, `lib/tommy-bulto.ts` y `sync-catalogo.ts`.** Solo el primero: en
   `tommy-bulto.ts:13` es un **comentario de medición** («devuelve `[]`»), y `sync-catalogo.ts`
   ni lo menciona.
4. ⚠️ **`docs/switch-flujo.md` §13 lista el descarte de `/apiarticulos/lista` incompleto**:
   también se descartan `codigoBarraId`, `unidadmedidaId` y `proveedorId`. Y el `codigoBarra`
   **no «se conserva»**: vive solo en memoria dentro de la corrida y **no se persiste** — por eso
   cada corrida tiene que rebarrer las páginas para poder pedir una ficha.
5. ⚠️ **Ningún documento anota que se descarta el `costo`** de `/apiarticulos/lista` ni el
   `costo`/`costopromedio` de `/apiarticulos/stock`. Y `switch-flujo.md` —el mapa que se
   consulta— **no menciona el descarte de `urlswitchpay`** (sí lo dice `switch-referencia.md` §1.5).
6. ⚠️ **`switch-envio.ts:24-25` dice que las líneas se resuelven «con la MISMA concurrencia que
   el sync de catálogos».** El sync subió a **8** el 14-ago-2026; `SKU_CONCURRENCIA` sigue en **4**.
   El helper sí es el mismo (`enParalelo`); la concurrencia ya no.
7. ⚠️ **El encabezado de `api/catalogo-paridad-duplicar.test.ts` contradice a sus propios casos**:
   dice «vendedor: el de QUIEN DUPLICA (13-ago-2026)» y los casos vigentes dicen lo contrario
   —*«el clon lleva el vendedor del ORIGINAL»*— y son los que mandan. Es un comentario viejo
   dentro de un candado vivo.

### Endpoints y pantallas sin uso
8. 🔴 **`ImportarTab` (Joybees) no tiene entrada visible.** El array `tabs` de
   `AdminCatalogoClient` tiene solo `faltan-foto` y `completo`, pero el render tiene un tercer
   bloque condicionado a `theme.admin.importarTab`, que vale `true` **solo en Joybees**
   (`marcas-ui.tsx:1127`). Solo se llega escribiendo `?tab=importar`. Y no es inofensivo: por
   debajo llama a `POST /api/catalogo/joybees/import`, que **pone `stock:0, active:false` a
   todos los SKU que no vengan en el archivo**.
9. **`/api/catalogo/joybees/seed`, `/api/catalogo/reebok/stats`,
   `/api/catalogo/reebok/pedidos-publicos` y `/api/catalogo/reebok/inventory/bulk` no tienen ni
   un llamador** en `src/app` ni en `src/components` (verificado por grep). Siguen protegidos
   por rol y siguen vivos.
10. ⚠️ **`/api/catalogo/[marca]/pedidos-unificado` está retirado de las pantallas desde el
    25-ago-2026 pero sigue vivo, y CALCULA MAL EL TOTAL** (no le pasa las piezas por bulto del
    estilo). Medido en 5 pedidos de Tommy: TOM-024 $3.324 vs $3.100 · TOM-020 $11.088 vs
    $10.408 · TOM-018 $7.764 vs $7.548 · TOM-016 $1.080 vs $1.020 · TOM-001 $1.584 vs $1.472.
    Su propio encabezado dice: «ESTE ENDPOINT YA NO ALIMENTA NINGUNA PANTALLA… **NO LO READOPTES
    SIN LEER ESTO**». Se conserva porque sus candados son el cheque independiente de la vista de
    la base, **pero `pedidos-export` sí lo sigue usando** — el Excel sale de ahí.
11. **`fg_catalogo_publico_switch` está vacía (0 filas) y ninguna pantalla la escribe.** Es «la
    manija» del cliente y el vendedor del pedido público; hoy solo se lee.
12. **`reebok_cart` existe con 0 filas** y no está en `CLAUDE.md`. El carrito real vive en
    `sessionStorage`.

### Datos sucios en producción
13. ✅ **CERRADO el 4-sep-2026 — los datos de prueba se borran de verdad.** Calvin: **16 de 21**
    pedidos («PRUEBA T173 / T169 — BORRAR»). Joybees: **37 de 41** («PRUEBA T143 / T173 — BORRAR»,
    «PRUEBA-BOT» y 16 filas con `vendor_name = "medicion"`, de un script de medición). Estaban
    marcadas `deleted`, así que no se veían — pero seguían en la base y en los backups. Daniel:
    *«borro de verdad de la base»*. Migración `20260924120000_borrar_pedidos_de_prueba.sql`
    (**pendiente de aplicar**, la corre Daniel).
14. ⚠️ **`vendor_name` de los pedidos no tiene formato.** Mezcla el nombre de login (`daniel`,
    `andrea`, `rey`, `Angela`, `Rodrigo`), el nombre de Switch en mayúsculas
    (`REINALDO ESPINOSA`, `DANIEL LEVY ` **con espacio final**), `DEFAULT` y `null`. Es el mismo
    problema que en Comisiones se resolvió con `comision_vendedor_alias`, aquí sin resolver.
15. ⚠️ **La misma tienda con dos grafías** en `reebok_orders.client_name`:
    `CITY MALL PASO CANOA` (2) y `City Mall Paso Canoa` (2). Es el campo de texto libre; el
    `cliente_switch_id` es el que manda.
16. ⚠️ **`joybees_products.category` tiene un valor accidental**: `clogs` 81 y **`nuevo` 2**.
    `nuevo` es una etiqueta, no una categoría.
17. ⚠️ **`calvin_products.name` no es el nombre del producto**: son **7 valores distintos** en 94
    filas (`Women-Flip Flops` 30, `Men-Flip Flops` 27, `Women-Sandals` 20, …). Es el **rubro de
    Switch**. Lo mismo en `tommy_order_items`: 219 productos distintos y **10 nombres**, uno de
    ellos literalmente **`x`**.
18. ⚠️ **En `switch_articulo_info` de `active_shoes` hay 1.200 fichas y 1.199 subrubros**: **una
    fila con `ficha_at` y `subrubro` vacío**. Es exactamente el caso que `fichaLlego` debe
    avisar por 🔧 SISTEMA («llegó algo que no entiendo»).
19. ⚠️ **Dos valores de `marca` fuera de los tres estables** en las fichas de `active_shoes`:
    `CK DISPLAY & PROMO` (3) y `AT CRAZE 3` (1). Caen en el cajón neutro, que es lo correcto —
    pero significan que el mapa no los conoce.

### Columnas que nadie llena o nadie lee
20. 🔴 **`badge` está VACÍA en las cuatro marcas: 0 de 1.120 productos.** La pantalla ofrece
    `Sin etiqueta / Nuevo / Oferta / Próximamente`, la API valida el valor, `esVisibleEnCatalogo`
    lo usa para forzar visible con `proximamente` — y nadie la usó nunca.
21. 🔴 **`keep_visible` nunca se encendió**: NULL en Tommy, Calvin y Joybees; `false` en las 391
    de Reebok. Es la otra mitad de la regla de visibilidad y está muerta.
22. 🔴 **`nombre_manual` es `false` en las 552 de Tommy y en las 94 de Calvin.** La función
    «Editar nombre (el sync deja de cambiarlo)» existe, tiene su candado y **nadie la usó**.
23. 🔴 **`bulto_pzas` está llena en 51 de 552 en Tommy (todas con el valor 8) y en 0 de 94 en
    Calvin.** Es la columna de la que depende el total del pedido.
24. 🔴 **`client_email` y `comment` están vacías en las cuatro tablas de pedidos.** `client_email`
    se captura en el alta y se ofrece en «Enviar por email al cliente».
25. 🔴 **`is_preorder` es `false` en las 316 filas de `reebok_order_items`.** El checkout tiene
    su bloqueo, la API su 422 y el correo su sección ámbar «Pre-orden»: **la preventa nunca se usó**.
26. **`products.description` y `products.color` (Reebok) están 100% vacías.**
27. **`products.sub_category` está vacía en 287 de 391.**
28. ⚠️ **46 de 391 productos de Reebok no tienen `codigo_barra_id`** y **26 no tienen
    `existencia`/`disponibilidad`**: esos no cruzan contra Switch y el envío los rechaza con
    «SKU no tiene código de barra en Switch».
29. **`origen_original` / `origen_short_id` solo se usan en Reebok.** Tommy tiene los 38 pedidos
    en `mio` y **nunca recibió uno por el link**.
30. **`idempotency_key` está en 3 de 41 pedidos de Joybees** (contra 27 de 38 en Tommy).

### Huecos abiertos que la documentación de Switch describe y el código no mira
31. 🔴 **La verificación post-escritura solo cuenta líneas.** `/apipedido/info` devuelve cantidad,
    precio, descuento e impuesto por línea, y el código lee `detalle.length`. **Un pedido que
    Switch creó con la cantidad cambiada se marca `verificado`.**
32. 🔴 **El precio que se valida y se manda es el de la LISTA POR DEFECTO, no el del cliente.**
    `switch-envio.ts` pregunta el precio **sin `clienteId`**. Si el cliente tiene lista asignada,
    el facturador aplicará otra: el aviso `precio_distinto` puede sonar por eso, y el precio que
    el cliente ve en el catálogo puede no ser el que le facturan. Sin usar:
    `/apiarticulos/precios?articuloId=` y `/apiarticulos/lista?clienteId=`.
33. 🔴 **El parámetro `0072` de Switch (control de comprobantes) no se consulta nunca.** Si está
    ACTIVO, al convertir cotización → pedido → factura Switch **restablece los precios originales
    del artículo** y el precio editado se pierde al facturar. Se lee con
    `GET /parametro?codigo=0072`; **el sistema nunca llama a `/parametro`**. Verificado apagado a
    mano en las 4 empresas el 3-sep-2026 — pero nada lo vigila.
34. **Nunca se mandan `comprobante` / `comprobanteId`** en el POST, así que **no se usa la
    capacidad del API de convertir una cotización en pedido sin reescribir las líneas**. Hoy «para
    vender se duplica». Es decisión nuestra, no límite del API.
35. **El filtro por marca y proveedor se hace en memoria después de bajar el catálogo entero.**
    `/apiarticulos/lista` acepta `proveedorId`, `rubroId`, `sucursalId` y `estatus`, y nunca se mandan.

### Otros
36. **`MODULO_HEREDA_PERMISO_DE["catalogos"] = "boston"` ya no hace falta.** Existía «mientras la
    DDL `20260902130000` no corra». Medido: `role_permissions.gerente_boston.modulos` ya es
    `["boston","catalogos","asistencia"]`. El propio comentario dice cuándo se retira.
37. ⚠️ **`GET /orders` y `GET /reebok/inventory` son PÚBLICOS y sin rate limit**, igual que
    `GET /[marca]/public` y el `GET /products` **de Reebok** sin `?scope=admin`
    (`src/middleware.ts` los lista por prefijo). De las rutas públicas, **solo las dos del pedido
    público tienen rate limit**.
38. **Las 24 filas de `activity_logs` con `entity_type = "camisetas"`** (`pedido_create` /
    `pedido_update`, abr–jun 2026) son del módulo **Camisetas, eliminado en #35**. Quedaron
    huérfanas.
39. **La hoja y el archivo del Excel de comprobantes siguen llamándose «Pedidos»** aunque el panel
    se llame «Comprobantes». Es a propósito: «Daniel puede tener una planilla enganchada;
    renombrar la hoja la desengancha».
40. **El asunto y la banda del correo no distinguen pedido de cotización.** Es **decisión
    pendiente de Daniel**, escrita en el postmortem: *«Recibimos tu cotización»* suena raro (el
    cliente no la mandó) y *«Gracias por tu pedido»* no tiene equivalente de una palabra. **El
    adjunto ya sale bien**, así que el papel no miente; lo que falta es la carta que lo acompaña.
---

# Referencia (`/referencia`, key `referencia`)

## Qué es

El buscador de **una referencia de producto**: pegas uno o varios códigos (o un pedazo
de la descripción) y por cada artículo te dice **qué llegó, cuándo, a qué costo, cuánto
se vendió, cuánto queda y en cuánto tiempo se vendió**. Existe para decidir la recompra
sin abrir Switch: Daniel, textual (11-ago-2026): *«quiero la data clara y simple. cuando
me llego, cuanto me lllego y en cuanto tiempo lo vendi, punto»*.

Nació como 5.ª pestaña de `/ventas` y desde el 12-ago-2026 **la pestaña ya no existe**:
`/ventas?tab=referencia` redirige a `/referencia`, que es la única puerta. La vista es
**la misma clase** (`ReferenciaView`), no una copia.

## Quién entra

| Rol | Entra | Qué ve de distinto |
|---|---|---|
| `admin` | sí | **Todo, incluido el MARGEN** (`margenVisible = true`) |
| `vendedor` | sí | Igual, **menos el margen** — ni en pantalla ni en el Excel |
| `bodega` | sí | Igual que vendedor |
| `secretaria` · `contabilidad` · `gerente_acs` · `gerente_boston` | **no** | `/referencia` los manda a `/home`; `GET /api/ventas/referencia` les contesta **403** |

- El gate de página está en `src/app/referencia/page.tsx` y **lee la lista única** `REFERENCIA_ROLES` (`src/lib/ventas/referencia.ts` = `["admin","vendedor","bodega"]`, `redirect("/home")`). Desde el 4-sep-2026 esa MISMA lista la usan también `GET /api/ventas/referencia` y `POST /api/ventas/referencia/actualizar`: tres copias escritas a mano fue lo que dejó el botón en solo-admin. Candado: `referencia-boton-actualizar.test.ts`.
- El gate del margen **NO está en la vista**: lo pone el servidor (`src/app/api/ventas/referencia/route.ts` → `margenVisible = auth.role === "admin"`). La vista solo lee `resp.margenVisible`.
  Daniel, textual: *«quita margen, lo demas dejalo»*.
- Personas reales (medido en `fg_users`, 4-sep-2026): **daniel** y **alberto** (admin) · **rey**, **edwin**, **rodrigo** (vendedor) · **Bodega** (bodega). Ocho usuarios en total tienen la puerta.
- Medido en `role_permissions` el 4-sep-2026: `vendedor.modulos` = `["catalogos","cxc","directorio","guias","referencia"]` y `bodega.modulos` = `["guias","packing-lists","catalogos","referencia","asistencia"]`. **La `key` `referencia` YA está en la tabla**, o sea que la migración `20260812120000` **ya corrió** — ver «Lo que sobra o no cuadra».
- **Nadie ha usado el módulo según `activity_logs`**: 0 filas con `action`/`entity_type` que contenga «referencia» (medido 4-sep-2026). El módulo no registra actividad, así que esto **no prueba que no se use** — prueba que no se instrumentó.

## Las pantallas

Una sola pantalla, sin sub-rutas. `AppHeader module="Referencia"` + `ReferenciaView`.
El `<h1>Referencia</h1>` es `sr-only` (lo dicen el chip sticky en celular y el breadcrumb en escritorio).

### La caja de búsqueda

- Un campo, `placeholder` exacto: **«Código, modelo o descripción — puedes pegar varios»**, `aria-label` «Buscar referencia».
- Botón **«Buscar»** (dice **«Buscando…»** mientras corre).
- Ayuda bajo la caja: *«Un código trae todos sus colores. Puedes pegar hasta 50 códigos juntos, separados por espacios, comas o uno por línea — con varios sale una tabla para armar tu pedido.»* (`MAX_CODIGOS_MULTI = 50`).
- **Obligatorio:** 3 caracteres. Menos → «Escribe al menos 3 caracteres.» (lo dicen la pantalla *y* el servidor, 400).

**La tarea más frecuente, en pasos:** 1) pegar el código → 2) tocar «Buscar» → 3) leer la
ficha. Son **tres toques**; no hay filtro de empresa, ni selector de período, ni pestañas.

### El resultado — tres formas, elegidas solas

1. **Un código (o varios que caen en el mismo modelo) → FICHAS.** Una tarjeta por
   `(empresa, código)` (`TarjetaArticulo`). Si el modelo tiene varios colores, se agrupan
   bajo un título **«Modelo XXXX · N colores · en N empresas»** (los colores se cuentan por
   CÓDIGO distinto, no por tarjeta: el mismo código en dos empresas no es otro color).
2. **2 o más códigos pegados → TABLA PARA ARMAR EL PEDIDO** (`ReferenciaTablaPedido`).
   Columnas exactas: **Código · Compré · Vendí · Stock · Vendido · Meses · Margen · Últ. compra**
   (la de Margen **no viaja** para vendedor/bodega). Las filas salen **en el orden en que se
   pegaron** (`ordenarComoPegado`); tocar un encabezado ordena por esa columna
   (`title="Tocar de nuevo lo invierte"`), y volver a tocar el mismo devuelve al
   orden pegado (`title="Tocar de nuevo vuelve al orden en que los pegaste"`).
3. **Texto que no parece código → LISTA DE MODELOS.** Sale «Elige el modelo:» con hasta 100
   botones `modelo · descripción · N colores`; al tocar uno se re-busca por ese modelo.

### Lo que dice la ficha (`TarjetaArticulo`)

Bloques rotulados, literales: **Compré · Vendí · Stock · Meses · Precio prom · Costo CIF**,
más el gráfico **«Mes a mes · unidades»** y el desplegable **«De dónde salen estos números»**.
Frases que aparecen solo cuando aplican: «No vendió nada en estos 12 meses.» ·
«Oct · nov · dic no vendieron nada.» · «Todavía no ha pasado por su temporada fuerte (oct–dic).» ·
«Switch no tiene este código en el catálogo» · «El FOB es una cuenta, no un dato traído:» ·
«El margen se calcula contra el Costo CIF».

### Avisos de la pantalla

- **Sin ingresos de mercancía cargados:** «Todavía no están cargados los ingresos de mercancía, así que no se puede decir qué llegó ni cuándo. Las ventas de abajo sí son reales.» (`comprasDisponibles === false`).
- **Códigos que no existen:** «No encontré el código / los códigos X, Y — ni en ventas ni en compras.»
- **Nada:** «No hay nada con eso.»
- **Búsqueda demasiado amplia** (más de 20.000 filas de `switch_articulo_diario`): «La búsqueda es demasiado amplia — escribe más letras del código o la descripción.» (400).

### Exportar

Botón **«Bajar a Excel»** (solo cuando hay resultados). Sale del cliente
(`exportComprasToExcel`), **dos hojas**: la ficha por referencia y el detalle de compras.
Respeta `margenVisible`: sin margen, la columna no se escribe. La nota del encabezado dice
*«Vendido · Meses son de la ÚLTIMA llegada. Stock es siempre la existencia total.»*

## Los datos

Referencia **no tiene ni una tabla propia**. Lee tres, todas escritas por crons:

### `switch_articulo_diario` — lo que se vendió
Grano: 1 fila por `(empresa_key, fecha, artículo, tipo)`. **203.854 filas** (medido 4-sep-2026).
Columnas que Referencia lee: `empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total`.
- `tipo` decide el signo (`signoTipo`): las notas de crédito RESTAN.
- Se lee con `leerTodoPaginado` y `.order("id")` — sin eso, `db-max-rows = 1000` cortaría en silencio.
- Filtro fijo `.in("empresa_key", REFERENCIA_EMPRESA_KEYS)` = `B2B_EMPRESA_KEYS` = **las 6 de Fashion Group**. Boston y American Classic nunca entran.

### `switch_ingresos_mercancia` — lo que llegó
Grano: 1 fila por `(empresa, n_interno, línea)`. **35.519 filas** (medido 4-sep-2026).
Columnas leídas: `empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif` **+ `costo_sin_desglosar` y `fob_confiable` si existen**.
🔴 Las dos últimas se piden en un **primer intento** y, si Postgres dice que la columna no
existe, se reintenta con el juego base (`COLS_INGRESOS_COMPLETO` → `COLS_INGRESOS_BASE`).
Si tampoco existe la TABLA, la respuesta trae `comprasDisponibles: false` y la pantalla
lo dice — **nunca un cero**.

### `switch_articulo_info` — qué es el artículo hoy
Grano: 1 fila por `(empresa_key, codigo)`. **16.633 filas** (medido 4-sep-2026), de las
cuales **4.924 con `existencia > 0`**:

| empresa_key | filas | con existencia > 0 | con `ficha_at` |
|---|---:|---:|---:|
| vistana | 8.254 | 1.537 | 0 |
| fashion_wear | 5.111 | 2.637 | 0 |
| active_shoes | 1.763 | 187 | **1.200** |
| fashion_shoes | 706 | 457 | 0 |
| active_wear | 592 | 21 | 0 |
| joystep | 207 | 85 | 0 |

Columnas que Referencia lee: `empresa_key, codigo, descripcion, existencia, precio_etiqueta, synced_at`.
🔴 **`costo_api` NO lo lee esta ruta** (sí lo lee `infoParaCliente` en otros caminos y el
inventario valorizado de Vista General). 🔴 **`rubro` / `subrubro` / `marca` / `ficha_at`
tampoco los lee Referencia**: son de Catálogos. Medido: los 187 artículos de `active_shoes`
con existencia > 0 tienen **los 187 su `ficha_at`** (0 sin ficha).

**Ninguna de las tres tiene soft delete.** Todas se reconstruyen desde Switch.

## De dónde vienen los datos

> Cruzado con [`docs/switch-flujo.md`](../switch-flujo.md) y
> [`docs/switch-referencia.md`](../switch-referencia.md), **verificado contra el código**.

Referencia **no llama a Switch al leer**: la pantalla lee tres tablas. Las llena otro camino, y
son **dos vías distintas de entrada a Switch**.

### 1. Stock, precio de etiqueta y nombre real — **API con token**

| Endpoint | Qué trae | Qué se guarda |
|---|---|---|
| `GET /apiarticulos/lista?porPagina=50&paginaActual=N` | El catálogo entero de la empresa | `articulo_id` (=`id`), `codigo`, `descripcion`, **`existencia` (=`disponible`**, o sea física menos comprometida), `precio_etiqueta` (=`precio`), `costo_api` (=`costo`, que **es el CIF**, medido 3 de 3) |
| `GET /apiarticulos/info?codigoBarra=` | La ficha del artículo, **de a UNO** | `rubro`, `subrubro`, `marca`, `ficha_at` |

**Cron `/api/cron/sync-articulo-info?empresas=…`, 3 entradas de 2 empresas:**
**04:30** (vistana, active_wear) · **04:40** (fashion_shoes, fashion_wear) · **04:50**
(active_shoes, joystep). Cae en `switch_articulo_info`. **Solo las 6 del grupo**: Boston y ACS
= 0 filas a propósito, y la ruta les responde **400 antes de tocar nada**.

Guards del barrido: tope `MAX_PAGES = 400` → **error, no éxito a medias** · `PISO_BARRIDO = 0.7`
contra lo ya guardado · **`EXISTENCIA_MAX = 500.000`** (Switch mandó **4,46 billones** el
27-jul-2026) → la fila se guarda con `existencia: NULL`, nunca con el número imposible.

La **fase 2** (`/apiarticulos/info`) corre **solo para `active_shoes`**
(`EMPRESAS_CON_FICHA`), solo sobre quien tiene `ficha_at IS NULL`, **primero los que tienen
existencia**, tope **400 por corrida** y presupuesto de **240 s**.

🔑 **Lo que Switch manda y Referencia TIRA:**
- De `/apiarticulos/lista`: `codigoBarraId` · `listaPrecioId` · `unidadmedidaId` · `unidadmedida` · `proveedorId` · `proveedor` · `marcaId` · `talla` · `color` · `cantidadPorCaja`. El **`codigoBarra` se conserva solo EN MEMORIA** para la fase 2 y **no se persiste** — por eso cada corrida tiene que volver a barrer las páginas para poder pedir una ficha.
- De `/apiarticulos/info`: **de ~29 campos se guardan TRES**. Se descartan `imagen` (la URL de la foto en Switch) · `fechacreacion` · `tipoArticulo` · `articuloImpuesto` · `articuloImpuestoCodigo` · `rubroId` · `subrubroId` · `marcaId` · `listaPrecioId` · `precio` (que con `clienteId` sería el precio por cliente) · el resto sin mapear.

🔴 **`ficha_at` es lo ÚNICO que distingue «todavía no pregunté» de «pregunté y Switch no dijo
nada»**: la fila la crea la fase 1 con los tres campos en NULL. Confundir eso fue la falsa
alarma de los «233 productos sin clasificar» del 2-sep-2026.

**Sin usar y a un paso:** `/apirubro/lista` + `/apiarticulos/lista?rubroId=` daría el **rubro en
bloque** en vez de 1.363 llamadas de a una. El `subrubro` y la `marca` seguirían necesitando
`/info`. **Nadie lo midió**: `rubroId` podría ser otro parámetro ignorado, como `estatus`.

### 2. «Compré» y la última llegada — **PANEL WEB con sesión**

⚠️ **No es API: es scraping del panel Laravel** (`src/lib/switch-api/web-client.ts` +
`ingresos-mercancia-web.ts`, parser puro en `ingresos-mercancia.ts`). Credenciales
`SWITCH_<EMPRESA>_WEB_USER/_WEB_PASSWORD`, y el login manda **`changesession: "SI"`**, que
**EXPULSA a quien esté en el panel de esa empresa**.

**La pantalla: `Stock → Reportes → Reporte ingreso mercancía`.**

| Paso | Ruta del panel |
|---|---|
| Página que entrega el `_token` CSRF | `GET /reportes/ingresomercancia` |
| Botón **«Descargar Detalle»** (una fila por artículo) — **el dato** | `POST /reportes/stockingresomercanciadetalle` |
| Botón **«Descargar»** (una fila por documento) — **solo para cuadrar** | `POST /reportes/stockingresomercancia` |
| El archivo | `GET /log/<file>` |

No es DataTables: es un **acumulador por rondas** (`chunk = 500`, `key`, `file`); mientras
responda `response: true` hay que volver a pedir con `key += chunk`, con techo de 4.000 rondas.
⚠️ **El rango de fechas viaja en el POST**, no en la sesión. Se valida por **contenido**
(`pareceCsvDeIngresos`), porque el HTML de excepción de Switch llega con **HTTP 200**. CSV con `;`.

**Cron `/api/cron/sync-ingresos-mercancia`, 09:05 UTC** = **4:05 a. m. de Panamá**, de
madrugada justamente porque expulsa a Daniel del panel. Ventana de 45 días, estirada hasta 7
días antes de la última fecha cargada, tope 400. Cae en `switch_ingresos_mercancia`, llave
`(empresa_key, n_interno, linea)` con `linea` **ordinal** (el mismo artículo se repite dentro de
un documento: el doc `19-000000014` de `active_wear` tiene dos renglones del mismo código).
**Solo las 6 del grupo** — Daniel, 24-ago-2026: *«solo quiero las compañías de fashion group,
las 6»*.

🔑 **Descarte: NINGUNO del detalle.** Las 13 columnas del CSV se guardan enteras:
`FECHA · N.INTERNO · SUCURSAL · PROVEEDOR · CODIGO ARTICULO · ARTICULO · REFERENCIA · PRECIO ·
CANTIDAD · COSTO FOB · COSTO CIF · COSTO PROMEDIO · UTILIDAD %`. **Es el único camino de este
documento que no tira nada.** Lo que sí se descarta es el **CSV de resumen entero** (8 columnas):
se baja, se usa para cuadrar documento por documento y se bota — es derivable.

⚠️ **`fashion_shoes` manda 12 columnas y una sola `COSTO`.** El sistema **no adivina** si es FOB
o CIF: va a `costo_sin_desglosar` con los otros dos en NULL. Guards: si el cuadre detalle-vs-
resumen no da **no se escribe nada**; reporte vacío o menos del 70% de lo guardado → error; las
columnas se leen **por nombre, nunca por posición**.

**Por qué no el API:** `GET /apiingresomercancia/lista` responde 200 con 10 campos de cabecera,
**ignora `estatus`** y trae montos de billones. ⚠️ La doc (p. 73-74) dice que
`/apiingresomercancia/info` **SÍ trae `detalle[]`** y el código dice que no trae ninguna línea;
el único sondeo del repo lee `data.ingresomercancia` y **filtra explícitamente las llaves que
son arrays** — nunca miró `data.detalle`. **Está sin verificar.** Aunque exista, no reemplaza al
CSV: ese `detalle[]` no trae FOB, CIF ni costo promedio.

**Sin usar y relevante:** `GET /apiordenescompra/lista` con `estatus` Pendiente/Ingresada
(doc p. 68-69) — **mercancía comprada que todavía no llegó**, el dato que «Compré» no tiene hoy.

### 3. Las ventas
`switch_articulo_diario`, la llena el cron **`/api/cron/switch-articulos` a las 08:40 UTC**
(las 8 empresas, 3 días hacia atrás). **Llega hasta AYER, nunca hasta hoy.**

### Qué pasa si la fuente falla
- `sync-articulo-info` caído → la ficha pierde Stock, precio de etiqueta y nombre comercial; la descripción cae al `descripcion` del diario o al `articulo` del ingreso, y el **Stock queda `null`** (no 0). «Meses» y el `%` Vendido quedan sin denominador y no se muestran.
- `sync-ingresos-mercancia` caído → `comprasDisponibles: false` y el banner ámbar; **las ventas siguen siendo reales**.
- `switch-articulos` caído → el mes en curso queda corto. **No hay aviso propio de Referencia**: lo cubren las reglas generales (`silencio-de-datos.ts`).

## Las reglas que ya están fijadas

Ver también `CLAUDE.md § Ventas, Referencia y Comisiones` y
[`docs/postmortems/ventas-referencia.md`](../postmortems/ventas-referencia.md).

- 🔴 **VENDIDO = `Vendí ÷ (Vendí + Stock)`, nunca `Vendí ÷ Compré`.** Una sola definición
  (`parteVendidaReal` / `medirVendidoMeses`, `src/lib/ventas/resumen-articulo.ts`), la MISMA
  para la ficha, la tabla del modo pedido y el Excel. El denominador es lo que de verdad
  hubo: el sistema no lee los ajustes de inventario de Switch, así que `Vendí ÷ Compré`
  decía 100% con mercancía en bodega. Por construcción **no puede pasar de 100% ni decir
  100% con stock**.
- 🔴 **Los TRES GRANDES (Compré · Vendí · Quedan) son de la ÚLTIMA LLEGADA** cuando hay
  2 o más llegadas (`tresGrandes` + `medirTandas`); con una sola llegada son los históricos.
  El histórico completo queda visible aparte (`textoHistoricoTotal`).
- 🔴 **«Quedan» es SIEMPRE la existencia real de Switch, sin recortar** (`quedan: art.existencia`).
  El cuadre **no se fuerza**: la diferencia contra `llegaron − vendidas` sale como aviso de
  descuadre (`stockSinRespaldo`, `vendidoAntes`, `vendidoDeMas`), nunca corrigiendo el número.
- 🔴 **Nada de FIFO.** `cotejarVentasConCompras` recorre los días en orden y solo mide si
  una venta tenía respaldo de una llegada anterior — **no le atribuye una venta a una compra**.
  Una llegada se corta donde la bodega quedó en la cola: `umbralTandaCero = min(2, 10% de lo llegado)` (`TANDA_RUIDO_MAX = 2`).
- 🔴 **El FOB se CALCULA, no se toma de Switch** (`fobEstimado`, `CIF ÷ 1,10`,
  `PCT_IMPORTACION = 0.10`). `costosDeLinea` clasifica el origen en cuatro: `real` ·
  `igual-al-cif` · `estimado` · `sin-dato`, y el origen de un documento es **el PEOR de sus
  líneas** («si una sola no es creíble, el promedio tampoco»). En Fashion Shoes, donde viene
  una sola columna de costo (`costo_sin_desglosar`), esa columna **es el CIF**.
- **El margen se calcula contra el Costo CIF** (`margenSobreFob` usa el FOB estimado; el
  rótulo de pantalla dice CIF y el desplegable «De dónde salen estos números» lo explica).
- **La ventana de compras es de 3 años** (`ANIOS_HISTORIA = 3`); lo anterior se cuenta en
  `comprasFueraDeVentana` pero no se lista.
- **La búsqueda pegada se parte igual siempre y CADA código busca por PREFIJO** —venga solo
  o en lista de 50—: es lo que trae todos los colores del modelo (`40HM265` → `40HM265001`, `40HM265032`, …).
  Con un solo código va un `LIKE`; con varios, un `OR` de prefijos donde el comodín de
  PostgREST es `*`. Los valores van **sin escapar a propósito** porque `esCodigo()` solo deja
  pasar `[A-Z0-9-/.#]`.
- **Tope duro:** `MAX_FILAS_BUSQUEDA = 20.000` filas de ventas. Se cuenta ANTES de leer
  (`count: "exact", head: true`) y si se pasa, se responde 400 sin tocar la base.
- **«Se vendió en» se mide en DÍAS** (÷ 30,4375), hasta el 90% vendido — no en meses calendario.
- **Cero promedios.** Del rediseño del 11-ago-2026 (`9b1899e1`) se retiraron los promedios de
  3/6/12 meses, los veredictos SE AGOTÓ / DESCONTINUADO y la sugerencia de recompra. La
  pestaña «Varias · pegar lista» también murió ahí: **un solo buscador**.
- 🔴 **El botón «Actualizar datos de Switch»** (vuelto el 4-sep-2026) vive junto a «Bajar a Excel»,
  aparece cuando hay resultados y actualiza **la empresa (o las empresas) de lo que se buscó**, en
  SERIE — la sesión de Switch es una por usuario y dos logins simultáneos se tumban entre sí. Al
  terminar re-hace la búsqueda, así que la ficha muestra lo recién traído. **Sin aviso**: Daniel,
  *«referencia lo puede ver todos, y sin aviso»* — nada de «esto te saca del panel de Switch».
  El **acelerador** es el de Guías (`SYNC_NOW_COOLDOWN_MIN` = 10 min, contra `switch_sync_log`
  `sync_type = 'articulo_info'`) y vive en el SERVIDOR: si esa empresa ya se trajo hace menos de 10
  minutos se contesta `omitido: "fresca"` sin tocar Switch. El lock de `switch_sync_log` frena las
  corridas SIMULTÁNEAS; el acelerador frena las CONSECUTIVAS, que es el caso real.
- Candados conocidos: `src/__tests__/lib/articulo-info.test.ts` (entre otras cosas, exige que
  el archivo `src/app/api/ventas/referencia/actualizar/route.ts` **exista**) y
  `src/__tests__/lib/referencia-boton-actualizar.test.ts` (el botón está, lo tocan los tres roles,
  no hay aviso, el acelerador corta antes de Switch).

## Con qué conecta

### Qué LEE de otros módulos
| Qué | De dónde | Para qué |
|---|---|---|
| Ventas por artículo y día | `switch_articulo_diario` (cron `switch-articulos`, del módulo Ventas) | «Vendí», la serie mes a mes, el % Vendido |
| Llegadas de mercancía | `switch_ingresos_mercancia` (cron `sync-ingresos-mercancia`) | «Compré», el costo CIF/FOB, «Últ. compra» |
| Catálogo de Switch | `switch_articulo_info` (cron `sync-articulo-info`) | Stock, precio de etiqueta, nombre comercial |
| Las 6 empresas | `B2B_EMPRESA_KEYS` (`src/lib/empresa-mapping.ts`) | El filtro `.in("empresa_key", …)` — **derivado, nunca escrito a mano** |
| El rol | cookie `cxc_session` → `requireRole` | El gate de página y el gate del margen |

### Quién lee lo de Referencia
🔴 **Referencia no escribe NADA**, así que nadie lee «lo suyo». Lo que sí comparte es la
FUENTE, y ahí hay dos lectores que no son obvios:

1. **Vista General › Inventario valorizado** (`src/lib/inventario/leer.ts`, `valorizado.ts`,
   `src/app/vista-general/InventarioPorEmpresa.tsx`) lee la MISMA `switch_articulo_info` que
   llena el cron de Referencia, y de ahí sale **el activo más grande del grupo**. Sus
   `EMPRESAS_CON_INVENTARIO` se **derivan** de las empresas que cubre `sync-articulo-info`:
   sumar una empresa al cron de Referencia achica sola la lista de «sin inventario» de
   Vista General. La suma la hace Postgres (`inventario_valorizado_v1()`), con caída al
   camino paginado si la RPC no existe.
2. **Catálogos** (`sync-articulo-info` con `active_shoes`) es quien trae `rubro/subrubro/marca/ficha_at`,
   que alimentan la clasificación de Reebok. Es el mismo cron; el propósito es otro.

- **NO está en la búsqueda global** (sus 8 módulos son CXC, Reclamos, Guías, Directorio, Cheques, Ventas, Préstamos, Caja).
- **NO tiene badge** (`useBadges` no lo nombra).
- **NO manda ningún mensaje a Telegram.**

### Qué se rompería si cambiara la forma de sus datos
| Cambio | Qué se rompe |
|---|---|
| Renombrar / borrar `switch_articulo_info` | Referencia pierde Stock, precio y nombre **y** Vista General pierde el inventario valorizado entero (`inventario/leer.ts` propaga el error: la tarjeta dice «no se pudo medir», nunca $0) |
| Cambiar `switch_ingresos_mercancia.costo_sin_desglosar` o `fob_confiable` | `costosDeLinea` cae a `sin-dato`; Fashion Shoes pierde su CIF entero |
| Cambiar el `tipo` de `switch_articulo_diario` | `signoTipo` deja de restar las NC → «Vendí» sube al doble de las devoluciones |
| Sacar `referencia` de `role_permissions` | Vendedor y bodega pierden la ficha del menú (hoy la tienen por derecho propio, no por herencia) |
| Cambiar `B2B_EMPRESA_KEYS` | Entra o sale una empresa de Referencia **y** del inventario de Vista General, en el mismo movimiento |

## Por qué está así

| Cuándo | Decisión | Cita de Daniel |
|---|---|---|
| 12-ago-2026 | Referencia sale de `/ventas` y **tiene ruta propia**, abierta a vendedor y bodega | ***«habilita referencia para los vendedores y bodega»*** |
| 12-ago-2026 | **La pestaña de Ventas se retira el mismo día**: una sola puerta | ***«dejar solo la del menú y quitar la pestaña de Ventas»*** |
| 12-ago-2026 | **Vendedor y bodega NO ven el margen**; lo demás sí | ***«quita margen, lo demas dejalo»*** |
| 11-ago-2026 | 🔴 **El rediseño entero**: una tabla, una fila por compra, sin veredictos. Daniel rechazó **dos** diseños por complicados | ***«quiero la data clara y simple. cuando me llego, cuanto me lllego y en cuanto tiempo lo vendi, punto»*** |
| 11-ago-2026 | **Un solo buscador**: si pegas un código busca uno, si pegas veinte busca veinte | (del mismo rediseño; la pestaña «Varias · pegar lista» murió ahí) |
| — | Las compras salen de datos **reales** (`switch_ingresos_mercancia`, 35.519 líneas desde oct-2022), no adivinadas desde las ventas | Antes, para `40HM265001` el tab decía «1.332 unidades en 1 tanda, 46 meses» — **no correspondía a ninguna compra que hubiera ocurrido** |
| 24-ago-2026 | El cron de ingresos cubre **solo las 6 del grupo** | ***«solo quiero las compañías de fashion group, las 6»*** |
| — | Boston y ACS **no sincronizan catálogo**: `switch_articulo_info` tiene 0 filas de esas dos, a propósito | decisión de Daniel, la misma del tab |
| — | 🔴 **«Quedan» es la existencia real de Switch, sin recortar**; el descuadre se avisa, no se corrige | — |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué |
|---|---|---|
| **«Se te acaba en ~46 meses»** (`rangoDuracionTandas`) | 11-ago-2026 | Medía cuánto duró **lo de antes**, no lo que hay. Con 89 unidades vendiendo ~32/mes se acaba en **2,8**, no en 46 |
| **Los veredictos SE AGOTÓ / DESCONTINUADO** y la sugerencia `sugerencia6m` («compra ~138») | 11-ago-2026 | El sistema opinaba sobre la recompra. Hoy solo muestra el dato |
| **Los promedios de 3 / 6 / 12 meses** | 11-ago-2026 | 🩸 Metían **el mes en curso** adentro: los «últimos 3 meses» de `40HM265001` daban **18,3 u/mes** contando 10 días de agosto contra **34,3** con meses completos — el DOBLE. **Ahora NO HAY NI UN PROMEDIO: por construcción el defecto no puede volver** |
| **La pestaña «Varias · pegar lista»** | 11-ago-2026 | Un solo buscador |
| **La pestaña `/ventas?tab=referencia`** | 12-ago-2026 | Una sola puerta. La dirección vieja **redirige (307)**, acotada con `has`; `/ventas` a secas **no** se redirige |
| **`VENDIDO = Vendí ÷ Compré`** | — | Decía **100% con mercancía en bodega**: lo registrado como compra no es lo que hubo (el sistema no lee los ajustes de inventario de Switch). Hoy el denominador es `Vendí + Stock` |
| ~~**El botón «Actualizar datos de Switch»**~~ | 11-ago-2026 (`9b1899e1`) → **VOLVIÓ el 4-sep-2026** | Se había ido con el rediseño, dentro de la «franja de catálogo» que ese PR retiró: fue **colateral, no una decisión**, y dejó la ruta viva y sin puerta durante 24 días. Daniel: *«activa el botón de Referencia»* |
| **Dos búsquedas distintas** (`.in()` exacto con varios códigos, prefijo con uno solo) | — | 🩸 Con la lista real de Daniel (48 tokens → 27 códigos) el sistema decía «no encontré» **en los 27**. Hoy es **UNA sola resolución**: cada código busca por prefijo, venga solo o en lista de 50 |
| **El FOB de Switch** | — | Llega **igual al CIF en el 93% de las líneas** (error de carga en Switch). El FOB del sistema se **calcula** (`CIF ÷ 1,10`) y se rotula «FOB» a secas |

## Cuánto se usa

**No hay medición directa de uso.** El módulo **no escribe ni una fila** y **no registra ni una
acción** en `activity_logs` (0 filas con «referencia», medido 4-sep-2026). Lo que sí se puede
medir es **la salud de sus tres fuentes**:

| Fuente | Corridas medidas | Éxito | Última |
|---|---:|---:|---|
| `sync-articulo-info` (`switch_sync_log`, `sync_type = articulo_info`) | **154** (10-ago → 4-sep-2026) | **154 / 154** | 4-sep 04:52 UTC · 207 filas insertadas |
| `switch-articulos` (llena `switch_articulo_diario`) | — | — | la tabla tiene **203.854 filas** |
| `sync-ingresos-mercancia` | — | — | la tabla tiene **35.519 filas** |

**153 de las 154 corridas fueron por cron y 1 manual.** Cero errores en un mes.

**Lo que sí dice el dato:** el catálogo de Switch está **completo en las 6 empresas**
(`articulo_id`, `descripcion`, `existencia`, `precio_etiqueta`, `costo_api`, `synced_at`
llenos al 100% en las 16.633 filas), así que **cualquier búsqueda de Referencia tiene stock y
precio de etiqueta que mostrar**. Las clasificaciones (`rubro`/`subrubro`/`marca`) que
Referencia **no** usa son las que están vacías en 5 de las 6 empresas.

⚠️ **Ocho personas tienen la puerta** (2 admin, 3 vendedores, 1 bodega, contando usuarios
distintos: daniel, alberto, rey, edwin, rodrigo, Bodega). **Cuántas la abren, no es medible.**

## Qué papeles y Excel produce

**Un solo archivo**, y ningún PDF ni correo.

| Qué sale | Nombre | Contenido | Quién lo recibe | Desde qué botón |
|---|---|---|---|---|
| **Excel de referencia** | `referencia-<fecha>.xlsx` (nombre estándar de la casa, `exportFilename`) | **Dos hojas.** Hoja 1 — la ficha por referencia, **exactamente 13 columnas**: `Referencia · Descripción · Compré · Vendí · Stock · Vendido · Meses · …` (con **Margen** solo si eres admin). Hoja 2 — el detalle de compras: una fila por compra, con fecha, documento, proveedor, unidades, CIF, FOB y su procedencia (`textoOrigenFob`) | Quien lo baja (uso interno, para decidir la recompra) | **«Bajar a Excel»**, visible solo cuando hay resultados |

Notas del Excel, fijadas por candado:
- 🔴 **Sin margen la columna NO baja y las otras 12 NO se corren.**
- 🔴 **Ninguna hoja atribuye ventas a una compra** — no hay FIFO ni siquiera en el papel.
- La nota del encabezado dice: *«Vendido · Meses son de la ÚLTIMA llegada. Stock es siempre la existencia total.»*
- **Empieza en la fila 1**, con filtro desde A1 (regla de la casa, `excel-encabezados-fila-1.test.ts`).
- El Excel baja **la lista en el orden en que se pegó**, aunque la tabla en pantalla esté ordenada por otra columna.

## Cómo probarlo a mano

**Escrito para alguien que no programa.**

### A · Que un código traiga sus colores
1. Entra a **Referencia** y pega un código de modelo sin el color (por ejemplo `40HM265`).
2. 👉 Tienen que salir **todas** sus variantes de color, bajo un título **«Modelo 40HM265 · N colores»**. *Si sale una sola, la búsqueda por prefijo se rompió.*
3. Repite con el código completo (`40HM265001`): sale una sola ficha, y **los números tienen que ser idénticos** a los de esa misma fila en el paso 2.

### B · Que la tabla para pedir salga en tu orden
1. Pega **cinco códigos** separados por comas, en un orden cualquiera.
2. 👉 Sale una **tabla**, y las filas van **en el orden en que los pegaste**, no alfabético.
3. Toca el encabezado **«Vendí»**: se ordena. Tócalo otra vez: se invierte. Tócalo una tercera vez: 👉 **vuelve al orden en que los pegaste**. *Sin ese tercer paso, un toque sin querer deja la lista revuelta para siempre.*
4. Toca **«Bajar a Excel»**: la hoja tiene que traer **la misma lista en el orden pegado**.

### C · Que los números cuadren entre la tabla y la ficha
1. En la tabla, mira la fila de un código: **Compré · Vendí · Stock · Vendido**.
2. Toca la fila para abrir el detalle.
3. 👉 **Compré y Vendí tienen que decir lo mismo** que la tabla, y son los de la **ÚLTIMA llegada** (con dos o más llegadas). **Stock es la existencia real de Switch**, sin recortar.
4. 👉 **«Vendido» nunca puede decir 100% si Stock es mayor que cero.** Por construcción no puede: el denominador es `Vendí + Stock`.

### D · Que el margen se recorte por rol
1. Entra como admin: la tabla tiene columna **Margen** y la ficha muestra **Costo CIF** y el margen.
2. Entra como **vendedor** o **bodega** (o pídele a Rey que abra la suya): 👉 **la columna Margen no está, y el margen del detalle tampoco.** Todo lo demás (Compré, Vendí, Stock, Meses, Últ. compra) **sí se ve**.
3. Entra como **secretaria** o **contabilidad**: 👉 `/referencia` te devuelve al inicio.

### E · Que el dato esté fresco
1. Busca un artículo que sepas que llegó ayer.
2. 👉 Si el banner ámbar dice *«Todavía no están cargados los ingresos de mercancía…»*, el cron de las 09:05 UTC no corrió.
3. 👉 Si el **Stock** sale vacío en todos los artículos, el cron de `sync-articulo-info` (04:30–04:50 UTC) no corrió.
   Dónde confirmar: la misma existencia se ve en **Vista General › Inventario valorizado** — si esa tarjeta dice «no se pudo medir», es la misma causa.

## Qué lo rompe

| Qué falla | Qué pasa | **Cómo se nota** |
|---|---|---|
| **Switch cambia el formato del reporte de ingresos de mercancía** | Es un **CSV con `;` bajado del panel web**, y las columnas se leen **por NOMBRE, nunca por posición**. Si cambia un encabezado, el parser **corta** en vez de leer mal | El cron falla y la tabla no crece. La pantalla dice *«Todavía no están cargados los ingresos…»* con las ventas intactas. 🩸 Es el mismo tipo de cambio que rompió la cartera de Boston el 19-ago y los egresos el 1-sep |
| **`fashion_shoes` cambia sus 12 columnas** | Esa empresa manda **una sola columna `COSTO`** y el sistema **no adivina** si es FOB o CIF: va a `costo_sin_desglosar`. Si Switch la renombra, Fashion Shoes se queda sin costo | El FOB de esa empresa pasa a `sin-dato` y el margen desaparece |
| **El cuadre detalle-vs-resumen no da** | 🔴 **No se escribe nada.** El sync baja los DOS CSV (detalle y resumen) y solo escribe si cuadran documento por documento | El cron se anota `error` |
| **El reporte web llega vacío o con menos del 70% de lo guardado** | Se trata como error, no como «no hubo compras» | Igual |
| **Un cron de la misma empresa se pisa** | 🔴 Switch admite **un solo token por USUARIO** y el sistema entra como `daniel`. Los tres pases de `sync-articulo-info` van en **grupos disjuntos de 2 empresas**, a **≥ 50 min** de cualquier otra entrada que comparta empresa, y corren **en SERIE** dentro del grupo | `Error de red en /autenticacion` o «sin token» en `switch_sync_log` |
| **Un cron entra al panel web mientras Daniel está adentro** | ⚠️ El login del panel manda `changesession: "SI"`, que **EXPULSA a Daniel** del panel de esa empresa. `sync-ingresos-mercancia` va a las 09:05 UTC = **4:05 a. m. de Panamá**, justamente por eso | Daniel se cae del panel |
| **Switch manda una existencia absurda** | Ya pasó: **4,46 billones el 27-jul-2026**. El guard `EXISTENCIA_MAX = 500.000` guarda la fila con `existencia: NULL` | El Stock del artículo sale vacío, no en un número imposible |
| **Switch manda un costo absurdo** | El guard rechaza costo total > **$500.000** o unitario > **$5.000** (la fila del incidente Boston 0806, **$2.365 millones**) | La fila se descarta y queda en `switch_sync_log.skip_details` |
| **`sync-articulo-info` no corre** | La ficha pierde Stock, precio de etiqueta y nombre comercial; **`Meses` y `Vendido` se quedan sin denominador** y no se muestran | 🔴 **Y Vista General pierde el inventario valorizado entero** — la tarjeta dice «no se pudo medir», nunca $0 |
| **`switch-articulos` no corre** | El mes en curso queda corto | No hay aviso propio; lo cubre `silencio-de-datos.ts` |
| **Una lectura sin paginar** | 🩸 `db-max-rows = 1000` corta **en silencio**. Las tres lecturas de Referencia usan `leerTodoPaginado` con orden TOTAL (`fecha, empresa_key, n_interno, linea` en ingresos) — «paginar con filas empatadas puede repetir o saltear» | Si se rompiera: un artículo con muchas compras mostraría menos de las que tiene, sin ningún error |
| **La tabla `switch_articulo_info` no existe** | La respuesta trae `infoDisponible: false` | La sonda de «tabla no existe» va con **GET, nunca HEAD** (un HEAD no distingue los casos) |

## Lo que sobra o no cuadra

1. ✅ **CERRADO el 4-sep-2026 — `POST /api/ventas/referencia/actualizar` ya no es un endpoint
   huérfano.** El botón «Actualizar datos de Switch» que lo llamaba se había eliminado el
   11-ago-2026 (`9b1899e1`, se ve el `-` del `fetch(...)` en el diff de `ReferenciaView.tsx`) y la
   ruta quedó viva y sin llamadores durante 24 días, con `requireRole(["admin"])` — o sea que
   además le habría contestado 403 al vendedor y a bodega, que sí ven la pantalla.
   Ahora el botón está de vuelta, la lista de roles es **una sola** (`REFERENCIA_ROLES`) y la ruta
   trae acelerador. Los comentarios que afirmaban que el botón existía **volvieron a ser ciertos**
   (`src/app/api/cron/sync-articulo-info/route.ts` · `src/lib/switch-api/sync-articulo-info.ts` ·
   `CLAUDE.md`); y `docs/switch-flujo.md` §13, que lo describía como del «tab Ventas ›
   Referencia» y «solo admin», quedó corregido en la misma tanda.
2. **La herencia `"referencia": "catalogos"` de `MODULO_HEREDA_PERMISO_DE` (`src/lib/modules.ts`)
   ya no hace falta.** Existía «mientras la DDL `20260812120000` no corra». Medido en
   producción el 4-sep-2026: `role_permissions.vendedor.modulos` y `role_permissions.bodega.modulos`
   **ya contienen `referencia`**. El propio comentario dice cuándo se retira («cuando la DDL
   esté corrida, verificable en `role_permissions`»). No hace daño —el recorte por `roles[]`
   la acota— pero está vencida.
3. **Un comentario en voseo.** `src/app/referencia/ReferenciaClient.tsx` dice
   *«la caja del buscador ya dice "Podés pegar hasta N códigos"»*. La pantalla real dice
   «puedes pegar» (correcto); el comentario quedó viejo. El candado `nada-de-voseo.test.ts`
   borra los comentarios antes de barrer, así que no lo caza.
4. **El módulo no registra ni una acción en `activity_logs`** (0 filas, medido 4-sep-2026).
   No se puede decir cuánto se usa. Contrasta con el Depurador, que sí instrumentó sus
   descargas.
5. **`switch_articulo_info.ficha_at` está lleno en UNA sola empresa** (1.200 de 1.763 de
   `active_shoes`; **0** en las otras cinco). Es a propósito —solo `active_shoes` pide fichas—,
   pero significa que `rubro`/`subrubro`/`marca` son columnas **vacías en 15.433 de las 16.633 filas**.
   Referencia no las lee; quien las lea sobre otra empresa va a ver nulos que no son un error.
---

# Depurador (`/productos/cargar`, key `cargar`)

> ⚠️ **Este módulo se rediseñó el 4-sep-2026** (commit `190f5450`, 29 archivos, +2.089/−320).
> Lo que sigue describe el **estado NUEVO**. La historia está en
> [`docs/postmortems/catalogos-pedidos.md`](../postmortems/catalogos-pedidos.md), en las tres
> secciones que empiezan con «🔴 Depurador —».

## Qué es

Convierte el **Excel que manda el proveedor** en la **plantilla de artículos que Switch
acepta**: 25 columnas, con el precio de venta ya calculado, la descripción normalizada, la
talla del código de barra elegida por regla y el rubro/subrubro derivados. El archivo que
sale se **sube a mano al panel de Switch**.

🔴 **Es el único módulo del sistema donde un número mal escrito termina DENTRO de Switch.**
Medido: **50-60 corridas por mes** desde junio de 2026.

Tres caminos de generación, todos con la MISMA plantilla de salida:
1. **CK / TH / KL** — el Excel de PVH para Vistana, Fashion Wear, Fashion Shoes y Active Wear.
2. **Reebok** — el formato «Book4» de Latin Fitness Group, para Active Shoes.
3. **Facturas Tienda** — el camino inverso: la factura que una empresa del grupo le hace a
   la tienda Multifashion, convertida a plantilla de artículos para el Switch de la tienda.

Y dos herramientas de apoyo que **no generan plantilla**: **Tallas por bulto** (el prepack de
Fashion Shoes) y **Fotos a mi Excel** (pegar fotos en el Excel que la persona ya tiene).

## Quién entra

`roles: ["admin", "secretaria"]` (`src/lib/modules.ts`). La página llama
`useAuth({ moduleKey: "cargar", allowedRoles: ["admin","secretaria"] })` y **todas** las rutas
API del módulo usan `requireAuth(req, ["admin","secretaria"])` — **con dos excepciones que son
SOLO admin**: `GET /descripciones?admin=1` y `PATCH /descripciones/[id]`.

**Bodega, vendedor, contabilidad, `gerente_acs` y `gerente_boston` no lo ven.**

Medido en `role_permissions` el 4-sep-2026: `cargar` está en `admin` y en `secretaria`. Y en
los overrides de las dos secretarias (`fg_users.modulos_override`), las dos lo tienen.

**Personas reales:** daniel y alberto (admin), **andrea y Angela** (secretaria). Quienes de
verdad lo usan son las dos secretarias — ver «Cuánto se usa».

Dentro del módulo, la única diferencia por rol es la vista **Configuración › Descripciones**
(`soloAdmin: true`): a la secretaria se le cae a **Fórmulas**, incluso escribiendo
`?vista=descripciones` a mano.

## Las pantallas

**3 pestañas** (`src/app/productos/cargar/pestanas.ts`, módulo puro). Dos parámetros en la
URL, `?tab=` y `?vista=`, los dos con `useUrlState` en modo **`replace`**: el Atrás del
navegador no cicla por pestañas.

| Pestaña (texto EXACTO) | `?tab=` | Vistas (texto EXACTO) | `?vista=` |
|---|---|---|---|
| **Plantilla** | `plantilla` *(default)* | **Nuevo** *(default)* · **Historial** | `nuevo` · `historial` |
| **Tallas y catálogo** | `tallas` | **Tallas por bulto** *(default)* · **Fotos a mi Excel** | `curvas` · `misfotos` |
| **Configuración** | `config` | **Fórmulas** *(default)* · **Descripciones** 🔐 solo admin · **Reglas** | `formulas` · `descripciones` · `reglas` |

Hasta 1024 px (`lg`) las pestañas son un **desplegable** (`SelectorPestanas` →
`DesplegableFlotante`, dibujado en `<body>`); desde ahí, una fila de píldoras. Las **vistas**
son píldoras en todos los anchos. Un desplegable cerrado **no existe en el DOM**.

**Los 7 `?tab=` viejos redirigen** (`TAB_VIEJO_A_NUEVO`): `depurador` y `facturas` →
plantilla/nuevo · `historial` → plantilla/historial · `curvas` → tallas/curvas · `misfotos` →
tallas/misfotos · `formulas` → config/formulas · `reglas` → config/reglas. Un `?tab=`
desconocido cae en Plantilla › Nuevo, **nunca en blanco**.

Los caminos con archivo cargado quedan **montados y solo ocultos** al cambiar de pestaña: el
Excel y las ediciones sobreviven.

### Plantilla › Nuevo — la dropzone única

**Ya no se elige el camino.** Una sola caja: *«Suelta el archivo aquí o haz clic para buscar»*
(acepta `.xlsx, .xls, .csv`), y mientras olfatea dice *«Leyendo archivo…»*.

**Cómo reconoce el formato** (`DepuradorDispatcher.detect`):
1. Nombre que termina en `.csv` → **Facturas Tienda** (no se abre el archivo).
2. Si no, se lee con `xlsx-js-style` y se recorre **cada hoja**:
   - **Reebok** si una de las primeras 20 filas tiene `NEW ARTICLE` + `SKU` + `WHOLESALEPRICE`.
   - **Facturas Tienda** si una de las primeras 10 tiene `CODIGO ARTICULO` + `NOMBRE ARTICULO` + `PROVEEDOR` (formato B), o `CODIGO` + `CODIGO BARRA` + `PROVEEDOR` + `DESCRIPCION` (formato A).
3. Todo lo demás → **CK/TH/KL**.
4. Si el archivo no se puede leer → **CK/TH/KL**, «que muestre su propio error».

Cuando cae en Reebok o Tienda sale un chip: `REEBOK` «Detecté el formato Reebok · Active
Shoes» / `MULTIFASHION` «Detecté una factura de tienda».

#### 🔴 La compañía se reconoce, no se elige

Daniel: *«¿para qué elegir la compañía si la puede detectar?»* — **el selector «Empresa» se quitó.**

`empresasReconocidas` (`src/lib/depurador/logic.ts`) deriva la compañía de **las marcas del
archivo** vía `empresaDeMarcaCatalogo`:

| Marca del archivo | Compañía |
|---|---|
| prefijo `KL` | Active Wear |
| prefijo `CK` | Vistana International |
| exactamente `TH FOOTWEAR` | Fashion Shoes |
| resto de `TH` | Fashion Wear |

- **1 compañía** → sale UNA línea: **«Vistana International · CK Footwear»**, con el nombre del archivo debajo y un **«cambiar»** discreto.
- **0** → plan B: se lee la columna `NOMBRE_DESTINATARIO_MERCANCIAS` de la primera fila con destino. Si tampoco calza, la línea dice **«Elige la compañía»** en ámbar.
- **2 o más** → 🔴 **no se adivina**: *«El archivo trae marcas de N compañías (X y Y). Toca «cambiar» y elige una.»* Daniel dijo **«No»** a archivos de dos compañías.

**«cambiar»** abre un desplegable con las **6 compañías** de `COMPANIAS_DEPURADOR`: Vistana
International · Fashion Wear · Fashion Shoes · Active Wear · **Active Shoes** · **Multifashion**.
`const empresa = empresaManual || empresaAuto` — **la elección a mano GANA**, y se limpia
**solo al cargar OTRO archivo**. 🔴 **La compañía ya no se recuerda** entre corridas: la del
archivo manda.

Lo que alimenta la compañía elegida: (1) el **`Proveedor *`** del Excel
(`proveedorParaEmpresa`: `vistana` → `"American Designer Fashion"`, `fashion_wear` y
`fashion_shoes` → `"American Fashion Wear, SA"`, **cualquier otra → se deja el proveedor del
archivo**); (2) la columna **Compañía** del Historial; (3) la etiqueta al guardar una fórmula
de marca nueva.

#### La configuración — «▸ Editar temporada y costos»

| Campo (texto EXACTO) | Qué es | Se recuerda |
|---|---|---|
| **«Temporada»** | `<input type="month">`. Arma la columna «Temporada» del Excel (`AAAA-MM`) y **entra a Switch**. La nota al lado dice el valor real: *«Septiembre 2026 → 2026-09»*. 🔴 **Arranca SIEMPRE en el mes actual de PANAMÁ** (`hoyPanama`, UTC−5, no el reloj del navegador). Reprocesa al momento | 🔴 **NO** — recordarla haría que el 1 de septiembre siguiera diciendo agosto |
| **«Tasa de impuesto»** | `<select>` de **dos opciones y nada más**: `7%` (valor `07`) y `Exento (0%)` (valor `0`). Daniel: *«solo existen esas dos»*. Reprocesa al momento | sí (`fg_last_depurador_tasa`) |
| **«Factor costo CIF»** | *«Costo FOB × este factor = CIF.»* Default `1.1`. Reprocesa **con 300 ms de espera o al salir del campo**, no en cada tecla | sí (`fg_last_depurador_factor`) |

Antes esto se llamaba **«Mes» y «Año»** y el rótulo engañaba: no era la fecha de la corrida.

#### Los avisos

Ninguno bloquea salvo el 🔒:
- *«N aviso(s) de datos faltantes (puedes corregirlos en el Excel antes de subir)»* — hasta 8, sin código de barra / sin costo / sin precio.
- *«N estilo(s) en ámbar: la regla no encontró la talla esperada y usó la más chica.»*
- *«El archivo trae marcas de N compañías (X y Y). Toca «cambiar» y elige una.»*
- **«Marca desconocida: «X» — N productos van a salir sin precio»**, una línea por marca con la marca **CRUDA** del proveedor, ordenadas por cuántos productos tocan. 🔴 **No bloquea y no corrige.** Daniel, textual: ***«Como está»***.
- *«N descripción(es) nueva(s) pasaron solas · las dos mitades ya existen»*.
- *«N artículos sin cantidad en el archivo no se incluyeron. Los servicios (ajustes, retenciones) sí se incluyen aunque vayan en 0.»*
- *«N precios escritos a mano se conservaron.»* + **«Borrarlos todos»**.
- 🔒 **BLOQUEANTE:** banda roja *«🔒 Bloqueado: hay N descripción(es) nueva(s) sin aprobar.»* con **«Ver y aprobar»**. Se aprueban ahí mismo y la alarma se re-evalúa **en vivo**, sin recargar.

#### «¿Cómo calcular los precios?»

Dos modos (el elegido se recuerda):
- **«Una fórmula para todo»** — **Divisor** (atajos `0.70 · 0.73 · 0.75 · 0.63`), **Extra $** (0 a 5), **Redondeo** (`Entero hacia arriba` / `A .50 hacia arriba`) y **«Aplicar a todo»**. La línea de abajo dice la fórmula en palabras: `precio = TECHO(Costo CIF ÷ 0.73) + 2 · redondeo al entero hacia arriba`.
- **«Fórmula guardada por marca»** *(default)* — tabla `Marca en este Excel · Estado (Guardada/Sin guardar) · Divisor · Extra $ · Redondeo · [Guardar fórmula]`.

🔴 **El divisor se valida en la PANTALLA**, con el MISMO guard de las rutas API
(`mensajeDivisorEnPantalla` → `validarDivisor`, `src/lib/depurador/divisor.ts`, cero copias).
Fuera de `[0.10, 1.00]`: campo rojo, `aria-invalid`, y el mensaje
**«Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?»** (la sugerencia es el valor ÷ 100, y
solo aparece si cae en rango). **Se apaga la DESCARGA y el «Guardar» de esa fila — nunca el
tecleo**: se puede borrar y corregir sin pelear con el campo. Cada modo bloquea **solo con SUS
divisores**.

#### La vista previa — talla y precio editables

Filtro **«Todas las descripciones»**, contador `N de M filas`, y las columnas
`☑ · Talla · Código · Código Barra · Descripción · Cálculo · C. FOB · C. CIF · Precio · Stock · Marca`.
- La celda **Cálculo** dice `÷0.73+2 · 31%` — el margen **REAL post-redondeo**, o `fijo · 31%`, o `· 31%` si el precio se escribió a mano.
- **Talla**: desplegable con las tallas del estilo; cambiarla reescribe el `Código Barra *` al EAN de esa talla. Ámbar si difiere de la automática.
- **Precio**: editable. 🔴 **Los precios a mano se guardan por REFERENCIA del artículo** (`cols["Código *"]`), **nunca por índice de fila**: sobreviven al re-proceso y siguen al artículo aunque las filas se muevan. Daniel, preguntado por «¿y si cambias de empresa o de mes?»: ***«y también consérvalos»***.
- **Selección masiva**: barra teal `N seleccionada(s)` + campo `Precio` + **«Poner precio a seleccionadas»** + **«Limpiar»**.

#### Descargar

Botón **«Descargar plantilla»** (dice **«Generando…»**). Se apaga si hay descripciones nuevas
sin aprobar, si no hay catálogo, o si algún divisor está fuera de rango. Al lado, **«Otro archivo»**.

### Plantilla › Historial

Filtro **«Compañía»**: `Todas` + las 6. Leyenda: *«El Excel se puede volver a bajar por 90
días.»* Columnas: **Fecha · Quién · Compañía · Marca · Estilos · Unidades · (Descargar)**.
Hasta `lg`, tarjetas; desde `lg`, tabla. Las filas sin archivo van en gris y **sin botón**.
🔴 **Todos ven y bajan todo** — Daniel: ***«todos»*** (Angela baja lo que corrió Andrea).

### Tallas y catálogo › Tallas por bulto
`CurvasView`. Del Excel crudo de Fashion Shoes (con `CODIGO_PREPACK`) calcula cuántas piezas
de cada talla van en cada bulto: `bultos = total ÷ CANTIDAD_ORD_X_PP`, `porBulto = cantidad de
la talla ÷ bultos`. Si la suma no cuadra queda **en ámbar, sin bloquear**. Botones
**«Descargar Excel (N)»** · **«Seleccionar todas» / «Quitar selección»**. Columnas de salida:
`Referencia · Talla · Código de barra · Cantidad`.

### Tallas y catálogo › Fotos a mi Excel
`MiExcelFotosClient`. 🔴 **No calcula nada y no reemplaza al pedido de Reebok.** Toma el
`.xlsx`/`.xlsm` **que la persona ya tiene** y le escribe **SOLO la columna A** (las fotos).
Todo lo demás —hojas, valores, orden, formatos, anchos, altos, filtros y **el macro
`vbaProject.bin`**— viaja intacto: no se pasa por SheetJS (leer y reescribir produciría un
archivo NUEVO y perdería el macro), se abre el ZIP que ES el xlsx y se tocan tres partes.
Convenciones fijas: **columna A = foto, columna B = código, fila 1 = encabezado**.
Botones: **«Elegir carpeta de fotos»** / **«Cambiar carpeta»** / **«Cambiar archivo»** /
**«Descargar con las fotos pegadas»**.
🔴 **Ni el Excel ni las fotos salen del navegador**: cero `fetch` en todo el camino, y hay
candado que lo exige.

### Configuración › Fórmulas
Sub-selector **local** (no va a la URL): **«Depurador (importación)»** / **«Tienda
(facturas)»**. En el primero además se monta `BulkExcel`, la carga masiva de fórmulas por Excel.

### Configuración › Descripciones 🔐 solo admin
`CatalogoDescripcionesAdmin`. La tabla `depurador_descripciones` completa con toggle
**Activa/Inactiva** — desactivar **no borra**.

### Configuración › Reglas
`ReglasView`, **solo lectura**: los principios de limpieza, la regla de talla del EAN, la regla
de Reebok, el mapa de normalización y el catálogo de marcas.

### La tarea más frecuente, en pasos
1. Entrar → aterriza en **Plantilla › Nuevo**.
2. **Soltar el Excel del proveedor.**
3. Verificar la línea de compañía (**«Vistana International · CK Footwear»**); si está mal, **«cambiar»**.
4. Abrir **«▸ Editar temporada y costos»** solo si la temporada no es el mes en curso.
5. Aprobar las descripciones nuevas si aparece la banda roja.
6. **«Descargar plantilla»** → baja `PLANT_<MARCA>_<TEMPORADA>.xlsx`.
7. Subirlo a mano al panel de Switch.

**Cuatro toques** en el caso limpio. El paso 7 es fuera del sistema.

## Los datos

| Tabla / bucket | Grano | Filas (4-sep-2026) | Columnas |
|---|---|---:|---|
| **`carga_history`** | 1 fila por descarga de plantilla Switch | **140** | `id uuid` · `usuario text` · `empresa text` · `marca text` · `cantidad_estilos int` · `total_unidades int` · `total_costo numeric` · `created_at timestamptz` · **`archivo_path text` (nueva, NULL)** · **`archivo_nombre text` (nueva, NULL)** |
| **bucket `depurador-plantillas`** | 1 objeto por descarga, ruta `<id de la fila>/<nombre saneado>` | **0** | Privado (`public = false`), creado 5-sep-2026 01:41 UTC. Sin policies para anon/authenticated: 100% service role |
| **`marca_formulas`** | 1 por marca (case-insensitive) | **22** | `id · marca · empresa · divisor numeric · extra int · redondeo text · updated_at · updated_by` |
| **`marca_rubro_formulas`** | 1 por marca + rubro/descripción | **18** | igual + `rubro text · precio_fijo numeric` |
| **`tienda_marca_formulas`** | espejo de `marca_formulas` para Facturas Tienda | 🔴 **0** | igual |
| **`tienda_rubro_formulas`** | espejo de `marca_rubro_formulas` | 🔴 **0** | igual |
| **`depurador_descripciones`** | 1 por (marca, descripción) | **281** | `id · marca · descripcion · activa bool · origen text ('seed' / 'aprobada') · aprobada_por · aprobada_at · created_at` |
| `activity_logs` | 1 por acción | — | escribe `user_role · action · entity_type · details`. Acciones **nuevas**: `descarga_tallas` y `descarga_misfotos`, con `entity_type = "depurador"` |

**Soft delete: ninguna tabla del módulo lo usa.** `depurador_descripciones` desactiva con
`activa = false` (no borra) y `carga_history` **nunca borra la fila** — solo pierde el archivo.
`marca_formulas` y `marca_rubro_formulas` sí borran de verdad (`DELETE`).

Todas con RLS `to service_role`; las rutas fallan **ruidosamente con 503** si falta
`SUPABASE_SERVICE_ROLE_KEY`, en vez de leer vacío en silencio.

🔴 **Columnas que hoy nadie lee:**
- **`carga_history.total_costo`** — se calcula (Σ CIF × unidades), se guarda y la ruta la devuelve, pero `HistorialView` **no la pinta** ni en tabla ni en tarjeta.
- **`archivo_path` y `archivo_nombre` están en 0 de 140 filas**: la funcionalidad es de hoy, ninguna corrida posterior a la migración ha ocurrido todavía.

**Unicidad de `depurador_descripciones`**: índice sobre `lower(marca), lower(descripcion)`. El
`POST /aprobar` es **idempotente** (código `23505` → `{ok:true, yaExistia:true}`), la marca se
valida contra `MARCA_CATALOGO` y se guarda en su forma canónica, y la descripción pasa por
`normalizarEspacios()` (NFKC + colapsar whitespace + trim, **conservando la caja**), reforzado
con un CHECK en la base.

**Las rutas API (10):**

| Ruta | Métodos | Rol |
|---|---|---|
| `/api/productos/cargar/descripciones` | GET | admin + secretaria — **`?admin=1` SOLO admin** |
| `/api/productos/cargar/descripciones/aprobar` | POST | admin + secretaria |
| `/api/productos/cargar/descripciones/[id]` | PATCH | 🔐 **SOLO admin** |
| `/api/productos/cargar/formulas` | GET, PUT | admin + secretaria |
| `/api/productos/cargar/rubro-formulas` | GET, PUT, DELETE | admin + secretaria |
| `/api/productos/cargar/tienda-formulas` | GET, PUT | admin + secretaria |
| `/api/productos/cargar/tienda-rubro-formulas` | GET, PUT, DELETE | admin + secretaria |
| `/api/productos/cargar/historial` | GET, POST | admin + secretaria |
| `/api/productos/cargar/historial/archivo?id=` | GET | admin + secretaria |
| `/api/cron/cleanup-depurador-archivos` | GET | `CRON_SECRET` |

Las **cuatro** rutas de fórmulas validan con `validarDivisor` y exigen `extra` entero 0-5 y
`redondeo ∈ {int, half, par}`. `precio_fijo` **solo se toca si el cuerpo lo trae**, para que
`BulkExcel` —que no lo manda— no lo borre.

## De dónde vienen los datos

🔴 **El Depurador NO habla con Switch por API.** Es el único módulo de este documento donde el
dato viaja **de nosotros hacia Switch**, y el traslado lo hace una persona:

```
Excel del proveedor  →  [Depurador]  →  PLANT_<MARCA>_<AAAA-MM>.xlsx  →  panel web de Switch
      (correo)          (navegador)         (disco de la persona)         (subida a MANO)
```

- **La entrada** es un archivo que la persona suelta en el navegador. No hay cron, ni endpoint,
  ni carpeta compartida.
- **La salida** se sube a mano en Switch: **Stock › Artículos › Importar/Editar**, la misma
  pantalla que ofrece **«Descargar plantilla modelo»**. La plantilla real de Switch vive en
  `/plantillas/productosplantillaimportarpafob.xlsx` y una copia está en el repo:
  `src/__tests__/fixtures/plantilla-switch-articulos.xlsx`. Bajada de **las 8 empresas** el
  3-sep-2026, las 8 dieron el mismo **MD5 `b622f171713642a0393b3c95c7f30de7`, 10.305 bytes**.
- **Lo único que corre solo** es el cron de limpieza: `/api/cron/cleanup-depurador-archivos`,
  **03:20 UTC** diario, solo base de datos y Storage — **no toca Switch**, así que no expulsa a
  nadie del panel.

**Si la fuente falla:**
- Un Excel de proveedor con un formato nuevo → el dispatcher lo manda a CK/TH/KL y ese camino muestra su propio error. ⚠️ Ver la trampa de «Otro archivo» en «Lo que sobra».
- El catálogo de descripciones no carga → **no se procesa ni se descarga**, con caja roja y **«Reintentar»**. No hay respaldo en el código: sin catálogo, no hay plantilla.
- El cron de limpieza no corre → los archivos viejos se quedan en el bucket. No se pierde nada; solo crece el Storage.
- Switch cambia su plantilla → el candado `depurador-plantilla-switch.test.ts` **no se entera solo**: compara contra el fixture del repo. Hay que **bajar la plantilla nueva y cambiar el fixture a propósito**. Ver «Qué lo rompe».

## Las reglas que ya están fijadas

Regla vigente en `CLAUDE.md § Catálogos, pedidos y cotización` (los cuatro puntos del Depurador).

### La plantilla
- 🔴 **UNA sola plantilla, 25 columnas** (`OUT_COLS`, `src/lib/depurador/logic.ts`), la misma para las 4 empresas destino, para Facturas Tienda y para Reebok:
  `Código * · Referencia * · Código Barra * · Descripción * · Precio * · Tasa de Impuesto * · Costo FOB * · Costo CIF * · rubro * · subrubro · Marca * · Proveedor * · Mínimo Stock · Código Tipo de Artículo * · Unidad de medida * · Origen · Lote · Serie · Stock Ideal · Temporada · Composición · Codigo CPBS · Codigo CPBS Abrev · Bonificación · Cantidad por caja`
  **13 obligatorias** (con `*`), **`Costo FOB *` y `Costo CIF *` entre ellas**. `"Costo *"` no existe.
  Candado: `depurador-plantilla-switch.test.ts` compara **posición por posición** contra el fixture real y dice qué columna se movió.
- 🔴 **Los TRES generadores escriben esa misma fila**, y cada fila de datos tiene **25 celdas**.
- **`TEXT_COLS = [0, 1, 2]`** es posicional (Código, Referencia, Código Barra van forzadas a texto, `t:"s"`, `z:"@"`) y no se movió aunque «Composición» haya vuelto a la columna 21.
- **«Composición» SIEMPRE vacía** en los tres. Daniel: *«vuelve vacía, no la quiero»*.
- 💰 **«Tasa de Impuesto *» = `07` como TEXTO** (`tasaSwitch`), **nunca el número 7 ni el texto `"7"`**: ahí el cero se pierde. Vacío → `""`; no numérico → tal cual (no se inventa); `0` → `"0"`; el resto → entero con `padStart(2,"0")`. El candado **abre el .xlsx descargado** y exige `celda.t === "s"`. Guía `Flujo_articulo_orden_de_compra_switchsoft2026.pdf`, p. 3. Daniel: *«pon el 0 adelante pues»*.
- 🔴 **Ya no existe «plantilla por empresa»**: `OUT_COLS_DEFAULT`, `OUT_COLS_SHOES` y `outColsForEmpresa` se retiraron, y hay barrido que pone el build rojo si algún archivo del módulo vuelve a escribir una columna `"Costo *"`.

### Lo que cambia por empresa es el CONTENIDO
| Camino / empresa | `Costo FOB *` | `Costo CIF *` |
|---|---|---|
| CK/TH/KL — Vistana · Fashion Wear · **Fashion Shoes** · Active Wear | el COSTO del archivo | **FOB × factor (1,10)** |
| Reebok — Active Shoes | `fobReebok(department, wholesale, wholesaleOff)`: footwear `WP × 0.8`, apparel `WP × 0.7` | **FOB × 1.1** (fijo, no usa el campo «factor») |
| Facturas Tienda — Multifashion | el PRECIO de la factura | 🔴 **= FOB, el mismo número**. Daniel: *«mismo número»* |

⛔ En **Fashion Shoes el CIF NO es el FOB**: hay flete adentro. Hay test explícito.
Detalle CK/TH: si `FOB` viene 0 o nulo y `CIF > 0`, se copia CIF a FOB.

### El precio
- 💰 **Jerarquía**: `precio_fijo` GANA (ni siquiera necesita CIF) > fórmula propia de la descripción > fórmula de la marca. Un `precio_fijo` de 0 o negativo **no aplica**.
- 💰 **El divisor vale 0 (sin fórmula) ó 0.10–1.00** (`validarDivisor`): es la **fracción del precio que representa el costo**, no un porcentaje.
- 🔴 **Se valida en los TRES caminos** desde el 4-sep-2026. Hasta ese día solo el Depurador CK/TH validaba: un `70` en Reebok o en Facturas Tienda producía un Excel con los costos **100× mal**, que iba derecho a Switch. Candado: `depurador-divisor-tres-caminos.test.tsx`.
- 🔴 **Los precios escritos a mano se conservan al re-procesar, pegados por REFERENCIA de artículo, nunca por índice de fila.** Con edits por índice, el precio de un artículo caería en el **artículo equivocado** cuando otro archivo lo corre de fila. Borrarlos es un botón, nunca automático.

### El resto
- **Marca desconocida: se REPORTA con su conteo, cruda y ordenada — y NO frena la carga.** La fila sale con `Otros`. Daniel: *«Como está»*.
- 💰 **Los artículos sin cantidad quedan fuera del Excel, pero los SERVICIOS sobreviven** (tipo `02`, Stock Ideal 0, costos 0): el criterio es la CANTIDAD del proveedor, no la celda. Se cuenta la **SUMA** del estilo. **Sin columna CANTIDAD no se filtra nada.** Si todo queda afuera, **corta con mensaje** en vez de entregar un Excel vacío.
- **`MARCA_CATALOGO` = 33 marcas** (9 KL, 12 CK, 12 TH), cada una con su empresa destino.
- **`MARCA_FIXES` es un mapa CONGELADO de 9 correcciones** medidas contra `switch_factura_lineas`. `"TH"` a secas queda **fuera** a propósito: sus 2 artículos van a marcas distintas y una corrección es una sola salida por entrada. Reebok y Joybees no pasan por el mapa.
- 🔴 **La lista de valores esperados de Reebok (`REEBOK_CATEGORY_ESPERADAS`) es ESPEJO del mapa del catálogo** (`src/lib/reebok-clasificacion.ts`) y hay candado que compara los dos: agregar un valor en uno sin el otro pone el build ROJO. `HEADWEAR` entró por ahí el 2-sep-2026 — sin él el Depurador gritaba «valor inesperado» sobre 7 gorras buenas.
- 🩸 En Reebok, `CATEGORY` y `GENDER` son **obligatorias**: sin ellas se **rechaza el archivo nombrándolas**. Antes `findCol` daba −1 y todo subía a Switch con rubro y subrubro en blanco.
- **El veredicto de una descripción nueva** es `ya-existe` / `pasa` / `alerta`. `esCasiIgual` tiene **UN solo criterio: la «s» final**; el Levenshtein ≤2 se sacó porque emparejaba prendas distintas (`men-shirts` ≠ `men-t-shirts`, `polos l/s` ≠ `polos s/s`).
- 🔴 **El emparejado de fotos es EXACTO, sin parecidos.** «El riesgo caro no es que falte una foto (dice `NO IMAGEN`) sino pegarle al pedido la foto del artículo de al lado.» Sufijos, guiones, ceros a la izquierda y recortes **no** emparejan; solo se ignora la caja.
- 🔴 **Historial: el archivo guardado es BYTE A BYTE el que se descargó.** Los bytes se generan **una sola vez** (`XLSX.write` a un `ArrayBuffer`) y **el mismo blob** va al disco (`saveAs`) y al servidor (multipart). Escribir dos veces podría diferir: SheetJS estampa la hora de creación.
- 🔴 **A los 90 días se borra el ARCHIVO y la FILA se queda** (sin botón). Test con 91 y 89 días. Idempotente.
- 🔴 **Solo se guardan los Excel de Switch.** Daniel: *«el historial solo quiero los excel para switch»*. La plantilla CK/TH, la **Plantilla Switch de Reebok** y **Facturas Tienda** (anotada como **«Multifashion»**) sí; el **pedido para cliente de Reebok** (con fotos), **Tallas por bulto** y **Fotos a mi Excel** no.
- **Los Excel de todo el sistema empiezan en la fila 1** (`excel-encabezados-fila-1.test.ts`).

**Verificado por mutación:** `scripts/_mutar-candados-depurador-rediseno.sh` — **10 de 10
cazadas** (recordar el mes de la temporada · guardar el pedido de Reebok en el historial ·
borrar la fila junto con el archivo · divisor sin validar en Reebok y en Tienda · descarga
encendida con divisor malo · «cambiar» que no cambia · el historial recibe otro blob · un
`?tab=` viejo que deja de redirigir · retención a 9 días). Más
`_mutar-candados-depurador-pantalla.sh`, otras **10 de 10**.

## Con qué conecta

### Qué LEE de otros módulos
| Qué | De dónde | Para qué |
|---|---|---|
| El mapa de clasificación de Reebok | `src/lib/reebok-clasificacion.ts` — **de Catálogos** | 🔴 `REEBOK_CATEGORY_ESPERADAS` es su ESPEJO, con candado que compara los dos |
| Las empresas del grupo | `src/lib/empresa-mapping.ts` (`EMPRESA_KEY_POR_LABEL`) | Reconocer la compañía |
| La hora de Panamá | `hoyPanama` (`src/lib/fecha-panama.ts`) | La temporada por defecto |
| El rol y el nombre del usuario | cookie `cxc_session` | `carga_history.usuario` y los gates |

### Quién lee lo del Depurador
🔴 **Nadie dentro del sistema.** Ninguna otra pantalla, cron, alerta, export ni la búsqueda
global leen `carga_history`, `marca_formulas`, `marca_rubro_formulas`,
`depurador_descripciones` ni el bucket. **El único consumidor de lo que produce este módulo es
Switch Soft**, y llega ahí porque una persona sube el archivo a mano.

Consecuencia: **las 25 columnas del Excel son la única interfaz del módulo**, y ningún test de
otro módulo la protege. Por eso el fixture vive en el repo.

- **No está en la búsqueda global**, **no tiene badge**, **no manda ni un mensaje a Telegram**.
- Lo que sí escribe hacia afuera: `activity_logs` (`descarga_tallas` / `descarga_misfotos`), `cron_heartbeats` y `cron_email_errors` para el cron de limpieza.

### Qué se rompería si cambiara la forma de sus datos
| Cambio | Qué se rompe |
|---|---|
| Cambiar `OUT_COLS` sin cambiar el fixture | El build se pone **rojo** en `depurador-plantilla-switch.test.ts`, con el nombre de la columna que se movió |
| Switch cambia su plantilla y **nadie cambia el fixture** | El build sigue **verde** y el Excel que se sube **ya no cuadra**: Switch lo rechaza o —peor— lo acepta con las columnas corridas |
| Borrar `depurador_descripciones` o vaciarla | 🔴 **No se puede procesar ni descargar ningún archivo** (no hay respaldo en el código) |
| Vaciar `marca_formulas` | Todas las marcas quedan «Sin guardar»: se puede seguir con la fórmula global, pero cada corrida hay que teclearla |
| Renombrar `carga_history.archivo_path` | El cron de limpieza lo trata como **no-op limpio** (no revienta); el botón «Descargar» desaparece |
| Cambiar `validarDivisor` | Se abre la puerta a costos 100× mal **en los tres caminos a la vez** — es una sola función |
| Renombrar el bucket `depurador-plantillas` | Los archivos guardados se vuelven inalcanzables; la fila se queda con un `archivo_path` que no resuelve → **404 «Este archivo ya no está guardado»** |

## Por qué está así

| Cuándo | Decisión | Cita de Daniel |
|---|---|---|
| 4-sep-2026 | **De 7 pestañas a 3**, y el camino de generación se reconoce solo | «Aprobado» |
| 4-sep-2026 | 🔴 **La compañía se reconoce, no se elige** | ***«¿para qué elegir la compañía si la puede detectar?»*** |
| 4-sep-2026 | **Un archivo trae una sola marca, así que una sola compañía**; un archivo mixto **se dice, no se adivina** | ***«No»*** (a marcas de dos compañías) |
| 4-sep-2026 | «Temporada» en vez de «Mes» y «Año», arrancando en el mes actual de Panamá | ***«la temporada es el mes que se hace el archivo»*** |
| 4-sep-2026 | El archivo se puede volver a bajar **90 días** | ***«que el archivo dure 90 días»*** |
| 4-sep-2026 | **Solo los Excel de Switch** entran al historial | ***«el historial solo quiero los excel para switch»*** |
| 4-sep-2026 | **Todos ven todo** en el historial | ***«todos»*** |
| 4-sep-2026 | La **marca desconocida** se queda exactamente como está: avisa y deja descargar | ***«Como está»*** |
| 4-sep-2026 | Los precios escritos a mano se conservan al cambiar cualquier campo | ***«y también consérvalos»*** |
| 4-sep-2026 | La tasa pasa de texto libre a **dos opciones** | ***«solo existen esas dos»*** |
| 3-sep-2026 | 🔴 **La plantilla de Switch es UNA sola y tiene 25 columnas.** Daniel bajó el archivo de Fashion Shoes y de Multifashion: **idénticos byte a byte** | decisiones textuales del 3-sep |
| 3-sep-2026 | En **Fashion Shoes el CIF NO es el FOB**: hay flete adentro | ***«sí»*** |
| 3-sep-2026 | En **Multifashion FOB = CIF** | ***«mismo número»*** |
| 3-sep-2026 | «Composición» va **vacía** | ***«vuelve vacía, no la quiero»*** |
| — | La tasa lleva el cero adelante | ***«pon el 0 adelante pues»*** |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué |
|---|---|---|
| **Las DOS plantillas de 24 columnas** (`OUT_COLS_DEFAULT` y `OUT_COLS_SHOES`) | vivieron del 27-jun al 3-sep-2026 | 🩸 **Ninguna de las dos coincidía con Switch.** La «default» no traía «Composición» y las cuatro últimas quedaban corridas; la «shoes» tenía una sola `"Costo *"` en vez de `Costo FOB *` + `Costo CIF *`, así que **le faltaba una obligatoria y 18 columnas quedaban corridas**. Las dos se hicieron **contra archivos que no estaban en el repo**. Por eso hoy el fixture vive adentro |
| **`"Costo *"` con el FOB adentro** (`f6cd1966`, 1-sep-2026) | 2 días | Se cambió el CONTENIDO de una columna que Switch no tiene |
| **Las 7 pestañas** (`depurador · facturas · historial · curvas · misfotos · formulas · reglas`) | hasta el 4-sep-2026 | Se agruparon en 3. **Nada se borró**: los 7 componentes siguen montados, cambia dónde cuelgan, y los 7 `?tab=` viejos redirigen |
| **El selector «Empresa»** | hasta el 4-sep-2026 | La compañía se deriva de la marca del archivo |
| **Recordar la compañía en `localStorage`** | hasta el 4-sep-2026 | La del archivo manda |
| **Recordar el mes y el año** (`fg_last_depurador_mes` / `_anio`) | hasta el 4-sep-2026 | Recordarlos haría que el 1 de septiembre siguiera diciendo agosto — y ese dato entra a Switch |
| **Borrar los precios escritos a mano al re-procesar** (`setPriceEdits({})`) | hasta el 4-sep-2026 | Cambiar cualquier campo de configuración perdía todo el trabajo manual |
| **La tasa como texto libre** | hasta el 4-sep-2026 | `abc` llegaba tal cual a la columna «Tasa de Impuesto *» |
| **Levenshtein ≤ 2** en `esCasiIgual` | retirado | Emparejaba prendas **distintas**: `men-shirts` con `men-t-shirts`, `polos l/s` con `polos s/s`, `panties` con `panties 3pk` |
| **`calcHint()` y `convertTemporada()`** | siguen en `logic.ts` | **Cero llamadores** en todo `src/`, ni en tests. `calcHint` lo reemplazó `calcCell` dentro de `DepuradorClient` |
| **El mayor contable como fuente de gasto** | no es de este módulo | — |

## Cuánto se usa

**Medido en `carga_history`, 25-jun-2026 → 4-sep-2026, 140 corridas.**

| Quién | Corridas | Rol |
|---|---:|---|
| **Angela** | **76** | secretaria |
| **andrea** | **47** | secretaria |
| daniel | 17 | admin |

| Mes | Corridas |
|---|---:|
| 2026-06 (desde el 25) | 17 |
| 2026-07 | **60** |
| 2026-08 | **50** |
| 2026-09 (hasta el 4) | 13 |

🔴 **Es un módulo de las secretarias, no de Daniel**: 123 de las 140 corridas (88%) son de
Angela y andrea, y los 17 de daniel son **16 en junio** (el arranque) más 1 en agosto.

| Compañía | Corridas |
|---|---:|
| Vistana International | 56 |
| Fashion Wear | 55 |
| Fashion Shoes | 28 |
| Active Wear | 1 |

🔴 **Ninguna corrida de Reebok ni de Facturas Tienda en 140.** Hasta el rediseño de hoy
Reebok **no llamaba al historial** y Facturas Tienda **nunca dejó una fila**, así que esto no
prueba que no se usen — prueba que no dejaban rastro.

**Marcas más corridas:** TH Footwear 28 · TH Menswear 12 · TH Kids 12 · CK Jeans 11 ·
CK Accessories 10 · CK Underwear 10 · TH Accessories 9 · TH Womenswear 9 · TH Tommy Jeans 8 ·
CK Kids 6 · CK Footwear 6 · TH Swimwear 4.

**A qué hora** (UTC; Panamá es UTC−5): el pico es **16:00 y 20:00 UTC** (21 corridas cada uno)
= **11 a. m. y 3 p. m. de Panamá**. El rango real va de las **13:00 a las 21:00 UTC**
(8 a. m. – 4 p. m. de Panamá), con 8 corridas sueltas a las 04:00 UTC (11 p. m. de Panamá) y
una a las 23:00.

**Volumen procesado:** **117.019 unidades** y **2.062 estilos** en total, o sea unas
**836 unidades y 15 estilos por corrida**.

**Última corrida: 4-sep-2026.** El módulo está vivo.

**Con archivo guardado: 0 de 140** — la función es de hoy.

⚠️ **Lo que NO se puede medir:** cuántas veces se usan **Tallas por bulto** y **Fotos a mi
Excel**. Hasta el 4-sep-2026 no dejaban ningún rastro; desde hoy escriben `descarga_tallas` y
`descarga_misfotos` en `activity_logs`. **Al 4-sep-2026 hay 0 filas** con esas acciones. Es
exactamente el dato que Daniel quiere mirar en unas semanas para decidir si valen la pena.

## Qué papeles y Excel produce

| Qué sale | Nombre del archivo | Contenido | Quién lo recibe | Desde qué botón |
|---|---|---|---|---|
| **Plantilla de Switch (CK/TH/KL)** | `PLANT_<MARCA>_<AAAA-MM>.xlsx`, hoja **`upload`** | Las 25 columnas de `OUT_COLS`, una fila por estilo. Código/Referencia/Código Barra forzados a texto; anchos `wch` 26 para Descripción, 16 para las tres primeras, 13 el resto | **Switch Soft**, subido a mano | «Descargar plantilla» |
| **Plantilla de Switch (Reebok)** | `Plantilla_Switch_ActiveShoes_<AAAA-MM>.xlsx` | Las mismas 25 columnas, una fila por artículo. `Marca *` = `Department`, `rubro *` = `CATEGORY`, `subrubro` = `GENDER`, `Proveedor *` = `LATIN FITNESS GROUP`, unidad `PAR`/`PIEZA`, tipo `01` | **Switch Soft**, a mano | «Descargar» con «Plantilla Switch» elegido |
| **Plantilla de Switch (Facturas Tienda)** | `PLANT_TIENDA_<AAAA-MM>.xlsx`, o **`.zip`** con `…_1de3.xlsx` si pasa de **500 filas** (`MAX_FILAS_SWITCH`) | Las 25 columnas. `Proveedor *` = la **razón social completa** de la empresa vendedora (`VISTANA INTERNATIONAL PANAMA, S.A.`, `FASHION WEAR, INC`, `FASHION SHOES HOLDINGS, S.A.`, `ACTIVE WEAR S.A`, `ACTIVE SHOES S.A`, `JOYSTEP CORP.`) | El **Switch de Multifashion**, a mano | «Descargar» / «Descargar ZIP» |
| **Pedido para cliente (Reebok)** | `Pedido_ActiveShoes_<mes>.xlsx` | Una fila por `PO NAME + New Article`, con **Precio A** y **Precio B**, y **opcionalmente las FOTOS incrustadas** (leídas de la máquina, achicadas en el navegador, pegadas dentro del .xlsx). Lo que no empareja dice `NO IMAGEN` | El **cliente**, por correo o WhatsApp | «Descargar» con «Pedido para cliente» elegido. 🔴 **NO entra al historial** |
| **Tallas por bulto** | Excel de curvas | `Referencia · Talla · Código de barra · Cantidad`, encabezados por sección y una fila en blanco entre secciones | El **cliente** (para que sepa qué trae cada bulto) | «Descargar Excel (N)». No entra al historial |
| **Tu Excel con las fotos** | el **mismo nombre** que subió la persona | Su archivo, intacto, con la columna A llena de fotos. Conserva macros, formatos, anchos, altos y filtros | Quien lo subió | «Descargar con las fotos pegadas». No entra al historial |
| **Excel de fórmulas (`BulkExcel`)** | plantilla de carga masiva | Fórmulas por marca | Uso interno | Configuración › Fórmulas › Depurador |

🔴 **Ningún PDF y ningún correo salen de este módulo.** Todo lo que produce es Excel, y el
destinatario final del 60% de esos archivos es **Switch**, no una persona.

## Cómo probarlo a mano

**Escrito para alguien que no programa.**

### A · Que la plantilla salga bien
1. Entra a **Depurador**. Debes aterrizar en **Plantilla › Nuevo** con la caja de soltar archivo.
2. Suelta un Excel de proveedor de Calvin Klein.
3. 👉 Arriba debe salir **«Vistana International · CK Footwear»** con el nombre del archivo debajo. *Si dice «Elige la compañía», el archivo trae marcas que el catálogo no conoce.*
4. Abre **«▸ Editar temporada y costos»**: **«Temporada»** debe decir **el mes de hoy** (mira la nota al lado: «Septiembre 2026 → 2026-09»). *Si dice el mes pasado, algo se rompió: ese dato entra a Switch.*
5. Toca **«Descargar plantilla»** y abre el archivo.
6. 👉 **Cuenta las columnas: tienen que ser 25**, y la fila 1 tiene que ser el encabezado. La columna **«Composición»** va **vacía**. La columna **«Tasa de Impuesto»** tiene que decir **`07`** — con el cero adelante, alineado a la **izquierda** (porque es texto). *Si dice `7` alineado a la derecha, es un número y Switch lo va a leer mal.*
7. Compara con la plantilla que Switch te deja bajar en **Stock › Artículos › Importar/Editar › «Descargar plantilla modelo»**: los 25 encabezados deben decir **exactamente lo mismo, en el mismo orden**.

### B · Que el divisor no deje pasar un error
1. Con un archivo cargado, elige **«Una fórmula para todo»** y escribe **`70`** en Divisor.
2. 👉 El campo debe ponerse **rojo** y salir **«Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?»**, y el botón **«Descargar plantilla» debe apagarse**. *Si te deja descargar, el Excel lleva los costos **100 veces** mal y eso entra a Switch.*
3. Borra y escribe `0.70`: el rojo se va y el botón vuelve.
4. Repite lo mismo en **Reebok** y en **Facturas Tienda** — desde el 4-sep-2026 los tres caminos validan igual.

### C · Que un precio escrito a mano no se pierda
1. En la vista previa, cambia el precio de un artículo.
2. Cambia la **Temporada** (o la tasa, o el factor).
3. 👉 El precio que escribiste **tiene que seguir ahí**, y arriba debe decir **«N precios escritos a mano se conservaron.»**. *Si se borró, se perdió trabajo.*
4. Suelta **otro** archivo donde ese mismo artículo esté en otra fila: el precio tiene que seguir pegado **a SU artículo**, no a la fila.

### D · Que el historial guarde el archivo
1. Descarga una plantilla.
2. Ve a **Plantilla › Historial**. Debe aparecer una fila nueva con **hoy**, tu nombre, la compañía, la marca, los estilos y las unidades, y un botón **«Descargar»**.
3. Tócalo. 👉 El archivo que baja tiene que ser **exactamente el mismo** que bajaste antes: mismo nombre y mismo contenido.
4. Pídele a la otra secretaria que entre: **tiene que ver y poder bajar tu archivo**. *Ese es el pedido de Daniel: «todos».*
5. Las corridas viejas (antes de hoy) salen **en gris y sin botón**: es lo esperado, no tienen archivo guardado.

### E · Que Fotos a mi Excel no rompa el archivo
1. **Tallas y catálogo › Fotos a mi Excel**. Sube un `.xlsm` con macros.
2. La pantalla debe decir que el archivo **tiene macros**.
3. Elige la carpeta de fotos y descarga.
4. 👉 Abre el archivo que bajó: **el macro tiene que seguir funcionando**, los valores y el orden de las filas iguales, y **solo la columna A** debe haber cambiado. Los códigos sin foto dicen `NO IMAGEN`.

## Qué lo rompe

| Qué falla | Qué pasa | **Cómo se nota** |
|---|---|---|
| 🔴 **Switch cambia su plantilla de artículos** | El Excel se sigue generando con las 25 columnas viejas. Switch lo **rechaza**, o —peor— lo acepta con las columnas **corridas** y escribe los datos en el campo equivocado | 🩸 **NO se nota solo.** El candado compara contra el fixture del repo, no contra Switch: el build sigue **verde**. Se descubre al subir el archivo, o mirando artículos con el costo en la casilla del precio. **La única defensa es volver a bajar la plantilla de Switch y comparar** — se hizo el 3-sep-2026 con las 8 empresas |
| **Switch cambia el nombre de una columna sin mover el orden** | Igual: el archivo se sube y Switch puede ignorar la columna | Igual de silencioso |
| **`depurador_descripciones` vacía o inalcanzable** | 🔴 **El módulo se detiene entero**: no procesa ni descarga | Caja roja *«No se pudo cargar el catálogo de descripciones. Intenta de nuevo.»* con **«Reintentar»**. Es ruidoso a propósito: no hay respaldo en el código |
| **Un proveedor manda un formato nuevo** | El dispatcher lo manda a CK/TH/KL y ese camino falla | La caja de error del camino. ⚠️ **Y ahí la pantalla queda trabada**: el botón «Otro archivo» vive dentro del bloque de éxito. Hay que **recargar la página** (ver «Lo que sobra») |
| **Reebok manda el archivo sin `CATEGORY` o sin `GENDER`** | Se **rechaza el archivo nombrando la columna que falta** | Mensaje explícito. Antes esto pasaba en silencio y todo subía a Switch con rubro y subrubro **en blanco** |
| **Un valor nuevo en `Department` / `CATEGORY` / `GENDER` de Reebok** | El artículo conserva el valor del proveedor; el Depurador **avisa, no corrige** | *«N valor(es) de Department/CATEGORY/GENDER que el catálogo no conoce… un producto sin categoría se cobra por bulto de 6 y no de 12.»* 🩸 Si el valor nuevo también entra al catálogo de Reebok sin actualizar el espejo, **el build se pone rojo** — es la defensa |
| **Una marca nueva del proveedor** | Sus productos **salen sin precio** | *«Marca desconocida: «X» — N productos van a salir sin precio»*, con la marca cruda. **No bloquea, por decisión de Daniel** |
| **`SUPABASE_SERVICE_ROLE_KEY` sin configurar** | Las rutas del módulo responden **503** | Ruidoso a propósito, para no leer vacío en silencio |
| **El cron `cleanup-depurador-archivos` no corre** | Los archivos de más de 90 días se quedan en el bucket | No se pierde nada. El watchdog de `cron_heartbeats` lo dice. ⚠️ Está en `SEED_TOLERANT_CRONS` hasta que siembre su primera fila — al 4-sep-2026 **todavía no la tiene** |
| **La columna `archivo_path` no existe** | El POST del historial registra la fila igual y **borra el objeto que acababa de subir**, para no dejar huérfanos que la limpieza nunca vería. El cron es un **no-op limpio** | La fila aparece sin botón. Ya no aplica: la migración **está corrida** |
| **Se pierde `marca_formulas`** | Todas las marcas quedan «Sin guardar» | La columna Estado de la tabla de fórmulas. Se puede seguir con la fórmula global |
| **Alguien mueve `TEXT_COLS`** | Código, Referencia y Código Barra bajan como **números**: los ceros a la izquierda se pierden y la notación científica come los códigos largos | El candado abre el .xlsx y exige `t: "s"` — se pone rojo |
| **El archivo tiene más de 500 filas en Facturas Tienda** | Se parte en un **ZIP** (`MAX_FILAS_SWITCH`), porque Switch no acepta más | La barra dice `N archivos de máx. 500 filas → se descarga un ZIP` y el botón cambia a **«Descargar ZIP»** |

## Lo que sobra o no cuadra

1. 🔴 **La documentación dice que la migración está pendiente, y NO lo está.** `CLAUDE.md`,
   `docs/estado-actual.md`, el mensaje del commit `190f5450` y el postmortem dicen que
   `20260921120000_carga_history_archivo.sql` está **«pendiente de aplicar»**.
   **Medido el 4-sep-2026**: `supabase_migrations.schema_migrations` tiene la fila
   `20260921120000 / carga_history_archivo`, las columnas `archivo_path` y `archivo_nombre`
   existen, y el bucket `depurador-plantillas` está creado (5-sep 01:41 UTC). **La migración
   corrió minutos después del commit.** Es la clase de dato viejo que hace tomar la decisión
   equivocada la próxima vez.
2. 🔴 **Trampa sin salida: un archivo que falla deja la pantalla trabada.** En los **tres**
   clientes el botón **«Otro archivo»** vive DENTRO del bloque de éxito
   (`{processed && …}` / `{items && …}` / `{result && …}`), y en modo dispatcher la dropzone
   propia está oculta (`!embedded`). Si el archivo revienta o el catálogo de descripciones
   falla, lo único que queda en pantalla es la caja roja: no hay dropzone, no hay «Otro
   archivo», y cambiar de pestaña no ayuda porque el dispatcher sigue montado con el archivo.
   **Hay que recargar la página.** Evidencia: `DepuradorClient.tsx:842` vs `:849` y `:902`;
   `ReebokClient.tsx:574/581/871`; `FacturasTiendaClient.tsx:549/556/597`.
   Ya existía para CK/TH y Reebok; con el rediseño **Facturas Tienda se sumó**, porque perdió
   su pestaña y su dropzone propias.
3. **Una caja de error que nunca se puede ver.** `DepuradorDispatcher.tsx` declara
   `const [error, setError] = useState("")` y renderiza `{error && <div …>}`, pero
   **`setError` solo se llama con `""`**. La caja roja del dispatcher es **inalcanzable**.
   (Pre-existía al rediseño.)
4. **`carga_history.total_costo` no se muestra en ningún lado.** Se calcula (Σ CIF × unidades),
   se guarda, la ruta lo devuelve — y `HistorialView` pinta solo `Estilos` y `Unidades`.
5. **Dos exports muertos en `logic.ts`**: `calcHint()` (línea 1037) y `convertTemporada()`
   (línea 311) — **cero llamadores en todo `src/`, ni en tests**. `calcHint` lo reemplazó
   `calcCell` dentro de `DepuradorClient`.
6. **`ProcessResult.sinColumnaCantidad` se calcula, se devuelve y nadie lo lee.**
   `DepuradorClient` desestructura `rows`, `warnings`, `omitidosSinCantidad` y
   `marcasDesconocidas`; ese campo se cae al piso. La consecuencia —«sin columna CANTIDAD no se
   filtró nada»— **nunca se dice en pantalla**. Solo dos tests lo afirman.
7. **El desplegable «cambiar» ofrece dos compañías que no pertenecen a ese camino.**
   `COMPANIAS_DEPURADOR` tiene las 6, así que en el flujo CK/TH se puede elegir **Active Shoes**
   o **Multifashion**. Si se hace: `proveedorParaEmpresa` devuelve `null` (queda el proveedor
   del archivo) y la fila del Historial queda anotada como Reebok o Multifashion sobre un Excel
   de Calvin. `empresasReconocidas` **nunca** puede devolver esas dos keys, así que solo se
   llega ahí a mano.
8. **El `<select>` de Redondeo no ofrece «Par», pero la tabla sí lo guarda.** En «Fórmula
   guardada por marca» las opciones son `Entero` y `.50`; la ruta acepta `int | half | par` y
   **Reebok usa `par`**. Una fórmula con `redondeo = "par"` que cayera en `marcaForms` dejaría
   el desplegable sin opción coincidente.
9. **`matchEmpresaFromDestino` manda `MULTIFASHION` a `active_wear`** (`logic.ts:754`:
   `d.includes("ACTIVE WEAR") || d.includes("KARL") || d.includes("LAGERFELD") || d.includes("MULTIFASHION")`).
   Hoy `multifashion` es una key propia en `COMPANIAS_DEPURADOR`; ese `||` viene de antes y no
   se revisó.
10. **El dispatcher parsea el archivo dos veces.** `detect()` lee **todas** las hojas con
    `sheet_to_json` solo para olfatear, y después el cliente elegido vuelve a leer el mismo
    archivo desde cero. Con un Excel de miles de filas es doble trabajo en el hilo principal,
    sin más indicador que «Leyendo archivo…».
11. **`runFile` no limpia todo en el `catch`.** Al fallar resetea `processed`, `warnings`,
    `omitidosSinCantidad` y `error`, pero deja `marcasDesconocidas`, `empresasArchivo` y
    `empresaAuto` con los valores del archivo anterior. Hoy no se ve (todo eso se pinta dentro
    de `{processed && …}`), pero es estado sucio esperando a que alguien saque un aviso de ese
    bloque.
12. **`tienda_marca_formulas` y `tienda_rubro_formulas` están vacías: 0 filas.** El scope
    «Tienda (facturas)» de Configuración › Fórmulas existe, funciona y **nunca se ha usado** —
    todos los precios de Facturas Tienda salen sin fórmula.
13. **El Historial nunca ha guardado una fila de Reebok ni de Facturas Tienda** (las 140 son
    Vistana 56 · Fashion Wear 55 · Fashion Shoes 28 · Active Wear 1). El
    `empresaCanonica("Facturas Tienda") → "Multifashion"` de `HistorialView` es defensa contra
    un caso que **en producción no existe**.
14. **`GET /api/activity` no tiene lectores.** El POST se arregló con este commit (insertaba
    `user_name` y `module`, columnas que `activity_logs` **no tiene**, y fallaba en silencio;
    nadie lo notó porque `logActivityClient` no tenía llamadores). Pero **ninguna pantalla
    consume el GET**: el «rastro de uso» de Tallas y Fotos que Daniel quiere mirar en unas
    semanas hoy solo se lee consultando la base a mano.
