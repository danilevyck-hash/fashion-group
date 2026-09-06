# Usuarios — el mapa

> Medido contra producción el **5-sep-2026** (SQL de solo lectura + `src/app/admin/usuarios/**`, `src/app/api/admin/users/`, `src/lib/modules.ts`, `src/lib/sesion-payload.ts`).
> Ruta: `/admin/usuarios`. Key del módulo: `usuarios`. **Ningún dato de este mapa incluye contraseñas, hashes, tokens ni correos.**

---

## Qué es, quién entra, cuánto se usa

**Qué hace.** Es donde nacen las personas del sistema: nombre, contraseña, rol, empresa asociada y —si hace falta— una lista propia de módulos. Además muestra las sesiones abiertas y deja revocarlas. Y trae una segunda pestaña, **Data Health** (mapa aparte).

**Quién entra: solo `admin`.** El guard es `useAuth({ moduleKey: "admin", allowedRoles: ["admin"] })` (`page.tsx:66`) y las cuatro rutas de `/api/admin/users` piden `requireAuth(req, ["admin"])`. Hay **2 admins**: `daniel` (`is_owner = true`) y `alberto`.

**Cuánto se usa — el sistema entero son 11 personas:**

| Rol | Personas | Activas | Con lista propia de módulos |
|---|---:|---:|---:|
| vendedor | 3 | 3 | 0 |
| secretaria | 2 | 2 | **2** |
| admin | 2 | 2 | 0 |
| bodega | 1 | 1 | 0 |
| contabilidad | 1 | 1 | 0 |
| gerente_acs | 1 | 1 | 0 |
| gerente_boston | 1 | 1 | 0 |

**11 usuarios, 11 activos, 0 inactivos.** La columna `active` nunca se ha usado para apagar a nadie en toda la historia de la tabla.

**Última vez que entró cada uno** (máximo `last_seen` en `user_sessions`, medido el 6-sep-2026):

| Quién | Rol | Días sin entrar | Sesiones históricas | Sesiones vivas |
|---|---|---:|---:|---:|
| daniel | admin | **0** | 336 | 40 |
| jennifer | gerente_acs | 1 | 42 | 12 |
| rey | vendedor | 1 | 65 | 13 |
| Bodega | bodega | 1 | 144 | 31 |
| Angela | secretaria | 2 | 174 | 21 |
| Contabilidad | contabilidad | 2 | 68 | 19 |
| alberto | admin | 2 | 15 | 1 |
| david | gerente_boston | 2 | 5 | 4 |
| andrea | secretaria | 2 | 146 | 32 |
| edwin | vendedor | 3 | 15 | 4 |

**Ninguno lleva más de 3 días sin entrar.** El riesgo que buscábamos —«un usuario activo que no entra hace medio año»— **no existe hoy**: los 11 usan el sistema esta semana. Es un hallazgo bueno y hay que decirlo.

**La expiración de sesiones funciona.** Medido: `user_sessions` tiene **1.027 filas** (850 revocadas, 177 vivas) y las tres condiciones del cron dan **cero pendientes**: 0 sin revocar con `last_seen` de más de 14 días · 0 que pasen el tope de 90 días · 0 revocadas con más de 90 días esperando borrado. `cron_heartbeats` para `cleanup-sessions`: **6-sep-2026 02:30 UTC**, o sea la corrida de esta madrugada. **Ese candado está sano.**

---

## Cuánto cuesta hacer las cosas

Nota previa: **el uso real de esta pantalla es casi cero.** `activity_logs` no tiene **ni una sola fila** de alta, edición, desactivación ni revocación de usuario (medido: 0 filas con `entity_type` en `usuario`/`fg_users`/`user` y 0 con `action` que hable de usuario o rol). Los últimos dos usuarios nacieron el 3-jul (jennifer) y el 27-ago (david). **Es una pantalla de 3-4 usos al año.** Lo que sigue mide lo que cuesta cuando toca.

### Tarea 1 — dar de alta a alguien (2 veces en 2026)

**Hoy: 6 toques, 2 pantallas, 3 campos escritos a mano, 1 de ellos imposible de acertar a la primera.**

| # | Toque / campo | ¿El sistema ya lo sabe? |
|---|---|---|
| 1 | Inicio → «Usuarios» | — |
| 2 | «Nuevo Usuario» | — |
| 3 | Escribe el **nombre** (mínimo 3 letras, único) | no |
| 4 | Escribe la **contraseña** (mínimo 8, **única en todo el sistema**) | 🔴 ver abajo |
| 5 | Elige el **rol** (2 toques: abrir + elegir) | no |
| 6 | «Guardar» | — |

