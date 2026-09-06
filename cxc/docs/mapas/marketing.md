# Marketing (con Mobiliario) — mapa medido

> Medido contra producción el **5-sep-2026** (SQL de solo lectura) y contra el código de `main`.
> Todo número se remidió: nada se copió de `CLAUDE.md` ni del post-mortem.
> Lo que no se pudo medir dice **«no medido»** y por qué.

---

## Qué es, quién entra, cuánto se usa

**Qué es.** Lo que las marcas te devuelven por remodelar una tienda. Tres cosas conviven:
las **facturas** del gasto (con su PDF), los **muebles** que se entregan (con su inventario y su
nota de envío), y los pagos a las **impulsadoras**. Todo se reparte por marca para poder cobrárselo.

**Quién entra.** `admin` + `secretaria`. Nadie más.
`src/lib/modules.ts:176` y `role_permissions` en producción.

**Cuánto se usa**, medido:

| Medida | Número |
|---|---|
| Proyectos (tiendas) | **25** |
| Facturas vivas · anuladas | **88** ($93.205,84) · **14** ($12.004,20) |
| Facturas de 2026 | **37** ($24.377,56) |
| Entregas de muebles | **24** ($81.347,00 en muebles) |
| Renglones de entrega | **111** · **2.283 piezas** |
| Fotos y PDF subidos | **162** (100 PDF de factura, 60 fotos de proyecto, 2 fotos de factura) |
| Impulsadoras | **2** activas, 17 pagos ($13.600) |
| Productos del inventario de muebles | **6** |
| Filas en `activity_logs` | **33** de 2.821 (1,2%) — **la última es del 6-ago** |

**El ritmo real, por mes:**

| | jun | jul | ago |
|---|---|---|---|
| Entregas de muebles | **20** | 1 | 3 |
| Facturas | 3 | 5 | **15** |

🔴 **Las entregas de muebles no se usan: se cargaron.** 20 de las 24 entraron el mismo mes
(junio, y 17 de ellas **el mismo día**, el 22-jun). Desde entonces van **4 entregas en 11 semanas** (30-jul, 11-ago, 12-ago y 28-ago),
o sea **menos de 2 al mes**. Las 21 primeras traen **exactamente 5 renglones cada una** — la firma del
autorrelleno que se retiró el 12-ago. Las 3 posteriores traen 1, 1 y 4.

---

## Los datos, medidos

### `mk_proyectos` — 25 filas

🩸 **Los 25 están `abierto`. Cero cerrados, cero enviados, cero cobrados, cero anulados.**
Las columnas `fecha_enviado` y `fecha_cobrado` están **vacías en las 25**. El flujo de estados
existe en la base y **nunca avanzó una sola vez** en 5 meses.

| Columna | Llena |
|---|---|
| `nombre` | 25/25 — pero **16 de 25 (64%) dicen literalmente «Remodelacion»** |
| `tienda_codigo` | **19/25 (76%)** |
| `notas` | 1/25 |
| `fecha_enviado` · `fecha_cobrado` · `anulado_en` | **0/25** |

- **7 de 25 proyectos (28%) están vacíos**: 0 facturas, 0 entregas, 0 fotos. Entre ellos hay dos
  llamados **«J»** y **«D»** (una sola letra en el nombre *y* en la tienda, creados el 12-ago) y
  dos «Viaticos Mensuales / Impulsadoras» idénticos.
- **4 proyectos comparten 2 clientes**: `D-25` aparece en «City Mall Paso Canoa» (0 documentos) y
  «City Mall Pasocanoa» (11 facturas). `D-87` en «La Frontera Duty Free» (1 entrega) y
  «La Frontera Dutty Free» (7 facturas). El agrupamiento por cliente que promete el código
  (`RegistrarGastoModal.tsx:9-13`) no está pegando.

### `mk_facturas` — 102 filas

🩸 **`estado_pago` tiene dos valores y uno solo lo usan las impulsadoras.**

| `estado_pago` | Filas | Plata | Nota |
|---|---|---|---|
| `creado` | 85 | $91.610,04 | **ninguna factura de marketing se marcó pagada nunca** |
| `pagado` | 17 | $13.600,00 | **las 17 son pagos de impulsadora** (`impulsadora_id` lleno en las 17) |

