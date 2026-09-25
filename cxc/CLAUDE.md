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
| Gerente Confecciones Boston | `gerente_boston` | **Ventas Boston** (`/boston`, key `boston`: Inicio · Ventas), **Cuentas por Cobrar viendo SOLO Boston** (`/cxc`, con la key `cxc` en `role_permissions`: migración `20261217130000`, aplicada), **Asistencia COMPLETA acotada a Boston por el servidor y sin «Cerrar»**, y **Catálogos solo para VER**. Aterriza en `/boston` por su CASA. **NO ve la búsqueda global, ni una fila del grupo, ni Ventas, ni Comisiones, ni Guías, ni comprobantes, ni administrar catálogos.** Interruptor `VENTAS_BOSTON` |
| Marcación | `marcacion` | SOLO `/marcacion` — marcar desde el teléfono, con selfie y ubicación. Auto-redirect desde home. ⚠️ **Rodrigo la tiene siendo `bodega`**: es el módulo POR PERSONA de `MODULOS_POR_PERSONA` |

> Roles reales del sistema = los 8 de arriba (`src/lib/modules.ts` → `SYSTEM_ROLES`). No existen roles `director` ni `cliente` (el catálogo Reebok es público, sin login).
> 🔴 **MARCACIÓN «UN TOQUE» (24-sep-2026, `MARCACION_UN_TOQUE` en `lib/marcacion/un-toque.ts`, hoy `true`)**: UN botón fijo abajo que **nunca cambia de posición** y con el día completo queda gris («Listo por hoy»); 🔴 **aceptar la foto ES marcar**, con el «Deshacer» de 2 min DENTRO de la pastilla verde; **cámara normal**; **ubicación AL ABRIR**; el encabezado dice **«Marcación»** y ese rol no ve campana, lupa ni menú. 🔴 **Nada de lo que se guarda cambia** (candados `marcacion-un-toque` · `marcacion-payload-igual`). `false` = la pantalla de antes.
> 🔴 **CUATRO MARCAS TAMBIÉN EN EL TELÉFONO (24-sep-2026, `MARCACION_CUATRO_MARCAS` en `lib/marcacion/cuatro-marcas.ts`, hoy `true`)**: el botón las pide EN ORDEN —entrada → almuerzo → vuelta → salida— y **nadie elige cuál es**; **foto en la entrada y en la salida, el almuerzo de UN toque** —lo decide el SERVIDOR—, ubicación en las cuatro y «Deshacer» de 2 min sobre la última, que la NOMBRA. 🔴 **Lo que se guarda NO cambia**: el `tipo` sigue alternado por el ORDEN y el almuerzo cae con `foto_path` en NULL. `false` = dos marcas. Candado `marcacion-cuatro-marcas`. 📄 Las siete reglas, enteras, en [docs/postmortems/asistencia-planilla.md](docs/postmortems/asistencia-planilla.md) › «Cuatro marcas también en el teléfono».
> 🔴 **SE MARCA SIN SEÑAL** (`marcacion/cola-offline.ts`). Con señal la hora la pone el SERVIDOR; sin señal, la del teléfono, ni 10 min adelantada ni 7 días vieja. ⚠️ Con la app CERRADA no sale nada. 🔑 «Sin señal» **es la palabra del teléfono**: el servidor no puede probarlo.
## Módulos (src/lib/modules.ts)
Fuente única de navegación + permisos de UI. **3 grupos** (rediseño del home, jul-2026):
- **Ventas y clientes:** Vista General, Ventas, CXC (`/cxc` — era `/admin`; el rótulo sigue siendo «Cuentas por Cobrar» y `/admin` redirige), Multifashion, **Confecciones Boston** (`/boston`, key `boston`), Clientes/Directorio (`/clientes`), Proveedores, **Referencia** (`/referencia`, key `referencia`), Catálogos (**CUATRO** marcas ENCENDIDAS: Reebok, Joybees, Tommy Hilfiger y **Calvin Klein**, cada una con su tarjeta en el hub /catalogos/marcas, su catálogo público compartible y su pedido público `/pedido-<marca>/[id]` accesibles sin sesión)
- **Operación:** Guías de Despacho, **Asistencia y Planilla** (`/asistencia`, key `asistencia`), Reclamos, **Plantilla Switch** (`/productos/cargar`, key `cargar` — era *Depurador*; la key y la dirección NO cambiaron), Comisiones, Marketing, Caja Menuda, **Gastos** (`/gastos-contabilidad`, key `gastos-contabilidad`; 2 pestañas: *Gastos* —Egresos Varios, fuente ÚNICA— y *Saldos de banco*), Préstamos, **Recordatorios** (`/recordatorios`, era `/cheques`; la `key` sigue siendo `cheques`)
- **Administración:** Usuarios. 🩸 **Data Health se fue de la pantalla el 11-sep-2026** (Daniel no lo usa) y **la medición se quedó ENTERA** — ver `docs/donde-vive-cada-dato.md` › `data_integrity_checks` y la skill `data-integrity`.

> **Nacidos después del 5-jul-2026**: los cuatro módulos navegables `asistencia` · `gastos-contabilidad` · `referencia` · `boston`, más dos PÁGINAS públicas que **no son módulos** y por eso no tienen ficha ni entrada en `role_permissions`: `/pedido-tommy/[id]` y `/pedido-calvin/[id]`.


## Pendientes vivos

🔴 **Lo que Daniel pidió y sigue sin hacerse vive en [docs/pendientes-vivos.md](docs/pendientes-vivos.md)** (24 puntos, **reauditados uno por uno el 18-sep-2026**: nueve estaban resueltos y el archivo no se había enterado). Ábrelo al empezar una sesión, junto con `docs/estado-actual.md`. Daniel: *«no te olvides de las cosas porque yo me olvido y se pasan cosas»*. 🔴 **Lo que mueve plata y sigue abierto**: Multifashion sin ninguna quincena cerrada (y Fashion Wear 1–15 sep reabierta) · el cuadre del estado de cuenta que llega vacío. 🔑 **Antes de construir lo que ahí falte, compruébalo contra el código y la base.**

## Invariantes por módulo

Las reglas VIGENTES, en una o dos líneas cada una. 🔴 **Este archivo tiene que caber en 150.000 caracteres** (el harness lo corta ahí, en silencio): una regla nueva entra aquí en UNA línea, y su detalle —mediciones, citas de Daniel, candados, mutaciones— va al postmortem de su módulo (`docs/postmortems/`). Candado: `claude-md-bajo-el-tope.test.ts`.

⚠️ **Antes de tocar un módulo, lee los bloques «Lo que decía CLAUDE.md hasta el 14-sep-2026» y «…hasta el 22-sep-2026» de su postmortem**: ahí está, verbatim, todo lo que aquí se resumió en esas dos podas —mediciones, citas de Daniel, listas de candados, mutaciones— y en particular las reglas de PANTALLA (qué se dibuja, dónde, rótulos, tamaños) que aquí ya no caben.

### Boston y CXC — [docs/postmortems/boston-cxc.md](docs/postmortems/boston-cxc.md)

> 📄 Mediciones, citas de Daniel, candados, mutaciones y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026». Léelo antes de tocar una pantalla suya.