Campo opcional que sí falta llenar a veces: **Empresa**, un `<input>` de texto libre con marcador «vistana, fashion_wear, etc.» (`page.tsx:466`). El sistema **ya conoce las 8 `empresa_key`** (`B2B_EMPRESA_KEYS` + Boston + American Classic) y las pide tecleadas. Un tipeo (`vistanna`) se guarda tal cual y le recorta el CXC a ese vendedor sin decir nada. Medido: solo **edwin** tiene empresa (`vistana`); los otros 10 la tienen en NULL.

> **Versión más corta: 5 toques y 1 campo escrito.** Empresa pasa a ser un `<select>` de las 8 que el sistema ya tiene (−1 error posible, −1 campo tecleado) y la contraseña la propone el sistema con un botón «Generar» (el requisito de unicidad global deja de ser adivinanza).

### Tarea 2 — 🩸 lo que de verdad cuesta: la contraseña tiene que ser única en las 11

**El login de este sistema es SOLO contraseña. No hay campo de usuario.** Verificado en `src/app/page.tsx` (un único `<input type="password">`, `body: JSON.stringify({ password })`) y en el propio comentario del servidor: *«El login es password-only: dos usuarios con la misma contraseña lo hacen ambiguo»* (`api/admin/users/route.ts:52`).

Consecuencia medida en el código: `passwordInUse()` compara la contraseña nueva contra **las 11 filas de `fg_users`**, incluidas las inactivas, con y sin minúsculas. Si choca, la respuesta es **«Esa contraseña ya está en uso, elige otra.»** — y llega **después de tocar Guardar**, con todo el formulario ya lleno.

**Hoy:** escribir una contraseña → Guardar → error → borrar → escribir otra → Guardar. **Cada choque cuesta 3 toques y un campo re-escrito**, y no hay forma de saber de antemano cuál está libre.

> **Versión más corta:** un botón «Generar» que proponga una que el servidor ya sabe que está libre. **De N intentos a 1 toque.**

### Tarea 3 — quitarle o darle un módulo a alguien

**Hoy: 5 toques.** Inicio → Usuarios (1) → lápiz «Editar» (1) → marcar «Permisos personalizados» (1) → tocar 1 de **21 casillas** (1) → «Guardar» (1).

🔴 **Y aquí está la trampa medida.** Marcar esa casilla **congela** la lista: `modulos_override` **reemplaza** a la del rol, no se suma (`sesion-payload.ts:46` — si el arreglo existe y no está vacío, devuelve *solo* eso y ni siquiera consulta `role_permissions`). La pantalla lo dice en un ⓘ, pero el efecto es permanente y silencioso. **Ver 🩸 nº 1.**

### Tarea 4 — mirar quién está conectado / cerrar una sesión

**Hoy: 3 toques para ver, 5 para cerrar una.** Inicio → Usuarios (1) → desplegar «Sesiones activas» (1, viene cerrado) → el filtro arranca en «7 días» (0) → «Revocar» (1) → confirmar (1).

La lista muestra **177 sesiones vivas para 10 personas** — daniel solo tiene **40 abiertas**. Cada una es una fila con avatar, nombre, rol, hace-cuánto e IP. **Revocar de a una es inviable a esa escala**; por eso existe «Revocar todas (N)», que aparece con 2 o más. Es la única acción que tiene sentido ahí.

---

## Los datos, medidos

| Tabla | Filas | Estado |
|---|---:|---|
| `fg_users` | **11** | 11 activas, 0 inactivas |
| `user_sessions` | 1.027 | 850 revocadas · 177 vivas · 8-jun a 5-sep-2026 |
| `role_permissions` | 7 filas (una por rol) | las 7 con `activo = true` |
| `activity_logs` (acciones de usuario) | **0** | ninguna alta/edición/baja registrada nunca |

**Columnas vacías que importan, en `fg_users`:**

| Columna | Vacías | Qué significa |
|---|---:|---|
| `nombre_completo` | **6 de 11** | alberto, Bodega, Contabilidad, jennifer, edwin, rey, rodrigo no tienen nombre real |
| `email` | **9 de 11** | solo 2 personas tienen correo |
| `associated_company` | 10 de 11 | solo edwin (`vistana`); es opcional a propósito |
| `modulos_override` | 9 de 11 | solo las 2 secretarias |

⚠️ `nombre_completo` y `email` existen en la tabla y **la pantalla no los muestra ni los deja escribir** — el modal solo tiene Nombre, Contraseña, Rol, Empresa y los 21 checkboxes. Son dos columnas huérfanas.

