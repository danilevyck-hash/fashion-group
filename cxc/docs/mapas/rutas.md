# Rutas y navegación — el mapa de todo el sistema

> Auditoría del **6-sep-2026**, leída del código (sin navegador) y pesada contra producción en solo lectura.
> Este archivo no toca una línea del sistema. Lo que dependa de verlo en pantalla va marcado **no verificado**.

**Por qué existe.** Daniel, navegando: *«entro a catálogo y sale `/catalogos/marcas`, después entro a pedidos y sale `/catalogo/reebok/pedidos`, y si pongo `/catalogo` sale error»* · *«cuando estoy en pedidos y quiero ir para atrás, no me lleva a catálogo sino a inicio»* · *«cada página, cada tab debe de tener una ruta, este no pudo haber sido el único error»*.

**Tenía razón.** No fue el único.

## En números

| | |
|---|---|
| Direcciones con página (`page.tsx`) | **53** (+ 12 redirects en `next.config.js` y 3 en `middleware.ts`) |
| Módulos navegables | 22 |
| Pestañas o sub-vistas **sin dirección propia** | **10, en 7 pantallas** (tabla D) |
| Pantallas cuyo buscador o filtro se pierde al refrescar | **24** (tabla D) |
| Direcciones intermedias que dan **error** si se escriben o recortan | **13** dan 404 en inglés + **1** (`/admin`) te manda a otro módulo |
| Módulos con dos árboles para lo mismo | 1 seguro (Catálogos), 1 a medias (Marketing) |
| Enlaces de la búsqueda global que llegan a un lugar que no lee lo que mandan | **4** (Ventas, Préstamos, Caja, Guías) |
| Roles con el botón **Atrás muerto** desde su pantalla principal | **3** (bodega, gerente ACS, gerente Boston) |

Peso medido en producción (30 días al 6-sep): sesiones por rol — secretaria **101** (2 personas), admin **94** (5), bodega **77** (1), vendedor **39** (2), contabilidad **30** (1), gerente ACS **26** (1), gerente Boston **5** (1). Escrituras por módulo: Guías **202**, Préstamos **48**, Caja **13**, Recordatorios **10**, Catálogos **8**, Reclamos **5**.

---

## La regla que se audita

De `CLAUDE.md` › «Navegación e Historial»: el historial debe ser **espejo del breadcrumb** (`Inicio › Grupo › Módulo › Detalle`); bajar un nivel = `push`; filtro o pestaña al mismo nivel = `replace`; y (decisión de Daniel, 6-sep) **cada página y cada pestaña con su propia dirección**.

⚠️ Hallazgo transversal antes de cualquier módulo: **el breadcrumb del sistema nunca dibuja el nivel «Grupo»**. `AppHeader.tsx:133-137` arma `Inicio › Módulo › …`, así que la regla escrita y la pantalla ya no dicen lo mismo. Y el clic en «Módulo» manda al **primer segmento de la dirección** (`AppHeader.tsx:133`, `pathname.split("/").slice(0,2)`), que en cuatro módulos no es una página (tabla B-2).

---

## A. El mapa completo

Leyenda: **URL** = ¿la pestaña o el nivel cambia la dirección al tocarlo? · **Compartir** = ¿pegar esa dirección lleva al mismo sitio, con lo mismo que veías?

### Ventas y clientes

| Módulo | Dirección | Qué muestra | Pestañas | URL | Compartir | Archivo |
|---|---|---|---|---|---|---|
| Inicio | `/home` | Fichas por grupo | — | — | Sí | `home/page.tsx` |
| Grupo | `/g/{ventas-clientes,operacion,administracion}` | Fichas del grupo | — | — | Sí | `g/[grupo]/page.tsx` |
| Vista General | `/vista-general?mes=` | KPIs + paneles | — | — | Sí; empresa desplegada no | `vista-general/page.tsx:110` |
| Ventas | `/ventas?tab=resumen\|clientes\|productos&modo=` | Resumen · Clientes · Productos | 3 | **Sí** | A medias: el **año** no va (`VentasShell.tsx:124`); granularidad y Ventas/Utilidad/Margen tampoco (`ResumenView.tsx:136-137`) | `VentasShell.tsx:137,140` |
| Ventas | `/ventas/reporte` | Redirige a `/ventas` | — | — | Sí | `ventas/reporte/page.tsx:6` |
| Referencia | `/referencia` | Buscador de artículos | — | — | No: lo buscado es `useState` | `ReferenciaView.tsx:46` |
| Comisiones | `/comisiones` | Matriz + ⚙ Configuración | Grupo/empresa · ⚙ | **No** | **No**: vista, ⚙, año y mes viven en `localStorage` de esa máquina | `ComisionesView.tsx:152,158,169-170` |
| Cuentas por Cobrar | `/cxc?tab=grupo\|boston&risk=&empresa=&sinpagar=` | Cartera | 2 | **Sí** | A medias: el **buscador** no entra a la URL (`cxc/page.tsx:180`) | `cxc/page.tsx:178,199,226` |
| Multifashion | `/multifashion?subtab=&mfPeriodo=` | Resumen · Vendedoras · Productos · Clientes | 4 | **Sí** (pestaña + período) | Sí; adentro de Productos (vista, orden, texto) no | `MultifashionShell.tsx:83,86` |
| Confecciones Boston | `/boston?tab=inicio\|cxc\|ventas\|clientes\|planilla\|prestamos` | 6 pestañas | 6 | **Sí** | A medias: nada adentro va en la URL (buscador, tramo, rango) | `BostonShell.tsx:39` |
| Clientes | `/clientes?search=&filtro=` | Lista de 150 | chips | Sí | Sí; el orden no | `ClientesListClient.tsx:76-77,90` |
| Clientes | `/clientes/[codigo]` | Ficha | — | — | Sí | `clientes/[codigo]/page.tsx` |
| Proveedores | `/proveedores?empresa=` | Lista | — | Sí | A medias: `?q=` se lee, no se escribe | `ProveedoresListClient.tsx:72,82` |
| Proveedores | `/proveedores/[key]` | Ficha | — | — | Sí | `proveedores/[key]/page.tsx` |
| Catálogos | `/catalogos/marcas` | Hub de 4 marcas | — | — | Sí | `catalogos/marcas/page.tsx` |
| Catálogos | `/catalogos/admin/[marca]?tab=` | Administrar fotos | Faltan foto · Completo | **Sí** | Pestaña sí; sus 5-6 filtros no | `AdminCatalogoClient.tsx:65` |
| Catálogos | `/catalogo/[marca]` | Catálogo del vendedor | filtros | Sí (por `history.replaceState`) | Sí; el **orden** no | `CatalogoVendedorPage.tsx:82,188` |
| Catálogos | `/catalogo/[marca]/pedidos` | Comprobantes | origen · Pedidos/Cotizaciones/Borradores | **No** | **No**: todo `useState` | `ComprobantesPanel.tsx:239-258` |
| Catálogos | `/catalogo/[marca]/pedido/[id]` · `/checkout` · `/confirmacion/[id]` | Detalle · Checkout · Confirmación | — | — | Sí | `catalogo/[marca]/…` |
| Catálogos | `/catalogo/[marca]/productos` · `/pedido` | Redirigen | — | — | Sí | `productos/page.tsx:22` · `pedido/page.tsx:12` |
| Públicas | `/catalogo-publico/[marca]` · `/pedido-{reebok,joybees,tommy,calvin}/[id]` | Sin sesión | — | — | Sí | — |

