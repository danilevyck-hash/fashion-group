# Asistencia y Planilla · Comisiones · Gastos

> Referencia de los tres módulos, medida contra producción el **4-sep-2026**.
> No repite `cxc/CLAUDE.md`: apunta a él (§ Invariantes por módulo, § Dónde vive cada dato)
> y escribe lo que le falta. El post-mortem largo de Asistencia vive en
> `docs/postmortems/asistencia-planilla.md`; el de Gastos en `docs/postmortems/gastos-mayor-banco.md`;
> el de Comisiones dentro de `docs/postmortems/ventas-referencia.md`.
>
> ⚠️ **No incluye Préstamos** (`/prestamos`) — está documentado aparte. Aquí solo aparece
> por donde se toca con la planilla (la casilla «Préstamo»).

---
---

# Asistencia y Planilla (`/asistencia`, key `asistencia`)

## Qué es

El módulo que convierte lo que marcó el reloj biométrico de la entrada en **la planilla quincenal
que firma la contadora**. Cubre las 3 empresas que comparten ese reloj —Confecciones Boston,
Vistana y Fashion Wear— y hoy son **40 fichas** (`asistencia_personas`, medido). Nació el
3-ago-2026 y es el módulo más grande de los nacidos después del 5-jul (45 commits, 15 rutas API,
36 archivos en `src/lib/asistencia/`).

Resuelve dos problemas que antes se hacían a mano en Excel: (1) medir tardanzas, ausencias y horas
extra sin que nadie las teclee, y (2) calcular el pago de la quincena con esos minutos, con los
seguros, las deducciones y el neto — cotejado **al centavo** contra el Excel de la contadora.

## Quién entra

| Rol | Qué ve | De dónde sale |
|---|---|---|
| `admin` (daniel, alberto) | todo, las 3 empresas | `asistenciaRoles()` + `aprobacionesRoles()` |
| `contabilidad` (usuario `Contabilidad`) | todo, las 3 empresas; **aprueba** horas extra y **cierra** la quincena | entró el 6-ago-2026 (planilla) y el 27-ago (aprobar) |
| `secretaria` (andrea, Angela) | el módulo entero **por rol**, pero **NO lo tienen**: su `modulos_override` no incluye `asistencia`, así que el guard les contesta 403 | ver abajo |
| `bodega` (Julio Garay, cuenta COMPARTIDA) | **SOLO la pestaña Aprobaciones**, y `/api/asistencia/planilla` le contesta **sin el bloque de dinero** | `soloApruebaRoles()` |
| `gerente_boston` (david) | no entra a `/asistencia`; usa `/boston` › Planilla, que llama a la MISMA ruta. Aprueba solo Boston | `MODULOS_PLANILLA = [asistencia, boston]` |

- **El candado NO es el rol, son los MÓDULOS EFECTIVOS** (`src/lib/asistencia/guard.ts`,
  `requireAsistencia`). Lee `modules` de la cookie HMAC-firmada — la misma lista que pinta el menú.
  🩸 Hasta el 31-ago-2026 `requireRole` solo miraba el rol y las dos secretarias, que **sí son
  `secretaria`** pero tienen `modulos_override` sin `asistencia`, recibían los 40 sueldos entrando
  por URL: **26 respuestas no-403 medidas**, hoy 2 (las de David, legítimas). Fail-closed: sin
  `modules` en la cookie, 403. ⚠️ Precio: un cambio de permisos entra en el próximo login.
- **De qué empresas aprueba cada uno** sale de `asistencia_aprobador_empresa` (6 filas, medidas):
  `Bodega` → fashion_wear + vistana · `Contabilidad` → las 3 · `david` → confecciones_boston ·
  `admin` no tiene filas y pasa siempre (`alcanceDe`). **Todo o nada**: una persona ajena en el
  lote → 403 y no se escribe ni una fila (`puedeAprobarA`).
- Rutas que contestan **403** a `bodega`: las 13 de `/api/asistencia/*` menos `planilla`
  (recortada), `aprobaciones` y `dias-con-datos`.
- **Cerrar la quincena**: `cerrarPlanillaRoles()` = admin + contabilidad. `secretaria` está en
  `MIRAN_PERO_NO_CIERRAN` — genera el cuadro y lo mira, no lo cierra.

## Las pantallas

Seis pestañas + un botón «?» de ayuda, en `?tab=` (replace, el Atrás no cicla).
El **orden decide dónde aterriza cada rol**: la primera VISIBLE (`AsistenciaClient.tsx`).

### 1. Reporte (pestaña por defecto desde el 2-sep-2026)
Daniel: *«primero va reporte, ¿por qué es el segundo tab?»* — primero se ORDENA la asistencia,
después se paga.

- **Qué se ve**: una fila por persona con `Días · Veces tarde · Min · Extra · Exceso (almuerzo) ·
  Ausen. · A revisar`; al abrir la fila, el detalle día por día con las **4 marcas con segundos**
  (`08:04:39`), y las columnas `Día · Entrada · Sale almz. · Vuelve · Salida · Tarde · Exceso ·
  Sale temprano · Extra · No trabajado · Revisar`.
- **Qué se puede hacer**: elegir rango de fechas (calendario de rango único), buscar persona
  («Buscar persona» — busca por código, por el nombre del reloj y por el del directorio),
  **corregir una hora** (botón ✎ en cada marca), **agregar una marcación que el reloj no registró**,
  deshacer una corrección, bajar Excel y PDF.
- **La tarea más frecuente — corregir una hora, 4 pasos**: abrir la fila de la persona → tocar el
  ✎ de la marca → escribir la hora nueva y **el motivo (obligatorio; el botón está apagado y dice
  qué falta)** → Guardar. Queda: *«Reloj 08:47:12 → 08:00 · "se le dañó el carro, avisó" ·
  Contabilidad · 13 ago»*.
- Avisos: *«N horas corregidas a mano en N días. Los números de abajo ya cuentan con eso»* ·
  «Todavía no marcó — el día va corriendo» · cuántas personas quedaron fuera del rango por alta/baja.

### 2. Planilla
El cuadro quincenal. **Abre VACÍA** (1-sep-2026): hay que elegir período y tocar **Generar**.

- **Elegir el período**: «Elige el período que vas a pagar» — calendario de rango único (se quitaron
  los 4 presets de quincena: el corte real de Fashion Group es variable, a veces del 28 al 10) +
  selector de **Empresa** (obligatorio para cerrar).
- Botones: **Generar** → **Regenerar** (aparece cuando algo se tocó por debajo) → **Cerrar quincena**
  → **Reabrir la quincena**. 🔴 Nada se recalcula solo: aprobar un préstamo o escribir un monto marca
  el cuadro como VIEJO, no lo rehace.
- **19 columnas** (escritorio: tabla que se arrastra dentro de su caja, columna Persona pegada;
  celular: tarjetas): `Persona · Salario quincenal · Extra 1.25 · Extra 1.50 · Excedente · Domingos ·
  Feriados · Ausencias · Tardanzas · Total bruto · Seguro social · Seguro educativo · ISR · Préstamo ·
  Terceros · Mercancía · Total deducciones · Otros servicios (+) · Neto a pagar`.
- **Los 5 montos que se escriben a mano** (editables en la celda, se guardan con `POST`):
  **ISR · Préstamo · Terceros · Mercancía · Otros servicios**. ⚠️ «Otros servicios» **SUMA**
  (es un pago extra), los otros cuatro restan. Se guardan por QUINCENA
  (`asistencia_planilla_manual.quincena`, CHECK que solo acepta `2026-08-2`), así que **en un rango
  libre no se aplican y las celdas salen apagadas**, con el aviso arriba.
- **Cuatro grupos, no dos** (`grupoDeLinea`, fuente única de la pantalla, el orden, los totales,
  el Excel y el PDF): **pagada** · **Tú decides** (gris, con el motivo y el quincenal que le
  correspondería, FUERA del total) · **Falta un dato** (ámbar, con botón a Configuración) ·
  **fuera de planilla** (gris, servicio profesional).
- **Bloque «Préstamo por descontar»**: la casilla se llena sola desde el módulo Préstamos y hay que
  **Aprobar** (rol `asistenciaRoles()`, no `aprobacionesRoles()` — es plata del sueldo).
- Avisos, en este orden: período abierto («Esta quincena todavía no termina — falta 1 día hábil») ·
  vacaciones ya pagadas que no se pagaron (con nombre, rango y monto) · **horas extra sin aprobar**
  (ámbar, **cada persona es un enlace** a `?tab=aprobaciones&persona=<código>&desde&hasta`) ·
  reparto rechazado · préstamo sin aprobar · préstamo sin persona (rojo) · código sin ficha ·
  rango libre («NO es una quincena: sueldo base al X %»).
- **Cerrar**: modal que dice **empresa, fechas, cuánta gente y el neto** antes de confirmar.
  Frenos que devuelven **409 y no dejan cerrar**: horas extra sin aprobar, préstamo sin aprobar.
  **Reabrir** pide motivo obligatorio («¿Por qué se reabre?»).

### 3. Justificaciones
Lista y alta de justificaciones. Campos: **Persona** (obligatorio) · **Días** (desde/hasta,
obligatorio) · **Motivo** (obligatorio, desplegable) · **Nota (opcional)** ·
casilla **«No justifica el día entero»** que abre dos horas (permiso por horas).
Los 4 motivos que se ofrecen: **Incapacidad · Catástrofe · Escolares · Trabajo de vendedor**
(`MOTIVOS_JUSTIFICACION`). Se leen pero **ya no se ofrecen**: `Permiso · Luto · Otro ·
Trabajo fuera de la oficina` (`MOTIVOS_RETIRADOS`). Borrar es **DELETE real** (única tabla del
módulo sin soft delete).

### 4. Vacaciones
Tabla propia, no un motivo de justificación. Campos: **Persona · Días (desde/hasta) ·
«¿Ya cobró estos días antes?»** (la casilla PREGUNTA; la consecuencia solo aparece al marcarla,
`efectoDelInterruptor`). Debajo, **«Saldo por persona»**, con «Falta el saldo» / «Falta la fecha de
ingreso» cuando no se puede calcular. Borrar es **soft delete** (`deleted = true`).

### 5. Aprobaciones (no la ve todo el mundo)
Autorizar las horas extra que el reloj midió. **La unidad es el DÍA** (27-ago-2026):
Daniel, *«debe de ser que el usuario entre y vea por dias quienes y cuantas horas, y pueda aprobar
seleccionando todos o individualmente, por dia, por semana»*.
**Tocar la casilla aprueba — no hay botón de confirmar** (*«con un clic se aprueba y ya, maximo 3
clics»*). Se agrupa por semana («Semana del 17 – 23 ago») y por día; día verde = todo aprobado.
Con `?persona=` en la URL: abre el primer día pendiente de esa persona, la resalta y muestra el chip
«Mostrando a Fulano — ver a todos ×»; **no filtra a los demás**.

### 6. Configuración
Cuatro secciones plegables que **cargan sus datos recién al abrirse**:
1. **Personas** — Nombre · **Salario mensual** · **Jornada por semana** (40 o 48) · **Empresa** ·
   «Empezó a trabajar» · «¿Se fue de la empresa?» (Último día de trabajo + ¿Por qué salió?:
   renuncia/despido/otro) · «¿Se le paga por planilla?» (Va en la planilla / **Servicio profesional**)
   · «¿Se le descuentan los seguros?» · **Base para los seguros** (por quincena) ·
   «¿Marca en el reloj?» (**No marca el reloj (sueldo fijo)**) · «Días de vacaciones que le quedan
   hoy». Muestra **Rata / hora** y el **Total** calculados. Tarjeta **«Se reparte en»** de SOLO
   LECTURA cuando el sueldo está partido entre dos empresas.
2. **Horarios** — «Hora de salida, persona por persona». Entrada y almuerzo son **fijos**
   (08:00 y 30 min) y se muestran como dato, no como campo.
3. **Feriados y cierres** — «Los días que no cuentan como ausencia de nadie».
4. **Reglas del cálculo** — Tolerancia de tardanza · Mínimo para contar hora extra · Hora extra de
   día / de noche · Hora de corte de la tarde · Domingos y feriados · Divisores (40 h / 48 h) ·
   Seguro social · Seguro educativo · Excedente (desde cuántas horas + recargo). Al pie,
   **«Esto no se cambia desde aquí»** (entrada 08:00, almuerzo 30 min, los cortes de quincena).

### Ayuda «?» (`ComoFuncionaTab`) — no es pestaña
Explica cómo se lee la marcación. Los motivos que nombra salen de `MOTIVOS_JUSTIFICACION`, no de
una lista escrita a mano.

## Los datos

Grano y llave por tabla, medido el 4-sep-2026. Ninguna tabla del módulo usa `deleted` **salvo
`asistencia_vacaciones`**.

### `asistencia_marcaciones` — 6.081 filas 🔢
Llave natural: `(dispositivo, evento_id)` (índice único, es el anti-duplicado).
🔴 **Append-only**: barrido estático prohíbe `update`/`delete`/`upsert` sobre ella
(`asistencia-correcciones.test.ts`). El ÚNICO upsert admitido es el del ingest, con
`ignoreDuplicates: true`.

| columna | para qué | quién escribe | quién lee | lleno |
|---|---|---|---|---|
| `id` uuid | ata la corrección a SU marca | ingest | reporte, planilla, correcciones | 6.081 |
| `dispositivo` | qué reloj | ingest | filtro del reporte | 6.081 — **un solo valor: `reloj cboston`** |
| `evento_id` | `serialNo` de Hikvision | ingest | el índice único | 6.081 |
| `empleado_codigo` | quién marcó | ingest | todo | 6.081 (**0 nulos**) |
| `empleado_nombre` | nombre del reloj | ingest | reporte, horarios, configuración | 🔴 **0 de 6.081 — nadie la llena**. El reloj la manda vacía; el nombre sale de `asistencia_personas` vía `crearDirectorio` |
| `ocurrio_en` timestamptz | el instante, **con segundos** | ingest | todo el cálculo | 6.081; rango 1-jul-2026 → hoy |
| `tipo` | `attendanceStatus` de Hikvision | ingest | 🔴 **NADIE**. Ningún `select` lo pide | 6.081 (`checkIn` 6.075 · **la cadena literal `undefined` 6** — dato sucio) |
| `raw` jsonb | el evento crudo de Hikvision | ingest | 🔴 **NADIE**. Ningún `select` lo pide | 6.081 |
| `created_at` | cuándo se guardó | default | nadie | 6.081 |

### `asistencia_personas` — 40 filas (llave `empleado_codigo`)
confecciones_boston 22 (21 activos) · vistana 10 (9) · fashion_wear 8 (7).

| columna | medido |
|---|---|
| `salario_mensual` | 36 de 40 con valor (Boston 21 · FW 7 · Vistana 8) |
| `jornada_semanal` | 40 h → 26 personas · 48 h → 14 |
| `empresa` | siempre llena; es lo que separa las 3 planillas |
| `servicio_profesional` | **2** (las dos en vistana) |
| `paga_seguros = false` | **30 de 40** (Boston 18 · FW 8 · Vistana 4) |
| `seguros_base_quincena` | **1 sola ficha** (Rodrigo, $175 — la contadora) |
| `no_marca_reloj` | **1** (EDWIN GOMEZ, código `V-EG`, vistana) |
| `fecha_ingreso` | 37 de 40 |
| `fecha_salida` / `motivo_salida` | 4 |
| `saldo_vacaciones_dias` / `_corte` | **2 fichas**. Van juntos o ninguno (CHECK) |

### El resto

