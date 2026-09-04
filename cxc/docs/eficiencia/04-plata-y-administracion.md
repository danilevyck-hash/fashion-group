# Eficiencia — plata y administración (auditoría del 4-sep-2026)

Cubre: **Asistencia y Planilla · Comisiones · Gastos · Préstamos · Recordatorios · Usuarios y Data Health**.
Método: código leído módulo por módulo + medición contra producción (PostgREST/Management API, 4-sep-2026).
`activity_logs` solo registra entradas y algunas escrituras — donde dice «no medible» es porque no hay rastro de lecturas.
No se propone nada ya cerrado por Daniel (notificaciones/badges, presets de quincena, fusiones) ni lo ya hecho esta sesión
(freno del cierre con enlace a la persona, servicio profesional sin extras, «Aplicar quincena» con fecha, login sin contraseña).

---

## Asistencia y Planilla (`/asistencia`, key `asistencia`)

**Qué es y quién lo usa.** Marcaciones del reloj, reporte quincenal, planilla, justificaciones, vacaciones y aprobación de
horas extra para 37 personas activas (Boston 21 · Vistana 9 · Fashion Wear 7). Lo usan Contabilidad (carga casi todo),
Daniel/Alberto (admin), Bodega=Julio (solo aprueba FW+Vistana) y David (aprueba Boston y ve su planilla desde `/boston`).

**Uso medido (al 4-sep-2026).**
- Marcaciones: 6.008, el reloj (`reloj cboston`, único dispositivo para las 3 empresas) al día — leído hasta el 4-sep 13:13 UTC, 0 fallos.
- Aprobaciones de extra: **521** (Daniel 298 en un solo día —31-ago, casillas semanales—, Contabilidad 122, Bodega/Julio 101).
- Justificaciones: 23 (22 de Contabilidad; motivo más usado «Catástrofe» ×13). Vacaciones: 2. Correcciones de marca: 8.
- Montos manuales de planilla: 26 filas (ago-1: 12 personas, ago-2: 14). Descuento de préstamo aprobado: 13.
- **Quincenas cerradas: 0** — el ciclo Generar→Cerrar nació el 2-sep; se estrena con la quincena de septiembre.

**Cómo funciona por dentro.** (invariantes en CLAUDE.md § Asistencia y planilla; lo de abajo es lo que falta ahí)
- Un solo motor (`src/lib/asistencia/reporte.ts`) alimenta pantalla, Excel y PDF; los exports bajan las librerías al tocar el botón.
- La Planilla abre VACÍA a propósito (decisión 1-sep: el rango define qué quincena se paga); el calendario sugiere el día siguiente a la última cerrada. Los montos manuales solo existen si el rango COINCIDE con una quincena.
- La casilla Préstamo se propone sola desde el módulo Préstamos (`prestamos-planilla.ts`, amarre por `empleado_codigo`) y se aprueba en `asistencia_prestamo_aprobado`. Es un puente de ida: aprobar en planilla NO registra el pago en Préstamos.
- Acceso: `requireAsistencia` (cookie firmada con módulos efectivos, fail-closed) + `asistencia_aprobador_empresa` (6 filas) para segmentar quién aprueba qué empresa.
- El rango del Reporte se recuerda por dispositivo (`ultimoRango("asistencia_reporte")`); el de Planilla NO se recuerda, a propósito.

**La tarea más frecuente, hoy.** Aprobar la extra de la quincena: Aprobaciones → elegir rango (2 toques) → 1 casilla por semana
(o por día/persona) = **3-7 toques por pasada**; ya está bien resuelto. Justificar: persona + desde/hasta + motivo + nota = 5 campos.
Cerrar quincena (nuevo): elegir rango → Generar → revisar → Cerrar, **× 3 empresas**.

**Sugerencias.**
1. **Que el Reporte diga cuánta extra está aprobada.**
   - **Qué**: la columna «Extras» del Reporte suma TODO lo medido; la Planilla paga solo lo aprobado. Son las dos pantallas más miradas del módulo y para la misma persona pueden decir números distintos sin explicación.
   - **Quién lo sufre**: quien cruza Reporte con Planilla (Contabilidad y Daniel). Hoy: abrir Aprobaciones aparte y comparar a ojo (521 aprobaciones vivas). Después: la celda muestra «120 (90 aprob.)» o un color, con el dato que la API de aprobaciones ya tiene.
   - **Ahorra**: el cruce mental de cada quincena y las preguntas de «¿por qué la planilla dice menos?». **Tamaño: chico.** No toca ningún invariante (mostrar, no calcular distinto).
