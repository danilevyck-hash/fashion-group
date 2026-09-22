# La navegación — el porqué

> Post-mortem de los cuatro arreglos del **17-sep-2026**, salidos de la auditoría de rutas del 6-sep (`docs/mapas/rutas.md`, 53 direcciones). Daniel la leyó y contestó **«todas»**. Ninguno mueve plata.
>
> ⚠️ **Estas reglas NO están en `CLAUDE.md`, y no por olvido**: el archivo pesaba **129.997 caracteres** el 17-sep-2026 y su candado (`claude-md-bajo-el-tope.test.ts`) corta en **130.000** — quedaban **3 caracteres**. Meterlas ahí obligaba a sacar reglas de otro módulo, y qué se saca de CLAUDE.md es una decisión de Daniel, no de quien pasa por acá. **Pendiente suyo: decidir qué se poda para que estas cuatro suban.**

---

## 1. No existía ni una pantalla de 404

🩸 **Medido el 6-sep-2026 y todavía cierto el 17**: `find src/app -name not-found.tsx` → **ninguno**. Quien escribía mal una dirección veía el 404 de Next: pantalla en blanco, en **inglés** («This page could not be found»), sin decir qué pasó y sin un solo enlace para salir.

No es un caso raro. La misma auditoría contó **trece direcciones intermedias del sistema** que caen ahí si alguien las recorta o las teclea: `/catalogos`, `/catalogos/admin`, `/catalogo`, `/catalogo/[marca]/confirmacion`, `/productos`, `/g`, y las públicas sin id. Dos de ellas son **a donde apunta el breadcrumb** de sus propias pantallas (el hub de Catálogos y Plantilla Switch).

**Ahora** (`src/app/not-found.tsx`): «Esta pantalla no existe», una línea que dice por qué —la dirección puede estar mal escrita, o la pantalla se movió— y dos salidas: **Ir al inicio** y **Volver**.

⚠️ **«Volver» solo se dibuja si hay a dónde volver** (`window.history.length > 1`). Un botón que no hace nada es peor que no tenerlo.

---

## 2. «Ir al inicio» es la CASA DEL ROL, no `/home` a secas

🔴 Es la regla más fácil de romper de las cuatro, porque `/home` **se ve correcto en el código** y es exactamente la pantalla que algunos roles no pueden ver: entran, `/home` los empuja a su módulo, y el botón «Inicio» se siente muerto.

La regla vive en **`src/lib/navegacion/casa-del-rol.ts`**, en un solo lugar para las **tres puertas**: el redirect de `/home`, la pantalla de 404 y el botón «Inicio» del encabezado (breadcrumb en la computadora, cajón ☰ en el celular).

```
admin                         → /home
un solo módulo visible        → ese módulo
MODULO_CASA_POR_ROL           → su casa, aunque tenga varios módulos
el resto                      → /home
```

⚠️ La casa se resuelve contra los módulos **VISIBLES**: si a alguien le quitaran su módulo a mano, esto no lo manda a una pantalla que no puede ver.

🩸 **Y `/home` empujaba con `push`.** Por eso `/home` quedaba en el historial: se tocaba Atrás, se volvía a `/home`, y `/home` empujaba de nuevo. **Atrás quedaba muerto** mientras la persona estuviera en la app. Ahora es `replace`.

🔴 **Si ya está parado en su casa, el botón NO se dibuja** — ni en el breadcrumb ni en el cajón.

### Lo que la auditoría decía mal, medido el 17-sep-2026

La auditoría del 6-sep contaba **tres** roles atrapados: bodega, Jennifer (`gerente_acs`) y David (`gerente_boston`). Medido hoy contra `getVisibleModules`:

| Rol | Módulos visibles | Casa |
|---|---|---|
| admin | 21 | `/home` |
| secretaria | 11 | `/home` |
| contabilidad | 5 | `/home` |
| vendedor | 5 | `/home` |
| **bodega** | **4** (referencia · catalogos · guias · asistencia) | `/home` |
| **gerente_acs** (Jennifer) | **1** (multifashion) | `/multifashion` |
| **gerente_boston** (David) | 3, con CASA fijada | `/boston` |
| **marcacion** | **1** | `/marcacion` |

⚠️ **Bodega ya no es un rol de un solo módulo** y no lo era cuando se escribió la auditoría: le abrieron catálogos, referencia y asistencia. `CLAUDE.md` ya lo marcaba en su tabla de Roles. O sea: de los tres que la auditoría nombraba, **el que más sesiones tiene (77 en 30 días) no tenía este problema**. Los que sí: Jennifer (26 sesiones) y el rol de marcación; David entra por su casa.

---

## 3. El breadcrumb de Usuarios mentía dos veces

🩸 Decía **`Inicio › Sistema › Usuarios`**. Dos cosas mal en tres palabras:

