# Recordatorios · Usuarios · Data Health · y lo que atraviesa todo el sistema

> Referencia, no auditoría. Todo lo que dice un número aquí está **medido contra producción el
> 4-sep-2026** salvo que diga otra cosa. Lo que no se pudo medir dice «no medible» y por qué.
> Complementa `CLAUDE.md` (no lo repite): cuando algo ya está ahí, se apunta con `ver CLAUDE.md § X`.

Contenido:

1. [Recordatorios (`/recordatorios`, key `cheques`)](#1-recordatorios-recordatorios-key-cheques)
2. [Usuarios (`/admin/usuarios`, key `usuarios`)](#2-usuarios-adminusuarios-key-usuarios)
3. [Data Health (pestaña de Usuarios)](#3-data-health-adminusuariostabdata-health)
4. [Entrar al sistema — login, sesión, roles, middleware](#4-entrar-al-sistema--login-sesión-roles-middleware)
5. [La navegación — `src/lib/modules.ts`](#5-la-navegación--srclibmodulests)
6. [La búsqueda global (⌘K)](#6-la-búsqueda-global-k)
7. [Las alertas de Telegram — dos chats, tres tratos](#7-las-alertas-de-telegram--dos-chats-tres-tratos)
8. [Los crons — `vercel.json` contra el registro de código](#8-los-crons--verceljson-contra-el-registro-de-código)
9. [Los backups y la réplica a R2](#9-los-backups-y-la-réplica-a-r2)
10. [Switch Soft — las dos vías, la sesión por USUARIO y los cambios de formato](#10-switch-soft--las-dos-vías-la-sesión-por-usuario-y-qué-pasa-cuando-cambia-un-formato)
11. [Qué se cae si un cron no corre — el mapa completo](#11-qué-se-cae-si-un-cron-no-corre--el-mapa-completo)
12. [Lo que sobra o no cuadra — transversal](#12-lo-que-sobra-o-no-cuadra--transversal)

---

# 1. Recordatorios (`/recordatorios`, key `cheques`)

> 🔄 **Reescrito el 5-sep-2026 con el rediseño del módulo.** Lo que decía antes —ocho pestañas, tres
> tarjetas de totales, el Excel, el «+ Recordatorio» que abría una ventana de cuatro campos— describe
> un módulo que ya no existe. El post-mortem completo, con las citas de Daniel y las mediciones,
> está en [`docs/postmortems/recordatorios.md`](../postmortems/recordatorios.md).

## Qué es

Dos cosas conviviendo en **una sola lista**: los **cheques por depositar** que los clientes entregan
(a quién, cuánto, para qué día, quién lo recibió) y los **recordatorios sueltos** que se escriben
para que Telegram los avise. El módulo se llamaba «Cheques» hasta el 24-ago-2026; Daniel, textual:
*«en el módulo de cheques, quisiera cambiarlo a recordatorios, ya que quisiera poner ahí en el
calendario "recordar cobrar" y pongo la fecha así telegram me recuerda»*.

🔴 **La DIRECCIÓN cambió el 5-sep-2026: `/cheques` → `/recordatorios`**, con redirect del enlace
viejo en `next.config.js`. 🔴 **La `key` NO cambió.** Sigue siendo `cheques` porque está escrita en
`role_permissions.modulos` y en `fg_users.modulos_override` — renombrarla rompe permisos y overrides
sin comprar nada (`src/lib/recordatorios/roles.ts`, `RECORDATORIOS_MODULO_KEY`).

## Quién entra

**Admin y secretaria, nadie más.** Daniel, a la pregunta de quién los ve: *«admin y secre»*. Hoy son
4 personas: admin = daniel, alberto; secretaria = Angela, andrea. La lista vive en **un solo lugar**
(`RECORDATORIOS_ROLES`) y la leen la ficha del módulo, la página SSR y las cuatro puertas del API.

## Los números, medidos contra producción (5-sep-2026)

| Qué | Cuánto |
|---|---|
| `cheques` vivos | **19** — 17 depositados ($257.174,34) + 2 pendientes ($22.221,78) |
| Borrados | **0** en toda la historia |
| Clientes con cheque | **1**: Jerusalem de Panamá |
| Cómo se usan | en tandas (5 en abril, 14 en julio) y se van marcando depositados |
| Último movimiento | **28-ago-2026** (17 `cheque_update` en `activity_logs` entre el 11-may y el 28-ago) |
| `recordatorios` vivos | **1** (creado el 5-sep-2026). Antes: cero en toda su historia |
| `cheque_vendedores` | 2 filas |

🔴 **El módulo SÍ se usa** — la parte de cheques. La de recordatorios estaba vacía porque escribir
uno costaba cuatro toques y una ventana; el rediseño ataca exactamente eso.

🩸 **Y había un cheque vencido que el sistema nunca volvió a mencionar:** Vistana, chq 018094,
Edwin, **$18.393,32**, vencía el **31-ago** y seguía «pendiente» cinco días después. Es lo que
motivó el aviso de vencido (ver más abajo).

---

## La pantalla, de arriba abajo

### a) El renglón de escribir — siempre visible

```
¿Qué te recuerdo?   [ Cuándo ▾ ]  [ A quién ▾ ]  [ + Cliente ]  [ Guardar ]
```

`src/app/recordatorios/components/LineaNueva.tsx`. Antes eran cuatro toques (menú → «Nuevo
recordatorio» → ventana de 4 campos → Guardar); ahora es una línea.

- **Cuándo** — seis pastillas cerradas: `Mañana · Lunes · Elegir fecha · Cada día · Cada semana ·
  Cada mes`, más un **«Hasta…» opcional** que solo aparece con las tres repeticiones.
- 🔴 **«Hoy» NO existe.** Todo sale en un mensaje diario a las 9:00 a.m.; para cuando alguien
  escribe, el de hoy ya salió. El primero disponible es mañana, y elegir un día pasado **apaga el
  botón y dice por qué**, pegado al campo.
- 🔴 **«Lunes» es el PRÓXIMO lunes.** Escrito un lunes, cae en el siguiente: si cayera en hoy sería
  la opción «Hoy» que justamente no existe.
- 🔴 **No hay selector de hora.** No existe la hora; existe el mensaje de las 9:00.
- **A quién** — `Al equipo` / `Solo a mí`. **Solo los admin lo ven.** Lo de una secretaria va
  siempre al equipo, y eso lo fuerza el **servidor** (`destinoPermitido`), no la pantalla.
- **Cliente** — opcional y **escondido por defecto**; se abre con `+ Cliente`. Se siguen guardando
  `cliente` y `cliente_codigo`.

### b) Lista / Calendario — dos MODOS, no pestañas

El control segmentado de siempre, con el modo en la URL (`?view=calendario`).

### c) La lista única — sin pestañas, agrupada por CUÁNDO

`src/app/recordatorios/components/AgendaLista.tsx`, decidida en el módulo puro
`src/lib/recordatorios/agenda.ts`.

| Grupo | Qué cae ahí |
|---|---|
| **Vencido** (rojo, arriba) | fecha anterior a hoy |
| **Hoy** | fecha = hoy |
| **Esta semana** | hasta el DOMINGO de la semana calendario |
| **Después** | más adelante |
| **Se repiten** | los recordatorios con repetición, **UNA fila cada uno** |

🔑 **La idea del rediseño:** «vencido», «vencen hoy», «vencen mañana» y «vencen esta semana» nunca
fueron estados — **son CUÁNDO**. Cuatro pestañas para decir cuatro veces lo que una fecha ya dice.

- 🔴 **La lista muestra solo lo ABIERTO**: cheques sin depositar (vencidos incluidos), rebotados, y
  recordatorios que todavía no se mandaron.
- 🔴 **Lo depositado NO está en la lista, pero aparece al BUSCARLO** con la lupa (por cliente o por
  número de cheque). El buscador mira TODO — es la única puerta a lo depositado.
- 🔴 **Rebotado dejó de ser pestaña** (cero filas en toda la historia del módulo): es una marca roja
  en la fila, y el cheque **se queda** hasta que se redeposite o se borre.
- 🔴 **Ningún total sumado, en ninguna parte.** Las tres tarjetas de arriba se fueron y no se
  reemplazaron por nada. Los montos POR FILA se quedan; el encabezado de grupo dice CUÁNTOS son.
  `agenda.ts` no tiene una sola operación de suma, y hay candado que lo exige.
- 🔴 **Un recordatorio que se repite es UNA fila** que dice cada cuánto y hasta cuándo. Con «Cada
  día» sin fecha de fin, una fila por ocurrencia sería una lista infinita.
- 🔴 **Un recordatorio NO se marca como hecho.** Daniel: *«No quiero tener que meterme para poner que
  lo hice. Se supone que sí.»* Se manda y ya.
- 🔴 **Un cheque que no se va a cobrar SE BORRA** (botón «Eliminar cheque» en su detalle). No se
  agregó ningún estado tipo «no se cobró» — Daniel: *«no lo quiero marcar»*.

### d) El calendario

`src/app/recordatorios/components/CalendarioMes.tsx`. **No cambió**: los dos layouts (grilla de
escritorio y lista de celular), el globo flotante de cada cheque y las píldoras siguen igual, con
cheques y recordatorios juntos. Lo único que se le quitó fue el **total del mes** (ver «ningún total
sumado»); sigue diciendo **cuántos**.

### e) El Excel

🔴 **Retirado.** Daniel: *«se va»*. Se borró `app/cheques/excel-cheques.ts` y su botón. Los datos
siguen en la base; lo que se fue es la descarga. El candado de «los N lugares que arman una hoja»
bajó de 25 a 24 **a propósito y con nota**.

---

## El aviso — UN mensaje diario a las 9:00 a.m.

Cron **`/api/cron/cheques-alert`**, ahora a las **14:00 UTC** (9:00 a.m. de Panamá; era 14:15).
Una entrada = una ocurrencia al día. Lógica en `src/lib/cheques-alert.ts`.

A las 9:00 salen **hasta dos mensajes**:

| Destino | Qué lleva |
|---|---|
| 📊 **Al grupo** (`enviarNegocio`) | cheques **por vencer** (texto de siempre) + cheques **VENCIDOS** (bloque nuevo) + recordatorios del **equipo** |
| 🔒 **Al privado** (`enviarNegocioPrivado`) | los recordatorios marcados **«solo a mí»** |

- El privado va **sin el prefijo `🔧 SISTEMA ·`**: es negocio, no una avería. Mismo patrón que el
  resumen diario de ACS.
- 🔴 **Se quitó la última línea del aviso de cheques** (`WhatsApp seguimiento: +50766745522,
  +50766494096`). Daniel: *«nada, es recordatorio nada más»*. El resto del texto **no se tocó**.
- **Si no hay nada, no se manda nada** (como siempre).
- Los cheques siguen yendo **solo al grupo**.

### 🔴 El aviso de cheque VENCIDO — una sola vez

`src/lib/cheques-vencidos-aviso.ts`.

El aviso de siempre mira **hoy y el próximo día hábil**: un cheque que venció y nadie marcó **no se
volvía a mencionar jamás** (los $18.393,32 de arriba). Ahora sale un bloque:

```
🔴 1 cheque venció y sigue sin depositar
• JERUSALEM DE PANAMA (Vistana International) $18,393.32 — vencía el lunes 31 ago · Edwin
```

- 🔴 **UNA SOLA VEZ**, y no se repite nunca más aunque siga sin depositarse. La memoria vive en la
  columna **`cheques.aviso_vencido_en`** (NULL = todavía no se avisó).
- ⚠️ **Se marca DESPUÉS de que Telegram confirme.** Marcarlo antes y que el envío falle quemaría el
  único aviso que ese cheque va a tener.
- 🔴 **Un cheque REBOTADO no avisa** — decisión de Daniel.
- La pregunta es «vencido y sin avisar», no «venció ayer»: así cubre de una vez los que ya estaban
  atrasados el día que esto se encendió, y de ahí en adelante se comporta igual.

### 🔴 La retención — a los 365 días el depositado se va solo

`src/lib/cheques-retencion.ts`, ejecutada **dentro de `cheques-alert`** (no hay cron nuevo: hoy son
82 entradas de un tope de 100, y este cron ya toca la tabla).

- **Soft delete** (`deleted = true` + `deleted_at`), **nunca un DELETE**.
- **Solo los depositados.** Lo que todavía se debe se queda para siempre.
- Se cuenta desde **cuándo se depositó** (`fecha_depositado`), no desde cuándo vencía; sin esa fecha
  cae a `fecha_deposito`, nunca a «hoy».
- ⚠️ Consecuencia escrita: `cheques-alert` no corre sábado ni domingo, así que la limpieza tampoco.
  Con 365 días de umbral, de lunes a viernes alcanza y sobra.

---

## Dónde vive cada cosa

| Pieza | Archivo |
|---|---|
| Pantalla (orquestador) | `src/app/recordatorios/RecordatoriosClient.tsx` |
| El renglón de escribir | `src/app/recordatorios/components/LineaNueva.tsx` |
| La lista única | `src/app/recordatorios/components/AgendaLista.tsx` |
| El calendario | `src/app/recordatorios/components/CalendarioMes.tsx` |
| Detalle · rebotado · «los del día» | `src/app/recordatorios/components/ChequeModales.tsx` |
| Formularios | `components/ChequeFormModal.tsx` · `components/RecordatorioFormModal.tsx` |
| Qué se ve y en qué grupo (PURO) | `src/lib/recordatorios/agenda.ts` |
| Cuándo toca · destino · validación (PURO) | `src/lib/recordatorios/recordatorio.ts` |
| Las pastillas de «Cuándo» (PURO) | `src/lib/recordatorios/cuando.ts` |
| El aviso de vencido (PURO) | `src/lib/cheques-vencidos-aviso.ts` |
| La retención (PURO) | `src/lib/cheques-retencion.ts` |
| El I/O del aviso | `src/lib/cheques-alert.ts` |
| Lectura/escritura de recordatorios | `src/lib/recordatorios/server.ts` |
| API | `/api/cheques`, `/api/cheques/[id]`, `/api/recordatorios`, `/api/recordatorios/[id]` |

🔴 **El archivo de la pantalla pasó de 1.693 líneas a 800** (el límite de la casa), repartido en seis
piezas. Hay candado que recorre `src/app/recordatorios/**` y exige que ninguna pase de 800.

## La base

| Tabla | Columnas nuevas (5-sep-2026) |
|---|---|
| `recordatorios` | `hasta date` · `destino text NOT NULL DEFAULT 'equipo'` · el CHECK de `repeticion` gana `cada_dia` |
| `cheques` | `aviso_vencido_en timestamptz` · `deleted_at timestamptz` |

Migración: **`20260925130000_recordatorios_rediseno.sql`** — aditiva, ni una fila cambia de valor.
⚠️ **El código NO degrada sin ella corrida** (la tolerancia a «falta el DDL» se retiró de este módulo
el 3-sep-2026, a propósito). Correrla es parte del despliegue.

## Los candados

| Archivo | Qué cuida |
|---|---|
| `recordatorios-rediseno.test.ts` | la agenda, las pastillas, `cada_dia`/`hasta`, el destino, el aviso único, la retención, el mensaje, la migración, el cron y la dirección |
| `recordatorios-pantalla.test.tsx` | **conducta**: monta la pantalla real, toca los botones |
| `recordatorios-permiso-y-aviso.test.ts` | permisos rol por rol con cookies firmadas + los dos mensajes de Telegram |
| `recordatorios-cuando-tocan.test.ts` | el motor de fechas (fin de mes, «no suena antes») |
| `cheques-aviso-vencimiento.test.ts` | la ventana del día hábil |

Verificación por mutación: `scripts/_mutar-candados-recordatorios.sh` — **56 mutaciones, 56 cazadas**
(54 rupturas + 2 controles que quedan verdes).

## Qué probar a mano

1. Entra como Daniel y abre **Recordatorios** desde el menú (o escribe `/cheques`: tiene que
   redirigir).
2. Escribe «Llamar al banco» en el renglón de arriba y toca **Guardar**. Aparece en el grupo **Hoy**
   o **Esta semana** según la fecha que proponga «Mañana».
3. Toca **Elegir fecha** y pon una fecha de ayer: el botón se apaga y dice *«El aviso sale a las 9:00
   de la mañana, así que hoy ya pasó…»*.
4. Busca `246001` en la lupa: tiene que aparecer aunque el cheque esté depositado.
5. Entra como secretaria: **no** tiene que verse la opción «Solo a mí».

## Lo que queda pendiente

| Qué | Estado |
|---|---|
| **Correr la migración `20260925130000_recordatorios_rediseno.sql`** | 🔴 pendiente — es Daniel quien la corre |
| «Recordarme este cliente» desde la hoja **Cobrar** del CXC | pendiente; toca archivos del módulo CXC |
| Un chat privado por admin | ⚠️ **no existe**: hay UNO solo (el de Daniel). Si Alberto marca «solo a mí», le llega a Daniel. Daniel lo sabe y lo aprobó así |


# 2. Usuarios (`/admin/usuarios`, key `usuarios`)

## Qué es

Donde se dan de alta las personas que entran al sistema, se les pone contraseña, rol y —si hace
falta— una lista de módulos a medida; y donde se ven y se cortan las sesiones abiertas. Es el
único módulo del grupo **Administración** y hospeda además la pestaña Data Health.

## Quién entra

**Solo `admin`.** Dos guardas, a propósito:

- El shell: `useAuth({ moduleKey: "admin", allowedRoles: ["admin"] })`. 🔴 `"admin"` **no es una key
  del catálogo de módulos** — `hasModuleAccess` solo la satisface con `role === "admin"`, porque el
  fallback a `fg_modules` nunca puede contener «admin» (`/api/admin/users` valida los overrides
  contra `ALL_MODULE_KEYS`). Cambiarlo a `"usuarios"` abriría la pantalla a quien tenga esa key
  asignada a mano.
- La pestaña Data Health se condiciona **además** con `esAdmin` (`role === "admin"`), para que el
  permiso se lea en el componente y un test lo pueda exigir.

Las APIs: `/api/admin/users` (GET/POST/PUT/PATCH), `/api/admin/sessions` (GET/DELETE),
`/api/admin/vendedor-mapping` (GET/PUT/DELETE) y `/api/admin/data-health` (GET) son todas
`requireAuth(req, ["admin"])` o `requireRole(req, ["admin"])` → **403 «Sin permisos»** a cualquier
otro rol, **401** sin sesión firmada.
`/api/admin/switch-vendedores` es la excepción: se abrió a `clienteSwitchRoles()` (los roles que
arman pedidos), porque el selector de vendedor del checkout usa el mismo endpoint.

Personas: `daniel` (is_owner) y `alberto` son los dos `admin` activos hoy.

## Las pantallas

Una ruta, `/admin/usuarios`, con dos pestañas en la URL (`?tab=usuarios` | `?tab=data-health`).
Un `?tab=` desconocido —o `data-health` sin ser admin— cae en `usuarios`, nunca en blanco.
`/admin/data-health` **redirige** aquí (`next.config.js`, 307) porque esa dirección vive en
marcadores y la mandó Telegram durante meses.

### Pestaña «Usuarios»

**Tarjetas de usuario** (grilla 1/2/3 columnas). Cada tarjeta muestra: avatar, **nombre**,
**rol** (capitalizado), la **empresa asociada** si tiene, el chip **«Permisos personalizados»** si
tiene override, el punto verde/gris **«Activo» / «Inactivo»**, y **«Última sesión hace X»** o
**«Nunca ha entrado»** (calculado del `max(last_seen)` de sus sesiones). A la derecha, dos botones
de 44×44: **Editar** y **Desactivar/Reactivar**.

Arriba a la derecha: **«Nuevo Usuario»**.

**Modal de alta / edición.** Campos con su rótulo exacto:

| Campo | Obligatorio | Reglas (todas revalidadas en el servidor) |
|---|---|---|
| **Nombre** | Sí | ≥ 3 caracteres, **único** entre todos los usuarios |
| **Contraseña** | Sí al crear, opcional al editar | ≥ 8 caracteres. Placeholder: «Mínimo 8 caracteres» al crear, «Dejar vacío para no cambiar» al editar. Botón ver/ocultar. 🔴 **Única en todo el sistema** (incluidos inactivos) |
| **Rol** | Sí | Desplegable con **5** opciones: Admin · Secretaria · Vendedor · Contabilidad · Bodega. Aviso ámbar si te cambias el rol a ti mismo |
| **Empresa asociada** | No | Texto libre («vistana, fashion_wear, etc.»). Ayuda ⓘ: *«Solo cambia algo para los vendedores: los deja ver en Cuentas por Cobrar únicamente los clientes de esa empresa. En blanco, ven las de todas.»* |
| **Permisos personalizados** | No | Interruptor. Ayuda ⓘ: *«Apagados, el usuario ve los módulos que le da su rol. Encendidos, ve **solo** los que marques aquí: la lista reemplaza a la del rol, no se suma.»* Al encenderlo aparece la lista de casillas con **todos** los módulos (`ALL_MODULES`) |
| **Vendedor en Switch** | No | Solo en edición: un desplegable por cada marca de catálogo (`VendedorSwitchSection`) |

El modal no se cierra con clic fuera ni Escape si ya se escribieron datos (`useFormModalDismiss`).

**Sección «Sesiones activas»** (colapsada por defecto). Chips de rango: **Hoy · 7 días · 30 días ·
Todas** (default 7 días) y un enlace **«Actualizar»**. Cada fila: avatar, **nombre**, **rol**,
**hace cuánto** (`last_seen`), **IP**, y a la derecha **«Revocar todas (N)»** (solo si ese usuario
tiene ≥ 2) y **«Revocar»**. Las dos piden confirmación.

### La tarea más frecuente, contada en pasos

**Dar de alta a alguien (6 pasos):** **Nuevo Usuario** → Nombre → Contraseña → elegir Rol →
*(opcional)* Empresa asociada o Permisos personalizados → **Guardar**.
Si la contraseña ya la usa otro, el servidor responde «Esa contraseña ya está en uso, elige otra.»

## Los datos

### `fg_users` — 11 filas, todas activas

Grano: **una fila por persona que entra al sistema**. Llave `id` (uuid); `name` es único por la API
(no por la base). **Sin soft delete**: se desactiva con `active = false`.

| Columna | Para qué | Quién escribe | Quién lee | Llenas |
|---|---|---|---|---|
| `id` | identidad; va en la cookie como `userId` | base | login, `/api/auth/sesion`, `/api/auth/perfil`, `vendedor-mapping` | 11 |
| `name` | usuario de login y **llave hacia `user_sessions.user_name`** | pantalla | login, sesiones, `logActivity` | 11 |
| `password` | hash bcrypt | pantalla (bcrypt cost 10) | solo el login | 11 |
| `role` | el rol | pantalla | todo el sistema | 11 (admin 2 · secretaria 2 · vendedor 3 · bodega 1 · contabilidad 1 · gerente_acs 1 · gerente_boston 1) |
| `active` | si puede entrar | pantalla (PATCH) | login y `/api/auth/sesion` | 11 en `true` |
| `associated_company` | filtro de empresa del CXC para vendedores | pantalla | `armarPayloadSesion` → `empresaFilter` | **1** (`edwin` → `vistana`) |
| `modulos_override` | lista de keys que REEMPLAZA a la del rol | pantalla | `armarPayloadSesion` | **2** (Angela y andrea, 11 keys cada una) |
| `is_owner` | marca de dueño | 🔴 **nadie desde la pantalla** | `armarPayloadSesion` → `fg_is_owner` en sessionStorage; `useAuth` lo devuelve | 1 (`daniel`) |
| `nombre_completo` | el nombre para saludar en el home | 🔴 **nadie desde la pantalla** | `/api/auth/perfil` | **4** (Angela García, Andrea Pérez, Daniel Levy, David Levy) |
| `email` | — | 🔴 **nadie desde la pantalla** | 🔴 **nadie lo lee** | 3 |
| `created_at` / `updated_at` | orden y auditoría | base / PUT | el GET ordena por `created_at` | 11 |

### `user_sessions` — 1.039 filas

Grano: **una fila por login** (multi-dispositivo: un login nuevo **no** revoca los anteriores).
Llave `id`; la llave funcional es `session_token` (uuid v4). **Sin `expires_at`** — ver §4.

| Columna | Para qué | Quién escribe | Quién lee |
|---|---|---|---|
| `user_name` | a quién pertenece (por NOMBRE, no por id) | login | pantalla, revocación masiva, `/api/auth/sesion` (verifica que coincida) |
| `user_role` | rol al momento del login | login | solo se muestra |
| `session_token` | el token que valida el middleware | login | middleware, `/api/auth/sesion`, page-gates SSR |
| `ip_address` | de dónde | login | la lista de sesiones |
| `last_seen` | último request | **middleware, fire-and-forget en cada request** | la lista, y los cortes del cron |
| `created_at` | alta | base | corte de vida máxima |
| `revoked` | si sigue válida | logout, pantalla, PATCH de desactivar, cron | middleware, `/api/auth/sesion` |

Estado medido: **179 sin revocar** repartidas en 13 nombres. daniel 40 activas / 349 totales ·
andrea 32/146 · Bodega 31/143 · Angela 21/174 · Contabilidad 19/68 · rey 13/65 · jennifer 13/42 ·
edwin 4/15 · david 4/5 · alberto 1/15.
🔴 Hay **tres `user_name` que no existen en `fg_users`**: `medicion-t203b` (rol `admin`, **1 sesión
sin revocar**, `last_seen` 27-ago-2026), `medicion-t210` y `medicion-horarios`. Son sesiones de
medición que quedaron. Ver §12 › punto 2.

### `role_permissions` — 7 filas

Grano: **una por rol**. Columnas: `role`, `modulos` (text[]), `activo`, `updated_at`.
Valor medido hoy:

| rol | `modulos` |
|---|---|
| `admin` | asistencia, caja, cargar, catalogos, cheques, comisiones, cxc, directorio, guias, marketing, multifashion, packing-lists, prestamos, reclamos, usuarios, ventas, referencia |
| `secretaria` | asistencia, caja, cargar, catalogos, cheques, comisiones, directorio, guias, marketing, packing-lists, reclamos |
| `vendedor` | catalogos, cxc, directorio, guias, referencia |
| `bodega` | guias, packing-lists, catalogos, referencia, asistencia |
| `contabilidad` | asistencia, prestamos, proveedores, gastos-contabilidad, comisiones |
| `gerente_acs` | multifashion |
| `gerente_boston` | boston, catalogos, asistencia |

⚠️ `activo` está en `true` en las 7 y **nadie lo lee**: `resolverModulos` no lo filtra.
⚠️ La fila de `admin` no incluye `boston`, `gastos-contabilidad`, `proveedores` ni `vista-general` —
y no importa, porque `getVisibleModules` devuelve `ALL_MODULES` para admin sin mirar la lista.

### `activity_logs` — 2.877 filas · `login_attempts` — 4 filas

`activity_logs`: `user_role`, `action`, `entity_type`, `entity_id`, `details` (TEXT con JSON
stringified), `created_at`. Es append-only y no se borra. Las 5 acciones más frecuentes:
`auth/login` 1.481 · `guias/guia_dispatch` 549 · `guias/guia_create` 204 ·
`prestamos/prestamo_mov_update` 94 · `ventas/ventas_upload` 82.
⚠️ **Ninguna pantalla del sistema muestra `activity_logs`.** Solo lo leen
`/api/cheques/[id]/historial` (sin lector, ver §1) y `/api/activity-logs`.

`login_attempts`: `ip` (PK), `fail_count`, `first_fail_at`, `locked_until`, `updated_at`.

## De dónde vienen los datos

Todo a mano. Cero crons escriben `fg_users` ni `role_permissions`.
Sobre `user_sessions` sí escribe uno: **`/api/cron/cleanup-sessions` (02:30 UTC)** — ver §4.
`/api/admin/switch-vendedores` sale **en vivo** de Switch (una sesión por empresa de catálogo,
cacheada 15 min).

## Las reglas que ya están fijadas

- 🔴 **No se puede quedar el sistema sin ningún admin activo.** `wouldLeaveNoActiveAdmin()` bloquea
  tanto quitarle el rol admin al único admin activo (PUT) como desactivarlo (PATCH), con mensajes
  propios. `src/app/api/admin/users/route.ts`.
- 🔴 **La contraseña es ÚNICA en todo el sistema, incluidos los inactivos.** El login es
  *password-only*: dos usuarios con la misma contraseña lo hacen ambiguo y uno entraría con la
  identidad y el rol del otro. `passwordInUse()` compara con bcrypt contra **todas** las filas,
  probando el texto exacto y su versión en minúsculas.
- 🔴 **El login rechaza el caso ambiguo** en vez de elegir uno: si dos usuarios activos matchean,
  se responde el mismo 401 genérico que si no existiera ninguno.
- 🔴 **Desactivar a alguien revoca sus sesiones vivas en la misma llamada.** El middleware valida
  `user_sessions.revoked`, **no** `fg_users.active`: sin esa revocación, un usuario desactivado con
  sesión abierta seguiría entrando. `PATCH /api/admin/users`.
- 🔴 **El hash bcrypt NUNCA sale al cliente.** El GET y el POST enumeran las columnas y `password`
  no está en la lista.
- **`role` y `modulos_override` se validan en el servidor** contra `SYSTEM_ROLE_KEYS` y
  `ALL_MODULE_KEYS` (`validateRoleAndModulos`), no solo en el `<select>`.
- **Contraseña ≥ 8 caracteres; nombre ≥ 3 y único** (mensajes: «Ya existe un usuario con ese
  nombre»).
- 🔴 **El guard de la pantalla es `moduleKey: "admin"` y no se toca.** Cambiarlo a `"usuarios"`
  abriría Usuarios **y** Data Health a quien tenga esa key en su `modulos_override`.
  Candado: `src/__tests__/lib/data-health-dentro-de-usuarios.test.ts`, que mide las dos direcciones
  (nadie gana Data Health; nadie pierde lo que tenía).
- **`modulos_override` vacío se guarda como `null`**, no como `[]` — `[]` heredaría del rol por
  accidente en unos lugares y bloquearía en otros.

## Con qué conecta

### Qué lee de otros módulos

- `ALL_MODULES` (`src/lib/modules.ts`) → las casillas de permisos personalizados. Fuente única.
- `MARCAS_UI` (`src/lib/catalogo/marcas-ui.ts`) → las marcas del mapeo de vendedor de Switch.
  🩸 Antes era una lista escrita a mano con dos entradas, y cuando se encendió Tommy **ningún pedido
  de Tommy podía salir a Switch** porque no había forma de asignarle vendedor.
- La API de Switch, en vivo, para listar vendedores por empresa.

### Quién lee lo suyo

| Consumidor | Qué toma |
|---|---|
| **Login** (`POST /api/auth`) | `fg_users` entera (activos) para comparar bcrypt |
| **Reanudar sesión** (`GET /api/auth/sesion`) | `fg_users` por `id`, para releer rol y módulos FRESCOS |
| **Middleware** | `user_sessions.revoked` en cada request |
| **Saludo del home** (`/api/auth/perfil`) | `fg_users.nombre_completo` |
| **Todo el menú** | `role_permissions.modulos` → `fg_modules` en sessionStorage |
| **Checkout de catálogos** | `fg_user_switch_vendedor` para poner el vendedor del pedido |
| **CXC** | `associated_company` acota qué clientes ve un vendedor (el servidor la re-aplica en `/api/cxc/aging`) |
| **Guías** | `USER_CONFIG` en `sesion-payload.ts` marca `edwin` como `guiasReadonly` — **por NOMBRE, hardcodeado** |
| **Backup** | `fg_users` sin password + `fg_users_auth` con los hashes, en archivos separados |

### Qué se rompería

- Renombrar a alguien en `fg_users.name` **rompe el vínculo con sus sesiones**: `user_sessions` se
  relaciona por `user_name`, no por id. Sus sesiones vivas quedarían huérfanas —
  «Revocar todas» y el PATCH de desactivar dejarían de encontrarlas.
- Meter una key inexistente en `modulos_override` → esa persona pierde el módulo en silencio
  (`fgModulesIncluye` no lo encuentra). La API lo previene; un `UPDATE` a mano no.
- Vaciar `role_permissions.modulos` de un rol → cae al fallback `getDefaultModulesForRole()`, que
  para no-admin devuelve los módulos cuyo `roles[]` incluye ese rol.

## Por qué está así

| Decisión | Cita / fecha / medición |
|---|---|
| **Data Health deja de ser módulo suelto y pasa a ser la 2ª pestaña de Usuarios** | 13-ago-2026. Daniel pidió **menos módulos en el menú** y aprobó esa mudanza concreta. Es mudanza, no recorte: la pantalla es la misma, entera |
| **El grupo «Administración» NO se disuelve** aunque le quede una sola ficha | tres razones escritas en `modules.ts`: (a) es admin-only, así que mudar Usuarios a «Operación» lo metería entre los 13 módulos que usan todos los días secretaria/bodega/vendedor/contabilidad — no lo acerca, lo entierra; (b) borrar el grupo rompe `/g/administracion` y encadena el redirect viejo `/g/sistema` a una URL muerta; (c) lo que se pidió fue menos módulos, y eso ya está: el grupo pasó de 2 fichas a 1 |
| **El guard sigue siendo `moduleKey: "admin"`** | `"admin"` no es una key del catálogo, así que solo `role === "admin"` la satisface. Cambiarlo a `"usuarios"` abriría la pantalla a quien tenga esa key en su `modulos_override` |
| **El login es solo contraseña, sin usuario** | decisión heredada de las contraseñas por rol; su consecuencia obligada es la **unicidad global de contraseña** y el rechazo del caso ambiguo |
| **Multi-dispositivo: un login NO revoca los anteriores** | *«así puede estar activo en varios dispositivos a la vez (iPhone + escritorio + PWA), cada uno con su propia ventana deslizante de 7 días, sin que un login expulse a los otros»* (`/api/auth/route.ts`). La revocación queda disponible **a mano**, aquí, para un dispositivo perdido |
| **La lista de marcas del mapeo de vendedor se DERIVA, no se escribe** | 6-ago-2026, 🩸: estaba a mano con dos entradas y al encender Tommy nadie agregó la tercera. El resultado no era un selector incompleto: era que **ningún pedido de Tommy podía salir a Switch**. Daniel lo vio con un pedido de $1.584,00 armado y el botón apagado, diciendo «No tienes vendedor de Switch asignado» — sin forma de asignarlo |
| **Los dos botones de la tarjeta pasaron a 44×44 con 8 px de separación** | auditoría 390×844: eran 26×26 pegados a 4 px, **y uno es destructivo** — el peor combo del sistema en iPhone |
| **Sin `<h1>` visible** | la barra sticky (celular), el breadcrumb (escritorio) y la pestaña ya dicen «Usuarios». Un h1 encima sería el nombre 3 veces. Queda `sr-only`, y es el ÚNICO h1 del documento — por eso Data Health perdió el suyo |
| **El `?tab=` desconocido cae en «usuarios», nunca en blanco** | Radix no dibuja nada si el `value` no tiene trigger. Misma convención que `/ventas`, `/admin` y el Depurador |
| **La expiración de sesión vive SOLO en el cron** | hallazgo de jul-2026: `user_sessions` no tiene `expires_at` y la cookie no lleva claim de expiración, así que **del lado del servidor una sesión no vencía nunca**. Medido ese día: 1.190 filas, 259 sin revocar para 9 usuarios (daniel 73, Angela 66), y solo 3 usadas en 24 h |
| **Con el pase vigente se entra directo** | 3-sep-2026. Daniel: **«Aprobado»**. Medido: **453 de 468 logins en 30 días** eran de gente con sesión viva (Bodega 81/81, Daniel 146/147; gap mediano entre logins del mismo usuario: **2,3 h**) |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **Data Health como módulo propio** (`/admin/data-health`, ficha en el grupo Administración) | 13-ago-2026 | Daniel pidió menos módulos. La dirección **sigue viva** por un redirect 307 en `next.config.js` — no con un `page.tsx` que redirige, para que ni siquiera se descargue la pantalla equivocada. Está ahí porque vive en marcadores **y porque `integrity-check-run.ts` mandó ese enlace a Telegram durante meses** |
| **Contraseñas por rol** (tabla `role_passwords` + variables de entorno) | Sprint 1E | Se retiraron **para recuperar la trazabilidad**: todo login tiene que matchear una fila con nombre en `fg_users`. ⚠️ `CLIENTE_PASSWORD` y `VENDEDOR_PASSWORD` quedaron en `.env.local` |
| **Contraseñas en texto plano** | migración completada | Hoy el login **exige bcrypt** y salta con warning cualquier fila que no lo sea |
| **Contraseña mínima de 3 caracteres** | abril-2026 → hoy 8 | El changelog de abril la había bajado a 3; la API actual exige 8 en el alta y en el cambio |
| **El rate limit en un `Map` en memoria** | jul-2026 | **Inefectivo en serverless**: cada invocación arranca con el Map vacío. Se mudó a la tabla `login_attempts` + RPC |
| **`pathname.includes(".")` como criterio de asset estático** en el middleware | — | Era un **bypass de autenticación**: una ruta de API o página con un punto en un parámetro se servía sin validar sesión. Hoy es `STATIC_ASSET_RE`, que exige que el path **termine** en una extensión conocida |
| **Face ID (WebAuthn)** | implementado y removido | *«too unstable on serverless (DER/P1363 format issues, challenge storage in memory)»* (`docs/historico/superado.md`) |
| **El `DELETE /api/auth` fire-and-forget de los tres botones «Salir»** | 3-sep-2026 | Con la reanudación de sesión, un DELETE que no se espera **puede perder la carrera** y volver a meter al usuario. Los tres ahora hacen `await` |
| **Los 9 checks del CSV legacy de Data Health** | 5-jun-2026 (última corrida) | CXC pasó a `switch_estadocuenta`; los checks de `cxc_rows`/`ventas_raw`/`cxc_uploads` quedaron sin objeto. **No se borraron de la tabla**: se ocultan con `LIVE_CHECK_NAMES`, que es filtro de presentación |
| **`sync-mayor` y el módulo del mayor contable** | 13-ago-2026 | Daniel: ***«y entonces borra Mayor contable en el sistema»***. Relevante aquí porque era **un login web menos por día contra Switch, y cada login puede expulsar a Daniel del panel** |

## Cuánto se usa

⚠️ **Ninguna acción de este módulo se escribe en `activity_logs`**: no hay evento de alta de usuario, ni de edición, ni de revocar sesión. Lo que se puede medir son las **filas que el módulo escribe**.

| Señal | Medida (4-sep-2026) |
|---|---|
| Usuarios creados, en total | **11**. El último, **david**, el 27-ago-2026 |
| Ritmo de altas | 6 el 27-mar-2026 (el arranque), luego 1 en abril (edwin), 1 en abril (alberto), 2 en julio (jennifer, rodrigo), 1 en agosto (david) — **≈ una cada 5 semanas** |
| Última edición de un usuario (`updated_at`) | **27-ago-2026** (david). Antes: Angela el 13-ago, andrea el 6-ago, tres el 17-jul |
| Usuarios desactivados alguna vez | **0** — las 11 filas están en `active = true` |
| Sesiones revocadas a mano | no medible: el cron y la pantalla escriben la misma columna `revoked` sin distinguirse. Lo que **sí** se mide: **860 de 1.039 sesiones están revocadas** y **179 vivas** |
| Personas con acceso a esta pantalla | **2**: `daniel` (is_owner) y `alberto` |
| Actividad de esos 2 | `daniel` entra todos los días (última sesión hoy, 40 vivas); `alberto` también entró hoy, con **1 sola sesión viva de 15 totales** |
| Data Health — corridas del cron | **1 por día**, todas dentro de la ventana **12:00–12:57 UTC** en los últimos 90 días |
| Data Health — clics en «Correr checks ahora» | **sin rastro medible**: no se loguea, y las 90 corridas del trimestre caen todas en la ventana del cron. En su lugar se midió que **no hay ninguna corrida fuera de esa ventana** |
| Data Health — checks en `critical` en los últimos 90 días | **0**. La última fila `critical` de un check vivo no existe; la única `critical` de la tabla es `cxc_fecha_null` del 13-may-2026, un check ya retirado |

**Lectura llana:** Usuarios se abre para dar de alta a alguien (una vez cada mes y pico) y para mirar quién está conectado. Data Health lleva 90 días en verde y su valor está en el aviso del home, no en la visita.

## Qué papeles y Excel produce

🔴 **Ninguno.** Ni PDF, ni Excel, ni correo. Es el único módulo de este documento que no genera un solo archivo.

Lo único que sale de aquí hacia afuera:

| Salida | Cuándo | Quién la recibe |
|---|---|---|
| 🔧 **SISTEMA** por Telegram: la alerta de checks `critical` de Data Health | solo si `runAllChecks()` devuelve al menos un `critical` (`src/lib/integrity-check-run.ts`, `buildCriticalAlert`) | el chat privado de Daniel |
| El aviso en el **home** (banda roja o ámbar con enlace directo a `?tab=data-health`) | al entrar, solo para admin, si hay `critical` o `warning` | Daniel o alberto, en pantalla |
| La **contraseña** que el admin escribe | se la dicta a la persona; el sistema no la manda por ningún canal | — |

⚠️ Y una copia que sí sale del sistema, aunque no por esta pantalla: **`fg_users_auth.ndjson.gz`** (los hashes bcrypt) viaja en el backup diario a Supabase Storage y a Cloudflare R2, en archivo separado del resto de la ficha del usuario.

## Cómo probarlo a mano

**A) Dar de alta a alguien y que pueda entrar:**
1. Entra como Daniel → menú → **Administración** → **Usuarios**.
2. **«Nuevo Usuario»** → Nombre (mínimo 3 letras) → Contraseña (mínimo 8) → elige el Rol → **Guardar**.
3. **Qué debería pasar:** toast «Usuario creado» y la tarjeta aparece en la grilla, con el punto verde en «Activo» y **«Nunca ha entrado»**.
4. **Dónde confirmar:** abre una ventana de incógnito, escribe **solo esa contraseña** en la pantalla de entrada y toca **Ingresar**. Tiene que entrar y ver **exactamente** los módulos de su rol.
5. Vuelve a Usuarios, despliega **«Sesiones activas»**: ahí está su fila con su IP y «ahora».
6. ⚠️ Si al guardar dice **«Esa contraseña ya está en uso, elige otra»**, no es un error: es el candado que impide que dos personas entren con la misma llave.

**B) Que desactivar corte el acceso de verdad (no solo el próximo login):**
1. Con esa persona **con la sesión abierta** en la otra ventana, vuelve a Usuarios y toca el botón de **Desactivar** en su tarjeta. Confirma.
2. **Qué debería pasar:** toast «Usuario desactivado» y el punto pasa a gris.
3. En la otra ventana, recarga cualquier pantalla. **Tiene que rebotar a la pantalla de contraseña**, no seguir navegando.
4. **Dónde confirmar:** en «Sesiones activas» su fila ya no debe aparecer entre las vivas.
5. ⚠️ Si sigue adentro, el paso que revoca las sesiones al desactivar se rompió — y eso significa que un usuario despedido sigue entrando hasta 14 días.

**C) Que no te puedas dejar afuera a ti mismo:**
1. Con **un solo admin activo** en el sistema, intenta desactivarlo o cambiarle el rol.
2. **Qué debería pasar:** el sistema lo rechaza con **«No puedes desactivar al único administrador activo.»** o **«No puedes quitar el rol de administrador al único admin activo.»**

**D) Que el pase vigente entre directo (lo nuevo del 3-sep):**
1. Entra con contraseña. Cierra la pestaña **sin tocar «Salir»**.
2. Vuelve a abrir la app. **Qué debería pasar:** se ve solo el logo un instante y entras a tu pantalla de siempre, **sin pedir contraseña**.
3. Ahora toca **«Salir»** y vuelve a abrir. **Qué debería pasar:** ahora **sí** pide la contraseña.
4. **Dónde confirmar:** en «Sesiones activas», la sesión de la que saliste ya no está.

**E) Que Data Health esté mirando:**
1. Pestaña **Data Health** → **«Correr checks ahora»**.
2. **Qué debería pasar:** toast «Listo. 7 checks corridos en Xms.» y los cuatro KPI se actualizan. Con todo sano: **OK 7**, el resto en 0.
3. Toca cualquier fila: el modal tiene que explicar el check en castellano y decir **«Qué hacer»**.
4. **Dónde confirmar que quedó guardado:** el punto de **hoy** en «Historial 30 días» pasa de gris («Sin corrida») a verde.

## Qué lo rompe

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **`SESSION_SECRET` desaparece o cambia** | 🔴 **Todo el mundo afuera, al instante.** `verifySession` devuelve `null` para cualquier cookie y `signSession` lanza: no se puede ni entrar ni reanudar | Todos rebotan a la pantalla de contraseña; el login responde 500 |
| **Supabase devuelve 5xx sostenido** | El middleware **falla OPEN**: la cookie firmada pasa sin comprobar la revocación. Una sesión revocada a mano seguiría viva durante el outage | Solo en Sentry. No hay alarma de Telegram para esto |
| **Faltan las env de Supabase en el middleware** | **Fail CLOSED**: sesión rechazada, todos afuera | Sentry (`error`) + todos a la pantalla de contraseña |
| **El cron `cleanup-sessions` (02:30 UTC) no corre** | 🔴 **Ninguna sesión vence, del lado del servidor.** El único control que queda es el `maxAge` de la cookie en el navegador — un control del CLIENTE, que quien se quede con el valor de la cookie ignora. Además `switch_sync_log` deja de podarse y los candados de sync atascados solo los suelta la reconciliación | Está en `CRONS_FAIL_CLOSED`: a las 26 h el watchdog manda 🔧 SISTEMA. Y este cron **sí** alerta por Telegram cuando falla, porque **nadie lo re-ejecuta** |
| **El cron `integrity-check` (12:00 UTC) no corre** | Data Health se queda con el dato de ayer. **Su valor real es el aviso**: sin la corrida, un dato corrupto no se detecta | El punto del día queda gris («Sin corrida») en el mapa de 30 días; el heartbeat envejece y a las 26 h avisa el watchdog |
| **Alguien renombra a un usuario en `fg_users.name`** | 🔴 **Sus sesiones vivas quedan huérfanas**: `user_sessions` se relaciona por nombre, no por id. «Revocar todas» y el PATCH de desactivar dejan de encontrarlas | Nada lo dice. La sesión sigue pasando el middleware |
| **`role_permissions` no responde** | `resolverModulos` cae a `getDefaultModulesForRole(role)` — los módulos cuyo `roles[]` incluye ese rol | Silencioso y **normalmente correcto**; pero un override guardado en la tabla se pierde en esa sesión |
| **Una migración de módulos no se aplica** | El módulo nuevo no aparece en el menú del rol destino hasta que corra. Es la razón de ser de `MODULO_HEREDA_PERMISO_DE` | La ficha simplemente no está. Daniel lo ve como «no se hizo» |
| **Una de las dos vistas de vigilancia de Data Health desaparece** (`switch_estadocuenta_tipos_sin_clasificar`, `*_dias_anomalo`) | El check pasa a `warning` con **«El check no pudo correr»** — nunca a `critical`, a propósito | El modal lo dice con una banda roja; el KPI de WARNING sube |
| **`switch_estadocuenta` se queda sin sincronizar** | El check `last_upload_age_cxc` sube de días: **≥7 → WARNING, >14 → CRITICAL** → 🔧 SISTEMA | Es el único check que vigila frescura de Switch desde aquí |
| **Switch cambia el formato de un reporte** | Data Health **no lo ve directamente** — sus siete checks miran tablas, no a Switch. Lo que sí ve es la **consecuencia**: un tipo de comprobante nuevo (`aging_tipos_sin_clasificar` / `ventas_tipos_sin_clasificar`) o un atraso de sync (`last_upload_age_cxc`) | Ver §10: la primera línea de defensa contra un cambio de Switch es `switch_sync_log`, no Data Health |
| **`/api/admin/sessions` con más de 100 sesiones** | El chip «Todas» miente por omisión (`.limit(100)`) | No se nota: la lista se ve completa |

## Lo que sobra o no cuadra

1. 🔴 **El desplegable de Rol solo ofrece 5 de los 7 roles.** Faltan `gerente_acs` y
   `gerente_boston`. Consecuencia medida en el código: al editar a **jennifer** o a **david**, el
   `<select>` recibe un `value` que no tiene `<option>` y **se muestra vacío**; si el admin lo toca,
   solo puede bajarlos a uno de los cinco. Guardar sin tocarlo conserva el rol (el estado `uRole`
   sigue siendo el original), pero la pantalla miente sobre qué rol tiene esa persona.
   La lista completa ya existe en `SYSTEM_ROLES` (`src/lib/modules.ts`) y el servidor la acepta.
2. 🔴 **`nombre_completo` y `email` no se pueden editar desde la pantalla.** `nombre_completo`
   alimenta el saludo del home y está en 4 de 11 filas; `email` en 3 y **no lo lee nadie**. Las 7
   filas se cargaron a mano en la base.
3. 🔴 **`is_owner` tampoco tiene interfaz.** Viaja hasta `sessionStorage.fg_is_owner` y lo devuelve
   `useAuth`, pero solo se puede poner con SQL.
4. **`/api/admin/sessions` tiene `.limit(100)`** ordenando por `last_seen desc`. Con 1.039 filas,
   el chip **«Todas»** no puede mostrar más de 100 — y no lo dice.
5. 🔴 **Tres sesiones de scripts de medición viven en `user_sessions` con rol `admin`**, una de
   ellas **sin revocar** (`medicion-t203b`, `last_seen` 27-ago-2026). Sus `user_name` no existen en
   `fg_users`, así que ni el PATCH de desactivar ni el guard de admins activos las alcanzan: quien
   tenga esa cookie es admin hasta que el cron la revoque por inactividad (14 días → alrededor del
   10-sep-2026).
6. **`role_permissions.activo` no lo lee nadie.** Poner un rol en `false` no hace nada.
7. **La medición que sostiene dos comentarios importantes ya no es cierta.** Tanto
   `src/app/admin/usuarios/page.tsx` como `src/__tests__/lib/data-health-dentro-de-usuarios.test.ts`
   afirman que *«Angela (secretaria) tiene `usuarios` en `modulos_override`»* (medido 13-ago-2026).
   Hoy su override es `[directorio, marketing, cheques, caja, comisiones, guias, packing-lists,
   reclamos, catalogos, cargar, cxc]` — **sin `usuarios`**. El razonamiento (no aflojar el guard)
   sigue siendo bueno; el ejemplo con el que se defiende ya no existe.
8. **El acento de color de la pantalla es el de CXC.** `getModuleKeyFromPath` resuelve
   `/admin/usuarios` con `pathname.startsWith("/admin")` → `"cxc"` (azul). No hay entrada de color
   para `usuarios`.
9. **`activity_logs` crece sin techo y sin lector.** 2.877 filas, ninguna pantalla, ningún cron de
   poda (a diferencia de `switch_sync_log`, que sí tiene `podar_switch_sync_log`).

---

# 3. Data Health (`/admin/usuarios?tab=data-health`)

## Qué es

El tablero que dice si los datos están sanos: siete chequeos que corren todos los días a las
12:00 UTC contra cheques, préstamos, la cartera y las ventas, y avisan por Telegram **solo** si
alguno sale `critical`. Fue módulo suelto hasta el 13-ago-2026; hoy es la **2ª pestaña de
Usuarios** y `/admin/data-health` redirige.

## Quién entra

**Solo `admin`**, por partida triple: el guard de la página (`moduleKey: "admin"`), la condición
`esAdmin` que monta la pestaña, y `requireRole(req, ["admin"])` en `/api/admin/data-health`.
`/api/cron/integrity-check` acepta `Bearer CRON_SECRET` **o** cookie de sesión con `role === "admin"`
(es el botón «Correr checks ahora»).

## La pantalla

- Botón **«Correr checks ahora»** (arriba a la derecha). Llama a `/api/cron/integrity-check` y
  responde con un toast: «Listo. N checks corridos en Xms.»
- **Cuatro tarjetas de KPI**, una por severidad, con su conteo y su explicación en castellano:
  - **CRITICAL** — «Dato posiblemente incorrecto (afecta CXC/Ventas). Revisar ahora.»
  - **WARNING** — «Posible problema; monitorear. Sin acción inmediata.»
  - **INFO** — «Informativo o condición de borde. Revisar sin urgencia.»
  - **OK** — «Sin problemas detectados.»
- **«Estado actual por check»** — tarjetas hasta `lg`, tabla desde `lg`. Columnas: **Check** ·
  **Tabla** · **Severity** · **Rows** · **Último check**. Ordenado por severidad (peor primero) y
  luego alfabético.
- **«Historial 30 días»** — una cuadrícula de puntos por check. Hasta `xl` los 30 puntos
  **envuelven** (`flex-wrap`); desde `xl` es la tabla con el número de día. Cada punto lleva su
  fecha y severidad en el `title`. Leyenda: OK · INFO · WARNING · CRITICAL · **Sin corrida**.
- **Modal de detalle** (al tocar una fila): severidad, «N rows afectados», una banda roja si el
  check **no pudo correr**, la explicación en lenguaje natural + **«Qué hacer»**, y el JSON de
  `details`. Cierra con clic fuera y Escape.

## Los datos

### `data_integrity_checks` — 821 filas

Grano: **una fila por (check, corrida)**. **Insert-only, nunca se borra ni se actualiza.**
Columnas: `id`, `check_name`, `table_name`, `severity` (ok/info/warning/critical),
`rows_affected` (int, default 0), `threshold_exceeded` (bool), `details` (jsonb), `checked_at`.

Los **siete checks vivos** (`LIVE_CHECK_NAMES`, `src/lib/integrity-checks.ts`), con su estado
medido en la última corrida (4-sep-2026 12:01 UTC) — **los siete en `ok`**:

| `check_name` | Tabla | Qué mira | Umbrales | Estado hoy |
|---|---|---|---|---|
| `cheques_criticos_null` | `cheques` | cheques vivos con `monto` o `fecha_deposito` nulos | >0 → warning | ok, 0 |
| `prestamos_saldo_anomalo` | `prestamos_movimientos` | empleados con saldo < −$100 (pagaron más de lo prestado) | >0 → info | ok, 0 |
| `last_upload_age_cxc` | `switch_estadocuenta` | días desde el último `synced_at`, **solo las 6 del grupo** | ≥7 → warning, >14 → critical | ok, 1 día |
| `aging_tipos_sin_clasificar` | `switch_estadocuenta` | tipos de comprobante fuera de las whitelists de signo del aging | tipo nuevo → warning; **con saldo ≠ 0 → critical** | ok, 0 |
| `ventas_tipos_sin_clasificar` | `switch_facturas` | tipos de venta que ningún reporte sabe contar | igual que el anterior | ok, 0 |
| `switch_facturas_continuidad` | `switch_facturas` | empresa-mes interior sin facturas (el tablero lo cuenta como $0) | >0 huecos → warning | ok, 0 |
| `aging_dias_anomalo` | `switch_estadocuenta` | filas con `dias` NULL o negativo y saldo ≠ 0 | >0 → warning | ok, 0 |

Historia: `cheques_criticos_null`, `last_upload_age_cxc` y `prestamos_saldo_anomalo` corren desde
el 13-may-2026 (114 corridas); los tres de aging/continuidad desde el 31-may (98);
`ventas_tipos_sin_clasificar` desde el 26-ago (10).

**Nueve `check_name` legacy siguen en la tabla y NO se muestran** — el filtro por
`LIVE_CHECK_NAMES` los oculta a propósito (eran del CSV retirado): `cxc_fecha_null` (última corrida
13-may-2026, quedó en **critical con 25 filas**), `cxc_fecha_emision_null`,
`cxc_fecha_vencimiento_null`, `cxc_dias_vencidos_sin_fecha`, `cxc_sin_venta_correspondiente`
(warning, 98), `cxc_uploads_zombie`, `last_upload_age_ventas` (warning, 12),
`upload_desync_cxc_ventas` (warning, 7), `ventas_cliente_vacio`. Todos con última corrida el
5-jun-2026. La tabla queda **INTACTA** — es archivo, el filtro es solo de presentación.

## De dónde vienen los datos

| Cron | Hora UTC | Qué hace |
|---|---|---|
| `/api/cron/integrity-check` | **12:00** | corre `runAllChecks()`, persiste con `persistCheckResults()`, y manda 🔧 SISTEMA **solo si hay `critical`** |

Si falla: 500, **sin heartbeat** (el watchdog lo verá stale), se anota en `cron_email_errors`
**sin Telegram inmediato** — es colateral de la reconciliación, que lo re-ejecuta.
El aviso proactivo del **home** (solo admin) lee `/api/admin/data-health` al entrar y pinta una
banda roja/ámbar con enlace directo a `?tab=data-health`.

## Las reglas que ya están fijadas

- 🔴 **`LIVE_CHECK_NAMES` es la fuente única** de qué se muestra, y **tiene que estar en sync con
  `runAllChecks`**. Hay un guard en el runner que avisa por consola si un check emite un nombre
  fuera de la lista (el dashboard lo ocultaría).
- 🔴 **Un check que NO PUDO CORRER es `warning`, nunca `critical`** (`checkError()`): confundir
  «data corrupta» con «monitor roto» es lo que hace que nadie mire el tablero. Y el modal lo dice
  con todas las letras: «El check no pudo correr.»
- 🔴 **`last_upload_age_cxc` mira SOLO las 6 del grupo** (`.in("empresa_key",
  CXC_GRUPO_EMPRESA_KEYS)`). Sin ese filtro, un sync de Boston taparía un atraso real del grupo y
  el vigía quedaría en verde justo cuando hay que mirarlo. Boston va ~13 h más atrasada, así que el
  defecto sería **latente**.
- **Telegram solo con `critical`.** Si todo pasa, silencio total.
- **La tabla es insert-only**: el historial de los checks retirados se conserva y se filtra al
  mostrar, no se borra.

## Con qué conecta

**Lee de:** `cheques` · `prestamos_movimientos` · `switch_estadocuenta` (+ las vistas
`switch_estadocuenta_tipos_sin_clasificar` y `switch_estadocuenta_dias_anomalo`) ·
`switch_facturas` (+ `switch_facturas_tipos_sin_clasificar`) · `empresasConFacturas()`.

**Lo suyo lo lee:** el **home** (banda de aviso para admin) · el **canal 🔧 SISTEMA** ·
`GET /api/admin/data-health`. Nada más.

**Qué se rompería:** agregar un check sin sumarlo a `LIVE_CHECK_NAMES` → corre, se guarda, y el
tablero **no lo muestra nunca** (solo un `console.warn`). Borrar una de las dos vistas de
vigilancia (`*_tipos_sin_clasificar`, `*_dias_anomalo`) → ese check pasa a `warning` permanente con
«el check no pudo correr».

## Por qué está así

> Las decisiones compartidas con Usuarios (la mudanza a pestaña, el grupo que se queda, el guard
> `moduleKey: "admin"`, el redirect de `/admin/data-health`) están en §2 › *Por qué está así*.
> Aquí van las que son solo de esta pantalla.

| Decisión | Cita / fecha / medición |
|---|---|
| **Telegram SOLO con `critical`. Si todo pasa, silencio total** | es la regla del canal 🔧 SISTEMA aplicada al pie de la letra: *«que el sistema se repare es el sistema funcionando bien, no un incidente»*. Un resumen diario de «todo bien» sería exactamente el ruido que ese canal existe para no tener |
| **Un check que no pudo correr es `warning`, nunca `critical`** | *«eso confunde "data corrupta" con "monitor roto"»* (`checkError`, `src/lib/integrity-checks.ts`). Queda visible en el tablero para que se arregle, pero **no dispara alerta** |
| **`last_upload_age_cxc` mira solo las 6 del grupo** | 12-ago-2026. Sin el filtro, este check pregunta «¿hace cuánto se actualizó el CXC?» y le contesta la fila más nueva de CUALQUIERA: un sync de Boston taparía un atraso real del grupo. Medido ese día: **Boston va 13 h más atrasada que el grupo**, o sea que el defecto era **latente — el peor tipo de defecto para un vigía** |
| **`ventas_tipos_sin_clasificar` nació el 26-ago-2026 copiando el guard de la cartera** | 🩸 en mayo-2025 Switch estrenó el tipo «Transacción» (reemplazó a «Tiquete»). Alguien lo agregó a tiempo y no se perdió una venta — **por suerte**. Un tipo nuevo cae al `ELSE 0` del CASE de ventas y esa plata **desaparece del tablero sin un solo error**. La cartera tenía el guard desde mayo-2026; ventas no tenía equivalente |
| **Los checks del CSV legacy se ocultan, no se borran** | `data_integrity_checks` es **insert-only**; el historial queda como archivo y `LIVE_CHECK_NAMES` es filtro de presentación |
| **La explicación de cada check está escrita para un director, no para un ingeniero** | `SEVERITY_MEANING` y `CHECK_INFO` dan qué significa **y qué hacer**, en castellano |
| **El mapa de 30 días ENVUELVE en vez de correr el corte** | 🩸 medido el 30-jul-2026: era el peor arrastre de la pantalla — **448 px en iPhone y 228 px en iPad**, de los 30 días se veían 7. **Y a 1024 px todavía quedaban 38 px**, así que el corte `lg` no alcanzaba. *«el corte no tiene por qué ser el mismo en toda la app, se mide pantalla por pantalla»*: no es una tabla de datos, es una cuadrícula de estado, así que se la deja envolver y el arrastre es 0 por construcción |
| **La lista de checks pasa a tarjetas bajo `lg`** | 🩸 medido el mismo día: el `overflow-x-auto` salvaba el dato de ser recortado, pero dejaba **353 px de arrastre en iPhone y 133 en iPad**, con **Severity y Rows —el dato por el que existe la página— fuera de la pantalla** |
| **`maxDuration = 300` en el cron** | los 60 s por defecto mataban al **único caller humano del sistema**: el botón «Correr checks ahora», que espera la respuesta. No abre sesión de Switch, así que no necesita el techo de 800 s de los crons pesados |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **9 checks del CSV legacy**: `cxc_fecha_null`, `cxc_fecha_emision_null`, `cxc_fecha_vencimiento_null`, `cxc_dias_vencidos_sin_fecha`, `cxc_sin_venta_correspondiente`, `cxc_uploads_zombie`, `last_upload_age_ventas`, `upload_desync_cxc_ventas`, `ventas_cliente_vacio` | última corrida **5-jun-2026** | CXC dejó de vivir en `cxc_rows` y pasó a `switch_estadocuenta` (sync por API). Su integridad la cubren ahora `aging_tipos_sin_clasificar`, `aging_dias_anomalo` y la frescura. **Sus 173 filas siguen en la tabla** y se ocultan con `LIVE_CHECK_NAMES` |
| **`cxc_fecha_null` quedó congelado en `critical` con 25 filas** (13-may-2026) | — | Es el ejemplo de por qué el filtro es de presentación: si se mostrara el historial completo, el tablero tendría un `critical` rojo permanente por un check que ya no describe nada |
| **La alerta de Data Health por CORREO a daniel@** | descrita en la skill `data-integrity` | Hoy los `critical` salen por **Telegram 🔧 SISTEMA** (`enviarSistema`), no por correo. ⚠️ La descripción de la skill quedó vieja |
| **Los `warning` avisando fuera del dashboard** | «tras PR #33» | *«los warnings solo viven en el dashboard»* (comentario en `src/app/home/page.tsx`). El aviso del home sí los muestra, pero en ámbar y sin Telegram |
| **La página `/admin/data-health` con su propio `AppHeader`, `useAuth`, `<h1>` y contenedor** | 13-ago-2026 | Lo pone el shell de Usuarios. El `<h1>` se fue a propósito: la página tiene UNO solo, «Usuarios», y dos h1 en el mismo documento dejan de ser un encabezado |

## Cuánto se usa

Ver §2 › *Cuánto se usa* para el detalle medido. En resumen: **1 corrida por día** (todas entre las 12:00 y las 12:57 UTC en 90 días, o sea **ninguna fuera de la ventana del cron**), **7 checks**, **0 en `critical` en los últimos 90 días**, y **sin rastro medible** de clics en «Correr checks ahora» (esa acción no se loguea).

Historia de la tabla, por check: `cheques_criticos_null`, `last_upload_age_cxc` y `prestamos_saldo_anomalo` llevan **114 corridas** (desde el 13-may-2026); `aging_tipos_sin_clasificar`, `aging_dias_anomalo` y `switch_facturas_continuidad`, **98** (desde el 31-may); `ventas_tipos_sin_clasificar`, **10** (desde el 26-ago). Total en la tabla: **821 filas**, 648 de checks vivos y **173 de los 9 retirados**.

## Qué papeles y Excel produce

🔴 **Ninguno.** No hay export, no hay PDF, no hay correo. Las dos únicas salidas están en §2 › *Qué papeles y Excel produce*: el mensaje 🔧 SISTEMA cuando hay un `critical`, y la banda de aviso del home.

⚠️ El mensaje de Telegram **incluía un enlace a `/admin/data-health`** durante meses (`integrity-check-run.ts`) — es una de las dos razones por las que ese redirect no se puede quitar.

## Cómo probarlo a mano

Ver §2 › *Cómo probarlo a mano* › **(E)**. Y un paso más, para verificar que la alerta funciona sin esperar a que algo se rompa:

1. Abre `https://fashiongr.com/api/cron/integrity-check` con sesión de admin (o con `?secret=<CRON_SECRET>`).
2. **Qué debería pasar:** un JSON con `ok: true`, `summary` (`{total: 7, critical: 0, warning: 0, info: 0, ok: 7}`), `duration_ms`, `alert_sent: false` y el detalle de los 7 checks.
3. `alert_sent: false` con `critical: 0` **es lo correcto**: sin `critical` no se manda nada.
4. **Dónde confirmar que quedó guardado:** vuelve a la pestaña Data Health y recárgala — la columna «Último check» de las 7 filas tiene que decir «ahora».

## Qué lo rompe

Ver §2 › *Qué lo rompe* para las filas de `integrity-check` y de las vistas de vigilancia. Lo específico:

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Se agrega un check y nadie lo suma a `LIVE_CHECK_NAMES`** | El check corre, se guarda en la tabla, y **el tablero no lo muestra nunca** | Solo un `console.warn` en los logs de Vercel, que rotan en 24 h. En pantalla, nada |
| **Se renombra un `check_name`** | El historial de 30 días se parte en dos: el nombre viejo desaparece del tablero (queda fuera de la allowlist) y el nuevo arranca sin puntos | El mapa de 30 días muestra una fila nueva con 29 días grises |
| **Una de las dos vistas de vigilancia desaparece** | Ese check pasa a `warning` permanente con «El check no pudo correr», **nunca a `critical`** | Banda roja en el modal; el KPI de WARNING sube y no baja |
| **`empresasConFacturas()` cambia** | `switch_facturas_continuidad` empieza a reportar huecos de una empresa que nunca tuvo facturas, o deja de vigilar una que sí | Sube `rows_affected` de ese check con `empresas_sin_datos` en el detalle |
| **Switch estrena un tipo de comprobante** | Es justo lo que estos dos checks vigilan: **sin saldo → WARNING** (apareció pero todavía no pesa), **con saldo ≠ 0 → CRITICAL** (ya está distorsionando CXC o las ventas) | 🔧 SISTEMA en la corrida de las 12:00 UTC del día siguiente. Es la red que impide que una venta valga $0 en silencio |
| **`switch_estadocuenta` se congela** (ej. Boston el 19-ago, egresos el 1-sep) | `last_upload_age_cxc` ⚠️ **NO lo vería para Boston**: mira solo las 6 del grupo, a propósito. Para el grupo sí: ≥7 días → WARNING, >14 → CRITICAL | Ver §10 — para un cambio de formato de Switch, la primera señal es `switch_sync_log`, no este tablero |

## Lo que sobra o no cuadra

1. **`data_integrity_checks` crece sin techo y sin poda**: 821 filas y subiendo 7 por día.
   Y desde el 5-sep-2026 **sí está en el backup**.
2. **El `CHECK_INFO` de la pantalla cubre los 7 vivos** pero incluye entradas para checks que ya no
   existen — no: verificado, cubre exactamente los 7. Lo que sí sobra es que
   `switch_facturas_continuidad` explica «Backfill con `scripts/switch-backfill.ts`», una
   instrucción para quien programa dentro de una pantalla que Daniel es el único que abre.
3. **El comentario de `maxDuration` en `/api/cron/integrity-check` dice «6 consultas agregadas
   contra `cxc_rows`, cheques, …»** — `cxc_rows` ya no se consulta (los checks del CSV se
   retiraron) y hoy son 7 checks, no 6.
4. **`threshold_exceeded` se escribe siempre y no lo lee nadie**: ni la API, ni la pantalla, ni el
   Telegram lo usan para decidir.
5. **`total_runs_30d` viaja en la respuesta de la API y la pantalla no lo pinta.**

---

# 4. Entrar al sistema — login, sesión, roles, middleware

## La pantalla de login (`/`)

Un solo campo: **«Contraseña»**. No hay usuario. Autocapitalize apagado, autocorrect apagado,
botón **ver/ocultar** de 44×44, botón **«Ingresar»** («Verificando…» mientras carga), y
**«¿Olvidaste tu contraseña?»** → «Contacta al administrador para restablecer tu contraseña.»
Con `?expired=1` sale además: «Tu sesión expiró. Inicia sesión de nuevo.»

### ⚠️ Lo que cambió hoy (commit `0f6b6bd6`, 3-sep-2026 22:49)

**Con el pase vigente se entra directo, sin escribir la contraseña.**

Medición que lo motivó: **453 de 468 logins en 30 días eran de gente que ya tenía sesión viva**
(Bodega, 81 de 81). La cookie de 7 días estaba bien; lo que se perdía era la identidad, que vivía
solo en `sessionStorage` y el navegador la borra al cerrar la app.

Cómo funciona ahora:
1. Al abrir `/`, y **antes de dibujar el formulario** (solo se ve el logo), el cliente llama
   `GET /api/auth/sesion`.
2. Ese endpoint es **fail-closed en cuatro pasos**: firma HMAC de la cookie → el `sessionToken`
   existe en `user_sessions` y **no está revocado** → **es del mismo `userName`** que dice la cookie
   → el usuario **sigue existiendo y activo** en `fg_users`.
3. Si todo pasa, devuelve el **mismo payload que el login con contraseña** (fuente única:
   `armarPayloadSesion`, `src/lib/sesion-payload.ts`), el cliente rehidrata `sessionStorage` y
   navega a `/home`.
4. Cualquier otra cosa —incluido un error de la base— es **401** y aparece el formulario de siempre.
5. Con `?expired=1` ni se intenta: el middleware acaba de borrar la cookie.

🔴 **El rol y los módulos se releen FRESCOS de la base**, no de la cookie: si a alguien le cambiaron
el rol o lo desactivaron después del login, se refleja al reanudar.
🔴 **No crea sesiones, no toca la cookie, no guarda nada nuevo.** El `maxAge` de 7 días y la
revocación no cambian.

**Y «Salir» ahora revoca de verdad.** Antes era `fetch(..., {method:"DELETE"}).catch(()=>{})` —
fire-and-forget— y solo borraba `sessionStorage`; la cookie de 7 días quedaba viva. Con la
reanudación eso habría vuelto a meter al usuario. Ahora los **tres** botones de salir
(`src/app/home/page.tsx`, `src/components/AppHeader.tsx`, `src/components/Sidebar.tsx`)
**esperan** el `DELETE /api/auth` antes de navegar. Sin red, se sale localmente igual.

Candado: `src/__tests__/lib/sesion-vigente-no-pide-contrasena.test.tsx` (9/9 mutaciones cazadas).

**Efecto medido:** 366 logins en los últimos 30 días; **1 solo en las últimas 24 h**.
Por rol en 30 días: secretaria 110 · bodega 79 · admin 75 · vendedor 40 · contabilidad 31 ·
gerente_acs 26 · gerente_boston 5.

## El login con contraseña (`POST /api/auth`)

1. **Rate limit por IP antes de gastar bcrypt.** Tabla `login_attempts` + RPC
   `register_login_failure` / `clear_login_attempts`: 5 fallos en 15 min → lockout 15 min,
   respuesta **429** con `Retry-After` y el texto «Demasiados intentos fallidos. Intenta de nuevo en
   unos minutos.» **Fail-open** (`src/lib/login-rate-limit.ts`). Reemplazó un `Map` en memoria, que
   en serverless no servía de nada.
2. Trae **todos** los `fg_users` activos y compara bcrypt contra el texto exacto **y** contra su
   versión en minúsculas (por el autocapitalizar del iPhone).
3. Una contraseña que no sea un hash bcrypt (`$2a$` / `$2b$`) se **salta con warning**: el login la
   rechaza.
4. **Cero o más de un match → el mismo 401 genérico** «Contraseña incorrecta» (ver §2).
5. Con un match: arma el payload con `armarPayloadSesion`, genera un `sessionToken` (`randomUUID`),
   **inserta** una fila en `user_sessions` **sin revocar las anteriores** (multi-dispositivo a
   propósito), firma la cookie y registra `logActivity(role, "login", "auth", {userName})`.

## La cookie `cxc_session`

Formato: `base64url(JSON).base64url(HMAC-SHA256(SESSION_SECRET, body))`. El separador `.` no está
en el alfabeto base64url → el parseo es inequívoco.

Payload: `{ role, userId, userName, modules[], isOwner, empresaFilter?, guiasReadonly?,
sessionToken }`.
Atributos: `httpOnly`, `secure` en producción, `sameSite: "lax"`, `path: "/"`,
`maxAge = 7 días`.

Dos implementaciones que comparten secreto y formato: `src/lib/session-cookie.ts` (Node — login,
rutas API, páginas RSC, crons) y `src/lib/session-cookie-edge.ts` (Web Crypto — el middleware).
**Fail-closed:** sin `SESSION_SECRET`, `signSession` lanza y `verifySession` devuelve `null`.
`verifySession` rechaza: sin firma, firma que no coincide (comparación *timing-safe*), payload sin
`role`, y **payload sin `sessionToken`** (defensa en profundidad).

🔴 **La cookie NO lleva claim de expiración** y `user_sessions` **no tiene `expires_at`**. Ver el
cron de limpieza, abajo.

## El middleware (`src/middleware.ts`)

Corre en **todo** salvo `_next/static`, `_next/image` y `favicon.ico`. Orden exacto:

1. **Redirects legacy**, antes del auth check (para que funcionen sin sesión): `/guias?id=X` →
   `/guias/X/imprimir`; `/caja?view=detail&id=X` → `/caja/X`; `/caja?view=print&id=X` →
   `/caja/X/imprimir`.
2. **Paths públicos exactos**: `/` y `/api/auth`.
3. **Prefijos públicos** (26 hoy): `/api/cron/` (llevan `CRON_SECRET`), `/api/health-crons`
   (`HEALTHCHECK_TOKEN`), `/api/diag/` (`CRON_SECRET`), `/api/asistencia/ingest`
   (`ASISTENCIA_INGEST_SECRET`, deliberadamente **distinto** de `CRON_SECRET` porque vive en una PC
   de la oficina), los catálogos y pedidos públicos de las 4 marcas, las galerías con token HMAC de
   marketing y reclamos, `/_next/`, `/icon-`, `/manifest`, `/logo`, `/reebok/`.
4. **Assets estáticos**: solo si el path **TERMINA** en una extensión conocida (`STATIC_ASSET_RE`).
   🩸 Antes era `pathname.includes(".")`, y eso era un **bypass**: cualquier ruta de API o página
   con un punto en un parámetro se servía sin validar sesión.
5. Sin cookie → **401** si es `/api/`, **redirect a `/`** si es una página.
6. Firma inválida o sin `sessionToken` → borra la cookie y **401 / redirect a `/?expired=1`**.
7. **Valida el token contra `user_sessions`** por REST directo (compatible con Edge):
   - Sin las env de Supabase → **fail CLOSED** (sesión rechazada) + Sentry.
   - Respuesta **2xx con 0 filas** → revocada o inexistente → desloguear. Es definitivo.
   - **5xx, red caída o excepción** → **fail OPEN**: la cookie ya está firmada y verificada, así que
     un blip de la base no puede desloguear a nadie. Exposición acotada: durante el outage una
     sesión revocada a mano podría seguir viva. Queda en Sentry.
8. **`touchSession`** — `PATCH last_seen`, fire-and-forget, en **cada** request.
9. **Auto-refresh de la cookie**: se re-emite con `maxAge` de 7 días **en cada request**. Es una
   ventana deslizante, no un vencimiento fijo.

## La expiración — vive SOLO en el cron

`/api/cron/cleanup-sessions`, **02:30 UTC**, una sola pasada, cuatro pasos + un barrido.
Constantes puras en `src/lib/session-retention.ts`; el clasificador `clasificarSesion()` es el
espejo en TypeScript de lo que hacen las queries (incluido que `NULL < fecha` es falso en SQL).

| Orden | Paso | Regla |
|---|---|---|
| 1º | **Borrar** | `revoked = true AND last_seen < now()−90d` — deja 3 meses de rastro de auditoría |
| 2º | **Revocar por inactividad** | `revoked = false AND last_seen < now()−14d` — 14 = el doble del `maxAge` de 7 días, así no desloguea a nadie que todavía pudiera estar usando la app |
| 3º | **Revocar por antigüedad** | `revoked = false AND created_at < now()−90d` — tope duro; sin esto una cookie robada se renueva sola para siempre |
| — | Soltar candados de sync atascados | `barrerRunningAtascados()`, **no fatal** |
| — | Podar `switch_sync_log` | RPC `podar_switch_sync_log(90)`, **deliberadamente no fatal**: no suma a `errores`, no cambia el status HTTP, no afecta el heartbeat |

🔴 **El DELETE va PRIMERO a propósito.** Si se revocara antes, una sesión inactiva desde hace más de
90 días se revocaría y se borraría en la MISMA pasada, sin dejar ni un día del rastro que el paso 1
promete.

Si algún paso de sesiones falla: **500, sin heartbeat**, `logCronError` **con** Telegram — este cron
no tiene quien lo re-ejecute (la reconciliación no lo cubre) y un fallo silencioso dejaría las
sesiones sin expirar, que es exactamente el agujero que vino a cerrar.

Candado: `src/__tests__/lib/cleanup-sessions.test.ts`.

## Los guardas de las rutas

| Helper | Archivo | Qué hace |
|---|---|---|
| `getSession(req)` | `src/lib/require-auth.ts` | verifica y parsea la cookie; `null` si falla |
| `requireAuth(req, roles?)` | `src/lib/require-auth.ts` | devuelve `null` si autoriza, o la `NextResponse` 401/403 |
| `requireRole(req, roles)` | `src/lib/requireRole.ts` | devuelve el `SessionPayload` o la `NextResponse` 401/403 |
| `hasModuleAccess(key, roles)` | `src/lib/auth-check.ts` | **cliente**: lee `sessionStorage` |
| `useAuth({moduleKey, allowedRoles})` | `src/lib/hooks/useAuth.ts` | el guard de las pantallas |

🔴 **En los tres helpers de servidor, `admin` SIEMPRE pasa**, mire lo que mire `allowedRoles`.
🔴 En el cliente, `hasModuleAccess` pasa si `role === "admin"`, **o** si el rol está en
`allowedRoles`, **o** si `fg_modules` (sessionStorage) contiene la key. Un rechazo muestra un
cartel rojo «No tienes acceso a este modulo» durante 2 s y manda a `/home`; sin rol, a `/`.

⚠️ `useAuth` decide con `sessionStorage`, que el usuario puede editar. **La autorización de verdad
está en el servidor**, en cada ruta. Ese guard es de navegación, no de seguridad.

## Por qué está así

| Decisión | Cita / fecha / medición |
|---|---|
| **Con el pase vigente se entra directo** | 3-sep-2026. Daniel: **«Aprobado»**. Medido: **453 de 468 logins en 30 días** eran de gente con la cookie de 7 días viva (Bodega **81 de 81**, Daniel 146 de 147); **gap mediano entre logins del mismo usuario: 2,3 h** |
| **«Salir» ahora revoca de verdad, y se espera** | mismo día. El del home **no revocaba nada** (solo borraba `sessionStorage`) y los otros dos mandaban el DELETE sin esperar. Con la reanudación, un DELETE que no se espera puede perder la carrera y volver a meter al usuario |
| **Todo el endpoint de reanudar es fail-closed** | *«ante cualquier duda: 401 → contraseña»*. Y **rol y módulos se releen frescos de la base**: si le cambiaron el rol o lo desactivaron después del login, se refleja |
| **No se muestra el formulario mientras se verifica** | solo el logo — *«evita el destello de pedir la contraseña cuando el usuario va a entrar directo»* |
| **Login solo con contraseña, sin usuario** | herencia de las contraseñas por rol. Su consecuencia obligada: **unicidad global de contraseña** y rechazo del caso ambiguo |
| **Multi-dispositivo: un login no revoca los anteriores** | *«así puede estar activo en varios dispositivos a la vez (iPhone + escritorio + PWA), cada uno con su propia ventana deslizante de 7 días»* |
| **La cookie se re-emite en CADA request** | ventana deslizante de 7 días, no vencimiento fijo |
| **El middleware falla OPEN ante un 5xx y CLOSED sin configuración** | *«un fallo de la DB NO debe desloguear a un usuario con cookie HMAC válida»*; pero *«sin config no podemos validar la sesión → tratar como inválida»* |
| **Los cortes de retención son 14 / 90 / 90 días** | 14 = **el doble** del `maxAge` de 7 → no desloguea a nadie que todavía pudiera estar usando la app. 90 = tope duro para que una cookie robada no se renueve sola para siempre. 90 = 3 meses de rastro de auditoría |
| **El DELETE de sesiones va PRIMERO** | si se revocara antes, una sesión inactiva hace más de 90 días se revocaría y se borraría en la MISMA pasada, sin dejar ni un día del rastro que el paso 3 promete |
| **La poda de `switch_sync_log` va en este cron y es NO FATAL** | es el único cron de limpieza puramente de DB que ya existía. *«Un log operativo sin podar no es una razón para que el watchdog lo dé por caído»* |
| **Login case-insensitive** | por el autocapitalizar del iPhone: se compara el texto exacto **y** su versión en minúsculas |
| **`autoCapitalize=none` y `autoCorrect=off` en el campo** | misma razón |

## Lo que se intentó y se retiró

Ver §2 › *Lo que se intentó y se retiró* — ahí están las contraseñas por rol, el texto plano, el
`Map` en memoria del rate limit, el `pathname.includes(".")` del middleware, Face ID y el DELETE
fire-and-forget. Lo único que falta añadir:

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **El Modo Viaje** (lectura offline: snapshots en `localStorage` + caché de páginas en el service worker) | jul-2026 | *«nunca se usó»*. Hoy la app es SIEMPRE online: el SW solo cachea assets inmutables y la navegación va directo a la red |
| **La UI de «hay una versión nueva»** | — | La actualización es automática y **silenciosa** (`skipWaiting` + `clientsClaim`), con guard de formulario sucio y guard anti-loop en `sessionStorage` |

## Cuánto se usa

Medido el 4-sep-2026 sobre `activity_logs` (`action = 'login'`) y `user_sessions`:

| Señal | Medida |
|---|---|
| Logins registrados, en total | **1.481** — es la acción más frecuente de todo el sistema |
| Logins en los últimos 30 días | **366** |
| Logins en las últimas 24 h | 🔴 **1** — el efecto directo de la reanudación desplegada el 3-sep |
| Por rol, 30 días | secretaria **110** · bodega **79** · admin **75** · vendedor **40** · contabilidad **31** · gerente_acs **26** · gerente_boston **5** |
| Sesiones vivas ahora | **179** de 1.039 filas, en 13 nombres |
| Quién tiene más sesiones vivas | daniel 40 · andrea 32 · Bodega 31 · Angela 21 · Contabilidad 19 |
| Quién entró hoy | daniel, Angela, andrea, Bodega, Contabilidad, alberto, david |
| Intentos fallidos bloqueados | `login_attempts` tiene **4 filas** — casi ningún lockout |

## Qué papeles y Excel produce

🔴 **Ninguno.** Ni PDF, ni Excel, ni correo — **ni siquiera para recuperar la contraseña**: la
pantalla dice *«Contacta al administrador para restablecer tu contraseña»* y ahí termina.

Lo único que sale hacia afuera: los **hashes bcrypt** viajan en `fg_users_auth.ndjson.gz` dentro del
backup diario, a Supabase Storage y a Cloudflare R2, en archivo separado de la ficha del usuario.

## Cómo probarlo a mano

Ver §2 › *Cómo probarlo a mano* › **(A)**, **(B)**, **(C)** y **(D)** — son las cuatro pruebas de
punta a punta del login, la desactivación, el candado anti-lockout y la reanudación de sesión.
Dos más, específicas de esta sección:

**F) Que el rate limit funcione:**
1. En una ventana de incógnito, escribe **5 contraseñas equivocadas** seguidas.
2. **Qué debería pasar:** al 6º intento aparece *«Demasiados intentos fallidos. Intenta de nuevo en
   unos minutos.»* y el bloqueo dura 15 minutos.
3. **Dónde confirmar:** la tabla `login_attempts` tiene una fila con tu IP y `locked_until` en el
   futuro.

**G) Que la sesión expire del lado del servidor:**
1. Corre `https://fashiongr.com/api/cron/cleanup-sessions` con sesión de admin.
2. **Qué debería pasar:** un JSON con `ok: true` y los cuatro contadores:
   `revocadasPorInactividad`, `revocadasPorAntiguedad`, `borradas`, `syncLogPodadas`.
3. **Dónde confirmar:** en Usuarios › **Sesiones activas**, con el chip «Todas», ya no aparecen las
   sesiones sin uso hace más de 14 días.

## Qué lo rompe

Ver §2 › *Qué lo rompe* — las filas de `SESSION_SECRET`, el fail-open del middleware, el cron
`cleanup-sessions` y el renombrado de usuarios cubren todo lo de esta sección.
Una sola cosa más, que es propia del middleware:

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Alguien agrega un prefijo a `PUBLIC_PREFIXES` sin su propia llave** | esa ruta queda **abierta al mundo**: el middleware la deja pasar sin cookie | 🔴 **Nada lo dice.** Los 26 prefijos de hoy tienen todos su propio secreto (`CRON_SECRET`, `HEALTHCHECK_TOKEN`, `ASISTENCIA_INGEST_SECRET`) o son públicos a propósito (los catálogos y pedidos de las 4 marcas, las galerías con token HMAC) |

## Lo que sobra o no cuadra

1. **El login sigue teniendo una rama para `role === "cliente"`** (`data.role === "cliente" ?
   "/catalogo/reebok" : "/home"`, en dos lugares de `src/app/page.tsx`). Ese rol **no existe**:
   `SYSTEM_ROLE_KEYS` tiene 7 y ninguno es `cliente`, y el catálogo Reebok es público sin login.
2. **`USER_CONFIG` en `sesion-payload.ts` está hardcodeado por NOMBRE**: `{ edwin: { guiasReadonly:
   true } }`. Si Edwin se llamara distinto en `fg_users.name`, pierde la restricción en silencio.
   Es la única regla de permisos del sistema que no vive en una tabla ni en `modules.ts`.
3. **`CLIENTE_PASSWORD` y `VENDEDOR_PASSWORD` siguen en `.env.local`.** Las contraseñas por rol se
   retiraron en el Sprint 1E («todo login debe matchear una fila con nombre en `fg_users`»); las
   variables quedaron.
4. **El fail-open del middleware es asimétrico y está bien documentado, pero no tiene alarma**: si
   Supabase devuelve 5xx sostenido, todas las cookies firmadas pasan y el único rastro es Sentry.

---

# 5. La navegación — `src/lib/modules.ts`

Fuente única de verdad para el home, las páginas de grupo (`/g/[grupo]`), el drawer del `AppHeader`,
el `Sidebar` de escritorio y los atajos del buscador.

## Los 3 grupos

| key | Label | Ruta |
|---|---|---|
| `ventas-clientes` | **Ventas y clientes** | `/g/ventas-clientes` |
| `operacion` | **Operación** | `/g/operacion` |
| `administracion` | **Administración** | `/g/administracion` |

Slugs viejos, todos 307 en `next.config.js`: `/g/sistema` → `/g/administracion`;
`/g/plata-entra`, `/g/plata-sale`, `/g/productos` → `/home`.

## Los 23 módulos

**REGLA:** las fichas **NO llevan subtítulo**. El campo `subtitle` se eliminó de `AppModule`
(auditoría de textos, PR #278). No reintroducirlo.

Cada `AppModule` es `{ key, label, href, icon, roles[], group }`. La lista completa —con la key,
la ruta y quién la ve— ya está en `CLAUDE.md § Módulos`; lo que hace falta añadir es de **dónde
sale cada `roles[]`**, porque cuatro no están escritos a mano:

| Módulo | `roles[]` sale de | Por qué |
|---|---|---|
| `boston` | `ROLES_MODULO_BOSTON` (`src/lib/boston/rol.ts`) | es la MISMA lista que usan las rutas de `/api/boston/**`. Una copia a mano dejó a 3 vendedores tocando la pestaña para recibir siempre un 403 |
| `catalogos` | `catalogoRoles()` (`src/lib/catalogo/roles.ts`) | la comparten el hub y el GET de `/api/catalogo/[marca]/products`; hay candado que exige igualdad |
| `asistencia` | `new Set([...asistenciaRoles(), ...aprobacionesRoles()])` | quien marca **y** quien aprueba |
| el resto | escritos en la línea | — |

## Cómo se resuelve qué ve alguien

```
getVisibleModules(role, fgModules)
  ├─ role === "admin"        → ALL_MODULES (los 23, sin mirar nada más)
  ├─ fgModules no vacío      → ALL_MODULES.filter(fgModulesIncluye)
  └─ si no                   → ALL_MODULES.filter(m => m.roles.includes(role))
```

`fgModules` es lo que el login guardó en `sessionStorage.fg_modules`, y sale de
`resolverModulos()` (`src/lib/sesion-payload.ts`) con esta prioridad:

1. **`fg_users.modulos_override`** si existe y no está vacío (per-usuario).
2. **`role_permissions.modulos`** del rol.
3. **`getDefaultModulesForRole(role)`** — derivado de los `roles[]` del catálogo, si la tabla no
   responde.

🔴 **El override REEMPLAZA, no suma.** Lo dice la ayuda del modal de Usuarios y lo hace el código.

### La herencia de permisos (`MODULO_HEREDA_PERMISO_DE`)

Un módulo **nuevo** no está en `role_permissions.modulos`, así que su ficha no aparece hasta que
alguien corra la migración a mano — y este repo tiene DDLs pendientes desde hace semanas. La
herencia hace que la ficha se encienda **mientras tanto**, tomando prestado el permiso del módulo
del que salió:

| Módulo | Hereda de | Estado hoy (medido en `role_permissions`) |
|---|---|---|
| `referencia` | `catalogos` | ✅ **ya no hace falta**: `vendedor` y `bodega` tienen `referencia` por derecho propio |
| `comisiones` | `ventas` | ✅ **ya no hace falta**: `contabilidad` tiene `comisiones` por derecho propio |
| `catalogos` | `boston` | ✅ **ya no hace falta**: `gerente_boston` tiene `catalogos` por derecho propio |

🔴 **La herencia está acotada por el `roles[]` del módulo hijo** (`fgModulesIncluye`): sin ese
recorte, «referencia hereda de catalogos» le pintaría la ficha a `secretaria`, que tiene `catalogos`
y a quien la página rebota. Una ficha que rebota es peor que ninguna.
⚠️ **La herencia NO encadena**: `fgModulesIncluye` mira un solo nivel.

`fgModulesDaAcceso(fgModules, key, role)` expone la misma regla para los guards que solo tienen la
lista y la key (hoy: `CatalogoAuthGuard`).

### `MODULO_CASA_POR_ROL` y el auto-redirect del home

Al entrar a `/home` (`src/app/home/page.tsx`), para todo rol que **no** sea `admin`:

1. Si tiene **exactamente 1 módulo visible** → `router.push` a ese módulo. (Es lo de Bodega → Guías.)
2. Si no, y su rol tiene **casa** (`moduloCasaDeRol`) y esa casa está entre sus módulos visibles →
   `router.push` a la casa.

`MODULO_CASA_POR_ROL = { gerente_boston: "boston" }` — una sola entrada. David ganó Catálogos el
27-ago-2026 y con eso dejó de ser «rol de un solo módulo»: sin esta segunda rama caería en el Inicio
del grupo, que es la fuga que su módulo vino a tapar.
⚠️ El destino se resuelve contra los módulos **visibles**: si un día alguien le quitara `boston`,
`/home` no lo mandaría a una pantalla que no puede ver.

`gerente_acs` (jennifer) sigue cayendo por la rama 1: `role_permissions.gerente_acs = ["multifashion"]`
… ⚠️ **medido hoy es `["multifashion"]`, un solo módulo, así que la rama 1 aplica.** Pero
`role_permissions.gerente_boston = ["boston","catalogos","asistencia"]` — **tres**, así que David
necesita la casa. Y `asistencia` está en su lista aunque `MODULO_CASA_POR_ROL` no lo sepa.

## Por qué está así

| Decisión | Cita / fecha |
|---|---|
| **Las fichas NO llevan subtítulo** | auditoría de textos, PR #278: el nombre del módulo tiene que bastar. El campo `subtitle` se **eliminó** de `AppModule`. «No reintroducir» |
| **Comisiones vive en «Ventas y clientes»** | Daniel, 25-ago-2026: *«Comisiones debe de estar en ventas. Y también debe de verse empresa por empresa y todas las empresas.»* Y al día siguiente: *«comisiones debería de estar en ventas y clientes no?»* |
| **La ficha de Comisiones NO se retira aunque exista la pestaña `/ventas?tab=comisiones`** | medido: `ventas` es admin-only, así que **`/comisiones` es la ÚNICA puerta de la secretaria**. Abrirle `/ventas` para darle la pestaña sería un permiso nuevo: el SSR de esa página trae Resumen y Clientes en el HTML |
| **Contabilidad ve Comisiones** | Daniel, 25-ago-2026: ***«Q contabilidad vea comisiones»***. No abrió un permiso de datos: medido con cookies firmadas, contabilidad **ya recibía 200** de las cuatro rutas de lectura. Le faltaba la PUERTA — y le faltaba entera: `/comisiones` la rebotaba a `/home` |
| **Referencia salió de la pestaña de Ventas a módulo propio** | Daniel, 12-ago-2026: *«habilita referencia para los vendedores y bodega»* y *«dejar solo la del menú y quitar la pestaña de Ventas»* |
| **Boston va pegado a Multifashion, no por orden alfabético** | son hermanos estructurales: «una empresa que no convive con el grupo, con su propio módulo y su propio gerente». `american_classic` y `confecciones_boston` son justamente las DOS que no son Fashion Group |
| **La key es `boston`, no `cxc-boston`** | el módulo trae SEIS pestañas (Inicio, CXC, Ventas, Clientes, Planilla y Préstamos). *«Nombrarlo por una de sus pestañas es como haber llamado `aging` al CXC»* |
| **Ninguna `key` se renombra cuando cambia el label** | tres veces ya: Cheques → Recordatorios, Asistencia → «Asistencia y Planilla», Gastos de Empresa → Gastos. La key está en `role_permissions` y en `fg_users.modulos_override` |
| **`roles[]` se DERIVA para `boston`, `catalogos` y `asistencia`** | 🩸 una copia a mano dejó a **3 vendedores tocando la pestaña de Boston para recibir siempre un 403** |
| **La herencia de permisos está acotada por el `roles[]` del hijo** | sin ese recorte, «referencia hereda de catalogos» le pintaría la ficha a secretaria, que tiene catalogos y a quien la página rebota. **Una ficha que rebota es peor que ninguna** |
| **`MODULO_CASA_POR_ROL` en vez de un `role === "…"` a mano** | el rol se dice en UN solo lugar (`src/lib/boston/rol.ts`). Nació el 27-ago-2026, cuando David ganó Catálogos y dejó de ser «rol de un solo módulo» |
| **Admin está exento del auto-redirect** | `if (role === "admin") return` — el home es su tablero |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **Los 6 grupos viejos** (`sistema`, `plata-entra`, `plata-sale`, `productos`…) | rediseño del home, jul-2026 | Pasaron a 3. Los slugs redirigen en `next.config.js` con **307 temporal**, «para no quemar el redirect en el caché del navegador» |
| **`subtitle` en `AppModule`** | PR #278 | El nombre tiene que bastar |
| **`saldos-banco` como módulo suelto** | vivió **2 días** (#465/#467, ago-2026) | Existió solo para que el módulo viejo «Gastos de Empresa» se pudiera retirar sin dejar a Contabilidad sin el único dato que usaba. Terminada la mudanza, la ficha se retiró y el dato vive como pestaña de Gastos. `/saldos-banco` redirige |
| **`data-health` como módulo** | 13-ago-2026 | Ver §3 |
| **La entrada de herencia `"saldos-banco": "gastos-empresa"`** | 13-ago-2026 | Se retiró por DOS razones a la vez: ya no es un módulo (la entrada quedaba zombi) **y** contabilidad tiene `gastos-contabilidad` por derecho propio. `gastos-empresa` y `saldos-banco` quedan como keys **inertes** |
| **`/ventas?tab=referencia`** | 12-ago-2026 | Redirige a `/referencia`. ⚠️ Next arrastra la query al destino (`/referencia?tab=referencia`) y no hay forma de soltarla; es **inerte**: esa pantalla no lee `tab` |
| **El módulo Camisetas** | #35, jun-2026 | Eliminado por completo |
| **`MobileBottomBar`** | abril-2026 | La navegación es solo por módulos del home + drawer del header |

## Cuánto se usa

⚠️ Los clics en el menú **no se loguean**. Lo que sí se puede medir: qué módulos tiene cada rol y
cuántas personas hay detrás de cada uno.

| Módulo | Roles que lo tienen en `role_permissions` | Personas activas detrás |
|---|---|---|
| `guias` | admin · secretaria · bodega · vendedor | 8 |
| `catalogos` | admin · secretaria · vendedor · bodega · gerente_boston | 9 |
| `asistencia` | admin · secretaria · bodega · contabilidad · gerente_boston | 8 |
| `cheques` (Recordatorios) | admin · secretaria | 4 |
| `comisiones` | admin · secretaria · contabilidad | 5 |
| `boston` | gerente_boston | **1** (david) |
| `multifashion` | admin · gerente_acs | 3 |
| `usuarios` | admin | **2** |
| `vista-general` · `proveedores` · `gastos-contabilidad` | (admin por `ALL_MODULES`; `gastos-contabilidad` + contabilidad) | 2-3 |

Overrides per-usuario en uso: **2 de 11** (Angela y andrea, 11 keys cada una).
Roles con **un solo módulo** (auto-redirect activo): **`gerente_acs`** → Multifashion.
Roles con **casa** fijada: **`gerente_boston`** → Boston.

## Qué papeles y Excel produce

🔴 **Ninguno.** `modules.ts` es un catálogo en TypeScript: no tiene pantalla propia, no escribe en
la base y no genera archivos. Lo que produce es **qué fichas se ven**.

## Cómo probarlo a mano

1. Entra con cada rol (o pídele a esa persona que abra la app) y compara lo que ve en el home contra
   la fila de `role_permissions` de su rol.
2. **La prueba que más importa — que una ficha no mienta:** toca cada ficha del menú. **Ninguna
   puede rebotar** con «No tienes acceso a este modulo». Si una rebota, el `roles[]` del módulo y
   `role_permissions` se separaron.
3. **El auto-redirect:** entra como `jennifer` (gerente_acs). Tiene que caer **directo en
   Multifashion**, sin pasar por el home.
4. **La casa:** entra como `david` (gerente_boston). Tiene tres módulos, así que la rama de «un solo
   módulo» no aplica — tiene que caer en **`/boston`**, no en el Inicio del grupo.
5. **Dónde confirmar:** en la consola del navegador, `sessionStorage.fg_modules` muestra la lista
   exacta que el login le entregó a esa persona.
6. ⚠️ **Un cambio de permisos entra en el próximo login** (o en la próxima reanudación de sesión):
   `fg_modules` se escribe al entrar.

## Qué lo rompe

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Se renombra una `key`** | esa persona **pierde el módulo**: la key vieja sigue en `role_permissions` y en los overrides | la ficha desaparece del menú, sin error |
| **Se agrega un módulo y no se corre la migración de `role_permissions`** | la ficha no aparece para el rol destino hasta que corra | Daniel lo ve como «no se hizo». Es la razón de ser de `MODULO_HEREDA_PERMISO_DE` |
| **Se agrega un rol a `roles[]` pero el rol tiene `fg_modules`** | 🩸 **no pasa nada**: `getVisibleModules` le da **prioridad a `fg_modules`** sobre el `roles[]` del catálogo | la ficha sigue sin aparecer. Es exactamente el caso medido de Comisiones + contabilidad |
| **Se borra un grupo** | rompe `/g/<grupo>` **y encadena** el redirect viejo a una URL muerta | 404 desde un marcador |
| **`role_permissions` no responde** | cae al fallback derivado de `roles[]` | silencioso, y normalmente correcto — pero **un override guardado se pierde en esa sesión** |
| **Se le quita el módulo casa a un rol** | `/home` **no** lo manda a una pantalla que no puede ver: el destino se resuelve contra los módulos visibles | se comporta como cualquier otro rol |
| **Alguien mete una key inexistente en `modulos_override`** | esa persona pierde el módulo en silencio | la API lo previene (`ALL_MODULE_KEYS`); un `UPDATE` a mano, no |

## Lo que sobra o no cuadra

1. **Las tres entradas de `MODULO_HEREDA_PERMISO_DE` ya son inertes**: sus tres DDL corrieron.
   El propio código dice «se retira cuando la DDL esté corrida (verificable en
   `role_permissions`)». Medido: las tres están corridas.
2. **`role_permissions.admin.modulos` está incompleta** (17 keys de 23; faltan `boston`,
   `gastos-contabilidad`, `proveedores`, `vista-general`, `asistencia`… en realidad
   `asistencia` sí está). Es **inofensivo** porque admin devuelve `ALL_MODULES`, pero significa que
   esa fila **no describe** lo que admin ve, y cualquiera que la lea para saberlo se equivoca.
3. **`role_permissions.secretaria` no tiene `referencia`** y el `roles[]` del módulo tampoco la
   nombra — consistente. Pero **sí tiene `comisiones`**, que es lo que le da su única puerta a
   Comisiones (`/ventas` le está cerrado). Es un equilibrio frágil documentado en el propio
   `modules.ts`.
4. **`gerente_acs` y `gerente_boston` no aparecen en el `<select>` de Rol** de Usuarios (§2).

---

# 6. La búsqueda global (⌘K)

## Quién la ve

`SEARCH_ROLES = ["admin","secretaria","vendedor","bodega","contabilidad"]`
(`src/components/SearchBar.tsx:44`). Para los demás —`gerente_acs`, `gerente_boston`— la caja
**se oculta por completo**: `AppHeader` no la dibuja (`canSearch`) y el `SearchBar` se apaga solo
(`searchDisabled`). Mostrar una caja que siempre responde 403 es peor que no mostrarla.
`GET /api/search` exige esos mismos 5 roles → **403** a David y a Jennifer.

## Qué indexa

Ocho secciones, todas en paralelo, con `q` de ≥ 2 caracteres:

| Sección | Tabla | Busca por | Límite | Filtro de empresa |
|---|---|---|---|---|
| **CxC** | `switch_estadocuenta_aging` | `nombre_normalized` | 20 → dedup → 5 | `.in("company_key", EMPRESAS_DEL_GRUPO)` |
| **Reclamos** | `reclamos` | `nro_reclamo` o `nro_factura` | 5 | — |
| **Guías** | `guia_transporte` | `observaciones`, **+ el número** si `q` es numérico, **+ el nombre del transportista** vía FK | 5 | — |
| **Directorio** | `directorio_clientes` | `nombre` o `empresa` | 5 | ⚠️ ninguno: la tabla no tiene columna de empresa |
| **Cheques** | `cheques` | `cliente` | 5 | `.in("empresa", EMPRESAS_DEL_GRUPO)` |
| **Ventas** | `switch_facturas` | `cliente_nombre` | 50 → agregado por cliente → 5 | `.in("empresa_key", EMPRESAS_DEL_GRUPO)` |
| **Préstamos** | `prestamos_empleados` + sus movimientos | `nombre` | 5 | — |
| **Caja** | `caja_gastos` | `descripcion` o `proveedor` | 5 | — |

## Qué ve cada rol (recorte server-side, al final del handler)

| Rol | Secciones que recibe |
|---|---|
| `admin` | las 8 |
| `secretaria` | las 8 **menos** ventas y préstamos |
| `vendedor` | **CxC** y **Directorio** |
| `bodega` | **Guías** y **Directorio** |
| `contabilidad` | **Ventas** y **Préstamos** |

## Las reglas que ya están fijadas

- 🔴 **El buscador devuelve SOLO clientes de las 6 del grupo.** Daniel, sobre perder la búsqueda por
  nombre del saldo de un cliente de Boston: ***«no aparezca nunca»***. Filtro por **INCLUSIÓN**
  (`.in(...)`), nunca excluyendo — así una empresa nueva tampoco contamina hasta que alguien la
  agregue a `EMPRESAS_DEL_GRUPO`. Los ceros de hoy no son motivo para no filtrar: el cron de estado
  de cuenta ya trae `confecciones_boston` a `switch_estadocuenta`.
- 🔴 **La lista de las 6 sale de `@/lib/clientes/mundos`**, no se escribe en la ruta.
- **Consecuencia medida y querida:** 13 nombres compran en los dos mundos (CITY MALL DAVID, LA
  FRONTERA DUTY FREE…). Para ellos el buscador muestra **sus ventas del grupo**, no la suma con
  Boston/Multifashion. Los totales del módulo Ventas y de Vista General **no** se tocan.
- **`directorio_clientes` NO se filtra** porque no tiene columna de empresa — misma regla que
  `mundos.ts`: si no se puede determinar el mundo, el cliente se queda.
- Candado: `src/__tests__/lib/buscador-solo-grupo.test.ts`.

## Spotlight (atajos de lenguaje natural)

`parseQuickAction()` reconoce, con `q` ≥ 2:

| Lo que se escribe | A dónde lleva |
|---|---|
| «cheques que vencen hoy / mañana / esta semana» | `/cheques?filter=vencen_hoy` · `vencen_manana` · `vencen_semana` |
| «cheques pendientes / rebotados / depositados / vencidos» | `/cheques?filter=…` |
| «cuánto debe \<cliente\>» | `/admin?search=<cliente>` |
| «reclamos de/para \<empresa\>» | `/reclamos?empresa=<empresa>` |
| «guías pendientes» | `/guias?pendientes=1` |
| «gastos» / «caja» / «últimos gastos» | `/caja` |
| «préstamos de \<persona\>» | `/prestamos?search=<persona>` |

🔴 **Un atajo solo se ofrece si el rol puede abrir ese módulo** (`canQuickAction`, contra
`getVisibleModules(role, fgModules)` — la misma función del menú).

Además: **búsquedas recientes** (las últimas 5) y atajos **«Ir a…»** de módulos, también acotados a
los módulos visibles.

## Por qué está así

| Decisión | Cita / fecha |
|---|---|
| **El buscador devuelve SOLO clientes de las 6 del grupo** | Daniel, 30-jul-2026, sobre perder la búsqueda por nombre del saldo de un cliente de Boston: ***«no aparezca nunca»*** |
| **El filtro es por INCLUSIÓN, nunca excluyendo** | así una empresa nueva tampoco contamina hasta que alguien la agregue a `EMPRESAS_DEL_GRUPO`. *«Los ceros NO son motivo para no filtrar: el cron de estado de cuenta ya trae `confecciones_boston`, y el día que eso llegue al agregado el buscador se llenaría de Boston sin que nadie lo tocara»* |
| **La lista de las 6 no se escribe en la ruta** | sale de `@/lib/clientes/mundos`. *«Este repo ya se quemó con listas repartidas que se contradecían en silencio»* |
| **`directorio_clientes` NO se filtra** | no tiene columna de empresa: no hay con qué clasificarlo. Misma regla que `mundos.ts` — **si no se puede determinar el mundo, el cliente se queda** |
| **La caja se OCULTA para los roles sin permiso** | *«mostrar una caja que siempre responde 403/vacío es peor que no mostrarla»*. Por eso `gerente_acs` y `gerente_boston` no la ven |
| **Un atajo solo se ofrece si el rol puede abrir ese módulo** | `canQuickAction` usa `getVisibleModules` — la MISMA función del menú |
| **Al buscar, se cruzan todas las secciones que el rol puede ver, no solo la pestaña activa** | el recorte por rol es **server-side**, al final del handler: el cliente nunca recibe lo que no puede ver |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **El buscador sin filtro de mundo** | hasta el 30-jul-2026 | Mezclaba Boston y Multifashion con el grupo. **Consecuencia medida y querida del arreglo:** 13 nombres compran en los dos mundos (CITY MALL DAVID, LA FRONTERA DUTY FREE…) y para ellos el buscador muestra **sus ventas del grupo**, no la suma. Los totales del módulo Ventas y de Vista General **no** se tocaron |
| **La sección de Ventas leyendo `ventas_raw`** | jun-2026 | Hoy sale de `switch_facturas`, con alias de PostgREST para que el consumidor siga leyendo `row.cliente/empresa/subtotal/fecha` |

## Cuánto se usa

⚠️ **Las búsquedas no se loguean.** No hay tabla de consultas ni evento en `activity_logs`, así que
**no es medible** cuántas veces al día alguien abre ⌘K.

Lo que se midió en su lugar:

| Señal | Medida |
|---|---|
| Quién puede usarla | **9 de 11** usuarios activos (los 5 roles de `SEARCH_ROLES`). Quedan fuera `jennifer` y `david` |
| «Búsquedas recientes» | viven en `localStorage`, o sea **por dispositivo y no consultables desde el servidor** |
| Universo que cubre hoy | CxC 211 filas de aging · reclamos · 238 guías · **33** contactos del directorio manual · **19** cheques · 54.296 facturas · préstamos · gastos de caja |

## Qué papeles y Excel produce

🔴 **Ninguno.** El buscador solo navega: cada resultado es un enlace a la pantalla del módulo con el
filtro puesto en la URL (`/admin?search=…`, `/cheques?filter=vencen_hoy`, `/guias?pendientes=1`).

## Cómo probarlo a mano

1. Toca la lupa (o `⌘K` / `/` en escritorio) y escribe el nombre de un cliente del grupo — por
   ejemplo **Jerusalem**.
2. **Qué debería pasar:** aparecen sus secciones agrupadas — CxC con el saldo, Ventas con el total,
   Cheques con los suyos.
3. **La prueba que más importa:** busca un cliente que **solo** compre en Boston o en Multifashion.
   🔴 **No puede aparecer ni una vez.**
4. Escribe **«cheques que vencen hoy»**: arriba de todo tiene que salir el atajo ⚡ *«Ir a cheques
   que vencen hoy»*, y llevar a `/cheques?filter=vencen_hoy`.
5. **La prueba de permisos:** entra como `jennifer` (gerente_acs) — **la lupa no debe existir** en
   el encabezado. Y si alguien llama `/api/search` con su sesión, tiene que responder **403**.
6. Entra como `bodega` y busca un cliente: solo puede ver **Guías** y **Directorio**; nada de CxC ni
   de ventas.

## Qué lo rompe

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Se agrega una empresa a `EMPRESAS_DEL_GRUPO`** | sus clientes empiezan a aparecer en las tres secciones filtradas | es el mecanismo, no un defecto — pero **es la puerta por la que Boston volvería a colarse** |
| **Se agrega una sección nueva sin filtro de empresa** | esa sección mezcla mundos | 🔴 **Nada lo dice.** El candado `buscador-solo-grupo.test.ts` cubre las tres secciones de hoy |
| **`switch_estadocuenta_aging` cambia de columna** | ⚠️ la vista usa **`company_key`**, no `empresa_key`: un rename rompe el `.in(...)` y **el filtro deja de aplicar** | la consulta falla o —peor— si alguien «arregla» el nombre quitando el filtro, Boston vuelve al buscador |
| **`directorio_clientes` crece** | como no se filtra por empresa, cualquier contacto cargado a mano aparece para todos los roles que ven esa sección | son 33 filas; con más, habría que decidir |
| **Un rol nuevo** | si no está en `SEARCH_ROLES`, **no ve la caja**; si está en `SEARCH_ROLES` pero no en el `switch` de recortes del handler, **cae en la rama final y recibe TODO** (la de admin) | 🔴 Es el modo de fallo peligroso de esta ruta: el default es «todo» |
| **Se renombra una key de módulo** | `canQuickAction` deja de reconocer el atajo y **el spotlight no lo ofrece** | el atajo simplemente no aparece |

## Lo que sobra o no cuadra

- **Los 7 atajos de cheques dicen «cheques»** y el módulo se llama Recordatorios desde el
  24-ago-2026.
- **La sección Directorio busca `directorio_clientes`** (33 contactos cargados a mano), **no**
  `clientes_master` (el padrón de 150 vivos que usa el módulo /clientes). El propio comentario de la
  ruta lo advierte: *«Ojo que esta tabla NO es el Directorio del módulo /clientes»*. Buscar un
  cliente del directorio real por ⌘K no lo encuentra por esa sección.

---

# 7. Las alertas de Telegram — dos chats, tres tratos

Punto único: `src/lib/alertas/canal.ts`. 🔴 **Nadie llama `sendTelegramAlert` directo** (barrido
global en `src/__tests__/lib/acs-resumen-canal-privado.test.ts`).

## Los dos chats

| Canal | Env vars | Quién está |
|---|---|---|
| 📊 **NEGOCIO** | `TELEGRAM_BOT_TOKEN_NEGOCIO` + `TELEGRAM_CHAT_ID_NEGOCIO` (bot `@fashiongr_sistema_bot`) | un **GRUPO de tres**: Daniel + el celular de la empresa, que miran bodega y marketing. **NO es privado** |
| 🔧 **SISTEMA** | ninguna (`*_SISTEMA` no existe en Vercel) → cae al canal de siempre: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` = `1367251585`, bot `@fashiongr_alertas_bot` | el **chat privado de Daniel** |

⚠️ Sí: el bot que se llama «sistema» lleva el **negocio**. Es a propósito, lo decidió Daniel, y el
nombre se cambia desde Telegram cuando quiera. **No invertir el ruteo para que haga juego con el
nombre.**
⚠️ El destino es el **PAR (token, chat)**, no solo el chat: en un chat privado el `chat_id` es el id
del USUARIO, idéntico para todos los bots, y Telegram solo deja escribir al bot al que el usuario le
habló primero. Un override de solo-chat usa el bot de siempre; un override de solo-token se ignora
con warning.

Para verificar a dónde apunta cada canal **sin escribirle a nadie**:
`GET /api/diag/canales-telegram` (auth `CRON_SECRET` o sesión de admin; solo hace `getMe`, nunca
`sendMessage`; el token nunca sale entero).

## Los tres tratos

| Función | Destino | Prefijo | Anti-ruido | Qué manda |
|---|---|---|---|---|
| `enviarNegocio` | 📊 NEGOCIO | ninguno | 🔴 **ninguna, y no acepta perilla** | pedidos, guías, cheques por vencer, fotos faltantes |
| `enviarNegocioPrivado` | 🔧 SISTEMA (el chat) | **ninguno** | 🔴 **ninguna** | resumen diario de ventas de ACS · **resumen mensual del grupo** |
| `enviarSistema` | 🔧 SISTEMA | `🔧 SISTEMA · ` al principio | la regla de tres, en cada llamador | averías |

Daniel, textual: *«tengo dividido los mensajes en info de la empresa y alertas cuando el sistema no
funciona»*. Y sobre 📊 NEGOCIO: *«NO, ES SUPER IMPORTANTE ESAS. NECESITO SABER QUE PASA EN LA
EMPRESA Y ESO AYUDA BASTANTE»*.

🔴 **`enviarNegocioPrivado` es una función propia y no `enviarSistema` a secas.** Hoy
`enviarSistema` tampoco filtra por dentro —toda la anti-ruido vive en sus llamadores— pero eso es
casualidad, no diseño: el día que alguien agrupe o silencie DENTRO de `enviarSistema`, el resumen de
ventas se iría con la agrupación. La protección viaja **con el mensaje**.
🔴 **No lleva el prefijo `🔧 SISTEMA ·`**: rotular la venta del día como una avería sería mentir en
la notificación del iPhone, que es exactamente lo que ese prefijo existe para no hacer.
⚠️ **Pierde el fail-safe**: `sendTelegramAlert` reintenta en el canal de siempre cuando falla un
destino APARTE, y este destino ES el de siempre. Lo cubre la reconciliación (3 pasadas al día).

### ⚠️ Lo que cambió hoy: el resumen mensual del grupo pasó a privado y al día 1 (`f43eb4c0`)

Daniel, textual: *«este mensaje también lo quiero en alertas de Telegram, no en negocio.»*
Mismo motivo que el resumen diario de ACS (2-sep): 📊 NEGOCIO es un grupo de tres donde está el
celular de la empresa, y ahí no van los números del grupo.

- `/api/cron/grupo-resumen-mensual` pasó de `enviarNegocio` a **`enviarNegocioPrivado`**.
- El cron pasó del **día 3** al **día 1**: `vercel.json` dice hoy `0 13 1 * *` (08:00 Panamá).
  Medido: agosto cerró completo el 31-ago 19:15 UTC; el margen de «días 1-5» era del **sync de
  utilidad**, no del de ventas. Lleva guardia por corrida de sync de las 8 empresas.
- El **texto del mensaje no cambió ni una coma**.
- Candados: `src/__tests__/lib/acs-resumen-canal-privado.test.ts` ·
  `src/__tests__/lib/grupo-resumen-mensual-dia-1.test.ts`.
- ⚠️ `CLAUDE.md` todavía dice «13:00 el día 3 de cada mes» y lo lista bajo 📊 NEGOCIO.

## Quién manda por dónde, hoy (barrido completo de `src/`)

**📊 NEGOCIO (`enviarNegocio`) — 8 llamadores:**
`/api/cron/cheques-alert` (y su lógica en `src/lib/cheques-alert.ts`) · `/api/cron/guias-pendientes`
· `/api/cron/catalogos-fotos-resumen` · `src/lib/catalogos/fotos-nuevos.ts` ·
`/api/catalogo/[marca]/orders` · `/api/catalogo/[marca]/pedido-publico/[id]/confirmar` (2 puntos) ·
`src/lib/catalogo/switch-envio.ts` · `/api/guias/[id]` (despacho) · la recuperación de
`switch-reconciliacion`.

**🔒 NEGOCIO PRIVADO (`enviarNegocioPrivado`) — 2 mensajes, 4 puntos de salida:**
el resumen diario de ACS (`/api/cron/acs-resumen-diario` **+** su recuperación en
`switch-reconciliacion`) y el resumen mensual del grupo (`/api/cron/grupo-resumen-mensual` **+** su
recuperación). 🔴 Cada mensaje sale desde **DOS lugares que no pueden separarse**, y hay candado que
exige que apunten al mismo destino.

**🔧 SISTEMA (`enviarSistema`) — 18 llamadores:**
`asistencia/ingest` (reloj caído / recuperado) · `asistencia-vigia` (3 avisos) · `backup` (5 puntos)
· `db-salud` (2) · `switch-reconciliacion` (datos viejos, escalado) ·
`src/lib/alertas/cuadre-costo-io.ts` · `src/lib/alertas/silencio-de-datos-io.ts` ·
`src/lib/campos-obligatorios.ts` · `src/lib/catalogo/switch-envio.ts` (envío fallido/ambiguo) ·
`src/lib/catalogos/clasificacion-aviso.ts` · `src/lib/cron-telemetry.ts` (cron caído) ·
`src/lib/integrity-check-run.ts` (checks critical) · `src/lib/switch-api/alert-policy.ts` ·
`monto-guard-io.ts` · `renglones-ilegibles.ts` ·
`/api/catalogo/[marca]/pedido-publico/[id]/confirmar`.

## El fail-safe

`sendTelegramAlert(text, parseMode, destino?)`: si el destino **aparte** falla, reintenta **una vez**
en el canal de siempre. *«Un aviso que no llega es peor que un aviso que llega al chat viejo.»*
El reintento solo corre cuando el destino **difiere** del de siempre.
Sin `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, se omite con warning y devuelve `false`.

## Las reglas anti-ruido (todas en 🔧 SISTEMA)

Están resumidas en `CLAUDE.md § Crons, alertas e infraestructura`. Lo que hace falta añadir aquí es
**dónde vive cada una**:

| Regla | Archivo |
|---|---|
| «un dato que miras está viejo» (+24 h), anti-loop por tipo | `src/lib/datos-frescos.ts` |
| «algo se rompió y no se arregló solo» (2 fallos seguidos del mismo par) | `src/lib/switch-api/alert-policy.ts` |
| «la base está en problemas» (>80 % memoria) | `/api/cron/db-salud` |
| «el reloj de asistencia tiene un hueco» | `/api/cron/asistencia-vigia` |
| «el silencio no cuenta como que está bien» (A: sync con 0 · B: tabla sin escrituras) | `src/lib/alertas/silencio-de-datos.ts` + `-io.ts` |
| cuadre mensual de costo (>2 % **y** >$100) | `src/lib/alertas/cuadre-costo.ts` + `-io.ts` |
| montos imposibles | `src/lib/switch-api/monto-guard-io.ts` |
| renglones que Switch manda y no se pueden leer | `src/lib/switch-api/renglones-ilegibles.ts` |
| **espera la 2ª oportunidad** del día antes de alertar (backup) | `alertaDeBackupEsperaSegundaOportunidad()` en `/api/cron/backup` |
| anti-loop de 7 días por módulo / por (empresa, mes) | en cada `-io.ts`, con clave por **N. interno del documento**, nunca por número de línea |

---

## Por qué está así

| Decisión | Cita / fecha |
|---|---|
| **Dos canales, con reglas OPUESTAS** | Daniel, 27-jul-2026: *«tengo dividido los mensajes en info de la empresa y alertas cuando el sistema no funciona»*. *«No son un flujo con más o menos ruido: son DOS COSAS DISTINTAS. Meterlas en la misma bolsa fue el error de diseño original»* |
| **📊 NEGOCIO no tiene perilla de silenciar, y que no exista es la garantía** | Daniel, 27-jul-2026: ***«NO, ES SUPER IMPORTANTE ESAS. NECESITO SABER QUE PASA EN LA EMPRESA Y ESO AYUDA BASTANTE»*** |
| **El destino es el PAR (token, chat), no solo el chat** | en un chat privado el `chat_id` es el id del USUARIO, **idéntico para todos los bots**: apuntar el otro canal a ese número habría sido un no-op perfecto. Y Telegram solo deja escribir al bot al que el usuario le habló primero |
| **El bot que se llama «sistema» lleva el NEGOCIO** | *«Es a propósito, lo decidió Daniel, y el nombre se cambia desde Telegram cuando quiera. **No invertir el ruteo para que haga juego con el nombre**»* |
| **El resumen diario de ACS va al chat privado** | Daniel, 2-sep-2026: *«Solo me gustaría que las ventas de acs me lleguen solo a mí o por el chat de alertas, ya que ahí no está el celular de la empresa»*. **El motivo es privacidad, no severidad** |
| **El resumen mensual del grupo también** | Daniel, 4-sep-2026: *«este mensaje también lo quiero en alertas de Telegram, no en negocio.»* |
| **Y va sin el prefijo `🔧 SISTEMA ·`** | *«rotular la venta del día como avería sería mentir en la notificación del iPhone»* |
| **`enviarNegocioPrivado` es función propia y no `enviarSistema` a secas** | *«hoy `enviarSistema` tampoco filtra nada por dentro, pero eso es CASUALIDAD, no diseño. El día que alguien agrupe o silencie DENTRO de `enviarSistema` el resumen se iría con la agrupación. La protección tiene que viajar CON el mensaje»* |
| **El prefijo va al PRINCIPIO** | es lo único que se lee en la notificación del iPhone sin abrirla |
| **El resumen mensual pasó del día 3 al día 1** | Daniel, 4-sep-2026: *«sí, lo quiero lo antes posible»*. Medido: el margen de «días 1-5» era del **sync de utilidad**, no del de ventas — las ventas cierran la misma noche (última factura de agosto: 31-ago 19:15 UTC) |
| **Nadie llama `sendTelegramAlert` directo** | barrido global en `acs-resumen-canal-privado.test.ts` |
| **El fail-safe reintenta en el canal de siempre** | *«Un aviso que no llega es peor que un aviso que llega al chat viejo»* |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **Un solo canal para todo** | hasta el 27-jul-2026 | El error de diseño original. Los avisos de negocio y las averías tienen reglas opuestas |
| **El aviso de «costo sospechoso»** | 3-ago-2026 | Daniel, textual: ***«no quiero mensaje de costos»***. **Ya no se manda por NINGÚN canal.** Candado: `costo-sospechoso-canal.test.ts`. ⚠️ El comentario de `canal.ts` lo siguió listando hasta el 2-sep |
| **Un `TELEGRAM_CHAT_ID_SISTEMA`** | nunca existió | Verificado contra Vercel el 2-sep-2026: solo hay `*_NEGOCIO`. SISTEMA cae al canal de siempre por la última rama de `destinoDeCanal` |
| **El comentario que decía que NEGOCIO era el chat privado** | corregido el 2-sep-2026 | 🩸 Decía **exactamente lo contrario** de la realidad durante semanas. *«Es la clase de dato viejo que hace que el próximo cambio salga al chat equivocado»* |
| **Telegram inmediato en los fallos de cron colaterales** | anti-ruido del 17-jul-2026 | Si la reconciliación, una 2ª oportunidad o el propio cron lo recupera en horas, **no se avisa**. Queda el rastro en `cron_email_errors` |
| **Alertar en el primer fallo de backup del día** | — | 3 de las 5 alertas de backup de un mes eran fallos que se arreglaban solos en la 2ª entrada |
| **11 pasadas diarias de `db-salud`** | 30-jul-2026 | Bajaron a **5** con la poda de alertas |

## Cuánto se usa

⚠️ **Los mensajes enviados no se guardan en ninguna tabla.** No hay log de Telegram: solo se sabe si
el cron que lo mandó registró heartbeat. **No es medible** cuántos mensajes salen por día.

Lo que se midió en su lugar — **cuántos lugares del código pueden mandar por cada canal**:

| Canal | Llamadores distintos | Mensajes conocidos |
|---|---|---|
| 📊 NEGOCIO | **8 archivos** | cheques por vencer · guías sin despachar · fotos que faltan (semanal) · pedido nuevo (interno y público) · envío a Switch OK · guía despachada |
| 🔒 NEGOCIO PRIVADO | **2 mensajes, 4 puntos de salida** | resumen diario de ventas de ACS (01:00) · resumen mensual del grupo (día 1, 13:00) |
| 🔧 SISTEMA | **18 archivos** | reloj de asistencia caído/recuperado · huecos del reloj · 5 avisos de backup · 2 de recursos de la base · datos viejos · escalado de syncs · cuadre de costo · silencio de datos · campos obligatorios · envío a Switch fallido/ambiguo · clasificación desconocida · cron caído · checks `critical` · montos imposibles · renglones ilegibles |

Frecuencia real, inferida de los datos: `cheques-alert` tiene hoy **2 cheques pendientes y 0
recordatorios**, así que casi nunca manda; `integrity-check` lleva **90 días sin un `critical`**;
`cuadre-costo` midió **0 disparos** en un backtest de 32 pares (may–ago 2026); `silencio-de-datos`
midió **0 falsos positivos** en un backtest de 96 días.

## Qué papeles y Excel produce

🔴 **Ninguno.** Son mensajes de texto en Telegram, sin adjuntos. Los recibe:
📊 NEGOCIO = un **grupo de tres** (Daniel + el celular de la empresa, que miran bodega y marketing);
🔧 SISTEMA y 🔒 privado = el **chat privado de Daniel**.

## Cómo probarlo a mano

**A) Saber a dónde apunta cada canal SIN escribirle a nadie:**
`GET /api/diag/canales-telegram` (con `Bearer $CRON_SECRET`, `?secret=`, o sesión de admin).
Devuelve el bot y el chat de cada canal. **Read-only de verdad**: lo único que sale a la red es
`getMe`, que es un GET. El token nunca sale entero — solo `bot_id`, los últimos 4 caracteres y el
largo.
🔴 **Por qué existe:** antes, la única forma de confirmar la configuración era **mandar un mensaje
real** — spam para verificar una configuración. Y peor: el fail-safe hace que un mensaje que LLEGA
**no pruebe** que el ruteo nuevo funciona (pudo haber llegado por el camino de rescate).

**B) Mandar un mensaje de prueba de verdad, claramente rotulado:**
`GET /api/cron/cheques-alert?test=true` (admin o `CRON_SECRET`) manda al canal 📊 NEGOCIO un mensaje
que empieza con **🧪 (PRUEBA)**.

**C) Verificar que un mensaje va al chat correcto:** manda el resumen mensual a mano con
`GET /api/cron/grupo-resumen-mensual?secret=<CRON_SECRET>&mes=2026-08`. **Qué debería pasar:** llega
al **privado de Daniel**, sin el prefijo `🔧 SISTEMA ·`. Si llega al grupo de tres, el ruteo se
rompió.

## Qué lo rompe

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Se borra `TELEGRAM_CHAT_ID_NEGOCIO`** | **todo el negocio se va al chat privado de Daniel** (última rama de `destinoDeCanal`) | los mensajes llegan, pero al chat equivocado: bodega y marketing dejan de ver las fotos y las guías |
| **Se pone `TELEGRAM_BOT_TOKEN_NEGOCIO` sin su chat** | se ignora con warning y ese canal cae al de siempre | solo en los logs |
| **Se borran `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`** | 🔴 **se pierde el fail-safe y el canal de SISTEMA entero**: `sendTelegramAlert` omite con warning y devuelve `false` | **nada avisa** — es el canal de las alertas el que se apagó |
| **Telegram rechaza el mensaje de un canal aparte** | se reintenta **una vez** en el canal de siempre | el mensaje llega, con otro emisor |
| **Telegram rechaza un mensaje de `enviarNegocioPrivado`** | 🔴 **no hay a quién reintentarle**: su destino ES el de siempre | lo cubre la reconciliación, que reenvía el resumen en sus 3 pasadas del día |
| **Alguien agrega una perilla de silenciar dentro de `enviarSistema`** | el resumen de ventas **NO** se iría con ella: por eso `enviarNegocioPrivado` es función propia | el candado `acs-resumen-canal-privado.test.ts` pone el build rojo |
| **Alguien llama `sendTelegramAlert` directo** | se salta el ruteo y el prefijo | barrido global en CI |
| **Un cron manda dos veces el mismo aviso** | `cheques-alert` lo impide con `yaAvisoHoy` (heartbeat); los avisos de sistema, con anti-loop de 7 días por módulo | — |


# 8. Los crons — `vercel.json` contra el registro de código

## Los números de hoy

**`vercel.json` tiene 80 entradas** (⚠️ `CLAUDE.md` dice 79) repartidas en **30 paths distintos**.
Límite del plan Vercel Pro: 100 cron jobs por proyecto.

🔴 **Una entrada = una ocurrencia al día.** Para frecuencia sub-diaria se agregan entradas separadas
del mismo path, **NUNCA** una lista de horas (`0 15,19,23 * * *`), aunque Vercel Pro la acepte.

| Path | Entradas | Path | Entradas |
|---|---|---|---|
| `switch-sync` | **18** | `sync-articulo-info` | 3 |
| `backup` | **8** (3 core + 3 `?grupo=switch` + 2 `?grupo=storage`) | `switch-reconciliacion` | 3 |
| `db-salud` | 5 | `asistencia-vigia` | 3 |
| `tommy/calvin/reebok/joybees-catalogo` | 4 c/u = 16 | `acs-fidelizacion` | 2 |
| `sync-recibos` | 4 | los otros 16 paths | 1 c/u |

**Los dos únicos crons NO diarios:** `catalogos-fotos-resumen` (`30 13 * * 1`, lunes) y
`grupo-resumen-mensual` (`0 13 1 * *`, día 1 — **cambió hoy**, era el día 3).

### Lo que `CLAUDE.md` todavía no dice

- **`/api/cron/cleanup-depurador-archivos` — `20 3 * * *` (03:20 UTC).** Nuevo el 4-sep-2026.
  Borra los Excel del Historial del Depurador a los 90 días. 🔴 Borra el **archivo**, nunca la fila
  con los totales. Solo DB + Storage, no toca Switch. Está en `SEED_TOLERANT_CRONS`.
- El horario real de `backup?grupo=switch` es **06:45 / 11:15 / 23:30** (la tabla de `CLAUDE.md`
  está bien; el comentario del código de `cron-telemetry.ts` dice «19:15» en un lugar).

## El registro de código y la biyección

🔴 **El criterio de runtime NO mira `vercel.json`.** Mira un registro que es **constante de código**
(`src/lib/cron-telemetry.ts`), y la razón está escrita ahí: la regla ingenua «si no está en
`vercel.json`, no alerto» sería **peor que el bug** — quien borrara una entrada por accidente
apagaría la alerta junto con el cron, en silencio. Con el registro constante, borrar una entrada de
`vercel.json` **no** encoge la vigilancia: el heartbeat envejece y los dos vigías alertan.

Retirar un cron a propósito son **dos ediciones deliberadas** (`vercel.json` + el registro), y
`src/__tests__/lib/cron-registro.test.ts` **exige la biyección**: tocar uno solo pone el build ROJO.

Las tres listas:

| Lista | Qué significa | Contenido |
|---|---|---|
| `CRONS_FAIL_CLOSED` (21) | fila de heartbeat **ausente = caído** | acs-fidelizacion, acs-resumen-diario, backup, cheques-alert, cleanup-packing-lists, cleanup-sessions, grupo-resumen-mensual, integrity-check, joybees-catalogo, reebok-catalogo, refresh-clientes-views, switch-articulos, switch-reconciliacion, switch-sync, sync-clientes-master, sync-proveedores, sync-recibos, sync-utilidad, tommy-catalogo |
| `SEED_TOLERANT_CRONS` (14) | fila ausente = **todavía no sembrada**, no caída | backup-switch, backup-storage, calvin-catalogo, catalogos-fotos-resumen, boston-cartera, sync-factura-lineas, db-salud, guias-pendientes, **cleanup-depurador-archivos**, sync-articulo-info, asistencia-vigia, sync-egresos-varios, sync-ingresos-mercancia |
| `HEARTBEATS_NO_CRON` (5) | acciones **manuales**, nadie las programa | sync-now-refresh-vistas, catalogos-fotos-nuevos:{reebok,joybees,tommy,calvin} |
| `HEARTBEATS_EXTERNOS` (1) | se vigila pero **no** está en `vercel.json` | `vigia-externo` |

Cada comentario de `SEED_TOLERANT_CRONS` dice explícitamente cuándo promover el cron a
`CRONS_FAIL_CLOSED` («cuando la DDL esté corrida y lleve días sembrado»). Varios ya cumplen esa
condición y siguen ahí.

## Quién alimenta a quién

```
Switch (API JSON, token por USUARIO)
  ├─ switch-sync ?tipo=all        → switch_facturas · switch_estadocuenta · switch_costo_diario
  ├─ switch-sync ?tipo=facturas   → switch_facturas
  ├─ switch-sync ?tipo=estadocuenta → switch_estadocuenta → (vistas de aging) → CXC
  ├─ sync-recibos                 → switch_recibos       → comisión de cobro
  ├─ sync-utilidad                → switch_factura_utilidad → comisiones y costo de las ND
  ├─ sync-clientes-master         → clientes_master      → ClientePicker, Cheques, Guías, Ventas
  ├─ sync-proveedores             → switch_proveedor_estadocuenta
  ├─ sync-articulo-info           → switch_articulo_info → Ventas › Referencia, Catálogos
  ├─ switch-articulos             → switch_articulo_diario → Productos, costo, Referencia
  ├─ sync-factura-lineas          → switch_factura_lineas
  └─ 4× *-catalogo                → products/tommy_/calvin_/joybees_products → catálogos públicos

Switch (panel web Laravel, sesión que EXPULSA al humano)
  ├─ boston-cartera               → switch_estadocuenta_aging_boston → módulo Boston
  ├─ sync-ingresos-mercancia      → switch_ingresos_mercancia → «Compré», Referencia
  └─ sync-egresos-varios          → egresos_varios + cuentas_contables → Gastos

Solo base de datos (no tocan Switch)
  ├─ refresh-clientes-views       → clientes_agregado_12m_vw / clientes_empresa_12m_vw
  ├─ integrity-check              → data_integrity_checks → Data Health + 🔧 SISTEMA
  ├─ cleanup-sessions             → user_sessions + poda de switch_sync_log + candados de sync
  ├─ cleanup-packing-lists        → packing_lists (purga física a 90 d)
  ├─ cleanup-depurador-archivos   → Storage del Depurador (90 d)
  └─ db-salud                     → endpoint Prometheus de Supabase (ni tabla)

Solo salida (leen y avisan; no escriben datos de negocio)
  ├─ cheques-alert          → 📊 NEGOCIO
  ├─ guias-pendientes       → 📊 NEGOCIO
  ├─ catalogos-fotos-resumen→ 📊 NEGOCIO
  ├─ acs-resumen-diario     → 🔒 privado
  ├─ grupo-resumen-mensual  → 🔒 privado
  ├─ acs-fidelizacion       → correo
  └─ asistencia-vigia       → 🔧 SISTEMA

El que arregla a los demás
  └─ switch-reconciliacion (10/14/18 UTC) → re-ejecuta IN-PROCESS lo que no vio con success
     (cheques-alert, integrity-check, sync-clientes-master, los dos resúmenes…), levanta los
     candados atascados, y corre encima las alertas A/B de silencio y el cuadre de costo
     — CERO crons nuevos.
```

🔴 **Crons que tocan la MISMA empresa en Switch van ≥ 15 min separados**
(`SEPARACION_MINIMA_MIN`): Switch admite **un solo token válido por USUARIO** y cada empresa entra
con un único usuario de API. El sistema entra como `daniel`, así que **cada corrida saca a Daniel
del panel de esa empresa, y viceversa**.

## Los dos vigías, y la vigilancia mutua

- **Interno**: `switch-reconciliacion` (10/14/18 UTC) manda 🔧 SISTEMA por los crons stale.
- **Externo**: cron-job.org llama `GET /api/health-crons` cada hora con `HEALTHCHECK_TOKEN`
  (**no** `CRON_SECRET`, a propósito: un monitor de terceros no debe poder disparar crons).

🩸 **Incidente 29-jul-2026:** bastaba UN cron stale para devolver 503, cron-job.org deshabilitó el
monitor tras **26 fallos seguidos**, y nadie se enteró. Un cron roto le costó al sistema la
vigilancia externa de los otros ~50. Hoy:
- **200** = la vigilancia funciona (los hallazgos van en el cuerpo: `stale[]`, `staleCount`).
- **503** = la vigilancia **no puede responder por sí sola**: el watchdog interno está caído, hay
  caída masiva (≥ `UMBRAL_CAIDA_MASIVA`), o no se pudo leer `cron_heartbeats`.

Y **el que vigila también es vigilado**: cada llamada autenticada escribe el heartbeat
`vigia-externo`; si cron-job.org deja de llamar, esa fila envejece y el watchdog interno lo reporta
a las 26 h. Ninguno de los dos puede morir callado, sin agregar un tercer vigilante.

`health-crons` es además **recovery-aware**: un cron stale no cuenta para el 503 si tiene
recuperación conocida, esa recuperación aún viene hoy, y lleva stale < 30 h. Sale como
`pendingRecovery[]` con 200. **`switch-reconciliacion` y `grupo-resumen-mensual` jamás se silencian**,
y un cron sin heartbeat (fila ausente) tampoco.

## `cron_heartbeats` — 74 filas

Columnas: **`cron_name`** (⚠️ no `job`) y `last_success_at`. Nada más.
Medido: hay **19 filas de marcas retiradas** (`switch-sync:<slot>#recuperado` / `#visto`) con más de
20 días de antigüedad, la más vieja de hace **41 días** (`switch-sync:all-0535#recuperado`,
25-jul-2026). No alertan —`esHeartbeatNoVigilable` las salta— pero envejecen para siempre.
`esHeartbeatHuerfano()` existe justo para que un TEST exija que no queden; `sync-mayor` se barre en
la migración `20260914120000`.

---

## Por qué está así

| Decisión | Cita / fecha |
|---|---|
| **Una entrada = una ocurrencia al día. NUNCA una lista de horas** | Vercel Pro acepta `0 15,19,23 * * *`, pero entonces las tres ocurrencias comparten un solo «slot» y no se puede saber cuál falló |
| **El criterio de runtime NO mira `vercel.json`** | *«La regla ingenua sería "si no está en vercel.json, no alerto" — y sería PEOR que el bug: quien borrara una entrada por accidente apagaría la alerta del cron junto con el cron, en silencio»*. El registro es **constante de código** y el test exige la biyección |
| **≥ 15 min entre crons de la misma empresa** | la sesión de Switch es por USUARIO. Ver §10 |
| **Los crons de login web van de madrugada de Panamá** | cada login web **expulsa a Daniel del panel**. Y su recuperación solo corre en la pasada de las 10:00 UTC: *«un fallo de la corrida de las 2 a.m. se "arreglaba" sacando a Daniel de Switch a las 9 de la mañana»* |
| **Los 4 catálogos pasaron de 2 a 4 pasadas diarias** | 13-ago-2026, todas dentro de la ventana de uso de Panamá (14:30–22:10 UTC = 9:30 a.m.–5:10 p.m.) |
| **El código HTTP de `health-crons` dice «¿la vigilancia funciona?», no «¿hay hallazgos?»** | 29-jul-2026. Bastaba UN cron stale para devolver 503; cron-job.org deshabilitó el monitor tras **26 fallos seguidos**. *«Un cron roto le costó al sistema la vigilancia externa de los otros ~50»* |
| **Vigilancia mutua en vez de un tercer vigilante** | *«El arreglo NO es otro cron (que también podría morirse en silencio)»*: si el vigía externo se cae, deja de escribir su heartbeat y el watchdog interno lo reporta a las 26 h |
| **`health-crons` usa `HEALTHCHECK_TOKEN`, no `CRON_SECRET`** | *«un monitor de terceros no debe poder disparar crons»* |
| **`switch-reconciliacion` y `grupo-resumen-mensual` JAMÁS se silencian** | el primero es el watchdog; el segundo es demasiado esporádico para asumir «recuperación en camino» |
| **Un candado de sync atascado se suelta solo a los 30 min** | `RUNNING_STALE_MIN`, derivado del techo real de 800 s de la función |
| **La poda de `switch_sync_log` va colgada de `cleanup-sessions`** | *«es el único cron de limpieza puramente de DB que ya existía, así que la poda se engancha aquí en vez de agregar una entrada nueva a vercel.json»* |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **`multifashion-sync`** | 26-jul-2026 | `multifashion_tickets` quedó congelada. Su fila en `cron_heartbeats` quedó **huérfana** — el motivo por el que existe `esHeartbeatHuerfano()` |
| **`sync-mayor`** (09:05) | 13-ago-2026 | Daniel: ***«y entonces borra Mayor contable en el sistema»***. Un login web menos por día. Su fila huérfana se barre en la migración `20260914120000` |
| **11 pasadas de `db-salud`** → 5 | 30-jul-2026 | Poda de alertas. ⚠️ La tabla de `CLAUDE.md` decía 11 hasta el 31-ago |
| **La pasada de `asistencia-vigia` de las 13:45 UTC** | 10-ago-2026 | Quedaron 3 |
| **El umbral propio de `asistencia-vigia`** | — | Corriendo todos los días su hueco más largo es 16 h 45 y el default de 26 h lo cubre. Hacía falta cuando corría solo de lunes a viernes |
| **Los catálogos recuperándose en la pasada de las 14:00** | tras el incidente del 25-jul-2026 | `tommy-catalogo` se re-sincronizaba en **cada** pasada hasta reventar la invocación por `FUNCTION_INVOCATION_TIMEOUT`. Hoy la hora mínima es 15 → **solo la pasada de las 18:00 los recupera**. ⚠️ Consecuencia escrita, no escondida: los slots de las 19:4x y 21:5x/22:1x **no tienen recuperación el mismo día** |
| **Fusionar los 3 grupos de backup en uno** | — | Nació bajo el techo de 300 s del plan Hobby. Con Pro cada grupo tiene 800 s propios; volver a fusionarlos *«se decide con datos, no aquí»* |

## Cuánto se usa

| Señal | Medida (4-sep-2026) |
|---|---|
| Entradas en `vercel.json` | **80** de un límite de 100 |
| Paths distintos | **30** |
| Ocurrencias por día (suma de entradas diarias) | **78** (las otras 2 son la semanal y la mensual) |
| Filas en `cron_heartbeats` | **74** |
| Filas huérfanas (marcas de slots retirados) | **19**, la más vieja de hace **41 días** |
| Filas en `switch_sync_log` | **9.119**, podadas a 90 días conservando siempre las 10 últimas de cada par |
| Crons que abren sesión en el **panel web** | **4** (utilidad, boston-cartera, ingresos, egresos) — los que expulsan a Daniel |
| Crons que **no** tocan Switch | 10 (backups, limpiezas, integridad, refresh de vistas, db-salud, los avisos) |

## Qué papeles y Excel produce

🔴 **Ninguno directamente.** Los crons producen **filas en tablas**, **mensajes de Telegram** (§7),
**archivos de backup** (§9) y **un correo**: `acs-fidelizacion`.

## Cómo probarlo a mano

1. **¿Está todo verde?** `GET /api/health-crons?token=<HEALTHCHECK_TOKEN>`.
   **200** = la vigilancia funciona (los hallazgos van en el cuerpo: `stale[]`, `staleCount`,
   `pendingRecovery[]`, `slotsCubiertos[]`). **503** = la vigilancia no puede responder por sí sola.
2. **¿Cuándo corrió bien por última vez cada uno?** La tabla `cron_heartbeats`, columnas
   **`cron_name`** (⚠️ no `job`) y `last_success_at`.
3. **Disparar uno a mano:** todos aceptan `?secret=<CRON_SECRET>` o `Authorization: Bearer`, y
   varios además la cookie de admin (`cheques-alert`, `integrity-check`, `cleanup-sessions`).
   ⚠️ **Los que tocan Switch abren sesión**: respeta la regla de los 15 min y hazlo de madrugada si
   es de los cuatro del panel web.
4. **Que la biyección esté sana:** `npm test` — `cron-registro.test.ts` compara `vercel.json` contra
   el registro de código y pone el build **rojo** si se tocó uno solo.
5. **Ver qué descartó una corrida:** `switch_sync_log`, columnas `records_skipped` y
   **`skip_details`** (jsonb).

## Qué lo rompe

Ver §11 para el mapa completo de qué se cae con cada cron. Lo propio del mecanismo:

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Se borra una entrada de `vercel.json` por accidente** | ese cron deja de correr, **pero la vigilancia NO se apaga** (el registro es constante de código): el heartbeat envejece y los dos vigías alertan | 🔧 SISTEMA a las 26 h + `stale[]` en `health-crons`. Y el build se pone **rojo** en CI por la biyección |
| **Se retira un cron correctamente** (las dos ediciones) | deja de vigilarse, y su fila de `cron_heartbeats` queda **huérfana**: no alerta pero envejece para siempre | `esHeartbeatHuerfano()` existe para que un test lo exija; se barre con una migración |
| **Se pasan las 100 entradas** | Vercel rechaza el deploy | error de despliegue |
| **Dos crons de la misma empresa quedan a < 15 min** | se tumban el token de Switch | `cron-calendario.test.ts` lo impide en CI. En producción, uno falla limpio |
| **Un cron largo desborda su ventana** | el margen real es menor que la distancia inicio-contra-inicio que mide el test | por eso los pares de crons largos se dejaron a **≥ 50 min** |
| **La reconciliación se cae** | 🔴 se cae el watchdog interno **y** la recuperación de todos los colaterales | `health-crons` devuelve **503** — es una de sus tres condiciones |
| **cron-job.org deshabilita el monitor** | se cae la vigilancia externa | el heartbeat `vigia-externo` envejece → el watchdog interno lo reporta a las 26 h. Es lo que faltó el 29-jul-2026 |
| **Un `sync_type` nuevo que no está en el CHECK de `switch_sync_log`** | la corrida **no deja fila**: invisible, corra bien o mal | `SYNC_LOG_TYPES` + `sync-log-tipos-check.test.ts` |


# 9. Los backups y la réplica a R2

## Las tres corridas

Un solo path, `/api/cron/backup`, con tres «grupos» y **ocho entradas** en `vercel.json`:

| Grupo | Entradas UTC | Qué copia | Heartbeat |
|---|---|---|---|
| **core** (sin params) | 06:00 · 10:30 · 18:30 | **113 tablas** manuales/config (114 archivos: `fg_users` sale en dos) → `backups/YYYY-MM-DD/<tabla>.ndjson.gz` + `meta.json` | `backup` |
| **`?grupo=switch`** | 06:45 · 11:15 · **23:30** | **11 tablas `switch_*` + `multifashion_tickets`** (12) → misma carpeta + `meta-switch.json` | `backup-switch` |
| **`?grupo=storage`** | 04:00 · 15:30 | los ~3.2 K archivos de 5 buckets → **solo a R2**, `_storage/<bucket>/<path>` | `backup-storage` |

Las 2ª y 3ª entradas de cada grupo son **«segunda oportunidad»**: no-op si una anterior ya registró
success hoy (`cronSuccessHoyUtc`).

🔴 **La alerta espera la segunda oportunidad.** Un fallo a las 06:00 ya no le suena el celular a
Daniel si a las 10:30 se arregla solo — eso viola la regla del canal de sistema. Lo que **no**
cambia: la **última** entrada del día siempre alerta; el fallo se persiste igual en
`cron_email_errors`; sin heartbeat, `health-crons` y el watchdog lo ven stale.
`alertaDeBackupEsperaSegundaOportunidad()`.

## Formato y contenido

NDJSON gzipeado **por tabla**, paginado de a 1.000 con **orden estable** (`ORDER_BY`, default `id`).
Reemplazó un `backup.json` monolítico que **truncaba a 1.000 filas** por el cap silencioso de
PostgREST.

🩸 **Una tabla cuya llave primaria NO es `id` y no está en `ORDER_BY` deja un respaldo INCOMPLETO
que parece completo**: sin orden determinista, PostgREST puede saltear filas entre página y página y
nada lo dice. Hasta el 5-sep-2026 el `ORDER_BY` tenía **tres** excepciones escritas a mano; hoy son
**19**, y no se escriben a ojo: la llave real de producción vive medida en `PK_QUE_NO_ES_ID`
(`src/lib/backup/tablas.ts`) y `backup-nada-sin-copia.test.ts` exige que el `ORDER_BY` la cubra
**columna por columna** para toda tabla respaldada — y que no sobre ninguno.

🔴 **Los hashes de contraseña van en archivo aparte**: `fg_users.ndjson.gz` **sin** `password`, y
`fg_users_auth.ndjson.gz` con `id, name, password`. Los dos en el mismo bucket privado — para que un
restore no deje a todos sin login.

**Por qué el split core / switch:** ~310 K filas extra ≈ 160-175 MB NDJSON ≈ 310 páginas de fetch
(60-150 s) + gzip + doble upload. Nació bajo el techo de 300 s del plan Hobby; con Pro son 800 s por
grupo. Prioridad dentro del grupo switch: **`switch_articulo_diario` primero** porque es
**IRRECUPERABLE de Switch** (el API solo da el stock del día; el histórico diario solo existe aquí).

## La réplica a Cloudflare R2 (`src/lib/backup/r2.ts`)

- **Datos**: `data/YYYY-MM-DD/…`, con **fecha en el path**. Antes eran paths estables y R2 tenía UN
  solo punto en el tiempo: un borrado lógico replicado hoy dejaba el backup off-site igual de roto.
- **`meta.json` y `meta-switch.json` también se replican**: sin el meta, `scripts/restore.mjs` no
  puede correr desde R2 (es su índice de datasets).
- **Storage**: paths **estables** `_storage/<bucket>/<path>` — son binarios inmutables; versionarlos
  por fecha multiplicaría 198 MB por día sin ganar nada.
- **Manifest** (`key → "size|sha256"`): solo se sube lo que cambió. Cubre el catch-up del **mismo
  día**; **no es dedup entre días** (mañana son keys nuevas). El manifest de datos se poda a 7 días.
- 🔴 **Verificación post-subida (HEAD)** tras cada PUT: sin esto, un PUT «200 pero vacío» quedaba en
  el manifest y jamás se reintentaba.
- 🔴 **Verificación de lo OMITIDO** (HEAD muestreado): un key con firma igual se omitía **para
  siempre** aunque alguien lo hubiera borrado en R2, y el cron reportaba éxito. Ahora se verifican
  todos los ~57 de datos y una ventana rotativa de los ~3.2 K de Storage.
- **Deadlines**: `R2_DEADLINE_MS = 740 s` y `STORAGE_R2_DEADLINE_MS = 740 s`. Lo que no entra queda
  **pendiente** y lo toma la corrida siguiente.

## Completitud y retención

🔴 **`saludR2`**: una carpeta `data/<fecha>/` la escriben **DOS** invocaciones (core y switch) y con
una sola **el día NO se restaura**. Pasó el 25-jul-2026: el deploy entró después de la corrida core,
las entradas extra fueron no-op, y `restore.mjs --list` mostraba esa fecha como disponible mientras
el restore moría con 404 en `meta.json`. Ahora la corrida core evalúa **AYER** y alerta por 🔧
SISTEMA si quedó a medias.

| Destino | Retención |
|---|---|
| Supabase Storage | `RETENTION_DAYS = 21` días (bajó de 30 — el histórico largo vive en R2) |
| Cloudflare R2 | política **calculada y reportada** (`retencionR2`: 21 diarios + 8 semanales + 24 mensuales ≈ 53 carpetas ≈ 1,6 GB) pero 🔴 **NO BORRA NADA**. Un *lifecycle rule* de Cloudflare no sabe hacer abuelo-padre-hijo, así que la poda tiene que ser código — queda para un PR aparte, con la lógica ya escrita en `r2RetentionPlan()` |

🔴 **La réplica bucket→bucket dentro de Supabase se ELIMINÓ el 26-jul-2026, con medición**: eran
1.597 archivos / 103,2 MB del **MISMO proyecto** —cero red de seguridad si se pierde el proyecto—
ocupando el 18 % del GB del plan. Además llegaba tarde y a medias: nunca había copiado `marketing`
(55,1 MB) ni `joybees-photos` (15,9 MB). Antes de borrarla se verificó archivo por archivo que R2
tuviera los 3.204 originales con el mismo tamaño, y 20 al azar coincidieron byte a byte (sha256).
**NO reintroducir la copia intra-Supabase.**

## Restore

`scripts/restore.mjs` — acepta `--source r2` para leer los mismos objetos desde R2, y
`--storage <bucket>` para el camino de vuelta R2 → Supabase (probado el 26-jul con escritura real de
1 archivo, sha256 idéntico).

## 🔴 Qué se respalda, qué no, y quién lo decide (reescrito el 5-sep-2026)

Hasta el 5-sep-2026 esta sección decía **56 tablas respaldadas de 136** y listaba ~30 que escriben
personas y no tenían **ninguna copia**. La peor: **`asistencia_marcaciones`, 6.081 filas**, que las
manda el reloj, son append-only y **no se pueden volver a pedir a ninguna parte**. El módulo
Asistencia entero estaba afuera. También `bancos_saldos`, la configuración de comisiones, los tres
catálogos nuevos y —🩸 esta misma página lo daba por respaldado y era falso— **`products`, el
catálogo de Reebok**.

🔑 **El hueco no fue descuido: fue que nada avisaba.** La lista de `DATASETS` era la única verdad y
no se comparaba contra nada. Ahora la base entera está clasificada por **qué se pierde si se
pierde**, en `src/lib/backup/tablas.ts`:

| Clase | Qué es | ¿Obliga respaldo? | Cuántas |
|---|---|---|---|
| `personas` | la escriben personas — o un aparato nuestro, como el reloj —, o guarda una ventana que su fuente ya no sirve | 🔴 **sí** | 107 |
| `congelada` | ya nadie la escribe y su origen no existe más | 🔴 **sí** | 5 |
| `switch` | la reescribe un sync: se puede volver a bajar. Respaldarla es una decisión de **costo** | no | 15 |
| `bitacora` | registro de operación; se regenera sola | no | 7 |
| `retirada` | tabla muerta, sin lectores ni escritores | no | 2 |
| `vista` | vista o materializada: se recalcula | nunca | 23 |

⚠️ **La clase mira lo que se pierde, no quién escribe.** `egresos_varios` la baja un sync de Switch
y aun así es `personas`: el reporte se reemplaza mes a mes y los meses viejos no vuelven. Los
catálogos públicos igual: el PRECIO lo manda Switch, pero la foto, el badge y el nombre a mano no
tienen otra fuente.

### El candado — que es el arreglo de verdad

`src/__tests__/lib/backup-nada-sin-copia.test.ts` pone el build **ROJO** si:

- una migración crea una tabla que nadie clasificó (**es lo que impide que el hueco se repita**);
- una tabla `personas` o `congelada` no está en el route;
- una vista se cuela en el respaldo;
- las marcaciones del reloj dejan de subirse **primeras** dentro de su grupo;
- una tabla respaldada con PK distinta de `id` no tiene su `ORDER_BY` completo.

Y `src/__tests__/integration/backup-tablas-produccion.test.ts` (`RUN_DB_TESTS=1`) compara la
clasificación contra el catálogo de producción: **31 de las 136 tablas nacieron en el panel de
Supabase**, antes de que existieran las migraciones, y el candado estático no puede verlas.

### Lo que se dejó AFUERA a propósito

| Tabla | Filas | Por qué no |
|---|---|---|
| `switch_factura_lineas` | 163.722 (**97,4 MB crudos**) | Re-derivable de verdad (`sync-factura-lineas` + `scripts/_backfill-factura-lineas.ts`). Meterla suma ~10 MB gz **todos los días** para proteger algo que se puede volver a pedir. Si Daniel la quiere, es una línea |
| `switch_sync_log` · `multifashion_sync_log` | 9.496 · 98 | Se **podan a propósito**: respaldarlas sería guardar lo que decidimos tirar |
| `cron_heartbeats` · `cron_email_errors` · `data_integrity_checks` · `login_attempts` | 75 · 86 · 821 · 4 | Estado de infraestructura: se regenera solo en horas |
| `user_sessions` | 1.039 | 🔴 **Por seguridad**: son tokens de sesión vivos. Sacarlos del proyecto es repartir credenciales, y una sesión perdida se arregla volviendo a entrar |
| `multifashion_caja_diaria` | 8 | Caché del arqueo, para no gastar la sesión única de Switch |
| `empresa_gastos_mensuales` · `reebok_cart` | 0 · 0 | Tablas muertas |

### Lo re-derivable que SÍ entró, y por qué

- `switch_ingresos_mercancia` (17,6 MB crudos) — re-derivable **por el camino más frágil que
  tenemos**: el reporte web del panel, el que Switch ya cambió dos veces en dos semanas.
- `switch_articulo_info` (5,2 MB) — las FICHAS entran de a **400 por corrida**: volver a llenarlas
  cuesta semanas de cron.
- `switch_articulo_marca` (1,8 MB) — el mapa artículo → marca de Multifashion.
- `switch_costo_diario` (296 KB) — 🩸 **parcialmente irrecuperable**: el último día de cada mes vale
  $0 para siempre.
- `inventory` (48 KB) — las tallas de Reebok: restaurar `products` sin ellas deja media pantalla.

### Cuánto pesa ahora

| | Antes | Después |
|---|---|---|
| Tablas respaldadas | 56 | **125** (113 core + 12 switch) |
| Archivos por día | 59 (57 datos + 2 meta) | **128** (126 datos + 2 meta) |
| Peso diario (gz, medido 4-sep-2026) | **33,60 MB** | **~37,2 MB** (+10,7%) |
| Bucket `backups` (22 días vivos) | 721,9 MB | ~800 MB |

⚠️ **El tiempo de corrida está estimado, no medido:** la core midió **248 s de 800** el 25-jul con
59 archivos; suma ~69 tablas chiquitas (una página de fetch, un gzip y dos PUT con su HEAD cada una)
→ +60-120 s. Lo que no entre queda **pendiente**, como siempre. Confirmar con la respuesta del
primer cron después del deploy.

---

## Por qué está así

| Decisión | Cita / fecha |
|---|---|
| **Dos canales, con reglas OPUESTAS** | Daniel, 27-jul-2026: *«tengo dividido los mensajes en info de la empresa y alertas cuando el sistema no funciona»*. *«No son un flujo con más o menos ruido: son DOS COSAS DISTINTAS. Meterlas en la misma bolsa fue el error de diseño original»* |
| **📊 NEGOCIO no tiene perilla de silenciar, y que no exista es la garantía** | Daniel, 27-jul-2026: ***«NO, ES SUPER IMPORTANTE ESAS. NECESITO SABER QUE PASA EN LA EMPRESA Y ESO AYUDA BASTANTE»*** |
| **El destino es el PAR (token, chat), no solo el chat** | en un chat privado el `chat_id` es el id del USUARIO, **idéntico para todos los bots**: apuntar el otro canal a ese número habría sido un no-op perfecto. Y Telegram solo deja escribir al bot al que el usuario le habló primero |
| **El bot que se llama «sistema» lleva el NEGOCIO** | *«Es a propósito, lo decidió Daniel, y el nombre se cambia desde Telegram cuando quiera. **No invertir el ruteo para que haga juego con el nombre**»* |
| **El resumen diario de ACS va al chat privado** | Daniel, 2-sep-2026: *«Solo me gustaría que las ventas de acs me lleguen solo a mí o por el chat de alertas, ya que ahí no está el celular de la empresa»*. **El motivo es privacidad, no severidad** |
| **El resumen mensual del grupo también** | Daniel, 4-sep-2026: *«este mensaje también lo quiero en alertas de Telegram, no en negocio.»* |
| **Y va sin el prefijo `🔧 SISTEMA ·`** | *«rotular la venta del día como avería sería mentir en la notificación del iPhone»* |
| **`enviarNegocioPrivado` es función propia y no `enviarSistema` a secas** | *«hoy `enviarSistema` tampoco filtra nada por dentro, pero eso es CASUALIDAD, no diseño. El día que alguien agrupe o silencie DENTRO de `enviarSistema` el resumen se iría con la agrupación. La protección tiene que viajar CON el mensaje»* |
| **El prefijo va al PRINCIPIO** | es lo único que se lee en la notificación del iPhone sin abrirla |
| **El resumen mensual pasó del día 3 al día 1** | Daniel, 4-sep-2026: *«sí, lo quiero lo antes posible»*. Medido: el margen de «días 1-5» era del **sync de utilidad**, no del de ventas — las ventas cierran la misma noche (última factura de agosto: 31-ago 19:15 UTC) |
| **Nadie llama `sendTelegramAlert` directo** | barrido global en `acs-resumen-canal-privado.test.ts` |
| **El fail-safe reintenta en el canal de siempre** | *«Un aviso que no llega es peor que un aviso que llega al chat viejo»* |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **Un solo canal para todo** | hasta el 27-jul-2026 | El error de diseño original. Los avisos de negocio y las averías tienen reglas opuestas |
| **El aviso de «costo sospechoso»** | 3-ago-2026 | Daniel, textual: ***«no quiero mensaje de costos»***. **Ya no se manda por NINGÚN canal.** Candado: `costo-sospechoso-canal.test.ts`. ⚠️ El comentario de `canal.ts` lo siguió listando hasta el 2-sep |
| **Un `TELEGRAM_CHAT_ID_SISTEMA`** | nunca existió | Verificado contra Vercel el 2-sep-2026: solo hay `*_NEGOCIO`. SISTEMA cae al canal de siempre por la última rama de `destinoDeCanal` |
| **El comentario que decía que NEGOCIO era el chat privado** | corregido el 2-sep-2026 | 🩸 Decía **exactamente lo contrario** de la realidad durante semanas. *«Es la clase de dato viejo que hace que el próximo cambio salga al chat equivocado»* |
| **Telegram inmediato en los fallos de cron colaterales** | anti-ruido del 17-jul-2026 | Si la reconciliación, una 2ª oportunidad o el propio cron lo recupera en horas, **no se avisa**. Queda el rastro en `cron_email_errors` |
| **Alertar en el primer fallo de backup del día** | — | 3 de las 5 alertas de backup de un mes eran fallos que se arreglaban solos en la 2ª entrada |
| **11 pasadas diarias de `db-salud`** | 30-jul-2026 | Bajaron a **5** con la poda de alertas |

## Cuánto se usa

⚠️ **Los mensajes enviados no se guardan en ninguna tabla.** No hay log de Telegram: solo se sabe si
el cron que lo mandó registró heartbeat. **No es medible** cuántos mensajes salen por día.

Lo que se midió en su lugar — **cuántos lugares del código pueden mandar por cada canal**:

| Canal | Llamadores distintos | Mensajes conocidos |
|---|---|---|
| 📊 NEGOCIO | **8 archivos** | cheques por vencer · guías sin despachar · fotos que faltan (semanal) · pedido nuevo (interno y público) · envío a Switch OK · guía despachada |
| 🔒 NEGOCIO PRIVADO | **2 mensajes, 4 puntos de salida** | resumen diario de ventas de ACS (01:00) · resumen mensual del grupo (día 1, 13:00) |
| 🔧 SISTEMA | **18 archivos** | reloj de asistencia caído/recuperado · huecos del reloj · 5 avisos de backup · 2 de recursos de la base · datos viejos · escalado de syncs · cuadre de costo · silencio de datos · campos obligatorios · envío a Switch fallido/ambiguo · clasificación desconocida · cron caído · checks `critical` · montos imposibles · renglones ilegibles |

Frecuencia real, inferida de los datos: `cheques-alert` tiene hoy **2 cheques pendientes y 0
recordatorios**, así que casi nunca manda; `integrity-check` lleva **90 días sin un `critical`**;
`cuadre-costo` midió **0 disparos** en un backtest de 32 pares (may–ago 2026); `silencio-de-datos`
midió **0 falsos positivos** en un backtest de 96 días.

## Qué papeles y Excel produce

🔴 **Ninguno.** Son mensajes de texto en Telegram, sin adjuntos. Los recibe:
📊 NEGOCIO = un **grupo de tres** (Daniel + el celular de la empresa, que miran bodega y marketing);
🔧 SISTEMA y 🔒 privado = el **chat privado de Daniel**.

## Cómo probarlo a mano

**A) Saber a dónde apunta cada canal SIN escribirle a nadie:**
`GET /api/diag/canales-telegram` (con `Bearer $CRON_SECRET`, `?secret=`, o sesión de admin).
Devuelve el bot y el chat de cada canal. **Read-only de verdad**: lo único que sale a la red es
`getMe`, que es un GET. El token nunca sale entero — solo `bot_id`, los últimos 4 caracteres y el
largo.
🔴 **Por qué existe:** antes, la única forma de confirmar la configuración era **mandar un mensaje
real** — spam para verificar una configuración. Y peor: el fail-safe hace que un mensaje que LLEGA
**no pruebe** que el ruteo nuevo funciona (pudo haber llegado por el camino de rescate).

**B) Mandar un mensaje de prueba de verdad, claramente rotulado:**
`GET /api/cron/cheques-alert?test=true` (admin o `CRON_SECRET`) manda al canal 📊 NEGOCIO un mensaje
que empieza con **🧪 (PRUEBA)**.

**C) Verificar que un mensaje va al chat correcto:** manda el resumen mensual a mano con
`GET /api/cron/grupo-resumen-mensual?secret=<CRON_SECRET>&mes=2026-08`. **Qué debería pasar:** llega
al **privado de Daniel**, sin el prefijo `🔧 SISTEMA ·`. Si llega al grupo de tres, el ruteo se
rompió.

## Qué lo rompe

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Se borra `TELEGRAM_CHAT_ID_NEGOCIO`** | **todo el negocio se va al chat privado de Daniel** (última rama de `destinoDeCanal`) | los mensajes llegan, pero al chat equivocado: bodega y marketing dejan de ver las fotos y las guías |
| **Se pone `TELEGRAM_BOT_TOKEN_NEGOCIO` sin su chat** | se ignora con warning y ese canal cae al de siempre | solo en los logs |
| **Se borran `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`** | 🔴 **se pierde el fail-safe y el canal de SISTEMA entero**: `sendTelegramAlert` omite con warning y devuelve `false` | **nada avisa** — es el canal de las alertas el que se apagó |
| **Telegram rechaza el mensaje de un canal aparte** | se reintenta **una vez** en el canal de siempre | el mensaje llega, con otro emisor |
| **Telegram rechaza un mensaje de `enviarNegocioPrivado`** | 🔴 **no hay a quién reintentarle**: su destino ES el de siempre | lo cubre la reconciliación, que reenvía el resumen en sus 3 pasadas del día |
| **Alguien agrega una perilla de silenciar dentro de `enviarSistema`** | el resumen de ventas **NO** se iría con ella: por eso `enviarNegocioPrivado` es función propia | el candado `acs-resumen-canal-privado.test.ts` pone el build rojo |
| **Alguien llama `sendTelegramAlert` directo** | se salta el ruteo y el prefijo | barrido global en CI |
| **Un cron manda dos veces el mismo aviso** | `cheques-alert` lo impide con `yaAvisoHoy` (heartbeat); los avisos de sistema, con anti-loop de 7 días por módulo | — |


# 8. Los crons — `vercel.json` contra el registro de código

## Los números de hoy

**`vercel.json` tiene 80 entradas** (⚠️ `CLAUDE.md` dice 79) repartidas en **30 paths distintos**.
Límite del plan Vercel Pro: 100 cron jobs por proyecto.

🔴 **Una entrada = una ocurrencia al día.** Para frecuencia sub-diaria se agregan entradas separadas
del mismo path, **NUNCA** una lista de horas (`0 15,19,23 * * *`), aunque Vercel Pro la acepte.

| Path | Entradas | Path | Entradas |
|---|---|---|---|
| `switch-sync` | **18** | `sync-articulo-info` | 3 |
| `backup` | **8** (3 core + 3 `?grupo=switch` + 2 `?grupo=storage`) | `switch-reconciliacion` | 3 |
| `db-salud` | 5 | `asistencia-vigia` | 3 |
| `tommy/calvin/reebok/joybees-catalogo` | 4 c/u = 16 | `acs-fidelizacion` | 2 |
| `sync-recibos` | 4 | los otros 16 paths | 1 c/u |

**Los dos únicos crons NO diarios:** `catalogos-fotos-resumen` (`30 13 * * 1`, lunes) y
`grupo-resumen-mensual` (`0 13 1 * *`, día 1 — **cambió hoy**, era el día 3).

### Lo que `CLAUDE.md` todavía no dice

- **`/api/cron/cleanup-depurador-archivos` — `20 3 * * *` (03:20 UTC).** Nuevo el 4-sep-2026.
  Borra los Excel del Historial del Depurador a los 90 días. 🔴 Borra el **archivo**, nunca la fila
  con los totales. Solo DB + Storage, no toca Switch. Está en `SEED_TOLERANT_CRONS`.
- El horario real de `backup?grupo=switch` es **06:45 / 11:15 / 23:30** (la tabla de `CLAUDE.md`
  está bien; el comentario del código de `cron-telemetry.ts` dice «19:15» en un lugar).

## El registro de código y la biyección

🔴 **El criterio de runtime NO mira `vercel.json`.** Mira un registro que es **constante de código**
(`src/lib/cron-telemetry.ts`), y la razón está escrita ahí: la regla ingenua «si no está en
`vercel.json`, no alerto» sería **peor que el bug** — quien borrara una entrada por accidente
apagaría la alerta junto con el cron, en silencio. Con el registro constante, borrar una entrada de
`vercel.json` **no** encoge la vigilancia: el heartbeat envejece y los dos vigías alertan.

Retirar un cron a propósito son **dos ediciones deliberadas** (`vercel.json` + el registro), y
`src/__tests__/lib/cron-registro.test.ts` **exige la biyección**: tocar uno solo pone el build ROJO.

Las tres listas:

| Lista | Qué significa | Contenido |
|---|---|---|
| `CRONS_FAIL_CLOSED` (21) | fila de heartbeat **ausente = caído** | acs-fidelizacion, acs-resumen-diario, backup, cheques-alert, cleanup-packing-lists, cleanup-sessions, grupo-resumen-mensual, integrity-check, joybees-catalogo, reebok-catalogo, refresh-clientes-views, switch-articulos, switch-reconciliacion, switch-sync, sync-clientes-master, sync-proveedores, sync-recibos, sync-utilidad, tommy-catalogo |
| `SEED_TOLERANT_CRONS` (14) | fila ausente = **todavía no sembrada**, no caída | backup-switch, backup-storage, calvin-catalogo, catalogos-fotos-resumen, boston-cartera, sync-factura-lineas, db-salud, guias-pendientes, **cleanup-depurador-archivos**, sync-articulo-info, asistencia-vigia, sync-egresos-varios, sync-ingresos-mercancia |
| `HEARTBEATS_NO_CRON` (5) | acciones **manuales**, nadie las programa | sync-now-refresh-vistas, catalogos-fotos-nuevos:{reebok,joybees,tommy,calvin} |
| `HEARTBEATS_EXTERNOS` (1) | se vigila pero **no** está en `vercel.json` | `vigia-externo` |

Cada comentario de `SEED_TOLERANT_CRONS` dice explícitamente cuándo promover el cron a
`CRONS_FAIL_CLOSED` («cuando la DDL esté corrida y lleve días sembrado»). Varios ya cumplen esa
condición y siguen ahí.

## Quién alimenta a quién

```
Switch (API JSON, token por USUARIO)
  ├─ switch-sync ?tipo=all        → switch_facturas · switch_estadocuenta · switch_costo_diario
  ├─ switch-sync ?tipo=facturas   → switch_facturas
  ├─ switch-sync ?tipo=estadocuenta → switch_estadocuenta → (vistas de aging) → CXC
  ├─ sync-recibos                 → switch_recibos       → comisión de cobro
  ├─ sync-utilidad                → switch_factura_utilidad → comisiones y costo de las ND
  ├─ sync-clientes-master         → clientes_master      → ClientePicker, Cheques, Guías, Ventas
  ├─ sync-proveedores             → switch_proveedor_estadocuenta
  ├─ sync-articulo-info           → switch_articulo_info → Ventas › Referencia, Catálogos
  ├─ switch-articulos             → switch_articulo_diario → Productos, costo, Referencia
  ├─ sync-factura-lineas          → switch_factura_lineas
  └─ 4× *-catalogo                → products/tommy_/calvin_/joybees_products → catálogos públicos

Switch (panel web Laravel, sesión que EXPULSA al humano)
  ├─ boston-cartera               → switch_estadocuenta_aging_boston → módulo Boston
  ├─ sync-ingresos-mercancia      → switch_ingresos_mercancia → «Compré», Referencia
  └─ sync-egresos-varios          → egresos_varios + cuentas_contables → Gastos

Solo base de datos (no tocan Switch)
  ├─ refresh-clientes-views       → clientes_agregado_12m_vw / clientes_empresa_12m_vw
  ├─ integrity-check              → data_integrity_checks → Data Health + 🔧 SISTEMA
  ├─ cleanup-sessions             → user_sessions + poda de switch_sync_log + candados de sync
  ├─ cleanup-packing-lists        → packing_lists (purga física a 90 d)
  ├─ cleanup-depurador-archivos   → Storage del Depurador (90 d)
  └─ db-salud                     → endpoint Prometheus de Supabase (ni tabla)

Solo salida (leen y avisan; no escriben datos de negocio)
  ├─ cheques-alert          → 📊 NEGOCIO
  ├─ guias-pendientes       → 📊 NEGOCIO
  ├─ catalogos-fotos-resumen→ 📊 NEGOCIO
  ├─ acs-resumen-diario     → 🔒 privado
  ├─ grupo-resumen-mensual  → 🔒 privado
  ├─ acs-fidelizacion       → correo
  └─ asistencia-vigia       → 🔧 SISTEMA

El que arregla a los demás
  └─ switch-reconciliacion (10/14/18 UTC) → re-ejecuta IN-PROCESS lo que no vio con success
     (cheques-alert, integrity-check, sync-clientes-master, los dos resúmenes…), levanta los
     candados atascados, y corre encima las alertas A/B de silencio y el cuadre de costo
     — CERO crons nuevos.
```

🔴 **Crons que tocan la MISMA empresa en Switch van ≥ 15 min separados**
(`SEPARACION_MINIMA_MIN`): Switch admite **un solo token válido por USUARIO** y cada empresa entra
con un único usuario de API. El sistema entra como `daniel`, así que **cada corrida saca a Daniel
del panel de esa empresa, y viceversa**.

## Los dos vigías, y la vigilancia mutua

- **Interno**: `switch-reconciliacion` (10/14/18 UTC) manda 🔧 SISTEMA por los crons stale.
- **Externo**: cron-job.org llama `GET /api/health-crons` cada hora con `HEALTHCHECK_TOKEN`
  (**no** `CRON_SECRET`, a propósito: un monitor de terceros no debe poder disparar crons).

🩸 **Incidente 29-jul-2026:** bastaba UN cron stale para devolver 503, cron-job.org deshabilitó el
monitor tras **26 fallos seguidos**, y nadie se enteró. Un cron roto le costó al sistema la
vigilancia externa de los otros ~50. Hoy:
- **200** = la vigilancia funciona (los hallazgos van en el cuerpo: `stale[]`, `staleCount`).
- **503** = la vigilancia **no puede responder por sí sola**: el watchdog interno está caído, hay
  caída masiva (≥ `UMBRAL_CAIDA_MASIVA`), o no se pudo leer `cron_heartbeats`.

Y **el que vigila también es vigilado**: cada llamada autenticada escribe el heartbeat
`vigia-externo`; si cron-job.org deja de llamar, esa fila envejece y el watchdog interno lo reporta
a las 26 h. Ninguno de los dos puede morir callado, sin agregar un tercer vigilante.

`health-crons` es además **recovery-aware**: un cron stale no cuenta para el 503 si tiene
recuperación conocida, esa recuperación aún viene hoy, y lleva stale < 30 h. Sale como
`pendingRecovery[]` con 200. **`switch-reconciliacion` y `grupo-resumen-mensual` jamás se silencian**,
y un cron sin heartbeat (fila ausente) tampoco.

## `cron_heartbeats` — 74 filas

Columnas: **`cron_name`** (⚠️ no `job`) y `last_success_at`. Nada más.
Medido: hay **19 filas de marcas retiradas** (`switch-sync:<slot>#recuperado` / `#visto`) con más de
20 días de antigüedad, la más vieja de hace **41 días** (`switch-sync:all-0535#recuperado`,
25-jul-2026). No alertan —`esHeartbeatNoVigilable` las salta— pero envejecen para siempre.
`esHeartbeatHuerfano()` existe justo para que un TEST exija que no queden; `sync-mayor` se barre en
la migración `20260914120000`.

---

## Por qué está así

| Decisión | Cita / fecha |
|---|---|
| **Una entrada = una ocurrencia al día. NUNCA una lista de horas** | Vercel Pro acepta `0 15,19,23 * * *`, pero entonces las tres ocurrencias comparten un solo «slot» y no se puede saber cuál falló |
| **El criterio de runtime NO mira `vercel.json`** | *«La regla ingenua sería "si no está en vercel.json, no alerto" — y sería PEOR que el bug: quien borrara una entrada por accidente apagaría la alerta del cron junto con el cron, en silencio»*. El registro es **constante de código** y el test exige la biyección |
| **≥ 15 min entre crons de la misma empresa** | la sesión de Switch es por USUARIO. Ver §10 |
| **Los crons de login web van de madrugada de Panamá** | cada login web **expulsa a Daniel del panel**. Y su recuperación solo corre en la pasada de las 10:00 UTC: *«un fallo de la corrida de las 2 a.m. se "arreglaba" sacando a Daniel de Switch a las 9 de la mañana»* |
| **Los 4 catálogos pasaron de 2 a 4 pasadas diarias** | 13-ago-2026, todas dentro de la ventana de uso de Panamá (14:30–22:10 UTC = 9:30 a.m.–5:10 p.m.) |
| **El código HTTP de `health-crons` dice «¿la vigilancia funciona?», no «¿hay hallazgos?»** | 29-jul-2026. Bastaba UN cron stale para devolver 503; cron-job.org deshabilitó el monitor tras **26 fallos seguidos**. *«Un cron roto le costó al sistema la vigilancia externa de los otros ~50»* |
| **Vigilancia mutua en vez de un tercer vigilante** | *«El arreglo NO es otro cron (que también podría morirse en silencio)»*: si el vigía externo se cae, deja de escribir su heartbeat y el watchdog interno lo reporta a las 26 h |
| **`health-crons` usa `HEALTHCHECK_TOKEN`, no `CRON_SECRET`** | *«un monitor de terceros no debe poder disparar crons»* |
| **`switch-reconciliacion` y `grupo-resumen-mensual` JAMÁS se silencian** | el primero es el watchdog; el segundo es demasiado esporádico para asumir «recuperación en camino» |
| **Un candado de sync atascado se suelta solo a los 30 min** | `RUNNING_STALE_MIN`, derivado del techo real de 800 s de la función |
| **La poda de `switch_sync_log` va colgada de `cleanup-sessions`** | *«es el único cron de limpieza puramente de DB que ya existía, así que la poda se engancha aquí en vez de agregar una entrada nueva a vercel.json»* |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **`multifashion-sync`** | 26-jul-2026 | `multifashion_tickets` quedó congelada. Su fila en `cron_heartbeats` quedó **huérfana** — el motivo por el que existe `esHeartbeatHuerfano()` |
| **`sync-mayor`** (09:05) | 13-ago-2026 | Daniel: ***«y entonces borra Mayor contable en el sistema»***. Un login web menos por día. Su fila huérfana se barre en la migración `20260914120000` |
| **11 pasadas de `db-salud`** → 5 | 30-jul-2026 | Poda de alertas. ⚠️ La tabla de `CLAUDE.md` decía 11 hasta el 31-ago |
| **La pasada de `asistencia-vigia` de las 13:45 UTC** | 10-ago-2026 | Quedaron 3 |
| **El umbral propio de `asistencia-vigia`** | — | Corriendo todos los días su hueco más largo es 16 h 45 y el default de 26 h lo cubre. Hacía falta cuando corría solo de lunes a viernes |
| **Los catálogos recuperándose en la pasada de las 14:00** | tras el incidente del 25-jul-2026 | `tommy-catalogo` se re-sincronizaba en **cada** pasada hasta reventar la invocación por `FUNCTION_INVOCATION_TIMEOUT`. Hoy la hora mínima es 15 → **solo la pasada de las 18:00 los recupera**. ⚠️ Consecuencia escrita, no escondida: los slots de las 19:4x y 21:5x/22:1x **no tienen recuperación el mismo día** |
| **Fusionar los 3 grupos de backup en uno** | — | Nació bajo el techo de 300 s del plan Hobby. Con Pro cada grupo tiene 800 s propios; volver a fusionarlos *«se decide con datos, no aquí»* |

## Cuánto se usa

| Señal | Medida (4-sep-2026) |
|---|---|
| Entradas en `vercel.json` | **80** de un límite de 100 |
| Paths distintos | **30** |
| Ocurrencias por día (suma de entradas diarias) | **78** (las otras 2 son la semanal y la mensual) |
| Filas en `cron_heartbeats` | **74** |
| Filas huérfanas (marcas de slots retirados) | **19**, la más vieja de hace **41 días** |
| Filas en `switch_sync_log` | **9.119**, podadas a 90 días conservando siempre las 10 últimas de cada par |
| Crons que abren sesión en el **panel web** | **4** (utilidad, boston-cartera, ingresos, egresos) — los que expulsan a Daniel |
| Crons que **no** tocan Switch | 10 (backups, limpiezas, integridad, refresh de vistas, db-salud, los avisos) |

## Qué papeles y Excel produce

🔴 **Ninguno directamente.** Los crons producen **filas en tablas**, **mensajes de Telegram** (§7),
**archivos de backup** (§9) y **un correo**: `acs-fidelizacion`.

## Cómo probarlo a mano

1. **¿Está todo verde?** `GET /api/health-crons?token=<HEALTHCHECK_TOKEN>`.
   **200** = la vigilancia funciona (los hallazgos van en el cuerpo: `stale[]`, `staleCount`,
   `pendingRecovery[]`, `slotsCubiertos[]`). **503** = la vigilancia no puede responder por sí sola.
2. **¿Cuándo corrió bien por última vez cada uno?** La tabla `cron_heartbeats`, columnas
   **`cron_name`** (⚠️ no `job`) y `last_success_at`.
3. **Disparar uno a mano:** todos aceptan `?secret=<CRON_SECRET>` o `Authorization: Bearer`, y
   varios además la cookie de admin (`cheques-alert`, `integrity-check`, `cleanup-sessions`).
   ⚠️ **Los que tocan Switch abren sesión**: respeta la regla de los 15 min y hazlo de madrugada si
   es de los cuatro del panel web.
4. **Que la biyección esté sana:** `npm test` — `cron-registro.test.ts` compara `vercel.json` contra
   el registro de código y pone el build **rojo** si se tocó uno solo.
5. **Ver qué descartó una corrida:** `switch_sync_log`, columnas `records_skipped` y
   **`skip_details`** (jsonb).

## Qué lo rompe

Ver §11 para el mapa completo de qué se cae con cada cron. Lo propio del mecanismo:

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Se borra una entrada de `vercel.json` por accidente** | ese cron deja de correr, **pero la vigilancia NO se apaga** (el registro es constante de código): el heartbeat envejece y los dos vigías alertan | 🔧 SISTEMA a las 26 h + `stale[]` en `health-crons`. Y el build se pone **rojo** en CI por la biyección |
| **Se retira un cron correctamente** (las dos ediciones) | deja de vigilarse, y su fila de `cron_heartbeats` queda **huérfana**: no alerta pero envejece para siempre | `esHeartbeatHuerfano()` existe para que un test lo exija; se barre con una migración |
| **Se pasan las 100 entradas** | Vercel rechaza el deploy | error de despliegue |
| **Dos crons de la misma empresa quedan a < 15 min** | se tumban el token de Switch | `cron-calendario.test.ts` lo impide en CI. En producción, uno falla limpio |
| **Un cron largo desborda su ventana** | el margen real es menor que la distancia inicio-contra-inicio que mide el test | por eso los pares de crons largos se dejaron a **≥ 50 min** |
| **La reconciliación se cae** | 🔴 se cae el watchdog interno **y** la recuperación de todos los colaterales | `health-crons` devuelve **503** — es una de sus tres condiciones |
| **cron-job.org deshabilita el monitor** | se cae la vigilancia externa | el heartbeat `vigia-externo` envejece → el watchdog interno lo reporta a las 26 h. Es lo que faltó el 29-jul-2026 |
| **Un `sync_type` nuevo que no está en el CHECK de `switch_sync_log`** | la corrida **no deja fila**: invisible, corra bien o mal | `SYNC_LOG_TYPES` + `sync-log-tipos-check.test.ts` |


# 9. Los backups y la réplica a R2

## Las tres corridas

Un solo path, `/api/cron/backup`, con tres «grupos» y **ocho entradas** en `vercel.json`:

| Grupo | Entradas UTC | Qué copia | Heartbeat |
|---|---|---|---|
| **core** (sin params) | 06:00 · 10:30 · 18:30 | **113 tablas** manuales/config (114 archivos: `fg_users` sale en dos) → `backups/YYYY-MM-DD/<tabla>.ndjson.gz` + `meta.json` | `backup` |
| **`?grupo=switch`** | 06:45 · 11:15 · **23:30** | **11 tablas `switch_*` + `multifashion_tickets`** (12) → misma carpeta + `meta-switch.json` | `backup-switch` |
| **`?grupo=storage`** | 04:00 · 15:30 | los ~3.2 K archivos de 5 buckets → **solo a R2**, `_storage/<bucket>/<path>` | `backup-storage` |

Las 2ª y 3ª entradas de cada grupo son **«segunda oportunidad»**: no-op si una anterior ya registró
success hoy (`cronSuccessHoyUtc`).

🔴 **La alerta espera la segunda oportunidad.** Un fallo a las 06:00 ya no le suena el celular a
Daniel si a las 10:30 se arregla solo — eso viola la regla del canal de sistema. Lo que **no**
cambia: la **última** entrada del día siempre alerta; el fallo se persiste igual en
`cron_email_errors`; sin heartbeat, `health-crons` y el watchdog lo ven stale.
`alertaDeBackupEsperaSegundaOportunidad()`.

## Formato y contenido

NDJSON gzipeado **por tabla**, paginado de a 1.000 con **orden estable** (`ORDER_BY`, default `id`).
Reemplazó un `backup.json` monolítico que **truncaba a 1.000 filas** por el cap silencioso de
PostgREST.

🩸 **Una tabla cuya llave primaria NO es `id` y no está en `ORDER_BY` deja un respaldo INCOMPLETO
que parece completo**: sin orden determinista, PostgREST puede saltear filas entre página y página y
nada lo dice. Hasta el 5-sep-2026 el `ORDER_BY` tenía **tres** excepciones escritas a mano; hoy son
**19**, y no se escriben a ojo: la llave real de producción vive medida en `PK_QUE_NO_ES_ID`
(`src/lib/backup/tablas.ts`) y `backup-nada-sin-copia.test.ts` exige que el `ORDER_BY` la cubra
**columna por columna** para toda tabla respaldada — y que no sobre ninguno.

🔴 **Los hashes de contraseña van en archivo aparte**: `fg_users.ndjson.gz` **sin** `password`, y
`fg_users_auth.ndjson.gz` con `id, name, password`. Los dos en el mismo bucket privado — para que un
restore no deje a todos sin login.

**Por qué el split core / switch:** ~310 K filas extra ≈ 160-175 MB NDJSON ≈ 310 páginas de fetch
(60-150 s) + gzip + doble upload. Nació bajo el techo de 300 s del plan Hobby; con Pro son 800 s por
grupo. Prioridad dentro del grupo switch: **`switch_articulo_diario` primero** porque es
**IRRECUPERABLE de Switch** (el API solo da el stock del día; el histórico diario solo existe aquí).

## La réplica a Cloudflare R2 (`src/lib/backup/r2.ts`)

- **Datos**: `data/YYYY-MM-DD/…`, con **fecha en el path**. Antes eran paths estables y R2 tenía UN
  solo punto en el tiempo: un borrado lógico replicado hoy dejaba el backup off-site igual de roto.
- **`meta.json` y `meta-switch.json` también se replican**: sin el meta, `scripts/restore.mjs` no
  puede correr desde R2 (es su índice de datasets).
- **Storage**: paths **estables** `_storage/<bucket>/<path>` — son binarios inmutables; versionarlos
  por fecha multiplicaría 198 MB por día sin ganar nada.
- **Manifest** (`key → "size|sha256"`): solo se sube lo que cambió. Cubre el catch-up del **mismo
  día**; **no es dedup entre días** (mañana son keys nuevas). El manifest de datos se poda a 7 días.
- 🔴 **Verificación post-subida (HEAD)** tras cada PUT: sin esto, un PUT «200 pero vacío» quedaba en
  el manifest y jamás se reintentaba.
- 🔴 **Verificación de lo OMITIDO** (HEAD muestreado): un key con firma igual se omitía **para
  siempre** aunque alguien lo hubiera borrado en R2, y el cron reportaba éxito. Ahora se verifican
  todos los ~57 de datos y una ventana rotativa de los ~3.2 K de Storage.
- **Deadlines**: `R2_DEADLINE_MS = 740 s` y `STORAGE_R2_DEADLINE_MS = 740 s`. Lo que no entra queda
  **pendiente** y lo toma la corrida siguiente.

## Completitud y retención

🔴 **`saludR2`**: una carpeta `data/<fecha>/` la escriben **DOS** invocaciones (core y switch) y con
una sola **el día NO se restaura**. Pasó el 25-jul-2026: el deploy entró después de la corrida core,
las entradas extra fueron no-op, y `restore.mjs --list` mostraba esa fecha como disponible mientras
el restore moría con 404 en `meta.json`. Ahora la corrida core evalúa **AYER** y alerta por 🔧
SISTEMA si quedó a medias.

| Destino | Retención |
|---|---|
| Supabase Storage | `RETENTION_DAYS = 21` días (bajó de 30 — el histórico largo vive en R2) |
| Cloudflare R2 | política **calculada y reportada** (`retencionR2`: 21 diarios + 8 semanales + 24 mensuales ≈ 53 carpetas ≈ 1,6 GB) pero 🔴 **NO BORRA NADA**. Un *lifecycle rule* de Cloudflare no sabe hacer abuelo-padre-hijo, así que la poda tiene que ser código — queda para un PR aparte, con la lógica ya escrita en `r2RetentionPlan()` |

🔴 **La réplica bucket→bucket dentro de Supabase se ELIMINÓ el 26-jul-2026, con medición**: eran
1.597 archivos / 103,2 MB del **MISMO proyecto** —cero red de seguridad si se pierde el proyecto—
ocupando el 18 % del GB del plan. Además llegaba tarde y a medias: nunca había copiado `marketing`
(55,1 MB) ni `joybees-photos` (15,9 MB). Antes de borrarla se verificó archivo por archivo que R2
tuviera los 3.204 originales con el mismo tamaño, y 20 al azar coincidieron byte a byte (sha256).
**NO reintroducir la copia intra-Supabase.**

## Restore

`scripts/restore.mjs` — acepta `--source r2` para leer los mismos objetos desde R2, y
`--storage <bucket>` para el camino de vuelta R2 → Supabase (probado el 26-jul con escritura real de
1 archivo, sha256 idéntico).

## 🔴 Qué NO se respalda

Comparación medida (`definitions` del OpenAPI de PostgREST contra los `{ table: "..." }` del route):
**56 tablas respaldadas; 103 definiciones fuera** — descontando ~20 vistas y materializadas y las
tablas re-derivables de Switch, **quedan estas tablas escritas por personas y sin ninguna copia**:

| Tabla | Filas | Qué se perdería |
|---|---|---|
| **`asistencia_marcaciones`** | **6.081** | 🔴 lo que marcó el reloj. **Append-only e irrecuperable**: el reloj no reenvía el pasado |
| `asistencia_horas_extra_aprobadas` | 521 | las aprobaciones de horas extra |
| `asistencia_personas` / `_horarios` | 40 / 40 | sueldos, saldos de vacaciones, horarios |
| `asistencia_planilla_manual` | 26 | montos escritos a mano en la planilla |
| `asistencia_justificaciones` | 23 | ausencias justificadas |
| `asistencia_feriados` | 22 | el calendario de feriados |
| `asistencia_correcciones` | 8 | las correcciones firmadas sobre marcaciones |
| `asistencia_aprobador_empresa` | 6 | quién aprueba qué empresa |
| `asistencia_vacaciones` / `_reparto_empresa` | 2 / 2 | vacaciones cargadas, sueldos repartidos |
| `asistencia_reglas` | 1 | 🔴 **el singleton con toda la parametrización del cálculo** |
| `cuentas_contables` | 987 | el catálogo de cuentas |
| `egresos_varios` | 709 | los gastos cargados (se reemplazan mes a mes: solo vive la ventana cargada) |
| `depurador_descripciones` | 281 | descripciones editadas a mano en el Depurador |
| `carga_history` | 140 | el historial del Depurador |
| `tommy_products` / `calvin_products` / `joybees_products` | 552 / 94 / 83 | ⚠️ `products` (Reebok) **sí** está |
| `tommy_orders` / `joybees_orders` / `calvin_orders` (+ sus `_items` y `_pedidos_publicos`) | 38 / 41 / 21 | ⚠️ `reebok_orders`, `reebok_order_items` y `reebok_pedidos_publicos` **sí** están |
| `bancos_saldos` | 52 | 🔴 los saldos de banco, escritos **a mano por contabilidad** |
| `guias_destino_cliente` | 34 | los destinos por cliente de Guías |
| `fg_user_switch_vendedor` | 28 | el mapeo vendedor↔Switch que hace que los pedidos puedan salir |
| `comision_exclusion` | 18 | 🔴 los clientes que no comisionan (soft delete = historial) |
| `mk_periodos` / `mk_mobiliario_notas_proveedor` / `mk_impulsadoras` | 6 / 6 / 2 | marketing |
| `gastos_categorias` | 6 | categorías de gasto |
| `comision_vendedor_alias` | 5 | el mapa de grafías → persona |
| `fg_user_module_order` | 3 | el orden de módulos por usuario |
| `cheque_vendedores` | 2 | Rey y Edwin |
| `comision_descuentos_fijos` | 2 | descuentos fijos de comisión |
| `multifashion_metas` | 1 | la meta cargada |
| **`recordatorios`** | 0 | (hoy nada) |
| `data_integrity_checks` · `activity_logs` · `user_sessions` · `cron_heartbeats` · `login_attempts` | 821 / 2.877 / 1.039 / 74 / 4 | auditoría e infraestructura |

**El módulo Asistencia y Planilla entero está fuera del backup.** Es la ausencia más grande: las
6.081 marcaciones del reloj no se pueden volver a pedir a ninguna parte.

---

## Por qué está así

| Decisión | Cita / fecha / medición |
|---|---|
| **NDJSON por tabla, no un JSON monolítico** | el `backup.json` v1 **truncaba a 1.000 filas** por el cap silencioso de PostgREST y recortaba por ventanas de 30 d/3 m/6 m. O sea: había backup y no servía |
| **Los hashes van en archivo aparte** | *«para que un restore no deje a todos sin login»* |
| **`switch_articulo_diario` va primero dentro de su grupo** | es la **irrecuperable de Switch** (el API solo da el stock del día; el histórico diario solo existe en la base). *«Si la corrida muriera a mitad, lo más valioso ya quedó subido»* |
| **El split en tres grupos** | medido el 23-jul-2026: ~310 K filas extra ≈ 160-175 MB NDJSON ≈ 310 páginas de fetch (60-150 s) + gzip + doble upload |
| **Paths CON FECHA para los datos** | antes eran estables y **R2 tenía UN solo punto en el tiempo**: un borrado lógico replicado hoy dejaba el backup off-site igual de roto |
| **Los archivos de Storage van a paths ESTABLES** | son binarios inmutables identificados por contenido: versionarlos por fecha multiplicaría 198 MB por día sin ganar nada |
| **Verificación HEAD después de cada PUT** | *«sin esto un PUT "200 pero vacío" quedaba en el manifest y jamás se reintentaba»* |
| **Verificación de lo OMITIDO** | un key con firma igual se omitía **para siempre** aunque alguien lo hubiera borrado en R2, y el cron reportaba éxito |
| **`saludR2` evalúa AYER, no hoy** | una carpeta la escriben DOS invocaciones y hoy el hueco core→switch es normal. Pasó el 25-jul-2026: `restore.mjs --list` mostraba una fecha como disponible mientras el restore moría con 404 en `meta.json` |
| **La retención de R2 se CALCULA y se reporta, pero no borra** | *«un lifecycle rule de Cloudflare no sabe hacer abuelo-padre-hijo (es por prefijo+edad), así que la poda tiene que ser código»* |
| **21 días en Supabase** | bajó de 30 en jul-2026 porque el histórico largo vive en R2, que es gratis hasta 10 GB |
| **La alerta espera la 2ª oportunidad** | 3 de las 5 alertas de backup de un mes eran fallos que se arreglaban solos. *«Eso viola la regla del canal de sistema: si se arregla solo en horas, no es un incidente — es el sistema funcionando»* |
| **`multifashion_tickets` sigue en el backup aunque la tabla esté congelada** | *«mientras las 15.819 filas existan, esta es la única copia que las protege, y una tabla congelada comprime igual todos los días. Cuando se decida borrar la tabla, se saca de aquí en el MISMO cambio — nunca antes»* |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **El `backup.json` monolítico (v1)** | jul-2026 | Truncaba a 1.000 filas y recortaba por ventanas |
| 🔴 **La réplica bucket→bucket DENTRO de Supabase** (`backups/_storage/`) | 26-jul-2026, **con medición** | Eran **1.597 archivos / 103,2 MB del MISMO proyecto** — o sea **cero red de seguridad si se pierde el proyecto** — ocupando el **18 % del GB del plan** (Storage estaba al 56 %). Además llegaba tarde y a medias: nunca había copiado `marketing` (55,1 MB) ni `joybees-photos` (15,9 MB). Antes de borrarla se verificó archivo por archivo que R2 tuviera los **3.204 originales** con el mismo tamaño, y una muestra de 20 descargada de ambos lados coincidió **byte a byte (sha256)**. El camino de vuelta se probó de verdad el 26-jul: escritura R2→Supabase de 1 archivo, sha256 idéntico. 🔴 **NO reintroducir: no protege de nada y se come el plan** |
| **Paths estables para los datos en R2** | jul-2026 | Cada corrida sobreescribía |
| **`reclamo-zips-privado` en la réplica de Storage** | — | Son exports generados, **re-derivables** |
| **`RETENTION_DAYS = 30`** | jul-2026 | Bajó a 21 |

## Cuánto se usa

⚠️ El resultado de cada corrida **no se guarda en ninguna tabla**: solo el heartbeat y, ante un
fallo, `cron_email_errors`. Lo medible:

| Señal | Medida |
|---|---|
| Tablas respaldadas | **125** (113 en el grupo core + 12 en el de switch), de **136 tablas** vivas (159 relaciones con vistas y materializadas) |
| Tablas escritas por personas y **sin copia** | **0** — y hay candado que pone el build rojo si vuelve a haber una. Eran **63** hasta el 5-sep-2026, la más grave `asistencia_marcaciones` (6.081 filas, append-only, irrecuperable) |
| Buckets de Storage replicados | **5** (`reclamo-fotos`, `reclamo-facturas`, `product-images`, `joybees-photos`, `marketing`) ≈ 3.204 archivos / 198 MB |
| Entradas de cron | **8** (3 + 3 + 2) |
| Heartbeats propios | 3: `backup` (fail-closed), `backup-switch` y `backup-storage` (seed-tolerant) |
| Restauraciones hechas | **1 prueba real** documentada: 26-jul-2026, R2→Supabase de 1 archivo, sha256 idéntico. **Nunca se restauró un dataset completo** |
| Duración medida | corrida core: **248 s** el 25-jul-2026 (contra un techo de 800 s) |

## Qué papeles y Excel produce

No son «papeles» para nadie de afuera, pero son **los archivos más importantes del sistema**:

| Archivo | Dónde vive | Qué lleva |
|---|---|---|
| `backups/YYYY-MM-DD/<tabla>.ndjson.gz` | Supabase Storage (bucket privado `backups`) **y** R2 en `data/YYYY-MM-DD/` | una línea JSON por fila, gzipeada |
| `backups/YYYY-MM-DD/meta.json` | los dos | el índice de datasets del grupo **core** con sus conteos. **Sin él, `restore.mjs` no puede correr** |
| `backups/YYYY-MM-DD/meta-switch.json` | los dos | lo mismo para el grupo switch |
| `fg_users.ndjson.gz` | los dos | la ficha del usuario **sin** `password` |
| `fg_users_auth.ndjson.gz` | los dos | 🔴 `id, name, password` — los hashes bcrypt, aparte |
| `_storage/<bucket>/<path>` | **solo R2** | los archivos subidos a mano: fotos de producto, facturas de reclamos, adjuntos de marketing |
| `_storage/meta-r2.json` | R2, fuera de las carpetas de fecha | el resumen de la réplica de Storage, para auditarla **sin credenciales de R2** |

**Quién los recibe:** nadie. Son privados. El único consumidor es `scripts/restore.mjs`.

## Cómo probarlo a mano

1. **¿Qué días hay disponibles?** `node scripts/restore.mjs --list` (y `--source r2` para preguntarle
   a Cloudflare en vez de a Supabase).
2. **La prueba que importa — que el día esté COMPLETO:** una fecha necesita **`meta.json` Y
   `meta-switch.json`**. Con uno solo, `--list` la muestra y el restore muere con 404.
   El cron ya lo vigila con `saludR2` sobre la carpeta de AYER.
3. **Correr un backup a mano:** `GET /api/cron/backup?secret=<CRON_SECRET>` (o
   `&grupo=switch` / `&grupo=storage`). ⚠️ Si una corrida de hoy ya registró success, **es no-op**.
   La respuesta trae `retencionR2` y `saludR2`.
4. **Dónde confirmar que quedó:** en Supabase Storage, bucket `backups`, carpeta con la fecha de
   hoy: tienen que estar los ~48 `.ndjson.gz` del core más `meta.json`.
5. **Probar el camino de vuelta sin romper nada:** `scripts/restore.mjs --source r2 --storage
   <bucket>` sobre **un archivo**, y comparar el sha256 de los dos lados. Es exactamente lo que se
   hizo el 26-jul-2026 antes de borrar la réplica intra-Supabase.

## Qué lo rompe

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Faltan las env `R2_*`** | la réplica off-site se omite con `enabled:false` y una nota. **El backup a Supabase sigue** | solo en la respuesta del cron. 🔴 Nada avisa que ya no hay copia fuera de Supabase |
| **Solo corre una de las dos invocaciones de un día** | 🔴 **ese día NO se puede restaurar** | `saludR2` lo detecta al día siguiente y manda 🔧 SISTEMA |
| **Una tabla nueva no se agrega a `DATASETS`** | ✅ **el build se pone ROJO** desde el 5-sep-2026 | `backup-nada-sin-copia.test.ts` lee los `create table` de todas las migraciones y exige que estén clasificados en `src/lib/backup/tablas.ts`; si la clase es `personas` o `congelada`, exige además que estén en el route. Hasta ese día no lo decía nada, y así se quedaron afuera Asistencia entera, los 3 catálogos nuevos, el catálogo de Reebok, la configuración de comisiones y los saldos de banco |
| **Una tabla nace desde el panel de Supabase, sin migración** | el candado estático no la ve | La agarra `backup-tablas-produccion.test.ts` (`RUN_DB_TESTS=1`), que compara contra el catálogo real. 31 de las 136 tablas de hoy nacieron así |
| **Se dropea una tabla que sigue en `DATASETS`** | la corrida falla en esa tabla y se corta | fallo del cron |
| **Una tabla cuya PK no es `id` y no está en `ORDER_BY`** | la paginación **no es determinista**: PostgREST puede saltear filas entre páginas y el respaldo queda incompleto **pareciendo completo** | ✅ **el build se pone ROJO** desde el 5-sep-2026: la PK real de producción vive medida en `PK_QUE_NO_ES_ID` y el candado exige que el `ORDER_BY` la cubra columna por columna. Antes no lo decía nada |
| **Se pasa el deadline** | lo que no entró queda **pendiente** y lo toma la corrida siguiente (el manifest solo registra lo verificado) | la respuesta lo reporta |
| **Alguien borra un objeto en R2** | ya está cubierto: los omitidos se verifican (todos los ~57 de datos; ventana rotativa para los ~3.2 K de Storage) y lo que no exista se re-sube | — |
| **El cron `backup?grupo=storage` no corre** | los archivos subidos a mano no se replican | 🔴 **Nada lo dice** en pantalla; el manifest hace catch-up al día siguiente. Su heartbeat es **seed-tolerant**, o sea vigilancia más floja |
| **`multifashion_tickets` se borra sin sacarla del backup** | la corrida falla en esa tabla | fallo del cron. Por eso la regla es sacarla **en el mismo cambio** |


# 10. Switch Soft — las dos vías, la sesión por USUARIO y qué pasa cuando cambia un formato

> Esta sección es transversal a propósito: **casi todo el dato de negocio del sistema entra por
> aquí**, y las tres reglas de abajo explican por qué los crons están a las horas que están.
> El detalle dato por dato vive en [`docs/switch-flujo.md`](../switch-flujo.md) (por dato),
> [`docs/switch-referencia.md`](../switch-referencia.md) (por endpoint) y
> [`docs/switch-panel.md`](../switch-panel.md) (el panel). Aquí va lo que hace falta para entender
> **el mecanismo**, verificado contra el código el 4-sep-2026.

## Qué es

Switch Soft es el ERP externo del grupo — una instancia por empresa, ocho en total. **No
controlamos nada de él**: puede cambiar el formato de un reporte, mover un endpoint o pegar dos
datos en una celda, sin avisar. Pasó **tres veces este año**.

## Las dos vías de entrada

| | **API JSON** (`src/lib/switch-api/client.ts`) | **Panel web** (`src/lib/switch-api/web-client.ts`) |
|---|---|---|
| **Cómo entra** | `POST /autenticacion {usuario, password}` → token JWT. El header es `Authorization: <token>` **sin `Bearer`** | `GET /users/login` (cookies + `_token` CSRF) → `POST /users/login` multipart con **`changesession: "SI"`** |
| **Credenciales** | `SWITCH_<EMPRESA>_API_URL / _API_USER / _API_PASSWORD` | la misma URL base + `SWITCH_<EMPRESA>_WEB_USER / _WEB_PASSWORD` |
| **Ojo con los prefijos** | `SWITCH_EMPRESA_ENV_MAP`: vistana = `VISTANA_INTERNATIONAL`, ACS = `MULTIFASHION` | igual |
| **Qué entra por aquí** | facturas y notas · renglones de factura · costo del día · ventas por artículo y día · caja de ACS · **cartera del grupo** · recibos · clientes · fidelización · artículos y los 4 catálogos · proveedores · pedidos y cotizaciones | **utilidad por documento** · **cartera de Boston** · **llegadas de mercancía** · **egresos varios** · cuentas contables · lo que se baja a mano |
| **Por qué existen las dos** | tiene JSON tipado, paginación y token renovable | trae lo que el API **no expone**: costo por documento, el reporte de antigüedad completo, caja y bancos, el detalle de ingreso de mercancía |
| **Cómo sale** | `POST /cierresesion` en el `finally` de cada cron (`logoutAllSwitchSessions`) | `GET /users/logout`, best-effort |
| **Cómo falla** | errores como `{error:{code,http_code,message}}`, **a veces con HTTP 200**. `0005` = token expirado (renueva con `new_token`, sin re-login) · `0006` = **te sacaron** (re-login) | 🔴 **el HTML de la página de excepción llega con HTTP 200** (`jsonDeSwitch`); un 302 a `/users` = sesión caída |
| **Reintentos** | 3 con backoff ante red/timeout/5xx/401; los logins en vuelo se deduplican por empresa | `LOGIN_MAX_ATTEMPTS = 3` |

## 🔴 La sesión es por USUARIO, no por empresa

Está en el PDF oficial del API, **página 6**: *«solo habrá un token válido a la vez por usuario»*
(`docs/switch/api-documentacion.pdf`, citado en `client.ts`). Medido y confirmado el 3-sep-2026.

**El sistema entra como `daniel`** en 7 de las 8 empresas por el API, y **con el usuario de Daniel**
por la web. De ahí salen todas las consecuencias:

1. **Cada cron o script que abre sesión SACA A DANIEL del panel de esa empresa.** Y al revés: si
   Daniel entra al panel mientras corre un cron, el cron recibe `0006` y re-loguea — o falla, y la
   reconciliación lo reintenta.
2. **Dos crons del sistema sobre la misma empresa se tumban entre sí.** Por eso existe
   **`SEPARACION_MINIMA_MIN = 15`** (`src/lib/cron-telemetry.ts`): los crons que tocan la misma
   empresa van a **≥ 15 min**, y **≥ 50 min** los largos. El calendario vive en
   `SWITCH_CRON_ENTRADAS` y `src/__tests__/lib/cron-calendario.test.ts` recorre todos los pares.
   ⚠️ **El margen real es menor que la distancia inicio-contra-inicio** que mide el test, porque
   los crons largos siguen corriendo: `estadocuenta` ~152 s por empresa (máximo), catálogos medidos
   el 12-ago-2026 — **26 s (joybees) · 49 s (reebok) · 70 s (calvin) · 156 s (tommy)** —, y la
   reconciliación hasta 740 s. Esas parejas se dejaron a ≥ 50 min a propósito. La más ajustada que
   queda hoy es `acs-fidelizacion` 16:30 → ventas de ACS 17:00 (30 min, y la de 16:30 es no-op si la
   de 11:30 salió bien).
3. **Los crons que entran por el PANEL van todos de madrugada de Panamá**, justamente para no
   expulsar a nadie en horario de oficina: `sync-utilidad` 07:00 (02:00 Panamá) ·
   `boston-cartera` 08:10 (03:10) · `sync-ingresos-mercancia` 09:05 (04:05) ·
   `sync-egresos-varios` 10:35 (05:35). Y **solo se recuperan en la pasada de reconciliación de las
   10:00**, nunca en las de las 14:00 y 18:00.
4. **El API y el panel de la misma empresa también chocan entre sí.** El botón «Actualizar ahora»
   de un módulo puede expulsar a quien esté en el panel.
5. **El MCP `Switch`** (`ventas_resumen`, `inventario`, `estado_cuenta_cliente`…) entra con **su
   propia sesión** y vale exactamente la misma regla: una consulta a las 10:00 de Panamá choca con
   lo que esté corriendo.
6. Lo único que **no** consume sesión: `GET /validar` (¿está vivo Switch?) y el token renovado por
   `new_token`.
7. 🔴 **Un usuario dedicado por empresa lo resolvería. Daniel dijo que NO** (3-sep-2026, textual:
   ***«no»***). **No volver a proponerlo.**

**Un candado más, del lado nuestro:** `switch_sync_log` tiene un **índice único parcial sobre
`status='running'`** por `(empresa_key, sync_type)` — una sola corrida a la vez por par. Una corrida
atascada **se suelta sola a los 30 min** (`RUNNING_STALE_MIN`, derivado del techo de 800 s de la
función), y la sueltan dos lugares: `cleanup-sessions` (02:30) y `switch-reconciliacion`
(10/14/18).

## Qué pasa cuando Switch cambia un formato — pasó tres veces este año

| Cuándo | Qué cambió | Qué se rompió | Cómo se descubrió | Cuánto duró |
|---|---|---|---|---|
| **12-ago-2026** | el catálogo de Calvin devolvió menos páginas de las esperadas | el sync escribió **4 productos de ~80** y se anotó **`success`** | 🔴 **Por accidente.** Un `success` con casi nada no lo mira nadie | — |
| **19-ago-2026, 12:37:21** | Switch **reescribió su motor de reportes**: `POST /estadodecuenta/obtener` **dejó de existir** y pasó a devolver la página de excepción con `Controller method not found` adentro — **con HTTP 200** | la **cartera de Boston** se congeló. Último sync bueno: 19-ago 03:10. Primer fallo: 20-ago 03:10. **Cinco corridas seguidas caídas** (20, 21, 22, 23 y 24) | 🔴 Por accidente. Y peor: **la pestaña de Boston no mencionaba la fecha del dato ni una vez** — mostraba `$187.018,00 · 383 clientes` como si fuera de hoy, y era del 19. *«Un número viejo presentado como actual es peor que no tener número: con el número ausente uno pregunta; con el número puesto, uno cobra»* | **5 días** |
| **1-sep-2026** | **segunda ola del mismo cambio**: el reporte de Egresos Varios empezó a mandar `"6.03.98.00.00 - GASTO DE TARJETA DE CREDITO"` donde antes mandaba el código pelado | el ancla `$` del validador de cuenta tiró **el 100 % de los renglones** (378 por empresa). El sync se cortó entero y quedó en `error`. **El módulo Gastos estuvo dos días sin datos** | por la **regla 2** (dos `error` seguidos del mismo par) — y *«de pura casualidad»*: en el contrafáctico donde Switch no da error, la regla 2 **no habría sonado nunca** | **2 días** |

**Lo que se construyó por eso** (y que hoy es la red de seguridad):

- 🔴 **«El silencio no cuenta como que está bien»** (2-sep-2026): dos avisos hermanos colgados de la
  reconciliación, sin crons nuevos. **A** = un sync trajo CERO con `status = success` donde ese par
  siempre trae cientos. **B** = una tabla de negocio dejó de recibir **escrituras**. Con tres
  candados estadísticos por par antes de opinar (≥10 corridas previas, mediana ≥10, ni un cero en
  esa historia) y **solo** para syncs que reescriben un universo completo. Backtest de 96 días:
  **0 falsos positivos**; sin el filtro, 14. `src/lib/alertas/silencio-de-datos.ts`.
- 🔴 **«Dos fuentes de Switch tienen que decir lo mismo»** (3-sep-2026): el cuadre mensual de costo
  compara el Resumen contra `switch_costo_diario` por (empresa, mes cerrado).
  `src/lib/alertas/cuadre-costo.ts`.
- **Llegar al tope de páginas es ERROR**, no un final normal (`sync-catalogo.ts`,
  `sync-articulo-info.ts`); y **guards de barrido corto al 70 %** en `sync-articulo-marca`,
  `sync-estadocuenta-web`, `ingresos-mercancia-web` y `sync-egresos-varios`.
- **Validar por FORMA, no por status**: `jsonDeSwitch` para el panel, y comprobación del *shape*
  (`saldos`/`elements`) en el API — porque el HTML de excepción llega con 200.
- **Renglones ilegibles que no desaparecen**: quedan en `switch_sync_log.skip_details`, **se dicen
  en pantalla** y avisan por 🔧 SISTEMA con anti-loop de 7 días, con clave por el **N. interno del
  documento, nunca por número de línea** (con líneas, arreglar un renglón corre todos los de abajo y
  la alerta suena para siempre).
- **La pestaña de Boston ahora muestra la fecha del dato** con el mismo `<SyncStatus />` del grupo.

## Por qué está así

| Decisión | Cita / fecha |
|---|---|
| **Dos vías, no una** | el API JSON **no expone** el costo por documento, el reporte de antigüedad completo, la caja y los bancos, ni el detalle de ingreso de mercancía. Lo que falta se baja del panel |
| **Los crons de panel web van de madrugada de Panamá** | *«el usuario configurado en `SWITCH_<EMPRESA>_WEB_USER` es el de Daniel, así que cada login web en horario de oficina lo saca a él de Switch mientras trabaja»* |
| **Un colateral que abre login web solo se recupera en las pasadas fuera del horario de oficina** | la reconciliación pasa a las 10:00, 14:00 y 18:00 UTC = 05:00, **09:00** y **13:00** de Panamá. *«Un fallo de la corrida de las 2 a.m. se "arreglaba" sacando a Daniel de Switch a las 9 de la mañana»* |
| **No hay un usuario dedicado por empresa** | Daniel, 3-sep-2026: ***«no»***. Se confirmó midiendo que la sesión es por usuario y que cada cron lo expulsa. **No volver a proponerlo** |
| **No hace falta Analítica de Switch** | Daniel, 3-sep-2026: *«no necesitas Analítica para consultar, tienes el acceso a cada switch»*. Las 8 URLs del panel están en `.env.local`, login verificado en las 8 |
| **Se valida por FORMA, no por status** | el HTML de la página de excepción de Switch **llega con HTTP 200** |
| **Llegar al tope de páginas es ERROR, no un final normal** | Calvin 12-ago-2026: 4 productos de ~80 y `success` |
| **El corte de paginación va por acumulado contra `total`** | Switch **capa `porPagina` a ~50** aunque se le pida 200: el corte viejo dejaba fuera el 60 % de los clientes de vistana |
| **`raw_data` conserva el elemento crudo** en facturas, estado de cuenta y clientes | porque el `interface` descarta campos, y un día hacen falta. ⚠️ En artículos **no hay `raw_data`** |
| **La identidad del cliente es el CÓDIGO, nunca el nombre** | el nombre es de cada empresa; el código es del grupo. El mostrador se llama `CONTADO`/`VENTAS`/`VENTAS LOCA` según la empresa y siempre es `TCKCTA` |
| **Panamá es UTC−5 fijo y los crons se escriben en UTC** | *«un fix commiteado a las 14:33 UTC "no funcionó" contra un cron de las 10:35 UTC»* |

## Lo que se intentó y se retiró

| Qué | Cuándo | Por qué se fue |
|---|---|---|
| **`POST /estadodecuenta/obtener`** (la cartera de Boston por el panel viejo) | **lo retiró Switch** el 19-ago-2026 a las 12:37:21 | Hoy va por `POST /reportesmanager/crearreporteconsola` → uuid → `GET /reportesmanager/buscarreporteconsola/<uuid>` cada 2 s hasta `TERMINADO`. El formato nuevo se traduce al viejo con `adaptarReporteConsola`, así que las filas tienen la misma forma que las del API |
| **La cartera de Boston por el `/apicliente/estadocuenta` del API** | — | Su universo son **4.912 clientes**, una llamada por cliente: no cabe en la función. Sigue **vetada por cron** (`EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON`), aunque el sync manual la acepta |
| **Partir Boston en tandas por API** | — | Cada escritor de `switch_estadocuenta` reconcilia poniendo `saldo = 0` a lo que no vino: **una tanda ponía en cero lo de la anterior**. Regla: cada escritor reconcilia solo su empresa y **solo con universo completo** |
| **`switch_ventas_netas_vw`** | borrada el 26-jul-2026 | El signo contable vive hoy en `tipos-comprobante.ts` (TS) y en el CASE de `switch_ventas_unificado_vw` (SQL) |
| **`multifashion-sync`** y **`sync-mayor`** | 26-jul y 13-ago-2026 | Ver §8. `sync-mayor` era **un login web menos por día** |
| **El reporte `/reportesventa/recibosfacturas`** (cobros contra factura) | evaluado el 3-sep-2026 | Daniel lo descartó |
| **El parámetro 0072 de Switch** | apagado en las 4 empresas de catálogo | verificado el 3-sep-2026: el precio editado en un pedido **sí** llega a la factura (271 de 272 renglones). **No encenderlo** |

## Cuánto se usa

| Señal | Medida (verificada contra el código el 4-sep-2026) |
|---|---|
| Endpoints del API en uso | **25** de los 52 documentados; **7** se usan **sin estar en el PDF** (entre ellos `/apireporte/recibos` y el `/apinotacredito/info`) |
| Entradas de cron que tocan Switch | **~40** de las 80 |
| Crons que entran por el **panel web** | **4**: `sync-utilidad` 07:00 · `boston-cartera` 08:10 · `sync-ingresos-mercancia` 09:05 · `sync-egresos-varios` 10:35 (todos de madrugada de Panamá) |
| Empresas | **8** instancias, cada una con su propia URL, usuario de API y usuario de panel |
| Con qué usuario entra el sistema | **`daniel`** en 7 de 8 por el API, y con el usuario de Daniel por la web |
| Filas de `switch_sync_log` | **9.119**; **4.612** tienen algo en `skip_details` |
| Separación mínima entre crons de la misma empresa | **15 min** (50 para los largos) |
| Duración medida de los crons largos | `estadocuenta` ~152 s/empresa (máx) · tommy 156 s · calvin 70 s · reebok 49 s · joybees 26 s · reconciliación hasta 740 s |
| Cambios de formato de Switch este año | **3** (12-ago, 19-ago, 1-sep) |

## Qué papeles y Excel produce

**Hacia el sistema:** archivos **CSV con `;`** que el sync baja solo del panel — el reporte de
Egresos Varios y el de Ingresos de Mercancía. Nadie los ve: se parsean y se descartan.

**Hacia Switch:** el sistema **escribe** pedidos y cotizaciones (`/apipedido/terminar` y
`/apicotizacion/terminar`), con **at-most-once** garantizado por un índice parcial único
`(order_id) WHERE estado <> 'error'` en `<marca>_switch_envios`.

⚠️ **Aquí decía «Upload: 100 % manual (drag-drop), no hay API/SFTP» hasta el 3-sep-2026** — describía
el sistema de antes de junio-2026 (`ventas_raw`/`cxc_rows`, hoy congeladas).


## Cómo probarlo a mano

**A) ¿A qué hora corrió el último sync de una empresa, y qué descartó?** (solo lectura, no abre
sesión en Switch):