| tabla | filas | grano / llave | quién escribe | notas medidas |
|---|---|---|---|---|
| `asistencia_horarios` | 40 | `empleado_codigo` | PUT de Horarios | **todas** entrada `08:00`, almuerzo `30`. Salida: `16:30` ×27 · `17:00` ×13. `empleado_nombre` se escribe pero no se lee |
| `asistencia_feriados` | 22 | `fecha` | Configuración › Feriados | 2026-01-01 → 2027-12-25 |
| `asistencia_reglas` | **1 (singleton, `id=1`)** | — | Configuración › Reglas | ⚠️ `hora_corte_nocturno` en producción es **18:01**, no el default 18:00. `almuerzo_default_min` = 30 y **nadie la lee** desde el 13-ago-2026 |
| `asistencia_justificaciones` | 23 | `id` uuid | Justificaciones | motivos: Catástrofe 13 · Incapacidad 6 · Trabajo de vendedor 2 · Escolares 1 · **Trabajo fuera de la oficina 1** (nombre viejo, vivo). 19 con `hora_desde/hasta`. Registrado por: Contabilidad 22 · Daniel 1. **DELETE real** |
| `asistencia_vacaciones` | 2 | `id` uuid, soft delete `deleted` | Vacaciones | las dos de ELOYN MENDOZA (código 29): 16-jul→13-ago y 14-ago. **`ya_pagadas = false` en las dos** |
| `asistencia_correcciones` | 8 | `id` uuid | Reporte › ✎ | 3 son marcas **AGREGADAS** (`marcacion_id` null) · 2 anuladas (`anulada_en`) · **todas creadas por `Contabilidad`** |
| `asistencia_horas_extra_aprobadas` | **521** | `(empleado_codigo, fecha)` | Aprobaciones | 389 aprobadas / 132 no. Rango **1-jul → 26-ago**: 🔴 **cero días aprobados en septiembre**. Por empresa: Boston 196 (111 apr) · vistana 171 (145) · fashion_wear 154 (133). `marcado_por`: `Bodega`, `Contabilidad`, `daniel` |
| `asistencia_prestamo_aprobado` | 13 | `(quincena, empleado_codigo)` | Planilla › bloque Préstamo | todas de la quincena `2026-08-2`, todas por `Contabilidad`. `monto_visto` es el TESTIGO |
| `asistencia_planilla_manual` | 26 | `(quincena, empleado_codigo)` | celdas de la Planilla | quincenas `2026-08-1` y `2026-08-2`. Suma de los 5 montos: **$898,86** |
| `asistencia_reparto_empresa` | 2 | `(empleado_codigo, empresa)` | 🔴 **solo por SQL — no hay pantalla** | JULIO GARAY (11): vistana $800 · fashion_wear $200 con `paga_horas_extra`. Índice único parcial: una sola parte con extras |
| `asistencia_aprobador_empresa` | 6 | `(usuario, empresa)` | 🔴 **solo por SQL** | ver «Quién entra» |
| `asistencia_planilla_guardada` | **0** | `id` uuid | POST de cierre | 🔴 **nunca se ha cerrado una quincena**. Estados `cerrando → cerrada → reabierta` |
| `asistencia_planilla_guardada_linea` | **0** | `id` bigint, FK `planilla_id` | el cierre | **63 columnas**: las 24 de `DineroLinea` + las 20 de `HorasPersona` + identidad. Los mapas son `Record<keyof …>`: agregar un campo sin agregar la columna pone el **build rojo** |
| `asistencia_dispositivos` | 1 | `dispositivo` | ingest + vigía | `reloj cboston`, agente **v1.1.0**, `fallos_seguidos = 0`, leído hasta hoy |

**Códigos que marcan y no tienen ficha (hoy)**: **55** (7 marcas) y **39** (4 marcas), los dos desde
el 1-sep-2026. Salen del cuadro (`separarSinFicha`) y se muestran UNA vez arriba.
**Fichas sin ninguna marca**: ERIC APARICIO (36, dado de baja) y EDWIN GOMEZ (`V-EG`, `no_marca_reloj`).

## De dónde vienen los datos

🔴 **Asistencia NO toca Switch.** Su única fuente externa es el reloj.

### El reloj — Hikvision DS-K1T804AEF, firmware V1.4.1, en `192.168.10.10`
- **No se puede llamar desde Vercel**: es una IP privada, y el reloj tampoco sabe empujar datos.
  Por eso hay un **agente** que corre en una PC de la oficina (`scripts/agente-reloj/`,
  instalación en `INSTALAR-WINDOWS.md`).
- **Endpoint del reloj**: `POST /ISAPI/AccessControl/AcsEvent?format=json` con
  `{ AcsEventCond: { searchID, searchResultPosition, maxResults, major: 5, minor: 0,
  startTime, endTime } }`. Autenticación **Digest**.
  🩸 `searchID` **no puede pasar de 20 caracteres** (medido largo por largo el 7-ago-2026:
  20 → 200, 21 → 400 `badParameters`). Con `randomUUID()` (36) el agente **nunca** pudo traer una
  marcación y el error solo decía «badParameters».
- **Cada cuánto**: `VUELTA_MINUTOS = 3`, ventana `VENTANA_DIAS = 3` hacia atrás (rellena solo un
  fin de semana con la PC apagada); cuando detecta un hueco pide más días. El estado («hasta dónde
  leí») **no vive en disco**: vive en `asistencia_dispositivos.leido_hasta`.
- **Cómo entra**: `POST /api/asistencia/ingest` con `Authorization: Bearer <ASISTENCIA_INGEST_SECRET>`
  (comparación `timingSafeEqual`; también acepta `x-asistencia-secret`). Tope **5.000 eventos** por
  lote. La URL va **con `www`**: sin él la página redirige y se pierde la llave.
- **Qué se descarta, y se dice** (`normalizarEventos`, módulo puro): sin `serialNo` («no se puede
  evitar duplicarlo»), fecha/hora inválida, y **sin `employeeNoString`** — 🩸 medido al cargar julio
  entero, **5.845 de 8.785 eventos (66%) vienen sin código**: huellas no reconocidas, puertas
  abiertas desde adentro y eventos del propio aparato.
- **Qué se guarda**: `serialNo → evento_id`, `time → ocurrio_en` (⚠️ **con su offset intacto**;
  recortarlo movería el reporte 5 horas), `employeeNoString → empleado_codigo`, `name`,
  `attendanceStatus → tipo`, y el evento entero en `raw`.
- **`DISPOSITIVO = "reloj cboston"` no se puede cambiar**: es la mitad de la llave anti-duplicado.
  🩸 Ya pasó: la pantalla vieja «Cargar Excel» mandaba `RELOJ_FG` con otro `evento_id` y las
  134 marcaciones quedaron **todas duplicadas** — el almuerzo de alguien salió medido en 4 horas.
  Esa vía se eliminó y hay candado (`asistencia-una-sola-entrada.test.ts`).

### Si el reloj (o la PC) se cae
- El agente reporta el error a `/api/asistencia/ingest` (`{ error }`). A los **3 fallos seguidos**
  (`FALLOS_PARA_ALERTAR`) sale un 🔧 SISTEMA a Telegram; cuando vuelve, un «recuperado».
- Cron **`/api/cron/asistencia-vigia`** — **15:00, 20:00 y 22:15 UTC** (10:00 a.m., 3:00 p.m. y
  5:15 p.m. Panamá, todos los días, 3 entradas en `vercel.json`): si el reloj lleva **+6 h**
  (`HORAS_PARA_VIGIA`) sin reportar, avisa. Y una segunda regla: si quedó un **hueco de más de
  15 días** (`DIAS_RECUPERACION_AGENTE`) que el agente ya no puede rellenar solo, avisa una vez
  y avisa cuando se cierra.
- **La pantalla lo dice sola**: el banner `EstadoReloj` muestra `al_dia / callado (>12 min) /
  con_error / nunca`, la versión del agente y un botón **«Traer ahora»** que escribe `pedido_en`
  y el agente atiende en su próxima vuelta.

### Lo que NO viene del reloj
Salarios, empresas, horarios, feriados, reglas, justificaciones, vacaciones, aprobaciones y los
5 montos manuales los **teclea gente** desde Configuración y las otras pestañas. El descuento de
préstamo lo **propone** el módulo Préstamos (ver «Con qué conecta»).

## Las reglas que ya están fijadas

Las de plata, con su candado. La historia completa (citas, mediciones, mutaciones) está en
`docs/postmortems/asistencia-planilla.md`; la regla vigente, en `CLAUDE.md` § Asistencia y planilla.

**Del reloj al minuto** (`src/lib/asistencia/reporte.ts`, módulo puro)
1. Entrada 08:00 con **tolerancia configurable (hoy 10 min)**, y pasada la tolerancia **se cuenta
   desde las 8:00**, no desde el fin de la gracia. *«si al que llega 8:11 le contaras 1 minuto, le
   acabás de enseñar que la entrada es 8:10.»* — `asistencia-reporte.test.ts`.
2. **Almuerzo fijo de 30 min** (`ALMUERZO_FIJO_MIN`). El PUT de Horarios escribe 30 **mire lo que
   mire el cuerpo**; la columna por persona no se borra y el cálculo la sigue leyendo —
   `asistencia-almuerzo-fijo.test.ts` (13 casos, 10 mutaciones cazadas).
3. **Hora extra: mínimo 10 min, y BRUTAS** (1-sep-2026). El mínimo es una **PUERTA**, no un
   descuento: pasado el umbral se paga TODO desde el primer minuto (*«si se queda 25 minutos,
   ¿cuántos le pagás?» → «25 minutos»*). 🔴 **El atraso del mismo día YA NO se resta**
   (*«No, van separadas»*) — antes el atraso se cobraba dos veces, invisible.
4. **Un día mal marcado SÍ suma**, y además se marca «Revisar». Daniel: *«quiero que sume lo que
   marca la persona pero si se detecta anomalía que también marque para revisar… es responsabilidad
   de ellos»*. El resumen separa cuántos de esos minutos vienen de días mal marcados.
5. 🔴 **Los días que no pasaron no se cuentan**: la comparación es `fecha >= diaEnCurso` (no `===`),
   con el día de **Panamá** (`hoyPanama()`, UTC−5 fijo). 🩸 Antes la Planilla no le pasaba
   `diaEnCurso` al motor y las **33 personas** salían ausentes HOY = **$866,99**; abierta la
   quincena un día 3, los ~9 días hábiles futuros contaban como falta a ~$870 cada uno —
   `asistencia-dias-que-no-pasaron.test.ts` (38 casos, 16 mutaciones cazadas).
6. **La marcación se mide AL SEGUNDO** (*«y la marcancion tiene que ser al segundo, porque redondeas
   minutos»*). `segundosDelDia` es la unidad del día; los umbrales siguen expresados en minutos.
   Las marcas se **muestran** con segundos, en pantalla y en el papel —
   `asistencia-segundos.test.ts`.
7. 🔴 **La marcación del reloj nunca se edita ni se borra.** La corrección va ENCIMA, en
   `asistencia_correcciones`, con **motivo obligatorio en las tres capas** (botón apagado · 400 de
   la ruta · CHECK `btrim(motivo) <> ''`) y firma de la sesión (`auth.userName`, nunca del cuerpo).
   Deshacer = `anulada_en`, nunca DELETE. Una corrección **no puede mover una marcación de DÍA**:
   el día sale de la MARCACIÓN, no del cuerpo — `asistencia-correcciones.test.ts` (42 casos,
   13 mutaciones cazadas). Las correcciones se aplican **antes** de llamar al motor, en las DOS
   rutas (reporte y planilla): si no llegaran al pago, la pantalla diría una cosa y la planilla otra.
8. **Trabajo de vendedor no es una ausencia**: no descuenta y no genera extras. `esTrabajoDeVendedor`
   acepta **los dos nombres** —el nuevo y `Trabajo fuera de la oficina`, que es lo que dice la fila
   viva de Rodrigo—: un `===` contra el nombre nuevo la habría convertido en ausencia el día del
   merge — `asistencia-motivo-trabajo-fuera.test.ts`.
9. 🔴 **Una vacación no es una justificación**: tabla y pestaña propias, y «Vacaciones» **no está**
   en `MOTIVOS_JUSTIFICACION` ni en `MOTIVOS_RETIRADOS` (ponerla en la segunda la devolvería al
   desplegable por la puerta de atrás). En `clasificarDia` la vacación se mira **PRIMERO**, antes
   que el feriado: no genera horas, ni tardanza, ni ausencia; las marcas de ese día se muestran
   pero no cuentan (`marcasIgnoradas`) — `asistencia-vacaciones.test.ts`.
10. 🔴 **El motor honra las vacaciones cargadas pase lo que pase**: dejar de leer
    `asistencia_vacaciones` convertiría los días de ELOYN en ausencias y le comería una quincena
    **en silencio** — `vacaciones-el-motor-las-honra.test.ts` corre el motor sobre su rango REAL y
    verifica en dólares (con la vacación: `ausencias = $0.00`; sin ella: 9 ausencias de día completo).

**Del minuto al dólar** (`src/lib/asistencia/planilla.ts`, módulo puro, 2.190 líneas)
11. `Rata/hora = salario mensual ÷ divisor de su jornada` (173,33 o 208), **redondeada a centavos**
    con la MISMA función que muestra Configuración (`rataPorHoraCalculo`) — la contable trabaja a
    2 decimales y ver `$3,0201` donde su planilla dice `$3,02` rompe la confianza.
12. `Quincenal = salario ÷ 2`. Un **rango libre** prorratea por la **fracción de QUINCENA** cubierta
    (`factorBaseDeRango`) — la única regla que deja la quincena en factor exactamente 1. Prorratear
    por días del MES daría 15/31 = 0,4839 y **un 3 % menos en TODAS las planillas**.
    🩸 Un factor `NaN`/0/negativo cae en **1**, nunca en $0 (`centavos(NaN)` = 0 = planilla de $0
    pagada en silencio). El guard va en `calcularDinero`, no solo en `armarPlanilla` —
    `asistencia-planilla-rango.test.ts`.
13. 🔴 **Un día no trabajado vale OCHO HORAS, siempre** (`MIN_DIA_NO_TRABAJADO`), no la jornada del
    horario. 22 de 31 personas tienen 8,5 h de jornada: medido, el medio punto costaba **$20,88 de
    descuento de más** en `2026-07-2` y **$6,71** en `2026-08-1`. Se llama «día no trabajado» y no
    «ausencia» porque valúa DOS hechos: la ausencia y la vacación «ya se le pagó» —
    `asistencia-dos-reglas-contadora.test.ts`.
14. 🔴 **El excedente NO se usa**: los minutos nocturnos van todos al 1,50 y la columna «Excedente»
    queda en **$0,00**, igual que en el Excel de la contadora (*«Excedente de 9 horas es 1.5»*).
    Medido: el 2,625 le pagaba **$58,32 de más** a ocho personas en `2026-07-2`. Los dos parámetros
    siguen guardados y validados, y **la pantalla dice que hoy no calculan nada**.
15. **Más de 30 min tarde cambian de COLUMNA, no de precio** (`MINUTOS_TARDE_QUE_SON_AUSENCIA`).
    Daniel: *«Los 45 minutos, igual que una tardanza. La columna Ausencia es solo para que lo veas»*.
    El reparto está escrito para que la suma **no pueda moverse**: `tardanzas = tardanzaTotal −
    ausenciaPorTardanza` (el RESTO, no un cálculo nuevo) — `centavos(a)+centavos(b) ≠ centavos(a+b)`.
16. **Seguros: 9,75 % + 1,25 % sobre el BRUTO**, y **van juntos o no van** (*«esto es junto, no es
    separado cada uno»*). Una **base propia** (`seguros_base_quincena`) reemplaza al bruto pero
    **NO los enciende**: quien tiene los seguros apagados sigue en $0,00 aunque tenga base —
    `asistencia-seguros.test.ts` · `asistencia-seguros-base.test.ts`. 🩸 A Rodrigo se le retenían
    **$25,18 de más por quincena** antes de la base.
17. 🔴 **`Neto = bruto − deducciones + otros servicios`** (`FORMULA_NETO`). «Otros servicios» **SUMA**.
    🩸 Restarlo le quitaba **dos veces** el monto a quien tuviera algo ahí; la fórmula de la
    contadora, celda por celda, es `U7 = =+L7-S7+T7` — `asistencia-planilla.test.ts`.
18. 🔑 **Cuando el sistema no puede saber, se abstiene** — `dinero: null` y fuera del total:
    servicio profesional · ingreso o salida a mitad del período · justificación que cubre el período
    completo **y la persona no marcó NI UN DÍA**. Salen en **«Tú decides»**, con el motivo escrito y
    el quincenal COMPLETO que les correspondería (nunca una fracción calculada). 🩸 A YEISHKA
    (ingreso 10-ago) el sistema le daba neto **$133,34 sobre $300**; el arreglo «obvio» (no contarle
    esos días) le pagaba **$300 por 6 de 15 días**: las dos cuentas automáticas están mal por lados
    opuestos.
19. …**pero quien cobra fijo y no marca SÍ cobra** (`no_marca_reloj`, EDWIN GOMEZ). Y el reloj se le
    ignora **SIEMPRE**, no solo cuando no hay marcas: si mañana alguien usa su código, no puede
    aparecerle una ausencia inventada — `asistencia-sueldo-fijo.test.ts`.
20. 🔴 **La rata de un sueldo repartido sale del sueldo COMPLETO** (`$1.000 × 12 ÷ 52 ÷ 40 = $5,77`,
    la misma en las dos empresas). Con la rata de sus $200 su hora valdría **$1,15** y sus horas
    extra —que se pagan justamente ahí— se pagarían **cinco veces menos**. `validarReparto` exige
    **cinco** cosas y **rechaza entero** (volviendo a la planilla de ayer) si alguna falla; el
    rechazo **se dice en pantalla con nombre y motivo**. Cada columna del reloj cae en **una sola**
    línea — `asistencia-reparto.test.ts` (55 casos) + `asistencia-reparto-route.test.ts` (12, la
    ruta REAL); 28 mutaciones, 28 cazadas.