### Operación

| Módulo | Dirección | Qué muestra | Pestañas | URL | Compartir | Archivo |
|---|---|---|---|---|---|---|
| Guías | `/guias?vista=config` | Lista · Configuración | 2 | Sí (`history.replaceState`) | Sí; buscador, «Ver más días», selección no | `guias/page.tsx:122-138` |
| Guías | `/guias?pendientes=1` | Lista solo pendientes | — | Se lee, no se escribe | Llega, pero **no hay control para apagarlo ni se dice que está filtrada** | `guias/page.tsx:181`, `GuiasList.tsx:163` |
| Guías | `/guias/nueva` | Alta (4 pasos) | pasos | No | Borrador en `localStorage` | `guias/nueva/page.tsx:34-39` |
| Guías | `/guias/[id]?editar=1` | Guía / edición / despacho | lectura↔edición | **Sí** | Sí | `guias/[id]/page.tsx:157-208` |
| Guías | `/guias/[id]/imprimir` | Hoja | — | — | Sí | — |
| Guías | `/guias/[id]/editar` | Redirige a `?editar=1` | — | — | Sí | `editar/page.tsx:29` |
| Packing Lists | `/packing-lists` · `/packing-lists/[id]` | Lista · Índice por bulto | — | — | Sí; búsqueda interna no | `packing-lists/[id]/page.tsx:47` |
| Asistencia | `/asistencia?tab=` | Reporte · Planilla · Justificaciones · Vacaciones · Aprobaciones · Configuración | 6 | **Sí** | A medias: **quincena, rango y empresa** nunca van en la URL | `AsistenciaClient.tsx:142`, `PlanillaTab.tsx:317-321` |
| Asistencia | `/asistencia?tab=aprobaciones&persona=&desde=&hasta=` | Aprobar extras | — | persona sí; rango se lee **una vez** | **La URL miente** al cambiar el rango | `AprobacionesTab.tsx:135-149` |
| Reclamos | `/reclamos` → `?empresa=` → `?view=detail&id=` → `?view=form` | Selector → lista → detalle → nuevo | chips de estado | Niveles **sí**; chips, buscador y orden no | Sí los niveles | `ReclamosClient.tsx:173-199,226-240` |
| Depurador | `/productos/cargar?tab=&vista=` | Plantilla · Tallas y catálogo · Configuración, con vistas | 3 × 2-3 | **Sí, las dos** | Sí; el ámbito de Fórmulas y los filtros de Historial no | `productos/cargar/page.tsx:105-106` |
| Marketing | `/marketing?vista=reportes\|impulsadoras&rep=` | Marcas · Reportes · Impulsadoras | 3 (+3 en Reportes) | **Sí** | Sí | `marketing/page.tsx:55`, `ReportesTabs.tsx:21` |
| Marketing | `/marketing/[marca]` → `/marketing/[marca]/[periodo]?proyecto=&pt=` | Períodos → detalle | overlay | Sí | Sí; buscador y «Ver general» no | `marketing/[marca]/[periodo]/page.tsx:70-71` |
| Marketing | `/marketing/mobiliario` | Inventario de muebles | — | — | Sí; modales no | `mobiliario/page.tsx` |
| Caja Menuda | `/caja` → `/caja/[periodoId]` → `/imprimir` | Períodos → detalle → hoja | cajón de gasto | Cajón no | Sí | `caja/[periodoId]/page.tsx:33-44` |
| Caja Menuda | `/caja/[periodoId]/nuevo` | Alta de gasto | — | — | Sí, pero **nadie la enlaza** (huérfana) | `nuevo/page.tsx:3-8` |
| Gastos | `/gastos-contabilidad?tab=&mes=&empresa=` | Gastos · Saldos de banco | 2 | **Sí, las tres** | **Sí, entero** | `GastosContabilidadClient.tsx:73-84` |
| Préstamos | `/prestamos` → `/prestamos/[id]` · `/prestamos/aprobaciones` | Lista → ficha · aprobar | — | — | Sí; buscador no | `PrestamosClient.tsx:66` |
| Recordatorios | `/recordatorios?view=lista\|calendario` | Lista única · calendario | 2 | Sí | Modo sí; **buscador** (única puerta a lo depositado), día y detalle no | `RecordatoriosClient.tsx:119,142-143` |
| Públicas | `/marketing/galeria/[cliente]?t=` · `/reclamos/galeria/[id]?t=` | Galerías por token | — | — | Sí | — |

