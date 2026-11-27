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

## Lo que decía CLAUDE.md hasta el 8-oct-2026 (movido aquí, verbatim)

> Movido desde `cxc/CLAUDE.md` el 8-oct-2026 para que el archivo vuelva a tener aire bajo el tope de `claude-md-bajo-el-tope.test.ts`. Ninguna regla cambió: es el texto tal cual estaba, con su fecha. En CLAUDE.md queda una línea que apunta aquí.

### Navegación e Historial › en el celular: pestaña = pantalla, ☰ a pantalla completa, sin barra de arriba (24-sep-2026)

- 🔴 **EN EL CELULAR, UNA PESTAÑA ES UNA PANTALLA (24-sep-2026)**: `useUrlState` decide por el dedo (`aparatoDeQuienMira`): `CLAVES_DE_PANTALLA` (`tab · subtab · vista · ver · modo · mfCel`) hacen `push` en el celular y `replace` en la computadora; filtros siguen en `replace`. Candado `url-state-pestana-es-pantalla`.
- 🔴 **EN EL CELULAR, ☰ ABRE EL MENÚ ENTERO, A PANTALLA COMPLETA (24-sep-2026)**: los TRES grupos como secciones con TODOS los módulos del ROL —ícono en su color, el de aquí marcado— y un buscador que solo acorta ESA lista (`coincideBusqueda`, **nunca por parecido**). **2 toques a cualquiera.** 🔴 Los CUATRO sin acento ya tienen tono, **fuera de `getModuleKeyFromPath`**. `MODO_DEL_CAJON` en `cajon-por-grupos.ts`. Candados `menu-pantalla-completa` · `cajon-hoja-abajo`.
- 🔴 **Y EN EL CELULAR YA NO HAY BARRA DE ARRIBA (24-sep-2026)**: la franja de 46 px se fue entera (respaldo: `SIN_BARRA_ARRIBA=false`; campana y lupa siguen afuera del celular). 🔴 **El nombre del módulo es el TÍTULO grande de la página** (34 px, con el punto del acento, se va con el dedo) y se dice **UNA sola vez**: la portada que ya lo dibuja pasa `tituloEnLaPantalla` (Reclamos · CxC · Asistencia · Multifashion · Marketing); es un `<p>`, nunca un segundo `<h1>`. 🔴 **Las tres rayas son un botón redondo de 56 px abajo a la derecha** que abre el MISMO menú entero, con colchón de **76 px** en las listas; **sube encima de los botones negros fijos** —la barra publica su alto en `--fg-alto-barra-fija` y el botón negro no se mueve—. 🔴 **`--fg-altura-encabezado` queda en 0** y las pegajosas se pegan arriba del todo; a quien **solo marca** no se le dibuja ni título ni botón. En la computadora nada cambia. `lib/navegacion/barra-celular.ts`. Candado `sin-barra-arriba`.

---

## El gesto de volver (16-nov-2026, `ATRAS_CIERRA_2026_11`)

**Qué pasaba.** En el celular, el detalle de un pedido (Despachos › Pedidos) y las hojas que suben desde abajo no se sumaban al historial del navegador: el gesto de volver de iOS sacaba al usuario del módulo. Daniel lo reportó con el pedido. Caja menuda ya lo hacía bien (`pushState` al abrir, `popstate` cierra, «Cerrar» hace `history.back()`).