21. 🔴 **Solo se pagan las horas extra APROBADAS, y la aprobación es POR DÍA**. El filtro va al
    SUMAR (`medirHoras`), no en `armarLinea`: la aprobación es parcial (martes sí, miércoles no) y
    un booleano al final de la línea solo sabe decir «todo o nada» — `asistencia-aprobaciones.test.ts`.
22. 🩸 **El aviso «horas extra sin aprobar» y el freno del cierre leen lo que quedó AFUERA, no lo ya
    pagado** (3-sep-2026, commit `a386c658`). Leían `extraMedido`, que `medirHoras` ya había dejado
    sin los días no aprobados: con **todo** sin aprobar el aviso decía **0 personas** y el cierre
    **no frenaba**; con aprobación parcial decía los minutos **aprobados** como «sin aprobar».
    Ahora `LineaPlanilla.extraNoAprobada = { minutos, diurnoMin, nocturnoMin, monto }` se valúa con
    `resumenExtra`, **la misma función** que valúa lo pagado, así el monto del aviso es exactamente
    lo que se pagaría al aprobar. **Medido, quincena 1–15 sep al 3-sep**: el aviso viejo decía 0;
    el real, **24 personas · 1.213 min = 20,22 h · $81,19** (Boston 11 · FW 8 · Vistana 5) —
    `planilla-aviso-extras-sin-aprobar.test.ts`, 26 mutaciones, 26 cazadas.
23. 🔴 **El servicio profesional no genera horas extra** (3-sep-2026, commit `f52ea159`).
    Daniel: *«yulisa marca pero no deberia de calcular ya que es salario fijo, es solo para ver sus
    tardanzas y ausencias»*. `sinHorasExtra(h)` pone en cero extra diurna/nocturna, excedente,
    lo no aprobado con su desglose, domingo y feriado, y se aplica **antes** de `extraMedido` /
    `extraNoAprobada` (así los dos quedan en `null` sin una segunda condición que olvidar).
    Tardanza, ausencia, vacaciones, sábado y días trabajados pasan intactos. Aprobaciones **no la
    ofrece**; una aprobación vieja suya se **ignora, no se borra**. El aviso pasa a **23 personas ·
    19,50 h · $81,19** (el monto no se mueve: el suyo era `null`) —
    `aprobaciones-no-lista-servicio-profesional.test.ts` · `reporte-servicio-profesional-sin-extras.test.ts`.
24. **El sábado se mide y NO se paga**: el cuadro de la contable no tiene columna para el sábado y
    aquí no se inventa un recargo. Se avisa cuántas personas tienen sábado, que es lo contrario de
    perderlo en silencio.
25. **Saldo de vacaciones**: arranca de DOS datos que escribe contabilidad (saldo + fecha de corte,
    **juntos o ninguno**, CHECK) y **sin los dos no hay saldo, ni cero** (`saldo: number | null`).
    30 días por cada **11 meses** (once, no doce), el bloque en curso se **trunca**, y solo resta lo
    posterior al corte. Los días del saldo se cuentan **de calendario** (con domingos y feriados),
    **NO** con el filtro «hábil y no feriado» de la planilla: son dos preguntas distintas.
    **Medios días sí, cuartos no** (`numeric(4,1)` + CHECK de múltiplos de 0,5).
    🩸 El saldo «ganados desde que entró menos lo tomado» duró un PR: ANGELA GARCIA figuraba con
    **245 días disponibles** — cierto y peligroso — `asistencia-saldo-vacaciones.test.ts`.
26. **Cerrar la quincena congela el RESULTADO, no la receta**: se escriben las 24 cifras de dinero
    y las 20 de horas, una por columna. Si mañana alguien corrige una marcación del 4-ago, el cuadro
    cerrado del 1 al 15 **no se mueve**. Reabrir **no borra ni edita**: la v1 queda entera y el
    próximo cierre nace como v2. `cerrando` no es adorno: cabecera y renglones van en DOS viajes
    (PostgREST no da transacción) y una cabecera `cerrada` sin renglones se leería como **una
    planilla de $0 que alguien pagó** — `asistencia-planilla-guardada.test.ts` ·
    `planilla-guardada-route.test.ts`.
27. **Nadie se paga dos veces por el mismo día**: `solapadasDe` rechaza con **409** un cierre cuyas
    fechas se pisen con otro ya cerrado de la misma empresa.
28. **Panamá es UTC−5 fijo**; los tests usan fechas fijas, nunca `new Date()`.
29. **Tolerancia a DDL RETIRADA** (3-sep-2026, commit `425b1bd4`): las tablas existen, así que un
    error de Supabase ya **no se disfraza de «sin datos»** — la planilla no sale (500 con mensaje)
    en vez de calcularse con «nadie de vacaciones» o «nadie aprobado» —
    `tolerancia-ddl-retirada-asistencia.test.ts`.
30. **Los Excel del módulo empiezan en la fila 1**, con filtro desde A1 y encabezado fijo
    (`excel-encabezados-fila-1.test.ts`, regla global). Los PDF caben en la hoja y son Latin-1
    (`asistencia-pdf-pie-cabe-en-la-hoja.test.ts` · `asistencia-pdf-solo-latin1.test.ts`) — 🩸 el pie
    se salía **213 mm** de la hoja y una flecha `→` dejaba ilegible la línea de vacaciones.

## Con qué conecta

**Qué lee de otros módulos**
- **Préstamos** (`prestamos_empleados`, `prestamos_movimientos`) → la casilla «Préstamo» de la
  planilla. El amarre es por `prestamos_empleados.empleado_codigo`, poblado por la migración
  `20260902120000` en DOS pasos y **nada por parecido** (`LAURA CASIANI` ≠ `Laura Lismari Casiano
  Vega` se queda SIN atar aunque su saldo sea $0). **21 de 30 fichas atadas; las 14 con saldo vivo,
  todas.** Aquí NO se vuelve a calcular el saldo: llega ya calculado por la MISMA cuenta del módulo.
  Si el módulo YA registró el descuento de esta quincena, la casilla dice **eso** (hecho consumado);
  si no, `min(cuota, saldo)`. Ventana EXACTA, **sin** la tolerancia de ±3 días de la RPC (los pagos
  caen el 15 y el 30, justo en el borde: con tolerancia el mismo descuento se contaría dos veces).
  `Abono extra` **no** cuenta como descuento de planilla; `Pago de responsabilidad` sí.
  🔴 Un préstamo con saldo que **no es de nadie** se dice, en rojo.
- **Sesión / permisos**: `fg_users.modulos_override` y `role_permissions` vía la cookie firmada
  (`session-cookie.ts` → `guard.ts`).
- **Alertas**: `src/lib/alertas/canal.ts` → `enviarSistema` (el ingest y el vigía).

**Quién lee lo suyo**
- 🔴 **Confecciones Boston › Planilla** (`src/app/boston/tabs/PlanillaBoston.tsx`) llama a
  **`/api/asistencia/planilla`**, la misma ruta y el mismo motor, con la empresa **forzada por el
  servidor** (`?empresa=vistana` igual devuelve Boston) y el recorte de dinero controlado por
  `VE_SUELDOS_DE_BOSTON` (`src/lib/boston/planilla-sin-dinero.ts`). Los 5 montos manuales son de
  **solo lectura** para David: el POST exige `asistenciaRoles()`.
- **La pestaña Aprobaciones** se alimenta de `GET /api/asistencia/planilla?aprobaciones=1` —
  🔴 **no existe un GET propio de aprobaciones**, a propósito: una segunda copia del camino
  (paginar marcaciones → aplicar correcciones → armar reporte → clasificar día) sería una segunda
  verdad, y la pantalla de aprobar diría una cosa y la que paga, otra.
- **La planilla-guardada llama a la ruta de planilla por dentro** (`GET as calcularPlanilla`,
  reenviando la cookie): el cierre NO recibe montos del navegador, los recalcula el servidor.
- **Telegram 🔧 SISTEMA**: reloj caído/recuperado (ingest) y reloj callado / hueco viejo (vigía).
- **`activity_logs`**: 🔴 **cero filas de asistencia** (medido: no hay ningún `entity_type` del
  módulo). Nada de Asistencia se registra ahí; la trazabilidad vive en las columnas propias
  (`creada_por`, `registrado_por`, `marcado_por`, `cerrada_por`, `reabierta_por`).
- **NO conecta con**: búsqueda global, badges, Vista General, CXC ni Ventas. Asistencia no aporta
  un número a ninguna otra pantalla del sistema.

**Qué se rompería si cambiara la forma de sus datos**
| cambio | qué se rompe |
|---|---|
| renombrar la key `asistencia` | `role_permissions`, `fg_users.modulos_override` y `guard.ts` → todo el mundo pierde el módulo |
| cambiar `DISPOSITIVO` en el agente | las 6.081 marcaciones se re-guardan con otra llave → **horas al doble** |
| tocar `empleado_codigo` | rompe el amarre con Préstamos, con las 521 aprobaciones, con horarios, justificaciones y vacaciones |
| agregar un campo a `DineroLinea`/`HorasPersona` sin agregarlo a `COLUMNAS_DINERO`/`COLUMNAS_HORAS` | **el build se pone rojo** (`Record<keyof …>`) — es a propósito |
| quitar `empresa` de una ficha | esa persona sale de las 3 planillas y no aparece en ninguna |
| que la ruta deje de pasar `diaEnCurso`, el reparto o el mapa de justificaciones | el motor no lo puede ver; hay candados que llaman **al handler REAL** por eso |

## Por qué está así

| decisión | cita de Daniel (o de la contadora) y fecha |
|---|---|
| Todos los números del cálculo son configurables | *«todos los calculos deben de ser configurables en caso de que algo cambie»* — 6-ago-2026 |
| Tolerancia 10 min, no 5 | la contadora, 6-ago-2026 |
| Almuerzo fijo 30 min, sin poder elegir | *«todos 30 minutos de almuerzo (puedes quitar la opcion de elegir tiempo de almuerzo, siempre es fijo 30 mins)»* — 13-ago |
| Un día mal marcado suma igual | *«quiero que sume lo que marca la persona pero si se detecta anomalía que también marque para revisar, quiero que las personas sepan marcar bien, es responsabilidad de ellos»* — 5-ago |
| Medir al segundo | *«y la marcancion tiene que ser al segundo, porque redondeas minutos»* — 13-ago |
| La matemática de la planilla NO se toca | *«pero me dijo mi contable que el calculo dio exacto, solo le falto elegir la fecha exacta y no redonear minutos»* — 13-ago |
| Todos pueden corregir una marcación, y la razón es obligatoria | *«1. todos pueden corregir. 2. si»* — 13-ago |
| Servicio profesional: mide asistencia, no cobra | *«yulissa es servicio profesional, no esta en planilla pero quiero medir asistencia»* — 13-ago |
| Rodrigo trabaja fuera y está justificado | *«rodrigo esta trabajando fuera de la empresa (justificado)»* — 13-ago |
| Al que entró a mitad de quincena se le elige el rango | *«pero igual nos pagan por quincena, no? Solo hay que escoger cada vez de qué fecha a qué fecha se calcula y ya»* — 14-ago |
| Más de 30 min tarde: columna Ausencia, precio de tardanza | *«Los 45 minutos, igual que una tardanza. La columna «Ausencia» es solo para que lo veas.»* — 25-ago |
| Ausencia = 8 horas · Excedente al 1,5 | la contadora, 25-ago: *«Dia de ausencia 8 horas»*, *«Excedente de 9 horas es 1.5»* |
| Vacaciones: si ya cobró, se descuentan | la contadora: *«Si la persona había cobrado sus vacaciones anteriormente en dinero y no se había ido esos tres días, yo se los descuento porque ya se los pagué…»* |
| Un día de vacaciones no calcula nada del reloj | *«si alguien pasó por el reloj estando de vacaciones, no genera horas, ni tardanza, ni ausencia»* — 25-ago |
| Solo se pagan las horas extra autorizadas | la contadora: *«Sólo se pagan las horas extras autorizadas y las reportadas por Julio Garay»* |
| Aprobar por DÍA, con selección por día/semana/todo, máximo 3 clics | *«debe de ser que el usuario entre y vea por dias quienes y cuantas horas…»*, *«con un clic se aprueba y ya, maximo 3 clics»* — 27-ago |
| Julio aprueba con el usuario `bodega` | *«julio usa el usuario bodega, asi que ponlo ahi»* — 26-ago |
| Contabilidad también aprueba | *«que contabilidad tambien pueda aprobar»* — 27-ago |
| El préstamo se aprueba, no se aplica solo | la contadora: *«El préstamo si debe ser por aprobarlo»* — 27-ago |
| Julio: $1.000 en dos empresas, rata $5,77 en las dos | la contadora, 27-ago: *«En ambas empresas su rata por hora es 5.77»* |
| El módulo se llama «Asistencia y Planilla» | *«y asistencia se debe de llamar asistencia y planilla»* — 13-ago |
| Hora extra desde los 10 min y **sin restar el atraso** | *«25 minutos»* y *«No, van separadas»* — 1-sep |
| Reporte primero, Planilla segunda | *«primero va reporte, ¿por qué es el segundo tab?»* — 2-sep |
| No se puede cerrar con extras sin aprobar, y el aviso lleva a la persona | *«si, no dejar cerrar hasta que se apruebe o se rechace, y al hacer clic en el mensaje de aprobacion, que te lleve al colaborador para aprobar»* — 3-sep |
| Yulissa no genera horas extra | *«yulisa marca pero no deberia de calcular ya que es salario fijo, es solo para ver sus tardanzas y ausencias»* — 3-sep |
| El calendario, como el de Copa | *«que sea user friendly como el de copa airlines… su fecha de salida sería la fecha que termina la quincena»* |

## Lo que se intentó y se retiró

| qué | cuándo | por qué |
|---|---|---|
| **Pestaña «Cargar Excel»** (segunda vía de entrada de marcaciones) | ago-2026 | mandaba `dispositivo = RELOJ_FG` con un `evento_id` distinto → las 134 marcaciones quedaron **duplicadas** contra las del reloj y hubo que borrarlas a mano. Candado: `asistencia-una-sola-entrada.test.ts` |
| **Pestañas de primer nivel Horarios y Feriados** | 6-ago | pasaron a ser SECCIONES de Configuración. No se quitó ninguna función: son las mismas pantallas montadas adentro |
| **Pestaña «Cómo funciona»** | 6-ago | pasó a ser el botón «?» del final de la barra |
| **Prorrateo `8 h × días hábiles`** | 13-ago | lo había pedido Daniel; medido ANTES de tocar el cálculo: la misma quincena habría pagado **13 % menos** según cuántos lunes-a-viernes le tocaran. Se paró y se preguntó; la contadora cerró el tema |
| **El recargo de excedente 2,625** | 25-ago | la contadora manda esos minutos al 1,50. Los parámetros quedan guardados y la pantalla DICE que hoy no calculan nada |
| **El descuento de ausencia por la jornada real (8,5 h)** | 25-ago | pasó a 8 h fijas; costaba $20,88 de más en una quincena |
| **Saldo de vacaciones = ganados desde el ingreso − tomados** | 25-ago (duró un PR) | aritméticamente correcto e **inútil**: ANGELA figuraba con 245 días |
| **Pestaña Vacaciones apagada** (`PESTANAS_OCULTAS`) | 1-sep, duró unas horas | *«olvida lo de las vacaciones por ahora, quitalo del ERP para no enrredar»* → *«vacaciones quedamos que sí, dejalo, solo que haslo bien»*. Lo que enredaba era el TEXTO del interruptor, no la pantalla. 🔴 **La lista se borró entera, no se dejó vacía**: un mecanismo de apagar pestañas sin ninguna apagada es una puerta esperando que alguien tape un problema |
| **Los 4 presets de quincena del calendario** | 3-sep | el corte real es variable (a veces del 28 al 10): los presets mentían casi siempre |
| **Recordar el último rango de la Planilla** (`ultimoRango`) | 1-sep | la planilla abre vacía a propósito |
| **La tolerancia a DDL pendiente** en 5 lecturas de `config-server`, `aprobaciones-server` y `aprobador-empresa-server` | 3-sep | las tablas existen; un permiso o un timeout se leía como «nadie de vacaciones / nadie aprobado / nadie segmentado» |
| **`import` estático de xlsx/jspdf** | ago | Asistencia era la pantalla más pesada del sistema: **864 KB de JS**. Con `await import()` bajó a 542 KB (escritorio) y **693 → 232 KB** en celular |

## Cuánto se usa

⚠️ **No hay ni una fila de Asistencia en `activity_logs`** (medido: los `entity_type` son auth,
guias, prestamos, reclamos, ventas, tommy, caja, packing_lists, marketing, cxc, camisetas, cheques,
ventas_metas, mk_*, upload, calvin, reclamo, joybees, catalogo_reebok — ninguno del módulo).
Tampoco hay forma de contar pantallas vistas. Lo que **sí** se puede medir son las filas que el
módulo escribe, con su firma:

| evidencia | medido el 4-sep-2026 |
|---|---|
| marcaciones ingresadas | **6.081**, del 1-jul al día de hoy, de **40 códigos**, un solo reloj. El agente escribe cada **3 minutos** (última: hoy 21:53 UTC) |
| aprobaciones de horas extra | **521** filas, del 1-jul al 26-ago. Quién: `Contabilidad`, `Bodega` (Julio) y `daniel`. 🔴 **Ninguna en septiembre** |
| correcciones de marcación | **8** en 2 meses, **todas por `Contabilidad`** (3 agregadas, 2 anuladas) |
| justificaciones | **23**: 22 por `Contabilidad`, 1 por `Daniel`. Todas de agosto |
| vacaciones | **2** (una por `Contabilidad`, otra por `Daniel`) |
| aprobaciones de préstamo | **13**, todas de la quincena `2026-08-2`, todas por `Contabilidad` |
| montos escritos a mano | **26** filas en 2 quincenas (`2026-08-1`, `2026-08-2`), $898,86 en total |
| **cierres de quincena** | 🔴 **0**. La función existe desde el 4-sep y todavía no se usó ni una vez |
| sesiones vivas de quien lo usa | `Contabilidad` 19 · `Bodega` 31 · `daniel` 40 · `david` 4 (`user_sessions` sin revocar) |

**Lectura**: el módulo lo usa a diario **Contabilidad** (correcciones, justificaciones, montos,
aprobaciones de préstamo), **Bodega/Julio** solo para aprobar horas extra, y **Daniel** para revisar
y aprobar tandas (las 298 aprobaciones de julio se cargaron el 31-ago en 5 clics de casilla semanal).

## Qué papeles y Excel produce

| archivo | de dónde sale | nombre | contenido | quién lo recibe |
|---|---|---|---|---|
| **Excel del Reporte** | Reporte › botón Excel | `Asistencia <desde> a <hasta>.xlsx` | **3 hojas.** *Detalle*: Persona · Código · Día · Entrada · Sale almuerzo · Vuelve · Salida · Tarde (min) · Exceso almuerzo (min) · Salida temprana (min) · Extra (min) · Trabajado (min) · Revisar · Ausencia/justificación · **Corregido a mano** (hora del reloj, hora corregida, motivo, quién). *Resumen*: Persona · Código · Sale · Días trabajados · Ausencias sin justificar · Ausencias justificadas · Días trabajando fuera · Veces tarde · Minutos tarde · …de días a revisar · **Días corregidos a mano**, con fila TOTAL. *Cómo se calcula*: las reglas con los valores vigentes | Contabilidad; se manda por correo |
| **PDF del Reporte** | Reporte › botón PDF | `Asistencia <desde> a <hasta>.pdf` | el Resumen, con el pie de página que declara tolerancia, mínimo de extra y días corregidos | Contabilidad |
| **Excel de la Planilla** | Planilla › Excel | `planilla-<empresa>-<quincena>.xlsx` (rango libre: `planilla-<empresa>-<desde>_<hasta>.xlsx`) | **3 hojas.** *Planilla*: las 19 columnas del cuadro (Persona · Código · Salario quincenal · Horas extra 1.25 · Ausencias · Tardanzas · Horas extra 1.50 · Excedente · Domingos · Feriados · Total bruto · Seguro social · Seguro educativo · ISR · Préstamo · Terceros · Mercancía · Total deducciones · **Otros servicios (+)** · Neto a pagar). *Horas*: de dónde salió cada hora (22 columnas, con «Tarde >30 min», «…de días a revisar», «Sábado (h) sin pagar» y «Falta configurar»). *Cómo se calcula*: «Con qué se calculó esta planilla», concepto por concepto. **Los avisos viajan al archivo** (período abierto, código sin ficha, vacaciones no pagadas, extras sin aprobar, préstamo sin aprobar, rango libre) | **la contadora** — es el papel que sostiene el pago |
| **PDF de la Planilla** | Planilla › PDF | `planilla-<empresa>-<quincena>.pdf` | solo la tabla de plata + el pie con los avisos | **la contadora, para firmar** |
| **Excel de Aprobaciones** | Aprobaciones › Excel | `Horas extra <desde> a <hasta>.xlsx` | **1 hoja, una fila por persona y día**: Persona · Código · Empresa · Fecha · Salida · Extra 1.25 (min) · Extra 1.50 (min) · Total (min) · **Estado** · **Aprobó** · **Cuándo**. Autofiltro `A1:K…`; los minutos van como NÚMERO con `0.00` | quien autoriza (Julio, Contabilidad, Daniel) — es el único archivo que dice si la extra se autorizó |

**Correos**: el módulo **no manda ninguno**. Sus únicas salidas automáticas son los mensajes
🔧 SISTEMA a Telegram del reloj (caído / recuperado / callado / hueco viejo / hueco cerrado).

## Cómo probarlo a mano

**A. Que el reloj está llegando** — 1 minuto
1. Entra a `fashiongr.com/asistencia` con el usuario admin o Contabilidad.
2. Mira el banner de arriba del Reporte: tiene que decir **«al día»** con una hora de hace pocos
   minutos y la versión del agente (hoy `1.1.0`).
3. Si dice «callado» (más de 12 min) o «con error», toca **«Traer ahora»** y espera 3 minutos.
   Si sigue igual, la PC de la oficina está apagada o el reloj no responde.

**B. Que una corrección llega al pago** — 5 minutos
1. Reporte → elige un rango que incluya el día → abre la fila de una persona.
2. Toca el ✎ de una marca, escribe otra hora y **un motivo**. Guarda.
3. En la misma fila tiene que aparecer el chip azul **«N días corregidos»** y, arriba de la tabla,
   *«1 hora corregida a mano en 1 día. Los números de abajo ya cuentan con eso»*.
4. Ve a **Planilla**, elige esa quincena y esa empresa, **Generar**. Los minutos de tardanza de esa
   persona tienen que haber cambiado en el mismo sentido.
5. Para confirmar que quedó guardado: la línea debajo de la marca dice
   `Reloj 08:47:12 → 08:00 · "<tu motivo>" · <tu usuario> · <fecha>`. Deshacer la deja escrita
   (tachada), **no la borra**.

**C. Que la aprobación mueve el pago** — 5 minutos
1. Planilla → Generar la quincena. Si hay un aviso ámbar **«N personas tienen horas extra sin
   aprobar»**, toca el nombre de una: te lleva a Aprobaciones con esa persona resaltada.
2. Marca la casilla de ese día (se guarda al instante, sin confirmar).
3. Vuelve a Planilla y toca **Regenerar**. La columna «Extra 1.25» de esa persona tiene que subir y
   el aviso tiene que bajar en una persona.
4. Confirmación de que quedó guardado: en Aprobaciones la fila dice **quién aprobó y cuándo**; el
   Excel de Aprobaciones trae ese estado.

**D. Que el cierre frena y congela** — 5 minutos
1. Planilla → elige empresa y período → **Generar** → **Cerrar quincena**.
2. Si quedan extras o préstamos sin aprobar, sale un aviso **rojo** con los nombres y **no cierra**.
   Eso es lo correcto.
3. Con todo aprobado, el modal dice empresa, fechas, cuántas personas y el neto. Confirma.
4. La pantalla queda en **«cerrada»** con quién y cuándo. Para comprobar que se congeló: corrige una
   marcación de un día de esa quincena y vuelve a mirar el cuadro cerrado — **no se mueve**.
5. **Reabrir** pide un motivo escrito; el próximo cierre nace como **v2** y la v1 queda entera.

**E. Que el aviso de servicio profesional se comporta**
Yulissa Juárez (código 26) tiene que salir en gris, en **«Tú decides»**, sin monto, con «—» en las
columnas de extra, y **no** puede aparecer en Aprobaciones ni frenar el cierre.

## Qué lo rompe

| qué falla | qué pasa | cómo se nota |
|---|---|---|
| **La PC de la oficina se apaga** | el agente deja de traer marcaciones; el reloj las guarda pero su memoria es limitada | el banner pasa a «callado» a los **12 min**; a las **6 h** sale 🔧 SISTEMA por el vigía (15:00/20:00/22:15 UTC) |
| **El agente pierde acceso al reloj** (IP, clave, red) | lo mismo, pero con motivo | el agente reporta el error; a los **3 fallos seguidos** sale 🔧 SISTEMA con lo que dijo el reloj |
| **Un hueco de más de 15 días** | el agente ya no lo puede rellenar solo (`VENTANA_DIAS` es 3) | aviso 🔧 SISTEMA de «hueco viejo», y otro cuando se cierra. Se arregla subiendo `VENTANA_DIAS` a 45 una vuelta y volviéndolo a 3 |
| **Hikvision cambia un nombre de campo** (`serialNo`, `time`, `employeeNoString`) | los eventos se **descartan con motivo**, no se guardan mal | el ingest devuelve `descartados` y lo escribe en el log del servidor; el reporte se queda sin días. 🔴 Todo se interpreta en UN archivo: `src/lib/asistencia/ingest.ts` |
| **Alguien cambia `DISPOSITIVO` en el `.env` del agente** | las 6.081 marcaciones se re-guardan con otra llave → **horas al doble** | el `.env.ejemplo` lo advierte en mayúsculas. No hay candado automático |
| **`ASISTENCIA_INGEST_SECRET` rota sin actualizar la PC** | 401 en cada vuelta | el agente lo reporta como error → 3 fallos → 🔧 SISTEMA |
| **La URL sin `www`** | la página redirige y se pierde la cabecera → «No autorizado» aunque el secreto esté bien | candado `asistencia-agente-url.test.ts` |
| **Una lectura de Supabase falla** (permiso, timeout, esquema) | 🔴 desde el 3-sep **la planilla NO sale** (500 con el mensaje) en vez de calcularse con «nadie de vacaciones» | la pantalla muestra el error. Antes salía tranquila y mal |
| **Un rango de 10 años en la URL** | rechazado: tope **366 días** en `/planilla`, **120** en `/dias-con-datos` | 400 con el texto |
| **Más de 1.000 marcaciones en el rango** | 🔴 `db-max-rows` corta **en silencio** | todo va por `leerTodoPaginado` con `.order()` estable + `count: "exact"`, que **revienta** si no cuadra |
| **Una migración sin aplicar** | ya no hay tolerancia: falla visible | el cierre de quincena es el único que todavía muestra el aviso `avisoMigracionPlanillaGuardada()` |

## Lo que sobra o no cuadra

- 🔴 **`asistencia_marcaciones.tipo` y `.raw` no las lee nadie.** Ningún `select` del repo las pide
  (verificado sobre los 6 lugares que leen la tabla). `tipo` además trae **la cadena literal
  `"undefined"` en 6 filas** (el reloj la manda así; `txt()` solo filtra el `undefined` de
  JavaScript, no el texto).
- 🔴 **`asistencia_marcaciones.empleado_nombre` está vacía en las 6.081 filas** y sin embargo la
  piden 4 rutas (`reporte`, `planilla`, `horarios`, `configuracion`) y se usa como fallback del
  nombre. Es un fallback que nunca se activa.
- **`asistencia_reglas.almuerzo_default_min`** (= 30) **no la lee nadie** desde el 13-ago-2026:
  `ALMUERZO_FIJO_MIN` la reemplazó y salió de `ReglasAsistencia`, de `validarReglas`, de
  `reglasDesdeFila` y de `reglasHaciaFila`. La columna se conserva a propósito.
- **`asistencia_horarios.entrada` y `.almuerzo_minutos` son columnas que solo pueden tener un
  valor**: el PUT escribe `08:00` y `30` mire lo que mire el cuerpo. `empleado_nombre` de esa tabla
  se escribe y no se lee.
- ⚠️ **`asistencia_reglas.hora_corte_nocturno` en producción es `18:01`, no el default `18:00`.**
  Ningún comentario del repo lo menciona; los textos de ayuda dicen «hasta las 6 de la tarde». El
  cálculo usa el valor de la base, así que hoy el minuto de las 18:00 se paga al **1,25** y no al
  1,50. No es un bug — es un valor tecleado —, pero contradice la documentación.
- **Dos tablas sin ninguna pantalla**: `asistencia_reparto_empresa` y `asistencia_aprobador_empresa`
  se cargan **solo por SQL**. El reparto se muestra de solo lectura en la ficha; el reparto de
  aprobadores no se muestra en ningún lado —quien no tiene fila ve el cuadro vacío y no sabe por qué
  (el texto del 403 sí lo dice: *«No tienes ninguna empresa asignada para aprobar horas extra»*).
- ⚠️ **El nombre `asistencia_reparto_empresa` engaña**: no tiene nada que ver con aprobación, reparte
  el SUELDO. La tabla de aprobadores es `asistencia_aprobador_empresa`. Las dos existen y se
  parecen.
- **`avisoMigracion*` que siempre son `null`**: la respuesta de `/api/asistencia/planilla` conserva
  9 campos (`faltaMigracionConfiguracion`, `faltaMigracionBajas`, `faltaMigracionAprobaciones`, …)
  que son **constantes `null`** desde el 3-sep. Se conservan porque `PlanillaTab` y `AprobacionesTab`
  los leen; el código muerto es de la pantalla, no de la ruta.
- **`avisoMigracionAprobador()`** en `aprobador-empresa-server.ts` existe, se exporta y **ya no se
  emite** — el propio comentario lo dice.
- **Dos justificaciones históricas con el motivo viejo**: `Trabajo fuera de la oficina` (1 fila,
  Rodrigo). El desplegable ofrece `Trabajo de vendedor`; las dos se leen igual. **No es un error**
  y borrar el nombre viejo convertiría esa justificación en ausencia.
- **Borrar una justificación es un `DELETE` real** — la única escritura destructiva del módulo.
  Vacaciones y comisiones usan soft delete; aquí no hay historial de qué se borró.
- **`docs/estado-actual.md` línea 181** todavía dice: *«Preexistente detectado y NO tocado:
  `avisos.extraSinAprobar` de la planilla siempre sale vacío»*. **Ya está arreglado** (commits
  `a386c658` y `f52ea159` del 3-sep). El propio documento lo cuenta más abajo, en la tabla de
  decisiones — quedan las dos versiones.
- **`CLAUDE.md` dice que las pestañas son 6 y que Vacaciones estuvo apagada**; hoy están las 6 con
  Vacaciones encendida y `PESTANAS_OCULTAS` **borrado**. El texto de la sección de invariantes ya
  lo refleja; el de `AsistenciaClient.tsx` cuenta la historia completa.
- **`asistencia_dispositivos` tiene 13 columnas para 1 fila.** `nombre` está vacía y no se lee.
- ⚠️ **`CLAUDE.md` § Dónde vive cada dato dice `asistencia_marcaciones` 5.744 filas**; hoy son
  **6.081** (medido). Las demás cifras del módulo que ese cuadro trae siguen exactas (40 fichas /
  37 activos · 22 feriados · 23 justificaciones · 2 vacaciones · 521 aprobaciones · 13 préstamos
  aprobados · 26 montos manuales · 2 repartos · 6 aprobadores · planilla guardada 0 y 0).

---
---

# Comisiones (`/comisiones`, key `comisiones`)

## Qué es

Cuánto se le paga de comisión a cada vendedor, mes a mes, en las **6 empresas B2B de Fashion
Group**. Dos bases distintas que se suman: la **VENTA** (facturas con `pct_utilidad > 20`, menos
notas de crédito) y el **COBRO** (los recibos del mes, sin retenciones de ITBMS). Todo el cálculo
vive en una función de Postgres (`comision_b2b_v8`); el módulo es la pantalla, los descuentos fijos,
la configuración y los Excel.

⚠️ **Multifashion es OTRO módulo de comisiones y está bien como está — NO fusionar.** Su base es
`SUM(subtotal firmado) × 0,5 %`, sin filtro de utilidad. Que las dos digan «0,5 %» es coincidencia.

## Quién entra

| Rol | Qué ve | Qué no |
|---|---|---|
| `admin` | todo, incluida la pestaña **Configuración** | — |
| `contabilidad` | Todas las empresas · Por empresa · los 3 Excel | **Configuración** (`/config` y `/exclusiones` exigen `["admin"]` → 403). `POST /descuentos` también le da 403 |
| `secretaria` | igual que contabilidad, **más** `POST /descuentos` (el toggle del mes) | Configuración → 403 |
| cualquier otro | `/comisiones` lo rebota a `/home` con «No tienes acceso a este modulo» | — |

- **Dos puertas al mismo componente**: la ficha `/comisiones` y la pestaña `/ventas?tab=comisiones`.
  Las dos montan el **mismo `ComisionesView`**. 🔴 **La ficha no se retira**: `ventas` es
  `roles: ["admin"]`, así que `/comisiones` es la **única puerta de la secretaria y de
  contabilidad**.
- **La pestaña Configuración solo se dibuja en `/comisiones`** (`conConfiguracion`) y solo si el rol
  guardado en `sessionStorage` es `admin`. En `/ventas?tab=comisiones` no existe.
