# Histórico — módulos retirados y decisiones superadas

> Movido de `cxc/CLAUDE.md` el 31-ago-2026. **Verbatim, nada se borró.**
> Acá vive lo que ya no describe el sistema de hoy: el mayor contable retirado,
> `multifashion_tickets` congelada, Camisetas, el Modo Viaje, el changelog de abril-2026
> y las notas marcadas SUPERADO. Los datos de esas tablas NO se borraron: `git revert`
> del PR correspondiente sigue siendo el camino para reencenderlas.

---

> ## 🔴 EL MAYOR CONTABLE SE RETIRÓ — queda UNA sola fuente de gasto (13-ago-2026)
>
> Daniel, textual, después de entender que Vista General usaba el mayor y el módulo de Gastos usa Egresos Varios: ***"y entonces borra Mayor contable en el sistema"***.
>
> **Por qué:** eran dos formas de medir lo mismo y el mayor iba **siete meses atrás** — `mayor_lineas` tiene **135 filas y solo enero**, contra los 441 renglones de `egresos_varios` que llegan hasta julio. El módulo ya mostraba Egresos Varios por defecto; el mayor era una fuente ALTERNATIVA que había que elegir a mano.
>
> 🔴 **EL ORDEN IMPORTABA Y SE RESPETÓ.** Este retiro esperó a que **#536 (Vista General sale del mayor) estuviera MERGEADO en `main`** — se verificó en el commit, no de palabra. Sacarlo antes le habría roto el tablero al dueño. Cuando se revisó por primera vez, #536 seguía abierta y el trabajo se frenó.
>
> ### Qué se retiró
>
> El cron **`sync-mayor`** (09:05 UTC — un login web menos por día contra Switch, y cada login puede expulsar a Daniel del panel), su route, `lib/switch-api/sync-mayor.ts`, `lib/mayor/` entero, la **fuente "mayor"** del módulo con su **selector** y el **`?fuente=`** de la URL, la ruta `api/gastos-contabilidad/resumen`, los componentes `ResumenEmpresas` · `DetalleEmpresa` · `EstadoMesTag` · `AvisosDelMes` · `SelectorFuente`, `fetchMayorAsientos` y `pareceCsvDelMayor` de `web-client.ts`, y los tests y scripts que solo probaban esa fuente. **66 → 65 crons.** Un `?fuente=mayor` guardado en un marcador es **INERTE**: la pantalla lo ignora.
>
> 🩸 **`lib/mayor/` NO ERA SOLO DEL MAYOR, y borrarlo de una habría roto la única fuente de gasto que queda.** El barrido encontró **SEIS módulos vivos** colgados de esa carpeta: `esTablaAusente` (la degradación limpia de `cuentas/leer`, `egresos/leer`, `inventario/leer`, `sync-cuentas-contables`, `sync-egresos-varios` y la ruta de egresos), `montoACentavos`/`normalizarTexto`/`CUENTA_RE` (`egresos/parser` y `egresos/leer`) y **`esGasto`** (`egresos/reglas`, que lo importaba **a propósito** para que el criterio de gasto fuera EL MISMO en las dos fuentes). Nunca fueron del mayor: son del formato en que Switch exporta contabilidad, y estaban ahí porque el mayor llegó primero. Se **MUDARON** a `src/lib/contable/` (`tabla-ausente.ts`, `csv.ts`, `cuentas.ts`) con los **cuerpos EXACTOS, sin reescribir** — volver a escribir `montoACentavos` habría estrenado una segunda forma de leer un monto, y su modo de fallo es un gasto perdido en silencio.
>
> ⚠️ **`web-client.ts` ES COMPARTIDO y no se tocó de más.** El login web, el token CSRF, `/cierresesion`, `fetchEgresosVarios` y `fetchCatalogoCuentas` son de Egresos Varios y del catálogo de cuentas: los dos siguen vivos. Solo se quitó lo que **únicamente el mayor** llamaba. La lección del mecanismo tampoco se pierde: el rango de fechas viaja en un POST previo y el servidor **se lo guarda en la sesión**, así que saltarse ese paso devuelve un CSV perfecto del período EQUIVOCADO sin un solo error — está escrito en el bloque de EGRESOS VARIOS, que hace exactamente lo mismo.
>
> ### 🔴 Lo que NO se borró
>
> - **LA TABLA `mayor_lineas` (135 filas) y `mayor_importaciones` QUEDAN.** Misma decisión que con `multifashion_tickets` y `empresa_gastos_mensuales`: **borrar datos es irreversible, apagar la escritura se deshace en un minuto.** Un test recorre TODAS las migraciones y pone el build **rojo** si alguna intenta un `DROP TABLE` de las dos.
> - **El backup las sigue copiando** mientras las filas existan. Se sacan del backup en el MISMO cambio que borre las tablas, nunca antes.
> - **`"mayor"` sigue en `SYNC_LOG_TYPES`**: el CHECK de `switch_sync_log` lo admite y hay filas históricas con ese valor. Sacarlo del TS sin una DDL que reescriba el CHECK haría **divergir el código de la base**, que es justo lo que ese candado vigila. Barrer el CHECK es higiene opcional, no un pendiente.
>
> ### ✅ Los nombres de las cuentas NO dependían ya del mayor — medido
>
> `cuentas/leer.ts` busca el nombre en `cuentas_contables` y **cae de respaldo a `mayor_lineas.cuenta_nombre`**, así que cortar el mayor podía dejar la pantalla mostrando códigos pelados. Medido (`scripts/_diag-nombres-sin-mayor.ts`, solo lectura): `cuentas_contables` (987 filas, sync `success` el 13-ago 17:47) cubre **las 64 de 64 cuentas** que Egresos Varios usa. **No se pierde ni un nombre.**
> - 🩸 **La primera corrida dio 0 de 64 y era EL SCRIPT, no el dato:** paginaba con `.order("id")` —columna que esa tabla no tiene— y un `.catch(() => [])` convertía el error de PostgREST en *"el catálogo no cubre nada"*. **Medir cero y darlo por bueno es el peor resultado posible**; se quitó el catch y el orden va por `(empresa_key, cuenta)`, que es la llave real.
>
> ### ⚠️ Qué pierde Daniel, y cómo volver a encenderlo
>
> El mayor era **"lo que la contadora cerró"** — contabilidad devengada, con el ISR en su línea, las cuatro cuentas sin salida de caja y el estado del mes (cerrado / incompleto / sin cerrar / no traído). **Esa vista desaparece.** Es lo que él pidió, y el motivo es que iba 7 meses atrás mientras Egresos Varios está vivo; pero es una pérdida real y queda escrita.
> - **Para volver a encenderlo: `git revert` del PR "el mayor contable se retira".** Trae de una sola vez el cron, `vercel.json`, el registro de crons, la librería, la ruta, los cuatro componentes y el selector. **Los datos ya están** (las tablas nunca se borraron), así que el módulo vuelve con enero cargado. Habría que borrar también el candado `vista-general-gasto-egresos.test.ts` → *"el MAYOR se retiró"*, que es lo que hace fallar el build si alguien lo reenciende sin querer.
>
> ### Ningún número del módulo cambió — medido
>
> **`BASE=… OTRO=… node scripts/_verif-gastos-no-cambian.mjs`** lee la MISMA API en los DOS builds (esta rama y `origin/main`) y compara **campo por campo, por POSICIÓN** (como conjunto, dos empresas intercambiadas se verían idénticas): **6 meses · 1.813 campos · 0 diferencias.** Vista General: **359 campos, 0 diferencias reales** (solo `generadoEn` y `ms`, que son el reloj), con **Disponibilidad $629.531,03 · 7 cuentas · al 31 jul**.
>
> **Los 3 anchos** (`scripts/_medir-gastos-al-dia.mjs`, en un mes con datos y en uno casi vacío): **390 · 834 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px, 0 textos bajo 12 px.**
>
> **Candados:** `vista-general-gasto-egresos.test.ts` **cambió de dirección el mismo día** — cuando #536 salió del mayor, exigía que el mayor SIGUIERA VIVO (apagarlo de paso habría sido un recorte que nadie pidió); ahora exige que **no vuelva a encenderse sin decisión**, que lo compartido se haya mudado, que el login web compartido siga entero, que ninguna migración dropee las tablas y que el cron se haya ido de vercel.json **y** del registro (la biyección de `cron-registro.test.ts` pone el build rojo si se toca uno solo).
> - 🩸 **Un candado volvió a fallar por leer comentarios:** `not.toContain("fetchMayorAsientos")` sobre `web-client.ts` fallaba **con el código ya limpio**, porque la nota que documenta el retiro nombra justo lo retirado. El barrido ahora borra los comentarios primero — tercera vez que este repo paga lo mismo.