1. **«Sistema» no existe**: el grupo se llama **Administración** desde el rediseño del home.
2. **El clic caía en `/admin`**, que `next.config.js` redirige a **Cuentas por Cobrar**. El único módulo del grupo Administración te sacaba del módulo al tocar su propio nombre. (El clic del breadcrumb va al **primer segmento** de la dirección, `pathname.split("/").slice(0,2)`.)

**Ahora**: `Inicio › Administración › Usuarios`, y «Administración» lleva a `/g/administracion`.

🔑 El rótulo y la dirección **no se escriben a mano**: salen de `grupoDeModulo("usuarios")` (`src/lib/modules.ts`), que los deriva de `GROUPS`. Así, un grupo que se renombre no deja otro marcador viejo escrito en una pantalla — que es exactamente cómo nació este defecto.

`AppHeader` ganó una prop **`grupo?`**, opcional y aditiva: quien no la pasa dibuja `Inicio › Módulo › …` exactamente como antes.

⚠️ **Lo que NO se decidió acá**: si el breadcrumb del sistema entero debe llevar el grupo (pregunta 2 de la auditoría). Se le puso a Usuarios porque su grupo es el que estaba mal escrito.

---

## 4. «Reclamos sin pagar» de Vista General no abría el reclamo

🩸 La tarjeta enlazaba a **`/reclamos?id=X`**. Reclamos solo abre el detalle cuando la dirección trae **`view=detail`**: se tocaba el reclamo y se caía en el **selector de empresas**. Sin error, sin aviso. Un enlace que no llega no da error: te deja en otra pantalla, que es peor, porque parece que funcionó.

Es la misma familia de defectos que la búsqueda global cerró el 11-sep-2026 («cada resultado lleva a donde dice», `busqueda-global-destinos.test.ts`), y este era el que faltaba.

**Ahora**: `lib/reclamos/enlace.ts` arma `?empresa=…&view=detail&id=…`. Los tres niveles de Reclamos viven en la dirección y el SSR trae el detalle, así que el enlace abre el reclamo aunque sea la primera pantalla de la sesión. Con la empresa, además, el «Atrás» cae en la lista de ESA empresa y no en el selector.

⚠️ **La empresa se manda solo cuando se sabe.** La ruta de Vista General escribe `r.empresa || "—"`: ese guion **no es una empresa** y no viaja. Nada se adivina.

---

## Candados y verificación por mutación

- `src/__tests__/lib/navegacion-lleva-a-donde-dice.test.ts` — 25 casos.
- `src/__tests__/components/pantalla-no-existe.test.tsx` — 6 casos de conducta (el 404 renderizado, con el rol en `sessionStorage`).
- Cambiaron de **ancla** con nota fechada, sin cambiar de regla: `boston-acceso` · `multifashion-acceso` · `marcacion-permisos` · `data-health-dentro-de-usuarios`. Los cuatro medían el `if` del auto-redirect adentro de `/home`; ahora exigen la **conducta** de `casaDelRol`, que es más fuerte.
- `scripts/_mutar-candados-navegacion-pdf-csv.sh` — **19 mutaciones, 19 cazadas, 2 controles en verde** (junto con el PDF de Comisiones y el CSV de Reclamos, que se hicieron el mismo día).

---

## Lo que sigue abierto de la auditoría

Ninguno de estos se tocó; los cuatro son decisión de Daniel (preguntas 1, 5 y 6 de `docs/mapas/rutas.md`):

- **Catálogos: dos árboles** (`/catalogos/*` y `/catalogo/*`), `/catalogo` en 404 y ninguna pantalla que vuelva al hub. Es el punto 12 de `docs/pendientes-vivos.md`.
- ~~**El breadcrumb que cae en 404**~~ y ~~**`?search=` de Préstamos**~~ — **los dos se cerraron el 18-sep-2026**, abajo.
- **Las pestañas y filtros sin dirección propia** de Comisiones, Comprobantes, Boston y Asistencia › Planilla: hoy no se pueden compartir ni sobreviven a un F5.

---

# Lo que se cerró el 18-sep-2026

> Dos de los cuatro puntos que arriba quedaban abiertos. Ninguno mueve plata.

## 5. El breadcrumb adivinaba la dirección del módulo recortando la URL

🩸 El encabezado armaba el enlace del nombre del módulo con `pathname.split("/").slice(0, 2)` — o sea, **el primer tramo de la dirección que uno tiene abierta**. Para 19 de los 22 módulos eso da justo su dirección, y por eso nunca se notó. Para los otros tres, no:

| Pantalla | Módulo | El enlace daba | Y eso es |
|---|---|---|---|
| `/productos/cargar` | Plantilla Switch | `/productos` | **404** — no existe |
| `/admin/usuarios` | Usuarios | `/admin` | **Cuentas por Cobrar** (`next.config` lo redirige) — OTRO módulo |
| `/catalogos/marcas` | Catálogos | `/catalogos` | vivo **solo** por el redirect que se le puso el 17-sep |

