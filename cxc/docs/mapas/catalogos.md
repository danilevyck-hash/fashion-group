# Mapa — Catálogos, pedidos y Comprobantes

> Medido contra producción el **5-sep-2026** (Management API, solo lectura).
> Todo número de aquí se remidió; lo que no cuadra con `CLAUDE.md` va marcado 🩸.
> Esto es **mapeo**: no se tocó una línea de la aplicación.

---

## 1 · Qué es, quién entra, cuánto se usa

**Cuatro marcas encendidas**, cada una con catálogo interno, catálogo público compartible y pedido público sin sesión:

| Marca | Empresa | Prefijo | Productos | Visibles al cliente |
|---|---|---|---|---|
| Reebok | Active Shoes | PED | 391 | 232 |
| Tommy | Fashion Shoes | TOM | 552 | 460 |
| Calvin | Vistana | CKP | 94 | 84 |
| Joybees | Joystep | JBP | 83 | 81 |
| **Total** | | | **1.120** | **857** |

### Quién entra (medido en `role_permissions` + `src/lib/catalogo/roles.ts`)

| Puede | Roles |
|---|---|
| Ver el catálogo | admin · secretaria · vendedor · bodega · gerente_boston |
| Armar pedidos | admin · secretaria · vendedor (+ `cliente`, quirk legacy solo Reebok — `marcas.ts:306`) |
| Ver Comprobantes | admin · secretaria · vendedor · bodega. **gerente_boston no** |
| Administrar (fotos, ocultar) | admin · secretaria |

### Cuánto se usa DE VERDAD

**70 pedidos internos en toda la historia. 56 vivos.**

| Mes (Panamá) | Reebok | Tommy | Calvin | Joybees | Total vivo |
|---|---|---|---|---|---|
| may–jun 2026 | 0 | — | — | — | **0** |
| jul 2026 | 14 | — | — | 3 | **17** |
| ago 2026 | 0 | 26 | 4 | 1 | **31** |
| sep 1-5 | 1 | 6 | 1 | 0 | **8** |
| **Vivos hoy** | **15** | **32** | **5** | **4** | **56** |

- **Tommy es el módulo**: 32 de 56 pedidos vivos (57%) y 26 de los 31 de agosto.
- **Reinaldo Espinosa armó 30 de los 56** (54%).
- **Reebok lleva 1 pedido en 41 días** (PED-023, 3-sep; el anterior fue el 26-jul).
- **Joybees lleva 1 pedido en 12 días** y 4 en toda su historia.
- **Calvin: 5 pedidos en toda su historia** (nació el 12-ago-2026).

**Envíos a Switch: 52, todos «verificado», CERO en error.** 49 pedidos + **3 cotizaciones, las tres de Tommy** — las otras tres marcas nunca cotizaron.

**Líneas por pedido:** Tommy 14,0 (máx 73) · Reebok 13,7 (máx 84) · Joybees 8,0 · Calvin 7,2.

### La vía pública, medida

**23 pedidos públicos en toda la historia. 7 convertidos. El último entró el 15-ago-2026 — hace 21 días.**

| Marca | Públicos | Convertidos | Último |
|---|---|---|---|
| Reebok | 18 (12 borrados) | 3 | 26-jul-2026 |
| Joybees | 4 (2 borrados) | 3 | 24-jul-2026 |
| Calvin | 1 | 1 | 15-ago-2026 |
| **Tommy** | **0** | **0** | **nunca** |

🔴 **Tommy, la marca que carga el módulo entero, nunca recibió un pedido por el link.** El canal público existe en las 4 marcas y produjo 23 pedidos en 5 meses.

### Administrar el catálogo (`activity_logs`, toda la historia)

| Marca | Fotos por variante | Ocultar/mostrar | Otro |
|---|---|---|---|
| Tommy | 30 (25-29 jul) | 20 | — |
| Calvin | 0 | 6 | — |
| Joybees | 0 | 2 | — |
| **Reebok** | **0** | **0** | 1 borrado masivo |

**56 acciones de administración en 5 meses**, y 50 de ellas fueron Tommy en cinco días de julio. **Reebok nunca se administró.**

---

## 2 · Cuánto cuesta hacer las cosas

