# Fashion Group — www.fashiongr.com

> 🔴 **Estado del proyecto y pendientes vivos: [docs/estado-actual.md](docs/estado-actual.md) — léelo al empezar cualquier sesión.**
>
> 🗺️ **El sistema módulo por módulo — qué es, quién lo usa, cuánto se usa y qué se puede mejorar: [docs/eficiencia/README.md](docs/eficiencia/README.md)** (4-sep-2026, medido contra producción). Cuatro archivos con el mapa interno de los 22 módulos; el README trae lo urgente y las decisiones que solo puede tomar Daniel.

## Cómo trabajar con Daniel

Tres reglas que valen para todo encargo en este repo. No están en la memoria de nadie: están aquí para que las herede cualquiera que abra el proyecto.

### 1. Español latinoamericano neutro, tuteo. Nunca voseo.

> «no soy argentino, ni a mí ni en el sistema pongas palabras argentinos, somos latinoamericanos normal… por ejemplo vi "elegi el periodo" es elige el periodo» — Daniel, 1-sep-2026

Vale al hablarle a él **y** en todo texto del sistema: pantalla, PDF, Excel, Telegram, correo y comentarios de código.
**elige · escribe · revisa · guarda · toca · mira · aquí · tienes · puedes · tú.**
Nunca *elegí · escribí · revisá · guardá · tocá · mirá · acá · tenés · podés · vos*.
Candado: `src/__tests__/lib/nada-de-voseo.test.ts` (barre `src/**` menos los tests, con los comentarios borrados). El encabezado de ese archivo explica qué se prohíbe y qué no.

### 2. Resumido y simple. Daniel es el dueño, no programador.

> «necesito que me hables lo más resumido posible siempre y de manera sencilla, que no soy experto ni programador»

> «siempre háblame diciendo dónde está lo que estamos tocando y el ahora y después para aprobar»

O sea: cada respuesta dice **qué módulo/pantalla se toca**, **cómo está hoy** y **cómo quedaría**. Sin nombres de tabla ni jerga cuando se puede decir con el nombre que él usa («Gastos», «la cartera de Boston», «la planilla»).

### 3. 🔴 Mapear → definir juntos → ejecutar. Nunca al revés.

> «mapea y recomienda. Cuando terminamos de definir de dónde sale cada cosa lo ejecutas. No antes. Porque a veces tú te equivocas porque no sabes lo que sé yo de mi negocio»

> «¿Te parece así? mapear → definir juntos → ejecutar. Cuando es necesario mockup de ahora vs después, sencillo, sin tantas palabras.»

- **Mapear** = medir contra producción antes de opinar, y contar lo que le importa al negocio, no lo que es fácil de contar. Ejemplo: artículos **con existencia** (5.040), no el catálogo histórico completo (16.619).
- **Definir juntos** = él decide de dónde sale cada dato. Si hace falta ver la diferencia, va un **mockup de ahora vs después**: dos cuadros lado a lado, el número o el texto que cambia, y nada más. **Visual, no ensayo** — sin párrafos explicativos alrededor de cada cuadro. Y **solo cuando es necesario**: si una tabla de dos líneas alcanza, con eso basta.
- **Ejecutar** = recién después. Escribir código antes de que él defina es el error, aunque el código esté bien.

## Stack
- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (project: rspocgqhtpveytgbtler), PostgreSQL
- **Hosting:** Vercel
- **Styling:** Tailwind CSS
- **Email:** Resend API
- **PDF:** jsPDF + jspdf-autotable
- **Excel:** xlsx-js-style

## Empresas del grupo
Vistana International, Fashion Wear, Fashion Shoes, Active Shoes, Active Wear, Joystep, Confecciones Boston, Multifashion

## Roles

