# Fashion Group — fashiongr.com

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
| Secretaria | `secretaria` | upload, guias, caja, reclamos, cheques, directorio, marketing, comisiones, packing-lists, **catálogos incluido ADMINISTRAR** (ver nota), KPIs dashboard |
| Bodega | `bodega` | guias (despacho), packing-lists, catálogos (**solo ver**), búsqueda global (guías+directorio). Auto-redirect a Guías desde home (único módulo). Nota: directorio aparece solo en la búsqueda global, NO como módulo navegable |
| Contabilidad | `contabilidad` | prestamos, proveedores, ventas, búsqueda global (ventas+prestamos). En API directorio solo lectura (GET), no edición |
| Vendedor | `vendedor` | catálogos (**solo ver** + armar pedidos), CXC, directorio, guías (solo lectura), búsqueda global (CXC+directorio) |
| Gerente ACS | `gerente_acs` | SOLO Multifashion (/multifashion + /api/multifashion/*), y **el módulo COMPLETO** — todo el histórico, igual que admin (ver nota abajo). Auto-redirect a Multifashion desde home (único módulo). Módulos vía `role_permissions` |
| Gerente Confecciones Boston | `gerente_boston` | Confecciones Boston (/boston + /api/boston/*), la cartera `/api/cxc/boston`, la planilla de Boston, y **Catálogos solo para VER** (27-ago-2026). Aterriza en /boston desde home por su CASA (`MODULO_CASA_POR_ROL`), no por el auto-redirect de módulo único. **NO ve la búsqueda global, ni el CXC del grupo, ni Ventas, ni Comisiones, ni Guías, ni la lista de comprobantes, ni administrar catálogos.** Módulos vía `role_permissions` |

> Roles reales del sistema = los 7 de arriba (`src/lib/modules.ts` → `SYSTEM_ROLES`). No existen roles `director` ni `cliente` (el catálogo Reebok es público, sin login).

## Módulos (src/lib/modules.ts)
Fuente única de navegación + permisos de UI. **3 grupos** (rediseño del home, jul-2026):
- **Ventas y clientes:** Vista General, Ventas, CXC (`/admin`), Multifashion, **Confecciones Boston** (`/boston`, key `boston` — 27-ago-2026), Clientes/Directorio (`/clientes`), Proveedores, **Referencia** (`/referencia`, key `referencia` — 12-ago-2026), Catálogos (**CUATRO** marcas ENCENDIDAS: Reebok, Joybees, Tommy Hilfiger y **Calvin Klein**, cada una con su tarjeta en el hub /catalogos/marcas, su catálogo público compartible y su pedido público `/pedido-<marca>/[id]` accesibles sin sesión)
- **Operación:** Guías de Despacho, Packing Lists, **Asistencia y Planilla** (`/asistencia`, key `asistencia` — 3-ago-2026), Reclamos, Depurador (`/productos/cargar`), Comisiones, Marketing, Caja Menuda, **Gastos** (`/gastos-contabilidad`, key `gastos-contabilidad` — 11-ago-2026; 2 pestañas: *Gastos* —Egresos Varios, fuente ÚNICA desde el 13-ago-2026— y *Saldos de banco*), Préstamos, **Recordatorios** (era *Cheques*; la `key` sigue siendo `cheques` — ver abajo)
- **Administración:** Usuarios, Data Health

> **Nacidos después del 5-jul-2026** (auditoría de estado, 31-ago): los cuatro módulos navegables `asistencia` · `gastos-contabilidad` · `referencia` · `boston`, más dos PÁGINAS públicas que **no son módulos** y por eso no tienen ficha ni entrada en `role_permissions`: `/pedido-tommy/[id]` (24-jul) y `/pedido-calvin/[id]` (12-ago). En el mismo período nacieron **89 rutas API** y 6 grupos nuevos (`api/asistencia`, `api/boston`, `api/gastos-contabilidad`, `api/saldos-banco`, `api/recordatorios`, `api/diag`).

> Las fichas del home y del sidebar NO llevan subtítulo (auditoría de textos, #278): el campo `subtitle` se eliminó de `AppModule`.
> Páginas de grupo: `/g/[grupo]` con los 3 slugs nuevos. Los slugs viejos redirigen en `next.config.js` (`/g/sistema` → `/g/administracion`; `/g/plata-entra`, `/g/plata-sale`, `/g/productos` → `/home`).


## Invariantes por módulo

Las reglas VIGENTES, sin la historia de cómo se llegó a ellas. El post-mortem completo de
cada una — con los «Daniel, textual», las mediciones, los candados y los 🩸 — está en el
archivo enlazado, verbatim.

### Boston y CXC — [docs/postmortems/boston-cxc.md](docs/postmortems/boston-cxc.md)

- 🔴 **Boston NUNCA se mezcla con el CXC del grupo** — ni una fila, ni un total, ni un export, ni un badge. Se ve SOLO en su pestaña.
- 🔴 **El CXC del grupo SÍ convive con el resto del sistema** (guías, marketing, clientes, ventas). **Aislarlo de más también es un error.**
- Se cierra en la vista `switch_estadocuenta_aging`, **UNA sola vez**; `switch_estadocuenta_aging_mv` **materializa esa vista** (`SELECT v.* FROM switch_estadocuenta_aging v`), no copia su cuerpo.
- **Fashion Group son SEIS empresas:** `vistana · fashion_wear · fashion_shoes · active_wear · active_shoes · joystep` (= `B2B_EMPRESA_KEYS` = `empresasConCxc()`). `confecciones_boston` y `american_classic` NO lo son. La vista **EXCLUYE**, no enumera.
- Toda lectura de `switch_estadocuenta` acota por `empresa_key` en la misma cadena.
- `gerente_boston` (David): módulos `boston` + `catalogos` (**solo VER**), casa `/boston` vía `MODULO_CASA_POR_ROL`. No ve búsqueda global, CXC del grupo, Ventas, Comisiones, Guías, la lista de comprobantes ni administrar catálogos.
- Los **sueldos se recortan en el SERVIDOR** (`VE_SUELDOS_DE_BOSTON = false`); se ENUMERA lo que viaja (`CAMPOS_SIN_DINERO`), nunca se borra lo que se va.
- El `ccte_id` de Boston lleva el AÑO adentro: `serie × 10.000.000 + (año − 2000) × 100.000 + correlativo`. Un documento sin fecha se **rechaza** y la corrida se corta sin escribir.
- Orden obligatorio del sync: **upsert → reconcile**, nunca al revés (el reconcile pone `saldo = 0` a todo lo que no se reescribió).
- Candados: `cxc-boston-fuera-de-toda-superficie.test.ts` · `boston-acceso.test.ts` · `boston-cartera-web.test.ts`.

### Guías — [docs/postmortems/guias.md](docs/postmortems/guias.md)

- Una guía **Completada está bloqueada para edición**: el PUT la rechaza. Ese candado no se toca.
- **DOS excepciones que NO miran el estado**, cada una escribe UNA columna de UNA línea acotada con `.eq("guia_id", id)`: `PATCH /api/guias/[id]/cliente` y `PATCH /api/guias/[id]/numero-transp`.
- En una guía despachada se corrigen **TRES campos y nada más**: N° del transportista · cliente · facturas. **Los bultos NO** — es lo que el transportista firmó. Fuente única `src/lib/guias/campos-editables.ts`, leída por el formulario, el endpoint y el candado.
- **El cliente vive en `guia_items.cliente_codigo`, uno por renglón.** `receptor_nombre` es quien FIRMA, no el cliente. Elegir cliente **no es obligatorio** (62% de los renglones van a un destino que no está en el directorio).
- El **N° del transportista es POR LÍNEA** y **NO bloquea** el despacho. Placa, «recibido por», cédula y **las dos firmas SÍ** bloquean.
- **Entrega directa** = nuestro propio camión: no lleva placa ni transportista, y un `"0"` pelado se imprime como vacío (`sinCeroPelado`).
- **La lista NO despacha** — ni por swipe ni desplegando un formulario. Sus botones solo navegan; editar y despachar viven en `/guias/[id]`.
- Las sugerencias de cliente **NUNCA atan solas**, ni con un único candidato. El pareo es **exacto y normalizado, nunca por parecido**: `Outlet Duty Free N2` y `N3` son tiendas distintas.
- El formulario **no guarda si nada cambió** (`cambios-form.ts`): cargar la guía no puede producir una diferencia contra sí misma.

### Catálogos, pedidos y cotización — [docs/postmortems/catalogos-pedidos.md](docs/postmortems/catalogos-pedidos.md)

- 4 marcas: Reebok (`active_shoes`) · Joybees (`joystep`) · Tommy (`fashion_shoes`) · Calvin (`vistana`). **Joybees es espejo exacto de Reebok.**
- Roles en `src/lib/catalogo/roles.ts`: `CATALOGO_ROLES` = ver · `CATALOGO_ADMIN_ROLES` (admin + secretaria) = administrar.
- 🔴 **El cliente se elige, nunca viene puesto.** El checkout arranca vacío, el botón se apaga diciendo qué falta, y el **servidor responde 422** si un pedido interno sale sin cliente. El mostrador es el código `TCKCTA` y hay que tocarlo.
- **Un solo selector de cliente en todo el sistema**: `ClientePicker` (directorio propio) y `ClienteSwitchPicker` (directorio de Switch). Hay barrido que pone el build ROJO si aparece otro.
- Un envío sale como **pedido** (`/apipedido/terminar`) o **cotización** (`/apicotizacion/terminar`). **Una cotización NO aparta mercancía**, y eso se dice pegado al botón. `normalizarDocumento` cae a **pedido** ante cualquier valor raro.
- **At-most-once**: índice parcial único `(order_id) WHERE estado <> 'error'`. Cotizar consume el envío de ese pedido; para vender se **duplica**.
- El papel, el nombre del archivo y el adjunto del correo dicen **cuál de las dos fue**, derivado del **envío activo**, no del `status`.
- El panel de admin se llama **«Comprobantes»**; la key de la pestaña sigue siendo `pedidos` (está en `role_permissions`).
- **Las escrituras del sync que no cambian nada no se hacen** — comparación por tipo declarado columna por columna; ante la duda, se escribe.
- **El precio lo manda Switch.** A mano solo `image_url`/`badge` (+`name` en Tommy, que marca `nombre_manual`).

### Asistencia y planilla — [docs/postmortems/asistencia-planilla.md](docs/postmortems/asistencia-planilla.md)

- La quincena paga `salario ÷ 2`. Un **rango libre** prorratea por la fracción de QUINCENA cubierta y **no aplica los montos escritos a mano** — se dice en pantalla, en el Excel y en el PDF.
- **El almuerzo es fijo: 30 min** (`ALMUERZO_FIJO_MIN`). El PUT lo escribe mire lo que mire el cuerpo.
- Las marcaciones se miden **al segundo**; los umbrales de negocio siguen expresados en minutos.
- 🔴 **La marcación del reloj nunca se edita ni se borra.** La corrección va ENCIMA, en `asistencia_correcciones` (motivo obligatorio, firma de la sesión, deshacer = `anulada_en`). Barrido estático prohíbe `update`/`delete`/`upsert` sobre `asistencia_marcaciones`.
- **Los días que no pasaron no se cuentan** (`fecha >= diaEnCurso`, con el día de Panamá).
- 🔑 **Cuando el sistema no puede saber, se abstiene**: servicio profesional, ingreso o salida a mitad de período y justificación de período completo salen en «Tú decides» — sin número, fuera del total. (El rótulo se llamó «Decidilo vos» hasta el 1-sep-2026; se renombró por el candado de tuteo.)
- La **incapacidad justificada se paga**. «Trabajo fuera de la oficina» **no es una ausencia**: no descuenta y no genera extras.
- 🔴 **Una vacación NO es una justificación**: tabla (`asistencia_vacaciones`) y pestaña propias, y «Vacaciones» **no está** en la lista de motivos —ni en la de retirados— para que el desplegable no la ofrezca por la puerta de atrás.
- 🩸 **La pestaña Vacaciones se apagó y se volvió a encender el 1-sep-2026**: lo que enredaba era el TEXTO, no la pantalla. La casilla **pregunta** («¿Ya cobró estos días antes?») y la consecuencia se ve **solo al marcarla** (`efectoDelInterruptor`); no quedó ningún mecanismo de «pestañas apagadas».
- 🔴 **El motor honra las vacaciones cargadas pase lo que pase** — dejar de leer `asistencia_vacaciones` en el cálculo convierte esos días en ausencias y come una quincena en silencio (candado: `vacaciones-el-motor-las-honra.test.ts`).
- 🔴 **Un día de vacaciones no genera horas, ni tardanza, ni ausencia.** Las marcas de ese día se muestran, pero no entran en ninguna cuenta.
- Una vacación **sin marcar no cuesta nada** — el quincenal la cubre. El interruptor **«ya se le pagó» es lo ÚNICO que mueve plata**: se valúa como una ausencia de día completo (8 h × rata), solo en días hábiles no feriados, y se dice en pantalla a quién y cuánto no se le pagó.
- El **saldo de vacaciones arranca de dos datos que escribe contabilidad** (saldo + fecha de corte, juntos o ninguno por CHECK) y **sin los dos no hay saldo, ni cero**. Se gana 30 días por cada 11 meses, el período en curso se **trunca** a día entero y solo resta lo posterior al corte. **Medios días sí, cuartos no.**
- Un sueldo **repartido en dos empresas** saca la rata del **sueldo COMPLETO**; las partes tienen que sumar el salario de la ficha o el reparto se rechaza entero (y se dice en pantalla).
- El descuento de **préstamo se propone solo pero se APRUEBA**; lo que no está aprobado se ve en ámbar, con nombre y monto.
- Panamá es **UTC−5 fijo**; los tests usan fechas fijas, nunca `new Date()`.

### Gastos, mayor y banco — [docs/postmortems/gastos-mayor-banco.md](docs/postmortems/gastos-mayor-banco.md)

- **Un solo módulo «Gastos»** (`gastos-contabilidad`) con dos pestañas: *Gastos* (Egresos Varios, **fuente ÚNICA** desde el 13-ago-2026) y *Saldos de banco*.
- 🔴 **Las 8 empresas se ven, pero sus gastos NUNCA se suman entre sí.** No existe un total de grupo en este módulo, ni al pie de una tabla, ni en un export. Hay candado que pinta la lista y exige que la suma no aparezca.
- El **mayor contable se retiró**; `mayor_lineas` y `mayor_importaciones` **no se borran** y un test pone el build rojo si una migración las dropea.
- «Cargado hasta \<mes\>» dice hasta dónde llegó la contadora. Se marca «puede estar a medio cargar» solo con **3+ meses previos** y **menos del 25% de la MEDIANA** (mediana, no promedio). El mes en curso gana sobre la estadística.
- Una empresa sin renglones dice **«Todavía no hay gastos registrados»**, nunca `$0.00`.
- `bancos_saldos` se escribe con upsert `(empresa_key, fecha_dato)` — repetir la fecha corrige ESE día y nunca pisa otro. **Cero `DELETE`.**
- ⚠️ **Vista General SÍ suma gastos entre empresas** — es otro módulo, la suma es deliberada, y si la regla también vale ahí es una decisión pendiente de Daniel.

### Crons, alertas e infraestructura — [docs/postmortems/crons-alertas.md](docs/postmortems/crons-alertas.md)

- **Una entrada de cron = una ocurrencia al día.** Para frecuencia sub-diaria se agregan entradas separadas, NUNCA una lista de horas. Biyección `vercel.json` ↔ registro de código, con candado en `cron-registro.test.ts`.
- Crons que tocan la **MISMA empresa** en Switch van **≥15 min** separados (`SEPARACION_MINIMA_MIN`): Switch admite una sola sesión por empresa.
- 🔔 **Solo 3 (+1) alertas de SISTEMA**, y la lista es cerrada: *un dato que mirás está viejo* (+24 h) · *algo se rompió y no se arregló solo* (2 fallos seguidos del mismo par `(empresa, sync_type)`) · *la base está en problemas* (>80% de memoria) · *el reloj de asistencia tiene un hueco que ya no entra solo*.
- **📊 NEGOCIO no tiene perilla de silenciar** y ninguna regla anti-ruido le aplica. Todo sale por `enviarNegocio`/`enviarSistema`; **nadie llama `sendTelegramAlert` directo**.
- 🩸 **`db-max-rows` = 1000 y corta EN SILENCIO.** Toda lectura que pueda pasarlo usa `leerTodoPaginado` con `.order()` estable y verificación contra `count: "exact"`. El orden de negocio se conserva; la columna única va como **desempate**.
- **Filtrar por año va por RANGO** (`fecha >= … AND fecha < …`), nunca `EXTRACT(YEAR …)`: no es sargable y tira `switch_facturas` entera a seq scan.
- **Guard de montos imposibles** en las 8 tablas de plata: umbral `max(piso de la familia, 20 × récord de esa empresa)`. Se **rechaza la fila** (el upsert conserva el último valor bueno), nunca se escribe un 0. Lo rechazado **se dice en pantalla**.
- Un candado de sync atascado **se suelta solo a los 30 min** (`RUNNING_STALE_MIN`, derivado del techo real de la función).
- **Los Excel de todo el sistema empiezan en la fila 1**, con filtro desde A1 y la fila de encabezados fija. Todo export sale por `workbookBytes`/`workbookBuffer`/`workbookBlob`.

### Ventas, Referencia y Comisiones — [docs/postmortems/ventas-referencia.md](docs/postmortems/ventas-referencia.md)

- `switch_facturas` es la **fuente única de ventas**. Las **notas de crédito RESTAN**; sumarlas da exactamente el doble de las devoluciones de diferencia.
- Los **tipos de comprobante viven en `src/lib/ventas/tipos-comprobante.ts`**. Un tipo que Switch estrene y nadie clasifique **avisa** (regla 2, canal SISTEMA) en vez de valer CERO en silencio.
- Referencia — los **TRES GRANDES son de la ÚLTIMA LLEGADA** (`medirTandas`). **Stock es SIEMPRE la existencia real de Switch**, nunca deducida, y el cuadre **no se fuerza**.
- Una **llegada** se corta donde la bodega quedó en la cola (`min(2, 10% de lo llegado)`). 🔴 **Nada de FIFO**: no se le atribuye una venta a una compra.
- **VENDIDO = `Vendí ÷ (Vendí + Stock)`** — amarrado al Stock por construcción, así que no puede pasar de 100% ni decir 100% con mercancía en bodega.
- El **FOB se calcula** (`CIF ÷ 1,10`, `fobEstimado()`); **no se usa el FOB de Switch**, que llega igual al CIF en el 93% de las líneas.
- El **divisor del Depurador** vale 0 ó 0.10–1.00 (`validarDivisor`): es la fracción del precio que representa el costo, no un porcentaje.
- **Las 6 empresas del grupo comisionan igual** (`comision_b2b_v5`): 0,5% sobre la **VENTA** de las facturas con `pct_utilidad > 20`. La utilidad es el **criterio de entrada**, no la base. Retenciones y `TCKCTA` quedan fuera.
- **Los descuentos se restan UNA sola vez, en el SERVIDOR** (`netearComisiones`); ninguna vista resta por su cuenta.
- ⚠️ **Multifashion es OTRO módulo de comisiones y está bien como está — NO fusionar.**

### Multifashion — [docs/postmortems/multifashion.md](docs/postmortems/multifashion.md)

- Multifashion **ES `american_classic`**: la empresa es una constante del servidor y **nunca se lee de la URL**.
- `gerente_acs` (Jennifer) ve el módulo **COMPLETO** (la ventana de fechas se levantó el 13-ago-2026) y **sigue siendo su ÚNICO módulo**: las rutas de los demás le contestan **403**. La validación de parámetros (`year`, `mes`, `periodo`, formato de fecha, «no futura») **se queda**.
- Comisiona con **otra base** que Fashion Group: `SUM(subtotal firmado) × 0,5%`, sin filtro de utilidad. Que las dos digan «0,5%» es coincidencia.
- Borde de mes = **UTC−5 fijo** (`hoyPanama` / `fechaPanamaDe`).
- Un **mes empezado se compara contra los MISMOS DÍAS** del año pasado, nunca contra el mes completo.
- La **proyección pesa por TEMPORADA**, no por días transcurridos (diciembre es el 58,8% de sep-dic). Por debajo del **5%** de temporada transcurrida **no se proyecta** y se dice.
- Las **metas** son configurables. Una meta **grupal mide TODA la venta de la tienda**; los participantes solo definen a quién se le muestra el aporte. **Nunca se reparte un objetivo automáticamente** — las metas personales se escriben a mano.
- Los nombres de vendedora se agrupan con `claveVendedora` por **igualdad exacta normalizada**, nunca por parecido ni distancia de edición.
- La **venta de hoy** sale de `retail-dia.ts`, la MISMA función que arma el Telegram de las 8pm, y **siempre viaja con su frescura**.
- Lo que Switch llama «marca» es **marca + departamento**; el mapa prefijo → marca es explícito y lo desconocido cae en **«Otros»**, nunca se descarta.

### Marketing › Mobiliario — [docs/postmortems/marketing-mobiliario.md](docs/postmortems/marketing-mobiliario.md)

- 🔴 **El inventario se descuenta en PIEZAS.** Los bultos son solo cómo viajó la mercancía y **no existe conversión fija** entre unos y otros. `piezasParaStock()` es la única función que toca el stock, y hay barrido que pone el build ROJO si `bultos` entra en esa aritmética.
- Bultos es **opcional**: `null` se muestra vacío, **nunca como `0`**.
- El **stock puede quedar negativo**, con aviso en pantalla: la entrega no se bloquea.
- **Paneles NO es obligatorio.** El único freno es que la entrega tenga **al menos un producto con cantidad**, y está cerrado también en el servidor.
- Editar y borrar **devuelven el stock por delta**; ejecutar dos veces no cuenta dos veces (`deleteEntrega` lee los renglones ANTES del DELETE).
- `mk_mobiliario_notas_proveedor` (los costos del proveedor) queda **SEPARADA del inventario. NO fusionar**: son los mismos muebles con precios distintos a propósito.
- La **nota de entrega** usa un solo generador para compartir e imprimir, y el PDF se arma **antes del clic** (iOS bloquea la hoja de compartir si hay un `await` de red en el medio).

## Guías — máquina de estados
- Estado en `guia_transporte.estado` (TEXT, **sin CHECK constraint** — valores válidos por convención de código).
- Flujo: **Pendiente Bodega** (default al crear) → **Completada** (al despachar; exige receptor, cédula, placa, ≥1 bulto y firmas; queda **bloqueada** para edición) → **Rechazada** (solo desde Completada, con `motivo_rechazo`).


## Auth
- Passwords: bcrypt hashed (migración de plaintext completada — todos los usuarios en bcrypt; el login exige bcrypt y rechaza cualquier password no-hasheada)
- Session: httpOnly cookie `cxc_session`, base64url-encoded JSON `{role, userId, userName, sessionToken}`
- Middleware: `src/middleware.ts` valida sesión contra `user_sessions` table
- **Expiración de sesión — vive SOLO en el cron (26-jul-2026).** `user_sessions` **no tiene `expires_at`** (columnas reales: id, user_name, user_role, session_token, ip_address, last_seen, created_at, revoked) y la cookie firmada tampoco lleva claim de expiración: del lado del servidor una sesión no vencía nunca. Lo único que la mataba era el `maxAge` de 7 días de la cookie en el navegador — un control del CLIENTE, que quien se quede con el valor de la cookie ignora. Medido antes del fix: 1.190 filas, 259 sin revocar para 9 usuarios (daniel 73, Angela 66), y solo 3 usadas en 24h. Ahora `/api/cron/cleanup-sessions` (02:30 UTC) revoca a los **14 días** sin `last_seen` (el doble de los 7 del `maxAge` → no desloguea a nadie que todavía pudiera estar usando la app), pone un **tope duro de 90 días** de vida por sesión aunque se la mantenga viva a pings, y **borra** las revocadas con `last_seen` > 90 días. Constantes en `src/lib/session-retention.ts`. Si se agrega un `expires_at` algún día, el middleware tiene que respetarlo — hoy no existe nada que respetar.
- Session health check: `/api/auth/check` — pinged cada 2 min, warning banner antes de expirar
- API auth: `src/lib/requireRole.ts` — admin siempre pasa, verifica rol contra array
- Rate limiting: login en Supabase (tabla `login_attempts` + RPC `register_login_failure`/`clear_login_attempts`), por IP — 5 fallos en ventana de 15 min → lockout 15 min (`src/lib/login-rate-limit.ts`, fail-open). Reemplazó el Map en-memoria (inefectivo en serverless)
- Login case-insensitive: contraseñas no distinguen mayúsculas/minúsculas (autocapitalizar iPhone)
- Input login: autoCapitalize=none, autoCorrect=off
- User indicator: nombre + rol visible en header desktop y drawer mobile
- Forgot password: link en login → "Contacta al administrador"

## Base de datos
- **Tablas grandes:** cxc_rows (~50K), switch_facturas (historia 2022+, fuente única de ventas), ventas_raw (~100K, congelada — solo la lee costo)


- **Soft delete (`deleted` boolean), por módulo:**
  - Caja: `caja_gastos` (+ `deleted_by`, `deleted_at`), `caja_periodos`
  - Préstamos: `prestamos_empleados`, `prestamos_movimientos`
  - Reclamos: `reclamos`, `reclamo_items`, `reclamo_settlements`
  - Cheques: `cheques`
  - Guías: `guia_transporte`, `guia_items`
  - Directorio: `directorio_clientes`, `clientes_master`
  - Nota: `packing_lists` usa `deleted_at` (timestamp), NO la columna `deleted` — patrón distinto.
- **Vistas / Materialized views:** Convención de nombres: sufijo `_mv` = materialized view, `_vw` = view. (No verificado contra catálogo pg — vía REST no se distingue MV de view; confirmar con acceso a catálogo si se necesita certeza.)
  - `ventas_rollup_mensual_mv` (única `_mv`), `clientes_agregado_12m_vw`, `clientes_empresa_12m_vw`, `reebok_pedidos_unificado_vw`, `switch_costo_unificado_vw`, `switch_ventas_unificado_vw`, `_multifashion_sf_vw`
- **Flags de negocio:**
  - `is_wholesale`: en `ventas_raw`, `switch_facturas` y `_multifashion_sf_vw` (segrega retail/wholesale en Multifashion)
  - `is_preorder`: en `reebok_order_items` (preventa Reebok)
- **Tablas UX audit (abril 2026):**
  - `cxc_favorites` — favoritos ⭐ por usuario (antes localStorage)
  - `reclamo_custom_motivos` — motivos personalizados de reclamos (antes localStorage)
  - `reebok_orders.client_email` — email del cliente capturado al crear pedido

## Switch Soft (ERP externo)
- CSVs semicolon-delimited (`;`)
- Encoding: **latin-1** para inventario Reebok, **UTF-8** para CXC y Ventas
- Upload: 100% manual (drag-drop), no hay API/SFTP
- Auto-detect delimiter en CXC upload (`;` o `,`)
- Upload de ventas muestra resumen de filas excluidas con razón

## Email (Resend)
- `noreply@fashiongr.com` — cheques reminders
- `notificaciones@fashiongr.com` — alertas, reports, guias, reebok
- `info@fashiongr.com` — reclamos a proveedores
- `pedidos@fashiongr.com` — guias notify

## Crons (vercel.json)
79 entradas configuradas (+2 el 24-ago-2026: `sync-factura-lineas` (#577) y `sync-ingresos-mercancia` (#586), que entraron a `vercel.json` y nunca a esta tabla; +8 el 13-ago-2026 al pasar los 4 catálogos de 2 a 4 pasadas diarias, todas dentro de la ventana de uso de Panamá — ver la nota abajo; 66 hasta ese mismo día, cuando se retiró `sync-mayor`; 53 hasta el 26-jul-2026 cuando se retiró `multifashion-sync`, +11 del vigía `db-salud` el 27-jul, −6 al bajar `db-salud` a 5, +3 al pasar `asistencia-vigia` de 1 pasada L-V a 4 diarias el 10-ago, −1 al quitarle la pasada de las 13:45 UTC ese mismo día — ver abajo). **Una entrada = una ocurrencia al día**: para frecuencia sub-diaria se agregan entradas separadas del mismo path, NUNCA una lista de horas (`0 15,19,23 * * *`), que Vercel Pro sí acepta — ver la nota de slots más abajo. Límite Vercel Pro: 100 cron jobs/proyecto.

| Cron | Schedule (UTC) |
|------|----------------|
| /api/cron/db-salud | **01:45, 07:25, 12:25, 16:45, 21:45** (5 entradas — vigía de recursos. ⚠️ Esta fila decía 11 horarios hasta el 31-ago-2026: bajaron a 5 el 30-jul con la poda de alertas y la tabla no se actualizó. Hueco máximo 5 h 40) |
| /api/cron/cleanup-sessions | 02:30 (revoca sesiones inactivas — ver nota abajo) |
| /api/cron/cleanup-packing-lists | 03:00 |
| /api/cron/sync-articulo-info (3 grupos de 2 empresas FG) | 04:30 (vistana, active_wear), 04:40 (fashion_shoes, fashion_wear), 04:50 (active_shoes, joystep) — catálogo del tab Ventas › Referencia (existencia, precio de etiqueta, nombre real, CIF). 3 entradas y NO una de 6: vistana sola midió **155 s / 8.122 artículos** (10-ago-2026) y 6 así desbordan los 800 s (el caso Boston). La franja 00:30-05:15 es la única sin sesiones de Switch de estas 6; cada grupo queda a 60/55/50 min de SU par del bloque `all`. Boston y ACS EXCLUIDOS (decisión de Daniel, la misma del tab). El botón "Actualizar datos de Switch" del tab SE QUEDA para el dato del momento. Candado: `cron-sync-articulo-info.test.ts` |
| /api/cron/switch-sync tipo=all (vistana, active_wear) | 05:30 |
| /api/cron/switch-sync tipo=all (fashion_shoes, fashion_wear) | 05:35 |
| /api/cron/switch-sync tipo=all (active_shoes, joystep) | 05:40 |
| /api/cron/backup | 06:00, 10:30, 18:30 (3 entradas — las 2ª/3ª son "segunda oportunidad": no-op si una anterior ya registró success hoy) |
| /api/cron/backup?grupo=switch | 06:45, 11:15, **23:30** (3 entradas, mismo guard no-op) |
| /api/cron/backup?grupo=storage | 04:00, 15:30 (2 entradas — réplica off-site de los buckets de Storage a Cloudflare R2) |
| /api/cron/switch-sync tipo=all (american_classic, confecciones_boston) | 06:30 |
| /api/cron/sync-utilidad | 07:00 |
| /api/cron/sync-clientes-master | 07:00 |
| /api/cron/refresh-clientes-views | 07:35 (fuera del minuto 06:30 de switch-sync AC/Boston y de la ráfaga 07:00-07:31 — solo DB, sin Switch) |
| /api/cron/sync-recibos (pagos) | 07:50, 15:15, 19:15, 23:15 (4 entradas — corridas REALES, no "segunda oportunidad": el route no tiene guard no-op y re-lee la ventana rodante de 3 meses cada vez, pero desde el 26-jul-2026 solo ESCRIBE lo que cambió — ver "escritura selectiva" en Base de datos. Las 3 de la tarde van 15 min DESPUÉS de las ventas porque comparten 6 empresas) |
| /api/cron/switch-articulos | 08:40 |
| /api/cron/acs-fidelizacion | 11:30, 16:30 (2 entradas — la 2ª es "segunda oportunidad": no-op si la 1ª ya registró success hoy; 11:30 esquiva sync-recibos 07:50 y switch-articulos 08:40 en american_classic) |
| /api/cron/tommy-catalogo | **14:30, 17:00, 19:40, 21:55** (4 entradas — solo toca fashion_shoes; artículos marcaId=3; mientras la DDL 20260724150000 no corra se omite limpio sin tocar Switch) |
| /api/cron/calvin-catalogo | **14:35, 17:05, 19:45, 22:00** (4 entradas — solo toca vistana; artículos marcaId=8 = CK FOOTWEAR; mientras la DDL 20260812150000 no corra se omite limpio sin tocar Switch) |
| /api/cron/reebok-catalogo | **14:40, 17:10, 19:50, 22:05** (4 entradas — solo toca active_shoes en Switch) |
| /api/cron/sync-proveedores | 09:30 |
| /api/cron/joybees-catalogo | **14:45, 17:15, 19:55, 22:10** (4 entradas — solo toca joystep en Switch) |
| /api/cron/integrity-check | 12:00 |
| /api/cron/cheques-alert | **14:15** (9:15 a.m. Panamá — aviso de cheques por vencer, ver nota abajo) |
| /api/cron/switch-reconciliacion | 10:00, 14:00, 18:00 (3 entradas) |
| /api/cron/switch-sync tipo=facturas — **ventas** | 11:50, 13:00, 15:00, 17:00, 19:00, 21:00, 23:00, 00:15 (8 entradas). **13/17/21 y 00:15 = solo american_classic** (ventas ACS cada 2h; 00:15 = sync de cierre, tras cerrar tienda 7pm Panamá — de él depende el resumen de la 01:00). **11:50/15/19/23 = las 8 empresas con facturas** (ACS + las 7 B2B): 06:50, 10:00, 14:00 y 18:00 Panamá |
| /api/cron/acs-resumen-diario | 01:00 (resumen diario ventas ACS a Telegram; 20:00 Panamá = 8pm, tras el sync de cierre de 00:15) |
| /api/cron/grupo-resumen-mensual | 13:00 el día 3 de cada mes (`0 13 3 * *` — resumen mensual del grupo a Telegram; único cron NO diario, umbral propio en health-crons) |
| /api/cron/switch-sync tipo=estadocuenta (3 pares B2B) | 16:00/16:05/16:10 y 21:10/21:15/21:20 (6 entradas — CXC intradía; ronda 1 con active_shoes,joystep PRIMERO, que hoy le da 70 min a reebok-catalogo 17:10) |
| /api/cron/asistencia-vigia | 15:00, 20:00, 22:15 (3 entradas, TODOS los días = 10:00 a.m. / 3:00 p.m. / 5:15 p.m. Panamá — el reloj de asistencia lleva +6h sin reportar; ver nota abajo) |
| /api/cron/sync-factura-lineas | 03:30 (renglón por renglón de cada factura; alimenta «qué le vendí a este cliente») |
| /api/cron/boston-cartera | **08:10** — la cartera de Confecciones Boston, que NO baja por el estadocuenta del API (su universo son 4.912 clientes y no cabe en la función). Va por el reporte web `reportesmanager` con uuid. **Es lo que la regla 1 de alertas vigila desde el 24-ago-2026** |
| /api/cron/sync-ingresos-mercancia | 09:05 (las llegadas de mercancía; alimentan «Compré» y la última llegada de Ventas › Referencia) |
| /api/cron/sync-egresos-varios | 10:35 (la ÚNICA fuente de gasto desde que se retiró el mayor contable — ver `docs/historico/superado.md`) |
| /api/cron/catalogos-fotos-resumen | **13:30 los LUNES** (`30 13 * * 1`) — el resumen semanal de fotos que faltan. ⚠️ Único cron semanal; el otro no-diario es `grupo-resumen-mensual` |
| /api/cron/guias-pendientes | 14:30 (aviso de guías que quedaron sin despachar) |

⚠️ **Las 6 filas de arriba corrían en producción SIN estar en esta tabla** hasta el 31-ago-2026 — incluida `boston-cartera`, que es de la que depende que la cartera de Boston no se congele. Se agregaron en la auditoría de estado; el candado que ya existía (`cron-registro.test.ts`, la biyección `vercel.json` ↔ registro de código) protege el CÓDIGO, no esta tabla.


## Alertas a Telegram — DOS canales (27-jul-2026)

Daniel divide los mensajes en dos, textual: **"tengo dividido los mensajes en info de la empresa y alertas cuando el sistema no funciona"**. No son un flujo con más o menos ruido: son dos cosas con reglas **opuestas**. Punto único: `src/lib/alertas/canal.ts` (`enviarNegocio` / `enviarSistema`). **Nadie llama `sendTelegramAlert` directo.**

- **📊 NEGOCIO** — ventas del día, pedidos, guías, cheques por vencer, fotos faltantes, costo sospechoso. Textual: *"NO, ES SUPER IMPORTANTE ESAS. NECESITO SABER QUE PASA EN LA EMPRESA Y ESO AYUDA BASTANTE"*. **NINGUNA regla anti-ruido aplica acá** — ni frecuencia, ni agrupación, ni "esto funciona bien, no avisar". `enviarNegocio` no acepta perilla de silenciar: que no exista es la garantía. Los textos NO se tocaron.
- **🔧 SISTEMA** — prefijo `🔧 SISTEMA · ` al principio (se lee en la notificación del iPhone sin abrirla). Regla de tres: **(1)** es real, **(2)** no se arregla solo —si la reconciliación, una 2ª oportunidad o el propio cron lo recupera en horas, NO se avisa—, **(3)** alguien tiene que hacer algo. Y el texto dice **qué pasó / qué significa para el negocio / qué hacer**. Sin nombres de tabla, códigos HTTP ni HTML del proveedor.


## PWA (iOS)
- `viewport-fit: cover` + `env(safe-area-inset-top/bottom)` para notch/Dynamic Island
- `apple-mobile-web-app-status-bar-style: black`
- Standalone mode, start_url: `/home`
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
- **Module colors:** CXC=blue, Guías=emerald, Cheques=amber, Reclamos=orange, Caja=violet, Directorio=cyan, Préstamos=rose, Ventas=indigo, Reebok=red (2px accent en header)
- **Animations:** AccordionContent (CSS grid 250ms), page transitions (slide-right/left/crossfade 180ms), KPI count-up, deposit flash, saldo shake, new row highlight

## UX Principles
- Usuarios: secretarias, bodegueros, vendedores en Panamá. NO tech-savvy.
- Labels en español simple. Cero jerga (CXC → "Cuentas por Cobrar")
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

## Keyboard Shortcuts (Desktop)
- `/` o `⌘K` — buscar
- `?` — mostrar ayuda de atajos
- `G+H` — ir a inicio, `G+C` — CXC, `G+G` — guías, `G+Q` — cheques, `G+R` — reclamos
- `J/K` — navegar filas, `Enter/Space` — expandir, `E` — editar, `Escape` — cerrar
- Right-click en filas de CXC y Cheques → context menu con acciones

## Smart Features
- **Búsqueda global:** 8 módulos (CXC, Reclamos, Guías, Directorio, Cheques, Ventas, Préstamos, Caja)
- **Spotlight:** "cheques que vencen mañana" → ⚡ quick action con deep link
- **Búsquedas recientes:** últimas 5 + "Ir a..." shortcuts de módulos
- **Smart defaults:** recuerda última categoría, empresa, banco, transportista (localStorage `fg_last_*`)
- **Smart suggestions:** 💡 proactivas inline (contactar cliente $10K+, depositar vencidos, escalar reclamo +45d, cerrar período +30d)
- **Dashboard feed:** "Acciones pendientes" con 8 fuentes de datos ordenadas por urgencia
- **Daily summary:** resumen matutino 1x/día con bullets accionables
- **Draft auto-save:** formularios de reclamos, guías, cheques se guardan cada 5s en localStorage
- **Time grouping:** cheques y guías agrupados por "Hoy/Esta semana/Vencidos"- **Contextual color:** tinte rojo/ámbar ambient cuando hay datos urgentes
- **Inline previews:** último contacto, días para depósito, próxima deducción visibles sin expandir
- **Hover preview:** cards ricas en CXC al hover 500ms sobre nombre de cliente
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
- **AppHeader** — sticky header con module color accent, user info, search, notifications, shortcuts
- **SearchBar** — ⌘K + mobile full-screen + recientes + spotlight NLP
- **MobileBottomBar** — ELIMINADO (abril 2026). Navegación es solo por módulos del home + drawer del header
- **NotificationCenter** — 🔔 bell con historial de toasts
- **SessionWarning** — banner/modal antes de expirar sesión
- **OfflineBanner** — amber offline, green reconexión
- **KeyboardShortcutsProvider** — global shortcuts + table navigation
- **ContextMenuWrapper** — right-click menus en desktop
- **UndoToast** — countdown bar 5s con "Deshacer"
- **SuggestionCard** — 💡 sugerencias proactivas inline
- **TimeGroupHeader** — headers colapsables por período de tiempo- **OverflowMenu** — "···" dropdown para acciones secundarias
- **ScrollableTable** — gradient indicators para scroll horizontal
- **SwipeableRow** — swipe-to-action en mobile
- **PullToRefresh** — pull down para refrescar en mobile
- **BottomSheet** — half/full screen draggable (mobile)
- **AccordionContent** — CSS grid expand/collapse animado
- **AnimatedNumber** — count-up con easing
## Hooks (src/lib/hooks/)
- **useAuth** — check role, user info
- **useBadges** — notification badge counts
- **useSessionCheck** — ping /api/auth/check cada 2 min
- **useKeyboardShortcuts** — global + table shortcuts
- **useUrlState** — sync state ↔ URL params
- **useLastUsed** — remember last form values
- **useDraftAutoSave** — auto-save formularios cada 5s
- **usePersistedState** — sessionStorage-backed state
- **useUndoAction** — delayed execution con 5s undo window
- **useSmartSuggestions** — proactive inline suggestions
- **useOnlineStatus** — offline/online detection
- **useTableShortcuts** — J/K row navigation context

## Testing
```bash
npm test          # Vitest — 20 tests, run before pushing
npx next build    # Build check — must pass before push
```

## Deploy
```bash
git push origin main   # Auto-deploy via Vercel
```


## Regla de Calidad
- Todo código debe funcionar a la primera. No pushear sin verificar el flujo completo end-to-end.
- Verificar: datos fluyen escritura → DB → lectura → UI
- Auth en serverless: usar tokens HMAC firmados, NO Maps en memoria
- No hacer fire-and-forget (.then().catch()) para operaciones críticas — siempre await
- useState en useEffect como dependencia puede causar re-renders destructivos — usar useRef para estado interno
- Verificar compatibilidad de formatos antes de integrar (PNG/JPEG en jsPDF, DER/P1363 en WebAuthn)
- Si no puedo probar en browser, simular el flujo con script
