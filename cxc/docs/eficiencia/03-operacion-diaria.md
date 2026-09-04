# Eficiencia — Operación diaria (parte 1 de 2)

> Auditoría del 4-sep-2026. Módulos: Guías de Despacho, Packing Lists, Reclamos,
> Marketing (con Mobiliario), Caja Menuda y Depurador.
> Uso medido contra producción (PostgREST + SQL, `count=exact`); `activity_logs` solo
> registra entradas y algunas escrituras, así que el uso real se midió por las FILAS
> escritas en las tablas de cada módulo.
>
> ⚠️ En Guías hay otro trabajo en curso (elegir cliente + facturas, autollenado de
> destino, búsqueda en Switch — commits 115f90ed, c5cc0502, f43eb4c0). Aquí solo se
> cubre lo que queda: despacho, impresión, la lista y el flujo de bodega.

---

## Guías de Despacho (`/guias`, key `guias`)

**Qué es y quién lo usa.** El papel que firma el transportista cuando sale mercancía.
La secretaria CREA (134 de 137 guías jun–ago); bodega y la secretaria DESPACHAN
(115 y 189 eventos de despacho); el vendedor solo mira.

**Uso medido (al 4-sep-2026).** ~45 guías/mes (jun 34 · jul 46 · ago 54 · sep 3 al día 4).
216 completadas históricas, 2 pendientes vivas. Desde junio: 153 con transportista
externo, 66 entrega directa. Los 322 eventos `guia_dispatch` contra ~127 guías
completadas indican ~2,5 guardados del formulario de despacho por guía (no se puede
separar por guía: el evento se registra sin `entity_id`).

**Cómo funciona por dentro.**
- Lista: `src/app/guias/components/GuiasList.tsx` (1.029 líneas) + `useGuiasState.ts`. `GET /api/guias` trae TODAS las guías con renglones, sin límite; la paginación es solo de pintado (15 en 15).
- Despacho: `/guias/[id]` (`page.tsx`, 568 líneas) + `DespachoForm.tsx` + `useDespachoGuia.ts`. Qué bloquea y qué no: `src/lib/guias/falta-para-despachar.ts` (ver CLAUDE.md § Guías).
- El papel está dibujado DOS veces: `src/lib/guias/pdf-guia.ts` (jsPDF, el que se usa) y `PrintDocument.tsx` (pantalla huérfana `/guias/[id]/imprimir`, nadie la enlaza). Un test los amarra.
- La sugerencia que llena receptor+cédula+placa de un toque (`juegos-despacho.ts`) solo aparece tras escribir 2 letras en «Recibido por» y SOLO en modo externo. Entrega directa no tiene ninguna ayuda.
- La numeración de guía es `max(numero)+1` con 3 reintentos (`api/guias/route.ts:60-95`): dos altas simultáneas pueden chocar.

**La tarea más frecuente, hoy.** Despachar una guía externa de ~7 renglones:
abrir `/guias` → tocar «Ver pendientes» (la lista abre SIN filtro) → tocar la fila →
«Despachar» (cambio de pantalla, que repite la carga de la guía) → placa · recibido
por · cédula · 2 firmas (+7 cajas opcionales de N° del transportista) → «Despachar».
**≈13 interacciones usando la sugerencia; ≈27 tecleando todo.** En lote: +2 toques por
guía (Atrás + volver a filtrar). El N° del transportista por renglón se llena solo en
62 de 289 renglones (21%) — es opcional y está bien que lo sea.

**Sugerencias.**
1. **La lista abre en «Pendientes» cuando hay pendientes.**
   · Quién lo sufre: bodega y secretaria, en cada uno de los ~322 despachos/trimestre.
   · Hoy: entrar → banner → tocar «Ver pendientes» → buscar la fila. Después: entrar y la guía pendiente ya está arriba.
   · Ahorra 1-2 toques por despacho, ~100/mes. **Tamaño: chico.** Existe hasta el deep link (`?pendientes=1`); es cambiar el default (`useGuiasState.ts:41`, y la línea redundante `page.tsx:141` que lo re-apaga para bodega).