- `contabilidad` entró el 25-ago-2026: **ya recibía 200** de las cuatro rutas de lectura desde antes;
  lo que le faltaba era la puerta (dos líneas: el `roles[]` del módulo y el `allowedRoles` del
  cliente).

## Las pantallas

Tres modos en una barra de pestañas, con memoria en `localStorage` (`fg_comisiones_mode`).
Debajo, una fila con **período · «Actualizar ahora» · Excel** (se esconde en Configuración).

### Barra de arriba
- **Período** (`ComisionesPeriodo`): un solo control, «Septiembre 2026», con flechas de año y una
  rejilla de meses. Los meses futuros no son navegables.
- **«Actualizar ahora»**: dispara el sync de **RECIBOS** de UNA empresa (menú para elegirla — sesión
  única de Switch). Al terminar recarga la tabla (`refreshKey`) — 🩸 sin eso, Daniel arreglaba el
  vendedor en Switch, tocaba el botón, y la tabla seguía diciendo DEFAULT con un toast que le
  aseguraba que el dato estaba fresco.
- **ⓘ Criterios**: popover con la regla escrita —*«Venta: facturas con utilidad >20% menos notas de
  crédito, y se paga al vendedor de la factura. Cobro: recibos del mes, excluyendo retenciones de
  ITBMS, y se paga a quien registró el recibo en Switch (si lo registró la oficina, queda en «Oficina
  (DEFAULT)»). Ambas excluyen intercompañía y clientes internos.»*— más la frescura del sync. Punto
  ámbar si alguna empresa está sin actualizar.
- **Excel**: el botón vive arriba y la vista hija registra su función (`onExcel`).

### 1. «Todas las empresas» (por defecto)
Matriz **vendedor × empresa** con la comisión total de cada celda y una columna **Total**.
Pie **«Total a pagar»** que suma **solo lo pagable**. Las filas de `DEFAULT` y `DANIEL LEVY` se
pintan en gris con el rótulo **«no se paga»** y **no** entran al total. Debajo,
*«Ya están descontados lo devuelto y los descuentos.»* Tocar una celda abre el detalle.

### 2. «Por empresa»
Una empresa a la vez. Columnas: **Vendedor · Ventas · Com. venta · Cobros · Com. cobro ·
Com. total**, con **Total a pagar** al pie y **«Ver reporte detallado»** por vendedor.
En celular, tarjetas (`ComisionesTarjetas`) con los mismos números + **Descuentos** y la línea
«N vendedores sin actividad este mes».
🔴 El botón «Configurar» de esta vista **se quitó** el 3-sep (*«configuración en dos lados»*).

### 3. Configuración (solo admin, pantalla completa)
Dos tarjetas:
- **«Tasas por vendedor»** — una fila por PERSONA (el servidor ya colapsa las grafías por el alias),
  con **Venta** y **Cobro** en % editable, casilla **Activo**, las **Empresas** donde aparece, y
  «Guardar tasas». *«Los vendedores nuevos entran con 0.50%.»* 🔴 **DEFAULT y Daniel Levy no están
  en esta lista** (*«quítalo»*), y **Rey Stoute Aguas y COLABORADOR tampoco** (retirados).
- **«Clientes que no comisionan»** — **agrupada por empresa** (encabezado con el nombre y un
  contador), y debajo la tabla `Cliente · Vendedor · Venta · Cobro · Desde · ×`.
  **«+ Agregar»** abre una fila de formulario: **Empresa → Cliente** (con `ClienteSwitchPicker`, el
  único selector de clientes de Switch del sistema) **→ Vendedor → las dos casillas MARCADAS →
  Guardar**. Las casillas se cambian **al momento** (`PATCH ?id=`); con las dos apagadas **no se
  guarda y se avisa**. **Quitar** = soft delete con confirmación en palabras.
  🔴 Nunca se dice «exclusión» en pantalla.

### El detalle de un vendedor (`ComisionesDetalleModal`)
Modal con las **ventas comisionables** (Fecha · Tipo `Factura`/`Nota de Crédito` · Factura · Cliente ·
Monto · Comisión, con `Subtotal comisión` y `TOTAL VENTAS`), los **cobros comisionables**
(`TOTAL COBROS`) y `TOTAL VENTAS + COBROS`. Abajo, los **descuentos fijos** con un interruptor por
mes («Activo este mes — clic para desactivar»), y `Total a pagar`.
⚠️ Dice explícitamente *«El API de Switch no expone el número de recibo.»*

## Los datos

### `comision_vendedor_tasa` — **5 filas** (llave `vendedor_nombre`)
| vendedor | tasa venta | tasa cobro | activo |
|---|---|---|---|
| REYNALDO ESPINOSA | 1,00 % | 1,00 % | sí |
| EDWIN | 0,50 % | 0,50 % | sí |
| DANIEL LEVY | 0,50 % | 0,50 % | sí |
| Rodrigo | 0,50 % | 0,50 % | sí |
| REY STOUTE AGUAS | 0,50 % | 0,50 % | **no** (desactivado por la migración `20260916120000`) |

Es **global, no por empresa**. Quien no tiene fila cae en el `COALESCE(…, 0.0050)` de la RPC.
Un **trigger** (`comision_vendedor_tasa_canonicalizar`) canonicaliza el nombre que entre.
`activo` se escribe desde la pantalla y **la RPC no lo mira** — solo la pantalla lo usa para
dibujar la casilla.

### `comision_vendedor_alias` — **5 filas** (llave `nombre_switch`)
`AGUAS` → `REY STOUTE AGUAS` · `REY STOUTE AGUAS` → sí mismo · `REINALDO ESPINOSA`,
`REINDALDO ESPINOSA` y `REYNALDO ESPINOSA` → **`REYNALDO ESPINOSA`**.
Se aplica **solo** por `comision_vendedor_canonico(text)`; sin alias el nombre sale **recortado tal
cual** (así «Rodrigo» sigue cruzando). **Sin pantalla: se carga por migración.**

### `comision_exclusion` — **18 filas, 12 activas** (llave lógica: empresa + cliente + vendedor entre ACTIVAS)
| columna | medido |
|---|---|
| `empresa_key` | active_shoes 5 · active_wear 12 (6 activas) · vistana 1 |
| `cliente_codigo` | D-103, D-104, D-115, D-145, D-84, D-42, D-49, D-50, D-98, D-156, D-81 |
| `vendedor` | 11 REYNALDO ESPINOSA + **1 EDWIN** |
| `activa` | 12 en `true`; las 6 en `false` son las grafías `REINALDO` que la migración `20260913120000` apagó, firmadas `desactivado_por = migracion-alias-v8` |
| `excluye_venta` / `excluye_cobro` | 11 con las dos · **1 con solo cobro**: `vistana D-81 EDWIN` (`false/true`) |
| `creado_por` / `creado_en` | siempre llenas |
| `desactivado_por` / `desactivado_en` | solo en las 6 apagadas |

🔴 **Soft delete, nunca DELETE** — es historial. Trigger `comision_exclusion_canonicalizar`.
⚠️ CLAUDE.md dice «11 activas»; hoy son **12** (entró la de Edwin, la única con una sola casilla).

### `comision_descuentos_fijos` — 2 filas · `comision_descuento_excepciones` — 2 filas
Los dos descuentos son de **REYNALDO ESPINOSA en fashion_shoes**: «Descuento» $1.400,00 y
«Descuento de adelanto» $173,08, los dos `activo = true`.
Las dos excepciones apagan **los dos** para el mes `2026-07`.
Llave de la excepción: `(descuento_id, mes)`, con el mes como **día 1**.

### Lo que NO tiene tabla
La comisión **no se guarda en ningún lado**: se calcula al vuelo con la RPC cada vez que alguien
abre la pantalla. No hay histórico de «lo que se pagó en julio» — si la RPC cambia, el número de
julio cambia con ella.

## De dónde vienen los datos

Todo el insumo es de **Switch**, y ninguno lo trae este módulo: llega por los syncs de Ventas.
(Detalle completo en `docs/switch-flujo.md` §1, §3 y §9.)

| dato | endpoint de Switch | vía | cron | tabla | qué se descarta |
|---|---|---|---|---|---|
| **La venta** | `GET /apifactura/lista`, `GET /apinotacredito/lista`, `GET /apinotadebito/lista` (`desde/hasta/porPagina/paginaActual`) | **API con token** | `switch-sync tipo=all` 05:30/05:35/05:40/06:30 UTC y `tipo=facturas` 11:50 · 15:00 · 19:00 · 23:00 (+ ACS 13/17/21/00:15). Ventana 7 días | `switch_facturas` | **`urlswitchpay`** (queda solo en `raw_data`). Las notas no traen `tipoComprobante`: el sync lo escribe a mano. Las NC llegan **negativas** y se guardan en valor absoluto; el signo lo pone la lectura |
| **La utilidad** (`pct_utilidad > 20`, el criterio de entrada) | **panel web** — `GET /reportesventa/comprobantes` (token CSRF) + `POST /reportesventa/facturas` (DataTables, `length: 1000`, `tipoComprobante: facturasnotas`) | **panel web con sesión** (login con `changesession="SI"`, **expulsa a quien esté en el panel**) | `sync-utilidad` **07:00 UTC** | `switch_factura_utilidad` (1 fila por `empresa_key, secuencial, fecha` — la fecha entra en la llave porque Switch **reinició numeraciones**) | ⚠️ **solo desde el 3-ene-2026** y solo las 6 del grupo: preguntar utilidad de 2025 devuelve **vacío**, no cero. Su columna `vendedor` es el **dueño de la cartera**, y la comisión **ya no la usa** |
| **El cobro** | `GET /apireporte/recibos?desde&hasta&porPagina&paginaActual` — ⚠️ **no está en el PDF del API** | **API con token** | `sync-recibos` **07:50 · 15:15 · 19:15 · 23:15 UTC**, siempre los **últimos 3 meses** (Switch permite anular y retro-cargar) | `switch_recibos` (46.556 filas) | 🔴 **no trae `id` ni `secuencial` de recibo** — por eso el modal dice «El API de Switch no expone el número de recibo», y por eso la unidad de reemplazo es el mes entero. `es_retencion` es una **heurística** (cuadra con `impuesto/2` de una factura del cliente ±35 días) y **nunca se aplica al mostrador `TCKCTA`** |
| **El nombre del cliente** de una exclusión | `GET /apicliente/lista` (vía el sync de clientes) | API | — | `switch_clientes` | se resuelve al leer; `null` si el código ya no está |
| **La lista de vendedores elegibles** | — | — | — | `vendedores` (maestro, lo escribe `sync-utilidad`) + `comision_vendedor_tasa` + los nombres vistos en `switch_facturas.vendedor_nombre` y `switch_recibos.vendedor_registro` **del año en curso** | — |

**Si la fuente falla**
- Sin `switch_facturas` del mes → la RPC devuelve base 0 y la pantalla muestra ceros: **se leería
  como «este mes no se vendió nada»**. Por eso un error de las comisiones **se propaga (500)** y no
  se degrada.
- Sin `switch_factura_utilidad` → **nadie pasa el filtro `> 20 %`** y la comisión de venta cae a
  cero sin ningún error. Es el modo de fallo más silencioso del módulo.
- Sin `comision_descuentos_fijos` → **falla ABIERTO**: la tabla sale con descuentos en 0 en vez de
  quedar en blanco.
- Sin `comision_exclusion` (para la marca informativa) → **falla ABIERTO**: la tabla sale sin la
  marca. Quien resta es la RPC, que sí la lee.

## Las reglas que ya están fijadas

1. **Las 6 empresas del grupo comisionan igual** (`EMPRESAS_COMISIONAN = B2B_EMPRESA_KEYS`, derivada
   **nunca escrita a mano**): 0,5 % por defecto sobre la **VENTA** de las facturas con
   `pct_utilidad > 20`. 🔴 **La utilidad es el CRITERIO de entrada, no la base.** Retenciones y
   `TCKCTA` quedan fuera — `comisiones-joystep-entra.test.ts` compara la lista con `B2B_EMPRESA_KEYS`.
2. **Tres vendedores, tres papeles** (3-sep-2026): «Vendedor» de la factura
   (`switch_facturas.vendedor_nombre`) → comisión de **VENTA**. «Vendedor Recibo» = quien **registró**
   el pago (`switch_recibos.vendedor_registro`) → comisión de **COBRO**. «Vendedor de cartera»
   (`vendedor_cartera`) → **no alimenta ninguna comisión**. Daniel: *«el que vende a veces no es el
   que cobra. Edwin puede vender 50k a City Mall y Daniel o DEFAULT cobrar esa plata»*.
   Medido ene–ago 2026: grupo **+1.253,58** · Reinaldo +2.507,14 · Daniel +1.943,86 · Edwin −2.640,50
   — `comision-cobro-quien-registro.test.ts`.
3. 🔴 **DEFAULT y DANIEL LEVY se calculan y se muestran, pero NO se pagan** (`VENDEDORES_SIN_PAGO`,
   un solo lugar). *«si yo cobro no le pago a nadie porque no me autopago»*. La fila queda **gris**
   con «no se paga», el pie dice **«Total a pagar»** y suma solo lo pagable (`sumarPagable`).
   ⚠️ `se_paga` ausente cuenta como **pagable**: una respuesta vieja no debe vaciar el pie —
   `comisiones-no-se-paga.test.tsx`.
4. 🔴 **Hay clientes que NO comisionan para un vendedor concreto**, grano **(empresa, cliente,
   vendedor)**. Daniel: *«crea configuración en comisiones para desactivar cálculos de clientes»*,
   *«cliente vendedor»*, *«correcto, también venta»*. Si otro vendedor le vende o le cobra al mismo
   cliente, ese otro **sí** comisiona. Medido ene–sep 2026: solo Reinaldo se mueve —
   Active Shoes −447,67 · Active Wear −151,19 · **grupo −598,86** —
   `comision-exclusion-v7.test.ts` (29 mutaciones, 29 cazadas).
5. 🔴 **Las exclusiones distinguen VENTA de COBRO** (3-sep, noche): *«poder quitar comisiones en
   ventas o comisiones sin que tengan que ser de los dos»*. `DEFAULT true` en las dos + CHECK «al
   menos una». Una fila con las dos apagadas **no se guarda y se avisa** (en el módulo puro, en el
   CHECK y en la pantalla). Con las dos marcadas las casillas **no viajan en el POST** (default de
   la tabla), así el alta sigue funcionando mientras la DDL no corra.
6. 🔴 **UNA PERSONA, UNA FILA, UNA TASA** (*«¿por qué hay 4 Reinaldo?»*, *«llámalo Reynaldo y no
   Reinaldo»*). Todo lo que agrupa por vendedor pasa **primero** por
   `comision_vendedor_canonico()`; `aplicarAlias` en Node es su **espejo** y falla **abierto**.
   El canónico es **REYNALDO con Y**; en pantalla se muestra capitalizado
   («Reynaldo Espinosa», `nombreVendedorEnPantalla`) en **todas** las superficies. Solo cambia cómo
   se MUESTRA: la clave de agrupación, `VENDEDORES_SIN_PAGO`, los descuentos y los retirados siguen
   comparando **en mayúsculas** y **0 números cambian** (medido ene–sep 2026 con el SQL real:
   136 filas → 123, grupo 90.190,93 = 90.190,93) — `comision-alias-v8.test.ts`
   (38 mutaciones, 38 cazadas).
7. 🔴 **Vendedores RETIRADOS: desaparecen de Comisiones entera** (`src/lib/comisiones/retirados.ts`).
   Hoy: **REY STOUTE AGUAS** (+ su grafía `AGUAS`) y **COLABORADOR**. No es «esconder la fila»:
   no existe en la matriz, en la tabla por empresa, en las tarjetas, en el detalle, en los 3 Excel
   ni en Configuración, **ni en los totales**; y el servidor **rechaza con mensaje** una tasa o una
   exclusión a su nombre (`AVISO_VENDEDOR_RETIRADO`). Se compara por el nombre **canónico**, por eso
   el alias `AGUAS → REY STOUTE AGUAS` **se queda**. Medido: total pagable 2026
   82.109,56 → **82.059,73** (Aguas) y 81.866,22 → **81.871,50** (Colaborador, que era **−$5,28**)
   — `comisiones-retirados-y-mayusculas.test.tsx`.
8. 🔴 **Los descuentos se restan UNA sola vez, en el SERVIDOR** (`netearComisiones`); ninguna vista
   resta por su cuenta. 🩸 «Por empresa» mostraba el SUBTOTAL mientras «Todas las empresas» sí
   restaba: **Reinaldo en Fashion Shoes salía $1.573,08 más alto en una pestaña que en la otra**
   ($2.859,65 vs $1.286,57 en julio-2026) y el Excel bajaba el número inflado —
   `comisiones-descuentos-una-sola-resta.test.ts` · `comisiones-por-empresa-neto.test.tsx`.
