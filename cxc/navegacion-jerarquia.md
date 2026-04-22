# Jerarquía de navegación — fashiongr.com

> Fecha: 2026-04-22
> Propósito: definir el padre lógico de cada ruta (lo que DEBERÍA ser), no lo que está implementado hoy.
> Archivo untracked para revisión local.

## Resumen
- Total de rutas mapeadas: **62**
- Módulos cubiertos: **15** (los del audit mobile) + sub-módulos de Catálogos
- Profundidad máxima de jerarquía: **4 niveles** (p.ej. `/inicio → /catalogos → /catalogo/reebok → /catalogo/reebok/pedido/{id}`)

Nota terminológica: en el código la ruta del home es `/home`. En este documento se usa `/inicio` como nombre lógico consistente con la UI en español. Al implementar los botones "← Inicio" deben apuntar a `/home`.

---

## Reglas aplicadas

1. El padre de una ruta top-level (cxc, cheques, caja, ventas, marketing, guias, prestamos, reclamos, packing-lists, directorio, camisetas, upload, catálogo reebok, catálogo joybees, admin/usuarios) es SIEMPRE `/inicio`.

2. El padre de un detalle es la LISTA del mismo módulo, NO `/inicio`.
   Ejemplos:
   - `/caja?view=detail&id=X` → padre `/caja`
   - `/cheques/{id}` → padre `/cheques`
   - `/reclamos?id=X` → padre `/reclamos`
   - `/marketing?proyecto=X` → padre `/marketing`

3. El padre de una sub-vista dentro de un detalle es el DETALLE, no la lista.
   Ejemplos:
   - `/guias/{id}/imprimir` → padre `/guias/{id}`
   - `/cxc/cliente/{id}/historial` → padre `/cxc/cliente/{id}`

4. Query params de filtro/vista (`?vista=historial`, `?search=X`) NO cambian el padre. El padre sigue siendo la misma ruta sin el query param filtrante.

5. Pestañas internas de un módulo (ej: Ventas tabs, Camisetas tabs) NO son rutas hijas. Son la misma ruta con query param.

### Textos de botón "← Volver" convenidos

Nunca "← Volver" genérico. Por módulo, el sustantivo de la lista:

| Módulo | Nombre UI de la lista | Texto de botón |
|---|---|---|
| CXC | "Cuentas por Cobrar" | **← CXC** |
| Cheques | "Cheques" | **← Cheques** |
| Caja Menuda | "Períodos" | **← Períodos** |
| Ventas | "Ventas" | **← Ventas** |
| Marketing | "Proyectos" | **← Proyectos** |
| Guías | "Guías" | **← Guías** |
| Préstamos | "Colaboradores" | **← Colaboradores** |
| Reclamos | "Reclamos" | **← Reclamos** |
| Packing Lists | "Packing Lists" | **← Packing Lists** |
| Directorio | "Directorio" | **← Directorio** |
| Camisetas | "Clientes" | **← Clientes** |
| Upload | "Actualizar datos" | **← Actualizar datos** |
| Catálogos (hub) | "Catálogos" | **← Catálogos** |
| Catálogo Reebok | "Reebok" | **← Reebok** |
| Catálogo Joybees | "Joybees" | **← Joybees** |
| Pedidos Reebok | "Pedidos" | **← Pedidos** |
| Usuarios | "Usuarios y Permisos" | **← Usuarios** |
| Raíz | "Inicio" | **← Inicio** |

Para volver a un **detalle específico** (regla 3), usar el nombre natural: "← Guía GT-042", "← Período N°17", "← Cliente Fashion S.A.", "← Proyecto Navidad TH".

---

## Módulos

### 1. Inicio (`/home`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/home` | (root) | — (Salir = logout) | 0 |
| `/` (login) | (root) | — | 0 |

Notas: es la raíz. No tiene botón "volver" — solo botón "Salir" para logout.

---

### 2. CXC (Cuentas por Cobrar, `/admin`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/admin` | `/inicio` | ← Inicio | 1 |
| `/admin?search=X&risk=Y&company=Z` | `/admin` | (no botón, es filtro) | 1 |
| *(expansión inline de cliente — no es ruta)* | — | — | — |

