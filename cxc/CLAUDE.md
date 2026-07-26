# Fashion Group — fashiongr.com

## Stack
- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (project: rspocgqhtpveytgbtler), PostgreSQL
- **Hosting:** Vercel
- **Styling:** Tailwind CSS
- **Email:** Resend API
- **PDF:** jsPDF + jspdf-autotable
- **Excel:** xlsx-js-style

## Empresas del grupo
Vistana International, Fashion Wear, Fashion Shoes, Active Shoes, Active Wear, Joystep, Confecciones Boston, Multifashion

## Roles
| Rol | DB value | Acceso |
|-----|----------|--------|
| Admin | `admin` | Todo |
| Secretaria | `secretaria` | upload, guias, caja, reclamos, cheques, directorio, marketing, comisiones, packing-lists, catálogos, KPIs dashboard |
| Bodega | `bodega` | guias (despacho), packing-lists, catálogos, búsqueda global (guías+directorio). Auto-redirect a Guías desde home (único módulo). Nota: directorio aparece solo en la búsqueda global, NO como módulo navegable |
| Contabilidad | `contabilidad` | prestamos, proveedores, ventas, búsqueda global (ventas+prestamos). En API directorio solo lectura (GET), no edición |
| Vendedor | `vendedor` | catálogos (reebok), CXC, directorio, guías (solo lectura), búsqueda global (CXC+directorio) |
| Gerente ACS | `gerente_acs` | SOLO Multifashion (/multifashion + /api/multifashion/*). Auto-redirect a Multifashion desde home (único módulo). Módulos vía `role_permissions` |

> Roles reales del sistema = los 6 de arriba (`src/lib/modules.ts` → `SYSTEM_ROLES`). No existen roles `director` ni `cliente` (el catálogo Reebok es público, sin login).

## Módulos (src/lib/modules.ts)
Fuente única de navegación + permisos de UI. **3 grupos** (rediseño del home, jul-2026):
- **Ventas y clientes:** Vista General, Ventas, CXC (`/admin`), Multifashion, Clientes/Directorio (`/clientes`), Proveedores, Catálogos (Reebok, Joybees, Tommy Hilfiger — las 3 marcas ENCENDIDAS: tarjeta en el hub /catalogos/marcas, catálogo público compartible /catalogo-publico/tommy y pedido público /pedido-tommy/[id] accesibles sin sesión, cron tommy-catalogo bajo vigilancia estricta)
- **Operación:** Guías de Despacho, Packing Lists, Reclamos, Depurador (`/productos/cargar`), Comisiones, Marketing, Caja Menuda, Gastos de Empresa, Préstamos, Cheques
- **Administración:** Usuarios, Data Health

> Las fichas del home y del sidebar NO llevan subtítulo (auditoría de textos, #278): el campo `subtitle` se eliminó de `AppModule`.
> Páginas de grupo: `/g/[grupo]` con los 3 slugs nuevos. Los slugs viejos redirigen en `next.config.js` (`/g/sistema` → `/g/administracion`; `/g/plata-entra`, `/g/plata-sale`, `/g/productos` → `/home`).

## Guías — máquina de estados
- Estado en `guia_transporte.estado` (TEXT, **sin CHECK constraint** — valores válidos por convención de código).
- Flujo: **Pendiente Bodega** (default al crear) → **Completada** (al despachar; exige receptor, cédula, placa, ≥1 bulto y firmas; queda **bloqueada** para edición) → **Rechazada** (solo desde Completada, con `motivo_rechazo`).

## Auth
- Passwords: bcrypt hashed (migración de plaintext completada — todos los usuarios en bcrypt; el login exige bcrypt y rechaza cualquier password no-hasheada)
- Session: httpOnly cookie `cxc_session`, base64url-encoded JSON `{role, userId, userName, sessionToken}`
- Middleware: `src/middleware.ts` valida sesión contra `user_sessions` table
- Session health check: `/api/auth/check` — pinged cada 2 min, warning banner antes de expirar
- API auth: `src/lib/requireRole.ts` — admin siempre pasa, verifica rol contra array
- Rate limiting: login en Supabase (tabla `login_attempts` + RPC `register_login_failure`/`clear_login_attempts`), por IP — 5 fallos en ventana de 15 min → lockout 15 min (`src/lib/login-rate-limit.ts`, fail-open). Reemplazó el Map en-memoria (inefectivo en serverless)
- Login case-insensitive: contraseñas no distinguen mayúsculas/minúsculas (autocapitalizar iPhone)
- Input login: autoCapitalize=none, autoCorrect=off
- User indicator: nombre + rol visible en header desktop y drawer mobile
- Forgot password: link en login → "Contacta al administrador"

## Base de datos
- **Tablas grandes:** cxc_rows (~50K), switch_facturas (historia 2022+, fuente única de ventas), ventas_raw (~100K, congelada — solo la lee costo)
- **Soft delete (`deleted` boolean), por módulo:**
  - Caja: `caja_gastos` (+ `deleted_by`, `deleted_at`), `caja_periodos`
  - Préstamos: `prestamos_empleados`, `prestamos_movimientos`
  - Reclamos: `reclamos`, `reclamo_items`, `reclamo_settlements`
  - Cheques: `cheques`
  - Guías: `guia_transporte`, `guia_items`
  - Directorio: `directorio_clientes`, `clientes_master`
  - Nota: `packing_lists` usa `deleted_at` (timestamp), NO la columna `deleted` — patrón distinto.
- **Vistas / Materialized views:** Convención de nombres: sufijo `_mv` = materialized view, `_vw` = view. (No verificado contra catálogo pg — vía REST no se distingue MV de view; confirmar con acceso a catálogo si se necesita certeza.)
  - `ventas_rollup_mensual_mv` (única `_mv`), `clientes_agregado_12m_vw`, `clientes_empresa_12m_vw`, `reebok_pedidos_unificado_vw`, `switch_costo_unificado_vw`, `switch_ventas_netas_vw`, `switch_ventas_unificado_vw`, `_multifashion_sf_vw`
- **Flags de negocio:**
  - `is_wholesale`: en `ventas_raw`, `switch_facturas` y `_multifashion_sf_vw` (segrega retail/wholesale en Multifashion)
  - `is_preorder`: en `reebok_order_items` (preventa Reebok)
- **Tablas UX audit (abril 2026):**
  - `cxc_favorites` — favoritos ⭐ por usuario (antes localStorage)
  - `reclamo_custom_motivos` — motivos personalizados de reclamos (antes localStorage)
  - `reebok_orders.client_email` — email del cliente capturado al crear pedido

## Switch Soft (ERP externo)
- CSVs semicolon-delimited (`;`)
- Encoding: **latin-1** para inventario Reebok, **UTF-8** para CXC y Ventas
- Upload: 100% manual (drag-drop), no hay API/SFTP
- Auto-detect delimiter en CXC upload (`;` o `,`)
- Upload de ventas muestra resumen de filas excluidas con razón

## Email (Resend)
- `noreply@fashiongr.com` — cheques reminders
- `notificaciones@fashiongr.com` — alertas, reports, guias, reebok
- `info@fashiongr.com` — reclamos a proveedores
- `pedidos@fashiongr.com` — guias notify

## Crons (vercel.json)
47 entradas configuradas (cada entrada corre 1×/día por restricción del plan Hobby; sub-diario = varias entradas del mismo path, ver nota; límite Hobby: 100 cron jobs/proyecto):

| Cron | Schedule (UTC) |
|------|----------------|
| /api/cron/cleanup-packing-lists | 03:00 |
| /api/cron/multifashion-sync | 05:00 |
| /api/cron/switch-sync tipo=all (vistana, active_wear) | 05:30 |
| /api/cron/switch-sync tipo=all (fashion_shoes, fashion_wear) | 05:35 |
| /api/cron/switch-sync tipo=all (active_shoes, joystep) | 05:40 |
| /api/cron/backup | 06:00, 10:30, 18:30 (3 entradas — las 2ª/3ª son "segunda oportunidad": no-op si una anterior ya registró success hoy) |
| /api/cron/backup?grupo=switch | 06:45, 11:15, 19:15 (3 entradas, mismo guard no-op) |
| /api/cron/backup?grupo=storage | 04:00, 15:30 (2 entradas — réplica off-site de los buckets de Storage a Cloudflare R2) |

> **Backup — estructura en R2 y completitud (jul-2026):** los 3 grupos escriben en el MISMO esquema: `data/YYYY-MM-DD/<tabla>.ndjson.gz` + `data/YYYY-MM-DD/meta.json` (core, 49 datasets), `data/YYYY-MM-DD/meta-switch.json` (switch, 8), y `_storage/<bucket>/<path>` con path ESTABLE (binarios inmutables — versionarlos por fecha multiplicaría 198 MB/día sin ganar nada). El `manifest.json` de la raíz NO es dedup entre días: las keys llevan la fecha, así que solo evita repetir trabajo dentro del mismo día (2ª/3ª entrada, pendientes por deadline).
> Una carpeta de fecha necesita **los DOS metas** para ser restaurable. `scripts/restore.mjs --list` valida eso y marca `OK / PARCIAL / DAÑADO / INSERVIBLE` (antes listaba las carpetas a secas: el 25-jul mostraba `2026-07-25` como disponible y el restore moría con 404 en meta.json). La corrida core evalúa AYER y alerta por Telegram (`backup_r2_incompleto`) si quedó a medias. Retención R2: `RETENCION_R2` = 21 diarios + 8 lunes + 24 días-1, **solo informe** (no borra nada en R2 todavía).
| /api/cron/switch-sync tipo=all (american_classic, confecciones_boston) | 06:30 |
| /api/cron/sync-utilidad | 07:00 |
| /api/cron/sync-clientes-master | 07:00 |
| /api/cron/refresh-clientes-views | 07:35 (fuera del minuto 06:30 de switch-sync AC/Boston y de la ráfaga 07:00-07:31 — solo DB, sin Switch) |
| /api/cron/sync-recibos | 07:50, 20:10, 22:20 (3 entradas) |
| /api/cron/switch-articulos | 08:40 |
| /api/cron/acs-fidelizacion | 11:30, 16:30 (2 entradas — la 2ª es "segunda oportunidad": no-op si la 1ª ya registró success hoy; 11:30 esquiva sync-recibos 07:50 y switch-articulos 08:40 en american_classic) |
| /api/cron/reebok-catalogo | 12:10, 17:00 (2 entradas — solo toca active_shoes en Switch; 12:10 esquiva sync-utilidad 07:00 en active_shoes) |
| /api/cron/sync-proveedores | 09:30 |
| /api/cron/joybees-catalogo | 11:00, 17:05 (2 entradas — solo toca joystep en Switch) |
| /api/cron/tommy-catalogo | 12:40, 17:40 (2 entradas — solo toca fashion_shoes; artículos marcaId=3; mientras la DDL 20260724150000 no corra se omite limpio sin tocar Switch) |
| /api/cron/integrity-check | 12:00 |
| /api/cron/cheques-alert | 13:00 |
| /api/cron/switch-reconciliacion | 10:00, 14:00, 18:00 (3 entradas) |
| /api/cron/switch-sync tipo=facturas (american_classic) | 15:00, 23:15, 00:15 (3 entradas — ventas ACS intradía; 00:15 = sync de cierre, tras cerrar tienda 7pm Panamá) |
| /api/cron/acs-resumen-diario | 01:00 (resumen diario ventas ACS a Telegram; 20:00 Panamá = 8pm, tras el sync de cierre de 00:15) |
| /api/cron/grupo-resumen-mensual | 13:00 el día 3 de cada mes (`0 13 3 * *` — resumen mensual del grupo a Telegram; único cron NO diario, umbral propio en health-crons) |
| /api/cron/switch-sync tipo=estadocuenta (3 pares B2B) | 16:00/16:05/16:10 y 21:10/21:15/21:20 (6 entradas — CXC intradía; ronda 1 con active_shoes,joystep PRIMERO para dar 60 min a reebok-catalogo 17:00) |

> **Plan Vercel Hobby:** cada entrada de cron corre 1×/día y las funciones tienen tope `maxDuration` 300s. Para frecuencia sub-diaria se agregan entradas separadas del mismo path (patrón `switch-reconciliacion`).
>
> **Heartbeats por-slot de switch-sync:** cada entrada de switch-sync lleva `&slot=<tipo>-<hhmm>` (hhmm = hora UTC de su schedule, ej. `estadocuenta-2110`) y registra un heartbeat granular `switch-sync:<slot>` además del base. Los slots se DERIVAN de `SWITCH_CRON_ENTRADAS` (src/lib/cron-telemetry.ts) — fuente única: al agregar/mover una entrada de switch-sync se actualiza vercel.json y esa constante, y un test compara ambas. health-crons NO alerta por filas de slot que aún no existen (se siembran solas en <24h).
>
> **Slots huérfanos (jul-2026):** si Vercel pierde la invocación de un slot pero sus pares quedan al día (recuperación de la reconciliación u otra entrada que cubre los mismos pares), `switch-reconciliacion` escribe la marca `switch-sync:<slot>#recuperado` y health-crons deja de contarlo como caído (`slotsCubiertos[]`, 200). La marca NUNCA pisa el heartbeat propio del slot: si la entrada lleva >50h (2 ocurrencias) sin correr de verdad, vuelve a reportarse. Un slot que corrió y FALLÓ tampoco se cubre.
>
> **Slots INTRADÍA — el ancla es la OCURRENCIA, no el día (jul-2026):** la reconciliación recupera por PAR (empresa, sync_type) contra el día Panamá. Para un cron diario eso alcanza; para uno intradía cuyo trabajo es "refrescar otra vez lo mismo", NO: el par ya tiene el success de la mañana. `clasificarSlots()` (src/lib/cron-telemetry.ts) pregunta lo correcto —"¿hay un success POSTERIOR a MI ocurrencia?"— y devuelve `cubiertos` (marca `#recuperado`) y `desatendidos`. Los `desatendidos` se **re-ejecutan** en la misma pasada, sumados al mapa por empresa (sesión única, un solo token). `motivo`:
> - `sin-invocacion` — Vercel perdió la corrida. Solo se declara cuando venció la ventana de jitter (`SLOT_RUN_WINDOW_MIN`=120 min): no adelantarse a una entrada que puede llegar tarde.
> - `corrio-y-fallo` — la entrada llegó y dejó el trabajo a medias. NO espera la ventana (la única pasada de reconciliación tras la ronda de 16:0x es la de 18:00, que cae dentro de sus 120 min) y se **reporta** vía `alertSwitchCronErrors` con la política anti-ruido 401 intacta (un `statement timeout` no es silenciable → alerta ya). Dedup: si el propio route de switch-sync ya dejó rastro en `cron_email_errors` posterior a la ocurrencia, no se duplica.
>
> Guarda de concurrencia: una fila `running` más joven que `RUNNING_STALE_MIN` (30 min) congela el slot — no se re-ejecuta encima de una corrida viva. En un día sano el barrido es un **no-op total** (cero llamadas a Switch).
>
> **Gracia de siembra acotada (jul-2026):** "fila de slot ausente = todavía no sembrada" ya no es eterno. La reconciliación escribe una vez la marca `switch-sync:<slot>#visto` (insert-if-absent) para los slots sin heartbeat propio; pasadas `SLOT_SEED_GRACE_HOURS` (50h) la ausencia se reporta como caído en health-crons y en el watchdog Telegram. Sin esto, `switch-sync:all-0540` llevaba desde el 23-jul sin fila propia (corrió y falló el 24, invocación perdida el 25) y era invisible para AMBOS vigías. Las marcas `#recuperado`/`#visto` no se vigilan como crons (`esMarcaDeSlot`).
>
> **Regla de espaciado (sesión única Switch por empresa):** crons que tocan la MISMA empresa en Switch van ≥50 min separados (un 2do login mata el token del 1ro → code 0006). Crons de empresas disjuntas pueden ir a 5 min (patrón 05:30/05:35/05:40). Ojo: `sync-recibos` toca las 5 B2B + american_classic → las entradas intradía de ACS (15:00/23:15) y de estadocuenta esquivan sus corridas de 20:10/22:20 y la reconciliación de 14:00/18:00.

## PWA (iOS)
- `viewport-fit: cover` + `env(safe-area-inset-top/bottom)` para notch/Dynamic Island
- `apple-mobile-web-app-status-bar-style: black`
- Standalone mode, start_url: `/home`
- Service worker MÍNIMO (Serwist, `src/app/sw.ts`) — la app es SIEMPRE online (Modo Viaje / lectura offline ELIMINADO jul 2026, nunca se usó). Solo cachea assets inmutables (`/_next/static` CacheFirst, imágenes/fuentes SWR); navegación y APIs van directo a la red (sin handler). Sin precache del app shell.
  - **`matchOptions: { ignoreSearch: true }` en la estrategia de `/_next/static`** — obligatorio mientras `next.config.js` defina `deploymentId` (Skew Protection de Vercel Pro): Next estampa `?dpl=<id>` en cada asset y ese query cambia en CADA deploy, así que sin esto los chunks cuyo contenido no cambió se re-descargan tras cada promoción. Es seguro porque el nombre del archivo lleva el hash del contenido. El fetch a la red (en un MISS) conserva la URL con `?dpl=`, así que el ruteo de Skew Protection no se toca. Candado en `src/__tests__/lib/sw-static-cache-dpl.test.ts`.
- Actualización automática y SILENCIOSA: `skipWaiting`+`clientsClaim` en sw.ts + `SWUpdater` (`src/components/SWUpdater.tsx`, registra el SW; `next.config` con `register:false`) → al haber build nuevo, swap + reload inmediato SIN UI de versión, con guard de formulario sucio (si hay un input con foco y contenido, difiere hasta blur/submit/ocultar app) y guard anti-loop en sessionStorage.
- Recovery una-sola-vez: ChunkLoadError / import dinámico fallido tras un deploy → `src/lib/chunk-recovery.ts` (listeners globales en SWUpdater + `error.tsx`/`global-error.tsx` raíz). Guard sessionStorage `fg_chunk_recovery` (1/min); si se repite, error boundary visible "Algo salió mal" con botón Recargar.
- Roles con 1 solo módulo auto-redirigen desde home (ej: Bodega → Guías)
- Sin bottom tab bar — navegación por módulos del home + drawer del header

## Design System
- **Direction:** Precision & Density + Apple-grade fluidity
- **Buttons:** `rounded-md`, `bg-black text-white`, `active:scale-[0.97]` tap feedback
- **Cards:** `rounded-lg`, `border border-gray-200`, no shadows
- **Tables:** sticky headers, `tabular-nums`, ScrollableTable con gradient indicators, SwipeableRow en mobile
- **Modals:** ConfirmModal (normal), ConfirmDeleteModal (destructivo, 1s delay), BottomSheet (mobile)
- **Spacing:** 4px base, py-6 containers, mb-4 sections, p-3 cards
- **Depth:** borders-only (no shadows en cards/modules)
- **Module colors:** CXC=blue, Guías=emerald, Cheques=amber, Reclamos=orange, Caja=violet, Directorio=cyan, Préstamos=rose, Ventas=indigo, Reebok=red (2px accent en header)
- **Animations:** AccordionContent (CSS grid 250ms), page transitions (slide-right/left/crossfade 180ms), KPI count-up, deposit flash, saldo shake, new row highlight

## UX Principles
- Usuarios: secretarias, bodegueros, vendedores en Panamá. NO tech-savvy.
- Labels en español simple. Cero jerga (CXC → "Cuentas por Cobrar")
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

## Keyboard Shortcuts (Desktop)
- `/` o `⌘K` — buscar
- `?` — mostrar ayuda de atajos
- `G+H` — ir a inicio, `G+C` — CXC, `G+G` — guías, `G+Q` — cheques, `G+R` — reclamos
- `J/K` — navegar filas, `Enter/Space` — expandir, `E` — editar, `Escape` — cerrar
- Right-click en filas de CXC y Cheques → context menu con acciones

## Smart Features
- **Búsqueda global:** 8 módulos (CXC, Reclamos, Guías, Directorio, Cheques, Ventas, Préstamos, Caja)
- **Spotlight:** "cheques que vencen mañana" → ⚡ quick action con deep link
- **Búsquedas recientes:** últimas 5 + "Ir a..." shortcuts de módulos
- **Smart defaults:** recuerda última categoría, empresa, banco, transportista (localStorage `fg_last_*`)
- **Smart suggestions:** 💡 proactivas inline (contactar cliente $10K+, depositar vencidos, escalar reclamo +45d, cerrar período +30d)
- **Dashboard feed:** "Acciones pendientes" con 8 fuentes de datos ordenadas por urgencia
- **Daily summary:** resumen matutino 1x/día con bullets accionables
- **Draft auto-save:** formularios de reclamos, guías, cheques se guardan cada 5s en localStorage
- **Time grouping:** cheques y guías agrupados por "Hoy/Esta semana/Vencidos"- **Contextual color:** tinte rojo/ámbar ambient cuando hay datos urgentes
- **Inline previews:** último contacto, días para depósito, próxima deducción visibles sin expandir
- **Hover preview:** cards ricas en CXC al hover 500ms sobre nombre de cliente
- **URL state:** filtros persisten en URL (?risk=vencido&empresa=fashion_wear) — deep links y back/forward funcionan
- **UI persistence:** filas expandidas y scroll position sobreviven navegación (sessionStorage)
- **Offline:** banner "Sin conexión" (informativo) + botones deshabilitados sin red. NO hay lectura offline: el Modo Viaje (snapshots localStorage + cache de páginas del SW) se eliminó en jul 2026

## Exports
- Todos los PDFs tienen logo Fashion Group (src/lib/pdf-logo.ts, base64)
- Reebok PDFs/emails tienen logo Reebok (src/lib/reebok-logo.ts, base64)
- Fechas display: "5 abr 2026" (fmtDate en src/lib/format.ts)
- Moneda: `$#,##0.00` en Excel (números reales, no texto)
- Nombres de archivo con fecha: `Pedido-RBK001-2026-04-05.pdf`

## Shared Components (src/components/)
- **AppHeader** — sticky header con module color accent, user info, search, notifications, shortcuts
- **SearchBar** — ⌘K + mobile full-screen + recientes + spotlight NLP
- **MobileBottomBar** — ELIMINADO (abril 2026). Navegación es solo por módulos del home + drawer del header
- **NotificationCenter** — 🔔 bell con historial de toasts
- **SessionWarning** — banner/modal antes de expirar sesión
- **OfflineBanner** — amber offline, green reconexión
- **KeyboardShortcutsProvider** — global shortcuts + table navigation
- **ContextMenuWrapper** — right-click menus en desktop
- **UndoToast** — countdown bar 5s con "Deshacer"
- **SuggestionCard** — 💡 sugerencias proactivas inline
- **TimeGroupHeader** — headers colapsables por período de tiempo- **OverflowMenu** — "···" dropdown para acciones secundarias
- **ScrollableTable** — gradient indicators para scroll horizontal
- **SwipeableRow** — swipe-to-action en mobile
- **PullToRefresh** — pull down para refrescar en mobile
- **BottomSheet** — half/full screen draggable (mobile)
- **AccordionContent** — CSS grid expand/collapse animado
- **AnimatedNumber** — count-up con easing
## Hooks (src/lib/hooks/)
- **useAuth** — check role, user info
- **useBadges** — notification badge counts
- **useSessionCheck** — ping /api/auth/check cada 2 min
- **useKeyboardShortcuts** — global + table shortcuts
- **useUrlState** — sync state ↔ URL params
- **useLastUsed** — remember last form values
- **useDraftAutoSave** — auto-save formularios cada 5s
- **usePersistedState** — sessionStorage-backed state
- **useUndoAction** — delayed execution con 5s undo window
- **useSmartSuggestions** — proactive inline suggestions
- **useOnlineStatus** — offline/online detection
- **useTableShortcuts** — J/K row navigation context

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

### Cheques (April 10-11)
- Guided rebotado → re-depositar flow

### Préstamos (April 10-11)
- Visual status badges + filter tabs + batch undo

### Camisetas — módulo eliminado por completo en #35 (jun 2026)

### Ventas (April 10-11)
- View preference saved to localStorage

### Upload (April 10-11)
- 3-step progress indicator

### Directorio (April 10-11)
- Chevron icons on expandable rows

### Infrastructure (April 10-11)
- 165 rutas API; 150 con `export const dynamic = 'force-dynamic'`
- Sentry monitoring added
- Backup cron exists
- 20 tests (vitest)
- Password min 3 chars, no double-hash on edit
- Dead code cleaned: ChatPanel, MobileBottomBar, LoadingScreen, KeyboardShortcutsProvider, SessionWarning, old Reebok auth
- console.logs cleaned from production

### Attempted & Reverted
- Face ID (WebAuthn): implemented and removed — too unstable on serverless (DER/P1363 format issues, challenge storage in memory)
- Trading bot dashboard: added and removed — localhost IBKR gateway not accessible from Vercel

## Testing
```bash
npm test          # Vitest — 20 tests, run before pushing
npx next build    # Build check — must pass before push
```

## Deploy
```bash
git push origin main   # Auto-deploy via Vercel
```


## Regla de Calidad
- Todo código debe funcionar a la primera. No pushear sin verificar el flujo completo end-to-end.
- Verificar: datos fluyen escritura → DB → lectura → UI
- Auth en serverless: usar tokens HMAC firmados, NO Maps en memoria
- No hacer fire-and-forget (.then().catch()) para operaciones críticas — siempre await
- useState en useEffect como dependencia puede causar re-renders destructivos — usar useRef para estado interno
- Verificar compatibilidad de formatos antes de integrar (PNG/JPEG en jsPDF, DER/P1363 en WebAuthn)
- Si no puedo probar en browser, simular el flujo con script