```bash
node scripts/_diag-egresos-log.mjs 2026-09-01
```

O directo, para cualquier `sync_type` (credenciales en `.env.local`, **solo GET**):

```bash
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/switch_sync_log?select=empresa_key,status,started_at,records_inserted,records_skipped,error_message&sync_type=eq.egresos_varios&order=started_at.desc&limit=40"
```

**Lo que se busca es el corte limpio de fechas**: verde hasta un día, rojo desde el siguiente,
**en varias empresas a la vez y con el mismo mensaje** = cambió Switch. Si el corte es difuso, o
solo una empresa, o coincide con un deploy, probablemente **no fue Switch**.

**B) ¿El endpoint devuelve lo que creemos, sin escribir nada?**
`GET /api/diag/egresos-varios?empresas=<UNA>&desde=…&hasta=…` con
`Authorization: Bearer $CRON_SECRET`. Baja el reporte, lo parsea, lo cuenta y devuelve
`erroresParseo` y **`primerosErrores`** (los 5 primeros, con **la celda entera verbatim**).
⚠️ **Este sí abre sesión** en esa empresa: hazlo de madrugada o avisa a Daniel.

**C) ¿Hay un sync trabado ahora mismo?** Busca filas `status='running'` con más de 30 min:
son las que sostienen el candado. Se sueltan solas a los 30 min.