Notas:
- Actualmente no existe una ruta de detalle por cliente. La fila se expande inline o abre `ContactPanel` overlay. Si en el futuro se crea `/admin/cliente/{id}`, su padre es `/admin` con botón **← CXC**.
- El deep link desde Directorio `?search=NAME` debe preservarse — no cambia el padre; lo correcto es que al llegar, el botón "← Inicio" siga llevando a `/inicio`, NO al Directorio.

---

### 3. Cheques Posfechados (`/cheques`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/cheques` | `/inicio` | ← Inicio | 1 |
| `/cheques?filter=pendiente\|vencido\|rebotado\|depositado\|todos` | `/cheques` | (no botón, es filtro) | 1 |

Notas:
- Hoy "nuevo cheque" y "editar cheque" son modales (no rutas). Según regla de casos especiales (abajo), Back del navegador debe cerrar el modal, no salir del módulo. No hay detalle de cheque con URL propia.
- Si en el futuro se agrega `/cheques/{id}` como detalle, su padre es `/cheques` con botón **← Cheques**.

---

### 4. Caja Menuda (`/caja`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/caja` | `/inicio` | ← Inicio | 1 |
| `/caja?view=detail&id=X` *(idealmente `/caja/{id}`)* | `/caja` | ← Períodos | 2 |
| `/caja?view=print&id=X` *(idealmente `/caja/{id}/imprimir`)* | `/caja/{id}` | ← Período N°{n} | 3 |
| `/caja/{periodoId}/nuevo` | `/caja/{id}` | ← Período N°{n} | 3 |

Notas:
- Hoy existe la ruta real `/caja/[periodoId]/nuevo` pero el detalle y el print son pseudo-rutas con query. Lo ideal es que el detalle sea ruta real `/caja/{id}` y su padre siga siendo `/caja`.
- El botón actual "← Cancelar" en `/caja/[periodoId]/nuevo` debe decir **← Período N°{n}**, no "Cancelar".

---

### 5. Ventas (`/ventas`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/ventas` | `/inicio` | ← Inicio | 1 |
| `/ventas?anio=2026&empresa=...&vista=...` | `/ventas` | (no botón, es filtro) | 1 |
| `/ventas/metas` | `/ventas` | ← Ventas | 2 |
| `/ventas/reporte?anio=X&empresa=Y&vista=Z` | `/ventas` | ← Ventas | 2 |

Notas:
- Tabs "Resumen" y "Clientes" son la misma ruta (no hijas).
- `/ventas/reporte` se abre en nueva pestaña (`window.open`). Tiene su propio "← Ventas" que cierra la pestaña o navega; el padre lógico sigue siendo `/ventas`.

---

### 6. Marketing (`/marketing`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/marketing` | `/inicio` | ← Inicio | 1 |
| `/marketing?vista=anulados` | `/marketing` | ← Proyectos | 2 |
| `/marketing?vista=reportes` | `/marketing` | ← Proyectos | 2 |
| `/marketing?vista=historial` | `/marketing` | ← Proyectos | 2 |
| `/marketing?proyecto={uuid}` *(overlay)* | `/marketing` | ← Proyectos (texto "Listo") | 2 |

Notas:
- El overlay `?proyecto=X` es semánticamente un detalle. Se abre sobre la lista y su padre es `/marketing`. El botón actual "← Listo" está bien en intención (cerrar) pero conceptualmente navega a `/marketing` → consistente.
- Modal "Nuevo Proyecto" no es ruta — caso especial abajo.
- `?vista=papelera` es legacy y se redirige a `?vista=anulados`. Padre sigue siendo `/marketing`.

---

### 7. Guías de Transporte (`/guias`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/guias` | `/inicio` | ← Inicio | 1 |
| `/guias?pendientes=1` | `/guias` | (no botón, es filtro) | 1 |
| `/guias/nueva` | `/guias` | ← Guías | 2 |
| `/guias/{id}/editar` | `/guias` | ← Guías | 2 |
| `/guias?id=X` *(print, idealmente `/guias/{id}/imprimir`)* | `/guias` | ← Guías | 2 |