### Tarea A — Armar un pedido Tommy de 14 líneas (lo que hace Reinaldo, 26 veces en agosto)

**Hoy: 20 toques · 5 pantallas.**

| Paso | Pantalla | Toques |
|---|---|---|
| Home → Catálogos | `/home` → `/catalogos/marcas` | 1 |
| Hub → Tommy | `/catalogo/tommy` | 1 |
| «Agregar» × 14 productos | misma | 14 |
| «Crear pedido» | `/catalogo/tommy/checkout` | 1 |
| Elegir cliente (abrir + tocar) | misma | 2 |
| Vendedor | — | **0** (viene del login, `mi-vendedor/route.ts:29-41`) |
| «Pedido a Switch» | misma | 1 |
| Confirmación | `/catalogo/tommy/confirmacion/[id]` | 0 (llega solo) |

**Campos escritos a mano: 0.** No hay comentario ni correo en este flujo (medido: `comment` y `client_email` están vacíos en 70 de 70 pedidos — ver 🩸4).

**Lo que se repite:** buscar el cliente. Los 32 pedidos vivos de Tommy van a **17 clientes**; City Mall Paso Canoa aparece 4 veces, Multi Fashion Holding 3, Wolf Mall 3, Contado 5. Hoy el selector abre listando los primeros 20 del directorio en orden alfabético (`ClienteSwitchPicker.tsx:87-118`), sin «recientes».

**La versión más corta: 20 → 18 toques.** Una fila «Tus últimos clientes» arriba del selector ahorra el tecleo de búsqueda. No toca la regla del 422 (el cliente se sigue tocando, no viene puesto). Es lo único que se puede recortar: los otros 14 toques son elegir mercancía, y eso ES el trabajo.

### Tarea B — Un cliente arma su pedido desde el teléfono (la que cuenta doble)

**Hoy: 5 toques + 1 campo, para 3 productos.** Es corto y está bien resuelto.

| Paso | Toques |
|---|---|
| Abre el link de WhatsApp → `/catalogo-publico/[marca]` | 1 |
| «Agregar» × 3 | 3 |
| Escribe su nombre (obligatorio, ≥3 letras — `nombre-cliente.ts:24`) | 1 campo |
| «Confirmar pedido» → crea y confirma en un solo paso (`CatalogoPublicoPage.tsx:411-459`) | 1 |

**No hay nada que recortar en el número de toques.** Lo que le pasa a este cliente es otra cosa: ver 🩸6, 🩸7, 🩸8 y 🩸9 — lee «Ninos» sin ñ, o el filtro en inglés, o (si es Calvin) nunca se entera de que le faltaron piezas, o su pedido se queda 22 días sin llegar a Switch.

⚠️ **En Joybees son 2 toques por producto, no 1**: es la única marca con agrupación por modelo, y con 2+ variantes hay que elegir talla antes de agregar (`marcas-ui.tsx:882`, `CatalogoGroupedCard.tsx:271-296`).

### Tarea C — Ver los comprobantes de una marca

**Hoy: 3 toques** (Home → hub → «Pedidos», `marcas/page.tsx:203`). Nada que recortar.

Lo que se ve al llegar, medido hoy:

| Marca | Pedidos | Cotizaciones | Borradores |
|---|---|---|---|
| Tommy | 26 | 3 | 3 |
| Reebok | 13 | **0** | 2 |
| Calvin | 4 | **0** | 1 |
| Joybees | 4 | **0** | 0 |

### Tarea D — Corregir la foto de un producto

**Hoy: 3 toques hasta el panel** (Home → hub → «Administrar», `marcas/page.tsx:211`), después buscar el producto. Se usó **56 veces en 5 meses**. No hay desperdicio medible que justifique tocarlo.

---

## 3 · 🩸 Lo que miente o está roto

### 🩸1 · La migración que borraba los pedidos de prueba YA CORRIÓ

`supabase_migrations.schema_migrations` tiene **`20260924120000_borrar_pedidos_de_prueba`** aplicada. `CLAUDE.md` § Catálogos y `docs/postmortems/catalogos-pedidos.md` dicen «**pendiente de aplicar**».

Efecto medido: `calvin_orders` pasó de 21 a **5** y `joybees_orders` de 41 a **4**. La numeración lo confirma (Calvin: CKP-005, 006, 007, luego salta a 020; Joybees: JBP-001, 002, 003, luego 041).