2. **Recordar el chofer en entrega directa.** «Julio garay » se tecleó a mano en 16 guías, con 3 grafías distintas (`Julio garay ` · `Julio ` · `Julio`). El modo externo ya recuerda transportista/placa; entrega directa no recuerda nada.
   · Hoy: teclear el nombre cada vez. Después: un toque sobre el último chofer usado.
   · Ahorra poco tiempo pero elimina las grafías. **Tamaño: chico.**
3. **Que «Imprimir todas» diga lo que hace.** El botón de lote descarga UN archivo PDF, no imprime (`GuiasList.tsx:192-216`). Y «Eliminar» exige escribir la palabra ELIMINAR para un borrado que es reversible (soft delete, solo admin/secretaria).
   · Renombrar el botón a «Descargar PDF (N)» y bajar la confirmación de borrado al `ConfirmDeleteModal` normal de la casa. **Tamaño: chico.**

**Lo raro que encontré.**
- Pantalla `/guias/[id]/imprimir` huérfana: 86 líneas + arrastra `GuiaDetail/PrintDocument/HojaEscalada` (~560 líneas) sin ninguna entrada de usuario.
- El PATCH todavía acepta `motivo_rechazo`, `firma_transportista`, `nombre_entregador`, `cedula_entregador` — restos del flujo de rechazo retirado (`api/guias/[id]/route.ts:218`).
- Guardar renglones los borra y re-inserta con `orden` negativo y «flip»; si el flip falla a medias, la guía queda con renglones en orden negativo. Además rota los IDs de renglón en cada guardado.
- El borrador de la firma solo se persiste si el dedo TERMINA sobre el canvas (`SignatureCanvas.tsx:29-40`); y el borrador local solo se restaura si el servidor tiene el campo vacío — un valor viejo del servidor pisa lo tecleado.
- Doble carga de la guía al pasar de la fila expandida a `/guias/[id]` (mismo GET dos veces).
- `guia_dispatch` se registra sin `entity_id` — no se puede auditar qué guía despachó quién.

---

## Packing Lists (`/packing-lists`, key `packing-lists`)

**Qué es y quién lo usa.** Convierte el PDF del proveedor en un PDF propio para que
bodega saque muestras. Roles: admin, secretaria, bodega. **Hoy no lo usa nadie.**

**Uso medido (al 4-sep-2026).** La tabla está **VACÍA: 0 packing lists, 0 renglones**.
El historial completo del módulo son 7 cargas entre el 18 y el 22-abr-2026 y 3 borrados
el 18-abr. Todo lo borrado ya lo purgó el cron de limpieza (última purga con trabajo:
6-jun). **Cuatro meses y medio sin un solo uso.**

**Cómo funciona por dentro.** Todo corre en el navegador (`PackingListsClient.tsx`,
1.325 líneas; parser `src/lib/parse-packing-list.ts`, 850 líneas): el PDF nunca se sube,
solo se guardan los datos extraídos (`packing_lists` + `pl_items` vía RPC
`save_packing_list`). Hay un botón «Resolver con IA» por bulto (Haiku). El producto
final es otro PDF que se imprime; nada más en el sistema lee estos datos.

**La tarea más frecuente, hoy.** No hay: nadie la hace desde abril.

**Sugerencias.**
1. **Decidir si el módulo se queda o se retira** — decisión de Daniel, no técnica.
   Con uso cero desde abril, cualquier mejora aquí es tiempo perdido. Si se queda,
   no invertir nada; si se retira, la ficha sale del menú y el cron diario de limpieza
   (03:00 UTC) se apaga — las tablas NO se borran (mismo patrón que el mayor contable).
   **Tamaño: chico.** No propongo nada más: optimizar un módulo sin usuarios no ahorra minutos de nadie.

