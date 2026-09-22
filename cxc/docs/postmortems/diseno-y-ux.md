# Post-mortems — Diseño, UX y navegación del cascarón

Aquí vive, verbatim, el detalle que CLAUDE.md tenía sobre el sistema de diseño,
los principios de UX, la consistencia del Back/Forward, los componentes
compartidos, los ganchos y el teclado. En CLAUDE.md queda la regla; acá, el
porqué, las mediciones y las citas.

---

## Lo que decía CLAUDE.md hasta el 22-sep-2026 (movido acá, verbatim)

## Design System
- **Direction:** Precision & Density + Apple-grade fluidity
- **Buttons:** `rounded-md`, `bg-black text-white`, `active:scale-[0.97]` tap feedback
- **Cards:** `rounded-lg`, `border border-gray-200`, no shadows
- **Tables:** sticky headers, `tabular-nums`, ScrollableTable con gradient indicators, SwipeableRow en mobile
- **Modals:** ConfirmModal (normal), ConfirmDeleteModal (destructivo, 1s delay), BottomSheet (mobile)
- **Spacing:** 4px base, py-6 containers, mb-4 sections, p-3 cards
- **Depth:** borders-only (no shadows en cards/modules)
- **Module colors:** la lista viva son **18 módulos** en `src/lib/moduleColors.ts` (2px de acento en el encabezado) — CXC=blue · Guías=emerald · Recordatorios=amber · Reclamos=orange · Caja=violet · Directorio=cyan · Préstamos=rose · Ventas=indigo · Reebok=red, más Comisiones · Asistencia · Boston · Proveedores · Plantilla Switch · Gastos · Marketing · Multifashion. 🔴 **No la copies aquí: léela en el archivo**, que es el único lugar donde está completa.
- **Animations:** AccordionContent (CSS grid 250ms), page transitions (slide-right/left/crossfade 180ms), KPI count-up, deposit flash, saldo shake, new row highlight
- 🔴 **Barras pegajosas: se pegan DEBAJO del encabezado, nunca encima** (11-sep-2026; detalle en [docs/postmortems/barras-pegajosas.md](docs/postmortems/barras-pegajosas.md)). El encabezado NO tiene alto fijo: se MIDE con `ResizeObserver` y viaja en `--fg-altura-encabezado`. **La única forma de pegar una barra de contenido es `CLASE_BARRA_PEGAJOSA`** (`src/lib/ui/barra-pegajosa.ts`), con z-index 9 bajo el 10 del encabezado. Un `<thead>` o la cabecera de un modal con `sticky top-0` se pegan a SU contenedor y se dejan como están. ⚠️ Pendiente de Daniel: los dos `sticky top-0` del overlay de Marketing › Proyecto. Candados: `barras-pegajosas.test.ts` · `.tsx`.

## UX Principles
- Usuarios: secretarias, bodegueros, vendedores en Panamá. NO tech-savvy.
- 🔴 **«Pedido» para Daniel es la orden de un CLIENTE, nunca una petición HTTP.** Decirle *«la lista no manda ningún pedido de escritura»* lo hizo entender que Guías mandaba pedidos a Switch. Para hablar de red: **«no escribe nada», «no guarda nada», «solo lee»**. Igual de cargadas: factura · traslado · abono · pago.
- Labels en español simple. Cero jerga (CXC → "Cuentas por Cobrar")
- 🔴 **Traer datos frescos se dice «Actualizar ahora» en TODO el sistema** (`lib/ui/actualizar-ahora.ts`; Guías decía «Buscar otra vez» y Etiquetas «Traer de Switch ahora» hasta el 18-sep-2026). ⚠️ **«Traer ahora» de Asistencia es OTRA cosa** —le pide a una PC que empuje las marcas de su reloj— y no se toca. Candado: `actualizar-ahora-una-palabra`.
- 🔴 **La línea de «más de 4 marcas» NO dice cuál sobra** (18-sep-2026): «El día tiene N marcas, y son 4 — quita la que sobra», con las horas como BOTONES. 🩸 Decía «Marca de más: HH:MM:SS» —elegida por POSICIÓN— y la contadora quitó la equivocada en el día de Enrique Sánchez (7-sep). ⚠️ Con 3 marcas el texto NO cambia: ahí sí falta una. Detalle en [asistencia-planilla.md](docs/postmortems/asistencia-planilla.md).
- Botones descriptivos ("Guardar gasto", no "Guardar")
- Errores accionables y humanos ("No se pudo guardar. Intenta de nuevo en unos segundos.")
- Micro-copy con personalidad ("Listo, guardado", "Excel listo — revisa tu carpeta de descargas")
- Font size mínimo text-sm para datos. text-gray-600 mínimo para montos.
- Confirmación solo para acciones destructivas (eliminar), NO para guardar.
- Undo universal: 5 segundos para deshacer acciones destructivas (depositar, eliminar, cambiar estado)
- Optimistic UI: actualizar UI antes de respuesta del server, revertir si falla
- 1 acción principal por vista + OverflowMenu "···" para secundarias
- Toasts: errores 8s, éxitos 3s, con botón X para cerrar