- 🔴 **Boston NUNCA se mezcla con el CXC del grupo** (ni fila, total ni export); 🔴 **el del grupo SÍ convive con el resto**: aislarlo de más también es error.
- **Fashion Group son SEIS empresas** (`B2B_EMPRESA_KEYS` = `empresasConCxc()`); Boston y ACS no. La vista **EXCLUYE, no enumera** (`switch_estadocuenta_aging`, `..._aging_mv` la materializa). Toda lectura acota por `empresa_key`.
- 🔴 **«VENTAS BOSTON» (23-sep-2026, `VENTAS_BOSTON` en `lib/boston/ventas-boston.ts`)**: `/boston` queda con Inicio · Ventas; David ve **`/cxc` con la MISMA pantalla del grupo y SOLO la cartera de Boston** (`carteraDelRolEnCxc`, `lib/cxc/boston-como-grupo.ts`, datos por `/api/cxc/boston`, papel `CASA_BOSTON`) y **Asistencia completa acotada a Boston en el SERVIDOR** (`lib/asistencia/alcance-boston*.ts`: listas por empresa de la FICHA, 403 a un código ajeno, `MIRAN_PERO_NO_CIERRAN`). 🔴 Sin la key `cxc` en `role_permissions` (migración **aplicada**) falla ABIERTA: «Por cobrar» sigue en `/boston`. `false` = lo de antes. Candado `boston-ventas-boston`.
- **Sueldos recortados en el SERVIDOR** (`VE_SUELDOS_DE_BOSTON`, hoy `true`); se ENUMERA lo que viaja (`CAMPOS_SIN_DINERO`).
- `ccte_id` de Boston lleva el AÑO adentro (`serie × 10.000.000 + (año − 2000) × 100.000 + correlativo`): sin fecha se **rechaza** y la corrida se corta. Sync: **upsert → reconcile**.
- 🔴 **SU PLATA SUMA; SUS CLIENTES NO SE VEN**: su venta sigue en Ventas › Resumen y Vista General; de las superficies del grupo salen sus CLIENTES, en ambas direcciones. 🩸 **Ni entra a `clientes_master`**.
- `/api/clientes/[codigo]` pregunta `esCodigoDelGrupo()` y contesta **404**, nunca 403.
- 🔴 **Su DIRECTORIO se refresca SEMANAL sin tocar al grupo**: `sync-clientes-boston` (domingos 07:10 UTC) escribe **SOLO `switch_clientes` de Boston**. Para marcar ausente: lista completa y sin encoger bajo el **70%**; vacía = error. Alerta B, **165 h**.
- 🔴 **La secretaria cobra y ve el módulo** (`ROLES_CXC`). ⚠️ **Boston sigue afuera**: otra lista.

**La planilla de David = la de Yulissa** (hoy abre `PlanillaTab` en Asistencia; `PlanillaBoston` queda para el interruptor apagado): columnas de dinero de UN lugar (`columnas-dinero-planilla.ts`, 19) · mismo corte que la contadora (`corteParaBoston`; `planilla-guardada` le fuerza Boston, `?id=` ajeno → 404) · Préstamos suma las tres cuentas (`calcularSaldoPrestamo`).

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
- 🔴 **EN EL CELULAR, LA LISTA ES LA CARTERA (24-sep-2026)**: `/cxc` hasta `sm` abre en la lista, con el total **EXACTO** y tres chips que **filtran Y ordenan por su plata**; el cliente son DOS renglones (nombre de Switch · lo que urge · monto sin centavos · rayita del tramo **DOMINANTE**) y **tocar la fila abre la MISMA `HojaCobrar`**. 🩸 **83 de 100 montos iban redondeados** y abría por el que menos debe. 🔴 **Abre por PLATA** (`ordenDelCelular` = `ordenParaRiskFilter`); la computadora conserva `ORDEN_AL_ABRIR`. El total abre **«Por empresa»**; `/cxc/cliente/[codigo]` va en **RENGLONES, nunca una tabla**. `lib/cxc/lista-celular.ts`, interruptor `CXC_CELULAR` (`false` = `PanelCxcMobile` intacto). ⚠️ Boston aparte. Candado `cxc-celular`.

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

🔴 **EL PAPEL DE LA GUÍA, HACIA ADELANTE (25-sep-2026, `GUIA_PAPEL_2026_09` en `lib/guias/papel-2026-09.ts`, hoy `true`)**: 🩸 con transportista externo las dos firmas salían **cambiadas de caja** —la del transportista bajo «Despachado por» y la de quien despacha bajo «Recibido Conforme»—, en **157 de las 222 guías externas vivas**; en entrega directa estaban bien y no se mueven. Además: título **«GUÍA DE TRANSPORTE EXTERNO»** o **«DE ENTREGA DIRECTA»** y se va la fila «TIPO»; **«DIRECCIÓN» → «DESTINO»**; los renglones del mismo cliente juntos con el **nombre repetido en TODOS** (Daniel: *«que se repita para que no haya confusión»*) y raya gris entre clientes; firmas pegadas bajo observaciones y pie legal al pie —con varias hojas, en la **ÚLTIMA**—. 🔴 **Nada se toca en la base** y el total de bultos no se mueve. ⚠️ `PrintDocument.tsx` (la vista previa) todavía dice lo de antes: pendiente de Daniel. Candado `guias-papel-2026-09`, que LEE el PDF con pdfjs.

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
- 🔴 **CATÁLOGOS EN EL CELULAR: «LO MISMO, ORDENADO» (24-sep-2026)** — Daniel: *«todo sí»*, y **no es un rediseño**: mismo estilo, mismos colores, mismos rótulos, y **el precio del pedido no se toca**. Nueve acomodos de LUGAR hasta `sm` (`CATALOGO_ORDEN_CELULAR`, hoy `true`; `false` = todo como antes): los 4 botones del hub en rejilla **2×2** · el link en **una línea** · los filtros recogidos en **«Filtros ›»** (224 → 76 px; la primera foto sube del píxel 461 al 313) · «Bulto de 12 · Disponibilidad 1 · Existencia 1» en **una línea** (el punto medio es CSS, no texto) · «Falta: elegir el cliente» **pegado a su caja** (estaba 301 px abajo) · los chips de Comprobantes con el **rótulo al lado** y el blanco de la casilla a **44** · 🩸 Administrar sin **15 pares de textos encimados** por pantalla · el comprobante abierto **sin scroll dentro de scroll** (⚠️ su encabezado fijo queda solo en la computadora) · Compartir **sin tapar** la lista. 🔴 **Nada de lo que se guarda cambia**: candado que compara el payload del pedido prendido y apagado. `catalogo-orden-celular`.

- 🩸 **Cuatro reglas del 22-sep-2026 se podaron de aquí el 25-sep** y viven VERBATIM en [docs/postmortems/catalogos-pedidos.md](docs/postmortems/catalogos-pedidos.md) › «Lo que decía CLAUDE.md hasta el 25-sep-2026», ninguna cambió: **los números de Comprobantes cuadran** (los dos grupos de chips sobre las MISMAS candidatas, pie «13 de 20», «Seleccionar todos» alcanza los meses plegados, una sola vuelta por el camino de migas), **la tarjeta del hub dice lo que el cliente ve y su pulso** (70 tarjetas, no 81; comprobantes · plata · «hace N días» de los últimos 90), **la foto manda en la tarjeta** (Tommy y Calvin sin nombre, Reebok y Joybees con él; es un DATO del tema, nunca un `if` por marca; español solo en Joybees y Reebok) y **ninguna hoja del papel del cliente se queda sin decir de quién es** (cabecera en cada hoja, «Página N de M», y el Excel de Comprobantes que se puede filtrar).

