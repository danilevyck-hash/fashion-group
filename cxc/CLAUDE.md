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
| Secretaria | `secretaria` | upload, guias, caja, reclamos, cheques, directorio |
| Bodega | `bodega` | guias (despacho) |
| Director | `director` | Todo (lectura), ventas, CXC |
| Contabilidad | `contabilidad` | prestamos, ventas |
| Vendedor | `vendedor` | reebok, CXC, directorio |
| Cliente | `cliente` | catalogo reebok (solo propio) |

## Auth
- Passwords: bcrypt hashed (migración de plaintext completada parcialmente)
- Session: httpOnly cookie `cxc_session`, base64url-encoded JSON `{role, userId, userName, sessionToken}`
- Middleware: `src/middleware.ts` valida sesión contra `user_sessions` table
- API auth: `src/lib/requireRole.ts` — admin siempre pasa, verifica rol contra array
- Rate limiting: 5 intentos/min/IP en login (in-memory)

## Base de datos
- **Tablas grandes:** cxc_rows (~50K), ventas_raw (~100K)
- **Soft delete:** `deleted` boolean en: reclamos, cheques, guias, prestamos, caja, directorio
- **Indexes necesarios:** ver commit `4ac238b` para SQL completo

## Switch Soft (ERP externo)
- CSVs semicolon-delimited (`;`)
- Encoding: **latin-1** para inventario Reebok, **UTF-8** para CXC y Ventas
- Upload: 100% manual (drag-drop), no hay API/SFTP
- Auto-detect delimiter en CXC upload (`;` o `,`)

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

## Design System
- **Direction:** Precision & Density
- **Buttons:** `rounded-md`, `bg-black text-white`
- **Cards:** `rounded-lg`, `border border-gray-200`, no shadows
- **Tables:** sticky headers (`sticky top-0 bg-white z-10`), `tabular-nums` en montos
- **Spacing:** 4px base, py-6 containers, mb-4 sections, p-3 cards
- **Depth:** borders-only (no shadows en cards/modules)

## UX Principles
- Usuarios: secretarias, bodegueros, vendedores en Panamá. NO tech-savvy.
- Labels en español simple. Cero jerga (CXC → "Cuentas por Cobrar")
- Botones descriptivos ("Guardar Contacto", no "Guardar")
- Errores accionables ("No se pudo guardar. Intenta de nuevo.")
- Font size mínimo text-sm para datos. text-gray-600 mínimo para montos.
- Confirmación solo para acciones destructivas (eliminar), NO para guardar.

## Testing
```bash
npx next build    # Build check — must pass before push
```

## Deploy
```bash
git push origin main   # Auto-deploy via Vercel
```