2. Nada más que proponer en flujos: el módulo se rediseñó tres veces con Daniel entre agosto y septiembre (pestañas, calendario, cierre, aviso ámbar) y los formularios son cortos. Los montos manuales que se repiten entre quincenas son pocos (ISR ×2, mercancía ×4) — un «copiar de la quincena anterior» no paga su riesgo.

**Lo raro que encontré.**
- **Posible columna equivocada en los montos manuales**: empleados 10 y 6 tienen en ago-1 ISR de $45/$50 y en ago-2 el MISMO monto pero como Préstamo. Una de las dos quincenas parece tecleada en la casilla equivocada. Vale una mirada de Contabilidad antes del cierre de septiembre.
- **El saldo de vacaciones está cargado para 2 de 37 personas.** No es bug — la pantalla dice «falta el dato» — pero mientras Contabilidad no cargue saldo+fecha de corte, la pestaña Vacaciones no puede decir cuántos días le quedan a casi nadie.
- 1 persona activa marcada `no_marca_reloj`; 40 horarios activos para 37 personas activas (3 horarios de gente ya salida, inofensivo).

---

## Comisiones (`/comisiones`, key `comisiones`)

**Qué es y quién lo usa.** La comisión B2B de las 6 empresas del grupo (0,5% de la venta con utilidad >20% + comisión de cobro
a quien registró el recibo). Ven la matriz admin, secretaria y contabilidad; **Configuración** (tasas, clientes que no
comisionan) es solo admin; el toggle de descuento del mes lo tocan admin y secretaria.

**Uso medido (al 4-sep-2026).** Lecturas no medibles. Escrituras de configuración: 18 exclusiones creadas por Daniel
(17 el 3-sep, **1 más el 4-sep — la pestaña ya se está usando**), 12 activas; tasas 5 filas; alias 5; descuentos fijos 2
(cargados por migración, nunca desde pantalla); excepciones de descuento por mes: 2 (el toggle del modal sí se usó).

**Cómo funciona por dentro.** (reglas en CLAUDE.md § Ventas, Referencia y Comisiones)
- Shell `src/components/ventas/ComisionesView.tsx` con 3 vistas dinámicas (Consolidado/Por empresa/Configuración); el mismo componente se monta en `/ventas?tab=comisiones` (solo admin). Modo recordado en `localStorage fg_comisiones_mode`.
- `/consolidado` hace 6 RPC `comision_b2b_v8` en paralelo + descuentos + exclusiones (~10 viajes, sin cascada). Nada pesado en cliente.
- La resta de descuentos vive en el servidor (`netearComisiones`)… y OTRA VEZ en `ComisionesDetalleModal.tsx:292` porque `/detalle` devuelve la RPC cruda. Divergencia latente: el servidor exceptúa a DEFAULT, el modal no.
- v7 y v8 están aplicadas en producción; la cadena de fallback v8→v7→v6→v5 en `lib/comisiones/rpc.ts` ya solo agrega ruido (candidata a retirarse como se hizo con la tolerancia a DDL).

**La tarea más frecuente, hoy.** «¿Cuánto le pago a cada vendedor?» = **0 clics**: abre en la matriz del mes en curso con
«Total a pagar» al pie. Ver un mes cerrado: 2 clics. Agregar un cliente que no comisiona: ~8-9 interacciones (funciona, es nuevo).

**Sugerencias.**
1. **Pantalla para los descuentos fijos (y candado de alias en esa tabla).**
   - **Qué**: los $1.573,08 de descuento de Reynaldo viven en `comision_descuentos_fijos` y HOY solo se crean/editan por SQL — no hay ninguna pantalla. Y esa tabla quedó FUERA del trigger de alias del v8: una fila nueva tecleada «REINALDO ESPINOSA» nunca se restaría y nadie lo notaría (el cruce es por texto exacto).
   - **Quién lo sufre**: Daniel — cada descuento nuevo es pedirle SQL a una sesión. **Hoy**: chat + migración. **Después**: una tercera tarjeta en Configuración (misma pestaña que ya usa), con el trigger de alias igual que tasas y exclusiones.
   - **Ahorra**: la dependencia completa para un dato que mueve el pago. **Tamaño: mediano.** Riesgo: la resta debe seguir SOLO en `netearComisiones` — la pantalla escribe la tabla, no resta nada.