- 14 anuladas, **las 14 con motivo escrito** ✓.
- 81 de 102 traen `grupo_legacy = true`.
- `tiene_importacion`: 3 de 102.
- Fechas: van desde **feb-2024**. La carga histórica es real, no de prueba.

### Mobiliario — `mk_inventario_productos`, 6 filas

🩸 **El stock ya no cuadra con nada, y 5 de los 6 productos están en cero exacto.**

| Producto | Stock hoy | Piezas entregadas | «Comprado» que muestra la pantalla |
|---|---|---|---|
| Paneles | **0** | 228 | 228 |
| Tablas | **0** | 625 | 625 |
| Conjunto soporte | **0** | 603 | 603 |
| Norte colgador | **0** | 216 | 216 |
| Barra plana | 18 | 543 | 561 |
| Barra flauta | **0** | 68 | 68 |

- El post-mortem dice «Barra plana −95 y Norte colgador −16». **Hoy no es así**: Barra plana está
  en **+18** y Norte colgador en **0**. Alguien reescribió los stocks a mano entre medio, y no hay
  cómo saber quién ni cuándo (ver el hallazgo 4).
- 🩸 **«Comprado» no es un dato: es `Entregado + Disponible`** (`mobiliario/page.tsx:546` y `:671`).
  No existe ninguna forma de registrar una compra de muebles. Con el stock en cero, la columna
  «Comprado» dice exactamente lo entregado — no porque alguien lo haya anotado.
- `foto_path`: 6 de 6 ✓.

### `mk_entrega_items` — 111 renglones

| Campo | Lleno | Nota |
|---|---|---|
| `reparto[].cantidad` (las **piezas**) | **111/111** | ✓ es lo que descuenta el stock |
| `reparto[].marca_id` | 111/111 | Tommy 55 · Calvin 51 · Joybees 5 |
| **`bultos`** | **0/111** | 🩸 **nunca se llenó uno** |
| `reparto[].empresa` | **0/111** | columna muerta dentro del JSON |

### `mk_entregas_muebles` — 24 filas

- `numero`: va del 1 al 25 y **falta el 23** → una entrega se borró y **no está en ninguna parte
  de la app** (ver el hallazgo 2).
- `notas` (el «Nombre de la entrega»): **2 de 24 (8%)** — «Reposicion» y «nueva tienda».
- `total_por_empresa_interna`: **0 de 24** — columna muerta.
- Plata en muebles: **Tommy $48.587,00 · Calvin $31.220,00 · Joybees $1.540,00**.

### `mk_periodos` (cerrar el período de una marca) — 6 filas

🩸 **Ninguna persona ha cerrado nunca un período.** El único que figura cerrado dice
`cerrado_por = 'migracion'`. Los otros 5 llevan **24 días abiertos** desde que la migración los
creó el 12-ago. `reporte` está **NULL en los 6**.

Y el reparto de documentos no es un reparto: hay **94 documentos sellados** y **73 de ellos (78%) están en DOS períodos a la vez**
(el viejo `pvh` y su período por marca); **9 facturas no están en ninguno**; y **1 sello apunta a
una factura que ya no existe** (otro borrado duro, ver el hallazgo 2).

### `mk_mobiliario_notas_proveedor` — 6 filas

Se queda **separada del inventario a propósito** — es lo que te cuesta a ti, no lo que le reportas
a la marca. Eso no se toca. Lo que sí se puede medir: **2 de los 6 nombres no coinciden** con el
inventario («Conjunto soporte tabla» vs «Conjunto soporte», «Flauta» vs «Barra flauta»), así que
la ayuda del «?» y la tabla de arriba nombran distinto al mismo mueble.

---

## Cuánto cuesta hacer las cosas

### Tarea 1 — Registrar una entrega de muebles con su nota (**4 en las últimas 11 semanas**)

**Hoy**, por el camino que la pantalla ofrece primero (Marketing → «Registrar gasto»):

| Paso | Toques |
|---|---|
| Inicio → «Marketing» | 1 |
| «Registrar gasto» | 2 |
| «Mueble» (pantalla «¿Qué es el gasto?») | 3 |
| Cliente: abrir el selector, escribir, tocar el resultado | 4-5 |
| Marca | 6 |
| «Continuar» | 7 |
| Llenar los renglones → «Registrar entrega» | 8 |
| «Compartir» o «Imprimir» la nota | 9 |
| «Listo» | 10 |
| **Total** | **10 toques · 3 pantallas** |