**D) Traer un dato al momento sin esperar al cron:** el botón **«Actualizar ahora»**
(`POST /api/admin/sync-now`, admin) — cubre `estadocuenta`, `facturas`, `recibos`,
`clientes-master`, `proveedores`, los 4 catálogos y `refresh-vistas`. **Una empresa por clic**, por
la sesión única. ⚠️ **No cubre utilidad, ni la cartera de Boston, ni egresos, ni llegadas**: esos
son solo cron, o entrar al panel a mano.

## Qué lo rompe — y cómo se notaría

| Qué falla | Qué pasa | Cómo se notaría |
|---|---|---|
| **Switch mueve un endpoint** (el caso Boston del 19-ago) | el sync recibe **HTTP 200 con HTML** y falla al parsear | 2 corridas seguidas en `error` → 🔧 SISTEMA por la regla 2. ⚠️ Tarda **un día entero** en sonar, porque muchos crons corren 1×/día |
| **Switch cambia el formato de una celda** (el caso egresos del 1-sep) | el validador tira los renglones. Si falla el 100 %, la corrida queda en `error`; **si falla solo una parte, la corrida es `success`** y los renglones se pierden | 100 % → regla 2 en 2 días. Parcial → `skip_details`, la línea ámbar de la pantalla, y 🔧 SISTEMA de renglones ilegibles |
| **Switch responde bien pero con CERO filas** | el sync se anota `success` sin datos | **Alerta A** (silencio de datos), en la siguiente reconciliación (10/14/18 UTC) — **solo** para syncs de universo completo. En un sync selectivo o de mes en curso, el cero es un dato del negocio, no una avería |
| **Switch capa `porPagina` en silencio** | el sync escribe menos de lo que hay y parece completo | el corte va **por acumulado contra `total`**, y llegar al tope de páginas es error. Deja `*_paginacion_incompleta` en `skip_details` |
| **Daniel entra al panel mientras corre un cron** | el cron recibe `0006` («te sacaron») | re-loguea solo; si falla, la reconciliación lo reintenta. **No es un incidente** |
| **Dos crons de la misma empresa se solapan** | se tumban el token entre sí | `cron-calendario.test.ts` lo impide en CI; en producción, uno de los dos falla limpio y la reconciliación lo recupera |
| **Switch manda una cifra imposible** | la fila **se rechaza** (el upsert conserva el último valor bueno), nunca se escribe un 0 | queda en `skip_details` y **se dice en pantalla**. Umbral: `max(piso de la familia, 20 × récord de esa empresa)` |
| **Un `sync_type` nuevo que no está en el CHECK** | la corrida **no deja fila** en `switch_sync_log`: invisible, corra bien o mal | `SYNC_LOG_TYPES` + `sync-log-tipos-check.test.ts` lo impiden. Pasó con `catalogo_tommy` (jul) y `articulo_marca` (7-ago) |
| **Una lectura de >1.000 filas sin paginar** | PostgREST devuelve 1.000 y **parece completo** | Nada lo dice. Es el modo de fallo más caro del repo: una réplica de Ventas › Clientes dio $41.287 en vez de $390.084 |