**Lo raro que encontré.**
- El primer render muestra packing lists borrados: el SSR no filtra `deleted_at` (`page.tsx:41-45`); la API sí. Hoy es invisible porque la tabla está vacía.
- La RPC de guardado borra por `numero_pl` sin filtrar empresa ni borrados (`supabase/migrations/packing-lists-rpc.sql:24-33`): dos empresas con el mismo número se pisarían.
- «Usar total del PDF» fabrica un renglón `AJUSTE-MANUAL` que sale impreso en el PDF de bodega como si fuera un estilo real (`preview-helpers.ts:59-66`).
- Dos generadores de PDF duplicados (cliente y detalle) que hay que mantener en paralelo.
- El menú excluye a `vendedor` pero la página y la API sí lo dejan entrar por URL (`modules.ts:166` vs `page.tsx:7`).

---

## Reclamos (`/reclamos`, key `reclamos`)

**Qué es y quién lo usa.** Reclamos a proveedores por mercancía con problemas
(faltante, manchada, etc.), con correo al proveedor desde `info@fashiongr.com`.
Secretaria y admin.

**Uso medido (al 4-sep-2026).** 47 creados desde marzo, pero cayendo: jun 20 → jul 6 →
ago 3 → sep 0. Último movimiento: 26-ago. De los 34 vivos, **29 están en «Creado»
(promedio 143 días parados; el más viejo es de feb-2025)** y 5 en «Pagado». El estado
intermedio «En proceso» tiene **cero** reclamos — nadie lo usa. A 25 reclamos ya se les
envió correo (42 notas de envío), pero el envío no cambia el estado, así que la lista
no distingue «falta reclamar» de «esperando respuesta». Los motivos personalizados
(tabla `reclamo_custom_motivos`) tienen **0 filas: la función nunca se usó**.

**Cómo funciona por dentro.**
- SPA de 3 niveles en una URL: `ReclamosClient.tsx` (750 líneas, es el patrón de navegación de referencia del sistema — ver CLAUDE.md § Navegación). Detalle: `ReclamoDetail.tsx` (836 líneas).
- Estados con CHECK en DB: `Creado → En proceso → Pagado` (migración `20260629100000`). El salto directo Creado→Pagado existe.
- El correo al proveedor se autogenera (asunto, cuerpo, destinatario de `reclamo_contactos`); 3-4 toques. NO cambia el estado — comentario explícito en `send-zip/route.ts:170`.
- Proveedor y marca se derivan solos de la empresa (`constants.ts:9`). Con el PDF de la factura, la IA prellena factura/fecha/pedido (`api/reclamos/ia/leer-factura`).
- Validación única en `src/lib/reclamos/validate.ts`.

**La tarea más frecuente, hoy.** Crear un reclamo de 1 ítem: 4 campos de cabecera +
7 por ítem = **11 campos, ~13-15 interacciones**, 1 pantalla. Con 3-4 ítems (el
promedio es 3,7), talla, género y motivo se re-eligen ítem por ítem sin «duplicar fila».

**Sugerencias.**
1. **Que el envío del correo mueva el estado a «En proceso» (o pinte «enviado el X» en la lista).**
   · Quién lo sufre: la secretaria que quiere saber a cuál proveedor perseguir — hoy 29 de 34 reclamos se ven igual («Creado») aunque 25 ya se reclamaron por correo. El estado «En proceso» existe, tiene modal y endpoint, y nadie lo ha usado nunca: la transición manual es el paso que sobra.
   · Hoy: enviar correo (3-4 toques) + acordarse de cambiar el estado a mano (nadie lo hace). Después: enviar correo y el estado cambia solo.
   · Ahorra poco tecleo pero convierte la lista en un tablero real de seguimiento. **Tamaño: chico.** No toca ningún invariante.
2. **Botón «duplicar renglón» en el formulario.** Con 127 ítems en 34 reclamos, cada ítem repite talla/género/motivo del anterior casi siempre.
   · Hoy: 7 campos por ítem. Después: 1 toque + corregir referencia/cantidad.
   · Ahorra ~4 campos por ítem extra. **Tamaño: chico.**
3. Nada más: el volumen es bajo (3-6/mes últimamente) y el formulario ya tiene IA y derivación de proveedor.