**Sync, clasificación y puertas · Plantilla Switch (era el Depurador).** 🩸 Sus **37 reglas se podaron de aquí el 25-sep-2026** y viven VERBATIM en [docs/postmortems/catalogos-pedidos.md](docs/postmortems/catalogos-pedidos.md) › «Lo que decía CLAUDE.md hasta el 25-sep-2026» — ninguna cambió, solo se mudaron para que este archivo vuelva a caber. Ahí están: el género por marca (`tommy-gender` · `calvin-gender`, igualdad sobre alias y **nunca `includes`**), la cadena Depurador → Excel de 25 columnas → Switch → catálogo, `esVisibleEnCatalogo` y `foto_manual`, los guards SSR y las cinco rutas retiradas; y de la Plantilla: **UNA sola plantilla de 25 columnas** (`OUT_COLS`), los dos archivos de Reebok, el descuento de la preforma, `workbookBytes`/`filtroDesdeA1`, el divisor en los TRES caminos, los precios a mano pegados **por REFERENCIA**, el Historial de 90 días y `TRES_DETALLES`. 🔴 **Léelo antes de tocar el Depurador o el sync de un catálogo.**

### Reclamos — [docs/postmortems/reclamos.md](docs/postmortems/reclamos.md)

> 📄 Mediciones, citas, candados, mutaciones y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026». Léelo antes de tocar una pantalla suya.
> 🩸 **Los tres bloques de aquí —«Los cinco defectos», «El rediseño» y «Lo del 20-sep-2026»— se podaron el 24-sep-2026**: estaban verbatim, con sus mediciones, en ese postmortem. Abajo, las reglas vigentes.

- 🔴 **El detalle se lee por UNA puerta** (`leer-detalle.ts`), que FIRMA cada archivo y falla **ABIERTA**; **un cobrado NO se vuelve a mandar** (ni el botón ni el servidor); **el orden lo elige quien mira** (`orden.ts`; sin fecha va al FINAL); **el formulario ofrece las MISMAS empresas que la portada**; **«Fecha de factura \*» es obligatoria**, en pantalla y en el servidor.
- 🔴 **«Reclamado» se marca solo** (`reclamado_en`) la PRIMERA vez que sale de la casa —correo confirmado por Resend, o su Excel o PDF— y nunca se pisa. La portada mide los días desde la **FECHA DE FACTURA**; **nada se da por perdido**: sin corte de días.
- 🔴 **Las facturas son una LISTA** (`facturas.ts`): UNA función la parte (`facturasDe`; `F-1000` no se parte) y UNA la arma. **La factura es obligatoria al CREAR**; de lo leído **no se editan** Estilo, Descripción, Cantidad ni Precio, y **la talla sale como viene**.
- 🔴 **«Volver a por cobrar» conserva comprobante y notas de crédito**; el borrado usa el `UndoToast` de **5 s**. **El bucket `reclamo-fotos` es PRIVADO** —fotos y comprobantes—, firmados **1 h**; la verdad son `storage_path` y `comprobante_path`.
- 🔴 **El correo lleva la factura y las fotos ADJUNTAS**, achicadas antes de viajar; **el tope es el del correo YA CODIFICADO** (`adjuntos-plan.ts`: Resend 40 MB, base64 crece 4/3 → presupuesto CRUDO 3/4) y **lo que no cabe SE DICE**. El Excel **NO lleva links y es UNO SOLO**; 🩸 la galería pública se retiró.
- 🔴 **El papel (PDF y Excel) sale de UN solo módulo**, `papel.ts`: **Reclamo N° + fecha de la FACTURA** (sin ella, la del reclamo, **nunca «hoy»**) y **columnas vacías sin dibujar**. ⚠️ **El género viaja EN INGLÉS**, por el CHECK.
- 🔴 **UN SOLO CORTE DE «VIEJO»: 120 días** (`DIAS_RECLAMO_VIEJO`), que leen la portada **y** el **aviso SEMANAL por 📊 NEGOCIO** (`/api/cron/reclamos-viejos`, **lunes 14:00 UTC**); sin ninguno **no manda nada**.
- 🔴 **El cobro abre con el TOTAL puesto y editable** y el N° de nota de crédito **se pliega**; **el aire entre columnas sale de UNA constante** (`tabla-renglones.ts`) y **la talla se guarda RECORTADA**.
- 🩸 **Active Wear y Joystep salieron de la portada Y del formulario** (`EMPRESAS_SIN_TARJETA`); `EMPRESAS_MAP` no se toca. 🩸 Retiradas `[id]/en-proceso` (el VALOR sigue en la base) y `/api/reclamos/motivos`.
- 🔑 **LA FECHA DE LA FACTURA ES LA QUE HAY, SIN ASTERISCOS**: el backfill ya no tiene trabajo y casi ningún vivo tiene PDF. ⚠️ Al crear, la factura y la fecha son obligatorias.

**Lo del 24-sep-2026.**

- 🔴 **SE DICE «COBRADO», NUNCA «PAGADO»** (Daniel: *«solo hay creado y cobrado, ¿por qué veo pagado?»*): los rótulos viven en `lib/reclamos/rotulos.ts` —«Marcar como cobrado», el chip «Cobrado», los avisos del cobro— y hay **barrido** que pone el build rojo si la palabra vuelve a una pantalla. ⚠️ **Solo el rótulo**: el estado de la base sigue siendo `Pagado`, el PATCH manda ese valor y el papel no cambia. Candado `reclamos-cobrado-no-pagado`.
- 🔴 **LA FACTURA ENTRA COMO PDF O COMO FOTO**: 🩸 en el iPhone «Elegir archivo» abría Archivos y nada más, y la factura es obligatoria: desde el teléfono **no se podía ni empezar**. Cuatro puntos: el `accept` y el `validar()` de `FacturaPdfUploader`, el `Content-Type` del PUT y el bloque `document`→`image` (`lib/ia/bloque-archivo.ts`: PDF como siempre, foto como `image`, **lo demás se RECHAZA en español**). La foto se achica en el navegador (1600 px · JPEG 0,8), el bucket guarda la **extensión real** y el lector deduce el tipo de ella. ⚠️ **Varias hojas son varias fotos y NO se soportan**: se dice en pantalla. **El prompt, el modelo, el parser, el bucket y las columnas no cambian.** Candado `lector-factura-imagen`.
- 🔴 **EN EL CELULAR RECLAMOS ES OTRA PANTALLA** (`RECLAMOS_CELULAR`, `lib/reclamos/celular.ts`, hoy `true`; **solo hasta `sm`**): portada de **UNA FILA POR EMPRESA** con el número chico (*«kpi más chico»*) y el chip rojo del más viejo · la fila del reclamo **SIN botones** —se toca y abre— · **UN botón negro fijo abajo** y lo demás en el «···» · **Fotos y Seguimiento, dos renglones** a pantalla completa · cobrar y mandar, **hojas que suben con Deshacer de 5 s** y el monto grande y editable · en «Cobrados», **visto verde y la fecha del cobro, sin días** · buscar en **filas, nunca una tabla** · elegir se pide UNA vez desde arriba. 🩸 Medido: portada de **1.055 px**, **45 cosas tocables** en la lista (2,5 reclamos por pantalla), «350 días» en uno ya cobrado y **la PLATA fuera de la pantalla** al buscar. 🔴 **Nada de lo que se guarda cambia**: el correo y las descargas salen de `components/descargas.ts` —el MISMO módulo de la computadora— y el cobro llama al mismo `submitSettlement`; `AppHeader` se dibuja UNA vez (`sinEncabezado`). ⚠️ Editar sigue siendo la pantalla de siempre. Candado `reclamos-celular`.

