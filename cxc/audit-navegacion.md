# Audit navegación — fashiongr.com

> Fecha: 2026-04-22
> Scope: lectura de código de los 15+ módulos del ERP. Sin cambios.
> Archivo untracked para revisión local.

---

## Resumen ejecutivo

### Patrón general

**No hay un patrón único.** Coexisten 4 patrones de navegación distintos que se mezclan incluso dentro del mismo módulo. Esto es la raíz del problema que Daniel percibe como "Back impredecible":

| Patrón | Módulos que lo usan | Comportamiento |
|---|---|---|
| **A. Rutas reales de Next.js** (archivo `page.tsx` por sub-vista) | Préstamos detalle, Guías nueva/editar, Packing Lists detalle, Caja nuevo-gasto, Ventas metas/reporte, Prestamos reporte, Catálogos admin y pedidos, Pedido Reebok | Back del navegador funciona naturalmente ✅ |
| **B. Sub-vistas fake con `window.history.pushState` + `popstate`** | Caja (list/detail/print), Guías (print), Reclamos (list/form/detail) | Back del navegador a veces reabre la vista que acabas de cerrar 🚨 |
| **C. State local sin sync con URL** | CXC panel (filtros/search), Cheques (modales/form), Directorio (modo selección), Reclamos (activeEmpresa), Home (editMode) | Back sale del módulo entero en vez de "deshacer" la sub-vista 🚨 |
| **D. Query params con `router.replace`** | Marketing (?proyecto, ?vista), Camisetas (?cliente), Cheques (?filter), Catálogos público (gender/category) | Back funciona sensato cuando está bien aplicado ✅ |

El patrón A + D son los correctos. El patrón B es la fuente #1 de los bugs de "Volver no va donde espero". El patrón C es la fuente #2 (especialmente en mobile sin drawer visible).

### Top 5 problemas de navegación

1. **Caja detail → botón "← Períodos" empuja `/caja` a la historia con `pushState`, luego Back del navegador reabre el detalle.**
   Archivo: `src/app/caja/hooks/useCajaState.ts:17-24` (setView llama pushState siempre). Secuencia real:
   - `/caja` → click fila → `/caja?view=detail&id=X` (push)
   - click "← Períodos" → push `/caja` encima → history tiene `[home, /caja, /caja?view=detail&id=X, /caja]`
   - Back del navegador → popstate → lee URL `/caja?view=detail&id=X` → `loadDetail(id)` → UI vuelve al detalle.
   **Este es exactamente el síntoma "el Back no hace nada" o "el Back me regresa a lo que acabo de cerrar".**

2. **Reclamos tiene el mismo bug que Caja.**
   Archivo: `src/app/reclamos/page.tsx:89-95`. Todas las transiciones entre list/form/detail usan `pushState`. Entrar a un detalle, clicar "← Reclamos", y pulsar Back regresa al detalle.

3. **Guías deja la URL desincronizada cuando cierras el print view.**
   Archivo: `src/app/guias/components/useGuiasState.ts:143` hace pushState `/guias?id=X`, pero `GuiaDetail.tsx:15` llama un `onBack` que solo hace `_setView("list")` (sin actualizar URL). Resultado: URL dice `?id=X` pero la UI muestra la lista. Si el usuario refresca o comparte el link, reabre el detalle. Si pulsa Forward, también.

4. **Packing Lists detalle usa `window.history.back()` en el breadcrumb.**
   Archivo: `src/app/packing-lists/[id]/page.tsx:396`. Si el usuario entra directo al URL (link compartido, notificación, favorito), "Historial" en el breadcrumb no va a `/packing-lists` sino a la página anterior del navegador — potencialmente fuera de la app completamente.

5. **Modales y sheets NO registran historia.**
   Universal en todos los módulos (Caja, Cheques, Reclamos, Préstamos BottomSheet mobile, Marketing ProyectoOverlay, Directorio, Camisetas, Packing Lists, Upload, etc.). Con un modal abierto, el Back del navegador:
   - Cierra el modal en Marketing (porque es `?proyecto=X` via `router.replace` — bien hecho)
   - Sale del módulo entero en los demás (mal — el usuario esperaría que Back cerrara el modal primero)

### Módulos con peor UX de back/volver

