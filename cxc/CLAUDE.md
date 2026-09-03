# Fashion Group — fashiongr.com

> 🔴 **Estado del proyecto y pendientes vivos: [docs/estado-actual.md](docs/estado-actual.md) — léelo al empezar cualquier sesión.**

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
- 🔴 **SU PLATA SUMA; SUS CLIENTES NO SE VEN.** Daniel, textual (2-sep-2026): *«solo se queda CXC de Boston en su tab, sin que toque ni se mezcle con los otros. **Déjalo en Vista General**»* y *«Boston también quiero verlos en ventas-resumen»*. Es la línea fina de todo: **la VENTA de Boston sigue sumando** en Ventas › Resumen y Vista General ($463.898,47 = 7,4% de 2026). Lo que sale de las superficies del grupo son sus **CLIENTES**, nunca su venta. Hay candado en las dos direcciones.
- 🩸 **Boston tampoco entra a `clientes_master`** (2-sep-2026). Estuvo adentro cinco semanas —4.910 filas del 28-jul— y el ranking de Ventas publicó **$2,55 millones de venta que no existió** por unir clientes por NOMBRE. Se marcaron 4.914 filas como borradas; quedan **150**. Ver el bloque de Ventas.
- La **ficha por dirección también se cierra**: `/api/clientes/[codigo]` (GET, PATCH e historial) pregunta `esCodigoDelGrupo()` y contesta **404**, el mismo que un código inexistente — un 403 sería un oráculo de qué clientes tiene Boston.
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
- **La clasificación de Reebok la manda Switch** (`src/lib/reebok-clasificacion.ts`): la **MARCA** manda la categoría (FOOTWEAR/APPAREL/HARDWARE, 3 valores estables) y el **SUBRUBRO** el género; el `rubro` es el plan B de una marca vacía. `UNISEX` → **Hombre**, y solo ahí el nombre desempata (`WOMEN` o una `W` sola → Mujer). Lo que el mapa no conoce cae en el cajón neutro (`otros`/`sin_clasificar`) y **nunca pisa** una clasificación que ya existía — de la categoría sale el bulto, y el bulto es plata.
- 🩸 **«Todavía no llegó» NO es «llegó algo que no entiendo».** El 2-sep-2026 salió un 🔧 SISTEMA por *233 productos* con `rubro`/`subrubro` «(vacío)» que **no tenían nada malo**: la migración acababa de crear las columnas y el cron de fichas no había corrido. De la regla 2 fallaba las TRES. La distinción vive en **`fichaLlego` y en UN solo lugar** —el módulo puro, no el `select`—: sin `ficha_at` no se avisa **ni se clasifica**; con `ficha_at`, un valor desconocido **o un campo vacío** sí avisan. Candados: `reebok-clasificacion.test.ts` + `catalogo-reebok-clasifica.test.ts` (conducta, contra el Telegram).
- La lista de valores esperados del **Depurador** (`REEBOK_CATEGORY_ESPERADAS`) es **ESPEJO** del mapa del catálogo y hay candado que compara las dos: agregar en una sin la otra pone el build rojo. `HEADWEAR` (gorras → accesorios) entró el 2-sep-2026 por ahí — por la marca `HARDWARE` ya resolvía bien, pero sin él el Depurador gritaba «valor inesperado» sobre un dato bueno.

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
- 🩸 **Un renglón que Switch manda y no se puede leer NO desaparece** (1-sep-2026): queda en `switch_sync_log.skip_details`, **se dice en pantalla** y avisa por 🔧 SISTEMA con anti-loop de 7 días. La clave del anti-loop es el **N. INTERNO del documento, no el número de línea** — con líneas, arreglar un renglón corre todos los de abajo y la alerta suena para siempre. Mismo patrón, estación por estación, que el guard de montos imposibles: las dos clases de descarte caen en la misma pantalla el mismo día.
- 🩸 **La celda de cuenta contable se lee por el PRINCIPIO, no entera.** Switch reescribió su motor de reportes y desde el 1-sep-2026 manda `6.03.98.00.00 - GASTO DE TARJETA DE CREDITO` donde antes mandaba el código pelado; el ancla `$` del validador tiró los 378 renglones de cada empresa y el módulo se quedó sin datos 2 días. `codigoDeCuenta()` acepta el código seguido de **cualquier cosa** (no se calibró a un separador: el archivo crudo nunca se pudo ver) y `CUENTA_RE` conserva su `$` intacto para el VALOR. Seis tramos siguen siendo error: recortarlos cambiaría de cuenta en silencio y `esGasto` decide con el primer tramo. **El nombre no se toma de ahí** — el autoritativo es `cuentas_contables.nombre_switch`. Es la segunda ola del mismo cambio de Switch; la primera rompió la cartera de Boston el 19-ago.
- ⚠️ **Vista General SÍ suma gastos entre empresas** — es otro módulo, la suma es deliberada, y si la regla también vale ahí es una decisión pendiente de Daniel.

### Crons, alertas e infraestructura — [docs/postmortems/crons-alertas.md](docs/postmortems/crons-alertas.md)

