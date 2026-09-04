# Auditoría de eficiencia — Ventas y clientes (primera mitad)

> Auditoría del 4-sep-2026, medida contra producción (sesiones, tablas de escritura, `activity_logs`).
> Cubre: **Vista General · Ventas · Cuentas por Cobrar · Clientes · Proveedores**.
> La segunda mitad del grupo (Multifashion, Boston, Catálogos, Comisiones como módulo, Referencia como módulo) va en otro archivo.

**Quién entra al sistema (sesiones en los últimos 60 días, `user_sessions`):**
daniel (admin) 243 · Angela (secretaria) 133 · andrea (secretaria) 130 · Bodega 116 · rey (vendedor) 55 · Contabilidad 50 · jennifer (gerente ACS) 39 · edwin (vendedor, acotado a Vistana) 14 · alberto (admin) 10 · david (gerente Boston) 5 · rodrigo (vendedor) 0.
⚠️ `activity_logs` no registra pantallas vistas — solo logins y algunas escrituras. Para los módulos de pura lectura de este grupo, «cuánto se usa» no es medible; lo que sí se midió son las ESCRITURAS de cada módulo, y se dice en cada sección.

---

## Vista General (`/vista-general`, key `vista-general`)

**Qué es y quién lo usa.** El panel de KPIs del mes: ventas, margen, plata en banco, inventario al costo, por cobrar, por pagar, gastos y rentabilidad por empresa, y 3 tarjetas de «Atención». Solo admin = Daniel y Alberto.

**Uso medido (al 4-sep-2026).** No medible con `activity_logs` (es 100 % lectura, cero botones que escriban). Proxy: daniel 243 sesiones/60 días, alberto 10.

**Cómo funciona por dentro.**
- **Una sola llamada**: `GET /api/dashboard/vista-general?mes=YYYY-MM` (`src/app/api/dashboard/vista-general/route.ts`), que adentro hace 9 lecturas en un `Promise.all`: RPC `ventas_dashboard_summary_v2`, `bancos_saldos`, RPC `inventario_valorizado_v1` (existe en producción, verificado 4-sep), `switch_estadocuenta_aging`, `switch_proveedor_estadocuenta`, `reclamos`, `egresos_*`, `ventas_rollup_mensual_mv`. Sin cascada en el cliente.
- La página es `src/app/vista-general/page.tsx` (+ 3 componentes por-empresa). `?mes=` persiste en URL (replace), se sanea, y el mes futuro se bloquea.
- ⚠️ Este módulo **SÍ suma gastos entre empresas** — deliberado, ver CLAUDE.md § Gastos.
- Cada tarjeta KPI es un link al módulo dueño del dato (la de CXC lleva a `/admin`).

**La tarea más frecuente, hoy.** «¿Cómo va el mes?» = entrar y leer, **1 paso**. Está bien.
La excepción: ver un mes viejo = **1 clic en ‹ por cada mes hacia atrás** (septiembre del año pasado = 12 clics).

**Sugerencias.**
1. **Elegir el mes de una lista** en vez de solo ‹ › · **Quién lo sufre:** Daniel cuando compara contra meses viejos · **Hoy:** 12 clics para ir un año atrás · **Después:** 2 (abrir lista → tocar mes) · **Ahorra:** segundos por consulta; vale por lo barato, no por lo grande · **Tamaño:** chico · **Riesgo:** ninguno (la URL `?mes=` ya existe).

**Lo raro que encontré.**
- El API manda ~15 campos que la pantalla **nunca pinta** (`ventas.byEmpresa`, `cxc.corriente`, `inventario.horas`, etc. — 0 usos en JSX, verificado con grep). Payload de más en cada carga.
- El esqueleto de carga dibuja un bloque «Equilibrio» que se retiró de la página el 11-ago-2026: al cargar aparece y desaparece una sección fantasma.
- `page.tsx:3` importa `useState` y no lo usa.
- El acordeón de Rentabilidad solo permite UNA empresa abierta a la vez — no se pueden comparar dos lado a lado.

---

## Ventas (`/ventas`, key `ventas`)