1. **Caja** — patrón B, el más usado por secretarias. Bug #1.
2. **Reclamos** — patrón B + breadcrumb duplicado propio que no respeta AppHeader.
3. **Guías** — URL desincronizada + el "← Volver a Guías" dentro de print view no limpia la URL.
4. **Cheques** — mezcla C con filtros D sin patrón claro; modal `showForm` abre form sin ruta ni history.
5. **CXC (/admin)** — nada sincroniza URL. El link desde Directorio `?search=X` no se lee. Filtros se pierden al compartir.

---

## Mapa de rutas

### Home
- `/home` — grid de módulos, agrupado por: Día a día, Consultas, Catálogos, Admin.

### Login
- `/` — formulario de login. `src/app/page.tsx:65` redirige a `/home` o `/catalogo/reebok` según rol.

### CXC (Panel CXC)
- `/admin` — tabla consolidada de clientes. **No hay sub-rutas.**
- `/admin/usuarios` — gestión de usuarios y permisos.
- Filtros (risk, company, search) solo en `useState`, sin URL.
- Deep links esperados: `/admin?search=NAME` (directorio navega así) — **el parámetro NO se lee** (src/app/admin/page.tsx:134, no hay `useSearchParams`).

### Guías
- `/guias` — lista + print overlay via `pushState`.
- `/guias?id=X` — print view (pseudo-ruta query)
- `/guias?pendientes=1` — filtro inicial
- `/guias/nueva` — formulario creación (ruta real)
- `/guias/[id]/editar` — formulario edición (ruta real)

### Directorio
- `/directorio` — lista paginada. Sin sub-rutas. `?search=X` leído por API, no por URL state local (pero la app no envía búsqueda por URL; solo state local con debounce).

### Préstamos
- `/prestamos` — lista de empleados.
- `/prestamos/[id]` — detalle (ruta real, desktop).
- **Mobile: BottomSheet abre sin URL**. Click "Ver completo" navega a `/prestamos/[id]` (inconsistencia dual: en mobile el sheet no deja rastro en historia, pero abrir detalle sí).
- `/prestamos/reporte` — reporte de deducciones (ruta real).

### Reclamos
- `/reclamos` — router interno fake (list | form | detail).
- `/reclamos?view=form` — nuevo reclamo.
- `/reclamos?view=form&id=X` — edit reclamo (vía push).
- `/reclamos?view=detail&id=X` — detalle.
- `/reclamos?empresa=NAME` — deep link a empresa específica.
- **La selección de empresa (activeEmpresa) NO se persiste en URL** — solo `useState`. La breadcrumb interna muestra "Reclamos / TH" pero Back del navegador lo salta.

### Caja Menuda
- `/caja` — lista.
- `/caja?view=detail&id=X` — detalle (vía pushState).
- `/caja?view=print&id=X` — print view.
- `/caja/[periodoId]/nuevo` — formulario nuevo gasto (ruta real).

### Packing Lists
- `/packing-lists` — lista con agrupación por día.
- `/packing-lists/[id]` — detalle + edición (ruta real).

### Ventas
- `/ventas` — dashboard.
- `/ventas/metas` — gestión de metas (ruta real).
- `/ventas/reporte?anio=X&empresa=Y&vista=Z` — reporte imprimible (ruta real; params leídos con `useSearchParams`).

### Marketing
- `/marketing` — lista de proyectos.
- `/marketing?proyecto=UUID` — overlay modal proyecto (via `router.replace`).
- `/marketing?vista=anulados | reportes | historial` — vistas extra (via `router.replace`).
- `/marketing?vista=papelera` — legacy, redirige a `anulados`.
- **Este es el patrón más limpio del codebase.** Usa `replace`, no `push`, así que el Back del navegador cierra el overlay sin acumular basura. Breadcrumb del AppHeader actualizado según vista.

### Upload
- `/upload?tab=cxc|ventas` — tab estado vía query param.
- `/upload?tab=ventas&from=ventas` — muestra link "← Volver a Ventas" extra.

### Camisetas
- `/camisetas` — lista de clientes.
- `/camisetas?cliente=X` — detalle cliente (vía pushState manual). ✅ Bien hecho — popstate listener en `camisetas/page.tsx:52` sincroniza state con URL.

### Cheques
- `/cheques` — lista con modal de formulario interno.
- `/cheques?filter=pendiente|vencido|rebotado|depositado|todos` — filter tab (leído en `cheques/page.tsx:106`).
- Vista calendario y lista — state local sin URL.
- Modal `showForm` / `editingId` / `dayChequesModal` / confirmaciones — todo fuera de URL.

### Admin Usuarios
- `/admin/usuarios` — ruta real. Sin sub-rutas.