### Administración

| Módulo | Dirección | Qué muestra | Pestañas | URL | Compartir | Archivo |
|---|---|---|---|---|---|---|
| Usuarios | `/admin/usuarios?tab=usuarios\|novedades` | Usuarios · Novedades | 2 | **Sí** | Sí; el rango de sesiones no | `admin/usuarios/page.tsx` | (🩸 la pestaña **Data Health** se retiró el 11-sep-2026 — Daniel: «no lo uso y no lo quiero usar». La medición sigue: `GET /api/diag/data-health`) |

---

## B. 🩸 Lo que está roto — por daño

### B-1. El botón Atrás no funciona para tres roles enteros

| Qué le pasa a la persona | Dónde |
|---|---|
| Bodega, Jennifer (ACS) y David (Boston) entran y el sistema los manda solo a su módulo. Tocan **Atrás** → vuelven a `/home` → `/home` los vuelve a empujar. **Atrás queda muerto** mientras estén en la app. Son **108 sesiones en 30 días** (77 + 26 + 5). Causa: el auto-redirect usa `router.push`, que deja `/home` en el historial. | `src/app/home/page.tsx:93-98` |
| Mismo patrón: un grupo sin módulos visibles rebota a `/home` con `push` | `src/components/GroupPage.tsx:40` |
| Mismo patrón: `/prestamos/<id malo>` rebota a la lista con `push` | `src/app/prestamos/[id]/page.tsx:49-50` |
| Después de teclear la contraseña, el login queda en el historial (`push`); Atrás desde Inicio vuelve al login, que te reanuda. Atrás no hace nada. (La reanudación automática sí usa `replace`.) | `src/app/page.tsx:94` (vs `:53`) |

### B-2. El breadcrumb te lleva a un 404 o a otro módulo

El clic en el nombre del módulo manda al **primer segmento** de la dirección (`AppHeader.tsx:133`). Y en estos módulos ese segmento no existe:

| Estás en | El breadcrumb dice | El clic te lleva a | Qué ves | Dónde |
|---|---|---|---|---|
| `/catalogos/marcas` | Inicio › **Catálogos** › Marcas | `/catalogos` | **404** | `catalogos/marcas/page.tsx:123` |
| `/catalogos/admin/reebok` | Inicio › Catálogos | — (es el último, no es enlace) | **No hay ni un enlace de vuelta**; salta «Marcas» y la marca | `AdminCatalogoClient.tsx:159` |
| `/productos/cargar` (Depurador) | Inicio › Depurador | `/productos` | **404** | `productos/cargar/page.tsx` |
| `/admin/usuarios` | Inicio › **Sistema** › Usuarios | `/admin` → redirect | **Cuentas por Cobrar** (`next.config.js:114`). Y «Sistema» ya no existe: el grupo se llama Administración | `admin/usuarios/page.tsx:232` |
| `/catalogo/reebok/…` (8 pantallas) | No hay breadcrumb: solo **«← Inicio»** | `/home` | Se saltan Catálogos y Marcas | `CatalogoNavbar.tsx:37`, `catalogo/[marca]/layout.tsx:33` |

Además: **ninguna pantalla de `/catalogo/[marca]/**` ni de Administrar enlaza de vuelta al hub `/catalogos/marcas`** (grep sobre `src/components/catalogo`, `src/app/catalogo`, `src/app/catalogos`: cero). Para cambiar de marca hay que ir a Inicio o al menú.

### B-3. Enlaces del sistema que llegan a una pantalla que no los entiende