9. **El `activo` efectivo de un descuento**: la excepción del mes si existe, si no el `activo` del
   catálogo. La regla vive en **una** función (`leerDescuentosEfectivos`) que usan los dos endpoints.
   `DEFAULT` **nunca** recibe descuento (`netearComisiones`).
10. **Cobros de $0 no comisionan** (son aplicaciones, cruces de NC o recibos anulados). Decisión de
    negocio, 23-jul-2026. Las RPC suman por total, así que aportan $0. **No «arreglarlo»**.
11. **La cadena de RPC cae sola y lo DICE**: v8 → v7 → v6 → v5, y **solo** si la función no existe
    (un error transitorio NO cae). La respuesta trae `version`, `regla_cobro`,
    `exclusiones_aplicadas` y `alias_aplicado` — `rpcConFallbackDeVersion`.
    Verificado el 4-sep: **las cuatro existen en producción** y `alias_aplicado` es `true`.
12. **Un solo selector de cliente en todo el sistema**: `ClienteSwitchPicker` para el directorio de
    Switch. Hay barrido que pone el build ROJO si aparece otro
    (`un-solo-selector-de-cliente.test.ts`).
13. **Validación de la API**: `year` 2024–2100, `mes` 1–12, empresa contra `B2B_EMPRESA_KEYS`
    (o `EMPRESAS_COMISIONAN` en exclusiones), tasas **0 % a 20 %**, `cliente_codigo` ≤ 40 chars,
    vendedor ≤ 120. `TCKCTA` (el mostrador) **se rechaza al agregar**: *«La venta de mostrador ya no
    comisiona; no hace falta agregarla»*.
14. **Los Excel del sistema empiezan en la fila 1** con filtro desde A1
    (`excel-encabezados-fila-1.test.ts`) y los montos van como **número**, nunca texto.

## Con qué conecta

**Qué lee de otros módulos**
- `switch_facturas` y `switch_factura_utilidad` (Ventas) → la base de VENTA.
- `switch_recibos` (CXC / cobros) → la base de COBRO.
- `switch_clientes` → el nombre del cliente de una exclusión y el selector.
- `vendedores` (maestro que escribe `sync-utilidad`) → de qué empresas viene cada vendedor.
- `lineaDeRechazos({ familias: ["recibo"] })` → el aviso de montos imposibles que el guard dejó
  afuera de los cobros, arriba de la tabla, en las dos vistas.
- `SyncStatus` / `SyncNowButton` → la frescura y el botón de actualizar recibos.

**Quién lee lo suyo**
- **Ventas › pestaña Comisiones** (`/ventas?tab=comisiones`) monta el mismo componente.
- **`comision_b2b_detalle`** (RPC v5) alimenta el modal de detalle — misma cadena de alias.
- 🔴 **Nadie más**. Comisiones **no** aparece en la búsqueda global, ni en badges, ni en Vista
  General, ni en Telegram, ni en Boston, ni en Asistencia. La comisión no se paga por planilla:
  `comision_*` y `asistencia_*` **no se tocan en ningún punto**.

**Qué se rompería**
| cambio | qué se rompe |
|---|---|
| renombrar la key `comisiones` | `role_permissions` y `fg_users.modulos_override` → contabilidad y secretaria pierden su única puerta |
| tocar `switch_recibos.vendedor_registro` | la comisión de cobro entera (v6+) |
| tocar `switch_factura_utilidad` | **nadie pasa el filtro > 20 %** y la comisión de venta cae a cero sin error |
| agregar una 7ª empresa a `B2B_EMPRESA_KEYS` | entra sola a Comisiones (`EMPRESAS_COMISIONAN` se deriva) — y a la matriz, al consolidado y al banner de sincronizado |
| escribir un nombre de vendedor a mano en una vista | se separa del canónico y aparece una fila duplicada. Por eso `nombreVendedorEnPantalla` es el único lugar que capitaliza |
| borrar (en vez de desactivar) una fila de `comision_exclusion` | se pierde el historial y el índice único entre activas deja de proteger |

## Por qué está así

| decisión | cita y fecha |
|---|---|
| Comisiones va en «Ventas y clientes», pegada a Ventas | *«Comisiones debe de estar en ventas. Y también debe de verse empresa por empresa y todas las empresas.»* · *«comisiones debería de estar en ventas y clientes no?»* — 25-ago-2026 |
| Contabilidad ve Comisiones | *«Q contabilidad vea comisiones»* — 25-ago |
| Joystep comisiona | *«joystep sí debe de tener comisiones al 0.5%»* — 14-ago. Sus insumos estaban completos desde siempre; julio-2026 daba **$56,33 que nadie veía** |
| El cobro se paga a quien registró | *«el que vende a veces no es el que cobra…»* — 3-sep |
| DEFAULT y Daniel no se pagan | *«se queda sin pagar, pero qué importa? Acuérdate que si yo cobro no le pago a nadie porque no me autopago»* — 3-sep |
| Clientes que no comisionan | *«crea configuración en comisiones para desactivar cálculos de clientes»*, *«cliente vendedor»*, *«correcto, también venta»* — 3-sep |
| No se llama «exclusiones» en pantalla | *«no lo llames así y ponlo en Configuración»* — 3-sep |
| Configuración es pestaña, no card | *«¿por qué en card y no como tab en toda la pantalla normal?»* — 3-sep |
| Una sola entrada a Configuración | *«configuración en dos lados»* — 3-sep (se quitó el botón «Configurar» de Por empresa) |
| Reinaldo al 1 % / 1 % | *«pon a Reinaldo 1 y 1»* — 3-sep |
| Una fila por persona, y con Y | *«¿por qué hay 4 Reinaldo?»*, *«llámalo Reynaldo y no Reinaldo»*, *«si capitiliza reynaldo»* — 3-sep |
| Daniel Levy fuera de «Tasas por vendedor» | *«quítalo»* — 3-sep |
| Venta y cobro por separado | *«poder quitar comisiones en ventas o comisiones sin que tengan que ser de los dos»*, *«las 11 que ya cargamos quedan con las dos marcadas»*, *«arranca con las dos marcadas pero yo deselecciono»* — 3-sep |
| Rey Stoute Aguas fuera | *«quita el vendedor aguas, no lo quiero ver»* (3-ago) → *«esconder rey stoute»* → *«te dije que eliminaras Rey Stoute Aguas.»* (3-sep) |
| COLABORADOR fuera | *«quita colaborador»* — 3-sep |
| El chip «N clientes sin comisión» fuera de las tablas | *«quita el cuadro sin comisión»* — 4-sep |
| El descuento tiene que restarse en la web | *«me sale en el web el total, y no me resta el descuento»* |

## Lo que se intentó y se retiró

| qué | cuándo | por qué |
|---|---|---|
| **Joystep fuera de la matriz** | hasta el 14-ago-2026 | `EMPRESAS_COMISIONAN` restaba `joystep` «porque tenía CXC pero quedaba fuera». Medido: sus insumos estaban completos y julio daba $56,33 invisibles |
| **5 llamadas `/api/ventas/comisiones` + 5 `/descuentos` al abrir la pantalla** | jul-ago | **10 peticiones y 15 consultas donde alcanzaban 1 y 7**. Nació `GET /consolidado` (las 5 RPC del lado del servidor) y `lib/comisiones/descuentos.ts` compartido. El `empresa_key` de los descuentos era solo un `.eq()` de filtro |
| **La lista de empresas escrita a mano en 4 lugares** | ago | la 4ª copia (`B2B_EMPRESA_KEYS.filter(k => k !== "joystep")`) seguía sin joystep cuando las otras tres ya lo tenían: las tablas lo mostraban y el banner de «Sincronizado» no lo vigilaba |
| **Modal «Configurar»** (solo tasa de venta) | 3-sep | pasó a ser la pestaña Configuración a pantalla completa, con la tasa de **cobro** al lado |
| **Botón «Configurar» en «Por empresa»** | 3-sep | *«configuración en dos lados»* |
| **Chip «N clientes sin comisión» pegado al nombre** | 4-sep | *«quita el cuadro sin comisión»*. 🔑 El componente `MarcaClientesSinComision` **NO se borró** y el servidor sigue mandando la lista: la pestaña Configuración es donde se ve |
| **Encabezado de 481 px** (título grande + fila de 5 controles + acordeón «Criterios» + fila solo para Excel) | jul | el 57 % del iPhone; en Safari real entraban **4 vendedores de 6**. Hoy son 2 filas y «Criterios» vive en un ⓘ que cerrado ocupa **cero alto** |
| **«Sin asignar»** como rótulo de `DEFAULT` | 3-sep | dejó de ser cierto cuando el cobro pasó a quien registró: esa fila junta ~$2.869 de la oficina. Hoy dice **«Oficina (DEFAULT)»** |
| **Comisión de cobro por CARTERA** (v5) | 3-sep | pasó a «quien registró» (v6). La v5 **se conserva** para comparar y como red |

## Cuánto se usa

⚠️ **`activity_logs` no registra nada de Comisiones** (verificado: no existe el `entity_type`).
El módulo es de **solo lectura** salvo tres escrituras, y son las únicas medibles:

| evidencia | medido |
|---|---|
| tasas por vendedor | **5 filas**, la última escritura la hizo la migración del 3-sep |
| clientes que no comisionan | **18 filas** (12 activas); 11 nacieron con la migración `20260912120000` del 3-sep, la de `EDWIN / D-81` es la única cargada **desde la pantalla** y es la única con una sola casilla |
| descuentos fijos | **2**, los dos de Reinaldo en Fashion Shoes; **2 excepciones de mes**, las dos de julio-2026 |
| quién puede entrar | `daniel` (admin), `Contabilidad`, `andrea` y `Angela` (secretaria). Solo `daniel` ve Configuración |
| lo que la pantalla mostraría hoy (vistana, ago-2026, RPC real) | EDWIN $652,42 · DANIEL LEVY $470,23 (gris) · Rodrigo $234,49 · DEFAULT $201,90 (gris) · **Rey Stoute Aguas $3,55, que la pantalla NO muestra** |

**No medible**: cuántas veces al mes se abre la pantalla, ni cuántos Excel se bajan. Lo que sí se
sabe es que el trabajo de configuración se hizo **todo el 3-sep-2026** (las 4 migraciones del día)
y desde entonces la única escritura nueva es una exclusión.

## Qué papeles y Excel produce

**Tres Excel, ningún PDF, ningún correo.**

| archivo | de dónde sale | nombre | contenido |
|---|---|---|---|
| **Consolidado** | «Todas las empresas» › Excel | `comisiones-consolidado-<MM>-<YYYY>.xlsx` | 1 hoja «Consolidado»: `Vendedor` + **una columna por empresa** + `Total`. Sin los retirados, con los que no se pagan marcados |
| **Por empresa** | «Por empresa» › Excel | `comisiones-<empresa_key>-<MM>-<YYYY>.xlsx` | 1 hoja «Comisiones»: `Vendedor · Ventas · Com. Venta · Cobros · Com. Cobro · Com. Total`, moneda con formato, netos ya con el descuento restado |
| **Detalle de un vendedor** | modal de detalle › Excel | `Comision-<Vendedor>-<Empresa>-<YYYY>-<MM>.xlsx` | 1 hoja «Comisión»: las ventas y los cobros documento por documento, con sus subtotales y el total a pagar |

Todos salen del **mismo botón Excel de la barra de arriba**: la vista hija registra su función
(`onExcel`) y el shell la dispara. Quien los recibe: Daniel y Contabilidad — no salen de la empresa.

## Cómo probarlo a mano

**A. Que los números son los de hoy** — 2 minutos
1. `fashiongr.com/comisiones` → pestaña **«Por empresa»** → elige una empresa y el mes pasado.
2. Abre el ⓘ **Criterios**: tiene que decir «Sincronizado» con una fecha de hoy. Si tiene un punto
   ámbar, alguna empresa está atrasada.
3. Toca **«Ver reporte detallado»** de un vendedor: la suma de las líneas de venta más las de cobro
   tiene que dar el mismo `Com. total` de la tabla, **menos** los descuentos que aparecen abajo.

**B. Que un descuento se resta una sola vez**
1. En «Por empresa», anota el `Com. total` de Reinaldo en **Fashion Shoes**.
2. Ve a «Todas las empresas» y mira su celda de Fashion Shoes. **Tienen que ser idénticas.**
   (Si difieren en $1.573,08, volvió el bug de agosto.)

**C. Que un cliente deja de comisionar** — 5 minutos, solo admin
1. Configuración → **«Clientes que no comisionan»** → **+ Agregar**.
2. Elige empresa, busca el cliente por nombre o código, elige el vendedor, deja las **dos casillas
   marcadas** y Guarda.
3. Vuelve a «Por empresa», mismo mes: la comisión de ese vendedor **tiene que bajar**.
4. Desmarca «Venta» en la fila nueva (se guarda al momento) y regenera: ahora solo deja de comisionar
   el cobro.
5. **Quitar** pide confirmación y **no borra la fila**: queda con `activa = false` y firma.
6. Prueba que el freno funciona: desmarca las dos casillas → tiene que salir *«Marca al menos una:
   Venta o Cobro. Si no quieres ninguna, quita la fila.»*

**D. Que una tasa cambia el pago**
1. Configuración → «Tasas por vendedor» → cambia la de **Cobro** de alguien → **Guardar tasas**.
2. Vuelve a la tabla del mes: la columna «Com. cobro» de esa persona tiene que moverse en proporción.
3. ⚠️ La tasa es **global**: cambiarla mueve también las otras empresas donde ese vendedor trabaja.

**E. Que un retirado no aparece**
Busca «Aguas», «Rey Stoute» o «Colaborador» en cualquier vista, en cualquier mes: **no puede
aparecer en ningún lado**, ni en los totales.

## Qué lo rompe

| qué falla | qué pasa | cómo se nota |
|---|---|---|
| **`sync-utilidad` (07:00 UTC) no corre o falla** | 🔴 **el modo de fallo más peligroso**: sin `pct_utilidad` **ninguna factura pasa el filtro > 20 %** y la comisión de venta cae a **cero sin ningún error** | la tabla muestra ventas en 0 con cobros normales. El ⓘ Criterios avisa de la frescura de FACTURAS, no de la utilidad. Reglas 1 y 2 de alertas cubren el cron |
| **Switch cambia el reporte web de utilidad** (`/reportesventa/facturas`) | igual que arriba | lo mismo. Es un reporte de **panel**, el mismo tipo que ya rompió Gastos y la cartera de Boston |
| **`sync-recibos` no corre** | la comisión de **cobro** se queda con el dato viejo (la ventana es de 3 meses, así que se recupera sola en la próxima corrida) | «Actualizar ahora» lo fuerza para UNA empresa |
| **Switch capa `porPagina` en silencio en `/apifactura/lista`** | faltan facturas → base de venta corta | queda `*_paginacion_incompleta` en `switch_sync_log.skip_details` |
| **Un `tipo_comprobante` nuevo** | vale **0** en la venta hasta que alguien lo clasifique | avisa el centinela `ventas_tipos` (regla 2, canal SISTEMA) |
| **La migración de la RPC no corrió** | la cadena cae sola a la versión anterior y **lo dice** (`version`, `alias_aplicado`, `exclusiones_aplicadas`) | la pantalla muestra las grafías sin colapsar y las exclusiones sin aplicar |
| **Un error transitorio de Postgres** | 🔴 **NO** cae a la versión anterior (`rpcConFallbackDeVersion` distingue «no existe» de «falló») | error 500 |
| **`comision_exclusion` no existe** | GET devuelve **503** con «Falta correr la migración»; el consolidado **falla abierto** (sin la marca) | quien resta sigue siendo la RPC |
| **Dos syncs de la misma empresa a la vez** | Switch admite **un token por USUARIO**: se tumban (code 0006) | por eso los crons van a ≥15 min y «Actualizar ahora» es **una empresa por clic** |
| **`db-max-rows` = 1000** | la lectura de vendedores vistos en facturas y recibos podría cortarse | va por `leerTodoPaginado` con `count: "exact"` |

## Lo que sobra o no cuadra

- 🔴 **`docs/switch-flujo.md` línea 117 dice que los recibos alimentan «Comisiones sobre cobro (RPC
  `comision_cobro_v3`)»**. Esa RPC **no existe** en producción (las que existen son
  `comision_b2b_v5/v6/v7/v8`, `comision_b2b_detalle` y `comision_vendedor_canonico`). Documento viejo.
- ⚠️ **`CLAUDE.md` dice que la migración `20260913120000` está «pendiente de aplicar»** y que las
  exclusiones activas son **11**. Verificado el 4-sep: la migración **está aplicada** (existen
  `comision_vendedor_alias`, `comision_vendedor_canonico()`, `comision_b2b_v8` y los dos triggers),
  y hay **12 activas** — entró `vistana / D-81 / EDWIN`, la única con una sola casilla (`solo cobro`).