2. **Que abrir Configuración no lea las ventas del año entero.**
   - **Qué**: `GET /exclusiones` pagina TODAS las filas de `switch_facturas` + `switch_recibos` del año de las 6 empresas solo para llenar el desplegable de vendedores — y se repite tras cada guardado.
   - **Quién lo sufre**: la base y la espera de la pestaña (decenas de miles de filas por apertura). **Después**: sacar los vendedores de la tabla de tasas + alias (5 nombres) o de una consulta agregada. **Tamaño: chico.** Sin cambio visible.

**Lo raro que encontré.**
- La doble resta modal/servidor de arriba (con la excepción de DEFAULT solo en un lado).
- `VENDEDORES_RETIRADOS` se filtra en 4 lugares del cliente/API en vez de no mandarse; la lista mezcla nombre canónico y grafía vieja a propósito (alias falla abierto).
- El toggle del descuento del mes vive solo dentro del modal de detalle del vendedor+empresa correcto — funciona, pero no hay ningún lugar que LISTE los descuentos existentes.
- `GET /descuentos` sin `?vendedor` (rama `porVendedor`) ya no tiene consumidor; los campos `version`/`regla_cobro`/`exclusiones_aplicadas` que devuelve la RPC no los lee ninguna pantalla.

---

## Gastos (`/gastos-contabilidad`, key `gastos-contabilidad`)

**Qué es y quién lo usa.** Dos pestañas: *Gastos* (Egresos Varios de Switch, solo lectura, 8 empresas sin total de grupo) y
*Saldos de banco* (carga manual). Roles: admin y contabilidad.

**Uso medido (al 4-sep-2026).**
- Egresos: el cron corre a diario en verde (21-23 corridas/empresa), pero el DATO llega hasta donde cargó la contadora en Switch: **julio** en 4 empresas, **mayo** en Fashion Wear, joystep 0 (normal), Boston sin descarga automática. O sea: el mes en curso y el anterior están SIEMPRE vacíos.
- Saldos de banco: 52 cargas, **8 fechas distintas** (una carga mensual, ~7 empresas por sentada, siempre Contabilidad). **Última: 10-ago** — 25 días sin cargar. joystep nunca se ha cargado.

**Cómo funciona por dentro.** (invariantes en CLAUDE.md § Gastos, mayor y banco)
- Corazón: `GastosContabilidadClient.tsx` + `ResumenEgresos` (lista SIEMPRE las 8 con su frase de estado) → `DetalleEgresos` (drill con push). Sin modales ni exports.
- `SelectorMes` abre en el **mes en curso** y solo tiene ◀ ▶ de un mes por clic; no recuerda el último mes visto.
- Saldos: 8 formularios independientes (`BancoRow`), monto **prellenado con el saldo anterior**, fecha default hoy, upsert por `(empresa_key, fecha_dato)`.
- Los renglones que Switch manda ilegibles se resumen en una línea ámbar arriba de la lista (`AvisoRechazosSwitch`, últimos 7 días de `skip_details`) — pero solo en la lista, no dentro del desglose.

**La tarea más frecuente, hoy.** Consultar el gasto de una empresa: abrir → ver casi todo «No traído» (el default es el mes
en curso, que nunca tiene datos) → **2-4 clics de ◀** hasta julio (8 hasta enero, un fetch por clic) → 1 clic en la empresa.

**Sugerencias.**
1. **Abrir en el último mes que tiene datos.**
   - **Quién lo sufre**: todo el que entra (admin y contabilidad). Medido: los datos llegan hasta julio; el default (septiembre) muestra 8 tarjetas «No traído» SIEMPRE. **Hoy**: 2-4 clics y fetches extra por visita. **Después**: 0 clics — abre en el último mes con al menos una empresa con renglones (el ◀ ▶ sigue igual para moverse).
   - **Ahorra**: 2-4 clics × cada visita, y la impresión falsa de «no hay nada». **Tamaño: chico.** No toca la regla «mes en curso gana sobre la estadística» (eso es del rótulo "a medio cargar", no del selector).
