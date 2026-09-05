# Préstamos

> Referencia del módulo, **medida contra producción el 4-sep-2026** (Management API,
> `POST /v1/projects/rspocgqhtpveytgbtler/database/query`).
> No repite `cxc/CLAUDE.md`: apunta a él (§ Roles, § Módulos, § Dónde vive cada dato,
> § Trampas transversales) y escribe lo que le falta. Préstamos **no tiene postmortem propio**;
> lo que se ha escrito de él vive repartido en `docs/postmortems/asistencia-planilla.md`
> (la casilla «Préstamo» de la planilla, 27-ago-2026), `docs/postmortems/boston-cxc.md`
> (la pestaña de David, 2-sep) y `docs/estado-actual.md` (la fecha del lote, 3-sep).
>
> Este archivo es el séptimo y último de `docs/modulos/`. La auditoría de **sugerencias** de este
> mismo módulo está aparte, en `docs/eficiencia/04-plata-y-administracion.md` § Préstamos —
> aquí solo se describe lo que HAY.

---

# Préstamos (`/prestamos`, key `prestamos`)

## Qué es

Lleva **lo que cada empleado le debe a la empresa** y lo que va devolviendo quincena a quincena.
Dos cosas distintas comparten la misma cuenta: los **préstamos en efectivo** y las
**responsabilidades por daño** (mercancía que se dañó o se perdió y se le descuenta a la persona).

Resuelve un problema chico y viejo: antes esto vivía en una hoja de la contadora, y la planilla
copiaba el descuento a mano de una pantalla a otra. Hoy el módulo lleva el saldo y la planilla de
Asistencia le pide la cuota (§ Con qué conecta).

**Tamaño real:** 32 fichas (15 activas), 443 movimientos (432 vivos), **$5.062,01 de saldo vivo**
— $4.962,01 en 13 personas activas más $100 de una persona archivada. Nació el **26-mar-2026**
(commit `feat: módulo préstamos a colaboradores`), o sea que es de los módulos VIEJOS, anterior
a la reescritura de julio.

## Quién entra

| Rol | Qué puede | De dónde sale |
|---|---|---|
| `admin` (daniel, alberto) | todo, más la «Zona de acciones peligrosas» (eliminar empleado, borrar historial, forzar archivado) y el «Eliminar» del menú «···» de la lista | `PRESTAMOS_ROLES` + `requireRole(req, ["admin"])` en 2 puntos |
| `contabilidad` (usuario **`Contabilidad`**) | todo menos la zona de peligro y el «Eliminar» de la lista. **Es quien lo usa de verdad** | `PRESTAMOS_ROLES` |
| `gerente_boston` (david) | **solo lee**, y desde `/boston` › pestaña Préstamos. Nunca entra a `/prestamos` | `rolesModuloBoston()` sobre `/api/boston/prestamos`, único verbo GET |
| todos los demás | **403** en las 6 rutas | — |

- 🔴 **`PRESTAMOS_ROLES = ["admin", "contabilidad"]` está escrito a mano en seis archivos**
  (`page.tsx:8`, `api/prestamos/empleados/route.ts:6`, `empleados/[id]/route.ts:8`,
  `movimientos/[id]/route.ts:7`, más dos literales inline en `movimientos/route.ts:11,32` y otro en
  `export-excel/route.ts:11`). No hay constante compartida, y **tres de esas rutas no pasan por
  `requireRole`**: hacen el chequeo a mano con `getSession`. Es exactamente el motivo por el que la
  pestaña de David se hizo como ruta aparte (ver `docs/postmortems/boston-cxc.md:207`).
- **Medido en `activity_logs`**: de 168 acciones registradas, **166 son de `Contabilidad`** y 2 de
  `daniel` (dos borrados de movimiento el 30-abr-2026). `alberto` nunca escribió nada.
  Sesiones vivas: `daniel` 40 · `Contabilidad` 19 · `alberto` 1.
- ⚠️ **La lectura no se puede medir**: `activity_logs` no registra ni entradas a la pantalla ni
  consultas. Lo que sí hay son las filas escritas (§ Cuánto se usa).
- El módulo aparece en el grupo **Operación** del home (`src/lib/modules.ts:190`, icono `HandCoins`)
  y en la lista `role_permissions.contabilidad.modulos`, medida el 13-ago-2026:
  `["asistencia","gastos-empresa","prestamos","proveedores","ventas","saldos-banco","gastos-contabilidad"]`.

## Las pantallas

### 1. Lista de colaboradores — `/prestamos`
`src/app/prestamos/page.tsx` (SSR con auth propio, 54 líneas) + `PrestamosClient.tsx` (777 líneas).
La carga inicial la hace el servidor; el cliente re-consulta solo si se cambia «Ver archivados».

**Qué se ve, de arriba abajo:**
- Dos chips: **«SALDO PENDIENTE TOTAL»** (`$4.962,01`, en rojo si > 0, con animación de conteo) y
  **«QUINCENA · 1 al 15 de septiembre 2026»** con `N / M` — cuántas de las personas con cuota ya
  tienen el descuento de esta quincena. Verde si están todas, ámbar si no.
- Botón verde **«Aplicar quincena (N)»** — solo aparece si N > 0.
- Botón negro **«+ Nuevo préstamo»**, un menú **«···»** con *Nuevo empleado* y
  *Descargar historial*, un campo **«Buscar empleado...»**, un desplegable **«Todas las empresas»**
  (7 opciones, de `EMPRESAS` en `src/lib/companies.ts`) y la casilla **«Ver archivados»**.
- Una fila por persona: nombre · empresa (o «Sin empresa») · chips (**Saldado** / **Archivado** /
  **✓ Deducida** / **⚠ Pendiente**) · barra de progreso con `%` (solo ≥1024 px) · **saldo** en
  grande a la derecha (azul + «a favor» si es negativo) · menú «···» (*Editar* · *Eliminar* solo
  admin).
- Sin resultados: `EmptyState` «No se encontraron empleados» con botón «+ Nuevo empleado».

**Qué se puede hacer y con cuántos pasos:**

| tarea | pasos |
|---|---|
| **Registrar un pago** (la más frecuente) | «+ Nuevo préstamo» → tocar a la persona en la lista → **el paso 2 vuelve a pedir la persona en un `<select>`** → cambiar **Concepto** de «Préstamo» a «Pago» → escribir **Monto** → Registrar = **~6 interacciones**, con el monto tecleado aunque el sistema sabe la cuota |
| Aplicar la quincena a todos | «Aplicar quincena (N)» → confirmar la fecha → «Aplicar a las N» = **2 pasos** |
| Crear empleado | «···» → Nuevo empleado → **Nombre \*** (único obligatorio) · Empresa · Deducción Quincenal ($) · Notas → «Crear Empleado» |
| Abrir la ficha | clic en la fila. **<640 px abre un panel deslizante; ≥640 px navega** a `/prestamos/[id]` |
| Bajar el Excel | «···» → «Descargar historial» (respeta el filtro de empresa) |

**Campos del modal «Nuevo/Editar Empleado»** (nombre exacto en pantalla): `Nombre *` ·
`Empresa` (por defecto «Sin asignar») · `Deducción Quincenal ($)` · `Notas`.
**Campos del modal «Nuevo Movimiento»** de la lista: `Empleado *` · `Fecha *` (por defecto hoy) ·
`Concepto *` (por defecto **«Préstamo»**) · `Monto ($) *` · `Notas`.

### 2. Ficha del colaborador — `/prestamos/[id]`
`src/app/prestamos/[id]/page.tsx` (284 líneas) + 10 componentes y 3 hooks en `components/`.

- **Encabezado** (`EmpleadoHeader.tsx`): nombre grande, empresa, chip **Activo/Archivado**, chip
  **Saldado**; botones `Editar` · `Archivar` **(solo si el saldo es exactamente 0; con saldo > 0 el
  botón se ve pero está apagado, con el globo «Saldo pendiente de $X — paga el saldo para
  archivar»)** o `Reactivar` · `← Colaboradores`.
- **Tarjeta de saldo** (`SummaryCards.tsx`): «SALDO PENDIENTE» (o «SALDO A FAVOR») en 3xl,
  `Prestado $X · Pagado $Y` debajo, chip de quincena (**✓ Deducida esta quincena** / **⚠ Deducción
  pendiente**) y «Progreso de pago» con barra roja/ámbar/verde (cortes en 25% y 75%).
- **Dos botones**: `Pago Quincenal · $X` (verde; apagado con «Préstamo saldado — no hay saldo por
  deducir» si el saldo ≤ 0) y `+ Nuevo Movimiento` (negro).