**Los módulos por rol, medidos en `role_permissions`:**

| Rol | Módulos guardados | Actualizado |
|---|---:|---|
| admin | 17 | 13-ago |
| secretaria | 11 | 6-ago |
| vendedor | 5 | 12-ago |
| contabilidad | 5 | 26-ago |
| bodega | 5 | 26-ago |
| gerente_boston | 3 | 1-sep |
| gerente_acs | 1 | 3-jul |

---

## 🩸 Lo que miente o está roto

### 1. 🩸 Las dos secretarias **no ven Asistencia y Planilla**, y su rol sí se lo da

Medido:
- `role_permissions.secretaria.modulos` **incluye `asistencia`**.
- `Angela.modulos_override` = 11 keys: directorio, marketing, cheques, caja, comisiones, guias, packing-lists, reclamos, catalogos, cargar, cxc. **Sin `asistencia`.**
- `andrea.modulos_override` = 12 keys: las mismas + multifashion. **Sin `asistencia`.**

Y `getVisibleModules` (`modules.ts:397`) filtra **solo** por esa lista congelada. **Resultado: las dos únicas secretarias del sistema no tienen la ficha de Asistencia y Planilla en su Inicio.**

**Por qué pasó:** el override existe para darles `cxc` (que su rol **no** les da) y `multifashion` (a andrea). Al encenderlo se congeló la foto del día que se hizo. Después alguien agregó `asistencia` a `role_permissions.secretaria` (6-ago) y **a ellas no les llegó**, porque su lista propia ya no lee esa fila.

**Puede ser intencional** — no lo puedo saber desde los datos. Lo que sí es seguro es que **es invisible**: nada en la pantalla dice «esta persona se está perdiendo 1 módulo que su rol sí le da».

### 2. 🩸 El desplegable de Rol ofrece **5 roles de los 7 que existen**

`page.tsx:428-434` tiene exactamente cinco `<option>`: admin, secretaria, vendedor, contabilidad, bodega. `SYSTEM_ROLES` (`modules.ts:224`) tiene **siete**: le faltan **`gerente_acs`** y **`gerente_boston`**.

Y esos dos roles **existen en producción**: jennifer (`gerente_acs`, 3-jul) y david (`gerente_boston`, 27-ago). Al abrir «Editar» sobre cualquiera de los dos, el `<select>` recibe un `value` que no corresponde a ninguna de sus opciones — **el navegador no puede mostrar el rol que la persona tiene**. Y la pantalla no ofrece forma de asignar esos dos roles a nadie más: **jennifer y david tuvieron que nacer por fuera de esta pantalla.**

### 3. 🩸 Cambiar un usuario no deja **ningún** rastro

`activity_logs` tiene 2.821 filas y registra cosas tan chicas como `caja_gasto_delete` (16) o `product_ocultar_catalogo` (24). **Crear un usuario, cambiarle el rol, cambiarle la contraseña, desactivarlo o revocarle todas las sesiones no escribe una sola fila.** Ninguna de las cuatro rutas de `/api/admin/users` llama a `logActivity`.

Son las acciones más sensibles del sistema (dan y quitan acceso a la plata de 8 empresas) y son las únicas sin bitácora. Hay **dos admins**: si mañana un permiso aparece cambiado, no hay forma de saber quién lo hizo.

### 4. 🩸 Tres usuarios `medicion-*` con rol **admin** dejaron 17 sesiones

Medido en `user_sessions`: `medicion-t203b` (**15 sesiones**, rol admin, última el 27-ago), `medicion-horarios` (1, admin, 26-ago), `medicion-t210` (1, admin, 17-ago). **Ninguno de los tres existe en `fg_users`** (0 filas con `name like 'medicion%'`).

Las 17 están **todas revocadas** y ninguna es una puerta abierta hoy — eso es lo bueno. Lo que dice el hallazgo es otra cosa: **se abrieron sesiones con rol admin desde fuera de la pantalla de usuarios, y la pantalla de sesiones las muestra mezcladas con las de las personas reales.** El filtro por defecto («7 días») las esconde hoy; el chip «Todas» las trae de vuelta sin distinguirlas.

### 5. La columna `active` nunca se usó — y el aviso de «único admin» tampoco pudo dispararse

**0 de 11 usuarios inactivos** en toda la historia de la tabla. El guard `wouldLeaveNoActiveAdmin` (`route.ts:38`) está bien escrito, pero con 2 admins activos nunca puede disparar. La pantalla dedica un botón de 44×44 por tarjeta a una acción que se usó **cero veces**.