Dentro del formulario:

| | Hoy |
|---|---|
| Casilleros en pantalla | **13** — Nombre, Paneles (piezas + bultos), 4 accesorios × (piezas + bultos), 1 «otro» × (piezas + bultos) |
| **Casilleros de bultos** | **6 de 13 (46%)** — y **0 de 111 renglones** los usó nunca |
| Casilleros que se llenan de verdad | **4,6 en promedio** (111 renglones ÷ 24 entregas) |
| El «Nombre de la entrega» | opcional, y se usó en **2 de 24 (8%)** |
| Se pregunta dos veces | La marca. Ya se eligió en la puerta y el formulario vuelve a mostrar la grilla de 5 marcas — aunque **sí llega preseleccionada** (`EntregaForm.tsx:118-150`) ✓ |
| Lo que hay que recordar de memoria | Nada: el stock disponible de cada producto se muestra bajo cada casillero ✓ |

**Y hay TRES puertas al mismo formulario**: «Registrar gasto → Mueble»
(`RegistrarGastoModal.tsx:439`), «+ Entrega de muebles» dentro del proyecto
(`EntregasSection.tsx:349`) y el formulario de editar en Mobiliario
(`mobiliario/page.tsx:1196`, solo edita). El sistema ya aprendió esto en Cuentas por Cobrar:
seis puertas de cobro se juntaron en una.

**La versión más corta**

| | Hoy | Propuesta |
|---|---|---|
| Toques hasta el formulario | 7 | **3** — una ficha «Entrega de muebles» propia en el inicio de Marketing (hoy es un camino escondido detrás de «Registrar gasto»), que pida cliente y ya |
| Casilleros en pantalla | 13 | **7** — los 6 de bultos detrás de un «＋ Anotar bultos» que se abre si hace falta. **No se toca nada de la regla**: los bultos siguen existiendo, siguen siendo opcionales, `null` se sigue viendo vacío, y el stock se sigue descontando en piezas |
| Toques totales | **10** | **5** |

### Tarea 2 — Registrar una factura de marketing

**Hoy**: Marketing → «Registrar gasto» → «Factura» → cliente → marca → «Continuar» → formulario.
El formulario de facturas ya carga **varios PDF de una** (`useBulkUploadFacturas.ts`, 435 líneas) y
eso se nota: **100 PDF de factura subidos**. Aquí no hay nada roto de eficiencia.

Lo que sí cuesta: hay que elegir el cliente **en cada factura**, aunque las 17 facturas del
proyecto de Jerusalem Pasocanoa son del mismo cliente.

### Tarea 3 — Cerrar el período de una marca y mandarle el reporte

**Nunca se hizo.** 0 cierres por una persona en 24 días. El botón vive en el nivel 3
(`/marketing/[marca]/[periodo]`), a **4 toques** del inicio. **No medido**: por qué no se usa —
puede ser que el momento de cobrarle a la marca todavía no llegó, o que no se encuentra.
Es la pregunta 3 de abajo.

### Tarea 4 — Ver el inventario de muebles

Marketing → «Mobiliario» = **2 toques**. Bien.
Lo que muestra arriba es una sola línea, y hoy dice exactamente:
**`En bodega: $324,00 · Entregado: $81.347,00 · Tiendas: 13`** (medido con la misma fórmula del
código, `mobiliario/page.tsx:181-188`). Los $324,00 son **las 18 barras planas y nada más**: los
otros 5 muebles están en cero.

---

## 🩸 Lo que miente o está roto

**1. El formulario de entrega tiene 6 casilleros que nadie llenó jamás.**
`bultos` está en **0 de 111 renglones**, y sin embargo ocupa **6 de los 13 casilleros** del
formulario (`EntregaForm.tsx:874`, `:924`, `:980`), una columna en la nota de entrega en PDF y
una línea en el resumen. La columna existe desde el 8-ago (`20260808160000`, **sí aplicada** —
ver el hallazgo 6). Un mes después, cero usos.

**2. Borrar una entrega es un DELETE de verdad, y se confirma con el cuadro del navegador.**
- `deleteEntrega` (`src/lib/marketing/inventario.ts:1070-1074`) hace `.delete()`.
  **`mk_entregas_muebles` no tiene columna `deleted`** (verificado en el catálogo de producción).
  Es la excepción a «soft delete, nunca DELETE» — cheques, guías, reclamos, caja, préstamos,
  clientes y pedidos borran en blando; esto no.