### Asistencia y planilla — [docs/postmortems/asistencia-planilla.md](docs/postmortems/asistencia-planilla.md)

> 📄 Mediciones, citas de Daniel, candados, mutaciones y las reglas de PANTALLA: el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026». Léelo antes de tocar una pantalla suya.

- 🔴 **UN SOLO SELECTOR DE PERÍODO EN LAS CUATRO PESTAÑAS (24-sep-2026, `ASISTENCIA_PANTALLA_2026_09` en `lib/asistencia/pantalla-2026-09.ts`, hoy `true`)**: «‹ 16 – 30 sep 2026 ›» con flechas que saltan de QUINCENA —nunca al futuro— y un 📅 para un día o un rango; sin «Hoy» ni «Ayer». 🩸 Eran CUATRO selectores, TRES memorias y DOS listas de quincenas. Hoy UNA clave (`?desde=&hasta=`, `replace`) y UNA memoria (`fg_last_asistencia_periodo`); 🩸 **las dos fechas se escriben JUNTAS** —dos `useUrlState` seguidos pierden una—. ⚠️ En Planilla y Movimientos va SIN calendario: ahí solo hay quincenas.
- 🔴 **EL CORTE DEL RELOJ ES UNA LÍNEA GRIS CON UNA «×» (24-sep-2026)**: se fueron el botón «Quincena entera» y el chip «Corte 17 sep»; quedan el campo, la «×» que lo vacía y «El reloj se lee hasta el 28 sep · cambiar». 🔑 **No cambia lo que se paga.**
- 🔴 **LA PLANILLA CABE EN LA PANTALLA Y EL NOMBRE LLEVA A SU ASISTENCIA (24-sep-2026)**: las 14 columnas dentro de SU caja (cabecera pegada, nombre fijo) —🩸 a 1440 px el NETO quedaba fuera del borde— y tocar el nombre abre su Asistencia con la MISMA quincena (`?abre=`, regla 7a): de cuatro toques a uno. **Ninguna columna se pliega.**
- 🔴 **ASISTENCIA: UNA FILA DE MANDOS Y DIEZ COLUMNAS (24-sep-2026)**: selector · lupa · «Solo a revisar» · compartir (Excel · PDF) · «···» con los relojes, y los avisos plegados en «N avisos del período». 🩸 La columna «Sale» se retiró (11 → 10): el código va DELANTE del nombre, alineado, y la salida en burbuja. En el día abierto «Arreglar el día» y «Justificar» salen al pasar el mouse —el teclado los alcanza— y **los días que no llegaron no los ofrecen**.
- 🔴 **EN EL CELULAR, EL MÓDULO ABRE EN UNA PORTADA Y ASISTENCIA SON TARJETAS (24-sep-2026)**: 🩸 888 px de tabla en 356, y nueve bloques antes del primer nombre. Las cinco pestañas como filas iOS con su conteo REAL (sin ceros inventados), una tarjeta por colaborador con el MISMO pie, los relojes en una línea, Colaboradores por empresa y el tablero de cierre **solo informa**: se cierra entrando a la empresa.
- 🔴 **COLABORADORES: LA TABLA, DIRECTA (24-sep-2026)**: se fue la tarjeta plegable que repetía el título; el buscador y «+ Nuevo colaborador» entran a la fila de los chips y el código va delante del nombre. Horarios, Feriados y Reglas siguen al pie. 🔴 **Ningún número se mueve**: ni el motor ni una ruta importan el interruptor (tres candados en `__tests__/asistencia/pantalla-*`).
- 🔴 **LAS PESTAÑAS VIVAS, GUARDAR SIN SALTO Y QUIEN NO MARCÓ (24-sep-2026; detalle en el postmortem)**: la pestaña visitada se ESCONDE, no se desarma (`pestanas-vivas.ts`) y la que nadie tocó no se monta —🩸 volver de Planilla perdía la quincena y **el corte volvía al propuesto (13/28)**, otra lectura del reloj sin avisar—; quincena y corte viajan en `plQuincena`·`plCorte` y 🔴 **el cuadro generado NO se guarda**. Guardar una hora recarga en SILENCIO y **la fila recién corregida no se va** (chip «listo»). Quien no marcó ni un día sale en GRIS, con sus días en cero y **ninguno ausencia** (`sin-marcas.ts`).
- 🔴 **GRACIA DEL ALMUERZO: 5 MIN SOBRE LA DURACIÓN, UNA PARA LAS CUATRO (24-sep-2026)**: Daniel: *«60 que dura 65 no descuenta nada; 66 descuenta los 6»* — PUERTA, no descuento (`reglas-nuevas.ts`, `asistencia_reglas.gracia_almuerzo_min`, en Reglas del cálculo). `GRACIA_ALMUERZO`; sin la columna, 0. Candado `gracia-almuerzo`.
- 🔴 **ENTRADA AUTORIZADA POR DÍA (24-sep-2026)**: en «Arreglar el día», «Hoy entraba a las __:__» con motivo y firma (`asistencia_entradas_autorizadas`; se anula, nunca se borra); la extra de ENTRADA se mide desde esa hora —o la marca, si marcó después— hasta la entrada del horario, misma puerta del mínimo, va a Aprobaciones y paga al recargo del día. Sin autorización, cero. `ENTRADA_AUTORIZADA`; candado `entrada-autorizada`.
- 🔴 **AVISO «llegó N min antes · ¿entrada autorizada?» SOLO desde 30 min (24-sep-2026)**, configurable (`aviso_entrada_temprana_min`); no cuenta ni frena; abre «Arreglar el día». 🔴 **Ninguna quincena CERRADA cambia** (candado `quincena-cerrada-no-cambia`). Migración `20261219120000` **aplicada** (24-sep-2026).
- 🔴 **Lo del 17 al 19-sep-2026, en una línea (verbatim en el postmortem):** el día completo se arregla EN LA FILA (`EDITAR_EL_DIA`) y editar ANULA la anterior · las horas extra se deciden desde el Reporte y **al aprobar manda el SERVIDOR** · los días hábiles y los DOS horarios son por persona (`horario-configurable.ts`; Multifashion lunes a SÁBADO, y **nunca lleva deuda de día libre**) · el día libre de la empresa se paga completo y **debe 8 h en dólares que solo pagan las horas extra**, con tope en el EXTRA y nunca en el neto.
- 🔴 **Lo del 14-sep-2026, en una línea (verbatim en el postmortem):** las extras las apaga SOLO la casilla «¿Cobra horas extra?» · los días afuera son «Trabajo de vendedor» por rango desde la ficha y el horario NO se guarda · «Compensatorio» es el sexto motivo y no descuenta · «Trabaja afuera» es una casilla de la ficha (`trabaja-afuera.ts`), NO `no_marca_reloj`.
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
- 🔴 **O el total sigue al filtro, o no hay buscador** (`buscar-en-lista.ts`): filtra lo ya cargado por **subcadena exacta normalizada, nunca por parecido**, con el texto en la URL (`?buscar=`). 🔴 **Planilla no tiene buscador** —su pie es plata que se paga—, con barrido sobre `PlanillaTab.tsx`. Los avisos de «Antes de cerrar» (`antes-de-cerrar.ts`) viajan como datos: Excel y PDF los leen igual.
- 🔴 **Lo que sale de la pantalla nunca se recorta** (Excel, PDF, cierre, lotes), salvo un botón que DIGA a cuántos afecta. ⚠️ Asistencia, Clientes y ⌘K buscan contra el SERVIDOR.
- 🔴 Dar de baja a alguien con deuda **avisa** (`salida-con-deuda.ts`), y la deuda son las **tres cuentas** (`calcularSaldoPrestamo`). 🔴 Las columnas de dinero salen de **un solo lugar**: `columnas-dinero-planilla.ts` (**19**), leído por `PlanillaTab` y `PlanillaBoston`.
- 🔴 **JUSTIFICAR SIGNIFICA QUE SE PAGA. No existe «justificado pero no se paga».** La lista de motivos es **cerrada** (`motivos.ts`): Incapacidad · Catástrofe · Escolares · Trabajo de vendedor · Constancia.
- 🔑 **Tres reglas de la planilla son de la CONTADORA (Yulissa), no de Daniel** — por eso no se renegocian con él: la información se configura en el perfil y de ahí se toma, nunca a mano; **terceros se maneja igual que un préstamo** (monto inicial + cuota quincenal); y **daño de mercancía permanece en blanco**, con la cantidad escrita quincena por quincena.
- **«Descuento por compras» y «Daño de mercancía» son LA MISMA línea**, no dos conceptos.
- ⚠️ **Un colaborador sin cédula ni salario no siempre es un dato olvidado** (puede no tener permiso de trabajo).
- La incapacidad justificada **se paga**; «Trabajo fuera de la oficina» **no es ausencia**; un sueldo repartido saca la rata del **sueldo COMPLETO** y las partes deben sumar el salario de la ficha o se rechaza entero.
- Corregir una hora: el porqué es obligatorio; los motivos frecuentes se derivan de lo guardado en **90 días** por clave normalizada (**igualdad exacta, nada por parecido**), **4** con **2+** usos (`motivos-frecuentes.ts`, solo lectura).
- 🔴 **PESTAÑA «MARCACIONES», SOLO PARA DANIEL (25-sep-2026, `MARCACIONES_PESTANA`, hoy `true`)**: lo que mandó el TELÉFONO, tal cual — en el celular una tarjeta por colaborador y día (el lugar **una sola vez** si todas coinciden), en la computadora **Hora · Colaborador · Marca · Lugar · Llegó · Aparato**, con **chip ámbar si dos personas marcaron desde el mismo aparato**; tocar una marca abre la MISMA hoja del reporte (foto firmada 1 h y mapa). Va **al FINAL** de la barra, para que nadie cambie de aterrizaje. 🔴 **Solo `admin`, y lo decide el SERVIDOR** (`MARCACIONES_ROLES`): cada marca trae selfie y ubicación. 🔴 **Solo LEE.** Son las 37 del teléfono, no las 8.138 de los relojes (sin foto ni ubicación). «Llegó» nació de una medición: la entrada de Ana del 24-sep llegó **9 h después**. Candado `marcaciones-pestana`.
- 🔴 **DÓNDE MARCÓ CADA QUIEN: EL LUGAR CON NOMBRE, NO «SU TIENDA» (25-sep-2026, `lib/asistencia/lugar-de-marca.ts`)**. Daniel: *«Todos salen de la tienda, para eso es la app»* — las cinco que marcan por teléfono no tienen local propio. La fila dice el **lugar que devuelve Google** (negocio o centro comercial si lo hay, si no la calle), para TODA marca, **una vez** y guardada en `lugar_texto`; la **distancia es un extra** («· a 46,7 km») y solo si la empresa tiene punto en `asistencia_lugares_referencia` y la marca cayó fuera del radio — **sin referencia, ninguna distancia**. 🔑 El enlace de Maps de Daniel resuelve a una búsqueda POR NOMBRE, **sin coordenada**: el punto sembrado (City Mall David) es la **mediana de las 32 marcas reales** de Multifashion. 🔴 Se resuelve **AL MARCAR** —la tabla es append-only—, así que **las 37 viejas se quedan sin nombre**. ≈**US$2,60 al mes** con tope diario en la llave; **`GOOGLE_MAPS_API_KEY` no existe** y falla ABIERTA a «—». Candado `lugar-de-marca`.
- 🔴 **EL SELLO DEL TELÉFONO (25-sep-2026, `SELLO_DEL_APARATO`, hoy `true`)**: el navegador se pone un número al azar y lo manda con cada marca (`aparato_id`). Si el mismo día **dos colaboradores distintos** marcan con el mismo sello, va un mensaje al chat **PRIVADO** de Daniel, uno por (aparato, día), con el anti-loop escrito **después** de que Telegram confirme. 🔴 **No bloquea nada** y **ningún número de planilla se mueve**; sin sello no se dice nada. 🔴 **El payload es el de siempre más UN campo opcional**, y `marcacion-payload-igual` lo exige. Se revisa al recibir la marca, sin cron nuevo. Candado `sello-del-aparato`.
- ⚠️ Las dos columnas y la tabla nueva viven en `20261220120000_asistencia_lugar_y_aparato.sql`, **escrita y SIN aplicar**: sin ella, marcar funciona igual y la pestaña dice «—».

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
- 🔴 **UNA SOLA VENTA (23-sep-2026)**: Resumen · Clientes › Utilidad · Productos dan el MISMO número por empresa (Daniel: *«Debe de dar igual»*; la referencia es el Resumen). Utilidad suma el contado (`utilidad_por_cliente_v3`, migración `20261217140000` **aplicada**; sin ella, v2 + contado de `switch_facturas`, ±$0,01 dicho); Productos toma su total del Resumen (`leerDashboardSummary`) y DICE lo que el reporte por artículo no trae (notas de débito · renglones sueltos). El CASE de SQL se GENERA de `tipos-comprobante.ts` (`sqlVentaFirmada`). Interruptor `una-sola-venta-interruptor.ts`; candado `ventas-una-sola-venta`.
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
- 🔴 **La tarjeta de la meta y ese Telegram NO se pueden contradecir (23-sep-2026)**: son la MISMA cuenta (`proyección ÷ objetivo − 1` **es** el % del ritmo). 🩸 La pantalla repartía el MES del año pasado en partes iguales y decía «cierran en $401.881,60» con el Telegram en «+5% arriba»; ahora la temporada transcurrida sale del año pasado **día por día**, con la MISMA función que el vendido (`baseAnioPasado`, `corteDeLaMeta`) → **$440.643,43**. Los pesos mensuales quedan de respaldo, por `rpcRetail("overviewSerie")`. Sin migración.
- `claveVendedora` agrupa por igualdad exacta normalizada, nunca por parecido; la venta de hoy sale de `retail-dia.ts` con frescura; la «marca» de Switch es marca + departamento y lo desconocido cae en «Otros».

