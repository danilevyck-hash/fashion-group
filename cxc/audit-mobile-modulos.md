# Audit mobile — fashiongr.com

> Fecha: 2026-04-22
> Scope: revisión de código (no visual) de los 15 módulos listados.
> Viewport objetivo: iPhone (PWA, 320–428px).
> Sin cambios en código. Archivo untracked para revisión local.

## Refactor ejecutado el 2026-04-22

Fase 1 + Fase 2 + Fase 3 aplicadas. 13 commits separados, uno por módulo, con
`git push` individual a `main`. Todos los commits pasaron `tsc --noEmit`,
`npm test` (20/20) y `next build` antes de push.

| # | Módulo | Fase | Commit |
|---|---|---|---|
| 1 | ✓ Home (Inicio) | 1.1 | `5973ff8` |
| 2 | ✓ CXC (`/admin`) | 1.2 | `c413a23` |
| 3 | ✓ Guías | 1.3 | `6568318` |
| 4 | ✓ Directorio | 1.4 | `d0b34b1` |
| 5 | ✓ Préstamos (modales) | 1.5 | `dcacbf4` |
| 6 | ✓ Reclamos (modal Aplicada) | 1.5 | `ec48db6` |
| 7 | ✓ Caja | 2.1 | `4c0dcc2` |
| 8 | ✓ Packing Lists | 2.2 | `aa30e00` |
| 9 | ✓ Ventas | 2.3 | `a2a8acb` |
| 10 | ✓ Marketing (header wrap) | 2.4 | `6e810bc` |
| 11 | ✓ Upload (modal preview mobile-first) | 3.1 | `75d28de` |
| 12 | ✓ Camisetas | 3.2 | `0b10a51` |
| 13 | ✓ Cheques | 3.3 | `bb3400a` |

**Módulos saltados según reglas:**
- Usuarios (`/admin/usuarios`) — audit marcado pendiente de revisión dedicada.
- Catálogos — "Posponer" (ya estaban bien).
- Login — "Posponer" (ya estaba bien).

**Commits omitidos:**
- Upload en Fase 1.5 (agregar `max-h-[90vh] overflow-y-auto`): no aplicado —
  el modal ya tenía `max-h-[85vh] flex flex-col` con scroll interno en la
  región de la tabla. El refactor completo se atendió en Fase 3.1.
- GuiasList.tsx:215 input search (`max-w-sm` → `w-full sm:max-w-sm`): no
  aplicado — el input ya tenía `w-full max-w-sm` correcto.
- ClientTable.tsx:378 wrapper `overflow-x-auto`: no aplicado — mobile usa
  card layout via ClientRow, wrappear hubiera introducido scroll innecesario.

**Desviaciones del plan original (judgment calls):**
- Packing Lists: el audit sugería card layout `md:hidden` completo para la
  tabla histórico. Se optó por `ScrollableTable` con `minWidth={700}` para
  evitar reescribir ~300 líneas de tabla con grouping/checkboxes complejo.
  Las columnas secundarias ya estaban ocultas con `hidden sm:table-cell`.
  Card layout queda para iteración futura si se valida con usuarios.
- Ventas tabla Resumen: el audit sugería botón "Ver meses" con toggle. Se
  optó por `hidden sm:table-cell` en columnas mensuales (consistencia con
  otros módulos y menos complejidad). Toggle se puede agregar si secretarias
  lo piden.
- Camisetas matriz: el audit mencionaba "toggle Ver tallas". La matriz no
  tiene tallas (filas=productos, columnas=clientes). Se habilitó simple
  scroll horizontal en mobile con hint visual.
- Cheques dropdown: lógica de flip con ref + useEffect + getBoundingClientRect
  (no se introdujo Radix como dependencia nueva — tal como indicó el plan).

**Módulos que fallaron en pre-push checks:** ninguno. Todos los 13 commits
pasaron tsc, tests (20/20) y build sin errores.

---


---

## Resumen ejecutivo

### Funcionan bien en mobile (no requieren refactor)
- **Directorio** — bottom sheet con quick actions, `min-h-[44px]` consistente, autosave. Mejor implementación del codebase.
- **Catálogos (home)** — cards responsive simples, zero issues.
- **Login** (`src/app/page.tsx`) — layout mínimo centrado, sin problemas.
- **Préstamos** — layout dual (tabla desktop / BottomSheet mobile), KPIs responsive, columnas ocultas con `hidden sm:table-cell`.
- **Reclamos** — formulario progresivo multi-paso, disclosure bien pensada.