**Qué es y quién lo usa.** El tablero de ventas del grupo, **solo admin** (el servidor manda a `/home` a cualquier otro rol) = Daniel. Son **5 pestañas** (`?tab=`): Resumen (default) · Clientes · Productos · **Utilidad** · Comisiones. ⚠️ La pestaña «Referencia» ya no existe: es módulo propio `/referencia` desde el 12-ago-2026 (`?tab=referencia` redirige; sus 1.226 líneas de componentes siguen en `src/components/ventas/`, mal ubicadas pero vivas).

**Uso medido (al 4-sep-2026).** Las pestañas de lectura no son medibles. Las escrituras del módulo (todas en Comisiones): `comision_descuentos_fijos` **2 filas** (última 8-jul) · `comision_descuento_excepciones` **2** · las exclusiones y tasas se cargaron por migración, no por pantalla. O sea: se MIRA mucho (Daniel entra a diario), se ESCRIBE casi nunca.

**Cómo funciona por dentro.**
- SSR en `src/app/ventas/page.tsx` (82 líneas): un `Promise.all` de 6 (`fetchVentasResumen`, `fetchClientes`, `fetchMultifashion`, años, 2× `lineaDeRechazos`). El shell es `VentasShell.tsx` (470); cada vista es un chunk `dynamic ssr:false` que SWR siembra del servidor → **Resumen y Clientes abren con 0 llamadas**; Productos hace 2 en paralelo; Utilidad 1; Comisiones 1 (`/consolidado`, ya des-duplicado de 10 → 1).
- Fuentes por pestaña: Resumen → `ventas_dashboard_summary_v2` + `ventas_rollup_mensual_mv` + proyección `ventas_proyeccion_cierre_v7`; Clientes → `clientes_agregado_12m_vw` / `clientes_empresa_12m_vw`; Productos → RPCs `switch_top_descripciones*`; Utilidad → RPC `utilidad_por_cliente_v2`; Comisiones → RPC `comision_b2b_v8`. Invariantes de todo esto: CLAUDE.md § Ventas, Referencia y Comisiones.
- **Solo `?tab=` persiste en URL.** Año, empresa, período, sort: todo `useState` — recargar la página vuelve a los defaults.
- Componentes gigantes: `ProductosView` 1.305 líneas (19 `useState`) · `ResumenView` 1.118 + `ResumenViewMobile` 901 (dos árboles para la misma pestaña) · `ComisionesDetalleModal` 744 (~250 de layout de impresión).
- La pestaña Comisiones NO trae Configuración (tasas/exclusiones): eso vive solo en `/comisiones` › Configuración, **por decisión de Daniel** («configuración en dos lados» le molestó) — no proponer segunda puerta.

**La tarea más frecuente, hoy.** «¿Cómo vamos vs el año pasado?» = entrar, **1 paso** — el delta y la proyección ya están en pantalla. Excelente.
La cara: «¿qué compró tal cliente este año?» (Productos) = **6 pasos con 2 esperas encadenadas** (pestaña → empresa → período → cliente → esperar matriz → esperar comparativo).

**Sugerencias.**
1. **El botón Excel miente en Clientes** · **Quién:** Daniel al exportar el ranking de clientes · **Hoy:** en la pestaña Clientes, el botón «Excel» de la barra baja… el RESUMEN (`exportResumenToExcel` es el único cableado ahí); para tener los clientes en Excel no hay camino · **Después:** el botón exporta lo que estás mirando · **Ahorra:** evita el «bajé el archivo equivocado» y el copiar-pegar a mano · **Tamaño:** chico.
2. **Utilidad no tiene export** · **Quién:** Daniel · **Hoy:** es la única pestaña sin ningún Excel (oculta el botón global y no ofrece propio) · **Después:** botón Excel como el de Productos · **Ahorra:** el copiar a mano cuando quiere la lista de utilidad por cliente · **Tamaño:** chico.
3. **Productos: pedir todo de una** · **Quién:** Daniel · **Hoy:** elegir cliente dispara matriz → esperar → comparativo → esperar (cascada de 3 niveles) · **Después:** una sola llamada que traiga matriz + ventana previa juntas · **Ahorra:** 1-3 segundos por consulta, varias veces por sesión · **Tamaño:** mediano (tocar `/api/ventas/productos/por-cliente`) · **Riesgo:** ninguno de negocio; solo cablear bien la regla de «mismos días» que ya está en `productosRangoComparativo`.