- **Una entrada de cron = una ocurrencia al día.** Para frecuencia sub-diaria se agregan entradas separadas, NUNCA una lista de horas. Biyección `vercel.json` ↔ registro de código, con candado en `cron-registro.test.ts`.
- Crons que tocan la **MISMA empresa** en Switch van **≥15 min** separados (`SEPARACION_MINIMA_MIN`): Switch admite una sola sesión por empresa.
- 🔔 **Solo 3 (+1) alertas de SISTEMA**, y la lista es cerrada: *un dato que mirás está viejo* (+24 h) · *algo se rompió y no se arregló solo* (2 fallos seguidos del mismo par `(empresa, sync_type)`) · *la base está en problemas* (>80% de memoria) · *el reloj de asistencia tiene un hueco que ya no entra solo*.
- 🩸 **El silencio no cuenta como que está bien** (2-sep-2026). Dos avisos hermanos en `src/lib/alertas/silencio-de-datos.ts`, colgados de la **reconciliación** (10/14/18 UTC, **cero crons nuevos**): **A** = un sync trajo CERO con `status = success` donde ese par siempre trae cientos; **B** = una tabla de negocio dejó de recibir **escrituras**. **No estrenan una cuarta regla**: A es la regla 2 mirando el resultado en vez del `status`, y B es la regla 1 sobre datos que `datos-frescos.ts` no cubre.
- 🔴 **A y B solo opinan sobre syncs que reescriben un UNIVERSO COMPLETO** (`SYNCS_DE_UNIVERSO_COMPLETO`, `TABLAS_VIGILADAS`). En un sync de escritura **selectiva** o de **mes en curso**, el cero es un dato del NEGOCIO, no una avería: medido, `recibos` y `utilidad` traen 0 cada primero de mes, `joystep|utilidad` estuvo 8 días en 0 por no vender, y `switch_recibos` de `active_wear` lleva 144 h sin escribir estando sana. Con el filtro puesto, el backtest de 96 días da **0 falsos positivos**; sin él, 14.
- 🔴 **Tres candados estadísticos por PAR** antes de opinar: ≥ **10** corridas exitosas previas (lo que la poda de `switch_sync_log` garantiza conservar), **mediana** ≥ 10 (mediana, no promedio) y **ni un cero** en esa historia. Un par sin historia —o que nunca tuvo datos— **no se vigila**. Ante la duda, callar.
- 🔴 **B mira CUÁNDO SE ESCRIBIÓ, nunca la fecha del dato**: el reporte de egresos llega con más de un mes de atraso porque así lo carga la contadora. Y mira la tabla del DATO, no la del mecanismo (`egresos_varios`, no `egresos_importaciones`, que se escribe aunque el reporte venga vacío). Umbral **40 h** = deja pasar un día perdido (se arregla solo) y no deja pasar dos.
- 🔴 **Un mensaje por MÓDULO**, con anti-loop de **7 días** por módulo (el del guard de montos). Es lo que impide que A y B manden dos mensajes por el mismo hecho, y que un sync roto en cinco empresas mande cinco. Candado: `silencio-de-datos.test.ts` (34 casos, 18 mutaciones cazadas).
- **📊 NEGOCIO no tiene perilla de silenciar** y ninguna regla anti-ruido le aplica. Todo sale por `enviarNegocio`/`enviarNegocioPrivado`/`enviarSistema`; **nadie llama `sendTelegramAlert` directo** (barrido global en `acs-resumen-canal-privado.test.ts`).
- 🔴 **El resumen diario de ventas de ACS va al chat PRIVADO, sin el prefijo de sistema** (2-sep-2026, por privacidad: 📊 NEGOCIO es un grupo de tres donde está el celular de la empresa). Sale por `enviarNegocioPrivado` —destino de sistema, trato de negocio— desde **DOS lugares que no pueden separarse**: el cron de la 01:00 y la recuperación de `switch-reconciliacion`. Candado: `acs-resumen-canal-privado.test.ts`.
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
- **Las 6 empresas del grupo comisionan igual** (`comision_b2b_v6`, vía `lib/comisiones/rpc` con red a la v5 mientras su DDL no corra): 0,5% sobre la **VENTA** de las facturas con `pct_utilidad > 20`. La utilidad es el **criterio de entrada**, no la base. Retenciones y `TCKCTA` quedan fuera.
- 🔴 **Tres vendedores, tres papeles (3-sep-2026).** «Vendedor» de la factura (`switch_facturas.vendedor_nombre`) → comisión de **VENTA**. «Vendedor Recibo» = quien REGISTRÓ el pago (`switch_recibos.vendedor_registro`) → comisión de **COBRO**. «Vendedor de cartera» (dueño del cliente, `vendedor_cartera`) → **no alimenta ninguna comisión**. Daniel: *«el que vende a veces no es el que cobra. Edwin puede vender 50k a City Mall y Daniel o DEFAULT cobrar esa plata»*. Migración `20260911120000` (**pendiente de aplicar**); la v5 (cobro por cartera) se conserva para comparar. Medido ene–ago 2026: grupo +1.253,58 · Reinaldo +2.507,14 · Daniel +1.943,86 · Edwin −2.640,50.
- 🔴 **DEFAULT y DANIEL LEVY se calculan y se muestran, pero NO se pagan** (`VENDEDORES_SIN_PAGO`, `lib/comisiones/sin-pago.ts` — un solo lugar). Daniel: *«si yo cobro no le pago a nadie porque no me autopago»*. La fila queda gris con «no se paga», el pie dice «Total a pagar» y suma solo lo pagable; la fila `DEFAULT` se rotula **«Oficina (DEFAULT)»**, ya no «Sin asignar». Candados: `comision-cobro-quien-registro.test.ts` · `comisiones-no-se-paga.test.tsx`; **17 mutaciones, 17 cazadas** (`scripts/_mutar-candados-comision-cobro-v6.sh`); medición `scripts/_medir-comision-cobro-v6.mjs`.
- **Los descuentos se restan UNA sola vez, en el SERVIDOR** (`netearComisiones`); ninguna vista resta por su cuenta.
- ⚠️ **Multifashion es OTRO módulo de comisiones y está bien como está — NO fusionar.**
- 🔴 **`clientes_master` es el directorio del GRUPO y SOLO del grupo.** El sync pide por **INCLUSIÓN** (`.in("empresa_key", EMPRESAS_DEL_GRUPO)`), nunca excluyendo a las que sobran: la tabla **no tiene `empresa_key`** —una fila por CÓDIGO— así que adentro un cliente de Boston es indistinguible de uno del grupo.
- 🔴 **LA IDENTIDAD DEL CLIENTE ES EL CÓDIGO.** Daniel: *«se debería de usar el código del cliente, ya que todos los D-24 por ejemplo son de City Mall across mis 6 empresas»* — medido: **138 de los 147** códigos del grupo aparecen en las 6 empresas con el MISMO nombre. El camino es `switch_facturas (empresa_key, cliente_switch_id)` → `switch_clientes` → `codigo` → `clientes_master.codigo`. Ese par es **único por construcción**: no puede multiplicar una factura.
- 🔴 **Nadie une `clientes_master` por `nombre_normalized`, y NO hay fallback por nombre.** Un LEFT JOIN por nombre contra una tabla con homónimos **multiplica la factura** y el SUM la cuenta dos veces. Un fallback sería un camino muerto: medido, las 370 facturas (4,52%) que no cruzan el puente traen un `cliente_switch_id` **viejo**, valen $3.817,74 (0,07%) y caen a «Otros clientes» con fallback y sin él. Lo que se prohíbe es el JOIN, **no** los nombres repetidos —dos clientes pueden llamarse igual y eso no es un error—.
- ⚠️ **`TCKCTA` es el único código que miente** (`CONTADO` / `VENTAS` / `VENTAS LOCA` según la empresa) y no es un cliente: es el mostrador. No junta seis mostradores en una fila porque **el grano de los rankings es (cliente, EMPRESA)**; se reconoce por CÓDIGO (`esMostrador`), nunca por nombre.
- **Ventas › Clientes ofrece LAS SEIS** (`EMPRESA_PILLS` derivada de `B2B_EMPRESA_KEYS`), nunca una lista escrita a mano. Boston y Multifashion no están: sus clientes viven en su propio módulo.
- 🔴 **«vs 2025» compara contra los MISMOS DÍAS del año pasado** — la misma regla de Multifashion y del resumen de ACS, aplicada al año: el año anterior se corta en la misma fecha que el último día cargado del año en curso (nunca después de HOY en Panamá), y el 29-feb cae en el 28. Cortar por MES (`mes <= max_mes`) comparaba ocho meses contra nueve y a D-108 lo mostraba +3% cuando crecía +36% (3-sep-2026; 37 clientes cambiaban de número y 6 de signo). «Compras <año>» no se recorta. Migración `20260909120000` (**pendiente de aplicar**), espejo `clientes-corte-comparativo.ts`.
- 🔴 **La regla de los mismos días aplica a TODAS las comparaciones «vs año pasado», no solo a Clientes** (3-sep-2026). **Definición única en `src/lib/ventas/clientes-corte-comparativo.ts`** (`corteVsAnioAnterior` · `ventanaUnAnioAntes` · `unAnioAntes`): corte = último día CARGADO del período en curso, nunca después de HOY en Panamá; un año antes, 29-feb → 28-feb; un período cerrado va entero contra entero. Una auditoría medida contra producción encontró **seis lugares** sin la regla, cada uno con su error: **Resumen › Anual** comparaba 2026 hasta hoy contra ene–sep ENTERO de 2025 (el grupo decía −7,0% y crecía **+2,5%**; 5 de 8 empresas cambiaban de signo) · **Resumen › Mes×año** y **Vista General › Ventas** comparaban lo que va del mes contra el mes entero (Boston −93,5% en pantalla, **+2,2%** real) · **Productos** (Ventas y Multifashion) cortaba en HOY cuando `switch_articulo_diario` llega hasta AYER (Multifashion sep +4,2% → **+46,1%**; `ultimoDiaArticuloDiario` trae el MAX(fecha) y es parámetro OBLIGATORIO de `productosRangoComparativo` / `rangoComparativo`) · **Multifashion › Vendedoras** decía «vs año pasado» y compara contra el MES ANTERIOR — por decisión de Daniel se arregló el RÓTULO («Δ vs julio 2026», `vendedoras-rotulo.ts`), no la comparación · la RPC `ventas_dashboard_prev_same_period` cortaba en **UTC** (Fashion Wear la noche del 12-may: +1,3% → **+45,1%**; 30 noches así en 2026) → `_v3` corta con `multifashion_hoy_panama()` / `mf_panama_date`, migración `20260910120000` (**pendiente de aplicar**; el código cae a `_v2` mientras tanto). Las tres pantallas del Resumen comparten UNA lectura (`prev-same-period.ts`). Candados: `mismos-dias-todas-las-comparaciones.test.ts` · `multifashion-productos-corte-cargado.test.ts` · `resumen-mes-anio-mes-en-curso.test.tsx` · `multifashion-vendedoras-rotulo.test.ts`; **26 mutaciones, 26 cazadas** (`scripts/_mutar-mismos-dias-6-lugares.sh`); medición: `scripts/_diag-mismos-dias-6-lugares.ts` (antes/después a mano) y `_verif-mismos-dias-6-lugares.ts` (con el código real).
- Candados: `clientes-master-solo-del-grupo.test.ts` · `ventas-clientes-las-seis-empresas.test.ts` · `clientes-vs-anio-anterior-mismos-dias.test.ts`.