⚠️ **Medido el 18-sep antes de tocar nada**: en Plantilla Switch y en Usuarios el nombre del módulo es hoy el ÚLTIMO pedazo del breadcrumb, y el último no se puede tocar (es texto plano). O sea que el 404 estaba a **un breadcrumb de distancia**, no a un clic: bastaba que esas pantallas ganaran un nivel más —como ya lo tiene Catálogos, que por eso sí caía— para que se abriera. En Catálogos sí se tocaba, y por eso se tapó con un redirect el 17-sep.

**Ahora** (`src/lib/navegacion/href-del-modulo.ts`): la dirección de un módulo la dice **`modules.ts`**, que es donde vive, y no se vuelve a adivinar de la URL. Se reusa `moduloDeRuta` —el mismo que ya elegía qué novedades mostrar—, que gana el `href` **más largo** que calce, así que `/admin/usuarios` es Usuarios y no cualquier cosa que empiece con `/admin`.

🔑 **Falla ABIERTA**: una dirección que no es de ningún módulo (`/catalogo/reebok/pedidos`) se resuelve recortando, exactamente como antes. Esto no puede dejar el encabezado sin enlace.

De paso, `/productos` a secas deja de ser un callejón: redirige a `/productos/cargar`, igual que `/catalogos` → `/catalogos/marcas`. Fuente **EXACTA**, así que `/productos/cargar` no se toca.

## 6. El `?search=` de Préstamos: un parámetro que viajaba y nadie leía

La búsqueda global tenía un atajo que decía **«Buscar préstamos de "Juan"»** y mandaba a `/prestamos?search=Juan`. El parámetro viajaba entero —el middleware conserva la query al redirigir a la pestaña— hasta una pantalla que **lo ignora**: se abría Préstamos completo y el nombre se perdía en el camino.

⚠️ **Comprobado antes de quitarlo**: el único lugar de todo el repo que arma `/prestamos?search=` era ese atajo, y no hay un solo `searchParams.get("search")` en Préstamos. **La pestaña SÍ tiene buscador**, pero su llave es `buscar` (`PARAM_BUSCAR`, la misma en todo el sistema), nunca `search`.

**Ahora**: **«Ir a Préstamos»**, a `/prestamos`. Mismo trato que los siete atajos de cheques del 5-sep-2026, que apuntaban a pestañas que ya no existían y se volvieron uno solo: el atajo se queda porque llevar al módulo sirve, pero **dice lo que hace**.

🔴 **Pendiente de Daniel, no olvido**: hacer que el atajo escriba de verdad en el buscador de la pestaña (`/prestamos?buscar=Juan`) es una decisión suya, no de quien pasa por acá.

## Candado y verificación por mutación

- `src/__tests__/lib/registro-de-descargas-y-enlaces.test.ts` — 22 casos (con el contador de descargas del mismo día; ver `docs/pendientes-vivos.md` › 16).
- `scripts/_mutar-candados-registro-y-enlaces.sh` — **15 mutaciones, 15 cazadas**, 2 controles en verde.

---

# El blanco del primer pintado (19-sep-2026)

> Post-mortem del arreglo de **cuatro pantallas**. Ninguno mueve plata: es pantalla, y nada de lo que se guarda cambió.
>
> ⚠️ Estas reglas tampoco están en `CLAUDE.md`, por la misma razón que las seis de arriba: el archivo está a **129.652 caracteres** de un tope de **130.000** y su candado (`claude-md-bajo-el-tope.test.ts`) pone el build rojo. **Sigue pendiente de Daniel decidir qué se poda.**

## Lo que vio Daniel

Ana Trejos abrió la app de marcación en su teléfono. Dos capturas seguidas:

1. **Pantalla en blanco**: solo el encabezado «FG · marcacion» con la raya amarilla. Nada más.
2. **Un instante después**, todo de golpe: «Hola, Ana Trejos», el reloj grande «5:47 p. m.», «Sábado 19 de septiembre · hora de Panamá», el botón negro «Marcar entrada» y «Todavía no tienes marcas en esta quincena».

Daniel, textual: *«la primera se pone y de una la segunda, se siente lagged. Necesito arreglar eso porque seguro le pasan a otros usuarios con otros módulos»*.

## Por qué pasaba

`src/app/marcacion/page.tsx` pintaba el cascarón y **`MarcacionClient.tsx` pedía los datos DESDE EL NAVEGADOR** (`fetch("/api/marcacion")` dentro de un `useEffect`). Entre que se pintaba el encabezado y que llegaba la respuesta **no había nada que mirar**. En la oficina eso dura 200 ms y no se nota; en la calle, con señal mala, dura segundos — y es justo donde se usa esa pantalla.