Notas:
- Print view hoy es pseudo-ruta con query. Lo ideal es convertirla en ruta real `/guias/{id}/imprimir` con padre `/guias` (nivel 2, no 3 porque la lista es la referencia, no hay vista de "detalle no imprimible").
- El botón actual "← Volver a Guías" en GuiaDetail es correcto en texto; el problema es que no limpia la URL (ver audit-navegacion).

---

### 8. Préstamos (`/prestamos`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/prestamos` | `/inicio` | ← Inicio | 1 |
| `/prestamos?showArchived=1` | `/prestamos` | (no botón, es filtro) | 1 |
| `/prestamos/{id}` | `/prestamos` | ← Colaboradores | 2 |
| `/prestamos/reporte` | `/prestamos` | ← Colaboradores | 2 |

Notas:
- BottomSheet mobile de preview NO es ruta — caso especial abajo. Si el usuario pulsa "Ver completo", navega a `/prestamos/{id}`.
- Texto actual "← Volver" en prestamos/reporte y "Volver" (sin flecha) en EmpleadoHeader debe unificarse a **← Colaboradores**.

---

### 9. Reclamos a Proveedores (`/reclamos`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/reclamos` | `/inicio` | ← Inicio | 1 |
| `/reclamos?empresa=NAME` *(vista empresa)* | `/reclamos` | ← Reclamos | 2 |
| `/reclamos?view=form` *(idealmente `/reclamos/nuevo`)* | `/reclamos` | ← Reclamos | 2 |
| `/reclamos?view=form&id=X` *(idealmente `/reclamos/{id}/editar`)* | `/reclamos/{id}` | ← Reclamo {n°} | 3 |
| `/reclamos?view=detail&id=X` *(idealmente `/reclamos/{id}`)* | `/reclamos?empresa=NAME` *(si venía de ahí)* o `/reclamos` | ← Reclamos | 2 |

Notas:
- Hoy todo es pseudo-ruta con query + `pushState`. La jerarquía ideal es convertir a rutas reales. Mientras no se haga:
  - El detalle sigue siendo hijo de la lista (no de la sub-vista "por empresa").
  - El form de edición de un reclamo específico es hijo del detalle (nivel 3).
- La sub-vista `?empresa=NAME` (tabla filtrada por empresa) es una VISTA de la lista, no una entidad — por regla 4 no cambia el padre. Botón **← Reclamos** la cierra.
- El breadcrumb custom duplicado en EmpresaList/ReclamoDetail debe eliminarse; usar solo el del AppHeader.

---

### 10. Packing Lists (`/packing-lists`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/packing-lists` | `/inicio` | ← Inicio | 1 |
| `/packing-lists/{id}` | `/packing-lists` | ← Packing Lists | 2 |

Notas:
- Breadcrumb actual dice "Historial" con `window.history.back()`. Debe decir **← Packing Lists** y usar `router.push('/packing-lists')`.

---

### 11. Directorio de Clientes (`/directorio`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/directorio` | `/inicio` | ← Inicio | 1 |
| `/directorio?search=X&empresa=Y` | `/directorio` | (no botón, es filtro) | 1 |

Notas:
- No hay rutas de detalle — click abre BottomSheet mobile o expansión inline desktop. Caso especial.
- Deep links salientes a `/admin?search=NAME` y `/cheques?search=NAME` no cambian la jerarquía del destino. Desde `/admin` el botón "← Inicio" va a `/home`, no regresa al Directorio.

---

### 12. Camisetas (`/camisetas`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/camisetas` | `/inicio` | ← Inicio | 1 |
| `/camisetas?cliente=X` | `/camisetas` | ← Clientes | 2 |

Notas:
- Tabs "Resumen / Por Cliente / Stock" son la misma ruta. No son hijas.
- La vista cliente con `?cliente=X` hoy está bien implementada (pushState + popstate). Botón actual "← Clientes" coincide con el convenio.

---

### 13. Upload / Actualizar Datos (`/upload`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/upload` | `/inicio` | ← Inicio | 1 |
| `/upload?tab=cxc\|ventas` | `/upload` | (no botón, es tab) | 1 |
| `/upload?tab=ventas&from=ventas` | `/ventas` *(excepción por contexto)* | ← Ventas | 1* |