- Y ya pasó: los números de entrega van del 1 al 25 y **falta el 23**.
- La confirmación es `window.confirm()` (`EntregaForm.tsx:616`): **la única de todo `src/`**,
  1 de 1 ocurrencia en el repositorio. Sin `ConfirmDeleteModal`, sin espera de 1 s, sin deshacer.
- ✔️ Red que sí existe: las 14 tablas `mk_*` están clasificadas en el respaldo
  (`src/lib/backup/tablas.ts:172-185`), así que una entrega borrada se puede sacar de la copia
  del día. Desde la app, no.

**3. «Comprado» no mide compras.** `mobiliario/page.tsx:546` y `:671`:
`comprado = entregado + stock_total`. Es un rótulo heredado sobre una resta al revés. Como hoy
el stock está en cero en 5 de 6 productos, la columna repite lo entregado y parece un dato.

**4. Mobiliario no deja rastro: 0 filas de auditoría.**
`activity_logs` no tiene ni un `entity_type` de mobiliario, ni una acción de entrega o de stock.
Las 33 filas de `marketing` son todas de impulsadoras y facturas, y la última es del **6-ago**.
Medido: **24 entregas, 111 renglones, 2.283 piezas movidas y $81.347 en muebles, sin una sola
línea de quién lo hizo.** Comparación: Caja tiene 39 filas para $563; Guías, 770.

**5. Todos los proyectos están «abierto» y nunca hubo un cierre.**
25 de 25 abiertos, `fecha_enviado` y `fecha_cobrado` vacías en las 25, y los 6 períodos por marca
siguen abiertos desde el 12-ago con el único «cerrado» firmado por `migracion`. Un estado que
nunca cambia no es un estado: es una columna.

**6. El post-mortem dice que dos migraciones están «PENDIENTES» y las dos corrieron.**
`docs/postmortems/marketing-mobiliario.md` marca `20260730120000` (numero de entrega) y
`20260808160000` (bultos + foto) como *«DDL PENDIENTE — la corre Daniel A MANO»*. Las dos están
en `supabase_migrations.schema_migrations`, junto con `20260808120000`, `20260811150000`,
`20260811160000` y `20260811180000`. En los datos se ve: `numero` lleno en 24 de 24 y `foto_path`
en 6 de 6. **La documentación va un mes atrasada.**

**7. Un aviso naranja que a partir de ahora va a salir siempre.**
`EntregaForm.tsx:1012` avisa «Vas a entregar más piezas de las que hay en el inventario» cuando
el pedido supera el stock. Con **5 de 6 productos en 0**, ese aviso se enciende en **cualquier**
entrega futura que use esos 5. Un aviso que sale siempre deja de avisar. (La regla está bien: el
stock negativo no bloquea y se muestra. Lo que está roto es el stock, no el aviso.)

**8. Columnas muertas.** `mk_entrega_items.reparto[].empresa` (0 de 111) ·
`mk_entregas_muebles.total_por_empresa_interna` (0 de 24) ·
`MetricCard` en `mobiliario/page.tsx:1299` está definido y **no se usa** (24 líneas), y el
comentario de cabecera del archivo todavía promete *«4 cards de métricas»* que se retiraron.

---

## Coherencia con el sistema

