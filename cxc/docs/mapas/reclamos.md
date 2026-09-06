# Reclamos — el mapa

> Medido contra producción el **5-sep-2026** (SQL de solo lectura + `src/app/reclamos/**`, `src/app/api/reclamos/**`, `src/lib/reclamos/**`).
> Ruta: `/reclamos`. Key del módulo: `reclamos`. Correo al proveedor desde `info@fashiongr.com`.
> **Ningún número de aquí sale de la documentación: todos se remidieron.**

---

## Qué es, quién entra, cuánto se usa

**Qué hace.** Es donde se le reclama al proveedor la mercancía que llegó mal: faltó, sobró, vino manchada o la factura está equivocada. Se anota el reclamo con sus renglones y sus fotos, se le manda un Excel por correo al proveedor, y cuando el proveedor paga (nota de crédito) se marca como pagado con su comprobante.

**Quién entra: `admin` y `secretaria`.** Coincide en las tres fuentes: `src/lib/modules.ts:174`, `role_permissions` en producción (admin ✓, secretaria ✓) y `requireAdminOSecretaria` en las rutas. **Sin diferencias.** La única grieta está abajo (🩸 #10).

**Cuánto se usa — 47 reclamos en toda la historia del módulo:**

| Mes | Abiertos | Borrados después | Empresas distintas |
|---|---:|---:|---:|
| abr-2026 | 8 | 2 | 3 |
| may-2026 | 10 | 1 | 2 |
| jun-2026 | 20 | 8 | 2 |
| jul-2026 | 6 | 2 | 3 |
| ago-2026 | 3 | 0 | 1 |
| sep-2026 | **0** | — | — |

**Quién los escribe:** de los 39 altas registradas, **30 las hizo `andrea` (secretaria)** y 9 `daniel` (admin). Es un módulo de UNA persona. Última alta: **26-ago-2026 (hace 10 días)**.

**La plata:**

| | Reclamos | Con impuestos |
|---|---:|---:|
| Abiertos hoy | 29 | **$14,939.64** |
| Cobrados en toda la historia | 5 | **$5,306.62** |
| Abiertos hace más de 45 días | **27** | **$12,218.27** |

- Promedio de días abierto: **145**. El más viejo: **581 días** (2-feb-2025, Fashion Wear).
- Los 5 cobros **entraron todos el mismo día: 8-jul-2026**. Ninguno antes, ninguno después.
- Tardaron 57, 65, 184, 546 y **691 días** desde la fecha del reclamo hasta el cobro.

**El correo al proveedor —que es para lo que existe el módulo— se usó 4 veces:**

| Fecha | A quién | Reclamos |
|---|---|---:|
| 23-jun-2026 | iamar@aswgr.com | 6 |
| 24-jun-2026 | iamar@aswgr.com | 16 y 1 |
| 17-jul-2026 | iamar@aswgr.com (CC info@) | 1 |

**Último correo a un proveedor: 17-jul-2026, hace 50 días.** Además hay **18 rastros de prueba** mandados a `danilevyck@gmail.com` los días 23 y 24 de junio: casi la mitad del historial de envíos son pruebas.

**Notas de seguimiento escritas por una persona: 5**, todas de `andrea`, todas el 8-jul-2026. Las otras 42 las escribió el sistema solo.

---

## Cuánto cuesta hacer las cosas

### Tarea 1 — abrir un reclamo (39 veces; la mediana es de **2 renglones**)

**Hoy: 28 toques, 3 pantallas, 17 campos, y de esos el sistema ya sabe 10.**

| Paso | Toques | ¿El sistema ya lo sabe? |
|---|---:|---|
| Inicio → «Reclamos» → «Nuevo Reclamo» | 2 | — |
| Empresa (desplegable) | 2 | La deduce del PDF de la factura, si lo subes |
| N° Factura | 1 + teclear | Está en el PDF de la factura |
| Fecha | 0 (viene hoy) | ✅ ya viene |
| N° Pedido | 1 + teclear | Está en el PDF de la factura |
| Renglón × 2: Referencia · Descripción · Talla · Género · Cantidad · Precio | 20 | **Descripción y Precio los tiene la base**; Género se deduce |
| Renglón × 2: Motivo | (incluido arriba) | — |
| «+ Agregar fila» | 1 | — |
| «Guardar Reclamo» | 1 | — |

**Lo que el sistema ya sabe y hoy se teclea igual — medido, no supuesto:**

| Dato | Cuántos renglones | De dónde sale |
|---|---:|---|
| El código del renglón existe en las llegadas de mercancía | **91 de 127 (72%)** | `switch_ingresos_mercancia` |
| El precio tecleado es **exactamente** el costo de la llegada ÷ 1,10 | **72 de 127 (57%)** | el mismo cálculo de FOB que ya hace Referencia |
| El nombre del producto está en la llegada | 91 de 127 | la misma fila |

Es decir: en más de la mitad de los renglones la persona teclea a mano un precio que el sistema ya tiene guardado, al centavo.

**El atajo que existe casi no se usa.** Subir el PDF de la factura hace que la IA llene empresa, N° factura, fecha y N° pedido de un tirón. **Solo 4 de los 34 reclamos vivos tienen ese PDF (12%)**. Y aunque lo uses, la IA llena los **4 campos baratos** de la cabecera y deja los **14 caros** de los renglones.

**La versión más corta: 28 toques → 7.**
1. Subes el PDF de la factura → cabecera llena (ya existe).
2. Pegas o escribes los códigos, uno por línea → el sistema trae descripción, precio y género de las llegadas.
3. Eliges el motivo (uno para todo el reclamo, se corrige por renglón si hace falta).
4. Guardar.

### Tarea 2 — mandarle el reclamo al proveedor (4 veces reales)

**Hoy: 8 toques, 3 pantallas.** Inicio → Reclamos → tarjeta de la empresa → «Seleccionar» → marcar los reclamos → ícono de sobre → escribir asunto → escribir mensaje → Enviar.

- El **asunto es obligatorio y se escribe a mano, cada vez**. El sistema conoce la empresa, el proveedor, cuántos reclamos van y cuánta plata: podría proponerlo.
- El destinatario sale de `reclamo_contactos` (5 filas). **Joystep no tiene contacto** — si algún día se le reclama a Joybees, hay que teclear el correo.
- **Versión más corta: 8 → 4.** Asunto y mensaje propuestos, editables.

### Tarea 3 — reclamar de nuevo lo que no contestaron (0 veces)

**Hoy no se puede hacer en un toque, y por eso no se hace.** Medido: **27 reclamos llevan más de 45 días abiertos ($12,218.27) y nadie mandó un segundo correo desde el 17-jul**. La pantalla marca la tarjeta con un chip rojo «Alerta» y ahí termina: no hay «volver a mandar los 27», ni aviso por Telegram, ni nada que empuje.

**Versión más corta: 2 toques.** «Volver a mandar los 27 que llevan +45 días» como un botón en la tarjeta de la empresa.

### Tarea 4 — marcar que el proveedor pagó (5 veces, todas el mismo día)

**Hoy: 6 toques + 1 archivo obligatorio.** Abrir el reclamo → «Marcar pagado» → monto → fecha → adjuntar comprobante (obligatorio) → confirmar. Está bien como está: es la única acción del módulo que mueve plata y el comprobante lo justifica.

### Tarea 5 — corregir un reclamo viejo

**Hoy es casi imposible, y esto es un hallazgo, no una molestia.** Ver 🩸 #1.

---

## 🩸 Lo que miente o está roto

**#1 — 26 de los 34 reclamos vivos NO SE PUEDEN EDITAR sin rellenar 134 campos.**
El formulario declara obligatorios 7 campos por renglón, entre ellos **Género**. Medido: **108 de los 127 renglones vivos (85%) tienen el género vacío**, 25 no tienen descripción y 1 no tiene talla. Como `validateReclamoItems` valida TODOS los renglones antes de guardar (`src/lib/reclamos/validate.ts:70-77`, llamado por `src/app/api/reclamos/[id]/items/route.ts:16`), tocar un solo renglón de un reclamo viejo obliga a completar los demás. **Total de campos que habría que inventar para poder editar: 134.**
Y en la cabecera pasa lo mismo con el N° de pedido: **25 de los 33 reclamos que no son de Active Shoes (76%) lo tienen vacío** y hoy es obligatorio.

**#2 — La tarjeta de la empresa dice «facturas» y el número son RECLAMOS.**
`src/app/reclamos/components/EmpresaSelector.tsx:217` → `{open.length}` con el rótulo `facturas`. Medido: Fashion Wear muestra **20 «facturas»** cuando son **20 reclamos sobre 17 facturas distintas**. Es el mismo defecto que el «Margen %» de Ventas: rótulo heredado sobre un número que cuenta otra cosa.

**#3 — Los renglones borrados vuelven a salir en el Excel que se le manda al proveedor, y suman.**
El PDF sí los filtra (`src/lib/reclamos/pdf-bulk.ts:59`). Los **cuatro** caminos de Excel **no**: `src/lib/reclamos/excel-bulk.ts:72` y `:169`, `src/app/api/reclamos/export/route.ts:31`, `src/app/api/reclamos/[id]/excel/route.ts:27`. Y el **total de la lista** tampoco (`EmpresaList.tsx:354` y `:448`).
Hoy no hace daño porque `reclamo_items` tiene **0 filas marcadas como borradas** — y esa es la segunda mitad del hallazgo:

**#4 — La columna «borrado» de los renglones no la escribe nadie: al editar se borran de verdad.**
`PUT /api/reclamos/[id]/items` hace `.delete().eq("reclamo_id", id)` (`route.ts:21`) — un DELETE físico de todos los renglones, y vuelve a insertarlos. La columna `reclamo_items.deleted` existe, `CLAUDE.md` la lista como tabla con borrado suave, el PDF filtra por ella… y **ningún código la pone en `true`**. La copia de seguridad que hace antes (`route.ts:19`) pierde el `id` y la fecha original de cada renglón.

**#5 — El estado «En proceso» no se usó nunca.**
Producción: **Creado 29 · Pagado 5 · En proceso 0**, y **0 filas en `activity_logs` con `reclamo_en_proceso`** en toda la historia. Sostiene una ruta API propia de 73 líneas (`[id]/en-proceso/route.ts`), una ventana modal, una subida de comprobante opcional y un chip que siempre marca 0.

**#6 — Los motivos son 10 nombres para 5 cosas, y la tabla que iba a arreglarlo tiene 0 filas.**

| Lo que se escribió | Renglones |
|---|---:|
| FALTANTE · Faltante de Mercancía | 41 + 10 |
| sobrante | 26 |
| MANCHADAS · Mercancía manchada · MANCHADA · MANCHADAS AMARILLAS | 9 + 7 + 4 + 3 |
| Mercancía defectuosa | 17 |
| Error de facturación | 9 |
| destallado | 1 |

Solo **33 de 127 renglones (26%)** usan uno de los 6 motivos de la lista del sistema. `reclamo_custom_motivos` —la tabla que en la auditoría de abril reemplazó al `localStorage`— tiene **0 filas**: `constants.ts:104` sigue leyendo y escribiendo `localStorage` primero, así que los motivos nuevos viven en el navegador de una sola persona y se pierden al cambiar de equipo.

**#7 — La fecha por defecto es la de Londres, no la de Panamá.**
`ReclamosClient.tsx:87`, `:165` y `:275` → `new Date().toISOString().slice(0,10)`. Después de las **7:00 p.m. de Panamá** el formulario propone **mañana**. Es exactamente el error que Guías arregló en junio-2026 («Fecha default = HOY en hora LOCAL»).

**#8 — Tres umbrales distintos para la misma idea de «lleva mucho».**
Tarjeta de la empresa: chip «Alerta» a los **45** días (`EmpresaSelector.tsx:196`). Tabla: ámbar a los **30**, rojo a los **60** (`EmpresaList.tsx:470`). Nada dice por qué son tres.

**#9 — El N° de factura es texto libre y ya hay basura adentro.**
Un reclamo de Vistana tiene como número de factura: `3000013662 - 3000013657 - 30000136603000013658 - 3000013662 -` — cinco números pegados, uno repetido y dos sin separar. Otro tiene `200007286`, de 9 dígitos, cuando todos los demás tienen 10. Ninguno de estos cruza con nada.

**#10 — La lectura de `/api/reclamos` deja pasar un rol que no existe.**
`src/app/api/reclamos/route.ts:15` → `['admin','secretaria','upload']`. **`upload` no está en `SYSTEM_ROLES`** (`src/lib/modules.ts:224`): es un rol muerto de antes. Hoy no abre ninguna puerta porque nadie lo tiene, pero es una lista escrita a mano que se separó de la fuente única.

**#11 — Un Excel se salta el helper de la casa.**
`src/app/api/reclamos/export-excel/route.ts:34` usa `XLSX.write(...)` directo, sin `workbookBytes`/`workbookBuffer`. Los otros dos caminos (`excel-bulk.ts:175`) sí lo usan. Además esa ruta **no filtra los reclamos borrados** (`.in("id", ids)` sin `.eq("deleted", false)`).

**#12 — `$0.00` en letra grande.**
Active Wear (Karl Lagerfeld) y Joystep (Joybees) **nunca tuvieron un reclamo**. Sus dos tarjetas muestran `0` y `$0.00` en 24 px (`EmpresaSelector.tsx:217-218`). La regla de la casa es que un cero grande se lee como dato roto.

**#13 — Dos textos rotos.** «Todo al dia» sin tilde (`EmpresaList.tsx:413`) y «Correo con Excel adjunto enviado a … **(1 reclamos)**» en el rastro que queda en el historial (`send-zip/route.ts`, nota 93).

**#14 — El comentario del código dice «×10 empresas»** (`EmpresaSelector.tsx:204`) cuando son **6**, y de esas 6 solo 4 han tenido un reclamo alguna vez.

---

## El arreglo del proveedor por código — verificado

**Quedó bien, y es el único camino.** `proveedor_codigo` está lleno en **34 de 34** reclamos vivos. La única superficie que cruza reclamos con la ficha de un proveedor es `src/app/api/proveedores/[key]/route.ts:33-47`, y usa `paresDelProveedor` + `reclamosDelProveedor` — igualdad exacta sobre el par **(empresa, código)**, nunca el nombre. Barrí el repo: **no queda ni un `ilike`, ni un `normProvName`, ni un match por parecido entre reclamos y proveedores.**

El código se reescribe desde el mapa del servidor tanto al crear (`api/reclamos/route.ts:80`) como al cambiar de empresa al editar (`[id]/route.ts:112`). Y el par importa de verdad: el código **`122` es «American Fashion Wear» en Fashion Wear y «Latin Fitness Group» en Active Shoes** — las dos empresas tienen reclamos vivos con ese mismo código.

⚠️ Lo único que queda suelto: **3 de los 13 reclamos borrados** no tienen código. No molesta a nadie (están borrados), pero si alguno se restaura, no se pega a su proveedor.

---

## Coherencia con el resto del sistema

| Regla de la casa | Reclamos | Nota |
|---|---|---|
| Sin voseo | ✅ | Cero voseo en pantalla, PDF, Excel y correo. (En comentarios de código hay 6 «acá» — el candado no los mira, pero la casa dice «aquí».) |
| Borrado suave con `deleted` | ⚠️ | La cabecera sí. Los **renglones se borran de verdad** (🩸 #4). Los settlements sí. |
| Excel por `workbookBytes`/`Buffer` | ⚠️ | 2 de 3 caminos. Uno usa `XLSX.write` (🩸 #11). |
| Excel empieza en la fila 1 | ✅ | `buildReclamoSheet` arranca en A1. |
| PDF con logo Fashion Group | ✅ | `pdf-bulk.ts:9`. |
| `leerTodoPaginado` cuando puede pasar de 1.000 | ❌ | **0 usos.** `GET /api/reclamos` trae todo con sus renglones, fotos y notas anidados, sin paginar. Con 47 filas no muerde; el día que sean 1.001, corta en silencio. |
| Panamá es UTC−5 | ❌ | 🩸 #7. |
| Un cero grande no se muestra | ❌ | 🩸 #12. |
| Confirmación solo para borrar | ✅ | `ConfirmDeleteModal` con retardo de 1 s. |
| Deshacer de 5 s en lo destructivo | ❌ | Borrar un reclamo no ofrece deshacer, aunque es borrado suave y se podría. |
| «Correo», no «Email» | ✅ | Dice «Correo» en toda la pantalla. |
| Nombre de empresa corto | ❌ | Usa el nombre largo («Vistana International», no «Vistana»). Es el nombre que va en el papel del proveedor, así que puede ser deliberado — **decisión pendiente**. |
| Historial espejo del breadcrumb | ⚠️ | Los **3 niveles** (selector → empresa → detalle) usan `push`: correcto, y por eso `CLAUDE.md` lo cita como patrón. Pero **buscador, filtro de estado y orden viven solo en `useState`, no en la URL**: al volver del detalle se pierden los 3, y una lista filtrada no se puede compartir por enlace. **0 usos de `useUrlState`** en el módulo. |
| Búsqueda global | ⚠️ | Busca por N° de reclamo y N° de factura, **cortado en 5 sin decirlo** (`api/search/route.ts:82`). No busca por proveedor ni por código de artículo. |

---

## El iPhone (390 px)

**Está bien resuelto, y es de los mejores del sistema.** La lista tiene vista de tarjetas propia por debajo de `lg` (`EmpresaList.tsx:351`) y la tabla se esconde (`:428`). Todos los botones de la tarjeta son de 44 px. Los 5 íconos de 26 px de la fila de escritorio están así **a propósito y documentado**: solo existen de 1024 px para arriba.

Lo que sí se estrecha:

- **La tabla de renglones al editar** (`ReclamoDetail.tsx:578`) es un `ScrollableTable` de **700 px de piso con 10 columnas**. Debajo de `lg` hay tarjetas (`:657`), así que en el iPhone se ve bien; entre 390 y 1024 el que edita arrastra.
- **El formulario nuevo** usa `text-base` en móvil (16 px) — correcto, evita que iOS haga zoom al enfocar.
- El género es un desplegable de 4 opciones con etiqueta en español; el valor guardado sigue en inglés por el CHECK de la base. Documentado y correcto.

---

## Lo que sobra · lo que falta

### Sobra

| Qué | Por qué (medido) |
|---|---|
| El estado **«En proceso»** | 0 usos en 5 meses. Ruta API de 73 líneas + modal + chip que siempre dice 0. |
| El chip **«En proceso»** de la lista | Siempre 0. |
| Las tarjetas de **Active Wear** y **Joystep** | 0 reclamos históricos, y Joystep ni siquiera tiene contacto cargado. |
| **`nro_factura` y `nro_orden_compra` a nivel de renglón** | **127 de 127 vacíos (100%)**. Dos columnas que se arreglaron para que «no se perdieran al editar» y nunca tuvieron nada que perder. |
| `ESTADO_DISPLAY` y `estadoLabel` | Objeto vacío, la función devuelve siempre lo que recibe (`constants.ts:88-93`). |
| `itemsWarning` | Siempre `""`, siempre viaja como `undefined` (`api/reclamos/route.ts:101`). |
| El rol `upload` | No existe. |
| El chip **«Alerta»** de la tarjeta | Marca los +45 días pero no lleva a ningún lado: dice que hay un problema y no ofrece resolverlo. Se queda solo si se le cuelga la acción. |

### Falta

| Qué | La medición que lo pide |
|---|---|
| **Traer descripción y precio de las llegadas** | 91 de 127 renglones (72%) cruzan por código; 72 (57%) tienen el precio exacto en la base. |
| **Volver a reclamar en un toque** | 27 reclamos, $12,218.27, promedio 145 días, **cero segundos correos desde el 17-jul**. |
| **Que el módulo avise solo** | No hay ningún aviso de Telegram de Reclamos. El más viejo lleva **581 días** y nadie se enteró. Cumple la regla de 🔧 SISTEMA: es real, no se arregla solo, y alguien tiene que actuar. |
| **Asunto del correo propuesto** | Se escribe a mano en cada uno de los 4 envíos. |
| **Aflojar los campos obligatorios en lo viejo** | 134 campos bloquean la edición de 26 reclamos. |
| **Una lista de motivos que mande** | 10 grafías para 5 conceptos; la tabla que lo resolvería tiene 0 filas. |
| **Contacto de Joystep** | 5 contactos para 6 empresas. |

---

## Preguntas para Daniel

**1. El módulo entero: 3 reclamos en agosto, 0 en septiembre, y el último correo a un proveedor hace 50 días. ¿Sigue vivo?**
a) Sigue, y lo que falta es que empuje solo (aviso de Telegram + «volver a reclamar» de un toque).
b) Sigue tal cual: se usa cuando llega un contenedor con problemas y eso pasa a rachas.
c) Se retira y los reclamos se manejan por correo directo.
→ **Recomiendo (a).** Hay **$12,218.27 en 27 reclamos que llevan un promedio de 145 días sin que nadie los vuelva a tocar**, y el más viejo lleva 581. La plata está ahí; lo que no está es el empujón.