> 📄 Las notas largas de cada rol, verbatim: [docs/postmortems/navegacion.md](docs/postmortems/navegacion.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

| Rol | DB value | Acceso |
|-----|----------|--------|
| Admin | `admin` | Todo |
| Secretaria | `secretaria` | upload, guias, caja, reclamos, cheques, directorio, marketing, comisiones, **Cuentas por Cobrar**, **catálogos incluido ADMINISTRAR**, KPIs dashboard |
| Bodega | `bodega` | guias (despacho), catálogos (**solo ver**), referencia, asistencia (solo aprobar), búsqueda global (guías+directorio). El directorio aparece solo en la búsqueda global, NO como módulo navegable. ⚠️ **No hay auto-redirect**: bodega tiene 4 módulos, no uno |
| Contabilidad | `contabilidad` | prestamos, proveedores, ventas, búsqueda global (ventas+prestamos). En API directorio solo lectura (GET), no edición |
| Vendedor | `vendedor` | catálogos (**solo ver** + armar pedidos), CXC, directorio, guías (solo lectura), búsqueda global (CXC+directorio) |
| Gerente ACS | `gerente_acs` | SOLO Multifashion (`/multifashion` + `/api/multifashion/*`), y **el módulo COMPLETO** — todo el histórico, igual que admin. Auto-redirect desde home (único módulo). Módulos vía `role_permissions` |
| Gerente Confecciones Boston | `gerente_boston` | Confecciones Boston (`/boston` + `/api/boston/*`), la cartera `/api/cxc/boston`, la planilla de Boston, y **Catálogos solo para VER**. Aterriza en `/boston` por su CASA (`MODULO_CASA_POR_ROL`), no por el auto-redirect de módulo único. **NO ve la búsqueda global, ni el CXC del grupo, ni Ventas, ni Comisiones, ni Guías, ni la lista de comprobantes, ni administrar catálogos.** Módulos vía `role_permissions` |
| Marcación | `marcacion` | SOLO `/marcacion` — marcar desde el teléfono, con selfie y ubicación. Auto-redirect desde home. ⚠️ **Rodrigo la tiene siendo `bodega`**: es el módulo POR PERSONA de `MODULOS_POR_PERSONA` |

> Roles reales del sistema = los 8 de arriba (`src/lib/modules.ts` → `SYSTEM_ROLES`). No existen roles `director` ni `cliente` (el catálogo Reebok es público, sin login).
> 🔴 **MARCAR DESDE EL TELÉFONO YA FUNCIONA SIN SEÑAL** (`marcacion/cola-offline.ts`). Con señal la hora la pone el SERVIDOR; sin señal, la del teléfono, ni 10 min adelantada ni 7 días vieja. ⚠️ Con la app CERRADA no sale nada y la cola no está respaldada. 🔑 «Sin señal» **es la palabra del teléfono** y el servidor no puede probarlo — detalle y medición en el postmortem de asistencia.
## Módulos (src/lib/modules.ts)
Fuente única de navegación + permisos de UI. **3 grupos** (rediseño del home, jul-2026):
- **Ventas y clientes:** Vista General, Ventas, CXC (`/cxc` — era `/admin`; el rótulo sigue siendo «Cuentas por Cobrar» y `/admin` redirige), Multifashion, **Confecciones Boston** (`/boston`, key `boston`), Clientes/Directorio (`/clientes`), Proveedores, **Referencia** (`/referencia`, key `referencia`), Catálogos (**CUATRO** marcas ENCENDIDAS: Reebok, Joybees, Tommy Hilfiger y **Calvin Klein**, cada una con su tarjeta en el hub /catalogos/marcas, su catálogo público compartible y su pedido público `/pedido-<marca>/[id]` accesibles sin sesión)
- **Operación:** Guías de Despacho, **Asistencia y Planilla** (`/asistencia`, key `asistencia`), Reclamos, **Plantilla Switch** (`/productos/cargar`, key `cargar` — era *Depurador*; la key y la dirección NO cambiaron), Comisiones, Marketing, Caja Menuda, **Gastos** (`/gastos-contabilidad`, key `gastos-contabilidad`; 2 pestañas: *Gastos* —Egresos Varios, fuente ÚNICA— y *Saldos de banco*), Préstamos, **Recordatorios** (`/recordatorios`, era `/cheques`; la `key` sigue siendo `cheques`)
- **Administración:** Usuarios. 🩸 **Data Health se fue de la pantalla el 11-sep-2026** (Daniel no lo usa) y **la medición se quedó ENTERA** — ver `docs/donde-vive-cada-dato.md` › `data_integrity_checks` y la skill `data-integrity`.

> **Nacidos después del 5-jul-2026**: los cuatro módulos navegables `asistencia` · `gastos-contabilidad` · `referencia` · `boston`, más dos PÁGINAS públicas que **no son módulos** y por eso no tienen ficha ni entrada en `role_permissions`: `/pedido-tommy/[id]` y `/pedido-calvin/[id]`.

> 🩸 **«Packing Lists» (key `packing-lists`) se RETIRÓ el 10-sep-2026** (0 filas, nadie lo usó). Las tablas `packing_lists` y `pl_items` **NO se dropean** (patrón `mayor_lineas`), quedan `retirada` fuera del respaldo; `/packing-lists*` redirige a `/home` (307). Detalle en `docs/historico/superado.md`.

> Las fichas del home y del sidebar NO llevan subtítulo: el campo `subtitle` se eliminó de `AppModule`.
> Páginas de grupo: `/g/[grupo]` con los 3 slugs nuevos. Los slugs viejos redirigen en `next.config.js` (`/g/sistema` → `/g/administracion`; `/g/plata-entra`, `/g/plata-sale`, `/g/productos` → `/home`).
## Pendientes vivos

🔴 **Lo que Daniel pidió y sigue sin hacerse vive en [docs/pendientes-vivos.md](docs/pendientes-vivos.md)** (24 puntos, **reauditados uno por uno el 18-sep-2026**: nueve estaban resueltos y el archivo no se había enterado). Ábrelo al empezar una sesión, junto con `docs/estado-actual.md`. Daniel: *«no te olvides de las cosas porque yo me olvido y se pasan cosas»*. 🔴 **Lo que mueve plata y sigue abierto**: Multifashion sin ninguna quincena cerrada (y Fashion Wear 1–15 sep reabierta) · el cuadre del estado de cuenta que llega vacío. 🔑 **Antes de construir lo que ahí falte, compruébalo contra el código y la base.**

## Invariantes por módulo

Las reglas VIGENTES, en una o dos líneas cada una. 🔴 **Este archivo tiene que caber en 150.000 caracteres** (el harness lo corta ahí, en silencio): una regla nueva entra aquí en UNA línea, y su detalle —mediciones, citas de Daniel, candados, mutaciones— va al postmortem de su módulo (`docs/postmortems/`). Candado: `claude-md-bajo-el-tope.test.ts`.

⚠️ **Antes de tocar un módulo, lee los bloques «Lo que decía CLAUDE.md hasta el 14-sep-2026» y «…hasta el 22-sep-2026» de su postmortem**: ahí está, verbatim, todo lo que aquí se resumió en esas dos podas —mediciones, citas de Daniel, listas de candados, mutaciones— y en particular las reglas de PANTALLA (qué se dibuja, dónde, rótulos, tamaños) que aquí ya no caben.

### Boston y CXC — [docs/postmortems/boston-cxc.md](docs/postmortems/boston-cxc.md)

> 📄 Mediciones, citas de Daniel, candados, mutaciones y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026». Léelo antes de tocar una pantalla suya.

- 🔴 **Boston NUNCA se mezcla con el CXC del grupo** (ni fila, total ni export); 🔴 **el del grupo SÍ convive con el resto**: aislarlo de más también es error.
- **Fashion Group son SEIS empresas** (`B2B_EMPRESA_KEYS` = `empresasConCxc()`); Boston y ACS no. La vista **EXCLUYE, no enumera** (`switch_estadocuenta_aging`, `..._aging_mv` la materializa). Toda lectura acota por `empresa_key`.
- `gerente_boston` (David): `boston` + `catalogos` **solo VER**, casa `/boston`. No ve búsqueda global, CXC del grupo, Ventas, Comisiones, Guías, comprobantes ni administrar catálogos.
- **Sueldos recortados en el SERVIDOR** (`VE_SUELDOS_DE_BOSTON`, hoy `true`); se ENUMERA lo que viaja (`CAMPOS_SIN_DINERO`).
- `ccte_id` de Boston lleva el AÑO adentro (`serie × 10.000.000 + (año − 2000) × 100.000 + correlativo`): sin fecha se **rechaza** y la corrida se corta. Sync: **upsert → reconcile**.
- 🔴 **SU PLATA SUMA; SUS CLIENTES NO SE VEN**: su venta sigue en Ventas › Resumen y Vista General; de las superficies del grupo salen sus CLIENTES, en ambas direcciones. 🩸 **Ni entra a `clientes_master`**.
- `/api/clientes/[codigo]` pregunta `esCodigoDelGrupo()` y contesta **404**, nunca 403.
- 🔴 **Su DIRECTORIO se refresca SEMANAL sin tocar al grupo**: `sync-clientes-boston` (domingos 07:10 UTC) escribe **SOLO `switch_clientes` de Boston**. Para marcar ausente: lista completa y sin encoger bajo el **70%**; vacía = error. Alerta B, **165 h**.
- 🔴 **La secretaria cobra y ve el módulo** (`ROLES_CXC`). ⚠️ **Boston sigue afuera**: otra lista.

**La planilla de David = la de Yulissa.**

- 🔴 **Las columnas de dinero salen de UN lugar** (`columnas-dinero-planilla.ts`, 19): `PlanillaTab` y `PlanillaBoston` leen la MISMA lista.
- 🔴 **Boston pide con el MISMO corte que la contadora**: el de la quincena cerrada, o el sugerido (`corteParaBoston`); `planilla-guardada` le **fuerza Boston** (`?id=` ajeno → 404).
- 🔴 **Su Préstamos suma las tres cuentas**: saldo = `calcularSaldoPrestamo` (préstamo + daño + terceros), cuota = préstamo + terceros (el daño sin cuota es **pendiente**, no diseño).

**El rediseño.** Vive en **`/cxc`**; `/admin` EXACTO redirige 307 con su query.

- 🔴 **Cobra todo el que ve el módulo**, por la única puerta «Cobrar» (correo con **Deshacer de 5 s**).
- 🔴 **Abre por «más viejo sin pagar»** (20-sep, `ORDEN_AL_ABRIR`, override anclado a «Total pendiente»); el que nunca pagó primero y **los días se ven SIEMPRE en la fila**.
- 🔴 **El papel y el Excel cierran con el total de la PANTALLA** (20-sep): bloque «Saldo a favor (N)» y «Total general».
- 🔴 **La tira dice plata, no conteos** (20-sep).
- 🔴 **En Boston ningún monto se encima** (20-sep): UN botón, y tocar la fila abre los documentos.
- 🔴 **Se mandan SIEMPRE las 6 empresas**, mire lo que mire el filtro: lo decide el SERVIDOR (`empresasDelEnvio()`). ⚠️ El cajón SÍ conserva el filtro: es lo que se MIRA.
- 🔴 **UN correo por DIRECCIÓN, nunca uno por cliente**: un PDF con una hoja por cliente y un total al final, agrupado en el SERVIDOR. Los **sin correo NO abortan el lote** y se dicen por nombre.
- 🔴 **«Sin pagar hace +90 d»**: días desde el ÚLTIMO PAGO REAL en las 6, por **CÓDIGO**; **retenciones y recibos en cero no cuentan**, y **el que nunca pagó avisa**. «Hoy» es el de PANAMÁ.
- 🔴 **Se anota lo que se manda por los TRES canales** (correo · whatsapp · copia), 7 días; el correo lo anota `enviar-email` **tras confirmar Resend**.
- 🔴 **«Contacto» en la ficha: el sync NUNCA lo pisa**. Lo usa el saludo del correo y del WhatsApp; sin contacto, el de siempre; en un correo compartido **no se saluda a nadie**.
- 🔴 **Boston: mismo FORMATO, APARTE.** Ruta propia, **no reusa `fetchEstadoCuentaData`**; sus teléfonos y correos de `switch_clientes` acotado a Boston, **nunca de `clientes_master`**.
- 🩸 `/api/cxc-rows` se retiró; `contact-log` y `cxc-summary` se quedan. `cxc_rows` y `cxc_contact_log` **no se borran**.

**La FORMA DE SWITCH** — solo documentos ABIERTOS.

- 🔴 **NUEVE columnas, en el orden de Switch** (eran DIEZ hasta el 20-sep-2026): `Fecha · Comprobante · N. Interno · Débitos · Créditos · Saldo · Vence · Plazo · Días`; fechas **DD-MM-AAAA**.
- 🔑 **Los números no se recalculan**: `debito` y `credito` son los de Switch, `debito − credito` el saldo firmado y el corrido se acumula de ahí. 🔴 El orden `(fecha, ccte_id)` **no se mueve**.
- 🔴 **Los TRES tramos de la pantalla, no los ocho de Switch** (`cxc-aging`). ⚠️ Ante el CLIENTE van por **rango**: **«vencido» está prohibido** —`dias` es EDAD, no mora—.
- 🔴 **Nada se pliega por valer menos de $50**, en los DOS cajones; si vuelve, se agrupa **POR MONTO y NUNCA por tipo**. `documentos-chicos.ts` se conserva sin lectores.
- 🔴 **El nombre del cliente es el que escribe Switch**, no el `nombre_normalized` del PAREO; sin él se capitaliza. 🔴 **Y en TODAS las pantallas** (20-sep, `cxc/nombre-cliente.ts`); Boston aparte.
- 🔴 **«Vence» se DERIVA de la fecha + el `plazo_credito`**; con plazo 0 la celda va **VACÍA**.
- 🔴 **El cuadre**: `Saldos[]` y `saldoTotal` caen en `switch_estadocuenta_saldo` (`20261023120000`, aplicada). El cajón y «Cobrar» avisan con **un centavo** de tolerancia; sin dato de Switch no se afirma nada. ⚠️ El desfase **NO va en el papel del cliente**.
- 🔴 **SE LEE DESDE ADENTRO (18-sep-2026)**: vienen ANIDADOS en `data.estadocuenta` y los arma `filaDeCuadre` (las DOS grafías), que **falla ABIERTO a NULL — nunca un cero inventado**. ⚠️ `saldoConsecutivo` **NO construido**.
- 🔴 **«Comentario» bajó al PIE, en blanco** (20-sep).
- 🔴 **El rótulo de la ficha se mide CON la negrita**, y salen «Límite de crédito» y «Tiempo de Morosidad» (20-sep).
- ⚠️ **La empresa acreedora sale de una lista ESCRITA A MANO** (`empresa-fiscal.ts`), no del `numero_fiscal`; **las OCHO cargadas**, y la que falte sale con su nombre corto, **nunca con datos de otra**.
- 🔴 **AHÍ MISMO VIVE DÓNDE SE PAGA, CADA UNA EN SU CUENTA (20-sep-2026)**: las 8 salen por `lineasDePago`, en el PDF al pie de CADA hoja y en el correo con TODAS las del papel. **Falla ABIERTA**.
- 🔴 **Boston FIRMA COMO BOSTON.** La casa se pregunta por `empresa_key` (`casa-del-papel.ts`): su papel sale **sin el logo del grupo y sin `fashiongr.com` en el pie**. ⚠️ Su correo sale por Resend desde `fashiongr.com`: **un dominio propio sigue pendiente**.
### Guías — [docs/postmortems/guias.md](docs/postmortems/guias.md)

> 📄 Mediciones, citas de Daniel, candados, mutaciones y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026». Léelo antes de tocar una pantalla suya.

- **Completada = bloqueada**: el PUT la rechaza. **DOS excepciones que NO miran el estado**, una columna de una línea con `.eq("guia_id", id)`: `PATCH /api/guias/[id]/cliente` y `.../numero-transp`.
- Despachada se corrigen **TRES campos**: transportista · cliente · facturas; **los bultos NO** (`campos-editables.ts`).
- **El cliente vive en `guia_items.cliente_codigo`, uno por renglón**; `receptor_nombre` es quien FIRMA; elegirlo **no es obligatorio**. Las sugerencias **NUNCA atan solas**: pareo **exacto, nunca por parecido**.
- N° del transportista **POR LÍNEA** y **NO bloquea**; placa, «recibido por», cédula y **las dos firmas SÍ**. **Entrega directa**: sin placa ni transportista, `"0"` pelado se imprime vacío (`sinCeroPelado`).
- **La lista solo LEE, nunca escribe**; el refresco de facturas de hoy es la **ÚNICA salida que no es lectura**.
- 🔴 **El DESTINO se autollena con «el de siempre»**: UN destino por cliente (`guias_destino_cliente.el_de_siempre`); sin marcar, nada; sin definición, el **único** del histórico. Lo escrito no se pisa. `GUIAS_ATAJOS_NUEVOS`.
- **Al crear, el cliente se elige UNA vez y se marcan sus facturas**: por CÓDIGO (`switch_clientes`, nunca por nombre), 6 del grupo por inclusión, solo `Factura`; «ya salió en otra guía» es **aviso, nunca bloqueo**; el payload no cambia (`atajos-facturas.ts`; flag en `false` = pantalla de antes). No guarda si nada cambió (`cambios-form.ts`).
- 🔴 **DOS caminos y nada más: factura o «Traslado»** —del ENVÍO, no del cliente—: escribe el TEXTO `Traslado` en `facturas`, **empresa a mano**. Los `0000` viejos **no se tocan**.
- **La dirección del renglón es el DESTINO del envío, no la del cliente**: texto libre; los botones **se tocan, nunca se aplican solos** (historia agrupada **exacta**).
- 🔴 **Destinos definidos en `guias_destino_cliente`**, administrados en Guías › Configuración (**admin y secretaria**; bodega y vendedor 403). **Precedencia en UNA función** (`destinosDefinidosPara`): **tabla → `DESTINOS_DEFINIDOS` (red histórica; `20260918120000` aplicada) → histórico**. Soft delete **firmado, NUNCA DELETE**; única entre activas; RLS service_role; **una sola** `el_de_siempre` por cliente. No toca `guia_items`.

**La limpieza del 5-sep-2026.**

- 🔴 La factura se guarda **COMPLETA** y se muestra **CORTA** (`facturasParaMostrar`); «ya salió en otra guía» compara los **ÚLTIMOS 4 DÍGITOS DENTRO DE LA MISMA EMPRESA** (`claveDeFactura`). ⚠️ Solo se recorta la forma `NN-NNNNNN…`; `Traslado` y el `0000` dan clave VACÍA a propósito.
- 🔴 **`D-201 American Classics` ya no se ofrece al armar una guía** (`CODIGOS_RETIRADOS_DE_GUIAS`); **no se borra nada**. ⚠️ El alias D-108 → «American Classics Store», solo en `nombre-display.ts`.
- 🔴 **Bodega corrige los BULTOS al despachar, solo con la guía PENDIENTE**; **firmada, no se tocan** (por `previous.estado`). **UNA columna de UNA línea** (`items_bultos`), **nunca por `items`** del PUT; rastro en `guia_items.bultos_original/_corregido_por/_corregido_en` (`20261004120000`, aplicada). En papel, PDF y Excel sale el número **FINAL**.
- 🔴 **Guardar no reescribe la guía entera**: sin cambios no llama al servidor (`hayCambios`); los renglones viajan solo si cambiaron (`renglonesCambiaron`). ⚠️ Bodega sigue cambiando el cliente de un renglón y agregando renglones.
- 🔴 **«Cerrada en bloque el 3-ago-2026…» deja de MOSTRARSE y NO se borra** (`observacionesVisibles`). ⚠️ El campo que se EDITA sigue trayéndola.
- 🔴 **Cinco columnas retiradas de `guia_transporte`** (`firma_transportista`, `nombre_entregador`, `cedula_entregador`, `motivo_rechazo`, `monto_total`): **no se dropean**, quedan con `COMMENT` (`20261006120000`, aplicada) y candado que pone el build ROJO si se borran o si el código las toca. ⚠️ Las dos firmas en uso **no se tocan**.
- 🔴 **«Rechazada» se retiró**: `guiaYaDespachada` solo reconoce «Completada»; el PATCH ya no acepta `motivo_rechazo`.
- 🔴 **Compartir**: IMAGEN hasta 6 renglones y PDF de ahí para arriba (`formatoParaCompartir`, `MAX_RENGLONES_PNG = 6`); en computadora, **siempre PDF** —el aparato se reconoce **por el dedo** (`pointer: coarse`), no por el nombre (`aparato.ts`)—. La imagen se dibuja **sin un solo `await`**, las firmas se **precargan al abrir la guía** y una sin decodificar **no se inventa**. ⚠️ `png-guia.ts` **no arrastra jsPDF**; imprimir no cambia.
- 🔴 **«Changuinola» con «u»** en `DEFAULT_DIRECCIONES` (`20261005120000`, **aplicada**; **valor exacto**, nunca un `LIKE`).

**El panel y los defectos del 11-sep-2026.**

- 🔴 **`/guias/nueva` rebota al vendedor en el SERVIDOR**; los roles de escritura viven en **`roles-escritura.ts`**, con barrido que prohíbe escribirlos a mano. ⚠️ El vendedor sigue viendo Guías en solo lectura.
- ⚠️ **`GET /api/guias` deja las firmas afuera a propósito**: el papel se pide completo por `/api/guias/[id]`.
- ⚠️ El borde izquierdo esmeralda de la fila **no se tocó** — decisión pendiente de Daniel.

**La lista de destinos (7-sep-2026) y varios clientes (10-sep-2026).**

- 🔴 **La lista de destinos del campo dirección es DEL EQUIPO, no de un navegador**: `guias_destino_lista` (`20261014120000`, **aplicada**), en Guías › Configuración. ⚠️ **NO se fusiona con `guias_destino_cliente`**. Agregar: admin · secretaria · bodega; quitar: admin · secretaria. 🔴 **Soft delete firmado, NUNCA DELETE**; el repetido se rechaza por `claveDestino` (exacto, jamás por parecido). **Sin la DDL falla ABIERTA** a `DESTINOS_BASE` y el GET contesta 200 vacío.
- 🔴 **La semilla sale del uso REAL, nunca del `localStorage` de nadie**: **3+ usos**, grafía más usada, salvo la ya definida en `guias_destino_cliente`.
- 🔴 **Una guía lleva facturas de VARIOS CLIENTES, de a UN CLIENTE A LA VEZ** (un renglón por cliente-empresa); **reusa el MISMO `ClientePicker`** y **nada de lo que se guarda cambia** (`GUIAS_ATAJOS_NUEVOS`).

**La lista y «Definir» (19-sep-2026).**

- 🔴 Encabezados + columna de **FECHA** (anchuras en UNA constante, compartida) · pie **«47 guías de 236»** · **borde de color solo si dice algo** · el aviso es un **PUNTO en columna que existe siempre** (`avisos-de-la-fila.ts`) · **buscar abre la VENTANA, no el filtro** · **releer no borra la lista en Configuración**. 🔴 **Y los BULTOS del pie siguen a lo que se ve** (22-sep): decía «30 guías de 236 · 8.433 bultos» y las 30 suman **1.629** —5,2 veces menos— (`sumarBultos`, `pie-de-la-lista.ts`; `guias-pie-de-bultos`). **Jorman** entra a «Despachado por» y 🔴 el campo **no se preselecciona**.

**Etiquetas para los bultos (18-sep-2026).**

- 🔴 **Guías › «Etiquetas»** (admin · secretaria · bodega, `ETIQUETAS_ROLES` derivado de `GUIAS_WRITE_ROLES`; **NO** cuelga de `GUIAS_ATAJOS_NUEVOS`): se elige UNA factura de las 6 del grupo, se escriben los bultos y salen las hojas — carta en **cuartos, 4 por hoja**, jsPDF, con EMPRESA · fecha · Factura · Cliente · Destino · **«BULTO»** y debajo su número, y **sin** transportista, piezas, código de barras ni la dirección del directorio.
- 🔴 **LOS TAMAÑOS SE PIDEN EN MILÍMETROS DE ALTURA DE MAYÚSCULA, NO EN PUNTOS** (20-sep-2026, `PT_PARA_MAYUSCULA`): bulto **11** · destino **7,5** · cliente **5,5** · factura **4**. El «1» entero y el «de 4» a la MITAD, misma línea — **nunca «1/4»**. El destino se lleva el hueco hasta la raya (`hastaY`).
- 🔴 **El ESTADO SE DERIVA** de `guias_etiquetas.guia_item_id` (`20261207120000`, aplicada): sin renglón VIVO de guía VIVA vuelve sola a «Pendiente». 🔴 **El anti-duplicado (409) y el bloqueo de lo ya importado los decide el SERVIDOR**; soft delete FIRMADO con único **parcial** `WHERE NOT deleted`, así una factura borrada se puede volver a etiquetar. 🔴 **Falla ABIERTA sin la migración** y **la guía se sigue creando igual**: en `/guias/nueva` las etiquetadas solo LLENAN los renglones de siempre, juntas por cliente **y** empresa con los bultos sumados.
- 🔴 **EL DESTINO LARGO SALE ENTERO: DOS FILAS ANTES QUE ACHICAR (22-sep-2026).** Daniel: *«los destino largos que se hagan en dos filas o achicar la letra»*. **El orden es la regla**: primero se parte en filas al tamaño de siempre (7,5 mm), SOLO por espacio y nunca a mitad de palabra; si ni así entra, se baja la letra de a 0,1 mm hasta el piso **`MAY_DESTINO_MINIMO = 3,4 mm`**, y el achique arrastra el bloque entero. Módulo puro `guias/etiqueta-destino.ts`. Candado `guias-etiqueta-destino-entero` (36 casos; 14 mutaciones, 14 cazadas).
### Catálogos, pedidos y cotización — [docs/postmortems/catalogos-pedidos.md](docs/postmortems/catalogos-pedidos.md)

> 📄 Mediciones, citas de Daniel, candados, mutaciones y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026». Léelo antes de tocar una pantalla suya.

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
- 🔴 **LOS OCHO NÚMEROS DEL HUB LOS SUMA LA BASE, Y LA REGLA SIGUE SIENDO UNA (14-sep-2026).** 🩸 `/catalogos/marcas` bajaba el catálogo entero de las 4 marcas para escribir «N a la venta · N sin foto»; hoy es UNA petición. 🔴 **No hay dos definiciones de «a la venta»**: el SQL **se GENERA** desde `catalogo/contadores.ts` y la migración `20261123120000` (aplicada) es su salida impresa, comparada byte a byte. 🔴 **Falla ABIERTA**.
- 🔴 **LAS CATEGORÍAS DE REEBOK SE ADMINISTRAN, NO SE PROGRAMAN (17-sep-2026).** El mapa `rubro → categoría` vive en `reebok_rubro_categoria` (`20261205120000`, aplicada), se edita en **Catálogos › Reebok** (**solo admin**) y el Depurador lo **DERIVA**: el ESPEJO murió. 🔴 **Falla ABIERTA** a las SEIS del código; **`CategoriaReebok` CERRADO** (CHECK); **manda la MARCA**.
- 🔴 **«Sin mandar» DICE DESDE CUÁNDO, y a los 7 días se ve de lejos** (22-sep): los **$32.208** que nunca llegaron a Switch (PED-019 62 d · TOM-005 · TOM-006 · CKP-007 41 d · TOM-023 33 d) son **BORRADORES**, y su frase gris no decía hace cuánto. Ahora lleva la antigüedad y pasa a rojo a la semana (`DIAS_SIN_MANDAR_VIEJO`; los 71 envíos reales salieron **el mismo día**, máximo 4,4 h). ⚠️ `esSinMandar` y el chip filtro **no se tocaron**. `comprobantes-antiguedad`.
- 🩸 **El `color` del producto se podó de la tarjeta Y del payload** (22-sep): vacío en **391 de 391** y **nadie lo puede escribir** (la ruta lo rechaza con 400). 🔴 **El `badge` y «Consultar» SE QUEDAN**: el badge tiene puerta viva (`EDITABLE_FIELDS`) y de él cuelgan la pre-orden y «a la venta». La columna no se dropea. `catalogo-tarjeta-podada`.
- 🔴 **El logo de Tommy va de COLOR sobre placa blanca** (20-sep): el blanco tiene la bandera invertida. 🔴 Pendiente de Daniel: el master REVERSADO.
- 🔴 **LOS NÚMEROS DE COMPROBANTES CUADRAN, Y HAY UNA SOLA FORMA DE VOLVER (22-sep-2026).** Los DOS grupos de chips cuentan sobre las MISMAS candidatas —«Todos» es TODOS— y el pie dice **«13 comprobantes de 20»** con la regla común de Guías (`lib/ui/pie-de-lista.ts`): 🩸 decía «Todos 13» contra «Pedidos 13 · Borradores 2», y los **5 del «Ver más»** (pedidos del link de julio sin confirmar) no los contaba **ningún chip**. 🔴 **«Seleccionar todos» alcanza los meses PLEGADOS y DICE a cuántas filas** (marcaba 2 de 13); el borrado masivo **se queda** (medido: 1 uso en 90 días, 12 pedidos de un saque) y sigue siendo de admin y secretaria en el SERVIDOR. 🔴 **Se fueron «← Inicio» y «← Catálogo»** —los dos destinos ya están en el camino de migas—, y el camino está COMPLETO en las tres pantallas (`camino-de-migas.ts`); ⚠️ en el resto del catálogo «← Inicio» **no se toca**: ahí es la única salida. Candados: `comprobantes-cuadran` · `comprobantes-seleccion-con-accion` · `comprobantes-una-sola-vuelta`.
- 🔴 **LA TARJETA DEL HUB DICE LO QUE EL CLIENTE VE, Y SU PULSO (22-sep-2026).** Joybees decía «81 a la venta» y el catálogo mostraba **70 tarjetas** (junta las tallas de 11 modelos); Daniel: *«Sí»*, el hub dice 70 (`catalogo/tarjetas.ts`, RPC `catalogos_contadores_hub`, `20261214120000` aplicada). 🩸 **Joybees llevaba 29 días sin un comprobante y nada lo decía**: cada tarjeta lleva comprobantes · plata · «hace N días» de los últimos **90 días** —la MISMA ventana de la lista, importada de `comprobantes-ventana.ts`, nunca un 90 escrito otra vez— (`pulso-pedidos.ts`, RPC `catalogos_pulso_pedidos`; «hoy» de Panamá por parámetro; sin comprobantes NO escribe «$0.00»). Candados: `catalogo-hub-pulso` · `catalogo-hub-tarjeta-completa`.
- 🔴 **LA FOTO MANDA EN LA TARJETA (22-sep-2026).** Tommy y Calvin **no dibujan el nombre** (19 nombres para 455 productos vivos · 6 para 82: no dicen el modelo; el CÓDIGO encabeza), Reebok y Joybees **sí** (74/220 y 70/81 distintos); es un DATO del tema (`nombreEnLaTarjeta`), nunca un `if` por marca. Filtros y encabezados de sección no cambiaron. **Español SOLO en Joybees y Reebok** («Niños» con eñe; Tommy y Calvin en inglés). 🩸 Joybees tenía 28 productos fuera de todo cajón y chips en cero («Todos 81 · Clogs 35 · Sandalias 11 · Flips 7» sumaba 53): los chips SALEN de la misma lista que clasifica (`JOYBEES_CAJONES`) y un chip en cero no se dibuja. `MOSTRAR_EXISTENCIA` sigue en `true` (Daniel: *«deja ambos»*). Candados: `catalogo-la-foto-manda` · `catalogo-tarjeta-nombre-por-marca`.
- 🔴 **NINGUNA HOJA DEL PAPEL DEL CLIENTE SE QUEDA SIN DECIR DE QUIÉN ES (22-sep-2026).** Medido sobre los PDF reales: PED-023 (3 hojas) traía la hoja 2 y 3 sin logo, cliente, número, fecha ni «Página N de M»; la cotización de Tommy mandó el total SOLO a una hoja nueva con el 92 % en blanco. Arreglo de LUGAR, no de números (`order-pdf-core.ts`): la cabecera se repite en cada hoja, cada hoja dice «Página N de M» y la tabla reserva el sitio del total. El candado arma el PDF y lo LEE con pdfjs. 🔴 **El Excel de Comprobantes se puede filtrar**: «Fecha» era TEXTO en los 4 archivos reales, no había columna «Tipo» (5 de 48 en Tommy eran cotizaciones bajo la hoja «Pedidos»), «No se ha mandado a Switch» iba escondido en un texto (6 de 21 en Reebok, $31.116), «Items» no se sumaba y «TOTAL» caía encima. Lo que ya estaba bien (fila 1, congelada, filtro desde A1) no se tocó. Candados: `pedido-pdf-hoja-con-identidad` · `comprobantes-excel-que-se-filtra`.

**Sync, clasificación y puertas.**

- **Las escrituras del sync que no cambian nada no se hacen**; ante la duda, se escribe. **El precio lo manda Switch**: a mano solo `image_url`/`badge` (+`name` en Tommy, que marca `nombre_manual`).
- 🔴 **CADA MARCA CLASIFICA EL GÉNERO DE OTRA FORMA. Un solo mapa rompe dos marcas.** Tommy y Calvin lo sacan **de la DESCRIPCIÓN** (el guion de `Women-Slippers`), en `tommy-gender.ts` y `calvin-gender.ts`, y el pareo es por **igualdad sobre una tabla de alias, NUNCA por `includes`** — «female» contiene «male» y «women» contiene «men». Reebok no: usa `rubro`/`subrubro` con desempate por nombre.
- 🔑 **Lo que entra a Switch en Active Shoes SALE de la plantilla del Depurador.** La cadena es **Depurador → Excel de 25 columnas → se sube a Switch → el cron lo lee → catálogo público**, así que un producto mal clasificado en el catálogo **no se arregla en el catálogo**: se arregla en la plantilla o en Switch.
- **La clasificación de Reebok la manda Switch** (`reebok-clasificacion.ts`): la MARCA da la categoría, el SUBRUBRO el género, el `rubro` es plan B; `UNISEX` → Hombre y solo ahí desempata el nombre. Lo desconocido cae en `otros`/`sin_clasificar` y **nunca pisa** lo ya clasificado.
- 🔴 **«Todavía no llegó» NO es «llegó algo que no entiendo»** (`fichaLlego`): sin `ficha_at` no se avisa **ni se clasifica**; con `ficha_at`, un valor desconocido o vacío sí avisa.
- 🔴 **La existencia de un escondido NO se congela**: entra al conjunto que se le pregunta a Switch (`ocultosManualSkus`). 🔴 **Esconder sigue siendo esconder**: manda `esVisibleEnCatalogo`, donde `oculto_manual` gana SIEMPRE y con ella se recalcula `active`. ⚠️ Sin la columna, todo como antes.
- 🔴 **La foto a mano queda protegida**: viaja `foto_manual: true` con la foto y el servidor acepta **solo `true` y solo con `image_url`**; el `false` es del sync. ⚠️ La de Calvin (`20261011120000_calvin_foto_manual.sql`) está **aplicada**.
- 🔴 Guard SSR en `/catalogos/admin/[marca]` con la lista derivada de `CATALOGO_ADMIN_ROLES` (`puedeAdministrarCatalogo`); `?tab=pedidos` redirige **antes** del guard; `orders/[id]` exige `COMPROBANTES_ROLES` y `/catalogo/[marca]/pedidos`, `puedeVerComprobantes`.
- 🔴 **Cinco rutas retiradas**: `joybees/seed`, `joybees/import`, `[marca]/pedidos-unificado`, `reebok/stats`, `reebok/inventory/bulk`. ⚠️ `reebok/inventory` y `pedidos-export` siguen vivos. 🔴 **Las tablas no se tocan** (patrón `mayor_lineas`).
- 🩸 Borrar de verdad es la excepción (`20260924120000`, aplicada): lista de **ids**, nunca un `LIKE`; el que tenga envío vivo se saca; solo lo ya `deleted`.

**Plantilla Switch (era el Depurador).**

- 🔴 **REEBOK ENTRA POR DOS ARCHIVOS, Y LA PANTALLA DICE CUÁL SE SUBIÓ (17-sep-2026):** la **confirmación de compra** (para cotizar — **no cambió**) y el **despacho**, que arregla tres números inventados: el **costo se LEE** (`Precio after Disc`), el **código de barra sale del `EAN` y, sin él, del `UPC`** y la **cantidad es `Quantity`**. 🔴 **Pendiente: el `EAN`**, lo ÚNICO que falta. 🔴 **El MISMO archivo con o sin las columnas nuevas**: el respaldo es un DATO (`COLUMNAS_DESPACHO`), `PO NAME` → **`PO`** → `BP Reference No.` → `Orden`, y **nada de lo que falta es obligatorio**. ⚠️ **Un archivo trae VARIOS PO**: se lee por FILA. No hay un segundo generador de las 25 columnas ni otra cuenta de costo.
- 🔴 **EL DESCUENTO DE LA PREFORMA SE ESCRIBE (18-sep-2026):** campo GLOBAL «Descuento del proveedor %» al lado del flete, recordado por persona; vacío = se estima 20/30 % **y se dice en ámbar**. El `WholesalePrice OFF` real y el DESPACHO le ganan siempre.
- 🔴 **LAS DOS PANTALLAS SE PORTAN COMO UNA (17-sep-2026):** los totales dicen **FOB y CIF** (suma de lo que las filas YA traen; el **sin costo se cuenta aparte**, nunca vale 0), las **facturas solo si el archivo las trae** y **«N nuevos · N ya están en Switch»** por `empresa_key` (**falla ABIERTA**). Los rótulos, en UNA constante. El ámbar de **CATEGORY** de Reebok se separó del de Department/GENDER (que NO cambió); «Ver solo esos N» va por el MISMO desplegable. 🔴 **Ningún número del cálculo se movió.**
- 🔴 **TODO EXCEL SALE POR `workbookBytes`/`workbookBuffer`/`workbookBlob` (17-sep-2026)**, y la hoja tabular pone `filtroDesdeA1`: **enciende el panel fijo**. 🔴 **Con fotos, el panel PRIMERO.**
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
- 🔴 **LA CAJA DICE QUÉ ARCHIVO RECONOCIÓ, LOS AVISOS SALEN COMPLETOS Y EL HISTORIAL MARCA LA REPETIDA (23-sep-2026):** lo que nadie reconoce **no se procesa** (antes caía a Calvin/Tommy en silencio; `reconocer-archivo.ts`, con la MISMA lista de columnas con la que frena `processRows`); los avisos ya no se cortan en 8 y bajan como Excel por `workbookBlob` + `filtroDesdeA1`; y la descarga repetida (misma marca, estilos y piezas en ≤ 60 min — **24 de 150** medidas) sale en gris con chip, **sin borrar ni esconder nada**. Interruptor `TRES_DETALLES`. 🔴 **El Excel de 25 columnas no cambió un byte.**
- ⚠️ **Decisión pendiente de Daniel:** Reebok y Facturas Tienda no validan el divisor en pantalla como CK/TH (el guard de las rutas API sí aplica al guardar).
### Reclamos — [docs/postmortems/reclamos.md](docs/postmortems/reclamos.md)

> 📄 Mediciones, citas de Daniel, candados, mutaciones y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026». Léelo antes de tocar una pantalla suya.

**Los cinco defectos (11-sep-2026).**

- 🔴 **El detalle se lee por UNA puerta** (`lib/reclamos/leer-detalle.ts`): FIRMA cada archivo y trae los settlements; falla **ABIERTA**.
- 🔴 **Un reclamo cobrado NO se vuelve a mandar**: «Correo» no sale en «Cobrados» **y el servidor lo rechaza**.
- 🔴 **El orden lo elige quien mira** (`lib/reclamos/orden.ts`): abre con la **factura más RECIENTE arriba**, las cinco columnas ordenan y **sin fecha va al FINAL siempre**.
- 🔴 **El formulario ofrece las MISMAS empresas que la portada**; uno guardado en una retirada conserva su opción al editar (`empresasParaElegir`).
- 🔴 **«Fecha de factura \*» es obligatoria**, en pantalla y en el servidor: de ahí salen los días y el orden.

**El rediseño (10/11-sep-2026).**

- 🔴 **«Reclamado» se marca solo** (`reclamos.reclamado_en`, `20261111120000`) la PRIMERA vez que sale de la casa —correo confirmado por Resend, o su Excel o PDF— y nunca se pisa.
- 🔴 **La portada** (`lib/reclamos/portada.ts`) mide los días desde la **FECHA DE FACTURA**; `EMPRESAS_CON_RECLAMOS` se DERIVA de `EMPRESAS`. **Nada se da por perdido**: sin corte de días.
- 🔴 **La empresa abre en «Por cobrar»**; «En proceso» salió de la pantalla y sigue válido en la base, y los botones de arriba actúan sobre la selección o **lo que se mira**.
- 🔴 **Las facturas son una LISTA** (`lib/reclamos/facturas.ts`): UNA función la parte (`facturasDe`; `F-1000` no se parte) y UNA la arma (`facturasATexto`).
- 🔴 **PDF obligatorio al CREAR** (`validateReclamoNuevo`; editar uno viejo sin PDF sigue guardando); del PDF **no se editan** Estilo, Descripción, Cantidad ni Precio, y **la talla sale como viene**: sin desglose la cantidad es el prepack, con desglose cada talla es su renglón.
- 🔴 **«Volver a por cobrar» conserva comprobante y notas de crédito**; el borrado usa el `UndoToast` de **5 s**.
- 🔴 **El bucket `reclamo-fotos` es PRIVADO** —fotos y comprobantes—, firmados **1 h** (`fotos-storage.ts`); `url` y `comprobante_url` van NULL: la verdad son `storage_path` y `comprobante_path`.
- 🔴 **El correo lleva la factura y las fotos ADJUNTAS**, achicadas antes de viajar (1600 px, JPEG 80, `sharp` con `.rotate()`); la ilegible viaja TAL CUAL. 🔴 **El tope es el del correo YA CODIFICADO** (`adjuntos-plan.ts`): Resend acepta **40 MB** y base64 crece 4/3 → el presupuesto CRUDO es **3/4**; pasarse tira el correo ENTERO. 🔴 **Lo que no cabe SE DICE**: primero el Excel, después las facturas y al final las fotos **de la más liviana a la más pesada**.
- 🔴 **El Excel NO lleva links y es UNO SOLO**; **no se firma nada** para el correo, solo lo que se MIRA, por una hora. 🩸 **La galería pública se retiró entera**, con su exención en `PUBLIC_PREFIXES`; los Excel VIEJOS dejan de abrir sus fotos.
- 🔴 **El papel (PDF y Excel) sale de UN solo módulo**, `lib/reclamos/papel.ts`: **Reclamo N° + fecha de la FACTURA** (sin ella, la del reclamo, **nunca «hoy»**) y **columnas vacías sin dibujar**. ⚠️ **El género viaja EN INGLÉS**, por el CHECK. «Descargar» da PDF, Excel y la factura del proveedor, con URL **firmada del servidor**.
- 🔴 **Los viejos se rellenaron por lista de IDS, nunca con un UPDATE abierto**: `reclamado_en` = su creación (`20261113120000`) y `fecha_factura` = su `fecha_reclamo` (`20261114120000`), **aplicadas**. ⚠️ Los días quedan **subestimados, nunca inflados**.

**Lo del 20-sep-2026.**

- 🔴 **UN SOLO CORTE DE «VIEJO»: 120 días** (`DIAS_RECLAMO_VIEJO`, `lib/reclamos/viejos.ts`), que leen la portada **y** el aviso.
- 🔴 **La portada sin huecos**: «Sin reclamar» en CERO **no se dibuja** y las dos que quedan se reparten el ancho; los días del más viejo van en **chip rojo** al lado del nombre y «Por cobrar» dice «N pasan de 120 días». 🩸 **Active Wear salió de la pantalla** (0 reclamos en la historia, como Joystep): entra a `EMPRESAS_SIN_TARJETA` y sale de la portada **y del formulario**; `EMPRESAS_MAP` no se toca.
- 🔴 **«Marcar como pagado» es el botón NEGRO** y «Correo» queda al lado con borde. ⚠️ En un cobrado «Correo» sigue sin salir y el servidor lo rechaza.
- 🔴 **El cobro abre con el TOTAL puesto y editable** y el **N° de nota de crédito se pliega**; el campo no se borró ni cambió.
- 🔴 **El aire entre columnas sale de UNA constante** (`tabla-renglones.ts`) que leen las TRES tablas de renglones. 🔴 **La talla se guarda RECORTADA** en `buildReclamoItemRows` —la señal `" "` de «Otros» se pegaba al texto y salía en el papel del proveedor—; ⚠️ **lo ya guardado no se toca**.
- 🔴 **Aviso SEMANAL por 📊 NEGOCIO** (`/api/cron/reclamos-viejos`, **lunes 14:00 UTC** = 9 a.m. de Panamá): cuántos pasan de 120 días, cuánto suman y los tres más viejos. Sin ninguno **no manda nada**; no toca Switch.
- 🔴 **El formulario dice qué va a pasar bajo el título** (salió del ⓘ) y «Falta el PDF de la factura» va **pegado a la caja del archivo**; lo que frena no cambió.
- 🩸 **Dos puertas sin un solo botón, retiradas**: `[id]/en-proceso` (el VALOR sigue válido en la base) y `/api/reclamos/motivos` (`reclamo_custom_motivos`, 0 filas). **La tabla no se dropea**: queda `retirada`, fuera del respaldo. 🔴 **La cabecera no dice la misma fecha dos veces** (`seDiceCreadoEl`).
- 🔑 **LA FECHA DE LA FACTURA ES LA QUE HAY, SIN ASTERISCOS.** El backfill **ya no tiene trabajo** (`20261114120000` llenó todas las `fecha_factura` en NULL) y de los vivos casi ninguno tiene PDF: no hay de dónde sacar la real. ⚠️ **Hacia adelante no se arrastra**: al crear, el PDF y la fecha son obligatorios.
### Asistencia y planilla — [docs/postmortems/asistencia-planilla.md](docs/postmortems/asistencia-planilla.md)

> 📄 Mediciones, citas de Daniel, candados, mutaciones y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026». Léelo antes de tocar una pantalla suya.

- 🔴 **EL DÍA COMPLETO SE ARREGLA EN LA FILA, SIN ABRIR UNA VENTANA (19-sep-2026):** tocar una hora (o un hueco) vuelve la celda escribible ahí mismo, **las cuatro marcas a la vez**, UN porqué y UN botón. 🔴 **Editar es editar, sin deshacer previo**: ANULA la anterior y escribe la nueva, y las dos filas quedan. Siguen valiendo: la marcación del reloj NO se edita ni se borra, el motivo es OBLIGATORIO y **nada se aplica solo**. `POST …/correcciones/dia` valida TODO antes de escribir NADA y el día sale de la MARCACIÓN. Interruptor `EDITAR_EL_DIA` (hoy `true`).
- 🔴 **LAS HORAS EXTRA SE DECIDEN DESDE EL REPORTE (19-sep-2026):** Sí / No en la fila del día, y **al aprobar manda el SERVIDOR** (mismo endpoint, mismo `?empresa=`, sin cuenta rehecha en la pantalla). ⚠️ **Aprobaciones no se tocó**: es la única que ofrece el DOMINGO y el FERIADO trabajados.
- 🔴 **SE JUSTIFICA A VARIOS DESDE EL REPORTE (19-sep-2026):** misma ruta, misma validación, **una petición por persona**; los motivos son la **INTERSECCIÓN** (`motivosParaVarios`) y la lista sigue CERRADA. Abre en UN día, nunca el período entero; **lo que no entra se dice con nombre**.
- 🔴 **CON «TODAS», EL TABLERO DE CIERRE (19-sep-2026):** una línea por empresa (personas · neto · qué falta · Cerrar). 🔴 **NUNCA UN TOTAL DEL GRUPO** (sin pie, sin suma entre filas, con barrido, y se DICE por qué). 🔴 **Cada cierre es el de SU empresa, por su propia puerta**, con la MISMA ventana; sigue valiendo `frenoSoloQuincenas`. «Qué falta» sale del MISMO «Antes de cerrar» (`antes-de-cerrar-del-cuadro.ts`).
- 🔴 **LOS DÍAS DE VACACIONES SE FUERON DE LA LISTA DE COLABORADORES (19-sep-2026)** —eran acumulados desde 2006 sin restar lo tomado—. ⚠️ **La FICHA no se tocó** («Le corresponden N días», con su línea) ni el cálculo.
- 🔴 **LAS DIRECCIONES VIEJAS DE LAS PESTAÑAS DEJAN DE EXISTIR (19-sep-2026):** `?tab=justificaciones` · `vacaciones` · `configuracion` · `reporte` abrían otra pantalla EN SILENCIO; ahora la URL **se reescribe** a la pestaña real (`claveQueSeReescribe`, `replace`). ⚠️ **Sin `?tab=` no se escribe nada**.
- 🔴 **LOS DÍAS Y LOS DOS HORARIOS SON CONFIGURABLES POR PERSONA (18-sep-2026):** «hábil» es la lista de cada quien (`asistencia_horarios.dias_laborables`; en NULL manda la EMPRESA: **Multifashion lunes a SÁBADO**), y cada persona tiene DOS horarios —el del reloj y el del teléfono (`entrada_afuera`/`salida_afuera`, vacío = el de adentro)—, **y cuál aplica lo decide la PRIMERA marca del día**. 🔴 **El domingo no se toca.** Regla en `horario-configurable.ts`, lectura ÚNICA en `horarios-server.ts`; migración `20261208120000` ⚠️ **pendiente (la corre Daniel)** y **falla ABIERTA**.
- 🔴 **TODO DE LUNES A SÁBADO EN MULTIFASHION, Y SIN DEUDA DE DÍA LIBRE (18-sep-2026):** las cuentas pasan por **UN contador** (`diasLaborablesDelRango`) con los días de cada quien; **el domingo no se toca**. **Multifashion NUNCA lleva deuda de día libre** (`EMPRESAS_SIN_DIA_LIBRE`, `motivos.ts`): el servidor rechaza con 400 por empresa, por persona y en la puerta que escribe, y la pantalla no le ofrece el motivo. **No hay feriados por empresa.**
- 🔴 **EL DÍA LIBRE DE LA EMPRESA: SE PAGA COMPLETO Y QUEDA DEBIENDO 8 HORAS EN DÓLARES, QUE SOLO PAGAN LAS HORAS EXTRA (17-sep-2026).** Séptimo motivo, **lejos de «Compensatorio», que es lo CONTRARIO**. Deuda = `8 × rata`, **congelada** al cargarse. 🔴 **El tope es el EXTRA, nunca el neto**: sin horas extra no se cobra un centavo, la deuda arrastra sin caducar y **no se descuenta de la liquidación**. Una sola puerta (`cargarDeudasDiaLibre`), admin y contabilidad, solo hábiles.
- 🔴 **LAS HORAS EXTRA LAS APAGA SOLO LA CASILLA «¿Cobra horas extra?» DE LA FICHA — SER SERVICIO PROFESIONAL YA NO LAS APAGA (14-sep-2026).** Con la casilla en SÍ un servicio profesional **mide** sus extras y sale en Aprobaciones, pero **sigue sin `dinero`**: no se inventa una rata. ⚠️ Marcar a alguien de Fashion Wear como servicio profesional lo SACA de la planilla entera — es otra pregunta.
- 🔴 **LOS DÍAS AFUERA SON «TRABAJO DE VENDEDOR» POR RANGO, DESDE LA FICHA, Y EL HORARIO 9–18 NO SE GUARDA (14-sep-2026).** La nota va bajo el motivo (`notaDelMotivo` → `TEXTO_DIA_AFUERA`). 🔴 **El horario NO se guarda**: como `hora_desde`/`hora_hasta` sería un PERMISO y el día pasaría a AUSENCIA. 🔴 **Si marcó ese día, manda el reloj.**
- 🔴 **«COMPENSATORIO» ES EL SEXTO MOTIVO, AL LADO DE INCAPACIDAD, Y NO DESCUENTA (14-sep-2026).** `MOTIVO_COMPENSATORIO` en `MOTIVOS_JUSTIFICACION`, de día completo. **Sin migración**: la base no tiene CHECK sobre `motivo`. Sigue valiendo: *justificar significa que se paga*.
- 🔴 **«TRABAJA AFUERA» ES UNA CASILLA DE LA FICHA, Y NADIE CARGA NADA (14-sep-2026).** A quien la tiene, un día hábil ya pasado, sin marca, sin feriado y sin justificación se le pone «Trabajo de vendedor» solo (`trabaja-afuera.ts`). **El día que SÍ marca se mide del reloj.** ⚠️ **NO es `no_marca_reloj`** (ésa apaga el reloj SIEMPRE; con las dos, gana).
- 🔴 Son **COLABORADORES**, no «personas», en todo texto del sistema. `/asistencia/personas/:codigo` redirige **307** con la query intacta; ⚠️ los identificadores NO cambian (`asistencia_personas`, `persona=<código>`).
- 🔴 Selector de empresa (`empresa-para-todo.ts`, `?empresa=`): opciones = rol ∩ `GET /api/asistencia/alcance` (`null` = las cuatro); hasta que conteste, lo del rol. Es filtro de LECTURA; `POST …/aprobaciones?empresa=` **rechaza (400) un código ajeno, todo o nada**.
- 🔴 Almuerzo **por empresa** (`ALMUERZO_POR_EMPRESA`): **30 min**, **60 en Multifashion**; sin casilla, el PUT de Horarios escribe el de la empresa de la ficha y conserva la entrada.
- La quincena paga `salario ÷ 2`. 🔴 **SOLO SE CIERRAN QUINCENAS (18-sep-2026)**: el POST de `planilla-guardada` rechaza (400) cualquier otro rango ANTES de leer la base (`frenoSoloQuincenas`); «Otro rango» ya no está en la Planilla; la ruta que GENERA sigue aceptando rangos libres (`medirAjusteAnterior`).
- 🔴 **EL DÍA DEL CORTE LO ELIGE LA CONTADORA, NO EL SISTEMA.** `CORTE_SUGERIDO = { 1: 13, 2: 28 }` es **solo lo que se propone**; vacío = quincena entera. La quincena real (1-15 · 16-fin) **sí es fija**; lo que el corte mueve es hasta dónde se LEE EL RELOJ, y los días que quedan se ajustan en la siguiente.
- 🔴 **El día vale sueldo mensual ÷ 26** (`DIAS_PAGADOS_POR_MES`); quien entra o sale a mitad de quincena cobra **días hábiles trabajados** (`prorrateo-ingreso.ts`), congelado en el cierre.
- 🔴 Salir antes se descuenta **desde el minuto uno, sin tolerancia** (los 10 min de gracia son solo de la entrada) y tiene concepto propio en el cierre.
- Horas extra exactas del reloj (`brutoSeg / 60`, sin cuartos); ISR a mano. 🔴 Centavos: **manda el sistema y la contable se adapta**: 1–4 centavos no son defecto.
- Marcaciones al segundo, umbrales en minutos; Panamá **UTC−5 fijo**, tests con fechas fijas, y **los días que no pasaron no se cuentan** (`fecha >= diaEnCurso`). Aprobadores (`asistencia_aprobador_empresa`): daniel y Contabilidad en las cuatro; david solo Boston; Bodega en Fashion Wear y Vistana.
- 🔴 **La marcación del reloj nunca se edita ni se borra**: la corrección va encima, en `asistencia_correcciones` (motivo obligatorio, firma, deshacer = `anulada_en`), con barrido que prohíbe `update`/`delete`/`upsert`.
- 🔑 Cuando el sistema no puede saber, **se abstiene**: servicio profesional, ingreso o salida a mitad de período y justificación de período completo van a «Tú decides», sin número y fuera del total.
- 🔴 Aprobaciones decide **SÍ · NO · PENDIENTE** (`decision`); `aprobado` se conserva DERIVADO (`'si'` ⇔ `true`). Un `no` no se paga y **deja de ser pendiente**; los 30 min automáticos de ACS se pagan igual. **Pendiente = sin fila o `decision IS NULL`: lo ÚNICO que avisa y frena.**
- 🔴 Domingo y feriado trabajados **se aprueban** (`diasConExtra`, valuados con `recargoDomingoFeriado`); no aprobado no se paga, pero se ve. Al aprobar **manda el servidor**.
- 🔴 «¿Cobra horas extra?» (`cobra_horas_extra NOT NULL DEFAULT true`; **solo un `false` explícito apaga**): con `false` no entra a Aprobaciones ni frena el cierre, pero **sigue en planilla** con tardanzas, ausencias y salida temprana.
- 🔴 Una vacación **no es una justificación** (tabla propia; «Vacaciones» no está entre los motivos ni los retirados); **el motor las honra pase lo que pase** y un día de vacaciones **no genera horas, tardanza ni ausencia**. Sin marcar no cuesta nada; **«ya se le pagó» es lo ÚNICO que mueve plata**: ausencia de día completo (**8 h × rata**) en hábiles no feriados.
- 🔴 **LOS DÍAS DE VACACIONES SE CALCULAN SOLOS, Y NO SON UN SALDO (17-sep-2026).** **30 días corridos por cada 11 MESES** desde `fecha_ingreso`, menos las registradas (`vacaciones-corresponden.ts`). 🔴 Se lee **«Le corresponden N días», NUNCA «le quedan»**, con la línea gris de lo que no incluye. 🔴 **NO entra a ningún cálculo de plata**, con barrido. 🔴 **Sin `fecha_ingreso` no sale un número, ni cero.** 🩸 El saldo a mano se RETIRÓ.
- 🔴 El descuento de préstamo **entra solo a la planilla; ya no se aprueba** (`prestamos-planilla.ts`): préstamo y terceros, cada cuota capeada a SU saldo; **lo escrito a mano manda, vacío = la cuota del módulo**; va a `dinero`, nunca a `manuales`. «Ya descontado» mira el ORIGEN del pago. `asistencia_prestamo_aprobado` **no se dropea**.
- 🔴 Las casillas de préstamo y terceros tienen **tres estados**: `NULL` = cuota automática · `0` = esta quincena **no se descuenta** y el cierre **no anota pago** · monto = ese monto (`casilla-sin-descontar.ts`, misma función para pantalla y guardado). ⚠️ `mercancia`, `isr` y `otros_servicios` siguen `NOT NULL DEFAULT 0`.
- 🔴 Las horas de una justificación **solo van con «Constancia»** (`permiso-horas.ts`): la ruta rechaza con **400** un motivo de día completo que llegue con horas; el motor honra las horas guardadas sin mirar el motivo.
- 🔴 **UN PERMISO DE HORAS PERDONA LAS TRES COLUMNAS, CON LA MISMA REGLA (16-sep-2026).** `minutosPerdonadosDe` cruza la ventana del permiso con la del INCUMPLIMIENTO —tardanza · salida temprana · exceso de almuerzo— y perdona la **intersección**, capeada a SU propio bruto. 🔴 **Nada callado**: el día lleva los tres perdones por separado y el chip dice cuál y cuánto. Un permiso de horas **no justifica el día entero**.
- 🔴 La salida temprana entra al ajuste del corte (`CONCEPTOS_DEL_RELOJ` son **ocho**) y **los seguros se calculan sobre el bruto CON el ajuste** (`aplicarAjusteEnLinea`, respeta `paga_seguros`).
- 🔴 El corte y el ajuste de los días sin medir entran **cada concepto en su columna — nunca una línea neta**, cada monto con SU rata (`corte-quincena.ts`). **El neto por persona no cambia.** 🔴 Y **los seguros SÍ se recalculan sobre el bruto CON el ajuste** desde el 11-sep-2026. ⚠️ No se tocan con `paga_seguros` apagado ni con base propia (`seguros_base_quincena`).
- 🔴 **CINCO ARREGLOS DE PANTALLA DEL REPORTE (16-sep-2026), y ninguno mueve plata**: los cuatro botones de período (`atajos-periodo.ts`, los MISMOS de la Planilla) · el período en la URL (`periodo-en-la-url.ts`) · el aviso de la hora de salida NOMBRA a cada uno · **dos marcas y la última a más de DOS HORAS de su salida se avisa** (`salida-sospechosa.ts`, 120 min, **nunca dentro de `revisar`**) · la columna «Extras» dice cuánto está aprobado.
- 🔴 **O el total sigue al filtro, o no hay buscador** (`buscar-en-lista.ts`): filtra lo ya cargado por **subcadena exacta normalizada, nunca por parecido**, con el texto en la URL (`?buscar=`). 🔴 **Planilla no tiene buscador** —su pie es plata que se paga—, con barrido sobre `PlanillaTab.tsx`. Los avisos de «Antes de cerrar» (`antes-de-cerrar.ts`) viajan como datos: Excel y PDF los leen igual.
- 🔴 **Lo que sale de la pantalla nunca se recorta** (Excel, PDF, cierre, lotes), salvo un botón que DIGA a cuántos afecta. ⚠️ Asistencia, Clientes y ⌘K buscan contra el SERVIDOR.
- 🔴 Dar de baja a alguien con deuda **avisa** (`salida-con-deuda.ts`), y la deuda son las **tres cuentas** (`calcularSaldoPrestamo`). 🔴 Las columnas de dinero salen de **un solo lugar**: `columnas-dinero-planilla.ts` (**19**), leído por `PlanillaTab` y `PlanillaBoston`.
- 🔴 **JUSTIFICAR SIGNIFICA QUE SE PAGA. No existe «justificado pero no se paga».** La lista de motivos es **cerrada** (`motivos.ts`): Incapacidad · Catástrofe · Escolares · Trabajo de vendedor · Constancia.
- 🔑 **Tres reglas de la planilla son de la CONTADORA (Yulissa), no de Daniel** — por eso no se renegocian con él: la información se configura en el perfil y de ahí se toma, nunca a mano; **terceros se maneja igual que un préstamo** (monto inicial + cuota quincenal); y **daño de mercancía permanece en blanco**, con la cantidad escrita quincena por quincena.
- **«Descuento por compras» y «Daño de mercancía» son LA MISMA línea**, no dos conceptos.
- ⚠️ **Un colaborador sin cédula ni salario no siempre es un dato olvidado** (puede no tener permiso de trabajo).
- La incapacidad justificada **se paga**; «Trabajo fuera de la oficina» **no es ausencia**; un sueldo repartido saca la rata del **sueldo COMPLETO** y las partes deben sumar el salario de la ficha o se rechaza entero.
- Corregir una hora: el porqué es obligatorio; los motivos frecuentes se derivan de lo guardado en **90 días** por clave normalizada (**igualdad exacta, nada por parecido**), **4** con **2+** usos (`motivos-frecuentes.ts`, solo lectura).
### La Planilla Unida — los dos interruptores, PRENDIDOS en producción (11-sep-2026)

> 📄 Mediciones, citas de Daniel, candados y las reglas de PANTALLA: [el postmortem](docs/postmortems/asistencia-planilla.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

> 🔴 **Los dos están PRENDIDOS en producción desde el 11-sep-2026** (`NEXT_PUBLIC_PLANILLA_UNIDA="1"` y `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO="1"` en Vercel), así que lo de abajo es lo que Daniel VE hoy. Apagarlos pide cambiar la variable **y volver a desplegar**: Next reemplaza `NEXT_PUBLIC_*` como TEXTO al compilar.

| Interruptor | Dónde vive | Qué prende |
|---|---|---|
| `NEXT_PUBLIC_PLANILLA_UNIDA` | `planilla-unida.ts:26` | El comprobante de pago · el cierre que escribe el pago del préstamo (reabrir lo revierte) · el corte de quincena y el «Ajuste quincena anterior» · Préstamos con «una sola puerta» |
| `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO` | `persona-en-el-centro.ts:43` | El acomodo nuevo y `/asistencia/personas/[codigo]` con Editar |

⚠️ **No cuelga de un interruptor, es aditivo por datos** y hoy inerte: la tercera cuenta «Descuento a terceros», `asistencia_codigos_ignorados` (vacía), ACS como cuarta empresa (CHECK más anchos) y sus 30 min de extra automáticos (`EXTRA_AUTOMATICO_POR_EMPRESA`: las otras tres en **0**).

- 🔴 Préstamos: **una sola puerta, nunca dos** (`prestamos-una-puerta.ts`). Prendido: la ficha se filtra de `getVisibleModules` (no se borra de `ALL_MODULES`: la key sigue en `role_permissions` y `modulos_override`) y `/prestamos` exacto redirige a `/asistencia?tab=prestamos`, **307 temporal**, query intacta. 🔴 `/prestamos/<id>` **no redirige**, ni `/api/prestamos/*`: son las rutas de la pestaña.
- 🔴 La pestaña se autoriza por `PRESTAMOS_ROLES`, **no por tener Asistencia**: `PRESTAMOS_PESTANA_ROLES` = admin · contabilidad + secretaria **solo a ver**; bodega y vendedor no, y el «solo ver» lo decide el SERVIDOR.
- La sección Préstamos de la persona **enlaza, no duplica** (`enlaceAPrestamos`): no dibuja formulario ni hace POST, y la ficha NO ofrece «Pago Quincenal»: lo escribe el cierre.
- 🔴 El comprobante de pago es UNO para las cuatro empresas, una hoja por persona, con todos los renglones aunque vayan en 0.00. Multifashion sale con `MULTI FASHION HOLDING CORP.` · `155638923-2-2016`, de la lista fiscal del estado de cuenta, sin correo ni teléfono; sin cargo va un guion, no se inventa.
- 🔴 El pago del préstamo lo escribe el CIERRE, con `await`, y **reabrir lo revierte** con soft delete; cerrar dos veces no cobra dos veces (índice único).
- 🔴 El corte **no prorratea el sueldo**: el período queda entero y solo se recorta hasta dónde se mide el reloj (`hastaReloj`); el «Ajuste quincena anterior» va en **renglón propio**, nunca dentro de la ausencia.
- 🔴 En ACS aprueba `daniel`, no la contadora; **cerrar no sale de esa tabla**: ella sigue cerrando las cuatro.
- Los nombres se capitalizan con `nombre-en-pantalla.ts` y **no se inventan acentos**. La cédula vive en el bucket **privado `asistencia-cedulas`**: se guarda la RUTA y la URL se **firma al leer**, una hora.
### Préstamos — [docs/postmortems/prestamos.md](docs/postmortems/prestamos.md)

> 📄 Mediciones, citas de Daniel, candados y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- 🔴 DOS cuentas con su cuota (Préstamo · Daño de mercancía) y el total es la suma; en la base son CINCO conceptos, «Daño de mercancía» es solo ETIQUETA de `Responsabilidad por daño`.
- Un **Pago baja UNA cuenta**; con las dos debiendo, «Baja de» viene puesto en la **más vieja** y se puede cambiar. Sin fechas el desempate es **estable** (préstamo), nunca el orden del array.
- 🔴 El saldo sale de UN solo lugar (`prestamos-saldo.ts`); los roles, de `prestamos-roles.ts`.
- 🔴 `activo` se retiró y la columna NO se borra: sin lectores, con `COMMENT` y build rojo si se dropea o si vuelven a filtrar por ella. Solo se lista a quien debe; el que ya no trabaja pero debe SÍ aparece, sin descuento.
- 🔴 La persona sale de Asistencia y la ficha nace con su `empleado_codigo`, editable. Nada se ata por parecido: lista a mano, y el UPDATE lo EXIGE.
- 🔴 NADIE APRUEBA UN PRÉSTAMO: nace `aprobado`. El tope de UN SUELDO MENSUAL sobre la deuda TOTAL (sin sueldo, $500) solo AVISA, en pantalla y Telegram privado; el daño nunca pasa por el tope.
- 🔴 El freno de duplicados mira concepto + origen + fecha, NUNCA la nota (`origen_pago` NULL = Quincena). Soft delete con `logActivity` hasta en «Eliminar Todo el Historial».
- 🔴 **LAS TRES CUOTAS ENTRAN SOLAS: préstamo, terceros y DAÑO DE MERCANCÍA** (14-sep-2026), cada una capeada a SU saldo y sin aprobar. El daño se registra en «+ Nuevo préstamo» **con su cuota, igual que un préstamo**. Las tres casillas tienen los MISMOS tres estados (`NULL` = va la cuota · `0` = no se descuenta esta quincena · monto = ese monto); la de mercancía por `20261122120000` (**aplicada**). 🔑 Lo ya anotado le gana a la cuota. Se editan en «Editar ficha» (un `0` apaga la cuota y **no borra la deuda**). 🔴 **Boston suma las TRES** en su «descuenta $X por quincena».
- 🔴 «No descontar esta quincena» = un 0 en la FILA: `asistencia_planilla_manual` tiene tres estados (`NULL` = cuota · `0` = no se descuenta · monto) en `lib/asistencia/casilla-sin-descontar.ts`, la MISMA para pantalla y `normalizarManuales`; con 0 el cierre no anota pago.
- 🔴 **LA CUOTA ES OBLIGATORIA al registrar Préstamo · Daño de mercancía · Descuento a terceros** (14-sep-2026); **un Pago no la pide**. 🩸 Sin cuota la deuda no se descontaba nunca sola. El botón apagado DICE qué falta («Falta: la cuota», visible). Regla en `lib/prestamos-registrar.ts`.
- 🔴 **EL DESCUENTO NUNCA DEJA EL NETO EN NEGATIVO** (14-sep-2026; red de seguridad). `recortarAlNeto` (`neto-no-negativo.ts`) corre **al FINAL de la ruta**, achica **solo lo AUTOMÁTICO** (lo escrito a mano manda), en el orden **daño → terceros → préstamo**. **El saldo no baja por lo que no se cobró**: el cierre anota solo lo que entró. Se DICE en la celda y en «Antes de cerrar». **El ISR sigue a mano.**
- 🔴 **Los movimientos de UNA quincena, en una pantalla y no en 31 fichas** (17-sep): vista «Movimientos» adentro de la pestaña, solo LECTURA, con «Origen» (del cierre o a mano).
### Navegación, 404 y papel — lo que se arregló el 17-sep-2026

> 📄 Detalle, mediciones y candados: [docs/postmortems/navegacion.md](docs/postmortems/navegacion.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- 🔴 **«Ir al inicio» es LA CASA DEL ROL, no `/home`** (`lib/navegacion/casa-del-rol.ts`): una sola función para el redirect de `/home`, el 404 y el botón del encabezado. `gerente_acs` y `marcacion` tienen un módulo solo; `/home` los rebota. ⚠️ **Bodega NO está atrapado**: tiene cuatro módulos.
- 🔴 **Hay un 404 propio y en español** (`src/app/not-found.tsx`): «Esta pantalla no existe», con «Ir al inicio» y «Volver» —éste solo si hay a dónde—.
- 🔴 **El PDF de Comisiones dice el título UNA vez**, en la primera hoja (`lib/comisiones/pdf-comision.ts`). ⚠️ Los **nombres de columna SÍ se repiten** y el pie con la numeración no se toca. 🩸 `ImpresionComision.tsx` está muerto: el papel sale de `pdf-comision.ts`.
- 🩸 **El CSV de Reclamos se retiró**: en ningún lado del sistema se exporta CSV. `csv-export.ts` queda rotulado y sin lectores; los dos Excel, intactos.
- 🔴 **`/catalogo` y `/catalogos` redirigen** (307, fuente exacta) a `/catalogos/marcas`: el breadcrumb del propio hub caía ahí y daba el 404 de Next. Comprobantes monta el camino completo. ⚠️ El último tramo dice **«Comprobantes»**, no «Pedidos».
- 🔴 **Los rubros de Reebok se ADMINISTRAN, no se programan** (`reebok_rubro_categoria`, Catálogos › Reebok): el espejo `REEBOK_CATEGORY_ESPERADAS` se DERIVA de ahí. Falla ABIERTA a las seis reglas del código; `CategoriaReebok` sigue CERRADO —calzado · ropa · accesorios— y **la marca manda antes que el rubro**.
- 🔴 **Una descripción que «pasa» también queda registrada** (`origen = 'automatica'`, rotulada «Entró sola al pasar»), para poder darle fórmula después. Pasar no cambia de significado; se escribe al PROCESAR, nunca al descargar.
- 🔴 **Préstamos tiene «Movimientos» por quincena** (`lib/asistencia/movimientos-quincena.ts`): descuentos y deudas nuevas, con una columna **Origen** que dice si lo anotó el CIERRE o una persona. La ventana termina en `finDeLaMedicion` — con `q.hasta` se caían los movimientos de un día 31.
- ⚠️ **El Historial del depurador NO se divide en pestañas**: la tabla no guarda por dónde entró el archivo.
- 🔴 **El primer pintado ya sabe quién mira** (19-sep): `useAuth` arranca con la semilla de la cookie firmada (`lib/sesion-semilla*.ts`, leída en el layout raíz; rol · módulos · `isOwner` · nombre, **nunca el token**) con la MISMA regla que el navegador (`tieneAccesoAlModulo`); sin acceso o sin semilla, `null` como antes, y `sessionStorage` sigue mandando al hidratar. ⚠️ `/home` no PINTA en el servidor: elige sus colores con el modo oscuro del `localStorage`.
- 🔴 **Quien no tiene Inicio no lo ve ni un instante** (19-sep): el rebote a la casa del rol lo decide el SERVIDOR en `src/app/home/layout.tsx` —`leerSemillaDeSesion()` + la MISMA `casaDelRol`, `redirect()` antes de una sola línea de HTML—, así que `marcacion`, `gerente_acs` y `gerente_boston` nunca reciben el Inicio. 🔴 **Falla ABIERTA**: sin cookie, forjada o rol desconocido, no redirige y el efecto del navegador decide como siempre.
### Recordatorios (era Cheques) — [docs/postmortems/recordatorios.md](docs/postmortems/recordatorios.md)

> 📄 Mediciones, citas de Daniel, candados y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- `/recordatorios` (era `/cheques`, 307); la `key` sigue siendo `cheques` en `role_permissions` y `modulos_override`; entran admin y secretaria, nadie más.
- 🔴 Solo se lista lo ABIERTO: lo depositado aparece solo al buscarlo. 🔴 NINGÚN total sumado: `recordatorios/agenda.ts` no tiene una operación de suma.
- 🔴 «Hoy» NO existe ni hay selector de hora: UN mensaje diario a las 9:00 a.m. de Panamá y el primero disponible es MAÑANA; un día pasado se rechaza en pantalla y en el servidor. El «Hasta…» corta INCLUSIVE, solo con repetición.
- 🔴 `destino` = `equipo` o `privado`, y lo decide el ROL en el SERVIDOR (`destinoPermitido`): lo de una secretaria va SIEMPRE al equipo, y ante la duda, `equipo`. ⚠️ Hay UN solo chat privado y DOS admin: lo de Alberto le llega a Daniel.
- 🔴 Un recordatorio NO se marca como hecho y un cheque que no se cobrará SE BORRA: no hay estado de completado. 🔴 El vencido sin marcar avisa UNA SOLA VEZ (`cheques.aviso_vencido_en`), marcado DESPUÉS de que Telegram confirme; un rebotado no avisa.
- 🔴 A los 365 días un cheque DEPOSITADO se retira con soft delete (`deleted` + `deleted_at`), nunca un DELETE, y solo los depositados: lo que se debe se queda para siempre. Cuenta desde `fecha_depositado` (sin ella, `fecha_deposito`; nunca «hoy»).
- 🔴 **UNA SOLA PUERTA: «CHEQUE ES UN MOTIVO DE RECORDATORIO» (22-sep-2026, Daniel textual).** «Nuevo Cheque» y la caja «¿Qué te recuerdo?» eran DOS puertas que no se conocían; hoy es UNA, con el motivo (`recordatorios/motivos.ts`: `MOTIVOS = [cheque, nota]`, y `TABLA_DE_MOTIVO` decide en qué tabla se guarda). 🔴 **NADA se fusionó en la base**: `cheques` y `recordatorios` siguen tal cual, sin columna nueva ni migración; el cron de las 9:00 ve las dos. Medido: 19 cheques (los 19 depositados) y 2 recordatorios; ninguna fila se tocó. Candado `recordatorios-una-puerta`.
### Caja Menuda — [docs/postmortems/caja-menuda.md](docs/postmortems/caja-menuda.md)

> Sus reglas, enteras, en el postmortem.

### Gastos, mayor y banco — [docs/postmortems/gastos-mayor-banco.md](docs/postmortems/gastos-mayor-banco.md)

> 📄 Mediciones, citas de Daniel, candados y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- `gastos-contabilidad`: Egresos Varios (fuente ÚNICA) y Saldos de banco. 🔴 Las 8 empresas se ven, pero sus gastos NUNCA se suman entre sí: ni total de grupo, ni pie de tabla, ni export; hay candado.
- El mayor contable se retiró; `mayor_lineas` y `mayor_importaciones` no se borran; build rojo si una migración las dropea.
- `bancos_saldos` va con upsert `(empresa_key, fecha_dato)`: repetir la fecha corrige ESE día y nunca pisa otro. Cero `DELETE`.
- 🩸 Un renglón ilegible de Switch NO desaparece: queda en `switch_sync_log.skip_details`, se dice en pantalla y avisa por 🔧 SISTEMA, anti-loop de 7 días por N. INTERNO, nunca por línea.
- 🩸 La cuenta se lee por el PRINCIPIO: `codigoDeCuenta()` acepta el código seguido de cualquier cosa; `CUENTA_RE` conserva su `$` para el VALOR, seis tramos siguen siendo error, `esGasto` decide con el primero y el nombre sale de `cuentas_contables.nombre_switch`.
- ⚠️ Vista General SÍ suma gastos entre empresas: otro módulo, suma deliberada; si la regla vale ahí es decisión pendiente de Daniel.
### Proveedores — la lista son las EMPRESAS (20-sep-2026)

> 📄 Mediciones, citas de Daniel, candados y las reglas de PANTALLA: [docs/postmortems/proveedores.md](docs/postmortems/proveedores.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026». Léelo antes de tocar el módulo.

- 🔴 QUIÉN ES QUIÉN SALE DE UNA LISTA ESCRITA A MANO (`proveedor_amarre`), nunca del nombre ni de la cédula. Grano `(empresa_key, proveedor_switch_id)`; lo resuelve `aplicarAmarre` y nadie más. 🩸 Una lectura caída se dice, nunca «no hay nada».
- 🔴 **LA LISTA SON LAS SIETE EMPRESAS, DESPLEGABLES EN SUS PROVEEDORES** (`por-empresa.ts`): **Empresa · 0-90D · 91-120D · 121-365D · +1 año · Por pagar**, total al pie; salen de `empresasConCxp()`, nunca de las filas, ⚠️ sin Boston, y todo total es SUMA de lo de abajo.
- 🔴 **CUATRO tramos, sumas de los OCHO de Switch, y ningún número cambia** (`tramos.ts`). 🔴 **Nunca «vencido», ni dicho ni pintado** —el dato es EDAD, no mora—: un tono (`tono.ts`). 🔴 **Lo A FAVOR se ve**: «Le debes X · Tienes a favor Y · **Por pagar Z = X − Y**».
### Usuarios, Inicio y teclado — lo que se regalaba y no servía (11-sep-2026)

> 📄 Mediciones, citas de Daniel, candados y las reglas de PANTALLA: [docs/postmortems/usuarios-inicio-teclado.md](docs/postmortems/usuarios-inicio-teclado.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- 🔴 NO SE PUEDE REGALAR UN MÓDULO QUE LA PANTALLA REBOTA: los ofrecibles de «permisos personalizados» se derivan (`src/lib/modulos-ofrecibles.ts`) —a un rol solo se le ofrece lo que `ALL_MODULES` le da— y el servidor lo rechaza igual (`/api/admin/users`).
- ⚠️ El override REEMPLAZA la lista del rol en vez de sumarla, y la pantalla no lo dice. Decisión pendiente de Daniel.
- 🔴 El teclado y el Inicio dejaron de prometer lo que no existe: se retiraron `useKeyboardShortcuts`, `useBadges`, `useSmartSuggestions`, `SuggestionCard` y `/api/home-stats`, sin lectores; queda `useSessionCheck`, desenchufado a propósito.
### Crons, alertas e infraestructura — [docs/postmortems/crons-alertas.md](docs/postmortems/crons-alertas.md)

> 📄 Mediciones, citas de Daniel, candados y mutaciones: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- **Una entrada de cron = una ocurrencia al día.** Sub-diario = entradas separadas, NUNCA una lista de horas; biyección `vercel.json` ↔ registro.
- Crons de la MISMA empresa en Switch, **≥15 min** separados (`SEPARACION_MINIMA_MIN`): un solo token válido por USUARIO.
- 🔔 **Solo 3 (+2) alertas de SISTEMA, lista cerrada**: dato viejo (+24 h) · 2 fallos seguidos del par `(empresa, sync_type)` · base >80% de memoria · hueco del reloj de asistencia · (+1) el lector de facturas dejó de leer.
- **El silencio no cuenta como que está bien** (`silencio-de-datos.ts`, en la reconciliación 10/14/18 UTC, sin crons nuevos): **A** = sync con CERO y `status = success` donde siempre trae cientos; **B** = una tabla de negocio dejó de recibir escrituras. 🔴 Un mensaje por MÓDULO, anti-loop **7 días**.
- 🔴 A y B solo opinan sobre syncs de UNIVERSO COMPLETO (`SYNCS_DE_UNIVERSO_COMPLETO`): en uno selectivo o de mes en curso, el cero es dato del NEGOCIO.
- 🔴 Tres candados estadísticos por PAR: **≥10** corridas exitosas previas, **mediana ≥10** (no promedio), ni un cero. Sin historia no se vigila. Ante la duda, callar.
- 🔴 B mira cuándo se ESCRIBIÓ, nunca la fecha del dato; la tabla del DATO, no la del mecanismo (`egresos_varios`, no `egresos_importaciones`). Umbral **40 h**.
- **Cuadre mensual de costo** (`cuadre-costo.ts`, misma pasada): por (empresa, mes cerrado), el Resumen contra `switch_costo_diario`; solo días comparables (ni el último del mes, ni sin fila, ni leídos antes de cerrar), **>2 % Y >$100**, **≥10 días**, anti-loop **7 días** por (empresa, mes), un mensaje por pasada. 🔴 Telegram, no Data Health.
- 📊 NEGOCIO no tiene perilla de silenciar ni regla anti-ruido. Todo por `enviarNegocio`/`enviarNegocioPrivado`/`enviarSistema`; nadie llama `sendTelegramAlert` directo.
- 🔴 El resumen diario de ACS va al chat PRIVADO, sin prefijo de sistema (`enviarNegocioPrivado`), desde DOS lugares que no se separan: el cron de la 01:00 y la recuperación de `switch-reconciliacion`.
- 🔴 **Nada que no se pueda volver a conseguir se queda sin copia**: la base entera clasificada en `src/lib/backup/tablas.ts` (personas · congelada · switch · bitacora · retirada · vista), build ROJO si una tabla nueva queda sin clasificar o si se saca del respaldo algo que no vuelve. 🩸 Una PK que no sea `id` va en el `ORDER_BY` (`PK_QUE_NO_ES_ID`) o el respaldo sale incompleto. `switch_factura_lineas`, afuera a propósito.
- 🩸 `db-max-rows` = **1000** y corta EN SILENCIO: lo que pueda pasarlo usa `leerTodoPaginado` con `.order()` estable y `count: "exact"`; la columna única, de desempate.
- Filtrar por año va por RANGO (`fecha >= … AND fecha < …`), nunca `EXTRACT(YEAR …)`: no es sargable.
- **Guard de montos imposibles** en las 8 tablas de plata: `max(piso de la familia, 20 × récord de esa empresa)`. Se rechaza la fila, nunca se escribe un 0, y se dice en pantalla.
- Un sync atascado se suelta solo a los **30 min** (`RUNNING_STALE_MIN`).
- 🔴 **Hay tareas cuyo producto ES el mensaje, y se vigilan**: cinco en UNA lista (`crons-que-avisan.ts`) — `cheques-alert` · `guias-pendientes` · `acs-resumen-diario` · `grupo-resumen-mensual` + `acs-fidelizacion`, que no manda mensaje y no registra su corrida. 🔴 Ninguno de la lista escribe en `switch_sync_log`. `cronIsStale` (**33 días** el mensual); anti-loop **7 días** por cron, sin entradas nuevas de cron.
- 🔴 **La regla 2 tiene anti-loop**: llave por (par, arranque de la racha), **48 h** entre repeticiones; el primero no se demora. Fallos seguidos según el RITMO del par: **3 desde 5 corridas/día**, **2** el resto, derivado del cronograma (`corridasPorDiaDelPar`), nunca a mano.
- 🔴 El dedup de A y B se marca DESPUÉS de que Telegram confirme; igual la regla 2 y los crons. ⚠️ La regla 1 (`datos-frescos.ts`) marca antes, ventana de 20 h: **pendiente de unificar**.
- ⚠️ `switch_recibos` y `switch_ingresos_mercancia` NO entran a la alerta B: recibos escribe solo lo que cambió y pasa las 40 h estando sano; ingresos reescribe **45 días** y la compra puede no ocurrir. No se agregan sin volver a medir.
- ⚠️ El resumen «Switch estuvo caído… sin impacto» NO va a Telegram, con candado.

**El lector de facturas avisa por Telegram (11-sep-2026)** — la regla 2 sobre un servicio de afuera.

- 🔴 **Avisan TRES causas y nada más** (`clasificarFalloAnthropic`): llave que no sirve (401/403 `authentication_error`/`permission_error`, y la llave AUSENTE), crédito agotado (402, o el 400 cuyo MENSAJE dice `credit balance`/`billing` — el texto, no el status) y tope de uso persistente (429 / `rate_limit_error`).
- 🔴 **Lo que NO avisa es la mitad del diseño**: PDF ilegible, 400 de documento, timeout, 500 y 529 «overloaded» no suenan.
- 🔑 «Persistente» está medido: el cliente fija `maxRetries: MAX_REINTENTOS` (**2**) a propósito, no por el default; si se toca, hay que repensar ese mensaje.
- 🔴 Un solo punto de llamada a Anthropic: `src/lib/ia/anthropic.ts`, sin prompt ni modelo adentro (ningún `claude-…` ahí). El error se vuelve a lanzar tal cual: mismo 500, la pantalla no cambia.
- 🔴 **Anti-loop de 7 días POR CAUSA** (`cron_email_errors.tipo` = `lector_facturas:<causa>`), marcado DESPUÉS de que Telegram confirme; la causa va en la llave para que una llave vencida no tape un crédito agotado posterior. Fail-OPEN, y avisar NUNCA lanza.
- El mensaje manda a la pantalla exacta: llave → API Keys y luego Vercel (`ANTHROPIC_API_KEY`, Production); crédito → Billing; tope → Limits; y dice que no se perdió nada.

- Los Excel de todo el sistema empiezan en la **fila 1**, con filtro desde A1 y la fila de encabezados fija. Todo export sale por `workbookBytes`/`workbookBuffer`/`workbookBlob`.
### Ventas, Referencia y Comisiones — [docs/postmortems/ventas-referencia.md](docs/postmortems/ventas-referencia.md)

> 📄 Mediciones, citas de Daniel, candados, mutaciones y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026». Léelo antes de tocar una pantalla suya.

- `switch_facturas` es la **fuente única de ventas**. Las **notas de crédito RESTAN**.
- Los tipos de comprobante viven en `lib/ventas/tipos-comprobante.ts`; uno sin clasificar **avisa** (regla 2) en vez de valer CERO en silencio.
- Las ventas las vigila `lib/datos-frescos.ts`, que **DERIVA** su lista de `empresasConFacturas()` y avisa a las **+24 h**.
- Referencia — los **TRES GRANDES son de la ÚLTIMA LLEGADA** (`medirTandas`); **Stock es SIEMPRE la existencia real de Switch** y el cuadre **no se fuerza**. La llegada se corta en `min(2, 10% de lo llegado)`. 🔴 **Nada de FIFO**: no se le atribuye una venta a una compra.
- 🔴 **«Actualizar datos de Switch» lo ve TODO el módulo**: `REFERENCIA_ROLES` (`lib/ventas/referencia.ts`) es UNA lista para todo el módulo; acelerador `SYNC_NOW_COOLDOWN_MIN` = **10 min**. El catálogo se trae **por empresa**.
- **VENDIDO = `Vendí ÷ (Vendí + Stock)`**. El **FOB se calcula** (`CIF ÷ 1,10`, `fobEstimado()`), **no se usa el de Switch**.
- **Las 6 del grupo comisionan igual**: **0,5 % sobre la VENTA** de las facturas con `pct_utilidad > 20` — la utilidad es **criterio de entrada**, no base. Retenciones y `TCKCTA` fuera. `comision_b2b_v9` vía `lib/comisiones/rpc`, con red a las versiones previas.
- 🔴 **Tres vendedores, tres papeles**: `vendedor_nombre` de la factura → **VENTA**; `switch_recibos.vendedor_registro` (quien REGISTRÓ el pago) → **COBRO**; `vendedor_cartera` → **ninguna comisión**.
- 🔴 **DEFAULT y DANIEL LEVY se calculan y se muestran, pero NO se pagan** (`VENDEDORES_SIN_PAGO`, `lib/comisiones/sin-pago.ts`): el total suma solo lo pagable, pero **el Excel los sigue llevando**.
- 🔴 **CLIENTES QUE NO COMISIONAN para un vendedor**: grano **(empresa, cliente, vendedor)**: `comision_exclusion` en `UPPER(TRIM())`, **soft delete firmado, nunca DELETE**, única entre ACTIVAS, RLS service_role. Otro vendedor **sí** comisiona; solo admin, una fila por empresa.
- 🔴 **Distinguen VENTA de COBRO**: `excluye_venta` / `excluye_cobro` (`DEFAULT true`, CHECK «al menos una»); con las dos apagadas **no se guarda y se avisa**.
- 🔴 **MULTI FASHION HOLDING SE EXCLUYE POR CÓDIGO (D-108), CON COMODÍN `*` = TODOS LOS VENDEDORES**: enumerar nombres deja entrar al nuevo. La v9 = la v8 **byte a byte** salvo eso. Migración `20261008120000`, aplicada.
- 🔴 **UNA PERSONA, UNA FILA, UNA TASA**: `comision_vendedor_alias` + `comision_vendedor_canonico(text)`; sin alias, el nombre **solo recortado**; canónico **REYNALDO con Y**. **Todo lo que agrupa por vendedor pasa por él**, incluido `aplicarAlias` (**falla abierto**).
- 🔴 **Los retirados viven en UN solo lugar, `lib/comisiones/retirados.ts`**: `estaRetirado()` compara por el **canónico**, no salen **ni en tablas ni en totales**, el servidor **rechaza** su tasa o exclusión (400) y su fila se **desactiva, nunca DELETE**.
- 🔴 La columna «activo» de las tasas **no quita la comisión a nadie** y **no se dropea**: sacar a alguien es **solo** por `retirados.ts`.
- **`nombreVendedorEnPantalla` solo cambia cómo se MUESTRA**: la clave de agrupación, los descuentos y el Excel siguen en mayúsculas.
- **Los descuentos se restan UNA sola vez, en el SERVIDOR** (`netearComisiones`); ninguna vista resta por su cuenta.
- 🔴 **UN DESCUENTO TIENE FECHAS**: `desde` / `hasta`, el «hasta» **INCLUSIVE** y **OPCIONAL**, grano **MES**; sin `desde`, como siempre. `lib/comisiones/vigencia.ts`, aplicada en `leerDescuentosEfectivos` **antes** de la excepción del mes. Migración `20261007120000`, aplicada.
- 🔴 **Se administran en Comisiones › Configuración**: solo admin, **soft delete, NUNCA DELETE**, y el alta REVIVE una fila quitada. ⚠️ La excepción por MES vive en `/api/ventas/comisiones/descuentos`, con otros roles.
- 🔴 **Comisiones abre en el ÚLTIMO MES CERRADO y el «hoy» es el de PANAMÁ** (`hoyPanama` + `lib/comisiones/mes-inicial.ts`).
- 🔴 **«Todo el año» es LA SUMA DE SUS MESES**: la misma RPC mes a mes, neteada por `netearComisiones` (`acumular-anio.ts`), cortada en el mes en curso de **Panamá**; **la tasa no se suma: se conserva la vigente**. ⚠️ Ahí no hay detalle ni PDF (`conDetalle = !esTodoElAnio(mes)`): el reporte es de **UN mes**.
- 🔴 **El mes NEGATIVO se queda como está**: no cambia el cálculo.
- 🔴 **El costo del Resumen incluye las notas de débito**: sale de `switch_factura_utilidad` (`switch_costo_unificado_v2` y las RPC del Resumen).
- 🔴 **Ninguna lectura de costo del Resumen sale de `switch_costo_diario`** (su último día de cada mes vale $0): solo alimenta el **cuadre mensual** (`cuadre-costo.ts`).
- ⚠️ **Multifashion es OTRO módulo de comisiones — NO fusionar**: paga 0,5 % solo sobre el CONTADO, sin filtro de utilidad; **nunca se suman en un número**. Su vista recibe el **AÑO ELEGIDO**.
- 🔴 **EL PAPEL DEL VENDEDOR LLEVA SOLO LO PAGABLE (22-sep-2026)**: la factura con utilidad ≤ 20 (aporte $0) y el recibo en cero **no salen** ni en el PDF ni en el Excel; UNA función (`papel-pagable.ts` › `renglonesDelPapel`) la leen los dos; **ningún total se mueve** (agosto 2026 = $5.978,55 medido antes y después). 🔴 **Multifashion en Comisiones abre y se mueve con el período del grupo** (`multifashion-periodo.ts`; sin papel: no se inventó descarga). 🔴 **Queda rastro** en `activity_logs` (`comisiones`: descargas y configuración, el servidor anota quién). Interruptores `PAPEL_SOLO_PAGABLE` · `MULTIFASHION_CON_EL_PERIODO_DEL_GRUPO`; candado `comisiones-papel-pagable`.
- 🔴 **`clientes_master` es el directorio del GRUPO y SOLO del grupo**: el sync pide por **INCLUSIÓN** (`.in("empresa_key", EMPRESAS_DEL_GRUPO)`), nunca excluyendo: la tabla **no tiene `empresa_key`**.
- 🔴 **LA IDENTIDAD DEL CLIENTE ES EL CÓDIGO**: `switch_facturas (empresa_key, cliente_switch_id)` → `switch_clientes` → `codigo` → `clientes_master.codigo`, par **único por construcción**.
- 🔴 **Nadie une `clientes_master` por `nombre_normalized`, y NO hay fallback por nombre**: un JOIN por nombre contra homónimos **multiplica la factura**.
- ⚠️ **`TCKCTA` no es un cliente**: es el mostrador, se reconoce por CÓDIGO (`esMostrador`) y nunca por nombre; el grano de los rankings es **(cliente, EMPRESA)**.
- 🔴 **TODA comparación «vs año pasado» usa los MISMOS DÍAS** (`lib/ventas/clientes-corte-comparativo.ts`): corte = último día **CARGADO** del período en curso, nunca después de HOY en Panamá; 29-feb → 28-feb; un período cerrado va entero contra entero. «Compras \<año\>» no se recorta.
- ⚠️ **Productos** corta por `ultimoDiaArticuloDiario` (`switch_articulo_diario` llega hasta AYER), parámetro OBLIGATORIO de `productosRangoComparativo`. ⚠️ **Multifashion › Vendedoras compara contra el MES ANTERIOR** y lo dice el rótulo.
- ⚠️ **Pendiente de Daniel**: «las 6 hojas» se leyó como las 6 EMPRESAS, no seis reportes de detalle.
- 🔴 **UNA SOLA VENTA (23-sep-2026)**: Resumen · Clientes › Utilidad · Productos dan el MISMO número por empresa (Daniel: *«Debe de dar igual»*; la referencia es el Resumen). Utilidad suma el contado (`utilidad_por_cliente_v3`, migración `20261217120000` **pendiente**; sin ella, v2 + contado de `switch_facturas`, ±$0,01 dicho); Productos toma su total del Resumen (`leerDashboardSummary`) y DICE lo que el reporte por artículo no trae (notas de débito · renglones sueltos). El CASE de SQL se GENERA de `tipos-comprobante.ts` (`sqlVentaFirmada`). Interruptor `una-sola-venta-interruptor.ts`; candado `ventas-una-sola-venta`.
- 🔴 **2022 y 2023 se sirven** en Productos y Utilidad (`anioValido`) y un año sin datos dice «tiene datos desde <mes> <año>»; el Excel de Clientes marca el mostrador y su TOTAL dice qué suma; la matriz dice «no vendiste» en las SEIS llamadas (`deltaCeldaDe`). ⚠️ Las 87 tandas «Actualizar ahora» de la auditoría eran el refresco de facturas de Guías (`facturas-hoy`, 6 empresas): el botón de Ventas corrió UNA vez (6-sep) y completo.
### Vista General y Ventas — el mes es el de Panamá (11-sep-2026)

> 📄 Mediciones, citas de Daniel, candados y las reglas de PANTALLA: [docs/postmortems/ventas-referencia.md](docs/postmortems/ventas-referencia.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- 🔴 **Vista General y Ventas deciden su mes con `hoyPanama()`**, nunca el reloj del navegador ni el del servidor (Vercel corre en UTC). ⚠️ Solo cambia con qué período abre cada pantalla.
- 🔴 **UN SOLO SELECTOR DE PERÍODO manda en las tres pestañas** (`lib/ventas/periodo.ts`): años y las ventanas de 12 y 6 meses, en la URL (`?periodo=`) y recordado (`fg_last_ventas_periodo`); **manda la URL, después la memoria, después el año en curso de Panamá**.
- 🔴 **Cada pestaña ofrece SOLO lo que sabe servir** y un período que no sirve cae al año en curso; en Clientes las ventanas salen **solo cuando la vista las trae** (`ventanasDisponibles`, lo dice el SERVIDOR).
- 🔴 **EL MARGEN DEL MES EN CURSO NO MEZCLA VENTA DE HOY CON COSTO DE AYER** (`lib/ventas/margen-mes-en-curso.ts`): utilidad y margen se calculan hasta el **ÚLTIMO DÍA CON COSTO**; **la VENTA del mes sigue siendo la de hoy**. El corte lo trae la RPC `ventas_mes_en_curso_corte_costo` (migración `20261120120000`, aplicada); sin ella la lectura **falla ABIERTA**.
- Cada descarga de Ventas se anota en `activity_logs` (`descarga_excel`) y baja **lo que está en pantalla**.
- 🔴 **«Todas las empresas» cuando la lista son solo las 6 del grupo; «Fashion Group» solo si mezcla grupo y no-grupo** (`rotuloDeTodas`, `lib/ventas/rotulo-empresas.ts`; las seis DERIVAN de `B2B_EMPRESA_KEYS`, sin Boston ni Multifashion).
- 🔴 **`clientes_empresa_12m_vw` es MATERIALIZADA aunque termine en `_vw`**, y la refresca `switch-sync tipo=facturas|all` cuando alguna de las 6 termina bien (tolerante). Los TRES caminos dejan la marca `clientes-vw-refrescada` en `cron_heartbeats` (`HEARTBEATS_NO_CRON`); sin marca, no se dice frescura.
- 🔴 **Nunca se rotula un período que no se sumó** (`rotuloCompras`). ⚠️ Las ventanas de Clientes salen de la migración **`20261121120000`** (**aplicada**, aditiva); sin ella el servidor sirve el año y lo dice (`ventana: null`).
- 🔴 **«Nuevo» en vez de «+0 %»** para el cliente sin base comparativa (`delta: null`), y va al final al ordenar por cambio.
- 🔴 **Multifashion fuera del selector de Ventas › Productos** (`PRODUCTOS_EMPRESAS` deriva de `B2B_EMPRESA_KEYS`): no tiene filas en `switch_factura_lineas`. **Boston NO entra.**
- 🔴 **La puerta de atrás se cerró**: las 6 rutas de datos de Ventas son **solo `admin`**; `/api/ventas/v2`, `/v2/status`, `/años`, `/ventas/reporte` y `/api/ventas/resumen-anual` se retiraron; la búsqueda global no le ofrece «Ventas» a contabilidad.
- ⚠️ **Pendiente de Daniel**: en Clientes › Utilidad el período sigue siendo el año (esa ruta no tiene ventanas).
### El módulo Clientes — la ficha y la lista (5-sep-2026)

> 📄 Detalle, mediciones y candados: [docs/postmortems/clientes.md](docs/postmortems/clientes.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- 🔴 Una página del cliente (`/clientes/[codigo]`) y tres listas distintas: CXC y Ventas › Clientes no se tocan.
- 🔴 Ficha: cuatro tarjetas, «Empresa por empresa» y «Últimos pagos» por FECHA; sin «Cobrado» ni paginación, con el ITBMS; se edita tocando el dato.
- 🔴 Nunca `$0.00` en grande: «Sin comprar en \<año\>», «No debe nada», «Nunca ha pagado» (`lib/clientes/ficha.ts`); el cero neto es correcto —las NC restan— y `estadoDeCompras` lo separa de «acreditado».
- 🔴 «Cobrar» y «Ver los N documentos» abren la MISMA `HojaCobrar` y `EstadoCuentaDrawer` del CXC (`CobrarEnFicha.tsx`): deshacer 5 s, 6 empresas en el servidor, 403 a bodega.
- 🔴 «Últimos pagos» reusa `lib/cxc/pagos-por-fecha.ts`: sin retenciones ni recibos en cero.
- 🔴 Lista: el directorio entero con scroll, sin páginas ni corte por «activos»; chips calculados («Deben» = saldo ≠ 0) y faltantes en rojo. 🩸 Sin provincia.
- 🔴 El ausente (`ausente_desde`) no sale en la lista ni en la búsqueda global; ⚠️ su ficha SÍ abre por enlace directo, con «Ya no está en Switch».
- 🔴 `clientes_master.direccion_switch` (migración `20260930120000`, aplicada) se ve en la ficha y NO alimenta Guías; solo la escribe `sync-clientes-master`.
- 🔴 «Ver en Ventas ›» (solo admin) manda el CÓDIGO (`?tab=clientes&cliente=D-25`) y resalta esa fila sin esconder las demás.
- 🩸 «Compró \<año\>» moría a los 200 clientes: tope 1.000 y la lista va por POST; el GET sigue vivo, con el MISMO `comprasDelAnioPorCodigo`.
- 🔴 Bodega no entra al directorio por la dirección: los guards salen de `ROLES_CLIENTES` (`lib/clientes/roles.ts`); ⚠️ la búsqueda global le sigue dando clientes.
### Multifashion — [docs/postmortems/multifashion.md](docs/postmortems/multifashion.md)

> 📄 Mediciones, citas de Daniel, candados y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- Multifashion ES `american_classic`: constante del servidor, nunca de la URL; mes UTC−5 fijo (`hoyPanama`).
- `gerente_acs` ve el módulo COMPLETO y es su ÚNICO módulo (403 en el resto); queda la validación de parámetros.
- 🔴 Guard SSR y UNA lista de roles (`lib/multifashion/acceso.ts`) derivada de `modules.ts`: `ROLES_MULTIFASHION` = admin + `gerente_acs`, `ROLES_LECTURA_METAS` sin `secretaria`, `ROLES_ADMIN_METAS` solo admin. ⚠️ Excepción: `vendedoras` y `bonos` del espejo de Comisiones.
- Comisiona con otra base: `SUM(subtotal firmado) × 0,5%`, sin filtro de utilidad; el «0,5%» igual al del grupo es coincidencia.
- Un mes empezado va contra los MISMOS DÍAS del año pasado, los CARGADOS en `switch_articulo_diario`, no «hasta hoy» (`clientes-corte-comparativo.ts`); Vendedoras, contra el mes anterior.
- Proyección por TEMPORADA, no por días; bajo el 5% no se proyecta y se dice, con cuántos días está hecha.
- Metas configurables; la grupal mide TODA la venta de la tienda y los participantes solo definen a quién se le muestra el aporte; nunca se reparte un objetivo solo.
- Telegram de ACS: UNA línea arriba/abajo del ritmo — `ritmo` = venta del año pasado al mismo corte × (objetivo ÷ venta del rango un año antes), % = vendido ÷ ritmo − 1; sin meta vigente no sale, falla abierto (`meta-ritmo.ts`).
- `claveVendedora` agrupa por igualdad exacta normalizada, nunca por parecido; la venta de hoy sale de `retail-dia.ts` con frescura; la «marca» de Switch es marca + departamento y lo desconocido cae en «Otros».

**El rediseño del módulo (6-sep-2026).**

- 🔴 Cuatro pestañas (`pestanas.ts`): Metas dentro de Vendedoras y Caja fuera, sin borrar ruta ni componente (`mayor_lineas`); `?subtab=` viejo cae en Resumen.
- 🔴 Un solo control de tiempo (`periodo.ts`, `?mfPeriodo=`): meses, año y últimos 3 · 6 · 12; cada pestaña ofrece SOLO lo que sabe servir y lo demás cae a SU MES; corte en Panamá.
- 🔴 «Multifashion» en todos lados; `/multifashion` y `american_classic` intactos.
- 🔴 El bono es una COLUMNA «al cierre» mientras el mes no termine; ⚠️ monto y regla intactos; el espejo de Comisiones monta el MISMO componente sin `periodo` ni `conMetas`.
- 🔴 Clientes abre con la cobertura en una línea (`clientes-cobertura.ts`); sin tiquetes se abstiene; abre con 10 filas.
- 🔴 Nombres capitalizados (`nombreVendedorEnPantalla`): solo cambia cómo se MUESTRA, la clave sigue en mayúsculas.
- 🩸 «Cuándo vende la tienda»: cada línea dice su período — «Día más fuerte» y «Hora pico» de los últimos 3 meses (`patrones.ts`), «Mejor / peor día» del MES. 🔑 El promedio de N meses no es el de sus promedios: se suman `promedio × días` y días.
- 🔴 «Hoy» es UNA línea y no escribe «$0» si el día no arrancó; «Actualizar ahora» al ☰.
- 🔴 Las vendedoras con dos códigos se juntan (`20261009120000_multifashion_vendedora_alias.sql`, **aplicada**): identidad = CÓDIGO, tabla firmada, soft delete nunca DELETE, única entre activas, RLS service_role; lo resuelve `multifashion_vendedora_canonica` y las RPC v4 caen a la v3 sin la DDL.
- ⚠️ Juntar los códigos NO arregla la diferencia entre Vendedoras y el mes: falta `DEFAULT`, excluido a propósito.
- 🔴 **«REDES Sheynee» (15) ES Sheynee (11)**: columna `canal` del MISMO amarre, NUNCA por nombre; UNA fila (comisión y bono juntos) con «tienda $X · redes $Y» (`canales.ts`, v5); Metas lee el canónico (`meta_ventas_v2`). Migración `20261209120000` **pendiente**.
- 🩸 La fila «YTD» pasa a «Año» con el total de la tarjeta (`fila-anio.ts`); el Δ va sobre los meses comparables. ⚠️ En el año en curso puede diferir por el día de corte.
- 🩸 `SyncNowButton` con `roles={ROLES_MULTIFASHION}`; el rol sale de `lib/roles-etiquetas.ts`, derivado de `SYSTEM_ROLES`.
### Marketing › el rediseño (22-sep-2026) — [docs/postmortems/marketing-rediseno.md](docs/postmortems/marketing-rediseno.md)

- 🔴 **El cimiento está puesto y las pantallas NO** (pieza 1 de 5): un gasto es factura · mueble · impulsadora con **UNA marca** (`exigirUnaMarca`, enchufada en las tres puertas), su **tienda** del directorio o «General» (**el proyecto se va**, Daniel: *«a) Basta la tienda»*), y **`se_reporta`** prendido por defecto (apagado no suma ni va al ZIP). Módulos puros en `lib/marketing/{gasto,proveedor,duplicado,periodo-estado,agrupar-por-tienda,columnas-opcionales}.ts`; duplicado = proveedor NORMALIZADO + monto + fecha y **no se guarda**; el período tiene DOS estados y la nota de crédito es TEXTO sin cálculo.
- 🔴 **Migraciones `20261216120000` y `20261216120100` APLICADAS el 22-sep-2026** (86 facturas · 24 entregas · 60 adjuntos tomaron la tienda de su proyecto; 22 facturas sin tienda: 17 de impulsadoras sin proyecto, 4 muebles Boston sin proyecto, 1 con proyecto sin tienda): aditivas, COPIARON la tienda del proyecto y **el código falla ABIERTO sin ellas**. 🩸 «Eliminar definitivamente» se retiró (rutas 403) y `mk_proyecto_marcas` quedó sin lectores (`congelada`, no se dropea). El reparto para las piezas A–D vive en el postmortem. Candado: `marketing-cimiento`.
- 🔴 **SE ENTRA POR LA TIENDA, Y «NOVA» YA NO TRAE «RENOVACIÓN»** (pieza B): `/marketing/tienda/<código>` muestra TODO lo suyo agrupado **por marca** —facturas, muebles, impulsadoras y fotos—, con el total **solo de lo reportado** (lo apagado se ve en gris y no suma); la tienda se resuelve **por CÓDIGO** de `clientes_master` y «General» tiene su vista. El resultado de **⌘K** lleva ahí, y el texto se compara **por palabra** (medido: «nova» pasaba de 2 proyectos a 1, «d» de 21 a 6; el **número de factura sigue por subcadena** —79 de 108 con ceros al frente—). Interruptor `VISTA_TIENDA` (`lib/marketing/vista-tienda.ts`, hoy `true`). Candado: `marketing-vista-tienda`.
- 🔴 **UNA PUERTA «＋ Gasto», TRES FORMULARIOS, Y EL DUPLICADO NO ENTRA** (pieza A): pregunta QUÉ es (factura · mueble · impulsadora, derivados de `gasto.ts`), después la **marca (UNA, obligatoria)**, la **tienda del directorio o «General»** (obligatoria si es de una tienda; desde una tienda ya elegida no se pregunta), **«Se reporta a la marca» prendida** y la nota; el botón apagado dice **«Falta: la marca y la tienda»**. La marca viaja **con la factura** (`marcaId`, 400 antes de escribir) y `se_reporta` · `tienda_codigo` · `nota` entran por `columnasDelGasto` en las TRES puertas; el proveedor se **sugiere** del histórico, nunca lista cerrada; **el freno de duplicados es del SERVIDOR** (proveedor normalizado + monto + fecha → 400 `duplicado`, en impulsadora la fecha es `periodo_desde`). Sin proyecto: `proyecto_id = null`. Interruptor `MARKETING_PUERTA_GASTO` (`lib/marketing/puerta-gasto.ts`, hoy `true`). Candado: `marketing-puerta-gasto`.
- 🔴 **ABIERTOS | CERRADOS, Y CERRAR ES PONERLE EL NOMBRE** (pieza C): la portada tiene DOS pestañas —por marca, su período abierto con **lo reportado como único monto**, lo apagado en gris sin sumar y «N días abierto»; en Cerrados, el **nombre que se le puso al cerrar**, la fecha y la nota de crédito—, **sin tarjeta de Multifashion** (es una tienda; se enlaza en Herramientas; 🔴 **sus $8.061,63 NUNCA se le cobran a una marca — decisión de Daniel, 22-sep-2026: *«b) No, nunca»*; no se vuelve a preguntar**) y **sin total del grupo**. Cerrar pide el **nombre obligatorio** y la **nota de crédito como TEXTO**, sella lo del período, **no escribe `reporte`** y abre el siguiente con `abrirSiguiente` («Desde el …», `hoyPanama()`). Reportes **por marca y por tienda** con la marca y la tienda **del GASTO**, solo `se_reporta`, una marca = 100 %, sin pie; 🩸 «Por proyecto» (ruta **410**) y «Exportar Excel» se retiraron. ⚠️ Pendiente de Daniel: si los $8.061,63 de Multifashion entran al período de su marca. Interruptor `MARKETING_PORTADA_REDISENO` (`lib/marketing/portada-rediseno.ts`, hoy `true`). Candado: `marketing-portada-y-cierre`.
- 🔴 **UN PERÍODO CERRADO ES UNA FILA, AUNQUE LO COMPARTAN DOS MARCAS** (22-sep): «mid 2026» es de **PVH** (la casa de Tommy y Calvin) y se veía DOBLE, con «Cerrados 2». Hoy va UNA fila —«mid 2026 · PVH», con los DOS montos, cada uno con su marca y su propia puerta— y la pestaña cuenta PERÍODOS; adentro de la marca dice «parte Tommy Hilfiger · el resto es de Calvin Klein», con SU monto. 🔴 **Nunca se suman** (el grupo no tiene `total`); las marcas salen de los DOCUMENTOS y el nombre de la casa de una tabla chica (`cerrados-por-periodo.ts`). Candado: `marketing-cerrados-por-periodo`.
- 🔴 **NINGÚN MES SIN PAGAR SE ESCONDE, Y EL PAPEL DE LA MARCA SALE LIMPIO** (pieza D): la tarjeta de una impulsadora lista **TODOS los meses sin pagar desde el primer pago**, el más viejo arriba (miraba DOS y desaparecía lo viejo; medido: Ana Trejos **24 meses**, Cindy **4**), y «Registrar pago» abre en el más viejo. El Excel del ZIP pierde la **nota interna** («este período se cerró sin reporte guardado», 1 celda del archivo real de Tommy), el **nombre de las empresas del grupo en el concepto** —derivado de `EMPRESA_KEY_TO_NAME` + `EMPRESA_FISCAL`, **nunca el proveedor**: Boston fabrica— y deja **UNA grafía por proveedor** (el sufijo de sociedad iba de 4 formas a 2, 19 de 40 celdas); entra **solo lo que `se_reporta`** y **una marca = 100 %** (ningún monto se movió). Los links firmados duran **30 días**, no un año, con `POST /api/marketing/zip/firmar-de-nuevo`, y **cada ZIP que se baja se guarda** en `marketing/periodos/<id>/<fecha>.zip` y se anota en `mk_periodos.zips_bajados` releyendo la fila (falla ABIERTA: la descarga sale igual). Interruptor `ZIP_E_IMPULSADORAS_NUEVO` (`lib/marketing/zip-e-impulsadoras.ts`, hoy `true`). Candado: `marketing-zip-e-impulsadoras`.
- 🔴 **EDITAR UN GASTO CAMBIA SU TIENDA, EL MUEBLE TIENE FOTO Y EL PERÍODO DICE LO QUE YA SE MANDÓ** (los tres remates, 22-sep): al editar salen **tienda · «se reporta» · nota** con su valor de hoy y **lo que no viaja no se pisa** (un `null` SÍ es «General»); el duplicado al editar **no se cuenta a sí mismo**; la foto del mueble cuelga de la **tienda** (`TIENDA_GENERAL` si es «General») y se sube **después** de guardar; y la pantalla del período lista los ZIPs de `mk_periodos.zips_bajados` con **«Volver a firmar»** (30 días) — 🔴 **sin ZIPs anotados no se dibuja nada** (hoy los 6 están en `[]`). Candado: `marketing-remates`.

### Marketing › Mobiliario — [docs/postmortems/marketing-mobiliario.md](docs/postmortems/marketing-mobiliario.md)

- 🔴 **El inventario se descuenta en PIEZAS.** Los bultos son solo cómo viajó la mercancía y **no existe conversión fija** entre unos y otros. `piezasParaStock()` es la única función que toca el stock, y hay barrido que pone el build ROJO si `bultos` entra en esa aritmética.
- Bultos es **opcional**: `null` se muestra vacío, **nunca como `0`**.
- El **stock puede quedar negativo**, con aviso en pantalla: la entrega no se bloquea.
- **Paneles NO es obligatorio.** El único freno es que la entrega tenga **al menos un producto con cantidad**, y está cerrado también en el servidor.
- Editar y borrar **devuelven el stock por delta**; ejecutar dos veces no cuenta dos veces (`deleteEntrega` lee los renglones ANTES del DELETE).
- `mk_mobiliario_notas_proveedor` (los costos del proveedor) queda **SEPARADA del inventario. NO fusionar**: son los mismos muebles con precios distintos a propósito.
- La **nota de entrega** usa un solo generador para compartir e imprimir, y el PDF se arma **antes del clic** (iOS bloquea la hoja de compartir si hay un `await` de red en el medio).

## Guías — máquina de estados
- `guia_transporte.estado` es TEXT **sin CHECK**: los valores valen por convención. **Pendiente Bodega** (al crear) → **Completada** (exige receptor, cédula, placa, ≥1 bulto y las dos firmas; queda bloqueada). 🩸 **«Rechazada» se retiró** (Guías › la limpieza del 5-sep-2026).

## Auth

> 📄 Mediciones, citas y candados: [docs/postmortems/auth-sesiones.md](docs/postmortems/auth-sesiones.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- Passwords: bcrypt hashed (migración de plaintext completada); el login exige bcrypt y rechaza cualquier password no-hasheada.
- Session: httpOnly cookie `cxc_session`, base64url-encoded JSON `{role, userId, userName, sessionToken}`.
- **Reanudar sesión (3-sep-2026):** con la cookie de 7 días viva **no se pide contraseña**: el login pregunta `GET /api/auth/sesion` (**fail-closed**: firma HMAC + token vivo y del MISMO usuario en `user_sessions` + usuario activo en `fg_users`; rol y módulos salen FRESCOS de la base, payload compartido en `src/lib/sesion-payload.ts`) y manda a la casa del rol; pase vencido, revocado o logout → contraseña como siempre. Los 3 botones de salir revocan y **esperan** el DELETE antes de navegar.
- Middleware: `src/middleware.ts` valida sesión contra `user_sessions`.
- 🔴 **`last_seen` se escribe como mucho UNA VEZ CADA 5 MINUTOS por sesión** (19-sep-2026): era un PATCH fire-and-forget en CADA petición de CADA persona, el renglón más caro de Sentry. Sigue SIN `await` a propósito (esperar costaría ~200 ms por navegación): lo que se recortó es CUÁNTAS veces ocurre. La marca viaja en su cookie (`cxc_ultimo_toque`) porque el borde no tiene memoria, y **ante la duda se escribe**; cabe de sobra en los 14 días de `session-retention.ts`. ⚠️ Admin › Usuarios muestra la «última actividad» hasta 5 min atrasada.
- 🔴 **Una sesión no vence sola: la mata el cron (26-jul-2026).** `user_sessions` **no tiene `expires_at`** y la cookie firmada tampoco lleva claim de expiración — el `maxAge` de 7 días es un control del CLIENTE. `/api/cron/cleanup-sessions` (02:30 UTC) revoca a los **14 días** sin `last_seen`, pone un tope duro de **90 días** de vida aunque se la mantenga a pings, y **borra** las revocadas con `last_seen` > 90 días (`src/lib/session-retention.ts`). Si algún día se agrega un `expires_at`, el middleware tiene que respetarlo.
- ⚠️ **No hay chequeo de sesión periódico**: `/api/auth/check` existe pero NADIE lo llama — `useSessionCheck` no tiene importadores desde el 11-abr-2026 y `SessionWarning` nunca se montó. No corre ningún ping cada 2 min ni sale el aviso de «tu sesión está por vencer».
- API auth: `src/lib/requireRole.ts` — admin siempre pasa, verifica rol contra array.
- Rate limiting: login en Supabase (`login_attempts` + RPC `register_login_failure`/`clear_login_attempts`), por IP — 5 fallos en 15 min → lockout 15 min (`src/lib/login-rate-limit.ts`, fail-open). Reemplazó el Map en-memoria (inefectivo en serverless).
- Login case-insensitive (autocapitalizar iPhone); input con autoCapitalize=none, autoCorrect=off. Nombre + rol visibles en header y drawer. «Forgot password» → "Contacta al administrador".
## Base de datos

> 📄 Los conteos medidos, las tablas retiradas y el detalle: [docs/donde-vive-cada-dato.md](docs/donde-vive-cada-dato.md) y [docs/postmortems/crons-alertas.md](docs/postmortems/crons-alertas.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- **Tablas grandes:** `switch_articulo_diario` · `switch_factura_lineas` · `switch_facturas` (historia oct-2022+, fuente única de ventas) · `ventas_raw` (congelada, **sin lectores en la app**) · `switch_recibos` · `switch_ingresos_mercancia` · `switch_articulo_info` · `cxc_rows` (legacy, sin lectores).
- **Soft delete (`deleted` boolean), por módulo:** Caja (`caja_gastos` + `deleted_by`/`deleted_at`, `caja_periodos`) · Préstamos (`prestamos_empleados`, `prestamos_movimientos`) · Reclamos (`reclamos`, `reclamo_items`, `reclamo_settlements`) · Recordatorios (`cheques` + `deleted_at`, `recordatorios`) · Guías (`guia_transporte`, `guia_items`) · Directorio (`clientes_master`; `directorio_clientes` retirada, respaldada como congelada). ⚠️ `packing_lists` usaba `deleted_at` en vez de `deleted`; el módulo se retiró y la tabla quedó sin escritores.
- **Vistas / Materialized views:** sufijo `_mv` = materialized view, `_vw` = view (no verificado contra el catálogo pg). `ventas_rollup_mensual_mv` (única `_mv`), `clientes_agregado_12m_vw`, `clientes_empresa_12m_vw`, `reebok_pedidos_unificado_vw`, `switch_costo_unificado_vw`, `switch_ventas_unificado_vw`, `_multifashion_sf_vw`.
- **Flags de negocio:** `is_wholesale` (`ventas_raw`, `switch_facturas`, `_multifashion_sf_vw`; segrega retail/wholesale en Multifashion) · `is_preorder` (`reebok_order_items`).
- 🩸 `cxc_favorites` **RETIRADA de la app el 4-sep-2026**: la tabla queda (patrón `mayor_lineas`), sin lectores ni escritores, y ninguna migración puede dropearla. `reclamo_custom_motivos` y `reebok_orders.client_email` siguen documentadas en el postmortem.
## Dónde vive cada dato

🗺️ **El mapa completo, por PREGUNTA, vive en [docs/donde-vive-cada-dato.md](docs/donde-vive-cada-dato.md)** (movido desde aquí el 14-sep-2026): para cada cosa que hace falta saber —artículos, ventas, CXC, compras, gastos, asistencia, cheques, guías, clientes, catálogos, alertas— dice en qué tabla está, el grano, las filas medidas y, sobre todo, para qué **NO** sirve cada tabla. **Léelo antes de decir que un dato «no existe» o «no llega».**

> ⚠️ Transversal: **`db-max-rows` = 1000 y corta EN SILENCIO.** Toda lectura de una tabla con más de 1.000 filas que no use `leerTodoPaginado` devuelve 1.000 y parece completa.
> ⚠️ Transversal: las 8 empresas se nombran con `empresa_key`… **menos las vistas de aging, que usan `company_key`**.

### Trampas transversales

- **Soft delete, dos convenciones.** `deleted boolean` en casi todo; **`deleted_at` solo en `packing_lists`** (módulo retirado el 10-sep-2026: la tabla se queda, vacía y sin lectores). Y en préstamos `deleted` es NULLABLE, por eso se filtra `.or("deleted.is.null,deleted.eq.false")` — un `.eq("deleted", false)` ahí **pierde filas**. Ninguna tabla `switch_*` sincronizada tiene soft delete, salvo `switch_proveedor_estadocuenta`.
- **Empresa vs empresa.** Ocho `empresa_key` existen, pero **cada tabla cubre un subconjunto distinto**: los catálogos y las llegadas solo las 6 del grupo; `switch_articulo_marca` solo ACS; `switch_factura_lineas` sin Boston ni ACS. Antes de decir «falta el dato», mirar si esa empresa alguna vez estuvo en esa tabla.
- **Cero no es lo mismo que vacío.** `joystep` con 0 gastos y `american_classic` con 0 artículos son estados normales; una empresa que ayer tenía filas y hoy tiene 0 no lo es. Una empresa sin renglones dice «Todavía no hay gastos registrados», nunca `$0.00`.
- **Antes de dar por perdido un dato**: mirar la lista de columnas real (`GET /rest/v1/` devuelve el OpenAPI con todas las tablas y sus columnas) en vez de copiar nombres del código. Ya pasó dos veces: `cron_heartbeats.job` era `cron_name`, y `asistencia_reglas.empresa_key` no existe.

## Switch Soft (ERP externo)
- 🗺️ **El mapa de flujo, dato por dato: [`docs/switch-flujo.md`](docs/switch-flujo.md)** — por qué endpoint o reporte sale cada cosa, qué cron la trae y a qué hora, en qué tabla cae y qué campos descarta, en qué pantalla se ve, qué empresas entran y cuáles no, qué lo rompe y cómo consultarlo al momento. **Léelo antes de decir que un dato «no existe», «no llega» o «viene de tal endpoint».** Cruza con `docs/donde-vive-cada-dato.md` (por pregunta) y con `switch-referencia.md` (por endpoint).
- 📖 **Documentación oficial cruzada con el código: [`docs/switch-referencia.md`](docs/switch-referencia.md)** — los métodos del API (cuáles usamos, qué campos tiramos, los que usamos sin documentar) y lo que la doc corrige del repo. El manual del panel sigue en `docs/switch-panel.md`.
- 🔑 **Por dónde se entra a mirar: una dirección por empresa** (el subdominio **no se deriva del nombre**): `vistanainternacional` · `fashionwear` · **`fashionshoesholding`** · `activeshoes` · `activewear` · **`joystepcorp`** · `confeccionesboston` · **`americanclassicstore`**, todas `.switch-soft.com`. ⚠️ Entrar **expulsa a quien esté adentro**: la sesión es por USUARIO y el sistema entra como `daniel`.
- 🔑 **Para disparar un cron a mano** hace falta `CRON_SECRET` (está en Vercel; no confundirla con las otras dos parecidas): `curl -H "Authorization: Bearer $CRON_SECRET" https://www.fashiongr.com/api/cron/<nombre>`. Sin ella contesta `{"ok":false,"error":"Unauthorized"}`.
- **Dos vías de entrada** (detalle en `docs/switch-flujo.md` › A): el **API JSON** con token (`client.ts`; `SWITCH_<EMPRESA>_API_*`) y el **panel web** Laravel con sesión (`web-client.ts`; `SWITCH_<EMPRESA>_WEB_*`, login con `changesession="SI"` que **expulsa** a quien esté en el panel). **La sesión es por USUARIO**, y el sistema entra como `daniel`: cada cron o script saca a Daniel del panel de esa empresa, y viceversa. Los crons de la misma empresa van a ≥ 15 min; los de login web, de madrugada de Panamá.
- Lo que llega por **CSV** hoy son solo los reportes del panel que el sync baja solo (egresos varios e ingresos de mercancía, con `;`). ⚠️ No es un sistema de subida manual: hoy hay endpoints del API en uso y decenas de entradas de cron que tocan Switch.
## Email (Resend)
- `noreply@fashiongr.com` — cheques reminders
- `notificaciones@fashiongr.com` — alertas, reports, guias, reebok
- `info@fashiongr.com` — reclamos a proveedores
- `pedidos@fashiongr.com` — guias notify

## Crons (vercel.json)

🗓️ **La tabla completa (81 entradas, con horarios UTC y el porqué de cada hueco) vive en [docs/crons.md](docs/crons.md)** (movida desde aquí el 14-sep-2026). Las reglas que no cambian:
- **Una entrada de cron = una ocurrencia al día.** Para frecuencia sub-diaria se agregan entradas separadas del mismo path, NUNCA una lista de horas (`0 15,19,23 * * *`). Biyección `vercel.json` ↔ registro de código, candado `cron-registro.test.ts`. Límite Vercel Pro: 100 cron jobs/proyecto.
- Crons que tocan la **MISMA empresa** en Switch van **≥ 15 min** separados (`SEPARACION_MINIMA_MIN`): Switch admite un solo token válido por USUARIO. Los de login web, de madrugada de Panamá.
- Dos crons no diarios: `catalogos-fotos-resumen` (lunes 13:30) y `grupo-resumen-mensual` (día 1, 13:00). Uno semanal que toca Switch: `sync-clientes-boston` (domingos 07:10).
- Al agregar o quitar una entrada, actualiza `docs/crons.md` a mano: el candado protege el código, no la tabla.

## Alertas a Telegram — DOS canales, TRES formas de mandar

> 📄 Texto completo con las citas de Daniel: [docs/postmortems/crons-alertas.md](docs/postmortems/crons-alertas.md) › «Alertas a Telegram».

Punto único: `src/lib/alertas/canal.ts` (`enviarNegocio` / `enviarNegocioPrivado` / `enviarSistema`). **Nadie llama `sendTelegramAlert` directo** (barrido). Son dos CHATS con reglas **opuestas** y tres tratos:
- **📊 NEGOCIO** — pedidos, guías, cheques por vencer, fotos faltantes. **NINGUNA regla anti-ruido aplica**; `enviarNegocio` no tiene perilla de silenciar, y que no exista es la garantía. Es un **GRUPO de tres** con el celular de la empresa, no el chat de Daniel. Los textos no se tocan.
- **🔒 NEGOCIO PRIVADO** (`enviarNegocioPrivado`) — el resumen diario de ventas de ACS y el resumen mensual del grupo. Va al CHAT de sistema (privacidad) con el TRATO de negocio: **sin el prefijo `🔧 SISTEMA · `** y sin anti-ruido. Sale desde DOS lugares (el cron y la recuperación de `switch-reconciliacion`) que un candado exige que apunten al mismo destino.
- **🔧 SISTEMA** — prefijo `🔧 SISTEMA · `. Regla de tres: **(1)** es real, **(2)** no se arregla solo, **(3)** alguien tiene que hacer algo. El texto dice qué pasó / qué significa / qué hacer, sin nombres de tabla ni códigos HTTP. Es el chat PRIVADO de Daniel (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`; no existe ninguna variable `*_SISTEMA`).
- A dónde apunta cada canal se verifica sin escribirle a nadie: `GET /api/diag/canales-telegram` (`CRON_SECRET` o sesión de admin).
## PWA (iOS)

> 📄 Mediciones, citas y candados: [docs/postmortems/navegacion.md](docs/postmortems/navegacion.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- `viewport-fit: cover` + `env(safe-area-inset-top/bottom)` para notch/Dynamic Island; `apple-mobile-web-app-status-bar-style: black`; standalone, start_url `/home`.
- 🔴 **El sistema vive en `www.fashiongr.com`; el pelado contesta 307.** ⚠️ **Un service worker detrás de una redirección NUNCA se registra** (por especificación): quien instale la app desde un enlace **sin `www`** se queda sin service worker en silencio. Todo enlace que se reparta va con `www`. 🔴 `serwist.register()`/`update()` van con `.catch()`.
- Service worker MÍNIMO (Serwist, `src/app/sw.ts`) — la app es SIEMPRE online (Modo Viaje / lectura offline ELIMINADO jul 2026). Solo cachea assets inmutables (`/_next/static` CacheFirst, imágenes/fuentes SWR); navegación y APIs van directo a la red. Sin precache del app shell.
- 🔴 **`matchOptions: { ignoreSearch: true }` en la estrategia de `/_next/static`** — obligatorio mientras `next.config.js` defina `deploymentId` (Skew Protection): Next estampa `?dpl=<id>` en cada asset y ese query cambia en CADA deploy, así que sin esto los chunks cuyo contenido no cambió se re-descargan tras cada promoción. Es seguro porque el nombre del archivo lleva el hash del contenido; el fetch a la red conserva la URL con `?dpl=`.
- Actualización automática y SILENCIOSA: `skipWaiting`+`clientsClaim` + `SWUpdater` (`next.config` con `register:false`) → al haber build nuevo, swap + reload inmediato SIN UI de versión, con guard de formulario sucio y guard anti-loop en sessionStorage.
- Recovery una-sola-vez: ChunkLoadError / import dinámico fallido tras un deploy → `src/lib/chunk-recovery.ts` (listeners en SWUpdater + `error.tsx`/`global-error.tsx`). Guard sessionStorage `fg_chunk_recovery` (1/min); si se repite, error boundary «Algo salió mal» con botón Recargar.
- Roles con 1 solo módulo auto-redirigen desde home. Sin bottom tab bar — navegación por módulos del home + drawer del header.
## Design System

> 📄 Detalle y citas: [docs/postmortems/diseno-y-ux.md](docs/postmortems/diseno-y-ux.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- **Direction:** Precision & Density + Apple-grade fluidity. **Depth:** borders-only (sin sombras en cards/módulos). **Spacing:** base 4px, `py-6` containers, `mb-4` secciones, `p-3` cards.
- **Buttons:** `rounded-md`, `bg-black text-white`, `active:scale-[0.97]`. **Cards:** `rounded-lg`, `border border-gray-200`. **Tables:** sticky headers, `tabular-nums`, `ScrollableTable` con gradientes, `SwipeableRow` en móvil. **Modals:** `ConfirmModal`, `ConfirmDeleteModal` (destructivo, 1 s de espera), `BottomSheet` (móvil).
- **Module colors:** 🔴 la lista viva son **18 módulos** en `src/lib/moduleColors.ts` (2px de acento en el encabezado). **No la copies aquí: léela en el archivo**, que es el único lugar donde está completa.
- **Animations:** `AccordionContent` (CSS grid 250ms), transiciones de página (slide/crossfade 180ms), count-up de KPI, flash de depósito, shake del saldo, resalte de fila nueva.
- 🔴 **Barras pegajosas: se pegan DEBAJO del encabezado, nunca encima** (11-sep-2026; [docs/postmortems/barras-pegajosas.md](docs/postmortems/barras-pegajosas.md)). El encabezado NO tiene alto fijo: se MIDE con `ResizeObserver` y viaja en `--fg-altura-encabezado`. **La única forma de pegar una barra de contenido es `CLASE_BARRA_PEGAJOSA`** (`src/lib/ui/barra-pegajosa.ts`), con z-index 9 bajo el 10 del encabezado. Un `<thead>` o la cabecera de un modal con `sticky top-0` se pegan a SU contenedor y se dejan como están. ⚠️ Pendiente de Daniel: los dos `sticky top-0` del overlay de Marketing › Proyecto.
## UX Principles

> 📄 Detalle, mediciones y citas: [docs/postmortems/diseno-y-ux.md](docs/postmortems/diseno-y-ux.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- Usuarios: secretarias, bodegueros, vendedores en Panamá. NO tech-savvy. Labels en español simple, cero jerga (CXC → "Cuentas por Cobrar").
- 🔴 **«Pedido» para Daniel es la orden de un CLIENTE, nunca una petición HTTP.** Para hablar de red: **«no escribe nada», «no guarda nada», «solo lee»**. Igual de cargadas: factura · traslado · abono · pago.
- 🔴 **Traer datos frescos se dice «Actualizar ahora» en TODO el sistema** (`lib/ui/actualizar-ahora.ts`). ⚠️ **«Traer ahora» de Asistencia es OTRA cosa** —le pide a una PC que empuje las marcas de su reloj— y no se toca.
- 🔴 **La línea de «más de 4 marcas» NO dice cuál sobra** (18-sep-2026): «El día tiene N marcas, y son 4 — quita la que sobra», con las horas como BOTONES. 🩸 Decía «Marca de más: HH:MM:SS» —elegida por POSICIÓN— y la contadora quitó la equivocada. ⚠️ Con 3 marcas el texto NO cambia: ahí sí falta una.
- Botones descriptivos ("Guardar gasto", no "Guardar"). Errores accionables y humanos. Micro-copy con personalidad. Font size mínimo `text-sm` para datos; `text-gray-600` mínimo para montos.
- Confirmación solo para acciones destructivas, NO para guardar. **Undo universal: 5 segundos.** **Optimistic UI**: actualizar antes de la respuesta y revertir si falla.
- 1 acción principal por vista + `OverflowMenu` "···" para las secundarias. Toasts: errores 8s, éxitos 3s, con X para cerrar.
## Navegación e Historial (Back/Forward consistente)

> 📄 Detalle y ejemplos: [docs/postmortems/diseno-y-ux.md](docs/postmortems/diseno-y-ux.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- **Regla:** el stack del historial debe ser ESPEJO del breadcrumb (Inicio › Grupo › Módulo › Detalle). El Back del navegador solo deshace la última URL — no conoce la jerarquía, así que la jerarquía debe vivir en el historial.
- **Drill-down a un nivel más profundo → `push`**; **filtro / tab / sort en el MISMO nivel → `replace`** (Back no debe ciclar por tabs ni filtros). `useUrlState(key, default, { history: "push" })` para params que representan un nivel; default `"replace"` para filtros/tabs.
- **SPAs de un solo route**: el patrón de referencia es **Reclamos** (`src/app/reclamos/ReclamosClient.tsx`), que reconstruye el estado desde la URL. Los módulos con routes reales (Caja, Préstamos, Guías, Clientes detalle) ya son correctos y no requieren tratamiento especial.
## Teclado (lo único que corre)

> 📄 Detalle y citas: [docs/postmortems/usuarios-inicio-teclado.md](docs/postmortems/usuarios-inicio-teclado.md).

- **`⌘K` / `Ctrl+K` — abrir la búsqueda global.** Tiene su propio listener dentro de `SearchBar.tsx` y nunca dependió de ningún gancho.
- 🩸 **Todo lo demás se retiró el 11-sep-2026**: la `/` para buscar, la ayuda «?», los saltos `G+…`, el `J/K` por filas y la `E` para editar **nunca corrieron** —`useKeyboardShortcuts` estaba sin un solo importador desde el 11-abr-2026—. Candado: `atajos-de-teclado-retirados.test.ts`.
- El **clic derecho** en filas de CXC y Recordatorios se había retirado antes, con el rediseño de esos dos módulos.
## Smart Features

> 📄 Detalle, mediciones y candados: [docs/postmortems/usuarios-inicio-teclado.md](docs/postmortems/usuarios-inicio-teclado.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- **Búsqueda global:** 8 módulos (CXC, Reclamos, Guías, Directorio, Cheques, Ventas, Préstamos, Caja). 🔴 **Cada resultado LLEVA a donde dice**: la guía abre `/guias/<id>`, el cliente su ficha `/clientes/<codigo>`, el de Ventas `?tab=clientes&cliente=<CÓDIGO>` y el gasto de Caja su período `/caja/<id>`. 🔴 El código del cliente de Ventas sale del **puente por ID** (`switch_facturas` → `switch_clientes` → `codigo`), **nunca del nombre**. ⚠️ El gasto de Caja no queda resaltado dentro de su período: pendiente, no olvido.
- **La caja de buscar del Inicio es de los mismos CINCO roles que en todo el sistema** (`SEARCH_ROLES`).
- **Spotlight:** "cheques que vencen mañana" → ⚡ quick action con deep link. **Búsquedas recientes:** últimas 5 + "Ir a...". **Smart defaults:** recuerda última categoría, empresa, banco, transportista (localStorage `fg_last_*`).
- 🩸 **Tres cosas que esta lista prometía y NO EXISTÍAN EN NINGUNA PANTALLA** (retiradas el 11-sep-2026): el feed «Acciones pendientes», los contadores del 🔔 y las 💡 sugerencias. Se retiró CÓDIGO MUERTO; no se construyó nada. ⚠️ La **campana 🔔 SÍ funciona** (`NotificationCenter`) y `/api/notification-badges` se queda sin llamadores porque la nombran tres candados. Candado: `inicio-sin-promesas.test.ts`.
- **Draft auto-save** cada 5s en localStorage (reclamos, guías, cheques) · **Time grouping** «Hoy/Esta semana/Vencidos» · **Contextual color** cuando hay datos urgentes · **Inline previews** sin expandir.
- **Hover preview:** vive en **Ventas › Clientes** (`ClienteHoverCard`), NO en Cuentas por Cobrar (su detalle es la fila expandida).
- **URL state:** filtros en la URL — deep links y back/forward funcionan. **UI persistence:** filas expandidas y scroll sobreviven la navegación (sessionStorage).
- **Offline:** banner "Sin conexión" (informativo) + botones deshabilitados sin red. NO hay lectura offline: el Modo Viaje se eliminó en jul 2026.
## Exports
- Todos los PDFs tienen logo Fashion Group (src/lib/pdf-logo.ts, base64)
- Reebok PDFs/emails tienen logo Reebok (src/lib/reebok-logo.ts, base64)
- Fechas display: "5 abr 2026" (fmtDate en src/lib/format.ts)
- Moneda: `$#,##0.00` en Excel (números reales, no texto)
- Nombres de archivo con fecha: `Pedido-RBK001-2026-04-05.pdf`

## Shared Components (src/components/)
**AppHeader** (sticky, acento de módulo, usuario, búsqueda, notificaciones) · **SearchBar** (⌘K, full-screen móvil, recientes, spotlight) · **NotificationCenter** (🔔 con historial de toasts) · **SessionWarning** (banner antes de expirar) · **OfflineBanner** · **ContextMenuWrapper** · **UndoToast** (5 s) · **TimeGroupHeader** · **OverflowMenu** ("···") · **ScrollableTable** (gradientes de scroll) · **SwipeableRow** · **PullToRefresh** · **BottomSheet** (half/full draggable) · **AccordionContent** · **AnimatedNumber**. 🩸 **MobileBottomBar ELIMINADO** (abril 2026): la navegación es solo por módulos del home + drawer del header.

## Hooks (src/lib/hooks/)
**useAuth** · **useUrlState** (state ↔ URL) · **useLastUsed** · **useDraftAutoSave** (5 s) · **usePersistedState** (sessionStorage) · **useUndoAction** (ventana de 5 s) · **useOnlineStatus**.
- **useSessionCheck** — ⚠️ **SIN USO**: no tiene importadores desde el 11-abr-2026, así que el chequeo de sesión cada 2 min NO corre. Se conserva rotulado (candado: `ganchos-sin-uso.test.ts`); enchufarlo es una decisión de Daniel que no está tomada.

## Testing
```bash
npm test          # Vitest — 16.111 pruebas. Las corre también GitHub Actions y el gancho antes de subir.
npx next build    # El build tiene que pasar antes de subir
```

## 🔴 El conector de Supabase — leer es libre, escribir se pregunta

🟢 **Está conectado y CON ESCRITURA** desde el 19-sep-2026 (`@supabase/mcp-server-supabase`, proyecto `rspocgqhtpveytgbtler`, en la configuración LOCAL de este repo). Que pueda escribir no quiere decir que escriba.

- **Leer: libre.** Consultar, contar y medir contra producción no pide permiso — es lo que hace falta para «medir antes de afirmar».
- 🔴 **Cualquier escritura (INSERT / UPDATE / DELETE) o DDL: SIEMPRE se le muestra a Daniel antes el SQL exacto, cuántas filas toca y qué hace en palabras simples, y se espera su «sí». Sin excepción.**
- 🔴 **Nunca DROP, TRUNCATE ni DELETE masivo sin respaldo verificado del día.**
- 🔴 **Todo lo que se corra queda TAMBIÉN como archivo en `supabase/migrations/`**: el repo sigue siendo la historia. Se aplica con `npm run migrar` (abajo), que registra en `schema_migrations`.

## Deploy
```bash
git push origin main   # Auto-deploy via Vercel
npm run migrar supabase/migrations/<archivo>.sql   # Aplica UNA migración a Supabase (muestra qué corre, pide «¿Aplicar? [s/N]», registra en schema_migrations). `-- --dry-run` solo muestra; `-- --forzar` repite una ya registrada. Token: SUPABASE_ACCESS_TOKEN en .env.local (https://supabase.com/dashboard/account/tokens)
```

## Regla de Calidad
- Todo código debe funcionar a la primera. No pushear sin verificar el flujo completo end-to-end.
- Verificar: datos fluyen escritura → DB → lectura → UI
- Auth en serverless: usar tokens HMAC firmados, NO Maps en memoria
- No hacer fire-and-forget (.then().catch()) para operaciones críticas — siempre await
- useState en useEffect como dependencia puede causar re-renders destructivos — usar useRef para estado interno
- Verificar compatibilidad de formatos antes de integrar (PNG/JPEG en jsPDF, DER/P1363 en WebAuthn)
- Si no puedo probar en browser, simular el flujo con script