### Multifashion — [docs/postmortems/multifashion.md](docs/postmortems/multifashion.md)

- Multifashion **ES `american_classic`**: la empresa es una constante del servidor y **nunca se lee de la URL**.
- `gerente_acs` (Jennifer) ve el módulo **COMPLETO** (la ventana de fechas se levantó el 13-ago-2026) y **sigue siendo su ÚNICO módulo**: las rutas de los demás le contestan **403**. La validación de parámetros (`year`, `mes`, `periodo`, formato de fecha, «no futura») **se queda**.
- Comisiona con **otra base** que Fashion Group: `SUM(subtotal firmado) × 0,5%`, sin filtro de utilidad. Que las dos digan «0,5%» es coincidencia.
- Borde de mes = **UTC−5 fijo** (`hoyPanama` / `fechaPanamaDe`).
- Un **mes empezado se compara contra los MISMOS DÍAS** del año pasado, nunca contra el mes completo — y «los mismos días» son los **CARGADOS** en `switch_articulo_diario` (llega hasta ayer), no «hasta hoy» (3-sep-2026; definición única en `clientes-corte-comparativo.ts`). **Vendedoras es la excepción a propósito**: en los chips de mes compara contra el **mes anterior** y el rótulo lo dice («Δ vs julio 2026»).
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
- **Tablas grandes** (medidas 2-sep-2026): `switch_articulo_diario` 203.536 · `switch_factura_lineas` 163.559 · `switch_facturas` 54.296 (historia oct-2022+, fuente única de ventas) · `ventas_raw` 48.378 (congelada, **sin lectores en la app**) · `switch_recibos` 46.556 · `switch_ingresos_mercancia` 35.475 · `switch_articulo_info` 16.619 · `cxc_rows` 1.097 (legacy, sin lectores). Detalle por pregunta en **Dónde vive cada dato**.


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