### Críticos — refactor prioritario

| Módulo | Razón breve |
|---|---|
| **CXC** (`/admin`) | `KpiCards` hardcoded `grid-cols-4` rompe en <375px; `ClientTable` sin `overflow-x-auto` fallback; popover acciones `min-w-[180px]` sin clamp viewport |
| **Packing Lists** | Tablas sin estrategia mobile, sin card fallback, probablemente scroll horizontal infinito |
| **Caja Menuda** | `PeriodoList.tsx` tabla de 8 columnas sin fallback card en mobile — `GastoTable` sí lo tiene, pero `PeriodoList` no |
| **Ventas** | Tablas enormes (12+ columnas) sin `min-width` explícito ni estrategia de columnas ocultas |
| **Upload** | Modal preview con `max-w-[950px]` y tabla truncada con `text-[10px]` — ilegible en iPhone |
| **Home (Inicio)** | KPI cards hardcoded `grid-cols-3` — 3 columnas en 375px = números ilegibles |
| **Marketing** | Header `ProyectosHomeView` no wrappea en mobile; acciones en filas `hidden md:inline-flex` invisibles en mobile |
| **Camisetas** | Vista "Resumen" explícitamente bloqueada en mobile ("no disponible"); tabla Stock apretada sin wrap |

### Top 5 problemas transversales (aparecen en varios módulos)

1. **Tablas sin estrategia mobile**: Caja (PeriodoList), Ventas (Resumen/Clientes), Packing Lists, CXC (ClientTable), Reclamos (EmpresaList), Marketing. El patrón bueno (`md:hidden` card + `hidden md:block` tabla) existe en Guías/Caja/Gastos/Directorio/Préstamos pero no se aplica consistentemente.

2. **KPI cards con `grid-cols-N` sin breakpoint**: Home (`grid-cols-3`), CXC admin (`grid-cols-4`). Deberían ser `grid-cols-2 sm:grid-cols-N`. Trivial de arreglar.

3. **Modales sin `max-h-[90vh] overflow-y-auto`**: Préstamos, Reclamos, Upload. En iPhone SE (667px de alto) un modal con >500px de contenido se corta sin scroll interno.

4. **Dropdowns/popovers con ancho mínimo fijo (`min-w-[160px]` a `min-w-[180px]`) que se salen del viewport**: Cheques (ChequeMoreMenu), CXC (ContactPanel popover). Sin lógica de flip ni `max-w-[90vw]`.

5. **Detección de mobile con `window.innerWidth < 640` o `< 768` hardcodeada, sin reactivity a resize**: Préstamos (`640`), Directorio (`768`), Ventas (chart height). Debería ser un hook `useMediaQuery`.

---

## Módulo por módulo

### 1. CXC (Cuentas por Cobrar) ✓

> Nota: el módulo CXC vive en `src/app/admin/` (el rol "admin" es el que tiene acceso completo, pero los componentes son el core CXC: ClientTable, KpiCards, CompanySummary, ContactPanel).

**A) Estructura**: Dashboard con KPIs (4 cards), `CompanySummary` scrollable horizontal, `ClientTable` con filtros, búsqueda, selection mode (bulk WhatsApp), favoritos, sort. Cada fila expande inline en desktop y abre `ContactPanel` overlay en mobile con historial de facturas, notas, edición inline.

**B) Responsive**:
- ✅ `ClientRow` tiene estrategia dual `sm:hidden` (card compacta) vs `hidden sm:grid` (grid 12 cols). Bien.
- ✅ `CompanySummary` usa `overflow-x-auto snap-x snap-mandatory` para cards horizontales.
- ❌ `KpiCards` usa `grid grid-cols-4` sin breakpoint → en iPhone SE los 4 cards se aplastan con `text-sm`/`text-xs` ilegible.
- ❌ `ClientTable` padre sin `overflow-x-auto` fallback — si grid-12 no colapsa bien, scroll no funciona.
- ⚠️ `ContactPanel` popover acciones: `min-w-[180px]` sin `max-w-[90vw]` ni lógica flip → se sale del viewport.
- ⚠️ Modal `fixed inset-0` sin `sm:items-center` (bottom-aligned en mobile, OK pero inconsistente con otros módulos que centran).

**C) Calidad**:
- Inconsistencia: `KpiCards` ignora responsive mientras `ClientTable` lo maneja bien.
- `ClientRow` es complejo (selection + badge + favoritos + context menu) → 600+ líneas probables, mantenerlo bien.
- Tablas de invoices dentro del panel usan `overflow-x-auto` pero dropdowns pueden flotar sin espacio.