# 11. Qué se cae si un cron no corre — el mapa completo

Una fila por cron. **«Se recupera solo»** = la reconciliación (10/14/18 UTC) lo re-ejecuta
**in-process**, o hay una segunda entrada del mismo día. La columna **«Cómo se notaría»** es la que
importa: casi ninguna de estas caídas cambia algo en pantalla.

Vigilancia base para todos: heartbeat en `cron_heartbeats` → a las **26 h** sin success, el watchdog
de la reconciliación manda 🔧 SISTEMA y `health-crons` lo lista en `stale[]`. Los de
`CRONS_FAIL_CLOSED` alertan **incluso si la fila no existe**; los de `SEED_TOLERANT_CRONS` solo si
la fila existe y está vieja.

## Los que se caen con consecuencia de PLATA

| Cron (UTC) | Qué deja de pasar | ¿Se recupera solo? | Cómo se notaría |
|---|---|---|---|
| **`switch-sync ?tipo=facturas`** (11:50 · 15:00 · 19:00 · 23:00 las 8; 13:00 · 17:00 · 21:00 · 00:15 solo ACS) | **Ventas deja de actualizarse.** Se caen Resumen, Vista General, Ventas › Clientes, Multifashion, el ranking, las comisiones sobre venta y el resumen de ACS de la 01:00 | **Sí** — la reconciliación detecta el par faltante por `switch_sync_log` (no por heartbeat) y lo re-corre | 8 entradas al día: perder una no se nota. Perder **todas** deja el tablero congelado, y eso **sí** se ve: el número de hoy no se mueve |
| **`switch-sync ?tipo=estadocuenta`** (16:00/05/10 y 21:10/15/20, en pares) | **el CXC del grupo se congela** | Sí | ⚠️ La pantalla muestra `<SyncStatus />` con la fecha del dato — es lo único que lo delata. Además el check `last_upload_age_cxc` de Data Health pasa a WARNING a los 7 días |
| **`switch-sync ?tipo=all`** (05:30/35/40 y 06:30) | facturas + estado de cuenta + **`switch_costo_diario`** de esa pareja de empresas | Sí | igual que arriba |
| **`sync-utilidad`** (07:00, **panel web**) | **las comisiones dejan de tener base**: `pct_utilidad` es el criterio de entrada del 0,5 %. Y desde el 3-sep, el **costo de las notas de débito** del Resumen | Sí, pero **solo en la pasada de las 10:00** (abre login web: recuperarlo a las 14:00 o 18:00 sacaría a Daniel del panel en plena oficina) | Perder una corrida **no pierde datos**: cada corrida re-lee el mes entero y hace upsert. Si persiste, la regla de 2 fallos avisa |
| **`sync-recibos`** (07:50 · 15:15 · 19:15 · 23:15) | **los cobros**: «Últimos pagos» del CXC, el último pago del cliente, y **la comisión de cobro** | Sí | 4 entradas al día. Re-lee una ventana rodante de 3 meses, así que la corrida siguiente repara |
| **`boston-cartera`** (08:10, **panel web**) | 🔴 **la cartera de Boston se congela**. Es lo que pasó 5 días en agosto | 🔴 **NO.** No está en los colaterales de la reconciliación: si falla, espera a mañana | La regla 1 (dato viejo, +24 h) es la única que avisa — y por eso se le puso vigilancia el 24-ago-2026. La pestaña ahora **sí** muestra la fecha del dato |
| **`sync-egresos-varios`** (10:35, **panel web**) | **el módulo Gastos se queda sin renglones nuevos** | Sí, en la pasada de las 10:00 | Es el que estuvo 2 días caído el 1-sep. La regla 2 (dos `error` seguidos) es la que sonó |
| **`sync-ingresos-mercancia`** (09:05, **panel web**) | «Compré» y la **última llegada** de Ventas › Referencia | Sí | los TRES GRANDES de Referencia salen de la última llegada: si no llega una nueva, se quedan con la anterior |
| **`switch-articulos`** (08:40) | `switch_articulo_diario` — **Productos, el margen del Resumen y «Vendí» de Referencia** | Sí | ventana de 3 días hacia atrás: una corrida perdida se repara sola en la siguiente |
| **`integrity-check`** (12:00) | **Data Health se queda con el dato de ayer**; un dato corrupto no se detecta | Sí, después de las 13:00 UTC | el punto de hoy queda gris en el mapa de 30 días |