## Dónde vive cada dato

Mapa por **pregunta**, no por tabla: *«necesito saber X de Y — ¿dónde está?»*.
Filas medidas contra producción el **2-sep-2026** (PostgREST, `count=exact`). Las ⚠️ son la mitad del valor: dicen para qué **NO** sirve cada tabla.

> ⚠️ Transversal: **`db-max-rows` = 1000 y corta EN SILENCIO.** Cualquier lectura de una tabla marcada 🔢 (más de 1.000 filas) que no use `leerTodoPaginado` devuelve 1.000 filas y parece completa. Ver [Crons, alertas e infraestructura](docs/postmortems/crons-alertas.md).
> ⚠️ Transversal: las 8 empresas se nombran con `empresa_key`… **menos las vistas de aging, que usan `company_key`**. Y `switch_estadocuenta_aging_boston` además renombra el id del cliente a `cliente_switch_id`.

### Artículos y catálogo

| Pregunta | Dónde | Grano · filas | ⚠️ |
|---|---|---|---|
| Qué **ES** un artículo de Switch: código, descripción, existencia, precio de etiqueta, costo | `switch_articulo_info` | 1 fila por (empresa, código) · **16.619**, de las cuales **5.040 con existencia > 0** 🔢 | Solo las **6 del grupo** (vistana 8.254 · fashion_wear 5.097 · active_shoes 1.763 · fashion_shoes 706 · active_wear 592 · joystep 207). **Boston y American Classic = 0 filas, a propósito.** 🩸 `rubro`/`subrubro`/`marca` + `ficha_at` los devuelve `/apiarticulos/info`, de a UNO por código de barra, y **ya están en la tabla** (migración `20260906120000_clasificacion_catalogo.sql`, **aplicada el 2-sep-2026**; solo se piden para `active_shoes`, 400 por corrida). **Al 2-sep-2026: 400 de 1.763 fichas traídas — y las 217 CON EXISTENCIA están las 217.** Las 1.363 que faltan tienen existencia < 1 y drenan solas en ~4 corridas. 🔴 **`ficha_at` es lo ÚNICO que distingue «todavía no pregunté» de «pregunté y Switch no dijo nada»**: la FILA la crea el barrido de precios mucho antes, con los tres campos en NULL, y confundir las dos cosas es la falsa alarma de las 233 (ver el postmortem de catálogos). (columnas reales: `empresa_key, articulo_id, codigo, descripcion, existencia, precio_etiqueta, costo_api, rubro, subrubro, marca, ficha_at, synced_at, updated_at`). `costo_api` es **CIF**, no FOB. |
| De qué **género y categoría** es un producto del catálogo público | `products` (Reebok) · `tommy_products` · `calvin_products` · `joybees_products` — columnas `gender` y `category` | 1 fila por SKU · 391 · 546 · 81 · 83 | 🩸 **Aquí estaba el dato, y está lleno al 100% (cero nulos en las 4 marcas).** No hay que deducirlo del nombre ni buscarlo en las facturas. ⚠️ **El vocabulario NO es común entre marcas**: Reebok `male/female/women/unisex/kids` (mezcla `male` con `women`), Tommy `women/men/boys/girls`, Joybees `kids/women/unisex/adults_m/adults`, Calvin `women/men`. Nada de comparar géneros entre marcas sin normalizar. ⚠️ Reebok es el ORIGINAL y por eso **no lleva prefijo**: `products` + `inventory`, y viven en **otro proyecto Supabase** (`reebokServer`). 🩸 **Lleno no es lo mismo que cierto**: `products.gender` tenía `DEFAULT 'male'` y el sync nunca lo escribía — **173 de 173 altas desde el 24-jun-2026 quedaron `male`**, un valor válido mintiendo el 100% de las veces. Se corrige en `20260906120000_clasificacion_catalogo.sql` (aplicada el 2-sep-2026) + el sync, que ahora escribe los dos campos explícitamente. |
| De qué **marca** es un artículo | `switch_articulo_marca` | 1 fila por (empresa, articulo_id) · 8.631 | ⚠️ **Todas son `american_classic`.** Las 6 del grupo tienen CERO. Es el mapa marca+departamento de Multifashion, no un catálogo de marcas del grupo. |
| Cuánto se movió un artículo **por día** | `switch_articulo_diario` | 1 fila por (empresa, fecha, artículo, tipo) · **203.536** 🔢 (la tabla más grande) | La escribe el cron `switch-articulos` (08:40 UTC, **las 8 empresas**, 3 días hacia atrás; Boston no se backfilleó, `src/lib/ventas/productos.ts:14-15`); **llega hasta AYER**. **No existe ninguna tabla llamada `switch_articulos`**. |
| Tallas y existencia del catálogo Reebok | `inventory` | 1 fila por (product_id, talla) · 391 | Proyecto Supabase de Reebok. |

### Ventas