**D) Sugerencias**:
1. `KpiCards.tsx:68` — cambiar `grid grid-cols-4` → `grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3`. Ajustar `px-3 py-2.5` → `px-2 sm:px-3 py-2`.
2. `ClientTable.tsx:378` — envolver `<table>`/grid en `<div className="overflow-x-auto">` como fallback.
3. `ContactPanel.tsx:132` — popover: `min-w-[150px] max-w-[90vw]` + `overflow-y-auto max-h-[60vh]` en mobile.

---

### 2. Actualizar Datos (Upload) ✓

**A) Estructura**: Dos tabs (CxC / Ventas). Grid de empresas como dropzones. Click → modal preview con tabla de validación → confirmar upload. 3 pasos visibles.

**B) Responsive**:
- ✅ Grid empresas: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- ✅ Tab bar con `flex-1`.
- ❌ **Crítico**: Modal preview `max-w-[950px]` no adapta a viewport pequeño.
- ❌ Tabla preview con `text-[11px]` y `text-[10px]` — ilegible en iPhone.
- ❌ Headers con `whitespace-nowrap` en columnas que no caben.
- ⚠️ Celdas `max-w-[180px] truncate` — en 375px, header 70px + data = truncado sin poder leer.
- ⚠️ Botones modal `px-8 py-3` OK pero sin padding touch extra.

**C) Calidad**:
- Modal responsive débil — `max-w-[950px]` no escala a <375px.
- Tabla preview es anti-patrón mobile (whitespace-nowrap + fuentes diminutas).
- Instrucciones `<details>` apretadas.

**D) Sugerencias**:
1. `upload/page.tsx:527` — modal: `max-w-full sm:max-w-[950px]`. Tabla: `text-xs sm:text-[11px]`.
2. `upload/page.tsx:558-584` — en mobile reemplazar tabla por lista de cards (una por fila: "Cliente: X | Total: Y").
3. `upload/page.tsx:704` — reducir `gap-3` a `gap-2` en grid empresas mobile.

---

### 3. Guías de Despacho ✓

**A) Estructura**: Lista principal agrupada por fecha (accordión). Detalle tipo modal. Crear/editar en rutas `/nueva` y `/[id]/editar`. Modales: eliminación, despacho con firma.

**B) Responsive**:
- ✅ Layout dual `md:hidden` (cards) vs `hidden md:flex` (tabla).
- ✅ Botones `min-h-[44px]`.
- ✅ Modal despacho con `rounded-t-2xl` sticky mobile.
- ✅ Inputs `text-base md:text-sm` (evita zoom iOS).
- ⚠️ `GuiasList.tsx:215` — input search `max-w-sm` hardcoded, puede salirse en <375px.
- ⚠️ `GuiaForm.tsx` tabla de items con `overflow-x-auto` pero sin wrapper `ScrollableTable`.
- ⚠️ Modal delete `items-end sm:items-center` OK, pero verificar altura real en iPhone SE (modal puede ocupar >90vh).

**C) Calidad**:
- Draft auto-save y undo funcional.
- Mix de mobile-first y desktop-first — inconsistencia menor.

**D) Sugerencias**:
1. `guias/components/GuiasList.tsx:215` — `max-w-sm` → `w-full sm:max-w-sm`.
2. `guias/components/GuiaForm.tsx:~280` — envolver tabla items en `<ScrollableTable minWidth={600}>`.
3. `guias/page.tsx:38-68` — agregar `max-h-[90vh] overflow-y-auto` al modal delete.

---

### 4. Caja Menuda ✓

**A) Estructura**: Lista de períodos (`/caja`) → tabla. Detalle período (`/caja/[periodoId]`) → `GastoTable` + chips categorías. Crear período en modal. Edición inline gastos. Vista impresión.

**B) Responsive**:
- ✅ `GastoTable` tiene estrategia dual `md:hidden` (cards) vs `hidden md:block` (tabla). Ejemplo a seguir.
- ✅ Chips scroll horizontal con `-mx-4 px-4 sm:mx-0`.
- ❌ **Crítico**: `PeriodoList.tsx:63-64` tabla 8 columnas (N°/Apertura/Cierre/Estado/Fondo/Gastado/Saldo/Acciones) con `overflow-x-auto` pero **sin card fallback**. iPhone PWA no muestra scrollbar → usuario no sabe que puede scrollear.
- ⚠️ Modal crear período: `grid-cols-2` en mobile con label `text-xs uppercase` — apretado.