### Catálogos
- `/catalogos` — hub (3 cards: Reebok, Joybees, Admin).
- `/catalogos/admin` — sub-hub (Reebok/Joybees admin).
- `/catalogos/admin/reebok` — admin reebok (conviven con `/catalogo/reebok/admin`, ver nota abajo).
- `/catalogos/admin/joybees` — admin joybees.
- `/catalogo/reebok` — catálogo público para internos.
- `/catalogo/reebok/productos` — grid filtrable. Filtros en URL (`gender`, `category`, `search`) via `window.history.replaceState`.
- `/catalogo/reebok/producto/[id]` — detalle producto.
- `/catalogo/reebok/pedidos` — lista de pedidos.
- `/catalogo/reebok/pedido/[id]` — detalle pedido (ruta real, auto-save drafts).
- `/catalogo/reebok/pedido` — redirige con `router.replace` a `/pedidos`.
- `/catalogo/reebok/clientes` — gestión.
- `/catalogo/reebok/admin` — admin hub reebok (duplica `/catalogos/admin/reebok`).
- `/catalogo/reebok/admin/productos/nuevo` — form producto (ruta real).
- `/catalogo/reebok/admin/{importar,inventario,exportar,upload,productos}/page.tsx` — todas llaman `router.replace('/catalogo/reebok/admin')` al montar (rutas muertas redirigen al hub).
- `/catalogo/joybees` — catálogo joybees.
- `/catalogo-publico/reebok`, `/catalogo-publico/joybees` — catálogos públicos sin auth.
- `/pedido-reebok/[id]`, `/pedido-joybees/[id]` — shareable links a pedidos.

**Nota de limpieza**: `/catalogos/admin/reebok` y `/catalogo/reebok/admin` parecen cumplir la misma función. Vale la pena verificar si una es legacy.

---

## Análisis de botones "← Volver" / "← Atrás"

Inventario completo (todos los encontrados en el codebase):

### Guías
| Archivo:línea | Texto | Destino | Estado |
|---|---|---|---|
| `src/app/guias/components/GuiaDetail.tsx:16` | "← Volver a Guías" | `onBack` prop → `_setView("list")` sin limpiar URL `?id=X` | ⚠️ URL queda stale; Forward reabre detalle |
| `src/app/guias/components/GuiaForm.tsx:199` | "← Guías" | `router.push("/guias")` | ✅ Correcto |

### Caja
| Archivo:línea | Texto | Destino | Estado |
|---|---|---|---|
| `src/app/caja/components/PeriodoDetailHeader.tsx:77` | "← Períodos" | `onBack` → `setView("list", undefined)` que hace `pushState('/caja')` | 🚨 Bug: Back del nav reabre detalle |
| `src/app/caja/components/PrintView.tsx:25` | "← Volver" | `onBack` → `setView("detail", current.id)` (pushState) | 🚨 Mismo bug en print |
| `src/app/caja/[periodoId]/nuevo/page.tsx:233` | "← Cancelar" | `router.push('/caja?view=detail&id=${id}')` | ✅ Correcto (va a query-route) |

### Marketing
| Archivo:línea | Texto | Destino | Estado |
|---|---|---|---|
| `src/app/marketing/page.tsx:141` | "← Volver" | `router.push("/marketing")` | ✅ Correcto (arreglado en commit previo) |
| `src/app/marketing/components/ProyectoOverlay.tsx:189` | "← Listo" | `onClose` → `navegar({proyecto: null})` → `router.replace` | ✅ Uso de replace = sin stack bloat |

### Reclamos
| Archivo:línea | Texto | Destino | Estado |
|---|---|---|---|
| `src/app/reclamos/components/ReclamoDetail.tsx` (breadcrumb en :172) | "Reclamos" (propio, dentro del detail) | `onBack` → `setView("list")` con pushState | 🚨 Mismo bug que caja |
| `src/app/reclamos/components/EmpresaList.tsx:140` | "Reclamos" (breadcrumb propio) | `onBack` → `setActiveEmpresa(null)` (solo state) | ⚠️ Back del navegador sale del módulo |
| `src/app/reclamos/components/ReclamoDetail.tsx:288` | "→ Volver a Borrador" | cambio de estado, NO navegación | n/a |

**Nota**: Reclamos construye su propio breadcrumb dentro de cada sub-vista (EmpresaList, ReclamoDetail) en lugar de usar el del AppHeader. Resultado: dos breadcrumbs compitiendo (uno en header, otro en cuerpo).