| Pregunta | Dónde | Grano · filas | ⚠️ |
|---|---|---|---|
| Cuánto **vendí** (cabecera del comprobante) | `switch_facturas` | 1 fila por (empresa, `switch_factura_id`) · **54.296**, desde oct-2022 🔢 | Fuente única de ventas. Las **notas de crédito RESTAN** — ver [ventas-referencia](docs/postmortems/ventas-referencia.md). Incluye ACS (29.584) y Boston (9.145): filtrar por empresa siempre. |
| Qué le vendí a un cliente **renglón por renglón** | `switch_factura_lineas` | 1 fila por (empresa, tipo, factura, línea) · **163.559** 🔢 | 🩸 **Solo tiene los artículos que se FACTURARON. No sirve para saber los atributos de un artículo.** Medido: en active_shoes hay 1.126 artículos distintos aquí contra 1.763 en el catálogo (36% nunca aparece); en joystep 113 contra 207 (45%). ⚠️ Y **no cubre Boston ni American Classic: 0 filas**. Sí trae `rubro`/`subrubro`/`marca`, pero solo de lo vendido — usarlos como catálogo es el error. |
| Cuánta **utilidad** dejó una factura (`pct_utilidad`, base de comisiones) | `switch_factura_utilidad` | 1 fila por (empresa, secuencial, fecha) · 1.830 | ⚠️ **Solo desde el 3-ene-2026** y solo las 6 del grupo. Preguntar utilidad de 2025 por aquí devuelve vacío, no cero. |
| Ventas por **mes** ya sumadas | `ventas_rollup_mensual_mv` (313) · `switch_ventas_unificado_vw` | 1 fila por (empresa, mes) | Materializada: hay que refrescarla (`rpc refresh_ventas_rollup_mensual_mv`). El `_vw` une Switch + legacy y resta NC, así que **no cuadra 1:1 con el rollup**. |
| Ventas viejas del CSV | `ventas_raw` | 48.378 🔢 | **Congelada y sin un solo lector en la app** (solo la copia el backup). No re-derivable de Switch. |
| Tickets de Multifashion | `multifashion_tickets` (15.819) · vista `_multifashion_sf_vw` (29.584) | 1 fila por ticket | Multifashion **ES `american_classic`** y todo lo demás sale por RPC (`multifashion_mensual_v7`, `multifashion_vendedoras_v3`…). Ver [multifashion](docs/postmortems/multifashion.md). |

### CXC y cobros

| Pregunta | Dónde | Grano · filas | ⚠️ |
|---|---|---|---|
| Qué documentos me deben (detalle) | `switch_estadocuenta` | 1 fila por (empresa, `ccte_id`) · **2.737** | Boston 976 · fashion_wear 627 · vistana 501 · fashion_shoes 425 · active_shoes 91 · active_wear 90 · joystep 27 · **ACS 0**. 🔴 Toda lectura acota por `empresa_key` en la misma cadena. Tiene **dos escritores** (API y scraping web) sobre la misma llave. |
| Cuánto me debe cada cliente, por antigüedad | `switch_estadocuenta_aging` (vista) y `switch_estadocuenta_aging_mv` (materializada) | 1 fila por (`company_key`, cliente) · 211 cada una | ⚠️ Columna **`company_key`**, no `empresa_key`. La MV **materializa la vista** (`SELECT v.* FROM …`), no copia su cuerpo. Buckets `d0_30 … mas_365`. La API cae a la vista en vivo si la MV falla. |
| La cartera de **Boston** | `switch_estadocuenta_aging_boston` | 1 fila por (cliente Boston) · 388 | 🔴 Es una **VISTA aparte a propósito** (no una tabla: `20260728120000_aging_grupo_y_boston_aparte.sql:130`, sobre las filas de Boston en `switch_estadocuenta`): Boston NUNCA se mezcla con el CXC del grupo. Buckets propios y distintos: `d0_90 / d91_120 / d121_plus`. La llena el cron `boston-cartera` (reporte web, no API). Ver [boston-cxc](docs/postmortems/boston-cxc.md). |
| Quién me **pagó** | `switch_recibos` | 1 fila por recibo · **46.556** 🔢 (ACS 27.749 · Boston 7.657) | Se sincroniza por **delete + insert** en una ventana rodante de 3 meses, no por upsert. `es_retencion` separa las retenciones. ⚠️ **Dos columnas de vendedor y solo una comisiona**: `vendedor_registro` = quien REGISTRÓ el pago (la «Vendedor Recibo» del panel; es la base de la comisión de cobro desde el 3-sep-2026) · `vendedor_cartera` = dueño del cliente según el maestro (**ya no alimenta ninguna comisión**; queda como dato). Nunca vacío en 2026, pero joystep lo manda como `"DANIEL LEVY "` con espacio final — la RPC hace `TRIM`. **No tiene número de recibo**: el API no lo da. |
| CXC del CSV viejo | `cxc_rows` | 1.097 | **Sin lectores en la app**, solo backup. (La línea «~50K» de *Base de datos* quedó vieja.) |
| Notas, favoritos y contactos por cliente de CXC | `cxc_client_overrides` · `cxc_favorites` · `cxc_contact_log` · `cxc_emails_enviados` | 1 fila por (cartera, cliente normalizado) | La **cartera va en la llave**: el mismo nombre en dos empresas son dos filas. |

### Compras, llegadas y costo

| Pregunta | Dónde | Grano · filas | ⚠️ |
|---|---|---|---|
| Qué **llegó** de mercancía (alimenta «Compré» y la última llegada de Referencia) | `switch_ingresos_mercancia` | 1 fila por (empresa, `n_interno`, línea) · **35.475** 🔢 | Solo las 6 del grupo; Boston y ACS = 0. Viene por **scraping web**, no por API. `costo_fob` no es confiable de por sí (FOB = CIF en el 93% de las líneas, error de carga en Switch) — `fobConfiable()` es una **función al leer** (`ingresos-mercancia.ts:251-255`), no una columna, y el FOB del sistema **se calcula** (`CIF ÷ 1,10`). |
| Costo y utilidad del día | `switch_costo_diario` | 1 fila por (empresa, fecha) · 1.223 | ⚠️ **Nadie la lee** (verificado 3-sep-2026): cero lecturas en `src/` y la vista que la usaba se rearmó sobre `switch_articulo_diario` el 6-jun (`20260606080000`). Se sigue escribiendo 4×/día en las 8 empresas por `switch-sync tipo=all`; sirve como cuadre y como centinela de la alerta A (`costo`). |
| Cuánto le debo a un **proveedor** | `switch_proveedor_estadocuenta` | 1 fila por (empresa, proveedor) · 65 | Trae el aging armado desde Switch (`aging` jsonb). ⚠️ **NO tiene soft delete** (verificado 3-sep-2026 contra el código): es un snapshot que se reconstruye entero en cada corrida y el sync hace un **`DELETE` real** de los proveedores que ya no están en la lista de Switch (`sync-proveedores.ts:252-262`); la tabla no tiene columna `deleted`. Aquí decía «única tabla `switch_*` con soft delete» y era falso. |
| Costo por mes | `switch_costo_unificado_vw` | vista (empresa, mes) | ⚠️ Cero lecturas desde TypeScript, pero **sí la lee la RPC `ventas_dashboard_summary`** (SQL, `20260725170100`), o sea el margen del Resumen y de Vista General. Desde el 6-jun se arma sobre `switch_articulo_diario`, no sobre `switch_costo_diario`. |