**Lo raro que encontré.**
- **~208 líneas de API muertas**: `/api/ventas/v2` (124) + `/api/ventas/v2/status` (53) + `/api/ventas/años` (31, duplica `fetchAvailableYears`) — cero llamadores fuera de tests.
- `/ventas/reporte` es un stub de 7 líneas que redirige a `/ventas`.
- El SSR trae 5 RPCs de Multifashion (`fetchMultifashion`) para pintar **un solo indicador** de una fila del Resumen — y lo re-pide en cada cambio de año.
- Roles inconsistentes en las APIs: `resumen`/`clientes-12m` aceptan contabilidad, `productos`/`utilidad` solo admin — pero la página entera es admin-only, así que contabilidad tiene permisos de API sin ninguna puerta de UI.
- Cambiar el año borra búsqueda/sort en Clientes y Utilidad (tienen `key={year}`) pero no en Productos ni Comisiones — comportamiento distinto entre pestañas hermanas.

---

## Cuentas por Cobrar (`/admin`, key `cxc`)

**Qué es y quién lo usa.** La cartera del grupo (6 empresas) consolidada por cliente, con antigüedad, último pago, contacto y envío de estado de cuenta. Lo ven admin y vendedores (edwin se acota a Vistana en el servidor); las secretarias también entran por sus `modulos_override` — Angela mandó estados de cuenta desde aquí.

**Uso medido (al 4-sep-2026).** La cartera: **211 clientes, $3,68 M**; 120 con vencido crítico 121d+ ($1,25 M); 57 en 91-120. Las escrituras del módulo, casi todas MUERTAS:
- **Favoritos ★: 0 filas en toda la historia** (`cxc_favorites` vacía). Nadie marcó una estrella jamás.
- **«Marcar contactado»: 141 filas — 140 de marzo, 1 de abril, todas de admin.** La UI se retiró el 14-ago; el API quedó.
- **Contactos override (`cxc_client_overrides`): 10 filas, todas del 22-mar-2026.** Sin UI de escritura; el panel las sigue LEYENDO.
- **Correos enviados: 19 en total, en 2 días de julio** (daniel 5 el 9-jul, Angela 14 el 14-jul, todos ok). Desde entonces, cero.
En la práctica el módulo es de LECTURA: mirar la cartera y salir a cobrar por WhatsApp/teléfono fuera del sistema.

**Cómo funciona por dentro.**
- Corazón: `src/app/admin/page.tsx` (677) + `hooks/useAdminData.ts`. Datos: `/api/cxc/aging` → MV `switch_estadocuenta_aging_mv` (fallback a la vista en vivo) + re-lectura de `clientes_master` en lotes de 300 para email/teléfono. 6 llamadas en paralelo al cargar; expandir una fila = 0 llamadas (todo vino en el payload); «Últimos pagos ›» = 1.
- Consolida por `nombre_normalized` sumando las 6 empresas; saldos negativos van a «Saldo a favor» aparte. Invariantes Boston/grupo: CLAUDE.md § Boston y CXC.
- **Dos árboles de UI**: `ClientTable` (escritorio) y `PanelCxcMobile` (792 líneas) — el móvil reimplementa header, chips, buscador y select.
- El contacto que pinta el panel sale de DOS fuentes: `cxc_client_overrides` (congelada desde marzo) le GANA a `clientes_master` (vivo, lo edita la gente en `/clientes`).
- `?risk=` y `?empresa=` persisten en URL; el buscador NO (asimétrico con `/clientes`). Exports CSV/PDF solo admin+secretaria.

**La tarea más frecuente, hoy.** Revisar vencidos y contactar: entrar → píldora «Vencido» → fila del cliente → botón WhatsApp = **4 pasos**. Razonable. Corregir un teléfono visto desde aquí = **5 pasos y te saca del módulo** (expandir → «Ver ficha completa» → /clientes → Editar → Guardar).