Las mismas dos fuentes traen conteos que ya no existen: `calvin_orders (20)` y `joybees_orders (41)`.

### 🩸2 · Cinco números de `CLAUDE.md` no cuadran con producción

| Dice `CLAUDE.md` | Mide producción |
|---|---|
| `tommy_products` 546 | **552** |
| `calvin_products` 81 | **94** |
| `reebok_order_items` 266 | **316** |
| `calvin_orders` 20 | **5** |
| `joybees_orders` 41 | **4** |

### 🩸3 · La key `pedidos` NO está en `role_permissions`

`CLAUDE.md` § Catálogos: *«la key de la pestaña sigue siendo `pedidos` (está en `role_permissions`)»*. Medido: **ninguna de las 7 filas de `role_permissions` la trae.** Los permisos de Comprobantes salen solo de `COMPROBANTES_ROLES` en el código.

### 🩸4 · `comment` y `client_email` están vacíos en 70 de 70 pedidos

El postmortem justifica **no borrar** los pedidos viejos con cuatro datos que Switch no guarda: *«quién lo armó (`vendor_name`), **el comentario** (`comment`), si salió como pedido o cotización, **el correo al que se le mandó** (`client_email`)»*.

Medido, en las cuatro marcas, toda la historia:

| Columna | Filas llenas |
|---|---|
| `vendor_name` | 62 de 70 |
| documento (pedido/cotización) | 52 de 70 |
| `comment` | **0 de 70** |
| `client_email` | **0 de 70** |

La conclusión («no se borran») sigue en pie por los dos primeros. **Dos de los cuatro motivos nunca existieron** — se midieron sobre lo que la tabla puede guardar, no sobre lo que guarda.

### 🩸5 · El 76% de las corridas de catálogo no escribe nada

14 días, 4 marcas × 4 pasadas diarias:

| Marca | Corridas | Productos comparados | Escrituras reales | Corridas que escribieron 0 |
|---|---|---|---|---|
| Tommy | 59 | 26.505 | 442 | 34 (58%) |
| Reebok | 58 | 9.463 | 244 | 42 (72%) |
| Calvin | 57 | 4.442 | 196 | 48 (84%) |
| Joybees | 56 | 4.648 | **90** | **50 (89%)** |
| **Total** | **230** | **45.058** | **972 (2,2%)** | **174 (76%)** |

El guard de «no escribir lo que no cambió» **funciona perfecto**. Lo que no funciona es la frecuencia: **230 sesiones de Switch en 14 días** (≈16 por día) para 972 escrituras. Y cada sesión expulsa a Daniel del panel de esa empresa. Las pasadas subieron de 2 a 4 por día el 13-ago-2026; el resultado medido de esa duplicación es un 2,2% de escrituras.

### 🩸6 · «Ninos» sin ñ, en el catálogo público de Reebok

`src/lib/reebok-gender.ts:130` y `:151`. Aparece en el chip del filtro y en el encabezado de sección — de las dos pantallas que abre un cliente de Daniel desde su teléfono.

### 🩸7 · Tommy y Calvin le muestran el filtro EN INGLÉS a un cliente panameño

`Women · Men · Boys · Girls` y `Sneakers · Flip Flops · Sandals · Shoes · Slippers · Boots` (`tommy-nombres.ts:66-83`, `calvin-nombres.ts:69-86`). El comentario del código dice que es «el vocabulario de Switch, sin traducir» — o sea, deliberado por parte de quien lo escribió, pero **nunca decidido por Daniel**. Reebok y Joybees sí traducen (Hombre/Mujer/Niños/Unisex).

Alcanza a **554 de los 857 productos visibles (65%)**.

### 🩸8 · Calvin no tiene `stock_confirmacion`: su cliente nunca se entera de que faltaron piezas

Las otras tres marcas tienen esa columna en `<marca>_pedidos_publicos`; **`calvin_pedidos_publicos` no.** `confirmar-pedido.ts:250-265` reintenta sin ella y el dato se pierde.