## Los que se caen con consecuencia de AVISO (nadie se entera de algo)

| Cron (UTC) | Qué deja de pasar | ¿Se recupera solo? | Cómo se notaría |
|---|---|---|---|
| **`cheques-alert`** (14:15) | 🔴 **nadie se entera de un cheque que vence.** Es el único aviso del módulo Recordatorios | Sí, pero **solo en la pasada de las 18:00** (hora mínima 15: recuperarlo a las 14:00 se adelantaría a su propio run) | 🔴 **Nada en pantalla lo dice.** Solo el heartbeat |
| **`guias-pendientes`** (14:30) | nadie se entera de las guías que quedaron sin despachar | no está en los colaterales | igual: solo el heartbeat |
| **`acs-resumen-diario`** (01:00) | el resumen de ventas de ACS no llega al privado de Daniel | **Sí**, y es el que compensa que este mensaje pierda el fail-safe de Telegram | Daniel lo nota: es un mensaje que espera todos los días a las 8 p.m. |
| **`grupo-resumen-mensual`** (día 1, 13:00) | el resumen mensual del grupo no llega | Sí, pero **solo los días 1 y 2**. 🔴 Está en `NUNCA_SILENCIAR`: los watchdogs jamás lo callan por «recuperación en camino» — es demasiado esporádico para asumirla | una vez al mes: si falta, se nota |
| **`catalogos-fotos-resumen`** (lunes 13:30) | no llega el resumen semanal de fotos que faltan | Sí, **solo los lunes**. También en `NUNCA_SILENCIAR` | semanal |
| **`asistencia-vigia`** (15:00 · 20:00 · 22:15) | **nadie se entera de que el reloj de asistencia dejó de reportar** | no está en los colaterales | 3 entradas al día; es un vigía, así que su caída **apaga una alarma**, que es el peor tipo de caída |
| **`db-salud`** (01:45 · 07:25 · 12:25 · 16:45 · 21:45) | nadie se entera si la base pasa el 80 % de memoria | 5 entradas al día | hueco máximo entre pasadas: 5 h 40 |
| **`switch-reconciliacion`** (10:00 · 14:00 · 18:00) | 🔴 **se cae el vigía interno Y la recuperación de todos los colaterales.** Es el nodo más crítico del sistema | por definición, no | **`health-crons` devuelve 503** — es una de las tres condiciones que lo justifican. Y está en `NUNCA_SILENCIAR` |