**C) Calidad**:
- `GastoTable` es referencia de buena implementación mobile.
- `PeriodoList` es el desastre del módulo — contradicción con su propio hermano.

**D) Sugerencias**:
1. `caja/components/PeriodoList.tsx:63-76` — aplicar mismo patrón que `GastoTable`: cards en mobile con Período/Estado/Saldo; acciones en overflow menu.
2. `caja/components/GastoTable.tsx:147` — chips: agregar `snap-x snap-mandatory` para mejor UX swipe.
3. `caja/page.tsx:119-133` — modal nuevo período: `grid-cols-1 sm:grid-cols-2` en vez de `grid-cols-2` fijo.

---

### 5. Directorio ✓

**A) Estructura**: Tabla 6 cols con búsqueda, filtro empresa (dropdown), selección múltiple, export CSV/Excel, import CSV. Edición inline con autosave 2s. Mobile: bottom sheet modal con quick actions (WhatsApp/Llamar/Email).

**B) Responsive**:
- ✅ Detecta viewport y abre bottom sheet modal en vez de expandir inline. Excelente.
- ✅ Bottom sheet con drag handle, `min-h-[44px]`/`min-w-[44px]` consistente.
- ✅ Tabla `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`.
- ⚠️ Grid quick-actions `grid-cols-3` en <375px con nombre empresa largo puede apretar.
- ⚠️ Filtro empresa input `w-44` hardcoded.

**C) Calidad**: Mejor módulo del audit. Autosave debounce, undo toast, inline editing visible al usuario.

**D) Sugerencias**:
1. `directorio/page.tsx:752` — grid quick-actions `gap-3` → `gap-2.5` para iPhone SE.
2. `directorio/page.tsx:484-503` — filtro empresa: `w-44` → `w-full sm:w-44`.
3. `directorio/page.tsx:378` — botón importar: agregar `justify-center` al `inline-flex`.

---

### 6. Cheques ✓

**A) Estructura**: Lista filtrada (pendiente/depositado/vencido/rebotado/vencen hoy-mañana-semana). SwipeableRow con acciones. Drawer para crear/editar. Modal rebote + "ver todos del día". Calendarios y sugerencias.

**B) Responsive**:
- ✅ KPI stats `grid-cols-2 sm:grid-cols-4`.
- ✅ Calendar view `hidden sm:block` (oculto en mobile).
- ✅ Formulario drawer `grid grid-cols-1 gap-y-4`.
- ⚠️ Alerts "vencen hoy/mañana": `flex gap-4` puede romper en <320px.
- ❌ `ChequeMoreMenu` dropdown `absolute right-0 top-full min-w-[160px]` sin flip → se sale de viewport si está al borde derecho.
- ⚠️ Filter tabs `flex flex-wrap items-center gap-4` → line wraps feos con muchos filtros.

**C) Calidad**:
- Dropdown positioning sin protección edge.
- Modal rebote botones `px-3 py-2` ajustados.

**D) Sugerencias**:
1. `cheques/page.tsx:64` — `ChequeMoreMenu`: agregar lógica de flip (`right-0 sm:left-auto` dinámico o detectar edge) o usar Radix popover.
2. `cheques/page.tsx:652,661` — alerts: `flex items-start sm:items-center gap-2 sm:gap-4`, `px-3` en mobile.
3. `cheques/page.tsx:873-904` — filter tabs: `overflow-x-auto` + `flex-shrink-0` en botones, evita wrap.

---

### 7. Préstamos ✓

**A) Estructura**: Lista empleados (tabla: nombre/empresa/deducción/saldo/progreso). Detalle por empleado con historial movimientos. Modales crear/editar. BottomSheet mobile. Reportes deducciones + Excel export.

**B) Responsive**:
- ✅ KPI `grid-cols-2 sm:grid-cols-4`.
- ✅ Tabla con `overflow-x-auto` + `min-w-[600px]`.
- ✅ Columnas ocultas: Empresa/Total/Pagado/Notas/Deducción con `hidden sm:table-cell`.
- ✅ `BottomSheet` para detalle mobile.
- ⚠️ Botones acciones tabla `p-2.5 sm:p-1.5` con iconos 14×14 → tap target <44px efectivo.
- ❌ Detección mobile: `window.innerWidth < 640` en `page.tsx:243` — debería ser 768 (breakpoint `md:`).
- ⚠️ Modales `max-w-md w-full mx-4` sin `max-h-[90vh] overflow-y-auto`.