**El rediseño del módulo (6-sep-2026).** 📄 Sus 13 reglas (cuatro pestañas · un control de tiempo · el bono como columna · la cobertura de Clientes · nombres capitalizados · «Cuándo vende la tienda» · las vendedoras con dos códigos y «REDES Sheynee» · la fila «Año») viven verbatim en el postmortem › «Lo que decía CLAUDE.md hasta el 22-sep-2026» (podadas de aquí el 23-sep-2026). Migración `20261209120000` (canal) **aplicada**.

**Retail al frente, mayoreo abajo (23-sep-2026).** 📄 [docs/postmortems/multifashion.md](docs/postmortems/multifashion.md) › «Retail al frente».

- 🔴 **EL NÚMERO GRANDE ES RETAIL Y TODO % ES RETAIL CONTRA RETAIL** (`RETAIL_AL_FRENTE`, `lib/multifashion/retail-al-frente.ts`, hoy `true`): 🩸 cuatro RPC leían `ventas_raw` (mayoreo SIN marcar): el año decía +8 % siendo **+15,8 %** (medidas en el postmortem). Las RPC nuevas (v2/v3/v5, migraciones `20261217140000` y `20261217140100`, **aplicadas**) leen SOLO la vista; el código cae a las viejas (`rpc-retail.ts`). La línea chiquita «+ $X de mayoreo (N facturas) · entró $Y» sale SOLO con mayoreo ≠ 0 (año, mes, Telegram); **en Productos nunca**.
- 🔴 **Las cuatro pestañas quedan como el mockup (35 → 20 elementos: 6·4·5·5)**, candado `multifashion-retail-al-frente.test.tsx`: «Cierra en» del mes por TEMPORADA (la cuenta de la meta); UNA tarjeta de meta; Excel del ranking SOLO en mes cerrado; **La Frontera fuera del ranking por CÓDIGO (324)** y 🔴 **Maher entra a TODO el módulo** —ranking y lista de llamar—: `fuera-de-seguimiento.ts` quedó VACÍO (Daniel, 23-sep-2026: «sin excepciones por solo una persona»); `clientes-wholesale` contesta 410; cambiar una meta deja rastro; `hoyPanama()` en página y rutas. ⚠️ `false` = las cuatro pantallas y RPC de antes.

