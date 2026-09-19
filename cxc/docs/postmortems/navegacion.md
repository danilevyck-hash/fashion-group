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