- **Estado de cuenta** (`MovimientoTable.tsx`): 4 pestañas **Todos · Pendientes · Aprobados ·
  Rechazados** con contador; abajo de 1024 px son **tarjetas**, arriba una **tabla** de
  `Fecha · Concepto · Notas · Monto · Saldo · [Estado] · Acciones`. El **saldo corriente** se
  recalcula renglón por renglón. Las notas van completas (no truncadas) y en *sentence case*
  (`toSentence` baja las que están GRITADAS). El icono ✎ de editar solo sale si el movimiento
  **no está aprobado o tiene menos de 24 horas**; el 🗑 sale siempre para admin y contabilidad.
- **«Zona de acciones peligrosas»** (`DangerZone.tsx`, colapsada, **solo admin**): *Eliminar
  Empleado* (apagado si tiene movimientos, con el globo «Debes borrar todos los movimientos
  primero»; pide escribir **el nombre exacto**) · *Eliminar Todo el Historial* (pide escribir
  **CONFIRMAR**) · *Forzar Archivado* (solo si está activo y con saldo > 0).

**La tarea más frecuente aquí — «Pago Quincenal»: 2 clics y 0 campos**, pero **escribe la fecha de
HOY sin preguntar** (`useEmpleadoActions.ts:74`) y la nota fija `"Deducción quincenal"`.

**Modal «Nuevo Movimiento» de la ficha** (`MovimientoModal.tsx`): paso 1 son **seis tarjetas** —
💳 *Pago Quincenal* · ➕ *Préstamo* · 💰 *Pago Extra* · ⚠️ *Responsabilidad por daño* ·
🔄 *Abono Extra* · ✅ *Pago de responsabilidad* — cada una con «Reduce la deuda» / «Aumenta la
deuda». **Seis tarjetas para cinco conceptos**: «Pago Quincenal» y «Pago Extra» son ambas el
concepto `Pago`, y solo la primera precarga el monto con la cuota y la nota «Deducción quincenal».
Paso 2: `Fecha *` · `Monto ($) *` · `Notas`.

**Modal «Editar Movimiento»** (`EditMovimientoModal.tsx`): `Fecha *` · `Concepto` **deshabilitado**
(«El tipo de movimiento no se puede cambiar») · `Monto ($) *` · `Notas`.

### 3. Panel deslizante del celular (dentro de `PrestamosClient.tsx`, `BottomSheet`)
Se abre al tocar una fila con menos de 640 px de ancho. Muestra nombre, empresa, tres tarjetas
(Prestado / Pagado / Saldo), la barra de progreso, los **últimos 5 movimientos** con signo y color,
y dos botones: **`Pago Quincenal — $X`** (solo si hay cuota y saldo, con confirmación) y
**`Ver completo`** (navega a la ficha). Es un **quinto camino** para registrar el mismo pago.

### 4. Diálogo «Aplicar deducción quincenal» (`AplicarQuincenaModal.tsx`, 3-sep-2026)
- **`Fecha de pago`** con **dos atajos** que son los dos días de pago que acaban de pasar — un 15 y
  un **fin de mes REAL** (28/29/30/31 según el mes), el más reciente primero — más un campo de fecha
  libre («Otra fecha de pago»).
- Debajo, un resumen que **recalcula al cambiar la fecha**: en ámbar *«N ya tienen el descuento de
  esta quincena; no se les vuelve a aplicar»*, y *«Se aplicará a N personas por un total de $X. La
  última cuota se ajusta al saldo automáticamente»*. Si no hay a quién, lo dice y **el botón queda
  apagado**.
- Botones: **`Aplicar a las N`** y `Cancelar`.

### 5. Pantallas y caminos sin entrada visible
- **`GET /api/prestamos/movimientos`** (`?empleado_id=` opcional, paginado por orden fecha desc):
  existe, filtra `deleted` bien… y **ningún archivo la llama**. Los 8 `fetch` a esa URL son POST,
  PUT o DELETE.
- **Deep link `/prestamos?search=Juan`**: lo genera el Spotlight del buscador global
  (`SearchBar.tsx:91`, *«Buscar préstamos de "X"»*), pero `PrestamosClient` guarda `search` en un
  `useState("")` y **nunca lee `searchParams`**. El enlace abre la lista sin filtrar.
- **`loading.tsx`** dibuja un esqueleto con `SkeletonTable` — pero la lista ya no es una tabla,
  son `<li>`. Se ve un instante y no coincide con lo que llega.

## Los datos

Ver `CLAUDE.md § Trampas transversales`: **en préstamos `deleted` es NULLABLE**, por eso el patrón
correcto es `.or("deleted.is.null,deleted.eq.false")` y no `.eq("deleted", false)`.
⚠️ **Medido hoy: 0 nulos en las dos tablas** — las 32 fichas y los 443 movimientos tienen `deleted`
en `true` o `false`. O sea que el `.eq(...)` que usan `prestamos-planilla-server.ts` y el POST del
módulo **hoy no pierde ninguna fila**, pero el día que un insert deje el campo en NULL sí la
perdería, y sin ruido.

### `prestamos_empleados` — 32 filas · grano: **una ficha de préstamo** (llave `id` uuid)
15 activas · 17 archivadas · **0 borradas**. Empresas realmente usadas: **Confecciones Boston 22
(10 activas) · Vistana International 5 (3) · Fashion Wear 5 (2)** — el desplegable ofrece 7.

| columna | para qué | quién la escribe | quién la lee | llenas |
|---|---|---|---|---|
| `id` uuid PK | identidad | DB (`gen_random_uuid()`) | todo, incluido el enlace del buscador | 32 |
| `nombre` text NOT NULL | **la identidad real**, texto libre tecleado | POST y PUT `/empleados` | lista, ficha, Boston, buscador global, Excel, planilla | 32 |
| `empresa` text | agrupar y filtrar. Guarda el **NOMBRE** («Confecciones Boston»), no la key | POST y PUT | filtro de la lista, `/api/boston/inicio` (`.eq("empresa","Confecciones Boston")`), pestaña de Boston, Excel | 32 · **3 valores** |
| `deduccion_quincenal` numeric NOT NULL d.`0` | **la cuota**: lo que se le descuenta cada quincena | POST y PUT | RPC del lote, los 3 botones de pago quincenal, planilla de Asistencia, Excel | 32 · **todas ≠ 0** |
| `notas` text | — | POST y PUT | 🔴 **NADIE** | 29 |
| `activo` bool d.`true` | archivar / reactivar | PUT `{activo}` y el DELETE | filtros de lista, RPC, las 2 rutas de Boston, buscador, Excel, planilla | 32 |
| `created_at` timestamptz d.`now()` | — | DB | 🔴 **NADIE** (no se muestra ni se ordena por ella) | 32 |
| `deleted` bool d.`false` | soft delete | **solo** `DELETE /empleados/[id]` (admin) | 🔴 **solo `prestamos-planilla-server.ts`**. Ni la lista, ni la ficha, ni el Excel, ni el buscador, ni las 2 rutas de Boston lo filtran | 32 en `false` |
| `empleado_codigo` text | 🔴 **el amarre con la planilla** — el código del reloj (`asistencia_personas.empleado_codigo`) | 🔴 **solo la migración `20260902120000`. Ninguna pantalla ni ninguna ruta del módulo lo escribe** | `prestamos-planilla-server.ts` | **22 de 32** |

🔴 **`notas` del empleado: nadie la lee.** Se escribe en dos formularios y solo se recupera dentro
del propio formulario de edición (`PrestamosClient.tsx:212`, `useEmpleadoActions.ts:27`). No aparece
en la lista, ni en la ficha, ni en el Excel, ni en Boston, ni en la planilla. 29 filas la tienen, y
su contenido es un eco del último movimiento: «PRESTAMO», «DESCUENTO DE MERCANCIA », «DEDUCCION
QUINCENAL», «PRESTAMO paga martes 21».

🔴 **`empleado_codigo` no se puede editar desde ninguna parte.** El PUT solo acepta
`nombre, empresa, deduccion_quincenal, notas, activo` (`empleados/[id]/route.ts:25-31`). Y sin
embargo el aviso ámbar de la planilla dice, textual: *«Se atan en Préstamos, eligiendo la persona de
la ficha»* (`prestamos-planilla.ts`, `textoPrestamoSinAtar`). Esa acción **no existe**.

⚠️ El índice `prestamos_empleados_empleado_codigo_idx` **no es único**: `RAMON MIRANDA` tiene el
código `21` en dos fichas (una activa, una archivada). La planilla lo sabe y **agrupa por código a
propósito** (`sugerirPrestamos`).

### `prestamos_movimientos` — 443 filas · grano: **un movimiento de plata** (llave `id` uuid)
432 vivos, **11 borrados**, 0 con `deleted` NULL. Fechas del **2-ene-2025 al 4-sep-2026**.
Carga inicial: **243 filas creadas el 26 y 27 de marzo de 2026** (165 + 78); después, ~20-30/mes.