Notas:
- Caso especial: cuando el usuario llega desde `/ventas` con `?from=ventas`, el padre contextual es `/ventas`, no `/inicio`. Este es el único caso justificado de "padre dinámico" en todo el ERP. Coincide con el comportamiento actual del link "← Volver a Ventas".
- Modales preview CXC/Ventas no son rutas — caso especial.

---

### 14. Catálogos (`/catalogos`, `/catalogo/*`)

#### 14a. Hub de catálogos
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/catalogos` | `/inicio` | ← Inicio | 1 |
| `/catalogos/admin` | `/catalogos` | ← Catálogos | 2 |
| `/catalogos/admin/reebok` | `/catalogos/admin` | ← Admin Catálogos | 3 |
| `/catalogos/admin/joybees` | `/catalogos/admin` | ← Admin Catálogos | 3 |

#### 14b. Catálogo Reebok
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/catalogo/reebok` | `/catalogos` | ← Catálogos | 2 |
| `/catalogo/reebok/productos` | `/catalogo/reebok` | ← Reebok | 3 |
| `/catalogo/reebok/productos?gender=X&category=Y&search=Z` | `/catalogo/reebok/productos` | (no botón, es filtro) | 3 |
| `/catalogo/reebok/producto/{id}` | `/catalogo/reebok/productos` | ← Productos | 4 |
| `/catalogo/reebok/pedidos` | `/catalogo/reebok` | ← Reebok | 3 |
| `/catalogo/reebok/pedido/{id}` | `/catalogo/reebok/pedidos` | ← Pedidos | 4 |
| `/catalogo/reebok/clientes` | `/catalogo/reebok` | ← Reebok | 3 |
| `/catalogo/reebok/admin` | `/catalogos/admin` *(si la ruta `/catalogos/admin/reebok` es la canónica, eliminar esta)* | ← Admin Catálogos | 3 |
| `/catalogo/reebok/admin/productos/nuevo` | `/catalogo/reebok/admin` | ← Admin Reebok | 4 |
| `/catalogo/reebok/admin/productos/nuevo?id=X` *(editar)* | `/catalogo/reebok/admin` | ← Admin Reebok | 4 |

#### 14c. Catálogo Joybees
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/catalogo/joybees` | `/catalogos` | ← Catálogos | 2 |

#### 14d. Catálogos públicos y pedidos externos (sin login)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/catalogo-publico/reebok` | (root público — sin login) | — | 0 |
| `/catalogo-publico/joybees` | (root público) | — | 0 |
| `/pedido-reebok/{id}` | (root público) | — | 0 |
| `/pedido-joybees/{id}` | (root público) | — | 0 |

Notas:
- Las rutas bajo `/catalogo/reebok/admin/{importar,inventario,exportar,upload,productos}` son redirects con `router.replace` a `/catalogo/reebok/admin`. Son código zombie — eliminarlas.
- `/catalogo/reebok/admin` y `/catalogos/admin/reebok` son duplicados aparentes. Elegir una canónica (propuesta: `/catalogos/admin/reebok` para consistencia con el hub).
- Rutas públicas (`/catalogo-publico/*`, `/pedido-*/*`) no tienen padre interno. Back del navegador sale de la app o va al origen externo (WhatsApp, email, etc.).

---

### 15. Usuarios y Permisos (`/admin/usuarios`)
| Ruta | Padre lógico | Texto botón volver | Nivel |
|---|---|---|---|
| `/admin/usuarios` | `/inicio` | ← Inicio | 1 |

Notas:
- Sin sub-rutas. Jerarquía trivial.
- Breadcrumb actual dice "Admin › Usuarios y Permisos" — la palabra "Admin" es confusa porque no es un módulo navegable real (el rol admin ve todo el ERP). Considerar cambiar a "Inicio › Usuarios".

---

## Casos especiales

### Modales que NO son rutas

Para todos estos, Back del navegador debe **cerrar el modal**, no salir del módulo. Implementación sugerida: al abrir el modal hacer `history.pushState({modal: 'name'}, '', window.location.href)` y escuchar `popstate` para cerrarlo.