**En el celular: un número y cuatro renglones (24-sep-2026).** 📄 [docs/postmortems/multifashion.md](docs/postmortems/multifashion.md) › «El celular».

- 🔴 **EL MES ES EL NÚMERO, Y LAS CUATRO PESTAÑAS SON CUATRO RENGLONES** (`MULTIFASHION_CELULAR`, `lib/multifashion/celular.ts`, hoy `true`; **solo hasta `sm`**): 🩸 medido el 24-sep en un iPhone, **308 px de 844 (36 %) antes del primer número**, la banda «HOY» hablaba de hoy **mirando agosto**, el desplegable ofrecía **57 a 65 meses** y Vendedoras traía **48 bloques de texto**. Ahora: «Septiembre» + «23 días · hoy sin ventas todavía» (lo de hoy SOLO en el mes de hoy), el número grande con «▲ 29 % contra septiembre 2025 · cierra en $47,117», el día por día en barras sin ejes, y los renglones **Año · Vendedoras · Productos · Clientes** (estas dos abren sus pestañas TAL CUAL). 🔴 **«‹ Agosto» cambia de mes y «Octubre ›» solo si el mes no es el actual — NUNCA al futuro**; `?mfPeriodo=` y el corte de Panamá no cambian. Vendedoras: UNA fila por vendedora (tienda · redes de `canales.ts`), la comisión al TOCAR el nombre y la meta como UN renglón. 🔴 **NINGÚN NÚMERO SE MUEVE** (mismo `fmtMoneyCompact`, mismo umbral ±5 %); HOY se pide UNA vez para las dos vistas (`venta-hoy-cliente.ts`). ⚠️ `false` = el celular de antes, intacto. Candado `multifashion-celular`.
- 🔴 **LA LÍNEA BAJO LA VENDEDORA DICE SU NOMBRE (24-sep-2026)**: era «tienda $11,674.57 · redes $375.30» y hoy es **«Sheynee $11,674.57 · Redes $375.30»** —el PRIMER nombre y «Redes» con mayúscula—, en la computadora y en el celular, en Multifashion y en el espejo de Comisiones (mismo componente). 🔴 **Ningún número ni cálculo cambia**: la tienda se sigue DERIVANDO (total − canales) y sin nombre cae a «tienda». `desgloseCanales` en `lib/multifashion/canales.ts`. Candado `vendedoras-linea-redes`.

### Marketing › el rediseño — Tiendas y Marcas (23-sep-2026) — [docs/postmortems/marketing-rediseno.md](docs/postmortems/marketing-rediseno.md)

> 📄 Las piezas A–D, los remates, el freno por tienda, el celular, las fotos y las citas de Daniel: el postmortem › §§ 1–15. Léelo antes de tocar una pantalla.

- 🔴 **DOS PUERTAS: TIENDAS (dónde se gasta: se registra, edita y anula ahí) y MARCAS (a quién se le pasa: se cierra y se manda el ZIP).** Abre en **Tiendas** (nombre del DIRECTORIO por código, lo reportado como único monto), con pestañas Tiendas · Marcas · Impulsadoras · Mobiliario; la ficha es **UNA tabla por fecha** («···» edita y anula); la marca, su período abierto con **UNA línea por tienda** y **sin proyectos** (**Reportes se fue**). `MARKETING_TIENDAS_Y_MARCAS` (hoy `true`). Candado `marketing-tiendas-y-marcas`.
- 🔴 **MULTIFASHION ES UNA TIENDA (D-108) Y NO APARECE EN NINGUNA MARCA — UNA regla** (`gastoEsDeMultifashion`) en portada, marca, reporte y ZIP; un gasto es factura · mueble · impulsadora con **UNA marca**, su tienda o «General», `se_reporta` prendido (apagado no suma ni va al ZIP); duplicado = proveedor normalizado + monto + fecha + **tienda**, salvo números distintos. Sus cuatro migraciones, **aplicadas** (📄 postmortem § 12).
- 🔴 **CONTABILIDAD ENTRA SOLO A MIRAR** (`lib/marketing/roles.ts`: `ROLES_MARKETING` lee, `ROLES_MARKETING_ESCRITURA` escribe; las rutas que escriben contestan 403).

- 🔴 **EL PERÍODO MANDA (23-sep-2026): arriba se elige el período, abajo se ve lo de ese período.** La ficha y la lista de Tiendas llevan la barra **Abierto · cada cierre («mid 2026 · PVH») · Todos** y abren en **Abierto** (todo gasto sin sello a un período CERRADO); los chips salen de los períodos REALES, en «Todos» se agrupa por período con subtotales que suman, y **ningún número cambia** (D-118: $1.771,27 · $4.701,26 · $6.472,53). 🩸 **Lo anulado desaparece de todas las pantallas**, anular pide escribir **ELIMINAR** y a los **90 días** el cron `cleanup-marketing-anulados` (03:40 UTC) lo borra con sus adjuntos y sellos. Puro en `lib/marketing/periodo-manda.ts`; candado `marketing-el-periodo-manda`.