### Préstamos
| Archivo:línea | Texto | Destino | Estado |
|---|---|---|---|
| `src/app/prestamos/components/EmpleadoHeader.tsx:36` | "Volver" | `onBack` → `router.push("/prestamos")` | ✅ Correcto |
| `src/app/prestamos/reporte/page.tsx:196` | "← Volver a Préstamos" | `router.push("/prestamos")` | ✅ Correcto (además breadcrumb) |

### Camisetas
| Archivo:línea | Texto | Destino | Estado |
|---|---|---|---|
| `src/app/camisetas/page.tsx:627` | "← Clientes" | `setSelectedClient(null)` → `pushState('/camisetas')` | ✅ Bien sincronizado con popstate listener |

### Upload
| Archivo:línea | Texto | Destino | Estado |
|---|---|---|---|
| `src/app/upload/page.tsx:653` | "← Volver a Ventas" (solo si `?from=ventas`) | `<a href="/ventas">` | ✅ Correcto |

### Catálogo Reebok
| Archivo:línea | Texto | Destino | Estado |
|---|---|---|---|
| `src/app/catalogo/reebok/pedidos/page.tsx:111` | "← Catálogo" | `<Link href="/catalogo/reebok">` | ✅ |
| `src/app/catalogo/reebok/pedido/[id]/page.tsx:315` | "← Volver a Pedidos" | `router.push("/catalogo/reebok/pedidos")` | ✅ |
| `src/app/catalogo/reebok/producto/[id]/page.tsx:72` | "← Volver al catálogo" | `<Link href="/catalogo/reebok/productos">` | ✅ |
| `src/app/catalogo/reebok/admin/productos/nuevo/page.tsx:83` | "← Volver" | `<Link href="/catalogo/reebok/admin">` | ✅ |
| `src/components/reebok/Navbar.tsx:32` | "← Inicio" | `<Link href="/home">` | ✅ |

### Packing Lists
| Archivo:línea | Texto | Destino | Estado |
|---|---|---|---|
| `src/app/packing-lists/[id]/page.tsx:396` | "Historial" (breadcrumb) | `window.history.back()` | 🚨 Si el usuario entra directo al URL, sale de la app |

### Directorio
| Archivo:línea | Texto | Destino | Estado |
|---|---|---|---|
| `src/app/directorio/page.tsx:712` | "← Anterior" | Paginación, no navegación entre rutas | n/a |

---

## Breadcrumbs

### Módulos que usan el breadcrumb bar del `AppHeader` (consistente)
- **Marketing** — dinámico según vista (Anulados/Reportes/Historial/Proyecto).
- **Caja Menuda** — pero solo en `/caja/[periodoId]/nuevo`, NO en vista detalle.
- **Ventas** — `/ventas/metas` y `/ventas/reporte`.
- **Préstamos** — `/prestamos/[id]` y `/prestamos/reporte`.
- **Guías** — `/guias/nueva` y `/guias/[id]/editar`.
- **Packing Lists** — `/packing-lists/[id]` (pero con `window.history.back()`).
- **Admin Usuarios** — `/admin/usuarios`.

### Módulos que NO usan breadcrumbs del AppHeader
- **Home** — ok, no aplica.
- **CXC panel** (`/admin`) — sin breadcrumbs, aunque desde Directorio se deep-linkea aquí.
- **Directorio** — sin breadcrumbs.
- **Cheques** — sin breadcrumbs.
- **Upload** — sin breadcrumbs.
- **Camisetas** — sin breadcrumbs. La navegación cliente-list / cliente-detail no se refleja en el header.
- **Login** — ok, no aplica.
- **Catálogos** — tiene su propio `Navbar` de Reebok.

### Módulos con breadcrumb duplicado
- **Reclamos** — AppHeader muestra "Inicio › Reclamos" y dentro de la sub-vista (EmpresaList:140, ReclamoDetail:172) se renderiza otro breadcrumb custom con el mismo comportamiento, pero solo este último tiene el back funcional.

### Inconsistencia en el botón del módulo
- `AppHeader.tsx:105-111`: el texto del módulo en el breadcrumb solo es clickeable **si se pasan breadcrumbs**. Sin ellos, el módulo aparece como texto plano. Implica que módulos sin breadcrumbs tampoco tienen link al home del módulo desde el header — hay que usar el drawer o logo.

---

## Modales vs. rutas