| Desde | Enlace | Qué pasa | Dónde |
|---|---|---|---|
| Vista General › «Reclamos sin pagar +30 d» | `/reclamos?id=X` | Reclamos solo abre el detalle si viene `view=detail`: **caes en el selector de empresas y el reclamo no se abre** | `vista-general/page.tsx:409` vs `ReclamosClient.tsx:177` |
| Búsqueda global › resultado de Ventas | `/ventas?search=cliente` | Nadie lee `search` (Clientes lee `cliente`): caes en Resumen sin nada | `SearchBar.tsx:171` vs `ClientesView.tsx:146` |
| Búsqueda global › «Buscar préstamos de X» | `/prestamos?search=` | Préstamos no lee la URL: lista completa sin filtrar | `SearchBar.tsx:90` vs `PrestamosClient.tsx:66` |
| Búsqueda global › Caja | `/caja?periodo=<id>` | `/caja` no lee `periodo`: lista de períodos | `SearchBar.tsx:195` vs `caja/page.tsx` |
| Búsqueda global › una guía | `/guias?id=X` | El middleware la manda a **la hoja de impresión**, no a la guía | `SearchBar.tsx:144` → `middleware.ts:136-139` |
| Búsqueda global › Directorio | `/clientes` pelado | La lista sí acepta `?search=` y no se le manda | `SearchBar.tsx:153` |
| Ficha del cliente › «Cobrar»/CXC | `/cxc?search=NOMBRE` | El buscador manda `nombre_normalized`; la ficha manda el nombre tal cual. Dos claves para el mismo buscador — **no verificado** si el filtro tolera las dos | `ClienteDetail.tsx:480`, `CobrarEnFicha.tsx:163` vs `SearchBar.tsx:126` |

### B-4. Enlaces que abren una pantalla en blanco o que nunca termina de cargar

| Dirección | Qué ves | Dónde |
|---|---|---|
| `/reclamos?view=detail&id=<borrado o mal copiado>` | **Pantalla en blanco**: sin encabezado, sin mensaje, sin salida (`if (!current) return null`) | `ReclamosClient.tsx:692`, SSR `reclamos/page.tsx:68-75` |
| `/caja/<id inválido>` | **Esqueleto «Cargando…» para siempre** | `caja/[periodoId]/page.tsx:73-82` |
| `/proveedores/<inexistente>` | No es 404: «Puede que aún no esté sincronizado» — sugiere que va a aparecer | `ProveedorDetail.tsx:60,101` |
| Cualquier dirección intermedia (tabla C) | 404 **genérico de Next, en inglés**. No hay `not-found.tsx` en todo `src/app` | `find src/app -name not-found.tsx` → ninguno |

### B-5. La URL miente

| Pantalla | Qué pasa | Dónde |
|---|---|---|
| Asistencia › Aprobaciones | El rango se lee de la URL **una vez**; al cambiarlo con el selector la dirección sigue diciendo la quincena vieja. F5 o compartir devuelve **otro rango** del que se estaba aprobando | `AprobacionesTab.tsx:137-149` |
| Guías › `?pendientes=1` | Llega filtrada, **no hay control en pantalla para apagarlo** ni dice que está filtrada; `setShowPending` se pasa y nunca se dibuja | `guias/page.tsx:181,237`, `GuiasList.tsx:163,199` |
| Multifashion `?subtab=<viejo>` | `resolverTabMultifashion` devuelve `redirigido` y nadie lo usa: `?subtab=metas` muestra Vendedoras con la URL diciendo «metas» | `MultifashionShell.tsx:83-84`, `lib/multifashion/pestanas.ts:57` |
| Marketing › cerrar un overlay de proyecto | Cierra con `push` de la URL sin overlay: **Atrás lo vuelve a abrir**, y cada abrir/cerrar suma dos entradas | `marketing/page.tsx:170`, `[marca]/page.tsx:183`, `[periodo]/page.tsx:177` |

### B-6. Módulos enteros sin dirección para lo que muestran

| Módulo | Qué no se puede compartir ni sobrevive F5 | Dónde |
|---|---|---|
| **Comisiones** | Vista (grupo/empresa), ⚙ Configuración, año y mes. Se guardan en `localStorage` **de esa computadora**; `?tab=` se lee al montar y nunca se escribe | `ComisionesView.tsx:152,158,169-170`, `ComisionesPageClient.tsx:25` |
| **Comprobantes** (`/catalogo/[marca]/pedidos`) | Origen, Pedidos/Cotizaciones/Borradores, buscador, «Ver más», meses abiertos | `ComprobantesPanel.tsx:239-258` |
| **Asistencia › Planilla** | Quincena, empresa y el cuadro generado | `PlanillaTab.tsx:317-321` |
| **Recordatorios** | El buscador — que es la **única puerta a lo depositado** (invariante del módulo): un cheque depositado no se puede enlazar | `RecordatoriosClient.tsx:119,142-143` |
| **Boston** (las 6 pestañas) | Buscador, tramo y orden de la cartera; rango de Planilla; mes de Ventas; texto de Clientes | `BostonTab.tsx:143-154`, `PlanillaBoston.tsx:105-106`, `VentasBoston.tsx:41`, `ClientesBoston.tsx:38` |

### B-7. «Volver» que sube dos niveles o no existe

| Pantalla | Qué pasa | Dónde |
|---|---|---|
| `/packing-lists/[id]` | **Ningún «atrás» en el cuerpo**; el breadcrumb es solo escritorio (`hidden sm:flex`). En el iPhone es un callejón sin salida. Hay un `router` declarado y sin usar | `packing-lists/[id]/page.tsx:41,437-442` |
| `/guias/[id]/imprimir` | Vuelve a `/guias`, saltándose la guía; su breadcrumb dibuja `GT-xxx` sin enlace | `guias/[id]/imprimir/page.tsx:77-83` |
| `/marketing/[marca]/[periodo]` con error | Dos de los tres avisos mandan a `/marketing` aunque ya calculó `volverHref` (la marca) | `[periodo]/page.tsx:129,134` vs `:96-98,139` |
| `/marketing/mobiliario` | Dice «← Proyectos» y va a `/marketing`, que se llama Marketing | `mobiliario/page.tsx:483-486` |
| `/reclamos?view=form` | Único nivel del módulo **sin AppHeader**: sin buscador, sin atajos, sin breadcrumb del sistema | `ReclamosClient.tsx:655-657` |
| `/prestamos/[id]`, `/prestamos/aprobaciones`, `/caja/[id]/nuevo` | Breadcrumb **duplicado**: `Inicio › Préstamos › Préstamos › Nombre`; en Caja además se salta el período | `prestamos/[id]/page.tsx:112-113`, `aprobaciones/page.tsx:80-81`, `caja/[periodoId]/nuevo/page.tsx:192-195` |
| Subir un nivel se hace con `push` en 4 módulos (Guías, Reclamos, Marketing, Mobiliario) | El historial crece en vez de deshacerse: `/guias` → guía → «‹ Atrás» = tercera entrada `/guias`, y el Atrás del navegador **reabre la guía** | `guias/[id]/page.tsx:373`, `ReclamosClient.tsx:641,684,715`, `marketing/[marca]/page.tsx:196`, `mobiliario/page.tsx:483` |