🔑 **No era un problema de red, era de orden.** El dato existía y el servidor podía traerlo: nadie se lo había pedido.

## 1 · Marcación — el primer pintado ya trae el contenido

**`page.tsx` pasó a ser un componente de SERVIDOR que arma el estado ahí mismo**, con la **misma** función que contesta la ruta (`armarEstadoDeLaPantalla`, `lib/marcacion/estado-server.ts`). No hay una segunda forma de armarlo, así que la pantalla no puede decir una cosa al abrirse y otra al refrescarse. Lo que arma viaja como la prop `inicial` de `MarcacionClient`.

🔴 **FALLA ABIERTA.** Si la base no contesta, `semillaDeLaPantalla()` devuelve `null` y la pantalla se comporta EXACTAMENTE como antes: pide el dato desde el navegador. Un arreglo de pantalla no puede dejar a nadie sin poder marcar.

🔴 **Y SIN SEMILLA SE DIBUJA UN ESQUELETO, NUNCA UN BLANCO** (`EsqueletoMarcacion.tsx`).

### El reloj, que es la parte delicada

El reloj grande es del cliente —camina, y es la hora de Panamá, no la del teléfono—, así que había que resolverlo **sin parpadear y sin inventar una hora**.

Cómo quedó: con semilla, `ahora` arranca en el **instante que dijo el servidor** y `desfase` en **0**. Por construcción, el primer cuadro dibuja EXACTAMENTE `inicial.ahora` — la hora que contestó el servidor, ni una inventada ni la del teléfono. Al montar, el efecto vuelve a medir el desfase contra este teléfono y el reloj empieza a caminar anclado ahí.

🔑 **Las dos cosas con el MISMO instante:**

```ts
const enEsteTelefono = Date.now();
setAhora(enEsteTelefono);
setDesfase(semilla - enEsteTelefono);
```

Medirlos por separado (`setDesfase(semilla - Date.now())` a secas, dejando `ahora` en la semilla) hace que `ahora + desfase` valga `semilla × 2 − ahora`: con un teléfono adelantado tres horas, **el reloj se va tres horas para atrás en el primer tic**. La mutación 7 del script existe por eso.

🔑 Y hay un segundo motivo para que el servidor y el navegador dibujen el MISMO texto en el primer cuadro: **si difieren, React corrige la hidratación, y esa corrección se ve como un parpadeo** — el mismo que se estaba arreglando.

### El esqueleto mide lo que reemplaza

🔴 **Un esqueleto que mide distinto no arregla el parpadeo: lo cambia por un salto, que se siente peor.** Por eso cada bloque de `EsqueletoMarcacion.tsx` lleva el número de la pantalla real: el saludo `h-5` (el alto de una línea `text-sm`), el reloj **`h-[46px]`** contra el `text-[46px] leading-none` de la hora, la fecha `h-5`, el botón el **mismo `min-h-[56px]`** y «Mis marcas» `h-5`, con los mismos `mt-3 · mt-2 · mt-6 · mt-8`.

⚠️ **La barra del encabezado del `loading.tsx` mide `h-11` + 2 px de borde**, que es el alto REAL de `AppHeader` en celular — no el `h-14` que usan las otras seis pantallas de la casa, todas de escritorio. Con `h-14` el contenido bajaría 10 px al entrar el encabezado de verdad.

⚠️ **No dice «Cargando…»**: un texto centrado que después desaparece es exactamente el salto que se está evitando.

🔴 **El esqueleto es UNO SOLO**, y por eso vive en su archivo: lo leen las dos esperas de esta pantalla —`loading.tsx` (mientras el servidor arma el estado) y `MarcacionClient` (si el servidor no pudo)—. `loading.tsx` sigue el molde de la casa: `DelayedSkeleton`, para que en una carga rápida no aparezca ni un gris.

🔑 **El texto «sin ficha de colaborador» se mudó al módulo puro** (`AVISO_SIN_CODIGO`). Un archivo de ruta de Next no puede exportar otra cosa que sus métodos, así que la única forma de que la página y la ruta digan lo mismo es que el texto viva afuera de las dos.

## 2 · Las otras tres — medidas primero, arregladas después

🔴 **No se tocaron las 34.** Se midió cuáles parpadean de verdad y se ordenaron por quién las usa, cada cuánto y si se abren en el teléfono. **De 53 pantallas, 34 piden su dato desde el navegador al abrirse; siete quedaban literalmente en blanco.** El resto de la medición, y las que quedan, están en [`docs/pendientes-vivos.md`](../pendientes-vivos.md) › 27.