### Gastos y banco

| Pregunta | Dónde | Grano · filas | ⚠️ |
|---|---|---|---|
| En qué **gastó** una empresa (fuente ÚNICA desde el 13-ago-2026) | `egresos_varios` | 1 renglón del reporte Egresos Varios: (empresa, mes, `n_interno`, `linea_nro`) · 709 | Se reemplaza **mes a mes** (`rpc egresos_reemplazar_mes`), no upsert: solo vive la ventana cargada. vistana 378 · fashion_wear 135 · fashion_shoes 123 · active_shoes 47 · active_wear 26 · **joystep 0** (0 es normal ahí). 🔴 Las 8 empresas se ven pero **sus gastos nunca se suman entre sí** en este módulo. |
| Hasta cuándo cargó la contadora / si una corrida no trajo nada | `egresos_importaciones` | 1 fila por corrida · 137 | Se inserta **antes** de escribir, justo para distinguir «este mes no tuvo movimientos» de «no sabemos nada». |
| Qué significa un código de cuenta | `cuentas_contables` | 1 fila por (empresa, cuenta) · 987 | La sincroniza el mismo cron de egresos. |
| Saldo del banco | `bancos_saldos` | 1 fila por (empresa, `fecha_dato`) · 52, escrito a mano por contabilidad | Upsert por esa llave: repetir la fecha corrige ESE día. **Cero `DELETE`.** |
| El mayor contable | `mayor_lineas` (135) · `mayor_importaciones` (16) | — | **Retirado.** No se borran y hay test que pone el build rojo si una migración las dropea. Una sola lectura viva en `src/lib/cuentas/leer.ts`. Ver [gastos-mayor-banco](docs/postmortems/gastos-mayor-banco.md). |

### Asistencia y planilla

Detalle de reglas en [asistencia-planilla](docs/postmortems/asistencia-planilla.md).

| Pregunta | Dónde | Grano · filas | ⚠️ |
|---|---|---|---|
| Qué marcó el reloj | `asistencia_marcaciones` | 1 fila por (dispositivo, `evento_id`) · 5.744 🔢 | 🔴 **Append-only: nunca se edita ni se borra** (barrido estático lo prohíbe). Duplicados se ignoran en el upsert. La hora está en `ocurrio_en` (UTC) y el JSON crudo del reloj en `raw`. |
| La corrección de una marcación | `asistencia_correcciones` | 1 fila por corrección · 8 | Va **encima** de la marcación, con motivo y firma; deshacer = `anulada_en`. |
| Quién es el empleado, cuánto gana, saldo de vacaciones | `asistencia_personas` | 1 fila por `empleado_codigo` · 40 (37 activos: Boston 21 · vistana 9 · fashion_wear 7) | `saldo_vacaciones_dias` y `saldo_vacaciones_corte` van **juntos o ninguno** (CHECK). `no_marca_reloj` y `servicio_profesional` cambian todo el cálculo. |
| Su horario | `asistencia_horarios` | 1 fila por empleado · 40 | — |
| Los parámetros del cálculo (tolerancia, recargos, divisores, seguros) | `asistencia_reglas` | **Una sola fila, `id = 1`. Es un singleton.** | ⚠️ **No tiene `empresa_key`**: las reglas son del grupo entero, no por empresa. |
| Feriados | `asistencia_feriados` | 1 fila por fecha · 22 | — |
| Justificaciones y vacaciones | `asistencia_justificaciones` (23) · `asistencia_vacaciones` (2) | 1 fila por período justificado / por rango de vacaciones | 🔴 **Una vacación NO es una justificación**: tablas y pestañas distintas, y «Vacaciones» no está en la lista de motivos. `ya_pagadas` es lo único que mueve plata. |
| Aprobaciones y planilla | `asistencia_horas_extra_aprobadas` (521) · `asistencia_prestamo_aprobado` (13) · `asistencia_planilla_manual` (26) · `asistencia_planilla_guardada` + `_linea` (**0 y 0: todavía no se cerró ninguna quincena**) | 1 fila por (empleado, fecha) o (quincena, empleado) | — |
| Sueldo repartido entre empresas · quién aprueba qué empresa | `asistencia_reparto_empresa` (2) · `asistencia_aprobador_empresa` (6) | 1 fila por (empleado, empresa) / (usuario, empresa) | El reparto tiene que sumar el salario de la ficha o se rechaza entero. |

### Guías de despacho

| Pregunta | Dónde | Grano · filas | ⚠️ |
|---|---|---|---|
| La guía: transportista, placa, firmas, estado | `guia_transporte` | 1 fila por guía · 238 (**216 Completadas y 2 Pendientes vivas; 20 borradas**) | Estado en TEXT sin CHECK. Completada = bloqueada para edición, con dos excepciones puntuales. |
| **El cliente** de cada renglón, sus facturas y bultos | `guia_items` | 1 fila por renglón · 562 | 🔴 **El cliente vive aquí, en `cliente_codigo`, uno por renglón.** `guia_transporte.receptor_nombre` es **quien FIRMA**, no el cliente. ⚠️ `guia_items` tiene **su propio `deleted`**, independiente del de la cabecera: filtrar solo la cabecera deja pasar renglones borrados. Ver [guias](docs/postmortems/guias.md). |

### Clientes