- **`comision_vendedor_tasa.activo` no lo mira la RPC.** Rey Stoute Aguas está en `false` y su fila
  **igual se calcula** (medido: $3,55 en vistana, agosto 2026). Lo que lo saca de la pantalla es la
  lista `VENDEDORES_RETIRADOS` de TypeScript, no la base. Si alguien mira solo el SQL, ve una
  comisión que la app no muestra.
- **`MarcaClientesSinComision` está vivo y nadie lo monta**: el chip se quitó de las tres vistas el
  4-sep. El componente, la lista que manda el servidor (`clientes_sin_comision`) y sus helpers
  (`rotuloClientesSinComision`, `etiquetaClienteSinComision`) siguen ahí. Su propio encabezado lo
  documenta.
- **Dos rutas casi iguales**: `/api/ventas/comisiones?empresa=` y `/api/ventas/comisiones/consolidado`.
  La segunda hace las 6 RPC del lado del servidor. Es **a propósito** (bajó de 10 peticiones a 1),
  pero significa que hay dos caminos que arman la misma respuesta y los dos tienen que aplicar
  `netearComisiones` + `marcarSePaga` + `adjuntarClientesSinComision` en el mismo orden.
- **La comisión no se guarda nunca.** No hay histórico: si la RPC cambia, el número de un mes ya
  pagado cambia con ella. La única traza de lo que se pagó son los Excel que alguien bajó.
- **`ComisionesTarjetas` tiene un texto con un error de tipeo**: `"Sin asignaı"` (con `ı` sin punto)
  — es una constante que hoy no se usa (la etiqueta viva es «Oficina (DEFAULT)»).
- **`comision_descuento_excepciones.updated_at`** existe y su trigger la mantiene, pero nadie la lee.
- El comentario de cabecera de `src/app/api/ventas/comisiones/route.ts` dice *«Lee la RPC … v6, con
  red a la v5»* en un párrafo y v8 en el siguiente. Está desactualizado a medias.

---
---

# Gastos (`/gastos-contabilidad`, key `gastos-contabilidad`)

## Qué es

Lo que **salió de caja y del banco** de cada empresa, mes a mes, más el **saldo bancario** que
carga contabilidad. Dos pestañas en un solo módulo desde el 13-ago-2026 (*«y debeeria estar en un
solo modulo»*). Es un módulo de **lectura**: la única escritura de toda la pantalla es el saldo del
banco.

🔑 La distinción que sostiene todo: **«salió plata» no es «gasté»**. El reporte de Switch trae
TODO lo que sale de caja y banco; **solo el grupo 6 es gasto**. Medido sobre los 378 renglones
reales de Vistana: de **$243.342,48** que salieron, solo **$118.753,76** son gasto — el resto son
transferencias entre cuentas propias, planilla por pagar y pagos intercompañía.

## Quién entra

- **`admin` y `contabilidad`**, y nadie más (`roles: ["admin", "contabilidad"]` en `modules.ts`,
  `useAuth({ moduleKey: "gastos-contabilidad", allowedRoles: ["admin","contabilidad"] })` en el
  cliente, y `requireRole(req, ["admin","contabilidad"])` en las **dos** rutas API).
- Cualquier otro rol recibe **403** de `/api/gastos-contabilidad/egresos` y de `/api/saldos-banco`,
  y la página lo rebota a `/home`.
- **En la práctica lo usa Contabilidad**: los **52 saldos bancarios** los cargó `Contabilidad`,
  sin una sola excepción (`created_by`, medido).
- `/saldos-banco` (la dirección vieja) **redirige** aquí (`next.config.js`).

## Las pantallas

### Pestaña «Gastos»
- **Selector de mes**: una flecha atrás, una adelante, «julio 2026» en el medio.
  **Nunca meses futuros** (`mesTope` = mes en curso de Panamá). En la URL como `?mes=` (replace).
- **Una tarjeta (o fila de tabla desde 1024 px) por empresa**, con:
  - el nombre y una **píldora de estado**: `Al día` (verde) · `Sin movimientos` (gris) ·
    `No traído` (ámbar) · **`No se baja sola`** (gris, solo Confecciones Boston);
  - **«Cargado hasta \<mes\>»** debajo del nombre — el avance de la contadora. Variantes:
    *«…, que todavía va corriendo»* · *«… ese mes va en $X y lo habitual aquí es $Y: puede estar a
    medio cargar»* (ámbar) · **«Todavía no hay gastos registrados»**, nunca `$0.00`;
  - **dos números, no uno**: **«Salió de caja y banco»** (grande) y **«De eso, gastos»**;
  - el número de **pagos**, y **«Ver en qué salió»**.
- 🔴 **No hay fila de total del grupo**, ni al pie de la tabla, ni en ningún lado. Hay candado
  (`gastos-sin-totales-entre-empresas.test.tsx`).
- Arriba, cuando corresponde, el aviso ámbar de **renglones que Switch mandó y no se pudieron leer**
  (`AvisoRechazosSwitch`).
- **Detalle de una empresa** (`?empresa=`, drill-down con `push` para que el Atrás vuelva a la lista):
  cabecera con `Salió de caja y banco` · `De eso, gastos` · `De eso, no es gasto` · «N pagos en M
  documentos»; después **«En qué se gastó»** (una fila por cuenta: **nombre** en negrita, código de
  apoyo, número de pagos, hasta 3 referencias de ejemplo, y el monto); y **«Salió, pero no es
  gasto»** con su explicación escrita. Al pie, **«Total que salió»**.
  Botón **Volver** (deshace el `push`; por deep link solo limpia el parámetro).

### Pestaña «Saldos de banco»
Título **«Saldos bancarios»**, subtítulo **Banco General**. Una tarjeta por empresa (las 8) con el
último saldo y su fecha, un campo de monto (`0.00`, acepta negativos: los sobregiros existen), un
campo de fecha y **Guardar** / **Corregir**. «sin dato» cuando la empresa nunca cargó.
Debajo, **«Ocultar las cargas anteriores»** despliega el historial por empresa, de la más nueva a la
más vieja, marcando **«Un saldo quedó igualito al anterior»**.
La tarea más frecuente, 3 pasos: elegir la empresa → escribir el saldo y la fecha → Guardar.
Repetir la **misma fecha CORRIGE ese día** (upsert por `(empresa_key, fecha_dato)`), nunca duplica
ni pisa otra fecha.

## Los datos

### `egresos_varios` — **709 filas** · grano `(empresa_key, mes, n_interno, linea_nro)`
Se **reemplaza mes a mes** con la RPC `egresos_reemplazar_mes` (borra + inserta el mes entero en una
transacción), **no** upsert: solo vive la ventana cargada. **Sin soft delete.**

| columna | para qué | llena (medido) |
|---|---|---|
| `id` bigint | secuencia | 709 |
| `importacion_id` uuid | de qué corrida vino | **709 / 709** |
| `empresa_key` | vistana 378 · fashion_wear 135 · fashion_shoes 123 · active_shoes 47 · active_wear 26 · **joystep 0** · confecciones_boston 0 · american_classic 0 | 709 |
| `mes` date (día 1) | el bucket que se reemplaza | 709. Vistana, FS, AS, AW llegan a **2026-07**; **fashion_wear solo hasta 2026-05** |
| `fecha` | fecha del pago | 709 |
| `n_interno` | el documento | 709 |
| `cuenta` | el código contable completo (5 segmentos) | 709. **Grupo 6 (gasto): 486 de 709** |
| `sucursal` | de la sucursal | 709 |
| `proveedor` | ⚠️ **Switch lo manda VACÍO**; el dato humano está en `referencia` | 709 (con cadena vacía) |
| `referencia` | de qué se trató el pago | 709 |
| `total` numeric | el monto. **Los negativos son reversos reales** y se muestran negativos | 709 |
| `linea_nro` | ordinal del renglón dentro del documento | 709 |
| `created_at` | 🔴 **es lo que vigila la alerta B**: «cuándo reescribimos este mes» | 709 |

Totales medidos por empresa: vistana $243.342,48 · fashion_shoes $362.193,60 ·
fashion_wear $151.962,66 · active_wear $54.387,22 · active_shoes $16.048,75.

### `egresos_importaciones` — **151 filas** · 1 fila por corrida
Se inserta **antes** de escribir los renglones. Es lo que permite distinguir «este mes no tuvo
movimientos» de «no sabemos nada». `origen` = `cron` en las 151. `archivo_nombre` **vacío en las
151** (era para la carga a mano, que ya no existe). `creado_por` lleno en las 151.
Empresas: 7 (21–23 corridas cada una) — **confecciones_boston no tiene ninguna**.

### `cuentas_contables` — **987 filas** · grano `(empresa_key, cuenta)`
La sincroniza el **mismo cron de egresos**, pegada a la sesión que ya abrió. 7 empresas
(**sin confecciones_boston**). `nombre_switch` y `nivel` llenas en las 987.
🔴 **El nombre autoritativo es `nombre_switch`**, no el que Switch pega al código en el CSV desde el
1-sep. Falla **abierta**: sin nombre se muestra el **código pelado**, nunca uno deducido
(`6.02.01` parece «salarios» por vecindad con 6.01 y en realidad es **SERVICIOS PROFESIONALES**,
el gasto más grande de Vistana).

### `bancos_saldos` — **52 filas** · grano `(empresa_key, fecha_dato)`, UNIQUE
| columna | medido |
|---|---|
| `empresa_key` | 7 empresas · **joystep no tiene ninguna fila** |
| `saldo` numeric | último por empresa: fashion_wear $317.460,51 · vistana $165.363,98 · active_shoes $150.620,36 · fashion_shoes $115.703,52 · active_wear $60.678,97 · confecciones_boston $44.733,46 · american_classic $40.943,09 |
| `fecha_dato` | de 2026-01-31 a 2026-08-10 (7 u 8 cargas por empresa, ~mensual) |
| `created_by` | **`Contabilidad` en las 52** |
| `created_at` | 52 |

**Cero `DELETE`.** No hay soft delete porque no hay borrado: repetir la fecha corrige ese día.

## De dónde vienen los datos

### Egresos Varios — **panel web, no API**
🔴 **El API de Switch no tiene NADA de caja ni bancos** (`switch-referencia.md` §1.8). El único
camino es el panel.

- **Reporte**: Caja y Bancos → Reportes → **Egresos Varios**.
  `GET /caja/listaegresosvarios` (token CSRF) + `POST /caja/egresosvariosexportar` **en rondas**
  (`EGRESOS_CHUNK = 500`); cuando termina, el archivo está en `GET /log/<file>`.
  Es un **CSV con `;`**, validado **por contenido** (`pareceCsvDeEgresos`), nunca por status.
- **Sesión de panel, por USUARIO**: el login va con `changesession="SI"`, que **expulsa a quien esté
  en el panel de esa empresa**. Por eso el cron es de madrugada de Panamá y los crons de la misma
  empresa van a ≥15 min.
- **Cron**: `/api/cron/sync-egresos-varios`, **10:35 UTC** (05:35 Panamá). Pide **el año entero**
  (`rangoDelAnio`) y **reemplaza mes a mes** los 12 meses, aunque vengan vacíos: así un documento
  anulado desaparece y una fecha corregida no queda duplicada. **No lo recupera la reconciliación.**
- **Empresas**: `EGRESOS_EMPRESA_KEYS_CRON` = las 8 **menos `confecciones_boston`**
  (`empresasConEgresosEnCron`). Boston queda fuera **por pedido de Daniel**: su usuario del panel es
  el de él. La pantalla lo DICE con su propia etiqueta y su propia frase — una empresa vacía sin
  explicación se lee como un error del sistema.
- **Trampa del mecanismo**: el rango de fechas viaja en un **POST previo** y el servidor **se lo
  guarda en la sesión**; saltarse ese paso devuelve un CSV perfecto **del período equivocado**, sin
  un solo error.
- **Qué se descarta**: nada por tipo de cuenta — el parser guarda **todos** los grupos y `esGasto`
  (= empieza con `6.`) decide **al leer**. Lo que sí se descarta es un renglón que no se puede
  parsear, y **ya no desaparece**: queda en `switch_sync_log.skip_details`, se dice en pantalla y
  avisa por 🔧 SISTEMA con anti-loop de 7 días **por N. INTERNO** (no por número de línea: con
  líneas, arreglar un renglón corre todos los de abajo y la alerta suena para siempre).

### Cuentas contables — misma sesión, sin cron propio
`fetchCatalogoCuentas` va **pegado** a la sesión que `sync-egresos-varios` ya abrió, justo después
del login y **antes** de los egresos. **Nunca tumba al sync de egresos y nunca alerta.**

### Saldos de banco — a mano
No viene de Switch: lo teclea **contabilidad** en la pestaña, empresa por empresa.

### Si la fuente falla
- **El cron no corre**: el mes en curso se queda con lo último cargado. La pantalla lo dice
  («Cargado hasta …»), y la **alerta B** avisa a las **40 h** sin escrituras en `egresos_varios`
  (mira `created_at` de la tabla del **DATO**, no `egresos_importaciones`, que se escribe aunque el
  reporte venga vacío — medido el 2-sep con el módulo muerto hacía dos días:
  `egresos_importaciones` decía 4,9 h y `egresos_varios` **52,9 h**).
- **La lectura de la base falla**: 🔴 desde el 3-sep **no se degrada**. Cualquier error sale como
  **500** con un mensaje humano, nunca como una pantalla vacía y tranquila que dice «todavía no
  está instalado» sobre un SQL que ya corrió.

## Las reglas que ya están fijadas

1. 🔴 **Las 8 empresas se ven, pero sus gastos NUNCA se suman entre sí.** No existe un total de
   grupo en este módulo — ni al pie de una tabla, ni en un export. Candado
   `gastos-sin-totales-entre-empresas.test.tsx` pinta la lista y **exige que la suma no aparezca**.
2. 🔴 **«Salió» y «gasto» son dos números y se muestran separados.** Solo el grupo 6 es gasto
   (`esGasto`, `src/lib/contable/cuentas.ts`), el **mismo criterio** que usaba el mayor: dos
   definiciones de gasto en el mismo módulo serían dos totales para la misma pregunta.
3. 🔴 **Una empresa sin renglones dice «Todavía no hay gastos registrados», nunca `$0.00`.**
   `sin_movimientos` («no salió plata», un hecho) y `sin_datos` («no sabemos») **no pueden verse
   iguales** — `gastos-contabilidad-pantalla.test.tsx`.
4. **«Cargado hasta \<mes\>» se dice, «ese mes está incompleto» no se afirma.** Solo se marca
   «puede estar a medio cargar» con **3+ meses previos** (`MIN_MESES_PREVIOS`) y **menos del 25 %
   de la MEDIANA** (`UMBRAL_INCOMPLETO`) — mediana, no promedio. **El mes en curso gana sobre la
   estadística** — `gastos-al-dia.test.ts` · `gastos-al-dia-pantalla.test.tsx`.
5. **La empresa que no se baja sola tiene su propia etiqueta, su propio color (gris, no ámbar) y su
   propia frase.** Ámbar es «esto está pendiente y hay que mirarlo»; aquí no hay nada que mirar, es
   la decisión que tomó Daniel — `fraseAlDia` devuelve `null` para ella a propósito.
6. **Los montos NEGATIVOS se muestran negativos.** Nunca valor absoluto: su firma es que la
   diferencia da **exactamente el doble**.
7. **Los montos viajan en CENTAVOS ENTEROS** y se convierten a dólares **una sola vez, al pintar**
   (`usd`, `centAUsd`). Sumar floats por el camino es cómo se pierde el centavo.
8. **El nombre de la cuenta sale del CATÁLOGO, y cuando no se sabe va el código SOLO** — nunca un
   nombre deducido — `cuentas-catalogo.test.ts`.
9. **`bancos_saldos` se escribe con upsert `(empresa_key, fecha_dato)`. CERO `DELETE`.** Repetir la
   fecha corrige ESE día y no puede pisar otro. Fecha futura → 400. Saldos negativos permitidos —
   `saldos-banco-ruta.test.ts` · `saldos-banco-historial.ts`.
10. 🔴 **PAGINADO obligatorio.** `db-max-rows` = 1000 corta EN SILENCIO: Vistana sola hace ~380
    egresos al año y las 8 juntas pueden pasar las mil en UN mes **sin ningún error**. Todo va por
    `leerTodoPaginado`, que verifica contra un `count: "exact"` y **revienta si no cuadra**.
    `bancos_saldos` también, aunque hoy sean 52: el orden de PAGINACIÓN es por `id` (único y
    estable) y el de negocio se aplica en memoria.
11. **La lectura de egresos vive en UNA sola implementación** (`leerEgresosMes`) que usan la ruta del
    módulo **y Vista General**: si dos rutas escribieran su propia consulta, el día que dieran
    números distintos Daniel no dejaría de creerle a la que está mal — dejaría de creerle a las dos.
12. **Devuelve SIEMPRE las 8 empresas**, aunque una no tenga ni un renglón: es la única forma de
    poder decir «de esta todavía no se trajo nada» en vez de omitirla en silencio.