## Los que se caen sin que se note (y por qué importan igual)

| Cron (UTC) | Qué deja de pasar | Cómo se notaría |
|---|---|---|
| **`cleanup-sessions`** (02:30) | 🔴 **ninguna sesión vence del lado del servidor**; `switch_sync_log` deja de podarse; los candados de sync atascados solo los suelta la reconciliación | Este cron **sí** manda Telegram cuando falla, porque **nadie lo re-ejecuta** |
| **`backup`** (06:00 · 10:30 · 18:30) | **no hay copia de las 56 tablas manuales** de ese día | La 2ª y 3ª entrada son segunda oportunidad y **la alerta las espera**; la última siempre alerta. Además `saludR2` avisa si la carpeta de AYER quedó a medias |
| **`backup?grupo=switch`** (06:45 · 11:15 · 23:30) | no hay copia de `switch_articulo_diario`, que es **irrecuperable de Switch** | igual |
| **`backup?grupo=storage`** (04:00 · 15:30) | los ~3.2 K archivos subidos a mano no se replican a R2 | 🔴 **Nada lo dice.** El manifest hace catch-up al día siguiente |
| **`refresh-clientes-views`** (07:35) | `clientes_agregado_12m_vw` y `clientes_empresa_12m_vw` quedan viejas | Ventas › Clientes muestra números de ayer |
| **`sync-clientes-master`** (07:00) | el directorio no incorpora clientes nuevos ni marca los ausentes | el selector de cliente (Guías, Cheques, Recordatorios) no ofrece al cliente nuevo |
| **`sync-proveedores`** (09:30) | el aging de proveedores queda viejo | ⚠️ El sync hace **`DELETE` real** de los que ya no están: una corrida perdida no borra nada, pero una corrida con datos incompletos sí |
| **`sync-factura-lineas`** (03:30) | «qué le vendí a este cliente» se queda sin los renglones nuevos | es una **cola** (`lineas_synced_at IS NULL`) con tope de 300 por empresa: se pone al día sola |
| **los 4 catálogos** (4 pasadas c/u, 14:3x → 22:1x) | los catálogos públicos muestran stock y precio viejos | ⚠️ Los slots de las **19:4x y 21:5x/22:1x NO tienen recuperación el mismo día** — la última pasada de la reconciliación es a las 18:00. Está escrito, no escondido |
| **`acs-fidelizacion`** (11:30 · 16:30) | las tarjetas de fidelización de Multifashion quedan viejas | la 2ª es segunda oportunidad |
| **`cleanup-packing-lists`** (03:00) | los packing lists viejos no se purgan | la tabla crece; el backup los retiene igual |
| **`cleanup-depurador-archivos`** (03:20) | los Excel del Depurador de más de 90 días no se borran de Storage | crece el bucket. 🔴 Nunca borra la fila con los totales |
| **`sync-articulo-info`** (04:30 · 04:40 · 04:50, en 3 grupos de 2) | el catálogo de Referencia (existencia, precio de etiqueta, CIF) queda viejo | las 3 entradas comparten un solo heartbeat: **se refresca solo si TODAS las empresas salieron bien** |
| **el vigía externo de cron-job.org** (cada hora) | 🔴 **se cae la vigilancia de que Vercel siga invocando crons** | deja de escribir el heartbeat `vigia-externo` → a las 26 h el watchdog **interno** lo reporta. Es la vigilancia mutua que se construyó tras el incidente del 29-jul-2026 |