**Lo raro que encontré.**
- Los motivos personalizados no tienen borrado (un typo queda en el desplegable para siempre) y viven en DOS fuentes a la vez (servidor y localStorage) — pero como nadie creó ninguno, hoy es riesgo latente, no problema.
- `ESTADO_DISPLAY` es un mapa vacío que 3 pantallas consultan (`constants.ts:98`); `itemsWarning` se declara y nunca se asigna (`api/reclamos/route.ts:96`).
- Dos endpoints de export (CSV y Excel) sin un solo llamador — huérfanos.
- Cada ítem inserta `nro_factura` y `nro_orden_compra` SIEMPRE vacíos (duplican la cabecera y no hay input).
- Quitar una nota de crédito borra sin confirmar ni deshacer (`ReclamoDetail.tsx:522`) — la única acción destructiva del sistema sin red de seguridad.
- `GET /api/reclamos` trae todos los reclamos con ítems+fotos+seguimiento, sin paginar. Con 47 aguanta; sin techo.

---

## Marketing (`/marketing`, key `marketing`) — incluye Mobiliario

**Qué es y quién lo usa.** La plata de marketing por marca y período (facturas,
proyectos por tienda, impulsadoras) + el inventario de muebles de exhibición.
Secretaria y admin.

**Uso medido (al 4-sep-2026).** Facturas: ~15/mes en agosto (102 desde abril). De las
88 vivas, **71 siguen en «creado» y solo 17 en «pagado»**. Proyectos: 25, **todos
«abierto», ninguno con fecha de cierre, de enviado ni de cobrado** — el ciclo
enviar→cobrar del proyecto no se ha usado ni una vez. Entregas de muebles: 24 (jun 20 ·
jul 1 · ago 3, última 28-ago). Impulsadoras: 2 activas, 17 pagos registrados (último
6-ago). Inventario: 6 productos, 5 en stock 0.

**Cómo funciona por dentro.**
- 3 niveles con URL propia (`/marketing` → `[marca]` → `[periodo]`); la única puerta para meter plata es el modal «Registrar gasto» (`RegistrarGastoModal.tsx`, 819 líneas).
- Mobiliario: `mobiliario/page.tsx` (1.322 líneas). El stock se descuenta en PIEZAS y `piezasParaStock()` es la única aritmética permitida (ver CLAUDE.md § Marketing › Mobiliario — hay barrido que pone el build rojo).
- El stock de un producto es un número ABSOLUTO que se sobrescribe al editar (`src/lib/marketing/inventario.ts:271-274`): no existe «entrada de mercancía».
- La nota de entrega tiene generador único y el PDF se arma antes del clic (iOS) — ya documentado en el postmortem.
- Corrección al postmortem: la migración del número de entrega SÍ corrió — las 24 entregas tienen `numero` secuencial 1–24 (el postmortem aún dice que muestra `ME-E8CC66DD`).

**La tarea más frecuente, hoy.** Registrar una entrega de muebles: `/marketing` →
«Registrar gasto» → «Mueble» → marca → cliente (obligatorio, picker) → Continuar
(espera de red) → formulario donde la marca se vuelve a preguntar + 2 campos numéricos
por producto → Guardar → pantalla de éxito → Listo = **4 pantallas, ~9 toques mínimos**.
Desde la pantalla de Mobiliario NO se puede: hay que salir y entrar por la otra puerta.

**Sugerencias.**
1. **Botón «+ Entrada» en el inventario de Mobiliario.** Hoy recibir 50 paneles = leer el stock actual, sumar de cabeza y retipear el total — sin rastro de quién ni cuándo, y esa aritmética mental es donde nacieron los stocks negativos que el módulo ya vivió.
   · Hoy: editar producto → calcular → retipear. Después: «+ Entrada» → cantidad → listo, y queda registrado.
   · **Tamaño: chico.** Invariante que toca: toda la aritmética debe pasar por `piezasParaStock()`/`ajustarStock` — la entrada debe usar el mismo RPC de delta que ya usan las entregas.