2. **Cargar los saldos de banco de una sola pasada.**
   - **Quién lo sufre**: Contabilidad, que carga las 7 empresas el mismo día (medido: 8 fechas, ~7 cargas por fecha). **Hoy**: 7 formularios = ~21-28 toques y 7 guardados, repitiendo la fecha 7 veces. **Después**: una fecha + 7 montos + 1 Guardar (el POST ya es por empresa; aceptar un arreglo es directo).
   - **Ahorra**: ~2/3 de los toques de la única escritura del módulo, 12 veces al año. **Tamaño: chico-mediano.** Respeta el upsert por fecha y el cero-DELETE.
3. **Quitar el monto prellenado con el saldo anterior.**
   - **Qué**: el campo viene lleno con el saldo viejo; Guardar sin editar graba un duplicado exacto. Ya pasó: el 10-ago Active Shoes y Active Wear quedaron idénticos al 31-jul, y el módulo tiene un AVISO dedicado a detectar esa trampa que él mismo fabrica. **Después**: campo vacío con el saldo anterior como placeholder gris. **Tamaño: chico.**

**Lo raro que encontré.**
- La frase de Boston «hay que traerlos a mano otra vez» no tiene ningún botón que lo haga (`sync-now` no tiene módulo de egresos): instrucción sin salida escrita en pantalla.
- `hoyISO()` de Saldos usa el reloj del navegador mientras la API valida contra hora de Panamá: un celular adelantado recibe «la fecha no puede ser futura» por una fecha que la pantalla puso sola.
- Rama muerta «Esta parte todavía no está encendida» (la tolerancia a DDL ya se retiró); código plegable sin uso en `SaldosBancarios`; dos `<h1>` cuando hay empresa abierta.
- **Los saldos llevan 25 días sin cargarse** — si el dato importa, es de la contadora, no del sistema.

---

## Préstamos (`/prestamos`, key `prestamos`)

**Qué es y quién lo usa.** Préstamos a empleados y sus pagos por quincena. Roles admin y contabilidad; en la práctica lo
escribe **Contabilidad**.

**Uso medido (al 4-sep-2026).** 31 empleados vivos (14 activos con cuota), 431 movimientos (253 fueron la carga inicial de
marzo; ritmo real ~22-30/mes). **94 ediciones y 11 borrados de movimientos** — se corrige mucho después de crear.
«Aplicar quincena»: 0 usos en 90 días hasta que se le puso fecha (3-sep); la quincena del 15-sep es su estreno.

**Cómo funciona por dentro.**
- Lista (`PrestamosClient.tsx`) + ficha (`/prestamos/[id]`). **Cinco caminos** registran un pago: (A) «+ Nuevo préstamo» desde la lista, (B) botón «Pago Quincenal» de la ficha, (C) «+ Nuevo Movimiento» de la ficha (el único que precarga la cuota), (D) bottom sheet móvil, (E) «Aplicar quincena» en lote (RPC `prestamos_aplicar_quincena`: capea al saldo, deduplica, ahora pregunta fecha).
- El puente con Asistencia es de ida: la planilla LEE estas tablas para proponer la casilla Préstamo; aprobar allá no escribe nada acá.
- Export Excel (2 hojas, solo activos) en `api/prestamos/export-excel`.

**La tarea más frecuente, hoy.** Registrar un pago individual: camino B = 3 clics y 0 campos, **pero escribe fecha = hoy sin
preguntar**; camino A = ~6 interacciones, con el concepto default «Préstamo» (hay que cambiarlo a «Pago») y el monto tecleado
a mano aunque el sistema sabe la cuota.

**Sugerencias.**
1. **La fecha también en los pagos individuales.**
   - **Qué**: el mismo defecto que Daniel mandó arreglar en el lote sigue en los botones «Pago Quincenal» de la ficha y del móvil (`useEmpleadoActions.ts` escribe hoy sin preguntar). Contabilidad registra 1-4 días después del pago (las 6 quincenas medidas jun-ago, todas), así que cada pago individual nace con la fecha corrida — y las **94 ediciones** de movimientos huelen justamente a eso.
   - **Hoy**: registrar → Editar → corregir fecha → Guardar (4 pasos extra por pago). **Después**: el mismo mini-diálogo de fecha del lote (2 atajos + confirmar). **Ahorra**: la edición posterior de cada pago suelto. **Tamaño: chico.**