Consecuencia: en Reebok, Tommy y Joybees el cliente lee *«Ojo: hay N producto(s) con menos piezas de las que pediste»*. **En Calvin ese aviso no sale nunca**, ni en la primera carga ni al recargar — y tampoco lo ve la secretaria en el panel interno (`orders/[id]/route.ts:38-42`).

### 🩸9 · Calvin tampoco tiene `foto_manual`: la foto elegida a mano no queda protegida

`foto_manual = true` es el candado que impide que la asignación automática del ZIP pise una foto que alguien eligió a mano. Reebok, Tommy y Joybees lo tienen; **Calvin no**. `variantes-server.ts:282` es tolerante: guarda la foto y sigue **sin el candado**.

Medido: Tommy tiene 30 fotos marcadas a mano protegidas. Calvin no puede tener ninguna.

### 🩸10 · 7 pedidos vivos, $33.912,00, nunca llegaron a Switch — y nada lo dice

| Marca | Número | Cliente | Estado | Monto | Días parado |
|---|---|---|---|---|---|
| Tommy | TOM-005 | Contado | borrador | $16.920,00 | 25 |
| Tommy | TOM-006 | Contado | borrador | $7.254,00 | 25 |
| Tommy | TOM-023 | Wolf Mall Center Int | borrador | $3.570,00 | 17 |
| Reebok | PED-019 | Contado | borrador | $2.760,00 | 46 |
| Calvin | CKP-007 | ACTIVE SHOES, S.A. | borrador | $1.704,00 | 24 |
| **Calvin** | **CKP-020** | **«HJsn»** | **confirmado** | **$1.284,00** | **22** |
| **Reebok** | **PED-004** | **CITY MALL PASO CANOA** | **confirmado** | **$420,00** | **64** |

Los dos últimos son los graves: **dicen «confirmado» y no existen en el ERP**. CKP-020 es además **el único pedido que Calvin recibió por el link en toda su historia** — un cliente lo armó, escribió su nombre, tocó confirmar, y 22 días después sigue sin ser una venta.

El chip «Borradores» los agrupa, pero **ningún lugar dice «este lleva 64 días parado»**.

### 🩸11 · `records_updated` de los catálogos significa «procesados», no «escritos»

`sync-catalogo.ts:926` y `:964`: `updated: out.actualizados + out.reactivados` — cuenta **todos** los productos comparados. Joybees anota `records_updated = 83` en las 56 corridas, con la tabla de 83 filas y **0 escrituras reales** (esas viven en `skip_details.valorCrudo.escrituras`).

Es el mismo defecto que la columna que decía «Margen %» y mostraba participación: **el rótulo dice una cosa y el número es otra**, 20 veces más grande. Cualquier tablero que lea esa columna como «actualizados» está mintiendo.

### 🩸12 · `inventory` de Reebok tiene UNA sola talla, y se reescribe entera 4 veces al día

`CLAUDE.md` dice: *«Tallas y existencia del catálogo Reebok · `inventory` · 1 fila por (product_id, talla) · 391»*.

Medido: **391 filas, 391 productos, 1 valor distinto de `size`: `"UNICA"`.** No hay tallas. Es una copia 1:1 de `products.existencia`.

Y `sync-catalogo.ts:779-786` la reescribe **siempre, aunque el producto no haya cambiado** (comentario a propósito: leerla costaría una consulta). Son **391 × 58 = 22.678 escrituras en 14 días** para duplicar una columna que ya está al lado.

### 🩸13 · `badge` y `keep_visible`: 0 filas en las 4 marcas, en toda la historia

`badge` es **uno de los dos únicos campos que se pueden escribir a mano** en un producto (el otro es la foto). Nunca se usó, en ninguna de las 1.120 filas. `keep_visible` tampoco.

### 🩸14 · «Ver más (90 días)» no esconde nada hoy

De los 56 pedidos vivos, **0 caen fuera de la ventana de 90 días** en las cuatro marcas. La lista más larga que existe es la de Tommy con 32 filas. El botón que se construyó el 4-sep-2026 todavía no ha aparecido nunca. (No es un error — es que el volumen no lo pedía.)

### 🩸15 · Comprobantes no muestra quién armó el pedido

Columnas de la tabla (`ComprobantesPanel.tsx:697-701`): **Origen · Cliente · Total · Fecha**. `vendor_name` — el dato que el postmortem pone primero en la lista de «lo que Switch no tiene» y el único de los cuatro que sí está lleno (62 de 70) — **no se muestra en ninguna columna**.

