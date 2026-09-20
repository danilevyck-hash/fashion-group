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
| Rol | DB value | Acceso |
|-----|----------|--------|
| Admin | `admin` | Todo |
| Secretaria | `secretaria` | upload, guias, caja, reclamos, cheques, directorio, marketing, comisiones, **Cuentas por Cobrar** (11-sep-2026, ver el bloque de CXC), **catálogos incluido ADMINISTRAR** (ver nota), KPIs dashboard |
| Bodega | `bodega` | guias (despacho), catálogos (**solo ver**), referencia, asistencia (solo aprobar), búsqueda global (guías+directorio). Nota: directorio aparece solo en la búsqueda global, NO como módulo navegable. ⚠️ **No hay auto-redirect**: bodega tiene 4 módulos, no uno (esta fila decía «único módulo» y era falso desde que se le abrieron catálogos, referencia y asistencia) |
| Contabilidad | `contabilidad` | prestamos, proveedores, ventas, búsqueda global (ventas+prestamos). En API directorio solo lectura (GET), no edición |
| Vendedor | `vendedor` | catálogos (**solo ver** + armar pedidos), CXC, directorio, guías (solo lectura), búsqueda global (CXC+directorio) |
| Gerente ACS | `gerente_acs` | SOLO Multifashion (/multifashion + /api/multifashion/*), y **el módulo COMPLETO** — todo el histórico, igual que admin (ver nota abajo). Auto-redirect a Multifashion desde home (único módulo). Módulos vía `role_permissions` |
| Gerente Confecciones Boston | `gerente_boston` | Confecciones Boston (/boston + /api/boston/*), la cartera `/api/cxc/boston`, la planilla de Boston, y **Catálogos solo para VER** (27-ago-2026). Aterriza en /boston desde home por su CASA (`MODULO_CASA_POR_ROL`), no por el auto-redirect de módulo único. **NO ve la búsqueda global, ni el CXC del grupo, ni Ventas, ni Comisiones, ni Guías, ni la lista de comprobantes, ni administrar catálogos.** Módulos vía `role_permissions` |

| Marcación | `marcacion` | SOLO `/marcacion` — marcar desde el teléfono, con selfie y ubicación. Auto-redirect desde home. 4 de Multifashion (Ana 2 · Cindy 3 · Yeisibeth 306 · Angel 305). ⚠️ **Rodrigo (13) la tiene siendo `bodega`**: es el módulo POR PERSONA de `MODULOS_POR_PERSONA` |

> Roles reales del sistema = los 8 de arriba (`src/lib/modules.ts` → `SYSTEM_ROLES`). No existen roles `director` ni `cliente` (el catálogo Reebok es público, sin login).
> 🔴 **MARCAR DESDE EL TELÉFONO YA FUNCIONA SIN SEÑAL** (`marcacion/cola-offline.ts`; probado el 15-sep). Con señal la hora la pone el SERVIDOR; sin señal, la del teléfono, ni 10 min adelantada ni 7 días vieja. ⚠️ Con la app CERRADA no sale nada y la cola no está respaldada. 🔑 «Sin señal» **es la palabra del teléfono** y el servidor no puede probarlo — detalle y medición en el postmortem de asistencia.

## Módulos (src/lib/modules.ts)
Fuente única de navegación + permisos de UI. **3 grupos** (rediseño del home, jul-2026):
- **Ventas y clientes:** Vista General, Ventas, CXC (`/cxc` — era `/admin` hasta el 5-sep-2026; el rótulo sigue siendo «Cuentas por Cobrar» y `/admin` redirige), Multifashion, **Confecciones Boston** (`/boston`, key `boston` — 27-ago-2026), Clientes/Directorio (`/clientes`), Proveedores, **Referencia** (`/referencia`, key `referencia` — 12-ago-2026), Catálogos (**CUATRO** marcas ENCENDIDAS: Reebok, Joybees, Tommy Hilfiger y **Calvin Klein**, cada una con su tarjeta en el hub /catalogos/marcas, su catálogo público compartible y su pedido público `/pedido-<marca>/[id]` accesibles sin sesión)
- **Operación:** Guías de Despacho, **Asistencia y Planilla** (`/asistencia`, key `asistencia` — 3-ago-2026), Reclamos, **Plantilla Switch** (`/productos/cargar`, key `cargar` — era *Depurador* hasta el 8-sep-2026; la key y la dirección NO cambiaron), Comisiones, Marketing, Caja Menuda, **Gastos** (`/gastos-contabilidad`, key `gastos-contabilidad` — 11-ago-2026; 2 pestañas: *Gastos* —Egresos Varios, fuente ÚNICA desde el 13-ago-2026— y *Saldos de banco*), Préstamos, **Recordatorios** (`/recordatorios` desde el 5-sep-2026, era `/cheques`; era *Cheques*; la `key` sigue siendo `cheques` — ver abajo)
- **Administración:** Usuarios. 🩸 **Data Health se fue de la pantalla el 11-sep-2026** (Daniel: no lo usa) y **la medición se quedó ENTERA** — ver `docs/donde-vive-cada-dato.md` › `data_integrity_checks` y la skill `data-integrity`.

> **Nacidos después del 5-jul-2026** (auditoría de estado, 31-ago): los cuatro módulos navegables `asistencia` · `gastos-contabilidad` · `referencia` · `boston`, más dos PÁGINAS públicas que **no son módulos** y por eso no tienen ficha ni entrada en `role_permissions`: `/pedido-tommy/[id]` (24-jul) y `/pedido-calvin/[id]` (12-ago). En el mismo período nacieron **89 rutas API** y 6 grupos nuevos (`api/asistencia`, `api/boston`, `api/gastos-contabilidad`, `api/saldos-banco`, `api/recordatorios`, `api/diag`).

> 🩸 **«Packing Lists» (key `packing-lists`) se RETIRÓ el 10-sep-2026** (0 filas, nadie lo usó). Las tablas `packing_lists` y `pl_items` **NO se dropean** (patrón `mayor_lineas`), quedan `retirada` fuera del respaldo; `/packing-lists*` redirige a `/home` (307). Candado: `packing-lists-retirado.test.ts`. Detalle en `docs/historico/superado.md`.

> Las fichas del home y del sidebar NO llevan subtítulo (auditoría de textos, #278): el campo `subtitle` se eliminó de `AppModule`.
> Páginas de grupo: `/g/[grupo]` con los 3 slugs nuevos. Los slugs viejos redirigen en `next.config.js` (`/g/sistema` → `/g/administracion`; `/g/plata-entra`, `/g/plata-sale`, `/g/productos` → `/home`).

## Pendientes vivos

🔴 **Lo que Daniel pidió y sigue sin hacerse vive en [docs/pendientes-vivos.md](docs/pendientes-vivos.md)** (24 puntos, **reauditados uno por uno el 18-sep-2026**: nueve estaban resueltos y el archivo no se había enterado). Ábrelo al empezar una sesión, junto con `docs/estado-actual.md`. Daniel: *«no te olvides de las cosas porque yo me olvido y se pasan cosas»*. 🔴 **Lo que mueve plata y sigue abierto**: Multifashion sin ninguna quincena cerrada (y Fashion Wear 1–15 sep reabierta) · el cuadre del estado de cuenta que llega vacío. 🔑 **Antes de construir lo que ahí falte, compruébalo contra el código y la base.**

## Invariantes por módulo

Las reglas VIGENTES, en una o dos líneas cada una. 🔴 **Este archivo tiene que caber en 150.000 caracteres** (el harness lo corta ahí, en silencio): una regla nueva entra aquí en UNA línea, y su detalle —mediciones, citas de Daniel, candados, mutaciones— va al postmortem de su módulo (`docs/postmortems/`). Candado: `claude-md-bajo-el-tope.test.ts`.

⚠️ **Antes de tocar un módulo, lee el bloque «Lo que decía CLAUDE.md hasta el 14-sep-2026» de su postmortem**: ahí está, verbatim, todo lo que aquí se resumió el 14-sep-2026 — en particular las reglas de PANTALLA (qué se dibuja, dónde, rótulos, tamaños) que aquí ya no caben.

### Boston y CXC — [docs/postmortems/boston-cxc.md](docs/postmortems/boston-cxc.md)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/boston-cxc.md](docs/postmortems/boston-cxc.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- 🔴 **Boston NUNCA se mezcla con el CXC del grupo** (ni fila, total ni export); 🔴 **el del grupo SÍ convive con el resto**: aislarlo de más también es error.
- **Fashion Group son SEIS empresas** (`B2B_EMPRESA_KEYS` = `empresasConCxc()`); Boston y ACS no. La vista **EXCLUYE, no enumera**; se cierra una vez en `switch_estadocuenta_aging` y `..._aging_mv` la materializa. Toda lectura acota por `empresa_key`.
- `gerente_boston` (David): `boston` + `catalogos` **solo VER**, casa `/boston` (`MODULO_CASA_POR_ROL`). No ve búsqueda global, CXC del grupo, Ventas, Comisiones, Guías, comprobantes ni administrar catálogos.
- **Sueldos recortados en el SERVIDOR** (`VE_SUELDOS_DE_BOSTON`, hoy **`true`**); se ENUMERA lo que viaja (`CAMPOS_SIN_DINERO`).
- `ccte_id` de Boston lleva el AÑO adentro (`serie × 10.000.000 + (año − 2000) × 100.000 + correlativo`): sin fecha se **rechaza** y la corrida se corta sin escribir. Sync: **upsert → reconcile**, nunca al revés.
- 🔴 **SU PLATA SUMA; SUS CLIENTES NO SE VEN**: su venta sigue en Ventas › Resumen y Vista General; de las superficies del grupo salen sus CLIENTES, con candado en ambas direcciones. 🩸 **Tampoco entra a `clientes_master`**.
- `/api/clientes/[codigo]` pregunta `esCodigoDelGrupo()` y contesta **404**, nunca 403.
- 🔴 **Su DIRECTORIO se refresca SEMANAL sin tocar al grupo**: `sync-clientes-boston` (domingos 07:10 UTC) escribe **SOLO `switch_clientes` de `confecciones_boston`**, con `clientes-directorio.ts`. Guardas para marcarlo ausente: lista completa y no encoger bajo el **70%**; lista vacía = error. Alerta B, solo Boston, **165 h**.
- 🔴 **La secretaria cobra y ve el módulo** (`modules.ts` importa `ROLES_CXC`). ⚠️ **Boston sigue afuera**: otra lista.
- Candados: `cxc-boston-fuera-de-toda-superficie` · `boston-acceso` · `boston-cartera-web` · `boston-clientes-no-tocan-el-grupo` · `cxc-secretaria-cobra`.

**La planilla de David = la de Yulissa.**

- 🔴 **Las columnas de dinero salen de UN lugar** (`lib/asistencia/columnas-dinero-planilla.ts`, 19): `PlanillaTab` y `PlanillaBoston` leen la MISMA lista.
- 🔴 **Boston pide con el MISMO corte que la contadora**: el guardado de la quincena cerrada, o el sugerido (`corteParaBoston`). `GET /api/asistencia/planilla-guardada` acepta a `gerente_boston` **forzándole Boston** (`?id=` ajeno → 404).
- 🔴 **Su Préstamos suma las tres cuentas**: saldo = `calcularSaldoPrestamo` (préstamo + daño + terceros), cuota = préstamo + terceros (el daño sin cuota es **pendiente**, no diseño — ver [docs/pendientes-vivos.md](docs/pendientes-vivos.md)).
- Candados: `boston-planilla-mismas-columnas` · `boston-prestamos-tres-cuentas` · `boston-planilla-con-dinero` · `integration/boston-planilla-mismos-numeros`.

**El rediseño.** Vive en **`/cxc`**; `/admin` EXACTO redirige 307 con su query.

- 🔴 **Cobra todo el que ve el módulo**, por la única puerta «Cobrar» (correo con **Deshacer de 5 s**).
- 🔴 **Se mandan SIEMPRE las 6 empresas**, mire lo que mire el filtro: lo decide el SERVIDOR (`empresasDelEnvio()`). ⚠️ El cajón (`/api/cxc/estado-cuenta/[codigo]`) SÍ conserva el filtro: es lo que se MIRA.
- 🔴 **UN correo por DIRECCIÓN, nunca uno por cliente**: un PDF con una hoja por cliente y un total al final, agrupado en el SERVIDOR. Los **sin correo NO abortan el lote** y se dicen por nombre; direcciones en minúsculas y sin bordes.
- 🔴 **Aviso «sin pagar hace +90 d»**: días desde el ÚLTIMO PAGO REAL en las 6, por **CÓDIGO**; **las retenciones no cuentan, ni los recibos en cero**, y **el que nunca pagó también avisa**. «Hoy» es el de PANAMÁ (`/api/cxc/ultimo-pago`).
- 🔴 **Se anota lo que se manda por los TRES canales** (`cxc_emails_enviados.canal` ∈ correo · whatsapp · copia), 7 días. Lo anota `/api/cxc/enviar-email` **tras confirmar Resend**; `/api/cxc/envios` rechaza `"correo"`.
- 🔴 **«Contacto» en la ficha: el sync NUNCA lo pisa** (familia de `telefono/celular/email/notas`). Lo usa el saludo del correo y del WhatsApp; sin contacto, el de siempre; en un correo compartido **no se saluda a nadie**.
- 🔴 **Boston: mismo FORMATO, APARTE.** Ruta propia (`/api/cxc/boston/estado-cuenta`), **no reusa `fetchEstadoCuentaData`**; teléfonos y correos de `switch_clientes` acotado a Boston, **nunca de `clientes_master`**. Tramos finos, mismos cortes.
- 🩸 `/api/cxc-rows` se retiró; `contact-log` y `cxc-summary` se quedan (los nombran candados de Boston). `cxc_rows` y `cxc_contact_log` **no se borran**.
- Candados: `cxc-sin-pagar` · `cxc-correos-por-direccion` · `cxc-estado-cuenta-legible` · `cxc-cobrar-una-hoja` · `cxc-envios-y-pagos-por-fecha` · `cxc-ruta-y-error` · `cxc-contacto-del-cliente` · `cxc-boston-mismo-formato`.

**La FORMA DE SWITCH** — solo documentos ABIERTOS.

- 🔴 **DIEZ columnas, en el orden de Switch**: `Fecha · Comprobante · Comentario · N. Interno · Débitos · Créditos · Saldo · Vence · Plazo · Días`; fechas **DD-MM-AAAA**.
- 🔑 **Los números no se recalculan**: `debito` y `credito` son lo que Switch imprime; `debito − credito` es el saldo firmado y el corrido se acumula de ahí. 🔴 Por eso el orden `(fecha, ccte_id)` **no se puede mover**.
- 🔴 **Los TRES tramos de la pantalla, no los ocho de Switch** (`cxc-aging`). ⚠️ Ante el CLIENTE van por **rango**, nunca con `tramoLabel()`: **«vencido» está prohibido** —`dias` es EDAD, no mora—.
- 🔴 **Nada se pliega por valer menos de $50**, en los DOS cajones; si se vuelve a plegar, se agrupa **POR MONTO y NUNCA por tipo** (valor absoluto). `documentos-chicos.ts` se conserva sin lectores.
- 🔴 **El nombre del cliente es el que escribe Switch**, no el `nombre_normalized` que se usa para PAREAR; sin él se capitaliza respetando siglas.
- 🔴 **«Vence» se DERIVA de la fecha + el `plazo_credito`** (Switch no guarda vencimiento). ⚠️ **Con plazo 0 la celda va VACÍA**.
- 🔴 **El cuadre**: `Saldos[]` y `saldoTotal` de `/apicliente/estadocuenta` caen en `switch_estadocuenta_saldo` (migración `20261023120000`, **aplicada** (verificado contra producción el 14-sep-2026)). El cajón y «Cobrar» avisan si no coincide, con **un centavo** de tolerancia; sin dato de Switch no se afirma nada. ⚠️ El desfase **NO va en el papel del cliente**.
- 🔴 **EL CUADRE SE LEE DESDE ADENTRO (18-sep-2026).** Switch manda `saldoTotal` y `Saldos[]` ANIDADOS en `data.estadocuenta` (PDF p. 23) y el sync los buscaba un piso más arriba: **835 filas, 0 llenas**. La arma `filaDeCuadre` (`estadocuenta-cuadre.ts`) desde `estadocuenta`, las DOS grafías `Saldos`/`saldos`, y **falla ABIERTO a NULL — nunca un cero inventado**. Sin migración: la próxima corrida las llena. ⚠️ `saldoConsecutivo` es un segundo cuadre, más débil y **NO construido** (postmortem). Candado `cxc-cuadre-desde-adentro`.
- ⚠️ **«Comentario» va vacía**: el API de Switch no manda ese campo.
- ⚠️ **La empresa acreedora sale de una lista ESCRITA A MANO** (`lib/cxc/empresa-fiscal.ts`), no del `numero_fiscal`. **Las OCHO empresas ya están cargadas** (verificado el 14-sep-2026): la nota de «solo Fashion Wear» quedó vieja. Una empresa sin líneas sale con su nombre corto, **nunca con datos de otra empresa**. **Pendiente**: Daniel dicta sus cuatro líneas.
- 🔴 **Boston FIRMA COMO BOSTON** (10-sep-2026, Daniel: *«Firma Confecciones Boston»*; ya no es pendiente). La casa del papel se pregunta por `empresa_key` en `lib/cxc/casa-del-papel.ts`: el de Boston sale **sin el logo del grupo y sin `fashiongr.com` en el pie**. 🔴 **Lo que no se sabe no se inventa ni se presta**: Boston no tiene dominio propio, así que el correo viaja por Resend desde `fashiongr.com` con el nombre cambiado — **verificarle un dominio propio sigue pendiente de Daniel**.
- Candados: `cxc-estado-cuenta-forma-switch` · `cxc-papel-vocabulario` · `pdf-cliente-layout`.

### Guías — [docs/postmortems/guias.md](docs/postmortems/guias.md)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/guias.md](docs/postmortems/guias.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

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
- Candados: `guias-destinos-precedencia.test.ts` · `guias-destinos-config-route.test.ts` · `guias-configuracion-pantalla.test.tsx`.

**La limpieza del 5-sep-2026.**

- 🔴 La factura se guarda **COMPLETA** y se muestra **CORTA** (`facturasParaMostrar`); «ya salió en otra guía» compara los **ÚLTIMOS 4 DÍGITOS DENTRO DE LA MISMA EMPRESA** (`claveDeFactura`). ⚠️ Solo se recorta la forma `NN-NNNNNN…`; `Traslado` y el `0000` dan clave VACÍA a propósito.
- 🔴 **`D-201 American Classics` ya no se ofrece al armar una guía** (`CODIGOS_RETIRADOS_DE_GUIAS`); **no se borra nada**. ⚠️ El alias D-108 → «American Classics Store», solo en `nombre-display.ts`.
- 🔴 **Bodega corrige los BULTOS al despachar, solo con la guía PENDIENTE**; **firmada, no se tocan** (por `previous.estado`). **UNA columna de UNA línea** (`items_bultos`), **nunca por `items`** del PUT; rastro en `guia_items.bultos_original/_corregido_por/_corregido_en` (`20261004120000`, aplicada). En papel, PDF y Excel sale el número **FINAL**.
- 🔴 **Guardar no reescribe la guía entera**: sin cambios no llama al servidor (`hayCambios`); los renglones viajan solo si cambiaron (`renglonesCambiaron`). ⚠️ Bodega sigue cambiando el cliente de un renglón y agregando renglones.
- 🔴 **«Cerrada en bloque el 3-ago-2026…» deja de MOSTRARSE y NO se borra** (`observacionesVisibles`). ⚠️ El campo que se EDITA sigue trayéndola.
- 🔴 **Cinco columnas retiradas de `guia_transporte`** (`firma_transportista`, `nombre_entregador`, `cedula_entregador`, `motivo_rechazo`, `monto_total`): **no se dropean**, quedan con `COMMENT` (`20261006120000`, aplicada) y candado que pone el build ROJO si se borran o si el código las toca. ⚠️ Las dos firmas en uso **no se tocan**.
- 🔴 **«Rechazada» se retiró**: `guiaYaDespachada` solo reconoce «Completada»; el PATCH ya no acepta `motivo_rechazo`.
- 🔴 **Compartir**: IMAGEN hasta 6 renglones y PDF de ahí para arriba (`formatoParaCompartir`, `MAX_RENGLONES_PNG = 6`); en computadora, **siempre PDF** —el aparato se reconoce **por el dedo** (`pointer: coarse`), no por el nombre (`aparato.ts`)—. La imagen se dibuja **sin un solo `await`**, las firmas se **precargan al abrir la guía** y una sin decodificar **no se inventa**. ⚠️ `png-guia.ts` **no arrastra jsPDF**; imprimir no cambia.
- 🔴 **«Changuinola» con «u»** en `DEFAULT_DIRECCIONES` (`20261005120000`, **aplicada** (verificado contra producción el 14-sep-2026); **valor exacto**, nunca un `LIKE`).
- Candados: `guias-numero-factura.test.ts` · `guias-american-classics.test.ts` · `guias-bultos-de-bodega.test.ts` · `guias-restos-y-ambar.test.ts` · `guias-compartir-png.test.ts` · `guias-bultos-y-guardar.test.tsx`.

**El panel y los defectos del 11-sep-2026.**

- 🔴 **`/guias/nueva` rebota al vendedor en el SERVIDOR**; los roles de escritura viven en **`roles-escritura.ts`**, con barrido que prohíbe escribirlos a mano. ⚠️ El vendedor sigue viendo Guías en solo lectura.
- ⚠️ **`GET /api/guias` deja las firmas afuera a propósito**: el papel se pide completo por `/api/guias/[id]`.
- ⚠️ El borde izquierdo esmeralda de la fila **no se tocó** — decisión pendiente de Daniel.
- Candados: `guias-filtro-y-aviso.test.ts` · `guias-filtro-y-aviso.test.tsx` · `guias-cedula-con-guiones.test.ts` · `guias-firmas-plegadas.test.ts` · `guias-ventana-y-pendientes.test.ts` · `guias-en-el-telefono.test.tsx` · `guias-panel-que-se-lee.test.tsx`.

**La lista de destinos (7-sep-2026) y varios clientes (10-sep-2026).**

- 🔴 **La lista de destinos del campo dirección es DEL EQUIPO, no de un navegador**: `guias_destino_lista` (`20261014120000`, **aplicada** (verificado contra producción el 14-sep-2026)), en Guías › Configuración. ⚠️ **NO se fusiona con `guias_destino_cliente`**. Agregar: admin · secretaria · bodega; quitar: admin · secretaria. 🔴 **Soft delete firmado, NUNCA DELETE**; el repetido se rechaza por `claveDestino` (exacto, jamás por parecido). **Sin la DDL falla ABIERTA** a `DESTINOS_BASE` y el GET contesta 200 vacío.
- 🔴 **La semilla sale del uso REAL, nunca del `localStorage` de nadie**: **3+ usos**, grafía más usada, salvo la ya definida en `guias_destino_cliente`.
- 🔴 **Una guía lleva facturas de VARIOS CLIENTES, de a UN CLIENTE A LA VEZ** (un renglón por cliente-empresa); **reusa el MISMO `ClientePicker`** y **nada de lo que se guarda cambia** (`GUIAS_ATAJOS_NUEVOS`).
- Candados: `guias-destinos-compartidos.test.ts` · `guias-papel-uno-solo.test.ts` · `guias-destinos-compartidos-pantalla.test.tsx` · `guias-varios-clientes-y-dias.test.ts` · `guias-varios-clientes-y-dias.test.tsx`.

**La lista y «Definir» (19-sep-2026)** — detalle y pendientes en el postmortem.

- 🔴 Encabezados + columna de **FECHA** (anchuras en UNA constante, compartida) · pie **«47 guías de 236»** · **borde de color solo si dice algo** · el aviso es un **PUNTO en columna que existe siempre** (`avisos-de-la-fila.ts`) · **buscar abre la VENTANA, no el filtro** · **releer no borra la lista en Configuración**. ⚠️ Los BULTOS del pie no se tocaron. **Jorman** entra a «Despachado por» y 🔴 el campo **no se preselecciona**. Candados: `guias-lista-que-se-lee-sola` · `guias-configuracion-pantalla`.

**Etiquetas para las cajas (18-sep-2026).**

- 🔴 **Guías › «Etiquetas»** (admin · secretaria · bodega, `ETIQUETAS_ROLES` derivado de `GUIAS_WRITE_ROLES`; **NO** cuelga de `GUIAS_ATAJOS_NUEVOS`): se elige UNA factura de las 6 del grupo, se escriben las cajas y salen las hojas — carta en **cuartos, 4 por hoja**, jsPDF, con EMPRESA · fecha · Factura · Cliente · Destino · **«CAJA X de N»** y **sin** transportista, piezas, código de barras ni la dirección del directorio. 🔴 **El ESTADO SE DERIVA** de `guias_etiquetas.guia_item_id` (`20261207120000`, aplicada): sin renglón VIVO de guía VIVA vuelve sola a «Pendiente». 🔴 **El anti-duplicado (409) y el bloqueo de lo ya importado los decide el SERVIDOR**; soft delete FIRMADO con único **parcial** `WHERE NOT deleted`, así una factura borrada se puede volver a etiquetar. 🔴 **Falla ABIERTA sin la migración** y **la guía se sigue creando igual**: en `/guias/nueva` las etiquetadas solo LLENAN los renglones de siempre, juntas por cliente **y** empresa con los bultos sumados. Candados: `guias-etiquetas` · `guias-etiquetas-route` · `guias-etiquetas-pantalla`.

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

### Reclamos — los cinco defectos del 11-sep-2026

> Detalle: [postmortem](docs/postmortems/reclamos.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».

- 🔴 **El detalle se lee por UNA sola puerta** (`src/lib/reclamos/leer-detalle.ts`): FIRMA cada archivo y trae los settlements. ⚠️ Falla **ABIERTA**.
- 🔴 **Un reclamo cobrado NO se vuelve a mandar**: «Correo» no sale en «Cobrados» **y el servidor lo rechaza**.
- 🔴 **El orden lo elige quien mira** (`lib/reclamos/orden.ts`): abre con la **factura más RECIENTE arriba** y las cinco columnas ordenan. ⚠️ Sin fecha, al **FINAL siempre**.
- 🔴 **El formulario ofrece las MISMAS empresas que la portada.** ⚠️ Uno guardado en una retirada conserva su opción al editar (`empresasParaElegir`).
- 🔴 **«Fecha de factura \*» es obligatoria**, en pantalla y en el servidor: de ahí salen los días y el orden.
- Candados: `reclamos-defectos.test.ts`.

### Caja Menuda — los dos defectos del 11-sep-2026

> Detalle: [postmortem](docs/postmortems/caja-menuda.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».

- 🔴 **Las fotos del recibo se ven con el período CERRADO**: cerrado, el menú «···» lleva solo «Foto del recibo» en SOLO LECTURA (`lib/caja/menu-del-gasto.ts`). ⚠️ Editar y borrar siguen cerrados, también en el servidor.
- 🔴 **«Restaurar» existe** (soft delete `deleted` · `deleted_by` · `deleted_at`), en **su propia rama** del servidor, nunca por `ALLOWED_FIELDS`, y **solo con el período ABIERTO**.
- Candados: `caja-y-marketing-defectos.test.ts` · `caja-periodo-cerrado-fotos.test.tsx`.

### Marketing › «+ Registrar gasto» — la factura en PDF entra por la puerta (10-sep-2026)

> Detalle: [postmortem](docs/postmortems/marketing-gastos.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».

- ⚠️ **Todo cuelga de `MARKETING_PDF_EN_LA_PUERTA` (`src/lib/marketing/pdf-en-la-puerta.ts`), hoy en `true`** — Daniel lo prendió el 10-sep-2026 (verificado el 14-sep). Se apaga poniéndola en `false`, sin migración.
- 🔴 **«Foto» pasa a «Foto o factura» y acepta PDF**: imagen = `foto_factura`; PDF = la factura (`pdf_factura`), tope **10 MB** (`MAX_PDF_MB`). La puerta conecta la IA.
- 🔴 **El mismo PDF NUNCA se sube dos veces**: sube una vez para la IA y al guardar solo se registra el adjunto con ESE `path` (`adjuntarPdfDeFactura`); un `ref` frena la relectura.
- 🔴 **Cada gasto con su prueba**: en **Factura** y **«Otro gasto»** el PDF es OBLIGATORIO (`pdfObligatorio`), Impulsadora exige su comprobante y Mueble no cambia. ⚠️ Es una PROP: el proyecto y la EDICIÓN guardan sin PDF.
- 🔴 **En Mueble el PDF se cuelga del PROYECTO como `otro`**, nunca `foto_proyecto` (se PUBLICA al cliente) ni `pdf_factura`. **Impulsadora no se tocó.**
- 🔴 **Un proyecto eliminado se puede devolver**: lista «Eliminados» al pie de los proyectos de la marca, que **sin ninguno NO se dibuja**, con el MISMO `POST` de restaurar.
- 🔴 **«Otro gasto» sí lee con IA**: el PDF sube UNA vez a `sin-dueno/…` (`paraLeerConIA`) y se cuelga de la factura nueva con ESE `path`. ⚠️ La subida sigue pidiendo dueño para lo demás, y un PDF cancelado no lo borra nadie.
- Candados: `marketing-pdf-en-la-puerta.test.ts` · `marketing-pdf-en-la-puerta.test.tsx`.

### Reclamos — el rediseño (10/11-sep-2026)

> Detalle: [postmortem](docs/postmortems/reclamos.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».

- 🔴 **«Reclamado» se marca solo** (`reclamos.reclamado_en`, migración `20261111120000`) la PRIMERA vez que sale de la casa —correo confirmado por Resend, o su Excel o PDF— y **nunca se pisa**.
- 🔴 **La portada** (`lib/reclamos/portada.ts`) mide los días desde la **FECHA DE FACTURA**. **Joystep se fue** (`EMPRESAS_CON_RECLAMOS` se DERIVA de `EMPRESAS`). **Nada se da por perdido**: sin corte de días.
- 🔴 **La empresa abre en «Por cobrar»**; «En proceso» salió de la pantalla pero sigue válido en la base, y los botones de arriba actúan sobre la selección o **lo que se mira**.
- 🔴 **`fecha_factura`** mide los días, y editar la pide. ⚠️ **Pendiente**: el backfill quedó SIN correr por `ANTHROPIC_API_KEY` inválida; al rotarla, `npx tsx scripts/_backfill-reclamos-fecha-factura.mjs`.
- 🔴 **Las facturas son una LISTA** (`lib/reclamos/facturas.ts`): UNA función la parte (`facturasDe`; `F-1000` no se parte) y UNA la arma (`facturasATexto`).
- 🔴 **PDF obligatorio al CREAR** (`validateReclamoNuevo`; editar uno viejo sin PDF sigue guardando); el lector `lib/reclamos/lector-factura.ts` comparte prompt con el backfill, y del PDF **no se editan** Estilo, Descripción, Cantidad ni Precio.
- 🔴 **La talla sale como viene en el PDF**: sin desglose la cantidad es el prepack; con desglose, cada talla es su renglón.
- 🔴 **«Volver a por cobrar» conserva comprobante y notas de crédito**; el borrado usa el `UndoToast` de **5 s**.
- 🔴 **El bucket `reclamo-fotos` es PRIVADO** —fotos y comprobantes—, firmados con **1 h** (`lib/reclamos/fotos-storage.ts`); `url` y `comprobante_url` van NULL: la verdad son `storage_path` y `comprobante_path`.
- 🔴 **El correo al proveedor lleva la factura y las fotos ADJUNTAS**, achicadas antes de viajar (1600 px el lado mayor, JPEG 80, `sharp` con `.rotate()`); la que no se lea viaja TAL CUAL.
- 🔴 **El tope es el del correo YA CODIFICADO** (`lib/reclamos/adjuntos-plan.ts`): Resend acepta **40 MB** y base64 crece 4/3, así que el presupuesto CRUDO es **3/4** de eso; pasarse tira el correo ENTERO.
- 🔴 **Lo que no cabe SE DICE**: primero el Excel, después las facturas y al final las fotos **de la más liviana a la más pesada**, saltando lo que no entra.
- 🔴 **El Excel NO lleva links y es UNO SOLO**: uno con links **no se puede armar ni queriendo**; **no se firma nada** para el correo, solo lo que se MIRA, por una hora.
- 🩸 **La galería pública de fotos se retiró entera**, con **su exención en `PUBLIC_PREFIXES`**. ⚠️ Los Excel VIEJOS dejan de abrir sus fotos.
- 🔴 **El papel (PDF y Excel) sale de UN solo módulo**, `lib/reclamos/papel.ts`: **Reclamo N° + fecha de la FACTURA** (sin ella, la del reclamo, **nunca «hoy»**) y **columnas vacías sin dibujar**. ⚠️ **El género viaja EN INGLÉS**, por el CHECK.
- 🔴 **«Descargar» ofrece PDF, Excel y la factura del proveedor**, con la URL **firmada del servidor**.
- 🔴 **Los viejos se rellenaron por lista de IDS, nunca con un UPDATE abierto**: `reclamado_en` = su creación (`20261113120000`) y `fecha_factura` = su `fecha_reclamo` (`20261114120000`), **aplicadas**. ⚠️ Los días quedan **subestimados, nunca inflados**.
- Candados: `reclamos-rediseno.test.ts` · `reclamos-rediseno.test.tsx` · `reclamos-correo-adjuntos.test.ts` · `reclamos-papel.test.ts`.

### Asistencia y planilla — [docs/postmortems/asistencia-planilla.md](docs/postmortems/asistencia-planilla.md)

- 🔴 **LOS DÍAS Y LOS DOS HORARIOS SON CONFIGURABLES POR PERSONA (18-sep-2026):** «hábil» ya no es «lunes a viernes» en el código sino la lista de cada quien (`asistencia_horarios.dias_laborables`; en NULL manda la EMPRESA: **Multifashion lunes a SÁBADO**, las otras lunes a viernes), así que un sábado de Multifashion sin marca es **ausencia** con sus 8 h y con marca es un **día normal sin recargo** (el aviso «trabajó un sábado» desaparece para ellos); **el domingo no se toca**. Y cada persona tiene DOS horarios —el del reloj y el del teléfono (`entrada_afuera`/`salida_afuera`, **vacío = el mismo de adentro**)— y **cuál aplica lo decide la PRIMERA marca del día**. Regla en `lib/asistencia/horario-configurable.ts`, lectura ÚNICA en `horarios-server.ts`; migración `20261208120000` ⚠️ **pendiente (la corre Daniel)** y **falla ABIERTA**: sin ella, todo como hoy. Medido: solo Multifashion se mueve (1–15 sep −$87,13 · 16–31 ago −$102,92); el 12-sep quedó como feriado global y sus 4 ausencias se fueron solas. Candado `horario-configurable` (18 mutaciones, 2 controles). Detalle en el postmortem.
- 🔴 **TODO DE LUNES A SÁBADO EN MULTIFASHION, Y SIN DEUDA DE DÍA LIBRE (18-sep-2026, tarde).** Daniel: *«obvio todo de lunes a sábado con multifashion»* · *«ese día se les regala… no hay deuda del día libre a multifashion»*. Las TRES cuentas que seguían en «lunes a viernes» a secas —«faltan N días hábiles», el prorrateo de quien entra o sale a mitad de quincena y la deuda del día libre— pasan por **UN contador** (`diasLaborablesDelRango`, `horario-configurable.ts`) con los días de cada quien; **el domingo no se toca**. **Multifashion NUNCA lleva deuda de día libre**: `EMPRESAS_SIN_DIA_LIBRE` (`motivos.ts`), el servidor rechaza con 400 por empresa, por persona y en la puerta que escribe, y la pantalla no le ofrece el motivo. **No hay feriados por empresa**. Medido: 0 cambios de neto (1–15 sep y 16–31 ago). Candado `multifashion-sabado-y-dia-libre` (17 mutaciones, 2 controles). Detalle en el postmortem.
- 🔴 **EL DÍA LIBRE DE LA EMPRESA: SE PAGA COMPLETO Y QUEDA DEBIENDO 8 HORAS EN DÓLARES, QUE SOLO PAGAN LAS HORAS EXTRA (17-sep-2026).** Séptimo motivo, **lejos de «Compensatorio», que es lo CONTRARIO** (un libre que se le DEBÍA, gratis). Deuda = `8 × rata`, **congelada** al cargarse; se cobra consumiendo las CINCO columnas del extra y los seguros se recalculan sobre el bruto nuevo. 🔴 **El tope es el EXTRA, nunca el neto**: sin horas extra no se cobra un centavo y la deuda arrastra sin caducar, y **no se descuenta de la liquidación**. Una sola puerta (`cargarDeudasDiaLibre`), admin y contabilidad, solo hábiles; el cierre anota el pago y reabrir lo revierte. 🔑 No se inventó: la contadora lo lleva a mano desde mayo. Candado `dia-libre-empresa`.
- 🔴 **LAS HORAS EXTRA LAS APAGA SOLO LA CASILLA «¿Cobra horas extra?» DE LA FICHA — SER SERVICIO PROFESIONAL YA NO LAS APAGA (14-sep-2026).** Daniel: *«solo yulissa no cobra, todos los demás sí»*. Con la casilla en SÍ un servicio profesional **mide** sus extras y sale en Aprobaciones, pero **sigue sin `dinero`** (`fueraDePlanilla` no se tocó): no se inventa una rata. El Reporte y su ruta preguntan por la MISMA casilla. **0 cambios de neto medidos.** ⚠️ Marcar a alguien de Fashion Wear como servicio profesional lo SACA de la planilla entera — es otra pregunta. Candado `servicio-profesional-cobra-extra`. Detalle y citas en el postmortem.
- 🔴 **LOS DÍAS AFUERA SON «TRABAJO DE VENDEDOR» POR RANGO, DESDE LA FICHA, Y EL HORARIO 9–18 NO SE GUARDA (14-sep-2026).** No nació un mecanismo: el motivo ya no descuenta y `JustificarForm` ya tenía «Días» de-hasta; lo nuevo es la nota bajo el motivo (`notaDelMotivo` → `TEXTO_DIA_AFUERA`). 🔴 **El horario NO se guarda**: guardado como `hora_desde`/`hora_hasta` sería un PERMISO y el día pasaría a AUSENCIA (`motivoAdmiteHoras` sigue siendo solo Constancia). 🔴 **Si marcó ese día, manda el reloj.** Candados: `dias-afuera-y-compensatorio` · `justificar-form-nota-motivo`. Detalle y citas en el postmortem.
- 🔴 **«COMPENSATORIO» ES EL SEXTO MOTIVO, AL LADO DE INCAPACIDAD, Y NO DESCUENTA (14-sep-2026).** `MOTIVO_COMPENSATORIO` en `MOTIVOS_JUSTIFICACION` (`Incapacidad · Compensatorio · Catástrofe · Escolares · Trabajo de vendedor · Constancia`), de día completo. **Sin migración**: la base no tiene CHECK sobre `motivo`. Sigue valiendo: *justificar significa que se paga*. Candado en `dias-afuera-y-compensatorio`. Detalle y citas en el postmortem.
- 🔴 **«TRABAJA AFUERA» ES UNA CASILLA DE LA FICHA, Y NADIE CARGA NADA (14-sep-2026).** A quien la tiene, un día hábil ya pasado, sin marca, sin feriado y sin justificación —la condición que lo habría hecho ausencia— se le pone «Trabajo de vendedor» solo (`lib/asistencia/trabaja-afuera.ts`). **El día que SÍ marca se mide del reloj.** Feriado, fin de semana, vacación, justificación cargada y día en curso siguen mandando. ⚠️ **NO es `no_marca_reloj`** (ésa apaga el reloj SIEMPRE; con las dos, gana). Se lee APARTE de las fichas (`leerTrabajaAfuera`, tolerante). Candado `planilla-trabaja-afuera`.
- 🔴 Son **COLABORADORES**, no «personas», en todo texto del sistema. `/asistencia/personas/:codigo` redirige **307** con la query intacta; ⚠️ los identificadores NO cambian (`asistencia_personas`, `persona=<código>`).
- 🔴 Selector de empresa (`empresa-para-todo.ts`, `?empresa=`): opciones = rol ∩ `GET /api/asistencia/alcance` (`null` = las cuatro); hasta que conteste, lo del rol. Es filtro de LECTURA; `POST …/aprobaciones?empresa=` **rechaza (400) un código ajeno, todo o nada**.
- 🔴 Almuerzo **por empresa** (`ALMUERZO_POR_EMPRESA`): **30 min**, **60 en Multifashion**; sin casilla, el PUT de Horarios escribe el de la empresa de la ficha y conserva la entrada.
- La quincena paga `salario ÷ 2`. 🔴 **SOLO SE CIERRAN QUINCENAS (18-sep-2026, Daniel: *«si frenalo»*)**: el POST de `planilla-guardada` rechaza (400) cualquier otro rango ANTES de leer la base (`frenoSoloQuincenas`); «Otro rango» ya no está en la Planilla; la ruta que GENERA sigue aceptando rangos libres (`medirAjusteAnterior`). Candado `planilla-solo-quincenas`.
- 🔴 **EL DÍA DEL CORTE LO ELIGE LA CONTADORA, NO EL SISTEMA.** Daniel: *«los cortes no son 13 y 28, es depende de la contable cuando elige la fecha del corte»*. `CORTE_SUGERIDO = { 1: 13, 2: 28 }` es **solo lo que se propone** en la casilla; ella escribe el que quiera y vacío = quincena entera. La quincena real (1-15 · 16-fin) **sí es fija**; lo que el corte mueve es hasta dónde se LEE EL RELOJ, y los días que quedan se pagan normal y se ajustan en la siguiente.
- 🔴 **El día vale sueldo mensual ÷ 26** (`DIAS_PAGADOS_POR_MES`); quien entra o sale a mitad de quincena cobra **días hábiles trabajados** (`prorrateo-ingreso.ts`), congelado en el cierre.
- 🔴 Salir antes se descuenta **desde el minuto uno, sin tolerancia** (los 10 min de gracia son solo de la entrada) y tiene concepto propio en el cierre.
- Horas extra exactas del reloj (`brutoSeg / 60`, sin cuartos); ISR a mano. 🔴 Centavos: **manda el sistema y la contable se adapta**: 1–4 centavos no son defecto.
- Marcaciones al segundo, umbrales en minutos; Panamá **UTC−5 fijo**, tests con fechas fijas, y **los días que no pasaron no se cuentan** (`fecha >= diaEnCurso`). Aprobadores (`asistencia_aprobador_empresa`): daniel y Contabilidad en las cuatro; david solo Boston; Bodega en Fashion Wear y Vistana.
- 🔴 **La marcación del reloj nunca se edita ni se borra**: la corrección va encima, en `asistencia_correcciones` (motivo obligatorio, firma, deshacer = `anulada_en`), con barrido que prohíbe `update`/`delete`/`upsert`.
- 🔑 Cuando el sistema no puede saber, **se abstiene**: servicio profesional, ingreso o salida a mitad de período y justificación de período completo van a «Tú decides», sin número y fuera del total. ⚠️ Hasta el 14-sep-2026 el servicio profesional **no generaba horas extra ni entraba a Aprobaciones**; hoy eso lo decide SOLO la casilla «¿Cobra horas extra?» de la ficha (ver el primer bullet de este bloque).
- 🔴 Aprobaciones decide **SÍ · NO · PENDIENTE** (`decision`); `aprobado` se conserva DERIVADO (`'si'` ⇔ `true`). Un `no` no se paga y **deja de ser pendiente**; los 30 min automáticos de ACS se pagan igual. **Pendiente = sin fila o `decision IS NULL`: lo ÚNICO que avisa y frena.**
- 🔴 Domingo y feriado trabajados **se aprueban** (`diasConExtra`, valuados con `recargoDomingoFeriado`); no aprobado no se paga, pero se ve. Al aprobar **manda el servidor**.
- 🔴 «¿Cobra horas extra?» (`cobra_horas_extra NOT NULL DEFAULT true`; **solo un `false` explícito apaga**): con `false` no entra a Aprobaciones ni frena el cierre, pero **sigue en planilla** con tardanzas, ausencias y salida temprana.
- 🔴 Una vacación **no es una justificación** (tabla propia; «Vacaciones» no está entre los motivos ni los retirados); **el motor las honra pase lo que pase** y un día de vacaciones **no genera horas, tardanza ni ausencia**. Sin marcar no cuesta nada; **«ya se le pagó» es lo ÚNICO que mueve plata**: ausencia de día completo (**8 h × rata**) en hábiles no feriados.
- 🔴 **LOS DÍAS DE VACACIONES SE CALCULAN SOLOS, Y NO SON UN SALDO (17-sep-2026).** **30 días corridos por cada 11 MESES** desde `fecha_ingreso`, período en curso truncado, menos las registradas (`lib/asistencia/vacaciones-corresponden.ts`). 🔴 Se lee **«Le corresponden N días», NUNCA «le quedan»**, con la línea gris de que no incluye lo tomado antes del 17-sep-2026. 🔴 **NO entra a ningún cálculo de plata** —ni planilla ni liquidación—, con barrido que lo exige. 🔴 **Sin `fecha_ingreso` no sale un número, ni cero.** 🩸 El saldo a mano se RETIRÓ (`saldo_vacaciones_dias`/`_corte`, sin lectores, con `COMMENT`). Candado `vacaciones-le-corresponden`.
- 🔴 El descuento de préstamo **entra solo a la planilla; ya no se aprueba** (`prestamos-planilla.ts`): préstamo y terceros, cada cuota capeada a SU saldo; **lo escrito a mano manda, vacío = la cuota del módulo**; va a `dinero`, nunca a `manuales`. «Ya descontado» mira el ORIGEN del pago. `asistencia_prestamo_aprobado` **no se dropea**.
- 🔴 Las casillas de préstamo y terceros tienen **tres estados**: `NULL` = cuota automática · `0` = esta quincena **no se descuenta** y el cierre **no anota pago** · monto = ese monto (`casilla-sin-descontar.ts`, misma función para pantalla y guardado). ⚠️ `mercancia`, `isr` y `otros_servicios` siguen `NOT NULL DEFAULT 0`.
- 🔴 Las horas de una justificación **solo van con «Constancia»** (`permiso-horas.ts`): la ruta rechaza con **400** un motivo de día completo que llegue con horas; el motor honra las horas guardadas sin mirar el motivo.
- 🔴 **UN PERMISO DE HORAS PERDONA LAS TRES COLUMNAS, CON LA MISMA REGLA (16-sep-2026).** `minutosPerdonadosDe` cruza la ventana del permiso con la del INCUMPLIMIENTO —tardanza · salida temprana · exceso de almuerzo— y perdona la **intersección**, capeada a SU propio bruto. 🔴 **Nada callado**: el día lleva los tres perdones por separado y el chip dice cuál y cuánto. Un permiso de horas **no justifica el día entero**. Candado: `permiso-tres-columnas`. Citas, mediciones y mutaciones en el postmortem.
- 🔴 La salida temprana entra al ajuste del corte (`CONCEPTOS_DEL_RELOJ` son **ocho**) y **los seguros se calculan sobre el bruto CON el ajuste** (`aplicarAjusteEnLinea`, respeta `paga_seguros`).
- 🔴 El corte y el ajuste de los días sin medir entran **cada concepto en su columna — nunca una línea neta**, cada monto con SU rata (`corte-quincena.ts`, antes de totalizar: `dinero.netoPagar` ES el neto que se paga). **El neto por persona no cambia.** 🔴 **Y los seguros SÍ se recalculan sobre el bruto CON el ajuste** desde el 11-sep-2026 (Daniel: *«los seguros, va»*): la ruta le pasa a `aplicarAjusteEnLinea` los porcentajes vigentes. ⚠️ No se tocan con `paga_seguros` apagado ni con base propia (`seguros_base_quincena`), porque ahí el seguro no sale del bruto.
- 🔴 **CINCO ARREGLOS DE PANTALLA DEL REPORTE (16-sep-2026), y ninguno mueve plata**: los cuatro botones de período (`atajos-periodo.ts`, los MISMOS de la Planilla), el período en la URL (`periodo-en-la-url.ts`: URL → recordado → sugerencia, y media URL o un rango al revés se descartan enteros), el aviso de la hora de salida que NOMBRA a cada uno, el de **salida sospechosa** (`salida-sospechosa.ts`, **120 min**, en su propio campo y **nunca dentro de `revisar`**) y la columna «Extras», que reparte el MISMO número según `decision` (`extras-decididas.ts`). ⚠️ Cambia lo que se MUESTRA, nunca lo que se paga. Candado: `asistencia-cinco-arreglos`. Detalle en el postmortem.
- 🔴 **O el total sigue al filtro, o no hay buscador** (`buscar-en-lista.ts`): filtra lo ya cargado por **subcadena exacta normalizada, nunca por parecido**, con el texto en la URL (`?buscar=`). 🔴 **Planilla no tiene buscador** —su pie es plata que se paga—, con barrido sobre `PlanillaTab.tsx`. Los avisos de «Antes de cerrar» (`antes-de-cerrar.ts`) viajan como datos: Excel y PDF los leen igual.
- 🔴 **Lo que sale de la pantalla nunca se recorta** (Excel, PDF, cierre, lotes), salvo un botón que DIGA a cuántos afecta. ⚠️ Asistencia, Clientes y ⌘K buscan contra el SERVIDOR.
- 🔴 Dar de baja a alguien con deuda **avisa** (`salida-con-deuda.ts`), y la deuda son las **tres cuentas** (`calcularSaldoPrestamo`). 🔴 Las columnas de dinero salen de **un solo lugar**: `columnas-dinero-planilla.ts` (**19**), leído por `PlanillaTab` y `PlanillaBoston`.
- 🔴 **JUSTIFICAR SIGNIFICA QUE SE PAGA. No existe «justificado pero no se paga».** Daniel: *«no hagamos justificar que no pague, ensucia»*. La lista de motivos es **cerrada** (`motivos.ts`): Incapacidad · Catástrofe · Escolares · Trabajo de vendedor · Constancia.
- 🔑 **Tres reglas de la planilla son de la CONTADORA (Yulissa), no de Daniel** — por eso no se renegocian con él: la información *«se le configura en el perfil y la debe tomar de allí»*, nunca a mano; **terceros se maneja igual que un préstamo** (monto inicial + cuota quincenal); y **daño de mercancía permanece en blanco**, con la cantidad escrita quincena por quincena.
- **«Descuento por compras» y «Daño de mercancía» son LA MISMA línea**, no dos conceptos.
- ⚠️ **Un colaborador sin cédula ni salario no siempre es un dato olvidado**: Daniel, *«creo que porque no tienen permiso de trabajo»*.
- La incapacidad justificada **se paga**; «Trabajo fuera de la oficina» **no es ausencia**; un sueldo repartido saca la rata del **sueldo COMPLETO** y las partes deben sumar el salario de la ficha o se rechaza entero.
- Corregir una hora: el porqué es obligatorio; los motivos frecuentes se derivan de lo guardado en **90 días** por clave normalizada (**igualdad exacta, nada por parecido**), **4** con **2+** usos (`motivos-frecuentes.ts`, solo lectura).
- Candados: `asistencia-colaboradores-no-personas` · `asistencia-falta-configurar` · `asistencia-siete-pantallas` · `asistencia-lista-que-falta` · `planilla-elegir-quincena` · `asistencia-reglas-de-la-contable` · `asistencia-empresa-para-todo` · `asistencia-alcance-route` · `aprobaciones-por-persona` · `aprobaciones-optimista` · `vacaciones-el-motor-las-honra` · `asistencia-prestamo-planilla` · `planilla-sin-descontar` · `justificar-horas-solo-constancia` · `planilla-ajuste-por-concepto` · `planilla-antes-de-cerrar` · `asistencia-buscadores` · `prestamos-salida-con-deuda` · `asistencia-corregir-hora`.

### La Planilla Unida — los dos interruptores, PRENDIDOS en producción (11-sep-2026)

> Detalle completo: [el postmortem](docs/postmortems/asistencia-planilla.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026». ⚠️ Sus reglas de PANTALLA viven SOLO ahí: léelo antes de tocar una pantalla suya.

> 🔴 **Los dos están PRENDIDOS en producción desde el 11-sep-2026** (`NEXT_PUBLIC_PLANILLA_UNIDA="1"` y `NEXT_PUBLIC_PERSONA_EN_EL_CENTRO="1"` en Vercel, verificado el 14-sep-2026), así que lo de abajo es lo que Daniel VE hoy. Apagarlos pide cambiar la variable **y volver a desplegar**: Next reemplaza `NEXT_PUBLIC_*` como TEXTO al compilar. Daniel los prende uno por uno.

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
- Candados: `planilla-unida-comprobante` · `planilla-unida-cierre-prestamo` · `planilla-unida-corte-y-cableado` · `planilla-tres-descuentos` · `persona-en-el-centro` · `prestamos-una-puerta` · `prestamos-pestana-completa`.

### Préstamos — [docs/postmortems/prestamos.md](docs/postmortems/prestamos.md)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/prestamos.md](docs/postmortems/prestamos.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- 🔴 DOS cuentas con su cuota (Préstamo · Daño de mercancía) y el total es la suma; en la base son CINCO conceptos, «Daño de mercancía» es solo ETIQUETA de `Responsabilidad por daño`.
- Un **Pago baja UNA cuenta**; con las dos debiendo, «Baja de» viene puesto en la **más vieja** y se puede cambiar. Sin fechas el desempate es **estable** (préstamo), nunca el orden del array.
- 🔴 El saldo sale de UN solo lugar (`prestamos-saldo.ts`); los roles, de `prestamos-roles.ts`.
- 🔴 `activo` se retiró y la columna NO se borra: sin lectores, con `COMMENT` y build rojo si se dropea o si vuelven a filtrar por ella. Solo se lista a quien debe; el que ya no trabaja pero debe SÍ aparece, sin descuento.
- 🔴 La persona sale de Asistencia y la ficha nace con su `empleado_codigo`, editable. Nada se ata por parecido: lista a mano, y el UPDATE lo EXIGE.
- 🔴 NADIE APRUEBA UN PRÉSTAMO: nace `aprobado`. El tope de UN SUELDO MENSUAL sobre la deuda TOTAL (sin sueldo, $500) solo AVISA, en pantalla y Telegram privado; el daño nunca pasa por el tope.
- 🔴 El freno de duplicados mira concepto + origen + fecha, NUNCA la nota (`origen_pago` NULL = Quincena). Soft delete con `logActivity` hasta en «Eliminar Todo el Historial».
- 🔴 **LAS TRES CUOTAS ENTRAN SOLAS: préstamo, terceros y DAÑO DE MERCANCÍA** (14-sep-2026), cada una capeada a SU saldo y sin aprobar. Daniel: *«Tanto el chico como el grande que sea por cuota. Agregan el daño como se hace un préstamo, se elige la cuota y listo»*. El daño se registra en «+ Nuevo préstamo» **con su cuota, igual que un préstamo**, y desde ahí baja solo hasta saldarse. Las tres casillas tienen los MISMOS tres estados (`NULL` = va la cuota · `0` = no se descuenta esta quincena · monto = ese monto); la de mercancía por la migración `20261122120000` (**aplicada y verificada el 14-sep-2026**: 25 ceros pasaron a vacío, los 4 con monto intactos). 🔑 Lo ya anotado le gana a la cuota: un «Pago de responsabilidad» de otro origen no se vuelve a cobrar. Las tres cuotas **se editan en «Editar ficha»** (un `0` apaga la cuota y **no borra la deuda**). 🔴 **Boston suma las TRES en su «descuenta $X por quincena»**: dejar una afuera le muestra a David menos de lo que la planilla aplica.
- 🔴 «No descontar esta quincena» = un 0 en la FILA: `asistencia_planilla_manual` tiene tres estados (`NULL` = cuota · `0` = no se descuenta · monto) en `lib/asistencia/casilla-sin-descontar.ts`, la MISMA para pantalla y `normalizarManuales`; con 0 el cierre no anota pago.
- 🔴 **LA CUOTA ES OBLIGATORIA al registrar Préstamo · Daño de mercancía · Descuento a terceros** (14-sep-2026, Daniel: *«a) La cuota es obligatoria: no te deja guardar sin ella»*); **un Pago no la pide**. 🩸 Sin cuota la deuda no se descontaba nunca sola, y desde `/prestamos` (la puerta viva) ni se preguntaba. El botón apagado DICE qué falta («Falta: la cuota», visible). Regla en `lib/prestamos-registrar.ts`. Medido: 31 fichas vivas, las 31 con cuota.
- 🔴 **EL DESCUENTO NUNCA DEJA EL NETO EN NEGATIVO** (14-sep-2026, Daniel: *«a) Que nunca pase del neto: descuenta lo que alcance y el resto queda debiendo»*; es red de seguridad). 🩸 El motor no tenía piso. `recortarAlNeto` (`lib/asistencia/neto-no-negativo.ts`) corre **al FINAL de la ruta**, achica **solo lo AUTOMÁTICO** (lo escrito a mano manda), en el orden **daño → terceros → préstamo** (decisión de construcción: el préstamo es el compromiso más viejo), y anota `prestamoAutomatico.recortado`. **El saldo no baja por lo que no se cobró**: el cierre anota solo lo que entró (omisión `neto-no-alcanzo` si quedó en cero). Se DICE en la celda y en «Antes de cerrar». **El ISR sigue a mano.** Medido: la cuota más pesada hoy es $70 sobre ~$262 (27 %).
- 🔴 **Los movimientos de UNA quincena, en una pantalla y no en 31 fichas** (17-sep): vista «Movimientos» adentro de la pestaña, solo LECTURA, con «Origen» (del cierre o a mano). Postmortem › 10.
- Candados: `prestamos-dos-cuentas.test.ts` · `planilla-sin-descontar.test.ts` · `prestamos-cuota-obligatoria-y-neto.test.tsx` (26 casos, con los dos controles; `planilla-unida-cierre-prestamo` cambió de dirección con nota fechada).

### Navegación, 404 y papel — lo que se arregló el 17-sep-2026

> Detalle: [docs/postmortems/navegacion.md](docs/postmortems/navegacion.md).

- 🔴 **«Ir al inicio» es LA CASA DEL ROL, no `/home`** (`lib/navegacion/casa-del-rol.ts`): una sola función para el redirect de `/home`, el 404 y el botón del encabezado. `gerente_acs` y `marcacion` tienen un módulo solo; `/home` los rebota. ⚠️ **Bodega NO está atrapado**: tiene cuatro módulos — la auditoría del 6-sep decía otra cosa y estaba mal.
- 🔴 **Hay un 404 propio y en español** (`src/app/not-found.tsx`): «Esta pantalla no existe», con «Ir al inicio» y «Volver» —éste solo si hay a dónde—. Antes salía el de Next, en inglés.
- 🔴 **El PDF de Comisiones dice el título UNA vez**, en la primera hoja (`lib/comisiones/pdf-comision.ts`). ⚠️ Los **nombres de columna SÍ se repiten** y el pie con la numeración no se toca. 🩸 `ImpresionComision.tsx` está muerto desde el 9-sep: el papel sale de `pdf-comision.ts`.
- 🩸 **El CSV de Reclamos se retiró**: en ningún lado del sistema se exporta CSV. `csv-export.ts` queda rotulado y sin lectores; los dos Excel, intactos. Candado `reclamos-csv-retirado`.
- 🔴 **`/catalogo` y `/catalogos` redirigen** (307, fuente exacta) a `/catalogos/marcas`: el breadcrumb del propio hub caía ahí y daba el 404 de Next. Comprobantes monta el camino completo. ⚠️ El último tramo dice **«Comprobantes»**, no «Pedidos».
- 🔴 **Los rubros de Reebok se ADMINISTRAN, no se programan** (`reebok_rubro_categoria`, Catálogos › Reebok): el espejo `REEBOK_CATEGORY_ESPERADAS` se DERIVA de ahí. Falla ABIERTA a las seis reglas del código; `CategoriaReebok` sigue CERRADO —calzado · ropa · accesorios— y **la marca manda antes que el rubro**.
- 🔴 **Una descripción que «pasa» también queda registrada** (`origen = 'automatica'`, rotulada «Entró sola al pasar»), para poder darle fórmula después. Pasar no cambia de significado; se escribe al PROCESAR, nunca al descargar.
- 🔴 **Préstamos tiene «Movimientos» por quincena** (`lib/asistencia/movimientos-quincena.ts`): descuentos y deudas nuevas, con una columna **Origen** que dice si lo anotó el CIERRE o una persona. La ventana termina en `finDeLaMedicion` — con `q.hasta` se caían los movimientos de un día 31.
- ⚠️ **El Historial del depurador NO se divide en pestañas**: los tres caminos dejaron de nombrarse en pantalla el 4-sep-2026 y la tabla no guarda por dónde entró el archivo.
- 🔴 **El primer pintado ya sabe quién mira** (19-sep): `useAuth` arranca con la semilla de la cookie firmada (`lib/sesion-semilla*.ts`, leída en el layout raíz; rol · módulos · `isOwner` · nombre, **nunca el token**) con la MISMA regla que el navegador (`tieneAccesoAlModulo`); sin acceso o sin semilla, `null` como antes, y `sessionStorage` sigue mandando al hidratar. ⚠️ `/home` no PINTA en el servidor: elige sus colores con el modo oscuro del `localStorage`. Candado `sesion-semilla-primer-pintado`.
- 🔴 **Quien no tiene Inicio no lo ve ni un instante** (19-sep, Daniel: *«se ve el home y de una marcaciones, se siente bug»*): el rebote a la casa del rol lo decide el SERVIDOR en `src/app/home/layout.tsx` —`leerSemillaDeSesion()` + la MISMA `casaDelRol`, `redirect()` antes de una sola línea de HTML—, así que `marcacion`, `gerente_acs` y `gerente_boston` nunca reciben el Inicio. 🔴 **Falla ABIERTA**: sin cookie, forjada o rol desconocido, no redirige y el efecto del navegador decide como siempre. Candado `home-rebote-en-el-servidor`.

### Recordatorios (era Cheques) — [docs/postmortems/recordatorios.md](docs/postmortems/recordatorios.md)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/recordatorios.md](docs/postmortems/recordatorios.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- `/recordatorios` (era `/cheques`, 307); la `key` sigue siendo `cheques` en `role_permissions` y `modulos_override`; entran admin y secretaria, nadie más.
- 🔴 Solo se lista lo ABIERTO: lo depositado aparece solo al buscarlo. 🔴 NINGÚN total sumado: `recordatorios/agenda.ts` no tiene una operación de suma.
- 🔴 «Hoy» NO existe ni hay selector de hora: UN mensaje diario a las 9:00 a.m. de Panamá y el primero disponible es MAÑANA; un día pasado se rechaza en pantalla y en el servidor. El «Hasta…» corta INCLUSIVE, solo con repetición.
- 🔴 `destino` = `equipo` o `privado`, y lo decide el ROL en el SERVIDOR (`destinoPermitido`): lo de una secretaria va SIEMPRE al equipo, y ante la duda, `equipo`. ⚠️ Hay UN solo chat privado y DOS admin: lo de Alberto le llega a Daniel.
- 🔴 Un recordatorio NO se marca como hecho y un cheque que no se cobrará SE BORRA: no hay estado de completado. 🔴 El vencido sin marcar avisa UNA SOLA VEZ (`cheques.aviso_vencido_en`), marcado DESPUÉS de que Telegram confirme; un rebotado no avisa.
- 🔴 A los 365 días un cheque DEPOSITADO se retira con soft delete (`deleted` + `deleted_at`), nunca un DELETE, y solo los depositados: lo que se debe se queda para siempre. Cuenta desde `fecha_depositado` (sin ella, `fecha_deposito`; nunca «hoy»).
- Candados: `recordatorios-rediseno.test.ts` · `cheques-aviso-vencimiento.test.ts`.

### Gastos, mayor y banco — [docs/postmortems/gastos-mayor-banco.md](docs/postmortems/gastos-mayor-banco.md)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/gastos-mayor-banco.md](docs/postmortems/gastos-mayor-banco.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- `gastos-contabilidad`: Egresos Varios (fuente ÚNICA) y Saldos de banco. 🔴 Las 8 empresas se ven, pero sus gastos NUNCA se suman entre sí: ni total de grupo, ni pie de tabla, ni export; hay candado.
- El mayor contable se retiró; `mayor_lineas` y `mayor_importaciones` no se borran; build rojo si una migración las dropea.
- `bancos_saldos` va con upsert `(empresa_key, fecha_dato)`: repetir la fecha corrige ESE día y nunca pisa otro. Cero `DELETE`.
- 🩸 Un renglón ilegible de Switch NO desaparece: queda en `switch_sync_log.skip_details`, se dice en pantalla y avisa por 🔧 SISTEMA, anti-loop de 7 días por N. INTERNO, nunca por línea.
- 🩸 La cuenta se lee por el PRINCIPIO: `codigoDeCuenta()` acepta el código seguido de cualquier cosa; `CUENTA_RE` conserva su `$` para el VALOR, seis tramos siguen siendo error, `esGasto` decide con el primero y el nombre sale de `cuentas_contables.nombre_switch`.
- ⚠️ Vista General SÍ suma gastos entre empresas: otro módulo, suma deliberada; si la regla vale ahí es decisión pendiente de Daniel.

### Proveedores — un proveedor, una fila (6-sep-2026)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/proveedores.md](docs/postmortems/proveedores.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- 🔴 QUIÉN ES QUIÉN SALE DE UNA LISTA ESCRITA A MANO (`proveedor_amarre`), no del nombre y nunca de la cédula, que miente en las dos direcciones. Nada por parecido.
- 🔴 El grano es `(empresa_key, proveedor_switch_id)`: la UNIQUE, la llave del upsert y la de su purga. El código solo NO es identidad —nombra proveedores distintos según la empresa— y es nullable.
- ⚠️ `switch_proveedor_estadocuenta` no tiene soft delete y el sync borra de verdad lo que Switch deja de listar; por eso el amarre vive en su tabla y vale si se cae y vuelve.
- 🩸 Una lectura caída se dice, nunca se disfraza de «no hay nada», y lo que ya estaba no se borra.
- Candados: `proveedores-identidad.test.ts` · `proveedores-error-y-rotulo.test.ts`.

### Usuarios, Inicio y teclado — lo que se regalaba y no servía (11-sep-2026)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/usuarios-inicio-teclado.md](docs/postmortems/usuarios-inicio-teclado.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- 🔴 NO SE PUEDE REGALAR UN MÓDULO QUE LA PANTALLA REBOTA: los ofrecibles de «permisos personalizados» se derivan (`src/lib/modulos-ofrecibles.ts`) —a un rol solo se le ofrece lo que `ALL_MODULES` le da— y el servidor lo rechaza igual (`/api/admin/users`). Candado: `usuarios-modulos-ofrecibles.test.ts`.
- ⚠️ El override REEMPLAZA la lista del rol en vez de sumarla, y la pantalla no lo dice. Decisión pendiente de Daniel.
- 🔴 El teclado y el Inicio dejaron de prometer lo que no existe: se retiraron `useKeyboardShortcuts`, `useBadges`, `useSmartSuggestions`, `SuggestionCard` y `/api/home-stats`, sin lectores; queda `useSessionCheck`, desenchufado a propósito. Candados: `atajos-de-teclado-retirados.test.ts` · `inicio-sin-promesas.test.ts`.

### Crons, alertas e infraestructura — [docs/postmortems/crons-alertas.md](docs/postmortems/crons-alertas.md)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/crons-alertas.md](docs/postmortems/crons-alertas.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».

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
- Candados: `cron-registro.test.ts` · `silencio-de-datos.test.ts` · `acs-resumen-canal-privado.test.ts` · `backup-nada-sin-copia.test.ts` · `alertas-que-llegan.test.ts`.

**El lector de facturas avisa por Telegram (11-sep-2026)** — la regla 2 sobre un servicio de afuera.

- 🔴 **Avisan TRES causas y nada más** (`clasificarFalloAnthropic`): llave que no sirve (401/403 `authentication_error`/`permission_error`, y la llave AUSENTE), crédito agotado (402, o el 400 cuyo MENSAJE dice `credit balance`/`billing` — el texto, no el status) y tope de uso persistente (429 / `rate_limit_error`).
- 🔴 **Lo que NO avisa es la mitad del diseño**: PDF ilegible, 400 de documento, timeout, 500 y 529 «overloaded» no suenan.
- 🔑 «Persistente» está medido: el cliente fija `maxRetries: MAX_REINTENTOS` (**2**) a propósito, no por el default; si se toca, hay que repensar ese mensaje.
- 🔴 Un solo punto de llamada a Anthropic: `src/lib/ia/anthropic.ts`, sin prompt ni modelo adentro (ningún `claude-…` ahí). El error se vuelve a lanzar tal cual: mismo 500, la pantalla no cambia.
- 🔴 **Anti-loop de 7 días POR CAUSA** (`cron_email_errors.tipo` = `lector_facturas:<causa>`), marcado DESPUÉS de que Telegram confirme; la causa va en la llave para que una llave vencida no tape un crédito agotado posterior. Fail-OPEN, y avisar NUNCA lanza.
- El mensaje manda a la pantalla exacta: llave → API Keys y luego Vercel (`ANTHROPIC_API_KEY`, Production); crédito → Billing; tope → Limits; y dice que no se perdió nada. Candados: `lector-facturas-avisa.test.ts`.

- Los Excel de todo el sistema empiezan en la **fila 1**, con filtro desde A1 y la fila de encabezados fija. Todo export sale por `workbookBytes`/`workbookBuffer`/`workbookBlob`.

### Ventas, Referencia y Comisiones — [docs/postmortems/ventas-referencia.md](docs/postmortems/ventas-referencia.md)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/ventas-referencia.md](docs/postmortems/ventas-referencia.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- `switch_facturas` es la **fuente única de ventas**. Las **notas de crédito RESTAN**.
- Los tipos de comprobante viven en `lib/ventas/tipos-comprobante.ts`; uno sin clasificar **avisa** (regla 2) en vez de valer CERO en silencio.
- Las ventas las vigila `lib/datos-frescos.ts`, que **DERIVA** su lista de `empresasConFacturas()` y avisa a las **+24 h**.
- Referencia — los **TRES GRANDES son de la ÚLTIMA LLEGADA** (`medirTandas`); **Stock es SIEMPRE la existencia real de Switch** y el cuadre **no se fuerza**.
- La llegada se corta en `min(2, 10% de lo llegado)`. 🔴 **Nada de FIFO**: no se le atribuye una venta a una compra.
- 🔴 **«Actualizar datos de Switch» lo ve TODO el módulo**: `REFERENCIA_ROLES` (`lib/ventas/referencia.ts`) es UNA lista para todo el módulo; acelerador `SYNC_NOW_COOLDOWN_MIN` = **10 min**. El catálogo se trae **por empresa**.
- **VENDIDO = `Vendí ÷ (Vendí + Stock)`**. El **FOB se calcula** (`CIF ÷ 1,10`, `fobEstimado()`), **no se usa el de Switch**.
- **Las 6 del grupo comisionan igual**: **0,5 % sobre la VENTA** de las facturas con `pct_utilidad > 20` — la utilidad es **criterio de entrada**, no base. Retenciones y `TCKCTA` fuera. `comision_b2b_v9` vía `lib/comisiones/rpc`, con red a las versiones previas.
- 🔴 **Tres vendedores, tres papeles**: `vendedor_nombre` de la factura → **VENTA**; `switch_recibos.vendedor_registro` (quien REGISTRÓ el pago) → **COBRO**; `vendedor_cartera` → **ninguna comisión**.
- 🔴 **DEFAULT y DANIEL LEVY se calculan y se muestran, pero NO se pagan** (`VENDEDORES_SIN_PAGO`, `lib/comisiones/sin-pago.ts`): el total suma solo lo pagable, pero **el Excel los sigue llevando**.
- 🔴 **CLIENTES QUE NO COMISIONAN para un vendedor**: grano **(empresa, cliente, vendedor)**: `comision_exclusion` en `UPPER(TRIM())`, **soft delete firmado, nunca DELETE**, única entre ACTIVAS, RLS service_role. Otro vendedor **sí** comisiona; solo admin, una fila por empresa.
- 🔴 **Distinguen VENTA de COBRO**: `excluye_venta` / `excluye_cobro` (`DEFAULT true`, CHECK «al menos una»); con las dos apagadas **no se guarda y se avisa**.
- 🔴 **MULTI FASHION HOLDING SE EXCLUYE POR CÓDIGO (D-108), CON COMODÍN `*` = TODOS LOS VENDEDORES**: enumerar nombres deja entrar al nuevo. La v9 = la v8 **byte a byte** salvo eso. Migración `20261008120000`, aplicada.
- 🔴 **UNA PERSONA, UNA FILA, UNA TASA**: `comision_vendedor_alias` + `comision_vendedor_canonico(text)`; sin alias, el nombre **solo recortado**; canónico **REYNALDO con Y**. **Todo lo que agrupa por vendedor pasa por él**, incluido `aplicarAlias` (**falla abierto**).
- 🔴 **Los retirados viven en UN solo lugar, `lib/comisiones/retirados.ts`** (`REY STOUTE AGUAS`/`AGUAS`, `COLABORADOR`): `estaRetirado()` compara por el **canónico**, no salen **ni en tablas ni en totales**, el servidor **rechaza** su tasa o exclusión (400) y su fila se **desactiva, nunca DELETE**.
- 🔴 La columna «activo» de las tasas **no quita la comisión a nadie** y **no se dropea**: sacar a alguien es **solo** por `retirados.ts`.
- **`nombreVendedorEnPantalla` solo cambia cómo se MUESTRA**: la clave de agrupación, los descuentos y el Excel siguen en mayúsculas.
- **Los descuentos se restan UNA sola vez, en el SERVIDOR** (`netearComisiones`); ninguna vista resta por su cuenta.
- 🔴 **UN DESCUENTO TIENE FECHAS**: `desde` / `hasta`, el «hasta» **INCLUSIVE** y **OPCIONAL**, grano **MES**; sin `desde`, como siempre. `lib/comisiones/vigencia.ts`, aplicada en `leerDescuentosEfectivos` **antes** de la excepción del mes. Migración `20261007120000`, aplicada.
- 🔴 **Se administran en Comisiones › Configuración**: solo admin, **soft delete, NUNCA DELETE**, y el alta REVIVE una fila quitada. ⚠️ La excepción por MES vive en `/api/ventas/comisiones/descuentos`, con otros roles.
- 🔴 **Comisiones abre en el ÚLTIMO MES CERRADO y el «hoy» es el de PANAMÁ** (`hoyPanama` + `lib/comisiones/mes-inicial.ts`).
- 🔴 **«Todo el año» es LA SUMA DE SUS MESES**: la misma RPC mes a mes, neteada por `netearComisiones` (`acumular-anio.ts`), cortada en el mes en curso de **Panamá**; **la tasa no se suma: se conserva la vigente**. ⚠️ Ahí no hay detalle ni PDF (`conDetalle = !esTodoElAnio(mes)`): el reporte es de **UN mes**.
- 🔴 **El mes NEGATIVO se queda como está**: no cambia el cálculo.
- 🔴 **El costo del Resumen incluye las notas de débito**: sale de `switch_factura_utilidad` (`switch_costo_unificado_v2` y las RPC del Resumen).
- 🔴 **Ninguna lectura de costo del Resumen sale de `switch_costo_diario`** (su último día de cada mes vale $0): solo alimenta el **cuadre mensual** (`cuadre-costo.ts`: >2 % y >$100 → 🔧 SISTEMA, anti-loop 7 días por (empresa, mes)).
- ⚠️ **Multifashion es OTRO módulo de comisiones — NO fusionar**: paga 0,5 % solo sobre el CONTADO, sin filtro de utilidad; **nunca se suman en un número**. Su vista recibe el **AÑO ELEGIDO**.
- 🔴 **`clientes_master` es el directorio del GRUPO y SOLO del grupo**: el sync pide por **INCLUSIÓN** (`.in("empresa_key", EMPRESAS_DEL_GRUPO)`), nunca excluyendo: la tabla **no tiene `empresa_key`**.
- 🔴 **LA IDENTIDAD DEL CLIENTE ES EL CÓDIGO**: `switch_facturas (empresa_key, cliente_switch_id)` → `switch_clientes` → `codigo` → `clientes_master.codigo`, par **único por construcción**.
- 🔴 **Nadie une `clientes_master` por `nombre_normalized`, y NO hay fallback por nombre**: un JOIN por nombre contra homónimos **multiplica la factura**.
- ⚠️ **`TCKCTA` no es un cliente**: es el mostrador, se reconoce por CÓDIGO (`esMostrador`) y nunca por nombre; el grano de los rankings es **(cliente, EMPRESA)**.
- 🔴 **TODA comparación «vs año pasado» usa los MISMOS DÍAS** (`lib/ventas/clientes-corte-comparativo.ts`): corte = último día **CARGADO** del período en curso, nunca después de HOY en Panamá; 29-feb → 28-feb; un período cerrado va entero contra entero. «Compras \<año\>» no se recorta.
- ⚠️ **Productos** corta por `ultimoDiaArticuloDiario` (`switch_articulo_diario` llega hasta AYER), parámetro OBLIGATORIO de `productosRangoComparativo`. ⚠️ **Multifashion › Vendedoras compara contra el MES ANTERIOR** y lo dice el rótulo.
- ⚠️ **Pendiente de Daniel**: «las 6 hojas» se leyó como las 6 EMPRESAS, no seis reportes de detalle.
- Candados: `clientes-master-solo-del-grupo` · `ventas-clientes-las-seis-empresas` · `clientes-vs-anio-anterior-mismos-dias` · `mismos-dias-todas-las-comparaciones` · `costo-con-notas-de-debito` · `cuadre-costo` · `comision-exclusion-v7` · `comision-alias-v8` · `comision-b2b-v9-por-codigo` · `comisiones-descuentos-vigencia` · `comisiones-mes-cerrado-panama` · `comisiones-por-empresa-todo-el-anio` · `comisiones-no-se-paga` · `referencia-boton-actualizar` · `multifashion-cerrado-y-espejo`.

### Vista General y Ventas — el mes es el de Panamá (11-sep-2026)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/ventas-referencia.md](docs/postmortems/ventas-referencia.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- 🔴 **Vista General y Ventas deciden su mes con `hoyPanama()`**, nunca el reloj del navegador ni el del servidor (Vercel corre en UTC). ⚠️ Solo cambia con qué período abre cada pantalla.
- 🔴 **UN SOLO SELECTOR DE PERÍODO manda en las tres pestañas** (`lib/ventas/periodo.ts`): años y las ventanas de 12 y 6 meses, en la URL (`?periodo=`) y recordado (`fg_last_ventas_periodo`); **manda la URL, después la memoria, después el año en curso de Panamá**.
- 🔴 **Cada pestaña ofrece SOLO lo que sabe servir** y un período que no sirve cae al año en curso; en Clientes las ventanas salen **solo cuando la vista las trae** (`ventanasDisponibles`, lo dice el SERVIDOR).
- 🔴 **EL MARGEN DEL MES EN CURSO NO MEZCLA VENTA DE HOY CON COSTO DE AYER** (`lib/ventas/margen-mes-en-curso.ts`): utilidad y margen se calculan hasta el **ÚLTIMO DÍA CON COSTO**; **la VENTA del mes sigue siendo la de hoy**. El corte lo trae la RPC `ventas_mes_en_curso_corte_costo` (migración `20261120120000`, aplicada); sin ella la lectura **falla ABIERTA**.
- Cada descarga de Ventas se anota en `activity_logs` (`descarga_excel`) y baja **lo que está en pantalla**.
- 🔴 **«Todas las empresas» cuando la lista son solo las 6 del grupo; «Fashion Group» solo si mezcla grupo y no-grupo** (`rotuloDeTodas`, `lib/ventas/rotulo-empresas.ts`; las seis DERIVAN de `B2B_EMPRESA_KEYS`, sin Boston ni Multifashion).
- 🔴 **`clientes_empresa_12m_vw` es MATERIALIZADA aunque termine en `_vw`**, y la refresca `switch-sync tipo=facturas|all` cuando alguna de las 6 termina bien (tolerante). Los TRES caminos dejan la marca `clientes-vw-refrescada` en `cron_heartbeats` (`HEARTBEATS_NO_CRON`); sin marca, no se dice frescura.
- 🔴 **Nunca se rotula un período que no se sumó** (`rotuloCompras`). ⚠️ Las ventanas de Clientes salen de la migración **`20261121120000`** (**aplicada** (verificado contra producción el 14-sep-2026), aditiva); sin ella el servidor sirve el año y lo dice (`ventana: null`).
- 🔴 **«Nuevo» en vez de «+0 %»** para el cliente sin base comparativa (`delta: null`), y va al final al ordenar por cambio.
- 🔴 **Multifashion fuera del selector de Ventas › Productos** (`PRODUCTOS_EMPRESAS` deriva de `B2B_EMPRESA_KEYS`): no tiene filas en `switch_factura_lineas`. **Boston NO entra.**
- 🔴 **La puerta de atrás se cerró**: las 6 rutas de datos de Ventas son **solo `admin`**; `/api/ventas/v2`, `/v2/status`, `/años`, `/ventas/reporte` y `/api/ventas/resumen-anual` se retiraron; la búsqueda global no le ofrece «Ventas» a contabilidad.
- ⚠️ **Pendiente de Daniel**: en Clientes › Utilidad el período sigue siendo el año (las dos migraciones, `20261120120000` y `20261121120000`, ya están **aplicada** (verificado contra producción el 14-sep-2026)) (esa ruta no tiene ventanas).
- Candados: `mes-de-panama-vista-general-y-ventas` · `ventas-selector-periodo-unico` · `ventas-resumen-13-cambios` · `ventas-clientes-desplegable-y-nuevo` · `ventas-clientes-periodo-y-frescura` · `ventas-productos-selector-unico` · `ventas-puerta-cerrada`.

### El módulo Clientes — la ficha y la lista (5-sep-2026)

> Detalle completo: [docs/postmortems/clientes.md](docs/postmortems/clientes.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».

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
- Candados: `clientes-ficha-y-lista.test.ts` · `clientes-ficha-datos.test.ts` · `clientes-direccion-no-alimenta-guias.test.ts` · `clientes-enlaces-entre-modulos.test.ts` · `clientes-ficha-pantalla.test.tsx` · `clientes-lista-pantalla.test.tsx` · `clientes-directorio-entero-y-bodega.test.ts`.

### Multifashion — [docs/postmortems/multifashion.md](docs/postmortems/multifashion.md)

> Detalle completo: [docs/postmortems/multifashion.md](docs/postmortems/multifashion.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».

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
- 🔴 Las vendedoras con dos códigos se juntan (`20261009120000_multifashion_vendedora_alias.sql`, **aplicada** (verificado contra producción el 14-sep-2026)): identidad = CÓDIGO, tabla firmada, soft delete nunca DELETE, única entre activas, RLS service_role; lo resuelve `multifashion_vendedora_canonica` y las RPC v4 caen a la v3 sin la DDL.
- ⚠️ Juntar los códigos NO arregla la diferencia entre Vendedoras y el mes: falta `DEFAULT`, excluido a propósito.
- 🔴 **«REDES Sheynee» (15) ES Sheynee (11)**: columna `canal` del MISMO amarre, NUNCA por nombre; UNA fila (comisión y bono juntos) con «tienda $X · redes $Y» (`canales.ts`, v5); Metas lee el canónico (`meta_ventas_v2`). Migración `20261209120000` **pendiente**.
- 🩸 La fila «YTD» pasa a «Año» con el total de la tarjeta (`fila-anio.ts`); el Δ va sobre los meses comparables. ⚠️ En el año en curso puede diferir por el día de corte.
- 🩸 `SyncNowButton` con `roles={ROLES_MULTIFASHION}`; el rol sale de `lib/roles-etiquetas.ts`, derivado de `SYSTEM_ROLES`.
- Candados: `acs-resumen-meta-ritmo.test.ts` · `multifashion-rediseno.test.ts` · `multifashion-rediseno-pantalla.test.tsx` · `multifashion-anio-una-vez.test.ts` · `roles-etiquetas.test.ts` · `multifashion-cerrado-y-espejo.test.ts`.

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
- Passwords: bcrypt hashed (migración de plaintext completada — todos los usuarios en bcrypt; el login exige bcrypt y rechaza cualquier password no-hasheada)
- Session: httpOnly cookie `cxc_session`, base64url-encoded JSON `{role, userId, userName, sessionToken}`
- **Reanudar sesión (3-sep-2026):** con la cookie de 7 días viva **no se pide contraseña**: el login pregunta `GET /api/auth/sesion` (**fail-closed**: firma HMAC + token vivo y del MISMO usuario en `user_sessions` + usuario activo en `fg_users`; rol y módulos salen FRESCOS de la base, payload compartido en `src/lib/sesion-payload.ts`) y manda a la casa del rol; pase vencido, revocado o logout → contraseña como siempre. Los 3 botones de salir revocan y **esperan** el DELETE antes de navegar. Candado: `sesion-vigente-no-pide-contrasena.test.tsx`.
- Middleware: `src/middleware.ts` valida sesión contra `user_sessions` table
- 🔴 **`last_seen` se escribe como mucho UNA VEZ CADA 5 MINUTOS por sesión** (19-sep-2026): era un PATCH fire-and-forget en CADA petición de CADA persona — el renglón más caro de Sentry (p95 de 2 min; 2,3 días en promesas abandonadas en el borde). Sigue SIN `await` a propósito (esperar costaría ~200 ms por navegación): lo que se recortó es CUÁNTAS veces ocurre. La marca viaja en su cookie (`cxc_ultimo_toque`) porque el borde no tiene memoria, y **ante la duda se escribe**; cabe de sobra en los 14 días de `session-retention.ts`. ⚠️ Admin › Usuarios muestra la «última actividad» hasta 5 min atrasada. Candado: `last-seen-cada-cinco-minutos`.
- 🔴 **Una sesión no vence sola: la mata el cron (26-jul-2026).** `user_sessions` **no tiene `expires_at`** y la cookie firmada tampoco lleva claim de expiración — el `maxAge` de 7 días es un control del CLIENTE. `/api/cron/cleanup-sessions` (02:30 UTC) revoca a los **14 días** sin `last_seen`, pone un tope duro de **90 días** de vida aunque se la mantenga a pings, y **borra** las revocadas con `last_seen` > 90 días (`src/lib/session-retention.ts`). Si algún día se agrega un `expires_at`, el middleware tiene que respetarlo. Detalle y mediciones en [el postmortem](docs/postmortems/auth-sesiones.md).
- ⚠️ **No hay chequeo de sesión periódico**: `/api/auth/check` existe pero NADIE lo llama — `useSessionCheck` no tiene importadores desde el 11-abr-2026 y `SessionWarning` nunca se montó (ver *Hooks*). No corre ningún ping cada 2 min ni sale el aviso de «tu sesión está por vencer».
- API auth: `src/lib/requireRole.ts` — admin siempre pasa, verifica rol contra array
- Rate limiting: login en Supabase (tabla `login_attempts` + RPC `register_login_failure`/`clear_login_attempts`), por IP — 5 fallos en ventana de 15 min → lockout 15 min (`src/lib/login-rate-limit.ts`, fail-open). Reemplazó el Map en-memoria (inefectivo en serverless)
- Login case-insensitive: contraseñas no distinguen mayúsculas/minúsculas (autocapitalizar iPhone)
- Input login: autoCapitalize=none, autoCorrect=off
- User indicator: nombre + rol visible en header desktop y drawer mobile
- Forgot password: link en login → "Contacta al administrador"

## Base de datos
- **Tablas grandes** (medidas 2-sep-2026): `switch_articulo_diario` 203.536 · `switch_factura_lineas` 163.559 · `switch_facturas` 54.296 (historia oct-2022+, fuente única de ventas) · `ventas_raw` 48.378 (congelada, **sin lectores en la app**) · `switch_recibos` 46.556 · `switch_ingresos_mercancia` 35.475 · `switch_articulo_info` 16.619 · `cxc_rows` 1.097 (legacy, sin lectores). Detalle por pregunta en [docs/donde-vive-cada-dato.md](docs/donde-vive-cada-dato.md).

- **Soft delete (`deleted` boolean), por módulo:**
  - Caja: `caja_gastos` (+ `deleted_by`, `deleted_at`), `caja_periodos`
  - Préstamos: `prestamos_empleados`, `prestamos_movimientos`
  - Reclamos: `reclamos`, `reclamo_items`, `reclamo_settlements`
  - Recordatorios: `cheques` (+ `deleted_at` desde el 5-sep-2026: lo escribe la retención de 365 días) y `recordatorios`
  - Guías: `guia_transporte`, `guia_items`
  - Directorio: `clientes_master` (`directorio_clientes` está retirada desde el 5-sep-2026: sin lectores ni escritores, queda respaldada como congelada)
  - Nota: `packing_lists` usaba `deleted_at` (timestamp) en vez de la columna `deleted`; **el módulo se retiró el 10-sep-2026** (ver *Módulos*) y la tabla quedó sin escritores.
- **Vistas / Materialized views:** Convención de nombres: sufijo `_mv` = materialized view, `_vw` = view. (No verificado contra catálogo pg — vía REST no se distingue MV de view; confirmar con acceso a catálogo si se necesita certeza.)
  - `ventas_rollup_mensual_mv` (única `_mv`), `clientes_agregado_12m_vw`, `clientes_empresa_12m_vw`, `reebok_pedidos_unificado_vw`, `switch_costo_unificado_vw`, `switch_ventas_unificado_vw`, `_multifashion_sf_vw`
- **Flags de negocio:**
  - `is_wholesale`: en `ventas_raw`, `switch_facturas` y `_multifashion_sf_vw` (segrega retail/wholesale en Multifashion)
  - `is_preorder`: en `reebok_order_items` (preventa Reebok)
- **Tablas UX audit (abril 2026):**
  - `cxc_favorites` — 🩸 **RETIRADA de la app el 4-sep-2026.** La tabla queda (patrón `mayor_lineas`), sin lectores ni escritores: tuvo **0 filas en toda su historia** y su endpoint le contestaba **403** al vendedor que sí ve el CXC. Daniel: *«quita favoritos»*. Candado: `cxc-favoritos-retirados.test.ts` (ninguna migración puede dropearla; la estrella no vuelve)
  - `reclamo_custom_motivos` — motivos personalizados de reclamos (antes localStorage)
  - `reebok_orders.client_email` — email del cliente capturado al crear pedido

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
- 🗺️ **El mapa de flujo, dato por dato: [`docs/switch-flujo.md`](docs/switch-flujo.md)** (3-sep-2026) — para cada cosa que el sistema sabe de Switch: por qué endpoint o reporte sale, qué cron lo trae y a qué hora, en qué tabla cae y qué campos descarta, en qué pantalla se ve, qué empresas entran y cuáles no, qué lo rompe y cómo consultarlo al momento. Más las dos vías de entrada (API vs panel, **sesión por USUARIO**), las trampas transversales y el árbol de «por dónde empezar». **Léelo antes de decir que un dato «no existe», «no llega» o «viene de tal endpoint».** Cruza con `docs/donde-vive-cada-dato.md` (por pregunta) y con `switch-referencia.md` (por endpoint).
- 📖 **Documentación oficial cruzada con el código: [`docs/switch-referencia.md`](docs/switch-referencia.md)** — los 52 métodos del API (cuáles usamos, qué campos tiramos, 7 endpoints que usamos sin documentar), lo que las 13 guías explican del sistema, y la lista de lo que la doc corrige del repo (sesión única es por USUARIO, `rubroId` en `/apiarticulos/lista`, `detalle[]` en `/apiingresomercancia/info`, precio por cliente). El manual del panel sigue en `docs/switch-panel.md`.
- 🔑 **Por dónde se entra a mirar: una dirección por empresa** (Daniel las dictó el 3-sep-2026; el subdominio **no se deriva del nombre**). `vistanainternacional` · `fashionwear` · **`fashionshoesholding`** · `activeshoes` · `activewear` · **`joystepcorp`** · `confeccionesboston` · **`americanclassicstore`**, todas `.switch-soft.com`. ⚠️ Entrar **expulsa a quien esté adentro**: la sesión es por USUARIO y el sistema entra como `daniel`.
- 🔑 **Para disparar un cron a mano** hace falta `CRON_SECRET` (está en Vercel, en las variables del proyecto; no confundirla con las otras dos parecidas): `curl -H "Authorization: Bearer $CRON_SECRET" https://www.fashiongr.com/api/cron/<nombre>`. Sin ella contesta `{"ok":false,"error":"Unauthorized"}`.
- **Dos vías de entrada** (detalle en `docs/switch-flujo.md` › A): el **API JSON** con token (`client.ts`; `SWITCH_<EMPRESA>_API_*`) y el **panel web** Laravel con sesión (`web-client.ts`; `SWITCH_<EMPRESA>_WEB_*`, login con `changesession="SI"` que **expulsa** a quien esté en el panel). **La sesión es por USUARIO**, y el sistema entra como `daniel`: cada cron o script saca a Daniel del panel de esa empresa, y viceversa. Los crons de la misma empresa van a ≥ 15 min; los de login web, de madrugada de Panamá.
- Lo que llega por **CSV** hoy son solo los reportes del panel que el sync baja solo (egresos varios e ingresos de mercancía, con `;`). ⚠️ Aquí decía hasta el 3-sep-2026 «Upload: 100% manual (drag-drop), no hay API/SFTP» — describía el sistema de antes de jun-2026 (`ventas_raw`/`cxc_rows`, congeladas). Hoy hay 25 endpoints del API en uso y ~40 entradas de cron que tocan Switch.

## Email (Resend)
- `noreply@fashiongr.com` — cheques reminders
- `notificaciones@fashiongr.com` — alertas, reports, guias, reebok
- `info@fashiongr.com` — reclamos a proveedores
- `pedidos@fashiongr.com` — guias notify

## Crons (vercel.json)

🗓️ **La tabla completa (80 entradas, con horarios UTC y el porqué de cada hueco) vive en [docs/crons.md](docs/crons.md)** (movida desde aquí el 14-sep-2026). Las reglas que no cambian:
- **Una entrada de cron = una ocurrencia al día.** Para frecuencia sub-diaria se agregan entradas separadas del mismo path, NUNCA una lista de horas (`0 15,19,23 * * *`). Biyección `vercel.json` ↔ registro de código, candado `cron-registro.test.ts`. Límite Vercel Pro: 100 cron jobs/proyecto.
- Crons que tocan la **MISMA empresa** en Switch van **≥ 15 min** separados (`SEPARACION_MINIMA_MIN`): Switch admite un solo token válido por USUARIO. Los de login web, de madrugada de Panamá.
- Dos crons no diarios: `catalogos-fotos-resumen` (lunes 13:30) y `grupo-resumen-mensual` (día 1, 13:00). Uno semanal que toca Switch: `sync-clientes-boston` (domingos 07:10).
- Al agregar o quitar una entrada, actualiza `docs/crons.md` a mano: el candado protege el código, no la tabla.

## Alertas a Telegram — DOS canales, TRES formas de mandar

> Texto completo con las citas de Daniel: [docs/postmortems/crons-alertas.md](docs/postmortems/crons-alertas.md) › «Alertas a Telegram».

Punto único: `src/lib/alertas/canal.ts` (`enviarNegocio` / `enviarNegocioPrivado` / `enviarSistema`). **Nadie llama `sendTelegramAlert` directo** (barrido en `acs-resumen-canal-privado.test.ts`). Son dos CHATS con reglas **opuestas** y tres tratos:
- **📊 NEGOCIO** — pedidos, guías, cheques por vencer, fotos faltantes. **NINGUNA regla anti-ruido aplica**; `enviarNegocio` no tiene perilla de silenciar, y que no exista es la garantía. Es un **GRUPO de tres** con el celular de la empresa, no el chat de Daniel. Los textos no se tocan. El aviso de «costo sospechoso» ya no se manda por ningún canal (`costo-sospechoso-canal.test.ts`).
- **🔒 NEGOCIO PRIVADO** (`enviarNegocioPrivado`) — el resumen diario de ventas de ACS y el resumen mensual del grupo. Va al CHAT de sistema (privacidad) con el TRATO de negocio: **sin el prefijo `🔧 SISTEMA · `** y sin anti-ruido. Sale desde DOS lugares (el cron y la recuperación de `switch-reconciliacion`) que un candado exige que apunten al mismo destino.
- **🔧 SISTEMA** — prefijo `🔧 SISTEMA · `. Regla de tres: **(1)** es real, **(2)** no se arregla solo, **(3)** alguien tiene que hacer algo. El texto dice qué pasó / qué significa / qué hacer, sin nombres de tabla ni códigos HTTP. Es el chat PRIVADO de Daniel (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`; no existe ninguna variable `*_SISTEMA`).
- A dónde apunta cada canal se verifica sin escribirle a nadie: `GET /api/diag/canales-telegram` (`CRON_SECRET` o sesión de admin).

## PWA (iOS)
- `viewport-fit: cover` + `env(safe-area-inset-top/bottom)` para notch/Dynamic Island
- `apple-mobile-web-app-status-bar-style: black`
- Standalone mode, start_url: `/home`
- 🔴 **El sistema vive en `www.fashiongr.com`; el pelado contesta 307** (medido 19-sep-2026). ⚠️ **Un service worker detrás de una redirección NUNCA se registra** (por especificación): quien instale la app desde un enlace **sin `www`** se queda sin service worker en silencio. Hoy no muerde porque la página redirige antes, pero todo enlace que se reparta va con `www`. 🔴 `serwist.register()`/`update()` van con `.catch()` (sin señal: breadcrumb; otro motivo: se reporta). Candado: `sw-registro-con-catch`.
- Service worker MÍNIMO (Serwist, `src/app/sw.ts`) — la app es SIEMPRE online (Modo Viaje / lectura offline ELIMINADO jul 2026, nunca se usó). Solo cachea assets inmutables (`/_next/static` CacheFirst, imágenes/fuentes SWR); navegación y APIs van directo a la red (sin handler). Sin precache del app shell.
  - **`matchOptions: { ignoreSearch: true }` en la estrategia de `/_next/static`** — obligatorio mientras `next.config.js` defina `deploymentId` (Skew Protection de Vercel Pro): Next estampa `?dpl=<id>` en cada asset y ese query cambia en CADA deploy, así que sin esto los chunks cuyo contenido no cambió se re-descargan tras cada promoción. Es seguro porque el nombre del archivo lleva el hash del contenido. El fetch a la red (en un MISS) conserva la URL con `?dpl=`, así que el ruteo de Skew Protection no se toca. Candado en `src/__tests__/lib/sw-static-cache-dpl.test.ts`.
- Actualización automática y SILENCIOSA: `skipWaiting`+`clientsClaim` en sw.ts + `SWUpdater` (`src/components/SWUpdater.tsx`, registra el SW; `next.config` con `register:false`) → al haber build nuevo, swap + reload inmediato SIN UI de versión, con guard de formulario sucio (si hay un input con foco y contenido, difiere hasta blur/submit/ocultar app) y guard anti-loop en sessionStorage.
- Recovery una-sola-vez: ChunkLoadError / import dinámico fallido tras un deploy → `src/lib/chunk-recovery.ts` (listeners globales en SWUpdater + `error.tsx`/`global-error.tsx` raíz). Guard sessionStorage `fg_chunk_recovery` (1/min); si se repite, error boundary visible "Algo salió mal" con botón Recargar.
- Roles con 1 solo módulo auto-redirigen desde home (ej: Bodega → Guías)
- Sin bottom tab bar — navegación por módulos del home + drawer del header

## Design System
- **Direction:** Precision & Density + Apple-grade fluidity
- **Buttons:** `rounded-md`, `bg-black text-white`, `active:scale-[0.97]` tap feedback
- **Cards:** `rounded-lg`, `border border-gray-200`, no shadows
- **Tables:** sticky headers, `tabular-nums`, ScrollableTable con gradient indicators, SwipeableRow en mobile
- **Modals:** ConfirmModal (normal), ConfirmDeleteModal (destructivo, 1s delay), BottomSheet (mobile)
- **Spacing:** 4px base, py-6 containers, mb-4 sections, p-3 cards
- **Depth:** borders-only (no shadows en cards/modules)
- **Module colors:** la lista viva son **18 módulos** en `src/lib/moduleColors.ts` (2px de acento en el encabezado) — CXC=blue · Guías=emerald · Recordatorios=amber · Reclamos=orange · Caja=violet · Directorio=cyan · Préstamos=rose · Ventas=indigo · Reebok=red, más Comisiones · Asistencia · Boston · Proveedores · Plantilla Switch · Gastos · Marketing · Multifashion. 🔴 **No la copies aquí: léela en el archivo**, que es el único lugar donde está completa.
- **Animations:** AccordionContent (CSS grid 250ms), page transitions (slide-right/left/crossfade 180ms), KPI count-up, deposit flash, saldo shake, new row highlight
- 🔴 **Barras pegajosas: se pegan DEBAJO del encabezado, nunca encima** (11-sep-2026; detalle en [docs/postmortems/barras-pegajosas.md](docs/postmortems/barras-pegajosas.md)). El encabezado NO tiene alto fijo (72 px con breadcrumb, 46 en celular): se MIDE con `ResizeObserver` y viaja en `--fg-altura-encabezado`, publicada por `AppHeader` y `CatalogoNavbar`. **La única forma de pegar una barra de contenido es `CLASE_BARRA_PEGAJOSA`** (`src/lib/ui/barra-pegajosa.ts` + `.fg-barra-pegajosa`): `top: var(--fg-altura-encabezado)` y z-index 9, por debajo del 10 del encabezado. Un `<thead>` o la cabecera de un modal con `sticky top-0` se pegan a SU contenedor y se dejan como están (lista de exentos viva en el candado). ⚠️ Pendiente de Daniel: los dos `sticky top-0` del overlay de Marketing › Proyecto. Candados: `barras-pegajosas.test.ts` · `barras-pegajosas.test.tsx`.

## UX Principles
- Usuarios: secretarias, bodegueros, vendedores en Panamá. NO tech-savvy.
- 🔴 **«Pedido» para Daniel es la orden de un CLIENTE, nunca una petición HTTP.** Decirle *«la lista no manda ningún pedido de escritura»* lo hizo entender que Guías mandaba pedidos a Switch. Para hablar de red: **«no escribe nada», «no guarda nada», «solo lee»**. Igual de cargadas: factura · traslado · abono · pago.
- Labels en español simple. Cero jerga (CXC → "Cuentas por Cobrar")
- 🔴 **Traer datos frescos se dice «Actualizar ahora» en TODO el sistema** (`lib/ui/actualizar-ahora.ts`; Guías decía «Buscar otra vez» y Etiquetas «Traer de Switch ahora» hasta el 18-sep-2026). ⚠️ **«Traer ahora» de Asistencia es OTRA cosa** —le pide a una PC que empuje las marcas de su reloj— y no se toca. Candado: `actualizar-ahora-una-palabra`.
- 🔴 **La línea de «más de 4 marcas» NO dice cuál sobra** (18-sep-2026): «El día tiene N marcas, y son 4 — quita la que sobra», con las horas como BOTONES. 🩸 Decía «Marca de más: HH:MM:SS» —elegida por POSICIÓN— y la contadora quitó la equivocada en el día de Enrique Sánchez (7-sep). ⚠️ Con 3 marcas el texto NO cambia: ahí sí falta una. Detalle en [asistencia-planilla.md](docs/postmortems/asistencia-planilla.md).
- Botones descriptivos ("Guardar gasto", no "Guardar")
- Errores accionables y humanos ("No se pudo guardar. Intenta de nuevo en unos segundos.")
- Micro-copy con personalidad ("Listo, guardado", "Excel listo — revisa tu carpeta de descargas")
- Font size mínimo text-sm para datos. text-gray-600 mínimo para montos.
- Confirmación solo para acciones destructivas (eliminar), NO para guardar.
- Undo universal: 5 segundos para deshacer acciones destructivas (depositar, eliminar, cambiar estado)
- Optimistic UI: actualizar UI antes de respuesta del server, revertir si falla
- 1 acción principal por vista + OverflowMenu "···" para secundarias
- Toasts: errores 8s, éxitos 3s, con botón X para cerrar

## Navegación e Historial (Back/Forward consistente)
- **Regla:** el stack del historial debe ser ESPEJO del breadcrumb (Inicio › Grupo › Módulo › Detalle). El Back del navegador solo deshace la última URL — no conoce la jerarquía, así que la jerarquía debe vivir en el historial.
- **Drill-down a un nivel más profundo → `push`** (selector→empresa, lista→detalle, módulo→sub-route). Cada nivel deja entrada → Back deshace un nivel a la vez.
- **Filtro / tab / sort en el MISMO nivel → `replace`** (no debe crear entrada; Back no debe ciclar por tabs/filtros).
- `useUrlState(key, default, { history: "push" })` para params que representan un nivel; default `"replace"` para filtros/tabs.
- **SPAs de un solo route** (varios niveles bajo un mismo `/route`): el patrón de referencia es **Reclamos** (`src/app/reclamos/ReclamosClient.tsx`) — drill-down/tabs/back-forward vía el router de Next reconstruyendo el estado desde la URL. (El ejemplo anterior, Camisetas, fue eliminado en #35.)
- Módulos con **routes reales** (Caja, Préstamos, Guías, Clientes detalle) ya son correctos: cada nivel es una URL distinta empujada con `router.push`/`<Link>`. No requieren tratamiento especial.

## Teclado (lo único que corre)
- **`⌘K` / `Ctrl+K` — abrir la búsqueda global.** Tiene su propio listener dentro de `SearchBar.tsx` y nunca dependió de ningún gancho.
- 🩸 **Todo lo demás se retiró el 11-sep-2026** (Daniel: *«quita lo que no funciona»*): la `/` para buscar, la ayuda «?», los saltos `G+…`, el `J/K` por filas y la `E` para editar **nunca corrieron** —`useKeyboardShortcuts` estaba sin un solo importador desde el 11-abr-2026—. Candado: `atajos-de-teclado-retirados.test.ts`. Detalle en [el postmortem](docs/postmortems/usuarios-inicio-teclado.md).
- El **clic derecho** en filas de CXC y Recordatorios se había retirado antes, con el rediseño de esos dos módulos (ver sus bloques).

## Smart Features
- **Búsqueda global:** 8 módulos (CXC, Reclamos, Guías, Directorio, Cheques, Ventas, Préstamos, Caja). 🔴 **Cada resultado LLEVA a donde dice** (11-sep-2026): la **guía** abre `/guias/<id>`, el **cliente** su ficha `/clientes/<codigo>`, el de **Ventas** `?tab=clientes&cliente=<CÓDIGO>` y el gasto de **Caja** su período `/caja/<id>`. 🔴 El código del cliente de Ventas sale del **puente por ID** (`switch_facturas` → `switch_clientes` → `codigo`), **nunca del nombre**. ⚠️ El gasto de Caja no queda resaltado dentro de su período: pendiente, no olvido. Candado: `busqueda-global-destinos.test.ts`. Detalle en [el postmortem](docs/postmortems/usuarios-inicio-teclado.md).
- **La caja de buscar del Inicio es de los mismos CINCO roles que en todo el sistema** (`SEARCH_ROLES`, 11-sep-2026): estaba escrita a mano como `["admin","secretaria"]`, así que contabilidad y vendedor entraban al Inicio sin caja de buscar y la encontraban arriba en cualquier módulo.
- **Spotlight:** "cheques que vencen mañana" → ⚡ quick action con deep link
- **Búsquedas recientes:** últimas 5 + "Ir a..." shortcuts de módulos
- **Smart defaults:** recuerda última categoría, empresa, banco, transportista (localStorage `fg_last_*`)
- 🩸 **Tres cosas que esta lista prometía y NO EXISTÍAN EN NINGUNA PANTALLA** (retiradas el 11-sep-2026): el feed «Acciones pendientes», los contadores del 🔔 y las 💡 sugerencias. Se retiró CÓDIGO MUERTO; no se construyó nada. ⚠️ La **campana 🔔 SÍ funciona** (`NotificationCenter`, que nunca usó ese gancho) y `/api/notification-badges` se queda sin llamadores porque la nombran tres candados. Detalle en [el postmortem](docs/postmortems/usuarios-inicio-teclado.md). Candado: `inicio-sin-promesas.test.ts`.
- **Draft auto-save:** formularios de reclamos, guías, cheques se guardan cada 5s en localStorage
- **Time grouping:** cheques y guías agrupados por "Hoy/Esta semana/Vencidos"- **Contextual color:** tinte rojo/ámbar ambient cuando hay datos urgentes
- **Inline previews:** último contacto, días para depósito, próxima deducción visibles sin expandir
- **Hover preview:** cards ricas al hover sobre el nombre de un cliente — vive en **Ventas › Clientes** (`ClienteHoverCard`), NO en Cuentas por Cobrar (verificado 3-sep-2026: el CXC no tiene hover; su detalle es la fila expandida, con desglose por empresa y «Últimos pagos»)
- **URL state:** filtros persisten en URL (?risk=vencido&empresa=fashion_wear) — deep links y back/forward funcionan
- **UI persistence:** filas expandidas y scroll position sobreviven navegación (sessionStorage)
- **Offline:** banner "Sin conexión" (informativo) + botones deshabilitados sin red. NO hay lectura offline: el Modo Viaje (snapshots localStorage + cache de páginas del SW) se eliminó en jul 2026

## Exports
- Todos los PDFs tienen logo Fashion Group (src/lib/pdf-logo.ts, base64)
- Reebok PDFs/emails tienen logo Reebok (src/lib/reebok-logo.ts, base64)
- Fechas display: "5 abr 2026" (fmtDate en src/lib/format.ts)
- Moneda: `$#,##0.00` en Excel (números reales, no texto)
- Nombres de archivo con fecha: `Pedido-RBK001-2026-04-05.pdf`

## Shared Components (src/components/)
- **AppHeader** — sticky header con module color accent, user info, search, notifications
- **SearchBar** — ⌘K + mobile full-screen + recientes + spotlight NLP
- **MobileBottomBar** — ELIMINADO (abril 2026). Navegación es solo por módulos del home + drawer del header
- **NotificationCenter** — 🔔 bell con historial de toasts
- **SessionWarning** — banner/modal antes de expirar sesión
- **OfflineBanner** — amber offline, green reconexión
- **ContextMenuWrapper** — right-click menus en desktop
- **UndoToast** — countdown bar 5s con "Deshacer"
- **TimeGroupHeader** — headers colapsables por período de tiempo- **OverflowMenu** — "···" dropdown para acciones secundarias
- **ScrollableTable** — gradient indicators para scroll horizontal
- **SwipeableRow** — swipe-to-action en mobile
- **PullToRefresh** — pull down para refrescar en mobile
- **BottomSheet** — half/full screen draggable (mobile)
- **AccordionContent** — CSS grid expand/collapse animado
- **AnimatedNumber** — count-up con easing
## Hooks (src/lib/hooks/)
- **useAuth** — check role, user info
- **useSessionCheck** — ⚠️ **SIN USO**: no tiene importadores desde el 11-abr-2026, así que el chequeo de sesión cada 2 min NO corre. Se conserva rotulado (candado: `ganchos-sin-uso.test.ts`); enchufarlo es una decisión de Daniel que no está tomada.
- **useUrlState** — sync state ↔ URL params
- **useLastUsed** — remember last form values
- **useDraftAutoSave** — auto-save formularios cada 5s
- **usePersistedState** — sessionStorage-backed state
- **useUndoAction** — delayed execution con 5s undo window
- **useOnlineStatus** — offline/online detection

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