| Pregunta | Dónde | Grano · filas | ⚠️ |
|---|---|---|---|
| El directorio **completo** de clientes | `clientes_master` | 1 fila por `codigo` · **150 vivas** (+4.914 marcadas `deleted`, las de Boston, el 2-sep-2026) 🔢 | 🔴 **SOLO las 6 del grupo.** No tiene `empresa_key`: adentro, un cliente de Boston es indistinguible de uno del grupo — por eso el sync pide por inclusión. El upsert **no pisa** `telefono/celular/email/notas` — eso lo escribe la gente. |
| El directorio **manual** del módulo Clientes | `directorio_clientes` | 1 fila por contacto · **33** | ⚠️ Son 33, no miles: es la libreta de contactos a mano, no el padrón. Confundirla con `clientes_master` hace parecer que «no hay clientes». |
| El cliente tal como lo ve **una empresa** en Switch | `switch_clientes` | 1 fila por (empresa, `cliente_switch_id`) · 6.794 🔢 | El mismo cliente aparece una vez por empresa donde compra. |
| Cuánto compró un cliente en 12 meses | `clientes_agregado_12m_vw` (114) · `clientes_empresa_12m_vw` (1.665; **255 del grupo**) | 1 fila por cliente / por (cliente, empresa) | El agregado ya **excluye Boston**. El código sale SIEMPRE del puente `switch_clientes (empresa_key, cliente_switch_id)` — **nunca** de un JOIN por nombre, y sin fallback. Se refresca con `rpc refresh_clientes_empresa_12m_vw`. |

### Catálogos públicos y pedidos

Reglas en [catalogos-pedidos](docs/postmortems/catalogos-pedidos.md).

| Marca | Productos | Pedido interno | Pedido público | Envío a Switch |
|---|---|---|---|---|
| Reebok (`active_shoes`) | **`products`** (391) + `inventory` (391) | `reebok_orders` (22) + `reebok_order_items` (266) | `reebok_pedidos_publicos` (18) | `reebok_switch_envios` (15) |
| Joybees (`joystep`) | `joybees_products` (83) | `joybees_orders` (41) | `joybees_pedidos_publicos` | `joybees_switch_envios` |
| Tommy (`fashion_shoes`) | `tommy_products` (546) | `tommy_orders` (32) | `tommy_pedidos_publicos` | `tommy_switch_envios` |
| Calvin (`vistana`) | `calvin_products` (81) | `calvin_orders` (20) | `calvin_pedidos_publicos` | `calvin_switch_envios` |

⚠️ **Reebok rompe el patrón dos veces**: sus productos no llevan prefijo (`products`/`inventory`) y viven en **otro proyecto Supabase**, mientras que `reebok_pedidos_publicos` vive en el principal. Buscar `reebok_products` no encuentra nada.
⚠️ `<marca>_switch_envios` tiene índice parcial único `(order_id) WHERE estado <> 'error'` — el **at-most-once** del envío.

### Alertas, sincronización y salud

| Pregunta | Dónde | Grano · filas | ⚠️ |
|---|---|---|---|
| **Cómo le fue a cada corrida de sync** (la tabla que se mira primero cuando algo dejó de llegar) | `switch_sync_log` | 1 fila por corrida: `empresa_key, sync_type, started_at, finished_at, status, range_from/to, records_inserted/updated/skipped, skip_details, error_message, triggered_by` · **9.119** 🔢 | El candado de «una corrida a la vez» es un **índice único parcial sobre `status='running'`** por par (empresa, tipo); se suelta solo a los 30 min. `skip_details` (4.612 filas lo tienen) es donde se registra lo descartado. Poda: `rpc podar_switch_sync_log`. |
| Cuándo corrió bien por última vez cada cron | `cron_heartbeats` | 1 fila por cron · 75 | ⚠️ La columna es **`cron_name`**, no `job`. Solo tiene dos columnas: `cron_name` y `last_success_at`. |
| Qué error de cron ya se avisó (anti-loop del correo) | `cron_email_errors` | 1 fila por error notificado | — |
| Los chequeos de integridad | `data_integrity_checks` | 1 fila por (check, corrida) · 807 | Insert-only, nunca se borra; el dashboard filtra por `LIVE_CHECK_NAMES`. Skill `data-integrity`. |
| Memoria/CPU de la base | **ninguna tabla** | — | ⚠️ `db_recursos` **no es una tabla**: es el nombre de un tipo de alerta. El dato se lee del endpoint Prometheus de Supabase, justamente porque la base puede ser la que está caída. |
| Quién entró y qué hizo | `user_sessions` (1.058) · `activity_logs` (2.821) · `login_attempts` | 1 fila por sesión / por acción | `user_sessions` **no tiene `expires_at`** — la expiración vive solo en el cron. Ver *Auth*. |

### Trampas transversales

- **Soft delete, dos convenciones.** `deleted boolean` en casi todo; **`deleted_at` solo en `packing_lists`**. Y en préstamos `deleted` es NULLABLE, por eso se filtra `.or("deleted.is.null,deleted.eq.false")` — un `.eq("deleted", false)` ahí **pierde filas**. Ninguna tabla `switch_*` sincronizada tiene soft delete, salvo `switch_proveedor_estadocuenta`.
- **Empresa vs empresa.** Ocho `empresa_key` existen, pero **cada tabla cubre un subconjunto distinto**: los catálogos y las llegadas solo las 6 del grupo; `switch_articulo_marca` solo ACS; `switch_factura_lineas` sin Boston ni ACS. Antes de decir «falta el dato», mirar si esa empresa alguna vez estuvo en esa tabla.
- **Cero no es lo mismo que vacío.** `joystep` con 0 gastos y `american_classic` con 0 artículos son estados normales; una empresa que ayer tenía filas y hoy tiene 0 no lo es. Una empresa sin renglones dice «Todavía no hay gastos registrados», nunca `$0.00`.
- **Antes de dar por perdido un dato**: mirar la lista de columnas real (`GET /rest/v1/` devuelve el OpenAPI con todas las tablas y sus columnas) en vez de copiar nombres del código. Ya pasó dos veces: `cron_heartbeats.job` era `cron_name`, y `asistencia_reglas.empresa_key` no existe.