13. **Lo que Switch mandó y no se pudo leer se DICE en pantalla**, con el mismo componente y el
    mismo ámbar que el aviso de montos imposibles. Si no hay nada, no se dibuja nada —
    `gastos-egresos-aviso-ruta.test.ts`.
14. 🔴 **El mayor contable se retiró y sus tablas NO se borran**: hay un test que recorre TODAS las
    migraciones y pone el build **rojo** si alguna intenta un `DROP TABLE` de `mayor_lineas` o
    `mayor_importaciones` — `vista-general-gasto-egresos.test.ts`.
15. ⚠️ **Vista General SÍ suma gastos entre empresas** — es otro módulo, la suma es deliberada, y si
    la regla también vale ahí es **una decisión pendiente de Daniel**.

## Con qué conecta

**Qué lee de otros módulos**
- `egresos_varios` + `cuentas_contables`, que llenan el cron de egresos y su acompañante.
- `lineaDeNoLeidos({ familias: ["egreso_vario"] })` → `switch_sync_log.skip_details`.
- `ALL_EMPRESA_KEYS` / `EMPRESA_KEY_TO_NAME` (`empresa-mapping`) y `empresasConEgresosEnCron`
  (`switch-api/empresas`).

**Quién lee lo suyo**
- 🔴 **Vista General** (`/api/dashboard/vista-general`) usa **`leerEgresosMes`, la MISMA función**,
  y toma `totalGastoCent` para el **Gasto del mes**, la **Rentabilidad por empresa** y el
  **semáforo**. Y lee `bancos_saldos` **por su cuenta** (último por empresa, mismo criterio) para la
  **Disponibilidad** — no pasa por `/api/saldos-banco`.
- **La alerta B de «silencio de datos»** vigila `egresos_varios.created_at` (módulo «Gastos»,
  umbral 40 h, `TABLAS_VIGILADAS`).
- **El guard de montos imposibles** y la reconciliación de Switch tocan la misma tabla.
- **El módulo Gastos NO alimenta** a Comisiones, ni a Asistencia, ni a CXC, ni a la búsqueda global,
  ni a ningún badge.

**Qué se rompería**
| cambio | qué se rompe |
|---|---|
| cambiar el grano de `egresos_varios` | `egresos_reemplazar_mes` deja de reemplazar y empieza a duplicar |
| dejar de escribir `created_at` en cada corrida | la **alerta B** deja de avisar cuando el módulo se muere |
| leer `egresos_importaciones` en vez de `egresos_varios` para la frescura | vuelve el falso «está sano» del 2-sep (4,9 h vs 52,9 h reales) |
| tocar `esGasto` | se mueven a la vez el módulo Gastos **y** la Rentabilidad de Vista General |
| renombrar la key `gastos-contabilidad` | `role_permissions` → contabilidad pierde el módulo |
| mover `/api/saldos-banco` | la pantalla apunta ahí desde su primera casa; la ruta **no se mudó a propósito** |

## Por qué está así

| decisión | cita y fecha |
|---|---|
| Un solo módulo con dos pestañas | *«y debeeria estar en un solo modulo»* — 13-ago-2026 |
| Por empresa, nunca total del grupo | *«deberiamos de ver los gastos o la info por empresa no total del grupo»* |
| Primera pantalla: pocos números | *«los top key importante de info nada mas»* |
| El mayor contable se borra | *«y entonces borra Mayor contable en el sistema»* — 13-ago |
| Vista General usa Egresos Varios, no el mayor | *«esto no entendi bien, no deberia de ser egresos varios y ya?»* — 13-ago |
| Boston no se baja sola | pedido de Daniel: su usuario del panel de Confecciones Boston **es el de él** y no quiere que un cron se lo tome |

## Lo que se intentó y se retiró

| qué | cuándo | por qué |
|---|---|---|
| **El mayor contable entero** (`sync-mayor` 09:05 UTC, `lib/mayor/`, la ruta `/resumen`, los 4 componentes, el selector de fuente y el `?fuente=` de la URL) | 13-ago-2026 | dos formas de medir lo mismo, y el mayor iba **7 meses atrás**: `mayor_lineas` tiene **135 filas y solo enero**. 🔴 El retiro **esperó** a que Vista General saliera del mayor (verificado en el commit, no de palabra). Un `?fuente=mayor` en un marcador viejo es **INERTE**. Las tablas **no se borraron** — hay candado contra el `DROP` |
| **`lib/mayor/` como si fuera solo del mayor** | 13-ago | 🩸 tenía **6 módulos vivos** colgados (`esTablaAusente`, `montoACentavos`, `normalizarTexto`, `CUENTA_RE`, y **`esGasto`**, que egresos importaba **a propósito**). Se **MUDARON** a `src/lib/contable/` con los cuerpos EXACTOS: reescribir `montoACentavos` habría estrenado una segunda forma de leer un monto |
| **Módulo suelto «Saldos de Banco»** (`/saldos-banco`) | existió **2 días** (#465/#467) | nació solo para que «Gastos de Empresa» se pudiera retirar sin dejar a Contabilidad sin el único dato que usaba. Hoy es pestaña; la dirección redirige |
| **Módulo «Gastos de Empresa»** (carga manual, `empresa_gastos_mensuales`, `gastos_categorias`) | #467 | la tabla tiene 0 filas y se va a quedar así. Vista General mostraba un estado vacío permanente |
| **Carga a mano de un CSV de egresos** | — | `egresos_importaciones.origen` admite otro valor y `archivo_nombre` existe, pero las **151 corridas son `cron`** y las 151 tienen `archivo_nombre` vacío |
| **La tolerancia a la DDL de egresos** (`{ instalado: false, empresas: [] }` con 200) | 3-sep-2026 | las tablas existen; un permiso o un timeout se leía como «todavía no está instalado» y dejaba la pantalla vacía **y tranquila**. `instalado` sigue viajando (siempre `true`) porque la pantalla y Vista General lo leen |
| **La coletilla «Lo último que hay es de …»** | 13-ago | decía DOS VECES el mismo mes en la misma tarjeta |
| **La frase «En "Lo que cerró la contadora" sí se ven»** | 13-ago | 🩸 mandaba a una pestaña que ya no existe. Un texto que manda a un lugar inexistente **hace perder el tiempo con confianza** |

## Cuánto se usa

⚠️ **`activity_logs` no registra nada de Gastos ni de saldos de banco** (verificado). La pantalla es
de lectura salvo el saldo, así que lo medible es:

| evidencia | medido el 4-sep-2026 |
|---|---|
| corridas del cron | **151** filas en `egresos_importaciones`, 21–23 por empresa, todas `origen = cron`, todas desde enero-2026 |
| renglones vivos | **709** en `egresos_varios`, 5 empresas con dato (joystep 0 es normal, Boston 0 es por decisión) |
| **saldos cargados a mano** | **52** filas, **todas por `Contabilidad`**, ~1 por empresa por mes, de 2026-01-31 a **2026-08-10** |
| última carga de saldo | 10-ago-2026 (active_shoes, active_wear, fashion_shoes). Las otras cuatro, 31-jul |
| quién puede entrar | `daniel`, `alberto` (admin) y `Contabilidad`. `Contabilidad` tiene 19 sesiones vivas y estuvo activa hoy |

**Lectura**: el cron trabaja todos los días; **la gente toca la pantalla ~una vez al mes**, cuando
contabilidad carga los saldos. Los gastos son solo de mirar.

## Qué papeles y Excel produce

🔴 **NINGUNO.** El módulo **no exporta Excel, no genera PDF y no manda correos** (verificado: cero
`downloadWorkbook`, cero `XLSX.writeFile`, cero `.save(` en `src/app/gastos-contabilidad/**` y en
sus dos rutas API). Todo se mira en pantalla.

Lo único que «sale» del módulo son los **avisos a Telegram** que otros mecanismos disparan sobre sus
datos: el 🔧 SISTEMA de renglones ilegibles (anti-loop 7 días por N. INTERNO) y la **alerta B** de
40 h sin escrituras. Los dos van al chat privado de Daniel.

## Cómo probarlo a mano

**A. Que el mes está cargado** — 1 minuto
1. `fashiongr.com/gastos-contabilidad` → pestaña **Gastos** → elige el mes pasado con la flecha.
2. Cada empresa tiene que decir **«Cargado hasta \<mes\>»**. Si una dice **«No traído»** con el mes
   ya cerrado, el cron falló o la contadora todavía no cargó ese mes en Switch.
3. **Confecciones Boston tiene que decir «No se baja sola»** y explicar por qué. Eso es correcto,
   no un error.

**B. Que los dos números no se confunden**
1. Abre **«Ver en qué salió»** de Vistana.
2. `Salió de caja y banco` tiene que ser **mayor** que `De eso, gastos`, y la diferencia tiene que
   aparecer en la sección **«Salió, pero no es gasto»**.
3. Suma mentalmente: `De eso, gastos` + `De eso, no es gasto` = `Total que salió`.
4. Para cotejar contra Switch: abre el panel de esa empresa → Caja y Bancos → Reportes → Egresos
   Varios, mismo rango. El **Total** tiene que ser el mismo que «Salió de caja y banco».
   ⚠️ Entrar al panel **expulsa** a quien esté usándolo; hazlo de madrugada de Panamá y a ≥15 min de
   cualquier cron de esa empresa.

**C. Que el saldo del banco se guarda y se corrige** — 2 minutos
1. Pestaña **Saldos de banco** → una empresa → escribe el saldo y la fecha → **Guardar**.
   Sale «Listo, guardado» y la tarjeta muestra el número con su fecha.
2. **Vuelve a guardar con la MISMA fecha y otro monto**: tiene que **corregir** ese día, no crear
   una fila nueva.
3. Despliega **«Ocultar las cargas anteriores»**: el historial tiene que mostrar la carga y, si
   repetiste el monto exacto del anterior, la marca **«Un saldo quedó igualito al anterior»**.
4. Para confirmar que llegó a otra pantalla: **Vista General → Disponibilidad** tiene que mostrar el
   mismo número (lee la misma tabla, último por empresa).
5. Una fecha futura tiene que ser rechazada: *«La fecha no puede ser futura.»*

**D. Que un renglón ilegible se dice**
Si Switch manda algo que la app no puede leer, arriba de la lista aparece un aviso ámbar diciendo
cuántos renglones quedaron afuera **y de qué empresa**. Si no hay nada, no se dibuja nada.

## Qué lo rompe

🔴 **Ésta es la sección más importante del módulo: Switch ya rompió este reporte dos veces en 2026,
y las dos se descubrieron por accidente.**

| qué falla | qué pasa | cómo se notaría |
|---|---|---|
| 🩸 **Switch cambia el formato de la celda de cuenta** — **pasó el 1-sep-2026**: llegó `6.03.98.00.00 - GASTO DE TARJETA DE CREDITO` donde antes venía el código pelado | el ancla `$` del validador tiró **los 378 renglones de cada empresa** y el módulo quedó **2 días vacío** | la pantalla mostraba «No traído» en todas las empresas. Hoy: `codigoDeCuenta()` lee el código **por el principio** (no se calibró a un separador: el archivo crudo nunca se pudo ver, se dedujo del `error_message`) y `CUENTA_RE` conserva su `$` **intacto para el VALOR**. Seis tramos siguen siendo error: recortarlos cambiaría de cuenta en silencio, y `esGasto` decide con el primer tramo |
| **Switch cambia el separador, el encabezado o el orden del CSV** | el parser no reconoce el archivo (`pareceCsvDeEgresos` valida **por contenido**, nunca por status) | el sync falla y **no escribe**; 2 fallos seguidos del mismo par → 🔧 SISTEMA (regla 2 de alertas) |
| **Switch manda un renglón que no se puede leer** | 🔴 **ya no desaparece**: queda en `switch_sync_log.skip_details`, se dice en pantalla y avisa por Telegram con anti-loop de **7 días por N. INTERNO** (no por número de línea: con líneas, arreglar un renglón corre todos los de abajo y la alerta suena para siempre) | el aviso ámbar arriba de la lista |
| **El cron 10:35 no corre** (o el login web falla) | el mes se queda con lo último cargado; **no lo recupera la reconciliación** | la **alerta B** avisa a las **40 h** sin escrituras en `egresos_varios.created_at`. El umbral deja pasar un día perdido y no deja pasar dos |
| **Alguien está usando el panel de esa empresa** | el login con `changesession="SI"` lo **expulsa**, y al revés: si Daniel entra, el cron se queda sin sesión | el sync falla con error de sesión. Por eso el cron es de madrugada y los de la misma empresa van a ≥15 min |
| **El rango no se manda en el POST previo** | 🩸 el servidor guarda el rango **en la sesión**: se baja un CSV perfecto **del período equivocado**, sin un solo error | nada avisa. Es la trampa que documentó el retiro del mayor |
| **Más de 1.000 renglones en un mes** | `db-max-rows` corta EN SILENCIO y el gasto sale corto | no lo haría: `leerTodoPaginado` verifica contra `count: "exact"` y **revienta** |
| **Un monto imposible** | la fila **se rechaza** y el upsert conserva el último valor bueno; nunca se escribe un 0 | lo rechazado se dice en pantalla |
| **`cuentas_contables` no se pudo sincronizar** | falla **abierta**: se muestran los códigos pelados | el detalle se ve con `6.02.01` en vez de «SERVICIOS PROFESIONALES». Nunca alerta: va pegado al sync de egresos y **no puede tumbarlo** |
| **La base falla (permiso, timeout, esquema)** | 🔴 desde el 3-sep sale **500** con mensaje humano | antes decía «Esta parte todavía no está encendida» sobre un SQL que ya había corrido |

## Lo que sobra o no cuadra

- **`egresos_varios.proveedor` está en las 709 filas pero Switch la manda VACÍA.** El dato humano
  vive en `referencia`. El parser lo documenta; la columna existe y no dice nada.
- **`egresos_importaciones.archivo_nombre` está vacía en las 151 filas** y `origen` es `cron` en las
  151: las dos son restos de la carga a mano, que ya no existe.
- **`joystep` tiene 0 filas en `egresos_varios` Y 0 filas en `bancos_saldos`.** Lo primero es normal
  y está documentado; **lo segundo no lo dice nadie**: la pestaña de saldos muestra las 8 empresas y
  joystep aparece con «sin dato» desde enero sin ninguna explicación, al revés de lo que hace la
  pestaña de Gastos con Boston.
- **`confecciones_boston` no tiene `cuentas_contables`** (las 987 filas son de 7 empresas). Es
  consecuencia de estar fuera del cron, pero significa que si algún día se traen sus egresos a mano,
  las cuentas saldrían **sin nombre**.
- **`fashion_wear` está cargada solo hasta mayo-2026** mientras las otras cuatro llegan a julio. La
  pantalla lo dice («Cargado hasta mayo 2026»), pero es un atraso de **dos meses** que ningún aviso
  eleva.
- **El comentario de `src/app/api/gastos-contabilidad/egresos/route.ts` sigue hablando de «la
  segunda fuente del módulo» y de «las dos fuentes que CONVIVEN y no se suman»** — el mayor se
  retiró el 13-ago-2026 y **no hay dos fuentes**. Lo mismo en el encabezado de
  `src/lib/egresos/reglas.ts`, que dedica 20 líneas a explicar por qué egresos **no se suma con el
  mayor**. Es historia útil, pero está escrita en presente.
- **`RespuestaEgresos.instalado` es siempre `true`** y sigue viajando porque la pantalla y Vista
  General lo leen; la rama «Esta parte todavía no está encendida» del cliente **ya no se puede
  alcanzar**.
- **`src/lib/cuentas/leer.ts` todavía cae de respaldo a `mayor_lineas.cuenta_nombre`** — es la única
  lectura viva de la tabla retirada. Medido en su momento: `cuentas_contables` cubre **las 64 de 64**
  cuentas que Egresos Varios usa, así que el respaldo nunca se activa.
- **`src/lib/egresos/parser.ts` y `catalogo-csv.ts` son para archivos que nadie sube.** El parser lo
  usa el sync (que también recibe un CSV), pero `pareceCsvDeCuentas` / `parsearCatalogoCsv` no
  tienen ninguna pantalla de carga detrás.
- **Dos convenciones de fecha conviven en el mismo CSV de Switch**: `fechaEgresoAIso` acepta
  `DD-MM-YYYY` y `YYYY-MM-DD` a propósito, porque el estado de cuenta de clientes usa la primera y
  proveedores, recibos y egresos la segunda.
- ⚠️ **Vista General suma gastos entre empresas** mientras este módulo lo prohíbe. Está anotado en
  `CLAUDE.md` como **decisión pendiente de Daniel** desde hace semanas.
- ⚠️ **`CLAUDE.md` dice `egresos_importaciones` 137 filas**; hoy son **151** (medido). `egresos_varios`
  709, `cuentas_contables` 987 y `bancos_saldos` 52 siguen exactas.