| Módulo | Qué es modal | Qué es ruta | Problema potencial |
|---|---|---|---|
| **Marketing** | ProyectoOverlay (abre via `?proyecto=X`), NuevoProyectoModal (sin URL) | `/marketing` + sub-vistas via `?vista=` | ✅ Bien: Back del nav cierra el overlay. Pero "Nuevo Proyecto" modal, si lo abres y pulsas Back, sale del módulo. |
| **Caja** | ConfirmModal cerrar/eliminar período, DeletedGastosModal, pendingDeleteGasto sheet, nuevo período modal | `/caja` + sub-vistas query + `/caja/[id]/nuevo` ruta real | 🚨 El detail no es una ruta; navegar "atrás" desde detail acumula history basura. |
| **Cheques** | showForm, editingId, calPopover, dayChequesModal, confirmDelete, rebotandoId modal | `/cheques?filter=X` | 🚨 Abrir form de nuevo cheque (modal), luego Back → sale de cheques completamente. El modal no se cierra con Back. |
| **Reclamos** | showDeleteConfirm, showAplicadaModal, confirmingEstado | `/reclamos?view=X&id=Y` fake | 🚨 Además del bug B, los modales no registran history. |
| **Directorio** | showNew, editing mode inline, confirmDupCreate, confirmUnsavedTarget, ConfirmDeleteModal, mobileContactId sheet | Sin sub-rutas | ⚠️ Modo selección múltiple no URL-sync — back sale. |
| **Préstamos** | showEmpModal, showMovModal, BottomSheet (mobile), ConfirmModals (Pago, Delete, Clear, Force, BatchApprove, BatchReject) | `/prestamos/[id]` ruta real | 🚨 BottomSheet mobile no registra historia; en mobile Back sale en vez de cerrar sheet (gran diferencia vs desktop que sí tiene ruta real). |
| **Guías** | GuiaDeleteModal, PrintView (renderiza fullscreen pero es state) | `/guias/nueva`, `/guias/[id]/editar` rutas reales; `/guias?id=X` fake-route para print | 🚨 Print view fake-route + onBack que no limpia URL = stale URL. |
| **Packing Lists** | ConfirmDeleteModal | `/packing-lists/[id]` ruta real | ✅ mayormente bien, excepto el `window.history.back()` del breadcrumb. |
| **Camisetas** | showNewClient modal, showNuevo (nuevo pedido), showMatrix, showInfo, stock edit mode, ConfirmDeleteModal | `/camisetas?cliente=X` fake-route bien hecha | ⚠️ Modales no URL-sync pero el sheet principal (cliente detail) sí está en URL. Mejor que promedio. |
| **Upload** | cxcPreview, ventasPreview modales | `?tab=cxc|ventas` | ⚠️ Abrir preview, Back no lo cierra. |
| **Ventas** | Sin modales destacados en la pantalla principal; export dropdown abierto con onClick fuera | `/ventas/metas`, `/ventas/reporte` | ✅ Limpia. |
| **CXC (/admin)** | showExport dropdown, UndoToast | Sin sub-rutas, sin URL state | 🚨 Filtros se pierden totalmente al navegar fuera y volver. |
| **Home** | editMode toggle (no es modal pero altera UX) | `/home` | ✅ ok. |
| **Admin Usuarios** | inline state | `/admin/usuarios` | ✅ ok. |
| **Catálogos** | admin tiene upload modales | Rutas reales | ⚠️ Algunas rutas admin son redirects muertos. |

---

## Comportamiento del back del navegador

Casos concretos analizados:

### Caso 1: Proyecto Marketing (modal con cambios sin guardar)
1. Usuario en `/marketing`.
2. Click en proyecto → URL `/marketing?proyecto=UUID` (via `router.replace`, NO push).
3. Usuario edita datos en el overlay.
4. Presiona Back del navegador.
5. **Resultado**: URL vuelve a estar en lo que tuviera antes de `/marketing?proyecto=UUID`. Como se usó `replace`, NO vuelve a `/marketing` sino a la página ANTERIOR (p. ej. `/home`). El overlay se cierra porque el efecto de `proyectoParam` desaparece.
6. **Cambios sin guardar**: FacturasSection no tiene `beforeunload` hook visible. Los cambios que son saves-on-edit (la mayoría) ya están en DB, pero inputs pending no. Ver si hay riesgo real.

**Veredicto**: Marketing es el mejor caso, pero `router.replace` hace que Back salga del módulo en vez de volver a la lista. Trade-off consciente.