### 🩸16 · Tres pedidos que SÍ llegaron a Switch están borrados

PED-001, PED-002, PED-003 (mayo-junio, edwin y daniel) tienen envío verificado a Switch **y** `deleted = true`. No aparecen en Comprobantes. Es la única marca con este caso (3 de 16 envíos de Reebok).

### 🩸17 · Datos sucios menores

- **Nombre del vendedor, 8 grafías** para 5 personas: `daniel` · `DANIEL LEVY` · `DANIEL LEVY ` (con espacio) · `rey` · `REINALDO ESPINOSA` · `andrea` · `edwin` · `DEFAULT` · `null`. Es el mismo problema que Comisiones ya resolvió con `comision_vendedor_canonico`.
- **`joybees_products.category = 'nuevo'`** en 2 productos. «nuevo» no es una categoría, es una etiqueta.
- **Nombres de cliente basura vivos**: `HJsn` (CKP-020, confirmado) y `Nathalie` (PED-022, confirmado).
- **Reebok: 159 de 391 productos inactivos (41%)**; Tommy 92 de 552 (17%).

### ✅ Lo que se revisó y está bien

- **Fotos: 0 faltantes entre los 857 productos visibles.** Los 17 sin foto están todos ocultos o inactivos.
- **`gender` y `category`: 0 vacíos** en las 4 marcas. La corrección del `DEFAULT 'male'` de Reebok funcionó: de las altas posteriores al 24-jun, 73 son `female` (antes eran 0).
- **52 envíos a Switch, 0 en error, 0 huérfanos.** El at-most-once aguanta.
- **Los precios los manda Switch** en las 4; `sin_precio` = 1 en Reebok, 0 en el resto.
- **`NEXT_PUBLIC_REEBOK_SUPABASE_URL` apunta al proyecto principal** — verificado. La corrección que ya estaba anotada sigue siendo correcta.
- **Voseo: cero** en los textos que ve el usuario, en las cuatro pantallas públicas y en el flujo interno.

---

## 4 · Coherencia con el resto del sistema

| Regla de la casa | Catálogos |
|---|---|
| Un solo selector de cliente | ✅ `ClienteSwitchPicker`, con barrido |
| El cliente se elige, nunca viene puesto | ✅ arranca vacío; el servidor contesta 422 |
| El precio lo manda Switch | ✅ solo foto y badge a mano |
| Identidad por CÓDIGO, nunca por nombre | ✅ el checkout manda `cliente_switch_id` |
| Soft delete, nunca DELETE | ✅ salvo la migración de pruebas, que es la excepción declarada |
| Diccionario: «Correo» no Email | ⚠️ **no aplica** — no hay ningún campo de correo en pantalla en este módulo |
| Cero voseo | ✅ |
| Excel desde la fila 1 | ✅ el export de Comprobantes usa el generador de la casa |
| Un cero grande no se escribe | ✅ los vacíos dicen «Por ahora no hay productos disponibles» |

**Diferencias entre las 4 marcas** (las reales, no de color):

| | Reebok | Joybees | Tommy | Calvin |
|---|---|---|---|---|
| Pre-orden | **sí** | no | no | no |
| Agrupación por modelo (toque extra) | no | **sí** | no | no |
| Filtro de precio y «2 bultos o más» | no | no | **sí** | **sí** |
| Vocabulario del filtro | español («Ninos» 🩸) | español | **inglés** 🩸 | **inglés** 🩸 |
| Bulto por producto (`bulto_pzas`) | no (por categoría) | no (fijo) | **sí** | **sí** |
| `foto_manual` (candado de foto) | sí | sí | sí | **NO** 🩸 |
| `stock_confirmacion` (aviso de faltante) | sí | sí | sí | **NO** 🩸 |
| Rol `cliente` legacy | **sí** (quirk) | no | no | no |
| Edición de producto | PUT por `id` (quirk) | POST por `sku` | POST por `sku` | POST por `sku` |

Tommy y Calvin están documentados como «espejo funcional» (`marcas.ts:438-441`) — y en dos columnas de base **no lo son**.

---

## 5 · iPhone (390 px)