## Switch Soft (ERP externo)
- 🗺️ **El mapa de flujo, dato por dato: [`docs/switch-flujo.md`](docs/switch-flujo.md)** (3-sep-2026) — para cada cosa que el sistema sabe de Switch: por qué endpoint o reporte sale, qué cron lo trae y a qué hora, en qué tabla cae y qué campos descarta, en qué pantalla se ve, qué empresas entran y cuáles no, qué lo rompe y cómo consultarlo al momento. Más las dos vías de entrada (API vs panel, **sesión por USUARIO**), las trampas transversales y el árbol de «por dónde empezar». **Léelo antes de decir que un dato «no existe», «no llega» o «viene de tal endpoint».** Cruza con «Dónde vive cada dato» (por pregunta) y con `switch-referencia.md` (por endpoint).
- 📖 **Documentación oficial cruzada con el código: [`docs/switch-referencia.md`](docs/switch-referencia.md)** — los 52 métodos del API (cuáles usamos, qué campos tiramos, 7 endpoints que usamos sin documentar), lo que las 13 guías explican del sistema, y la lista de lo que la doc corrige del repo (sesión única es por USUARIO, `rubroId` en `/apiarticulos/lista`, `detalle[]` en `/apiingresomercancia/info`, precio por cliente). El manual del panel sigue en `docs/switch-panel.md`.
- **Dos vías de entrada** (detalle en `docs/switch-flujo.md` › A): el **API JSON** con token (`client.ts`; `SWITCH_<EMPRESA>_API_*`) y el **panel web** Laravel con sesión (`web-client.ts`; `SWITCH_<EMPRESA>_WEB_*`, login con `changesession="SI"` que **expulsa** a quien esté en el panel). **La sesión es por USUARIO**, y el sistema entra como `daniel`: cada cron o script saca a Daniel del panel de esa empresa, y viceversa. Los crons de la misma empresa van a ≥ 15 min; los de login web, de madrugada de Panamá.
- Lo que llega por **CSV** hoy son solo los reportes del panel que el sync baja solo (egresos varios e ingresos de mercancía, con `;`). ⚠️ Aquí decía hasta el 3-sep-2026 «Upload: 100% manual (drag-drop), no hay API/SFTP» — describía el sistema de antes de jun-2026 (`ventas_raw`/`cxc_rows`, congeladas). Hoy hay 25 endpoints del API en uso y ~40 entradas de cron que tocan Switch.

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
| /api/cron/acs-resumen-diario | 01:00 (resumen diario ventas ACS al Telegram **privado** de Daniel, no al grupo de negocio — ver «Alertas» abajo; 20:00 Panamá = 8pm, tras el sync de cierre de 00:15) |
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


## Alertas a Telegram — DOS canales, TRES formas de mandar (27-jul-2026 · ampliado 2-sep-2026)

Daniel divide los mensajes en dos, textual: **"tengo dividido los mensajes en info de la empresa y alertas cuando el sistema no funciona"**. No son un flujo con más o menos ruido: son dos cosas con reglas **opuestas**. Punto único: `src/lib/alertas/canal.ts` (`enviarNegocio` / `enviarNegocioPrivado` / `enviarSistema`). **Nadie llama `sendTelegramAlert` directo.**

Los CHATS siguen siendo dos; lo que hay son **tres tratos**. `enviarNegocioPrivado` toma el CHAT de sistema con el TRATO de negocio: es privacidad, no severidad.

- **📊 NEGOCIO** — pedidos, guías, cheques por vencer, fotos faltantes, el resumen mensual del grupo. Textual: *"NO, ES SUPER IMPORTANTE ESAS. NECESITO SABER QUE PASA EN LA EMPRESA Y ESO AYUDA BASTANTE"*. **NINGUNA regla anti-ruido aplica acá** — ni frecuencia, ni agrupación, ni "esto funciona bien, no avisar". `enviarNegocio` no acepta perilla de silenciar: que no exista es la garantía. Los textos NO se tocaron. ⚠️ **No es el chat de Daniel: es un GRUPO de tres** con el celular de la empresa, desde donde bodega y marketing miran las fotos y las guías. (Aquí decía «costo sospechoso» hasta el 2-sep-2026: ese aviso **ya no se manda por ningún canal** desde el 3-ago-2026 —Daniel: *"no quiero mensaje de costos"*—, candado en `costo-sospechoso-canal.test.ts`.)
- **🔒 NEGOCIO PRIVADO** (`enviarNegocioPrivado`, 2-sep-2026) — hoy solo el **resumen diario de ventas de ACS**. Daniel, textual: *"Solo me gustaría que las ventas de acs me lleguen solo a mí o por el chat de alertas, ya que ahí no está el celular de la empresa"*. **El motivo es privacidad, no que sea una alerta**: va al DESTINO de sistema (el chat privado) pero **sin el prefijo `🔧 SISTEMA · `** —rotular la venta del día como avería sería mentir en la notificación del iPhone— y **sin ninguna regla anti-ruido**, igual que 📊 NEGOCIO. Es función propia y no `enviarSistema` justamente para que una anti-ruido futura dentro de ese canal no se lleve el resumen por delante. Sale desde **DOS lugares** —el cron de la 01:00 y la recuperación de `switch-reconciliacion`— y un candado exige que apunten al mismo destino. Pierde el fail-safe de reintento (su destino ES el canal de siempre); lo cubren las 3 pasadas de la reconciliación.
- **🔧 SISTEMA** — prefijo `🔧 SISTEMA · ` al principio (se lee en la notificación del iPhone sin abrirla). Regla de tres: **(1)** es real, **(2)** no se arregla solo —si la reconciliación, una 2ª oportunidad o el propio cron lo recupera en horas, NO se avisa—, **(3)** alguien tiene que hacer algo. Y el texto dice **qué pasó / qué significa para el negocio / qué hacer**. Sin nombres de tabla, códigos HTTP ni HTML del proveedor. **Es el chat PRIVADO de Daniel** (el canal de siempre, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` — en Vercel no existe ninguna variable `*_SISTEMA`, verificado el 2-sep-2026).

> ⚠️ **A dónde apunta cada canal se verifica sin escribirle a nadie:** `GET /api/diag/canales-telegram` (auth: `CRON_SECRET` o sesión de admin). Hasta el 2-sep-2026 el comentario de `src/lib/alertas/canal.ts` decía lo contrario de la realidad —que NEGOCIO era el chat privado— y eso es la clase de dato viejo que hace que el próximo cambio salga al chat equivocado.


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