## Y si se caen TODOS a la vez

Si Vercel deja de invocar crons, el watchdog interno **tampoco corre** — por eso existe el vigía
externo. `health-crons` devuelve **503** cuando hay ≥ `UMBRAL_CAIDA_MASIVA` crons stale, y
cron-job.org le manda el correo a Daniel. Es la única red que ve ese caso.


# 12. Lo que sobra o no cuadra — transversal

Solo lo que atraviesa el sistema. Lo específico de cada módulo está en su sección.

1. 🔴 **El backup no cubre Asistencia, ni los tres catálogos nuevos, ni la configuración de
   comisiones, ni los saldos de banco.** §9. La lista de `DATASETS` es de la época en que esos
   módulos no existían y nadie la volvió a mirar cuando nacieron.
2. 🔴 **Una sesión `admin` sin revocar pertenece a un usuario que no existe.** `medicion-t203b`,
   `last_seen` 27-ago-2026 (§2·5). El cron la revocará por inactividad, pero el guard de «no dejar
   el sistema sin admins» y el PATCH de desactivar **no la ven**, porque `user_sessions` se
   relaciona con `fg_users` por **nombre**.
3. 🔴 **La medición que sostiene el guard de Usuarios ya no es cierta.** Dos archivos (la página y
   su test) afirman que Angela tiene `usuarios` en su `modulos_override`; hoy no lo tiene (§2·7).
   La conclusión sigue siendo correcta; el dato con el que se defiende, no.