2. **«+ Entrega» desde la pantalla de Mobiliario.** Quien está viendo que quedan 12 paneles es quien va a entregarlos; hoy tiene que salir a `/marketing` y pasar por 4 pantallas.
   · Después: 1 botón que abre el mismo formulario. Ahorra 3-4 toques por entrega (24 entregas en 3 meses — ahorro real modesto). **Tamaño: chico.**
3. **Definir con Daniel si los estados que nadie mantiene se usan o se quitan.** 71 facturas en «creado» y 25 proyectos «abiertos» para siempre significan una de dos: o falta el hábito de marcarlos (y entonces los reportes de «pagado/cobrado» mienten), o esos campos sobran y estorban. No es un cambio de código sino una definición — mapear → definir juntos.

**Lo raro que encontré.**
- «Editar entrega» desde Mobiliario es código escrito pero inalcanzable: `setEditEntrega` nunca recibe un valor (`mobiliario/page.tsx:1188-1210`), y el N+1 de red que carga un proyecto por entrega alimenta en parte ese bloque muerto (`:147-158`).
- Los productos se clasifican por trozos del nombre (`includes("panel")`, `EntregaForm.tsx:72-82`): renombrar un producto lo cambia de sección en silencio.
- El cliente es obligatorio en la UI de entregas aunque el backend acepta entregas sin proyecto — el propio código las contempla.
- `app/api/marketing/periodos/cerrar.ts` vive dentro de `app/api/` sin ser `route.ts` (no se rutea; deliberado pero confunde).

---

## Caja Menuda (`/caja`, key `caja`)

**Qué es y quién lo usa.** Los gastos chicos de la oficina contra un fondo de $200.
La usa UNA persona (una secretaria; un solo `created_by` en todos los gastos desde junio).

**Uso medido (al 4-sep-2026).** 93 gastos históricos (77 vivos). El patrón real NO es
diario: **acumula recibos y los teclea en tandas** — los 38 de septiembre se crearon
TODOS el 2-sep, con fechas de recibo que van de junio a septiembre. Períodos: 3 desde
marzo (~2 meses cada uno), siempre fondo $200, «repuesto» nunca marcado. El 2-sep se
borraron 11 de los 38 recién tecleados (29%), incluidos gastos de $0,05, $0,87 y $1,67
creados y borrados el mismo día del cierre del período — consistente con estar
cuadrando el saldo a cero a mano, porque **el sistema no deja cerrar si el saldo no da
exactamente 0** y el modal de cierre no lo avisa.

**Cómo funciona por dentro.**
- Corazón: `src/app/caja/hooks/useCajaState.ts` (todas las mutaciones). Alta real: `NuevoGastoDrawer.tsx` + `GastoForm.tsx` (694 líneas).
- El cierre valida saldo = 0 (±0.005) en el servidor (`api/caja/periodos/[id]/route.ts:93-98`); la reposición es un PATCH escondido en el menú «···» y solo visible con el período YA cerrado.
- Categorías: tabla `caja_categorias` cerrada (solo el dueño administra), con adivinanza por palabras clave («taxi»→Transporte). Smart defaults `fg_last_caja_*` solo en el Drawer.
- «Guardar y nuevo» conserva categoría y responsable pero resetea la FECHA a hoy.
- Campos de la tabla que nadie llena: `ruc` 0/53 desde junio, `empresa` 0/53, `nro_factura` vacío en 18/53.

**La tarea más frecuente, hoy.** Teclear una tanda de ~38 recibos: por cada uno,
descripción + proveedor (texto libre) + subtotal + fecha (hay que corregirla porque
vuelve a hoy y los recibos son viejos) + responsable/categoría (recordados) + Guardar
y nuevo ≈ **6-7 interacciones × 38 recibos ≈ 250 toques por tanda**. El retipeo se ve
en los datos: el mismo asadero aparece como «La Parrillada · La parrilla · La Gran
Parrilla · La Gran Parrila · la gran parrilada» (5 grafías) y «Market Fresh» también
como «Market Fres».