## Navegación e Historial (Back/Forward consistente)
- **Regla:** el stack del historial debe ser ESPEJO del breadcrumb (Inicio › Grupo › Módulo › Detalle). El Back del navegador solo deshace la última URL — no conoce la jerarquía, así que la jerarquía debe vivir en el historial.
- **Drill-down a un nivel más profundo → `push`** (selector→empresa, lista→detalle, módulo→sub-route). Cada nivel deja entrada → Back deshace un nivel a la vez.
- **Filtro / tab / sort en el MISMO nivel → `replace`** (no debe crear entrada; Back no debe ciclar por tabs/filtros).
- `useUrlState(key, default, { history: "push" })` para params que representan un nivel; default `"replace"` para filtros/tabs.
- **SPAs de un solo route** (varios niveles bajo un mismo `/route`): el patrón de referencia es **Reclamos** (`src/app/reclamos/ReclamosClient.tsx`) — drill-down/tabs/back-forward vía el router de Next reconstruyendo el estado desde la URL. (El ejemplo anterior, Camisetas, fue eliminado en #35.)
- Módulos con **routes reales** (Caja, Préstamos, Guías, Clientes detalle) ya son correctos: cada nivel es una URL distinta empujada con `router.push`/`<Link>`. No requieren tratamiento especial.

## Shared Components (src/components/)
- **AppHeader** — sticky header con module color accent, user info, search, notifications
- **SearchBar** — ⌘K + mobile full-screen + recientes + spotlight NLP
- **MobileBottomBar** — ELIMINADO (abril 2026). Navegación es solo por módulos del home + drawer del header
- **NotificationCenter** — 🔔 bell con historial de toasts
- **SessionWarning** — banner/modal antes de expirar sesión
- **OfflineBanner** — amber offline, green reconexión
- **ContextMenuWrapper** — right-click menus en desktop
- **UndoToast** — countdown bar 5s con "Deshacer"
- **TimeGroupHeader** — headers colapsables por período de tiempo- **OverflowMenu** — "···" dropdown para acciones secundarias
- **ScrollableTable** — gradient indicators para scroll horizontal
- **SwipeableRow** — swipe-to-action en mobile
- **PullToRefresh** — pull down para refrescar en mobile
- **BottomSheet** — half/full screen draggable (mobile)
- **AccordionContent** — CSS grid expand/collapse animado
- **AnimatedNumber** — count-up con easing

## Hooks (src/lib/hooks/)
- **useAuth** — check role, user info
- **useSessionCheck** — ⚠️ **SIN USO**: no tiene importadores desde el 11-abr-2026, así que el chequeo de sesión cada 2 min NO corre. Se conserva rotulado (candado: `ganchos-sin-uso.test.ts`); enchufarlo es una decisión de Daniel que no está tomada.
- **useUrlState** — sync state ↔ URL params
- **useLastUsed** — remember last form values
- **useDraftAutoSave** — auto-save formularios cada 5s
- **usePersistedState** — sessionStorage-backed state
- **useUndoAction** — delayed execution con 5s undo window
- **useOnlineStatus** — offline/online detection