4. **Tres comentarios contradicen al código medido:**
   - `cheques-fila.ts`: «`banco` es NOT NULL sin default» → hoy es nullable con default `''`.
   - `/api/cheques/frecuencias`: «`cheques` NO tiene columna `cliente_codigo`» → la tiene, y las 19
     filas la usan.
   - `/api/cron/integrity-check`: «6 consultas … contra `cxc_rows`» → son 7 checks y `cxc_rows` ya
     no se consulta.
5. **`CLAUDE.md` quedó atrás en tres puntos verificables hoy:** `vercel.json` tiene **80** entradas
   (dice 79); falta `/api/cron/cleanup-depurador-archivos` (03:20 UTC); y `grupo-resumen-mensual`
   corre el **día 1** por `enviarNegocioPrivado`, no el día 3 por 📊 NEGOCIO.
6. **19 filas de `cron_heartbeats` son marcas de slots retirados**, la más vieja de hace 41 días.
   No alertan, pero envejecen para siempre y cada barrido las tiene que saltar.
7. **Las tres entradas de `MODULO_HEREDA_PERMISO_DE` ya son inertes** (§5·1): sus DDL corrieron y
   los tres roles tienen el módulo por derecho propio en `role_permissions`.
8. **`role_permissions.activo` no lo lee nadie**, y `role_permissions.admin.modulos` no describe lo
   que admin ve (§2, §5).
9. **`activity_logs` (2.877) y `data_integrity_checks` (821) crecen sin poda y sin pantalla.**
   `switch_sync_log` sí tiene su `podar_switch_sync_log`; estas dos no.
10. **El rol `cliente` sigue vivo en el código del login** y no existe en el sistema (§4·1).
11. **`CLIENTE_PASSWORD` y `VENDEDOR_PASSWORD` siguen en `.env.local`** después de que las
    contraseñas por rol se retiraran (§4·3).
12. **Varios crons de `SEED_TOLERANT_CRONS` ya cumplen la condición de promoción** que su propio
    comentario describe («cuando la DDL esté corrida y lleve días sembrado») y siguen en la lista
    tolerante — o sea, con vigilancia más floja de la que su madurez permite.