**Sugerencias.**
1. **Modo tanda de verdad en «Guardar y nuevo»: conservar la fecha elegida y autocompletar el proveedor.** La fecha vuelve a hoy en cada gasto y ella está cargando recibos de hace semanas; el proveedor es texto libre sin memoria (31 proveedores distintos en 77 gastos, con typos que lo prueban).
   · Hoy: ~7 toques por recibo con corrección de fecha. Después: ~4-5 (fecha se queda, proveedor se elige de una lista de los ya usados).
   · Ahorra ~80-100 toques por tanda (~1 tanda/mes) y elimina las grafías. **Tamaño: chico.**
2. **Que el cierre de período diga la verdad y ofrezca la reposición.** El modal dice «¿Cerrar este período?» y confirma… y el servidor rechaza si el saldo no es 0. La reposición no existe como pantalla antes del cierre. Resultado medido: gastos de centavos inventados y borrados para cuadrar.
   · Hoy: confirmar → error → inventar/ajustar gastos → reintentar. Después: el modal muestra el saldo actual y, si no es 0, ofrece registrar la reposición ahí mismo.
   · Ahorra la vuelta más frustrante del módulo (2 cierres/año hoy, pero cada uno con basura en los datos). **Tamaño: mediano.**
3. **Adelgazar el formulario.** ITBMS (select 0/7% + línea calculada + total solo-lectura) ocupa un tercio del formulario para un dato casi siempre 0; `ruc/dv/empresa` viven en la tabla y nadie los llena.
   · Plegar ITBMS bajo un «+ impuesto» y no mostrar lo que nadie usa. **Tamaño: chico.**

**Lo raro que encontré.**
- El PATCH de gasto acepta `metodo_pago` y `numero_factura`, columnas que **no existen** (la real es `nro_factura`): si un cliente las manda, 500 (`api/caja/gastos/[id]/route.ts:7`).
- Hay un SEGUNDO formulario completo de alta (`/caja/[periodoId]/nuevo`, 403 líneas) sin entrada desde la UI, sin smart defaults, y que al guardar navega a una URL legacy (`/caja?view=detail&id=…`) que hoy cae en la lista, no en el detalle.
- Dos valores basura distintos para la misma falta de categoría: el servidor pone «Varios», el cliente «Otros».
- El GET de un período no filtra borrados: un período eliminado sigue siendo consultable por id.
- La sugerencia 💡 «cerrar período +30 días» empuja a una acción que casi siempre va a fallar por la regla saldo = 0.
- Confirmaciones que no protegen: «¿Eliminar este gasto?» (es restaurable y el modal lo dice) y «¿Restaurar?» (sin consecuencia).

---

## Depurador (`/productos/cargar`, key `cargar`)

**Qué es y quién lo usa.** Convierte el Excel del proveedor en la plantilla de Switch
de 25 columnas. **El módulo más usado de este grupo**: 135 corridas jun→4-sep
(jul 60 · ago 50), Angela 76 · andrea 42 · daniel 17. Vivo: última corrida hoy.

**Uso medido (al 4-sep-2026).** ~50-60 descargas de plantilla/mes en `carga_history`
(solo CK/TH y Facturas Tienda dejan rastro; **Reebok no registra nada**). 22 fórmulas
por marca guardadas. El paso final es manual y sin registro: la plantilla bajada se
sube a Switch a mano y nadie sabe si una descarga llegó a subirse o se bajó tres veces.

**Cómo funciona por dentro.**
- Todo corre en el navegador (`XLSX.read/writeFile`); el corazón de negocio es `src/lib/depurador/logic.ts` (OUT_COLS, `tasaSwitch`, `matchEmpresaFromDestino`). Invariantes de la plantilla: ver CLAUDE.md § Catálogos (plantilla ÚNICA de 25 columnas, candado contra el fixture real).
- `DepuradorDispatcher.tsx` huele los encabezados y despacha solo a Reebok o CK/TH — 0 preguntas, bien.
- El servidor solo guarda fórmulas por marca/rubro, descripciones aprobadas y el historial de descargas (`api/productos/cargar/*`).
- Caso feliz: 3 toques (abrir → soltar Excel → Descargar). El costo está en las elecciones alrededor.