**C) Calidad**: Uno de los módulos mejor diseñados. Z-index limpio, sin duplicación.

**D) Sugerencias**:
1. `prestamos/page.tsx:243` — detección mobile: `640` → `768` para alinear con breakpoint Tailwind `md:`.
2. `prestamos/components/MovimientoTable.tsx:50` — botón "Aprobar" `px-3 py-1` → `px-4 py-2` o `w-full sm:w-auto` en mobile.
3. `prestamos/page.tsx:618` — modal empleado: agregar `max-h-[90vh] overflow-y-auto` al body.

---

### 8. Reclamos ✓

**A) Estructura**: 4 vistas: `EmpresaSelector` (grid KPIs), `EmpresaList` (tabla reclamos), `ReclamoDetail` (edición + notas + fotos + historial), `ReclamoForm` (multi-paso: empresa → factura → items → fotos).

**B) Responsive**:
- ✅ `grid-cols-1 sm:grid-cols-2`, `hidden sm:block`/`block sm:hidden` bien aplicados.
- ✅ Form progresivo con paso indicador `hidden sm:block`.
- ✅ Inputs `min-h-[44px]`.
- ⚠️ `EmpresaList` tabla sin `min-w-[...]` explícito → scroll horizontal no garantizado.
- ⚠️ `ReclamoForm.tsx:138` input `py-3 sm:py-1.5` asimétrico.
- ⚠️ Algunos modales sin `max-h-[90vh] overflow-y-auto`.

**C) Calidad**: Draft auto-save y disclosure inteligente. Modales `max-w-lg w-full mx-4` responsive.

**D) Sugerencias**:
1. `reclamos/components/EmpresaList.tsx:137-150` — envolver tabla en `<div className="overflow-x-auto -mx-4 sm:mx-0"><div className="min-w-[700px] px-4 sm:px-0">`.
2. `reclamos/components/ReclamoForm.tsx:138` — input: `py-3 sm:py-1.5` → `py-2.5 sm:py-1.5`.
3. `reclamos/page.tsx:21` — asegurar `max-h-[90vh] overflow-y-auto` en `ReclamoDetail` y `ReclamoForm`.

---

### 9. Packing Lists ✓

**A) Estructura**: Historial agrupado por día (collapsible). Upload múltiple PL texto. Preview pre-save. Tabla (numero_pl/empresa/fecha/bultos/piezas) con selección múltiple y PDF combinado. Detalle por producto/estilo con tabla distribución bultos.

**B) Responsive**:
- ✅ Usa `hidden sm:table-cell` para columnas en mobile.
- ❌ **Crítico**: no hay card layout fallback en mobile. Tabla histórico scrollea horizontal sin feedback visible.
- ❌ Tabla distribución bultos (detalle): probablemente misma historia — scroll horizontal infinito.
- ⚠️ Área drag-drop upload no mobile-friendly (touch targets unclear).

**C) Calidad**: Estado complejo (previewItems, savedItems, collapsedDays). PDF generation encapsulado. Falta estrategia mobile.

**D) Sugerencias**:
1. `packing-lists/page.tsx:~280` — tabla histórico: agregar card layout `md:hidden` con Número/Empresa/Fecha/Piezas; acciones en overflow menu.
2. `packing-lists/[id]/page.tsx` — tabla distribución bultos: envolver en `<ScrollableTable minWidth={700}>` o card layout mobile.
3. `packing-lists/page.tsx` área upload — agregar `min-h-[44px]` + feedback visual drag activo en mobile.

---

### 10. Ventas ✓

**A) Estructura**: Dashboard con 5 KPI, gráfico barras (recharts), filtros (año/empresa/vista). Tab "Resumen" (tabla empresas × períodos + totales/YoY/Meta). Tab "Clientes" (top clientes expandibles por empresa, búsqueda, sort). Rutas: `/ventas/metas`, `/ventas/reporte`.

**B) Responsive**:
- ✅ KPI `grid-cols-2 sm:grid-cols-5`.
- ✅ Recharts `ResponsiveContainer` con altura dinámica según viewport.
- ❌ **Crítico**: tabla Resumen (`page.tsx:717`) 12+ columnas (Empresa + 12 meses + Total + Margen + YoY + Meta) sin `min-w-[...]` explícito.
- ⚠️ Sticky headers z-index complejo (`z-10` thead, `z-20` empresa sticky left).
- ⚠️ Tabla Clientes: gradient overflow hint con `pointer-events-none` es frágil.
- ⚠️ Detección viewport `window.innerWidth < 640` para chart height — no reactivo a resize.
- ⚠️ Botones `text-xs px-4 py-2` sin `min-h-[44px]`.
- ⚠️ `/ventas/reporte` (print) — no verificado mobile-friendly.