**2. Los renglones: hoy se teclean código, descripción, talla, género, cantidad, precio y motivo. El sistema ya tiene descripción y precio de 91 de los 127 (72%), y el precio exacto de 72 (57%). ¿Los trae solo?**
a) Sí: escribes el código y se llenan descripción, precio y género; los corriges si hace falta.
b) Sí, pero solo la descripción y el precio (el género se sigue eligiendo).
c) No, se sigue tecleando todo.
→ **Recomiendo (a).** El precio tecleado es, al centavo, el costo de la llegada ÷ 1,10 en 72 casos: es un número que ya está guardado y se está copiando a mano.

**3. Género es obligatorio y está vacío en 108 de los 127 renglones (85%). Hoy eso bloquea la edición de 26 de los 34 reclamos vivos (134 campos que rellenar).**
a) Deja de ser obligatorio; se llena solo cuando el sistema lo sabe.
b) Sigue obligatorio para los nuevos, y los viejos se pueden editar sin él.
c) Sigue obligatorio para todos.
→ **Recomiendo (b).** Lo nuevo sale completo y lo viejo deja de estar congelado. (a) perdería un dato que el proveedor extranjero sí usa.

**4. «En proceso»: 0 usos en toda la historia. ¿Se va?**
a) Se va: quedan «Creado» y «Pagado», y el comprobante se pide solo al pagar.
b) Se queda: no molesta.
→ **Recomiendo (a).** Un chip que siempre dice 0 y una ventana que nadie abrió le quitan espacio a lo que sí se mira.

**5. Los motivos: hoy se escriben a mano y hay 10 grafías para 5 cosas (FALTANTE / Faltante de Mercancía; MANCHADAS / MANCHADA / MANCHADAS AMARILLAS / Mercancía manchada).**
a) Lista cerrada de 5, sin «otro»: Faltante · Sobrante · Manchada · Defectuosa · Error de facturación.
b) Lista de 5 + «otro» escrito a mano, pero guardado de verdad en la base (hoy vive en el navegador de una sola persona).
c) Como está.
→ **Recomiendo (a).** Los 127 renglones caben en esas 5; «destallado» (1 renglón) es el único que no, y encaja en Defectuosa.

**6. Las tarjetas de Active Wear y Joystep: 0 reclamos en toda la historia y $0.00 en letra grande.**
a) Se esconden hasta que tengan el primero.
b) Se quedan las 6 siempre, para que se vea que existen.
→ **Recomiendo (a).** Y si se quedan, que digan «Todavía no hay reclamos» en vez de $0.00.