- **Cuentas por Cobrar** (`src/app/cxc/page.tsx`) — 🩸 la rama de carga dibujaba cinco filas grises **sin `AppHeader` y sin la tira de pestañas**: al llegar el dato aparecían las dos cosas de golpe y **toda la lista bajaba de un salto**. Ahora el encabezado va primero —no necesita ningún dato— y la tira de pestañas reserva su alto (`min-h-[44px]`, el de los botones de `TabsCartera`). No se dibujan las pestañas de verdad porque cuáles van depende del rol.
- **El checkout del vendedor** (`CheckoutClient.tsx`) — 🩸 decía `if (!loaded) return null`. El vendedor, en la calle, veía la pantalla vacía. Ahora el título «Confirmar pedido» y la salida al catálogo se dibujan desde el primer cuadro y solo los renglones esperan, ocupando su lugar.
- **«Revisa tu pedido»** (`RevisarPedidoPublico.tsx`) — lo mismo, y es la pantalla donde un **cliente** confirma su pedido, en su teléfono y sin sesión.

⚠️ **No se metió cacheo de navegación.** La app es siempre en línea y el service worker es mínimo a propósito (`CLAUDE.md` › PWA): tapar esto con caché es lo que se retiró en jul-2026 con el Modo Viaje.

## Candado y verificación por mutación

- `src/__tests__/lib/marcacion-sin-blanco.test.tsx` — 24 casos, en siete bloques: el primer pintado trae el contenido · la hora de ese cuadro es la del servidor · sin semilla hay esqueleto · el esqueleto mide lo mismo · el esqueleto es uno solo · la página arma el estado en el servidor y falla abierta · las otras tres pantallas.
- `scripts/_mutar-candados-sin-blanco.sh` — **17 mutaciones, 17 cazadas**, 2 controles en verde.

## 3 · El gancho: el primer pintado ya sabe quién mira (19-sep-2026, noche)

Daniel eligió la opción (a) del pendiente 27: tocar `useAuth` una vez en vez de arreglar pantalla por pantalla.

### Lo que pasaba

`src/lib/hooks/useAuth.ts` arrancaba con `authChecked = false` y solo lo ponía en `true` dentro de un `useEffect`, leyendo `sessionStorage`. **29 pantallas** hacen `if (!authChecked) return null` (más `GroupPage` y `/home`, que tienen el mismo chequeo escrito a mano). Medido contra el código: el HTML que mandaba el servidor era **vacío** en las 31 — y Next prerenderizaba **12 de esas rutas como HTML estático vacío** (`/cxc`, `/guias`, `/caja`, `/vista-general`, `/marketing`, `/admin/usuarios`, `/catalogos/marcas`, `/gastos-contabilidad`, `/productos/cargar`, `/marketing/mobiliario`, `/home`, `/`), o sea que el CDN servía el blanco con toda la velocidad del mundo. Las **ocho servidas** (`/clientes`, `/clientes/[codigo]`, `/reclamos`, `/recordatorios`, `/prestamos`, `/multifashion`, `/comisiones`, `/g/[grupo]`) traían sus datos del servidor y `return null` los tiraba: por eso cinco de los seis `loading.tsx` mostraban un esqueleto y después la pantalla se iba a blanco igual.

🔑 **El servidor YA sabía quién era.** La cookie `cxc_session` viaja firmada con HMAC y el login la firma con `{ ...armarPayloadSesion(user), sessionToken }`: **rol, módulos, `isOwner` y nombre van adentro** (`src/app/api/auth/route.ts`). El middleware la verifica y la comprueba contra `user_sessions` antes de que cualquier página se dibuje. Solo faltaba contárselo a la pantalla.

### Cómo quedó

- **`lib/auth-check.ts`** — la regla «¿este rol entra a este módulo?» se sacó a `tieneAccesoAlModulo(role, modules, moduleKey, allowedRoles)`, pura. `hasModuleAccess` (el navegador, con `sessionStorage`) la llama. 🔴 **Es UNA regla**: si el servidor dijera sí y el navegador no, se vería un parpadeo, o algo peor.
- **`lib/sesion-semilla.ts`** — `semillaDeSesion(payload)` arma `{ role, modules, isOwner, userName }` **enumerando los campos**: 🔴 **nunca el `sessionToken`, nunca el `userId`**, porque la semilla se serializa al navegador con la página. `accesoConSemilla` aplica la misma regla.
- **`lib/sesion-semilla-servidor.ts`** — `leerSemillaDeSesion()` lee `cookies()` y pasa **solo por `verifySession`** (HMAC en tiempo constante, fail-closed sin `SESSION_SECRET`). Con la cookie forjada, sin firma, o con `cookies()` roto → `null`, y la pantalla se comporta EXACTAMENTE como antes. **Falla abierta hacia la conducta vieja**: un arreglo de pintado no deja a nadie sin pantalla.
- **`app/layout.tsx`** — el layout raíz lee la semilla y la baja por contexto (`SemillaSesionProvider`). ⚠️ Leer `cookies()` en el layout raíz vuelve **dinámicas** las 12 rutas estáticas: a propósito, porque su HTML estático era el vacío, y el middleware ya corre (con su consulta a Supabase) en cada petición de todos modos.
- **`hooks/useAuth.ts`** — `authChecked`, `role` e `isOwner` **arrancan en lo que dice la semilla**. Con acceso, el servidor manda la pantalla dibujada con el rol de la cookie; sin acceso o sin semilla, `null` como siempre. 🔴 **El efecto NO cambió**: después de hidratar, `sessionStorage` sigue mandando. Lo único nuevo en él: si niega (o está vacío, una pestaña nueva), `setAuthChecked(false)` **retira lo que el servidor dibujó en ese mismo instante**, antes del toast y del `router.push`.
- **`components/GroupPage.tsx`** — lo mismo, con su chequeo propio.