| columna | para qué | quién la escribe | quién la lee | llenas |
|---|---|---|---|---|
| `id` uuid PK | identidad | DB | todo | 443 |
| `empleado_id` uuid | a quién pertenece (FK lógica, sin constraint declarada) | POST | todo | 443 |
| `fecha` date NOT NULL | la fecha del hecho | POST y PUT | saldo corriente, dedup, chips de quincena, «ya descontado» de la planilla | 443 |
| `concepto` text NOT NULL | **el signo** de la plata | POST (**inmutable en el PUT**) | todo | 443 · **5 valores** |
| `monto` numeric NOT NULL | la plata | POST y PUT | todo | 443 |
| `notas` text | ver abajo — es a la vez basura, almacén y llave | POST y PUT | tabla de la ficha, Excel, **y el dedup del POST** (`.ilike("notas","Deducción quincenal%")`) | **443 de 443, ninguna vacía** |
| `estado` text NOT NULL d.`'aprobado'` | qué cuenta para el saldo | POST (**hardcodeado `"aprobado"`**), PUT | los 8 cálculos de saldo | **443 = `aprobado`. Cero de cualquier otro valor** |
| `aprobado_por` uuid | — | 🔴 **NADIE** (sigue en el `allowed[]` del PUT, nunca se manda) | 🔴 **NADIE** | **0** |
| `created_by` uuid | — | 🔴 **NADIE** | 🔴 **NADIE** | **0** |
| `created_at` timestamptz d.`now()` | desempate de orden cuando dos comparten fecha | DB | orden de la tabla, del Excel y del saldo corriente; ventana de 24 h para poder editar | 443 |
| `deleted` bool d.`false` | soft delete | `DELETE /movimientos/[id]` | todos, con `.or(...)` o `.eq(...)` según el archivo | 11 en `true` |

**`estado`: una columna de un solo valor que sostiene ocho filtros.** El POST lo fija a
`"aprobado"` desde el 27-ago-2026 (`movimientos/route.ts:111` + migración `20260831120000`).
Nadie puede producir `pendiente_aprobacion` ni `rechazado` desde la app.

**Los 5 conceptos, por año (filas vivas):**

| concepto | signo | 2025 | 2026 |
|---|---|---|---|
| `Pago` | resta | 80 · $6.228,40 | 191 · $11.675,54 |
| `Préstamo` | **suma** | 21 · $15.321,45 | 53 · $8.540,00 |
| `Pago de responsabilidad` | resta | 27 · $761,73 | 32 · $879,79 |
| `Responsabilidad por daño` | **suma** | 4 · $1.322,25 | 20 · $573,77 |
| `Abono extra` | resta | **1 · $300,00** | **3 · $850,00** |

Ninguno dejó de usarse. **«Abono extra» es marginal — 4 filas en 20 meses** — pero no es
prescindible: es el único concepto que la planilla **excluye** del descuento del sueldo
(`CONCEPTOS_DESCUENTO`), porque es plata que la persona pagó de su bolsillo.

**¿`deduccion_quincenal` coincide con lo que de verdad se paga?** Medido sobre los 191 `Pago` de
2026: **135 (71%) son exactamente la cuota de la ficha.** 176 llevan una nota que dice «Deducción
quincenal…», y **42 de esas 176 tienen un monto distinto de la cuota**. Por persona: 8 pagan
siempre exacto (ALEJANDRA, ANDREA, ANDRES, ESMER, GABRIELA, KEVIN, LUIS ARROYO, YEISON); YULICAR
tiene **6 montos distintos** (3,39 · 11,74 · 18,19 · 25 · 50 · 100); ROXANA 5; MARIA BETHANCOURTH y
las dos MORALES **nunca** pagaron su cuota nominal. La cuota describe bien la mayoría, no todos, y
la RPC ya la capea al saldo.

**Qué son de verdad las `notas` de los movimientos** (432 vivas, 87 textos distintos):

| clase | filas | % |
|---|---|---|
| variantes de «Deducción quincenal» (`DEDUCCION QUINCENAL `, `DEDUCCION DE QUINCENA`, `Descuento quincenal`…) | 286 | 66% |
| variantes de «Préstamo» (`PRESTAMO`, `Nuevo préstamo`, `Prestamo`) | 55 | 13% |
| variantes de «Descuento de mercancía» | 6 | 1% |
| **eco del concepto (subtotal)** | **347** | **80%** |
| «Hora extras 1ra de Agosto», «2da de Julio»… (22 textos, uno por quincena, **todos sobre `Pago de responsabilidad`**) | 22 | 5% |
| texto propio con información real | 63 | 15% |

**El 80% es eco.** Lo que el 20% restante guarda y **no existe en ninguna otra columna**:
- **De qué empresa salió la plata**: «Fashion Shoes» ×11, «Boston» ×4, «Fashion Wear» ×2,
  «DEPOSITADO A FASHION WEAR », «Abono a cuenta depositado a Fashion wear». ⚠️ **«Fashion Shoes» ni
  siquiera es una de las 3 empresas que usa la tabla** — la empresa vive en la ficha, no en el
  movimiento.
- **Con qué se pagó**: «Horas extras», «Décimo», «Liquidación», «Descuento de liquidación »,
  «PRESTAMO pagara con las comisiones », «Deducción quincenal 50.00 y vacaciones 400.00».
- **Qué mercancía se dañó**, con cliente y precio: «DESCUENTO DE MERCACNIA PAKAL(1) 8.00 MAM
  PROTECTION (1)8.00 PORTA IDENTIFICADOR (20) 37.50», «POLO WAFFIT DAMA M/C UNICRESE JERUSALEM
  (3 LOGO) DAÑO DE LOGO EN ESPALDA.»
- **Compromisos de pago**: «Cancelar 15/04/2026», «CANCELA EL MARTES 21», «Pagar 23 de marzo»,
  «Descontar 25 por quincena ».
- **Una confesión de bug**: *«Descuento de la planilla 1-15 ago que no se habia registrado (su
  prestamo estaba trabado en pendiente de aprobacion)»*.

🔴 **La nota no es decorativa: el servidor decide con ella.** El dedup del POST
(`movimientos/route.ts:75-93`) bloquea la segunda deducción de la quincena **solo si `notas`
empieza con «Deducción quincenal»**. Cambiarle el acento o las mayúsculas apaga ese candado.

### `asistencia_prestamo_aprobado` — 13 filas · grano `(quincena, empleado_codigo)` (PK)
Es de Asistencia, pero solo existe por Préstamos. Columnas: `quincena` · `empleado_codigo` ·
`aprobado` · `monto_visto` (**el testigo**: cuánto sugería el módulo al aprobar, no lo que se paga)
· `marcado_por` · `marcado_en`. Las 6 llenas en las 13 filas.
**Las 13 son de la quincena `2026-08-2`, todas `aprobado = true`, todas por `Contabilidad`, todas el
27-ago-2026 entre las 19:18 y las 19:27 UTC — nueve minutos.** Suman **$495,00** y coinciden al
centavo con las 13 casillas `prestamo` de `asistencia_planilla_manual` de esa quincena.
🔴 **De la quincena `2026-09-1` no hay ni una fila.**

### Soft delete
- **Movimientos**: `deleted = true` desde `DELETE /movimientos/[id]`. **Con log** (`prestamo_mov_delete`).
- **Empleados**: `deleted = true` **y** `activo = false` desde `DELETE /empleados/[id]` (solo admin).
  Con log. **0 usos históricos.**
- 🔴 **Excepción: «Eliminar Todo el Historial»** (`DELETE /api/prestamos/movimientos` con
  `{empleado_id}`) hace un **`.delete()` real de Postgres, sin soft delete y sin `logActivity`**.
  Es el único hard delete del módulo, en la tabla de plata, y sin auditoría.

## De dónde vienen los datos

🔴 **Ninguno. Este módulo no toca Switch Soft, no tiene ningún cron y no importa ningún archivo.**
Verificado contra `vercel.json` (79 entradas, ninguna con `prestamo` en el path), contra
`docs/switch-flujo.md` y contra `docs/switch-referencia.md`: préstamos no aparece en ninguno de los
dos, y no hay endpoint del API de Switch ni reporte del panel web que alimente estas tablas.

**Todo el dato lo teclea una persona** — `Contabilidad`, desde `/prestamos`. Es una de las pocas
islas del sistema con esa propiedad, y por eso:
- No hay nada que se «congele» ni que llegue viejo: si nadie escribe, es porque nadie prestó.
- Las alertas de silencio de datos (`src/lib/alertas/silencio-de-datos.ts`) **no lo vigilan**:
  `prestamos_movimientos` **no está en `TABLAS_VIGILADAS`**, precisamente porque el cero es un dato
  del negocio, no una avería.
- La única salida automática relacionada es indirecta: el aviso ámbar de la planilla de Asistencia.

**Lo único que corre solo sobre estas tablas es el respaldo**: `/api/cron/backup` (06:00, 10:30 y
18:30 UTC, con guard de no-op si una corrida anterior ya registró éxito hoy) copia
`prestamos_empleados` y `prestamos_movimientos` enteras (`api/cron/backup/route.ts:188-189`).
Si el backup falla, no se pierde nada del módulo — solo la copia off-site.