### B-8. Niveles que se abren sin dejar rastro (Atrás te saca del módulo)

Estos se sienten como «entrar a algo», pero no cambian la URL ni apilan historial. **No verificado** en el celular si el gesto de Atrás cierra el panel o la página.

| Módulo | Qué se abre | Dónde |
|---|---|---|
| Ventas › Resumen | Panel de empresa | `ResumenView.tsx:140` |
| Ventas › Productos | Fila expandida y drill | `ProductosView.tsx:159,168` |
| Ventas › Clientes | `ClienteSheet` | `ClientesView.tsx:196` |
| CXC | Cajón de estado de cuenta y hoja «Cobrar» | `cxc/page.tsx:216,220` |
| Boston › Inicio | Las tarjetas hacen `setTab` (replace): tocar «Por cobrar» y Atrás **sale de `/boston`** | `BostonShell.tsx:77`, `InicioBoston.tsx:96-114` |
| Recordatorios, Préstamos, Asistencia | ~12 modales sin historial. Solo el cajón de gasto de Caja lo maneja (`pushState`/`popstate`) | `caja/[periodoId]/page.tsx:35-44` (el único) |

### B-9. Menor, pero visible

| Qué | Dónde |
|---|---|
| El menú lateral **no resalta** Catálogos cuando estás en `/catalogo/[marca]` ni en `/catalogos/admin/…` (compara contra `href: "/catalogos/marcas"`) | `modules.ts:162`, `Sidebar.tsx:52-70` |
| La búsqueda global (⌘K) **no ofrece** Catálogos, Depurador, Asistencia ni Gastos: 8 módulos de 22 | `SearchBar.tsx:202-214` |
| Sin franja de color en `/asistencia`, `/admin/usuarios`, `/comisiones`, `/referencia`, `/vista-general`, `/catalogos`, `/catalogo/{tommy,calvin,joybees}` | `moduleColors.ts:39-56` |
| La ayuda de atajos dice «Ir a Cheques» (`G+Q` ya va a Recordatorios) | `useKeyboardShortcuts.ts:84` |
| Vista General enlaza a `/saldos-banco` (llega por redirect; un salto de más) | `vista-general/page.tsx:252` |
| Con sesión abierta, `/pedido-{joybees,tommy,calvin}/[id]` muestran el menú lateral y Reebok no; sin sesión, las cuatro dejan una franja vacía de 224 px en escritorio — **no verificado** en pantalla | `Sidebar.tsx:20,188,412-413` |
| Rol `cliente` **muerto**: no está en `SYSTEM_ROLES` y cuatro archivos lo redirigen a `/catalogo/reebok` | `home/page.tsx:45`, `page.tsx:53,94`, `GroupPage.tsx:26`, `CatalogoNavbar.tsx:30` |
| `/caja/[periodoId]/nuevo` es una página **huérfana** (nadie la enlaza; el cajón la reemplazó) | `caja/[periodoId]/nuevo/page.tsx:3-8` |
| Guías › Configuración y el catálogo escriben la URL con `window.history.replaceState`, fuera del router de Next (funciona, pero es otro mecanismo) | `guias/page.tsx:131-138`, `CatalogoVendedorPage.tsx:188` |

---

## C. Direcciones que dan error si se escriben o recortan

Verificado con `find src/app -name page.tsx` y contra `next.config.js` / `middleware.ts`.

| Dirección | Qué pasa | Nota |
|---|---|---|
| `/catalogos` | **404** | **A donde apunta el breadcrumb del hub** (B-2) |
| `/catalogos/admin` | **404** | |
| `/catalogo` | **404** | El caso de Daniel |
| `/catalogo/[marca]/confirmacion` | **404** | |
| `/productos` | **404** | A donde apunta el breadcrumb del Depurador |
| `/g` | **404** | |
| `/admin` | 307 → **`/cxc`** | Quien iba a Usuarios cae en Cuentas por Cobrar |
| `/marketing/galeria` · `/reclamos/galeria` | Con sesión **404**; sin sesión, **pantalla de contraseña** (el prefijo público lleva barra final) | `middleware.ts:37,40` |
| `/catalogo-publico` · `/pedido-{reebok,joybees,tommy,calvin}` (sin id) | Sin sesión, **pantalla de contraseña**; con sesión 404 | `middleware.ts:36,41-49` |
| `/reclamos?view=detail&id=<malo>` | **En blanco** | B-4 |
| `/caja/<malo>` | **Cargando para siempre** | B-4 |