### Por qué la seguridad no se movió

- El guard de verdad **sigue siendo el del servidor**: el middleware (sin cookie válida y viva no se sirve ni una página) y los guards SSR de cada página (`/reclamos`, `/clientes`, `/recordatorios`, `/prestamos`, `/multifashion`, `/guias/nueva`, `/catalogos/admin`…), que no se tocaron. La semilla decide qué se **pinta**, no qué se **sirve**.
- **Nadie ve datos de otro rol, ni un instante.** El rol del primer cuadro es el de la cookie firmada, no una suposición: un botón que solo ve un admin se dibuja solo si la cookie dice admin. Con un rol sin acceso, la pantalla devuelve `null` en el servidor — el candado lo prueba con `renderToString` de `/admin/usuarios` y `/vista-general` para los siete roles que no son admin, con módulos regalados y todo: **HTML vacío**.
- Los datos que una pantalla pide desde el navegador **no están en el primer cuadro**: la pantalla muestra su estado de carga, que es el mismo que hoy mostraba un instante después.
- ⚠️ **Lo que sí cambia en una pestaña nueva** (enlace de WhatsApp con la cookie viva y `sessionStorage` vacío): antes, blanco → login → casa del rol; ahora, **la pantalla del usuario un instante → login → casa del rol**. Es su propia pantalla (la cookie es suya y la verificó el middleware), y el enlace se pierde igual que antes. Conservar el enlace pediría que el gancho rehidrate `sessionStorage` desde `/api/auth/sesion` en vez de rebotar — **decisión pendiente de Daniel**, no se hizo.

### Lo que NO se tocó, y por qué

- **`/home`** — tiene su chequeo propio y pinta según el modo oscuro (`localStorage`), que el servidor no puede saber: seeded, un usuario en modo oscuro vería un flash claro, peor que el blanco. ⚠️ **Su REBOTE sí se mudó al servidor el 19-sep-2026 por la tarde — ver el punto 4 de abajo**: decidir a dónde va la petición no obliga a pintar nada. Y el saludo pasaría de «Buen día, daniel» (el usuario de login, lo que trae la cookie) a «Buen día, Daniel Levy» (el nombre real, que se pide aparte). Las dos cosas piden una decisión (por ejemplo, guardar la preferencia de modo oscuro en una cookie).
- **`/prestamos/[id]`** — su `return null` también espera `loading` y `empleado`, que vienen de un `fetch` del navegador: con la semilla ya no espera la sesión, pero sigue en blanco hasta que llega la ficha. Pide traer la ficha en el servidor, como Recordatorios.
- **Ningún número cambió**: esto es pintado, no cálculo. La suite entera (789 archivos, 16.111 tests) pasó sin tocar un solo test viejo — los que simulan `useAuth` siguen simulándolo igual.

### Candado y verificación por mutación

- `src/__tests__/lib/sesion-semilla-primer-pintado.test.tsx` — 51 casos en siete bloques: la regla es una · la semilla lleva solo lo necesario · el servidor solo cree en la firma y falla abierta · el primer pintado trae contenido (GroupPage real, Comisiones con sus años, Recordatorios con su cheque y **cero `fetch`**) · 🔴 nadie ve lo que no le toca (dos pantallas de admin × siete roles, y la pestaña vieja de bodega que se retira) · el cableado · las 29 pantallas por nombre.
- `scripts/_mutar-candados-sesion-semilla.sh` — **15 mutaciones, 15 cazadas**, 2 controles en verde. Entre ellas: el defecto original tal cual, «con cookie basta», la cookie forjada, la semilla que arrastra el token, y la pantalla que no se retira cuando `sessionStorage` niega.

---

# 4 · Quien no tiene Inicio no lo ve ni un instante (19-sep-2026, tarde)

Daniel, textual: ***«la persona entra y se ve el home y de una marcaciones, se siente bug»***.

## Lo que se veía