## Las reglas que ya están fijadas

**Las que tocan plata:**

1. 🔴 **La cuenta del saldo se dice UNA vez** — `src/lib/prestamos-saldo.ts` (`calcularSaldoPrestamo`).
   **SUMAN** `Préstamo` + `Responsabilidad por daño`; **RESTAN** `Pago` + `Abono extra` +
   `Pago de responsabilidad`. Un concepto que no esté en ninguna de las dos listas **no se cuenta**
   — no se asume que suma (misma regla que `signoVenta()` en ventas). `estado !== "aprobado"` no
   suma. `deleted === true` no suma. Se extrajo de `PrestamosClient.tsx` el 27-ago-2026 para que la
   pestaña de Boston no tuviera una copia: *«dos definiciones de "lo que debe" son dos números que
   un día no coinciden»* (`docs/postmortems/boston-cxc.md:183`).
2. 🔴 **Todo movimiento entra APROBADO** — `movimientos/route.ts:95-111` (`const estado = "aprobado"`)
   + migración `20260831120000_prestamos_sin_aprobacion.sql`. La columna se sigue guardando y las
   filas viejas no se tocan, pero nadie escribe `pendiente_aprobacion`. Candado:
   `src/__tests__/iphone-targets-prestamos.test.ts:106` — pone el build ROJO si reaparece
   `pendiente_aprobacion`, `Aprobar todos` o `selectedPending` en `PrestamosClient.tsx`.
3. **Un pago no puede exceder el saldo pendiente** — validado en el POST
   (`movimientos/route.ts:51-69`) **y** en el PUT (`movimientos/[id]/route.ts:32-62`, agregado
   después porque el PUT no lo hacía y subir el monto de un pago dejaba el saldo negativo).
4. **La fecha de un movimiento no puede ser futura** — POST, con **Panamá = UTC−5 fijo**
   (`movimientos/route.ts:45-49`). ⚠️ El PUT **no** la valida.
5. **El concepto es inmutable después de creado** — PUT (`movimientos/[id]/route.ts:20-26`, 400 con
   «El tipo de movimiento no se puede cambiar después de creación») y `<select>` deshabilitado en
   `EditMovimientoModal.tsx:44`.
6. **El concepto tiene que estar en la lista** — `MOV_CONCEPTOS`, derivado de `MOV_TYPES` en
   `components/types.ts:67`; el POST lo valida (400 «Concepto inválido»).
7. 🔴 **Aplicar la quincena dos veces no cobra dos veces** — dedup dentro de la RPC
   `prestamos_aplicar_quincena`, espejado en `resumenAplicarQuincena` (`lib/prestamos-quincena.ts`)
   para **decirlo antes de aplicar**. Ante la ambigüedad se **omite** y se dice, nunca se cobra dos.
8. 🔑 **La ventana del dedup es ASIMÉTRICA: `[inicio, fin + 3 días]`** — sin tolerancia al inicio
   (el pago del 15 queda a un día de la quincena 16–fin y con ±3 bloquearía el lote entero); con
   tolerancia al final, porque los botones individuales escriben la fecha de hoy y un registro 1–3
   días después del cierre sigue siendo de esa quincena. Migración `20260917120000`,
   **aplicada el 4-sep-2026** (verificado en `pg_proc`: `v_tol_start date := p_quincena_start;`).
9. **La última cuota se capea al saldo** — `least(deduccion_quincenal, saldo)` en la RPC (con la
   nota «Deducción quincenal (ajustada al saldo)»); `Math.min` en `resumenAplicarQuincena`.
10. 🔴 **La fecha de pago la elige contabilidad, no el reloj** — `lib/prestamos-quincena.ts:28-40`.
    La quincena del dedup se deriva de la fecha **elegida**, no de `new Date()`. Candados:
    `src/__tests__/api/prestamos-aplicar-quincena-fecha.test.ts` (24 casos, incluidos meses de
    28/29/30/31 días) y `src/__tests__/components/prestamos-aplicar-quincena-pantalla.test.tsx` (6).
    17 mutaciones, 17 cazadas (`scripts/_mutar-prestamos-quincena-fecha.sh`).
11. **Panamá es UTC−5 fijo y los tests usan fechas fijas**, nunca `new Date()` — salvo el fallback
    sin cuerpo del endpoint, donde el reloj se congela.
12. **El embed de PostgREST NO filtra `deleted` solo** — por eso existe `src/lib/prestamos-helpers.ts`
    (`filterEmpleadosMovimientos`), que las 4 lecturas con embed aplican después del fetch.

**Las del amarre con la planilla** (postmortem: `docs/postmortems/asistencia-planilla.md:255-410`):

13. 🔴 **Nada se ata por parecido. Ni aquí ni nunca.** Candado
    `src/__tests__/lib/prestamos-amarre-migracion.test.ts` (12 casos) — lee el SQL **sin una sola
    línea de comentario** (el archivo nombra lo que prohíbe, así que un barrido sobre el texto
    entero se engañaría solo) y prohíbe `LIKE`/`ILIKE`, `similarity`, `unaccent`, `levenshtein`,
    `soundex`, `metaphone`, `word_similarity`, `position`, `strpos`, `substring`, `left`,
    `regexp_*`, `translate` y `~*`. **La única normalización permitida es `upper(btrim(...))`**, en
    los dos lados. El caso que lo prueba: `LAURA CASIANI` **no** cruza con
    `Laura Lismari Casiano Vega` — CASIAN**I** y CASIAN**O** no son la misma palabra — y se queda
    sin atar aunque su saldo sea $0 y atarla no costara nada.
14. **La empresa también tiene que coincidir** (con lista cerrada de traducción nombre→key: una
    empresa desconocida no ata), y **solo si hay un único candidato** en la planilla.
15. **Los tres amarres a mano son una lista explícita CON guard**: el UPDATE exige que el código
    tenga el nombre esperado, o la fila no se escribe. No es un comentario.
16. 🔴 **En `prestamos-planilla.ts` NO se vuelve a calcular el saldo.** Llega ya calculado por la
    misma cuenta del módulo. Lo único que hace ese archivo es **elegir qué número va en la casilla**.
17. 🔴 **El hecho consumado le gana a la estimación** — si el módulo ya registró un `Pago` dentro de
    la quincena, la casilla dice **exactamente eso**; si no, dice `min(cuota, saldo)`.
    El caso que lo obliga: **KEVIN LUBO** tenía saldo $50 y cuota $50; aplicada la quincena su saldo
    es $0, y `min(cuota, saldo)` habría dicho **$0 el mismo mes en que se le descontaron $50**.
18. ⚠️ **«Abono extra» NO es un descuento de planilla** — es plata del bolsillo; descontarla otra
    vez del sueldo sería cobrarle dos veces. `CONCEPTOS_DESCUENTO = ["Pago","Pago de
    responsabilidad"]`. Sí baja el saldo, y el saldo ya viene con eso adentro.
19. 🔑 **Se agrupa por CÓDIGO, no por ficha** — `RAMON MIRANDA` tiene dos fichas con el código 21 y
    la planilla tiene **UNA** casilla. Los dos nombres quedan a la vista.
20. **La ficha archivada no propone cuota nueva** — misma condición que la RPC
    (`coalesce(activo, true) = true`).
21. 🔴 **El descuento se aprueba, no se aplica solo** — la contadora, textual:
    *«El préstamo si debe ser por aprobarlo»* (27-ago-2026). Y **esta aprobación no esconde plata**:
    lo no aprobado **se ve**, con nombre y monto, en ámbar arriba del cuadro, y el saldo del módulo
    no depende de ella en absoluto.
22. **Retirar la aprobación no borra un número que escribió una persona** — solo se vacía la casilla
    si todavía dice exactamente lo que puso la aprobación anterior; si alguien la corrigió a mano,
    esa corrección es una decisión y se devuelve en `noTocadas` (`api/asistencia/prestamos/route.ts:116-126`).
23. 🔑 **La ventana de «ya descontado» de la planilla es EXACTA, sin los ±3 días de la RPC** — los
    pagos caen justo en el borde (15 y 30) y con tolerancia un pago del 15 entraría a la vez en la
    quincena 1–15 y en la 16–31: el mismo descuento contado dos veces
    (`prestamos-planilla-server.ts:122-127`).
24. 🔴 **La tolerancia a DDL pendiente se retiró el 3-sep-2026** — `prestamos-planilla-server.ts` ya
    no relee sin `empleado_codigo` ante un error: **lanza**. Degradar leería un permiso o un timeout
    como «nadie está atado» y la planilla dejaría de descontar en silencio, que es exactamente cómo
    se perdieron los $700 de LUIS ADRIAN ARROYO durante 22 días. Candado:
    `src/__tests__/lib/tolerancia-ddl-retirada-asistencia.test.ts` § 6 (3 casos).