Los 404 salen **en inglés** («This page could not be found»): no existe `src/app/not-found.tsx`.

Lo que sí da un error limpio, en español y con salida: `/catalogo/nike`, `/catalogo-publico/nike`, `/catalogos/admin/nike`, `/g/loquesea`, `/clientes/D-999`, `/guias/999999`, `/marketing/marca-inventada`, `/marketing/[marca]/periodo-inventado`, `/caja/<malo>/imprimir`, `/marketing/galeria/[cliente]` sin token.

### Redirects viejos: ¿cubren todo?

| Redirect | Estado |
|---|---|
| `/g/sistema`, `/g/plata-entra`, `/g/plata-sale`, `/g/productos` | ✅ |
| `/ventas?tab=referencia` → `/referencia` · `?tab=comisiones` → `/comisiones` · `?tab=utilidad` (en `VentasShell`) | ✅ Ningún enlace vivo en `src/` apunta a los viejos. ⚠️ `docs/modulos/01-ventas-y-clientes.md:550,880` y `05-…:762,767,1017` y `docs/eficiencia/04-…:60` todavía dicen que Comisiones vive dentro de Ventas |
| `/admin/data-health` → `/home` | ✅ | (era `→ /admin/usuarios?tab=data-health`; la pantalla se retiró el 11-sep-2026) |
| `/data-health` → `/home` | ✅ | (11-sep-2026) |
| `/admin` → `/cxc` | ✅ como redirect; ❌ como destino del breadcrumb de Usuarios (B-2) |
| `/saldos-banco` → Gastos | ✅ (Vista General todavía lo usa) |
| `/cheques` → `/recordatorios` | ✅; `?filter=` viejo es inerte y **ningún generador quedó** en `src/` |
| `/productos/cargar?tab=<7 valores viejos>` | ✅ los 7 mapean a (tab, vista) viva, con `replace` — `pestanas.ts:46-77` |
| `/catalogos/admin/[marca]?tab=pedidos` → `/catalogo/[marca]/pedidos` | ✅ en el servidor |
| `/guias?id=X` → `/guias/X/imprimir` | ⚠️ Funciona, pero es lo que **desvía la búsqueda global al papel** (B-3) |
| `/caja?view=detail&id=` · `?view=print&id=` | ✅ `middleware.ts:140-148` |
| `/multifashion?subtab=<viejo>` | ❌ Se resuelve pero la URL no se corrige (B-5) |

---

## D. Estado que se pierde al refrescar o al compartir

**Pestañas o sub-vistas sin dirección (10):**

| Pantalla | Sub-vista | Dónde |
|---|---|---|
| Comisiones | Grupo/empresa · ⚙ Configuración | `ComisionesView.tsx:152,158` |
| Ventas › Resumen | Mensual/Trimestral/Anual · Ventas/Utilidad/Margen | `ResumenView.tsx:136-137` |
| Ventas › Clientes | 12m / YTD | `ClientesView.tsx:195` |
| Ventas › Productos | Pestaña del drill | `ProductosView.tsx:168` |
| Multifashion › Productos | Categoría/marca/… | `ProductosSubtab.tsx:271` |
| Asistencia › Configuración | Personas · Horarios · Feriados · Reglas | `ConfiguracionTab.tsx:297` |
| Depurador › Fórmulas | Importación / Tienda (documentado a propósito) | `productos/cargar/page.tsx:219-221` |
| Comprobantes | Origen · Pedidos/Cotizaciones/Borradores | `ComprobantesPanel.tsx:239,244` |

**Filtros, buscadores y selecciones que solo viven en `useState` (24 pantallas):**