| Módulo | Modales | Comportamiento esperado al Back |
|---|---|---|
| CXC (`/admin`) | ContactPanel overlay, export dropdown | Cierra el overlay, permanece en `/admin` |
| Cheques | showForm, editingId, dayChequesModal, rebotandoId, confirmDelete, kpiTooltip | Cierra el modal, permanece en `/cheques` |
| Caja | ConfirmClose, ConfirmDelete, pendingDelete sheet, DeletedGastosModal, nuevoPeriodo | Cierra el modal, permanece en `/caja` |
| Reclamos | showDeleteConfirm, showAplicadaModal, confirmingEstado popover | Cierra el modal, permanece en vista actual |
| Préstamos | showEmpModal, showMovModal, BottomSheet (mobile), PagoQuincenalConfirm, DeleteEmpleadoConfirm, ClearHistoryConfirm, ForceArchiveConfirm, ConfirmBatchApprove, ConfirmBatchReject | Cierra el modal/sheet, permanece en `/prestamos` |
| Guías | GuiaDeleteModal, pendingFirma modals | Cierra el modal, permanece en `/guias` |
| Packing Lists | ConfirmDeleteModal, preview upload | Cierra el modal, permanece en vista actual |
| Directorio | showNew, inline editing, confirmDupCreate, confirmUnsavedTarget, ConfirmDeleteModal, mobileContactId BottomSheet | Cierra el modal/sheet, permanece en `/directorio` |
| Camisetas | showNewClient, showNuevo (2 pasos), showMatrix, showInfo, stock edit mode, ConfirmDeleteModal | Cierra el modal, permanece en `/camisetas` |
| Upload | cxcPreview modal, ventasPreview modal | Cierra el preview, permanece en `/upload` |
| Marketing | NuevoProyectoModal, ConfirmModal anular/reabrir | Cierra el modal, permanece en `/marketing` (el overlay `?proyecto=X` sí es URL y ya funciona bien) |
| Ventas | export dropdown | Cierra el dropdown, permanece en `/ventas` |

### Deep links entre módulos

El padre del destino respeta su propia jerarquía, NO regresa al origen:

| Origen | Destino | Padre lógico del destino | Back del navegador |
|---|---|---|---|
| `/directorio` botón 🔍 | `/admin?search=NAME` | `/inicio` | Va a `/inicio` (NO a `/directorio`) |
| `/directorio` botón cheques | `/cheques?search=NAME` | `/inicio` | Va a `/inicio` (NO a `/directorio`) |
| `/ventas` upload | `/upload?tab=ventas&from=ventas` | `/ventas` ← **excepción justificada** | Va a `/ventas` |
| SearchBar global (⌘K) | cualquier módulo | `/inicio` | Va a donde estabas antes de abrir search |
| Spotlight quick-action | deep link a módulo con filtro | padre del módulo destino | No recuerda origen |

La excepción `?from=ventas` en Upload es intencional y mínima. No generalizar el patrón a otros deep links — agregar complejidad para recordar origen solo vale la pena cuando el flujo es "ir, hacer algo, volver" (como subir datos).

### Rutas públicas sin padre interno

`/`, `/catalogo-publico/reebok`, `/catalogo-publico/joybees`, `/pedido-reebok/{id}`, `/pedido-joybees/{id}` no tienen padre dentro de la app. Diseñarlas como landing pages autocontenidas.

---

## Inconsistencias detectadas en el código actual

Según `/audit-navegacion.md`, estos lugares NO respetan la jerarquía propuesta arriba:

### Prioridad 1 — bugs funcionales
1. **Caja** `src/app/caja/hooks/useCajaState.ts:17-24` — `setView` usa `pushState` al "volver a lista". Debe usar `replaceState` o, mejor, convertir detalle en ruta real `/caja/{id}`. La jerarquía propuesta es `/caja/{id}` hijo de `/caja`.
2. **Reclamos** `src/app/reclamos/page.tsx:89-95` — mismo bug. Detalle debe ser `/reclamos/{id}`, hijo de `/reclamos`.
3. **Guías** `src/app/guias/components/useGuiasState.ts:143` + `GuiaDetail.tsx:15` — cierre de print view no limpia URL. La propuesta `/guias/{id}/imprimir` como ruta real soluciona esto.
4. **Packing Lists** `src/app/packing-lists/[id]/page.tsx:396` — breadcrumb usa `window.history.back()`. Debe usar `router.push('/packing-lists')` con texto **← Packing Lists**.