**C) Calidad**: Tablas enormes sin estrategia clara es el mayor problema. Sticky múltiples es correcto pero complejo de mantener.

**D) Sugerencias**:
1. `ventas/page.tsx:717` — tabla Resumen: envolver en `overflow-x-auto -mx-3 sm:mx-0` + `min-w-[900px] px-3`. En mobile mostrar solo Empresa/Total/Margen/YoY con botón "Ver meses" para expandir.
2. `ventas/page.tsx:627` — chart height: reemplazar `window.innerWidth < 640` con hook `useMediaQuery(768)` para reactivity.
3. `ventas/page.tsx:843` — tabla Clientes: ocultar "% Total" y "Última Compra" con `hidden sm:table-cell`. Quitar gradient ilusorio, dejar scroll real.

---

### 11. Marketing ✓

**A) Estructura**: Listado proyectos (tabla) + filtros búsqueda/marca + tabs (Activos/Todos/Abiertos/Enviados). Overlay modal por proyecto con 2 tabs (Facturas cards, Fotos grid). Modales: NuevoProyecto, Confirm. Componentes: FacturaCard, FacturaForm, ProyectoForm, FotoUploader, PdfUploader, BotonDescargarZip.

**B) Responsive**:
- ✅ `hidden md:table-cell` en columnas secundarias.
- ✅ Overlay: `rounded-t-2xl` mobile, `sm:rounded-lg` desktop. `max-h-[95vh]` con scroll.
- ✅ Grid fotos: `grid-cols-3 sm:grid-cols-4 md:grid-cols-6`.
- ❌ **Crítico**: `ProyectosHomeView.tsx:259` header con Historial·Reportes·Anulados + botón "Nuevo proyecto" en fila horizontal sin wrap responsive → rompe visualmente en iPhone.
- ❌ Tabla sin `overflow-x-auto` wrapper.
- ❌ `ProyectosHomeView.tsx:456` acciones de fila `hidden md:inline-flex` → invisibles en mobile.
- ⚠️ Modal ProyectoOverlay `p-6` ajustado en mobile.

**C) Calidad**:
- Inconsistencia `hidden md:` vs `sm:` entre componentes.
- `ProyectosHomeView`, `HistorialView`, `ReportePorProyecto` tienen tablas casi idénticas con `w-[150px]`/`w-[180px]` hardcoded — duplicación.

**D) Sugerencias**:
1. `marketing/components/ProyectosHomeView.tsx:225-263` — header: `flex-col sm:flex-row items-start sm:items-center justify-between gap-3`. Considerar botón "Nuevo proyecto" sticky bottom en mobile.
2. `marketing/components/ProyectosHomeView.tsx:337` — envolver tabla en `<div className="overflow-x-auto">`.
3. `marketing/components/ProyectosHomeView.tsx:456` — `hidden md:inline-flex` → `sm:inline-flex` o reemplazar por `OverflowMenu` en mobile para acciones accesibles.

---

### 12. Catálogos _(saltado — ya estaba bien)_

**A) Estructura**: Home (`/catalogos`) con 2 cards (Reebok, Joybees) + admin card por rol. Admin home `/catalogos/admin` con links a `/catalogos/admin/reebok` y `/catalogos/admin/joybees`. Catálogo público `/catalogo-publico/reebok`. Pedidos `/pedido-reebok`, `/pedido-joybees`.

**B) Responsive**:
- ✅ `grid grid-cols-1 sm:grid-cols-2 gap-5` — apila en mobile.
- ✅ Cards `p-8` con `text-3xl` legible.
- ✅ `active:scale-[0.98]` tap feedback.
- ⚠️ `max-w-3xl` ancho para pantallas pequeñas — no rompe pero no optimiza.
- ⚠️ No verificados en detalle `/catalogo-publico/reebok/` ni `/pedido-reebok/` (carrito) — riesgo si tienen grids de inventario o tablas.

**C) Calidad**: Excelente consistencia. Decorativas de fondo pueden cortarse en screens pequeñas sin afectar layout.