Las pantallas públicas **ya pasaron una ronda dura** y están bien resueltas: `min-h-[44px]` en casi todos los botones, nombres con `truncate` y auto-shrink, imágenes con ancho y alto explícitos, filtros migrados de píldoras arrastrables a desplegables justamente por esto.

Lo que queda:

| Dónde | Qué | Archivo:línea |
|---|---|---|
| Tarjeta de producto | «Bulto de N» en `text-[10px]` | `CatalogoProductCard.tsx:234`, `CatalogoGroupedCard.tsx:247` |
| Tarjeta agrupada (Joybees) | insignia de cantidad en `text-[9px]` | `CatalogoGroupedCard.tsx:297` |
| Selector de talla (Joybees) | con 3+ variantes cada botón se reparte `flex-1` con `text-[10px] truncate` | `CatalogoGroupedCard.tsx:271-296` |
| Filtro de precio (Tommy/Calvin) | dos inputs `w-24` + labels + «Quitar precio» pasan a 2 líneas | `CatalogoFilters.tsx:280-300` |

Ninguno desborda la página. El más discutible es el `text-[9px]`, que es dato (la cantidad pedida) por debajo del mínimo de la casa (`text-sm`).

---

## 6 · Que se sienta más fácil — qué quitaría y qué dejaría

| Quitaría | Por qué (medido) |
|---|---|
| El chip **«Cotizaciones»** en Reebok, Calvin y Joybees | Está en 0 en las tres y siempre lo estuvo. En Tommy vale 3 y ahí sí sirve. |
| El campo **`badge`** del panel de administrar | 0 filas en 1.120 productos, 5 meses. Ocupa lugar en la única pantalla de edición. |
| **`inventory` de Reebok** como fuente de tallas | 1 sola talla, 22.678 escrituras/14 días para copiar `products.existencia`. |
| **2 de las 4 pasadas diarias** de cada catálogo | 76% de las corridas no escriben nada; Joybees, 89%. Cada una expulsa a Daniel del panel de Switch. |

| Dejaría | Por qué |
|---|---|
| El botón **«Ver más (90 días)»** | Hoy no aparece nunca, pero es el freno correcto cuando Tommy pase de 100 filas. |
| Los tres chips **Pedidos · Cotizaciones · Borradores** en Tommy | Los tres tienen filas y particionan; sin «Todos» ninguna fila se esconde. |
| El aviso **«una cotización no aparta mercancía»** pegado al botón | Es la única frase explicativa del flujo y evita una venta que no existe. |
| Las **fotos** y el resumen semanal | 0 faltantes entre los visibles: está haciendo su trabajo. |

| Agregaría (una línea, sin chips) | Por qué |
|---|---|
| En Comprobantes, la columna **«Armó»** | 62 de 70 pedidos lo tienen y hoy no se ve en ningún lado. |
| En la fila de un borrador, **los días parados** | $33.912,00 llevan entre 17 y 64 días sin llegar a Switch y nada lo dice. |

---

## 7 · Preguntas para Daniel

**1. Los catálogos se refrescan 4 veces al día y el 76% de las veces no cambia nada.**
En 14 días: 230 entradas a Switch, 972 productos escritos (2,2%). Joybees: 50 de 56 corridas en cero. Cada entrada te saca del panel de Switch de esa empresa.
- a) Dejarlo en 4 pasadas.
- b) Bajar a 2 (mañana y tarde) en las cuatro marcas.
- c) 4 en Tommy (la que se mueve) y 2 en Reebok, Calvin y Joybees.
→ **Recomiendo (c).** Tommy escribió 442 de las 972; las otras tres juntas, 530 en 171 corridas. Es donde el dato se mueve de verdad.

**2. Reebok y Joybees casi no se usan.**
Reebok: 1 pedido en 41 días, 0 acciones de administración en toda su historia, 159 de 391 productos inactivos. Joybees: 4 pedidos en total, el último hace 12 días. Tommy hizo 26 en agosto.
- a) Dejar las 4 marcas igual.
- b) Dejarlas encendidas pero con la mitad de sincronización (es lo que pregunta la 1).
- c) Apagar el catálogo público de Reebok y Joybees, dejando el interno.
→ **Recomiendo (b) y nada más por ahora.** Apagar algo que no molesta a nadie no gana tiempo; bajar su sincronización sí. Pero dime tú si Reebok se volvió a mover o si es una marca que ya no se está trabajando.