Ana Trejos (2), Cindy De Gracia (3) y Yeisibeth Muñoz (306) tienen el rol `marcacion`: **un solo módulo**. Entraban a `/home`, **veían dibujarse el Inicio** —el saludo, la fecha, las fichas— y un instante después el sistema las botaba a `/marcacion`. Lo mismo Jennifer (`gerente_acs`, un solo módulo → `/multifashion`) y David (`gerente_boston`, tres módulos pero **casa fijada** → `/boston`).

## Por qué pasaba

La regla estaba bien y vivía en un solo lugar (`lib/navegacion/casa-del-rol.ts`, punto 2 de este mismo archivo). Lo que estaba mal era **cuándo** se aplicaba: en un `useEffect` de `src/app/home/page.tsx`, o sea **en el navegador**. El orden real era:

```
servidor manda el Inicio ENTERO  →  el navegador lo pinta  →  baja el JavaScript
→  hidrata  →  lee sessionStorage  →  recién ahí sabe el rol  →  router.replace
```

Cinco pasos con pintura en el medio. No es lentitud de red: el HTML del Inicio **ya había salido** antes de que nadie preguntara quién entraba.

🔑 **Y el servidor ya lo sabía.** Desde el 19-sep por la mañana (punto 3) la cookie firmada se lee en el servidor con `leerSemillaDeSesion()`: trae **rol y módulos**, verificados por HMAC, y el middleware ya la comprobó contra `user_sessions` antes de que la página se dibuje.

## Cómo quedó

**`src/app/home/layout.tsx`** — un componente de **servidor** de seis líneas, que Next corre **antes** que `page.tsx`:

```
semilla = leerSemillaDeSesion()          ← la cookie FIRMADA, nada más
casa    = casaDelRol(role, modules)      ← la MISMA regla de siempre
casa ≠ /home  →  redirect(casa)          ← sale un 307 y no viaja una línea de HTML
```

Tres decisiones, y las tres importan:

1. 🔴 **La regla no se reescribió.** Es `casaDelRol`, el módulo que ya usan el efecto de `page.tsx`, el 404 y el botón «Ir al inicio» del encabezado. Un segundo lugar que decida «cuál es tu casa» es exactamente el bug que ese archivo vino a cerrar en el punto 2. El candado exige que los **cuatro** lo importen, y que el layout no tenga ni un `role === "…"` ni el nombre de un rol escrito adentro.
2. 🔴 **Falla ABIERTA.** Sin cookie, con cookie forjada o sin firma, sin `SESSION_SECRET`, con `cookies()` reventando o con un rol desconocido → no redirige a nadie y se sirve el Inicio como siempre. Un redirect equivocado deja a alguien fuera de su trabajo; un pintado de más solo se ve feo.
3. 🔴 **El efecto del navegador NO se tocó, y no sobra.** Es la red del que entra sin semilla (pestaña con `sessionStorage` vacío), del rol `cliente` del catálogo público de Reebok, y del caso en que la cookie y `sessionStorage` no dicen lo mismo. Sigue empujando con `replace`, nunca con `push`.

⚠️ **Se eligió un `layout.tsx` y no partir `page.tsx` en dos.** `src/app/home/page.tsx` lo leen **diez candados como TEXTO** (`boston-acceso`, `multifashion-acceso`, `toque-44`, `inicio-sin-promesas`, `data-health-sin-pantalla`, `navegacion-lleva-a-donde-dice`…) y dos scripts de mutación. Mover su cuerpo a un `HomeClient.tsx` los habría roto a todos sin arreglar nada de lo que ellos vigilan. El layout deja `page.tsx` **byte por byte igual**.

## El modo oscuro: por qué NO impide esto

Es el motivo real por el que `/home` quedó fuera del arreglo de la mañana, y sigue siendo cierto — **pero es un impedimento para PINTAR, no para DECIDIR**:

- `page.tsx` no usa clases de Tailwind `dark:`; lee `localStorage.getItem("fg_dark_mode")` en un efecto y **arma cada `className` a mano** con un ternario sobre el estado `darkMode` (`fichaBase`, `iconoBase`, `textoBase`, el fondo del `<div>` raíz). El servidor no puede leer `localStorage`, así que si dibujara el Inicio lo dibujaría **siempre en claro**, y quien usa modo oscuro vería un destello blanco. El script del `<head>` del layout raíz pone la clase `dark` en el `<html>` a tiempo, pero **eso no alcanza**: los colores del Inicio no cuelgan de esa clase.
- El layout nuevo **no pinta nada**: devuelve `children` o se va por el `redirect()`. Quien se queda en el Inicio lo recibe exactamente como antes, sin destello.
- Que `/home` pinte en el servidor sigue **pendiente de Daniel**, y pide una decisión suya: guardar la preferencia de modo oscuro en una cookie (y de paso el nombre del saludo, que hoy se pide aparte a `/api/auth/perfil`).

## Lo que NO cambió