### 6. «Empresa» es texto libre sobre un vocabulario cerrado de 8

`page.tsx:466` — `<input>` con marcador «vistana, fashion_wear, etc.». No hay validación ni en la pantalla ni en el servidor (`validateRoleAndModulos` valida rol y módulos, **no** la empresa). Un tipeo se guarda y le recorta el CXC a un vendedor en silencio.

### 7. Nada dice **cuándo** se creó ni **quién** creó a cada usuario

`fg_users` tiene `created_at` (medido: se llena bien — daniel 27-mar, alberto 25-abr, edwin 15-abr, jennifer 3-jul, david 27-ago) y `updated_at`, y **la tarjeta no muestra ninguno de los dos**. La API los devuelve; la pantalla los tira. Lo que sí muestra —«Última sesión hace 2 d»— sale de `user_sessions`, no de la ficha.

---

## Coherencia con el sistema

| Punto | Cómo está | Veredicto |
|---|---|---|
| **Voseo** | Cero. «Dejar vacío para no cambiar», «elige otra» | ✅ |
| **Confirmación destructiva** | `ConfirmModal` con `destructive` en desactivar y en revocar | ✅ El patrón de la casa |
| **Deshacer de 5 s** | No hay | ⚠️ Desactivar a alguien lo saca del sistema al momento; es el caso del `useUndoAction` |
| **Vacío** | `EmptyState` «No hay usuarios» + «No hay sesiones en este rango.» | ✅ |
| **Error** | «Sin conexión. Verifica tu internet e intenta de nuevo.» | ✅ Frase de la casa, repetida en las 5 acciones |
| **Excel** | No exporta nada | ✅ No aplica |
| **Pestañas** | `Tabs` de Radix con `TAB_TRIGGER_CLASS` (el de Ventas y Multifashion) | ✅ |
| **`?tab=` desconocido** | Cae en «usuarios», nunca en blanco | ✅ |
| **Un h1 por documento** | `sr-only` «Usuarios»; Data Health cedió el suyo | ✅ Cuidado a propósito |
| **Tipografía** | Carga **Playfair Display** desde Google Fonts solo para el título del modal (`page.tsx:20`) | ⚠️ Es la única pantalla del sistema que trae una fuente propia. Una petición de red externa para 3 palabras en un modal que se abre 3 veces al año |
| **Nombre de la persona** | Se muestra `name` (el de login: «Bodega», «Contabilidad»), no `nombre_completo` | ⚠️ 6 de 11 no tienen nombre real cargado, y la pantalla no deja ponerlo |

---

## El iPhone (390 px)

| Elemento | A 390 px | Veredicto |
|---|---|---|
| Tarjetas de usuario | `grid-cols-1` hasta `sm` | ✅ una por fila |
| Lápiz «Editar» y «Desactivar» | 44×44 con 8 px entre medio, comentario que dice que se midió a 390×844 | ✅ Arreglado a propósito |
| Modal de usuario | `max-h-[90vh] overflow-y-auto`, ✕ de 44×44, campos en `text-base` en móvil (anti-zoom de Safari) | ✅ Bien pensado |
| Las 21 casillas de módulos | `grid-cols-1` hasta `sm`, 44 px cada una | ⚠️ **21 filas de 44 px = 924 px de alto** dentro de un modal de `90vh` (≈760 px en un iPhone). Son 2 pantallas de deslizamiento *dentro* del modal, con Cancelar/Guardar al final |
| Lista de sesiones | Fila con avatar + nombre + rol + hace-cuánto + IP + 2 botones | 🔴 **Es lo más apretado.** «Revocar todas (5)» y «Revocar» son texto de 12 px con `px-2 py-1` — **por debajo de los 44 px** que el resto de la pantalla respeta, y uno de los dos es destructivo |
| Chips del filtro de sesiones | 4 `Chip` con `flex-wrap` | ✅ envuelven |

---

## Lo que sobra · lo que falta

### Sobra (quitar)

| Qué | Dónde | Por qué, con el número |
|---|---|---|
| El botón «Desactivar» en cada tarjeta | `page.tsx:~330` | 0 de 11 usuarios se desactivaron nunca. Que viva en el modal de edición, no como segundo botón de 44×44 en cada tarjeta |
| Playfair Display | `page.tsx:20` | Una fuente externa para el título de un modal que se abre 3 veces al año |
| El chip «Todas» del filtro de sesiones | `page.tsx:~590` | Trae las 3 sesiones de usuarios `medicion-*` que ya no existen, mezcladas con las reales. «30 días» alcanza |
| La IP en cada fila de sesión | `page.tsx:~640` | 177 filas × una IP que nadie puede interpretar. Que viva en el `title`, como la fecha |

