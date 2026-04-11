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
| Secretaria | `secretaria` | upload, guias, caja, reclamos, cheques, directorio, KPIs dashboard |
| Bodega | `bodega` | guias (despacho), directorio, búsqueda global (guías+directorio). Auto-redirect a Guías desde home (único módulo) |
| Director | `director` | Todo (lectura), ventas, CXC |
| Contabilidad | `contabilidad` | prestamos, ventas, búsqueda global (ventas+prestamos) |
| Vendedor | `vendedor` | reebok, CXC, directorio, búsqueda global (CXC+directorio) |
| Cliente | `cliente` | catalogo reebok (solo propio) |

## Auth
- Passwords: bcrypt hashed (migración de plaintext completada parcialmente)
- Session: httpOnly cookie `cxc_session`, base64url-encoded JSON `{role, userId, userName, sessionToken}`
- Middleware: `src/middleware.ts` valida sesión contra `user_sessions` table
- Session health check: `/api/auth/check` — pinged cada 2 min, warning banner antes de expirar
- API auth: `src/lib/requireRole.ts` — admin siempre pasa, verifica rol contra array
- Rate limiting: 5 intentos/min/IP en login (in-memory)
- Login case-insensitive: contraseñas no distinguen mayúsculas/minúsculas (autocapitalizar iPhone)
- Input login: autoCapitalize=none, autoCorrect=off
- User indicator: nombre + rol visible en header desktop y drawer mobile
- Forgot password: link en login → "Contacta al administrador"

## Base de datos
- **Tablas grandes:** cxc_rows (~50K), ventas_raw (~100K)
- **Soft delete:** `deleted` boolean en: reclamos, cheques, guias, prestamos, caja, directorio
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
| Cron | Schedule | Descripción |
|------|----------|-------------|
| /api/cron/cheques | 13:00 UTC diario | Marca vencidos + emails individuales |
| /api/cron/cheques-alert | 13:00 UTC diario | Email resumen agregado |
| /api/cron/weekly-report | 14:00 UTC lunes | Resumen semanal a daniel@ |
| /api/cron/monthly-report | 14:00 UTC día 1 | Resumen mensual a daniel@ |
| /api/cron/backup | 06:00 UTC diario | Backup |

## PWA (iOS)
- `viewport-fit: cover` + `env(safe-area-inset-top/bottom)` para notch/Dynamic Island
- `apple-mobile-web-app-status-bar-style: black`
- Standalone mode, start_url: `/home`
- Sin service worker (desregistrado en layout)
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
- **Time grouping:** cheques y guías agrupados por "Hoy/Esta semana/Vencidos"
- **Relative time:** SmartDate muestra "hace 2 horas", "ayer" con hover para fecha completa
- **Contextual color:** tinte rojo/ámbar ambient cuando hay datos urgentes
- **Inline previews:** último contacto, días para depósito, próxima deducción visibles sin expandir
- **Hover preview:** cards ricas en CXC al hover 500ms sobre nombre de cliente
- **URL state:** filtros persisten en URL (?risk=vencido&empresa=fashion_wear) — deep links y back/forward funcionan
- **UI persistence:** filas expandidas y scroll position sobreviven navegación (sessionStorage)
- **Offline:** banner "Sin conexión", cache 30min en dashboard/cheques, botones deshabilitados

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
- **TimeGroupHeader** — headers colapsables por período de tiempo
- **HoverPreview** — cards ricas en hover 500ms (desktop)
- **OverflowMenu** — "···" dropdown para acciones secundarias
- **ScrollableTable** — gradient indicators para scroll horizontal
- **SwipeableRow** — swipe-to-action en mobile
- **PullToRefresh** — pull down para refrescar en mobile
- **BottomSheet** — half/full screen draggable (mobile)
- **AccordionContent** — CSS grid expand/collapse animado
- **AnimatedNumber** — count-up con easing
- **SmartDate** — tiempo relativo con auto-update cada 60s

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

### Camisetas
- Batch edit with "Guardar cambios" button
- force-dynamic on API route

### API & Cache
- All 58 API routes now have `export const dynamic = 'force-dynamic'` (no more stale cache on Vercel)

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

### Reclamos (April 10-11)
- States renamed: Borrador → Enviado → Confirmado → Aplicado with progress indicator

### CXC (April 10-11)
- Simplified ContactPanel (6 clear sections)
- Risk filter subtitles
- Stale data banner

### Cheques (April 10-11)
- Guided rebotado → re-depositar flow

### Préstamos (April 10-11)
- Visual status badges + filter tabs + batch undo

### Camisetas (April 10-11)
- Batch edit with "Guardar cambios" sticky bar, force-dynamic fixed cache bug
- Tab subtitles, cleaner layout, overflow menu for destructive actions

### Ventas (April 10-11)
- View preference saved to localStorage

### Upload (April 10-11)
- 3-step progress indicator

### Directorio (April 10-11)
- Chevron icons on expandable rows

### Infrastructure (April 10-11)
- All 58 API routes have `export const dynamic = 'force-dynamic'`
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