- **Quien tiene varios módulos ve el Inicio igual que hoy**: admin (21 módulos), secretaria (11), vendedor (5), contabilidad (5) y **bodega (4 — Angel y Rodrigo)**. Medido rol por rol contra `getVisibleModules`.
- **Nada toca la base ni la planilla**: esto es navegación.
- La cookie es la de siempre (`cxc_session`, HMAC) y **el `sessionToken` no se lee**: el candado lo exige por texto.

## Candado y verificación por mutación

- `src/__tests__/lib/home-rebote-en-el-servidor.test.tsx` — **25 casos** en seis bloques: la decisión es del servidor (el layout no es `"use client"`, no decodifica la cookie por su cuenta, no pinta nada suyo) · un solo módulo redirige y el Inicio **no se alcanza a renderizar** · varios módulos lo ven, con los **ocho roles del sistema** comparados contra `casaDelRol` · sin sesión falla abierta (seis formas de no tener sesión) · la regla es la de siempre y los cuatro lugares importan el mismo módulo · el efecto del navegador sigue ahí con su `replace`.
- **5 mutaciones, 5 cazadas**, control en verde: quitar el `redirect` (7 fallos), invertir la condición (13), redirigir sin semilla (6), volverlo `"use client"` (1) e ignorar los módulos para mirar solo el rol (1).

---

## Lo que decía CLAUDE.md hasta el 22-sep-2026 (movido acá, verbatim)

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

## Módulos (src/lib/modules.ts)
Fuente única de navegación + permisos de UI. **3 grupos** (rediseño del home, jul-2026):
- **Ventas y clientes:** Vista General, Ventas, CXC (`/cxc` — era `/admin` hasta el 5-sep-2026; el rótulo sigue siendo «Cuentas por Cobrar» y `/admin` redirige), Multifashion, **Confecciones Boston** (`/boston`, key `boston` — 27-ago-2026), Clientes/Directorio (`/clientes`), Proveedores, **Referencia** (`/referencia`, key `referencia` — 12-ago-2026), Catálogos (**CUATRO** marcas ENCENDIDAS: Reebok, Joybees, Tommy Hilfiger y **Calvin Klein**, cada una con su tarjeta en el hub /catalogos/marcas, su catálogo público compartible y su pedido público `/pedido-<marca>/[id]` accesibles sin sesión)
- **Operación:** Guías de Despacho, **Asistencia y Planilla** (`/asistencia`, key `asistencia` — 3-ago-2026), Reclamos, **Plantilla Switch** (`/productos/cargar`, key `cargar` — era *Depurador* hasta el 8-sep-2026; la key y la dirección NO cambiaron), Comisiones, Marketing, Caja Menuda, **Gastos** (`/gastos-contabilidad`, key `gastos-contabilidad` — 11-ago-2026; 2 pestañas: *Gastos* —Egresos Varios, fuente ÚNICA desde el 13-ago-2026— y *Saldos de banco*), Préstamos, **Recordatorios** (`/recordatorios` desde el 5-sep-2026, era `/cheques`; era *Cheques*; la `key` sigue siendo `cheques` — ver abajo)
- **Administración:** Usuarios. 🩸 **Data Health se fue de la pantalla el 11-sep-2026** (Daniel: no lo usa) y **la medición se quedó ENTERA** — ver `docs/donde-vive-cada-dato.md` › `data_integrity_checks` y la skill `data-integrity`.

> **Nacidos después del 5-jul-2026** (auditoría de estado, 31-ago): los cuatro módulos navegables `asistencia` · `gastos-contabilidad` · `referencia` · `boston`, más dos PÁGINAS públicas que **no son módulos** y por eso no tienen ficha ni entrada en `role_permissions`: `/pedido-tommy/[id]` (24-jul) y `/pedido-calvin/[id]` (12-ago). En el mismo período nacieron **89 rutas API** y 6 grupos nuevos (`api/asistencia`, `api/boston`, `api/gastos-contabilidad`, `api/saldos-banco`, `api/recordatorios`, `api/diag`).

> 🩸 **«Packing Lists» (key `packing-lists`) se RETIRÓ el 10-sep-2026** (0 filas, nadie lo usó). Las tablas `packing_lists` y `pl_items` **NO se dropean** (patrón `mayor_lineas`), quedan `retirada` fuera del respaldo; `/packing-lists*` redirige a `/home` (307). Candado: `packing-lists-retirado.test.ts`. Detalle en `docs/historico/superado.md`.

> Las fichas del home y del sidebar NO llevan subtítulo (auditoría de textos, #278): el campo `subtitle` se eliminó de `AppModule`.
> Páginas de grupo: `/g/[grupo]` con los 3 slugs nuevos. Los slugs viejos redirigen en `next.config.js` (`/g/sistema` → `/g/administracion`; `/g/plata-entra`, `/g/plata-sale`, `/g/productos` → `/home`).

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
