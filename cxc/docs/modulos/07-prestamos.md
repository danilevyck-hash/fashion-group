# Préstamos

> Referencia del módulo, **medida contra producción el 5-sep-2026** (Management API,
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
>
> 🔴 **REESCRITO EL 5-SEP-2026.** Daniel rediseñó el módulo entero con mockups aprobados: **dos
> cuentas por persona**, **tope de un sueldo mensual** con aprobación suya, la **persona sale de
> Asistencia**, y se fueron la bandera `activo`, las pestañas de estado y el único hard delete del
> repo. El porqué de cada punto —con sus citas y sus mediciones— vive ahora en
> **[`docs/postmortems/prestamos.md`](../postmortems/prestamos.md)**, que este archivo ya no repite.
>
> ✅ **La migración `20260925120000_prestamos_dos_cuentas_y_tope.sql` YA ESTÁ APLICADA.**
> Verificado el 5-sep-2026 contra `supabase_migrations.schema_migrations` y contra
> `information_schema.columns`: las tres columnas nuevas —`prestamos_empleados.deduccion_dano`,
> `prestamos_movimientos.cuenta` y `prestamos_movimientos.origen_pago`— existen en producción, la
> RPC `prestamos_aplicar_quincena` viva ya trae las dos cuentas y el dedup por origen, y la ficha
> duplicada de RAMON MIRANDA quedó juntada. **Ya no hay nada pendiente de correr en este módulo.**
>
> ```sql
> select version, name from supabase_migrations.schema_migrations where version = '20260925120000';
> -- 20260925120000 | prestamos_dos_cuentas_y_tope
> ```
>
> El texto de abajo describe el módulo **como está hoy**, no como iba a quedar. Lo que cambió entre
> la versión escrita ayer de este archivo y lo medido hoy está al final, en § Lo que estaba mal.
>
> ⚠️ Lo que decía este bloque hasta hoy: *«está ESCRITA y NO APLICADA… las columnas no existen y el
> módulo no funciona»*. Era cierto cuando se escribió y dejó de serlo el mismo día. La frase que sí
> se queda es la otra: **aquí no hay tolerancia a DDL pendiente, y es deliberado** (§ Qué lo rompe).

---

# Préstamos (`/prestamos`, key `prestamos`)

## Qué es

Lleva **lo que cada empleado le debe a la empresa** y lo que va devolviendo quincena a quincena.
Son **DOS cuentas separadas por persona**, cada una con su propia cuota quincenal: el **Préstamo** en
efectivo y el **Daño de mercancía** (lo que se dañó o se perdió y se le descuenta). El total es la
suma de las dos.

```
Préstamo            $220.00
Daño de mercancía    $50.00
──────────────────────────
Debe                $270.00
Préstamo $30 · Daño $10 por quincena
```

Resuelve un problema chico y viejo: antes esto vivía en una hoja de la contadora, y la planilla
copiaba el descuento a mano de una pantalla a otra. Hoy el módulo lleva el saldo y la planilla de
Asistencia le pide la cuota (§ Con qué conecta).

**Tamaño real:** **31 fichas vivas** (+1 borrada), 443 movimientos (432 vivos), **$5.062,01 de saldo
vivo** en **14 personas**. Medido el 5-sep-2026 **después** de aplicar la migración; ese número es el
que la reescritura tenía prohibido mover, y no se movió. Hay candado con las 14 personas una por una
(`prestamos-dos-cuentas.test.ts`).

🔴 **Hoy las 14 deben TODO en la cuenta «Préstamo»: la cuenta «Daño de mercancía» suma $0,00 en las
14.** El corte no cambió ni un centavo de sitio. El único caso cruzado es **STEPHANY MORALES**
(ficha sin código, neto **$0**): sus cargos de daño ($286,50) se pagaron con un `Pago` de $254,50
registrado como préstamo, así que su cuenta Préstamo da **−$254,50** y su Daño **+$254,50**. **No se
reasignó nada** — se respeta lo que alguien registró. Por eso son **15** las personas con alguna
cuenta distinta de cero y **14** las que deben plata.

```sql
-- El saldo de hoy, con la MISMA derivación que usa la app (cuenta si está escrita, si no el concepto)
with mv as (
  select e.nombre,
    case when coalesce(m.cuenta,'') in ('prestamo','dano') then m.cuenta
         when m.concepto in ('Responsabilidad por daño','Pago de responsabilidad') then 'dano'
         else 'prestamo' end as cuenta,
    case when m.concepto in ('Préstamo','Responsabilidad por daño') then m.monto
         when m.concepto in ('Pago','Abono extra','Pago de responsabilidad') then -m.monto
         else 0 end as signo
  from prestamos_empleados e
  join prestamos_movimientos m on m.empleado_id = e.id
  where coalesce(e.deleted,false)=false and coalesce(m.deleted,false)=false and m.estado='aprobado')
select nombre,
  round(sum(case when cuenta='prestamo' then signo else 0 end),2) as saldo_prestamo,
  round(sum(case when cuenta='dano'     then signo else 0 end),2) as saldo_dano,
  round(sum(signo),2) as total
from mv group by 1 having round(sum(signo),2) <> 0 order by total desc;
```

| # | persona | empresa | Préstamo | Daño | **Debe** | cuota préstamo | cuota daño |
|---|---|---|---|---|---|---|---|
| 1 | ANGELA GARCIA | Vistana International | 1.798,05 | 0,00 | **1.798,05** | 50,00 | 0 |
| 2 | ANDRES GONZALEZ | Confecciones Boston | 900,00 | 0,00 | **900,00** | 50,00 | 0 |
| 3 | ANDREA PEREZ | Vistana International | 450,00 | 0,00 | **450,00** | 50,00 | 0 |
| 4 | MARIA V. BETHANCOURTH G. | Confecciones Boston | 417,28 | 0,00 | **417,28** | 25,00 | 0 |
| 5 | MARTHA ASUCENA CHAVARRIA Z. | Confecciones Boston | 300,00 | 0,00 | **300,00** | 50,00 | 0 |
| 6 | GABRIELA JARAMILLO | Confecciones Boston | 300,00 | 0,00 | **300,00** | 60,00 | 0 |
| 7 | YULICAR CORONA | Confecciones Boston | 266,68 | 0,00 | **266,68** | 25,00 | 0 |
| 8 | RAMON MIRANDA | Confecciones Boston | 220,00 | 0,00 | **220,00** | 30,00 | 0 |
| 9 | CRISTIAM BLANCO | Confecciones Boston | 125,00 | 0,00 | **125,00** | 25,00 | 0 |
| 10 | **BRICEIDA MONTERO** | Confecciones Boston | 100,00 | 0,00 | **100,00** | 50,00 | 0 |
| 11 | YERITZA YANETH SOLIS CASTRO | Confecciones Boston | 100,00 | 0,00 | **100,00** | 50,00 | 0 |
| 12 | LUIS PARAJON | Fashion Wear | 40,00 | 0,00 | **40,00** | 45,00 | 0 |
| 13 | LUZ BOSQUEZ | Confecciones Boston | 25,00 | 0,00 | **25,00** | 25,00 | 0 |
| 14 | ALEJANDRA CAMAÑO | Confecciones Boston | 20,00 | 0,00 | **20,00** | 10,00 | 0 |
| — | STEPHANY MORALES | Confecciones Boston | −254,50 | +254,50 | **0,00** | — | — |
| | **TOTAL** | | **5.062,01** | **0,00** | **5.062,01** | | |

⚠️ **Los $100 de BRICEIDA MONTERO son un PRÉSTAMO, no un daño de mercancía.** Sus movimientos son
5 préstamos ($1.300 entre abril y junio de 2025) contra $1.200 de pagos: `1.300 − 1.200 = 100`. La
versión anterior de este archivo la separaba del resto («$4.962,01 en 13 más $100 de BRICEIDA
MONTERO»), lo que se leía como si su deuda fuera de otra clase. No lo es: es la décima de catorce
filas iguales.

⚠️ **Nadie tiene cuota de daño de mercancía todavía**: `deduccion_dano` está en **0 en las 31 fichas**.
La segunda cuota existe y funciona, pero hasta que contabilidad le ponga un número a alguien, la
planilla sigue proponiendo exactamente lo mismo que antes. Nació el **26-mar-2026**
(commit `feat: módulo préstamos a colaboradores`), o sea que es de los módulos VIEJOS, anterior
a la reescritura de julio.

## Quién entra

| Rol | Qué puede | De dónde sale |
|---|---|---|
| `admin` (daniel, alberto) | todo, más la «Zona de acciones peligrosas» (eliminar ficha, borrar historial) | `PRESTAMOS_ROLES` + `PRESTAMOS_ADMIN_ROLES` |
| 🔴 **`daniel`, y solo él** | **aprobar o rechazar** un préstamo que pasa el tope. Es una PERSONA, no un rol: hay dos admins | `puedeAprobarPrestamo()` — rol admin **y** `userName === "daniel"` |
| `contabilidad` (usuario **`Contabilidad`**) | todo menos la zona de peligro y aprobar. **Es quien lo usa de verdad** | `PRESTAMOS_ROLES` |
| `gerente_boston` (david) | **solo lee**, y desde `/boston` › pestaña Préstamos. Nunca entra a `/prestamos` | `rolesModuloBoston()` sobre `/api/boston/prestamos`, único verbo GET |
| todos los demás | **403** en las 6 rutas | — |

- ✅ **`PRESTAMOS_ROLES` vive en UN solo archivo desde el 5-sep-2026**: `src/lib/prestamos-roles.ts`,
  junto con `PRESTAMOS_ADMIN_ROLES` y `puedeAprobarPrestamo()`. Estaba tecleado a mano en **seis**
  archivos, dos de ellos con el literal repetido adentro, y tres rutas ni siquiera pasaban por
  `requireRole` (hacían el chequeo a mano con `getSession`). Hoy las siete rutas pasan por
  `requireRole` con la misma lista, y hay barrido que pone el build rojo si el literal reaparece
  (`prestamos-un-solo-lugar.test.ts`).
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
`src/app/prestamos/page.tsx` (SSR con auth propio) + `PrestamosClient.tsx`. La carga inicial y la
API usan **la misma lectura** (`src/lib/prestamos-lista-server.ts`): antes eran dos consultas
escritas aparte, o sea dos formas de contestar «quién debe».

🔴 **Muestra SOLO a quien debe**, agrupado por empresa, con un encabezado por grupo que dice cuántas
personas y cuánto suman. **Quien llega a cero sale solo.**

**Qué se ve, de arriba abajo:**
- Dos chips: **«SALDO PENDIENTE TOTAL»** (con animación de conteo) y **«QUINCENA · 1 al 15 de
  septiembre 2026»** con `N / M`. Verde si están todas, ámbar si no.
- Botón verde **«Aplicar quincena (N)»** — solo si N > 0.
- 🔴 Si hay algo esperando aprobación, una barra gris: **«Esperando aprobación $200.00 · no suma al
  saldo hasta que Daniel lo apruebe»**, que lleva a `/prestamos/aprobaciones`.
- Botón negro **«+ Nuevo préstamo»**, un menú **«···»** (*Descargar historial* · *Préstamos por
  aprobar*), el campo **«Buscar empleado...»** y un desplegable de empresa **derivado de las empresas
  que de verdad aparecen** (antes ofrecía 7 y solo se usaban 3).
- Una fila por persona: nombre · las dos cuentas o la cuota · chips (**Ya no trabaja · no se
  descuenta** / **Esperando $X** / **✓ Deducida** / **⚠ Pendiente**) · barra de progreso (≥1024 px) ·
  **saldo** grande a la derecha · menú «···».
- 🔴 **El buscador también encuentra a quien NO debe**: las **37 personas activas** de Asistencia
  salen bajo «No deben nada» y al tocarlas se abre su ficha. Es la única forma de llegar a la ficha de
  quien ya terminó de pagar.
- Sin resultados: `EmptyState` — «Nadie debe nada ahora mismo» o «No se encontró a nadie con ese
  nombre».

**Qué se puede hacer y con cuántos pasos:**

| tarea | pasos |
|---|---|
| **Registrar un pago** | «+ Nuevo préstamo» → buscar y tocar a la persona → elegir **Pago** → monto → Registrar. La cuenta y el origen vienen puestos |
| Aplicar la quincena a todos | «Aplicar quincena (N)» → confirmar la fecha → «Aplicar a las N» = **2 pasos** |
| Abrir la ficha | clic en la fila (o en el resultado del buscador). **Siempre navega** a `/prestamos/[id]`: el panel deslizante del celular se retiró (era un quinto camino para el mismo pago) |
| Bajar el Excel | «···» → «Descargar historial» → **«¿Solo los que deben o todos?»** |

⚠️ **Ya no existe «Nuevo empleado»**: una ficha se crea eligiendo a la persona de Asistencia, y nace
con su `empleado_codigo`.

**Campos del modal «¿A quién?»** (`ElegirPersonaModal.tsx`): un buscador y las 37 personas activas
agrupadas por empresa, cada una con «Debe $X» o «No debe nada».

**Campos del modal «Nuevo movimiento»** (`NuevoMovimientoModal.tsx`): tres tarjetas de concepto
(➕ Préstamo · ⚠️ Daño de mercancía · 💳 Pago) · `Baja de` **solo si debe las dos cuentas** ·
`Fecha *` (tope: hoy) · `Monto ($) *` · `De dónde salió` **solo en un Pago** · `Notas (opcional)`.
Si el préstamo pasa el tope, aparece el aviso con los números y el botón pasa a decir **«Mandar
aprobación»**.

### 2. Ficha del colaborador — `/prestamos/[id]`
`src/app/prestamos/[id]/page.tsx` + 8 componentes y 2 hooks en `components/`.

- **Encabezado** (`EmpleadoHeader.tsx`): nombre grande, empresa, chip **«Ya no trabaja · no se
  descuenta»** si Asistencia dice que se fue, chip **«Sin persona atada»** si le falta el código; y
  dos botones: `Editar` · `← Colaboradores`. **«Archivar» y «Reactivar» se fueron con la bandera
  `activo`.**
- **Tarjeta de saldo** (`SummaryCards.tsx`): **las dos cuentas una debajo de otra con su línea de
  total** (solo si debe las dos), «Debe» en 3xl, `Préstamo $30 · Daño $10 por quincena`,
  `Prestado $X · Pagado $Y`, y en gris **«Esperando aprobación $X»** cuando hay algo pendiente. Chip
  de quincena y barra de progreso.
- **Dos botones**: `Pago Quincenal · $X` (verde; suma las dos cuotas y baja la cuenta más vieja) y
  `+ Nuevo Movimiento` (negro).
- **Estado de cuenta** (`MovimientoTable.tsx`): **sin pestañas** — abajo de 1024 px son **tarjetas**,
  arriba una **tabla** de `Fecha · Concepto · [Cuenta] · Notas · Monto · Saldo · Acciones`. La columna
  **Cuenta solo aparece si la persona tiene movimientos de daño**. 🔴 Lo que espera aprobación va
  **resaltado en ámbar en la misma lista**, con **«Esperando a Daniel · hace N días»** y la columna
  Saldo diciendo «No suma». El ✎ sale si el movimiento espera o tiene menos de 24 h; el 🗑 siempre.
- **«Zona de acciones peligrosas»** (`DangerZone.tsx`, colapsada, **solo admin**): *Eliminar ficha*
  (apagado si tiene movimientos; pide escribir el nombre exacto) · *Eliminar todo el historial* (pide
  escribir **CONFIRMAR**; **hoy es soft delete y queda registrado**). *Forzar Archivado* se fue.

**Modal «Editar ficha»** (`EditEmpleadoModal.tsx`): `Persona (de Asistencia)` —un desplegable, nunca
texto libre— · `Cuota de préstamo` · `Cuota de daño`. **El nombre y la empresa ya no se editan**:
salen de Asistencia.

**Modal «Editar movimiento»** (`EditMovimientoModal.tsx`): el concepto se **muestra** con la nota «no
se puede cambiar» (antes era un `<select>` apagado, que invita a intentarlo) · `Fecha *` (tope: hoy,
que el PUT ahora también valida) · `Monto ($) *` · `De dónde salió` si es un Pago · `Notas (opcional)`.

### 3. Préstamos por aprobar — `/prestamos/aprobaciones`
Los préstamos que pasaron el tope, con su monto, desde cuándo esperan y la nota. 🔴 **Todo el módulo
los VE**; solo Daniel puede tocar **Aprobar** / **Rechazar** — a los demás les salen apagados con la
línea «Esto lo aprueba Daniel. Aquí se ve, pero no se puede tocar.» Arriba, el total y el recordatorio
de que **no suma al saldo** y de que **caduca a los 7 días**.

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
- **`GET /api/prestamos/movimientos`** (`?empleado_id=` opcional): existe y **ningún archivo la
  llama**. Los `fetch` a esa URL son POST o DELETE.
- **Deep link `/prestamos?search=Juan`**: lo genera el Spotlight del buscador global
  (`SearchBar.tsx`), pero `PrestamosClient` guarda `search` en un `useState("")` y **nunca lee
  `searchParams`**. El enlace abre la lista sin filtrar.
- **`loading.tsx`** dibuja un esqueleto con `SkeletonTable` — pero la lista no es una tabla.

## Los datos

Ver `CLAUDE.md § Trampas transversales`: **en préstamos `deleted` es NULLABLE**, por eso el patrón
correcto es `.or("deleted.is.null,deleted.eq.false")` y no `.eq("deleted", false)`.
⚠️ **Medido hoy: 0 nulos en las dos tablas** — las 32 fichas y los 443 movimientos tienen `deleted`
en `true` o `false`. O sea que el `.eq(...)` que usan `prestamos-planilla-server.ts` y el POST del
módulo **hoy no pierde ninguna fila**, pero el día que un insert deje el campo en NULL sí la
perdería, y sin ruido.

### `prestamos_empleados` — **31 filas vivas** (+1 borrada) · grano: **una ficha de préstamo** (llave `id` uuid)
Empresas realmente usadas: **Confecciones Boston · Vistana International · Fashion Wear** (3 valores).
✅ **La migración ya corrió**: la segunda ficha de RAMON MIRANDA está `deleted` y sus movimientos
viven todos en la ficha buena — **36 movimientos, saldo $220,00**, exactamente el mismo número de
antes.

```sql
select count(*) filter (where coalesce(deleted,false)=false) vivas,
       count(*) filter (where deleted = true)                borradas,
       count(*) filter (where coalesce(deleted,false)=false
                          and empleado_codigo is not null
                          and btrim(empleado_codigo) <> '')  con_codigo,
       count(*) filter (where coalesce(deleted,false)=false and deduccion_dano > 0) con_cuota_dano
from prestamos_empleados;
-- vivas 31 | borradas 1 | con_codigo 23 | con_cuota_dano 0
```

| columna | para qué | quién la escribe | quién la lee | llenas |
|---|---|---|---|---|
| `id` uuid PK | identidad | DB (`gen_random_uuid()`) | todo, incluido el enlace del buscador | 32 |
| `nombre` text NOT NULL | **la identidad real**, texto libre tecleado | POST y PUT `/empleados` | lista, ficha, Boston, buscador global, Excel, planilla | 32 |
| `empresa` text | agrupar y filtrar. Guarda el **NOMBRE** («Confecciones Boston»), no la key | POST y PUT | filtro de la lista, `/api/boston/inicio` (`.eq("empresa","Confecciones Boston")`), pestaña de Boston, Excel | 32 · **3 valores** |
| `deduccion_quincenal` numeric NOT NULL d.`0` | **la cuota**: lo que se le descuenta cada quincena | POST y PUT | RPC del lote, los 3 botones de pago quincenal, planilla de Asistencia, Excel | 32 · **todas ≠ 0** |
| `deduccion_dano` numeric NOT NULL d.`0` | 🔴 **la cuota de la SEGUNDA cuenta** (daño de mercancía). La planilla propone la SUMA de las dos en una casilla | PUT `/empleados/[id]` | la RPC del lote, la ficha, la planilla, el Excel | ✅ **existe en producción** · **0 de 31 con valor**: nadie tiene cuota de daño todavía |
| `notas` text | — | PUT | 🔴 **NADIE** | 29 |
| `activo` bool d.`true` | 🩸 **RETIRADA el 5-sep-2026: sin lectores ni escritores.** Nunca significó «trabaja aquí» sino «tiene algo abierto» — a ESMER CRUZ le archivaron la ficha al terminar de pagar sus $600 y **sigue trabajando**. La columna **NO se borra** (patrón `mayor_lineas`): queda con su `COMMENT` y con un test que pone el build rojo si una migración la dropea **o si alguien vuelve a filtrar por ella** | 🔴 **NADIE** | 🔴 **NADIE** | 31 |
| `created_at` timestamptz d.`now()` | — | DB | 🔴 **NADIE** (no se muestra ni se ordena por ella) | 32 |
| `deleted` bool d.`false` | soft delete | **solo** `DELETE /empleados/[id]` (admin) | 🔴 **solo `prestamos-planilla-server.ts`**. Ni la lista, ni la ficha, ni el Excel, ni el buscador, ni las 2 rutas de Boston lo filtran | 32 en `false` |
| `empleado_codigo` text | 🔴 **el amarre con la planilla** — el código del reloj (`asistencia_personas.empleado_codigo`). De él salen ahora el NOMBRE, la EMPRESA, si TRABAJA y el SALARIO (el tope) | ✅ **el POST y el PUT de `/empleados`** desde el 5-sep-2026, eligiendo a la persona de una lista; más las migraciones `20260902120000` y `20260925120000` | `prestamos-planilla-server.ts`, `prestamos-lista-server.ts`, la RPC del lote, Asistencia (aviso de salida con deuda) | ✅ **23 de 31** · 🔴 **las 14 que deben plata lo tienen, las 14** · las 8 sin código tienen saldo **$0** |

🔴 **`notas` del empleado: nadie la lee.** Se escribe en dos formularios y solo se recupera dentro
del propio formulario de edición (`PrestamosClient.tsx:212`, `useEmpleadoActions.ts:27`). No aparece
en la lista, ni en la ficha, ni en el Excel, ni en Boston, ni en la planilla. 29 filas la tienen, y
su contenido es un eco del último movimiento: «PRESTAMO», «DESCUENTO DE MERCANCIA », «DEDUCCION
QUINCENAL», «PRESTAMO paga martes 21».

✅ **`empleado_codigo` ya se puede editar desde la pantalla** (5-sep-2026), eligiendo a la persona de
un desplegable con las 37 activas de Asistencia. 🩸 Hasta ese día **no se podía desde ningún lado** y
el aviso ámbar de la planilla decía, textual, que sí: *«Se atan en Préstamos, eligiendo la persona de
la ficha»*. Las dos fichas creadas el 2 y el 4 de septiembre nacieron sin código — **$400 de deuda
viva** que la planilla no podía descontar.

🔴 **Las 8 fichas sin código son las 8 que no deben nada** — y ninguna cruza con Asistencia porque
son gente que ya no está: `JOHANA VALLEJO` ×2 · `LUZ LOPEZ` ×2 (una sin movimientos) ·
`STEFANY MORALES` · `STEPHANY MORALES` · `YANKATERY` · `YEISON LLORENTE`, las 8 de Confecciones
Boston, las 8 con saldo `0.00` o sin movimientos. **El $400 sin atar que había ayer se cerró**: las
fichas del 2 y el 4 de septiembre (MARTHA $300 y YERITZA $100) tienen hoy sus códigos `43` y `51`.

```sql
select e.nombre, e.empleado_codigo,
  (select round(sum(case when m.concepto in ('Préstamo','Responsabilidad por daño') then m.monto
                         when m.concepto in ('Pago','Abono extra','Pago de responsabilidad') then -m.monto
                         else 0 end),2)
     from prestamos_movimientos m
    where m.empleado_id = e.id and coalesce(m.deleted,false)=false and m.estado='aprobado') as saldo
from prestamos_empleados e
where coalesce(e.deleted,false)=false and (e.empleado_codigo is null or btrim(e.empleado_codigo)='');
-- 8 filas, todas con saldo 0.00 o NULL
```

✅ **Los 23 códigos cruzan los 23 con `asistencia_personas`. Cero huérfanos.** Y las 14 personas con
deuda tienen las cuatro cosas que el módulo necesita de allá: nombre igual, empresa, `activo = true`
y **salario cargado** (ninguna cae al piso de $500 del tope).

⚠️ El índice `prestamos_empleados_empleado_codigo_idx` **no es único**, y `RAMON MIRANDA` era el único
caso (código `21` en dos fichas). La migración ya las juntó, y el POST rechaza una segunda ficha para
un código que ya tiene una. La planilla **sigue agrupando por código a propósito** (`sugerirPrestamos`):
el invariante no depende de que no haya duplicados.

### `prestamos_movimientos` — 443 filas · grano: **un movimiento de plata** (llave `id` uuid)
432 vivos, **11 borrados**, 0 con `deleted` NULL. Fechas del **2-ene-2025 al 4-sep-2026**.
Carga inicial: **243 filas creadas el 26 y 27 de marzo de 2026** (165 + 78); después, ~20-30/mes.

| columna | para qué | quién la escribe | quién la lee | llenas |
|---|---|---|---|---|
| `id` uuid PK | identidad | DB | todo | 443 |
| `empleado_id` uuid | a quién pertenece (FK lógica, sin constraint declarada) | POST | todo | 443 |
| `fecha` date NOT NULL | la fecha del hecho | POST y PUT | saldo corriente, dedup, chips de quincena, «ya descontado» de la planilla | 443 |
| `concepto` text NOT NULL | **el signo** de la plata | POST (**inmutable en el PUT**) | todo | 443 · **5 valores**. 🔴 Desde el 5-sep-2026 el formulario ofrece **TRES** (`Préstamo`, `Responsabilidad por daño` mostrado como «Daño de mercancía», `Pago`); `Abono extra` y `Pago de responsabilidad` **no se pueden crear** pero **se siguen contando igual**. Ningún valor se renombró: renombrarlo no revienta nada, **deja de contarse en silencio** |
| `cuenta` text | 🔴 **a cuál de las dos cuentas pertenece**: `prestamo` \| `dano` (CHECK). Un `Pago` la trae SIEMPRE escrita — baja una sola cuenta y hay que saber cuál | POST y la RPC del lote | `cuentaDeMovimiento()` | ✅ **existe** · **0 de 443 escritas**, a propósito: se DERIVA del concepto al leer, y así los números de ayer no se mueven. Un backfill sería una segunda definición de la misma regla. La primera fila con `cuenta` escrita nacerá con el próximo movimiento |
| `origen_pago` text | **de dónde salió la plata de un Pago**: `Quincena` \| `Décimo` \| `Vacaciones` \| `Liquidación` \| `Efectivo` (CHECK). 🔴 Es además **la llave del freno de duplicados** | POST, PUT y la RPC del lote | el dedup, la ficha, el Excel | ✅ **existe** · **0 de 443 escritas**. NULL se lee como `Quincena` (lo conservador: en la duda se omite), así que el freno **ya está protegiendo** las 443 viejas sin backfill |
| `monto` numeric NOT NULL | la plata | POST y PUT | todo | 443 |
| `notas` text | ver abajo. 🔴 **Ya NO es una llave**: es solo texto | POST y PUT, **opcional** desde el 5-sep-2026 | tabla de la ficha, Excel | 443 de 443 hasta hoy; de aquí en adelante puede quedar vacía |
| `estado` text NOT NULL d.`'aprobado'` | qué cuenta para el saldo | POST (`aprobado`, o **`pendiente_aprobacion` cuando el préstamo pasa el tope**) y `/api/prestamos/pendientes` (solo Daniel) | `calcularSaldoPrestamo` y `pendienteDeAprobacion` | **443 = `aprobado`** · 🔴 **0 esperando aprobación hoy** (medido 5-sep-2026) |
| `aprobado_por` uuid | — | 🔴 **NADIE** (sigue en el `allowed[]` del PUT, nunca se manda) | 🔴 **NADIE** | **0** |
| `created_by` uuid | — | 🔴 **NADIE** | 🔴 **NADIE** | **0** |
| `created_at` timestamptz d.`now()` | desempate de orden cuando dos comparten fecha | DB | orden de la tabla, del Excel y del saldo corriente; ventana de 24 h para poder editar | 443 |
| `deleted` bool d.`false` | soft delete | `DELETE /movimientos/[id]` | todos, con `.or(...)` o `.eq(...)` según el archivo | 11 en `true` |

**`estado`: dos valores, y el segundo se VE.** El POST escribe `pendiente_aprobacion` **solo** cuando
un préstamo deja a la persona debiendo más de un sueldo mensual (§ El tope). 🩸 Ese estado ya existió
hasta el 27-ago-2026 y se retiró porque **escondía plata** —los $700 de LUIS ADRIAN ARROYO, 22 días
con el saldo en $0—. Volvió con la condición que faltaba: **lo que espera no suma al saldo pero se ve
en tres superficies y caduca a los 7 días**. `rechazado` no lo escribe nadie: rechazar es un soft
delete.

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

🩸 **La nota FUE una llave, y el candado estaba apagado.** El dedup del POST bloqueaba la segunda
deducción de la quincena **solo si `notas` empezaba con «Deducción quincenal»**, con un `ilike` — y
`ilike` **no ignora los acentos**. Medido el 5-sep-2026, filas vivas que el freno dejaba pasar:
`DEDUCCION QUINCENAL ` ×8 · `DEDUCCION QUINCENAL` ×4 · `DEDUCCION DE QUINCENA` ×3 ·
`DESCUENTO QUINCENAL ` · `Pago quincenal` · `Descontar 25 por quincena ` = **18**.
Hoy el freno mira **concepto + `origen_pago` + fecha, por cuenta**, y la nota es solo texto opcional.

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
- **Empleados**: `deleted = true` desde `DELETE /empleados/[id]` (solo admin). Con log. **0 usos
  históricos.** Ya no toca `activo`: la bandera no la lee nadie.
- ✅ **«Eliminar todo el historial»** (`DELETE /api/prestamos/movimientos` con `{empleado_id}`) también
  es soft delete, **con `logActivity`** (`prestamo_historial_delete`, con cuántos movimientos).
  🩸 Hasta el 5-sep-2026 hacía un **`.delete()` real de Postgres**: el **único hard delete del repo**,
  en la tabla de plata, **sin auditoría**. Si alguien lo tocaba, el saldo pasaba a $0 y no quedaba
  forma de saber quién ni cuándo.
- **Rechazar un préstamo pendiente** también es soft delete, con log (`prestamo_rechazado`), igual que
  el que caduca solo a los 7 días (`prestamo_caducado`, escrito por el cron).

## De dónde vienen los datos

🔴 **De Switch, ninguno.** Este módulo no toca Switch Soft y no importa ningún archivo. Verificado
contra `docs/switch-flujo.md` y `docs/switch-referencia.md`: préstamos no aparece en ninguno de los
dos, y no hay endpoint del API ni reporte del panel web que alimente estas tablas.

🔴 **De Asistencia, la PERSONA** (5-sep-2026). De `asistencia_personas` salen las cuatro cosas que la
ficha de préstamo no puede saber sola: el **nombre** (Daniel: *«deberías de usar el nombre de
asistencia para que todo tenga coherencia»*), si **trabaja** (reemplaza a la bandera `activo`), el
**salario mensual** (que es el tope) y la **lista de las 37 activas** para buscar y para prestar.

⚠️ Y **tiene un cron desde el 5-sep-2026**: `/api/cron/prestamos-caducan` (13:15 UTC), que borra los
préstamos que llevan 7 días esperando aprobación. Solo DB, no toca Switch.

✅ **Ya corrió, y correctamente en vacío.** Medido el 5-sep-2026:

```sql
select cron_name, last_success_at from cron_heartbeats where cron_name = 'prestamos-caducan';
-- prestamos-caducan | 2026-09-05 13:15:26.832+00
```

Está en `vercel.json` (`"schedule": "15 13 * * *"`), registró su latido a las 13:15:26 UTC de hoy y
**no mandó ningún Telegram porque no había nada que caducar** — que es exactamente la conducta
esperada: una corrida vacía es una corrida exitosa. Al 5-sep-2026 hay **0 movimientos en
`pendiente_aprobacion`**, así que el camino completo del tope (guardar pendiente → avisar → aprobar
o caducar) **todavía no se ha ejercitado con un caso real en producción**.

**El resto del dato lo teclea una persona** — `Contabilidad`, desde `/prestamos`. Es una de las pocas
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

> El **porqué** de cada una, con las citas de Daniel y las mediciones, está en
> [`docs/postmortems/prestamos.md`](../postmortems/prestamos.md). Aquí está la regla y su candado.

**Las que tocan plata:**

1. 🔴 **La cuenta del saldo se dice UNA vez** — `src/lib/prestamos-saldo.ts`
   (`calcularSaldoPrestamo`). **SUMAN** `Préstamo` + `Responsabilidad por daño`; **RESTAN** `Pago` +
   `Abono extra` + `Pago de responsabilidad`. Un concepto que no esté en ninguna de las dos listas
   **no se cuenta** — no se asume que suma. 🩸 Había **OCHO** lugares calculando esto, y el único que
   no usaba la función era la ficha, con un `console.warn` que decía *«Saldo running ($X) no coincide
   con saldo backend ($Y)»*. Hoy pasan por ahí todos, incluida la RPC (en SQL, con la misma
   derivación, y con candado que compara las dos).
2. 🔴 **DOS CUENTAS, y las dos SUMAN el total.** `cuentaDeMovimiento()` decide a cuál va cada
   movimiento: la columna `cuenta` manda cuando está escrita; sin ella se deriva del concepto
   (`Responsabilidad por daño` y `Pago de responsabilidad` → daño; el resto → préstamo), que es lo
   que reproduce exactamente los números de antes. Candado con **las 14 personas de producción**,
   una por una (`prestamos-dos-cuentas.test.ts`).
3. 🔴 **Un Pago baja UNA cuenta.** Con las dos debiendo, «Baja de» viene puesto en la **más vieja** y
   se puede cambiar; con una sola no se pregunta. Sin fechas el desempate es **estable** (préstamo).
4. 🔴 **La pantalla ofrece TRES conceptos; la base guarda los CINCO.** «Daño de mercancía» es una
   ETIQUETA de `Responsabilidad por daño` (`etiquetaConcepto`). Renombrar el valor guardado no
   revienta ningún cálculo: **lo deja de contar en silencio**.
5. 🔴 **EL TOPE ES UN SUELDO MENSUAL** sobre la deuda **TOTAL** (préstamo + daño), recalculado
   siempre con el sueldo del momento. **Sin salario cargado, $500** (`TOPE_SIN_SALARIO`). Solo frena
   el **préstamo**: **el daño se registra SIEMPRE**. `src/lib/prestamos-tope.ts`, módulo puro.
6. 🔴 **Lo que espera aprobación NO suma al saldo, pero SE VE** — en la lista, en la ficha
   (resaltado, con «Esperando a Daniel · hace N días») y en `/prestamos/aprobaciones`. Es la lección
   de los **$700 de LUIS ADRIAN ARROYO**, 22 días escondidos con el saldo en $0.
7. 🔴 **Solo Daniel aprueba** — `puedeAprobarPrestamo()`: rol admin **y** `userName === "daniel"`.
   Hay **dos** admins. Contabilidad y David lo ven, con los botones apagados y una línea que lo dice.
   Aprobar **entra al descuento de la quincena en curso** aunque ya haya empezado.
8. 🔴 **Un pendiente caduca a los 7 días** (`pendienteCaducado`, por DÍA de Panamá), lo borra el cron
   `prestamos-caducan` (13:15 UTC) **y lo dice** por Telegram privado con nombre y monto. Un
   pendiente que espera para siempre es plata escondida.
9. **Un pago no puede exceder el saldo de SU cuenta** — validado en el POST y en el PUT. El sobrante
   de una cuenta no cubre la otra.
10. **La fecha de un movimiento no puede ser futura** — POST **y PUT** (el PUT no la validaba), con
    **Panamá = UTC−5 fijo**.
11. **El concepto es inmutable después de creado** — 400 en el PUT, y en pantalla se muestra en vez
    de ofrecerse apagado.
12. **El concepto tiene que estar entre los OFRECIDOS** — `CONCEPTOS_OFRECIDOS`; el POST valida
    (400 «Concepto inválido»). Un concepto retirado ya no se puede crear.
13. 🔴 **Aplicar la quincena dos veces no cobra dos veces** — dedup dentro de la RPC
    `prestamos_aplicar_quincena`, espejado en `resumenAplicarQuincena` para **decirlo antes de
    aplicar**. Ante la ambigüedad se **omite** y se dice, nunca se cobra dos.
14. 🔑 **La ventana del dedup es ASIMÉTRICA: `[inicio, fin + 3 días]`** — sin tolerancia al inicio (el
    pago del 15 no puede bloquear la quincena 16–fin); con tolerancia al final, porque los botones
    individuales escriben la fecha de hoy.
15. 🔴 **EL FRENO DE DUPLICADOS MIRA CONCEPTO + ORIGEN + FECHA, NUNCA UN TEXTO.** 🩸 Leía
    `notas ilike 'Deducción quincenal%'` y **18 filas vivas lo burlaban** (`ilike` no ignora acentos).
    `origen_pago` en NULL se lee como `Quincena`. Los pagos de otro origen no se frenan: son plata
    distinta a propósito.
16. **La última cuota se capea al saldo, POR CUENTA** — `least(cuota, saldo)` en la RPC y
    `Math.min` en el resumen, cada cuenta contra la suya.
17. 🔴 **La fecha de pago la elige contabilidad, no el reloj** — la quincena del dedup se deriva de la
    fecha **elegida**, no de `new Date()`. Candados: `prestamos-aplicar-quincena-fecha.test.ts` (24
    casos) y `prestamos-aplicar-quincena-pantalla.test.tsx` (6). 17 mutaciones, 17 cazadas.
18. **Panamá es UTC−5 fijo y los tests usan fechas fijas**, nunca `new Date()`.
19. **El embed de PostgREST NO filtra `deleted` solo** — por eso existe `prestamos-helpers.ts`.
20. 🔴 **`deleted` es NULLABLE en préstamos**: toda lectura usa `.or("deleted.is.null,deleted.eq.false")`.
    Un `.eq("deleted", false)` **pierde filas**, y hay barrido que lo prohíbe en todo el módulo.
21. 🔴 **La bandera `activo` no la lee nadie** — y la columna **no se borra**. Test que pone el build
    rojo si una migración la dropea o si alguien vuelve a filtrar por ella.
22. 🔴 **Ninguna ruta del módulo hace un `.delete()` real de Postgres.** Barrido sobre
    `src/app/api/prestamos/**`.

**Las del amarre con la planilla** (postmortem: `docs/postmortems/asistencia-planilla.md`):

23. 🔴 **Nada se ata por parecido. Ni aquí ni nunca.** Candado
    `src/__tests__/lib/prestamos-amarre-migracion.test.ts` — lee el SQL **sin una sola línea de
    comentario** (el archivo nombra lo que prohíbe, así que un barrido sobre el texto entero se
    engañaría solo) y prohíbe `LIKE`/`ILIKE`, `similarity`, `unaccent`, `levenshtein`, `soundex`,
    `metaphone`, `word_similarity`, `position`, `strpos`, `substring`, `regexp_*`, `translate` y `~*`,
    sobre **las DOS migraciones del amarre**. **La única normalización permitida es `upper(btrim(...))`**.
    El caso que lo prueba: `LAURA CASIANI` no cruza con `Laura Lismari Casiano Vega`, y
    `MARTHA AZUCENA` no cruza con `MARTHA ASUCENA` — se atan a mano, con guard.
24. **La empresa también tiene que coincidir** (lista cerrada nombre→key: una empresa desconocida no
    ata), y **solo si hay un único candidato** en la planilla.
25. **Los amarres a mano son una lista explícita CON guard**: el UPDATE exige que el código tenga el
    nombre esperado, o la fila no se escribe. No es un comentario.
26. 🔴 **La PERSONA sale de Asistencia**: nombre, empresa, si trabaja y salario. Una ficha nueva nace
    con su código y `empleado_codigo` **se puede editar desde la pantalla** (antes no, y el aviso de
    la planilla decía que sí).
27. 🔴 **En `prestamos-planilla.ts` NO se vuelve a calcular el saldo.** Llega ya calculado por la
    misma cuenta del módulo. Lo único que hace ese archivo es **elegir qué número va en la casilla**.
28. 🔴 **La casilla propone la SUMA de las dos cuotas** (Daniel: *«juntos»*), **cada una capeada a SU
    saldo antes de sumar**.
29. 🔴 **El hecho consumado le gana a la estimación** — si el módulo ya registró un `Pago` dentro de
    la quincena, la casilla dice **exactamente eso**; si no, dice la cuota. El caso que lo obliga:
    KEVIN LUBO, saldo $50 y cuota $50, habría dicho **$0 el mismo mes en que se le descontaron $50**.
30. ⚠️ **«Abono extra» NO es un descuento de planilla** — es plata del bolsillo; descontarla otra vez
    sería cobrarle dos veces. Sí baja el saldo.
31. 🔑 **Se agrupa por CÓDIGO, no por ficha** — la planilla tiene UNA casilla por persona.
32. 🔴 **El descuento se aprueba, no se aplica solo** — la contadora: *«El préstamo si debe ser por
    aprobarlo»*. Y **esta aprobación no esconde plata**: lo no aprobado se ve, con nombre y monto.
33. **Retirar la aprobación no borra un número que escribió una persona.**
34. 🔑 **La ventana de «ya descontado» de la planilla es EXACTA, sin los ±3 días de la RPC** — los
    pagos caen justo en el borde (15 y 30) y con tolerancia el mismo descuento se contaría dos veces.
35. 🔴 **La tolerancia a DDL pendiente está retirada** — `prestamos-planilla-server.ts` **lanza**.
    Degradar leería un permiso o un timeout como «nadie está atado» y la planilla dejaría de
    descontar en silencio.
36. **La aprobación del préstamo la da quien arma la planilla, no quien aprueba horas extra** —
    `asistenciaRoles()` y NO `aprobacionesRoles()`.

**De pantalla (todas con candado estático):**

37. **Todo control táctil llega a 44 px y ninguna letra baja de 12 px** —
    `src/__tests__/iphone-targets-prestamos.test.ts`, sobre los archivos del módulo.
38. **Los chips bajan a la línea 2 en celular y iPad**, con su texto completo —
    `src/__tests__/iphone-ancho-nombres.test.ts`. El nombre se localiza por
    `data-empleado-campo="nombre"`, no por su clase de breakpoint.
39. **El estado de cuenta pasa a tarjetas por debajo de `lg` (1024 px)**, y **los mismos datos están
    en las dos vistas** (marcados con `data-mov-campo`, incluido `espera`) —
    `src/__tests__/ipad-caja-prestamos-cheques.test.ts`.
40. **El Excel empieza en la fila 1**, con autofiltro desde A1 y encabezados fijos —
    `src/__tests__/excel-exports-finanzas.test.ts`.
41. **El filtro de empresa se recuerda** en `localStorage` como `fg_last_prestamos_empresa`.
42. 🔴 **`PRESTAMOS_ROLES` se dice una vez** (`src/lib/prestamos-roles.ts`) y hay barrido que pone el
    build rojo si el literal reaparece.

## Con qué conecta

### Qué lee de otros módulos
🔴 **`asistencia_personas`, y es lo que sostiene el módulo desde el 5-sep-2026.** De ahí salen el
**nombre**, la **empresa**, si la persona **trabaja** (reemplaza a la bandera `activo`), su **salario
mensual** (el tope) y la **lista de las 37 activas** con la que se busca y se presta.
`src/lib/prestamos-lista-server.ts` es el único lugar que hace esa lectura, y la comparten la página
SSR y la API.

⚠️ El desplegable de empresa ya no sale de `EMPRESAS` (ofrecía 7 y solo se usan 3): se **deriva** de
las empresas que de verdad aparecen en la lista.

### Quién lee lo suyo

| quién | qué lee, exactamente | archivo |
|---|---|---|
| 🔴 **Asistencia › Planilla** | `prestamos_empleados` (`id, nombre, deduccion_quincenal, deduccion_dano, empleado_codigo`, `.or("deleted.is.null,deleted.eq.false")`, paginado) y `prestamos_movimientos` (con `estado`, `deleted` y `cuenta`, paginado). El saldo lo calcula **`calcularSaldoPrestamo`**, no una copia | `src/lib/asistencia/prestamos-planilla-server.ts` → `prestamos-planilla.ts` → `src/app/asistencia/PlanillaTab.tsx` (bloque **«Préstamos por descontar»**) |
| 🔴 **Asistencia › Configuración** | la **deuda por código** (`leerDeudaPorCodigo`), para avisar «Debe $100 — descuéntalo de la liquidación» al marcar la fecha de salida. ⚠️ Si Préstamos falla, el mapa viene vacío y la pantalla **no se cae** | `src/app/api/asistencia/configuracion/route.ts` → `ConfiguracionTab.tsx` (bloque «¿Se fue de la empresa?») |
| **Boston › pestaña Préstamos** (David) | `prestamos_empleados` con embed, **las 3 empresas a propósito**, y **solo quien debe**. Usa `calcularSaldoPrestamo`, y trae las dos cuentas. **Único verbo: GET** | `src/app/api/boston/prestamos/route.ts` |
| **Boston › Inicio** (David) | cuenta **quién DEBE** con `empresa = "Confecciones Boston"`. 🩸 Contaba `activo = true`, una bandera que no significaba ni «trabaja» ni «debe» | `src/app/api/boston/inicio/route.ts` |
| **Búsqueda global** | `prestamos_empleados` por `nombre ILIKE`, límite 5, con embed; el saldo sale de `calcularSaldoPrestamo`. Enlaza a `/prestamos/{id}` | `src/app/api/search/route.ts`, `src/components/SearchBar.tsx` |
| **Data Health** | `prestamos_movimientos` completa con `estado='aprobado'`; alerta `info` si algún saldo queda por debajo de **−$100**. El saldo lo calcula `calcularSaldoPrestamo`, no una copia. Check `prestamos_saldo_anomalo` | `src/lib/integrity-checks.ts`, cron `/api/cron/integrity-check` 12:00 UTC |
| **Cron `prestamos-caducan`** | los movimientos en `pendiente_aprobacion`; borra (soft) los que llevan 7 días y avisa por Telegram privado | `src/app/api/cron/prestamos-caducan/route.ts`, 13:15 UTC |
| **Respaldo** | las dos tablas enteras | `src/app/api/cron/backup/route.ts:188-189` |
| **Badges** | cuenta `estado = 'pendiente_aprobacion'` — desde el 5-sep-2026 vuelve a poder ser > 0 | `src/app/api/notification-badges/route.ts`. ⚠️ **El hook `useBadges` sigue sin consumidor**: es la única llamada a esa ruta y nadie llama al hook |

**El puente con Asistencia es de IDA.** La planilla lee el saldo y propone la cuota; **aprobar allá
NO registra ningún pago aquí**. Lo que aprobar escribe es `asistencia_prestamo_aprobado` (la decisión)
y `asistencia_planilla_manual.prestamo` (la casilla). El pago en Préstamos lo registra una persona,
o el botón «Aplicar quincena».

### Qué se rompería si se cambiara la forma de sus datos

| cambio | qué se rompe |
|---|---|
| **Renombrar cualquiera de los 5 conceptos** | el cálculo del saldo, la RPC, la planilla, Boston, el Excel y Data Health. Ninguno cae a cero: **cambian el número en silencio**, porque un concepto desconocido «no se cuenta». Por eso «Daño de mercancía» es una ETIQUETA y no un valor guardado, y hay candado que lo exige |
| **Escribir otro valor en `estado`** | esa plata desaparece de **todas** las pantallas sin avisar. Es literalmente el mecanismo de los $700 de LUIS ADRIAN ARROYO |
| **Quitar o renombrar `empleado_codigo`** | la planilla lanza (500) y no sale el cuadro. Ya no degrada — es deliberado |
| **Que `empresa` pase a guardar la key (`confecciones_boston`) en vez del nombre** | `/api/boston/inicio` cuenta **0 personas con préstamo** en la tarjeta de David, sin error |
| **Que `deleted` vuelva a admitir NULL en inserts** | ✅ ya no rompe nada: todas las lecturas usan `.or("deleted.is.null,deleted.eq.false")` y hay barrido que prohíbe el `.eq` en el módulo |
| **Que `prestamos_movimientos` pase de 1.000 filas** | el check de Data Health lee **sin paginar** (`db-max-rows` corta en silencio). Hoy hay 443: margen de 557 |
| **Cambiar el texto de la nota «Deducción quincenal»** | se apaga el dedup del POST y se puede registrar dos veces la misma deducción |

## Por qué está así

> Las decisiones del **5-sep-2026** están desarrolladas, con sus mediciones, en
> [`docs/postmortems/prestamos.md`](../postmortems/prestamos.md). Aquí va el resumen.

| decisión | cita textual y fecha |
|---|---|
| **Dos cuentas por persona, con su propia cuota** | Daniel, **5-sep-2026**, con el mockup: `Préstamo $220 · Daño de mercancía $50 · Debe $270`. El total no cambió: 14 personas, **$5.062,01**, medido antes de partirlo |
| **La planilla propone la SUMA de las dos en una casilla** | Daniel: ***«juntos»*** |
| **El nombre sale de Asistencia** | Daniel: ***«deberías de usar el nombre de asistencia para que todo tenga coherencia»***. Cambian 5 fichas, ninguna mueve un centavo |
| **La bandera `activo` se retira** | no significaba «trabaja aquí» sino «tiene algo abierto»: a ESMER CRUZ le archivaron la ficha al terminar de pagar sus $600 y **sigue trabajando**; a KENNER igual tras pagar $3,13 |
| **Vuelve la aprobación, pero para el TOPE y sin esconder** | el freno de $500 se retiró el 27-ago porque escondía plata ($700 de LUIS ARROYO, 22 días en cero). El tope de un sueldo es una decisión de negocio, y **lo que espera se ve en tres superficies y caduca a los 7 días** |
| **Solo Daniel aprueba** | hay **dos** usuarios con rol `admin` (`daniel` y `alberto`): preguntar por el rol dejaría aprobar a quien no lo decide |
| **El daño de mercancía nunca se frena por tope** | no es plata que se entrega: es plata que ya se perdió, y no anotarla no la devuelve |
| **El freno de duplicados deja de leer la nota** | `ilike` no ignora los acentos: **18 filas vivas** lo burlaban y el candado estaba apagado sin que nadie lo supiera |
| **La nota pasa a ser opcional** | las 432 vivas la tienen y **8 de cada 10 son un eco del concepto** |
| **El Excel pregunta el ámbito después del clic** | Daniel: ***«que esté la opción después de apretar descargar»*** |
| **El aviso de salida con deuda va en Asistencia, sin Telegram** | Daniel eligió la opción (a): el aviso va **donde se toma la decisión**, que es cuando se marca la fecha de salida |
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
| **La bandera `activo` y los botones «Archivar» / «Reactivar» / «Forzar Archivado»** | 5-sep-2026 | nunca significó «trabaja aquí». La **columna no se borra**: queda sin lectores, con `COMMENT` y candado |
| **Las 3 pestañas de estado, el botón «Aprobar» viejo, `approveMov()`, el aviso de los $500, `estadoLabel()` y los dos `UndoToast`** | 5-sep-2026 | código muerto medido: 443 de 443 en `aprobado`, un aviso que era mentira desde el 27-ago, y un «Deshacer» que nunca se mostró |
| **El hard delete de «Eliminar Todo el Historial»** | 5-sep-2026 | era el **único `.delete()` real del repo**, en la tabla de plata y sin `logActivity` |
| **El panel deslizante del celular y el paso «Seleccionar Empleado»** | 5-sep-2026 | eran dos de los **cinco caminos** para registrar el mismo pago |
| **Los conceptos «Abono extra» y «Pago de responsabilidad» del formulario** | 5-sep-2026 | son un pago de otro monto. **Se siguen contando**: el histórico conserva sus nombres |
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

⚠️ **`activity_logs` no registraba las altas** hasta el 5-sep-2026: ni un movimiento nuevo ni una
ficha nueva pasaban por `logActivity`. De 443 movimientos, el log conoce **94 ediciones y 11
borrados**. Desde hoy sí se registran (`prestamo_mov_create`, `prestamo_mov_pendiente`,
`prestamo_empleado_create`, `prestamo_historial_delete`, `prestamo_aprobado`, `prestamo_rechazado`,
`prestamo_caducado`). Tampoco hay forma
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

**Un solo archivo, y ningún correo ni PDF.** El módulo manda **Telegram al chat privado de Daniel**
en dos casos —un préstamo que pasa el tope y un pendiente que caduca a los 7 días—, por
`enviarNegocioPrivado`: destino de sistema, trato de negocio, **sin el prefijo 🔧 SISTEMA** (un
préstamo que espera no es una avería). Su otra salida es indirecta: el aviso ámbar de la planilla.

| archivo | de dónde sale | nombre | contenido | quién lo recibe |
|---|---|---|---|---|
| **Excel «Descargar historial»** | Lista › «···» › **Descargar historial** → **«¿Solo los que deben o todos?»** | `historial_prestamos_<deben\|todos>_<empresa>_<AAAAMMDD>.xlsx` (o `todas_las_empresas`) | **2 hojas** (`src/lib/exports/prestamos-excel.ts`) | Contabilidad |

- **Hoja «Resumen»** — una fila por persona: `Empleado · Empresa · Cuota préstamo · Cuota daño ·
  Debe de préstamo · Debe de daño · Total prestado · Total pagado · Debe · % Progreso`, más una fila
  **TOTALES**. Los montos van como **número** con formato `$#,##0.00` (`MONEY_FMT`) y el porcentaje
  con `PCT_FMT`.
- **Hoja «Movimientos»** — una fila por movimiento aprobado, ordenadas por empleado (A-Z) y dentro
  por fecha descendente con `created_at` de desempate: `Empleado · Empresa · Fecha · Concepto ·
  Cuenta · Monto · De dónde salió · Notas`. La fecha va como texto en formato «5 abr 2026».
- 🔴 **Lo que espera aprobación NO sale**: no es plata todavía, y en un papel sin su contexto se
  leería como si ya se hubiera entregado.
- ⚠️ **La columna «Estado» se fue**: traducía dos valores que la pantalla no producía y en las 443
  filas decía siempre «Aprobado».
- **Las dos hojas empiezan en la fila 1**, con autofiltro desde A1 y la fila de encabezados fija al
  bajar (`buildReportSheet`). Sin título adentro: el nombre del archivo ya lo dice.
- El filtro de empresa del Excel **es el mismo que está puesto en la pantalla** — se pasa como
  `?empresa=`, y el ámbito como `?ambito=`.

## Cómo probarlo a mano

**A. Que la lista dice la verdad — 2 minutos**
1. Entra a `fashiongr.com/prestamos` con `admin` o `Contabilidad`.
2. El chip **«SALDO PENDIENTE TOTAL»** tiene que decir **$5.062,01** (las 14 personas con deuda,
   incluida BRICEIDA MONTERO) y el de quincena, cuántas personas con cuota ya tienen el descuento.
3. La lista sale **agrupada por empresa**, y **solo aparece quien debe**.
4. Escribe un nombre de alguien que NO debe (por ejemplo `KEVIN`): tiene que salir bajo **«No deben
   nada»**, y al tocarlo se abre su ficha con todo su historial.

**B. Que un pago quincenal baja el saldo — 3 minutos**
1. Abre a alguien con saldo (por ejemplo ANGELA GARCIA, $1.798,05, cuota $50).
2. Toca **`Pago Quincenal · $50,00`**.
3. El saldo tiene que bajar exactamente $50, el progreso subir, y arriba aparecer el chip
   **«✓ Deducida esta quincena»**.
4. En el estado de cuenta, el renglón nuevo dice `Pago · <hoy> · Quincena · −$50,00` y su columna
   **Saldo** tiene que coincidir con el número grande de arriba.
5. **Prueba del candado**: vuelve a tocarlo. Tiene que salir *«Esta persona ya tiene el descuento de
   esta quincena registrado»* y **no** crearse un segundo renglón.
6. Para dejarlo como estaba: 🗑 en ese renglón → Eliminar. El saldo vuelve a subir $50.

**C. Que las dos cuentas se ven y se cobran por separado — 3 minutos**
1. En la ficha de alguien, **+ Nuevo Movimiento** → **Daño de mercancía** → $50 → Registrar.
2. La tarjeta de arriba tiene que mostrar **las dos líneas** (Préstamo · Daño de mercancía) con su
   raya y el total debajo.
3. **+ Nuevo Movimiento** → **Pago**: ahora aparece **«Baja de»**, puesto en la cuenta **más vieja**.
   Cámbialo a la otra y registra: el saldo que baja tiene que ser el de la cuenta que elegiste.
4. En el estado de cuenta aparece la columna **Cuenta** (solo aparece si hay movimientos de daño).

**D. Que el tope frena y no esconde — 3 minutos**
1. En la ficha de alguien con poco saldo, **+ Nuevo Movimiento** → **Préstamo** → un monto que pase
   su sueldo mensual (o $500 si no tiene sueldo cargado).
2. Tiene que salir el aviso con los números («debe X, pide Y, quedaría Z, N por encima de su sueldo»)
   y el botón pasar a decir **«Mandar aprobación»**.
3. Al registrar: el **saldo NO cambia** (no se entregó), pero el movimiento aparece **resaltado en
   ámbar** con «Esperando a Daniel · hoy», la tarjeta dice **«Esperando aprobación $X»** y la lista
   muestra la barra gris arriba.
4. Con `Contabilidad`: entra a **Préstamos por aprobar** — se ve todo, con los botones **apagados**.
5. Con `daniel`: **Aprobar**. Ahora sí suma al saldo, y entra al descuento de esta quincena.
6. ⚠️ Un **Daño de mercancía** del mismo monto **NO** pide aprobación, a propósito.

**E. Que el préstamo llega a la planilla — 5 minutos**
1. Ve a `fashiongr.com/asistencia` › **Planilla**, elige la empresa y la quincena, toca **Generar**.
2. Busca el bloque **«Préstamos por descontar»**. Quien tenga las dos cuentas tiene que aparecer con
   **la suma de las dos cuotas** en una sola línea.
3. Toca **Aprobar** en una: la casilla **Préstamo** de esa persona se llena con ese monto.
4. Toca **Quitar**: la casilla vuelve a 0. Si la habías corregido a mano, **no** se borra.
5. ⚠️ **Aprobar allá no registra ningún pago en Préstamos**: el puente es de ida.

**F. Que el nombre viene de Asistencia**
En «Préstamos por descontar», el nombre de la planilla y el de Préstamos tienen que ser **el mismo**
para las fichas atadas. El aclaratorio gris «(en Préstamos: …)» solo debería aparecer si alguien
volvió a escribir un nombre a mano.

**G. Que quien se va debiendo se dice**
En **Asistencia › Configuración**, abre a alguien con deuda y baja hasta **«¿Se fue de la empresa?»**:
tiene que salir en ámbar **«Debe $X en Préstamos — descuéntalo de la liquidación»**, y el mismo texto
en el aviso de guardado.

**H. Que el Excel sale bien**
«···» → **Descargar historial** → elige **«Solo los que deben»** o **«Todos»**. Ábrelo: **fila 1 =
encabezados**, con las flechitas de filtro y la fila fija al bajar. Hoja «Resumen» con las dos cuentas
y la fila **TOTALES**; hoja «Movimientos» con `Cuenta` y `De dónde salió`, y **sin** columna Estado.

## Qué lo rompe

| qué falla | qué pasa | cómo se notaría |
|---|---|---|
| **Una migración sin aplicar** — el caso real: `20260917120000` estuvo escrita y desplegada mientras la RPC viva seguía con `p_quincena_start − 3` | el diálogo decía «Aplicar a las 10» y la RPC habría aplicado a **0**: con −3 días, todo el que cobró el 15 sale como «ya deducido» y el lote del 31 no le aplica a nadie | **no se habría notado**: el aviso dice cuántas se omitieron, pero nadie estaba mirando. Se descubrió leyendo `pg_proc` contra `supabase_migrations.schema_migrations`. ✅ Aplicada el 4-sep-2026 |
| **Alguien escribe un `estado` distinto de `aprobado`** (a mano en la base, o un código nuevo que lo haga) | esa plata **desaparece del saldo, de la planilla, de Boston, del total de la lista y de Data Health**, todo a la vez y sin error | 🔴 **no se notaría.** Es exactamente lo que pasó con los $700 de LUIS ADRIAN ARROYO: se supo 22 días después porque la contadora lo mencionó de pasada |
| **Se cambia el texto de una nota** | ✅ ya no pasa nada: el freno mira `concepto + origen_pago + fecha`, por cuenta. 🩸 Hasta el 5-sep-2026 sí: 18 filas vivas lo burlaban | — |
| **Se renombra un concepto** | los 8 cálculos de saldo lo dejan de contar — **no revientan, cambian el número** | los saldos bajan o suben sin motivo; Data Health podría encender `prestamos_saldo_anomalo` si algún saldo cae bajo −$100 |
| **`prestamos_movimientos` pasa de 1.000 filas** | el check de Data Health lee **sin paginar**: `db-max-rows` corta en silencio y el check opina sobre una parte | el check seguiría en verde. Hoy hay 443 — margen de 557 filas, o sea ~2 años al ritmo actual |
| **Una lectura de Supabase falla** en la planilla (permiso, timeout, esquema) | 🔴 desde el 3-sep **la planilla no sale** (500 con el mensaje), en vez de calcularse con «nadie está atado» | error visible en pantalla. Antes salía tranquila y **sin descontar ningún préstamo** |
| **Alguien toca «Eliminar todo el historial»** | ✅ soft delete con `logActivity` (quién, cuándo y cuántos movimientos). 🩸 Hasta el 5-sep-2026 era un `DELETE` real, sin rastro | queda en `activity_logs` como `prestamo_historial_delete` |
| **`empresa` deja de guardar el nombre y guarda la key** | la tarjeta de Inicio de David dice **0 personas con préstamo** | número silenciosamente mal en una pantalla que solo él mira |
| **Un insert deja `deleted` en NULL** | `prestamos-planilla-server.ts` y el POST usan `.eq("deleted", false)`: esas filas **desaparecen** del cálculo de la planilla y de la validación de saldo | la casilla Préstamo bajaría o desaparecería sin explicación |
| **Se crea una ficha nueva** | ✅ nace **con su `empleado_codigo`**: se elige a la persona de Asistencia y el POST rechaza el alta sin código. 🩸 Las del 2 y el 4 de septiembre nacieron sin él — $400 que la planilla no podía descontar | el aviso ámbar «N préstamos con saldo no están atados a nadie» sigue arriba de la Planilla, por si acaso |
| 🔴 **La migración `20260925120000` no se aplica** | faltan `deduccion_dano`, `cuenta` y `origen_pago`: **el módulo entero devuelve 500** y la planilla tampoco sale | error visible en pantalla, no un número mal. Es deliberado: degradar sería «nadie está atado» otra vez |
| **Switch** | 🔴 **nada.** Este módulo no toca Switch, ni por API ni por el panel web. Ningún cambio de formato de Switch puede romperlo | — |

## Lo que sobra o no cuadra

> ✅ = lo resolvió la reescritura del 5-sep-2026. El porqué de cada uno está en
> [`docs/postmortems/prestamos.md`](../postmortems/prestamos.md).

### Resuelto

| qué era | qué pasó |
|---|---|
| **OCHO lugares calculaban el saldo**, y el único que no usaba `calcularSaldoPrestamo` era la ficha, con un `console.warn` admitiendo que podía no cuadrar | ✅ todos pasan por `prestamos-saldo.ts`, con barrido que caza una segunda copia |
| **`PRESTAMOS_ROLES` tecleado a mano en 6 archivos** (dos con el literal repetido adentro) y 3 rutas sin `requireRole` | ✅ `src/lib/prestamos-roles.ts`, con barrido |
| **CUATRO definiciones de la quincena**, dos de ellas con el reloj LOCAL del navegador | ✅ una sola, en `prestamos-quincena.ts` (UTC−5 fijo), con barrido que prohíbe `new Date().getMonth()` en el módulo |
| **CINCO caminos para registrar el mismo pago quincenal** | ✅ dos: el botón de la ficha y «Aplicar quincena». El panel deslizante del celular y el paso «Seleccionar Empleado» de la lista se fueron |
| **6 tarjetas para 5 conceptos** («Pago Quincenal» y «Pago Extra» eran el mismo `Pago`) | ✅ **tres** conceptos, tres tarjetas |
| **Las 3 pestañas de estado muertas** y el botón «Aprobar» inalcanzable | ✅ se fueron; lo que espera va resaltado en la misma lista |
| **`approveMov()`** y la rama `estado === "aprobado"` del PUT | ✅ retiradas; aprobar vive en `/api/prestamos/pendientes`, con su propio permiso |
| **El aviso «≥ $500 requiere aprobación»**, que era mentira desde el 27-ago | ✅ se fue; el aviso de hoy dice los números reales del tope |
| **`estadoLabel()` del Excel**, que traducía dos valores inexistentes | ✅ la columna «Estado» se fue |
| **Los dos `UndoToast`** que nunca se mostraban (`scheduleUndoMov` se destructuraba y jamás se llamaba) | ✅ retirados: son registros financieros |
| 🔴 **«Eliminar Todo el Historial»**, el único hard delete del repo, en la tabla de plata y sin log | ✅ soft delete con `logActivity` |
| **`empleado_codigo` no se podía poner desde ninguna parte**, y el aviso de la planilla decía que sí | ✅ se elige la persona de Asistencia, al crear y al editar |
| **Las 2 fichas activas sin atar** — MARTHA $300 y YERITZA $100 | ✅ atadas en `20260925120000` (43 y 51), con guard de nombre |
| **`RAMON MIRANDA` con dos fichas** y el mismo código 21 | ✅ juntadas: $220 + $0 = **$220**. Y el POST ya no deja crear una segunda ficha para un código que tiene una |
| **«Archivar» solo con saldo 0**, así que `Contabilidad` no podía archivar a nadie con saldo (había que pedirle a un admin «Forzar Archivado») | ✅ no hay nada que archivar: quien llega a cero sale solo de la lista |
| **El Excel solo traía `activo = true`**: el historial de 17 fichas no salía en ningún export | ✅ pregunta **«¿Solo los que deben o todos?»** |
| **El desplegable ofrecía 7 empresas y solo se usan 3** | ✅ se deriva de las que aparecen |
| **La `notas` del movimiento hacía TRES cosas** (basura, almacén y llave de negocio) | ✅ dejó de ser llave (`origen_pago`) y es **opcional**; lo que guardaba de verdad —de dónde salió la plata— tiene su propia columna |

### Lo que sigue abierto

1. **`GET /api/prestamos/movimientos`** — cero consumidores.
2. **Todo el chain de badges**: `src/lib/hooks/useBadges.ts` **no lo importa nadie**, y su `fetch` es
   la única llamada a `/api/notification-badges`. Muerto de las dos puntas.
3. **Columnas `aprobado_por` y `created_by`**: 0 de 443, sin escritores. (El «quién aprobó» vive en
   `activity_logs`.)
4. **`notas` del empleado**: 29 de 32 llenas, **cero lectores**.
5. **`created_at` del empleado**: nunca se muestra ni se usa para ordenar.
6. **`loading.tsx`** dibuja una tabla que la lista no tiene.
7. **Deep link `/prestamos?search=Juan`** del Spotlight: la pantalla nunca lee `searchParams`.
8. **Personas duplicadas viejas**: `JOHANA VALLEJO` ×2, `LUZ LOPEZ` ×2 (una con 0 movimientos),
   `STEFANY` / `STEPHANY MORALES`. Todas sin código, saldo 0, no aparecen.
9. **Se corrige mucho y no se sabe qué**: ~94 ediciones sobre ~200 movimientos tecleados, y el log
   siempre dice los mismos campos porque el modal manda todos.
10. **11 movimientos cuya nota dice «Fashion Shoes»** — una empresa que ninguna ficha tiene puesta.
11. 🔴 **BRICEIDA MONTERO está ACTIVA, y la documentación la daba por retirada. Confirmado hoy.**
    Medido el 5-sep-2026 contra `asistencia_personas`:

    ```sql
    select empleado_codigo, nombre, empresa, salario_mensual, activo, fecha_salida
    from asistencia_personas where nombre = 'BRICEIDA MONTERO';
    -- 8 | BRICEIDA MONTERO | confecciones_boston | 566.52 | true | null
    ```

    **Código `8` · Confecciones Boston · salario $566,52 · `activo = true` · `fecha_salida` en NULL.**
    Su ficha de préstamo estaba *archivada* con la vieja bandera `activo`, y esa bandera nunca
    significó «se fue»: significaba «tiene algo abierto» (§ Por qué está así). Como la bandera se
    retiró y **quien decide si alguien trabaja es Asistencia**, hoy BRICEIDA aparece en la lista, se
    le vuelve a proponer el descuento de sus **$100** con su cuota de **$50**, y el tope la mide
    contra sus $566,52 reales (no contra el piso de $500).
    ⚠️ **Lo decide Daniel:** si de verdad ya no trabaja, la baja se marca **en Asistencia** —
    poniéndole `fecha_salida`— y ahí mismo el sistema avisa *«Debe $100 — descuéntalo de la
    liquidación»*. No hay que tocar nada en Préstamos.
12. ⚠️ **STEPHANY MORALES** queda con préstamo −$254,50 / daño +$254,50 (neto $0), porque así se
    registró. **No se reasignó nada** a propósito.
13. ⚠️ **`asistencia_prestamo_aprobado` se usó una sola vez**, en una sentada de 9 minutos el
    27-ago-2026. La quincena `2026-09-1` no tiene ni una fila.

---

## Lo que estaba mal

Lo que la documentación (este archivo, `CLAUDE.md` y los postmortems) daba por cierto y **no lo era**,
verificado contra producción el **5-sep-2026**. Está aquí para que no se vuelva a repetir el error de
contestar de memoria.

| decía | es | cómo se comprobó |
|---|---|---|
| 🔴 «La migración `20260925120000` está **ESCRITA y NO APLICADA**» | ✅ **Aplicada.** Las tres columnas existen, la RPC viva ya trae las dos cuentas y el dedup por origen, y la ficha duplicada de RAMON MIRANDA está juntada | `select version from supabase_migrations.schema_migrations where version='20260925120000'` → 1 fila; `information_schema.columns` → `deduccion_dano`, `cuenta`, `origen_pago` presentes |
| 🔴 «**BRICEIDA MONTERO** está retirada / su ficha archivada» | **Trabaja.** `asistencia_personas`: código `8`, Confecciones Boston, salario **$566,52**, `activo = true`, **sin `fecha_salida`** | consulta directa a `asistencia_personas` |
| «$5.062,01 = **$4.962,01 en 13 más $100 de BRICEIDA MONTERO**» | El total es correcto, la partición **se lee mal**. Sus $100 son un **Préstamo** como los otros 13, no una deuda de otra clase. Son 5 préstamos por $1.300 (abr-jun 2025) contra $1.200 de pagos | reconstrucción movimiento por movimiento de su ficha |
| «14 personas, y con las dos cuentas queda **13 en Préstamo + 1 cruzada**» | **14 en Préstamo, $0,00 en Daño en las 14.** La persona cruzada (STEPHANY MORALES) tiene saldo **neto $0** y por eso no está entre las 14: son **15** las que tienen alguna cuenta ≠ 0 | la consulta de saldo por cuenta, arriba |
| «**32 fichas**» | **31 vivas** + 1 borrada (la segunda de RAMON MIRANDA) | `count(*) filter (where coalesce(deleted,false)=false)` |
| «`empleado_codigo`: **22 de 32 → 24** al aplicar» | **23 de 31** — y lo que importa: **las 14 que deben plata lo tienen, las 14**. Las 8 sin código tienen saldo $0 | join contra `asistencia_personas`, 0 huérfanos |
| «Las 2 fichas sin atar — MARTHA $300 y YERITZA $100 — **$400 que la planilla no puede descontar**» | ✅ **Cerrado.** Códigos `43` y `51` puestos. No queda ninguna ficha con saldo sin código | la misma consulta |
| «`deduccion_dano` / `cuenta` / `origen_pago`: **nuevas**» | Existen, y están **vacías**: `deduccion_dano` = 0 en las 31 fichas; `cuenta` y `origen_pago` en **NULL en los 443** movimientos. Es lo correcto (se derivan al leer), pero significa que **la segunda cuenta todavía no se usa** | `count(*) filter (where ... is not null)` |
| «El tope: **3 fichas sin salario cargado**, que caen al piso de $500» | Ninguna de **las 14 que deben** cae al piso: las 14 tienen salario en Asistencia. El piso de $500 existe y hoy **no aplica a nadie con deuda** | join `prestamos_empleados` × `asistencia_personas` |
| «El cron `prestamos-caducan` es nuevo» (sin decir si corrió) | ✅ **Corrió hoy**, 13:15:26 UTC, en vacío y sin mandar nada. Y **el camino del tope no se ha ejercitado nunca con un caso real**: 0 movimientos en `pendiente_aprobacion` desde que existe | `cron_heartbeats` + `count(*) where estado='pendiente_aprobacion'` |

**Lo que sí estaba bien y se confirma**, para que quede dicho: el total **$5.062,01** no se movió ni un
centavo con el corte en dos cuentas; los 443 movimientos y sus 5 conceptos siguen igual; RAMON MIRANDA
quedó en **una** ficha con **36 movimientos y $220,00**; el freno de duplicados de la RPC viva mira
`concepto + origen_pago + fecha` **por cuenta** y ya no la nota; y `deleted` sigue siendo NULLABLE en
las dos tablas aunque hoy no haya ni un NULL — o sea que el `.or("deleted.is.null,deleted.eq.false")`
sigue siendo obligatorio.

> 🔑 La lección de las dos filas de arriba en rojo es la misma: **una migración escrita y una migración
> aplicada no son lo mismo, y una bandera de un módulo no dice nada de otro módulo.** Las dos se
> contestan con una consulta de dos segundos.