**Sugerencias.**
1. **Una sola fuente de contacto** · **Quién:** quien manda el estado de cuenta (Daniel, Angela) · **Hoy:** el correo que propone el modal sale primero del override de marzo; si el cliente cambió de correo en `/clientes`, el CXC sigue ofreciendo el viejo. Medido: de las 10 filas override, 6 coinciden con el maestro, 3 solo existen ahí (MAZAR CITY SHOES, LUTY LUI y una vacía) · **Después:** migrar esos 3 correos a la ficha del cliente y que el CXC lea SOLO `clientes_master` · **Ahorra:** más corrección que tiempo — evita un estado de cuenta al correo equivocado · **Tamaño:** chico · **Riesgo:** ninguno; la capa override no tiene escritor desde el 22-mar.
2. **Editar el contacto sin salir del CXC** · **Quién:** los mismos · **Hoy:** 5 pasos + cambio de módulo · **Después:** lápiz en el panel expandido que guarde en la ficha (`PATCH /api/clientes/[codigo]`, ya existe) = 3 pasos sin salir · **Ahorra:** ~30 s por corrección · **Tamaño:** chico · **Riesgo:** respeta que el sync no pisa esos campos (ya es así).
3. **Retirar del código lo que nadie usó** (★ favoritos con 0 filas históricas, APIs `contact-log`/`overrides` sin UI, menú click-derecho de 1 opción) · **Quién:** nadie lo sufre hoy — es deuda, no fricción · **Ahorra:** tiempo de mantenimiento futuro, no de usuarios · **Tamaño:** chico. Va última a propósito.

**Lo raro que encontré.**
- `useSmartSuggestions` se llama con un array vacío constante — solo para mantener el orden de hooks.
- El botón «Importar archivo de cartera» está oculto, pero `/upload` sigue accesible por URL (el flujo CSV murió en jun-2026).
- La lista pinta los 211 clientes de golpe, sin paginar (aguanta porque son 211; vigilar si la cartera crece).
- `GET /api/cxc/aging-por-cliente` no lo usa el CXC: lo usa el hover de Ventas › Clientes.

---

## Clientes (`/clientes`, key `directorio`)

**Qué es y quién lo usa.** El directorio del grupo: lista con compras del año y ficha por cliente (datos fiscales de Switch + contacto editable + historial por empresa + últimas guías). Admin, secretarias, vendedores; bodega solo vía búsqueda global.

**Uso medido (al 4-sep-2026).** **150 clientes vivos**; 119 con algún contacto cargado; **solo 2 con notas**. La única escritura (editar teléfono/celular/email/notas) no es medible por separado: el sync diario pisa `updated_at` de todas las filas. La libreta manual vieja (`directorio_clientes`) quedó congelada: 33 contactos, **última alta 28-may-2026**.

**Cómo funciona por dentro.**
- Lista: SSR con caché de 60 s (`leerClientesDelGrupo()` = `clientes_master` + puente `switch_clientes`, filtrado en TypeScript), paginación real de 50, `?search=&provincia=&page=` en URL. Compras del año por `/api/clientes/ytd`.
- Ficha `[codigo]`: SSR con 5 lecturas en paralelo (maestro, RPC `cliente_ficha_ventas`, aging, `switch_recibos` YTD, guías). 0 fetches de cliente al abrir. **La ficha contesta 404 para códigos de Boston** — invariante, CLAUDE.md § Boston y CXC.
- Escritura: `PATCH /api/clientes/[codigo]`, whitelist `telefono/celular/email/notas`, solo admin+secretaria; el sync nunca pisa esos campos.
- `directorio_clientes` (la tabla vieja) la siguen LEYENDO la búsqueda global, Recordatorios y el buscador de clientes del catálogo — pero sus rutas CRUD (`/api/directorio*`) no tienen ni una pantalla que las llame: no hay forma de dar de alta un contacto manual desde la UI.

**La tarea más frecuente, hoy.** Buscar un cliente y ver su ficha = **3 pasos** (entrar → teclear → clic). Editar su contacto = +2 (Editar → Guardar). Está bien armado.

**Sugerencias.**
1. La misma nº 1 del CXC (una sola fuente de contacto) — el trabajo es compartido entre los dos módulos.
Fuera de eso, **nada que proponer**: la lista pagina, la ficha carga en paralelo, los filtros persisten en URL. Es de los módulos mejor terminados del grupo.