**Qué se hizo (aprobado por Daniel: «Si»).**
- `src/lib/hooks/useAtrasCierra.ts`: el patrón de Caja en un solo lugar. Abrir suma una entrada; volver la cierra; «Cerrar» vuelve UNA sola vez aunque se toque dos veces y puede correr algo después de cerrar (`volver(despues)`).
- 🔑 Si se cierra por otro camino (guardar, elegir, navegar con `router.push` + cerrar en el mismo toque, como el menú ☰) o el componente se desmonta con la entrada arriba, **no se llama a `history.back()`**: chocaría con la navegación en curso y la anularía. La entrada se marca muerta y, si alguien vuelve a caer en ella, se salta sola. Límite conocido: sentado encima de una entrada muerta (cerrada sin volver y sin navegar), el siguiente gesto de volver no mueve nada una vez.
- `HojaCel`: con historial, una opción primero vuelve y después corre (un cambio de dirección, como la empresa de Ventas › Clientes, ya no se pierde con el `back()`).
- Conectado en: Despachos › Pedidos › detalle · Etiquetas › Nuevo envío · `HojaCel` y `BottomSheet` (solo en el celular, por el dedo) · Por cobrar › cliente (`HojaCobrar`; el enlace a la ficha cierra sin tocar el historial, `onCerrarAlSalir`) · Ventas › Clientes › hoja del cliente y su mes a mes · Comisiones › detalle del vendedor en el celular (por empresa y consolidado) · Caja menuda (siempre activo, como estaba).
- Pestañas de Despachos: en el celular hacen `pushState` (`modoDeHistorial("vista", …)`, como Asistencia) y el gesto de volver regresa a la pestaña anterior.
- «‹ Volver» (`TituloQueVuelve`): `subirA()` en vez de un `<Link>` que empujaba otra entrada.
- No cambia ningún dato. Los modales de confirmación de la computadora no se tocaron.

**Verificado** en local con datos falsos (Supabase falso, nunca producción), viewport de iPhone 13: abrir el pedido → volver = Pedidos; «‹ Pedidos» = Pedidos; Pedidos → Etiquetas → Nuevo envío → volver cierra el envío → volver = Pedidos; «Cómo se usa» (hoja) → volver la cierra sin salir de Despachos.

Candado: `src/__tests__/lib/atras-cierra.test.tsx`.


## Gestos del iPhone (27-nov-2026, `GESTOS_IPHONE_2026_11`)

Daniel: *«Deslice hacia abajo y no hace nada. Como apple quiero. En lugares de eliminar que sea como el barril de iphone. Desliza y elimina.»* Después aprobó cuatro gestos más y los llevó a más pantallas. Solo teléfono; en la computadora no cambia nada. `false` = lo de antes.