- 🔴 **EN EL CELULAR, UNA FILA ES UN NOMBRE Y UN MONTO (24-sep-2026)** — Daniel: *«ya son datos que veré adentro, eso me ensucia la pantalla, no solo aquí sino en todo el sistema»*. Mockup aprobado letra por letra (**1a · 2a · 3a · 4c · 5b · 6b · 7b · 8a · 9a · 10a · 11a · 12a · 13b**, cada una VERBATIM en el postmortem § 14; `MARKETING_CELULAR`, hoy `true`; `false` = el celular de antes): la ficha son **dos renglones por gasto con el monto a la vista** (🩸 empezaba en el píxel 537 de 390), **Marcas NO lleva total de las tres**, Mobiliario va **sin «entregadas 543 de 561»** y la × de una foto sale solo con **«Editar»**. 🔑 **UN SOLO ÁRBOL** (`useEsCelular`, hasta 639 px): con los dos montados cada nombre salía dos veces. 🔴 **Ningún número cambia**. Candado `marketing-celular`.
- 🔴 **LA FOTO DE UNA TIENDA SE GUARDA, SIGUE AL PERÍODO Y LA MARCA SE ELIGE (24-sep-2026)**: 🩸 **ninguna se pudo guardar nunca** (`mk_adjuntos_destino_chk` exigía proyecto → 23514: **0 de 160** filas y **4 huérfanos**) y las dos de D-118 salían en «Abierto». `20261219130000` (**aplicada**) afloja la regla, agrega `mk_adjuntos.periodo_id` y sella las **52** viejas **por lista de ids**. 🔴 **Los períodos son POR MARCA**: con UNA abierta la foto va ahí sin preguntar; con DOS o más (**3 de las 4** tiendas con gasto abierto) **se elige con un toque** —44 px en el celular, `<select>` en la computadora, **nada preseleccionado**, y sin elegir no se abre el selector de archivo— y **manda el SERVIDOR** (`destinoDeFotoNueva`: 400 en español y el archivo se borra del cajón). 🔴 **A un período CERRADO no entra ni sale nada**: solo se ofrecen los abiertos y su ZIP no cambia por fotos nuevas. La cuadrícula sigue al chip. Falla ABIERTA. `MARKETING_FOTOS_CON_PERIODO`; candados `marketing-fotos-de-tienda` · `marketing-foto-elige-marca`.
- 🔴 **ESCANEAR LA FACTURA CON LA CÁMARA (24-sep-2026, 4c)**: «＋ Gasto» en el celular abre con **tres puertas** —Escanear · Elegir el PDF · Escribirlo a mano—. 🔑 **El lector ya existía** (`/api/marketing/ia/leer-factura`): faltaba aceptar una FOTO. 🔴 **Nada de lo que se guarda cambia**: se cuelga como `foto_factura`. **Falla ABIERTA**. Candado `marketing-escanear` (📄 postmortem § 14).

### Marketing › Mobiliario — [docs/postmortems/marketing-mobiliario.md](docs/postmortems/marketing-mobiliario.md)

- 🔴 **El inventario se descuenta en PIEZAS.** Los bultos son solo cómo viajó la mercancía y **no existe conversión fija**. `piezasParaStock()` es la única función que toca el stock, con barrido que pone el build ROJO si `bultos` entra en esa aritmética. Bultos es **opcional**: `null` se muestra vacío, **nunca `0`**.
- El **stock puede quedar negativo**, con aviso: la entrega no se bloquea. **Paneles NO es obligatorio**; el único freno es **al menos un producto con cantidad**, cerrado también en el servidor. Editar y borrar **devuelven el stock por delta** y dos veces no cuenta dos veces.
- `mk_mobiliario_notas_proveedor` (los costos del proveedor) queda **SEPARADA del inventario. NO fusionar**. La **nota de entrega** sale de un solo generador y el PDF se arma **antes del clic** (iOS bloquea la hoja de compartir con un `await` de red en el medio).

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
- 🔴 **QUIÉN ENTRA A CADA MÓDULO SE ANOTA (25-sep-2026, `REGISTRO_DE_VISITAS` en `lib/visitas/registro.ts`, hoy `true`)**: al cambiar de módulo el navegador avisa por `POST /api/visitas` —como mucho **una vez por módulo cada 10 min por pestaña**, sin `await` y con `.catch()`, como el recorte de `last_seen`— y el servidor SUMA en `visitas_modulo` (día de Panamá · persona · módulo · aparato). 🔴 **El quién sale de la cookie FIRMADA, nunca del cuerpo**; una key fuera de `ALL_MODULES` es **400** y sin sesión **204**. Se mira en **Usuarios › «Quién usa qué»**, SOLO admin, 30 días; el cron `cleanup-sessions` borra a los **180 días** (sin entrada nueva de cron). 🔴 **Falla ABIERTA** sin la migración `20261221120000` (escrita, **sin aplicar**). Candado `visitas/registro-de-visitas`.
- Rate limiting: login en Supabase (`login_attempts` + RPC `register_login_failure`/`clear_login_attempts`), por IP — 5 fallos en 15 min → lockout 15 min (`src/lib/login-rate-limit.ts`, fail-open). Reemplazó el Map en-memoria (inefectivo en serverless).
- Login case-insensitive (autocapitalizar iPhone); input con autoCapitalize=none, autoCorrect=off. Nombre + rol visibles en header y drawer. «Forgot password» → "Contacta al administrador".
## Base de datos