**La tarea más frecuente, hoy.** Una corrida CK/TH con ajustes: soltar el Excel →
verificar/elegir empresa destino → abrir el desplegable de mes/año/tasa/factor si toca
→ elegir modo de precio → divisor + extra + redondeo + «Aplicar a todo» → aprobar
descripciones nuevas una por una si las hay → Descargar → **subir a Switch a mano**.
Nada de esto se recuerda entre corridas (cero localStorage en el módulo), con
~50 corridas/mes.

**Sugerencias.**
1. **Validar el divisor EN LA PANTALLA.** `validarDivisor` (0 ó 0.10–1.00) solo corre en las rutas API al guardar fórmulas; los inputs de divisor de la pantalla no validan nada. Escribir `70` en vez de `0.70` en modo global calcula y **descarga un Excel con precios 100× mal** sin pasar por ningún candado — exactamente la clase de error que motivó el módulo, en el único punto donde el número llega al Excel.
   · Quién lo sufre: Angela y andrea, 50-60 corridas/mes; el día que pase, el costo no es un toque sino una carga mala en Switch.
   · **Tamaño: chico** (reusar `validarDivisor` en el input + bloquear la descarga). Es la sugerencia más urgente de todo este informe.
2. **Recordar las elecciones entre corridas y no borrar el trabajo hecho.** Empresa, mes, tasa, factor, modo de precio y divisor se re-eligen en cada corrida; peor, cambiar CUALQUIER campo de configuración re-lee el Excel entero y **borra todos los precios tecleados a mano** (`DepuradorClient.tsx:155-204`, `setPriceEdits({})`), y el onChange de año/tasa/factor re-procesa en cada tecla.
   · Hoy: re-elegir todo × 50 corridas/mes, y rehacer precios si tocaste la config después. Después: la pantalla abre como quedó la última vez y los precios manuales sobreviven a un cambio de tasa.
   · Ahorra varios minutos por corrida y elimina el rehacer-precios. **Tamaño: mediano.**
3. **Que Reebok también deje rastro en el historial.** Hoy `carga_history` solo registra CK/TH y Facturas Tienda; las corridas Reebok no existen para el historial, y el historial tampoco guarda con qué divisor/fórmula se bajó. Registrar la corrida Reebok igual que las demás. **Tamaño: chico.**

**Lo raro que encontré.**
- El campo «Tasa» es texto libre sin validación: `abc` llega tal cual a la columna «Tasa de Impuesto *» del Excel (`DepuradorClient.tsx:103`).
- La rama con dropzone propia de `DepuradorClient` es inalcanzable (siempre entra embebido por el dispatcher, `:565`); el bloque de error del dispatcher nunca puede pintarse (`DepuradorDispatcher.tsx:31-97`) y su `catch` cae en silencio a CK/TH.
- Descargar sin elegir empresa está permitido: se pierde el proveedor fijo y la fila de historial queda sin empresa (hoy 0 filas así — la gente la elige, pero el hueco existe).
- `DIVISOR_HINTS` hardcoded (`0.70/0.73/0.75/0.63`) mientras los divisores reales viven en `marca_formulas` (22 filas); `calcHint` exportada sin consumidores; el redondeo «par» existe en el tipo pero ningún select lo ofrece.
- Las fórmulas por marca se editan en dos lugares distintos (tabla inline del Depurador y pestaña «Fórmulas por marca»).

---

## Resumen del lote

| Módulo | Uso/mes | Estado | Mejor sugerencia |
|---|---|---|---|
| Guías | ~45 guías, ~107 despachos | Vivo, diario | Lista abre en pendientes |
| Packing Lists | **0 desde abril** | Muerto | Decidir retiro (Daniel) |
| Reclamos | 3-6 reclamos | Vivo, bajando | Correo enviado ⇒ estado «En proceso» |
| Marketing | ~15 facturas, ~3 entregas | Vivo | «+ Entrada» de stock en Mobiliario |
| Caja Menuda | 1 tanda (~38 recibos) | Vivo, 1 persona | Modo tanda + cierre honesto |
| Depurador | 50-60 corridas | **El más usado** | Validar divisor en pantalla |