### Caso 2: CXC → cliente detalle → Back
1. Usuario en `/admin` filtrado por risk=vencido, empresa=Fashion Wear, search="TEXTIL".
2. Click en fila → fila se expande inline (NO navegación, es expand-in-place).
3. Back del navegador → sale a `/home` (no hay historia intermedia).
4. Vuelve a `/admin` → filtros perdidos (no están en URL).

**Veredicto**: No hay concepto de "detalle de cliente" con ruta. Expansión inline. Back sale del módulo. Filtros se pierden.

### Caso 3: Caja detail → "← Períodos" → Back del navegador (el bug principal)
Reproducción exacta:
1. `/caja` (lista).
2. Click en fila → `pushState('/caja?view=detail&id=X')`. History: `[/home, /caja, /caja?view=detail&id=X]`.
3. Click "← Períodos" (botón en PeriodoDetailHeader:74) → `setView("list", undefined)` → `pushState('/caja')`. History: `[/home, /caja, /caja?view=detail&id=X, /caja]`.
4. Usuario ve la lista, piensa "bien, estoy en la lista".
5. Pulsa Back del navegador.
6. History va a `/caja?view=detail&id=X` → popstate listener en `useCajaState.ts:99` lee URL → `loadDetail(id)` → UI muestra el detalle que acabas de cerrar.
7. **Bug confirmado**: Back del navegador "deshace" el cierre.

### Caso 4: Reclamos detalle → "Reclamos" breadcrumb → Back
Mismo patrón que Caja. Ver `reclamos/page.tsx:91-95`.

### Caso 5: Cheques → abrir modal "Nuevo cheque" → Back
1. `/cheques?filter=pendiente`.
2. Click "+ Nuevo" → `setShowForm(true)`, modal abre, URL no cambia.
3. Usuario llena form parcialmente.
4. Pulsa Back.
5. History retrocede a lo anterior a `/cheques` → sale del módulo con datos sin guardar perdidos.
   - Draft auto-save aplicar solo a reclamos/guias/cheques según CLAUDE.md. Cheques form no se confirmó si tiene draft hook — worth double-check.

### Caso 6: Préstamos mobile → tap row → BottomSheet → Back
1. `/prestamos` mobile (<640px).
2. Tap row → `setSheetEmp(emp)` → sheet slides up. URL no cambia.
3. Back del navegador → sale de /prestamos completamente (sheet no se cierra).
4. Si el usuario tap "Ver completo" dentro del sheet → `router.push('/prestamos/[id]')` → ruta real. Entonces Back sí regresa a /prestamos.

**Inconsistencia mobile vs desktop**: desktop navega a ruta, mobile no. Back tiene comportamientos diferentes.

### Caso 7: Guías print → "← Volver a Guías" → refrescar
1. `/guias` (lista).
2. Click row → `openPrint` → `pushState('/guias?id=X')`.
3. Click "← Volver a Guías" dentro de PrintView → `_setView("list")` sin actualizar URL.
4. URL sigue siendo `/guias?id=X` pero UI muestra lista.
5. Usuario refresca (F5) o comparte el link → al montar, `useEffect` lee `?id=X` y reabre el print view.

### Caso 8: Packing List compartido por link
1. Alguien manda a Daniel un link `/packing-lists/abc123`.
2. Daniel abre → ve el detalle.
3. Click breadcrumb "Historial" → `window.history.back()` → regresa a su pestaña anterior (que podría ser google.com o cualquier cosa).
4. Daniel sale de la app sin querer.

### Caso 9: Directorio → click CXC → volver
1. `/directorio`.
2. Click botón 🔍 en un cliente → `router.push('/admin?search=NAME')`.
3. `/admin` se carga sin leer `?search=NAME` (no hay `useSearchParams`).
4. Usuario debe re-ingresar la búsqueda en CXC.
5. Click Back → regresa a `/directorio`.

Deep link roto.

### Caso 10: Upload desde Ventas
1. `/ventas`.
2. Click "Actualizar ventas" → `router.push('/upload?tab=ventas&from=ventas')`.
3. Upload muestra link extra "← Volver a Ventas" (gracias al `?from=ventas`).
4. Correcto UX ✅.

---

## Uso de `router.push` vs `router.replace`

### Resumen
- **`router.push`** se usa 67 veces en 37 archivos.
- **`router.replace`** se usa 9 veces en 7 archivos.
- **`router.back`** no se usa nunca.
- **`window.history.pushState`** — 6 veces en 4 archivos.
- **`window.history.replaceState`** — 4 veces en 3 archivos.
- **`window.history.back()`** — 1 vez (Packing Lists).