| Regla de la casa | Marketing | Diferencia |
|---|---|---|
| Soft delete, nunca DELETE | Facturas y proyectos ✓ (`anulado_en` + motivo). **Entregas: DELETE real** | ✗ |
| Borrado destructivo con `ConfirmDeleteModal` | Sí en Mobiliario, Facturas e Impulsadoras ✓. **`window.confirm()` al borrar una entrega** | ✗ |
| Deshacer de 5 s en lo destructivo | Solo en Fotos (`FotosSection.tsx`). No al borrar una entrega ni una factura | ⚠ |
| Un solo selector de cliente | ✓ `ClientePicker` cerrado, sin salida «Otro» (`RegistrarGastoModal.tsx:159`), con candado `un-solo-selector-de-cliente.test.ts` | ✓ |
| Nada se ata por parecido; la identidad es el código | ✓ el cliente entra por `tienda_codigo`. ⚠ pero 6 de 25 proyectos no lo tienen y 4 comparten 2 códigos |  ⚠ |
| Excel desde la fila 1, por la librería de la casa | ✓ candado `excel-exports-marketing.test.ts` | ✓ |
| Sin `$0.00` en letra grande | ✓ y bien pensado: `notas-proveedor.ts:84` muestra «—» para un costo desconocido, y `EntregasSection.tsx:145` esconde los chips de marca en $0 | ✓ |
| El PDF de la nota se arma antes del clic (iOS) | ✓ `NotaEntregaAcciones` pide los datos al desplegar (`GET /api/marketing/entregas-pdf/[id]/datos`) | ✓ |
| Una sola puerta por acción | **3 puertas** al mismo formulario de entrega | ✗ |
| Auditoría de lo que mueve plata o stock | **0 filas** para entregas y stock | ✗ |
| Tuteo, cero voseo | ✓ en pantalla. **84 «acá» en comentarios de código**. El candado ignora comentarios; la regla escrita no | ⚠ |

---

## El iPhone (390 px)

**No medido en el navegador en esta sesión.** Lo que sí se puede afirmar leyendo el código y los
candados:

- **Las dos tablas de Mobiliario no aparecen en el teléfono**: son `lg:hidden` → tarjetas por
  debajo de 1024 px (`mobiliario/page.tsx:531`). La medición que dejó escrita el archivo
  (líneas 8-16): sin eso se recortaban 338 px a 390, y se perdían ENTREGADO, DISPONIBLE, VALOR
  y ACCIONES **sin scroll y sin aviso**.
- **El formulario de entrega**: la grilla de marcas es `grid-cols-2` fija (`EntregaForm.tsx:754`)
  → con 5 marcas activas son 3 filas de tarjetas a 390 px. Los accesorios pasan a una columna
  (`grid-cols-1 sm:grid-cols-2`) ✓. Cada renglón lleva **dos** casilleros lado a lado (piezas +
  bultos, el de bultos con `w-20` fijo) — es la parte más apretada de la pantalla, y es
  justamente la de los 6 casilleros que nunca se usaron.
- **Nada por debajo de 12 px** en todo el módulo: 0 usos de `text-[10px]` y `text-[11px]`.
- El botón apagado dice **por qué** está apagado en la pantalla y no en un globito
  (`EntregaForm.tsx:1078`) — correcto para el iPhone, donde `title=` no existe.
- Candados vigentes: `iphone-tocables-y-letra.test.ts` (líneas 53, 89, 92, 137) y
  `iphone-formulas-marca.test.ts`.
- Desbordes conocidos que el propio post-mortem midió y dejó marcados como **anteriores** a los
  últimos cambios: 5 px a 390 dentro del scroller de la tabla del detalle del proyecto y 15 px a
  834 en la tira de navegación de `/marketing`. **No los volví a medir.**

---

## Lo que sobra · lo que falta

### Sobra (con la medición que lo prueba)

| Qué | Prueba |
|---|---|
| Los 6 casilleros de bultos del formulario | 0 de 111 renglones |
| El casillero «Nombre de la entrega» | 2 de 24 (8%) |
| `reparto[].empresa` y `total_por_empresa_interna` | 0 de 111 y 0 de 24 |
| `MetricCard` en Mobiliario | definido, 0 usos |
| Dos de las tres puertas al formulario de entrega | la misma acción en 3 lugares |
| Los 7 proyectos vacíos, incluidos «J» y «D» | 0 facturas, 0 entregas, 0 fotos |
| El paso «¿Qué es el gasto?» para el mueble | siempre es el mismo camino de 3 opciones antes de poder empezar |
| El estado `fecha_enviado` / `fecha_cobrado` | 0 de 25 en 5 meses |

### Falta

| Qué | Prueba |
|---|---|
| **Poder anotar una compra de muebles** | «Comprado» es una resta al revés; el stock se teclea a mano y hoy está en cero en 5 de 6 |
| **Rastro de quién movió el stock y las entregas** | 0 filas de auditoría para $81.347 en muebles |
| **Que borrar una entrega sea reversible** | falta la entrega N°23 y no hay forma de verla desde la app |
| Que el proyecto se busque por código y no se duplique | D-25 y D-87 tienen dos proyectos cada uno |
| Que la nota de entrega tenga a quién echarle la culpa | `notas` lleno en 2 de 24; la nota sale como «Entrega de muebles» a secas |
| Que los períodos por marca se cierren (o se retiren) | 0 cierres por una persona en 24 días, `reporte` NULL en los 6 |
| Que las notas del proveedor nombren igual que el inventario | 2 de 6 nombres distintos para el mismo mueble |