25. **La aprobación del préstamo la da quien arma la planilla, no quien aprueba horas extra** —
    `asistenciaRoles()` y NO `aprobacionesRoles()`: las extras las autoriza Julio con el usuario
    `bodega`, que a propósito **no ve un solo sueldo**, y el descuento de préstamo ES plata del
    sueldo (`api/asistencia/prestamos/route.ts:18-23`).

**De pantalla (todas con candado estático):**

26. **Todo control táctil llega a 44 px y ninguna letra baja de 12 px** —
    `src/__tests__/iphone-targets-prestamos.test.ts` (18 casos, sobre los 9 archivos del módulo).
27. **Los chips bajan a la línea 2 en celular y iPad**, con su texto completo («⚠ Pendiente» y
    «✓ Deducida» no se distinguen solo por color) — `src/__tests__/iphone-ancho-nombres.test.ts`.
    El nombre se localiza por `data-empleado-campo="nombre"`, no por su clase de breakpoint.
28. **El estado de cuenta pasa a tarjetas por debajo de `lg` (1024 px)** — sus 7 columnas piden
    740 px y el ancho útil es 358 px en un iPhone y 562 en un iPad con la barra lateral.
    `src/__tests__/ipad-caja-prestamos-cheques.test.ts`.
29. **El Excel empieza en la fila 1**, con autofiltro desde A1 y encabezados fijos —
    `src/__tests__/excel-exports-finanzas.test.ts` (además exige `buildPrestamosWorkbook.length === 1`,
    o sea que el builder no vuelva a recibir un título que ya dice el nombre del archivo).
30. **El filtro de empresa se recuerda** en `localStorage` como `fg_last_prestamos_empresa` —
    `src/__tests__/lib/useLastUsed.test.ts:69`.

## Con qué conecta

### Qué lee de otros módulos
🔴 **Nada.** Préstamos no lee ninguna tabla ajena. Lo único que importa de afuera es
`EMPRESAS` (`src/lib/companies.ts:59`) para pintar el desplegable — que ofrece **7 empresas** aunque
solo se usan 3.

### Quién lee lo suyo

| quién | qué lee, exactamente | archivo |
|---|---|---|
| 🔴 **Asistencia › Planilla** | `prestamos_empleados` (`id, nombre, activo, deduccion_quincenal, empleado_codigo`, `.eq("deleted", false)`, paginado) y `prestamos_movimientos` (`id, empleado_id, fecha, concepto, monto`, `estado='aprobado'`, `deleted=false`, paginado). Calcula el saldo y lo ya descontado en la quincena | `src/lib/asistencia/prestamos-planilla-server.ts` → `prestamos-planilla.ts` → `src/app/asistencia/PlanillaTab.tsx` (bloque **«Préstamos por descontar»**) |
| **Boston › pestaña Préstamos** (David) | `prestamos_empleados` con embed, `activo=true`, **las 3 empresas a propósito**. Usa `calcularSaldoPrestamo`. **Único verbo: GET** | `src/app/api/boston/prestamos/route.ts` |
| **Boston › Inicio** (David) | `count` de `prestamos_empleados` con `empresa = "Confecciones Boston"` **y** `activo = true`. **Solo Boston**, aunque la pestaña muestre las 3 | `src/app/api/boston/inicio/route.ts:120-132` |
| **Búsqueda global** | `prestamos_empleados` por `nombre ILIKE`, `activo=true`, límite 5, con embed para el saldo. Enlaza a `/prestamos/{id}` | `src/app/api/search/route.ts:120-127`, `src/components/SearchBar.tsx:186-191` |
| **Data Health** | `prestamos_movimientos` completa con `estado='aprobado'`; alerta `info` si algún saldo queda por debajo de **−$100** (la persona pagó más de lo prestado). Check `prestamos_saldo_anomalo` | `src/lib/integrity-checks.ts:66-114`, cron `/api/cron/integrity-check` 12:00 UTC |
| **Respaldo** | las dos tablas enteras | `src/app/api/cron/backup/route.ts:188-189` |
| **Badges** | cuenta `estado = 'pendiente_aprobacion'` — **siempre 0** desde el 27-ago | `src/app/api/notification-badges/route.ts:42-47`. ⚠️ **El hook `useBadges` no tiene ningún consumidor**: es la única llamada a esa ruta y nadie llama al hook |

**El puente con Asistencia es de IDA.** La planilla lee el saldo y propone la cuota; **aprobar allá
NO registra ningún pago aquí**. Lo que aprobar escribe es `asistencia_prestamo_aprobado` (la decisión)
y `asistencia_planilla_manual.prestamo` (la casilla). El pago en Préstamos lo registra una persona,
o el botón «Aplicar quincena».

### Qué se rompería si se cambiara la forma de sus datos

| cambio | qué se rompe |
|---|---|
| **Renombrar cualquiera de los 5 conceptos** | los 8 lugares que calculan el saldo (§ Lo que sobra), la RPC, la planilla, Boston, el Excel y Data Health. Ninguno cae a cero: **cambian el número en silencio**, porque un concepto desconocido «no se cuenta» |
| **Escribir otro valor en `estado`** | esa plata desaparece de **todas** las pantallas sin avisar. Es literalmente el mecanismo de los $700 de LUIS ADRIAN ARROYO |
| **Quitar o renombrar `empleado_codigo`** | la planilla lanza (500) y no sale el cuadro. Ya no degrada — es deliberado |
| **Que `empresa` pase a guardar la key (`confecciones_boston`) en vez del nombre** | `/api/boston/inicio` cuenta **0 personas con préstamo** en la tarjeta de David, sin error |
| **Que `deleted` vuelva a admitir NULL en inserts** | `prestamos-planilla-server.ts` y el POST usan `.eq("deleted", false)`: esas filas **desaparecen** del cálculo |
| **Que `prestamos_movimientos` pase de 1.000 filas** | el check de Data Health lee **sin paginar** (`db-max-rows` corta en silencio). Hoy hay 443: margen de 557 |
| **Cambiar el texto de la nota «Deducción quincenal»** | se apaga el dedup del POST y se puede registrar dos veces la misma deducción |

## Por qué está así