| Pantalla | Qué se pierde | Dónde |
|---|---|---|
| Ventas | Año; granularidad; modo; panel de empresa | `VentasShell.tsx:124`, `ResumenView.tsx:136-140` |
| Ventas › Clientes | Búsqueda, empresa, orden, ficha lateral | `ClientesView.tsx:179-196` |
| Ventas › Productos | Empresa, período, búsqueda, orden, fila, cliente | `ProductosView.tsx:138-171` |
| CXC | Buscador; orden al tocar encabezado; tarjeta expandida en celular | `cxc/page.tsx:180,212`, `PanelCxcMobile.tsx:130` |
| CXC / Boston | Búsqueda, tramo, orden | `BostonTab.tsx:143-154` |
| Comisiones | Año y mes (solo `localStorage`) | `ComisionesView.tsx:169-170` |
| Referencia | Códigos pegados y resultado | `ReferenciaView.tsx:46,51` |
| Boston › Planilla / Ventas / Clientes | Rango; mes; texto | `PlanillaBoston.tsx:105`, `VentasBoston.tsx:41`, `ClientesBoston.tsx:38` |
| Multifashion › Productos / Vendedoras / Resumen | Orden, texto, categoría, marca; chip de período; gráfico | `ProductosSubtab.tsx:271-278`, `VendedorasSubtab.tsx:111-142`, `MultifashionResumenView.tsx:305` |
| Clientes | Orden | `ClientesListClient.tsx:90` |
| Proveedores | Búsqueda, «ver sin saldo» | `ProveedoresListClient.tsx:82,84` |
| Vista General | Empresa desplegada | `RentabilidadPorEmpresa.tsx:108` |
| Catálogo (vendedor y público) | **Orden** | `CatalogoVendedorPage.tsx:82`, `CatalogoPublicoPage.tsx:67` |
| Administrar catálogo | 5-6 filtros | `ProductosTarjetas.tsx:106-111`, `ProductosBatch.tsx:143-154` |
| Comprobantes | Buscador, «Ver más», meses abiertos | `ComprobantesPanel.tsx:245-258` |
| Depurador | Filtro de Historial; mes/año de Facturas Tienda | `HistorialView.tsx:43`, `FacturasTiendaClient.tsx:80-81` |
| Guías | Búsqueda, «Ver más días», selección (fila expandida sobrevive F5 por `sessionStorage`) | `useGuiasState.ts:22-41`, `GuiasList.tsx:284-288` |
| Guías › Configuración | Búsqueda de cliente | `GuiasConfiguracionView.tsx:97-111` |
| Packing Lists | Previsualización subida; búsqueda en `[id]` | `PackingListsClient.tsx:125-138`, `[id]/page.tsx:47` |
| Reclamos | Chips de estado, buscador, orden; `editMode` del detalle | `ReclamosClient.tsx:73-102`, `EmpresaList.tsx:327-341` |
| Marketing | Buscador de marca/período; «Ver general» | `[marca]/page.tsx:62-65`, `DetallePeriodoView.tsx:93` |
| Asistencia › Reporte / Planilla / Aprobaciones | Rango (Reporte y Aprobaciones lo recuerdan en `localStorage`); quincena y empresa; fila abierta | `ReporteTab.tsx:50-61`, `PlanillaTab.tsx:317-321`, `AprobacionesTab.tsx:148-149` |
| Préstamos | Buscador | `PrestamosClient.tsx:66` |
| Recordatorios | Buscador, día del calendario, detalle | `RecordatoriosClient.tsx:119,142-143` |
| Usuarios | Rango de sesiones | `admin/usuarios/page.tsx` | (🩸 «check elegido» se fue con la pantalla de Data Health, 11-sep-2026) |

---

## E. Lo que SÍ está bien — el patrón a copiar

No se «arreglan». Cuando se toque un módulo de arriba, se copia de aquí.

| Patrón | Dónde | Por qué |
|---|---|---|
| **Gastos** (`/gastos-contabilidad`) — el mejor del sistema | `GastosContabilidadClient.tsx:70-133` | Pestaña, mes y empresa en la URL; `push` **solo** para el desglose; `replace` para filtros. Y su «Volver» distingue si llegaste tocando (`router.back()`) o por enlace directo (`setEmpresaParam("")`): **con un enlace compartido no te saca de la app** |
| **`/guias/[id]?editar=1`** | `guias/[id]/page.tsx:126-208` | El modo ES la dirección: se enciende antes de pintar, se limpia con `replace` al cerrar para que ni la URL mienta ni Atrás reabra el formulario. `/guias/[id]/editar` vive como redirect `replace` |
| **Reclamos** (el patrón de referencia de `CLAUDE.md`) | `reclamos/page.tsx:48-76`, `ReclamosClient.tsx:173-240` | Tres niveles en la URL (`empresa` · `view` · `id`), `push` por nivel, `popstate` que reconstruye los tres, y el SSR trae el detalle: F5 en el detalle funciona. Breadcrumb `Inicio › Reclamos › EMPRESA › N°` con la empresa clicable — el único con jerarquía completa. **Sus fallas** (B-4, B-7) son de bordes, no del patrón |
| **Marketing**: tres niveles con ruta real | `marketing/page.tsx:84-115`, `[marca]/page.tsx:83-98` | `push` en el drill-down (candado `navegacion-atras-fluido.test.ts`), redirects de los enlaces viejos, `volverHref` calculado según si el nivel del medio existe |
| **Depurador**: pestaña **y** vista en la URL | `pestanas.ts:46-77`, `productos/cargar/page.tsx:117-125` | Los 7 `?tab=` viejos mapean a una (tab, vista) viva, corregidos con un solo `replace`; valor raro cae en la default |
| **Multifashion**: pestaña + período en la URL | `MultifashionShell.tsx:83,86` | El único con el período compartible |
| **Ventas**: `?tab=utilidad` se traduce sin bucle | `VentasShell.tsx:146-156` | Normaliza la URL sin entrada de historial |
| **Modo pedido del catálogo** (`?agregarA=`) | `modo-pedido.ts:11-61` | Sobrevive F5, se comparte, y un filtro no lo apaga |
| **Marca inválida → 404 limpio** en las tres puertas del catálogo | `catalogo/[marca]/layout.tsx:27`, `catalogo-publico/[marca]/page.tsx:21`, `catalogos/admin/[marca]/page.tsx:25` | |
| **Push/replace bien puestos** en Ventas y clientes y en todo Catálogos | grep sobre 9 carpetas | Ni un `push` en una pestaña, ni un `replace` en un drill-down |
| **`/clientes/[codigo]`** siempre dice «Clientes» y vuelve a `/clientes` vengas de donde vengas | `clientes/[codigo]/page.tsx:14-16` | La ficha se arma en el servidor; correcto que no dependa de la puerta |
| **Aviso de la planilla → Aprobaciones** | `lib/asistencia/aprobaciones.ts:406-416` | URL armada en módulo puro, `<Link replace>` (mismo nivel) |
| **Cajón de gasto de Caja** | `caja/[periodoId]/page.tsx:31-44` | El único modal que el Atrás del celular cierra |
| **Breadcrumb de `/caja/[id]/imprimir`** | `imprimir/page.tsx:77-83` | Cuatro niveles reales, espejo exacto, período clicable |
| **Galerías públicas simétricas** | `reclamos/galeria/[id]`, `marketing/galeria/[cliente]` | Mismo diseño, mismo mensaje de enlace inválido |
| `G+C` → `/cxc`, `G+Q` → `/recordatorios`, `moduleColors` con `/cxc` y `/recordatorios` | `useKeyboardShortcuts.ts:172-174`, `moduleColors.ts:40,42` | Las mudanzas del 5-sep sí se propagaron aquí |
| **Valor de `?tab=` desconocido nunca deja la pantalla en blanco** (CXC, Ventas, Boston, Asistencia, Usuarios, Depurador) | `pestanas.ts:64`, `ventas/pestanas.ts:50`, `boston/rol.ts:160`, `AsistenciaClient.tsx:164`, `admin/usuarios/page.tsx:78-79` | |