### Prioridad 2 — textos de botón inconsistentes
5. **Caja** `caja/[periodoId]/nuevo/page.tsx:233` — "← Cancelar" debe ser **← Período N°{n}** (hijo nivel 3).
6. **Guías** `GuiaForm.tsx:199` — "← Guías" es correcto. Mantener.
7. **Préstamos** `prestamos/components/EmpleadoHeader.tsx:36` — "Volver" sin flecha ni sustantivo. Debe ser **← Colaboradores**.
8. **Préstamos** `prestamos/reporte/page.tsx:196` — "← Volver a Préstamos" debe ser **← Colaboradores** por consistencia del convenio.
9. **Marketing** `marketing/page.tsx:141` — "← Volver" genérico. Debe ser **← Proyectos**.
10. **Marketing** `ProyectoOverlay.tsx:189` — "← Listo" está bien conceptualmente, pero por consistencia podría ser **← Proyectos**. Judgment call — "Listo" es más natural al cerrar un overlay de trabajo.
11. **Caja** `PrintView.tsx:25` — "← Volver" genérico. Debe ser **← Período N°{n}**.
12. **Guías** `GuiaDetail.tsx:16` — "← Volver a Guías" redundante. Debe ser **← Guías**.

### Prioridad 3 — padre lógico incorrecto
13. **Reclamos** `EmpresaList.tsx:140` — breadcrumb custom "Reclamos / {empresa}" con back que hace `setActiveEmpresa(null)` (solo state, sin URL). Debe mapear a URL `?empresa=NAME` y el back debe navegar a `/reclamos`.
14. **CXC** `src/app/admin/page.tsx` — no lee `?search=X` del URL. Los filtros se deben sincronizar con URL (usar `useUrlState` que ya existe en `src/lib/hooks/useUrlState.ts`).
15. **CXC deep link** — link desde Directorio `/admin?search=NAME` no pre-completa la búsqueda. Arreglo en punto 14.

### Prioridad 4 — código zombie
16. **Catálogo Reebok admin** — rutas `/catalogo/reebok/admin/{importar,inventario,exportar,upload,productos}` son redirects. Eliminar o dejar si son landing compat.
17. **Duplicación admin catálogos** — `/catalogo/reebok/admin` vs `/catalogos/admin/reebok`. Elegir una. Propuesta: canónica `/catalogos/admin/reebok` (consistente con el hub), redirect desde la otra.

### Prioridad 5 — modales sin historia
18. Todos los modales listados en "Casos especiales" arriba NO interceptan Back del navegador hoy. Solo Marketing lo hace bien (vía `?proyecto=X`). Implementar el patrón `pushState + popstate` universalmente en los componentes compartidos (`Modal`, `ConfirmModal`, `BottomSheet`) para que sea automático.

---

## Conclusión

La jerarquía propuesta tiene **2 niveles típicos** (módulo → detalle) y **3 niveles excepcionales** (módulo → detalle → sub-vista). El nivel 4 solo aparece dentro de Catálogos por su sub-árbol admin/productos.

Aplicando las 5 reglas, el texto del botón "← Volver" queda determinístico: mirar el padre lógico y usar su sustantivo convenido. Esto elimina la ambigüedad que hoy produce bugs como "← Volver" genérico o "Cancelar" cuando el destino es el período.

Implementar esta jerarquía implica:
- Convertir pseudo-rutas de query (Caja detail/print, Reclamos view, Guías print) en rutas reales Next.js.
- Sincronizar filtros con URL (CXC, Cheques ya lo hace parcialmente).
- Implementar interceptación de Back en modales compartidos una sola vez.
- Unificar textos de botones "← {destino}" según el convenio.