> 📄 Los conteos medidos, las tablas retiradas y el detalle: [docs/donde-vive-cada-dato.md](docs/donde-vive-cada-dato.md) y [docs/postmortems/crons-alertas.md](docs/postmortems/crons-alertas.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- **Tablas grandes:** `switch_articulo_diario` · `switch_factura_lineas` · `switch_facturas` (historia oct-2022+, fuente única de ventas) · `ventas_raw` (congelada; 🩸 **hasta el 23-sep-2026 la leían 4 RPC de Multifashion** — retiradas con `RETAIL_AL_FRENTE`, migración `20261217140000` aplicada) · `switch_recibos` · `switch_ingresos_mercancia` · `switch_articulo_info` · `cxc_rows` (legacy, sin lectores).
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

> 📄 El bloque ENTERO, verbatim: [docs/postmortems/navegacion.md](docs/postmortems/navegacion.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- `viewport-fit: cover` + `env(safe-area-inset-*)`, `status-bar-style: black`, standalone, start_url `/home`. Roles de un solo módulo auto-redirigen desde el home; sin bottom tab bar.
- 🔴 **El sistema vive en `www.fashiongr.com`; el pelado contesta 307**, y **un service worker detrás de una redirección NUNCA se registra**: todo enlace que se reparta va con `www`. `serwist.register()`/`update()` van con `.catch()`.
- Service worker MÍNIMO (Serwist, `src/app/sw.ts`): la app es SIEMPRE online (Modo Viaje ELIMINADO jul 2026), solo cachea assets inmutables. 🔴 **`matchOptions: { ignoreSearch: true }` en `/_next/static`** mientras `next.config.js` defina `deploymentId` (Skew Protection estampa `?dpl=` y sin esto todo se re-descarga en cada deploy). Actualización silenciosa (`skipWaiting`+`clientsClaim`+`SWUpdater`, con guard de formulario sucio) y recovery una-sola-vez de `ChunkLoadError` (`lib/chunk-recovery.ts`).
## Design System

> 📄 Detalle y citas: [docs/postmortems/diseno-y-ux.md](docs/postmortems/diseno-y-ux.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- **Direction:** Precision & Density + Apple-grade fluidity. **Depth:** borders-only (sin sombras en cards/módulos). **Spacing:** base 4px, `py-6` containers, `mb-4` secciones, `p-3` cards.
- **Buttons:** `rounded-md`, `bg-black text-white`, `active:scale-[0.97]`. **Cards:** `rounded-lg`, `border border-gray-200`. **Tables:** sticky headers, `tabular-nums`, `ScrollableTable` con gradientes, `SwipeableRow` en móvil. **Modals:** `ConfirmModal`, `ConfirmDeleteModal` (destructivo, 1 s de espera), `BottomSheet` (móvil).
- **Module colors:** 🔴 la lista viva son **22 módulos** en `src/lib/moduleColors.ts` (2px de acento en el encabezado; los 4 últimos entraron el 24-sep-2026 para el menú del celular y NO pintan el encabezado). **No la copies aquí: léela en el archivo**, que es el único lugar donde está completa.
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

- **Regla:** el stack del historial es ESPEJO del breadcrumb (Inicio › Grupo › Módulo › Detalle): el Back no conoce la jerarquía, así que la jerarquía vive en el historial. **Drill-down → `push`**; **filtro / tab / sort del MISMO nivel → `replace`** (`useUrlState(key, default, { history })`, `"replace"` por omisión).
- 🔴 **EN EL CELULAR, UNA PESTAÑA ES UNA PANTALLA (24-sep-2026)**: `useUrlState` decide por el dedo (`aparatoDeQuienMira`): `CLAVES_DE_PANTALLA` (`tab · subtab · vista · ver · modo · mfCel`) hacen `push` en el celular y `replace` en la computadora; filtros siguen en `replace`. Candado `url-state-pestana-es-pantalla`.
- 🔴 **EN EL CELULAR, ☰ ABRE EL MENÚ ENTERO, A PANTALLA COMPLETA (24-sep-2026)**: los TRES grupos como secciones con TODOS los módulos del ROL —ícono en su color, el de aquí marcado— y un buscador que solo acorta ESA lista (`coincideBusqueda`, **nunca por parecido**). **2 toques a cualquiera.** 🔴 Los CUATRO sin acento ya tienen tono, **fuera de `getModuleKeyFromPath`**. `MODO_DEL_CAJON` en `cajon-por-grupos.ts`. Candados `menu-pantalla-completa` · `cajon-hoja-abajo`.
- 🔴 **Y EN EL CELULAR YA NO HAY BARRA DE ARRIBA (24-sep-2026)**: la franja de 46 px se fue entera (**763 px útiles de 844, al abrir y al deslizar**, contra 717/763 de la barra que se escondía —ésa queda de respaldo con `SIN_BARRA_ARRIBA=false`; campana y lupa siguen afuera del celular—). 🔴 **El nombre del módulo es el TÍTULO grande de la página** (34 px, con el punto del acento, se va con el dedo) y se dice **UNA sola vez**: la portada que ya lo dibuja pasa `tituloEnLaPantalla` (Reclamos · CxC · Asistencia · Multifashion · Marketing); es un `<p>`, nunca un segundo `<h1>`. 🔴 **Las tres rayas son un botón redondo de 56 px abajo a la derecha** que abre el MISMO menú entero, con colchón de **76 px** en las listas; **sube encima de los botones negros fijos** —la barra publica su alto en `--fg-alto-barra-fija` y el botón negro no se mueve—. 🔴 **`--fg-altura-encabezado` queda en 0** y las pegajosas se pegan arriba del todo; a quien **solo marca** no se le dibuja ni título ni botón. En la computadora nada cambia. `lib/navegacion/barra-celular.ts`. Candado `sin-barra-arriba`.
- **SPAs de un solo route**: el patrón de referencia es **Reclamos** (`reclamos/ReclamosClient.tsx`), que reconstruye el estado desde la URL.
## Teclado (lo único que corre)

> 📄 Detalle y citas: [docs/postmortems/usuarios-inicio-teclado.md](docs/postmortems/usuarios-inicio-teclado.md).

- **`⌘K` / `Ctrl+K` — abrir la búsqueda global**, con listener propio dentro de `SearchBar.tsx`. 🩸 **Todo lo demás se retiró el 11-sep-2026** (`/`, «?», `G+…`, `J/K`, `E`): **nunca corrieron**, `useKeyboardShortcuts` estaba sin importadores desde abril. El **clic derecho** de CXC y Recordatorios ya se había retirado con el rediseño de esos módulos. Candado `atajos-de-teclado-retirados.test.ts`.
## Smart Features

> 📄 El bloque ENTERO, verbatim: [docs/postmortems/usuarios-inicio-teclado.md](docs/postmortems/usuarios-inicio-teclado.md) › «Lo que decía CLAUDE.md hasta el 22-sep-2026».

- **Búsqueda global:** 8 módulos (CXC, Reclamos, Guías, Directorio, Cheques, Ventas, Préstamos, Caja) y los mismos CINCO roles de siempre (`SEARCH_ROLES`). 🔴 **Cada resultado LLEVA a donde dice**: la guía a `/guias/<id>`, el cliente a `/clientes/<codigo>`, el de Ventas a `?tab=clientes&cliente=<CÓDIGO>` y el gasto de Caja a su período `/caja/<id>`. 🔴 El código del cliente de Ventas sale del **puente por ID** (`switch_facturas` → `switch_clientes` → `codigo`), **nunca del nombre**. ⚠️ El gasto de Caja no queda resaltado dentro de su período: pendiente, no olvido.
- 🩸 **Tres cosas que esta lista prometía y NO EXISTÍAN EN NINGUNA PANTALLA** (retiradas el 11-sep-2026): el feed «Acciones pendientes», los contadores del 🔔 y las 💡 sugerencias. Se retiró CÓDIGO MUERTO. ⚠️ La **campana 🔔 SÍ funciona** (`NotificationCenter`). Candado `inicio-sin-promesas.test.ts`.
- Spotlight («cheques que vencen mañana» → ⚡ deep link) · búsquedas recientes · Smart defaults (`fg_last_*`) · draft auto-save de 5 s · time grouping · inline previews · **hover preview solo en Ventas › Clientes** (`ClienteHoverCard`), NO en CXC · filtros en la URL y filas/scroll que sobreviven la navegación · banner «Sin conexión» informativo, **sin lectura offline**.
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
npm test          # Vitest — 17.500 pruebas. Las corre también GitHub Actions y el gancho antes de subir. 🔴 Una prueba aguanta 20 s (`vitest.config.ts`) y `waitFor` espera 10 s: la máquina de GitHub es LENTA y los dos topes eran iguales, así que la prueba moría justo cuando `waitFor` iba a reintentar.
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