### Lugares donde `push` debería ser `replace`

| Archivo:línea | Operación | Debería ser |
|---|---|---|
| `src/app/caja/hooks/useCajaState.ts:17-24` | `setView` usa `pushState` siempre | **`replaceState`** al cerrar el detalle (no apilar historia al "volver a lista" desde un click de UI interno) |
| `src/app/reclamos/page.tsx:91-94` | `setView` usa `pushState` siempre | Igual — cuando cierras detail/form y vuelves a list, sería `replaceState` |
| `src/app/guias/components/useGuiasState.ts:143` | `openPrint` hace `pushState` | ✅ push está bien aquí (abrir detalle es ir a lo nuevo) |
| `src/app/home/page.tsx:247` | "Salir" usa `router.push("/")` | ✅ push es fino |

### Lugares donde `replace` se usa bien
- `marketing/page.tsx:92,108` — cambios de query param.
- `catalogo/reebok/admin/{importar,inventario,exportar,upload,productos}/page.tsx` — redirects de rutas muertas.
- `catalogo/reebok/productos/page.tsx:204` — filtros en URL.
- `catalogo/joybees/page.tsx:95`, `catalogo-publico/{reebok,joybees}/page.tsx` — filtros.
- `lib/hooks/useUrlState.ts:83` — hook genérico (no usado en producción según búsqueda).

### Descubrimiento: `useUrlState` está definido pero no se usa
- Archivo: `src/lib/hooks/useUrlState.ts` — hook genérico para sincronizar state con URL params.
- Búsqueda por `useUrlState(` en todo `src/` solo muestra la definición, no consumidores.
- CLAUDE.md afirma "URL state: filtros persisten en URL (?risk=vencido&empresa=fashion_wear)" pero el código real de `/admin` usa `useState` local. **Claim en CLAUDE.md es incorrecto u outdated.**

---

## Análisis por módulo (los 15 + extras)

### 1. Home
- Sin problemas detectados. Grid de módulos navega con `router.push`. editMode es state local sin URL (aceptable).

### 2. Login (`/`)
- Sin problemas detectados. Redirige según rol tras login.

### 3. CXC (`/admin`)
- 🚨 Filtros no van a URL. Deep link `?search=X` desde directorio está roto.
- No hay sub-rutas. Expansión inline de cliente.
- Recomendación: agregar `useSearchParams` y sincronizar `risk`, `search`, `company` con URL.

### 4. Guías
- ⚠️ Bug URL-desincronizada al cerrar print view.
- Rutas reales para nueva/editar (bien).
- Print como pseudo-ruta `?id=X` (inconsistente con otras).

### 5. Directorio
- ✅ Navegación trivial. No hay sub-rutas. Paginación y filtros solo locales.
- Deep links IN (desde otros módulos) llegan pero estado no se pre-completa con search (igual que CXC).

### 6. Préstamos
- ✅ Desktop: rutas reales, excelente.
- 🚨 Mobile: BottomSheet sin URL genera inconsistencia.
- Recomendación: o bien hacer que el sheet también registre historia (pushState falso) o que mobile también navegue a la ruta real (perdiendo un paso de preview).

### 7. Reclamos
- 🚨 Patrón B (pushState fake-routes) = bug Back reabre detalle.
- Breadcrumb duplicado (AppHeader + body).
- `activeEmpresa` no en URL — Back del navegador salta de detail a home directamente, saltándose el paso "lista de empresa".

### 8. Caja Menuda
- 🚨 **Módulo con el peor UX de Back del codebase.** Bug principal.
- Nuevo gasto sí es ruta real y funciona bien.
- Recomendación urgente: cambiar `setView` para usar `replaceState` cuando se vuelve a list desde un click UI (no "avanzar" con pushState en navegación hacia atrás lógica).

### 9. Packing Lists
- ⚠️ `window.history.back()` en breadcrumb es riesgoso.
- Recomendación: cambiar a `router.push('/packing-lists')`.

### 10. Ventas
- ✅ Bien. `/ventas/metas` y `/ventas/reporte` son rutas reales, breadcrumb consistente.
- `vista` y filtros dentro del dashboard son locales + localStorage (aceptable).

### 11. Marketing
- ✅ **Mejor módulo del codebase en navegación.** Buen uso de `router.replace`, breadcrumb dinámico, overlay con Back funcional.
- Solo preocupación menor: NuevoProyectoModal no tiene URL (estado `showNuevoProyecto`).