**Lo raro que encontré.**
- **Dos directorios conviven**: `clientes_master` (el real, 150) y `directorio_clientes` (33, congelado desde mayo, sin UI de alta pero leído por 3 pantallas). Decisión pendiente: ¿se migran esos 33 contactos al maestro y se retira, o se le devuelve una UI? Hoy es un limbo.
- Las **notas** solo se ven abriendo la ficha — no aparecen ni en la lista ni en el CXC. Con 2 notas en producción no urge, pero explica por qué nadie las usa.
- `interface SessionPayload` duplicada en `clientes/page.tsx` y `[codigo]/page.tsx`.

---

## Proveedores (`/proveedores`, key `proveedores`)

**Qué es y quién lo usa.** Cuánto le debemos a cada proveedor, por empresa y por antigüedad, con ficha por proveedor y sus reclamos vinculados. Admin + Contabilidad (50 sesiones/60 días). 100 % lectura salvo el botón «Actualizar ahora».

**Uso medido (al 4-sep-2026).** **65 proveedores** con cuenta, **$5,10 M por pagar**; el sync (cron 09:30) corrió hoy en las 7 empresas. No hay ninguna escritura de usuario que medir — el módulo no edita nada.

**Cómo funciona por dentro.**
- Todo sale de `switch_proveedor_estadocuenta` (snapshot que el sync reconstruye con **DELETE real** — sin soft delete, ver CLAUDE.md § Dónde vive cada dato). Lista: `GET /api/proveedores` agrupa en JS; ficha: `GET /api/proveedores/[key]` + reclamos filtrados por nombre normalizado en JS.
- `?empresa=` persiste en URL + localStorage; la búsqueda `q` se siembra de la URL pero no se escribe de vuelta.
- Export Excel con import dinámico (evita 310 kB en el arranque). La ficha no exporta.
- El botón «Actualizar ahora» de la lista dispara el sync de las 7 empresas en secuencia (~1 min).

**La tarea más frecuente, hoy.** «¿Cuánto le debo a X y qué tan vencido?» = entrar → buscar → clic → leer ficha = **4 pasos**. Correcto para 65 proveedores.

**Sugerencias.** **Nada que proponer** en eficiencia: es un módulo chico, de lectura, con la tarea principal en 4 pasos y un universo de 65 filas. Lo que hay son arreglos de corrección (abajo), no de tiempo.

**Lo raro que encontré.**
- **El Excel no cuadra con la pantalla**: exporta TODOS los proveedores (incluidos los «sin saldo» colapsados) mientras el rótulo de arriba cuenta solo los con saldo — quien cuadre contra el archivo ve más filas que en pantalla.
- **La ficha muestra `american_classic` crudo** en vez de «Multifashion»: usa `getCompanyDisplay`, que no conoce esa key; la lista ya lo resuelve con su propio mapa.
- **Doble carga al montar**: si hay empresa recordada en localStorage y la URL no trae `?empresa=`, se disparan 2 llamadas (Todas + filtrada).
- Cada tecla del buscador relee la tabla completa del servidor (inofensivo con 65 filas; sería problema si crece).
- `ROLES_SYNC_PROVEEDORES` incluye a secretaria, que no puede entrar al módulo — permiso inalcanzable.

---

## Resumen del lote

| Módulo | Estado | Lo más valioso |
|---|---|---|
| Vista General | Sano, 1 llamada, bien paralelo | Selector de mes (chico) |
| Ventas | Sano de datos; fricción en exports y Productos | Excel honesto en Clientes · export en Utilidad · Productos sin cascada |
| CXC | Lectura sana; TODA la capa de escritura está muerta desde marzo–julio | Una sola fuente de contacto · editar sin salir |
| Clientes | El mejor terminado del grupo | Nada (solo la unificación compartida) |
| Proveedores | Sano; solo bugs menores | Nada en eficiencia |

**El patrón del grupo:** son módulos de MIRAR. Las funciones de escribir que se les agregaron (favoritos, marcar contactado, overrides de contacto, la libreta manual) murieron todas en 2-8 semanas — la gente cobra y anota FUERA del sistema. Antes de agregar otra función de registro aquí, ese dato es la advertencia.