---

## Preguntas para Daniel

**1. El formulario de entrega tiene 6 casilleros de «Bultos» y en 111 renglones nunca se llenó uno. ¿Qué hacemos?**
- a) Esconderlos detrás de un «＋ Anotar bultos» que se abre solo si lo necesitas. Nada más cambia: los bultos siguen guardándose, siguen siendo opcionales, en blanco siguen saliendo vacíos en la nota, y el inventario se sigue descontando en piezas.
- b) Quitarlos del todo.
- c) Dejarlos.
**Recomiendo (a).** Es reversible y le quita a la pantalla casi la mitad de los casilleros. La (b) no, porque tú mismo dijiste que el bulto es cómo viajó la mercancía y algún día vas a querer anotarlo.

**2. Los 25 proyectos están «abierto» y ninguno se marcó nunca como enviado ni cobrado. ¿El estado sirve o sobra?**
- a) Sobra: se quita de la pantalla y el proyecto es solo una carpeta por tienda.
- b) Sirve pero no se encuentra: hay que poner «Enviado a la marca» y «Cobrado» donde se vean.
- c) Dejarlo.
**Recomiendo (b) si de verdad le mandas el reporte a la marca, (a) si no.** Esto no lo puedo saber midiendo: la base solo me dice que nunca se tocó, no si el momento llegó. Dímelo tú.

**3. Nadie cerró nunca un período de marca: los 6 siguen abiertos desde el 12-ago y el reporte está vacío en los 6. ¿Es que no llegó el momento de cobrarle a la marca, o que el botón está muy escondido (4 toques desde el inicio)?**
- a) No llegó el momento — se cierra una o dos veces al año y está bien así.
- b) Está escondido: hay que sacarlo al inicio de cada marca con «Cerrar y armar el reporte».
- c) No lo vamos a usar: se retira.
**Recomiendo esperar tu respuesta antes de tocar nada.** Es el único caso donde el dato no alcanza para recomendar: cero usos puede ser «todavía no» o «no sirve», y son arreglos opuestos.

**4. Borrar una entrega hoy la saca de la base para siempre (ya pasó una vez: falta la N°23) y se confirma con el cuadro gris del navegador, el único de todo el sistema. ¿Lo alineamos?**
- a) Sí: mismo cuadro de borrar que el resto del sistema, borrado en blando (queda guardada pero no se ve) y Deshacer de 5 segundos.
- b) Solo cambiar el cuadro, dejando el borrado como está.
- c) Dejarlo.
**Recomiendo (a).** Son 24 entregas por $81.347 en muebles y el borrado devuelve stock: equivocarse ahí mueve el inventario y no queda ni quién lo hizo.

**5. El inventario de muebles hoy dice 0 en 5 de los 6 productos, y no hay ninguna pantalla para anotar una compra: el número se escribe a mano encima. ¿Cómo lo arreglamos?**
- a) Agregar «Entró mercancía» — fecha, producto, piezas — y que el stock sea siempre la suma de lo que entró menos lo que salió.
- b) Dejar que se teclee a mano pero guardar quién lo cambió y cuándo.
- c) Dejarlo.
**Recomiendo (a).** Mientras el stock se teclee encima, la columna «Comprado» de la pantalla va a seguir siendo una cuenta al revés y no un dato. Si (a) te parece mucho trabajo por 6 muebles, la (b) es media hora y ya deja rastro.

**6. Hay tres botones distintos que abren el mismo formulario de entrega (desde «Registrar gasto», desde el proyecto, y editando en Mobiliario). ¿Los juntamos en uno solo, como hicimos con «Cobrar» en Cuentas por Cobrar?**
- a) Sí: una ficha «Entrega de muebles» en el inicio de Marketing, y las otras dos entradas se quedan solo para editar lo que ya existe. Baja de 10 toques a 5.
- b) Dejar las tres.
**Recomiendo (a).** Es el mismo movimiento que ya aprobaste en Cuentas por Cobrar y aquí el ahorro está medido: la mitad de los toques para lo que haces dos veces al mes.