**D) Sugerencias**:
1. `catalogos/page.tsx:18` — `max-w-3xl` → `max-w-2xl` + `px-4 sm:px-6`.
2. Verificar `/catalogo-publico/reebok/page.tsx` y `/pedido-reebok/[id]/page.tsx` para grids de productos — si tienen tablas de inventario aplicar estrategia card/grid.
3. Icono admin (gear) en card: `w-6 h-6` en container `w-12 h-12` → considerar `w-7 h-7`.

---

### 13. Camisetas Selección ✓

**A) Estructura**: 3 tabs (Resumen / Por Cliente / Stock). Resumen = matriz cliente × producto. Por Cliente = lista + detalle con grid productos. Stock = tabla disponibilidad. Modales: "Nuevo Pedido" (2 pasos), "Info Producto". PDF export por cliente. Sticky save bar para edición matriz.

**B) Responsive**:
- ✅ KPI `grid-cols-2 sm:grid-cols-4`.
- ✅ Cards producto `grid-cols-1 sm:grid-cols-3`.
- ✅ Inputs con `inputMode="numeric"`, `min-h-[44px]`.
- ✅ Sticky save bar con `fixed bottom-0` + `safe-bottom`.
- ✅ Modal nuevo pedido paso 2 con layout dual `block sm:hidden` (lista mobile) / `hidden sm:grid` (grid desktop).
- ❌ **Crítico**: línea 476-478 — tab "Resumen" muestra mensaje "Vista Resumen no disponible en móvil. Usa la pestaña Por Cliente." Funcionalidad bloqueada conscientemente.
- ⚠️ Tabla Stock `flex items-center gap-4` con 4 items horizontales sin `flex-wrap` → apretado en <320px.

**C) Calidad**:
- Decisión de bloquear matriz en mobile es pragmática pero limita UX.
- Sin z-index wars.
- PDF export usa `doc.rect()` con coords hardcoded — no reflow si contenido cambia.

**D) Sugerencias**:
1. `camisetas/page.tsx:476` — en lugar de bloquear matriz, permitir scroll horizontal comprimido (mostrar 3 clientes + scroll, ocultar tallas detalle con toggle).
2. `camisetas/page.tsx:722-751` — tabla Stock: `flex flex-col sm:flex-row items-center` + `grid-cols-1 sm:grid-cols-2` para evitar apretamiento.
3. PDF export (`Documento.tsx`) — coords hardcoded → migrar a `autoTable` con configs o html→pdf para reflow automático.

---

### 14. Usuarios (admin) _(saltado — pendiente de audit dedicado)_

> `src/app/admin/usuarios/` — gestión CRUD de usuarios del ERP. No cubierto en detalle por los agentes (se enfocaron en `/admin` que es CXC). Pendiente de auditar — probablemente sigue patrón de modales simples + tabla pequeña.

**A) Estructura** (inferida del CLAUDE.md): tabla de usuarios con roles, crear/editar en modal. Reset password. Activar/desactivar.

**B) Responsive**: **No auditado en este pasaje.** Riesgo: si usa tabla sin `overflow-x-auto`, tendrá mismo problema que otros módulos. Requiere revisión dedicada.

**C) Calidad**: TBD.

**D) Sugerencias**: Programar audit dedicado antes de refactorizar. Módulo de uso bajo (solo admin) → prioridad baja.

---

### 15. Inicio (Home/Dashboard) ✓

**A) Estructura**: `/home` — modular por grupos (Día a día / Consultas / Catálogos / Admin). Cards draggables (@hello-pangea/dnd) para acceso a módulos. KPIs clickeables (Ventas/CxC/Reclamos). Modo edición. Sidebar ActivityLog. SearchBar opcional.

**B) Responsive**:
- ❌ **Crítico**: `home/page.tsx:259,265` — KPI cards con `grid-cols-3` sin breakpoint → en iPhone SE (375px) 3 columnas = ~110px cada una, números grandes ilegibles.
- ✅ Module grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
- ⚠️ Cards módulo con `gap-3` + icono `w-8` + texto — trunca en <375px.
- ⚠️ Header greeting sin truncate → overflow si nombre largo.
- ⚠️ Drag handles pequeños — funcionan touch pero sin hint visual claro mobile.

**C) Calidad**:
- Hardcoded `grid-cols-3` para KPI es anti-patrón.
- Drag-drop UX no optimizado touch (sin swipe hints).