| decisión | cita textual y fecha |
|---|---|
| **Se retira la aprobación de préstamos: todo entra aprobado** | Daniel, **27-ago-2026**: *«quita poder aprobar prestamos, todos deben de pasar»*. El freno **no protegía, escondía**: el saldo solo suma lo aprobado, así que un préstamo esperando aprobación es un préstamo que la pantalla muestra en CERO. Medido: LUIS ADRIAN ARROYO tenía **$700 del 5-ago atrapados**, saldo $0, sin descontarle nada, y se supo **22 días después** porque la contadora lo mencionó de pasada (commit `ec994222`, #651) |
| **`rechazado` no se toca en la migración** | «es una decisión que alguien tomó» (commit `ec994222`) |
| **La migración aprueba lo que quedó esperando** | sin ella esas filas quedarían **invisibles para siempre**, porque la pantalla que servía para aprobarlas se fue en el mismo cambio |
| **La cuenta del saldo se extrae a `lib/`** | 27-ago-2026, al hacer la pestaña de David: *«dos definiciones de "lo que debe" son dos números que un día no coinciden — el mismo error que ya costó la MV de la cartera»* |
| **David ve los préstamos de las TRES empresas** | Daniel, **2-sep-2026**, en mayúsculas y aparte: **«Préstamos (TODOS, no solo los de Boston)»**. Es la ÚNICA excepción del módulo Boston, cuya regla general es *«no quiero que vea info de fashion group»*. Está escrita en el código y probada por un test justamente porque es la excepción |
| **David lee, no escribe** | por eso hay una ruta propia con un solo verbo GET, en vez de sumarle el rol a las 6 rutas del módulo (que tienen **9 verbos de escritura**, y 3 ni siquiera pasan por `requireRole`). Así la pantalla de la contadora no se tocó ni un carácter |
| **La casilla «Préstamo» de la planilla se llena sola, pero con aprobación** | la contadora, **27-ago-2026**: ***«El préstamo si debe ser por aprobarlo»*** |
| **El amarre es una columna de código, no el nombre** | medido el 27-ago: de las 30 fichas de entonces, **18 cruzaban por igualdad exacta de nombre y 12 no** — y entre las que no cruzaban había tres con saldo vivo: GABRIELA ($360), LUIS ARROYO ($700), MARIA BETHANCOURTH ($700) |
| **Nada se ata por parecido** | es la lección de `Outlet Duty Free N2` vs `N3` (§ Guías): dos nombres parecidos pueden ser dos personas, y *«un descuento aplicado a la persona equivocada no deja ningún rastro — el neto sale distinto, el recibo se imprime, y nadie se entera nunca»* |
| **«Aplicar quincena» pregunta la fecha de pago** | Daniel, **3-sep-2026**: **«Aprobado»**. Defecto medido: el botón existía desde junio y **no se usó ni una vez en 90 días**. Escribía la fecha de HOY, y contabilidad registra 1–4 días después del pago — las 6 quincenas jun-ago, todas: 15-jun→18-jun, 30-jun→1-jul, 15-jul→16-jul, 30-jul→3-ago, 15-ago→17-ago, 30-ago→1-sep. Por eso lo hacía a mano: **6 pasos × 13 personas, 15 minutos por quincena** (la del 1-sep: 13 movimientos entre las 16:14 y las 16:29). De **78 pasos a 1** |
| **Los atajos proponen el pago que ACABA de pasar, no el próximo** | contabilidad registra después del pago: el 1-sep el atajo útil es «31 de agosto», no «30 de septiembre» |
| **No se usa `UndoToast` en el lote** | *«son registros financieros»* (commit `101edb57`, #68) |
| **Archivar pide confirmación; reactivar no** | Sprint 2 (#46): archivar es destructivo en el sentido de que saca a la persona de la lista; reactivar no |
| **El módulo se llama «Colaboradores» en el botón de volver** | `← Colaboradores` en la ficha — es el nombre que la contadora usa para la lista |
| **El Excel no lleva título adentro** | el nombre del archivo ya lo dice (`historial_prestamos_fashion_wear_20260827.xlsx`) — `docs/postmortems/crons-alertas.md:775` |
| **La pantalla no tiene título grande** | poda de textos (#278): «Préstamos» ya lo dicen la barra sticky y el breadcrumb. Queda solo un `<h1 class="sr-only">` para lectores de pantalla |

## Lo que se intentó y se retiró

| qué | cuándo | por qué |
|---|---|---|
| **La lista de aprobación entera** — banner, casillas, botón «Aprobar todos», los dos modales de lote, `doBatchAction` y **6 estados de React** (165 líneas de `PrestamosClient.tsx`) | 27-ago-2026 (#651) | *«quita poder aprobar prestamos, todos deben de pasar»*. Los dos candados de tocables de esa lista se retiraron con ella y los reemplazó **uno que pone el build rojo si vuelve** |
| **El estado `pendiente_aprobacion` para montos ≥ $500** | 27-ago-2026 | escondía plata. La **columna** `estado` y las filas viejas **no se tocaron** — lo que se fue es quién la escribe |
| **La ventana de dedup simétrica `[inicio − 3, fin + 3]`** de la RPC | migración `20260917120000`, escrita el 3-sep y **aplicada el 4-sep** | con los −3 días, el pago del 15 caía dentro de la quincena 16–fin (16 − 3 = 13) y **el lote del 31 no le aplicaba a nadie**. Medido antes de tocar: las 6 quincenas jun-ago se guardaron con fecha exacta de día de pago (15 y 30), ninguna drifteada, así que recortar el inicio **no destapa ningún doble cobro real** |
| **Los 4 KPI grandes y la lista de 9 columnas** | #69 | pasaron a **2 chips** y a una fila de 4 elementos; los botones secundarios al menú «···» y las pestañas de estado se mudaron de la lista a la ficha |
| **El estado de cuenta como tabla en celular** | #373/#374 | 366 px de arrastre a 390 px de ancho: de 6 columnas se veían 2, y las que quedaban fuera eran **MONTO y SALDO**. Pasó a tarjetas por debajo de 1024 px |
| **Las notas truncadas con `truncate`** | #374 | se cortaban en los tres anchos; a 1440 px la peor perdía **942 px de texto**. Ahora se envuelven |
| **El color por concepto en la tabla** | #69 | *«el signo del monto carga la semántica»* |
| **`OUT_COLS` propio / título dentro de la hoja del Excel** | I11 (`7c3e31ab`) + #658 | el módulo pasó al `buildReportSheet` de la casa: encabezados en la fila 1, autofiltro desde A1, fila fija al bajar |
| **`subtitle` de la ficha del home** | #278 | se eliminó el campo de `AppModule` para los 30 módulos |

## Cuánto se usa

⚠️ **`activity_logs` no registra las altas**: ni un movimiento nuevo ni un empleado nuevo pasan por
`logActivity`. De 443 movimientos, el log conoce **94 ediciones y 11 borrados**. Tampoco hay forma
de contar pantallas vistas. Lo que sí se puede medir son las filas escritas y las acciones que sí se
registran.

| evidencia | medido el 4-sep-2026 |
|---|---|
| **fichas** | 32 (15 activas). Creadas: 22 el 26-27 de marzo (la carga inicial), 10 después. Las dos más nuevas son del **2 y el 4 de septiembre** — el módulo se sigue usando hoy |
| **movimientos** | 443 (432 vivos). **243 son la carga inicial** del 26-27 de marzo; los otros ~200 se tecleron de a poco. Pico posterior: 19 el 29-abr, 17 el 30-abr, 16 el 16-abr, 14 el 13-may, **14 el 1-sep** |
| `prestamo_mov_update` | **94** · 28-abr → 1-sep · todas de `Contabilidad`. Por mes: abr 3 · may 12 · jun 20 · jul 18 · ago 28 · **sep 13** |
| `prestamo_empleado_update` | **63** · 17-abr → 27-ago · todas de `Contabilidad`. De esas, **23 son toggles de `activo`** (8 el 30-abr, 6 el 19-jun) y 40 son ediciones de ficha |
| `prestamo_mov_delete` | **11** · `Contabilidad` 9 · `daniel` 2 (los dos, el 30-abr) |
| `prestamo_aplicar_quincena` | 🔴 **0.** El botón nunca se ha usado, ni antes ni después del arreglo del 3-sep |
| `prestamo_approve` | 🔴 **0.** Nunca se aprobó nada por la API |
| `prestamo_empleado_delete` | 🔴 **0.** Nunca se eliminó una ficha |
| aprobaciones del descuento en planilla | **13**, todas de la quincena `2026-08-2`, todas por `Contabilidad`, todas el **27-ago entre las 19:18 y las 19:27 UTC**. Nada de septiembre |
| sesiones vivas | `daniel` 40 (última hoy 23:59 UTC) · `Contabilidad` 19 (última hoy 21:57) · `alberto` 1 |

**Lectura:** lo usa **una sola persona, `Contabilidad`, todos los meses**, con un ritmo estable de
20-30 movimientos y ~15-20 correcciones. **Se corrige mucho**: 94 ediciones sobre los ~200
movimientos tecleados a mano es casi la mitad. Y como los `fields` del log siempre traen los tres
campos (`["monto","fecha","notas"]`, porque el modal manda los tres siempre), **no se puede saber
qué se corrigió**.

**Quién archivó a quién** (cruzando `details.empleadoId`): 15 personas identificadas, todas por
`Contabilidad`, entre el 17-abr y el 24-ago. Seis fueron alternadas dos veces; ALEJANDRA CAMAÑO,
CRISTIAM BLANCO, LUZ BOSQUEZ y MARIA BETHANCOURTH terminaron **reactivadas**.
⚠️ **BRICEIDA MONTERO no tiene ni un evento** — su archivado (el único con saldo, $100) es anterior
al 17-abr o no pasó por la API: **no medible**.

## Qué papeles y Excel produce

**Un solo archivo, y ningún correo ni PDF.** El módulo no manda Telegram ni correo; su única salida
automática es indirecta (el aviso ámbar de la planilla de Asistencia).

| archivo | de dónde sale | nombre | contenido | quién lo recibe |
|---|---|---|---|---|
| **Excel «Descargar historial»** | Lista › menú «···» › **Descargar historial** | `historial_prestamos_<empresa>_<AAAAMMDD>.xlsx` — con la empresa en minúsculas y guiones bajos (`historial_prestamos_confecciones_boston_20260904.xlsx`), o **`todos`** si el filtro está en «Todas las empresas» | **2 hojas** (`src/lib/exports/prestamos-excel.ts`) | Contabilidad |

- **Hoja «Resumen»** — una fila por persona: `Empleado · Empresa · Deducción Quincenal ·
  Total Prestado · Total Pagado · Saldo Pendiente · % Progreso`, más una fila **TOTALES** con
  Prestado, Pagado y Saldo sumados. Los montos van como **número** con formato `$#,##0.00`
  (`MONEY_FMT`) y el porcentaje con `PCT_FMT` (se divide entre 100 para que Excel lo trate como
  porcentaje de verdad).
- **Hoja «Movimientos»** — una fila por movimiento, ordenadas por empleado (A-Z) y dentro por
  fecha descendente con `created_at` de desempate: `Empleado · Empresa · Fecha · Concepto · Monto ·
  Notas · Estado`. La fecha va como texto en formato «5 abr 2026» (`fmtDate`).
- **Las dos hojas empiezan en la fila 1**, con autofiltro desde A1 y la fila de encabezados fija al
  bajar (`buildReportSheet`). Sin título adentro: el nombre del archivo ya lo dice.
- ⚠️ **Solo salen los empleados ACTIVOS** (`export-excel/route.ts:20`, `.eq("activo", true)`). El
  histórico de los 17 archivados **no sale en ningún export**.
- ⚠️ La columna **«Estado»** siempre dice «Aprobado»: `estadoLabel()` sigue traduciendo «Pendiente
  de aprobación» y «Rechazado», dos valores que ya no existen.
- El filtro de empresa del Excel **es el mismo que está puesto en la pantalla** — se pasa como
  `?empresa=`. El nombre del archivo lo repite, así que dos descargas seguidas con filtros distintos
  no se pisan.

## Cómo probarlo a mano

**A. Que la lista dice la verdad — 2 minutos**
1. Entra a `fashiongr.com/prestamos` con `admin` o `Contabilidad`.
2. El chip **«SALDO PENDIENTE TOTAL»** tiene que decir hoy **$4.962,01** y el de quincena, cuántas
   personas con cuota ya tienen el descuento de esta quincena.
3. Marca **«Ver archivados»**: aparecen 17 personas más en gris con el chip «Archivado».
   ⚠️ El total **no cambia** — a propósito: solo suma a los activos. Por eso los **$100** de
   BRICEIDA MONTERO no están en ese número.

**B. Que un pago quincenal baja el saldo — 3 minutos**
1. Abre a alguien con saldo (por ejemplo ANGELA GARCIA, $1.798,05, cuota $50).
2. Anota el «SALDO PENDIENTE» que dice arriba.
3. Toca **`Pago Quincenal · $50,00`** → **Confirmar Pago**.
4. El saldo tiene que bajar exactamente $50, el progreso subir, y arriba tiene que aparecer el chip
   **«✓ Deducida esta quincena»**.
5. Para confirmar que quedó guardado: en el estado de cuenta, el renglón nuevo dice
   `Pago · <hoy> · Deducción quincenal · −$50,00` y la columna **Saldo** de ese renglón tiene que
   coincidir con el saldo grande de arriba.
6. **Prueba del candado**: vuelve a tocar `Pago Quincenal` y confirma. Tiene que salir el aviso
   *«Este empleado ya tiene la deducción quincenal registrada en esta quincena»* y **no** crearse
   un segundo renglón.
7. Para dejarlo como estaba: 🗑 en ese renglón → Eliminar. El saldo vuelve a subir $50.

**C. Que el lote no cobra dos veces — 5 minutos**
1. En la lista, toca **«Aplicar quincena (N)»**.
2. El diálogo propone la fecha del último día de pago que pasó (el 4-sep propone «31 de agosto»).
   El resumen tiene que decir cuántas personas **ya tienen** el descuento de esa quincena y a
   cuántas se aplicaría.
3. **Cambia la fecha al otro atajo** («15 de agosto»): el resumen tiene que **recalcularse solo** —
   otro conteo, otro total. Eso prueba que la quincena sale de la fecha elegida y no de hoy.
4. Toca **`Aplicar a las N`**. El aviso de abajo dice cuántas se aplicaron y cuántas se omitieron.
5. **Aprieta el botón otra vez con la misma fecha.** Tiene que decir *«No hay a quién aplicar con
   esta fecha»* y el botón quedar apagado. Si aplicara de nuevo, el candado está roto.
6. Para confirmar que quedó guardado: cada persona alcanzada tiene ahora el chip **✓ Deducida** en
   la lista, y en su ficha hay un renglón `Pago` con **la fecha que elegiste**, no la de hoy.

**D. Que el préstamo llega a la planilla — 5 minutos**
1. Ve a `fashiongr.com/asistencia` › **Planilla**, elige la empresa y la quincena, toca **Generar**.
2. Busca el bloque **«Préstamos por descontar»**. Tiene que listar a las mismas personas con saldo y
   cuota, con `Cuota $X · saldo $Y` (o *«Ya descontado en Préstamos esta quincena»* si el pago ya se
   registró allá).
3. Toca **Aprobar** en una. La casilla **Préstamo** de esa persona en el cuadro de abajo tiene que
   llenarse con ese monto.
4. Toca **Quitar**: la casilla vuelve a 0. Si la habías corregido a mano, **no** se borra — es lo
   correcto.
5. ⚠️ **Aprobar allá no registra ningún pago en Préstamos.** Vuelve a `/prestamos` y comprueba que
   el saldo de esa persona **no cambió**: el puente es de ida.

**E. Que el nombre distinto se ve (el amarre)**
En «Préstamos por descontar», GABRIELA, LUIS ARROYO y MARIA tienen que salir con el aclaratorio
gris **«(en Préstamos: GABRIELA A. JARAMILLO P.)»**. Ese texto es la única forma de notar un amarre
equivocado, y tiene que estar.

**F. Que las dos fichas sin atar se dicen**
Arriba de la Planilla tiene que salir un aviso ámbar: *«2 préstamos con saldo no están atados a
nadie de la planilla…»* con **MARTHA AZUCENA CHAVARRIA · $300,00** y **YERITZA Y. SOLIS CASTRO ·
$100,00**. Hoy **no hay ninguna pantalla donde atarlos** (§ Lo que sobra o no cuadra).

**G. Que el Excel sale bien**
«···» → **Descargar historial**. Ábrelo: **fila 1 = encabezados**, con las flechitas de filtro, y
la fila queda fija al bajar. Hoja «Resumen» con la fila **TOTALES**; hoja «Movimientos» con la
columna Estado toda en «Aprobado». Si pusiste un filtro de empresa, el nombre del archivo lo dice.

## Qué lo rompe

| qué falla | qué pasa | cómo se notaría |
|---|---|---|
| **Una migración sin aplicar** — el caso real: `20260917120000` estuvo escrita y desplegada mientras la RPC viva seguía con `p_quincena_start − 3` | el diálogo decía «Aplicar a las 10» y la RPC habría aplicado a **0**: con −3 días, todo el que cobró el 15 sale como «ya deducido» y el lote del 31 no le aplica a nadie | **no se habría notado**: el aviso dice cuántas se omitieron, pero nadie estaba mirando. Se descubrió leyendo `pg_proc` contra `supabase_migrations.schema_migrations`. ✅ Aplicada el 4-sep-2026 |
| **Alguien escribe un `estado` distinto de `aprobado`** (a mano en la base, o un código nuevo que lo haga) | esa plata **desaparece del saldo, de la planilla, de Boston, del total de la lista y de Data Health**, todo a la vez y sin error | 🔴 **no se notaría.** Es exactamente lo que pasó con los $700 de LUIS ADRIAN ARROYO: se supo 22 días después porque la contadora lo mencionó de pasada |
| **Se cambia el texto de la nota «Deducción quincenal»** (un acento, mayúsculas) | se apaga el dedup del POST (`.ilike("notas","Deducción quincenal%")`) y se puede registrar dos veces la misma deducción por los botones individuales | doble descuento en la ficha; el chip de quincena seguiría diciendo «✓ Deducida» |
| **Se renombra un concepto** | los 8 cálculos de saldo lo dejan de contar — **no revientan, cambian el número** | los saldos bajan o suben sin motivo; Data Health podría encender `prestamos_saldo_anomalo` si algún saldo cae bajo −$100 |
| **`prestamos_movimientos` pasa de 1.000 filas** | el check de Data Health lee **sin paginar**: `db-max-rows` corta en silencio y el check opina sobre una parte | el check seguiría en verde. Hoy hay 443 — margen de 557 filas, o sea ~2 años al ritmo actual |
| **Una lectura de Supabase falla** en la planilla (permiso, timeout, esquema) | 🔴 desde el 3-sep **la planilla no sale** (500 con el mensaje), en vez de calcularse con «nadie está atado» | error visible en pantalla. Antes salía tranquila y **sin descontar ningún préstamo** |
| **Alguien toca «Eliminar Todo el Historial»** | `DELETE` real de Postgres sobre todos los movimientos de esa persona, **sin soft delete y sin registro en `activity_logs`** | 🔴 **no queda ningún rastro.** El saldo pasa a $0 y no hay forma de saber quién ni cuándo |
| **`empresa` deja de guardar el nombre y guarda la key** | la tarjeta de Inicio de David dice **0 personas con préstamo** | número silenciosamente mal en una pantalla que solo él mira |
| **Un insert deja `deleted` en NULL** | `prestamos-planilla-server.ts` y el POST usan `.eq("deleted", false)`: esas filas **desaparecen** del cálculo de la planilla y de la validación de saldo | la casilla Préstamo bajaría o desaparecería sin explicación |
| **Se crea una ficha nueva** (como el 2 y el 4 de septiembre) | nace **sin `empleado_codigo`** y no hay pantalla para ponérselo: la planilla nunca le propone la cuota | 🔴 **sí se nota**, y es lo único que lo salva: el aviso ámbar «N préstamos con saldo no están atados a nadie» arriba de la Planilla |
| **Switch** | 🔴 **nada.** Este módulo no toca Switch, ni por API ni por el panel web. Ningún cambio de formato de Switch puede romperlo | — |

## Lo que sobra o no cuadra

### Código muerto, medido

1. **`GET /api/prestamos/movimientos`** — **cero consumidores**. Los 8 `fetch` a esa URL en el
   módulo son POST, PUT o DELETE.
2. **Todo el chain de badges de préstamos**: `src/lib/hooks/useBadges.ts` (34 líneas) **no lo importa
   nadie**, y su `fetch` es la **única** llamada a `/api/notification-badges`. La consulta de
   préstamos de esa ruta cuenta `estado='pendiente_aprobacion'` — un valor imposible.
   Está muerto de las dos puntas.
3. **Las 3 pestañas de estado muertas** de `MovimientoTable` (Pendientes · Aprobados · Rechazados) y
   el **botón verde «Aprobar»**: con 443/443 en `aprobado`, `hasMixedEstados` es siempre `false`
   (la columna Estado nunca se pinta) y las pestañas siempre dicen `0 · 443 · 0`.
4. **`approveMov()`** (`useMovimientoForm.ts:73-81`) y la rama `estado === "aprobado"` del PUT, con
   su 403 *«Solo admin puede aprobar préstamos»*: **inalcanzables** desde la interfaz.
5. **El aviso «⚠ Este préstamo requiere aprobación por el monto (≥ $500)»** aparece en **dos**
   modales (`PrestamosClient.tsx:640` y `MovimientoModal.tsx:76`) y **es mentira**: la API aprueba
   todo desde el 27-ago.
6. **`estadoLabel()`** del Excel (`prestamos-excel.ts:46-51`) traduce dos valores que no existen.
7. **`scheduleAction` / `scheduleUndoMov`** se destructuran (`PrestamosClient.tsx:132`,
   `useMovimientoForm.ts:24`) y **nunca se llaman**: los dos `<UndoToast>` (lista y ficha)
   **no se muestran jamás**. El módulo no tiene «Deshacer» aunque el código lo importe.
8. **Columnas `aprobado_por` y `created_by`**: 0 de 443. `aprobado_por` sigue en el `allowed[]` del PUT.
9. **`DangerZone`** recibe la prop `role` y no la usa. **`AplicarQuincenaModal`** recibe `hoy?` que
   solo usan los tests. **`loading.tsx`** dibuja una tabla que la lista ya no tiene.

### Dos verdades para lo mismo

10. 🔴 **OCHO lugares calculan el saldo**, cada uno escrito aparte:
    1. `src/lib/prestamos-saldo.ts` — la oficial (lista + Boston)
    2. **`src/app/prestamos/[id]/page.tsx:82-86`** — **la ficha lo rehace inline** con arrays
       literales, y trae un `console.warn` (`:109`) que dice, textual: *«Saldo running ($X) no
       coincide con saldo backend ($Y)»*. Es la advertencia que `prestamos-saldo.ts` fue creado para
       evitar, escrita en el único archivo que no lo usa
    3. `api/prestamos/movimientos/route.ts:52-64` (POST, validación)
    4. `api/prestamos/movimientos/[id]/route.ts:35-56` (PUT, validación)
    5. `src/lib/exports/prestamos-excel.ts:37-44` (`calcSaldo`)
    6. `src/lib/integrity-checks.ts:70-95`
    7. la RPC `prestamos_aplicar_quincena`, en SQL
    8. `src/lib/asistencia/prestamos-planilla-server.ts:110-134` — la única que **importa** las
       listas de conceptos del módulo puro en vez de escribirlas
11. **CUATRO definiciones de la quincena**: `PrestamosClient.tsx:57-77` (`getQuincenaRange` +
    `hasDeduccionEnQuincena`, con `±3` días y **hora local del navegador**),
    `components/types.ts:37-55` (**copia carácter por carácter** de las dos anteriores),
    `lib/prestamos-quincena.ts` (UTC−5 fijo, ventana `[inicio, fin+3]`) y la RPC.
    Consecuencia medible: **el contador del botón «Aplicar quincena (N)» y el del diálogo se
    calculan con reglas distintas** y en los bordes del 15 y del 30 pueden no coincidir.
12. **CINCO caminos para registrar el mismo pago quincenal**: (A) «+ Nuevo préstamo» de la lista ·
    (B) «Pago Quincenal» de la ficha · (C) «+ Nuevo Movimiento» de la ficha · (D) panel del celular ·
    (E) «Aplicar quincena». **Tres de ellos (B, C, D) escriben la fecha de hoy sin preguntar**;
    solo C precarga la cuota; solo E capea al saldo.
13. **`PRESTAMOS_ROLES` escrito a mano en 6 archivos**, y dos veces inline en `movimientos/route.ts`.
14. **`PRESTAMO_CONCEPTOS` / `PAGO_CONCEPTOS` re-declarados en 6 archivos** además de la fuente.
15. **La lista de conceptos del `<select>`** está tecleada dos veces (`PrestamosClient.tsx:632-638`,
    `EditMovimientoModal.tsx:45-49`) en vez de derivarse de `MOV_TYPES`.
16. **`MOV_TYPES` tiene 6 tarjetas para 5 conceptos** — «Pago Quincenal» y «Pago Extra» son ambas
    `Pago`.

### Botones que no hacen lo que dicen

17. **«Archivar»** solo se puede tocar con el saldo **exactamente en 0**. Para archivar a alguien que
    se fue debiendo hay que abrir «Zona de acciones peligrosas» → «Forzar Archivado», que es
    **solo admin**. O sea que **`Contabilidad`, que es quien usa el módulo, no puede archivar a nadie
    con saldo.**
18. **«Eliminar Empleado»** está bloqueado si tiene un solo movimiento, y el único camino para
    desbloquearlo es «Eliminar Todo el Historial» (el hard delete). Efecto medido: **0 fichas
    eliminadas en toda la vida del módulo.**
19. El menú «···» de cada fila ofrece **«Eliminar»** (solo admin) que llama al mismo DELETE — pero
    desde la lista **no comprueba que la persona no tenga movimientos**: hace el soft delete y el
    `activo = false` de una.

### Datos sucios y huecos

20. 🔴 **`empleado_codigo` no se puede poner desde ninguna parte**, y el aviso de la planilla dice
    que sí (*«Se atan en Préstamos, eligiendo la persona de la ficha»*). Las **2 fichas activas sin
    atar** — MARTHA AZUCENA CHAVARRIA **$300** y YERITZA Y. SOLIS CASTRO **$100** — nacieron el 2 y
    el 4 de septiembre, **después** de la migración que hizo el amarre. **$400 de deuda viva que la
    planilla no puede descontar y que solo se arregla con otra migración.**
21. **Personas duplicadas**: `JOHANA VALLEJO` ×2 (21 y 57 movimientos), `LUZ LOPEZ` ×2 (**una con 0
    movimientos**, creada el 29-abr y nunca usada), `STEFANY MORALES` / `STEPHANY MORALES` (dos
    grafías, dos fichas), `RAMON MIRANDA` ×2 **con el mismo código 21**. Todas archivadas menos un
    Ramón.
22. **`notas` del empleado**: 29 de 32 llenas, **cero lectores**.
23. **`created_at` del empleado**: nunca se muestra ni se usa para ordenar.
24. **El desplegable ofrece 7 empresas y solo se usan 3.** Y hay 11 movimientos cuya nota dice
    «Fashion Shoes» — una empresa que **ninguna ficha tiene puesta**.
25. **El 80% de las notas de movimiento es eco del concepto**, pero **el 20% guarda datos que el
    sistema no tiene en ninguna otra columna** (de qué empresa salió la plata, con qué se pagó, qué
    mercancía se dañó, compromisos de fecha) — y a la vez es una **llave de negocio** que el dedup
    del POST consulta con un `ilike`. Un mismo campo haciendo tres cosas.
26. **Se corrige mucho y no se sabe qué**: 94 ediciones sobre ~200 movimientos tecleados, y el log
    siempre dice los mismos tres campos porque el modal manda los tres siempre.
27. **`asistencia_prestamo_aprobado` se usó una sola vez**, en una sentada de 9 minutos el
    27-ago-2026. La quincena `2026-09-1` no tiene ni una fila.
28. **La lista y la ficha no filtran `deleted` en los empleados** — dependen de que el DELETE también
    ponga `activo = false`. Con «Ver archivados» marcada, una ficha borrada **volvería a la lista**.
    Hoy no se nota: 0 borradas y 0 eliminaciones históricas.
29. **La nota de `prestamos-planilla.ts` dice que la RPC usa tolerancia «±3 días»** — desde el
    4-sep-2026 la RPC ya no la tiene al inicio. El comentario quedó viejo de un día.
30. **`docs/eficiencia/04-plata-y-administracion.md` mide 31 fichas y 431 movimientos** contra las
    32 y 443 de este documento: se escribió unas horas antes, y en el medio se crearon la ficha de
    YERITZA y sus movimientos. No es un desacuerdo, es la hora del reloj.