2. **Afinar el alta desde la lista.**
   - **Qué**: «+ Nuevo préstamo» pide elegir al empleado DOS veces (lista y luego un select con lo mismo), arranca en concepto «Préstamo» (lo raro; lo frecuente es «Pago») y no sugiere la cuota que el sistema ya sabe.
   - **Después**: un solo paso de selección; al elegir «Pago», monto prellenado con la cuota (editable). **Ahorra**: 3-4 toques por pago × ~20 pagos/mes. **Tamaño: chico.**

**Lo raro que encontré.**
- El aviso «los movimientos ≥ $500 requieren aprobación» en 2 pantallas **miente**: desde el 27-ago la API aprueba todo directo. Con él sobran el botón «Aprobar» de la tabla y el badge que cuenta `pendiente_aprobacion` (ya nadie escribe ese estado).
- «Borrar todo el historial» de la zona de peligro es el único **hard delete** real del repo (todo lo demás es soft delete).
- El contador del botón «Aplicar quincena (N)» usa la quincena de HOY y el diálogo recalcula por la fecha elegida: los dos números pueden no coincidir en los bordes del 15/30 (ventana ±3 del cliente vs +3 asimétrica de la RPC).
- La ficha rehace el saldo a mano en vez de usar `calcularSaldoPrestamo` (hay un `console.warn` admitiendo que puede no cuadrar); `GET /api/prestamos/movimientos` no tiene consumidor.

---

## Recordatorios (`/cheques`, key `cheques`)

**Qué es y quién lo usa.** Cheques posfechados por depositar + recordatorios sueltos, con lista, calendario y aviso diario
por Telegram (cron 9:15 a.m.). Roles admin y secretaria.

**Uso medido (al 4-sep-2026).** 19 cheques vivos: **14 creados el 27-jul en una sola sentada** (Jerusalem de Panamá, 5
empresas, fechas escalonadas ago-sep) y 5 de abril. 2 pendientes (uno venció el 31-ago y sigue pendiente). 17 ediciones,
última 28-ago. **La tabla `recordatorios` tiene 0 filas desde que existe** (24-ago): el rename a «Recordatorios» no produjo
ni un recordatorio.

**Cómo funciona por dentro.**
- Todo en `ChequesClient.tsx` (1.693 líneas): 5 pestañas (Pendientes default · Depositados · Vencidos · Rebotados · Recordatorios), toggle Lista/Calendario en la URL, swipe-to-deposit, lote con checkboxes, export Excel.
- `/api/cheques` (tabla `cheques`) y `/api/recordatorios` (tabla `recordatorios`) NO son duplicados: dos tablas, la misma pantalla. El cron `cheques-alert` une los dos en un solo Telegram; el viernes cubre el fin de semana.
- Crear cheque = 6 campos obligatorios (cliente, empresa, n°, monto, fecha, **vendedor**) + notas; hay borrador auto-guardado. Crear recordatorio = 2 obligatorios (texto, fecha).

**La tarea más frecuente, hoy.** El patrón real es el LOTE: un cliente entrega varios cheques posfechados de varias empresas
(medido: 14 el mismo día del mismo cliente). Hoy son 14 formularios completos = 6 campos × 14, re-tecleando cliente y
vendedor idénticos 14 veces.

**Sugerencias.**
1. **«Guardar y agregar otro del mismo cliente».**
   - **Quién lo sufre**: la secretaria en cada entrega multi-cheque (el 74% de los cheques vivos entró así). **Hoy**: 6 campos × N. **Después**: el primero completo; los siguientes conservan cliente/vendedor/empresa y piden solo n°, monto y fecha (~3 campos). **Ahorra**: la mitad del tecleo del caso real. **Tamaño: chico.**
2. **Crear el recordatorio tocando el día del calendario.**
   - **Qué**: Daniel pidió recordatorios «para ponerlos en el calendario», y hoy tocar un día del calendario no hace nada; el botón «+ Recordatorio» es el tercero de tres y la tabla lleva 0 filas. El código ya tiene el parámetro (`nuevoRecordatorio(fecha?)`) — nadie se lo pasa.
   - **Después**: tocar un día abre el modal con esa fecha puesta. **Ahorra**: no es de pasos, es de que la función que se pidió se pueda usar donde se pidió. **Tamaño: chico.** Si tras esto sigue en 0, la pestaña sobra y mejor retirarla.