**D) Sugerencias**:
1. `home/page.tsx:259,265` — KPI: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3` (o `grid-cols-2` horizontal con card "Ver más").
2. `home/page.tsx:243` — header greeting: envolver nombre en `truncate max-w-[200px]`.
3. `home/page.tsx:389-421` — module cards: reducir `gap-2` → `gap-1.5` + `p-2.5` en mobile para compactar.

---

## Conclusión

### Orden de refactor sugerido (costo/beneficio)

**Fase 1 — Quick wins (1–2 horas, alto impacto)**
1. **Home** — cambiar `grid-cols-3` → `grid-cols-1 sm:grid-cols-3` en KPI. Trivial, visible inmediatamente.
2. **CXC (admin)** — `KpiCards` `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`. Mismo patrón que Home.
3. **Guías** — input search `max-w-sm` → `w-full sm:max-w-sm`. Tabla items form: envolver en `ScrollableTable`.
4. **Directorio** — `w-44` → `w-full sm:w-44` en filtro empresa. `gap-2.5` en quick actions.
5. Agregar `max-h-[90vh] overflow-y-auto` a modales de Préstamos, Reclamos, Upload.

**Fase 2 — Tablas sin estrategia mobile (medio, 3–6 horas cada una)**
6. **Caja** — `PeriodoList` → cards en mobile (copiar patrón de `GastoTable`).
7. **Packing Lists** — tabla histórico + detalle → cards o `ScrollableTable`.
8. **Ventas** — tabla Resumen → ocultar columnas meses en mobile con botón "Ver meses". Tabla Clientes → `hidden sm:table-cell` en columnas secundarias.
9. **Marketing** — header no wrappea, acciones ocultas. Wrap responsive + reemplazar por `OverflowMenu`.

**Fase 3 — Módulos críticos (grande, >1 día cada uno)**
10. **Upload** — modal preview mobile-first (tabla → cards).
11. **Camisetas** — habilitar matriz en mobile con scroll/toggle (actualmente bloqueada).
12. **Cheques** — dropdown `ChequeMoreMenu` con flip logic (considerar Radix).

**Fase 4 — Posponer**
13. **Usuarios (admin)** — auditar antes de refactorizar. Uso bajo → prioridad baja.
14. **Catálogos** — ya están bien. Solo ajustes menores cosméticos.
15. **Login** — no requiere cambios.

### Estimación por módulo

| Módulo | Esfuerzo | Notas |
|---|---|---|
| Inicio (Home) | Pequeño | 1 línea de cambio en KPI grid |
| CXC | Medio | KpiCards + ClientTable + ContactPanel |
| Actualizar Datos | Medio-Grande | Refactor tabla preview a cards |
| Guías | Pequeño | 3 ajustes puntuales |
| Caja | Medio | PeriodoList requiere card layout nuevo |
| Directorio | Pequeño | Ya está bien, pulir detalles |
| Cheques | Medio | Dropdown flip logic + filter tabs scroll |
| Préstamos | Pequeño | Cambio de breakpoint + scroll en modal |
| Reclamos | Pequeño-Medio | Tabla wrapper + form symmetry |
| Packing Lists | Grande | Sin estrategia mobile actual |
| Ventas | Grande | Tablas enormes requieren rediseño |
| Marketing | Medio | Header wrap + acciones con OverflowMenu |
| Catálogos | Pequeño | Solo polish |
| Camisetas | Grande | Habilitar matriz en mobile es rediseño |
| Usuarios | Desconocido | Requiere audit dedicado primero |

### Recomendación estratégica

Atacar **Fase 1 primero** (1 día de trabajo) da 80% del beneficio visible. Los usuarios (secretarias/bodegueros en Panamá usando PWA iOS) notarán inmediatamente:
- KPIs del dashboard/CXC legibles.
- Modales con scroll cuando el contenido es largo.
- Inputs y filtros que no se salen del viewport.

Después, priorizar **Fase 2** por frecuencia de uso: Caja y Marketing se usan diario, Ventas y Packing Lists menos frecuentemente.

**Fase 3** requiere decisiones de producto (ej: ¿vale la pena habilitar matriz de Camisetas en mobile o la mayoría de usuarios usa desktop para esa tarea?). Antes de invertir días, validar con usuarios reales qué flujos intentan hacer en iPhone y fallan.

**Patrón transversal a reusar**: el layout dual `md:hidden` (cards) + `hidden md:block` (tabla) que ya existe en `GastoTable`, `ClientRow`, `Préstamos` y `Guías`. Es el patrón correcto — solo hay que aplicarlo consistentemente en Caja (PeriodoList), Ventas, Packing Lists, Marketing y CXC (ClientTable fallback).