---

## F. Dos árboles para lo mismo

| Caso | Qué hay | Cruce | Veredicto |
|---|---|---|---|
| **Catálogos** | `/catalogos/{marcas, admin/[marca]}` (plural) y `/catalogo/[marca]/{…}` (singular) | **De una sola dirección**: el hub enlaza al catálogo, a pedidos y a administrar (3 botones por marca); **nada vuelve al hub**. El `adminHref` del hub está escrito a mano en 4 líneas aunque `MARCA_THEME` ya lo trae (`marcas/page.tsx:57-78` vs `marcas-ui.tsx:529`) | Dos árboles de verdad. Pregunta 1 |
| **Marketing** | `/marketing/[marca]` (una marca) y `/marketing/mobiliario` (una herramienta) al mismo nivel | `slugDeMarca` no reserva la palabra: una marca llamada «Mobiliario» taparía la herramienta (`marketing/page.tsx:154,158`) | A medias. Pregunta 5 |
| **Boston** | `/cxc?tab=boston` y `/boston?tab=cxc` | Es el **mismo componente** `<BostonTab />` (`cxc/page.tsx:648`, `BostonShell.tsx:78`), con públicos distintos | Dos puertas, no dos árboles. Está bien |
| **Usuarios** | `/admin/usuarios` bajo `/admin`, cuando CXC ya se mudó a `/cxc` | `/admin` solo existe como redirect a otro módulo | Un huérfano. Pregunta 4 |
| **Aprobar** | Asistencia aprueba el **descuento** de la quincena; `/prestamos/aprobaciones` aprueba **el préstamo** | Cosas distintas con la misma palabra, y **cero enlaces** entre las dos pantallas | No es duplicación; falta el puente |

---

## G. Preguntas para Daniel

**1. Catálogos: ¿un solo árbol?**
- a) Todo bajo `/catalogos`: `/catalogos` = hub, `/catalogos/[marca]`, `/catalogos/[marca]/pedidos`, `/catalogos/[marca]/administrar`; las direcciones viejas redirigen (los enlaces de WhatsApp a `/catalogo-publico` y `/pedido-*` no se tocan).
- b) Dejar los dos árboles y solo tapar los huecos: `/catalogo` y `/catalogos` redirigen al hub, y las pantallas del catálogo ganan «‹ Marcas» en vez de «← Inicio».
- c) Nada.
- **Recomiendo a.** Es lo que te confundió a ti, y b deja la confusión con parches.

**2. El breadcrumb: ¿con o sin el grupo?** Hoy dice `Inicio › Módulo › Detalle`; la regla escrita dice `Inicio › Grupo › Módulo › Detalle`.
- a) Agregar el grupo (`Inicio › Ventas y clientes › Catálogos › Marcas`).
- b) Dejarlo sin grupo y corregir la regla en `CLAUDE.md`.
- **Recomiendo b.** Desde Inicio tocas la ficha del módulo directo; el grupo es una escala que casi nadie hace. Lo que sí hay que arreglar es que el clic en «Módulo» caiga en 404 (B-2), y eso no depende de esta respuesta.

**3. Bodega, Jennifer y David: ¿qué hace Atrás en su pantalla principal?**
- a) Nada (es su casa): se arregla con `replace` para que deje de rebotar, y Atrás desde ahí sale del sistema, como cerrar la app.
- b) Que vean el Inicio (hoy se los salta a propósito).
- **Recomiendo a.**

**4. Usuarios: ¿se muda de `/admin/usuarios` a `/usuarios`?**
- a) Sí, con redirect, y el breadcrumb dice «Administración» en vez de «Sistema».
- b) Se queda en `/admin/usuarios` y solo se arregla el breadcrumb.
- **Recomiendo a.** `/admin` ya no es nada más que un redirect a Cuentas por Cobrar.

**5. ¿Qué tiene que ir en la dirección en Ventas, Comisiones y Boston?**
- a) Todo lo que eliges: empresa, año, mes, quincena, vista, buscador.
- b) Solo la pestaña (como hoy en la mayoría).
- **Recomiendo a**, empezando por Comisiones y Comprobantes (B-6), que hoy no se pueden compartir para nada.

**6. La búsqueda global manda a 4 lugares que no la entienden (Ventas, Préstamos, Caja, y Guías cae en el papel).**
- a) Arreglar los cuatro para que lleguen a lo buscado.
- b) Quitar esos cuatro resultados y dejar solo los que sí llegan.
- **Recomiendo a**; el de Guías es el más usado (202 escrituras en 30 días) y el que más despista.