3. **Vendedor opcional en el cheque.**
   - **Qué**: el servidor lo exige (400 si falta) pero no se muestra en la lista ni en la tabla — solo en el detalle y el Excel. Los 5 cheques de abril lo tienen vacío (era opcional entonces) y nada se rompió. **Después**: opcional, como Notas. **Tamaño: chico.**

**Lo raro que encontré.**
- El botón «Rebotar» aparece en cheques depositados pero el PUT bloquea `depositado → otro estado`: **un botón que siempre falla**.
- El PUT no valida `fecha_deposito` (el POST sí): editando se puede dejar una fecha inválida y el cheque desaparece del cron y del calendario.
- Un cheque de $18.393 venció el 31-ago y sigue «pendiente» al 4-sep — el flujo funciona (está en Vencidos), lo anoto como dato del negocio.
- Depositar tiene ConfirmModal Y undo de 5s (doble freno para algo deshacible); el lote deposita de a 1 (N viajes); rebotar lee TODA la cartera para anotar una línea; el estado «vencido» se recalcula en 6 lugares.
- `GET /api/cheques/[id]/historial` sin consumidor; banner de migración inalcanzable; el filtro del export triplicado.

---

## Usuarios y Data Health (`/admin/usuarios`, key `usuarios`)

**Qué es y quién lo usa.** Altas/ediciones de los 11 usuarios, sesiones activas, y la pestaña Data Health (7 checks de
integridad + heatmap 30 días). Solo admin — en la práctica, Daniel.

**Uso medido (al 4-sep-2026).** 11 usuarios activos, ninguno creado recientemente. Sesiones: 1.060 (862 revocadas por el
cron). Logins 30 días: secretaria 114 · bodega 80 · admin 79 · vendedor 40 · contabilidad 32 · gerente_acs 27 ·
gerente_boston 5. Data Health: los 7 checks vivos corrieron hoy, todos en «ok».

**Cómo funciona por dentro.**
- `page.tsx` (700 líneas, un componente): tarjetas + modal de usuario + sesiones colapsadas; `DataHealthTab` con modal de detalle y «Correr checks ahora» (que llama a la RUTA DE CRON `/api/cron/integrity-check` desde el navegador, con sesión admin).
- El servidor de usuarios está bien cerrado: contraseña única global (login sin nombre), guard anti-lockout, desactivar revoca sesiones.
- `sync-now`, `switch-vendedores` y `vendedor-mapping` viven bajo `/api/admin/` pero sus consumidores reales son Ventas/CXC/Catálogos y el checkout (mapeo `fg_user_switch_vendedor`, sin el cual el pedido no sale a Switch). Nada de eso está muerto.

**La tarea más frecuente, hoy.** Casi ninguna — crear usuario es 1 clic + 3 campos y pasa pocas veces al año. Módulo sano.

**Sugerencias.**
1. **Que abrir el modal de edición no toque Switch.**
   - **Qué**: editar CUALQUIER cosa de un usuario (hasta el nombre) dispara `VendedorSwitchSection`: 1 GET de mapeos + 1 GET por marca contra Switch EN VIVO. Como la sesión de Switch es por usuario (el sistema entra como `daniel`), abrir ese modal puede expulsar a un cron o a Daniel del panel.
   - **Después**: la sección de vendedor Switch carga solo al desplegarla. **Ahorra**: un riesgo operativo, no clics. **Tamaño: chico.**
2. Nada más: la lista de 11 usuarios no necesita buscador y Data Health muestra exactamente los 7 checks vivos.

**Lo raro que encontré.**
- «Revocar todas (N)» las sesiones NO pide confirmación mientras revocar UNA sí — la asimetría está al revés.
- El heatmap de 30 días agrupa por fecha UTC mientras todo lo demás usa hora de Panamá: puede correrse un día en el borde.
- Rama muerta en `VendedorSwitchSection` (el 503 de «falta activar» ya no puede ocurrir); `total_runs_30d`/`last_run` viajan en la API y no se pintan; el PATCH devuelve `sesionesRevocadas` y la pantalla lo ignora.
- El check `last_upload_age_cxc` conserva el nombre de la era del CSV pero ya mide la frescura de `switch_estadocuenta` (solo las 6 del grupo, Boston excluida a propósito) — verificado en `integrity-checks.ts:122`; solo el nombre confunde.