---

## Changes — April 2026 Session

### Home & Navigation
- Home reorganized with grouped modules: Día a día, Consultas, Catálogos, Admin
- Claude chat removed from layout

### Roles
- Bodega now sees all guías by default (not just pending)
- Vendedor can now view guías (read-only)

### UX Audit (45+ fixes)
- alert() replaced with toast notifications across all modules
- Error handling improved (try/catch, user-friendly messages)
- Copies and microcopy refined
- Dead code removed across modules


### API & Cache
- 165 rutas API (`route.ts`); 150 tienen `export const dynamic = 'force-dynamic'` (evita cache stale en Vercel)
- `SWRProvider` (caché de navegación stale-while-revalidate, #115/#117) — fetchers comparten caché entre vistas, dedupe y revalidación en foco

> **"SIENTO QUE TODO EL SISTEMA ES LENTO A VECES" — NO ERAN LAS FOTOS: EL SISTEMA PEDÍA LOS MISMOS DATOS DOS VECES (12-ago-2026).**
>
> Daniel, textual. La auditoría midió contra producción y el titular fue que las fotos (6-9 KB, WebP) no tenían nada que ver: el servidor armaba la pantalla y **apenas llegaba el HTML, el cliente volvía a pedir lo MISMO**. Cada visita costaba el doble de base de datos, con Supabase en compute **Micro** y 4 caídas esa semana — bajarle la carga era el objetivo real, no los segundos.
>
> **Medido contra el build de producción, mediana de 3 corridas por pantalla (la de calentamiento se descarta: el arranque en frío de la función da picos de hasta 25 s que no representan nada). `BASE=… ETAPA=antes|despues PERFIL=escritorio|celular node scripts/_medir-lentitud-sistema.mjs`, solo lectura.**
>
> | Pantalla | Peticiones/visita | "Listo" (ms) | HTML del servidor (ms) |
> |---|---|---|---|
> | Ventas | **8 → 1** | 3.494 → 2.723 | 1.070 → 1.033 |
> | Clientes | 5 → **1** | 5.098 → 2.758 | **3.215 → 334** |
> | Multifashion | 7 → 3 | 2.526 → 2.378 | 538 → 561 |
> | Reclamos | 4 → **0** | 2.189 → 2.051 | 658 → 656 |
> | Comisiones | **14 → 2** | 2.938 → 2.562 | 362 → 346 |
> | Home | 5 → 2 | 2.416 → 2.394 | 174 → 168 |
> | Asistencia | 4 → 1 | 2.119 → 2.060 | 177 → 180 |
>
> **43 peticiones por vuelta al sistema → 10.** Idéntico en el perfil de celular (390 px). Y **ningún número de negocio cambió**: `node scripts/_verif-numeros-no-cambian.mjs` captura TODAS las cifras visibles de 6 pantallas y las compara **posición por posición** (no como conjunto: un conjunto diría "los mismos números" aunque dos filas se hubieran intercambiado, que es el error que más daño hace en Comisiones) — **1.256 cifras, 0 distintas**, antes y después, mismo build de producción y mismos datos.
>
> **1. `fallbackData` de SWR NO evita el re-fetch, y cuatro pantallas creían que sí.** Ventas, Clientes, Multifashion y Reclamos ya pasaban los datos del server component como `fallbackData`, con comentarios que decían *"sin re-fetch redundante"*. **Es falso**: `fallbackData` no puebla la caché — SWR lo trata como dato *stale* y su default `revalidateIfStale: true` dispara el fetch igual al montar. En Ventas eso eran `/api/ventas/resumen` (1.034 ms), `/api/multifashion/overview` (716 ms) y `/api/ventas/clientes-12m` (400 ms) **repitiendo lo que el servidor acababa de resolver**.
> - Fuente única: **`src/lib/swr-servidor.ts` → `opcionesDelServidor()`**, que devuelve `fallbackData` **y** `revalidateOnMount: false` JUNTOS. 🔴 Van juntos porque separarlos rompe en las dos direcciones: sin la opción vuelve la petición duplicada, y con la opción puesta A CIEGAS —sin dato del servidor— la **página 2 del directorio, una búsqueda o un año distinto quedan EN BLANCO para siempre**. Por eso la combinación peligrosa no se puede construir, y hay un test que lo prueba caso por caso.
> - 🩸 **`useSembrarDelServidor()` es lo que impide perder frescura, y sin él SÍ se perdía.** Al volver a un módulo por navegación del SPA, Next vuelve a correr el server component (`staleTimes.dynamic` = 30 s) y manda datos NUEVOS, pero `fallbackData` solo aplica con la caché VACÍA: la pantalla se habría quedado mostrando lo viejo **sin revalidar nunca**. El hook escribe los datos del servidor en la caché con `mutate(datos, { revalidate: false })` — sin tocar la red.
> - 🔴 **`revalidateOnFocus` NO se tocó.** Reclamos lo tiene en `true` a propósito (lo editan varias personas y no hay realtime: volver a la pestaña es cómo cada uno se entera de lo de los demás) y la tarjeta de "venta de hoy" de Multifashion también. Lo único que se apagó es la petición INICIAL.
>
> **2. Clientes era la pantalla más lenta del sistema (5,4 s) porque tenía una SEGUNDA copia de una lectura que ya estaba cacheada.** El server component leía `clientes_master` entera (5.062 filas, 6 viajes paginados) más `switch_clientes` (6.634 filas, 7 viajes) —**11.700 filas y 13 idas a Supabase**— con `force-dynamic` y sin caché, **en cada apertura**, mientras `/api/clientes` hacía exactamente lo mismo detrás de una caché de 60 s. Ahora la pantalla entra por la MISMA puerta (`leerClientesDelGrupo`): **HTML de 3.215 ms → 334 ms**.
> - **Las columnas se compararon una por una antes de tocar nada: son las MISMAS ocho**, el mismo filtro de mundos y el mismo orden — el primer render y el refetch siguen dando el MISMO total, que es lo que sostiene la paginación.
> - ⚠️ **`.slice()` OBLIGATORIO antes del `sort`**: la puerta devuelve el MISMO array que guarda el caché y `sort` ordena en el lugar; sin la copia la pantalla mutaría estado compartido entre requests. Candado en `clientes-puerta-unica.test.ts`.
> - De paso, `leerDelaBase` pasó a leer las dos tablas **en paralelo**: encadenadas eran 13 esperas de red una detrás de otra y no dependen entre sí.
>
> **3. Comisiones disparaba 10 peticiones y 15 consultas donde alcanzaban 1 y 7.** No era un `useEffect` inestable ni componentes duplicados —las deps del hook siempre fueron 3 primitivos—: era un `Promise.all` sobre las **5 empresas que comisionan** con un segundo `fetch` anidado adentro (`/api/ventas/comisiones` ×5 en el mismo milisegundo + `/api/ventas/comisiones/descuentos` ×5). Estaba declarado en el comentario de cabecera del archivo desde el día 1.
> - Nuevo `GET /api/ventas/comisiones/consolidado?year=&mes=`: hace las **mismas 5 RPC `comision_b2b_v5`** del lado del servidor y lee los descuentos de las 5 empresas **de una sola vez** (el `empresa_key` de los descuentos era solo un `.eq()` de filtro: nada obligaba a partirlo en cinco). **10 peticiones → 1 · 15 consultas → 7.**
> - 🔴 **NO se creó una RPC nueva que agrupe las 5.** Eso pide una migración (que corre Daniel a mano) y es la ruta del DINERO. Las 5 RPC siguen siendo 5, con los mismos argumentos: lo que se elimina son los 5 viajes de red del navegador y las 8 consultas de descuentos de más.
> - La lectura de descuentos y la regla del `activo` efectivo se mudaron a **`src/lib/comisiones/descuentos.ts`**, compartidas por los dos endpoints — dos copias serían dos totales de comisión posibles para el mismo mes. La lista de empresas que comisionan (estaba escrita idéntica en dos vistas y ahora la necesita también el endpoint) vive en **`src/lib/comisiones/empresas.ts`**, derivada de `B2B_EMPRESA_KEYS`.
> - **Los descuentos siguen fallando ABIERTO** (si su lectura se cae, la tabla sale con descuentos en 0 en vez de quedar en blanco) y un error de las COMISIONES sí se propaga: una tabla vacía silenciosa se leería como *"este mes no se vendió nada"*.
>
> **4. La MISMA pantalla montaba `<SyncStatus>` dos veces.** Ventas dibuja `ResumenView` (escritorio) y `ResumenViewMobile` a la vez y esconde una con CSS — pero escondida con `hidden md:block` igual se **monta**, así que las dos pedían `/api/sync-status` con la MISMA URL en el mismo instante (733 ms sumados por visita). Le pasaba lo mismo al CXC (`admin/page.tsx` + `PanelCxcMobile`). Ahora se comparte la petición **EN VUELO** por URL. 🔴 **Sin TTL ni caché de resultado a propósito**: con una ventana de tiempo, el refresco tras "Actualizar ahora" —que dispara un `focus` inmediatamente después del sync— devolvería lo viejo, justo cuando el banner tiene que decir la verdad.
>
> **5. Peso muerto de JavaScript.**
> - 🩸 **NO era Session Replay, y la diferencia importa.** La auditoría le atribuyó *"3-4 paquetes por carga y ~55 KB fijos"*; se abrieron los paquetes y los tres dicen **`{"type":"session"}`** (510 bytes cada uno): es el **Release Health** de `browserSessionIntegration`. Replay **no está corriendo ni entra al bundle** — `rrweb` aparece **0 veces** en los chunks del cliente, porque este SDK no lo trae entre sus integraciones por defecto y nadie lo agregó; `replaysSessionSampleRate`/`replaysOnErrorSampleRate` eran opciones **inertes** que hacían creer lo contrario y se quitaron. Se apaga el Release Health (nadie mira "crash-free sessions" y costaba **3 peticiones por pantalla abierta, en cada visita de cada persona**) filtrando la integración por nombre. ⚠️ **`captureException`, `captureMessage`, breadcrumbs, handlers globales y `tracesSampleRate: 0.1` quedan EXACTAMENTE igual.** `disableLogger` (deprecado, avisaba en cada build) pasó a `webpack.treeshake.removeDebugLogging`.
> - **Asistencia era la pantalla más pesada del sistema: 864 KB de JS** porque importaba `xlsx-js-style`, `jspdf` y `jspdf-autotable` ARRIBA del archivo, o sea al ABRIR la pantalla, aunque quien entra a mirar marcas no baje ningún archivo. Ahora se cargan con `await import()` dentro del handler, el patrón que ya usan Ventas, Packing Lists y Catálogos. **864 → 542 KB en escritorio y 693 → 232 KB en celular**; el reporte de build baja de **661 KB a 193 KB** de First Load JS. ⚠️ **El indirecto es la trampa**: `lib/asistencia/exportar` y `lib/excel-export` importan xlsx/jspdf de forma estática, así que importarlos a ELLOS ya arrastra las tres librerías — por eso el `await import()` los envuelve a ellos, no solo a xlsx. `construirPdfPlanilla` se deja SÍNCRONA porque hay un candado que la busca por el texto `export function construirPdfPlanilla`.
> - **`react-markdown` y `@hello-pangea/dnd` desinstaladas** (0 usos, verificado con grep incluyendo `ReactMarkdown`, `DragDropContext`, `Droppable`, `remark-gfm`; ⚠️ `audit-mobile-modulos.md` afirma que las tarjetas del home son draggables con esa librería y **está desactualizado**: el único drag del repo es el nativo del DOM en `VisorFoto.tsx`). **`papaparse` NO se borró**: su único uso es el round-trip de `csv-exports.test.ts`, que es lo que hace valer ese test — se movió a `devDependencies` para que no viaje al runtime de producción.
>
> **Lo que NO se tocó, y es decisión previa documentada:** el prefetch de pantallas (250 ms, 11 KB, no toca la base), la caché del catálogo con invalidación por tag (es el modelo a copiar), el service worker mínimo, el Modo Viaje eliminado y el tamaño 600 px de las fotos.
>
> Candados: `src/__tests__/lib/swr-datos-del-servidor.test.ts` (24), `peso-muerto-js.test.ts` (14) y los de `comisiones-consolidado-neto.test.ts` / `clientes-puerta-unica.test.ts` / `mundos-clientes.test.ts`, actualizados a la regla NUEVA y más estricta (el Directorio pasa de "una consulta propia" a **cero**).
>
> **Verificado por mutación, 12 de 12 cazadas:** separar `revalidateOnMount` de su `fallbackData` rompe 2 · que la siembra no escriba rompe 1 · que un shell deje de usar `opcionesDelServidor` rompe 1 · que deje de sembrar rompe 1 · apagarle a Reclamos la revalidación al foco rompe 1 · sacarle el dedupe a `SyncStatus` rompe 1 · devolver el bucle de 5 fetch a Comisiones rompe 2 · leer los descuentos de a una empresa rompe 1 · que el Directorio se salga de la puerta rompe 2 · reimportar xlsx arriba en Asistencia rompe 1 · devolver el Release Health rompe 1 · devolver `react-markdown` a `dependencies` rompe 1.
>
> 🩸 **DOS DE ESOS CANDADOS PASABAN EN VERDE CON LA MUTACIÓN PUESTA, Y LOS DOS FALLABAN POR LO MISMO: leían el archivo ENTERO, comentarios incluidos.** (a) Apagarle el foco a Reclamos no rompía nada porque **el comentario que explica por qué `revalidateOnFocus: true` se queda contiene el mismo texto que el candado buscaba** — se daba por satisfecho con su propia explicación. (b) `toContain('import from "xlsx-js-style"')` no cazaba un `import * as XLSX2 from "xlsx-js-style"`: la forma de un import no es una sola. Ahora los barridos estáticos **borran los comentarios primero** y el de Asistencia mira las SENTENCIAS `import` línea por línea. Un candado que se cumple a sí mismo con un comentario es peor que no tener candado: da permiso para romper.

### Hooks
- Hooks fixed in cheques and caja (moved before conditional returns per React rules)

### Auth
- Password minimum length changed to 3 characters
- Password field clears on edit (prevents double-hash bug)

### Reebok Catalog & Orders (April 10-11)
- Public catalog at `/catalogo-publico/reebok` (no login required, shareable link)
- Orders via shareable link (`/pedido-reebok/[id]`) with photos, SKU, bulto quantities
- Bulto system: footwear=12pzas, apparel/accessories=6pzas per bulto
- Unified catalog design: CatalogHeader, CatalogFilters, CatalogProductCard, StickyCartBar (shared components)
- "Compartir" button (copy link + PDF) for vendors
- Removed old auth system and CartProvider (dead code)

### Reclamos — pipeline de estados (julio 2026)
- Estados reales (código y DB, CHECK de migración `20260629100000`): **Creado → En proceso → Pagado**. Los nombres viejos Borrador/Enviado ya no existen (#161 los fusionó en Creado; `c1dcd854` agregó "En proceso"). `ESTADOS` en `src/app/reclamos/components/constants.ts`; transiciones server-side en `VALID_TRANSITIONS` de `api/reclamos/[id]/route.ts`.
- **Creado → En proceso** (`POST /[id]/en-proceso`): comprobante (foto o PDF) **opcional**.
- **→ Pagado**: SOLO vía `POST /[id]/settlements` con `markPaid` (nunca por PATCH). Acepta desde **Creado (salto directo, pago inmediato) o En proceso** y **exige comprobante ya adjunto** (foto o PDF) — sin adjunto responde 400 y revierte los settlements (compensación).
- Adjuntar comprobante sin cambiar estado: `POST /[id]/comprobante`. Subida compartida en `src/lib/reclamos/comprobante-storage.ts` (bucket reclamo-fotos `/comprobante`; PDF sin compresión, máx 4MB).
- Rollbacks de un paso vía PATCH: En proceso→Creado, Pagado→En proceso.

### CXC (April 10-11)
- Simplified ContactPanel (6 clear sections)
- Risk filter subtitles
- Stale data banner

> **La píldora de tramo FILTRA y ORDENA en una sola acción (27-jul-2026).** Pedido de Daniel, textual: *"los card de cxc por buckets al tocarlo debe de acomodar las cxc en orden de la deuda del bucket no?"*. Tenía razón: tocar "121d+" dejaba los 64 clientes del tramo pero **ordenados por saldo TOTAL**, así que el que más debía EN ESE TRAMO podía no quedar arriba — que es justo lo que se fue a buscar. Medido en producción: por total mandaba CITY MALL PASO CANOA ($587.299,70), y por tramo mandan INTERNACIONAL BELEN ($143.713,36), LA FRONTERA DUTY FREE ($127.052,15) y JERUSALEM DUTY FREE ($122.920,80). Reordenar era un **segundo** control aparte (clic en el título de la columna): dos controles para una sola intención.
> - **Fuente única: `src/lib/cxc-orden.ts`** (módulo PURO — filtro por tramo + comparador), usada por el escritorio (`KpiCards` + `ClientTable` vía `admin/page.tsx`) **y** por el móvil (`PanelCxcMobile`). Antes el comparador estaba escrito dos veces, con dos criterios distintos. Los tramos siguen siendo 0-90 / 91-120 / 121+ y **no se toca ningún número**: esto solo filtra y ordena.
> - **El orden se DERIVA del tramo; el clic en el título es un override ANCLADO a ese tramo** (`ordenEfectivo`). Por eso los dos controles no pueden contradecirse: son un solo estado, y la flecha del encabezado siempre describe el orden real. Al cambiar de píldora el override caduca solo, sin efectos ni sincronización manual — y un deep link `?risk=overdue` o un back/forward llegan ya ordenados por su tramo. El orden por título **se queda**: sirve para ordenar sin filtrar.
> - **Tocar la píldora encendida la apaga** (vuelve a "Total pendiente", que ordena por total). Antes en escritorio no había salida del filtro sin recargar.
> - **Se ven tocables** (Daniel: "no parecen tocables"): la activa lleva borde de color + fondo tenue + label en negrita, las inactivas borde gris-300 con hover de fondo/borde/sombra, y todas `min-h-[44px]` + `active:scale-[0.97]`. **Sin flechitas** — la única flecha de la pantalla es la del selector de mes; agregar más prometería opciones que no existen.
> - Candado: `src/__tests__/lib/cxc-orden.test.ts` (21 casos, verificado por mutación: que la píldora no reordene rompe 4, que no se pueda apagar rompe 2, que el override no caduque rompe 1). Verificación en navegador con datos de producción: `node scripts/_verif-pildoras.mjs` (solo lectura; **gotchas**: sembrar `sessionStorage.cxc_role` o `useAuth` redirige todo al login, y `delete Navigator.prototype.serviceWorker` antes de navegar).


---

### Cheques (April 10-11)
- Guided rebotado → re-depositar flow

### Préstamos (April 10-11)
- Visual status badges + filter tabs + batch undo

### Camisetas — módulo eliminado por completo en #35 (jun 2026)


---

### Directorio (April 10-11)
- Chevron icons on expandable rows


---

### Infrastructure (April 10-11)
- 165 rutas API; 150 con `export const dynamic = 'force-dynamic'`
- Sentry monitoring added
- Backup cron exists
- 20 tests (vitest)
- Password min 3 chars, no double-hash on edit
- Dead code cleaned: ChatPanel, MobileBottomBar, LoadingScreen, KeyboardShortcutsProvider, SessionWarning, old Reebok auth
- console.logs cleaned from production


---

### Attempted & Reverted
- Face ID (WebAuthn): implemented and removed — too unstable on serverless (DER/P1363 format issues, challenge storage in memory)
- Trading bot dashboard: added and removed — localhost IBKR gateway not accessible from Vercel