**3. Tommy y Calvin le muestran el filtro en inglés a tus clientes.**
`Women · Men · Boys · Girls`, `Sneakers · Flip Flops · Sandals`. Son 554 de los 857 productos que un cliente ve. Reebok y Joybees sí están en español. Nadie decidió esto: viene de Switch tal cual.
- a) Dejarlo en inglés (es una marca americana).
- b) Traducirlo a español como Reebok.
- c) Traducir el género (Mujer/Hombre/Niño/Niña) y dejar la categoría en inglés.
→ **Recomiendo (b).** Tus clientes son panameños y las otras dos marcas ya están en español; que dos digan «Women» y dos digan «Mujer» es la única incoherencia visible del módulo. (Aparte: en Reebok dice **«Ninos» sin ñ** — eso lo arreglo con tu OK sin preguntar más.)

**4. Hay $33.912,00 en 7 pedidos que nunca llegaron a Switch, y dos de ellos dicen «confirmado».**
PED-004 (City Mall Paso Canoa, $420) lleva **64 días**. CKP-020 lleva 22 y es **el único pedido que Calvin recibió por el link en toda su historia**.
- a) Dejarlo así; el que lo armó sabe.
- b) Que la fila diga los días parados (una línea, sin chip).
- c) Que además avise por Telegram a los N días.
→ **Recomiendo (b).** Un aviso más al grupo por 7 pedidos en 5 meses es ruido; la fila diciéndolo se ve justo cuando alguien abre Comprobantes, que es cuando puede hacer algo.

**5. El pedido por link entra en 5 toques y produjo 23 pedidos en 5 meses; el último hace 21 días. Tommy nunca recibió uno.**
La pantalla está bien hecha y es corta. Lo que no sé es si se está compartiendo.
- a) El canal sirve y hay que empujarlo (mandar el link de Tommy a los clientes).
- b) El canal no es para pedir sino para mirar el catálogo, y está bien así.
- c) Retirarlo.
→ **No te recomiendo nada aquí: es la única pregunta del mapa cuya respuesta no está en el código ni en los datos.** Lo que sí puedo decir es que no está roto — de los 23 que entraron, 7 se convirtieron y ninguno falló.

**6. Calvin tiene dos cosas menos que sus tres hermanas, y una la sufre el cliente.**
Le falta el aviso «te faltaron piezas» (el cliente nunca lo ve, ni tú en el panel) y el candado que protege una foto puesta a mano.
- a) Igualarla a las otras tres.
- b) Solo el aviso de piezas (lo que ve el cliente).
- c) Dejarlo.
→ **Recomiendo (a).** Son dos columnas y Calvin ya está documentado como «espejo» de Tommy; la diferencia no fue una decisión, fue que Calvin nació un mes después.

---

## 8 · Lo que sobra · lo que falta

**Sobra, con la medición:**
- `badge` — 0 de 1.120 productos, 5 meses.
- `keep_visible` — 0 de 1.120.
- `client_email` y `comment` en los pedidos — 0 de 70.
- Las tallas de `inventory` — 1 sola talla, `"UNICA"`, 391 filas.
- El chip «Cotizaciones» en Reebok, Calvin y Joybees — 0 y siempre 0.
- 2 de las 4 pasadas diarias de sincronización — 76% escriben cero.

**Falta:**
- Que la lista de Comprobantes diga **quién armó** el pedido (62 de 70 lo tienen guardado).
- Que un borrador diga **cuántos días lleva parado** ($33.912,00 entre 17 y 64 días).
- Que Calvin tenga `stock_confirmacion` y `foto_manual`.
- Que Reebok diga **«Niños»** con ñ.
- Un canónico de vendedor en los pedidos (8 grafías para 5 personas) — el mismo `comision_vendedor_canonico` que ya existe.

**No medido (y por qué):**
- Cuánta gente ABRE el catálogo sin armar un pedido: `activity_logs` no registra pantallas vistas, solo acciones que escriben.
- Cuántas veces se compartió un link público: no queda rastro del «Compartir», solo de los pedidos que entraron.