### 12. Upload
- ✅ Navegación mínima. Tab en URL. Link de vuelta contextual con `?from=ventas`.
- ⚠️ Modales preview (cxcPreview, ventasPreview) no tienen URL — Back cancela.

### 13. Camisetas
- ✅ Sincronización URL manual bien hecha (pushState + popstate).
- Nota: es el único módulo fuera de Marketing que implementa esto para selección de item.

### 14. Cheques
- 🚨 Modal "nuevo cheque" + editingId + rebotando abiertos sin URL = Back destruye progreso.
- ⚠️ `?filter=X` en URL es bueno pero es lo único que persiste.

### 15. Usuarios (`/admin/usuarios`)
- ✅ Ruta real, breadcrumb OK. Sin sub-rutas.

### 16. Catálogos
- ✅ `/catalogos` y sub-rutas limpias con `Link`.
- ⚠️ Duplicación aparente: `/catalogos/admin/reebok` vs `/catalogo/reebok/admin`. Verificar cuál es canónica.
- ✅ Pedido Reebok tiene ruta real por id con "Volver a Pedidos" correcto.
- ⚠️ Rutas muertas `/catalogo/reebok/admin/{importar,inventario,exportar,upload,productos}` redirigen con `router.replace` — estrictamente no son un bug pero son código zombie.

---

## Conclusión y recomendaciones

### Patrón uniforme recomendado

Adoptar **patrón A + D mix**:

1. **Para detalle de entidad (Caja período, Guía, Reclamo, Cheque)**: usar ruta real `/modulo/[id]`. Next.js maneja history correctamente, Back del navegador funciona sin popstate custom.

2. **Para filtros y sub-vistas dentro de una lista (anio, empresa, risk, vista="historial")**: usar `router.replace` con query params (patrón Marketing).

3. **Para modales destructivos o rápidos (ConfirmDelete, etc.)**: mantener state local, pero agregar handler de Back del navegador que cierre el modal en lugar de navegar (usar `history.pushState` con un state marker al abrir modal, y popstate listener que cierre sin permitir el back real — patrón estándar de apps mobile-first como Instagram).

4. **Para el botón "← Volver" dentro de la app**: SIEMPRE usar `router.push('/modulo')` o `router.replace` si es un cierre de overlay. NUNCA `window.history.back()` (riesgo de salir de la app).

### Orden de prioridad para fixes

**Prioridad 1 (bug bloqueante reportado)**:
1. `src/app/caja/hooks/useCajaState.ts:17-24` — fix del bug Back reabre detalle. Cambiar a rutas reales `/caja/[id]` o usar `history.replaceState` al volver a list.
2. `src/app/reclamos/page.tsx:89-95` — mismo fix que Caja.

**Prioridad 2 (impacto alto)**:
3. `src/app/guias/components/useGuiasState.ts` + `GuiaDetail.tsx:15` — sincronizar URL al cerrar print view. O pasar print a ruta real `/guias/[id]/imprimir`.
4. `src/app/packing-lists/[id]/page.tsx:396` — cambiar `window.history.back()` por `router.push('/packing-lists')`.

**Prioridad 3 (UX mejoras)**:
5. `src/app/admin/page.tsx` — sincronizar `search`, `risk`, `company` con URL via `useUrlState` (que ya existe como hook). Arregla deep link desde Directorio.
6. `src/app/cheques/page.tsx` — al abrir `showForm`, pushState marker para que Back lo cierre en vez de salir de /cheques.
7. `src/app/prestamos/page.tsx` — reconciliar sheet mobile con URL (o siempre ruta real).

**Prioridad 4 (limpieza)**:
8. `src/app/reclamos/components/EmpresaList.tsx:136-143` y `ReclamoDetail.tsx:170-173` — eliminar breadcrumb duplicado, usar AppHeader.
9. Verificar si `/catalogos/admin/reebok` o `/catalogo/reebok/admin` es legacy y eliminar una.
10. Eliminar rutas muertas `/catalogo/reebok/admin/{importar,inventario,exportar,upload,productos}`.
11. Actualizar CLAUDE.md: "URL state: filtros persisten en URL" — actualmente falso para CXC.

### Hallazgo transversal

Hay un hook `useUrlState` implementado en `src/lib/hooks/useUrlState.ts` que nadie consume. Perfecto para los fixes de prioridad 3. Usarlo en lugar de más `pushState` manual.