**🩸 Por qué «deslizar hacia abajo» no hacía nada (publicado en #894).** `empiezaEnLaPagina` se negaba si encontraba cualquier `[aria-modal="true"]` en el DOM, y el menú del celular (`HojaMenu`) está SIEMPRE montado, cerrado y oculto, con `aria-modal`. Así que el gesto se negaba en todas las pantallas. Ahora solo cuenta una capa ABIERTA de verdad: visible (`getClientRects`) y no dentro de `aria-hidden`. La ruedita es la de iOS: se llena rayo por rayo al estirar y gira mientras corre el MISMO «Actualizar». Candado: `deslizar-para-actualizar.test.tsx`.

**Deslizar a la izquierda = Eliminar**
- Un deslizamiento corto muestra «Eliminar» en rojo; uno largo (55 % del ancho) elimina, como en Mail.
- Siempre lleva «Deshacer» de 5 s y pasa por el MISMO borrado de cada pantalla: soft delete, permisos y servidor iguales.
- Pieza única: `SwipeableRow` con `eliminar` (`components/ui.tsx`).
- Pantallas: Reclamos (admin), Caja menuda (gasto de un período abierto), Comprobantes de catálogos (quien administra) y Marketing › Mobiliario (admin).
- Donde había `ConfirmDeleteModal`, el botón del modal sigue en la computadora; en el teléfono, deslizar borra con «Deshacer».
- Candado: `borrar-al-deslizar.test.tsx`.

**Deslizar a la derecha = la acción principal**, por la misma ruta y la misma regla de rol. Si el rol no puede, el gesto no se ofrece.
- Despachos › Pedidos: avanza un paso con «Deshacer» 5 s (`pasoAlDeslizar`). Bodega marca En preparación y Preparado; la secretaria, Recibido. «Preparado» abre los bultos y no avanza solo.
- Asistencia › Aprobaciones: derecha = Sí, izquierda = No, a lo pendiente de una persona, con «Deshacer» 5 s. El POST es el mismo y al aprobar manda el servidor.
- Recordatorios: el cheque queda «Depositado» (la misma `depositar`, con su «Deshacer»).
- CxC: abre la hoja ya en «Estado de cuenta». **No envía.**
- Reclamos: abre el reclamo con «Cobrar» y el total puesto. No se ofrece en los cobrados. **No cobra.**

**Mantener presionado (~500 ms) = tarjeta de resumen** (`TarjetaResumen`)
- Solo con lo que ya está en pantalla: ninguna lectura nueva, y lo que no hay no se pone.
- Tocar la tarjeta abre lo mismo que el renglón; tocar afuera la cierra.
- Pantallas:
  - CxC: saldo por empresa.
  - Clientes: saldo y compras del año. Última compra y último pago no salen porque la lista no los trae.
  - Despachos › Guías: facturas, bultos y transportista.
  - Ventas › Resumen (una empresa) y Ventas › Clientes: la venta MES A MES con ▲/▼ contra el mismo mes del año pasado (27-nov-2026; ver ventas-referencia.md).
  - Proveedores: los cuatro tramos y «Por pagar», nunca «vencido».
  - Comisiones: venta, cobro y comisión. En «Todas las empresas» no sale, porque esas filas no traen venta ni cobro.

**Volver desde el borde izquierdo** (primeros 20 px, en pantallas de detalle): la pantalla sigue al dedo y suelta en `router.back()`. No choca con renglones ni con tablas desplazadas.

**Tocar el encabezado** sube suave al principio, también en pantallas con scroll propio.

Candados: `gestos-iphone.test.tsx` y `gestos-tarjetas-resumen.test.tsx`.

- **Tarjeta mes a mes, UNA sola** (27-nov-2026): `components/shared/TarjetaMesAMes.tsx` la usan Ventas (Resumen y Clientes), Clientes, Multifashion › Vendedoras, Comisiones (por empresa) y Consulta de artículos; aviso único «Mantén presionado para ver mes a mes» (`fg_aviso_mes_a_mes`). Detalle en [ventas-referencia.md](ventas-referencia.md) › «La segunda tanda».

## 27-nov-2026 — El modal cabe en la pantalla (`MODAL_CABE_2026_11`)

- **Qué pasó**: en la computadora de Angela (1366×768, Chrome en Windows), «Editar factura» de Marketing salía cortado: arriba no se veían el título ni los primeros campos, y abajo no se veía «Guardar factura». Tuvo que achicar el zoom. Daniel pidió que el arreglo valga para todo el sistema.
- **La regla**, en todo modal y toda hoja:
  1. El alto máximo es el de la ventana (`max-h-[calc(100dvh-1rem)]`, y `-2rem` desde `sm`).
  2. La cabecera queda fija.
  3. El cuerpo hace scroll por dentro.
  4. El pie con los botones queda siempre a la vista.
- **Dónde vive**: `lib/ui/modal-cabe-2026-11.ts` tiene `PANEL_CABE`, `PANEL_CABE_COLUMNA` + `CUERPO_CON_SCROLL`, `CABECERA_FIJA`, `PIE_FIJO` y `cabe(nuevo, antes)`.
  - Las piezas base ya la traen: `Modal` (prop nuevo `pie`), `ConfirmModal`, `ConfirmDeleteModal`, `ConfirmTypeNameModal` y `BottomSheet` (prop `pie`).
  - `ModalOverlay` deja 1 rem arriba y abajo en la computadora.
  - Se barrieron los modales hechos a mano de Caja, Préstamos, Asistencia, Recordatorios, Despachos, Catálogos, Comisiones, CxC (Boston), Plantilla Switch, Usuarios (contraseña), Marketing, la hoja del celular y `VentanaCentrada`.
  - Lo que no es un modal con panel (fondos de menú, pantallas completas, cajones laterales, el visor de fotos) lleva el comentario `modal-cabe: <por qué>`.
- **Candado**: `modal-cabe-en-la-pantalla.test.ts` revisa cada `fixed inset-0` y cada `<ModalOverlay`. Si no tiene cerca un `max-h-…`, `PANEL_CABE…` o `modal-cabe:`, el build se pone rojo.
- **Probado** a 1366×768, 1280×720 y 390 px, con datos guardados y sin tocar la base: «Editar factura» (desde Gastos y desde el Cobro), Registrar gasto, Caja › Cerrar período, Recordatorios › Nuevo recordatorio, Préstamos › Nuevo movimiento, Catálogos › Reenviar correo y Cambiar contraseña.