### Falta (agregar)

| Qué | Por qué, con el número |
|---|---|
| **`gerente_acs` y `gerente_boston` en el desplegable de Rol** | 2 de 11 usuarios tienen roles que la pantalla no puede mostrar ni asignar |
| **Bitácora en `activity_logs`** | 0 filas de las 5 acciones más sensibles del sistema, con 2 admins que pueden hacerlas |
| **Aviso «esta persona se pierde N módulos de su rol»** | Las 2 secretarias se pierden `asistencia` en silencio |
| **«Empresa» como `<select>` de las 8** | El sistema ya tiene la lista; hoy la pide tecleada y no la valida |
| **Botón «Generar contraseña»** | La contraseña tiene que ser única entre las 11 y hoy es adivinanza con error después de Guardar |
| **Que 44 px valgan también en «Revocar»** | Es el único destructivo de la pantalla por debajo del target, y hay 177 filas |

---

## Preguntas para Daniel

**1. Las dos secretarias no ven «Asistencia y Planilla». ¿Es a propósito?**
Medido: su rol se lo da, su lista propia no. Angela y andrea son las únicas dos secretarias.
- a) Sí, a propósito: no deben verla → lo dejamos y lo anotamos.
- b) No: hay que agregársela a las dos.
- c) Mejor: que la lista propia **sume** al rol en vez de reemplazarlo.

**Recomiendo (b) si la respuesta es «deberían verla», y NO (c).** Cambiar la semántica del override es tocar el permiso de todo el mundo por un caso de dos personas; hay riesgo de abrirle un módulo a alguien sin querer. Un `UPDATE` de dos filas es reversible; un cambio de regla, no.

**2. Cambiar un usuario no deja rastro. Son dos admins. ¿Lo anotamos?**
- a) Sí, `activity_logs` en las 5 acciones (alta, edición, contraseña, desactivar, revocar).
- b) Solo las que dan o quitan acceso (alta, rol, módulos, desactivar).
- c) No hace falta, somos dos y confiamos.

**Recomiendo (a).** No es por desconfianza: es porque el día que un permiso aparezca raro, sin bitácora la única respuesta posible es «no se sabe». Ya se anota borrar un gasto de caja de $20; esto es más grande.

**3. Contraseña sin usuario: cualquiera que la tenga entra como esa persona. ¿Está bien así?**
Medido: el login tiene un solo campo, y el servidor tiene que exigir que las 11 contraseñas sean distintas entre sí para que la identidad no sea ambigua.
- a) Se queda: es rápido y la gente no es técnica.
- b) Agregar el nombre de usuario al login (2 campos).
- c) Se queda, pero con contraseñas generadas por el sistema (más largas y sin choques).

**Recomiendo (c), y (b) solo si tú lo pides.** Agregar un segundo campo le complica el día a 11 personas que hoy entran con un toque; (c) resuelve el problema real (la ambigüedad y el choque de contraseñas) sin tocarles la rutina. Pero esta la decides tú: es la puerta de todo el sistema.

**4. Hay 177 sesiones abiertas para 10 personas; tú solo tienes 40. ¿Las mostramos así?**
El cron ya las limpia bien (0 vencidas pendientes) — no es un problema de seguridad, es de lectura.
- a) Agrupar por persona: una fila por persona con «40 sesiones · última hace 2 h · Cerrar todas».
- b) Dejar la lista plana como está.
- c) Quitar la sección: el cron ya se encarga.

**Recomiendo (a).** Lo que quieres saber al abrir eso es «¿quién está adentro?», y hoy son 177 filas para contestar una pregunta de 10 renglones. Cerrar todas las de una persona ya existe; solo hay que subirlo al nivel donde sirve.

**5. Faltan `gerente_acs` y `gerente_boston` en el desplegable de Rol. ¿Los agregamos?**
Jennifer y David existen con esos roles y la pantalla no los puede mostrar.
- a) Sí, los 7 roles en la lista.
- b) Sí, pero los dos de gerente aparte, marcados como «rol especial».
- c) No: esos dos se crean por migración a propósito.

**Recomiendo (a).** `SYSTEM_ROLES` ya es la fuente única con los 7 y el servidor ya los acepta (`validateRoleAndModulos` valida contra `SYSTEM_ROLE_KEYS`); la pantalla es el único lugar donde la lista se escribió a mano y se quedó corta. Es exactamente el bug de copiar una lista que ya existe.
